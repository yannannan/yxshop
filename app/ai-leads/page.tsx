import { localizeMetadata } from '@/lib/i18n-server';

import { getI18n } from '@/lib/i18n-server';
import type { Metadata } from 'next';
import { StorefrontHeader } from '@/components/storefront-header';
const pageMetadata: Metadata = { title: 'AI智能获客｜宇星脉通' };
export default async function AiLeadsPage() {
  const { t } = await getI18n();
  /* eslint-disable @next/next/no-html-link-for-pages -- 新频道入口使用原生链接。 */
  return <><StorefrontHeader channel="ai-leads" /><main className="ai-channel-page"><span className="section-kicker">YXSTAR AI</span><h1>{t("AI智能获客")}</h1><p>{t("获客相关服务正在规划中。")}</p><div className="ai-channel-note"><h2>{t("功能筹备中")}</h2><p>{t("具体功能与支持范围将在需求确认、开发和验收后开放。")}</p><a className="account-secondary" href="/tools">{t("查看已开放工具")}</a></div></main></>;
}

export async function generateMetadata() { return localizeMetadata(pageMetadata); }
