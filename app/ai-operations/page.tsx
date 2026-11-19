import { getPageMetadata } from '@/lib/page-seo-server';

import { getI18n } from '@/lib/i18n-server';
import { StorefrontHeader } from '@/components/storefront-header';
import { getPublishedTools } from '@/lib/tool-service-data';
import { isWebsiteAnalysis, toolPagePath } from '@/lib/tool-services';
export const dynamic = 'force-dynamic';
export default async function AiOperationsPage() {
  const { t } = await getI18n();
  let entry = '/tools';
  try { const tool = (await getPublishedTools()).find(tool => isWebsiteAnalysis(tool.slug, tool.name)); if (tool) entry = toolPagePath(tool.slug); } catch { /* 频道入口仍可打开，不隐藏工具目录入口。 */ }
  return <><StorefrontHeader channel="ai-operations" /><main className="ai-channel-page"><span className="section-kicker">YXSTAR AI</span><h1>{t("AI运营工具")}</h1><p>{t("面向日常运营的工具与分析服务。")}</p><div className="ai-channel-note"><h2>{t("站长分析工具 · 综合看板")}</h2><p>{t("输入域名，采集网站基础信息、整理关键词、生成报告并保留分析历史。")}</p><a className="account-secondary" href={entry}>{t("进入综合看板")}</a></div></main></>;
}

export async function generateMetadata() { return getPageMetadata('aiOperations'); }
