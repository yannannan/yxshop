export const leadsSlug = 'ai-leads';
export const leadPlatforms = [
  { id: 'douyin', name: '抖音', region: 'china', domain: 'douyin.com', mark: '抖', color: '#f55b87' },
  { id: 'tiktok', name: 'TikTok', region: 'global', domain: 'tiktok.com', mark: 'Tk', color: '#5be0dc' },
  { id: 'facebook', name: 'Facebook', region: 'global', domain: 'facebook.com', mark: 'f', color: '#72a7ff' },
  { id: 'youtube', name: 'YouTube', region: 'global', domain: 'youtube.com', mark: '▶', color: '#ff727f' },
  { id: 'whatsapp', name: 'WhatsApp', region: 'global', domain: 'wa.me', mark: 'W', color: '#67ddac' },
  { id: 'alibaba', name: '阿里巴巴国际站', region: 'global', domain: 'alibaba.com', mark: 'A', color: '#ffb575' },
  { id: 'taobao', name: '淘宝', region: 'china', domain: 'taobao.com', mark: '淘', color: '#ffa06d' },
  { id: 'jd', name: '京东', region: 'china', domain: 'jd.com', mark: '京', color: '#ff838b' },
  { id: '1688', name: '1688', region: 'china', domain: '1688.com', mark: '1688', color: '#ffb56e' },
  { id: 'boss', name: 'BOSS直聘', region: 'china', domain: 'zhipin.com', mark: 'B', color: '#64d4c6' },
  { id: 'linkedin', name: 'LinkedIn', region: 'global', domain: 'linkedin.com', mark: 'in', color: '#76b8f5' },
  { id: 'website', name: '企业官网／代理商', region: 'all', domain: '', mark: '↗', color: '#a4b3ff' },
] as const;
export type LeadPlatform = typeof leadPlatforms[number]['id'];
export const leadFields = { avatar: '头像', name: '账号名称', accountId: '账号ID', phone: '公开业务电话', bio: '主页介绍', email: '公开业务邮箱' } as const;
export type LeadField = keyof typeof leadFields;
export const leadStatuses = { fresh: '待跟进', contacted: '已联系', qualified: '有效线索', archived: '已归档' } as const;
export type LeadStatus = keyof typeof leadStatuses;
export type LeadOptions = { keyword: string; marketing: string; limit: number; platforms: LeadPlatform[]; fields: LeadField[]; contactOnly: boolean; sourceUrls: string[] };
export type Lead = { id: string; platform: LeadPlatform; url: string; name: string; avatar: string; accountId: string; phone: string; email: string; bio: string; category: string; score: number; matched: string[]; collectedAt: string; status: LeadStatus; note: string };
export type LeadRun = { id: string; keyword: string; status: 'running' | 'ready' | 'partial' | 'empty' | 'failed'; createdAt: string; count: number; points: number; options: LeadOptions; messages: string[]; leads: Lead[]; analysis: 'rules' | 'model' };
export class LeadsError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const validLeadId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
export function publicLeadUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|invalid|test)$/.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return ''; u.hash = ''; return u.href; } catch { return ''; }
}
export function platformForUrl(raw: string): LeadPlatform {
  const host = new URL(raw).hostname.toLowerCase();
  return leadPlatforms.find(p => p.domain && (host === p.domain || host.endsWith('.' + p.domain)))?.id || 'website';
}
export function leadOptions(value: unknown): LeadOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LeadsError('获客条件格式不正确');
  const v = value as Record<string, unknown>;
  const keyword = typeof v.keyword === 'string' ? v.keyword.trim() : '', marketing = typeof v.marketing === 'string' ? v.marketing.trim() : '';
  if (!keyword || keyword.length > 80 || marketing.length > 180) throw new LeadsError('请填写关键词，关键词最多80字，营销内容最多180字');
  if (![10, 20, 50, 100].includes(Number(v.limit))) throw new LeadsError('每次采集数量请选择10、20、50或100');
  if (!Array.isArray(v.platforms) || !v.platforms.length || v.platforms.length > leadPlatforms.length || v.platforms.some(id => !leadPlatforms.some(p => p.id === id))) throw new LeadsError('请至少选择一个有效平台');
  if (!Array.isArray(v.fields) || !v.fields.length || v.fields.length > 6 || v.fields.some(f => typeof f !== 'string' || !Object.hasOwn(leadFields, f))) throw new LeadsError('请至少选择一个采集字段');
  const raw = v.sourceUrls === undefined ? [] : v.sourceUrls;
  if (!Array.isArray(raw) || raw.length > 20 || raw.some(url => !publicLeadUrl(url))) throw new LeadsError('公开主页链接最多20条，请填写完整公网地址');
  const platforms = [...new Set(v.platforms)] as LeadPlatform[], sourceUrls = [...new Set(raw.map(publicLeadUrl))];
  if (sourceUrls.some(url => !platforms.includes(platformForUrl(url)))) throw new LeadsError('公开链接的平台未勾选，请选择对应平台');
  return { keyword, marketing, limit: Number(v.limit), platforms, fields: [...new Set(v.fields)] as LeadField[], contactOnly: v.contactOnly === true, sourceUrls };
}
export function searchPlan(options: LeadOptions) {
  return options.platforms.map(id => { const p = leadPlatforms.find(p => p.id === id)!;
    const scope = id === 'boss' ? 'site:zhipin.com/gongsi' : p.domain ? `site:${p.domain}` : '';
    const query = [scope, options.keyword, options.marketing, id === 'website' ? '企业 代理商 distributor' : ''].filter(Boolean).join(' ');
    return { platform: id, query, href: `https://www.google.com/search?q=${encodeURIComponent(query)}`, domesticHref: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}` };
  });
}
export function rankLead(lead: Lead, options: LeadOptions) {
  const text = `${lead.name} ${lead.bio}`.toLowerCase(), words = [...new Set(`${options.keyword} ${options.marketing}`.split(/[\s,，;；、/]+/).filter(Boolean))];
  const matched = words.filter(word => text.includes(word.toLowerCase()));
  return { ...lead, matched, score: Math.round(100 * matched.length / Math.max(1, words.length)), category: /代理|经销|批发|distribut|wholesale|dealer/i.test(text) ? '代理商／经销商' : /制造|工厂|manufacturer|factory/i.test(text) ? '制造商' : '待分类' };
}
// Neutralize spreadsheet formulas, including tab/line-prefix variants, in downloaded CSV.
export const csvCell = (value: unknown) => { let text = String(value ?? ''); if (/^[\s\uFEFF]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
export function leadsCsv(leads: Lead[], fields: LeadField[]) {
  const keys = [...fields, 'platform', 'url', 'score', 'status'] as const;
  return '\uFEFF' + [keys.map(k => csvCell(k in leadFields ? leadFields[k as LeadField] : k)).join(','), ...leads.map(lead => keys.map(k => csvCell(lead[k])).join(','))].join('\r\n');
}
