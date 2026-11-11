import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';

function load(file, mocks = {}, globals = {}) {
  const compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: name => {
    if (name in mocks) return mocks[name];
    throw Error(`Unexpected dependency: ${name}`);
  }, ...globals }, { filename: file });
  return compiled.exports;
}
const geometry = load('../lib/signature-zoom.ts');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001, `${actual} != ${expected}`);
const nodes = root => Array.isArray(root) ? root.flatMap(nodes) : !root || typeof root !== 'object' ? [] : [root, ...nodes(root.props?.children)];

// Exercise the component's actual handlers against scrollable DOM geometry.
// No browser, business API or running server is needed.
function viewportHarness({ width = 800, height = 600, aspect = .707 } = {}) {
  let tree, cursor = 0, dirty = false, pending = [], observed, disposed = false;
  const slots = [], placements = [], captures = [];
  let gestures = 0;
  const depsChanged = (previous, next) => !previous || next.some((value, i) => !Object.is(value, previous[i]));
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(slots[i], next)) { slots[i] = next; dirty = true; }
      }];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (depsChanged(slots[i]?.deps, deps)) slots[i] = { deps, fn };
      return slots[i].fn;
    },
    useLayoutEffect(fn, deps) {
      const i = cursor++;
      if (!depsChanged(slots[i]?.deps, deps)) return;
      pending.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    },
  };
  const jsx = (type, props) => ({ type, props });
  class Target {
    constructor(overlay = false) { this.overlay = overlay; }
    closest(selector) { return this.overlay && selector === '.ds-placement' ? this : null; }
  }
  const { SignatureViewport } = load('../components/signature-viewport.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@heroicons/react/24/outline': { ArrowsPointingInIcon: 'fit-icon', MinusIcon: 'minus-icon', PlusIcon: 'plus-icon' },
    './language-provider': { useI18n: () => ({ t: value => value }) },
    '../lib/signature-zoom': geometry,
  }, {
    Element: Target,
    ResizeObserver: class { constructor(callback) { observed = callback; } observe() {} disconnect() { disposed = true; } },
  });
  const find = predicate => nodes(tree).find(predicate);
  const named = name => find(node => node.props?.className === name);
  let scrollX = 0, scrollY = 0;
  const surface = {
    clientLeft: 0, clientTop: 0, clientWidth: width, clientHeight: height,
    getBoundingClientRect: () => ({ left: 50, top: 70 }),
    get scrollLeft() { return scrollX; },
    set scrollLeft(value) { scrollX = Math.max(0, Math.min(value, named('ds-preview-content').props.style.width - surface.clientWidth)); },
    get scrollTop() { return scrollY; },
    set scrollTop(value) { scrollY = Math.max(0, Math.min(value, named('ds-preview-content').props.style.height - surface.clientHeight)); },
  };
  const sheet = {
    focus() {},
    getBoundingClientRect() {
      const page = named('ds-page').props.style, content = named('ds-preview-content').props.style;
      const left = 50 + (content.width - page.width) / 2 - scrollX;
      const top = 70 + 20 - scrollY;
      return { left, top, width: page.width, height: page.height, right: left + page.width, bottom: top + page.height };
    },
  };
  const content = { setPointerCapture: id => captures.push(id) };
  const props = {
    aspect, zoom: 1, pageRef: { current: sheet },
    onZoom: value => { props.zoom = value; }, onPlace: (x, y) => placements.push({ x, y }),
    onGestureStart: () => gestures++, onDragOver() {}, onDrop() {},
  };
  function flush() {
    let count = 0;
    do {
      assert.ok(count++ < 10, 'render cycle must settle');
      dirty = false; cursor = 0; pending = [];
      tree = SignatureViewport(props);
      named('ds-preview-surface').props.ref.current = surface;
      for (const effect of pending) effect();
      surface.scrollLeft = surface.scrollLeft; surface.scrollTop = surface.scrollTop;
    } while (dirty);
  }
  function pointer(type, id, x, y, { overlay = false, pointerType = 'touch' } = {}) {
    const event = { currentTarget: content, target: new Target(overlay), clientX: x, clientY: y,
      pointerId: id, pointerType, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    named('ds-preview-content').props[type](event); flush(); return event;
  }
  function change(value) { find(node => node.type === 'input').props.onChange({ target: { value } }); flush(); }
  function button(label) { const button = find(node => node.type === 'button' && (node.props['aria-label'] === label || [node.props.children].flat().includes(label))); assert.ok(button, label); button.props.onClick(); flush(); }
  function point(x, y) { const box = sheet.getBoundingClientRect(); return { x: box.left + box.width * x, y: box.top + box.height * y }; }
  flush();
  return { surface, sheet, captures, props, placements, pointer, change, button, point, find, named,
    get gestures() { return gestures; },
    resize(w, h) { surface.clientWidth = w; surface.clientHeight = h; observed(); flush(); },
    close() { for (const slot of slots) slot?.cleanup?.(); assert.equal(disposed, true); },
  };
}

test('纵横页面适应窗口；加减、滑条和复位遵守25%至400%范围', () => {
  for (const aspect of [.707, 1.6]) {
    const h = viewportHarness({ aspect });
    let box = h.sheet.getBoundingClientRect();
    assert.ok(box.width <= 760 && box.height <= 560);
    h.button('放大文件'); near(h.props.zoom, 1.25);
    h.button('缩小文件'); near(h.props.zoom, 1);
    h.change(999); near(h.props.zoom, 4);
    assert.equal(h.find(node => node.props?.['aria-label'] === '放大文件').props.disabled, true);
    h.change(1); near(h.props.zoom, .25);
    assert.equal(h.find(node => node.props?.['aria-label'] === '缩小文件').props.disabled, true);
    h.button('适应窗口'); near(h.props.zoom, 1);
    near(h.surface.scrollLeft, 0); near(h.surface.scrollTop, 0);
    h.resize(280, 360);
    box = h.sheet.getBoundingClientRect();
    assert.ok(box.width <= 240 && box.height <= 320);
    h.close();
  }
});

test('滚动后的按钮缩放保持视口中心，点击坐标仍对应文件比例', () => {
  const h = viewportHarness();
  h.change(200); h.surface.scrollTop = 170;
  const before = h.sheet.getBoundingClientRect(), center = { x: 450, y: 370 };
  const expected = { x: (center.x - before.left) / before.width, y: (center.y - before.top) / before.height };
  h.change(300);
  const after = h.sheet.getBoundingClientRect();
  near((center.x - after.left) / after.width, expected.x);
  near((center.y - after.top) / after.height, expected.y);
  h.named('ds-page').props.onClick({ button: 0, clientX: center.x, clientY: center.y });
  near(h.placements[0].x, expected.x); near(h.placements[0].y, expected.y);
  h.close();
});

test('手机双指以手势中点缩放并可接续单指平移，松手不误放素材', () => {
  const h = viewportHarness({ width: 320, height: 480 });
  h.pointer('onPointerDownCapture', 1, 160, 310);
  const original = h.sheet.getBoundingClientRect();
  const anchor = { x: (210 - original.left) / original.width, y: (310 - original.top) / original.height };
  h.pointer('onPointerDownCapture', 2, 260, 310);
  const moved = h.pointer('onPointerMoveCapture', 2, 360, 310);
  near(h.props.zoom, 2);
  assert.equal(moved.prevented && moved.stopped, true);
  const box = h.sheet.getBoundingClientRect();
  near((260 - box.left) / box.width, anchor.x); near((310 - box.top) / box.height, anchor.y);
  assert.ok(h.captures.includes(1) && h.captures.includes(2));
  h.pointer('onPointerUpCapture', 2, 360, 310);
  const scrollBefore = h.surface.scrollTop;
  h.pointer('onPointerMoveCapture', 1, 160, 280);
  near(h.surface.scrollTop, scrollBefore + 30);
  h.pointer('onPointerUpCapture', 1, 160, 280);
  assert.equal(h.placements.length, 0);
  let blocked = false;
  h.named('ds-preview-content').props.onClickCapture({ preventDefault() { blocked = true; }, stopPropagation() {} });
  assert.equal(blocked, true, 'compatibility click after gesture must be suppressed');
  h.close();
});

test('手机轻点放置，单指拖动查看文件及取消手势均不额外放置', () => {
  const h = viewportHarness({ width: 320, height: 480 });
  h.change(200);
  const p = h.point(.4, .4);
  h.pointer('onPointerDownCapture', 1, p.x, p.y);
  h.pointer('onPointerUpCapture', 1, p.x, p.y);
  assert.equal(h.placements.length, 1); near(h.placements[0].x, .4); near(h.placements[0].y, .4);
  const scrollBefore = h.surface.scrollTop;
  h.pointer('onPointerDownCapture', 2, p.x, p.y);
  h.pointer('onPointerMoveCapture', 2, p.x, p.y - 50);
  h.pointer('onPointerUpCapture', 2, p.x, p.y - 50);
  near(h.surface.scrollTop, scrollBefore + 50); assert.equal(h.placements.length, 1);
  h.pointer('onPointerDownCapture', 3, 200, 250);
  h.pointer('onPointerCancelCapture', 3, 200, 250);
  assert.equal(h.placements.length, 1);
  h.pointer('onPointerDownCapture', 4, 200, 250);
  h.pointer('onPointerUpCapture', 4, 200, 250);
  assert.equal(h.placements.length, 2, 'tap must work after pointer cancellation');
  h.close();
});

test('单指素材拖动不被接管，第二指加入时终止素材拖动并进入缩放', () => {
  const h = viewportHarness({ width: 320, height: 480 });
  h.pointer('onPointerDownCapture', 1, 160, 310, { overlay: true });
  assert.equal(h.gestures, 0);
  assert.equal(h.pointer('onPointerMoveCapture', 1, 170, 310, { overlay: true }).stopped, false);
  h.pointer('onPointerDownCapture', 2, 270, 310);
  assert.equal(h.gestures, 1);
  h.pointer('onPointerMoveCapture', 2, 370, 310);
  near(h.props.zoom, 2);
  h.pointer('onPointerUpCapture', 1, 170, 310);
  h.pointer('onPointerUpCapture', 2, 370, 310);
  assert.equal(h.placements.length, 0);
  h.close();
});

test('鼠标事件仍走原点击和拖放路径，缩放仅改变显示大小', () => {
  const h = viewportHarness();
  assert.equal(h.pointer('onPointerDownCapture', 1, 200, 300, { pointerType: 'mouse' }).stopped, false);
  const props = h.named('ds-page').props;
  assert.equal(props.onDrop, h.props.onDrop); assert.equal(props.onDragOver, h.props.onDragOver);
  h.change(400);
  const box = h.sheet.getBoundingClientRect();
  near(box.height, 2240);
  h.surface.scrollLeft = 10000; h.surface.scrollTop = 10000;
  const bottom = h.sheet.getBoundingClientRect();
  near(bottom.right, 50 + h.surface.clientWidth - 20);
  near(bottom.bottom, 70 + h.surface.clientHeight - 20);
  assert.equal(h.placements.length, 0);
  h.close();
});

test('反复放大缩小只改变内部滚动范围，不累计顶部空白；滚轮交由原生滚动', () => {
  const h = viewportHarness();
  for (let i = 0; i < 20; i++) {
    h.change(400); h.surface.scrollTop = 9999;
    h.change(91); h.change(25); h.button('适应窗口');
    near(h.sheet.getBoundingClientRect().top, 90);
    near(h.surface.clientHeight, 600);
    near(h.named('ds-preview-content').props.style.height, 600);
    near(h.surface.scrollTop, 0);
  }
  assert.equal(h.named('ds-preview-surface').props.onWheel, undefined);
  const frame = h.named('ds-viewport-frame');
  assert.equal(frame.props.children.props.className, 'ds-preview-surface');
  const css = postcss.parse(readFileSync(new URL('../app/document-signature.css', import.meta.url), 'utf8'));
  const declarations = selector => Object.fromEntries(css.nodes.filter(node => node.type === 'rule' && node.selector === selector).flatMap(node => node.nodes.filter(child => child.type === 'decl').map(child => [child.prop, child.value])));
  assert.match(declarations('.ds-viewport-frame').contain, /size/);
  assert.equal(declarations('.ds-preview-surface').position, 'absolute', 'scroll content must not contribute to grid row height');
  assert.equal(declarations('.ds-preview-surface')['overscroll-behavior'], undefined, 'allow native wheel chaining at the document edge');
  assert.equal(declarations('.ds-preview-surface')['overflow-anchor'], 'none');
  h.close();
});

test('PDF缩放提高预览分辨率，保留签署坐标、已生成结果和原有结算', async () => {
  let cursor = 0, tree, effectQueue = [], timerId = 0, holdRender = false;
  const slots = [], timers = new Map(), rendered = [], draws = [], submitted = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (slots[i] && !deps.some((dep, index) => !Object.is(dep, slots[i].deps[index]))) return;
      effectQueue.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    },
  };
  const jsx = (type, props) => ({ type, props });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: buffer => draws.push([buffer.width, buffer.height]) }) };
  const signature = { id: 'signature', name: '手写签名', width: 100, height: 40, previewUrl: '/private/signature' };
  const handprint = { ...signature, id: 'own-handprint', name: '我的手印', height: 140 };
  const access = { signedIn: true, canProcess: true, signatures: [signature], stamps: [], handprints: [handprint], documents: [], costs: { create: 10, sign: 20, handprint: 7 }, chargeType: 'points', wordReady: true };
  const source = { name: '合同.docx', kind: 'pdf', file: {}, pdf: {
    numPages: 2,
    async getPage(page) { return {
      getViewport: ({ scale }) => ({ width: 600 * scale, height: 840 * scale }),
      render({ canvas: buffer, viewport }) {
        let reject;
        const task = { page, width: viewport.width, buffer, cancelled: false };
        rendered.push(task);
        return { promise: holdRender ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(),
          cancel() { task.cancelled = true; reject?.(Error('cancelled')); } };
      },
    }; },
  } };
  function Viewport() {}
  function HandprintMaker() {}
  const spec = load('../lib/signature-tool.ts', { './stamp-options': { isStampId: () => true } });
  const { DocumentSignature } = load('../components/document-signature.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@heroicons/react/24/outline': {},
    './language-provider': { useI18n: () => ({ t: value => value, locale: 'zh-CN' }) },
    './stamp-maker': { StampMaker() {} }, './signature-viewport': { SignatureViewport: Viewport },
    './handprint-maker': { HandprintMaker },
    '../lib/account-client': { useAccount: () => ({ account: { user: { id: 1 } } }), notifyAccountChanged() {} },
    '../lib/account': { accountLoginHref: () => '/login' }, '../lib/signature-tool': spec,
    '../lib/signature-client': { signaturePage: '/tools/document-signature.html', signatureAccess: async () => access,
      disposeSignatureSource() {}, loadSignatureSource: async () => source,
      signatureRequest: async (method, signal, metadata) => { submitted.push(metadata); return { document: { id: 'signed', name: source.name, downloadUrl: '/private/signed' } }; },
    },
  }, {
    AbortController, crypto,
    document: { createElement: () => ({ width: 0, height: 0 }) },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
  });
  const entry = DocumentSignature({ tool: { pointsCost: 10 }, stampTool: {} });
  const find = predicate => nodes(tree).find(predicate);
  const view = () => find(node => node.type === Viewport);
  const namedButton = label => find(node => node.type === 'button' && nodes(node).some(child => [child.props?.children].flat().includes(label)));
  function render() {
    cursor = 0; effectQueue = []; tree = entry.type(entry.props);
    const preview = find(node => node.type === 'canvas' && node.props['aria-label'] === '文件预览');
    if (preview) preview.props.ref.current = canvas;
    if (view()) view().props.pageRef.current = { focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400 * view().props.zoom, height: 560 * view().props.zoom }) };
    for (const effect of effectQueue) effect();
  }
  async function settle() { for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
  async function zoom(value) { view().props.onZoom(value); render(); for (const [id, fn] of timers) { timers.delete(id); fn(); } render(); await settle(); }
  render(); await settle(); namedButton('签署文件').props.onClick(); render();
  find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{ name: source.name }], value: 'chosen' } });
  await settle();
  assert.equal(draws.length, 1); assert.deepEqual(draws[0], [1200, 1680]);
  view().props.onPlace(.3, .4); render();
  const placementBefore = view().props.children.flat().find(node => node?.props?.className === 'ds-placement');
  const style = { ...placementBefore.props.style };
  namedButton('手印制作').props.onClick(); render();
  assert.equal(find(node => node.type === 'section' && node.props.id === 'ds-handprint-maker').props.hidden, false);
  find(node => node.type === HandprintMaker).props.onUse(handprint); render(); await settle();
  assert.ok(view(), 'returning from handprint creation preserves the uploaded document');
  view().props.onPlace(.7, .7); render();
  await zoom(3);
  assert.ok(draws.at(-1)[0] > 1200, 'zoom should sharpen the PDF raster');
  assert.ok(draws.at(-1)[0] * draws.at(-1)[1] < 6_010_000, 'raster must stay bounded');
  assert.deepEqual({ ...view().props.children.flat().find(node => node?.props?.className === 'ds-placement').props.style }, style);
  const placement = view().props.children.flat().find(node => node?.props?.className === 'ds-placement');
  placement.props.onPointerDown({ button: 0, pointerId: 10, clientX: 240, clientY: 630,
    stopPropagation() {}, currentTarget: { focus() {}, setPointerCapture() {} } });
  placement.props.onPointerMove({ pointerId: 10, clientX: 360, clientY: 714 });
  placement.props.onPointerUp(); render();
  namedButton('生成签署文件').props.onClick(); await settle();
  assert.equal(submitted.length, 1); assert.equal(submitted[0].cost, 20);
  assert.equal(submitted[0].placements.length, 2);
  assert.equal(submitted[0].placements[1].asset, 'handprint');
  near(submitted[0].placements[0].x, .275); near(submitted[0].placements[0].y, .45 - .25 * (600 / 840) * .4 / 2);
  await zoom(4);
  assert.ok(find(node => node.type === 'a' && node.props.href === '/private/signed'), 'zoom must preserve the existing result');
  assert.equal(submitted.length, 1, 'zoom never submits or settles a signing task');
  const visibleSize = [canvas.width, canvas.height], drawCount = draws.length;
  holdRender = true; await zoom(2);
  assert.deepEqual([canvas.width, canvas.height], visibleSize, 'keep the prior preview while rerendering');
  assert.equal(draws.length, drawCount);
  find(node => node.props?.['aria-label'] === '下一页').props.onClick(); render(); await settle();
  assert.equal(rendered.at(-2).cancelled, true);
  assert.equal(rendered.at(-2).buffer.width, 0, 'cancelled raster releases its buffer');
  assert.equal(draws.length, drawCount, 'a stale render cannot replace the next page');
  for (const slot of slots) slot?.cleanup?.();
});
