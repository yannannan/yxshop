import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { adminDenied, getAdminContext, hasAdminPermission } from '../../../lib/admin-auth';

const maxImageSize = 500 * 1024 * 1024;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadDirectory = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export async function POST(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin) return adminDenied();
  if (!hasAdminPermission(admin, 'products')) return adminDenied('无商品管理权限');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ message: '请选择图片文件' }, { status: 400 });
  if (!acceptedTypes.has(file.type)) return Response.json({ message: '仅支持 JPG、PNG、WebP 图片' }, { status: 400 });
  if (file.size > maxImageSize) return Response.json({ message: '图片不能超过 500MB' }, { status: 400 });
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await mkdir(join(uploadDirectory, 'products'), { recursive: true });
  await writeFile(join(uploadDirectory, key), Buffer.from(await file.arrayBuffer()));
  return Response.json({ url: `/api/product-images?key=${encodeURIComponent(key)}` });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key.startsWith('products/') || normalize(key).includes('..')) return Response.json({ message: '图片不存在' }, { status: 404 });
  try {
    const body = await readFile(join(uploadDirectory, key));
    return new Response(body, { headers: { 'content-type': contentTypes[extname(key).toLowerCase()] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' } });
  } catch { return Response.json({ message: '图片不存在' }, { status: 404 }); }
}
