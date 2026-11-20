import { TechnicalServiceDetail } from '@/components/technical-service-detail';
import { getPublicTechnicalCatalog } from '@/lib/technical-service-data';
import type { TechnicalService } from '@/lib/technical-services';

export default async function TechnicalServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let services: TechnicalService[] = [], unavailable = false;
  try {
    services = (await getPublicTechnicalCatalog()).services;
  } catch (error) {
    console.error('技术服务页面读取失败', (error as { code?: string }).code || (error as Error).name);
    unavailable = true;
  }
  return <TechnicalServiceDetail slug={slug} services={services} unavailable={unavailable} />;
}
