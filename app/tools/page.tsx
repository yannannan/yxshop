import { getPageMetadata } from '@/lib/page-seo-server';
import { StorefrontHeader } from '@/components/storefront-header';
import { ToolDirectory } from '@/components/tool-directory';
import { getPublishedTools } from '@/lib/tool-service-data';
import { getHomepageDisplay } from '@/lib/homepage-display-data';
import { orderItems } from '@/lib/homepage-display';

export const dynamic = 'force-dynamic';

export default async function ToolsPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const [tools, config, params] = await Promise.all([getPublishedTools(), getHomepageDisplay(), searchParams]);
  return <><StorefrontHeader /><main className="tools-page"><ToolDirectory tools={orderItems(tools, config.itemOrder)} pageSize={12} page={Number(params?.page || 1)} moreHref={null} /></main></>;
}

export async function generateMetadata() { return getPageMetadata('tools'); }
