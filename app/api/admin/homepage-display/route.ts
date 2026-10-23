import { env } from '@/db/mysql-runtime';
import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { readHomepageDisplay, validateHomepageDisplay, type HomepageItem } from '@/lib/homepage-display';

async function items() {
  return (await env.DB.prepare("SELECT id,name,category,product_type,status FROM products WHERE status<>'closed' AND product_type<>'points' ORDER BY sort_order,id").all<HomepageItem>()).results;
}

export async function GET(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin || !hasAdminPermission(admin, 'homepage-display')) return adminDenied();
  try {
    const [row, products] = await Promise.all([
      env.DB.prepare('SELECT config_json FROM homepage_display_settings WHERE id=1').first<{ config_json: string }>(), items(),
    ]);
    const config = readHomepageDisplay(row?.config_json);
    const ids = new Set(products.map(item => Number(item.id)));
    return Response.json({ config: { ...config, itemOrder: config.itemOrder.filter(id => ids.has(id)) }, items: products }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('首页展示管理读取失败', error);
    return Response.json({ message: (error as { code?: string }).code === 'ER_NO_SUCH_TABLE' ? '请先执行 05_homepage_display_20261023115743.sql，初始化首页展示配置。' : '首页展示配置读取失败，请稍后重试。' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin || !hasAdminPermission(admin, 'homepage-display')) return adminDenied();
  try {
    const config: unknown = await request.json().catch(() => null);
    if (!validateHomepageDisplay(config)) return Response.json({ message: '展示方式或排序数据不正确，请刷新后重试。' }, { status: 400 });
    const ids = new Set((await items()).map(item => Number(item.id)));
    if (config.itemOrder.some(id => !ids.has(id))) return Response.json({ message: '部分商品已删除或作废，请刷新列表后重新排序。' }, { status: 400 });
    await env.DB.prepare('INSERT INTO homepage_display_settings (id,config_json,updated_at) VALUES (1,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json),updated_at=VALUES(updated_at)')
      .bind(JSON.stringify(config), new Date().toISOString()).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error('首页展示配置保存失败', error);
    return Response.json({ message: '首页展示配置保存失败，请确认已执行 05 增量 SQL 后重试。' }, { status: 500 });
  }
}
