import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function mount({ reduced = false, fine = true } = {}) {
  const styles = () => { const values = new Map(); return { values, setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) }; };
  class Element {
    style = styles(); attrs = new Map(); scrollLeft = 0; scrollTop = 0;
    getBoundingClientRect() { return { left: 100, top: 50, width: 200, height: 100 }; }
    closest() { return this; } contains(other) { return other === this; }
    setAttribute(key, value) { this.attrs.set(key, value); } removeAttribute(key) { this.attrs.delete(key); }
  }
  const card = new Element(), nav = new Element(), selected = new Element();
  selected.getBoundingClientRect = () => ({ left: 120, top: 90, width: 150, height: 40 });
  nav.querySelector = () => selected;
  const listeners = new Map(), windowListeners = new Map(), frames = new Map(); let serial = 0, effect;
  const preferences = [{ matches: reduced, addEventListener() {}, removeEventListener() {} }, { matches: fine, addEventListener() {}, removeEventListener() {} }];
  const observers = [];
  class Observer { constructor() { observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const window = { matchMedia: query => query.includes('reduced-motion') ? preferences[0] : preferences[1], requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; }, cancelAnimationFrame: id => frames.delete(id), addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: name => windowListeners.delete(name) };
  const document = { body: new Element(), querySelectorAll: () => [nav], addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../components/glass-effects.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.equal(name, 'react'); return { useEffect: fn => { effect = fn; } }; }, window, document, Element, HTMLElement: Element, Node: Element, MutationObserver: Observer, ResizeObserver: Observer });
  exports.GlassEffects(); const unmount = effect();
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  return { listeners, windowListeners, frames, preferences, card, nav, flush, unmount, observers };
}

test('玻璃动效只绑定一组监听，同一帧内大量鼠标移动合并，移出及卸载清理状态', () => {
  const host = mount(); host.flush();
  assert.equal(host.nav.style.values.get('--nav-x'), '20px'); assert.equal(host.nav.style.values.get('--nav-y'), '40px');
  host.listeners.get('pointerover')({ target: host.card });
  for (let i = 0; i < 100; i++) host.listeners.get('pointermove')({ clientX: 250, clientY: 125 });
  assert.equal(host.frames.size, 1); host.flush();
  assert.equal(host.card.style.values.get('--glow-x'), '150px');
  assert.ok(Math.abs(parseFloat(host.card.style.values.get('--tilt-x'))) <= 1.5);
  host.listeners.get('pointerout')({ relatedTarget: null }); assert.equal(host.card.style.values.size, 0);
  host.unmount(); assert.equal(host.frames.size, 0); assert.equal(host.listeners.size, 0); assert.equal(host.windowListeners.size, 0); assert.ok(host.observers.every(o => o.disconnected));
});

for (const options of [{ reduced: true }, { fine: false }]) test('减少动态效果或触控设备不跟随鼠标: ' + JSON.stringify(options), () => {
  const host = mount(options); host.flush();
  host.listeners.get('pointerover')({ target: host.card }); host.listeners.get('pointermove')({ clientX: 250, clientY: 125 }); host.flush();
  assert.equal(host.card.style.values.size, 0); host.unmount();
});
