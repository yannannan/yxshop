import { env } from '@/db/mysql-runtime';
import { ensureDatabase, getSessionPhone } from '../../../db/setup';
import { sendOrderNotification } from '../../../lib/order-notifications';

export async function POST(request: Request) {
  await ensureDatabase();
  const phone = getSessionPhone(request);
  if (!phone) return Response.json({ message: '请先登录' }, { status: 401 });
  const { productId, action, orderId, rechargeJson } = await request.json() as { productId?: number; action?: string; orderId?: string; rechargeJson?: string };
  const user = await env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
  if (!user) return Response.json({ message: '用户不可用' }, { status: 401 });
  if (action === 'payment-finished') {
    const order = await env.DB.prepare("SELECT o.id,o.amount,o.status,o.created_at,p.name AS product_name,p.category,p.subcategory,u.phone,u.email FROM orders o JOIN products p ON p.id=o.product_id JOIN users u ON u.id=o.user_id WHERE o.id=? AND o.user_id=? AND o.status='paid'").bind(orderId, user.id).first<{ id: string; amount: number; status: string; created_at: string; product_name: string; category: string; subcategory: string; phone: string; email: string }>();
    if (!order) return Response.json({ message: '请扫码支付后再点击已完成支付' }, { status: 400 });
    if (order.category === '会员充值服务' && order.subcategory === 'ChatGPT会员充值') return Response.json({ ok: true, status: 'paid', nextStep: 'recharge' });
    await env.DB.prepare("UPDATE orders SET status='pending_delivery',updated_at=? WHERE id=? AND user_id=?").bind(new Date().toISOString(), orderId, user.id).run();
    return Response.json({ ok: true, status: 'pending_delivery' });
  }
  if (action === 'recharge-submit') {
    const jsonText = String(rechargeJson || '').trim();
    if (!jsonText) return Response.json({ message: '请先粘贴浏览器弹出的完整JSON字符串' }, { status: 400 });
    const rechargeOrder = await env.DB.prepare("SELECT o.id FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=? AND o.user_id=? AND o.status='paid' AND p.category='会员充值服务' AND p.subcategory='ChatGPT会员充值'").bind(orderId, user.id).first();
    if (!rechargeOrder) return Response.json({ message: '请扫码支付后再点击已完成支付' }, { status: 400 });
    await env.DB.prepare("UPDATE orders SET status='pending_delivery',recharge_json=?,updated_at=? WHERE id=? AND user_id=?").bind(jsonText, new Date().toISOString(), orderId, user.id).run();
    return Response.json({ ok: true, status: 'pending_delivery' });
  }
  const product = await env.DB.prepare("SELECT id,price,name,category FROM products WHERE id=? AND status='active'").bind(productId).first<{ id: number; price: number; name: string; category: string }>();
  if (!product) return Response.json({ message: '商品不可用' }, { status: 400 });
  const newOrderId = await createOrderId(phone);
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO orders (id,user_id,product_id,amount,status,delivery_content,recharge_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(newOrderId, user.id, product.id, product.price, 'pending', '', '', createdAt).run();
  try {
    await sendOrderNotification('payment', { id: newOrderId, amount: product.price, status: 'pending', created_at: createdAt, product_name: product.name, category: product.category, phone, email: (await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(user.id).first<{ email: string }>())?.email || '' });
  } catch (error) {
    // 通知失败不应回滚已创建订单；后台可在通知记录中排查与补发。
    console.error('下单通知处理失败', error);
  }
  return Response.json({ ok: true, orderId: newOrderId });
}

async function createOrderId(phone: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const orderId = `QX${phone}_${code}`;
    const existing = await env.DB.prepare('SELECT id FROM orders WHERE id=?').bind(orderId).first();
    if (!existing) return orderId;
  }
  throw new Error('订单编号生成失败，请重试');
}

export async function GET(request: Request) {
  await ensureDatabase();
  const phone = getSessionPhone(request);
  if (!phone) return Response.json({ message: '请先登录' }, { status: 401 });
  const user = await env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
  if (!user) return Response.json({ message: '用户不可用' }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    const { results } = await env.DB.prepare('SELECT o.*, p.name AS product_name, p.category, p.subcategory, u.email, u.phone FROM orders o JOIN products p ON p.id=o.product_id JOIN users u ON u.id=o.user_id WHERE o.user_id=? ORDER BY o.created_at DESC').bind(user.id).all();
    return Response.json(results);
  }
  const order = await env.DB.prepare('SELECT o.*, p.name AS product_name, p.category, p.subcategory, u.email, u.phone FROM orders o JOIN products p ON p.id=o.product_id JOIN users u ON u.id=o.user_id WHERE o.id=? AND o.user_id=?').bind(id, user.id).first();
  return order ? Response.json(order) : Response.json({ message: '订单不存在' }, { status: 404 });
}
