export const imageToolSlug = 'image-processor';
export const imageActions = { watermark: '去水印', stitch: '图像拼接', compress: '图像压缩', sharpen: '变清晰', repair: '图片修复', erase: '抹除区域', cutout: '抠图', text: '文字替换' } as const;
export type ImageAction = keyof typeof imageActions;
export type ImageRect = { x: number; y: number; width: number; height: number };
export type ImageOptions = { format: 'png' | 'jpeg'; quality: number; strength: number; tolerance: number; background: string; textColor: string; text: string; fontSize: number; direction: 'horizontal' | 'vertical' | 'grid'; columns: number; gap: number; rect: ImageRect | null };
export const defaultImageOptions: ImageOptions = { format: 'png', quality: 80, strength: 1, tolerance: 35, background: '#ffffff', textColor: '#142334', text: '', fontSize: 36, direction: 'horizontal', columns: 2, gap: 12, rect: null };
export const imageLimits = { files: 8, imagePixels: 2_000_000, inputPixels: 6_000_000, outputPixels: 6_000_000, outputBytes: 8 * 1024 * 1024, bodyBytes: 25 * 1024 * 1024 } as const;
export type RasterImage = { width: number; height: number; data: Uint8Array };
export type ImageAccess = { signedIn: boolean; chargeType: string; pointsBalance: number; hasMembership: boolean; costs: Record<ImageAction,number>; canProcess: boolean; recent: ImageResult[] };
export type ImageResult = { id: string; action: ImageAction; width: number; height: number; format: 'png' | 'jpeg'; bytes: number; pointsSpent: number; reused: boolean; createdAt: string; downloadUrl: string };
export class ImageToolError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const isImageAction = (value: unknown): value is ImageAction => typeof value === 'string' && Object.hasOwn(imageActions,value);
export const imageTaskId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function parseImageOptions(value: unknown): ImageOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ImageToolError('图片参数格式不正确');
  const o = value as Record<string,unknown>;
  const number = (key: string, min: number, max: number, integer = false) => { const n=o[key]; if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n))) throw new ImageToolError('图片参数超出允许范围'); return n; };
  if (!['png','jpeg'].includes(String(o.format)) || !['horizontal','vertical','grid'].includes(String(o.direction))) throw new ImageToolError('输出格式或拼接方式不正确');
  for (const key of ['background','textColor']) if(typeof o[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(o[key])) throw new ImageToolError('图片颜色格式不正确');
  if(typeof o.text!=='string'||[...o.text].length>200) throw new ImageToolError('替换文字最多200个字符');
  let rect: ImageRect | null = null;
  if(o.rect!==null) { if(!o.rect||typeof o.rect!=='object'||Array.isArray(o.rect)) throw new ImageToolError('请重新框选处理区域'); const r=o.rect as Record<string,unknown>; for(const k of ['x','y','width','height']) if(typeof r[k]!=='number'||!Number.isFinite(r[k])||Number(r[k])<0||Number(r[k])>1) throw new ImageToolError('请重新框选处理区域'); rect={x:Number(r.x),y:Number(r.y),width:Number(r.width),height:Number(r.height)}; if(!rect.width||!rect.height||rect.x+rect.width>1.000001||rect.y+rect.height>1.000001) throw new ImageToolError('请重新框选处理区域'); }
  return { format:o.format as ImageOptions['format'],direction:o.direction as ImageOptions['direction'],quality:number('quality',10,95,true),strength:number('strength',.1,2),tolerance:number('tolerance',0,180,true),background:String(o.background),textColor:String(o.textColor),text:o.text,fontSize:number('fontSize',10,200,true),columns:number('columns',1,8,true),gap:number('gap',0,100,true),rect };
}
