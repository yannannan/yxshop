import { softwareDownload, softwareFailure } from '@/lib/software-release-service';
export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams, url = await softwareDownload(params.get('release') || ''); return params.get('format') === 'json' ? Response.json({ url }, { headers: { 'Cache-Control': 'no-store' } }) : new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
  catch (error) { return softwareFailure(error, true); }
}
export function HEAD() { return new Response(null, { status: 405, headers: { Allow: 'GET' } }); }
