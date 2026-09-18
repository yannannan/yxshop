import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';

export async function GET(request: Request) {
  await ensureDatabase();
  const id = new URL(request.url).searchParams.get('id');
  const select = 'SELECT id,name,category,subcategory,price,old_price AS oldPrice,billing_cycle AS billingCycle,attributes_json AS attributesJson,description AS "desc",detail,tag,tone,initial,cover_image AS coverImage,detail_image AS detailImage,status,stock,sort_order AS sortOrder FROM products WHERE status=\'active\'';
  if (id) {
    const product = await env.DB.prepare(`${select} AND id=?`).bind(id).first();
    return product ? Response.json(product, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ message: '商品不存在' }, { status: 404 });
  }
  const { results } = await env.DB.prepare(`${select} ORDER BY sort_order,id`).all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
