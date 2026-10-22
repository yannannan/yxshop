import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';
import { readToolPlans } from '../../../lib/tool-services';

export async function GET(request: Request) {
  await ensureDatabase();
  const id = new URL(request.url).searchParams.get('id');
  const select = 'SELECT id,name,category,subcategory,price,old_price AS oldPrice,billing_cycle AS billingCycle,attributes_json AS attributesJson,description AS "desc",detail,tag,tone,initial,cover_image AS coverImage,detail_image AS detailImage,status,stock,sort_order AS sortOrder,product_type AS productType,tool_slug AS toolSlug,tool_charge_type AS toolChargeType FROM products WHERE status=\'active\'';
  if (id) {
    const product = await env.DB.prepare(`${select} AND id=?`).bind(id).first<Record<string, unknown>>();
    if (product?.productType === 'tool') {
      const config = await env.DB.prepare('SELECT tool_plans_json FROM products WHERE id=?').bind(id).first<{ tool_plans_json: string | null }>();
      product.toolPlans = product.toolChargeType === 'paid' ? readToolPlans(config?.tool_plans_json, Number(product.price), String(product.billingCycle || 'once')) : [];
    }
    return product ? Response.json(product, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ message: '商品不存在' }, { status: 404 });
  }
  const { results } = await env.DB.prepare(`${select} AND product_type<>'tool' ORDER BY sort_order,id`).all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
