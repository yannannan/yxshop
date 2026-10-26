import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';

const execute = promisify(execFile);
const entry = new URL('../dist/server/index.js', import.meta.url);
const buildRoot = new URL('../dist/server/', import.meta.url).href;
const dependencies = Object.keys(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies);
const loader = `
import { isBuiltin } from 'node:module';
let options;
export function initialize(data) { options = data; }
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(options.buildRoot) && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':') && !isBuiltin(specifier)) {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    // 模拟 pnpm 的直接依赖边界，不能借用本机 npm 提升的间接依赖。
    if (!options.dependencies.includes(name) || name === options.denied) {
      const error = new Error('Missing production dependency: ' + name);
      error.code = 'ERR_MODULE_NOT_FOUND';
      throw error;
    }
  }
  return nextResolve(specifier, context);
}
`;

async function renderPages(paths, denied = '') {
  const code = `
import { register, createRequire } from 'node:module';
process.env.NODE_ENV = 'production';
register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, {
  data: ${JSON.stringify({ buildRoot, dependencies, denied })},
});
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const rows = [
  { id: 35, name: '链接视频提取工具', tool_slug: 'video-extractor' },
  { id: 37, name: '印章在线制作', tool_slug: 'stamp-maker' },
  { id: 50, name: '站长分析工具', tool_slug: 'webmaster-tools' },
].map(row => ({ ...row, description: '公开工具介绍', detail: '使用说明', tool_charge_type: 'free', entry_configured: 1, updated_at: '2026-10-24T00:00:00Z' }));
let queries = 0;
// 只允许页面读取模拟的公开工具数据；没有真实连接或写业务数据库。
mysql.createPool = () => ({ async execute(sql, values = []) {
  if (sql.startsWith('SELECT ') && sql.includes('FROM site_analysis_integrations i')) { queries++; return [[{ site_id: '22222222-2222-4222-8222-222222222222', script_token: 'a'.repeat(64), user_id: 1, verified_at: '2026-10-26', host: 'example.org' }]]; }
  if (!sql.startsWith('SELECT ') || !sql.includes("FROM products WHERE product_type='tool' AND status='active'")) throw new Error('Unexpected database operation in page test');
  queries++;
  return [values.length ? rows.filter(row => row.tool_slug === values[0]) : rows];
} });
Object.assign(process.env, { MYSQL_HOST: 'test.invalid', MYSQL_USER: 'test', MYSQL_PASSWORD: 'test', MYSQL_DATABASE: 'test' });
const errors = [], ssr = require('react-dom/server.edge'), render = ssr.renderToReadableStream;
ssr.renderToReadableStream = (tree, options = {}) => render(tree, {
  ...options,
  onError(error) { errors.push(String(error)); return options.onError?.(error); },
});
const module = await import(${JSON.stringify(entry.href)});
const handler = typeof module.default === 'function' ? module.default : module.default.fetch.bind(module.default);
const pages = [];
for (const spec of ${JSON.stringify(paths)}) {
  const path = typeof spec === 'string' ? spec : spec.path;
  const response = await handler(new Request('http://localhost:3000' + path, { method: typeof spec === 'object' ? spec.method || 'GET' : 'GET', headers: typeof spec === 'object' ? { cookie: 'yxshop_locale=' + (spec.locale || 'zh-CN') } : {} }));
  const html = await response.text();
  pages.push({ path, script: (path.startsWith('/api/site-tracker/') || path.startsWith('/s/')) && response.status === 200 ? html : undefined, status: response.status, failed: html.includes('This page couldn'), hasBrand: html.includes('宇星脉通'), hasVideoForm: html.includes('粘贴视频链接'), hasStampPreview: html.includes('效果预览'), language: /<html[^>]*lang="([^"]+)"/.exec(html)?.[1], englishNav: html.includes('AI Digital Services'), englishPoints: html.includes('One balance. Many possibilities.'), englishStamp: html.includes('Design Your Stamp'), englishVideo: html.includes('Paste a Video Link'), chineseAdmin: html.includes('正在验证管理权限') });
}
console.log(JSON.stringify({ pages, errors, queries }));
`;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code], { timeout: 30000, windowsHide: true, maxBuffer: 1000000 });
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

const needsBuild = !existsSync(entry) ? '请先执行 pnpm build 生成生产包' : false;

test('生产长短接入脚本可独立运行并去重，不依赖构建闭包、商城登录或内部HTTP地址', { skip: needsBuild }, async () => {
  const paths=['/s/IiIiIiIiQiKCIiIiIiIiIg','/api/site-tracker/'+'a'.repeat(64)],result=await renderPages(paths);
  assert.deepEqual(result.pages.map(page=>page.status),[200,200]);assert.deepEqual(result.errors,[]);
  const sent=[],storage=new Map(),origin='https://www.yxstar.shop',document={currentScript:{src:origin+paths[0]},referrer:'https://www.google.com/'};
  const context={window:{addEventListener(){},dispatchEvent(){}},document,navigator:{doNotTrack:'0'},history:{pushState(){},replaceState(){}},location:new URL('https://example.org/?secret=hidden#private'),URL,URLSearchParams,Math,Date,Number,Event,crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},fetch:async(endpoint,options)=>{sent.push({endpoint,body:JSON.parse(options.body),options});}};
  for(let index=0;index<paths.length;index++){document.currentScript.src=origin+paths[index];vm.runInNewContext(result.pages[index].script,context);}
  assert.equal(sent.length,1);assert.equal(sent[0].endpoint,origin+paths[0]);assert.equal(sent[0].body.page,'https://example.org/');assert.equal(sent[0].options.credentials,'omit');
});

test('生产包在严格依赖边界下渲染首页、目录和匿名工具页，无端口、无登录和真实数据库', { skip: needsBuild }, async () => {
  const result = await renderPages(['/', '/orders', '/points', '/addresses', '/product/1', '/checkout/test-order', '/account', '/account/profile', '/account/orders', '/account/activity', '/ai-leads', '/ai-operations', '/tools', '/tools/video-extractor.html', '/tools/stamp-maker.html']);
  assert.deepEqual(result.errors, []);
  for (const page of result.pages) {
    assert.equal(page.status, 200, JSON.stringify({ page, errors: result.errors }));
    assert.equal(page.failed, false); assert.equal(page.hasBrand, true);
  }
  assert.equal(result.pages.find(page => page.path.includes('video-extractor')).hasVideoForm, true);
  assert.equal(result.pages.find(page => page.path.includes('stamp-maker')).hasStampPreview, true);
  assert.ok(result.queries > 0);
});

test('严格解析拦截缺失 ipaddr.js，真实生产渲染重现页面 500，不被本机提升依赖掩盖', { skip: needsBuild }, async () => {
  const result = await renderPages(['/'], 'ipaddr.js');
  assert.equal(result.pages[0].status, 500); assert.equal(result.pages[0].failed, true);
  assert.ok(result.errors.some(error => error.includes('ipaddr.js')), JSON.stringify(result));
});

test('生产云视频下载路由可在严格依赖下加载官方 OSS SDK，匿名请求返回 401', { skip: needsBuild }, async () => {
  const result = await renderPages(['/api/tools/video-extractor/download?id=11111111-1111-4111-8111-111111111111']);
  assert.equal(result.pages[0].status, 401); assert.equal(result.pages[0].failed, false); assert.deepEqual(result.errors, []);
});

test('生产个人中心 API 匿名不读取业务数据，记录与头像必须登录', { skip: needsBuild }, async () => {
  const result = await renderPages(['/api/account', '/api/account/records?kind=orders&userId=2', '/api/account/avatar?userId=2']);
  assert.deepEqual(result.pages.map(page => page.status), [200, 401, 401]);
  assert.deepEqual(result.errors, []); assert.equal(result.queries, 0);
});

test('同一生产处理器按语言 Cookie 渲染英文前台，非法偏好回退中文，管理端保持中文', { skip: needsBuild }, async () => {
  const result = await renderPages([
    { path: '/', locale: 'en' }, { path: '/points', locale: 'en' }, { path: '/tools/stamp-maker.html', locale: 'en' }, { path: '/tools/video-extractor.html', locale: 'en' },
    { path: '/admin', locale: 'en' }, { path: '/', locale: 'zh-CN' }, { path: '/', locale: 'invalid' },
  ]);
  assert.deepEqual(result.errors, []);
  for (const page of result.pages) assert.equal(page.status, 200, JSON.stringify(page));
  assert.equal(result.pages[0].language, 'en'); assert.equal(result.pages[0].englishNav, true);
  assert.equal(result.pages[1].englishPoints, true); assert.equal(result.pages[2].englishStamp, true); assert.equal(result.pages[3].englishVideo, true);
  assert.equal(result.pages[4].chineseAdmin, true); assert.equal(result.pages[4].englishNav, false);
  for (const page of result.pages.slice(5)) { assert.equal(page.language, 'zh-CN'); assert.equal(page.englishNav, false); }
});

test('综合看板生产页面可中英文匿名渲染，个人分析接口不接受匿名写入，无端口和真实数据库', { skip: needsBuild }, async () => {
  const result = await renderPages([{ path: '/tools/webmaster-tools.html', locale: 'zh-CN' }, { path: '/tools/webmaster-tools.html', locale: 'en' }, '/api/tools/site-analysis?tool=50', { path: '/api/tools/site-analysis', method: 'POST' }]);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.pages.map(p => p.status), [200,200,200,401]);
  assert.equal(result.pages[1].englishNav, true); assert.equal(result.pages[0].failed, false); assert.equal(result.pages[1].failed, false);
});
