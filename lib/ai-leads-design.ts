export const acquisitionPlatforms = [
  { id: 'douyin', zh: '抖音', en: 'Douyin', region: 'china', mark: '抖', color: '#fb82ad' },
  { id: 'tiktok', zh: 'TikTok', en: 'TikTok', region: 'global', mark: 'Tk', color: '#68e6e0' },
  { id: 'facebook', zh: 'Facebook', en: 'Facebook', region: 'global', mark: 'f', color: '#80aaff' },
  { id: 'youtube', zh: 'YouTube', en: 'YouTube', region: 'global', mark: '▶', color: '#ff8b9b' },
  { id: 'whatsapp', zh: 'WhatsApp', en: 'WhatsApp', region: 'global', mark: 'W', color: '#79e3ae' },
  { id: 'alibaba', zh: '阿里巴巴国际站', en: 'Alibaba.com', region: 'global', mark: 'A', color: '#ffbb85' },
  { id: 'taobao', zh: '淘宝', en: 'Taobao', region: 'china', mark: '淘', color: '#ffa76f' },
  { id: 'jd', zh: '京东', en: 'JD.com', region: 'china', mark: '京', color: '#ff8b91' },
  { id: '1688', zh: '1688', en: '1688', region: 'china', mark: '1688', color: '#ffbd77' },
  { id: 'boss', zh: 'BOSS直聘', en: 'BOSS Zhipin', region: 'china', mark: 'B', color: '#6dd9cb' },
  { id: 'linkedin', zh: 'LinkedIn', en: 'LinkedIn', region: 'global', mark: 'in', color: '#8ac7fa' },
  { id: 'website', zh: '企业官网与代理商', en: 'Business sites & distributors', region: 'both', mark: '↗', color: '#b6acff' },
] as const;
export const acquisitionFields = [
  { id: 'avatar', zh: '头像', en: 'Avatar' }, { id: 'name', zh: '账号名称', en: 'Account name' },
  { id: 'accountId', zh: '账号ID', en: 'Account ID' }, { id: 'phone', zh: '手机号', en: 'Phone number' },
  { id: 'bio', zh: '主页介绍', en: 'Profile bio' }, { id: 'email', zh: '邮箱', en: 'Email' },
] as const;
export type AcquisitionPlatform = typeof acquisitionPlatforms[number]['id'];
export type AcquisitionField = typeof acquisitionFields[number]['id'];
export type AcquisitionDraft = { keyword: string; quantity: number; platforms: AcquisitionPlatform[]; marketing: string; fields: AcquisitionField[] };
export const acquisitionQuantities = [10, 20, 50, 100, 200];
export function acquisitionDraftError(draft: AcquisitionDraft): 'keyword' | 'platforms' | 'fields' | null {
  if (!draft.keyword.trim()) return 'keyword';
  if (!draft.platforms.length) return 'platforms';
  if (!draft.fields.length) return 'fields';
  return null;
}
