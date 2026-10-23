import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import * as points from '../lib/points.ts';

const require = createRequire(import.meta.url);
const image = 'data:image/png;base64,YQ==', otherImage = 'data:image/png;base64,Yg==';
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Response, Request, URL, console: { error() {} }, ...globals, require(name) { if (name in mocks) return mocks[name]; if (['react', 'react/jsx-runtime'].includes(name)) return require(name); throw Error(`Unexpected import ${name}`); } });
  return exports;
}
function server({ failMethod, denied = false } = {}) {
  const state = { products: [{ id: 101, product_type: 'points', name: '原套餐', points_amount: 200, price: 20, status: 'active' }], qrs: ['wechat', 'alipay'].map((type, i) => ({ id: i + 1, product_id: 101, type, amount: 20, image_url: image, status: 'active' })) };
  const log = [];
  async function query(sql, args = []) {
    assert.equal((sql.match(/\?/g) || []).length, args.length, sql); log.push(sql);
    if (sql.startsWith('SELECT id FROM products')) return [state.products.filter(row => row.id === args[0] && row.product_type === 'points')];
    if (sql.startsWith('UPDATE products SET name=')) { Object.assign(state.products.find(row => row.id === args[6]), { name: args[0], description: args[1], points_amount: args[2], price: args[3], status: args[4] }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO products')) { state.products.push({ id: 201, product_type: 'points', name: args[0], price: args[1], description: args[2], status: args[3], points_amount: args[4] }); return [{ affectedRows: 1, insertId: 201 }]; }
    if (sql.startsWith('SELECT id FROM payment_qrs')) return [state.qrs.filter(row => row.product_id === args[0] && row.type === args[1] && row.amount === args[2])];
    if (sql.startsWith('UPDATE payment_qrs')) {
      if (args[4] === failMethod) throw Error('模拟二维码写入失败');
      for (const row of state.qrs.filter(row => row.product_id === args[2] && row.amount === args[3] && row.type === args[4])) Object.assign(row, { image_url: args[0], status: args[1] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO payment_qrs')) {
      if (args[2] === failMethod) throw Error('模拟二维码写入失败');
      state.qrs.push({ id: state.qrs.length + 1, product_id: args[0], type: args[2], amount: args[3], image_url: args[4], status: args[5] }); return [{ affectedRows: 1 }];
    }
    throw Error(`Unexpected SQL ${sql}`);
  }
  const runtime = load('../db/mysql-runtime.ts', { 'mysql2/promise': { createPool: () => ({ execute: query, async getConnection() {
    let snapshot;
    return { async beginTransaction() { log.push('BEGIN'); snapshot = structuredClone(state); }, execute: query, async commit() { log.push('COMMIT'); }, async rollback() { log.push('ROLLBACK'); Object.assign(state, snapshot); }, release() {} };
  } }) } }, { process: { env: { MYSQL_HOST: 'mock', MYSQL_USER: 'mock', MYSQL_PASSWORD: 'mock', MYSQL_DATABASE: 'mock' } } });
  const service = load('../lib/points-service.ts', { '@/db/mysql-runtime': runtime, '@/db/setup': {}, './points': points });
  const route = load('../app/api/admin/points/route.ts', { '@/db/mysql-runtime': runtime, '@/db/setup': { ensurePaymentQrRecords() { throw Error('统一保存不得在事务外单独保存二维码'); } }, '@/lib/points-service': service, '@/lib/points': points, '@/lib/admin-auth': { getAdminContext: async () => ({}), hasAdminPermission: () => !denied, adminDenied: () => Response.json({}, { status: 403 }) } });
  const payload = { action: 'save', id: 101, name: '新套餐', points: 600, price: 50, status: 'active', paymentQrs: [{ type: 'wechat', amount: 50, imageUrl: otherImage, enabled: true }, { type: 'alipay', amount: 50, imageUrl: image, enabled: false }] };
  return { state, log, payload, post: body => route.POST(new Request('http://localhost/api/admin/points', { method: 'POST', body: JSON.stringify(body) })) };
}
test('套餐、金额及两张二维码一个事务保存，改价保留旧金额供原订单付款', async () => {
  const f = server(); const response = await f.post(f.payload);
  assert.equal(response.status, 200); assert.equal((await response.json()).id, 101);
  assert.equal(f.state.products[0].price, 50); assert.equal(f.state.products[0].points_amount, 600);
  assert.equal(f.state.qrs.length, 4); assert.equal(f.state.qrs.find(row => row.type === 'wechat' && row.amount === 50).image_url, otherImage); assert.equal(f.state.qrs.find(row => row.type === 'alipay' && row.amount === 50).status, 'inactive');
  assert.ok(f.state.qrs.filter(row => row.amount === 20).every(row => row.image_url === image && row.status === 'active'));
  assert.equal(f.log.filter(sql => sql === 'COMMIT').length, 1); assert.equal(f.log.filter(sql => sql === 'BEGIN').length, 1);
});
for (const id of [0, 101]) test(`${id ? '编辑' : '新增'}时第二张二维码写入失败，套餐及第一张码全部回滚`, async () => {
  const f = server({ failMethod: 'alipay' }), before = structuredClone(f.state);
  const response = await f.post({ ...f.payload, id }); assert.equal(response.status, 503); assert.deepEqual(f.state, before); assert.ok(f.log.includes('ROLLBACK')); assert.ok(!f.log.includes('COMMIT'));
});
test('新套餐无需先保存即可一次提交收款码；相同金额的重复记录统一更新', async () => {
  const f = server(); const response = await f.post({ ...f.payload, id: 0 }); assert.equal(response.status, 200); assert.equal((await response.json()).id, 201); assert.equal(f.state.qrs.filter(row => row.product_id === 201).length, 2);
  const existing = server(); existing.state.qrs.push({ ...existing.state.qrs[0], id: 3 });
  const payload = { ...existing.payload, price: 20, paymentQrs: existing.payload.paymentQrs.map(qr => ({ ...qr, amount: 20 })) };
  assert.equal((await existing.post(payload)).status, 200); assert.ok(existing.state.qrs.filter(row => row.type === 'wechat').every(row => row.image_url === otherImage));
});
test('删除或停用收款码与套餐一起保存；不提交收款字段的旧客户端保留已有配置', async () => {
  const f = server(); const paymentQrs = ['wechat', 'alipay'].map(type => ({ type, amount: 20, imageUrl: '', enabled: false }));
  assert.equal((await f.post({ ...f.payload, price: 20, paymentQrs })).status, 200); assert.ok(f.state.qrs.every(qr => qr.image_url === null && qr.status === 'inactive'));
  const legacy = server(), before = structuredClone(legacy.state.qrs); const { paymentQrs: omitted, ...body } = legacy.payload; assert.equal(omitted.length, 2);
  assert.equal((await legacy.post({ ...body, price: 20 })).status, 200); assert.deepEqual(legacy.state.qrs, before);
});
test('拒绝漏交支付方式、金额错配、重复类型、启用空图和非法图片，不产生任何写入', async () => {
  const f = server(), first = f.payload.paymentQrs[0], second = f.payload.paymentQrs[1];
  for (const paymentQrs of [[], null, [first], [first, first], [first, { ...second, type: 'other' }], [first, { ...second, amount: 20 }], [first, { ...second, enabled: true, imageUrl: '' }], [first, { ...second, enabled: 'true' }], [first, { ...second, imageUrl: 'javascript:alert(1)' }], [first, { ...second, imageUrl: 'data:image/png;base64,' + 'a'.repeat(1400000) }]]) {
    assert.equal((await f.post({ ...f.payload, paymentQrs })).status, 400);
  }
  assert.equal(f.log.length, 0);
  const denied = server({ denied: true }); assert.equal((await denied.post(denied.payload)).status, 403); assert.equal(denied.log.length, 0);
});

function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  const children = React.Children.toArray(node.props?.children || []);
  return [node, ...children.flatMap(descendants)];
}
function textOf(node) { return node?.props?.children; }
function ui({ id = 101, qrs = [], failure = false, delayed = false, loadFailure = false } = {}) {
  const states = [], refs = [], effects = [], calls = [], closed = [], saved = [], readers = [];
  let stateIndex = 0, refIndex = 0, finish;
  const initial = { id, name: '轻享积分包', points: 200, price: 20, description: '说明', status: 'active' };
  const react = { ...React, useState(value) { const i = stateIndex++; if (!(i in states)) states[i] = typeof value === 'function' ? value() : value; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; }, useRef(value) { const i = refIndex++; refs[i] ||= { current: value }; return refs[i]; }, useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  class Reader {
    readAsDataURL(file) { readers.push(this); this.result = file.image; this.onload(); }
  }
  const component = load('../components/points-package-editor.tsx', { react, '../lib/points': points, 'next/image': () => null }, {
    FileReader: Reader,
    window: { setTimeout(fn) { fn(); return 1; }, clearTimeout() {} }, AbortController,
    async fetch(url, options) {
      calls.push({ url, options });
      if (!options?.method) return Response.json(loadFailure ? { message: '读取失败' } : { qrs }, { status: loadFailure ? 503 : 200 });
      if (delayed) await new Promise(resolve => { finish = resolve; });
      return Response.json(failure ? { message: '保存失败，已回滚' } : { ok: true, id: id || 201 }, { status: failure ? 503 : 200 });
    },
  });
  const render = () => { stateIndex = 0; refIndex = 0; effects.length = 0; return component.PointsPackageEditor({ initial, onClose: () => closed.push(true), onSaved: () => saved.push(true) }); };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const find = predicate => descendants(render()).find(predicate);
  const upload = async (type, imageData = otherImage) => { find(node => node.type === 'input' && node.props.type === 'file' && node.props['aria-label'] === `${type === 'wechat' ? '微信支付' : '支付宝'}收款码图片`).props.onChange({ target: { files: [{ type: 'image/png', size: 100, image: imageData }], value: 'image.png' } }); await settle(); };
  return { initial, calls, readers, closed, saved, render, find, upload, settle, release: () => finish(), load() { render(); effects[0](); return settle(); }, async submit() { await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await settle(); } };
}
test('编辑面板只有一个保存入口，上传及启用不发POST，最后一次提交套餐与两张图片', async () => {
  const f = ui(); await f.load();
  assert.equal(descendants(f.render()).filter(node => node.type === 'button' && node.props.type === 'submit').length, 1);
  assert.equal(descendants(f.render()).filter(node => node.type === 'button' && String(textOf(node)).includes('保存')).length, 1);
  await f.upload('wechat'); await f.upload('alipay', image); assert.equal(f.calls.filter(call => call.options?.method === 'POST').length, 0);
  await f.submit(); const posts = f.calls.filter(call => call.options?.method === 'POST'); assert.equal(posts.length, 1);
  const payload = JSON.parse(posts[0].options.body); assert.equal(payload.action, 'save'); assert.equal(payload.name, '轻享积分包'); assert.deepEqual(payload.paymentQrs.map(qr => [qr.type, qr.amount, qr.imageUrl, qr.enabled]), [['wechat', 20, otherImage, true], ['alipay', 20, image, true]]); assert.equal(f.saved.length, 1);
});
test('取消放弃本次上传且不发保存请求；新增套餐能直接上传后一次保存', async () => {
  const cancel = ui(); await cancel.load(); await cancel.upload('wechat'); cancel.find(node => node.type === 'button' && node.props['aria-label'] === '关闭套餐编辑').props.onClick(); assert.equal(cancel.closed.length, 1); assert.equal(cancel.calls.filter(call => call.options?.method === 'POST').length, 0);
  const fresh = ui({ id: 0 }); await fresh.upload('wechat'); await fresh.submit(); assert.equal(fresh.calls.length, 1); assert.equal(fresh.saved.length, 1); assert.equal(JSON.parse(fresh.calls[0].options.body).id, 0);
});
test('修改金额不会沿用旧金额图片，切回原金额恢复未保存草稿', async () => {
  const f = ui({ qrs: [{ type: 'wechat', amount: 20, image_url: image, status: 'active' }] }); await f.load(); await f.upload('wechat');
  const priceInput = () => f.find(node => node.type === 'input' && node.props.step === .01);
  priceInput().props.onChange({ target: { value: '50' } }); await f.submit(); let payload = JSON.parse(f.calls.at(-1).options.body); assert.equal(payload.price, 50); assert.ok(payload.paymentQrs.every(qr => !qr.imageUrl && !qr.enabled));
  priceInput().props.onChange({ target: { value: '20' } }); await f.submit(); payload = JSON.parse(f.calls.at(-1).options.body); assert.equal(payload.paymentQrs[0].imageUrl, otherImage);
});
test('保存失败在面板内显示错误并保留套餐与图片，重试仍只有一个配置请求', async () => {
  const f = ui({ failure: true }); await f.load(); await f.upload('wechat'); await f.submit();
  assert.equal(f.saved.length, 0); const alert = f.find(node => node.props?.role === 'alert'); assert.equal(textOf(alert), '保存失败，已回滚');
  assert.equal(f.find(node => node.type === 'input' && node.props.maxLength === 100).props.value, '轻享积分包');
  await f.submit(); assert.equal(f.calls.filter(call => call.options?.method === 'POST').length, 2); assert.equal(JSON.parse(f.calls.at(-1).options.body).paymentQrs[0].imageUrl, otherImage);
});
test('保存中不能再次提交或关闭，已有收款码读取失败时不能误覆盖', async () => {
  const f = ui({ delayed: true }); await f.load(); const first = f.submit(); await f.submit();
  f.find(node => node.type === 'button' && node.props['aria-label'] === '关闭套餐编辑').props.onClick(); assert.equal(f.closed.length, 0); assert.equal(f.calls.filter(call => call.options?.method === 'POST').length, 1); assert.equal(f.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true); f.release(); await first; await f.settle();
  const failed = ui({ loadFailure: true }); await failed.load(); await failed.submit(); assert.equal(failed.calls.filter(call => call.options?.method === 'POST').length, 0); assert.equal(failed.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
});
