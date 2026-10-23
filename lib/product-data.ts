import { env } from '@/db/mysql-runtime';
import type { CatalogProduct } from './catalog';
import type { CategoryNode } from './categories';

// 旧库可缺少后来新增的展示字段；只输出白名单，不暴露成本、工具入口等内部数据。
export function publicProduct(row: Record<string, unknown>): CatalogProduct & { status: string; stock: number; sortOrder: number } {
  return { id: Number(row.id), name: String(row.name || ''), category: String(row.category || ''), subcategory: String(row.subcategory || ''), price: Number(row.price || 0), oldPrice: Number(row.old_price || 0), billingCycle: String(row.billing_cycle || 'once') as CatalogProduct['billingCycle'], attributesJson: typeof row.attributes_json === 'string' ? row.attributes_json : JSON.stringify(row.attributes_json || []), desc: String(row.description || ''), detail: String(row.detail || ''), tag: String(row.tag || ''), tone: String(row.tone || 'dark'), initial: String(row.initial || ''), coverImage: String(row.cover_image || ''), detailImage: String(row.detail_image || ''), productType: row.product_type === 'tool' ? 'tool' : 'digital', toolSlug: String(row.tool_slug || ''), toolChargeType: String(row.tool_charge_type || ''), status: String(row.status || 'active'), stock: Number(row.stock || 0), sortOrder: Number(row.sort_order || 0) };
}

export async function getPublishedProducts() {
  const { results } = await env.DB.prepare("SELECT * FROM products WHERE status='active' AND COALESCE(product_type,'digital') NOT IN ('tool','points') ORDER BY sort_order,id").all<Record<string, unknown>>();
  return results.map(publicProduct);
}

export async function getPublishedCategories(): Promise<CategoryNode[]> {
  type Row = { id: number; parent_id: number | null; name: string };
  const { results } = await env.DB.prepare("SELECT id,parent_id,name FROM categories WHERE status='active' ORDER BY sort,id").all<Row>();
  const build = (parent: number | null, depth: number): CategoryNode[] => depth > 3 ? [] : results.filter(row => row.parent_id === parent).map(row => ({ name: row.name, children: build(row.id, depth + 1) }));
  return build(null, 1);
}
