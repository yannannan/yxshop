import { getPublicTechnicalCatalog } from '@/lib/technical-service-data';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const params = new URL(request.url).searchParams, slug = params.get('slug');
  try {
    const catalog = await getPublicTechnicalCatalog();
    const services = catalog.services.filter(service => (!slug || service.slug === slug) && (params.get('homepage') !== '1' || service.homepageFeatured));
    const responseHeaders = { ...headers, ...(catalog.fallback ? { 'X-Yxshop-Fallback': '1' } : {}) };
    return slug ? services[0] ? Response.json(services[0], { headers: responseHeaders }) : Response.json({ message: '服务不存在' }, { status: 404, headers })
      : Response.json(services, { headers: responseHeaders });
  } catch (error) {
    console.error('读取技术服务失败', (error as { code?: string }).code || (error as Error).name);
    return Response.json({ message: '技术服务读取失败' }, { status: 503, headers });
  }
}
