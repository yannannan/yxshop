import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { load } from 'cheerio';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';

const css = readFileSync(new URL('../app/public-theme.css', import.meta.url), 'utf8');
const theme = postcss.parse(css), scope = 'body:not(:has([data-admin-ui]))';
const variables = Object.fromEntries(theme.nodes.find(node => node.selector === scope).nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
function contrast(a, b) {
  const luminance = color => {
    const hex = color.slice(1).length === 3 ? color.slice(1).split('').map(c => c + c).join('') : color.slice(1);
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('前台主题限定作用域且管理端真实布局在登录与登录后均提供隔离标记', async () => {
  theme.walkRules(rule => {
    assert.ok(rule.selectors.every(selector => selector.startsWith(scope)), rule.selector);
    assert.doesNotMatch(rule.selector, /:is\([^)]*:{1,2}(?:before|after)\b/, 'pseudo-elements must be outside :is(), otherwise browser discards the state styling');
  });
  const { default: AdminLayout } = await tsImport('../app/admin/layout.tsx', import.meta.url);
  for (const className of ['admin-shell', 'admin-login']) {
    const html = renderToStaticMarkup(React.createElement(AdminLayout, null, React.createElement('main', { className }, '后台')));
    const $ = load(html);
    assert.equal($('[data-admin-ui]').length, 1);
    assert.equal($(scope).length, 0);
  }
  const $ = load('<main class="tools-page"><button class="video-primary">继续</button></main>');
  assert.equal($(scope).length, 1);
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.ok(layout.indexOf("import './public-theme.css'") > layout.indexOf("import './ai-leads-landing.css'"));
});

test('品牌主按钮、正文及辅助文字在白色/浅蓝背景上达到普通文字AA对比度', () => {
  for (const [foreground, background] of [
    [variables['--ui-primary'], '#fff'], [variables['--ui-primary-hover'], '#fff'],
    [variables['--ui-ink'], '#fff'], [variables['--ui-ink'], variables['--ui-soft']],
    [variables['--ui-muted'], '#fff'], [variables['--ui-muted'], variables['--ui-soft']],
    ['#2c62ac', '#fff'], ['#eaf4ff', '#173452'],
  ]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground}/${background}: ${contrast(foreground, background)}`);
  const lightPanels = Object.fromEntries(theme.nodes.find(node => node.selector === `${scope} .ip-main`).nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  for (const key of ['--ip-on-dark', '--ip-dark-muted', '--ip-warm']) assert.ok(contrast(lightPanels[key], '#f2f7ff') >= 4.5, `${key} must stay readable after changing tool panels from dark to light`);
});

test('侧栏与内容区、选中项有清楚层次，选中状态不会被悬停覆盖', () => {
  const nav = variables['--ui-nav-bg'], active = variables['--ui-nav-active'];
  assert.ok(contrast(nav, '#f3f8fe') >= 7, 'navigation and content must be visibly separated');
  assert.ok(contrast(active, nav) >= 3, 'selected fill must stand out from the sidebar');
  assert.ok(contrast('#fff', active) >= 4.5);
  for (const key of ['--ui-nav-text', '--ui-nav-muted']) assert.ok(contrast(variables[key], nav) >= 4.5);
  const hover = theme.nodes.find(node => node.type === 'rule' && node.nodes.some(d => d.prop === 'background' && d.value === 'var(--ui-nav-hover)'));
  const selected = theme.nodes.find(node => node.type === 'rule' && node.nodes.some(d => d.prop === 'background' && d.value === 'var(--ui-nav-active)'));
  for (const [container, node] of [
    ['account-sidebar', '<nav><a class="active is-hovered" aria-current="page">我的积分</a></nav>'],
    ['seo-sidebar seo-workspace-sidebar', '<nav><div class="seo-submenu"><button class="active is-hovered">分析</button></div></nav>'],
    ['ds-sidebar', '<nav class="ds-modes"><button class="is-hovered" aria-pressed="true">签署</button></nav>'],
    ['ip-sidebar', '<nav><button class="is-hovered" aria-current="page">处理</button></nav>'],
    ['al-sidebar', '<nav><button class="is-hovered" aria-current="page">获客</button></nav>'],
    ['technician-sidebar', '<nav><button class="active is-hovered">工作台</button></nav>'],
  ]) {
    const $ = load(`<aside class="${container}">${node}</aside>`);
    const control = $('.is-hovered');
    assert.equal(control.is(selected.selector), true, container);
    assert.equal(control.is(hover.selector.replaceAll(':hover', '.is-hovered').replaceAll(':disabled', '[disabled]')), false, container);
  }
});

test('主题保留内容图像、画布、颜色选择和二维码，不对素材应用滤镜或重着色', () => {
  theme.walkRules(rule => {
    assert.doesNotMatch(rule.selector, /(?:\.stamp-colors|\.qr-grid|\.qr-logo|\.service-qr|\bcanvas\b|\bimg\b)(?:\s|[,:.>#]|$)/);
    for (const decl of rule.nodes.filter(node => node.type === 'decl')) {
      assert.ok(!['filter', 'backdrop-filter', 'mix-blend-mode', 'fill', 'stroke'].includes(decl.prop), `${rule.selector}: ${decl.prop}`);
    }
  });
});

test('购买/工具主按钮覆盖相同交互状态，移动触控与减少动态效果均有处理', () => {
  const primary = theme.nodes.find(node => node.type === 'rule' && node.nodes.some(d => d.prop === 'background' && d.value === 'var(--ui-primary)') && node.selector.includes('.confirm-order'));
  const hover = theme.nodes.find(node => node.type === 'rule' && node.selector.includes('.confirm-order') && node.selector.includes(':hover:not(:disabled):not([aria-disabled=true])'));
  for (const control of ['.confirm-order', '.points-primary', '.account-primary', '.ds-primary', '.stamp-create-button', '.video-primary', '.ip-workspace .ip-primary', '.al-site .al-primary']) {
    assert.ok(primary.selector.includes(control)); assert.ok(hover.selector.includes(control));
  }
  assert.ok(theme.nodes.some(node => node.name === 'media' && node.params.includes('prefers-reduced-motion')));
  assert.ok(theme.nodes.some(node => node.name === 'media' && node.params.includes('max-width:720px') && node.nodes.some(rule => rule.nodes?.some(d => d.prop === 'min-height' && d.value === '44px'))));
  assert.ok(css.includes(':focus-visible'));
});
