import { env } from '@/db/mysql-runtime';
import { ensurePaymentQrRecords } from '@/db/setup';
import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { isToolEntryUrl, isToolSlug } from '@/lib/tool-services';

export async function GET(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  try {
    const { results } = await env.DB.prepare("SELECT * FROM products WHERE product_type='tool' ORDER BY sort_order,id").all();
    return Response.json({ tools: results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('工具管理读取失败', error);
    return Response.json({ message: '工具服务尚未初始化，请先执行工具服务增量 SQL。' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  const body = await request.json() as Record<string, string | number>;
  const id = Number(body.id || 0);
  try {
    if (body.action === 'status') {
      if (!id || !['active', 'inactive'].includes(String(body.status))) return Response.json({ message: '工具状态不正确' }, { status: 400 });
      await env.DB.prepare("UPDATE products SET status=?,updated_at=? WHERE id=? AND product_type='tool'").bind(body.status, new Date().toISOString(), id).run();
      return Response.json({ ok: true });
    }
    if (body.action !== 'save') return Response.json({ message: '未知工具操作' }, { status: 400 });
    const name = String(body.name || '').trim().slice(0, 255);
    const slug = String(body.slug || '').trim().toLowerCase();
    const entryUrl = String(body.entryUrl || '').trim();
    const chargeType = String(body.chargeType || 'pending');
    const price = chargeType === 'paid' ? Number(body.price) : 0;
    const logo = String(body.logo || '').trim();
    if (!name) return Response.json({ message: '请填写工具名称' }, { status: 400 });
    if (!isToolSlug(slug)) return Response.json({ message: '页面标识只能使用小写英文、数字和中划线，长度不超过 100' }, { status: 400 });
    if (!isToolEntryUrl(entryUrl)) return Response.json({ message: '工具入口请填写站内路径或完整的 http / https 链接' }, { status: 400 });
    if (!['free', 'paid', 'pending'].includes(chargeType)) return Response.json({ message: '请选择有效的收费方式' }, { status: 400 });
    if (!Number.isFinite(price) || price < 0 || (chargeType === 'paid' && price <= 0)) return Response.json({ message: '收费工具价格必须大于 0' }, { status: 400 });
    if (logo && !logo.startsWith('/api/product-images?key=products%2F') && !/^\/tool-logos\/[a-z0-9-]+\.svg$/.test(logo)) return Response.json({ message: '请重新上传工具 Logo' }, { status: 400 });
    const duplicate = await env.DB.prepare('SELECT id FROM products WHERE tool_slug=? AND id<>?').bind(slug, id).first();
    if (duplicate) return Response.json({ message: '该独立页面标识已被使用' }, { status: 400 });
    if (id) {
      const previous = await env.DB.prepare("SELECT id,tool_slug FROM products WHERE id=? AND product_type='tool'").bind(id).first<{ id: number; tool_slug: string }>();
      if (!previous) return Response.json({ message: '工具不存在' }, { status: 404 });
      if (previous.tool_slug && previous.tool_slug !== slug) return Response.json({ message: '已保存的页面标识不能修改，避免已收录的链接失效' }, { status: 400 });
    }
    const description = String(body.description || '').trim().slice(0, 2000);
    const detail = String(body.detail || '').trim().slice(0, 20000);
    const status = body.status === 'active' ? 'active' : 'inactive';
    const seoTitle = String(body.seoTitle || '').trim().slice(0, 255);
    const seoDescription = String(body.seoDescription || '').trim().slice(0, 1000);
    const now = new Date().toISOString();
    let productId = id;
    const values = [name, description, detail, logo, price, slug, entryUrl, chargeType, seoTitle, seoDescription, status, now];
    if (id) {
      await env.DB.prepare("UPDATE products SET name=?,description=?,detail=?,cover_image=?,price=?,tool_slug=?,tool_url=?,tool_charge_type=?,seo_title=?,seo_description=?,status=?,updated_at=? WHERE id=? AND product_type='tool'").bind(...values, id).run();
    } else {
      const sort = await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS sort_order FROM products').first<{ sort_order: number }>();
      const result = await env.DB.prepare("INSERT INTO products (name,description,detail,cover_image,price,tool_slug,tool_url,tool_charge_type,seo_title,seo_description,status,updated_at,category,subcategory,product_type,old_price,cost_price,billing_cycle,attributes_json,detail_image,tag,tone,initial,stock,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'工具服务','','tool',0,0,'once','[]','','工具','blue','',99999,?)")
        .bind(...values, Number(sort?.sort_order ?? 1)).run();
      productId = Number(result.meta.last_row_id);
    }
    if (chargeType === 'paid') await ensurePaymentQrRecords(productId, price);
    return Response.json({ ok: true, id: productId });
  } catch (error) {
    console.error('工具保存失败', error);
    return Response.json({ message: '工具保存失败，请确认已执行增量 SQL 或查看服务端日志。' }, { status: 500 });
  }
}
