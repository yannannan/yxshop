import { imageActions } from './image-tool';
import { isWebsiteAnalysis } from './tool-services';
export function toolFeatures(slug: string): Record<string, string> {
  if (slug === 'image-processor') return imageActions;
  if (slug === 'document-signature') return { create: '制作签名', sign: '签署文件' };
  if (slug === 'handprint-maker') return { handprint: '手印制作' };
  if (slug === 'stamp-maker') return { make: '印章制作' };
  if (slug === 'video-extractor') return { extract: '视频提取' };
  if (isWebsiteAnalysis(slug)) return { analyze: '综合分析' };
  return {};
}
export const analyticsSlug = (slug: string, module: string) => slug === 'document-signature' && module === 'handprint' ? 'handprint-maker' : slug;
export function analyticsStart(period: string, now = Date.now()): string {
  if (period === 'all') return '';
  if (!['today', '7', '30'].includes(period)) throw Error('统计周期不正确');
  const beijing = new Date(now + 8 * 3600000);
  const midnight = Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate()) - 8 * 3600000;
  return new Date(midnight - (period === 'today' ? 0 : Number(period) - 1) * 86400000).toISOString();
}
export type ToolMetrics = { clicks: number; views: number; featureClicks: number; uses: number; users: number; points: number; lastUsed: string };
export type ToolAnalyticsRow = ToolMetrics & { slug: string; name: string; modules: (ToolMetrics & { key: string; name: string })[] };
export type ToolAnalytics = { period: string; since: string; generatedAt: string; totals: ToolMetrics; tools: ToolAnalyticsRow[]; warnings: string[]; clicksReady: boolean };
export const emptyToolMetrics = (): ToolMetrics => ({ clicks: 0, views: 0, featureClicks: 0, uses: 0, users: 0, points: 0, lastUsed: '' });
