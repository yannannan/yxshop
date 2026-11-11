import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { tsImport } from 'tsx/esm/api';
import * as toolServices from '../lib/tool-services.ts';
const require = createRequire(import.meta.url);
const entries = await tsImport('../lib/tool-entries.ts', import.meta.url);
const analytics = await tsImport('../lib/tool-analytics.ts', import.meta.url);
const imageSpec = await tsImport('../lib/image-tool.ts', import.meta.url);
const requestHelpers = await tsImport('../lib/image-request.ts', import.meta.url);
function load(file, mocks, globals = {}) {
  const result = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module: result, exports: result.exports, Response, Request, URL, Date, TextDecoder, console: { error() {} }, ...globals, require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('node:') || name === 'react/jsx-runtime') return require(name); throw Error('Missing mock: ' + name); } });
  return result.exports;
}
const rows = [
  { id: 80, name: '图片在线处理', tool_slug: 'image-processor', sort_order: 1 },
  { id: 91, name: '文件在线签名', tool_slug: 'document-signature', sort_order: 2 },
  { id: 37, name: '印章在线制作', tool_slug: 'stamp-maker', sort_order: 3 },
  { id: 35, name: '视频提取', tool_slug: 'video-extractor', sort_order: 4 },
  { id: 50, name: '站长分析', tool_slug: 'webmaster-tools', sort_order: 5 },
].map(row => ({ ...row, product_type: 'tool', status: 'active', tool_charge_type: 'points', tool_points_cost: 10 }));
const adminAuth = denied => ({ getAdminContext: async () => denied ? null : {}, hasAdminPermission: () => !denied, adminDenied: () => new Response('', { status: 403 }) });
function fixture({ failSortSlug = '' } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.function('CONCAT', { varargs: true }, (...args) => args.join(''));
  sqlite.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,tool_slug TEXT,sort_order INT,product_type TEXT,status TEXT,tool_charge_type TEXT,tool_points_cost INT);
    CREATE TABLE tool_entry_settings(tool_slug TEXT PRIMARY KEY,sort_order INT,enabled INT,updated_at TEXT);
    CREATE TABLE tool_module_points(product_id INT,module_key TEXT,points_cost INT,updated_at TEXT,PRIMARY KEY(product_id,module_key));
    CREATE TABLE document_signatures(product_id INT,user_id INT,id TEXT,created_at TEXT,deleted_at TEXT);
    CREATE TABLE document_handprints(product_id INT,user_id INT,id TEXT,created_at TEXT,deleted_at TEXT);
    CREATE TABLE signed_documents(product_id INT,user_id INT,id TEXT,created_at TEXT);
    CREATE TABLE image_processing_results(product_id INT,user_id INT,id TEXT,action TEXT,created_at TEXT);
    CREATE TABLE tool_generation_results(product_id INT,user_id INT,id TEXT,created_at TEXT);
    CREATE TABLE video_extraction_tasks(product_id INT,user_id INT,id TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE site_analysis_runs(product_id INT,user_id INT,id TEXT,status TEXT,completed_at TEXT);
    CREATE TABLE points_ledger(product_id INT,user_id INT,operation_id TEXT PRIMARY KEY,kind TEXT,delta INT,created_at TEXT);
    CREATE TABLE orders(id TEXT PRIMARY KEY,product_id INT,user_id INT);
    CREATE TABLE tool_usage_events(operation_id TEXT PRIMARY KEY,order_id TEXT,created_at TEXT);
    CREATE TABLE tool_activity_events(id TEXT PRIMARY KEY,tool_slug TEXT,module_key TEXT,event_type TEXT,user_id INT,session_hash TEXT,created_at TEXT);`);
  for (const row of rows) sqlite.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?)').run(...['id', 'name', 'tool_slug', 'sort_order', 'product_type', 'status', 'tool_charge_type', 'tool_points_cost'].map(key => row[key]));
  const writes = [];
  function prepared(original) {
    let values = [];
    let sql = original.replaceAll(' FOR UPDATE', '').replace(/^INSERT IGNORE/, 'INSERT OR IGNORE').replace(/ON DUPLICATE KEY UPDATE sort_order=VALUES\(sort_order\),enabled=VALUES\(enabled\),updated_at=VALUES\(updated_at\)/, 'ON CONFLICT(tool_slug) DO UPDATE SET sort_order=excluded.sort_order,enabled=excluded.enabled,updated_at=excluded.updated_at').replace(/ON DUPLICATE KEY UPDATE points_cost=VALUES\(points_cost\),updated_at=VALUES\(updated_at\)/, 'ON CONFLICT(product_id,module_key) DO UPDATE SET points_cost=excluded.points_cost,updated_at=excluded.updated_at');
    return { bind(...args) { values = args; return this; },
      async all() {
        if (sql.includes('information_schema.TABLES')) return { results: sqlite.prepare("SELECT name table_name FROM sqlite_master WHERE type='table'").all() };
        // SQLite has no WITH ROLLUP. Execute the same inner SQL plus its two subtotal groupings.
        if (sql.endsWith(' GROUP BY a.tool_slug,a.module_key WITH ROLLUP')) {
          const base = sql.replace(' WITH ROLLUP', '');
          const tool = base.replace('a.tool_slug,a.module_key,COUNT', 'a.tool_slug,NULL AS module_key,COUNT').replace(' GROUP BY a.tool_slug,a.module_key', ' GROUP BY a.tool_slug');
          const all = base.replace('a.tool_slug,a.module_key,COUNT', 'NULL AS tool_slug,NULL AS module_key,COUNT').replace(' GROUP BY a.tool_slug,a.module_key', '');
          return { results: [base, tool, all].flatMap(query => sqlite.prepare(query).all(...values)) };
        }
        return { results: sqlite.prepare(sql).all(...values) };
      },
      async first() { return (await this.all()).results[0] ?? null; },
      async run() { writes.push({ sql: original, values }); if (original.startsWith('INSERT INTO tool_entry_settings') && values[0] === failSortSlug) throw Error('injected failure'); const result = sqlite.prepare(sql).run(...values); return { meta: { changes: result.changes } }; },
    };
  }
  const DB = { prepare: prepared, async transaction(work) { sqlite.exec('BEGIN'); try { const result = await work({ prepare: prepared }); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const runtime = { env: { DB } };
  const settings = load('../lib/tool-entry-settings.ts', { '@/db/mysql-runtime': runtime });
  function entryRoute(denied = false) { return load('../app/api/admin/tool-entries/route.ts', { '@/db/mysql-runtime': runtime, '@/lib/admin-auth': adminAuth(denied), '@/lib/tool-entries': entries, '@/lib/tool-entry-settings': settings, '@/lib/tool-module-pricing': { readModulePrices: async () => ({ handprint: 7 }) }, '@/lib/image-request': requestHelpers }); }
  return { sqlite, writes, runtime, settings, entryRoute, analytics: load('../lib/tool-analytics-service.ts', { '@/db/mysql-runtime': runtime, './tool-entries': entries, './tool-analytics': analytics }) };
}
const post = (path, body, headers = {}) => new Request('http://localhost' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('管理端手印独立显示并继承原工具与模块价格，公开排序和隐藏不产生重复产品', () => {
  const result = entries.toolEntryRows(rows, [{ tool_slug: 'handprint-maker', sort_order: 0, enabled: 1 }], 7);
  assert.equal(result.length, 6); assert.equal(result[0].tool_slug, 'handprint-maker'); assert.equal(result[0].id, 91); assert.equal(result[0].tool_points_cost, 7);
  const publicRows = result.map(row => ({ slug: row.tool_slug }));
  assert.equal(entries.publicToolOrder(publicRows, [{ tool_slug: 'handprint-maker', sort_order: 0, enabled: 0 }]).some(row => row.slug === 'handprint-maker'), false);
  assert.equal(entries.toolEntryRows(rows.map(row => row.id === 91 ? { ...row, status: 'inactive' } : row), [], 7).find(row => row.module_key).status, 'inactive');
});

test('管理员排序事务保存全部入口，手印状态独立；拒绝缺项、重复、越界、跨站和无权限', async () => {
  const f = fixture(), route = f.entryRoute(), url = '/api/admin/tool-entries';
  const list = await (await route.GET(new Request('http://localhost' + url))).json();
  assert.equal(list.tools.length, 6); assert.equal(list.tools.find(row => row.module_key).tool_points_cost, 7);
  const order = list.tools.map((row, i) => ({ slug: row.tool_slug, sort: (6 - i) * 10 }));
  assert.equal((await route.POST(post(url, { action: 'sort', entries: order }))).status, 200);
  assert.equal((await (await route.GET(new Request('http://localhost' + url))).json()).tools[0].tool_slug, order.at(-1).slug);
  const published = load('../lib/tool-service-data.ts', { '@/db/mysql-runtime': { env: { DB: { prepare() { return { bind() { return this; }, async all() { return { results: rows }; }, async first() { return rows.find(row => row.id === 91); } }; } } } }, './tool-services': toolServices, './tool-module-pricing': { readModulePrices: async () => ({ handprint: 7 }) }, './tool-entry-settings': f.settings, './tool-entries': entries });
  assert.deepEqual([...((await published.getPublishedTools()).map(row => row.slug))], [...order].sort((a, b) => a.sort - b.sort).map(row => row.slug), 'saved admin order must reach the public directory');
  assert.equal((await route.POST(post(url, { action: 'visibility', slug: 'handprint-maker', enabled: false }))).status, 200);
  assert.equal(f.sqlite.prepare("SELECT enabled FROM tool_entry_settings WHERE tool_slug='handprint-maker'").get().enabled, 0);
  assert.equal(await published.getPublishedTool('handprint-maker'), null);
  assert.equal((await published.getPublishedTools()).some(row => row.slug === 'handprint-maker'), false);
  const count = f.writes.length;
  for (const [body, status] of [[{ action: 'sort', entries: order.slice(1) }, 409], [{ action: 'sort', entries: [order[0], order[0]] }, 400], [{ action: 'sort', entries: [{ slug: 'bad', sort: -1 }] }, 400], [{ action: 'visibility', slug: 'stamp-maker', enabled: false }, 400]]) assert.equal((await route.POST(post(url, body))).status, status);
  assert.equal((await route.POST(post(url, { action: 'sort', entries: order }, { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await f.entryRoute(true).POST(post(url, { action: 'sort', entries: order }))).status, 403);
  assert.equal(f.writes.length, count);
});

test('缺少新配置表时旧入口读取回退，排序明确提示初始化且不修改产品', async () => {
  const f = fixture(); f.sqlite.exec('DROP TABLE tool_entry_settings');
  // Match MySQL's missing-table code while retaining the real transaction behavior.
  const DB = { ...f.runtime.env.DB, prepare() { return { async all() { throw Object.assign(Error('missing'), { code: 'ER_NO_SUCH_TABLE' }); } }; } };
  const config = load('../lib/tool-entry-settings.ts', { '@/db/mysql-runtime': { env: { DB } } });
  assert.equal((await config.readToolEntrySettings()).ready, false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) total FROM products').get().total, 5);
});

test('排序中途写入失败时整批回滚，不留下部分新顺序', async () => {
  const f = fixture({ failSortSlug: 'document-signature' });
  const changes = entries.toolEntryRows(rows, []).map((row, index) => ({ slug: row.tool_slug, sort: index * 10 }));
  assert.equal((await f.entryRoute().POST(post('/api/admin/tool-entries', { action: 'sort', entries: changes }))).status, 503);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) total FROM tool_entry_settings').get().total, 0);
});

test('真实查询对成品、积分与套餐记录按任务去重，手印不重复归入签名，失败排除，部分报告免费', async () => {
  const f = fixture(), date = '2026-11-11T00:00:00.000Z';
  f.sqlite.prepare('INSERT INTO document_signatures VALUES (91,1,?,?,?)').run('s1', date, date);
  f.sqlite.prepare('INSERT INTO document_handprints VALUES (91,1,?,?,NULL)').run('h1', date);
  f.sqlite.prepare('INSERT INTO signed_documents VALUES (91,2,?,?)').run('d1', date);
  f.sqlite.prepare('INSERT INTO image_processing_results VALUES (80,1,?,?,?)').run('i1', 'compress', date);
  f.sqlite.prepare('INSERT INTO tool_generation_results VALUES (37,3,?,?)').run('st1', date);
  f.sqlite.prepare('INSERT INTO video_extraction_tasks VALUES (35,4,?,?,?)').run('v1', 'failed', date);
  f.sqlite.prepare('INSERT INTO site_analysis_runs VALUES (50,2,?,?,?)').run('r1', 'partial', date);
  for (const [product, user, op, delta] of [[91, 1, 'signature:create:1:s1', -10], [91, 1, 'signature:handprint:1:h1', -7], [80, 1, 'image:i1', -3]]) f.sqlite.prepare('INSERT INTO points_ledger VALUES (?,?,?,\'consume\',?,?)').run(product, user, op, delta, date);
  f.sqlite.prepare('INSERT INTO orders VALUES (?,91,2)').run('member'); f.sqlite.prepare('INSERT INTO tool_usage_events VALUES (?,?,?)').run('signature:sign:2:d1', 'member', date);
  const data = await f.analytics.readToolAnalytics('all');
  assert.deepEqual([data.totals.uses, data.totals.users, data.totals.points], [6, 3, 20]);
  const signature = data.tools.find(row => row.slug === 'document-signature'), handprint = data.tools.find(row => row.slug === 'handprint-maker');
  assert.deepEqual([signature.uses, signature.users, signature.points], [2, 2, 10]);
  assert.deepEqual([handprint.uses, handprint.users, handprint.points], [1, 1, 7]);
  assert.equal(data.tools.find(row => row.slug === 'image-processor').modules.find(row => row.key === 'compress').points, 3);
  assert.equal(data.tools.find(row => row.slug === 'video-extractor').uses, 0);
  assert.equal(data.tools.find(row => row.slug === 'webmaster-tools').points, 0);
});

test('统计周期按北京时间，点击与功能点击独立，缺表不伪造历史点击', async () => {
  assert.equal(analytics.analyticsStart('today', Date.parse('2026-11-10T18:00:00Z')), '2026-11-10T16:00:00.000Z');
  assert.equal(analytics.analyticsStart('7', Date.parse('2026-11-10T18:00:00Z')), '2026-11-04T16:00:00.000Z');
  assert.throws(() => analytics.analyticsStart('90'), /周期/);
  const f = fixture();
  f.sqlite.prepare("INSERT INTO points_ledger VALUES (37,8,'stamp:old','consume',-12,'2000-01-01T00:00:00.000Z')").run();
  f.sqlite.prepare('INSERT INTO tool_activity_events VALUES (?,?,?,?,?,?,?)').run('a', 'handprint-maker', 'handprint', 'module', 1, 'session', new Date().toISOString());
  f.sqlite.prepare('INSERT INTO tool_activity_events VALUES (?,?,?,?,?,?,?)').run('b', 'handprint-maker', '', 'entry', 1, 'session', new Date().toISOString());
  const data = await f.analytics.readToolAnalytics('today');
  assert.equal(data.totals.clicks, 1); assert.equal(data.totals.featureClicks, 1); assert.equal(data.totals.uses, 0);
  f.sqlite.exec('DROP TABLE tool_activity_events; DROP TABLE document_handprints');
  const missing = await f.analytics.readToolAnalytics('all'); assert.equal(missing.clicksReady, false); assert.ok(missing.warnings.some(text => text.includes('15号')));
});

test('点击接收端拒绝跨站、伪造模块及过大请求，按事件去重，不使用客户端用户身份或积分', async () => {
  const f = fixture(), route = load('../app/api/tools/activity/route.ts', { '@/db/mysql-runtime': f.runtime, '@/lib/account-service': { accountUser: async () => ({ id: 42 }) }, '@/lib/tool-analytics': analytics, '@/lib/tool-services': toolServices, '@/lib/image-request': requestHelpers });
  const body = { id: '11111111-1111-4111-8111-111111111111', session: '22222222-2222-4222-8222-222222222222', slug: 'handprint-maker', type: 'entry', module: '', userId: 999, points: 800 };
  for (let i = 0; i < 2; i++) assert.equal((await route.POST(post('/api/tools/activity', body))).status, 204);
  const saved = f.sqlite.prepare('SELECT * FROM tool_activity_events').all(); assert.equal(saved.length, 1); assert.equal(saved[0].user_id, 42); assert.equal(saved[0].session_hash, createHash('sha256').update(body.session).digest('hex'));
  assert.equal((await route.POST(post('/api/tools/activity', body, { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await route.POST(post('/api/tools/activity', { ...body, module: 'fake' }))).status, 400);
  assert.equal((await route.POST(post('/api/tools/activity', { ...body, junk: 'a'.repeat(3000) }))).status, 413);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) total FROM points_ledger').get().total, 0);
  for (let i = 0; i < 58; i++) assert.equal((await route.POST(post('/api/tools/activity', body))).status, 204);
  assert.equal((await route.POST(post('/api/tools/activity', body))).status, 429);
});

test('手印专用积分配置只写该模块，不能连带覆盖签名收费或其他模块；统计接口需要工具管理员', async () => {
  const f = fixture();
  const route = load('../app/api/admin/tool-pricing/route.ts', { '@/db/mysql-runtime': f.runtime, '@/lib/admin-auth': adminAuth(false), '@/lib/points': { validPoints: value => Number.isSafeInteger(value) && value > 0 && value <= 1000000 }, '@/lib/tool-module-pricing': {}, '@/lib/image-tool': imageSpec, '@/lib/image-request': requestHelpers });
  const body = { id: 91, module: 'handprint', chargeType: 'free', pointsCost: 999, overrides: { handprint: 6 } };
  assert.equal((await route.POST(post('/api/admin/tool-pricing', body))).status, 200);
  assert.equal(f.sqlite.prepare('SELECT points_cost FROM tool_module_points').get().points_cost, 6);
  assert.equal(f.sqlite.prepare('SELECT tool_points_cost FROM products WHERE id=91').get().tool_points_cost, 10);
  assert.equal((await route.POST(post('/api/admin/tool-pricing', { ...body, overrides: { handprint: 6, create: 1 } }))).status, 400);
  const denied = load('../app/api/admin/tool-statistics/route.ts', { '@/lib/admin-auth': adminAuth(true), '@/lib/tool-analytics-service': { readToolAnalytics() { throw Error('must not query'); } } });
  assert.equal((await denied.GET(new Request('http://localhost/api/admin/tool-statistics'))).status, 403);
});

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
test('管理界面显示手印、上下移动与全量排序保存，手印价格按钮仅打开其专用配置，统计有独立Tab', async () => {
  const slots = [], requests = []; let cursor = 0, tree;
  const hooks = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; }, useEffect() {}, useCallback: fn => fn };
  function Prices() {}
  const f = fixture(), tools = entries.toolEntryRows(rows, [], 7);
  const component = load('../components/admin-tool-management.tsx', { react: hooks, 'next/image': () => null, 'next/link': () => null, '../lib/tool-services': toolServices, './admin-tool-payment': { ToolPaymentConfig() {} }, './tool-points-editor': { ToolPointsEditor: Prices }, './admin-tool-statistics': { ToolStatistics() {} } }, {
    fetch: async (url, options) => { if (options?.method === 'POST') { requests.push(JSON.parse(options.body)); return f.entryRoute().POST(post(url, requests.at(-1))); } return f.entryRoute().GET(new Request('http://localhost' + url)); },
  });
  function render() { cursor = 0; tree = component.ToolManagement({ onCreateClose() {} }); }
  render(); slots[0] = tools; slots[1] = false; render();
  let all = nodes(tree); assert.ok(all.some(node => node.props.id === 'tools-stats-tab'));
  all.find(node => node.props['aria-label'] === '上移手印制作').props.onClick(); render();
  nodes(tree).find(node => node.props.id === 'tools-stats-tab').props.onClick(); render();
  assert.equal(nodes(tree).find(node => node.props.id === 'tools-list-panel').props.hidden, true);
  assert.equal(nodes(tree).find(node => node.props.id === 'tools-stats-tab').props.className, 'active');
  assert.ok(nodes(tree).some(node => node.props.id === 'tools-stats-panel'));
  nodes(tree).find(node => node.props.id === 'tools-list-tab').props.onClick(); render();
  assert.equal(nodes(tree).find(node => node.props.id === 'tools-list-panel').props.hidden, false);
  all = nodes(tree); const table = all.find(node => node.type === 'tbody');
  assert.equal(nodes(table).filter(node => node.type === 'tr')[1].key, 'handprint-maker');
  const hp = nodes(table).find(node => node.type === 'tr' && node.key === 'handprint-maker');
  nodes(hp).find(node => node.type === 'button' && node.props.children === '积分配置').props.onClick(); render();
  assert.equal(nodes(tree).find(node => node.type === Prices).props.moduleKey, 'handprint');
  await nodes(tree).find(node => node.type === 'button' && node.props.children === '保存排序').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(requests.length, 1); assert.equal(requests[0].entries.length, 6);
});

test('点击采集不拦截原生导航；记录访问、入口及实际功能选择，忽略已选项和管理端', async () => {
  const sent = [], listeners = new Map(); let path = '/tools/handprint-maker.html', clean;
  class Target { constructor(dataset, active = false) { this.dataset = dataset; this.active = active; } closest() { return this; } matches() { return false; } getAttribute(name) { return name === 'aria-pressed' && this.active ? 'true' : null; } }
  const lastView = { current: '' };
  const component = load('../components/tool-activity.tsx', { react: { useRef: () => lastView, useEffect(fn) { clean = fn(); } }, 'next/navigation': { usePathname: () => path }, '../lib/tool-analytics': analytics }, {
    Element: Target, crypto: require('node:crypto').webcrypto, sessionStorage: { getItem() { return null; }, setItem() {} },
    document: { addEventListener(type, fn, capture) { assert.equal(capture, true); listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } },
    fetch: async (url, options) => { assert.equal(options.keepalive, true); sent.push(JSON.parse(options.body)); return new Response('', { status: 503 }); },
  });
  component.ToolActivity(); assert.equal(sent[0].type, 'view');
  listeners.get('click')({ type: 'click', target: new Target({ toolEntry: 'stamp-maker' }) });
  listeners.get('click')({ type: 'click', target: new Target({ toolSlug: 'image-processor', toolModule: 'compress' }) });
  listeners.get('click')({ type: 'click', target: new Target({ toolSlug: 'image-processor', toolModule: 'compress' }, true) });
  assert.deepEqual(sent.map(row => row.type), ['view', 'entry', 'module']); clean(); assert.equal(listeners.size, 0);
  assert.equal(sent[1].module, 'make', 'entry clicks belong to the initial feature of the destination');
  component.ToolActivity(); assert.equal(sent.length, 3, 'effect remount must not duplicate the same page view'); clean();
  path = '/admin'; component.ToolActivity(); assert.equal(sent.length, 3);
});
