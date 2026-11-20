import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildPageMetadata, buildToolMetadata, pageSeoProfiles, requiredSeoKeywords, seoDescription } from '../lib/page-seo.ts';

function verifyTerms(metadata) {
  for (const term of requiredSeoKeywords) {
    assert.equal(metadata.keywords.filter(keyword => keyword === term).length, 1);
    assert.ok(metadata.description.includes(term), `${metadata.title}: ${term}`);
    assert.ok(metadata.openGraph.description.includes(term));
    assert.ok(metadata.twitter.description.includes(term));
  }
}

test('全部页面文案在中英文环境包含四个固定中文词，各页描述与标题有区别', () => {
  for (const locale of ['zh-CN', 'en']) {
    const titles = new Set(), descriptions = new Set();
    for (const page of Object.keys(pageSeoProfiles)) {
      const metadata = buildPageMetadata(page, { locale });
      verifyTerms(metadata);
      assert.ok(!titles.has(metadata.title), page); titles.add(metadata.title);
      assert.ok(!descriptions.has(metadata.description), page); descriptions.add(metadata.description);
      assert.equal(metadata.openGraph.title, metadata.title);
      assert.equal(metadata.twitter.description, metadata.description);
      assert.equal(metadata.openGraph.locale, locale === 'en' ? 'en_US' : 'zh_CN');
      if (locale === 'en') assert.match(metadata.title, /Yuxing Maitong/);
    }
  }
});

test('账户、订单、后台及预览工作台保留禁止收录，公开页面不继承首页canonical', () => {
  for (const [page, profile] of Object.entries(pageSeoProfiles)) {
    const metadata = buildPageMetadata(page, { origin: 'https://example.org/' });
    assert.equal(metadata.robots.index, !profile.private);
    if (profile.private) assert.equal(metadata.alternates.canonical, null);
    if (profile.path) assert.equal(metadata.alternates.canonical, new URL(profile.path, 'https://example.org').href);
  }
  assert.equal(buildPageMetadata('aiLeadsWorkspace').robots.follow, true);
  assert.equal(buildPageMetadata('admin').robots.follow, false);
});

test('后台自定义描述、超长富文本与已有固定词均补齐，重复处理不叠加', () => {
  for (const locale of ['zh-CN', 'en']) {
    const description = seoDescription(`<p>独立描述 & 公司资料 宇星脉通</p>\n${'说明'.repeat(600)}`, locale);
    assert.doesNotMatch(description, /<[^>]+>|\n/);
    assert.ok(description.length < 360);
    for (const term of requiredSeoKeywords) assert.ok(description.includes(term));
    assert.equal(seoDescription(description, locale), description);
    assert.equal(seoDescription(requiredSeoKeywords.join('、'), locale), requiredSeoKeywords.join('、'));
  }
});

const tool = { slug: 'sample-tool', name: '后台新增工具', description: '数据库公开介绍', detail: '使用说明', logo: '', seoTitle: '', seoDescription: '' };
test('每种内置工具及站长别名输出对应功能文案，新增工具和后台覆盖继续可用', () => {
  const tools = { 'c-drive-cleaner': 'C盘', 'document-signature': 'DOCX', 'stamp-maker': '4096', 'handprint-maker': '裂纹', 'video-extractor': 'B站', 'image-processor': '图片压缩', 'webmaster-tools': '关键词', 'yxstar-site-tool': '关键词' };
  for (const [slug, detail] of Object.entries(tools)) {
    const metadata = buildToolMetadata({ ...tool, slug });
    verifyTerms(metadata); assert.ok(metadata.description.includes(detail));
    assert.equal(metadata.alternates.canonical, `https://www.yxstar.shop/tools/${slug}.html`);
    verifyTerms(buildToolMetadata({ ...tool, slug }, { locale: 'en' }));
  }
  const custom = buildToolMetadata({ ...tool, seoTitle: '后台独立标题', seoDescription: '<p>后台独立描述</p>' });
  assert.equal(custom.title, '后台独立标题'); assert.match(custom.description, /^后台独立描述。/); verifyTerms(custom);
  const generic = buildToolMetadata(tool); assert.ok(generic.description.includes(tool.description)); assert.ok(generic.keywords.includes(tool.name)); verifyTerms(generic);
  assert.equal(buildToolMetadata({ ...tool, slug: 'ai-leads' }).alternates.canonical, 'https://www.yxstar.shop/ai-leads');
});

const require = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, console: { error() {} }, ...globals, require(name) { if (name in mocks) return mocks[name]; if (name === 'react/jsx-runtime') return require(name); throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const i18n = { getI18n: async () => ({ locale: 'zh-CN', t: value => value }) };
const seo = { getPageMetadata: async (page, options) => buildPageMetadata(page, options) };

test('商品详情SEO使用已发布数据库商品，不依赖旧种子ID；失败时不泄露或收录', async () => {
  let value = { id: 900, name: '数据库新商品', desc: '后台新描述', category: '数字服务', subcategory: '会员', coverImage: '/product.png' }, calls = 0;
  const page = load('../app/product/[id]/layout.tsx', { '@/lib/i18n-server': i18n, '@/lib/page-seo-server': seo, '@/lib/product-data': { getPublishedProduct: async id => { calls++; assert.equal(id, 900); if (value instanceof Error) throw value; return value; } } });
  const metadata = await page.generateMetadata({ params: Promise.resolve({ id: '900' }) });
  verifyTerms(metadata); assert.ok(metadata.title.startsWith('数据库新商品')); assert.ok(metadata.description.startsWith('数据库新商品: 后台新描述')); assert.match(metadata.alternates.canonical, /\/product\/900$/);
  assert.equal((await page.generateMetadata({ params: Promise.resolve({ id: 'bad' }) })).robots.index, false); assert.equal(calls, 1);
  value = null; assert.equal((await page.generateMetadata({ params: Promise.resolve({ id: '900' }) })).robots.index, false);
  value = new Error('private database error'); const failure = await page.generateMetadata({ params: Promise.resolve({ id: '900' }) });
  verifyTerms(failure); assert.equal(failure.robots.index, false); assert.ok(!JSON.stringify(failure).includes('private database error'));
});

test('服务详情SEO随发布资料更新，并为不存在或读取失败的服务保留noindex', async () => {
  let service = { slug: 'new-service', title: '后台新增技术服务', summary: '远程与上门支持' };
  const page = load('../app/service/[slug]/layout.tsx', { '@/lib/i18n-server': i18n, '@/lib/page-seo-server': seo, '@/lib/technical-service-data': { getPublishedServiceSummary: async slug => { assert.equal(slug, 'new-service'); if (service instanceof Error) throw service; return service; } } });
  const params = Promise.resolve({ slug: 'new-service' });
  const metadata = await page.generateMetadata({ params }); verifyTerms(metadata); assert.ok(metadata.description.includes(service.summary)); assert.match(metadata.alternates.canonical, /\/service\/new-service$/);
  service = null; assert.equal((await page.generateMetadata({ params })).robots.index, false);
  service = new Error('unavailable'); assert.equal((await page.generateMetadata({ params })).robots.index, false);
});

test('公开详情读取仅查询有效商品/服务/技术人员，旧服务表缺失才使用原有兼容资料', async () => {
  const queries = []; let error = null, row = null;
  const runtime = { env: { DB: { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { queries.push({ sql, args }); if (error) throw error; return row; }, async all() { queries.push({ sql, args }); if (error) throw error; return { results: row ? [row] : [] }; } }; } } } };
  const product = load('../lib/product-data.ts', { '@/db/mysql-runtime': runtime });
  assert.equal(await product.getPublishedProduct(0), null); assert.equal(queries.length, 0);
  row = { id: 900, name: '新商品', product_type: 'points', cost_price: 1 }; assert.equal(await product.getPublishedProduct(900), null);
  row.product_type = 'digital'; const published = await product.getPublishedProduct(900); assert.equal(published.name, row.name); assert.equal('cost_price' in published, false);
  assert.match(queries[0].sql, /status='active' AND id=\? LIMIT 1/);
  let now = 0;
  const data = load('../lib/technical-service-data.ts', { '@/db/mysql-runtime': runtime, './technical-services': { technicalServices: [{ slug: 'old-service', title: '旧库服务', summary: '兼容介绍' }] } }, { Date: { now: () => now } });
  row = { slug: 'new-service', title: '已发布服务', summary: '介绍' }; assert.equal((await data.getPublishedServiceSummary('new-service')).title, row.title);
  assert.match(queries.at(-1).sql, /s.status='active' AND p.status='active'/);
  const count = queries.length; assert.equal(await data.getPublishedServiceSummary("bad' OR 1=1"), null); assert.equal(queries.length, count);
  now += 5001; error = Object.assign(new Error('legacy table missing'), { code: 'ER_NO_SUCH_TABLE' }); assert.equal((await data.getPublishedServiceSummary('old-service')).title, '旧库服务');
  now += 5001; error = new Error('connection refused'); await assert.rejects(data.getPublishedServiceSummary('old-service'), /connection refused/);
  assert.ok(queries.every(query => query.sql.startsWith('SELECT ')));
});

test('每个实际页面都由自身或最近布局提供SEO入口，只有首页继承根默认', () => {
  const app = new URL('../app/', import.meta.url);
  function walk(dir, ancestors) {
    const layout = new URL('layout.tsx', dir), chain = existsSync(layout) ? [...ancestors, layout] : ancestors;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'api') walk(new URL(`${entry.name}/`, dir), chain);
      if (entry.name !== 'page.tsx') continue;
      const file = new URL(entry.name, dir), page = readFileSync(file, 'utf8');
      const candidates = [page, ...chain.filter(item => dir.href === app.href || item.href !== new URL('layout.tsx', app).href).map(item => readFileSync(item, 'utf8'))];
      assert.ok(candidates.some(source => /export (?:async function generateMetadata|const metadata)/.test(source)), file.href);
    }
  }
  walk(app, []);
});
