import { getI18n } from '@/lib/i18n-server';
import { getPageMetadata } from '@/lib/page-seo-server';
import { getPublishedServiceSummary } from '@/lib/technical-service-data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const service = await getPublishedServiceSummary(slug);
    if (!service) return getPageMetadata('missingService');
    const { locale, t } = await getI18n();
    return getPageMetadata('service', {
      title: `${t(service.title)}${locale === 'en' ? ' | Yuxing Maitong' : '｜宇星脉通'}`,
      description: `${t(service.title)}: ${t(service.summary)}`,
      keywords: [service.title], path: `/service/${encodeURIComponent(service.slug)}`,
    });
  } catch (error) {
    console.error('技术服务SEO读取失败', error);
    return getPageMetadata('service', { index: false, follow: false });
  }
}

export default function ServiceLayout({ children }: { children: React.ReactNode }) { return children; }
