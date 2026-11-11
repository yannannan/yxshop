import { env } from '@/db/mysql-runtime';
import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { toolEntryRows, type ToolRow } from '@/lib/tool-entries';
import { readToolEntrySettings } from '@/lib/tool-entry-settings';
import { readModulePrices } from '@/lib/tool-module-pricing';
import { requireImageOrigin } from '@/lib/image-request';
const headers = { 'Cache-Control': 'private, no-store' };
const query = "SELECT * FROM products WHERE product_type='tool' ORDER BY sort_order,id";
export async function GET(request: Request) {
  const admin = await getAdminContext(request); if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  try {
    const rows = (await env.DB.prepare(query).all<ToolRow>()).results, config = await readToolEntrySettings();
    const owner = rows.find(row => row.tool_slug === 'document-signature');
    const prices = owner ? await readModulePrices(Number(owner.id), 'document-signature').catch(error => { if (error?.code === 'ER_NO_SUCH_TABLE') return {} as Record<string, number>; throw error; }) : {};
    return Response.json({ tools: toolEntryRows(rows, config.settings, prices.handprint), sortingReady: config.ready }, { headers });
  } catch (error) { console.error('工具入口管理读取失败', error); return Response.json({ message: '工具列表读取失败，请查看服务端日志' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const admin = await getAdminContext(request); if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  try {
    requireImageOrigin(request);
    const text = await request.text(); if (text.length > 80000) return Response.json({ message: '排序数据过大' }, { status: 413, headers });
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ message: '入口参数格式不正确' }, { status: 400, headers });
    if (body.action !== 'sort' && body.action !== 'visibility') return Response.json({ message: '未知入口操作' }, { status: 400, headers });
    if (body.action === 'sort' && (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > 500 || body.entries.some((item: { slug?: unknown; sort?: unknown }) => typeof item?.slug !== 'string' || typeof item.sort !== 'number' || !Number.isSafeInteger(item.sort) || item.sort < 0 || item.sort > 1000000) || new Set(body.entries.map((item: { slug: string }) => item.slug)).size !== body.entries.length)) return Response.json({ message: '请填写 0～1000000 的整数排序，工具不能重复' }, { status: 400, headers });
    if (body.action === 'visibility' && (body.slug !== 'handprint-maker' || typeof body.enabled !== 'boolean')) return Response.json({ message: '入口参数不正确' }, { status: 400, headers });
    await env.DB.transaction(async db => {
      const rows = (await db.prepare(query + ' FOR UPDATE').all<ToolRow>()).results;
      const current = (await db.prepare('SELECT tool_slug,sort_order,enabled FROM tool_entry_settings FOR UPDATE').all<{ tool_slug: string; sort_order: number; enabled: number }>()).results;
      const entries = toolEntryRows(rows, current), known = new Set(entries.map(row => row.tool_slug));
      if (body.action === 'sort' && (body.entries.length !== known.size || body.entries.some((row: { slug: string }) => !known.has(row.slug)))) throw Error('STALE');
      const changes: { slug: string; sort: number }[] = body.action === 'sort' ? body.entries : [{ slug: body.slug, sort: entries.find(row => row.tool_slug === body.slug)?.entry_sort ?? -1 }];
      for (const row of changes) {
        if (!known.has(row.slug)) throw Error('STALE');
        const enabled = body.action === 'visibility' ? Number(body.enabled) : Number(current.find(item => item.tool_slug === row.slug)?.enabled ?? 1);
        await db.prepare('INSERT INTO tool_entry_settings (tool_slug,sort_order,enabled,updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order),enabled=VALUES(enabled),updated_at=VALUES(updated_at)').bind(row.slug, row.sort, enabled, new Date().toISOString()).run();
      }
    });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const missing = (error as { code?: string })?.code === 'ER_NO_SUCH_TABLE';
    const status = (error as { status?: number })?.status ?? (error instanceof SyntaxError ? 400 : (error as Error)?.message === 'STALE' ? 409 : 503);
    return Response.json({ message: missing ? '请先执行15号工具管理增量SQL，再保存排序或入口状态' : status === 409 ? '工具列表已变化，请刷新后重新排序' : status === 403 ? '请从管理端发起操作' : '入口配置保存失败，请检查参数或服务端日志' }, { status, headers });
  }
}
