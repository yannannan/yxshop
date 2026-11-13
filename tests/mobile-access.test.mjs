import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { english } from '../lib/i18n-en.ts';

const require = createRequire(import.meta.url), key = 'yxshop.mobile-access-state.v1';
function load(file, mocks, globals = {}) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require(name) {
    if (name in mocks) return mocks[name];
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    throw Error(`Unexpected import ${name}`);
  } });
  return exports;
}
const Image = ({ unoptimized: _, ...props }) => React.createElement('img', props);
const language = locale => ({ useI18n: () => ({ t: text => locale === 'en' ? english[text] || text : text }) });
function elements(tree) {
  if (!React.isValidElement(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)];
}
const button = tree => elements(tree).find(node => node.props.className === 'mobile-access-trigger');
const panel = tree => elements(tree).find(node => node.props.className === 'mobile-access-code');

function host({ storage = new Map(), locale = 'zh-CN', path = '/', unavailableStorage = false } = {}) {
  let cursor = 0, dirty = true, tree, frameId = 0, focused = 0;
  const slots = [], pending = [], frames = new Map(), listeners = new Map(), observers = [];
  const geometry = { width: 1920, height: 1080, header: 74, right: 1640, padding: 0, cleaner: false };
  const header = { getBoundingClientRect: () => ({ height: geometry.header }) };
  const main = { getBoundingClientRect: () => ({ right: geometry.right }) };
  const document = { body: {}, documentElement: { get clientWidth() { return geometry.width; } },
    querySelector: selector => selector === '.unified-topbar' ? header : selector === 'main' || selector === '.cleaner-hero-inner' && geometry.cleaner ? main : null };
  class Observer {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const window = { get innerWidth() { return geometry.width; }, get innerHeight() { return geometry.height; },
    getComputedStyle: () => ({ paddingRight: String(geometry.padding) + 'px' }),
    localStorage: { getItem(name) { if (unavailableStorage) throw Error('blocked'); return storage.get(name) ?? null; },
      setItem(name, value) { if (unavailableStorage) throw Error('blocked'); storage.set(name, value); } },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); } };
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useId() { cursor++; return 'mobile-access-panel'; },
    useEffect(callback, dependencies) { const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        pending.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; });
      } },
  };
  const Component = load('../components/mobile-access.tsx', { react: hooks, 'next/image': Image,
    'next/navigation': { usePathname: () => path }, './language-provider': language(locale) }, { window, document, ResizeObserver: Observer, MutationObserver: Observer }).MobileAccess;
  function render() { cursor = 0; dirty = false; tree = Component(); const ref = button(tree)?.props.ref; if (ref) ref.current = { focus() { focused++; } }; return tree; }
  function flush() { for (let count = 0; count < 20; count++) {
    if (dirty) render();
    if (!pending.length && !frames.size && !dirty) return tree;
    pending.splice(0).forEach(callback => callback());
    const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback());
  } throw Error('Effects did not settle'); }
  return { render, flush, geometry, storage, observers, listeners,
    navigate(value) { path = value; dirty = true; return flush(); },
    click() { button(tree).props.onClick(); return flush(); },
    emit(name, event = {}) { listeners.get(name)?.forEach(callback => callback(event)); return flush(); },
    escape() { let prevented = false; tree.props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; } }); flush(); return { prevented, focused }; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); assert.equal(frames.size, 0); },
  };
}

test('服务端无需 window 即可输出唯一静态二维码，固定官方地址与中英文无关', () => {
  for (const locale of ['zh-CN', 'en']) {
    const Component = load('../components/mobile-access.tsx', { 'next/image': Image,
      'next/navigation': { usePathname: () => '/' }, './language-provider': language(locale) }).MobileAccess;
    const html = renderToStaticMarkup(React.createElement(Component));
    assert.equal((html.match(/data-mobile-access="true"/g) || []).length, 1);
    assert.ok(html.includes('href="https://www.yxstar.shop"')); assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(html.includes('src="/mobile-access-qr.png"')); assert.ok(html.includes('width="148" height="148"'));
    assert.ok(html.includes(locale === 'en' ? 'Scan for mobile access' : '扫码手机端访问'));
    assert.ok(html.includes('aria-expanded="false"')); assert.ok(html.includes('hidden=""'));
  }
});

test('有留白时在导航下方默认展开，工具工作区收成边缘图标，响应导航高度与窗口变化', () => {
  const h = host(); let tree = h.flush();
  assert.equal(button(tree).props['aria-expanded'], true); assert.equal(panel(tree).props.hidden, false);
  assert.equal(tree.props.style.top, 98); assert.equal(tree.props.style.right, 24);
  assert.ok(tree.props.style.width + tree.props.style.right + 16 <= h.geometry.width - h.geometry.right);
  h.geometry.right = 1892; h.geometry.header = 102;
  tree = h.emit('resize'); assert.equal(button(tree).props['aria-expanded'], false);
  assert.ok(tree.props.className.includes('is-icon')); assert.equal(tree.props.style.width, 28); assert.equal(tree.props.style.right, 0); assert.equal(tree.props.style.top, 126);
  tree = h.click(); assert.equal(panel(tree).props.hidden, false);
  tree = h.emit('resize'); assert.equal(panel(tree).props.hidden, true); assert.equal(h.storage.get(key), 'expanded');
  h.geometry.right = 1640; tree = h.emit('resize'); assert.equal(panel(tree).props.hidden, false);
  h.geometry.height = 240; tree = h.emit('resize'); assert.equal(panel(tree).props.hidden, true);
  h.unmount();
});

test('收起偏好跨页和刷新保留，手动打开窄页后不会意外在其他工作区展开', () => {
  const storage = new Map(), h = host({ storage }); h.flush();
  assert.equal(panel(h.click()).props.hidden, true); assert.equal(storage.get(key), 'collapsed');
  assert.equal(panel(h.navigate('/tools')).props.hidden, true);
  const reloaded = host({ storage }); assert.equal(panel(reloaded.flush()).props.hidden, true); reloaded.unmount();
  h.geometry.right = 1892; h.emit('resize'); assert.equal(panel(h.click()).props.hidden, false);
  assert.equal(panel(h.navigate('/tools/document-signature.html')).props.hidden, true);
  assert.equal(panel(h.navigate('/tools')).props.hidden, true);
  h.geometry.right = 1640; assert.equal(panel(h.emit('resize')).props.hidden, false);
  h.unmount();
});

test('存储不可用仍能操作，Escape收起并回焦点，不影响页面导航', () => {
  const h = host({ unavailableStorage: true }); h.flush();
  assert.equal(panel(h.click()).props.hidden, true); assert.equal(panel(h.navigate('/account')).props.hidden, true);
  h.click(); assert.deepEqual(h.escape(), { prevented: true, focused: 1 });
  assert.equal(panel(h.flush()).props.hidden, true); h.unmount();
});

test('只同步对应存储项，后台及子页不展示，返回前台仍使用原有偏好', () => {
  const h = host(); h.flush();
  assert.equal(panel(h.emit('storage', { key: 'other', newValue: 'collapsed' })).props.hidden, false);
  assert.equal(panel(h.emit('storage', { key, newValue: 'collapsed' })).props.hidden, true);
  assert.equal(h.navigate('/admin'), null); assert.equal(h.navigate('/admin/tools'), null);
  assert.equal(panel(h.navigate('/account')).props.hidden, true);
  assert.equal(panel(h.emit('storage', { key: null, newValue: null })).props.hidden, false);
  assert.ok(h.navigate('/administrator')); h.unmount();
});

test('内容加载观察器可重新测量留白，清理全部监听器，移动端不自动展开', () => {
  const h = host(); h.flush(); h.geometry.width = 700; h.geometry.right = 680;
  h.observers.filter(observer => observer.active).forEach(observer => observer.callback());
  assert.equal(panel(h.flush()).props.hidden, true);
  h.unmount(); assert.ok(h.observers.every(observer => !observer.active));
  assert.ok([...h.listeners.values()].every(callbacks => callbacks.size === 0));
});

test('全局根布局只挂载一次入口，与页面同处语言上下文且不依赖各页面客服', async () => {
  const MobileAccess = () => null, LanguageProvider = ({ children }) => children;
  const Layout = load('../app/layout.tsx', { '@/lib/i18n-server': { getI18n: async () => ({ locale: 'en' }), localizeMetadata() {} },
    '@/components/language-provider': { LanguageProvider }, '@/components/tool-activity': { ToolActivity: () => null },
    '@/components/mobile-access': { MobileAccess }, ...Object.fromEntries([...readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8').matchAll(/import '(\.\/[^']+\.css)'/g)].map(match => [match[1], {}])) }, { URL, process: { env: {} } }).default;
  const tree = await Layout({ children: React.createElement('main', null, 'page') });
  const context = elements(tree).find(node => node.type === LanguageProvider);
  assert.equal(context.props.locale, 'en'); assert.equal(elements(context).filter(node => node.type === MobileAccess).length, 1);
  assert.ok(elements(context).some(node => node.type === 'main'));
});
