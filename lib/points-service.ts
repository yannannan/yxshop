import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { initialPoints, validPoints, type PointsPackage } from './points';

export class PointsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type PointsDatabase = Pick<typeof env.DB, 'prepare'>;
export async function pointsUser(request: Request) {
  const phone = getVerifiedSessionPhone(request);
  if (!phone) return null;
  return env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
}
// 所有钱包写入先锁用户，再锁钱包；与印章和充值使用相同的锁顺序。
export async function lockPointsUser(db: PointsDatabase, userId: number) {
  const user = await db.prepare("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE").bind(userId).first();
  if (!user) throw new PointsError('请登录有效账号后使用积分', 401);
}
export async function ensurePointsWallet(db: PointsDatabase, userId: number) {
  let wallet = await db.prepare('SELECT balance FROM points_wallets WHERE user_id=? FOR UPDATE').bind(userId).first<{ balance: number }>();
  if (!wallet) {
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO points_wallets (user_id,balance,created_at,updated_at) VALUES (?,?,?,?)').bind(userId, initialPoints, now, now).run();
    await db.prepare('INSERT INTO points_ledger (operation_id,user_id,kind,delta,balance_after,product_id,order_id,created_at) VALUES (?,?,?,?,?,NULL,NULL,?)').bind(`welcome:${userId}`, userId, 'welcome', initialPoints, initialPoints, now).run();
    wallet = { balance: initialPoints };
  }
  return Number(wallet.balance);
}
export async function pointsBalance(userId: number) {
  return env.DB.transaction(async db => { await lockPointsUser(db, userId); return ensurePointsWallet(db, userId); });
}
export async function consumePoints(db: PointsDatabase, userId: number, productId: number, cost: number, operation: string) {
  if (!validPoints(cost)) throw new PointsError('工具积分消耗尚未正确配置', 409);
  const previous = await db.prepare('SELECT user_id,product_id,delta,balance_after FROM points_ledger WHERE operation_id=?').bind(operation).first<{ user_id: number; product_id: number; delta: number; balance_after: number }>();
  if (previous) {
    if (Number(previous.user_id) !== userId || Number(previous.product_id) !== productId) throw new PointsError('积分任务不属于当前用户或工具', 409);
    return { charged: false, pointsSpent: -Number(previous.delta), pointsBalance: Number(previous.balance_after), duplicate: true };
  }
  const balance = await ensurePointsWallet(db, userId);
  if (balance < cost) throw new PointsError('积分不足，请充值后再试', 402);
  const now = new Date().toISOString();
  await db.prepare('UPDATE points_wallets SET balance=balance-?,updated_at=? WHERE user_id=? AND balance>=?').bind(cost, now, userId, cost).expectChanges(1).run();
  await db.prepare('INSERT INTO points_ledger (operation_id,user_id,kind,delta,balance_after,product_id,order_id,created_at) VALUES (?,?,?,?,?,?,NULL,?)').bind(operation, userId, 'consume', -cost, balance - cost, productId, now).run();
  return { charged: true, pointsSpent: cost, pointsBalance: balance - cost, duplicate: false };
}
export async function pointsPackages(onlyActive = true): Promise<PointsPackage[]> {
  const { results } = await env.DB.prepare(`SELECT p.id,p.name,p.points_amount AS points,p.price,p.description,p.status,EXISTS(SELECT 1 FROM payment_qrs q WHERE q.product_id=p.id AND q.amount=p.price AND q.status='active' AND q.image_url IS NOT NULL AND q.image_url<>'') AS paymentReady FROM products p WHERE p.product_type='points'${onlyActive ? " AND p.status='active'" : ''} ORDER BY p.sort_order,p.id`).all<PointsPackage>();
  return results.map(row => ({ ...row, id: Number(row.id), points: Number(row.points), price: Number(row.price), paymentReady: Boolean(Number(row.paymentReady)) }));
}
// 普通订单不受影响；充值订单金额与积分数量以下单快照为准。
export async function changePointsOrderStatus(orderId: string, status: string): Promise<boolean> {
  const identity = await env.DB.prepare('SELECT o.user_id,p.product_type FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=?').bind(orderId).first<{ user_id: number; product_type: string }>();
  if (identity?.product_type !== 'points') return false;
  if (!['pending', 'paid', 'pending_delivery', 'delivered', 'closed'].includes(status)) throw new PointsError('充值订单状态不正确');
  await env.DB.transaction(async db => {
    await lockPointsUser(db, Number(identity.user_id));
    const order = await db.prepare('SELECT id,user_id,points_amount,status FROM orders WHERE id=? FOR UPDATE').bind(orderId).first<{ id: string; user_id: number; points_amount: number; status: string }>();
    if (!order || Number(order.user_id) !== Number(identity.user_id)) throw new PointsError('充值订单不存在', 404);
    const previous = await db.prepare('SELECT operation_id FROM points_ledger WHERE operation_id=?').bind(`recharge:${orderId}`).first();
    if (previous && ['pending', 'closed'].includes(status)) throw new PointsError('积分已到账的充值订单不能直接改回待支付或作废；请保留账务记录', 409);
    if (!previous && ['paid', 'pending_delivery', 'delivered'].includes(status)) {
      if (order.status === 'closed') throw new PointsError('充值订单已关闭，请创建新订单', 409);
      const amount = Number(order.points_amount);
      if (!validPoints(amount)) throw new PointsError('充值订单缺少有效的积分快照', 409);
      const balance = await ensurePointsWallet(db, Number(order.user_id));
      if (balance + amount > 9000000000000) throw new PointsError('积分余额已达上限', 409);
      const now = new Date().toISOString();
      await db.prepare('UPDATE points_wallets SET balance=balance+?,updated_at=? WHERE user_id=?').bind(amount, now, order.user_id).expectChanges(1).run();
      await db.prepare('INSERT INTO points_ledger (operation_id,user_id,kind,delta,balance_after,product_id,order_id,created_at) VALUES (?,?,?,?,?,NULL,?,?)').bind(`recharge:${orderId}`, order.user_id, 'recharge', amount, balance + amount, orderId, now).run();
    }
    const now = new Date().toISOString();
    const target = ['paid', 'pending_delivery', 'delivered'].includes(status) ? 'delivered' : status;
    await db.prepare('UPDATE orders SET status=?,updated_at=?,delivered_at=CASE WHEN ?=\'delivered\' THEN COALESCE(delivered_at,?) ELSE delivered_at END WHERE id=?').bind(target, now, target, now, orderId).run();
  });
  return true;
}
export function pointsFailure(error: unknown) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (error instanceof SyntaxError) return Response.json({ message: '请求参数格式不正确' }, { status: 400, headers });
  if (error instanceof PointsError) return Response.json({ message: error.message }, { status: error.status, headers });
  console.error('积分服务失败', error);
  const code = (error as { code?: string }).code;
  return Response.json({ message: ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code || '') ? '积分服务尚未初始化，请管理员执行 07 通用积分增量 SQL' : '积分服务暂不可用，请稍后重试' }, { status: 503, headers });
}
