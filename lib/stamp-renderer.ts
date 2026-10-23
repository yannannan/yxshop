import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import jpeg from 'jpeg-js';
import type { StampFont, StampOptions } from './stamp-options';

const fonts = {
  serif: { file: 'NotoSerifCJKsc-Regular.otf', family: 'Noto Serif CJK SC' },
  sans: { file: 'NotoSansCJKsc-Regular.otf', family: 'Noto Sans CJK SC' },
  kai: { file: 'LXGWWenKai-Regular.ttf', family: 'LXGW WenKai' },
} satisfies Record<StampFont, { file: string; family: string }>;
// 开发热更新会重新执行本模块，外部 Wasm 包却仍然是同一实例。
// 按初始化函数实例保存 Promise，既跨热更新共享，也隔离不同模块运行时。
const runtime = globalThis as typeof globalThis & { __yxshopStampWasm?: WeakMap<typeof initWasm, Promise<void>> };
const wasmReady = runtime.__yxshopStampWasm ??= new WeakMap();
const fontBuffers = new Map<StampFont, Promise<Uint8Array>>();
function initializeRenderer() {
  let ready = wasmReady.get(initWasm);
  if (!ready) {
    ready = readFile(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')).then(async wasm => {
      try { await initWasm(wasm); }
      catch (error) {
        // 兼容修复前已经初始化的开发进程；通过实际实例确认可用后才复用。
        if ((error as Error)?.message !== 'Already initialized. The `initWasm()` function can be used only once.') throw error;
        const probe = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
        probe.free();
      }
    }).catch(error => { wasmReady.delete(initWasm); throw error; });
    wasmReady.set(initWasm, ready);
  }
  return ready;
}
function loadFont(font: StampFont) {
  let buffer = fontBuffers.get(font);
  if (!buffer) {
    buffer = readFile(resolve(process.cwd(), 'assets/fonts', fonts[font].file)).then(data => new Uint8Array(data)).catch(error => { fontBuffers.delete(font); throw error; });
    fontBuffers.set(font, buffer);
  }
  return buffer;
}
async function resources(font: StampFont) {
  // 宋体兼作水印及罕用汉字的后备字体；字体只从随项目发布的白名单文件读取。
  const [, selected, fallback] = await Promise.all([initializeRenderer(), loadFont(font), loadFont('serif')]);
  return font === 'serif' ? [selected] : [selected, fallback];
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
    body += curved(o.text, 410 - o.fontSize - o.textInset, ry - o.fontSize - o.textInset, o.fontSize, o.arc);
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
  const watermark = preview ? '<g font-family="Noto Serif CJK SC" fill="#718096" opacity=".38" font-size="40" text-anchor="middle" transform="rotate(-28 500 500)"><text x="500" y="310">宇星商城 · 效果预览</text><text x="500" y="540">宇星商城 · 效果预览</text><text x="500" y="770">宇星商城 · 效果预览</text></g>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><g font-family="${fonts[o.font].family}, Noto Serif CJK SC">${background}<g color="${o.color}" fill="${o.color}" transform="rotate(${o.rotation} 500 500)">${body}</g>${watermark}</g></svg>`;
}

export async function renderStamp(options: StampOptions, preview = false): Promise<Buffer> {
  const buffers = await resources(options.font);
  const normalized = options.format === 'jpeg' ? { ...options, background: 'white' as const } : options;
  const renderer = new Resvg(stampSvg(normalized, preview), { font: { fontBuffers: buffers, defaultFontFamily: fonts[options.font].family }, fitTo: { mode: 'width', value: preview ? 420 : options.size } });
  try {
    if (!preview && options.format === 'svg') {
      // Resvg 输出字形轮廓，矢量成品无需用户另装字体。
      return Buffer.from(renderer.toString().replace(/^<svg width="[^"]+" height="[^"]+"/, `<svg width="${options.size}" height="${options.size}"`));
    }
    const result = renderer.render();
    try {
      if (!preview && options.format === 'jpeg') return Buffer.from(jpeg.encode({ data: Buffer.from(result.pixels), width: result.width, height: result.height }, 92).data);
      return Buffer.from(result.asPng());
    }
    finally { result.free(); }
  } finally { renderer.free(); }
}
