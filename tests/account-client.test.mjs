import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const account = (id = 1, balance = 100) => ({ authenticated: true, user: { id, nickname: `用户${id}` }, pointsBalance: balance });
const guest = { authenticated: false, user: null, pointsBalance: null };
const tick = () => new Promise(resolve => setImmediate(resolve));
function host(fetch) {
  const effects = [], subscribers = [], handlers = new Map(), storage = new Map();
  const window = { addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); }, removeEventListener(name, fn) { handlers.get(name)?.delete(fn); }, dispatchEvent(event) { for (const handler of handlers.get(event.type) || []) handler(event); } };
  const react = { useSyncExternalStore(subscribe, read) { subscribers.push(subscribe(() => {})); return read(); }, useEffect(effect) { effects.push(effect); } };
  const exports = {}, code = ts.transpileModule(readFileSync(new URL('../lib/account-client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require(name) { if (name === 'react') return react; throw Error(name); }, fetch, Event, window, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, localStorage: { setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); } } });
  return { api: exports, mount() { exports.useAccount(); return effects.shift()(); }, read: () => exports.useAccount(), event(name, values = {}) { for (const handler of handlers.get(name) || []) handler({ type: name, ...values }); }, handlers, storage };
}
test('多个账户控件共享同一次读取，正常读取零积分，成功后可刷新真实余额', async () => {
  let calls = 0, balance = 100;
  const h = host(async () => { calls++; return Response.json(account(1, balance)); });
  h.mount(); h.mount(); await tick(); assert.equal(calls, 1); assert.equal(h.read().account.pointsBalance, 100);
  balance = 0; h.api.notifyAccountChanged(); await tick(); await tick(); assert.equal(h.read().account.pointsBalance, 0); assert.equal(h.read().error, ''); assert.ok(h.storage.has('yxshop-account-event'));
});
test('账户切换期间迟到的旧响应被丢弃，不能覆盖新身份和新余额', async () => {
  let finishOld, calls = 0;
  const h = host(async () => { calls++; if (calls === 1) return new Promise(resolve => { finishOld = resolve; }); return Response.json(account(2, 600)); });
  h.mount(); h.api.notifyAccountChanged(); finishOld(Response.json(account(1, 999))); await tick(); await tick();
  assert.equal(h.read().account.user.id, 2); assert.equal(h.read().account.pointsBalance, 600);
});
test('另一标签退出会使旧请求失效；不把网络失败或服务异常当作已退出', async () => {
  let finishOld, calls = 0;
  const h = host(async () => { calls++; if (calls === 1) return new Promise(resolve => { finishOld = resolve; }); return Response.json(guest); });
  h.mount(); h.event('storage', { key: 'yxshop-account-event' }); finishOld(Response.json(account())); await tick(); await tick(); assert.equal(h.read().account.authenticated, false);
  let fail = false;
  const other = host(async () => fail ? Response.json({ message: '积分服务不可用' }, { status: 503 }) : Response.json(account()));
  other.mount(); await tick(); fail = true; await other.api.refreshAccount(); assert.equal(other.read().account.authenticated, true); assert.equal(other.read().account.pointsBalance, null); assert.match(other.read().error, /不可用/);
});
test('退出接口失败不清空登录状态；成功退出后清除账户与本机旧手机号提示', async () => {
  let fail = true, signed = true;
  const h = host(async (url, init) => {
    if (url.endsWith('/logout')) { assert.equal(init.method, 'POST'); if (fail) return new Response('', { status: 503 }); signed = false; return Response.json({ ok: true }); }
    return Response.json(signed ? account() : guest);
  });
  h.mount(); await tick(); h.storage.set('mall_phone', '13800000000');
  await assert.rejects(h.api.signOutAccount(), /退出失败/); assert.equal(h.read().account.authenticated, true);
  fail = false; await h.api.signOutAccount(); await tick(); assert.equal(h.read().account.authenticated, false); assert.equal(h.storage.has('mall_phone'), false);
});
