import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url);
  const productId = Number(url.searchParams.get('productId'));
  const amount = Number(url.searchParams.get('amount'));
  const type = url.searchParams.get('type') === 'alipay' ? 'alipay' : 'wechat';
  if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(amount) || amount <= 0) return Response.json({ message: '订单商品或金额无效' }, { status: 400 });
  const qr = await env.DB.prepare("SELECT id,name,type,amount,image_url AS imageUrl FROM payment_qrs WHERE product_id=? AND status='active' AND type=? AND amount=? ORDER BY id DESC LIMIT 1").bind(productId, type, Number(amount.toFixed(2))).first();
  return qr ? Response.json(qr) : Response.json({ message: '暂未配置该金额的收款码' }, { status: 404 });
}
