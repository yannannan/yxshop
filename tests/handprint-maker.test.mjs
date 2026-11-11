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

const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
const inkTotal = image => image.data.reduce((sum, value, i) => sum + (i % 4 === 3 ? value : 0), 0);
function inkRectangle() {
  const image = source(180, 200, [201, 52, 48, 0]);
  for (let y = 20; y < 180; y++) for (let x = 20; x < 160; x++) image.data[(y * image.width + x) * 4 + 3] = 255;
  return image;
}
const crease = changes => ({ ...raster.defaultHandprintCrack, id: 'fixed-crease', ...changes });
const effect = (image, cracks = [], edgeFade = 0) => raster.applyHandprintEffects(image, { cracks, edgeFade });

test('边缘淡化沿印迹外轮廓渐变，不淡化内部纹路缝隙，不修改原图，重置完全恢复', () => {
  const image = inkRectangle();
  for (let y = 40; y < 160; y += 4) for (let x = 40; x < 140; x++) image.data[(y * image.width + x) * 4 + 3] = 0;
  const before = image.data.slice(), shape = raster.handprintSurface(image);
  assert.deepEqual([shape.left, shape.top, shape.inkWidth, shape.inkHeight], [20, 20, 140, 160]);
  assert.equal(effect(image), image);
  const faded = raster.applyHandprintEffects(image, { edgeFade: 70, cracks: [] }, shape);
  assert.ok(alphaAt(faded, 20, 100) < 10);
  assert.ok(alphaAt(faded, 32, 100) > alphaAt(faded, 20, 100));
  assert.equal(alphaAt(faded, 90, 101), 255, 'interior ridges beside a transparent gap retain full opacity');
  assert.equal(alphaAt(faded, 90, 100), 0);
  assert.equal(alphaAt(faded, 5, 5), 0);
  assert.ok(inkTotal(effect(image, [], 35)) > inkTotal(faded));
  for (let i = 0; i < before.length; i++) if (i % 4 !== 3) assert.equal(faded.data[i], before[i]);
  assert.deepEqual(image.data, before); assert.deepEqual([faded.width, faded.height], [180, 200]);
  assert.equal(effect(image), image, 'reset returns the source bitmap rather than progressively reprocessing it');
});

test('上传照片白边不影响淡化范围，随机图案与照片提取均可使用同一效果', () => {
  const photo = source(180, 200, [255, 255, 255, 255]);
  for (let y = 20; y < 180; y++) for (let x = 20; x < 160; x++) photo.data.set([180, 20, 30, 255], (y * photo.width + x) * 4);
  const extracted = raster.extractHandprint(photo, raster.fullHandprintCrop, '#c93430', 60, 'red');
  const cropped = raster.extractHandprint(photo, { x: 20 / 180, y: .1, width: 140 / 180, height: .8 }, '#c93430', 60, 'red');
  const fullFade = effect(extracted, [], 70), cropFade = effect(cropped, [], 70);
  for (const [x, y] of [[0, 50], [8, 50], [40, 70]]) assert.equal(alphaAt(fullFade, x + 20, y + 20), alphaAt(cropFade, x, y));
  const random = raster.randomHandprint(1234, '#c93430', 60);
  assert.ok(inkTotal(effect(random, [crease({ angle: 33 })], 65)) < inkTotal(random));
});

test('横穿裂纹透明擦除，可独立改变角度、长度、宽度与位置，多条裂纹确定性叠加', () => {
  const image = inkRectangle(), original = image.data.slice();
  const horizontal = effect(image, [crease({ width: 8 })]), vertical = effect(image, [crease({ angle: 90, width: 8 })]);
  const changedBounds = output => {
    const xs = [], ys = [];
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (alphaAt(output, x, y) < alphaAt(image, x, y)) { xs.push(x); ys.push(y); }
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  };
  const h = changedBounds(horizontal), v = changedBounds(vertical);
  assert.ok(h.right - h.left > 100 && h.bottom - h.top < 20);
  assert.ok(v.bottom - v.top > 120 && v.right - v.left < 20);
  assert.ok(inkTotal(effect(image, [crease({ length: 30, width: 8 })])) > inkTotal(horizontal));
  assert.ok(inkTotal(effect(image, [crease({ width: 16 })])) < inkTotal(horizontal));
  const movedH = changedBounds(effect(image, [crease({ width: 8, y: 25 })]));
  const movedV = changedBounds(effect(image, [crease({ width: 8, angle: 90, x: 25 })]));
  assert.ok(movedH.bottom < h.top - 25); assert.ok(movedV.right < v.left - 20);
  const angled = effect(image, [crease({ angle: -37, width: 4, length: 70 })]);
  assert.notDeepEqual(angled.data, horizontal.data); assert.notDeepEqual(angled.data, vertical.data);
  assert.deepEqual(angled.data, effect(image, [crease({ angle: -37, width: 4, length: 70 })]).data);
  const both = effect(image, [crease({ width: 8 }), crease({ id: 'cross', angle: 90, width: 8 })]);
  assert.ok(inkTotal(both) < inkTotal(horizontal));
  assert.ok([...horizontal.data].some((value, i) => i % 4 === 3 && value === 0 && original[i] === 255));
  for (let i = 0; i < original.length; i++) if (i % 4 !== 3) assert.equal(both.data[i], original[i], 'erase alpha instead of drawing white over a document');
  assert.deepEqual(image.data, original);
});

test('效果拒绝非法范围及过多裂纹，完全透明时明确报错', () => {
  const image = inkRectangle();
  for (const changes of [{ angle: 181 }, { angle: NaN }, { length: 0 }, { length: 201 }, { width: .1 }, { width: 81 }, { x: -1 }, { y: 101 }, { id: '' }]) {
    assert.throws(() => effect(image, [crease(changes)]), /参数/);
  }
  assert.throws(() => effect(image, [], 101), /参数/);
  assert.throws(() => effect(image, Array.from({ length: 7 }, (_, i) => crease({ id: String(i) }))), /参数/);
  assert.throws(() => effect(source(10, 10, [201, 52, 48, 255]), [crease({ width: 80, length: 200 })]), /完全透明/);
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
    document: { activeElement: { focus() {} }, createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => source(20, 10, [190, 20, 30, 255]) }) }) },
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
    for (const node of nodes(tree)) {
      if (node.type === 'canvas') node.props.ref.current = { getContext: () => ({ putImageData() {} }) };
      if (node.type === 'dialog') node.props.ref.current = { showModal() {}, close() {} };
      if (node.type === 'input' && node.props.ref) node.props.ref.current = { focus() {}, select() {} };
    }
    for (const effect of effects) effect();
    return tree;
  }
  const find = predicate => nodes(tree).find(predicate);
  const button = label => find(node => node.type === 'button' && nodes(node).some(child => [child.props.children].flat().includes(label)));
  render();
  function confirm(name) {
    button('保存手印').props.onClick(); render();
    if (name !== undefined) { find(node => node.props.id === 'hp-save-name').props.onChange({ target: { value: name } }); render(); }
    find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render();
  }
  return { props, saves, used, removed, find, button, render, confirm, html: () => renderToStaticMarkup(tree), get closed() { return closed; } };
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
  h.confirm();
  assert.equal(h.saves[0][0], '手印'); assert.deepEqual([h.saves[0][1].width, h.saves[0][1].height], [16, 7]);
});

test('随机手印保存重试沿用任务编号，改参数创建新任务，制作记录可下载和选用', () => {
  const h = harness();
  h.button('随机生成').props.onClick(); h.render();
  h.confirm('随机图案1'); h.confirm();
  assert.equal(h.saves.length, 2); assert.equal(h.saves[0][2], h.saves[1][2]);
  h.button('换一个图案').props.onClick(); h.render(); h.confirm();
  assert.notEqual(h.saves[2][2], h.saves[1][2]);
  h.props.access.handprints = [{ id: 'own', name: '我的手印', previewUrl: '/private/handprint', createdAt: '2026-11-11' }]; h.render();
  assert.ok(h.find(node => node.type === 'a' && node.props.href === '/private/handprint' && node.props.download));
  h.button('用于签署').props.onClick(); assert.equal(h.used[0].id, 'own');
  h.find(node => node.props['aria-label'] === '删除手印').props.onClick(); assert.deepEqual(h.removed, ['own']);
  h.props.access.handprintReady = false; h.render(); assert.equal(h.button('保存手印').props.disabled, true);
  assert.match(h.html(), /14号/);
});

test('保存时弹出命名窗口，空名称阻止保存，取消与Escape不扣费，确认后才提交并清理名称空格', () => {
  const h = harness();
  h.button('随机生成').props.onClick(); h.render();
  assert.equal(h.find(node => node.type === 'input' && node.props.maxLength === 48), undefined, 'no name field on the main work area');
  assert.equal(h.button('保存手印').props.disabled, false);
  h.button('保存手印').props.onClick(); h.render(); assert.equal(h.saves.length, 0);
  assert.ok(h.find(node => node.type === 'dialog'));
  h.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); h.render();
  assert.match(h.html(), /请输入手印名称/); assert.equal(h.saves.length, 0);
  h.button('取消').props.onClick(); h.render(); assert.equal(h.find(node => node.type === 'dialog'), undefined);
  h.button('保存手印').props.onClick(); h.render();
  h.find(node => node.type === 'dialog').props.onCancel(); h.render(); assert.equal(h.saves.length, 0);
  h.confirm(' 自定义手印 '); assert.equal(h.saves[0][0], '自定义手印');
  h.confirm(); assert.equal(h.saves[0][2], h.saves[1][2], 'confirming the same named image must retry the original task');
});

test('随机和照片效果可预览、重置、增删，调整不会保存扣费，确认后的实际像素含淡化与裂纹', async () => {
  const h = harness(), adjust = (label, value) => { h.find(node => node.props.label === label).props.onChange(value); h.render(); };
  h.button('随机生成').props.onClick(); h.render(); h.confirm('效果手印');
  const original = h.saves[0][1];
  adjust('边缘淡化', 60);
  h.button('添加裂纹').props.onClick(); h.render();
  for (const [label, value] of [['裂纹角度', -37], ['裂纹长度', 75], ['裂纹宽度', 8], ['裂纹横向位置', 35], ['裂纹纵向位置', 65]]) adjust(label, value);
  assert.equal(h.saves.length, 1, 'all preview adjustments must be free of save calls');
  h.confirm(); h.confirm();
  assert.notEqual(h.saves[1][2], h.saves[0][2]); assert.equal(h.saves[1][2], h.saves[2][2]);
  assert.ok(inkTotal(h.saves[1][1]) < inkTotal(original));
  const sourceWithEffects = raster.applyHandprintEffects(original, { edgeFade: 60, cracks: [{ ...crease(), id: h.find(node => node.props.label === '裂纹角度').props.id.slice(3, -6), angle: -37, length: 75, width: 8, x: 35, y: 65 }] });
  assert.deepEqual(h.saves[1][1].data, sourceWithEffects.data, 'saved pixels must match the preview effect parameters');
  h.find(node => node.props['aria-label'] === '删除裂纹 1').props.onClick(); h.render();
  assert.equal(h.find(node => node.props.label === '裂纹角度'), undefined);
  for (let i = 0; i < 6; i++) { h.button('添加裂纹').props.onClick(); h.render(); }
  assert.equal(h.button('添加裂纹').props.disabled, true);
  h.button('重置效果').props.onClick(); h.render();
  assert.equal(h.find(node => node.props.label === '边缘淡化').props.value, 0); h.confirm();
  assert.deepEqual(h.saves.at(-1)[1].data, original.data);
  h.button('上传提取').props.onClick(); h.render();
  h.find(node => node.type === 'input' && node.props.type === 'file' && !node.props.capture).props.onChange({ target: { value: 'picked', files: [{ type: 'image/png', size: 100, name: '照片.png' }] } });
  await new Promise(resolve => setImmediate(resolve)); h.render();
  h.confirm('照片'); const photo = h.saves.at(-1)[1];
  adjust('边缘淡化', 65); h.button('添加裂纹').props.onClick(); h.render(); adjust('裂纹宽度', 1);
  h.confirm(); assert.ok(inkTotal(h.saves.at(-1)[1]) < inkTotal(photo));
  adjust('裂纹宽度', 80); adjust('裂纹长度', 200);
  assert.equal(h.button('保存手印').props.disabled, true); assert.match(h.html(), /当前效果使手印完全透明/);
});
