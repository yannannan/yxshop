import { createHash } from 'node:crypto';
import { env } from '@/db/mysql-runtime';
import { accountUser } from '@/lib/account-service';
import { toolFeatures } from '@/lib/tool-analytics';
import { isToolSlug } from '@/lib/tool-services';
import { requireImageOrigin } from '@/lib/image-request';
const recent = new Map<string, { count: number; until: number }>();
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
async function eventBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 2048) throw Object.assign(Error('large'), { status: 413 });
  const reader = request.body?.getReader(); if (!reader) throw Object.assign(Error('empty'), { status: 400 });
  const parts: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 2048) { await reader.cancel(); throw Object.assign(Error('large'), { status: 413 }); } parts.push(value); } }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let offset = 0; for (const part of parts) { data.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder().decode(data));
}
export async function POST(request: Request) {
  try {
    requireImageOrigin(request);
    const body = await eventBody(request);
    if (!body || !uuid(body.id) || !uuid(body.session) || typeof body.slug !== 'string' || !isToolSlug(body.slug) || !['entry', 'view', 'module'].includes(body.type) || typeof body.module !== 'string') return new Response(null, { status: 400 });
    const features = toolFeatures(body.slug);
    if (body.module && !Object.hasOwn(features, body.module) || body.type === 'module' && !body.module) return new Response(null, { status: 400 });
    const hash = createHash('sha256').update(body.session).digest('hex'), now = Date.now();
    for (const [key, value] of recent) if (value.until < now) recent.delete(key);
    if (recent.size >= 5000 && !recent.has(hash)) return new Response(null, { status: 429 });
    const limit = recent.get(hash) ?? { count: 0, until: now + 60000 }; if (++limit.count > 60) return new Response(null, { status: 429 }); recent.set(hash, limit);
    const tool = await env.DB.prepare("SELECT id FROM products WHERE product_type='tool' AND status='active' AND tool_slug=?").bind(body.slug === 'handprint-maker' ? 'document-signature' : body.slug).first();
    if (!tool) return new Response(null, { status: 404 });
    const user = await accountUser(request);
    await env.DB.prepare('INSERT IGNORE INTO tool_activity_events (id,tool_slug,module_key,event_type,user_id,session_hash,created_at) VALUES (?,?,?,?,?,?,?)').bind(body.id, body.slug, body.module, body.type, user?.id ?? null, hash, new Date().toISOString()).run();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Telemetry is best effort. Missing analytics schema must not block tool navigation or processing.
    return new Response(null, { status: (error as { status?: number })?.status ?? (error instanceof SyntaxError ? 400 : 503) });
  }
}
