export type ToolChargeType = 'free' | 'paid' | 'pending';
export type ToolService = {
  id: number; name: string; description: string; detail: string; logo: string; slug: string;
  chargeType: ToolChargeType; price: number; entryConfigured: boolean;
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
    seoTitle: String(row.seo_title || ''), seoDescription: String(row.seo_description || ''), updatedAt: String(row.updated_at || ''),
  };
}
