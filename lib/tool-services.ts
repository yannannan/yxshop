export type ToolChargeType = 'free' | 'paid' | 'pending';
export const toolBillingLabels = { times: '按次', day: '包天', week: '包周', month: '包月', year: '包年', once: '一次性（长期）' } as const;
export type ToolBillingCycle = keyof typeof toolBillingLabels;
export type ToolPlan = { cycle: ToolBillingCycle; price: number };
export const toolPriceUnits: Record<ToolBillingCycle, string> = { times: '/次', day: '/天', week: '/周', month: '/月', year: '/年', once: '（一次性）' };
export const isToolBillingCycle = (value: string): value is ToolBillingCycle => Object.hasOwn(toolBillingLabels, value);

// 未配置套餐的旧工具保留原一次性价格；显式配置为空时不再出售。
export function readToolPlans(json: unknown, legacyPrice = 0, legacyCycle = 'once'): ToolPlan[] {
  if (json === null || json === undefined || json === '') return legacyPrice > 0 ? [{ cycle: isToolBillingCycle(legacyCycle) ? legacyCycle : 'once', price: Number(legacyPrice) }] : [];
  try {
    const plans: unknown = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(plans)) return [];
    const seen = new Set<string>();
    return plans.flatMap(plan => {
      if (!plan || !isToolBillingCycle(plan.cycle) || seen.has(plan.cycle) || !Number.isFinite(Number(plan.price)) || Number(plan.price) <= 0) return [];
      seen.add(plan.cycle);
      return [{ cycle: plan.cycle as ToolBillingCycle, price: Number(plan.price) }];
    });
  } catch { return []; }
}

export const toolPlanPrice = (plan: ToolPlan) => `¥${plan.price.toFixed(2)}${toolPriceUnits[plan.cycle]}`;
export function toolPriceSummary(tool: Pick<ToolService, 'plans'>) {
  const cheapest = [...tool.plans].sort((a, b) => a.price - b.price)[0];
  return cheapest ? `${toolPlanPrice(cheapest)}${tool.plans.length > 1 ? ' 起' : ''}` : '套餐待配置';
}

export function toolAccessExpiresAt(cycle: string, paidAt: string): string | null {
  const timestamp = Date.parse(paidAt);
  if (!Number.isFinite(timestamp)) return null;
  if (cycle === 'day' || cycle === 'week') return new Date(timestamp + (cycle === 'day' ? 1 : 7) * 86400000).toISOString();
  if (cycle !== 'month' && cycle !== 'year') return null;
  // 商城按北京时间自然月/年计费，避免凌晨付款跨 UTC 日期时多算一天。
  const offset = 8 * 3600000;
  const date = new Date(timestamp + offset);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (cycle === 'month' ? 1 : 12));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return new Date(date.getTime() - offset).toISOString();
}

export type ToolService = {
  id: number; name: string; description: string; detail: string; logo: string; slug: string;
  chargeType: ToolChargeType; price: number; plans: ToolPlan[]; entryConfigured: boolean;
  seoTitle: string; seoDescription: string; updatedAt: string;
};

export const toolChargeLabels: Record<ToolChargeType, string> = { free: '免费使用', paid: '付费使用', pending: '收费待确认' };
export const toolPagePath = (slug: string) => `/tools/${encodeURIComponent(slug)}.html`;
export const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yxstar.shop').replace(/\/$/, '');
export const isToolSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;

export function isToolEntryUrl(value: string) {
  if (!value) return true;
  if (/[\s\\]/.test(value) || value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function mapTool(row: Record<string, unknown>): ToolService {
  return {
    id: Number(row.id), name: String(row.name || ''), description: String(row.description || ''),
    detail: String(row.detail || ''), logo: String(row.cover_image || ''), slug: String(row.tool_slug || ''),
    chargeType: row.tool_charge_type === 'paid' ? 'paid' : row.tool_charge_type === 'free' ? 'free' : 'pending',
    price: Number(row.price || 0), entryConfigured: Boolean(Number(row.entry_configured)),
    plans: row.tool_charge_type === 'paid' ? readToolPlans(row.tool_plans_json, Number(row.price || 0), String(row.billing_cycle || 'once')) : [],
    seoTitle: String(row.seo_title || ''), seoDescription: String(row.seo_description || ''), updatedAt: String(row.updated_at || ''),
  };
}
