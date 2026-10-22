import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ToolLaunch } from '@/components/tool-launch';
import { getPublishedTool } from '@/lib/tool-service-data';
import { isToolSlug, siteOrigin, toolBillingLabels, toolChargeLabels, toolPagePath, toolPlanPrice, toolPriceSummary } from '@/lib/tool-services';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };
const normalizedSlug = (slug: string) => slug.replace(/\.html$/, '');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = normalizedSlug(rawSlug);
  const tool = isToolSlug(slug) ? await getPublishedTool(slug) : null;
  if (!tool) return { title: '工具不存在｜宇星商城', robots: { index: false, follow: false } };
  const title = tool.seoTitle || `${tool.name}｜宇星商城`;
  const description = tool.seoDescription || tool.description || tool.detail.slice(0, 160);
  const url = `${siteOrigin()}${toolPagePath(tool.slug)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: 'website', images: tool.logo ? [tool.logo] : [] } };
}

export default async function ToolPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = normalizedSlug(rawSlug);
  if (!isToolSlug(slug)) notFound();
  const tool = await getPublishedTool(slug);
  if (!tool) notFound();
  if (rawSlug !== `${slug}.html`) permanentRedirect(toolPagePath(slug));
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: tool.name,
    description: tool.seoDescription || tool.description, url: `${siteOrigin()}${toolPagePath(tool.slug)}`,
    applicationCategory: 'UtilitiesApplication',
    ...(tool.chargeType === 'free' ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'CNY' } } : tool.chargeType === 'paid' ? { offers: tool.plans.map(plan => ({ '@type': 'Offer', name: toolBillingLabels[plan.cycle], price: plan.price, priceCurrency: 'CNY' })) } : {}),
  };
  return <main className="tools-page"><header className="tools-page-header"><Link className="tools-brand" href="/">宇星商城</Link><Link href="/tools">全部工具</Link></header>
    <nav className="tool-breadcrumb" aria-label="面包屑"><Link href="/">商城首页</Link><span>›</span><Link href="/tools">工具服务</Link><span>›</span><span>{tool.name}</span></nav>
    <article className="tool-detail"><div className="tool-detail-intro">{tool.logo ? <Image unoptimized src={tool.logo} alt="" width={80} height={80} /> : <span className="tool-logo-fallback">{tool.name.slice(0, 1)}</span>}<span className={`tool-charge-badge ${tool.chargeType}`}>{toolChargeLabels[tool.chargeType]}{tool.chargeType === 'paid' ? ` · ${toolPriceSummary(tool)}` : ''}</span><h1>{tool.name}</h1><p>{tool.description}</p>{tool.chargeType === 'paid' && <ul className="tool-plan-summary">{tool.plans.map(plan => <li key={plan.cycle}>{toolBillingLabels[plan.cycle]}：{toolPlanPrice(plan)}</li>)}</ul>}<ToolLaunch tool={tool} /></div>
      <section className="tool-detail-content"><h2>工具介绍</h2>{(tool.detail || tool.description || '工具介绍待补充。').split(/\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}<h2>使用方式</h2><p>{!tool.entryConfigured ? '该工具的使用入口正在准备中，配置完成后可在本页进入。' : tool.chargeType === 'paid' ? '购买并完成支付核验后，回到本页点击“进入工具”。' : tool.chargeType === 'pending' ? '收费方式确认后，将在本页开放工具入口。' : '点击“进入工具”打开工具，按工具页面的提示操作。'}</p></section>
    </article><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
  </main>;
}
