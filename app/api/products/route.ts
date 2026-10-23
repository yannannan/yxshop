import { env } from '@/db/mysql-runtime';
import { getPublishedProducts, publicProduct } from '@/lib/product-data';
import { readToolPlans } from '@/lib/tool-services';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json(await getPublishedProducts(), { headers });
    const row = await env.DB.prepare("SELECT * FROM products WHERE status='active' AND id=?").bind(id).first<Record<string, unknown>>();
    if (!row || row.product_type === 'points') return Response.json({ message: '商品不存在' }, { status: 404, headers });
    const product = publicProduct(row);
    if (row.product_type === 'tool') product.toolPlans = row.tool_charge_type === 'paid' ? readToolPlans(row.tool_plans_json, Number(row.price), String(row.billing_cycle || 'once')) : [];
    return Response.json(product, { headers });
  } catch (error) {
    const code = (error as { code?: string }).code || '';
    console.error('商品列表读取失败', error);
    return Response.json({ message: '商品列表暂不可用，请稍后重试', code }, { status: 503, headers });
  }
}
