import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHmac, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as points from '../lib/points.ts';
import * as tools from '../lib/tool-services.ts';
import * as stamps from '../lib/stamp-options.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Response, Request, URL, crypto: webcrypto, console: { error() {} }, ...globals, require(name) { if (name in mocks) return mocks[name]; if (['node:crypto', 'react', 'react/jsx-runtime'].includes(name)) return require(name); throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111', secondId = '22222222-2222-4222-8222-222222222222';
function fixture({ balance, cost = 10, fail = '', mode = 'points', rights = [], signed = true } = {}) {
  const state = { wallets: balance === undefined ? [] : [{ user_id: 1, balance }], ledger: [], events: [], results: [], users: [{ id: 1, phone: '13800000000', email: 'user@example.com' }, { id: 2, phone: '13900000000', email: 'other@example.com' }], orders: [{ id: 'QX13800000000_TOPUP', user_id: 1, product_id: 101, status: 'pending', points_amount: 600, amount: 50 }, ...rights], products: [{ id: 40, product_type: 'tool', name: '印章', tool_slug: 'stamp-maker', tool_url: '/tools/stamp-maker.html', tool_charge_type: mode, tool_points_cost: cost, status: 'active' }, ...points.defaultPointsPackages.map((p, index) => ({ ...p, id: 101 + index, product_type: 'points', points_amount: p.points, status: 'active', paymentReady: 1 }))] };
  const log = [];
  let queue = Promise.resolve();
  async function query(sql, args = [], connection) {
    assert.equal((sql.match(/\?/g) || []).length, args.length, `SQL binding: ${sql}`); log.push(sql);
    if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) {
      const prior = queue; queue = new Promise(resolve => { connection.unlock = resolve; });
      await prior; connection.snapshot = structuredClone(state);
      return [state.users.filter(user => user.id === args[0])];
    }
    if (sql.includes('FROM users WHERE phone')) return [signed ? state.users.filter(user => user.phone === args[0]) : []];
    if (sql.startsWith('SELECT phone,email FROM users')) return [state.users.filter(user => user.id === args[0])];
    if (sql.startsWith('SELECT balance FROM points_wallets')) return [state.wallets.filter(row => row.user_id === args[0])];
    if (sql.startsWith('INSERT INTO points_wallets')) { state.wallets.push({ user_id: args[0], balance: args[1] }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE points_wallets')) {
      const wallet = state.wallets.find(row => row.user_id === args[2]);
      if (!wallet || (sql.includes('balance>=') && wallet.balance < args[3])) return [{ affectedRows: 0 }];
      wallet.balance += sql.includes('balance=balance-') ? -args[0] : args[0]; return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM points_ledger WHERE operation_id')) return [state.ledger.filter(row => row.operation_id === args[0])];
    if (sql.startsWith('INSERT INTO points_ledger')) {
      if (fail === 'ledger') throw Error('模拟流水写入失败');
      assert.ok(!state.ledger.some(row => row.operation_id === args[0]), '操作号应唯一');
      state.ledger.push({ operation_id: args[0], user_id: args[1], kind: args[2], delta: args[3], balance_after: args[4], product_id: args[2] === 'consume' ? args[5] : null, order_id: args[2] === 'recharge' ? args[5] : null }); return [{ affectedRows: 1 }];
    }
    if (sql.includes('COUNT(*) AS total FROM points_ledger')) return [[{ total: state.ledger.filter(row => row.user_id === args[0]).length }]];
    if (sql.includes('FROM points_ledger l LEFT JOIN')) return [state.ledger.filter(row => row.user_id === args[0]).slice(args[1], args[1] + 20)];
    if (sql.startsWith('SELECT o.user_id,p.product_type')) {
      const order = state.orders.find(row => row.id === args[0]), product = order && state.products.find(row => row.id === order.product_id);
      return [order && product ? [{ user_id: order.user_id, product_type: product.product_type }] : []];
    }
    if (sql.startsWith('SELECT id,user_id,points_amount,status FROM orders')) return [state.orders.filter(row => row.id === args[0])];
    if (sql.startsWith('UPDATE orders SET status=')) { const order = state.orders.find(row => row.id === args[4]); order.status = args[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE orders SET tool_uses_remaining')) { const order = state.orders.find(row => row.id === args[0] && row.user_id === args[1] && row.tool_uses_remaining > 0); if (order) order.tool_uses_remaining--; return [{ affectedRows: order ? 1 : 0 }]; }
    if (sql.includes('FROM orders WHERE user_id') || sql.includes('FROM orders o JOIN users')) return [state.orders.filter(row => row.user_id === args[0] && row.product_id === args[1] && ['paid', 'pending_delivery', 'delivered'].includes(row.status))];
    if (sql.startsWith('INSERT INTO orders')) { state.orders.push({ id: args[0], user_id: args[1], product_id: args[2], amount: args[3], status: 'pending', points_amount: args[5] }); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM products p WHERE p.product_type')) return [state.products.filter(row => row.product_type === 'points' && (!sql.includes("p.status='active'") || row.status === 'active')).map(row => ({ ...row, points: row.points_amount }))];
    if (sql.includes('FROM products')) {
      const product = args.length ? state.products.find(row => sql.includes('tool_slug=?') ? row.tool_slug === args[0] : row.id === args[0]) : state.products.find(row => row.tool_slug === 'stamp-maker');
      return [product && product.status === 'active' ? [product] : []];
    }
    if (sql.startsWith('SELECT id,image_size')) return [state.results.filter(row => row.user_id === args[0] && row.product_id === args[1]).map(row => ({ id: row.id, size: row.image_size, createdAt: row.created_at }))];
    if (sql.includes('FROM tool_generation_results')) return [state.results.filter(row => row.id === args[0] && (args.length === 1 || row.user_id === args[1] && row.product_id === args[2]))];
    if (sql.startsWith('INSERT INTO tool_generation_results')) { if (fail === 'result') throw Error('模拟成品保存失败'); state.results.push(Object.fromEntries(['id', 'user_id', 'product_id', 'order_id', 'request_hash', 'image_base64', 'image_size', 'charged', 'created_at'].map((key, i) => [key, args[i]]))); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM tool_usage_events')) { const event = state.events.find(row => row.operation_id === args[0]); const order = event && state.orders.find(row => row.id === event.order_id); return [order ? [order] : []]; }
    if (sql.startsWith('INSERT INTO tool_usage_events')) { state.events.push({ operation_id: args[0], order_id: args[1] }); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected SQL ${sql}`);
  }
  const runtime = load('../db/mysql-runtime.ts', { 'mysql2/promise': { createPool: () => ({ execute: (sql, args) => query(sql, args), async getConnection() {
    const connection = { async beginTransaction() {}, execute: (sql, args) => query(sql, args, connection), async commit() { connection.unlock?.(); }, async rollback() { if (connection.snapshot) Object.assign(state, connection.snapshot); connection.unlock?.(); }, release() {} }; return connection;
  } }) } }, { process: { env: { MYSQL_HOST: 'mock', MYSQL_USER: 'mock', MYSQL_PASSWORD: 'mock', MYSQL_DATABASE: 'mock', ORDER_REPLY_TOKEN: 'reply-secret' } } });
  const setup = { getVerifiedSessionPhone: () => signed ? '13800000000' : null, ensureDatabase: async () => {} };
  const service = load('../lib/points-service.ts', { '@/db/mysql-runtime': runtime, '@/db/setup': setup, './points': points });
  const entitlements = load('../lib/tool-entitlements.ts', { '@/db/mysql-runtime': runtime, './tool-services': tools });
  const stamp = load('../lib/stamp-service.ts', { '@/db/mysql-runtime': runtime, '@/db/setup': setup, './points-service': service, './tool-entitlements': entitlements, './tool-services': tools, './stamp-options': stamps });
  const environment = { TOOLS_USAGE_SECRET: 'a'.repeat(40) };
  const usage = load('../lib/tool-points-usage.ts', { '@/db/mysql-runtime': runtime, './points-service': service, './tool-entitlements': entitlements }, { process: { env: environment } });
  const api = load('../app/api/points/route.ts', { '@/db/mysql-runtime': runtime, '@/lib/points-service': service, '@/lib/points': points, '@/lib/order-notifications': { sendOrderNotification: async () => {} } });
  return { state, log, service, stamp, runtime, setup, entitlements, usage, environment, api,
    save: (key = id, hash = 'a'.repeat(64), user = 1) => stamp.savePaidStamp(user, 40, key, hash, Buffer.from('png'), 1600),
    consume: (operation = 'use-1', count = 10, product = 40, user = 1) => runtime.env.DB.transaction(async db => { await service.lockPointsUser(db, user); return service.consumePoints(db, user, product, count, operation); }) };
}
test('四档套餐严格对应用户确认的金额和积分，数量必须为正整数', () => {
  assert.deepEqual(points.defaultPointsPackages.map(item => [item.points, item.price]), [[200, 20], [600, 50], [1200, 100], [2500, 200]]);
  for (const value of [0, -1, .5, Infinity, '10', 1000001]) assert.equal(points.validPoints(value), false);
});
test('新老用户钱包只赠送一次100积分，并发初始化和重复读取不会叠加', async () => {
  const f = fixture(); assert.deepEqual(await Promise.all([f.service.pointsBalance(1), f.service.pointsBalance(1)]), [100, 100]);
  assert.equal(f.state.ledger.length, 1); assert.equal(f.state.ledger[0].operation_id, 'welcome:1');
  await f.consume(); assert.equal(await f.service.pointsBalance(1), 90); assert.equal(f.state.ledger.filter(row => row.kind === 'welcome').length, 1);
});
test('充值核验并发或邮件重复回复只到账一次，使用订单积分快照而非当前套餐', async () => {
  const f = fixture(); f.state.products[1].points_amount = 9999;
  const key = f.state.orders[0].id;
  await Promise.all([f.service.changePointsOrderStatus(key, 'paid'), f.service.changePointsOrderStatus(key, 'delivered')]);
  assert.equal(f.state.wallets[0].balance, 700); assert.equal(f.state.orders[0].status, 'delivered'); assert.equal(f.state.ledger.filter(row => row.kind === 'recharge').length, 1);
  for (const status of ['closed', 'pending']) await assert.rejects(f.service.changePointsOrderStatus(key, status), error => error.status === 409);
  assert.equal(f.state.wallets[0].balance, 700);
});
test('充值流水写入失败回滚钱包和订单，不会扣款核验成功但丢失积分', async () => {
  const f = fixture({ balance: 100, fail: 'ledger' });
  await assert.rejects(f.service.changePointsOrderStatus(f.state.orders[0].id, 'paid'));
  assert.equal(f.state.wallets[0].balance, 100); assert.equal(f.state.orders[0].status, 'pending'); assert.equal(f.state.ledger.length, 0);
});
test('普通订单不走积分到账，关闭充值订单无法恢复到账；缺少快照不能核验', async () => {
  const f = fixture(); assert.equal(await f.service.changePointsOrderStatus('missing', 'paid'), false);
  f.state.orders[0].points_amount = 0; await assert.rejects(f.service.changePointsOrderStatus(f.state.orders[0].id, 'paid'), error => error.status === 409);
  f.state.orders[0].points_amount = 600; await f.service.changePointsOrderStatus(f.state.orders[0].id, 'closed'); await assert.rejects(f.service.changePointsOrderStatus(f.state.orders[0].id, 'paid'), error => error.status === 409); assert.equal(f.state.wallets.length, 0);
});
test('通用钱包在不同工具间扣不同积分；重复任务幂等且不能挪用任务', async () => {
  const f = fixture(); await f.consume('a', 10, 40); await f.consume('b', 25, 41); const retry = await f.consume('a', 10, 40);
  assert.equal(f.state.wallets[0].balance, 65); assert.equal(retry.duplicate, true); assert.equal(retry.charged, false);
  await assert.rejects(f.consume('a', 10, 41), error => error.status === 409);
  await assert.rejects(f.consume('a', 10, 40, 2), error => error.status === 409);
});
test('最后10积分并发消费只能成功一个任务，余额不能为负', async () => {
  const f = fixture({ balance: 10 }); const result = await Promise.allSettled([f.consume('a'), f.consume('b')]);
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1); assert.equal(result.find(row => row.status === 'rejected').reason.status, 402); assert.equal(f.state.wallets[0].balance, 0); assert.equal(f.state.ledger.length, 1);
});
test('积分印章成功才扣分并保存成品，重复任务在余额耗尽时仍可恢复', async () => {
  const f = fixture({ balance: 10 }); const [first, retry] = await Promise.all([f.save(), f.save()]);
  assert.equal(first.pointsSpent, 10); assert.equal(retry.reused, true); assert.equal(f.state.results.length, 1); assert.equal(f.state.wallets[0].balance, 0);
  assert.equal((await f.stamp.findStampResult(1, 40, id)).reused, true);
  await assert.rejects(f.save(secondId), error => error.status === 402); assert.equal(f.state.results.length, 1);
});
test('积分印章成品落库失败回滚积分及流水，参数和用户变更不能套用旧任务', async () => {
  const fail = fixture({ balance: 100, fail: 'result' }); await assert.rejects(fail.save()); assert.equal(fail.state.wallets[0].balance, 100); assert.equal(fail.state.ledger.length, 0);
  const f = fixture(); await f.save(); await assert.rejects(f.save(id, 'b'.repeat(64)), error => error.status === 409); await assert.rejects(f.save(id, 'a'.repeat(64), 2), error => error.status === 409);
});
for (const cycle of ['times', 'once', 'month']) test(`切换积分模式后保留已有 ${cycle} 权益，优先于积分`, async () => {
  const f = fixture({ balance: 100, rights: [{ id: 'legacy', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: cycle, tool_paid_at: new Date().toISOString(), tool_uses_remaining: 1 }] });
  await f.save(); assert.equal(f.state.wallets[0].balance, 100); assert.equal(f.state.ledger.length, 0); assert.equal(f.state.events.length, 1);
  assert.equal(f.state.orders[1].tool_uses_remaining, cycle === 'times' ? 0 : 1);
});
test('公开套餐接口不泄露用户流水，未登录不能充值；充值金额和数量只取服务端', async () => {
  const guest = fixture({ signed: false }); const account = await (await guest.api.GET(new Request('http://localhost/api/points'))).json();
  assert.equal(account.signedIn, false); assert.equal(account.ledger.length, 0); assert.equal(guest.state.wallets.length, 0);
  assert.equal((await guest.api.POST(new Request('http://localhost/api/points', { method: 'POST', body: JSON.stringify({ packageId: 101 }) }))).status, 401);
  const f = fixture(); const response = await f.api.POST(new Request('http://localhost/api/points', { method: 'POST', body: JSON.stringify({ packageId: 101, points: 999999, price: .01, userId: 2 }) }));
  assert.equal(response.status, 200); const order = f.state.orders.at(-1); assert.equal(order.points_amount, 200); assert.equal(order.amount, 20); assert.equal(order.user_id, 1); assert.equal(f.state.wallets.length, 0);
  f.state.products[1].paymentReady = 0; assert.equal((await f.api.POST(new Request('http://localhost/api/points', { method: 'POST', body: '{"packageId":101}' }))).status, 409);
});
test('积分明细按当前真实用户隔离，分页保留初始赠送与余额', async () => {
  const f = fixture(); await f.service.pointsBalance(2); await f.consume();
  const response = await f.api.GET(new Request('http://localhost/api/points?page=999')); const data = await response.json();
  assert.equal(data.balance, 90); assert.equal(data.page, 1); assert.equal(data.ledger.length, 2); assert.ok(data.ledger.every(row => row.user_id === 1)); assert.match(response.headers.get('cache-control'), /no-store/);
});
test('邮件支付核验接入同一到账事务，重复回复不重加，不能作废已到账订单', async () => {
  const f = fixture(); const route = load('../app/api/order-notifications/reply/route.ts', { '@/db/mysql-runtime': f.runtime, '../../../../db/setup': f.setup, '../../../../lib/order-notifications': { replyStatusMap: { 已支付: 'paid', 已作废: 'closed' } }, '../../../../lib/points-service': f.service });
  const reply = (status, token = 'reply-secret') => route.POST(new Request('http://localhost/api/order-notifications/reply', { method: 'POST', headers: { 'x-order-reply-token': token }, body: JSON.stringify({ orderId: f.state.orders[0].id, status }) }));
  assert.equal((await reply('已支付', 'bad')).status, 401); assert.equal((await reply('已支付')).status, 200); assert.equal((await reply('已支付')).status, 200); assert.equal(f.state.wallets[0].balance, 700); assert.equal((await reply('已作废')).status, 409);
});
test('后台普通订单修改同样执行充值核验，不再直接改状态丢失到账', async () => {
  const f = fixture(); const route = load('../app/api/admin/route.ts', { '@/db/mysql-runtime': f.runtime, '../../../db/setup': f.setup, '../../../lib/order-notifications': {}, '../../../lib/points-service': f.service, '../../../lib/admin-auth': { getAdminContext: async () => ({}), hasAdminPermission: () => true } });
  const response = await route.POST(new Request('http://localhost/api/admin', { method: 'POST', body: JSON.stringify({ action: 'order-status', id: f.state.orders[0].id, status: 'paid' }) }));
  assert.equal(response.status, 200); assert.equal(f.state.wallets[0].balance, 700); assert.equal(f.state.orders[0].status, 'delivered');
});
test('通用成功回调必须同时具有服务端密钥和有效任务签名，失败回调不扣积分', async () => {
  const f = fixture(), ticket = f.usage.createToolUsageTicket(1, 40, 10);
  const route = load('../app/api/tools/usage/route.ts', { '@/lib/points-service': f.service, '@/lib/tool-points-usage': f.usage });
  const send = (body, key = f.environment.TOOLS_USAGE_SECRET) => route.POST(new Request('http://localhost/api/tools/usage', { method: 'POST', headers: { 'x-tool-usage-secret': key }, body: JSON.stringify(body) }));
  assert.equal((await send({ ticket, success: true }, 'bad')).status, 401); assert.equal((await send({ ticket: `${ticket}bad`, success: true })).status, 401);
  assert.equal((await send({ ticket, success: false })).status, 200); assert.equal(f.state.wallets.length, 0);
  assert.equal((await send({ ticket, success: true })).status, 200); assert.equal((await send({ ticket, success: true })).status, 200); assert.equal(f.state.wallets[0].balance, 90);
  const forged = Buffer.from(JSON.stringify({ ...f.usage.readToolUsageTicket(ticket), userId: 2 })).toString('base64url') + '.' + ticket.split('.')[1]; assert.throws(() => f.usage.readToolUsageTicket(forged));
});
test('通用工具扣分复核当前价格，旧权益优先；未配置密钥不会开放积分入口', async () => {
  const f = fixture({ balance: 100 }); const ticket = f.usage.readToolUsageTicket(f.usage.createToolUsageTicket(1, 40, 10));
  f.state.products[0].tool_points_cost = 20; await assert.rejects(f.usage.recordSuccessfulPointsToolUse(ticket), error => error.status === 409); assert.equal(f.state.wallets[0].balance, 100);
  const legacy = fixture({ balance: 0, rights: [{ id: 'legacy', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'times', tool_uses_remaining: 1 }] });
  const task = legacy.usage.readToolUsageTicket(legacy.usage.createToolUsageTicket(1, 40, 10)); await legacy.usage.recordSuccessfulPointsToolUse(task); const retry = await legacy.usage.recordSuccessfulPointsToolUse(task); assert.equal(retry.duplicate, true); assert.equal(legacy.state.orders[1].tool_uses_remaining, 0); assert.equal(legacy.state.wallets[0].balance, 0);
  f.environment.TOOLS_USAGE_SECRET = ''; assert.throws(() => f.usage.createToolUsageTicket(1, 40, 20), error => error.status === 503);
});
test('后台积分管理 GET/POST 都校验独立权限，未授权不读取数据', async () => {
  const f = fixture(); const route = load('../app/api/admin/points/route.ts', { '@/db/mysql-runtime': { env: { DB: { prepare() { throw Error('不应读取'); } } } }, '@/db/setup': {}, '@/lib/points-service': f.service, '@/lib/points': points, '@/lib/admin-auth': { getAdminContext: async () => ({}), hasAdminPermission: () => false, adminDenied: () => Response.json({}, { status: 403 }) } });
  assert.equal((await route.GET(new Request('http://localhost/api/admin/points'))).status, 403); assert.equal((await route.POST(new Request('http://localhost/api/admin/points', { method: 'POST', body: '{}' }))).status, 403);
});
test('普通商品管理不能跨模块修改积分套餐和收款码', async () => {
  const f = fixture(); const route = load('../app/api/admin/route.ts', { '@/db/mysql-runtime': { env: { DB: { prepare() { return { bind() { return this; }, first: async () => ({ id: 101 }), run() { throw Error('不应写入'); } }; } } } }, '../../../db/setup': f.setup, '../../../lib/order-notifications': {}, '../../../lib/points-service': f.service, '../../../lib/admin-auth': { getAdminContext: async () => ({}), hasAdminPermission: () => true } });
  for (const action of ['product-save', 'product-status', 'qr-save', 'qr-status', 'qr-delete']) {
    const response = await route.POST(new Request('http://localhost/api/admin', { method: 'POST', body: JSON.stringify({ action, id: 101, productId: 101 }) })); assert.equal(response.status, 400);
  }
});
test('未迁移或账务错误有明确状态提示，禁用账户不能初始化钱包', async () => {
  const f = fixture(); f.state.users = []; await assert.rejects(f.service.pointsBalance(1), error => error.status === 401);
  const response = f.service.pointsFailure({ code: 'ER_BAD_FIELD_ERROR' }); assert.equal(response.status, 503); assert.match((await response.json()).message, /07/);
});
test('印章权益显示账户余额和工具价格，余额不足和未登录均不能制作', async () => {
  const f = fixture({ balance: 10, cost: 15 });
  const access = await f.stamp.stampAccess(f.state.products[0], { id: 1 });
  assert.equal(access.canGenerate, false); assert.equal(access.pointsBalance, 10); assert.equal(access.pointsCost, 15); assert.equal(access.purchaseUrl, '/points');
  assert.equal((await f.stamp.stampAccess(f.state.products[0], null)).canGenerate, false);
  f.state.wallets[0].balance = 100; assert.equal((await f.stamp.stampAccess(f.state.products[0], { id: 1 })).canGenerate, true);
});
test('积分工具入口只签发任务不扣分，内置印章直接进入；未配置外部回调时禁止跳转', async () => {
  const f = fixture(); const route = load('../app/api/tools/access/route.ts', { '@/db/mysql-runtime': f.runtime, '@/db/setup': f.setup, '@/lib/tool-services': tools, '@/lib/tool-entitlements': f.entitlements, '@/lib/points-service': f.service, '@/lib/tool-points-usage': f.usage });
  const request = () => route.GET(new Request('http://localhost/api/tools/access?slug=stamp-maker'));
  let data = await (await request()).json(); assert.equal(data.entryUrl, '/tools/stamp-maker.html'); assert.equal(f.state.wallets[0].balance, 100);
  f.state.products[0].tool_slug = 'video-tool'; f.state.products[0].tool_url = 'https://tools.example.com/video';
  const external = () => route.GET(new Request('http://localhost/api/tools/access?slug=video-tool'));
  data = await (await external()).json(); const ticket = new URL(data.entryUrl).searchParams.get('yx_ticket'); assert.equal(f.usage.readToolUsageTicket(ticket).productId, 40); assert.equal(f.state.wallets[0].balance, 100);
  f.environment.TOOLS_USAGE_SECRET = ''; assert.equal((await external()).status, 503);
});
test('任务过期时拒绝成功回调，不因旧凭据扣分', () => {
  const f = fixture(); const value = { ...f.usage.readToolUsageTicket(f.usage.createToolUsageTicket(1, 40, 10)), expires: Date.now() - 1 };
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url'); const signature = createHmac('sha256', f.environment.TOOLS_USAGE_SECRET).update(payload).digest('base64url');
  assert.throws(() => f.usage.readToolUsageTicket(`${payload}.${signature}`), error => error.status === 401); assert.equal(f.state.ledger.length, 0);
});
test('普通下单接口不能绕过积分充值快照；未配置收款码不能生成充值订单', async () => {
  const f = fixture(); const route = load('../app/api/orders/route.ts', { '@/db/mysql-runtime': f.runtime, '../../../db/setup': f.setup, '../../../lib/tool-services': tools, '../../../lib/order-notifications': {} });
  const response = await route.POST(new Request('http://localhost/api/orders', { method: 'POST', body: '{"productId":101}' })); assert.equal(response.status, 400); assert.equal(f.state.orders.length, 1);
});
test('后台充值套餐校验价格、数量并按保存金额配置收款码，不能改普通商品', async () => {
  const f = fixture(), writes = [], prepared = [];
  const DB = { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { if (sql.includes("product_type='points'")) return args[0] === 101 ? { id: 101 } : null; return null; }, async all() { return { results: [{ id: 101, name: '轻享积分包', points: 200, price: 20, status: 'active' }] }; }, async run() { assert.equal((sql.match(/\?/g) || []).length, args.length); writes.push({ sql, args }); return { meta: { last_row_id: 105 } }; } }; } };
  const service = { ...f.service, pointsPackages: async () => [{ id: 101, price: 20 }] };
  const route = load('../app/api/admin/points/route.ts', { '@/db/mysql-runtime': { env: { DB } }, '@/db/setup': { ensurePaymentQrRecords: async (...args) => prepared.push(args) }, '@/lib/points-service': service, '@/lib/points': points, '@/lib/admin-auth': { getAdminContext: async () => ({}), hasAdminPermission: () => true } });
  const post = body => route.POST(new Request('http://localhost/api/admin/points', { method: 'POST', body: JSON.stringify(body) }));
  for (const body of [{ points: 0 }, { points: 1.5 }, { price: 0 }, { price: 20.001 }]) assert.equal((await post({ action: 'save', name: '积分', points: 200, price: 20, ...body })).status, 400);
  assert.equal((await post({ action: 'save', id: 40, name: '积分', points: 200, price: 20 })).status, 404);
  assert.equal((await post({ action: 'save', id: 101, name: '积分', points: 200, price: 20, status: 'active' })).status, 200); assert.deepEqual(prepared, [[101, 20]]);
  assert.equal((await post({ action: 'qr-save', id: 101, amount: 21, type: 'wechat', imageUrl: 'data:image/png;base64,YQ==' })).status, 400);
  assert.equal((await post({ action: 'qr-save', id: 101, amount: 20, type: 'wechat', imageUrl: 'data:image/png;base64,YQ==', enabled: true })).status, 200); assert.equal(writes.at(-1).args[1], 'active');
});
const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
test('积分中心显示四档配置、真实余额、登录入口；套餐未配置收款码不能购买', () => {
  const component = load('../components/points-center.tsx', { '../lib/points': points, 'next/link': Link });
  const guest = renderToStaticMarkup(React.createElement(component.PointsCenter)); assert.ok(guest.includes('100')); assert.ok(guest.includes('/?returnTo=/points'));
  const account = { signedIn: true, balance: 100, packages: points.defaultPointsPackages.map((pack, index) => ({ ...pack, id: index + 1, paymentReady: index > 0 })), ledger: [], total: 0, page: 1 };
  const react = { ...React, useState(initial) { if (initial === null) return [account, () => {}]; return [typeof initial === 'function' ? initial() : initial, () => {}]; }, useEffect() {} };
  const configured = load('../components/points-center.tsx', { '../lib/points': points, 'next/link': Link, react });
  const html = renderToStaticMarkup(React.createElement(configured.PointsCenter)); assert.ok(html.includes('2500')); assert.ok(html.includes('收款配置中')); assert.ok(html.includes('disabled=""')); assert.ok(html.includes('立即充值'));
});
