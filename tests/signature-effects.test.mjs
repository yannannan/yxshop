import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { tsImport } from 'tsx/esm/api';
import { PNG } from 'pngjs';
import { PDFDocument } from 'pdf-lib';

const effects = await tsImport('../lib/signature-effects.ts', import.meta.url);
const spec = await tsImport('../lib/signature-tool.ts', import.meta.url);
const render = await tsImport('../lib/signature-render.ts', import.meta.url);
const id = '11111111-1111-4111-8111-111111111111';
const placement = { signatureId: id, page: 1, x: .1, y: .1, width: .2, height: .2 };
function ink() {
  const image = { width: 40, height: 40, data: new Uint8Array(6400) };
  for (let y = 4; y < 36; y++) for (let x = 4; x < 36; x++) {
    if ((x === 19 || x === 20) && y > 10 && y < 30) continue;
    image.data.set([220, 20, 30, 200], (y * 40 + x) * 4);
  }
  return image;
}
const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
const png = image => PNG.sync.write({ ...image, data: Buffer.from(image.data) });

test('三类素材的透明与淡化参数严格校验，默认值保留旧任务指纹', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const asset of [undefined, 'stamp', 'handprint']) {
    const original = asset ? { ...placement, asset } : placement;
    assert.equal(hash(spec.parseSignaturePlacements([{ ...original, opacity: 100, edgeFade: 0 }])), hash([original]));
    for (const key of ['opacity', 'edgeFade']) {
      for (const value of [-1, 101, .5, '50', null, NaN, Infinity, {}, []]) assert.throws(() => spec.parseSignaturePlacements([{ ...original, [key]: value }]), /透明度和边缘淡化/);
      for (const value of [0, 50, 100]) assert.equal(spec.parseSignaturePlacements([{ ...original, [key]: value }])[0][key] ?? (key === 'opacity' ? 100 : 0), value);
      assert.notEqual(hash(spec.parseSignaturePlacements([{ ...original, [key]: 50 }])), hash([original]));
    }
  }
});

test('共享像素算法只淡化印迹外侧，保留内部笔画和透明空隙，不修改原素材', () => {
  const original = ink(), copy = original.data.slice();
  assert.equal(effects.applySigningEffects(original, {}), original);
  const faded = effects.applySigningEffects(original, { edgeFade: 80 });
  assert.ok(alpha(faded, 4, 20) >= 40 && alpha(faded, 4, 20) < 43, '80%淡化保留约20%边缘印迹，避免中等数值直接抹掉边框');
  assert.equal(alpha(faded, 18, 20), 200, '内部缝隙旁的笔画仍保留浓度');
  assert.equal(alpha(faded, 19, 20), 0);
  assert.equal(alpha(faded, 0, 0), 0);
  const half = effects.applySigningEffects(original, { opacity: 50, edgeFade: 80 });
  assert.equal(alpha(half, 18, 20), 100);
  for (let i = 0; i < half.data.length; i++) if (i % 4 !== 3) assert.equal(half.data[i], original.data[i]);
  assert.deepEqual(original.data, copy);
  assert.ok(effects.applySigningEffects(original, { opacity: 0, edgeFade: 100 }).data.every((value, i) => i % 4 !== 3 || value === 0));
  const empty = { ...original, data: new Uint8Array(original.data.length) };
  assert.doesNotThrow(() => effects.applySigningEffects(empty, { edgeFade: 100 }));
});

test('同一素材重复放置可各自调整，图片导出使用共享效果像素且保持旋转和底图', () => {
  const original = ink(), data = png(original);
  for (const asset of [undefined, 'stamp', 'handprint']) {
    const p = { ...placement, ...(asset ? { asset } : {}) }, key = spec.signingAssetKey(p);
    const placements = [{ ...p, x: 0, y: 0, width: .4, height: .4 }, { ...p, x: .5, y: 0, width: .4, height: .4, opacity: 50, edgeFade: 80 }];
    const result = PNG.sync.read(render.signImage({ width: 100, height: 100, data: new Uint8Array(40000) }, placements, new Map([[key, data]])));
    assert.equal(alpha(result, 18, 20), 200);
    assert.equal(alpha(result, 68, 20), 100);
    assert.ok(alpha(result, 54, 20) >= 20 && alpha(result, 54, 20) < 23);
    const expected = effects.applySigningEffects(original, placements[1]);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) assert.equal(alpha(result, 50 + x, y), alpha(expected, x, y));
    const rotated = PNG.sync.read(render.signImage({ width: 100, height: 100, data: new Uint8Array(40000) }, [{ ...p, rotation: 37, opacity: 50, edgeFade: 80 }], new Map([[key, data]])));
    assert.ok(rotated.data.some((value, i) => i % 4 === 3 && value >= 98 && value <= 100));
    for (let i = 0; i < rotated.data.length; i += 4) if (rotated.data[i + 3]) assert.deepEqual([...rotated.data.slice(i, i + 3)], [220, 20, 30]);
    const blue = { width: 100, height: 100, data: Uint8Array.from({ length: 40000 }, (_, i) => [0, 0, 200, 255][i % 4]) };
    const before = blue.data.slice();
    assert.deepEqual(PNG.sync.read(render.signImage(blue, [{ ...p, opacity: 0, rotation: -37, edgeFade: 100 }], new Map([[key, data]]))).data, Buffer.from(before));
  }
});

test('PDF为同一素材的不同效果分别嵌入alpha像素，默认复位与原图一致', async () => {
  const original = ink(), input = await PDFDocument.create(); input.addPage([400, 400]);
  const placements = [{ ...placement }, { ...placement, x: .4, opacity: 50, edgeFade: 80 }, { ...placement, y: .5, opacity: 0 }];
  const bytes = await render.signPdf(await input.save(), placements, new Map([[id, png(original)]]));
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: Uint8Array.from(bytes) });
  try {
    const pdf = await loading.promise, page = await pdf.getPage(1), ops = await page.getOperatorList();
    const images = ops.fnArray.flatMap((op, i) => op === OPS.paintImageXObject ? [page.objs.get(ops.argsArray[i][0])] : []);
    assert.equal(images.length, 3);
    for (let i = 0; i < images.length; i++) {
      assert.equal(images[i].width, 40); assert.equal(images[i].height, 40);
      const expected = effects.applySigningEffects(original, placements[i]);
      for (let p = 3; p < expected.data.length; p += 4) assert.equal(images[i].data[p], expected.data[p]);
    }
  } finally { await loading.destroy(); }
});

test('浏览器预览用同一像素算法并缓存轮廓，切换素材不保留旧图或过期异步结果', () => {
  const source = ink(), slots = [], images = [], pending = [];
  let cursor = 0, pixels, surfaceReads = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const context = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image.data.slice(); } };
  const canvas = { width: 0, height: 0, getContext: () => context };
  class Image { naturalWidth = 40; naturalHeight = 40; constructor() { images.push(this); } }
  const jsx = (type, props) => ({ type, props });
  const exports = {}, mocks = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, './language-provider': { useI18n: () => ({ t: value => value }) },
    '../lib/signature-tool': spec, '../lib/signature-effects': { ...effects, signingEffectSurface(image) { surfaceReads++; return effects.signingEffectSurface(image); } } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/signing-asset-preview.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, Uint8Array, Image, document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: source.data }) }) }) }, require: name => mocks[name] });
  const nodes = root => !root || typeof root !== 'object' ? [] : [root, ...[root.props?.children].flat().flatMap(nodes)];
  function paint(props) { cursor = 0; const tree = exports.SigningAssetPreview(props); nodes(tree).find(n => n.type === 'canvas').props.ref.current = canvas; for (const fn of pending.splice(0)) fn(); return tree; }
  const props = { src: '/private?id=1', asset: 'stamp', opacity: 50, edgeFade: 80 };
  paint(props); assert.equal(images[0].src, '/private?id=1&quality=signing');
  images[0].onload(); paint(props);
  assert.deepEqual([...pixels], [...effects.applySigningEffects(source, props).data]);
  paint({ ...props, opacity: 75 }); assert.equal(surfaceReads, 1);
  const stale = images[0].onload;
  paint({ ...props, src: '/private?id=2' }); assert.equal(canvas.width, 0); assert.equal(images[0].src, '');
  stale(); paint({ ...props, src: '/private?id=2' }); assert.equal(canvas.width, 0);
  images[1].onerror(); const failed = paint({ ...props, src: '/private?id=2' });
  assert.ok(nodes(failed).some(n => n.props?.role === 'status'));
});
