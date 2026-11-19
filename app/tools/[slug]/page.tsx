import { getPageMetadata, getToolMetadata } from '@/lib/page-seo-server';

import { getI18n } from '@/lib/i18n-server';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound, permanentRedirect } from 'next/navigation';
import { ToolLaunch } from '@/components/tool-launch';
import { StorefrontHeader } from '@/components/storefront-header';
import { VideoExtractor } from '@/components/video-extractor';
import { getPublishedTool } from '@/lib/tool-service-data';
import { isToolSlug, isWebsiteAnalysis, siteOrigin, toolPlanKey, toolPlanLabel, toolChargeLabels, toolPagePath, toolPlanPrice, toolPriceSummary } from '@/lib/tool-services';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };
const normalizedSlug = (slug: string) => slug.replace(/\.html$/, '');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = normalizedSlug(rawSlug);
  const tool = isToolSlug(slug) ? await getPublishedTool(slug) : null;
  if (!tool) return getPageMetadata('missingTool');
  return getToolMetadata(tool);
}

export default async function ToolPage({ params }: Props) {
  const { t } = await getI18n();
  const { slug: rawSlug } = await params;
  const slug = normalizedSlug(rawSlug);
  if (!isToolSlug(slug)) notFound();
  if (slug === 'ai-leads') permanentRedirect('/ai-leads');
  const tool = await getPublishedTool(slug);
  if (!tool) notFound();
  if (rawSlug !== `${slug}.html`) permanentRedirect(toolPagePath(slug));
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: tool.name,
    description: tool.seoDescription || tool.description, url: `${siteOrigin()}${toolPagePath(tool.slug)}`,
    applicationCategory: 'UtilitiesApplication',
    ...(tool.chargeType === 'free' ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'CNY' } } : tool.chargeType === 'paid' ? { offers: tool.plans.map(plan => ({ '@type': 'Offer', name: toolPlanLabel(plan), price: plan.price, priceCurrency: 'CNY' })) } : {}),
  };
  if (slug === 'c-drive-cleaner') { const { DiskCleanerLanding } = await import('@/components/disk-cleaner-landing'); return <DiskCleanerLanding tool={tool} />; }
  if (slug === 'video-extractor') return <><StorefrontHeader /><VideoExtractor tool={tool} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /></>;
  if (slug === 'image-processor') { const { ImageProcessor } = await import('@/components/image-processor'); return <><StorefrontHeader /><ImageProcessor tool={tool} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /></>; }
  if (slug === 'document-signature' || slug === 'handprint-maker' || slug === 'stamp-maker') {
    const { DocumentSignature } = await import('@/components/document-signature');
    const stampTool = slug === 'stamp-maker' ? tool : await getPublishedTool('stamp-maker');
    return <><StorefrontHeader /><DocumentSignature tool={tool} stampTool={stampTool} initialMode={slug === 'stamp-maker' ? 'stamp' : slug === 'handprint-maker' ? 'handprint' : 'create'} />
      {slug === 'stamp-maker' && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />}</>;
  }
  if (isWebsiteAnalysis(slug, tool.name)) { const { SiteAnalysisDashboard } = await import('@/components/site-analysis-dashboard'); return <><StorefrontHeader /><SiteAnalysisDashboard tool={tool} /></>; }
  return <><StorefrontHeader /><main className="tools-page">
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 工具跨页入口使用原生导航，避免客户端路由异常时点击无反应。 */}
    <nav className="tool-breadcrumb" aria-label={t("面包屑")}><a href="/">{t("商城首页")}</a><span>›</span><a href="/tools">{t("工具服务")}</a><span>›</span><span>{t(tool.name)}</span></nav>
    <article className="tool-detail"><div className="tool-detail-intro">{tool.logo ? <Image unoptimized src={tool.logo} alt="" width={80} height={80} /> : <span className="tool-logo-fallback">{tool.name.slice(0, 1)}</span>}<span className={`tool-charge-badge ${tool.chargeType}`}>{t(toolChargeLabels[tool.chargeType])}{t(tool.chargeType === 'points' ? ` · ${tool.pointsCost} 积分 / 次` : tool.chargeType === 'paid' ? ` · ${toolPriceSummary(tool)}` : '')}</span><h1>{t(tool.name)}</h1><p>{tool.description}</p>{tool.chargeType === 'paid' && <ul className="tool-plan-summary">{tool.plans.map(plan => <li key={toolPlanKey(plan)}>{t(toolPlanLabel(plan))}：{t(toolPlanPrice(plan))}</li>)}</ul>}<ToolLaunch tool={tool} /></div>
      <section className="tool-detail-content"><h2>{t("工具介绍")}</h2>{(tool.detail || tool.description || '工具介绍待补充。').split(/\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}<h2>{t("使用方式")}</h2><p>{t(!tool.entryConfigured ? '该工具的使用入口正在准备中，配置完成后可在本页进入。' : tool.chargeType === 'paid' ? '购买并完成支付核验后，回到本页点击“进入工具”。' : tool.chargeType === 'pending' ? '收费方式确认后，将在本页开放工具入口。' : '点击“进入工具”打开工具，按工具页面的提示操作。')}</p></section>
    </article><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
  </main></>;
}
