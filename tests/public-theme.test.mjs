import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import postcss from 'postcss';
import { load } from 'cheerio';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const css = readFileSync(new URL('../app/glass-theme.css', import.meta.url), 'utf8');
const theme = postcss.parse(css), scope = 'body[data-ui-theme="glass"]';
const variables = Object.fromEntries(theme.nodes.find(n => n.selector === scope).nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]));
function contrast(a, b) {
  const luminance = color => {
    const hex = color.slice(1).length === 3 ? color.slice(1).split('').map(c => c + c).join('') : color.slice(1);
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('全站主题由根布局显式选择，最后加载且保留管理端语义标记', async () => {
  theme.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    assert.ok(rule.selectors.every(selector => selector.startsWith(scope)), rule.selector);
    assert.doesNotMatch(rule.selector, /:is\([^)]*:{1,2}(?:before|after)\b/);
  });
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.ok(layout.includes('data-ui-theme="glass"'));
  assert.ok(layout.indexOf("import './glass-theme.css'") > layout.indexOf("import './ai-leads-landing.css'"));
  assert.ok(!layout.includes("import './public-theme.css'"), 'do not load two competing themes');
  const { default: AdminLayout } = await tsImport('../app/admin/layout.tsx', import.meta.url);
  for (const className of ['admin-shell', 'admin-login']) {
    const $ = load(renderToStaticMarkup(React.createElement(AdminLayout, null, React.createElement('main', { className }, '后台'))));
    assert.equal($('[data-admin-ui]').length, 1);
  }
});

test('深色玻璃正文、辅助文字、主按钮与费用标签达到普通文字AA对比度', () => {
  for (const background of ['#080c17', variables['--ui-surface'], variables['--ui-soft']]) {
    for (const key of ['--ui-ink', '--ui-muted']) assert.ok(contrast(variables[key], background) >= 4.5, key + '/' + background);
  }
  for (const color of [variables['--ui-primary'], variables['--ui-primary-hover'], '#5766d8', '#7150da']) assert.ok(contrast('#fff', color) >= 4.5, color);
  for (const color of ['green', 'orange', 'purple', 'blue']) assert.ok(contrast(variables['--ui-tag-' + color + '-text'], variables['--ui-tag-' + color + '-bg']) >= 4.5);
  for (const key of ['--ui-nav-text', '--ui-nav-muted']) assert.ok(contrast(variables[key], variables['--ui-nav-bg']) >= 4.5);
  assert.ok(contrast('#f1f4ff', variables['--ui-nav-active']) >= 4.5);
});

test('工具卡片仍呈现真实费用和入口，不将预览伪装成已开放采集', async () => {
  const require = createRequire(import.meta.url), exports = {};
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), '@heroicons/react/24/outline': require('@heroicons/react/24/outline'),
    '@/components/language-provider': { useI18n: () => ({ t: value => value }) },
    'next/image': ({ src, alt, width, height }) => React.createElement('img', { src, alt, width, height }),
    '../lib/tool-services': await tsImport('../lib/tool-services.ts', import.meta.url),
    '../lib/homepage-display': await tsImport('../lib/homepage-display.ts', import.meta.url),
    './catalog-pagination': { CatalogPagination: () => null },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/tool-directory.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports, require: name => mocks[name] });
  const tools = ['preview', 'free', 'points', 'paid', 'pending'].map((kind, i) => ({ id: i + 1, slug: kind === 'preview' ? 'ai-leads' : 'test-' + kind, name: kind, description: '介绍', logo: '', chargeType: kind === 'preview' ? 'free' : kind, pointsCost: 10, plans: [], entryConfigured: true }));
  const $ = load(renderToStaticMarkup(React.createElement(exports.ToolDirectory, { tools })));
  for (const kind of ['preview', 'free', 'points', 'paid', 'pending']) assert.equal($('.tool-charge-badge.' + kind).length, 1);
  assert.equal($('.tool-charge-badge.preview').text(), '界面预览');
  assert.match($('.tool-charge-badge.points').text(), /10 积分\/次/);
  assert.equal($('.tool-entry-card').length, 5); assert.equal($('a[href="/ai-leads"]').length, 1);
});

test('真实背景素材体积受限，主题不对内容图像、画布或二维码重着色', () => {
  const asset = new URL('../public/design/glass-atmosphere-v1.webp', import.meta.url);
  assert.ok(existsSync(asset)); assert.ok(readFileSync(asset).length < 300000);
  theme.walkDecls(decl => assert.ok(!['filter', 'mix-blend-mode', 'fill', 'stroke'].includes(decl.prop), decl.parent.selector + ': ' + decl.prop));
  assert.ok(css.includes('.ds-draw-surface { background:#fff'));
  assert.ok(css.includes('.mobile-access-code { background:#fff'));
});

test('门户桌面六列、手机两列，减少动态效果及无模糊支持时仍清晰可用', () => {
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  const mobile = theme.nodes.find(n => n.name === 'media' && n.params === '(max-width:430px)');
  assert.ok(mobile.nodes.some(n => n.nodes?.some(d => d.prop === 'grid-template-columns' && d.value.includes('repeat(2'))));
  assert.ok(theme.nodes.some(n => n.name === 'media' && n.params.includes('prefers-reduced-motion')));
  assert.ok(theme.nodes.some(n => n.name === 'supports' && n.params.includes('backdrop-filter')));
  assert.ok(css.includes(':focus-visible'));
});

test('菜单、工具、账户、商品、技术服务、宣传页和聊天均接入同一主题', () => {
  for (const selector of ['.account-sidebar', '.ds-workspace', '.ip-workspace', '.seo-workspace', '.al-site', '.cleaner-hero', '.technical-service-card', '.chat-composer', '.admin-sidebar', '.points-package', '.product-card']) assert.ok(css.includes(selector), selector);
});
