import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { usableToolOrder, type ToolOrderAccess } from './tool-entitlements';
import { toolAccessExpiresAt } from './tool-services';
import { stampImageData, type StampAccess, type StampResult } from './stamp-options';

export class StampError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type StampTool = { id: number; tool_charge_type: 'free' | 'paid' | 'pending' };
type ResultRow = { id: string; user_id: number; product_id: number; request_hash: string; image_base64: string; image_size: number; created_at: string; charged: number };
const resultColumns = 'id,user_id,product_id,request_hash,image_base64,image_size,created_at,charged';
const publicResult = (row: ResultRow, reused: boolean): StampResult => ({ id: row.id, ...stampImageData(row.image_base64), size: Number(row.image_size), createdAt: row.created_at, charged: !reused && Boolean(row.charged), reused });

export async function getStampTool(): Promise<StampTool> {
  const tool = await env.DB.prepare("SELECT id,tool_charge_type FROM products WHERE tool_slug='stamp-maker' AND product_type='tool' AND status='active'").first<StampTool>();
  if (!tool) throw new StampError('印章工具不存在或已停用', 404);
  if (!['free', 'paid', 'pending'].includes(tool.tool_charge_type)) throw new StampError('工具收费配置异常', 409);
  return tool;
}
export async function stampUser(request: Request) {
  const phone = getVerifiedSessionPhone(request);
  if (!phone) return null;
  return env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
}
function usableOrders(orders: ToolOrderAccess[]) {
  return orders.filter(order => usableToolOrder(order)).sort((a, b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'));
}
function balance(orders: ToolOrderAccess[]) {
  const usable = usableOrders(orders), first = usable[0];
  return { remaining: usable.filter(order => order.tool_billing_cycle === 'times').reduce((sum, order) => sum + Number(order.tool_uses_remaining), 0), cycle: first ? first.tool_billing_cycle || 'once' : null, membershipName: first?.tool_plan_name || null, expiresAt: first ? toolAccessExpiresAt(first.tool_billing_cycle, first.tool_paid_at || '') : null };
}
export async function stampAccess(tool: StampTool, user: { id: number } | null): Promise<StampAccess> {
  const orders = user && tool.tool_charge_type === 'paid' ? (await env.DB.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining,tool_plan_name FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id").bind(user.id, tool.id).all<ToolOrderAccess>()).results : [];
  const rights = balance(orders);
  const recent = user ? (await env.DB.prepare('SELECT id,image_size AS size,created_at AS createdAt FROM tool_generation_results WHERE user_id=? AND product_id=? ORDER BY created_at DESC,id DESC LIMIT 5').bind(user.id, tool.id).all<StampAccess['recent'][number]>()).results : [];
  return { chargeType: tool.tool_charge_type, signedIn: Boolean(user), canGenerate: tool.tool_charge_type === 'free' || (tool.tool_charge_type === 'paid' && Boolean(rights.cycle)), ...rights, purchaseUrl: `/product/${tool.id}`, recent };
}
export async function findStampResult(userId: number, productId: number, id: string, hash?: string) {
  const row = await env.DB.prepare(`SELECT ${resultColumns} FROM tool_generation_results WHERE id=? AND user_id=? AND product_id=?`).bind(id, userId, productId).first<ResultRow>();
  if (row && hash && row.request_hash !== hash) throw new StampError('制作参数已变化，请重新发起制作', 409);
  return row ? publicResult(row, true) : null;
}

// 图片先成功渲染；权益复核、扣次、成功日志和成品保存随后在同一事务内完成。
// 锁住当前用户使同用户并发请求串行，最后一次权益不能被两个不同任务同时消费。
export async function savePaidStamp(userId: number, productId: number, id: string, hash: string, image: Buffer, size: number): Promise<StampResult> {
  return env.DB.transaction(async db => {
    const user = await db.prepare("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE").bind(userId).first();
    if (!user) throw new StampError('请重新登录后制作', 401);
    const previous = await db.prepare(`SELECT ${resultColumns} FROM tool_generation_results WHERE id=? FOR UPDATE`).bind(id).first<ResultRow>();
    if (previous) {
      if (Number(previous.user_id) !== userId || Number(previous.product_id) !== productId || previous.request_hash !== hash) throw new StampError('制作任务与当前请求不匹配，请重新制作', 409);
      return publicResult(previous, true);
    }
    const tool = await db.prepare("SELECT id FROM products WHERE id=? AND product_type='tool' AND tool_slug='stamp-maker' AND status='active' AND tool_charge_type='paid' FOR UPDATE").bind(productId).first();
    if (!tool) throw new StampError('工具配置已变化，请刷新页面后重试', 409);
    const { results: orders } = await db.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id FOR UPDATE").bind(userId, productId).all<ToolOrderAccess>();
    const order = usableOrders(orders)[0];
    if (!order) throw new StampError('套餐已到期或可用次数不足，请购买或续费', 402);
    const charged = order.tool_billing_cycle === 'times';
    if (charged) await db.prepare('UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND tool_uses_remaining>0').bind(order.id, userId).expectChanges(1).run();
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)').bind(`stamp:${id}`, order.id, now).run();
    const base64 = image.toString('base64');
    await db.prepare('INSERT INTO tool_generation_results (id,user_id,product_id,order_id,request_hash,image_base64,image_size,charged,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, userId, productId, order.id, hash, base64, size, charged ? 1 : 0, now).run();
    return { id, ...stampImageData(base64), size, createdAt: now, charged, reused: false };
  });
}
