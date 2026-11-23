import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as design from '../lib/ai-leads-design.ts';
import * as workspaceDesign from '../lib/ai-workspace-design.ts';
import * as tools from '../lib/tool-services.ts';
import * as homepage from '../lib/homepage-display.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, Response, Request, URL, Date, console, ...globals,
    fetch() { throw Error('UI preview must not send collection requests'); },
    require(name) { if (name in mocks) return mocks[name];
      if (['react', 'react/jsx-runtime', '@heroicons/react/24/outline'].includes(name)) return require(name);
      if (['./ai-workspace-ui', './ai-workspace-data', './ai-workspace-studio'].includes(name)) return load('../components/' + name.slice(2) + '.tsx', mocks, globals);
      throw Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}
function elements(tree) { return React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)] : []; }
const text = tree => React.Children.toArray(tree?.props?.children).map(child => React.isValidElement(child) ? text(child) : String(child)).join('');
const markup = tree => renderToStaticMarkup(tree);
function host(name = 'workspace', locale = 'zh-CN', globals = {}) {
  let cursor = 0; const slots = [];
  let effect;
  const react = { ...React, useId() { cursor++; return 'leads-ui'; }, useEffect(callback) { effect = callback; },
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
  };
  const exported = load(`../components/ai-leads-${name}.tsx`, { react,
    './language-provider': { useI18n: () => ({ locale }) }, '../lib/ai-leads-design': design, '../lib/ai-workspace-design': workspaceDesign }, globals);
  const Component = exported[name === 'workspace' ? 'AiLeadsWorkspace' : 'AiLeadsLanding'];
  return { render() { cursor = 0; return Component(); }, mountEffect() { return effect?.(); }, setLocale(next) { locale = next; } };
}
const imageFile = (scene, locale = 'zh-CN') => scene + (locale === 'en' ? '' : '-zh') + '.webp';
const findButton = (tree, label) => elements(tree).find(node => node.type === 'button' && text(node) === label);
const change = (tree, name, value) => elements(tree).find(node => node.type === 'input' && node.props.name === name).props.onChange({ target: { value } });
const submit = tree => elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });

test('站长工具统一识别旧标识与运营名称，兼容已有页面地址和内置入口', () => {
  for (const slug of tools.siteAnalysisSlugs) { assert.equal(tools.isWebsiteAnalysis(slug), true); assert.equal(tools.builtInToolEntry(slug), `/tools/${slug}.html`); }
  assert.equal(tools.isWebsiteAnalysis('custom-tool', ' 站长运营工具 '), true);
  assert.equal(tools.builtInToolEntry('custom-tool', '站长运营工具'), '/tools/custom-tool.html');
  assert.equal(tools.builtInToolEntry('other'), '');
  assert.equal(tools.mapTool({ tool_slug: 'yxstar-site-tool', name: '站长运营工具', tool_charge_type: 'free' }).entryConfigured, true);
});

test('获客目录和导航共用同一个宣传入口，预览入口无真实商品或积分配置', async () => {
  assert.equal(tools.toolPagePath('ai-leads'), '/ai-leads'); assert.equal(tools.builtInToolEntry('ai-leads'), '/ai-leads');
  assert.equal(tools.aiLeadsPreviewTool.chargeType, 'free'); assert.equal(tools.aiLeadsPreviewTool.id, 0);
  const data = load('../lib/tool-service-data.ts', { '@/db/mysql-runtime': { env: { DB: { prepare() { throw Error('Preview entry must not read a product'); } } } },
    './tool-services': tools, './tool-module-pricing': {}, './tool-entry-settings': {}, './tool-entries': {} });
  assert.equal(await data.getPublishedTool('ai-leads'), tools.aiLeadsPreviewTool);
  const forbidden = () => { throw Error('Preview entry must not use accounts, billing or database'); };
  const access = load('../app/api/tools/access/route.ts', { '@/db/mysql-runtime': { env: { DB: { prepare: forbidden } } }, '@/db/setup': { getVerifiedSessionPhone: forbidden },
    '@/lib/tool-services': tools, '@/lib/tool-entitlements': {}, '@/lib/points-service': {}, '@/lib/tool-points-usage': {}, '@/lib/tool-module-pricing': {} });
  const response = await access.GET(new Request('https://www.yxstar.shop/api/tools/access?slug=ai-leads'));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { entryUrl: '/ai-leads', preview: true });
});

test('目录预览卡片提供原生导航及预览标识，不向真实工具统计上报虚拟商品', () => {
  const directory = load('../components/tool-directory.tsx', { '@/components/language-provider': { useI18n: () => ({ t: text => text }) },
    'next/image': props => { const attributes = { ...props }; delete attributes.unoptimized; return React.createElement('img', attributes); }, '../lib/tool-services': tools,
    '../lib/homepage-display': homepage, './catalog-pagination': { CatalogPagination: () => null } });
  const html = markup(React.createElement(directory.ToolDirectory, { tools: [tools.aiLeadsPreviewTool] }));
  assert.ok(html.includes('href="/ai-leads"')); assert.ok(html.includes('界面预览')); assert.ok(html.includes('/tool-icons/ai-leads.svg'));
  assert.ok(!html.includes('data-tool-entry='));
});

test('站长按名称识别的自定义旧入口也返回内置地址，不依赖未配置的外部网址', async () => {
  const access = load('../app/api/tools/access/route.ts', { '@/db/mysql-runtime': { env: { DB: { prepare(sql) {
    assert.ok(sql.startsWith('SELECT')); return { bind() { return this; }, async first() { return { id: 50, name: '站长运营工具', tool_charge_type: 'free', tool_url: '' }; } };
  } } } }, '@/db/setup': {}, '@/lib/tool-services': tools, '@/lib/tool-entitlements': {}, '@/lib/points-service': {}, '@/lib/tool-points-usage': {}, '@/lib/tool-module-pricing': {} });
  const response = await access.GET(new Request('https://www.yxstar.shop/api/tools/access?slug=custom-site-service'));
  assert.equal(response.status, 200); assert.equal((await response.json()).entryUrl, '/tools/custom-site-service.html');
});

test('宣传页中英文提供明显开始入口，平台区域筛选可用，所有接入能力明确为规划', () => {
  for (const locale of ['zh-CN', 'en']) {
    const h = host('landing', locale); let tree = h.render(), html = markup(tree);
    assert.ok(elements(tree).filter(node => node.type === 'a' && node.props.href === '/ai-leads/workspace').length >= 3);
    for (const name of ['Facebook', 'YouTube', 'TikTok', 'WhatsApp']) assert.ok(html.includes(name));
    assert.ok(html.includes(locale === 'en' ? 'Collection is not enabled' : '采集能力暂未开放'));
    findButton(tree, locale === 'en' ? 'International' : '海外').props.onClick(); tree = h.render();
    const list = elements(tree).find(node => node.props.className === 'al-platform-showcase');
    assert.equal(elements(list).filter(node => node.type === 'article').length, 7);
    assert.ok(!markup(list).includes(locale === 'en' ? 'Douyin' : '抖音'));
  }
});

test('宣传页仅保留共用导航，检索、分析和管理板块使用对应功能位图且清楚标为示意', () => {
  for (const locale of ['zh-CN', 'en']) {
    const tree = host('landing', locale).render(), html = markup(tree);
    assert.ok(html.includes('class="al-site al-landing"')); assert.ok(!html.includes('<svg'));
    assert.equal(elements(tree).filter(node => node.type === 'nav').length, 0, 'no second product navigation');
    assert.ok(!html.includes('al-product-nav'));
    const images = html.match(/<img\b[^>]*>/g) || []; assert.equal(images.length, 5);
    for (const tag of images) assert.match(tag, /src="\/media\/ai-leads\/[a-z-]+\.webp"/);
    const hero = images.find(tag => tag.includes(imageFile('keyword-discovery', locale)));
    assert.match(hero, /loading="eager"/); assert.match(hero, /fetchpriority="high"/i);
    assert.ok(hero.includes(imageFile('keyword-discovery', locale).replace('.webp', '-small.webp') + ' 900w')); assert.equal(images.filter(tag => tag.includes('loading="lazy"')).length, 4);
    assert.ok(html.includes('id="capabilities"')); assert.ok(html.includes(locale === 'en' ? 'Can I collect real prospects now?' : '现在可以直接采集真实客户吗？'));
    assert.ok(html.includes(locale === 'en' ? 'AI-generated feature concepts' : 'AI生成的功能场景示意'));
    for (const [id, image] of [['al-analysis-title', 'precision-analysis'], ['al-profiles-title', 'lead-profiles']]) {
      const section = elements(tree).find(node => node.props['aria-labelledby'] === id);
      assert.ok(markup(section).includes('/media/ai-leads/' + imageFile(image, locale)));
    }
    for (const name of ['hero-collaboration', 'global-trade', 'china-market-sky', 'customer-research', 'team-growth']) assert.ok(!html.includes(name));
  }
});

test('三组中英文功能位图及响应式版本为真实WebP文件，生成来源与提示词可追溯', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/media/ai-leads/assets.json', import.meta.url), 'utf8'));
  assert.equal(manifest.assets.length, 12); assert.equal(new Set(manifest.assets.map(asset => asset.scene)).size, 3);
  assert.deepEqual([...new Set(manifest.assets.map(asset => asset.locale))].sort(), ['en', 'zh-CN']);
  assert.equal(manifest.generator, 'Built-in image_gen');
  const provenance = readFileSync(new URL('../public/media/ai-leads/ASSETS.md', import.meta.url), 'utf8');
  let total = 0;
  for (const asset of manifest.assets) {
    assert.match(asset.file, /^[a-z-]+\.webp$/); assert.ok(provenance.includes(asset.scene));
    const bytes = readFileSync(new URL('../public/media/ai-leads/' + asset.file, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.length, asset.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(asset.width >= 900 && asset.height >= 600); total += bytes.length;
  }
  for (const scene of ['keyword-discovery', 'precision-analysis', 'lead-profiles']) {
    for (const locale of ['zh-CN', 'en']) {
      const variants = manifest.assets.filter(asset => asset.scene === scene && asset.locale === locale);
      assert.equal(variants.length, 2); assert.deepEqual(variants.map(asset => asset.width).sort((a,b) => a-b), [900,1536]);
      assert.ok(variants.some(asset => asset.file === imageFile(scene, locale)));
    }
  }
  assert.ok(total < 2000000, 'both language sets and responsive versions together should stay below 2MB');
});

test('切换语言时轮播和下方配图整套切换src与srcSet，保留当前轮播位置', () => {
  const h = host('landing');
  let tree = h.render();
  elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === '客户画像与线索管理').props.onClick();
  for (const locale of ['zh-CN', 'en', 'zh-CN']) {
    h.setLocale(locale); tree = h.render();
    const images = markup(tree).match(/<img\b[^>]*>/g) || [];
    assert.equal(images.length, 5);
    for (const tag of images) {
      if (locale === 'en') { assert.ok(!tag.includes('-zh')); assert.match(tag, /-small\.webp 900w/); }
      else { assert.match(tag, /src="\/media\/ai-leads\/[a-z-]+-zh\.webp"/); assert.match(tag, /-zh-small\.webp 900w/); }
    }
    const current = elements(tree).find(node => node.type === 'figure' && node.props.hidden === false);
    assert.ok(markup(current).includes(imageFile('lead-profiles', locale)));
  }
});

test('轮播支持手动切换、回绕与暂停，不自动打断手动浏览', () => {
  for (const locale of ['zh-CN', 'en']) {
    const h = host('landing', locale);
    const current = tree => elements(tree).find(node => node.type === 'figure' && node.props.hidden === false);
    const arrow = (tree, label) => elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
    let tree = h.render(); assert.ok(markup(current(tree)).includes(imageFile('keyword-discovery', locale)));
    arrow(tree, locale === 'en' ? 'Previous scene' : '上一张').props.onClick(); tree = h.render();
    assert.ok(markup(current(tree)).includes(imageFile('lead-profiles', locale)));
    assert.ok(findButton(tree, locale === 'en' ? 'Play' : '播放'));
    arrow(tree, locale === 'en' ? 'Next scene' : '下一张').props.onClick(); tree = h.render();
    assert.ok(markup(current(tree)).includes(imageFile('keyword-discovery', locale)));
    arrow(tree, locale === 'en' ? 'Analysis & precise filtering' : '数据分析与精度筛选').props.onClick(); tree = h.render();
    assert.ok(markup(current(tree)).includes(imageFile('precision-analysis', locale)));
  }
});

test('自动轮播六秒切换，悬停、焦点、隐藏页面和减少动态效果均暂停，卸载清理定时器', () => {
  const timers = new Map(), listeners = {}, motionListeners = {};
  let sequence = 0;
  const media = { matches: false, addEventListener(name, fn) { motionListeners[name] = fn; }, removeEventListener(name) { delete motionListeners[name]; } };
  const doc = { hidden: false, addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener(name) { delete listeners[name]; } };
  const h = host('landing', 'zh-CN', { window: { matchMedia: () => media }, document: doc,
    setInterval(fn, delay) { assert.equal(delay, 6000); const id = ++sequence; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); } });
  let tree = h.render(), cleanup = h.mountEffect(); assert.equal(timers.size, 1);
  [...timers.values()][0](); tree = h.render();
  assert.ok(markup(elements(tree).find(node => node.type === 'figure' && node.props.hidden === false)).includes(imageFile('precision-analysis')));
  doc.hidden = true; listeners.visibilitychange(); assert.equal(timers.size, 0);
  doc.hidden = false; listeners.visibilitychange(); assert.equal(timers.size, 1);
  media.matches = true; motionListeners.change(); assert.equal(timers.size, 0);
  media.matches = false; motionListeners.change(); assert.equal(timers.size, 1);
  const carousel = () => elements(tree).find(node => node.props.className === 'al-launch-carousel');
  carousel().props.onMouseEnter(); cleanup(); tree = h.render(); assert.equal(h.mountEffect(), undefined); assert.equal(timers.size, 0);
  carousel().props.onMouseLeave(); tree = h.render(); cleanup = h.mountEffect(); assert.equal(timers.size, 1);
  carousel().props.onFocusCapture(); cleanup(); tree = h.render(); assert.equal(h.mountEffect(), undefined); assert.equal(timers.size, 0);
  carousel().props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null }); tree = h.render(); cleanup = h.mountEffect(); assert.equal(timers.size, 1);
  cleanup(); assert.equal(timers.size, 0); assert.deepEqual(Object.keys(listeners), []); assert.deepEqual(Object.keys(motionListeners), []);
});

test('工作台默认头像与名称、数量选择与营销条件均可用，预览不请求网络或扣费', () => {
  const h = host(); let tree = h.render();
  const field = name => elements(tree).find(node => node.props.name === 'fields' && node.props.value === name);
  assert.equal(field('avatar').props.checked, true); assert.equal(field('name').props.checked, true); assert.equal(field('phone').props.checked, false);
  submit(tree); tree = h.render(); assert.ok(markup(tree).includes('请先输入搜索关键词。'));
  change(tree, 'keyword', '眼科设备'); tree = h.render();
  elements(tree).find(node => node.type === 'select' && node.props.id.endsWith('-quantity')).props.onChange({ target: { value: '100' } });
  tree = h.render(); change(tree, 'marketing', '海外代理商'); tree = h.render();
  for (const name of ['accountId', 'phone', 'bio', 'email']) { field(name).props.onChange(); tree = h.render(); }
  submit(tree); tree = h.render(); const html = markup(tree);
  assert.ok(html.includes('contact@example.com')); assert.ok(html.includes('海外代理商')); assert.ok(html.includes('最多3条结构示例')); assert.ok(html.includes('待接入'));
  assert.equal(elements(tree).filter(node => node.type === 'tbody').flatMap(node => elements(node).filter(node => node.type === 'tr')).length, 3);
  findButton(tree, '预览记录1').props.onClick(); tree = h.render(); assert.ok(markup(tree).includes('100 条 / 次')); assert.ok(markup(tree).includes('眼科设备'));
  findButton(tree, '查看方案').props.onClick(); tree = h.render(); assert.equal(elements(tree).find(node => node.props.name === 'keyword').props.value, '眼科设备');
  findButton(tree, '查看画像').props.onClick(); tree = h.render(); assert.ok(markup(tree).includes('客户画像示例'));
  const status = elements(tree).find(node => node.type === 'select' && node.props['aria-label']?.includes('线索分类'));
  status.props.onChange({ target: { value: 'followup' } }); tree = h.render();
  assert.ok(elements(tree).some(node => node.type === 'select' && node.props.value === 'followup'));
  assert.ok(!markup(host().render()).includes('contact@example.com'), 'a fresh page has no stored demo leads');
});

test('清空平台或字段提示条件缺失，取消字段后预览不显示该字段', () => {
  const h = host(); let tree = h.render(); change(tree, 'keyword', '电动车'); tree = h.render();
  findButton(tree, '清空').props.onClick(); tree = h.render(); submit(tree); tree = h.render(); assert.ok(markup(tree).includes('请至少选择一个平台。'));
  elements(tree).find(node => node.props.name === 'platforms' && node.props.value === 'jd').props.onChange(); tree = h.render();
  for (const name of ['avatar', 'name']) { elements(tree).find(node => node.props.name === 'fields' && node.props.value === name).props.onChange(); tree = h.render(); }
  submit(tree); tree = h.render(); assert.ok(markup(tree).includes('请至少选择一个展示字段。'));
  elements(tree).find(node => node.props.name === 'fields' && node.props.value === 'email').props.onChange(); tree = h.render(); submit(tree); tree = h.render();
  const table = elements(tree).find(node => node.type === 'table'); assert.ok(markup(table).includes('contact@example.com')); assert.ok(!markup(table).includes('企业线索示例'));
});

test('英文营销预设和管理视图均显示英文，搜索词保留用户原文', () => {
  const h = host('workspace', 'en'); let tree = h.render(); change(tree, 'keyword', '眼科设备'); tree = h.render();
  const label = elements(tree).find(node => node.type === 'label' && text(node) === 'Ophthalmic equipment');
  elements(label).find(node => node.type === 'input').props.onChange(); tree = h.render(); submit(tree); tree = h.render();
  assert.ok(markup(tree).includes('Ophthalmic equipment')); assert.ok(markup(tree).includes('眼科设备'));
  elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === 'Lead management').props.onClick(); tree = h.render(); assert.ok(markup(tree).includes('Lead list'));
  assert.ok(!markup(tree).includes('意向客户'));
});
