export const stampShapes = ['circle', 'ellipse', 'square', 'name'] as const;
export type StampShape = typeof stampShapes[number];
export const stampFonts = [
  { value: 'serif', label: '宋体 · 典雅清晰' },
  { value: 'sans', label: '黑体 · 简洁醒目' },
  { value: 'kai', label: '霞鹜文楷 · 手写风格' },
] as const;
export type StampFont = typeof stampFonts[number]['value'];
export const stampSizes = [256, 512, 768, 1024, 1280, 1600, 2048, 2560, 3072, 4096] as const;
export type StampSize = typeof stampSizes[number];
export const stampFormats = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png' },
  jpeg: { label: 'JPG', mime: 'image/jpeg', extension: 'jpg' },
  svg: { label: 'SVG', mime: 'image/svg+xml', extension: 'svg' },
} as const;
export type StampFormat = keyof typeof stampFormats;
export type StampOptions = {
  shape: StampShape; text: string; subtitle: string; code: string; color: string;
  border: number; fontSize: number; arc: number; textInset: number; font: StampFont; innerRing: boolean;
  symbol: 'star' | 'dot' | 'none'; rotation: number; background: 'transparent' | 'white'; size: StampSize; format: StampFormat;
};
export const stampPresets: { shape: StampShape; name: string; note: string; options: StampOptions }[] = [
  { shape: 'circle', name: '经典圆章', note: '弧形文字 · 居中图案', options: { shape: 'circle', text: '宇星创意工作室', subtitle: '设计专用章', code: '', color: '#c83932', border: 14, fontSize: 80, arc: 220, textInset: 12, font: 'serif', innerRing: false, symbol: 'star', rotation: 0, background: 'transparent', size: 1600, format: 'png' } },
  { shape: 'ellipse', name: '简约椭圆', note: '横向舒展 · 清晰留白', options: { shape: 'ellipse', text: '宇星创意工作室', subtitle: '业务专用章', code: '', color: '#c83932', border: 12, fontSize: 80, arc: 210, textInset: 12, font: 'serif', innerRing: false, symbol: 'star', rotation: 0, background: 'transparent', size: 1600, format: 'png' } },
  { shape: 'square', name: '方形印章', note: '规整排版 · 简洁大方', options: { shape: 'square', text: '宇星创意工作室', subtitle: '设计专用', code: '', color: '#c83932', border: 14, fontSize: 64, arc: 240, textInset: 12, font: 'serif', innerRing: false, symbol: 'none', rotation: 0, background: 'transparent', size: 1600, format: 'png' } },
  { shape: 'name', name: '个人姓名章', note: '纵向字阵 · 二至四字', options: { shape: 'name', text: '宇星之印', subtitle: '', code: '', color: '#c83932', border: 16, fontSize: 64, arc: 240, textInset: 12, font: 'serif', innerRing: false, symbol: 'none', rotation: 0, background: 'transparent', size: 1600, format: 'png' } },
];
export const defaultStampOptions = (): StampOptions => ({ ...stampPresets[0].options });

export function parseStampOptions(value: unknown): StampOptions {
  if (!value || typeof value !== 'object') throw new Error('请填写印章参数');
  const input = value as Record<string, unknown>;
  if (!stampShapes.includes(input.shape as StampShape)) throw new Error('请选择有效的印章样式');
  const cleanText = (key: string, max: number) => {
    if (typeof input[key] !== 'string') throw new Error('印章文字格式不正确');
    const text = (input[key] as string).trim();
    if ([...text].length > max || /[^\u3400-\u9fffA-Za-z0-9 \u3000·（）()&.,，。\-]/u.test(text)) throw new Error(`${key === 'text' ? '印章名称' : '辅助文字'}过长或含有不支持的字符`);
    return text;
  };
  const text = cleanText('text', input.shape === 'name' ? 4 : input.shape === 'square' ? 12 : 32);
  if (!text || (input.shape === 'name' && [...text].length < 2)) throw new Error(input.shape === 'name' ? '姓名章请填写二至四个字' : '请填写印章名称');
  const subtitle = cleanText('subtitle', 12);
  if (typeof input.code !== 'string' || !/^[A-Za-z0-9-]{0,20}$/.test(input.code)) throw new Error('底部编号仅支持最多 20 位字母、数字或短横线');
  if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error('印章颜色不正确');
  const font = input.font === undefined ? 'serif' : input.font;
  if (!stampFonts.some(item => item.value === font)) throw new Error('请选择有效的印章字体');
  const number = (key: string, min: number, max: number, fallback?: number) => {
    const item = input[key] === undefined ? fallback : input[key];
    if (typeof item !== 'number' || !Number.isFinite(item) || item < min || item > max) throw new Error('印章尺寸或排版参数超出范围');
    return Math.round(item);
  };
  const format = input.format === undefined ? 'png' : input.format;
  if (typeof format !== 'string' || !Object.hasOwn(stampFormats, format)) throw new Error('请选择有效的导出格式');
  if (typeof input.innerRing !== 'boolean' || !['star', 'dot', 'none'].includes(String(input.symbol)) || !['transparent', 'white'].includes(String(input.background)) || !stampSizes.includes(input.size as StampSize)) throw new Error('印章导出参数不正确');
  return { shape: input.shape as StampShape, text, subtitle: input.shape === 'name' ? '' : subtitle, code: input.shape === 'name' ? '' : input.code, color: input.color.toLowerCase(), border: number('border', 6, 24), fontSize: number('fontSize', 28, 80), arc: number('arc', 180, 280), textInset: number('textInset', 0, 100, 12), font: font as StampFont, innerRing: input.innerRing, symbol: input.symbol as StampOptions['symbol'], rotation: number('rotation', -20, 20), background: format === 'jpeg' ? 'white' : input.background as StampOptions['background'], size: input.size as StampSize, format: format as StampFormat };
}

// 根据成品真实文件头恢复格式；原有仅存 PNG base64 的记录继续兼容，无需改表。
export function stampImageData(base64: string) {
  const header = atob(base64.slice(0, 16));
  const format: StampFormat = header.startsWith('\xff\xd8\xff') ? 'jpeg' : header.startsWith('<svg') ? 'svg' : 'png';
  return { format, image: `data:${stampFormats[format].mime};base64,${base64}` };
}

export type StampAccess = { chargeType: 'free' | 'paid' | 'pending'; signedIn: boolean; canGenerate: boolean; remaining: number; cycle: string | null; membershipName: string | null; expiresAt: string | null; purchaseUrl: string; recent: { id: string; size: number; createdAt: string }[] };
export type StampResult = { id: string; image: string; format: StampFormat; size: number; createdAt: string; charged: boolean; reused: boolean };
