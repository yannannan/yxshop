import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
].map(row => ({ ...row, description: '公开工具介绍', detail: '使用说明', tool_charge_type: 'free', entry_configured: 1, updated_at: '2026-10-24T00:00:00Z' }));
let queries = 0;
// 只允许页面读取模拟的公开工具数据；没有真实连接或写业务数据库。
mysql.createPool = () => ({ async execute(sql, values = []) {
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
for (const path of ${JSON.stringify(paths)}) {
  const response = await handler(new Request('http://localhost:3000' + path));
  const html = await response.text();
  pages.push({ path, status: response.status, failed: html.includes('This page couldn'), hasBrand: html.includes('宇星商城'), hasVideoForm: html.includes('粘贴视频链接'), hasStampPreview: html.includes('效果预览') });
}
console.log(JSON.stringify({ pages, errors, queries }));
`;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code], { timeout: 30000, windowsHide: true, maxBuffer: 1000000 });
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

const needsBuild = !existsSync(entry) ? '请先执行 pnpm build 生成生产包' : false;

test('生产包在严格依赖边界下渲染首页、目录和匿名工具页，无端口、无登录和真实数据库', { skip: needsBuild }, async () => {
  const result = await renderPages(['/', '/orders', '/points', '/tools', '/tools/video-extractor.html', '/tools/stamp-maker.html']);
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
