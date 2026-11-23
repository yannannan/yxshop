import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as tools from '../lib/tool-services.ts';
import * as display from '../lib/homepage-display.ts';

const require = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, Response, setTimeout, clearTimeout, console: { error() {} }, ...globals,
    require(name) { if (name in mocks) return mocks[name]; if (['react', 'react/jsx-runtime'].includes(name)) return require(name); throw Error(`Unexpected import ${name}`); },
  });
  return exports;
}
const owner = { id: 91, name: '文件签名', tool_slug: 'document-signature', tool_charge_type: 'points', tool_points_cost: 10 };

test('工具与入口配置并行读取，手印仍沿用真实模块价格且不改变排序/隐藏配置', async () => {
  const calls = []; let resolveProducts, resolveSettings;
  const products = new Promise(resolve => { resolveProducts = resolve; });
  const settings = new Promise(resolve => { resolveSettings = resolve; });
  const data = load('../lib/tool-service-data.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { assert.ok(sql.startsWith('SELECT ')); return { all() { calls.push('products'); return products; } }; } } } },
    './tool-services': tools,
    './tool-entry-settings': { readToolEntrySettings() { calls.push('settings'); return settings; } },
    './tool-module-pricing': { async readModulePrices(id, slug) { calls.push('module'); assert.equal(id, 91); assert.equal(slug, 'document-signature'); return { handprint: 7 }; } },
    './tool-entries': { publicToolOrder(list, config) { assert.equal(config[0].tool_slug, 'ai-leads'); return list; } },
  });
  const pending = data.getPublishedTools(); assert.deepEqual(calls, ['products', 'settings']);
  resolveSettings({ ready: true, settings: [{ tool_slug: 'ai-leads', enabled: 1 }] }); resolveProducts({ results: [owner] });
  const result = await pending;
  assert.deepEqual(calls, ['products', 'settings', 'module']); assert.equal(result.find(tool => tool.slug === 'handprint-maker').pointsCost, 7);
});

function pageFixture({ toolsRequest = async () => [tools.aiLeadsPreviewTool], configRequest = async () => display.defaultHomepageDisplay(), globals = {} } = {}) {
  let toolCalls = 0;
  const page = load('../app/page.tsx', {
    '@/components/storefront-page': { default: () => null }, '@/lib/tool-service-data': { getPublishedTools() { toolCalls++; return toolsRequest(); } },
    '@/lib/homepage-display-data': { getHomepageDisplay: configRequest }, '@/lib/homepage-display': display,
  }, globals);
  return { page, get toolCalls() { return toolCalls; } };
}

test('首页首屏带真实工具和配置，上门频道不会为了隐藏工具而查询数据库', async () => {
  const f = pageFixture();
  const tree = await f.page.default({ searchParams: Promise.resolve({}) });
  assert.equal(tree.props.initialTools[0].slug, 'ai-leads'); assert.equal(tree.props.initialToolsError, ''); assert.equal(tree.props.initialChannel, 'mall');
  const technical = await f.page.default({ searchParams: Promise.resolve({ channel: 'technical' }) });
  assert.equal(technical.props.initialChannel, 'technical'); assert.equal(technical.props.initialTools, null); assert.equal(f.toolCalls, 1);
});

test('服务端工具/配置超时不拖住整页，晚到的数据不回写已经返回的首屏', async () => {
  const timers = new Map(); let next = 0, resolveTools;
  const f = pageFixture({ toolsRequest: () => new Promise(resolve => { resolveTools = resolve; }), configRequest: () => new Promise(() => {}), globals: {
    setTimeout(fn, delay) { assert.equal(delay, 3000); timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); },
  } });
  const pending = f.page.default({ searchParams: Promise.resolve({}) }); await new Promise(resolve => setImmediate(resolve));
  for (const timer of [...timers.values()]) timer();
  const tree = await pending; assert.equal(tree.props.initialTools, null); assert.match(tree.props.initialToolsError, /超时/); assert.equal(tree.props.initialConfig.mode, display.defaultHomepageDisplay().mode);
  resolveTools([tools.aiLeadsPreviewTool]); await new Promise(resolve => setImmediate(resolve)); assert.equal(tree.props.initialTools, null); assert.equal(timers.size, 0);
});

test('工具查询异常显示可重试错误，配置异常回退布局，均不伪装为零个工具', async () => {
  const f = pageFixture({ toolsRequest: async () => { throw Error('private connection data'); }, configRequest: async () => { throw Error('config unavailable'); } });
  const tree = await f.page.default({ searchParams: Promise.resolve({}) });
  assert.equal(tree.props.initialTools, null); assert.match(tree.props.initialToolsError, /暂不可用/); assert.ok(!JSON.stringify(tree.props).includes('private connection data')); assert.ok(tree.props.initialConfig);
});

test('工具接口输出服务端耗时，成功和失败均不缓存并保留既有公开响应格式', async () => {
  let fail = false;
  const api = load('../app/api/tools/route.ts', { '@/lib/tool-service-data': { async getPublishedTools() { if (fail) throw Error('private data'); return [tools.aiLeadsPreviewTool]; } } });
  let response = await api.GET(); assert.equal(response.status, 200); assert.equal((await response.json()).length, 1); assert.match(response.headers.get('server-timing'), /^tools;dur=\d+$/); assert.equal(response.headers.get('cache-control'), 'no-store');
  fail = true; response = await api.GET(); assert.equal(response.status, 503); assert.match(response.headers.get('server-timing'), /^tools;dur=\d+$/); assert.ok(!(await response.text()).includes('private data'));
});
