import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as images from '../lib/technical-images.ts';
import * as technical from '../lib/technical-services.ts';

const require = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const exports = {}, source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, URL, Response, ...globals, require(name) { if (name in mocks) return mocks[name]; if (['react', 'react/jsx-runtime'].includes(name)) return require(name); throw Error(`Unexpected import ${name}`); } });
  return exports;
}
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  return bytes.toString('ascii', 12, 16) === 'VP8X' ? [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1] : [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}

test('列表与详情使用对应显示分辨率的WebP，原图保留，默认头像请求体积减少99%以上', () => {
  let originalBytes = 0, cardBytes = 0;
  for (const name of ['zhangwei', 'lina', 'wangqiang']) {
    const path = `/technical-services/provider-${name}-v1.png`;
    originalBytes += statSync(new URL('../public' + path, import.meta.url)).size;
    for (const [variant, size, limit] of [['card', 216, 10000], ['portrait', 640, 40000]]) {
      const url = images.technicalAvatarImage(path, variant), data = readFileSync(new URL('../public' + url, import.meta.url));
      assert.deepEqual(webpSize(data), [size, size]); assert.ok(data.length < limit);
      if (variant === 'card') cardBytes += data.length;
    }
  }
  assert.ok(cardBytes / originalBytes < .01);
  const hero = readFileSync(new URL('../public' + images.technicalHeroImage, import.meta.url)); assert.deepEqual(webpSize(hero), [1536, 1024]); assert.ok(hero.length < 150000);
  for (const custom of ['https://example.org/avatar.png', '/uploads/custom.png', '', '/technical-services/provider-unknown-v1.png']) assert.equal(images.technicalAvatarImage(custom), custom);
});

const row = { slug: 'published-service', title: '数据库已发布服务', summary: '真实服务介绍', provider_code: 'provider-zhangwei', provider_name: '技术人员', avatar: '/technical-services/provider-zhangwei-v1.png', homepage_featured: 1, delivery_modes_json: '["online","onsite","invalid"]', pricing_mode: 'fixed', price: 500, unit: '次', skills_json: '["网站运维"]', service_includes_json: '[]', delivery_notes_json: '[]', password: 'private', login_phone: 'private' };
function catalogFixture() {
  let now = 0, error = null, reads = 0, resolve;
  const queries = []; let results = [row], wait = false;
  const data = load('../lib/technical-service-data.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { assert.ok(sql.startsWith('SELECT ')); queries.push(sql); return { async all() { reads++; if (wait) await new Promise(done => { resolve = done; }); if (error) throw error; return { results }; } }; } } } },
    './technical-services': technical,
  }, { Date: { now: () => now } });
  return { data, queries, get reads() { return reads; }, set error(value) { error = value; }, set results(value) { results = value; }, set wait(value) { wait = value; }, release() { resolve(); }, advance() { now += 5001; } };
}

test('SEO、首屏和目录共用并发读取及5秒公共缓存，不初始化登录表、不返回内部字段', async () => {
  const f = catalogFixture(); f.wait = true;
  const requests = [f.data.getPublicTechnicalCatalog(), f.data.getPublicTechnicalCatalog(), f.data.getPublishedServiceSummary(row.slug)];
  assert.equal(f.reads, 1); f.release(); const [a, b, summary] = await Promise.all(requests);
  assert.equal(a, b); assert.equal(summary.title, row.title); assert.equal(f.reads, 1);
  assert.equal(a.fallback, false); assert.deepEqual(Array.from(a.services[0].deliveryModes), ['online', 'onsite']); assert.equal(a.services[0].price, 500);
  assert.ok(!JSON.stringify(a).includes('private')); assert.match(f.queries[0], /s.status='active' AND p.status='active'/);
  await f.data.getPublicTechnicalCatalog(); assert.equal(f.reads, 1);
  f.advance(); f.wait = false; f.results = []; assert.equal((await f.data.getPublicTechnicalCatalog()).services.length, 0); assert.equal(f.reads, 2);
});

test('网络/数据库故障不缓存成空服务，也不回退种子；旧表缺失保留既有兼容行为', async () => {
  const f = catalogFixture(); f.error = new Error('connection timeout');
  await assert.rejects(f.data.getPublicTechnicalCatalog(), /connection timeout/);
  f.error = null; assert.equal((await f.data.getPublicTechnicalCatalog()).services.length, 1); assert.equal(f.reads, 2);
  f.advance(); f.error = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
  const fallback = await f.data.getPublicTechnicalCatalog(); assert.equal(fallback.fallback, true); assert.equal(fallback.services.length, technical.technicalServices.length);
});

test('目录API保留单项/首页过滤和404，失败可重试，所有响应不缓存个人上下文', async () => {
  let failure = false;
  const api = load('../app/api/technical-services/route.ts', { '@/lib/technical-service-data': { async getPublicTechnicalCatalog() { if (failure) throw Error('database credentials'); return { services: [{ slug: 'featured', homepageFeatured: true }, { slug: 'other', homepageFeatured: false }], fallback: false }; } } }, { console: { error() {} } });
  const response = await api.GET(new Request('https://example.org/api/technical-services?homepage=1'));
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).length, 1);
  assert.equal((await (await api.GET(new Request('https://example.org/api/technical-services?slug=other'))).json()).slug, 'other');
  assert.equal((await api.GET(new Request('https://example.org/api/technical-services?slug=missing'))).status, 404);
  failure = true; const failed = await api.GET(new Request('https://example.org/api/technical-services')); assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('credentials'));
});

test('详情首屏直接渲染后台服务，头像/大图直读压缩资源，聊天未打开不加载', async () => {
  const f = catalogFixture(), services = (await f.data.getPublicTechnicalCatalog()).services;
  const component = load('../components/technical-service-detail.tsx', {
    '@/components/language-provider': { useI18n: () => ({ t: value => value }) }, './storefront-header': { StorefrontHeader: () => null },
    'next/image': ({ src, alt }) => React.createElement('img', { src, alt }), 'next/dynamic': () => () => { throw Error('Chat must be mounted only when opened'); },
    'next/navigation': { useSearchParams: () => new URLSearchParams() }, '../lib/technical-images': images, '../lib/technical-services': technical,
  });
  const page = load('../app/service/[slug]/page.tsx', { '@/components/technical-service-detail': component, '@/lib/technical-service-data': f.data });
  const tree = await page.default({ params: Promise.resolve({ slug: row.slug }) });
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes(row.title)); assert.ok(html.includes(row.summary)); assert.ok(!html.includes('正在读取'));
  assert.ok(html.includes(images.technicalAvatarImage(row.avatar, 'portrait'))); assert.ok(html.includes(images.technicalHeroImage)); assert.ok(!html.includes('v1.png')); assert.equal(f.reads, 1);
  assert.ok(!services[0].password);
});

test('只为版本化轻量素材设置长期缓存，不改变自定义头像或私有接口缓存', async () => {
  const config = load('../next.config.ts', { './lib/technical-images': images }).default;
  const headers = await config.headers(); assert.equal(headers.length, 7);
  for (const entry of headers) { assert.ok(entry.source.endsWith('-v2.webp')); assert.match(entry.headers[0].value, /max-age=31536000, immutable/); }
});
