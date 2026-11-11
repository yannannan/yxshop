import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { tsImport } from 'tsx/esm/api';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raster = await tsImport('../lib/handprint-raster.ts', import.meta.url);
const require = createRequire(import.meta.url);
const source = (width, height, color) => ({ width, height, data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => color[i % 4]) });
const nodes = root => Array.isArray(root) ? root.flatMap(nodes) : React.isValidElement(root) ? [root, ...nodes(root.props.children)] : [];

test('照片提取去除白底，圈选只保留指定区域；红色和深色笔迹可分别提取', () => {
  const image = source(20, 20, [255, 255, 255, 255]);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) image.data.set([180, 20, 30, 255], (y * 20 + x) * 4);
  image.data.set([0, 0, 0, 255], 0);
  const print = raster.extractHandprint(image, raster.fullHandprintCrop, '#c93430', 60, 'red');
  assert.equal(print.data[3], 0, 'black text must be excluded in red mode');
  assert.equal(print.data[7], 0, 'white background must be transparent');
  assert.deepEqual([...print.data.subarray((6 * 20 + 6) * 4, (6 * 20 + 6) * 4 + 4)], [201, 52, 48, 255]);
  const crop = raster.extractHandprint(image, { x: .25, y: .25, width: .5, height: .5 }, '#123456', 60, 'red');
  assert.deepEqual([crop.width, crop.height], [10, 10]);
  assert.deepEqual([...crop.data.subarray(0, 4)], [18, 52, 86, 255]);
  const dark = raster.extractHandprint(source(10, 10, [20, 20, 20, 180]), raster.fullHandprintCrop, '#c93430', 60, 'dark');
  assert.equal(dark.data[3], 180, 'preserve input transparency');
  assert.throws(() => raster.extractHandprint(source(20, 20, [255, 255, 255, 255]), raster.fullHandprintCrop, '#c93430', 60, 'red'), /未提取到/);
});

test('随机图案可稳定复用同一参数，换种子外观变化，PNG像素包含透明底和印迹', () => {
  const first = raster.randomHandprint(1234, '#c93430', 60), same = raster.randomHandprint(1234, '#c93430', 60);
  const next = raster.randomHandprint(5678, '#c93430', 60);
  assert.deepEqual(first.data, same.data); assert.notDeepEqual(first.data, next.data);
  assert.ok(first.width * first.height <= 400_000);
  assert.equal(first.data[3], 0);
  assert.ok(first.data.some((value, i) => i % 4 === 3 && value > 100));
  assert.ok(first.data.some((value, i) => i % 4 === 3 && value > 0 && value < 100));
  assert.throws(() => raster.randomHandprint(1234, 'bad', 60), /颜色/);
});

function harness() {
  const slots = [], effects = [], saves = [], used = [], removed = [];
  let cursor = 0, tree, closed = 0;
  const changed = (old, deps) => !old || deps.some((dep, i) => !Object.is(dep, old[i]));
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const output = { exports: {} }, code = ts.transpileModule(readFileSync(new URL('../components/handprint-maker.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module: output, exports: output.exports,
    Uint8Array, Uint32Array, crypto: webcrypto, ImageData: class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } },
    createImageBitmap: async () => ({ width: 20, height: 10, close() { closed++; } }),
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => source(20, 10, [190, 20, 30, 255]) }) }) },
    require(name) {
      if (name === 'react') return hooks;
      if (name === './language-provider') return { useI18n: () => ({ t: value => value, locale: 'zh-CN' }) };
      if (name === '../lib/handprint-raster') return raster;
      return require(name);
    },
  });
  const props = { access: { canProcess: true, signedIn: true, handprintReady: true, handprints: [] }, busy: false, cost: 7,
    onSave: (...args) => saves.push(args), onUse: value => used.push(value), onRemove: id => removed.push(id), signIn: React.createElement('a', { href: '/login' }, '登录后使用') };
  function render() {
    cursor = 0; effects.length = 0; tree = output.exports.HandprintMaker(props);
    for (const node of nodes(tree)) if (node.type === 'canvas') node.props.ref.current = { getContext: () => ({ putImageData() {} }) };
    for (const effect of effects) effect();
    return tree;
  }
  const find = predicate => nodes(tree).find(predicate);
  const button = label => find(node => node.type === 'button' && nodes(node).some(child => [child.props.children].flat().includes(label)));
  render();
  return { props, saves, used, removed, find, button, render, html: () => renderToStaticMarkup(tree), get closed() { return closed; } };
}

test('手机拍照入口与上传提取均可用，拖动框选后的真实像素用于保存', async () => {
  const h = harness();
  assert.match(h.html(), /capture="environment"/);
  assert.equal(h.button('保存手印').props.disabled, true);
  const input = h.find(node => node.type === 'input' && node.props.type === 'file' && !node.props.capture);
  input.props.onChange({ target: { value: 'picked', files: [{ type: 'image/png', size: 100, name: '手印.png' }] } });
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.closed, 1);
  const photo = h.find(node => node.props.className === 'hp-photo');
  const event = { button: 0, pointerId: 1, clientX: 10, clientY: 10, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), setPointerCapture() {} } };
  photo.props.onPointerDown(event); photo.props.onPointerMove({ ...event, clientX: 90, clientY: 80 }); photo.props.onPointerUp(); h.render();
  assert.equal(h.button('保存手印').props.disabled, false);
  h.button('保存手印').props.onClick();
  assert.equal(h.saves[0][0], '手印'); assert.deepEqual([h.saves[0][1].width, h.saves[0][1].height], [16, 7]);
});

test('随机手印保存重试沿用任务编号，改参数创建新任务，制作记录可下载和选用', () => {
  const h = harness();
  h.button('随机生成').props.onClick(); h.render();
  h.find(node => node.type === 'input' && node.props.maxLength === 48).props.onChange({ target: { value: '随机图案1' } }); h.render();
  h.button('保存手印').props.onClick(); h.render(); h.button('保存手印').props.onClick();
  assert.equal(h.saves.length, 2); assert.equal(h.saves[0][2], h.saves[1][2]);
  h.button('换一个图案').props.onClick(); h.render(); h.button('保存手印').props.onClick();
  assert.notEqual(h.saves[2][2], h.saves[1][2]);
  h.props.access.handprints = [{ id: 'own', name: '我的手印', previewUrl: '/private/handprint', createdAt: '2026-11-11' }]; h.render();
  assert.ok(h.find(node => node.type === 'a' && node.props.href === '/private/handprint' && node.props.download));
  h.button('用于签署').props.onClick(); assert.equal(h.used[0].id, 'own');
  h.find(node => node.props['aria-label'] === '删除手印').props.onClick(); assert.deepEqual(h.removed, ['own']);
  h.props.access.handprintReady = false; h.render(); assert.equal(h.button('保存手印').props.disabled, true);
  assert.match(h.html(), /14号/);
});
