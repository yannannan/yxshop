import { siteOrigin } from '@/lib/tool-services';

export function GET() {
  return new Response(['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout/', 'Disallow: /orders', 'Disallow: /service-orders', 'Disallow: /addresses', 'Disallow: /technician', `Sitemap: ${siteOrigin()}/sitemap.xml`, ''].join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
