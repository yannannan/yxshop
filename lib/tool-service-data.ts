import { env } from '@/db/mysql-runtime';
import { handprintToolEntry, mapTool, type ToolService } from './tool-services';
import { readModulePrices } from './tool-module-pricing';

const columns = "id,name,description,detail,cover_image,price,billing_cycle,tool_plans_json,tool_slug,tool_charge_type,tool_points_cost,seo_title,seo_description,updated_at,CASE WHEN tool_url IS NULL OR tool_url='' THEN 0 ELSE 1 END AS entry_configured";

async function handprintEntry(owner: ToolService) {
  const prices = owner.chargeType === 'points' ? await readModulePrices(owner.id, 'document-signature').catch(error => {
    if (error?.code === 'ER_NO_SUCH_TABLE') return {} as Record<string, number>;
    throw error;
  }) : {};
  return handprintToolEntry(owner, prices.handprint ?? owner.pointsCost);
}

export async function getPublishedTools() {
  const { results } = await env.DB.prepare(`SELECT ${columns} FROM products WHERE product_type='tool' AND status='active' AND tool_slug IS NOT NULL ORDER BY sort_order,id`).all<Record<string, unknown>>();
  // The handprint module has its own public page while sharing its owning tool's billing and records.
  const tools = results.map(mapTool).filter(tool => tool.slug !== 'handprint-maker');
  const index = tools.findIndex(tool => tool.slug === 'document-signature');
  if (index >= 0) tools.splice(index + 1, 0, await handprintEntry(tools[index]));
  return tools;
}

export async function getPublishedTool(slug: string) {
  const row = await env.DB.prepare(`SELECT ${columns} FROM products WHERE product_type='tool' AND status='active' AND tool_slug=? LIMIT 1`)
    .bind(slug === 'handprint-maker' ? 'document-signature' : slug).first<Record<string, unknown>>();
  return row ? slug === 'handprint-maker' ? handprintEntry(mapTool(row)) : mapTool(row) : null;
}
