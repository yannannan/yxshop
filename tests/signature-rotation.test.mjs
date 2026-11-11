import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';
import { degrees, PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';

const spec = await tsImport('../lib/signature-tool.ts', import.meta.url);
const geometry = await tsImport('../lib/signature-geometry.ts', import.meta.url);
const render = await tsImport('../lib/signature-render.ts', import.meta.url);
const id = '11111111-1111-4111-8111-111111111111';
const position = { signatureId: id, page: 1, x: .35, y: .4, width: .3, height: .2 };
const near = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-5, `${message}: ${a} != ${b}`);
const colors = [[240, 20, 30, 255], [20, 220, 60, 255], [20, 60, 240, 255], [230, 200, 20, 255]];
function marker() {
  const image = new PNG({ width: 6, height: 4 });
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
    if (x === 2 || x === 3) continue;
    image.data.set(colors[(y >= 2 ? 2 : 0) + (x >= 4 ? 1 : 0)], (y * 6 + x) * 4);
  }
  return PNG.sync.write(image);
}
const previewPoint = (p, width, height, u, v) => {
  const angle = (p.rotation ?? 0) * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  const dx = (u - .5) * p.width * width, dy = (v - .5) * p.height * height;
  return [(p.x + p.width / 2) * width + dx * cosine - dy * sine,
    (p.y + p.height / 2) * height + dx * sine + dy * cosine];
};

test('三类素材共用角度校验，零角度兼容旧任务指纹，拒绝非整数及非有限角度', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const asset of [undefined, 'stamp', 'handprint']) {
    const original = asset ? { ...position, asset } : position;
    assert.deepEqual(spec.parseSignaturePlacements([{ ...original, rotation: 0 }]), [original]);
    assert.equal(hash(spec.parseSignaturePlacements([{ ...original, rotation: -0 }])), hash([original]));
    for (const rotation of [-180, -45, 30, 180]) assert.equal(spec.parseSignaturePlacements([{ ...original, rotation }])[0].rotation, rotation);
    for (const rotation of [-181, 181, .5, '90', null, NaN, Infinity, {}, []]) {
      assert.throws(() => spec.parseSignaturePlacements([{ ...original, rotation }]), /旋转角度/);
    }
  }
});

test('旋转、拖动和放大后的约束同时保留原矩形与旋转四角，适配纵向横向页面', () => {
  for (const aspect of [.1, .707, 1, 1.8, 10]) for (let rotation = -180; rotation <= 180; rotation += 15) {
    const input = { ...position, x: -.2, y: .95, width: .9, height: .8, rotation };
    const fitted = geometry.fitSigningPlacement(input, aspect), box = geometry.signingBounds(fitted, aspect);
    for (const frame of [fitted, box]) {
      assert.ok(frame.x >= -1e-8 && frame.y >= -1e-8);
      assert.ok(frame.x + frame.width <= 1.00000001 && frame.y + frame.height <= 1.00000001);
    }
    near(fitted.width / fitted.height, input.width / input.height, 'preserve asset proportions');
    const range = geometry.signingPositionRange(fitted, aspect);
    assert.ok(fitted.x >= range.minX - 1e-8 && fitted.x <= range.maxX + 1e-8);
    assert.ok(fitted.y >= range.minY - 1e-8 && fitted.y <= range.maxY + 1e-8);
  }
  const fitted = geometry.fitSigningPlacement({ ...position, rotation: 33 }, 1);
  near(fitted.x, position.x); near(fitted.y, position.y);
});

test('PNG 中的三类素材按预览方向绕中心旋转，保留透明间隙和底图', () => {
  const png = marker();
  for (const [width, height] of [[100, 100], [140, 80], [80, 140]]) for (const asset of [undefined, 'stamp', 'handprint']) for (const rotation of [-180, -90, -37, 0, 45, 90]) {
    const placement = { ...position, ...(asset ? { asset } : {}), rotation };
    const output = PNG.sync.read(render.signImage({ width, height, data: new Uint8Array(width * height * 4) },
      [placement], new Map([[spec.signingAssetKey(placement), png]])));
    for (const [index, [u, v]] of [[1 / 6, .25], [5 / 6, .25], [1 / 6, .75], [5 / 6, .75]].entries()) {
      const [x, y] = previewPoint(placement, width, height, u, v), offset = (Math.floor(y) * width + Math.floor(x)) * 4;
      assert.ok([...output.data.subarray(offset, offset + 4)].every((channel, c) => Math.abs(channel - colors[index][c]) <= 2), `${asset} ${rotation} corner ${index}`);
    }
    assert.equal(output.data[(height / 2 * width + width / 2) * 4 + 3], 0, 'transparent center stays transparent');
    assert.equal(output.data[3], 0, 'uncovered area is unchanged');
  }
  const opaque = { width: 100, height: 100, data: Uint8Array.from({ length: 40_000 }, (_, i) => [0, 0, 200, 255][i % 4]) };
  const half = new PNG({ width: 1, height: 1 }); half.data.set([200, 10, 10, 128]);
  const output = PNG.sync.read(render.signImage(opaque, [{ ...position, rotation: 37 }], new Map([[id, PNG.sync.write(half)]])));
  assert.deepEqual([...output.data.subarray((50 * 100 + 50) * 4, (50 * 100 + 50) * 4 + 4)], [100, 5, 105, 255]);
});

test('旋转 PNG 的透明边缘不产生黑边，越出页面的旋转请求被拒绝', () => {
  const edge = new PNG({ width: 2, height: 1 }); edge.data.set([255, 0, 0, 255, 0, 0, 0, 0]);
  const output = PNG.sync.read(render.signImage({ width: 100, height: 100, data: new Uint8Array(40_000) },
    [{ ...position, rotation: 37 }], new Map([[id, PNG.sync.write(edge)]])));
  for (let i = 0; i < output.data.length; i += 4) if (output.data[i + 3]) {
    assert.deepEqual([...output.data.subarray(i, i + 3)], [255, 0, 0]);
  }
  assert.throws(() => render.signImage({ width: 100, height: 100, data: new Uint8Array(40_000) },
    [{ ...position, x: 0, y: 0, rotation: 45 }], new Map([[id, marker()]])), /旋转后的素材超出/);
});

const multiply = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

test('实际导出 PDF 的图像绘制矩阵匹配预览，覆盖四种页面旋转、裁剪与任意素材角度', async () => {
  const input = await PDFDocument.create(), placements = [];
  for (const crop of [[20, 30, 200, 160], [-20, -30, 250, 200]]) for (const pageRotation of [0, 90, 180, 270]) for (const rotation of [-145, -90, -37, 0, 37, 90, 180]) {
    const page = input.addPage([300, 240]); page.setCropBox(...crop); page.setRotation(degrees(pageRotation));
    const asset = [undefined, 'stamp', 'handprint'][placements.length % 3];
    placements.push({ ...position, page: placements.length + 1, rotation, ...(asset ? { asset } : {}) });
  }
  const images = new Map(placements.map(placement => [spec.signingAssetKey(placement), marker()]));
  const bytes = await render.signPdf(await input.save(), placements, images);
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: Uint8Array.from(bytes) });
  try {
    const pdf = await loading.promise; assert.equal(pdf.numPages, 56);
    for (const placement of placements) {
      const page = await pdf.getPage(placement.page), viewport = page.getViewport({ scale: 1 });
      const operators = await page.getOperatorList(), stack = [], matrices = [];
      let matrix = [1, 0, 0, 1, 0, 0];
      for (let i = 0; i < operators.fnArray.length; i++) {
        const op = operators.fnArray[i], args = operators.argsArray[i];
        if (op === OPS.save) stack.push(matrix.slice());
        if (op === OPS.restore) matrix = stack.pop();
        if (op === OPS.transform) matrix = multiply(matrix, args);
        if (op === OPS.paintImageXObject) matrices.push(matrix.slice());
      }
      assert.equal(matrices.length, 1);
      const screen = multiply(viewport.transform, matrices[0]);
      for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 1], [.5, .5]]) {
        const actual = transform(screen, u, 1 - v);
        const expected = previewPoint(placement, viewport.width, viewport.height, u, v);
        near(actual[0], expected[0], 'PDF x'); near(actual[1], expected[1], 'PDF y');
      }
    }
  } finally { await loading.destroy(); }
});
