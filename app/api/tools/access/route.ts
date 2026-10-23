import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { builtInToolEntry, isToolEntryUrl, isToolSlug } from '@/lib/tool-services';
import { getToolEntitlement } from '@/lib/tool-entitlements';

export async function GET(request: Request) {
  try { return await resolveAccess(request); }
  catch (error) {
    console.error('工具入口读取失败', error);
    return Response.json({ message: '工具入口暂不可用，请稍后重试' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function resolveAccess(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const slug = new URL(request.url).searchParams.get('slug') || '';
  if (!isToolSlug(slug)) return Response.json({ message: '工具不存在' }, { status: 404, headers });
  const tool = await env.DB.prepare("SELECT id,tool_url,tool_charge_type,price FROM products WHERE product_type='tool' AND status='active' AND tool_slug=?")
    .bind(slug).first<{ id: number; tool_url: string; tool_charge_type: string; price: number }>();
  if (!tool) return Response.json({ message: '工具不存在或已停用' }, { status: 404, headers });
  const entryUrl = builtInToolEntry(slug) || tool.tool_url;
  if (!entryUrl || !isToolEntryUrl(entryUrl)) return Response.json({ message: '工具入口尚未配置' }, { status: 409, headers });
  if (tool.tool_charge_type === 'pending') return Response.json({ message: '该工具的收费方式尚未确认' }, { status: 409, headers });
  if (tool.tool_charge_type === 'paid') {
    const phone = getVerifiedSessionPhone(request);
    const purchaseUrl = `/product/${tool.id}`;
    if (!phone) return Response.json({ message: '请先购买并完成支付核验', purchaseUrl }, { status: 401, headers });
    const user = await env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
    const order = user ? await getToolEntitlement(user.id, tool.id) : null;
    if (!order) return Response.json({ message: '暂无可用套餐，请购买或续购并完成支付核验', purchaseUrl }, { status: 402, headers });
  } else if (tool.tool_charge_type !== 'free') {
    return Response.json({ message: '工具收费配置异常' }, { status: 409, headers });
  }
  return Response.json({ entryUrl }, { headers });
}
