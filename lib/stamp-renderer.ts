import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import type { StampOptions } from './stamp-options';

let ready: Promise<Uint8Array> | undefined;
function resources() {
  return ready ??= (async () => {
    const [wasm, font] = await Promise.all([readFile(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')), readFile(resolve(process.cwd(), 'assets/fonts/NotoSerifCJKsc-Regular.otf'))]);
    await initWasm(wasm);
    return new Uint8Array(font);
  })().catch(error => { ready = undefined; throw error; });
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const n = (value: number) => value.toFixed(2);
function label(text: string, x: number, y: number, size: number, rotation = 0) {
  return `<text x="0" y="0" text-anchor="middle" font-size="${n(size)}" transform="translate(${n(x)} ${n(y)}) rotate(${n(rotation)})">${escape(text)}</text>`;
}
function curved(text: string, rx: number, ry: number, size: number, span: number, bottom = false) {
  const letters = [...text];
  const count = letters.length;
  const maxSize = (span * Math.PI / 180) * Math.min(rx, ry) / Math.max(1, count) * 0.92;
  return letters.map((letter, index) => {
    const angle = bottom ? 90 + span / 2 - (count === 1 ? span / 2 : index * span / (count - 1)) : -90 - span / 2 + (count === 1 ? span / 2 : index * span / (count - 1));
    const radians = angle * Math.PI / 180;
    return label(letter, 500 + rx * Math.cos(radians), 500 + ry * Math.sin(radians), Math.min(size, maxSize), angle + (bottom ? -90 : 90));
  }).join('');
}
function star() {
  return `<polygon points="${Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? 35 : 88, angle = (-90 + index * 36) * Math.PI / 180;
    return `${n(500 + radius * Math.cos(angle))},${n(475 + radius * Math.sin(angle))}`;
  }).join(' ')}" />`;
}

export function stampSvg(options: StampOptions, preview = false) {
  const o = options;
  let body = '';
  if (o.shape === 'circle' || o.shape === 'ellipse') {
    const ry = o.shape === 'ellipse' ? 305 : 410;
    body = `<ellipse cx="500" cy="500" rx="410" ry="${ry}" fill="none" stroke="currentColor" stroke-width="${o.border}" />`;
    if (o.innerRing) body += `<ellipse cx="500" cy="500" rx="382" ry="${ry - 28}" fill="none" stroke="currentColor" stroke-width="${n(o.border * .4)}" />`;
    body += curved(o.text, 410 - o.fontSize - 12, ry - o.fontSize - 12, o.fontSize, o.arc);
    if (o.symbol === 'star') body += star();
    if (o.symbol === 'dot') body += '<circle cx="500" cy="475" r="35" />';
    body += label(o.subtitle, 500, o.shape === 'ellipse' ? 640 : 670, Math.min(76, 590 / Math.max(1, [...o.subtitle].length)));
    body += curved(o.code, 360, ry - 40, 28, Math.min(100, Math.max(30, o.code.length * 5)), true);
  } else {
    body = `<rect x="140" y="140" width="720" height="720" rx="${o.shape === 'name' ? 16 : 36}" fill="none" stroke="currentColor" stroke-width="${o.border}" />`;
    if (o.innerRing) body += `<rect x="166" y="166" width="668" height="668" rx="12" fill="none" stroke="currentColor" stroke-width="${n(o.border * .4)}" />`;
    const letters = [...o.text];
    if (o.shape === 'name') {
      body += letters.map((letter, index) => label(letter, letters.length <= 2 ? 500 : (index < 2 ? 660 : 350), (index % 2 ? 715 : 410), 250)).join('');
    } else {
      const columns = letters.length <= 4 ? 2 : letters.length <= 9 ? 3 : 4;
      const rows = Math.ceil(letters.length / columns), cellHeight = (o.subtitle || o.code ? 460 : 560) / rows, size = Math.min(205, 520 / columns, cellHeight * .78);
      body += letters.map((letter, index) => label(letter, 500 + ((index % columns) - (Math.min(columns, letters.length - Math.floor(index / columns) * columns) - 1) / 2) * (size + 14), 220 + size + Math.floor(index / columns) * cellHeight, size)).join('');
      body += label(o.subtitle, 500, 748, Math.min(60, 580 / Math.max(1, [...o.subtitle].length)));
      body += label(o.code, 500, 815, 25);
    }
  }
  const background = o.background === 'white' ? '<rect width="1000" height="1000" fill="white" />' : '';
  const watermark = preview ? '<g fill="#718096" opacity=".38" font-size="40" text-anchor="middle" transform="rotate(-28 500 500)"><text x="500" y="310">宇星商城 · 效果预览</text><text x="500" y="540">宇星商城 · 效果预览</text><text x="500" y="770">宇星商城 · 效果预览</text></g>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><g font-family="Noto Serif CJK SC">${background}<g color="${o.color}" fill="${o.color}" transform="rotate(${o.rotation} 500 500)">${body}</g>${watermark}</g></svg>`;
}

export async function renderStamp(options: StampOptions, preview = false): Promise<Buffer> {
  const font = await resources();
  const renderer = new Resvg(stampSvg(options, preview), { font: { fontBuffers: [font], defaultFontFamily: 'Noto Serif CJK SC' }, fitTo: { mode: 'width', value: preview ? 420 : options.size } });
  try {
    const result = renderer.render();
    try { return Buffer.from(result.asPng()); }
    finally { result.free(); }
  } finally { renderer.free(); }
}
