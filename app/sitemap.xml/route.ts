import { getPublishedTools } from '@/lib/tool-service-data';
import { siteOrigin, toolPagePath } from '@/lib/tool-services';

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
  const tools = await getPublishedTools();
  const origin = siteOrigin();
  const urls = [{ url: origin, updated: '' }, { url: `${origin}/tools`, updated: '' }, ...tools.map(tool => ({ url: `${origin}${toolPagePath(tool.slug)}`, updated: tool.updatedAt }))];
  const body = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map(item => `<url><loc>${escapeXml(item.url)}</loc>${item.updated && !Number.isNaN(Date.parse(item.updated)) ? `<lastmod>${new Date(item.updated).toISOString()}</lastmod>` : ''}</url>`).join('') + '</urlset>';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
