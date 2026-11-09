import { i18nMock } from './helpers/i18n.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import jpeg from 'jpeg-js';
import * as helpers from '../lib/account.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Request, Response, URL, URLSearchParams, Uint8Array, URIError, decodeURIComponent, TextDecoder, AbortController, Event, console: { error() {} }, ...globals,
    require(name) { if (name in mocks) return mocks[name]; if (i18nMock(name)) return i18nMock(name); if (['node:crypto','react','react/jsx-runtime','@heroicons/react/24/outline'].includes(name)) return require(name); throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const signatureTool = load('../lib/signature-tool.ts');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function fixture({ missingProfile = false, missingModules = false, walletFailure = false, dbFailure = '', failSave = false } = {}) {
  let state = {
    users: [{ id: 1, phone: '13800000000', email: 'one@example.com', status: 'active', permission_type: '10001', created_at: '2026-10-24T00:00:00Z' }, { id: 2, phone: '13900000000', email: 'two@example.com', status: 'active', permission_type: '10002', created_at: '2026-10-24T00:00:00Z' }],
    profiles: [{ user_id: 1, nickname: '小宇', avatar_data: '', avatar_mime: '', avatar_version: '' }, { user_id: 2, nickname: '其他用户', avatar_data: png, avatar_mime: 'image/png', avatar_version: 'other-secret' }],
    points: { 1: 680, 2: 900 }, analyses: [], signatures: [], documents: [],
    orders: [{ id: 'order-1', user_id: 1, title: '普通商品', kind: 'mall', status: 'pending', created_at: '2026-10-25T00:00:00Z', amount: 20 }, { id: 'order-2', user_id: 1, title: '600积分', kind: 'points', status: 'delivered', created_at: '2026-10-24T00:00:00Z', amount: 50 }, { id: 'private-order', user_id: 2, title: 'private', kind: 'mall' }],
    technical: [{ id: 'service-1', user_id: 1, title: '电脑维护', kind: 'technical', status: 'in_service', created_at: '2026-10-25T01:00:00Z', amount: null }],
    videos: [{ id: 'video-1', user_id: 1, title: '我的视频', kind: 'video', status: 'ready', created_at: '2026-10-25T00:00:00Z' }, { id: 'private-video', user_id: 2, title: 'private-video', kind: 'video', status: 'ready' }],
    stamps: [{ id: 'stamp-1', user_id: 1, title: '印章制作', kind: 'stamp', status: 'ready', created_at: '2026-10-24T00:00:00Z' }],
  };
  const queries = [], writes = [];
  const error = code => Object.assign(Error('private database details'), { code });
  function sourceRows(sql, args) {
    const userId = args.at(-1);
    if (dbFailure && sql.includes(dbFailure)) throw error('ER_ACCESS_DENIED_ERROR');
    if (missingModules && /technical_service_orders|video_extraction_tasks|tool_generation_results|site_analysis_runs|document_signatures|signed_documents/.test(sql)) throw error('ER_NO_SUCH_TABLE');
    let rows;
    if (sql.includes('site_analysis_runs')) rows = state.analyses;
    else if (sql.includes('technical_service_orders')) rows = state.technical;
    else if (sql.includes('video_extraction_tasks')) rows = state.videos;
    else if (sql.includes('tool_generation_results')) rows = state.stamps;
    else if (sql.includes('document_signatures')) rows = state.signatures.map(row => ({ ...row, kind: 'signature', status: row.deleted_at ? 'deleted' : 'ready' }));
    else if (sql.includes('signed_documents')) rows = state.documents.map(row => ({ ...row, kind: 'signed-document', status: row.expires_at <= args[0] ? 'expired' : 'ready' }));
    else rows = state.orders.filter(row => !sql.includes("AND p.product_type='points'") || row.kind === 'points').filter(row => !sql.includes("p.product_type<>'points'") || row.kind !== 'points');
    return rows.filter(row => row.user_id === userId);
  }
  const DB = { prepare(sql) {
    let args = [];
    async function execute() {
      assert.equal((sql.match(/\?/g) || []).length, args.length, sql); queries.push({ sql, args });
      if (sql.startsWith('SELECT id,phone')) return state.users.filter(user => user.phone === args[0]);
      if (sql.startsWith('SELECT id FROM users')) return state.users.filter(user => user.id === args[0] && user.status === 'active');
      if (sql.includes('FROM yxshop_user_profiles')) { if (missingProfile) throw error('ER_NO_SUCH_TABLE'); if (dbFailure === 'profile') throw error('ER_ACCESS_DENIED_ERROR'); return state.profiles.filter(row => row.user_id === args[0]); }
      if (sql.startsWith('INSERT INTO yxshop_user_profiles')) { if (missingProfile) throw error('ER_NO_SUCH_TABLE'); writes.push(sql); const old = state.profiles.find(row => row.user_id === args[0]); const row = { user_id: args[0], nickname: args[1], avatar_data: args[2], avatar_mime: args[3], avatar_version: args[4] }; if (old) Object.assign(old, row); else state.profiles.push(row); return { affectedRows: 1 }; }
      if (sql.startsWith('UPDATE users')) { if (failSave) throw error('ER_LOCK_DEADLOCK'); writes.push(sql); state.users.find(user => user.id === args[1]).email = args[0]; return { affectedRows: 1 }; }
      if (sql.startsWith('SELECT COUNT')) return [{ total: sourceRows(sql, args).length }];
      if (sql.startsWith('SELECT * FROM (')) {
        const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(') account_records'));
        let offset = 0;
        const rows = body.split(' UNION ALL ').flatMap(part => {
          const start = offset;
          offset += (part.match(/\?/g) || []).length;
          return sourceRows(part, args.slice(start, offset));
        });
        return rows.sort((a,b) => b.created_at.localeCompare(a.created_at) || a.kind.localeCompare(b.kind) || b.id.localeCompare(a.id)).slice(args.at(-1), args.at(-1) + 10);
      }
      throw Error(`Unexpected SQL ${sql}`);
    }
    return { bind(...values) { args = values; return this; }, async first() { return (await execute())[0] || null; }, async all() { return { results: await execute() }; }, async run() { return { meta: await execute() }; } };
  }, async transaction(work) { const old = structuredClone(state); try { return await work(DB); } catch (failure) { state = old; throw failure; } } };
  const setup = load('../db/setup.ts', { './mysql-runtime': { env: { DB } } }, { process: { env: { AUTH_SESSION_SECRET: 'test-session-key' } } });
  const service = load('../lib/account-service.ts', { '@/db/mysql-runtime': { env: { DB } }, '@/db/setup': setup, './account': helpers, './signature-tool': signatureTool, './points-service': { async pointsBalance(id) { if (walletFailure) throw error('ER_NO_SUCH_TABLE'); return state.points[id]; } } });
  const routes = Object.fromEntries(['','/avatar','/records'].map(part => [part || 'account', load(`../app/api/account${part}/route.ts`, { '@/lib/account-service': service, '@/db/mysql-runtime': { env: { DB } } })]));
  function request(path = '', { user = 1, method = 'GET', body, cookie, headers = {} } = {}) {
    return new Request(`https://shop.example/api/account${path}`, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(user ? { cookie: `mall_session=${encodeURIComponent(setup.createMallSession(user === 1 ? '13800000000' : '13900000000'))}` } : {}), ...(cookie ? { cookie } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  }
  return { service, routes, request, queries, writes, state: () => state };
}
test('匿名和伪造会话无法读取个人资料、记录、头像或写入其他用户', async () => {
  const f = fixture();
  const anonymous = await f.routes.account.GET(f.request('', { user: 0 }));
  assert.equal((await anonymous.json()).authenticated, false); assert.equal(f.queries.length, 0);
  for (const cookie of ['mall_session=13800000000','mall_session=13800000000.fake','mall_session=%E0%A4%A']) {
    assert.equal((await f.routes.account.GET(f.request('', { cookie }))).status, 200);
    assert.equal((await f.routes['/records'].GET(f.request('/records?userId=2', { cookie }))).status, 401);
    assert.equal((await f.routes['/avatar'].GET(f.request('/avatar?userId=2', { cookie }))).status, 401);
    assert.equal((await f.routes.account.POST(f.request('', { method: 'POST', cookie, body: { userId: 2, nickname: '伪造', email: 'fake@example.com' } }))).status, 401);
  }
  assert.equal(f.writes.length, 0);
});
test('账户从已验证身份读取真实积分，屏蔽头像数据并使用私有无缓存响应', async () => {
  const f = fixture(), response = await f.routes.account.GET(f.request('?userId=2')), result = await response.json();
  assert.equal(result.user.id, 1); assert.equal(result.user.nickname, '小宇'); assert.equal(result.user.maskedPhone, '138****0000'); assert.equal(result.pointsBalance, 680);
  assert.equal(result.user.isAdmin, false); assert.equal(result.user.avatarUrl, helpers.defaultAvatar);
  assert.equal('avatar_data' in result.user, false); assert.ok(!JSON.stringify(result).includes('other-secret')); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.equal(response.headers.get('vary'), 'Cookie');
});
test('旧库未执行资料 SQL 时使用默认头像昵称；积分失败不会显示成零', async () => {
  const f = fixture({ missingProfile: true, walletFailure: true }), result = await (await f.routes.account.GET(f.request())).json();
  assert.equal(result.authenticated, true); assert.equal(result.profileReady, false); assert.equal(result.user.nickname, '用户0000'); assert.equal(result.pointsBalance, null); assert.ok(result.pointsMessage);
  const fail = fixture({ dbFailure: 'profile' }), response = await fail.routes.account.GET(fail.request()); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private database'));
});
test('停用账号无账户资料；角色由服务端权限决定', async () => {
  const f = fixture(); f.state().users[0].status = 'disabled';
  assert.equal((await (await f.routes.account.GET(f.request())).json()).authenticated, false);
  const admin = await (await f.routes.account.GET(f.request('', { user: 2 }))).json(); assert.equal(admin.user.isAdmin, true); assert.equal(admin.user.isTechnician, false);
  f.state().users[1].permission_type = '10003'; assert.equal((await (await f.routes.account.GET(f.request('', { user: 2 }))).json()).user.isTechnician, true);
});
test('一次保存昵称邮箱头像，忽略伪造用户、权限、积分和手机号', async () => {
  const f = fixture(), before = structuredClone(f.state().users[1]);
  const response = await f.routes.account.POST(f.request('', { method: 'POST', body: { userId: 2, nickname: ' 新昵称 ', email: 'new@example.com', phone: '13700000000', permission_type: '10002', pointsBalance: 999999, avatar: { data: png, mime: 'image/png' } } }));
  assert.equal(response.status, 200); assert.equal(f.state().profiles[0].nickname, '新昵称'); assert.equal(f.state().users[0].email, 'new@example.com'); assert.equal(f.state().users[0].phone, '13800000000'); assert.equal(f.state().users[0].permission_type, '10001'); assert.equal(f.state().points[1], 680); assert.deepEqual(f.state().users[1], before);
  const account = await (await f.routes.account.GET(f.request())).json(); assert.match(account.user.avatarUrl, /^\/api\/account\/avatar\?v=[a-f0-9]{64}$/);
  const avatar = await f.routes['/avatar'].GET(f.request('/avatar?userId=2')); assert.equal(avatar.headers.get('content-type'), 'image/png'); assert.equal(Buffer.from(await avatar.arrayBuffer()).toString('base64'), png); assert.equal(avatar.headers.get('x-content-type-options'), 'nosniff');
});
test('保存失败回滚头像与昵称；无头像更新保留已有图片，移除只影响本人', async () => {
  const broken = fixture({ failSave: true }), old = structuredClone(broken.state());
  assert.equal((await broken.routes.account.POST(broken.request('', { method: 'POST', body: { nickname: '新昵称', email: 'new@example.com', avatar: { data: png, mime: 'image/png' } } }))).status, 503); assert.deepEqual(broken.state(), old);
  const f = fixture();
  for (const body of [{ nickname: '新', email: 'one@example.com', avatar: { data: png, mime: 'image/png' } }, { nickname: '新二', email: 'one@example.com' }]) assert.equal((await f.routes.account.POST(f.request('', { method: 'POST', body }))).status, 200);
  assert.equal(f.state().profiles[0].avatar_data, png);
  await f.routes.account.POST(f.request('', { method: 'POST', body: { nickname: '新三', email: 'one@example.com', removeAvatar: true } }));
  assert.equal((await f.routes['/avatar'].GET(f.request('/avatar'))).status, 404); assert.equal(f.state().profiles[1].avatar_data, png);
});
test('无效资料、伪装图片、过大请求在写库前拒绝；缺表保存明确提示增量 SQL', async () => {
  for (const body of [null, [], {}, { nickname: 'a'.repeat(33), email: 'ok@example.com' }, { nickname: 'a\n', email: 'ok@example.com' }, { nickname: 'a', email: 'wrong' }, { nickname: 'a', email: 'ok@example.com', avatar: { mime: 'image/png', data: Buffer.from('<svg onload="x"/>').toString('base64') } }, { nickname: 'a', email: 'ok@example.com', avatar: { mime: 'image/jpeg', data: '/9j/2Q==' } }, { nickname: 'a', email: 'ok@example.com', removeAvatar: true, avatar: { mime: 'image/png', data: png } }]) {
    const f = fixture(), response = await f.routes.account.POST(f.request('', { method: 'POST', body })); assert.equal(response.status, 400, JSON.stringify(body)); assert.equal(f.writes.length, 0);
  }
  const f = fixture(); assert.equal((await f.routes.account.POST(f.request('', { method: 'POST', body: 'x'.repeat(1500001) }))).status, 413); assert.equal(f.writes.length, 0);
  const missing = fixture({ missingProfile: true }), response = await missing.routes.account.POST(missing.request('', { method: 'POST', body: { nickname: 'a', email: 'ok@example.com' } })); assert.equal(response.status, 503); assert.match((await response.json()).message, /09/);
});
test('头像验证读取 PNG/JPEG 尺寸并拒绝超大尺寸，不把 MIME 当真实性证据', () => {
  const f = fixture(), bytes = Buffer.from(png, 'base64'); bytes.writeUInt32BE(5000, 16);
  assert.throws(() => f.service.validateAvatar({ mime: 'image/png', data: bytes.toString('base64') }), /4096/);
  const image = jpeg.encode({ width: 1, height: 1, data: Buffer.from([1,2,3,255]) }, 80).data;
  assert.equal(f.service.validateAvatar({ mime: 'image/jpeg', data: image.toString('base64') }).mime, 'image/jpeg');
  assert.throws(() => f.service.validateAvatar({ mime: 'image/png', data: image.toString('base64') }), /PNG/);
});
test('综合订单与工具记录只查询本人，跨模块排序、筛选并分页，不返回媒体或交付内容', async () => {
  const f = fixture();
  const orders = await (await f.routes['/records'].GET(f.request('/records?kind=orders&userId=2'))).json();
  assert.deepEqual(orders.items.map(row => row.id), ['service-1','order-1','order-2']); assert.equal(orders.total, 3); assert.equal(orders.items[0].href, '/service-orders/service-1');
  const points = await (await f.routes['/records'].GET(f.request('/records?kind=orders&filter=points'))).json(); assert.equal(points.total, 1); assert.equal(points.items[0].id, 'order-2');
  for (let index=0; index<11; index++) f.state().videos.push({ id: `video-extra-${index}`, user_id: 1, title: '新视频', kind: 'video', status: 'failed', created_at: '2026-10-25T01:00:00Z' });
  const activity = await (await f.routes['/records'].GET(f.request('/records?kind=activity&page=999'))).json();
  assert.equal(activity.total, 13); assert.equal(activity.page, 2); assert.equal(activity.items.length, 3); assert.ok(activity.items.every(row => !row.id.includes('private'))); assert.match(activity.items.at(-1).href, /stamp-maker.html\?result=/);
  assert.ok(!JSON.stringify(activity).includes('image_base64')); assert.ok(!JSON.stringify(activity).includes('format_json'));
  assert.equal((await f.routes['/records'].GET(f.request('/records?kind=invalid'))).status, 400); assert.equal((await f.routes['/records'].GET(f.request('/records?kind=activity&filter=bad'))).status, 400);
});
test('站长分析记录并入个人中心，按本人筛选且保留实际工具slug的报告深链', async () => {
  const f = fixture();
  f.state().analyses.push({ id: 'analysis-one', user_id: 1, title: '站长分析 · example.org', kind: 'site:custom-seo', status: 'partial', created_at: '2026-10-25T02:00:00Z' }, { id: 'private-analysis', user_id: 2, kind: 'site:private', status: 'completed', created_at: '2026-10-25T01:00:00Z' });
  const result = await (await f.routes['/records'].GET(f.request('/records?kind=activity&filter=site'))).json();
  assert.equal(result.total, 1); assert.equal(result.items[0].kind, 'site'); assert.equal(result.items[0].href, '/tools/custom-seo.html?run=analysis-one'); assert.equal(helpers.recordStatusLabel(result.items[0]), '部分完成');
});
test('未安装模块独立提示；数据库真正失败返回错误，不能伪装成无记录', async () => {
  const f = fixture({ missingModules: true }), result = await (await f.routes['/records'].GET(f.request('/records'))).json(); assert.equal(result.items.length, 2); assert.ok(result.warnings.length);
  const signatures = await (await f.routes['/records'].GET(f.request('/records?kind=activity&filter=signature'))).json();
  assert.deepEqual(signatures.warnings, ['文件签名记录尚未初始化']);
  const failure = fixture({ dbFailure: 'orders o' }); assert.equal((await failure.routes['/records'].GET(failure.request('/records'))).status, 503);
});
test('工具记录展示本人历史签名和签署文件，删除或过期后保留记录并关闭操作', async () => {
  const f = fixture();
  const saved = { user_id: 1, id: 'signature-1', title: '我的签名', created_at: '2026-10-24T12:00:00.000Z' };
  const signed = { user_id: 1, id: 'document-1', title: '合同-signed.pdf', created_at: '2026-10-25T13:00:00.000Z', expires_at: '9999-01-01T00:00:00.000Z' };
  f.state().signatures.push(saved, { ...saved, user_id: 2, id: 'private-signature' }, { ...saved, id: 'deleted-signature', deleted_at: '2026-10-25T12:00:00.000Z' });
  f.state().documents.push(signed, { ...signed, user_id: 2, id: 'private-document' }, { ...signed, id: 'expired-document', expires_at: '2000-01-01T00:00:00.000Z' });
  const result = await (await f.routes['/records'].GET(f.request('/records?kind=activity&filter=signature&userId=2'))).json();
  assert.equal(result.total, 4);
  assert.deepEqual(result.items.map(row => [row.id, row.href, helpers.recordStatusLabel(row)]), [
    ['expired-document', null, '已过期'],
    ['document-1', '/api/tools/document-signature/document-1', '已完成'],
    ['signature-1', '/api/tools/document-signature/signature-1?kind=signature', '已完成'],
    ['deleted-signature', null, '已删除'],
  ]);
  const all = await (await f.routes['/records'].GET(f.request('/records?kind=activity'))).json();
  assert.equal(all.total, 6);
  assert.ok(all.items.some(row => row.id === 'video-1'));
  assert.ok(all.items.some(row => row.id === 'document-1'));
  assert.equal(f.writes.length, 0);
});
test('登录返回地址限制站内地址；状态区分积分到账、无记录和处理失败', () => {
  for (const value of ['https://evil.example','//evil.example','/\\evil.example','/\t/evil.example','/api/account','/admin']) assert.equal(helpers.accountReturnPath(value), '');
  assert.equal(helpers.accountReturnPath('/account/activity?page=2#history'), '/account/activity?page=2#history');
  assert.match(helpers.accountLoginHref('/account/profile'), /returnTo=%2Faccount%2Fprofile/);
  assert.equal(helpers.recordStatusLabel({ kind: 'points', status: 'delivered' }), '已到账'); assert.equal(helpers.recordStatusLabel({ kind: 'video', status: 'failed' }), '处理失败');
});

const Image = ({ src, alt, unoptimized, ...props }) => { void unoptimized; return React.createElement('img', { src, alt, ...props }); };
function elements(node) { if (Array.isArray(node)) return node.flatMap(elements); return React.isValidElement(node) ? [node,...elements(node.props.children)] : []; }
function menuHost(account, { error = '', loading = false } = {}) {
  const slots = []; let cursor = 0, requestError = false; const links = [];
  const react = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useEffect() {}, useRef: () => ({ current: null }), useId: () => 'account-menu-test' };
  const menuModule = load('../components/account-menu.tsx', { react, 'next/image': Image, '../lib/account': helpers, '../lib/account-client': { useAccount: () => ({ account, error, loading }), async signOutAccount() { if (requestError) throw Error('退出失败'); }, refreshAccount() {} } }, { window: { location: { pathname: '/tools/video-extractor.html', search: '?task=task', hash: '', assign: href => links.push(href) } } });
  return { render(props = {}) { cursor = 0; return menuModule.AccountMenu(props); }, failLogout() { requestError = true; }, links };
}
const sampleAccount = { authenticated: true, pointsBalance: 680, user: { id: 1, nickname: '小宇', maskedPhone: '138****0000', avatarUrl: helpers.defaultAvatar, isAdmin: false, isTechnician: false } };
test('统一账户菜单显示头像、昵称、真实剩余积分和角色入口，原生导航不依赖软路由', () => {
  for (const role of ['ordinary','admin','technician']) {
    const host = menuHost({ ...sampleAccount, user: { ...sampleAccount.user, isAdmin: role === 'admin', isTechnician: role === 'technician' } });
    let tree = host.render(), html = renderToStaticMarkup(tree); assert.match(html, /剩余积分/); assert.match(html, /680/); assert.match(html, /小宇/); assert.match(html, /default-avatar.png/);
    elements(tree).find(node => node.props.className === 'account-trigger').props.onClick(); tree = host.render(); html = renderToStaticMarkup(tree);
    for (const section of helpers.accountSections) assert.ok(elements(tree).some(node => node.type === 'a' && node.props.href === section.href));
    assert.equal(html.includes('管理后台'), role === 'admin'); assert.equal(html.includes('技术人员工作台'), role === 'technician');
  }
});
test('积分读取失败不展示旧余额；退出失败保留菜单并显示错误；登录返回原工具', async () => {
  const host = menuHost(sampleAccount, { error: '积分不可用' }); assert.ok(!renderToStaticMarkup(host.render()).includes('680'));
  elements(host.render()).find(node => node.props.className === 'account-trigger').props.onClick(); host.failLogout(); await elements(host.render()).find(node => node.props.className === 'account-logout').props.onClick(); await new Promise(resolve => setImmediate(resolve)); assert.match(renderToStaticMarkup(host.render()), /退出失败/); assert.equal(host.links.length, 0);
  const guest = menuHost({ authenticated: false, user: null, pointsBalance: null }); elements(guest.render()).find(node => node.type === 'button').props.onClick(); assert.equal(guest.links[0], '/?returnTo=%2Ftools%2Fvideo-extractor.html%3Ftask%3Dtask');
});
