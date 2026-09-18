import { env } from '@/db/mysql-runtime';
import { ensureDatabase, getSessionPhone } from '../../../db/setup';

export async function GET(request: Request) {
  await ensureDatabase();
  const phone = getSessionPhone(request);
  if (!phone) return Response.json({ message: '请先登录' }, { status: 401 });
  const user = await env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
  if (!user) return Response.json({ message: '用户不可用' }, { status: 401 });

  const url = new URL(request.url);
  const orderId = String(url.searchParams.get('orderId') || '').trim();
  const type = url.searchParams.get('type') === 'alipay' ? 'alipay' : 'wechat';
  if (!orderId) return Response.json({ message: '服务订单参数不完整' }, { status: 400 });

  const order = await env.DB.prepare("SELECT id,service_id,amount,status FROM technical_service_orders WHERE id=? AND user_id=?").bind(orderId, user.id).first<{ id: string; service_id: number; amount: number | null; status: string }>();
  if (!order) return Response.json({ message: '服务订单不存在' }, { status: 404 });
  if (order.amount === null || Number(order.amount) <= 0) return Response.json({ message: '服务金额尚未确认' }, { status: 400 });

  try {
    const qr = await env.DB.prepare("SELECT id,name,type,image_url AS imageUrl FROM technical_payment_qrs WHERE service_id=? AND type=? AND status='active' ORDER BY id DESC LIMIT 1").bind(order.service_id, type).first();
    return qr ? Response.json({ ...qr, amount: Number(order.amount) }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ message: '该技术服务暂未配置收款二维码' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/technical_payment_qrs|doesn't exist|does not exist|no such table/i.test(message)) return Response.json({ message: '技术服务收款二维码尚未初始化' }, { status: 404 });
    console.error('读取技术服务收款码失败', error);
    return Response.json({ message: '收款二维码读取失败' }, { status: 500 });
  }
}
