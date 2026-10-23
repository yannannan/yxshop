import { pointsFailure, PointsError } from '@/lib/points-service';
import { readToolUsageTicket, recordSuccessfulPointsToolUse, validUsageSecret } from '@/lib/tool-points-usage';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (!validUsageSecret(request.headers.get('x-tool-usage-secret') || '')) throw new PointsError('工具回调验证失败', 401);
    const text = await request.text();
    if (text.length > 4096) throw new PointsError('回调参数过大', 413);
    let body;
    try { body = JSON.parse(text) as { ticket?: string; success?: boolean }; } catch { throw new PointsError('回调参数不正确'); }
    if (!body || typeof body.ticket !== 'string' || typeof body.success !== 'boolean') throw new PointsError('请提供任务凭据及处理结果');
    const ticket = readToolUsageTicket(body.ticket);
    if (!body.success) return Response.json({ ok: true, charged: false }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ ok: true, ...await recordSuccessfulPointsToolUse(ticket) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pointsFailure(error); }
}
