import { env } from '@/db/mysql-runtime';
import { mapTool } from './tool-services';

const columns = "id,name,description,detail,cover_image,price,billing_cycle,tool_plans_json,tool_slug,tool_charge_type,tool_points_cost,seo_title,seo_description,updated_at,CASE WHEN tool_url IS NULL OR tool_url='' THEN 0 ELSE 1 END AS entry_configured";

export async function getPublishedTools() {
  const { results } = await env.DB.prepare(`SELECT ${columns} FROM products WHERE product_type='tool' AND status='active' AND tool_slug IS NOT NULL ORDER BY sort_order,id`).all<Record<string, unknown>>();
  return results.map(mapTool);
}

export async function getPublishedTool(slug: string) {
  const row = await env.DB.prepare(`SELECT ${columns} FROM products WHERE product_type='tool' AND status='active' AND tool_slug=? LIMIT 1`).bind(slug).first<Record<string, unknown>>();
  return row ? mapTool(row) : null;
}
