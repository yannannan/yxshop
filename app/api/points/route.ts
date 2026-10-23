import { env } from '@/db/mysql-runtime';
import { pointsBalance, pointsFailure, pointsPackages, pointsUser, PointsError } from '@/lib/points-service';
import { validPoints, type PointsLedger } from '@/lib/points';
import { sendOrderNotification } from '@/lib/order-notifications';

export async function GET(request: Request) {
  try {
    const user = await pointsUser(request), packages = await pointsPackages();
    if (!user) return Response.json({ signedIn: false, balance: 0, packages, ledger: [], total: 0, page: 1 }, { headers: { 'Cache-Control': 'private, no-store' } });
    const balance = await pointsBalance(user.id);
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM points_ledger WHERE user_id=?').bind(user.id).first<{ total: number }>();
    const total = Number(count?.total || 0), requested = Number(new URL(request.url).searchParams.get('page')) || 1;
    const page = Math.max(1, Math.min(Math.ceil(total / 20) || 1, Math.floor(requested)));
    const ledger = await env.DB.prepare('SELECT l.*,p.name AS product_name FROM points_ledger l LEFT JOIN products p ON p.id=l.product_id WHERE l.user_id=? ORDER BY l.created_at DESC,l.operation_id DESC LIMIT 20 OFFSET ?').bind(user.id, (page - 1) * 20).all<PointsLedger>();
    return Response.json({ signedIn: true, balance, packages, ledger: ledger.results, total, page }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return pointsFailure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await pointsUser(request);
    if (!user) throw new PointsError('请先登录后充值积分', 401);
    const body = await request.json() as { packageId?: number };
    if (!body || typeof body !== 'object') throw new PointsError('请选择积分充值套餐');
    if (!Number.isSafeInteger(body.packageId) || Number(body.packageId) <= 0) throw new PointsError('请选择积分充值套餐');
    const pack = (await pointsPackages()).find(item => item.id === body.packageId);
    if (!pack) throw new PointsError('充值套餐不存在或已下架', 404);
    if (!validPoints(pack.points) || !Number.isFinite(pack.price) || pack.price <= 0) throw new PointsError('充值套餐配置异常，请联系管理员', 409);
    if (!pack.paymentReady) throw new PointsError('该充值套餐暂未配置收款码，请联系管理员', 409);
    const profile = await env.DB.prepare('SELECT phone,email FROM users WHERE id=?').bind(user.id).first<{ phone: string; email: string }>();
    const id = `QX${profile!.phone}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO orders (id,user_id,product_id,amount,status,delivery_content,recharge_json,created_at,points_amount) VALUES (?,?,?,?,'pending','','',?,?)").bind(id, user.id, pack.id, pack.price, now, pack.points).run();
    try { await sendOrderNotification('payment', { id, amount: pack.price, status: 'pending', created_at: now, product_name: pack.name, category: '积分充值', phone: profile!.phone, email: profile!.email }); } catch (error) { console.error('积分充值通知失败', error); }
    return Response.json({ ok: true, orderId: id });
  } catch (error) { return pointsFailure(error); }
}
