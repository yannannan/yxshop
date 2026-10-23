import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as tools from '../lib/tool-services.ts';

function load(path, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Request, Response, URL, console, ...globals, require(name) { if (name in mocks) return mocks[name]; if (name === 'react/jsx-runtime') return jsxRuntime; throw new Error(`Unexpected module: ${name}`); } });
  return exports;
}

function confirmation(status, productType = 'tool', owner = true) {
  const writes = [];
  const route = load('../app/api/orders/route.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { return { bind() { return this; }, async first() { if (sql.includes('FROM users')) return { id: 1 }; return owner ? { id: 'own-order', status, product_type: productType, category: '工具服务', subcategory: '' } : null; }, async run() { writes.push(sql); return { meta: {} }; } }; } } } },
    '../../../db/setup': { ensureDatabase: async () => {}, getSessionPhone: () => '13800000000' },
    '../../../lib/order-notifications': { sendOrderNotification: async () => {} }, '../../../lib/tool-services': tools,
  });
  return { writes, finish: () => route.POST(new Request('http://localhost/api/orders', { method: 'POST', body: JSON.stringify({ action: 'payment-finished', orderId: 'own-order' }) })) };
}

test('已核验工具订单重复确认保持原状态，不转待发货、不重新开通或重置权益', async () => {
  for (const status of ['paid', 'pending_delivery', 'delivered']) {
    const setup = confirmation(status);
    for (let i = 0; i < 2; i++) {
      const response = await setup.finish();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, status, nextStep: 'tool' });
    }
    assert.equal(setup.writes.length, 0);
  }
});

test('未支付、关闭及不属于本人订单不能通过确认按钮开通工具', async () => {
  for (const [status, owner, expected] of [['pending', true, 400], ['closed', true, 400], ['paid', false, 404]]) {
    const setup = confirmation(status, 'tool', owner);
    assert.equal((await setup.finish()).status, expected);
    assert.equal(setup.writes.length, 0);
  }
});

test('普通商品保持原来的支付确认和待发货流转', async () => {
  const setup = confirmation('paid', 'digital');
  const response = await setup.finish();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'pending_delivery');
  assert.equal(setup.writes.length, 1);
});

test('重新打开已支付或已完成工具收银台可直接返回工具，未支付订单仍显示付款入口', async () => {
  for (const status of ['paid', 'pending_delivery', 'delivered', 'pending']) {
    const slots = [], effects = [], calls = [];
    let cursor = 0;
    const react = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useEffect: fn => effects.push(fn) };
    const Link = ({ href, children }) => React.createElement('a', { href }, children);
    const Image = ({ src, alt }) => React.createElement('img', { src, alt });
    const order = { id: 'own-order', product_id: 40, product_type: 'tool', tool_slug: 'stamp-maker', product_name: '印章在线制作', amount: 9.9, status, email: 'user@example.com', phone: '13800000000' };
    const page = load('../app/checkout/[id]/page.tsx', { react, 'next/navigation': { useParams: () => ({ id: 'own-order' }) }, 'next/image': Image, 'next/link': Link, '../../../lib/tool-services': tools }, {
      window: { setInterval() { return 1; }, clearInterval() {} },
      async fetch(url, config) { calls.push({ url, method: config?.method || 'GET' }); return Response.json(url.startsWith('/api/orders') ? order : {}); },
    });
    const render = () => { cursor = 0; effects.length = 0; return page.default(); };
    render(); effects[0](); await new Promise(resolve => setImmediate(resolve));
    render(); effects[1]();
    const html = renderToStaticMarkup(render());
    if (status === 'pending') assert.ok(html.includes('我已完成支付'));
    else { assert.ok(html.includes('工具购买已确认')); assert.ok(html.includes('/tools/stamp-maker.html')); assert.ok(!html.includes('我已完成支付')); }
    assert.ok(calls.every(call => call.method === 'GET'), '读取已支付工具订单不应再发确认支付请求');
  }
});
