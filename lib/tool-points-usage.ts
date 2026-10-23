import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { env } from '@/db/mysql-runtime';
import { consumePoints, lockPointsUser, PointsError } from './points-service';
import { usableToolOrder, type ToolOrderAccess } from './tool-entitlements';

type Ticket = { userId: number; productId: number; cost: number; operationId: string; expires: number };
function secret() {
  const value = process.env.TOOLS_USAGE_SECRET || '';
  if (value.length < 32) throw new PointsError('该工具的积分成功回调尚未配置，请联系管理员', 503);
  return value;
}
function equal(a: string, b: string) {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export function validUsageSecret(value: string) { return equal(value, secret()); }
export function createToolUsageTicket(userId: number, productId: number, cost: number) {
  const value: Ticket = { userId, productId, cost, operationId: `tool:${randomUUID()}`, expires: Date.now() + 2 * 60 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${data}.${createHmac('sha256', secret()).update(data).digest('base64url')}`;
}
export function readToolUsageTicket(ticket: string): Ticket {
  if (ticket.length > 2048) throw new PointsError('工具任务凭据不正确', 401);
  const parts = ticket.split('.');
  if (parts.length !== 2 || !equal(parts[1], createHmac('sha256', secret()).update(parts[0]).digest('base64url'))) throw new PointsError('工具任务凭据不正确', 401);
  let value: Ticket;
  try { value = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch { throw new PointsError('工具任务凭据不正确', 401); }
  if (!value || !Number.isSafeInteger(value.userId) || value.userId <= 0 || !Number.isSafeInteger(value.productId) || value.productId <= 0 || !/^tool:[0-9a-f-]{36}$/.test(value.operationId) || !Number.isFinite(value.expires) || value.expires < Date.now()) throw new PointsError('工具任务凭据已失效，请重新进入工具', 401);
  return value;
}

// 仅由可信工具服务端在成功处理后调用。确认扣分成功后再向用户交付结果。
export async function recordSuccessfulPointsToolUse(ticket: Ticket) {
  return env.DB.transaction(async db => {
    await lockPointsUser(db, ticket.userId);
    const points = await db.prepare('SELECT user_id,product_id,delta,balance_after FROM points_ledger WHERE operation_id=?').bind(ticket.operationId).first<{ user_id: number; product_id: number; delta: number; balance_after: number }>();
    if (points) {
      if (Number(points.user_id) !== ticket.userId || Number(points.product_id) !== ticket.productId) throw new PointsError('任务归属不正确', 409);
      return { charged: false, duplicate: true, pointsSpent: -Number(points.delta), pointsBalance: Number(points.balance_after) };
    }
    const event = await db.prepare('SELECT o.user_id,o.product_id FROM tool_usage_events e JOIN orders o ON o.id=e.order_id WHERE e.operation_id=?').bind(ticket.operationId).first<{ user_id: number; product_id: number }>();
    if (event) {
      if (Number(event.user_id) !== ticket.userId || Number(event.product_id) !== ticket.productId) throw new PointsError('任务归属不正确', 409);
      return { charged: false, duplicate: true, pointsSpent: 0 };
    }
    const tool = await db.prepare("SELECT tool_points_cost FROM products WHERE id=? AND product_type='tool' AND status='active' AND tool_charge_type='points' FOR UPDATE").bind(ticket.productId).first<{ tool_points_cost: number }>();
    if (!tool || Number(tool.tool_points_cost) !== ticket.cost) throw new PointsError('工具积分价格已变更，请重新进入后处理', 409);
    const { results } = await db.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id FOR UPDATE").bind(ticket.userId, ticket.productId).all<ToolOrderAccess>();
    const order = results.filter(item => usableToolOrder(item)).sort((a, b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'))[0];
    if (order) {
      const charged = order.tool_billing_cycle === 'times';
      if (charged) await db.prepare('UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND tool_uses_remaining>0').bind(order.id, ticket.userId).expectChanges(1).run();
      await db.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)').bind(ticket.operationId, order.id, new Date().toISOString()).run();
      return { charged, duplicate: false, pointsSpent: 0 };
    }
    return consumePoints(db, ticket.userId, ticket.productId, ticket.cost, ticket.operationId);
  });
}
