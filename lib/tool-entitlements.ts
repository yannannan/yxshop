import { env } from '@/db/mysql-runtime';
import { isToolBillingCycle, toolAccessExpiresAt } from './tool-services';

export type ToolOrderAccess = { id: string; tool_billing_cycle: string; tool_paid_at: string | null; tool_uses_remaining: number; tool_plan_name?: string };

export function usableToolOrder(order: ToolOrderAccess, now = Date.now()) {
  const cycle = order.tool_billing_cycle || 'once';
  if (!isToolBillingCycle(cycle)) return false;
  if (cycle === 'once') return true;
  if (cycle === 'times') return Number(order.tool_uses_remaining) > 0;
  const expiresAt = toolAccessExpiresAt(cycle, order.tool_paid_at || '');
  const startsAt = Date.parse(order.tool_paid_at || '');
  return Boolean(expiresAt && startsAt <= now && Date.parse(expiresAt) > now);
}

export async function getToolEntitlement(userId: number, productId: number) {
  const { results } = await env.DB.prepare("SELECT o.id,o.tool_billing_cycle,o.tool_paid_at,o.tool_uses_remaining FROM orders o JOIN users u ON u.id=o.user_id WHERE o.user_id=? AND u.status='active' AND o.product_id=? AND o.status IN ('paid','pending_delivery','delivered') ORDER BY o.created_at,o.id").bind(userId, productId).all<ToolOrderAccess>();
  // 有效时长套餐优先，避免在包月/包年有效期内消耗次数。
  return results.filter(order => usableToolOrder(order)).sort((a, b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'))[0] || null;
}

// 供工具服务端在处理成功后调用，operationId 必须是可信的任务唯一编号。
// 只在此处扣次，工具页面和入口接口都不调用；同一任务重复回调不会重复扣次。
export async function recordSuccessfulToolUse(userId: number, productId: number, operationId: string) {
  if (!operationId || operationId.length > 128) throw new Error('工具任务编号不正确');
  const previous = () => env.DB.prepare('SELECT e.operation_id FROM tool_usage_events e JOIN orders o ON o.id=e.order_id WHERE e.operation_id=? AND o.user_id=? AND o.product_id=?').bind(operationId, userId, productId).first();
  if (await previous()) return { charged: false, duplicate: true };
  const order = await getToolEntitlement(userId, productId);
  if (!order) throw new Error('工具套餐已过期或可用次数不足');
  if (order.tool_billing_cycle !== 'times') return { charged: false, duplicate: false };
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') AND tool_uses_remaining>0 AND NOT EXISTS (SELECT 1 FROM tool_usage_events WHERE operation_id=?)").bind(order.id, userId, productId, operationId).expectChanges(1),
      env.DB.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)').bind(operationId, order.id, new Date().toISOString()),
    ]);
    return { charged: true, duplicate: false };
  } catch (error) {
    if (await previous()) return { charged: false, duplicate: true };
    throw error;
  }
}
