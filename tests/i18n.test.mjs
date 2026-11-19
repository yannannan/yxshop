import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { english } from '../lib/i18n-en.ts';
import { buildPageMetadata } from '../lib/page-seo.ts';

const require = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require(name) { if (name in mocks) return mocks[name]; if (name === 'react' || name === 'react/jsx-runtime') return require(name); throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const core = load('../lib/i18n.ts', { './i18n-en': { english } });
const provider = load('../components/language-provider.tsx', { '../lib/i18n': core });

test('只接受两种语言；中文默认与英文翻译不改变业务对象、数字或用户内容', () => {
  for (const value of [undefined, null, '', 'en-US', 'EN', 'en; Path=/admin']) assert.equal(core.parseLocale(value), 'zh-CN');
  assert.equal(core.parseLocale('en'), 'en');
  const t = core.translator('en'), value = { name: '用户填写的名称', points: 100 };
  assert.equal(t(value), value); assert.equal(t(100), 100); assert.equal(t('用户填写的名称'), '用户填写的名称');
  assert.equal(core.translate('剩余积分', 'zh-CN'), '剩余积分'); assert.equal(t('剩余积分'), 'Points remaining');
  assert.equal(t('付款链接 https://example.com/private?id=1'), '付款链接 https://example.com/private?id=1');
});

test('动态提示保留插值和特殊字符，优先匹配具体模板，不把金额或积分换算为其他币种', () => {
  const t = core.translator('en');
  assert.equal(t('制作成功，已消耗 20 积分，剩余 80 积分。'), 'Created successfully. Used 20 points; 80 points remaining.');
  assert.equal(t('剩余积分 暂不可用'), 'Points remaining: Unavailable');
  assert.equal(t(' 查看$&详情 '), ' View $& details ');
  assert.equal(t('确认下单 · ¥20/月'), 'Place Order · ¥20/month');
  assert.equal(t('原始画质 · MP4'), 'Original quality · MP4');
  assert.equal(t('1080p · MP4 · 含音频合并'), '1080p · MP4 · Audio merged');
});

test('实际 React Provider 按树隔离：英文前台与固定中文管理端互不污染', () => {
  function Label() { return React.createElement('span', null, provider.useI18n().t('我的订单')); }
  const Admin = load('../app/admin/layout.tsx', { '@/components/language-provider': provider, '@/lib/page-seo': { buildPageMetadata } }).default;
  const html = renderToStaticMarkup(React.createElement(provider.LanguageProvider, { locale: 'en' }, React.createElement(Label), React.createElement(Admin, null, React.createElement(Label)), React.createElement(Label)));
  assert.equal((html.match(/My Orders/g) || []).length, 2); assert.equal((html.match(/我的订单/g) || []).length, 1); assert.match(html, /lang="zh-CN"/);
  assert.equal(renderToStaticMarkup(React.createElement(Label)), '<span>我的订单</span>');
});

test('切换只保存站点语言偏好并刷新原地址，不写登录 Cookie、不修改路由和业务数据', () => {
  for (const protocol of ['https:', 'http:']) {
    let cookie = '', reloads = 0;
    const document = { set cookie(value) { cookie = value; } }, location = { protocol, pathname: '/tools/video-extractor.html', search: '?task=123', hash: '#history', reload() { reloads++; } };
    const { saveLanguage } = load('../components/language-switcher.tsx', { '../lib/i18n': core, './language-provider': provider }, { document, window: { location } });
    saveLanguage('en'); assert.match(cookie, /^yxshop_locale=en; Path=\/; Max-Age=31536000; SameSite=Lax/); assert.equal(cookie.includes('Secure'), protocol === 'https:'); assert.equal(cookie.includes('mall_session'), false); assert.equal(reloads, 1);
    assert.equal(location.pathname + location.search + location.hash, '/tools/video-extractor.html?task=123#history');
    saveLanguage('en; mall_session=forged'); assert.match(cookie, /^yxshop_locale=zh-CN;/);
  }
});

test('语言入口可访问、英文选择可见；服务器读取 Cookie 按请求隔离，不依赖登录或数据库', async () => {
  const Switcher = load('../components/language-switcher.tsx', { '../lib/i18n': core, './language-provider': provider }).LanguageSwitcher;
  const html = renderToStaticMarkup(React.createElement(provider.LanguageProvider, { locale: 'en' }, React.createElement(Switcher)));
  assert.match(html, /语言 \/ Language/); assert.match(html, /value="en" selected=""/);
  let value = 'en'; const server = load('../lib/i18n-server.ts', { 'next/headers': { cookies: async () => ({ get: name => { assert.equal(name, 'yxshop_locale'); return { value }; } }) }, './i18n': core });
  assert.equal((await server.getI18n()).t('我的订单'), 'My Orders'); value = 'zh-CN'; assert.equal((await server.getI18n()).t('我的订单'), '我的订单'); value = '../en'; assert.equal((await server.getI18n()).locale, 'zh-CN');
});

test('前台显式翻译的静态界面文案有英文词条；英文词条不包含未翻译中文', () => {
  const missing = [];
  function visit(dir) { for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (!file.includes('/admin') && !file.includes('/api')) visit(file); continue; }
    if (!file.endsWith('.tsx') || file.includes('/admin-')) continue;
    const ast = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 't' && ts.isStringLiteral(node.arguments[0]) && /[\u3400-\u9fff]/u.test(node.arguments[0].text) && !english[node.arguments[0].text.trim()]) missing.push([file, node.arguments[0].text]);
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'option' && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(ast).startsWith('t('))) {
        assert.ok(node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'value'), `${file}: translated options must preserve explicit request values`);
      }
      ts.forEachChild(node, walk);
    } walk(ast);
  } }
  visit('../components'); visit('../app'); assert.deepEqual(missing, []);
  assert.deepEqual(Object.entries(english).filter(([, text]) => /[\u3400-\u9fff]/u.test(text)), []);
});
