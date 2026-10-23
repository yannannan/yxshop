import { env } from '@/db/mysql-runtime';
import type { CatalogProduct } from './catalog';
import type { CategoryNode } from './categories';

export async function getPublishedProducts() {
  const { results } = await env.DB.prepare("SELECT id,name,category,subcategory,price,old_price AS oldPrice,billing_cycle AS billingCycle,attributes_json AS attributesJson,description AS `desc`,detail,tag,tone,initial,cover_image AS coverImage,detail_image AS detailImage,product_type AS productType FROM products WHERE status='active' AND product_type<>'tool' ORDER BY sort_order,id").all<CatalogProduct>();
  return results;
}

export async function getPublishedCategories(): Promise<CategoryNode[]> {
  type Row = { id: number; parent_id: number | null; name: string };
  const { results } = await env.DB.prepare("SELECT id,parent_id,name FROM categories WHERE status='active' ORDER BY sort,id").all<Row>();
  const build = (parent: number | null, depth: number): CategoryNode[] => depth > 3 ? [] : results.filter(row => row.parent_id === parent).map(row => ({ name: row.name, children: build(row.id, depth + 1) }));
  return build(null, 1);
}
