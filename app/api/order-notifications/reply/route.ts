import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../../db/setup';
import { replyStatusMap } from '../../../../lib/order-notifications';

export async function POST(request: Request) {
  await ensureDatabase();
  if (!env.ORDER_REPLY_TOKEN || request.headers.get('x-order-reply-token') !== env.ORDER_REPLY_TOKEN) return Response.json({ message: '回复验证失败' }, { status: 401 });
  const body = await request.json() as { orderId?: string; status?: string; subject?: string; text?: string };
  const source = `${body.orderId || ''}\n${body.subject || ''}\n${body.text || ''}`;
  const orderId = body.orderId || source.match(/QX\d{11}_[A-Z0-9]+/i)?.[0];
  const reply = String(body.status || source.match(/待支付|已支付|待发货|已发货|已作废/)?.[0] || '').trim();
  const status = replyStatusMap[reply];
  if (!orderId || !status) return Response.json({ message: '请提供订单号和有效回复状态' }, { status: 400 });
  const order = await env.DB.prepare('SELECT credential_id FROM orders WHERE id=?').bind(orderId).first<{ credential_id: number | null }>();
  if (!order) return Response.json({ message: '订单不存在' }, { status: 404 });
  const now = new Date().toISOString();
  if (status === 'delivered') await env.DB.prepare('UPDATE orders SET status=?,delivered_at=COALESCE(delivered_at,?),updated_at=? WHERE id=?').bind(status, now, now, orderId).run();
  else {
    if (order.credential_id) {
      await env.DB.batch([
        env.DB.prepare("UPDATE credential_assignments SET status='released',released_at=? WHERE order_id=? AND status='active'").bind(now, orderId),
        env.DB.prepare('UPDATE orders SET credential_id=NULL WHERE id=?').bind(orderId),
      ]);
      const active = await env.DB.prepare("SELECT COUNT(*) AS total FROM credential_assignments WHERE credential_id=? AND status='active'").bind(order.credential_id).first<{ total: number }>();
      if (!Number(active?.total || 0)) await env.DB.prepare("UPDATE credentials SET status='available' WHERE id=? AND status='used'").bind(order.credential_id).run();
    }
    await env.DB.prepare('UPDATE orders SET status=?,delivered_at=NULL,updated_at=? WHERE id=?').bind(status, now, orderId).run();
  }
  return Response.json({ ok: true, orderId, status });
}
