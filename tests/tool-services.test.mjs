import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as helpers from '../lib/tool-services.ts';

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Response, URL, crypto: webcrypto, console: { error() {} }, require(name) { if (name in mocks) return mocks[name]; if (['react', 'react/jsx-runtime'].includes(name)) return require(name); throw new Error(`Unexpected module: ${name}`); } });
  return exports;
}

function admin({ denied = false, duplicate = false, previous = null } = {}) {
  const writes = [], payments = [];
  const DB = { prepare(sql) { let values = []; return {
    bind(...args) { values = args; return this; },
    async first() {
      if (sql.startsWith('SELECT COALESCE')) return { sort_order: 12 };
      if (sql.startsWith('SELECT id FROM products WHERE tool_slug')) return duplicate ? { id: 9 } : null;
      if (sql.includes('SELECT id,tool_slug')) return previous;
      return null;
    },
    async run() { assert.equal((sql.match(/\?/g) || []).length, values.length, 'SQL 参数数量应匹配'); writes.push({ sql, values }); return { meta: { last_row_id: 101, changes: 1 } }; },
    async all() { return { results: [] }; },
  }; } };
  const route = load('../app/api/admin/tools/route.ts', {
    '@/db/mysql-runtime': { env: { DB } }, '@/db/setup': { ensurePaymentQrRecords: async (...args) => payments.push(args) },
    '@/lib/admin-auth': { getAdminContext: async () => denied ? null : {}, hasAdminPermission: () => !denied, adminDenied: () => Response.json({ message: '无权限' }, { status: 403 }) },
    '@/lib/tool-services': helpers,
  });
  return { writes, payments, save: body => route.POST(new Request('http://localhost/api/admin/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', name: '工具测试', slug: 'sample-tool', chargeType: 'free', ...body }) })) };
}

test('工具入口链接只接受站内路径及 http/https，拒绝脚本与协议相对地址', () => {
  for (const value of ['', '/utilities/sign.html', 'https://example.com/tool', 'http://localhost:3000/tool']) assert.equal(helpers.isToolEntryUrl(value), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.com', '/\\example.com', 'https://a.com/\nscript']) assert.equal(helpers.isToolEntryUrl(value), false);
});

test('独立页面标识与 .html 路径保持稳定', () => {
  assert.equal(helpers.isToolSlug('c-drive-cleaner'), true);
  for (const slug of ['../admin', '中文', 'tool.html', '-tool', 'a'.repeat(101)]) assert.equal(helpers.isToolSlug(slug), false);
  assert.equal(helpers.toolPagePath('c-drive-cleaner'), '/tools/c-drive-cleaner.html');
});

for (const chargeType of ['free', 'pending', 'paid']) {
  test(`新增${chargeType}工具：保存独立入口字段并按收费方式准备二维码`, async () => {
    const route = admin();
    const response = await route.save({ chargeType, price: '19.90', entryUrl: '', description: '工具简介', logo: '/tool-logos/c-drive-cleaner.svg', status: 'active' });
    assert.equal(response.status, 200);
    const { sql, values } = route.writes[0];
    assert.match(sql, /'tool'/);
    assert.equal(values[4], chargeType === 'paid' ? 19.9 : 0);
    assert.equal(values[5], 'sample-tool');
    assert.equal(values[6], '');
    assert.equal(values.at(-1), 12);
    assert.equal(route.payments.length, chargeType === 'paid' ? 1 : 0);
  });
}

test('收费工具必须有正数价格，不能用错误的收费方式或链接保存', async () => {
  for (const body of [{ chargeType: 'paid', price: 0 }, { chargeType: 'paid', price: -1 }, { chargeType: 'paid', price: 'oops' }, { chargeType: 'unknown' }, { entryUrl: 'javascript:alert(1)' }]) {
    const route = admin(); assert.equal((await route.save(body)).status, 400); assert.equal(route.writes.length, 0);
  }
});

test('无权限、重复页面、修改固定页面标识时拒绝写入', async () => {
  for (const [options, body, status] of [[{ denied: true }, {}, 403], [{ duplicate: true }, {}, 400], [{ previous: { id: 1, tool_slug: 'old-page' } }, { id: 1 }, 400]]) {
    const route = admin(options); assert.equal((await route.save(body)).status, status); assert.equal(route.writes.length, 0);
  }
});

test('已有工具可以修改收费价格和入口，固定页面地址不变', async () => {
  const route = admin({ previous: { id: 1, tool_slug: 'sample-tool' } });
  assert.equal((await route.save({ id: 1, chargeType: 'paid', price: 9.9, entryUrl: 'https://example.com/tool' })).status, 200);
  assert.match(route.writes[0].sql, /^UPDATE products/);
  assert.equal(route.writes[0].values[6], 'https://example.com/tool');
  assert.deepEqual(route.payments, [[1, 9.9]]);
});

function access({ type = 'free', url = 'https://example.com/tool', phone = null, paid = false, exists = true } = {}) {
  const route = load('../app/api/tools/access/route.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { return { bind() { return this; }, async first() { return sql.includes('SELECT o.id') ? (paid ? { id: 'order' } : null) : exists ? { id: 101, tool_url: url, tool_charge_type: type, price: 10 } : null; } }; } } } },
    '@/db/setup': { getVerifiedSessionPhone: () => phone }, '@/lib/tool-services': helpers,
  });
  return route.GET(new Request('http://localhost/api/tools/access?slug=sample-tool'));
}

test('免费工具直接进入；未配置、待确认和停用工具不提供实际链接', async () => {
  assert.equal((await (await access()).json()).entryUrl, 'https://example.com/tool');
  for (const options of [{ url: '' }, { type: 'pending' }, { exists: false }, { url: 'javascript:alert(1)' }]) {
    const response = await access(options); assert.ok(response.status >= 400); assert.equal((await response.json()).entryUrl, undefined);
  }
});

test('收费工具只向已通过支付核验的当前用户返回入口，不泄露给未登录或未付款用户', async () => {
  for (const options of [{ type: 'paid' }, { type: 'paid', phone: '13800000000' }]) {
    const response = await access(options); assert.ok([401, 402].includes(response.status)); const result = await response.json(); assert.equal(result.entryUrl, undefined); assert.equal(result.purchaseUrl, '/product/101');
  }
  const response = await access({ type: 'paid', phone: '13800000000', paid: true });
  assert.equal(response.status, 200); assert.equal((await response.json()).entryUrl, 'https://example.com/tool'); assert.equal(response.headers.get('cache-control'), 'no-store');
});

const tool = helpers.mapTool({ id: 1, name: '独立工具', description: '服务端可读取的工具简介', detail: '具体使用说明', cover_image: '', tool_slug: 'sample-tool', tool_charge_type: 'free', price: 0, entry_configured: 0, tool_url: 'secret', seo_title: '独立 SEO 标题', seo_description: '独立 SEO 描述' });
const data = { getPublishedTool: async slug => slug === 'sample-tool' ? tool : null, getPublishedTools: async () => [tool] };

test('公共工具数据不包含实际入口链接', () => {
  assert.equal('tool_url' in tool, false); assert.equal('entryUrl' in tool, false); assert.equal(JSON.stringify(tool).includes('secret'), false);
});

test('独立 HTML 页面提供服务端正文、标题、描述、canonical 和结构化数据', async () => {
  const page = load('../app/tools/[slug]/page.tsx', {
    '@/lib/tool-service-data': data, '@/lib/tool-services': helpers,
    '@/components/tool-launch': { ToolLaunch: () => React.createElement('button', { disabled: true }, '工具入口待配置') },
    'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
    'next/image': ({ src, alt }) => React.createElement('img', { src, alt }),
    'next/navigation': { notFound() { throw new Error('404'); }, permanentRedirect(url) { throw new Error(`redirect:${url}`); } },
  });
  const params = Promise.resolve({ slug: 'sample-tool.html' });
  const metadata = await page.generateMetadata({ params });
  assert.equal(metadata.title, '独立 SEO 标题'); assert.equal(metadata.description, '独立 SEO 描述'); assert.equal(metadata.alternates.canonical, `${helpers.siteOrigin()}/tools/sample-tool.html`);
  const html = renderToStaticMarkup(await page.default({ params }));
  for (const text of ['独立工具', '服务端可读取的工具简介', '具体使用说明', 'application/ld+json', '工具入口待配置']) assert.ok(html.includes(text));
  assert.ok(!html.includes('secret'));
  await assert.rejects(page.default({ params: Promise.resolve({ slug: 'sample-tool' }) }), /redirect:\/tools\/sample-tool.html/);
  const missing = await page.generateMetadata({ params: Promise.resolve({ slug: 'missing.html' }) }); assert.equal(missing.robots.index, false);
});

test('sitemap 与 robots 路由包含独立工具页面并返回正确类型', async () => {
  const sitemap = load('../app/sitemap.xml/route.ts', { '@/lib/tool-service-data': data, '@/lib/tool-services': helpers });
  const response = await sitemap.GET(); assert.match(response.headers.get('content-type'), /application\/xml/); assert.ok((await response.text()).includes('/tools/sample-tool.html'));
  const robots = load('../app/robots.txt/route.ts', { '@/lib/tool-services': helpers });
  const text = await robots.GET().text(); assert.ok(text.includes('Sitemap:')); assert.ok(text.includes('/sitemap.xml')); assert.ok(text.includes('Disallow: /api/'));
});

test('工具目录渲染入口导航卡片，不渲染普通商品的下单卡片', () => {
  const directory = load('../components/tool-directory.tsx', {
    '../lib/tool-services': helpers,
    'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
    'next/image': ({ src, alt }) => React.createElement('img', { src, alt }),
  });
  const html = renderToStaticMarkup(React.createElement(directory.ToolDirectory, { tools: [tool] }));
  assert.ok(html.includes('tool-entry-card')); assert.ok(html.includes('/tools/sample-tool.html'));
  assert.ok(html.includes('入口待配置')); assert.ok(!html.includes('立即下单')); assert.ok(!html.includes('product-card'));
});

test('商城订单仅允许购买已配置入口的收费工具，金额以服务端配置为准', async () => {
  for (const entry of [{ charge: 'free', url: '/tool' }, { charge: 'pending', url: '/tool' }, { charge: 'paid', url: '' }, { charge: 'paid', url: '/tool' }]) {
    const writes = [];
    const route = load('../app/api/orders/route.ts', {
      '@/db/mysql-runtime': { env: { DB: { prepare(sql) { let values = []; return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes('FROM users WHERE phone')) return { id: 1 };
          if (sql.includes('FROM products WHERE id')) return { id: 101, name: '收费工具', category: '工具服务', price: 19.9, product_type: 'tool', tool_charge_type: entry.charge, tool_url: entry.url };
          if (sql.includes('SELECT email FROM users')) return { email: 'test@example.com' };
          return null;
        },
        async run() { writes.push(values); return { meta: { last_row_id: 1 } }; },
      }; } } } },
      '../../../db/setup': { ensureDatabase: async () => {}, getSessionPhone: () => '13800000000' },
      '../../../lib/order-notifications': { sendOrderNotification: async () => {} },
    });
    const response = await route.POST(new Request('http://localhost/api/orders', { method: 'POST', body: JSON.stringify({ productId: 101, price: 0.01 }) }));
    if (entry.charge === 'paid' && entry.url) { assert.equal(response.status, 200); assert.equal(writes[0][3], 19.9); }
    else { assert.equal(response.status, 400); assert.equal(writes.length, 0); }
  }
});
