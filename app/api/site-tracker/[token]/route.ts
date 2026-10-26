import { activeTracker, recordSiteVisit, siteTrackerScript, trackingOrigin, validTrackingToken } from '@/lib/site-tracking';
export const runtime = 'nodejs';
type Context = { params: Promise<{ token: string }> };
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' };
export async function GET(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const tracker = await activeTracker(token);
    if (!tracker) return new Response('', { status: 404, headers });
    return new Response(siteTrackerScript(new URL(request.url).origin + new URL(request.url).pathname, tracker.site_id, tracker.host), { headers: { ...headers, 'Content-Type': 'application/javascript; charset=utf-8' } });
  } catch { return new Response('', { status: 503, headers }); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    if (!validTrackingToken(token)) return new Response('', { status: 404, headers });
    const reader = request.body?.getReader(); if (!reader) return new Response('', { status: 400, headers });
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 4096) { await reader.cancel(); return new Response('', { status: 413, headers }); } chunks.push(value.value); } } finally { reader.releaseLock(); }
    const origin = await recordSiteVisit(token, request, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return new Response(null, { status: 204, headers: { ...headers, Vary: 'Origin', 'Access-Control-Allow-Origin': origin } });
  } catch (error) { return new Response('', { status: typeof (error as { status?: number })?.status === 'number' ? (error as { status: number }).status : error instanceof SyntaxError ? 400 : 503, headers }); }
}
export async function OPTIONS(request: Request, context: Context) {
  try {
    const site = await activeTracker((await context.params).token), origin = site ? trackingOrigin(request, site.host) : '';
    return new Response(null, { status: origin ? 204 : 403, headers: { ...headers, Vary: 'Origin', ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {}) } });
  } catch { return new Response(null, { status: 503, headers }); }
}
