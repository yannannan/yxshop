import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as helpers from '../lib/homepage-display.ts';
import * as toolHelpers from '../lib/tool-services.ts';
import * as categoryHelpers from '../lib/categories.ts';
import * as catalogHelpers from '../lib/catalog.ts';
import * as technicalHelpers from '../lib/technical-services.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Response, URL, URLSearchParams, console: { error() {} }, ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return exports;
}

const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
const Image = ({ src, alt }) => React.createElement('img', { src, alt });
const pagination = load('../components/catalog-pagination.tsx', { 'next/link': Link });
const directoryMocks = { '../lib/tool-services': toolHelpers, '../lib/homepage-display': helpers, './catalog-pagination': pagination, 'next/link': Link, 'next/image': Image };
const directory = load('../components/tool-directory.tsx', directoryMocks);
const productCard = load('../components/store-product-card.tsx', { 'next/link': Link, 'next/image': Image, '../lib/catalog': catalogHelpers });
const markup = element => renderToStaticMarkup(element);
const tools = Array.from({ length: 25 }, (_, index) => ({ id: index + 101, name: `工具${index + 1}`, slug: `tool-${index + 1}`, description: '工具介绍', logo: '', chargeType: 'free', entryConfigured: false, price: 0 }));
const products = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, name: `商品${index + 1}`, category: index < 15 ? '会员' : '短信', subcategory: '', desc: '介绍', price: 10, oldPrice: 20, tone: 'blue', initial: 'AI', attributesJson: '[]', billingCycle: 'once' }));
const renderProduct = product => React.createElement('article', { key: product.id, 'data-product': product.id }, product.name);

test('首页配置拒绝错误模式、重复条目、非法 ID 和异常模块键，旧配置安全回退', () => {
  const valid = { mode: 'flat', sectionOrder: ['products', 'tools', 'category:会员'], itemOrder: [12, 1] };
  assert.equal(helpers.validateHomepageDisplay(valid), true);
  assert.deepEqual(helpers.readHomepageDisplay(JSON.stringify(valid)), valid);
  for (const value of [null, {}, { ...valid, mode: 'bad' }, { ...valid, sectionOrder: ['tools', 'tools'] }, { ...valid, sectionOrder: ['category:'] }, { ...valid, sectionOrder: ['admin'] }, { ...valid, itemOrder: [1, 1] }, { ...valid, itemOrder: [0] }, { ...valid, itemOrder: ['1'] }, { ...valid, itemOrder: [1.5] }, { ...valid, itemOrder: [Number.MAX_SAFE_INTEGER + 1] }, { ...valid, itemOrder: Array.from({ length: 10001 }, (_, i) => i + 1) }]) {
    assert.equal(helpers.validateHomepageDisplay(value), false);
    assert.deepEqual(helpers.readHomepageDisplay(value), helpers.defaultHomepageDisplay());
  }
  assert.deepEqual(helpers.readHomepageDisplay('broken JSON'), helpers.defaultHomepageDisplay());
});

test('商品和模块排序保存相对顺序，新建条目稳定追加，不更改输入数据', () => {
  const source = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  assert.deepEqual(helpers.orderItems(source, [3, 99, 1]).map(item => item.id), [3, 1, 2, 4]);
  assert.deepEqual(source.map(item => item.id), [1, 2, 3, 4]);
  const sections = helpers.homepageSections(['会员', '短信', '会员'], 'grouped');
  assert.deepEqual(helpers.orderSections(sections, ['category:短信', 'tools']).map(item => item.key), ['category:短信', 'tools', 'category:会员']);
  assert.deepEqual(helpers.homepageSections(['会员', '短信'], 'flat').map(item => item.key), ['tools', 'products']);
});

for (const size of [6, 12]) test(`每页 ${size} 个：全量翻页无遗漏或重复，越界、非数字及空列表安全处理`, () => {
  const source = Array.from({ length: 31 }, (_, i) => i + 1);
  const pages = Math.ceil(source.length / size);
  assert.deepEqual(Array.from({ length: pages }, (_, i) => helpers.paginate(source, i + 1, size).items).flat(), source);
  for (const invalid of [-1, 0, NaN, Infinity]) assert.equal(helpers.paginate(source, invalid, size).page, 1);
  assert.equal(helpers.paginate(source, 999, size).page, pages);
  assert.equal(helpers.paginate(source, 2.9, size).page, 2);
  assert.deepEqual(helpers.paginate([], 999, size), { page: 1, totalPages: 1, items: [] });
  assert.equal(helpers.paginate(source.slice(0, 2), 4, size).page, 1);
});

function admin({ denied = false, forbidden = false, config = helpers.defaultHomepageDisplay(), missing = false } = {}) {
  const writes = [], reads = [];
  const records = [...products, ...tools].map(item => ({ ...item, product_type: item.slug ? 'tool' : 'digital', status: 'active' }));
  const route = load('../app/api/admin/homepage-display/route.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { reads.push(sql); let values = []; return {
      bind(...args) { values = args; return this; },
      async first() { if (missing) throw { code: 'ER_NO_SUCH_TABLE' }; return { config_json: JSON.stringify(config) }; },
      async all() { return { results: records }; },
      async run() { assert.equal((sql.match(/\?/g) || []).length, values.length); writes.push({ sql, values }); },
    }; } } } },
    '@/lib/admin-auth': { getAdminContext: async () => denied ? null : {}, hasAdminPermission: (_, code) => code === 'homepage-display' && !forbidden, adminDenied: () => Response.json({}, { status: 403 }) },
    '@/lib/homepage-display': helpers,
  });
  return { route, writes, reads, save: config => route.POST(new Request('http://localhost/api/admin/homepage-display', { method: 'POST', body: JSON.stringify(config) })) };
}

test('管理端 GET/POST 均限制首页展示权限，未授权不读写配置表', async () => {
  for (const options of [{ denied: true }, { forbidden: true }]) {
    const setup = admin(options);
    assert.equal((await setup.route.GET(new Request('http://localhost'))).status, 403);
    assert.equal((await setup.save(helpers.defaultHomepageDisplay())).status, 403);
    assert.equal(setup.reads.length, 0);
    assert.equal(setup.writes.length, 0);
  }
});

test('管理端保存模块和条目顺序，GET 过滤已删除 ID，单独保存不改动商品业务表', async () => {
  const config = { mode: 'flat', sectionOrder: ['products', 'tools'], itemOrder: [104, 1, 3] };
  const setup = admin({ config: { ...config, itemOrder: [999, ...config.itemOrder] } });
  const response = await setup.route.GET(new Request('http://localhost'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).config, config);
  assert.equal((await setup.save(config)).status, 200);
  assert.equal(setup.writes.length, 1);
  assert.match(setup.writes[0].sql, /^INSERT INTO homepage_display_settings/);
  assert.deepEqual(JSON.parse(setup.writes[0].values[0]), config);
});

test('错误配置、已删除条目和损坏 JSON 拒绝写入；未迁移时返回明确说明', async () => {
  const setup = admin();
  for (const config of [{ ...helpers.defaultHomepageDisplay(), itemOrder: [999] }, { mode: 'bad' }]) assert.equal((await setup.save(config)).status, 400);
  assert.equal((await setup.route.POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status, 400);
  assert.equal(setup.writes.length, 0);
  const missing = await admin({ missing: true }).route.GET(new Request('http://localhost'));
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).message, /05_homepage_display/);
});

test('配置尚未迁移或损坏时，前台保持默认工具在前的分区展示', async () => {
  for (const row of [null, { config_json: 'broken' }, 'missing']) {
    const data = load('../lib/homepage-display-data.ts', {
      '@/db/mysql-runtime': { env: { DB: { prepare: () => ({ async first() { if (row === 'missing') throw { code: 'ER_NO_SUCH_TABLE' }; return row; } }) } } },
      './homepage-display': helpers,
    });
    assert.deepEqual(await data.getHomepageDisplay(), helpers.defaultHomepageDisplay());
  }
});

test('公开配置接口禁用缓存并返回已保存的排序', async () => {
  const config = { mode: 'flat', sectionOrder: ['products', 'tools'], itemOrder: [2, 1] };
  const route = load('../app/api/homepage-display/route.ts', { '@/lib/homepage-display-data': { getHomepageDisplay: async () => config } });
  const response = await route.GET();
  assert.deepEqual(await response.json(), config);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('首页工具最多 6 个，独立页每页 12 个，末页及空列表显示正确', () => {
  const home = markup(React.createElement(directory.ToolDirectory, { tools }));
  assert.equal((home.match(/class="tool-entry-card"/g) || []).length, 6);
  assert.ok(home.includes('href="/tools"'));
  for (const [page, count] of [[1, 12], [2, 12], [3, 1], [999, 1]]) {
    const html = markup(React.createElement(directory.ToolDirectory, { tools, pageSize: 12, page, moreHref: null }));
    assert.equal((html.match(/class="tool-entry-card"/g) || []).length, count);
    assert.ok(!html.includes('更多工具'));
    if (page === 2) { assert.ok(html.includes('/tools/tool-13.html')); assert.ok(html.includes('href="/tools?page=3"')); assert.ok(!html.includes('/tools/tool-1.html')); }
  }
  const empty = markup(React.createElement(directory.ToolDirectory, { tools: [] }));
  assert.ok(empty.includes('暂无已启用')); assert.ok(!empty.includes('catalog-pagination'));
});

test('按类型展示每区 12 件商品，工具 6 个，自定义模块顺序且更多链接可进入分类', () => {
  const component = load('../components/homepage-catalog.tsx', { 'next/link': Link, '../lib/homepage-display': helpers, './tool-directory': directory, './catalog-pagination': pagination });
  const html = markup(React.createElement(component.HomepageCatalog, { products, tools, settings: { mode: 'grouped', sectionOrder: ['category:短信', 'tools', 'category:会员'], itemOrder: [30, 105, 1] }, query: '商品', loading: false, error: '', renderProduct }));
  assert.equal((html.match(/data-product=/g) || []).length, 24);
  assert.equal((html.match(/class="tool-entry-card"/g) || []).length, 6);
  assert.ok(html.indexOf('data-product="30"') < html.indexOf('tool-entry-grid'));
  assert.ok(html.indexOf('tool-entry-grid') < html.indexOf('data-product="1"'));
  assert.ok(html.includes(`/products?category=${encodeURIComponent('短信')}&amp;q=${encodeURIComponent('商品')}`));
  assert.ok(html.includes('会员分页')); assert.ok(html.includes('短信分页'));
});

test('直接展示共用 12 件商品一页，工具仍独立分页；没有商品时不显示空商品模块', () => {
  const component = load('../components/homepage-catalog.tsx', { 'next/link': Link, '../lib/homepage-display': helpers, './tool-directory': directory, './catalog-pagination': pagination });
  const props = { products, tools, settings: { mode: 'flat', sectionOrder: ['products', 'tools'], itemOrder: [30, 1] }, query: '', loading: false, error: '', renderProduct };
  const html = markup(React.createElement(component.HomepageCatalog, props));
  assert.equal((html.match(/data-product=/g) || []).length, 12);
  assert.ok(html.indexOf('data-product="30"') < html.indexOf('tool-entry-grid'));
  assert.equal((html.match(/class="product-category-section"/g) || []).length, 1);
  const empty = markup(React.createElement(component.HomepageCatalog, { ...props, products: [] }));
  assert.ok(!empty.includes('product-category-section'));
  assert.equal((empty.match(/class="tool-entry-card"/g) || []).length, 6);
});

test('链接分页保留筛选条件，边界按钮不可点击，单页不显示无效翻页', () => {
  const html = markup(React.createElement(pagination.CatalogPagination, { page: 2, totalPages: 3, href: '/products?category=VIP&q=AI' }));
  assert.ok(html.includes('/products?category=VIP&amp;q=AI&amp;page=1'));
  assert.ok(html.includes('/products?category=VIP&amp;q=AI&amp;page=3'));
  const first = markup(React.createElement(pagination.CatalogPagination, { page: 1, totalPages: 2, href: '/tools' }));
  assert.ok(first.includes('aria-disabled="true"')); assert.ok(!first.includes('page=0'));
  assert.equal(markup(React.createElement(pagination.CatalogPagination, { page: 1, totalPages: 1 })), '');
});

test('商品独立目录按后台顺序分页，二三级分类与搜索条件跨页保留', async () => {
  const categories = [{ name: '账号服务', children: [{ name: '会员', children: [{ name: '充值', children: [] }] }] }];
  const fixtures = Array.from({ length: 26 }, (_, i) => ({ ...products[0], id: i + 1, name: `AI商品${i + 1}`, subcategory: '充值' }));
  const page = load('../app/products/page.tsx', {
    'next/link': Link, '@/lib/product-data': { getPublishedProducts: async () => [...fixtures, { ...products[15], id: 99 }], getPublishedCategories: async () => categories },
    '@/lib/homepage-display-data': { getHomepageDisplay: async () => ({ ...helpers.defaultHomepageDisplay(), itemOrder: [26, 1] }) },
    '@/lib/homepage-display': helpers, '@/lib/categories': categoryHelpers,
    '@/components/store-product-card': productCard, '@/components/catalog-pagination': pagination,
  });
  const params = { category: '账号服务', secondary: '会员', third: '充值', q: 'AI', page: '2' };
  const html = markup(await page.default({ searchParams: Promise.resolve(params) }));
  assert.equal((html.match(/class="product-card refined-card"/g) || []).length, 12);
  assert.ok(html.includes('AI商品12')); assert.ok(!html.includes('AI商品26')); assert.ok(!html.includes('href="/product/99"'));
  for (const name of ['category', 'secondary', 'third']) assert.ok(html.includes(`name="${name}"`));
  assert.ok(html.includes(`third=${encodeURIComponent('充值')}&amp;q=AI&amp;page=3`));
  const last = markup(await page.default({ searchParams: Promise.resolve({ ...params, page: '999' }) }));
  assert.equal((last.match(/class="product-card refined-card"/g) || []).length, 2);
});

test('独立工具目录分页使用保存的工具顺序并生成下一页链接', async () => {
  const page = load('../app/tools/page.tsx', {
    'next/link': Link, '@/components/tool-directory': directory, '@/lib/tool-services': toolHelpers, '@/lib/tool-service-data': { getPublishedTools: async () => tools },
    '@/lib/homepage-display': helpers, '@/lib/homepage-display-data': { getHomepageDisplay: async () => ({ ...helpers.defaultHomepageDisplay(), itemOrder: [125, 101] }) },
  });
  const html = markup(await page.default({ searchParams: Promise.resolve({ page: '1' }) }));
  assert.ok(html.indexOf('/tools/tool-25.html') < html.indexOf('/tools/tool-1.html'));
  assert.equal((html.match(/class="tool-entry-card"/g) || []).length, 12);
  assert.ok(html.includes('/tools?page=2'));
});

test('商品目录只读取上架普通商品；分类树包含仅一级或二级分类的节点', async () => {
  const reads = [];
  const data = load('../lib/product-data.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { reads.push(sql); return { async all() { return { results: sql.includes('FROM products') ? products : [{ id: 1, parent_id: null, name: '一级' }, { id: 2, parent_id: 1, name: '二级' }, { id: 3, parent_id: null, name: '仅一级' }] }; } }; } } } },
  });
  assert.equal((await data.getPublishedProducts()).length, 30);
  assert.match(reads[0], /status='active' AND product_type<>'tool'/);
  assert.match(reads[0], /ORDER BY sort_order,id/);
  assert.deepEqual(JSON.parse(JSON.stringify(await data.getPublishedCategories())), [{ name: '一级', children: [{ name: '二级', children: [] }] }, { name: '仅一级', children: [] }]);
});

// 模拟组件状态更新，直接执行事件回调；不启动浏览器或应用服务。
function hookHost(file, name, mocks, globals = {}) {
  const states = [], effects = [];
  let cursor = 0;
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  };
  const component = load(file, { ...mocks, react }, globals)[name];
  return { render(props) { cursor = 0; effects.length = 0; return component(props); }, mountEffects() { effects.forEach(fn => fn()); } };
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  return React.isValidElement(node) ? textOf(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

test('首页工具翻页按钮确实切换到后 6 个工具，数据缩减不会停留在空页', () => {
  const host = hookHost('../components/tool-directory.tsx', 'ToolDirectory', directoryMocks);
  let tree = host.render({ tools });
  elements(tree).find(element => element.type === pagination.CatalogPagination).props.onChange(2);
  let html = markup(host.render({ tools }));
  assert.ok(html.includes('/tools/tool-7.html')); assert.ok(!html.includes('/tools/tool-1.html'));
  assert.equal((html.match(/class="tool-entry-card"/g) || []).length, 6);
  html = markup(host.render({ tools: tools.slice(0, 2) }));
  assert.equal((html.match(/class="tool-entry-card"/g) || []).length, 2);
  assert.ok(html.includes('/tools/tool-1.html'));
});

function storefrontHost() {
  const fixtures = Array.from({ length: 26 }, (_, i) => ({ ...products[0], id: i + 1 }));
  const services = Array.from({ length: 26 }, (_, i) => ({ ...technicalHelpers.technicalServices[0], slug: `service-${i + 1}`, title: `技术服务${i + 1}`, homepageFeatured: i < 14 }));
  return hookHost('../app/page.tsx', 'default', {
    'next/link': Link, 'next/image': Image,
    '../components/technical-support-chat': { TechnicalSupportChat: () => null },
    '../components/technical-provider-application': { TechnicalProviderApplication: () => null },
    '../components/storefront-banners': { StorefrontBanners: () => null },
    '../components/store-product-card': productCard, '../components/tool-directory': directory,
    '../components/homepage-catalog': load('../components/homepage-catalog.tsx', { 'next/link': Link, '../lib/homepage-display': helpers, './tool-directory': directory, './catalog-pagination': pagination }),
    '../components/catalog-pagination': pagination, '../lib/homepage-display': helpers,
    '../lib/catalog': { ...catalogHelpers, catalog: fixtures },
    '../lib/categories': { ...categoryHelpers, categoryTree: [{ name: '账号服务', children: [{ name: '会员', children: [] }] }, { name: '工具服务', children: [] }] },
    '../lib/technical-services': { ...technicalHelpers, technicalServices: services },
  });
}

test('首页分类列表每页 12 件，点击翻页换商品，切换分类重置页码且含更多入口', () => {
  const host = storefrontHost();
  let tree = host.render();
  elements(tree).find(element => element.type === 'button' && textOf(element) === '账号服务').props.onClick();
  tree = host.render();
  let html = markup(tree);
  assert.equal((html.match(/class="product-card refined-card"/g) || []).length, 12);
  assert.ok(html.includes('更多商品'));
  elements(tree).find(element => element.type === pagination.CatalogPagination && element.props.label === '商品分页').props.onChange(2);
  html = markup(host.render());
  assert.ok(html.includes('href="/product/13"')); assert.ok(!html.includes('href="/product/1"'));
  tree = host.render();
  elements(tree).find(element => element.type === 'button' && textOf(element) === '全部商品').props.onClick();
  tree = host.render();
  elements(tree).find(element => element.type === 'button' && textOf(element) === '账号服务').props.onClick();
  assert.ok(markup(host.render()).includes('href="/product/1"'));
});

test('技术服务推荐和更多列表均 12 个一页，更多按钮展示未推荐服务并重置页码', () => {
  const host = storefrontHost();
  let tree = host.render();
  elements(tree).find(element => element.type === 'button' && element.props['aria-pressed'] === false && textOf(element).includes('上门技术服务')).props.onClick();
  tree = host.render();
  assert.equal((markup(tree).match(/class="technical-reference-card"/g) || []).length, 12);
  elements(tree).find(element => element.type === pagination.CatalogPagination && element.props.label === '技术服务分页').props.onChange(2);
  tree = host.render();
  assert.equal((markup(tree).match(/class="technical-reference-card"/g) || []).length, 2);
  elements(tree).find(element => element.type === 'button' && textOf(element) === '更多服务 →').props.onClick();
  tree = host.render();
  assert.equal((markup(tree).match(/class="technical-reference-card"/g) || []).length, 12);
  elements(tree).find(element => element.type === pagination.CatalogPagination && element.props.label === '技术服务分页').props.onChange(3);
  const html = markup(host.render());
  assert.equal((html.match(/class="technical-reference-card"/g) || []).length, 2);
  assert.ok(html.includes('技术服务25')); assert.ok(html.includes('技术服务26'));
});

test('后台模块及商品上移操作、模式切换和保存连通，刷新读取同一配置', async () => {
  const records = [...products.slice(0, 3), ...tools.slice(0, 2)].map(item => ({ ...item, product_type: item.slug ? 'tool' : 'digital', status: 'active' }));
  let saved = helpers.defaultHomepageDisplay();
  const host = hookHost('../components/admin-homepage-display.tsx', 'HomepageDisplayManagement', { '../lib/homepage-display': helpers, './catalog-pagination': pagination }, {
    window: { setTimeout(fn) { queueMicrotask(fn); return 1; }, clearTimeout() {} },
    async fetch(_, options) {
      if (options?.method === 'POST') { saved = JSON.parse(options.body); return Response.json({ ok: true }); }
      return Response.json({ config: saved, items: records });
    },
  });
  host.render(); host.mountEffects();
  await new Promise(resolve => setImmediate(resolve));
  let tree = host.render();
  let rows = elements(tree).filter(element => element.type === 'tr');
  let row = rows.find(element => textOf(element).includes('工具服务') && textOf(element).includes('下移'));
  elements(row).find(element => element.type === 'button' && textOf(element) === '下移').props.onClick();
  tree = host.render();
  rows = elements(tree).filter(element => element.type === 'tr');
  row = rows.find(element => textOf(element).includes('商品2'));
  elements(row).find(element => element.type === 'button' && textOf(element) === '上移').props.onClick();
  tree = host.render();
  elements(tree).find(element => element.type === 'button' && textOf(element) === '保存首页展示').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved.sectionOrder.slice(0, 2), ['category:会员', 'tools']);
  assert.deepEqual(saved.itemOrder.slice(0, 3), [2, 1, 3]);
  tree = host.render();
  elements(tree).find(element => element.type === 'select' && element.props.value === 'grouped').props.onChange({ target: { value: 'flat' } });
  tree = host.render();
  elements(tree).find(element => element.type === 'button' && textOf(element) === '保存首页展示').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.mode, 'flat');
  tree = host.render();
  elements(tree).find(element => element.type === 'button' && textOf(element) === '刷新配置').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = host.render();
  assert.ok(elements(tree).some(element => element.type === 'select' && element.props.value === 'flat'));
  assert.ok(markup(tree).includes('商品2'));
});
