import { env } from '@/db/mysql-runtime';
import { ensurePaymentQrRecords } from '@/db/setup';
import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { changePointsOrderStatus, pointsFailure, pointsPackages, PointsError } from '@/lib/points-service';
import { validPoints } from '@/lib/points';

export async function GET(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin || !hasAdminPermission(admin, 'points')) return adminDenied();
  try {
    const url = new URL(request.url), resource = url.searchParams.get('resource');
    if (resource === 'payment-qrs') {
      const id = Number(url.searchParams.get('id'));
      const rows = await env.DB.prepare("SELECT q.* FROM payment_qrs q JOIN products p ON p.id=q.product_id WHERE p.id=? AND p.product_type='points' ORDER BY q.id DESC").bind(id).all();
      return Response.json({ qrs: rows.results }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (resource === 'ledger' || resource === 'wallets' || resource === 'orders') {
      const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
      if (!Number.isSafeInteger(page) || page > 1000000) throw new PointsError('页码不正确');
      const q = `%${(url.searchParams.get('q') || '').trim().slice(0, 64)}%`;
      const userId = Number(url.searchParams.get('userId')) || 0;
      const from = resource === 'wallets' ? 'users u LEFT JOIN points_wallets w ON w.user_id=u.id' : resource === 'orders' ? "orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id WHERE p.product_type='points'" : 'points_ledger l JOIN users u ON u.id=l.user_id LEFT JOIN products p ON p.id=l.product_id';
      const condition = `${resource === 'orders' ? ' AND' : ' WHERE'} u.phone LIKE ?${userId ? ' AND u.id=?' : ''}`;
      const values = userId ? [q, userId] : [q];
      const total = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${from}${condition}`).bind(...values).first<{ total: number }>();
      const columns = resource === 'wallets' ? 'u.id,u.phone,u.email,COALESCE(w.balance,100) AS balance' : resource === 'orders' ? 'o.*,u.phone,p.name AS product_name' : 'l.*,u.phone,p.name AS product_name';
      const order = resource === 'wallets' ? 'u.id DESC' : resource === 'orders' ? 'o.created_at DESC,o.id DESC' : 'l.created_at DESC,l.operation_id DESC';
      const rows = await env.DB.prepare(`SELECT ${columns} FROM ${from}${condition} ORDER BY ${order} LIMIT 20 OFFSET ?`).bind(...values, (page - 1) * 20).all();
      return Response.json({ rows: rows.results, total: Number(total?.total || 0), page }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ packages: await pointsPackages(false) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pointsFailure(error); }
}
export async function POST(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin || !hasAdminPermission(admin, 'points')) return adminDenied();
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object') throw new PointsError('请求参数不正确');
    const id = Number(body.id || 0);
    if (!Number.isSafeInteger(id) || id < 0) throw new PointsError('套餐编号不正确');
    if (body.action === 'verify') {
      if (!await changePointsOrderStatus(String(body.orderId || ''), 'paid')) throw new PointsError('积分充值订单不存在', 404);
      return Response.json({ ok: true, message: '充值已核验到账；重复核验不会重复增加积分' });
    }
    if (body.action === 'qr-save') {
      const amount = Number(body.amount), type = String(body.type), image = String(body.imageUrl || '');
      const pack = (await pointsPackages(false)).find(item => item.id === id);
      if (!pack || pack.price !== amount || !['wechat', 'alipay'].includes(type)) throw new PointsError('收款码须匹配已保存的充值套餐金额');
      if (image && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 1400000)) throw new PointsError('收款码支持不超过 1MB 的 JPG、PNG、WebP 图片');
      await ensurePaymentQrRecords(id, amount);
      await env.DB.prepare('UPDATE payment_qrs SET image_url=?,status=? WHERE product_id=? AND amount=? AND type=?').bind(image || null, body.enabled === true ? 'active' : 'inactive', id, amount, type).run();
      return Response.json({ ok: true });
    }
    if (body.action === 'status') {
      if (!['active', 'inactive'].includes(String(body.status))) throw new PointsError('套餐状态不正确');
      await env.DB.prepare("UPDATE products SET status=?,updated_at=? WHERE id=? AND product_type='points'").bind(body.status, new Date().toISOString(), id).run();
      return Response.json({ ok: true });
    }
    if (body.action !== 'save') throw new PointsError('未知操作');
    const name = String(body.name || '').trim(), description = String(body.description || '').trim().slice(0, 1000);
    const points = Number(body.points), price = Number(body.price);
    if (!name || name.length > 100 || !validPoints(points) || !Number.isFinite(price) || price <= 0 || price > 1000000 || Math.abs(price * 100 - Math.round(price * 100)) > .000001) throw new PointsError('请填写名称、正整数积分及有效的两位小数充值金额');
    type PaymentDraft = { type: 'wechat' | 'alipay'; amount: number; imageUrl: string; enabled: boolean };
    let paymentQrs: PaymentDraft[] | undefined;
    if (body.paymentQrs !== undefined) {
      if (!Array.isArray(body.paymentQrs) || body.paymentQrs.length !== 2) throw new PointsError('请同时提交微信和支付宝的收款配置');
      const methods = new Set<string>();
      paymentQrs = body.paymentQrs.map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new PointsError('收款配置不正确');
        const qr = item as Record<string, unknown>;
        if (!['wechat', 'alipay'].includes(String(qr.type)) || methods.has(String(qr.type)) || typeof qr.enabled !== 'boolean' || typeof qr.imageUrl !== 'string' || qr.amount !== price) throw new PointsError('收款配置须包含两种支付方式，并匹配当前充值金额');
        methods.add(String(qr.type));
        if (qr.imageUrl && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(qr.imageUrl) || qr.imageUrl.length > 1400000)) throw new PointsError('收款码支持不超过 1MB 的 JPG、PNG、WebP 图片');
        if (qr.enabled && !qr.imageUrl) throw new PointsError('请上传收款码后再启用该支付方式');
        return { type: qr.type as PaymentDraft['type'], amount: price, imageUrl: qr.imageUrl, enabled: qr.enabled };
      });
    }
    const status = body.status === 'active' ? 'active' : 'inactive', now = new Date().toISOString();
    const productId = await env.DB.transaction(async db => {
      let savedId = id;
      if (id) {
        const existing = await db.prepare("SELECT id FROM products WHERE id=? AND product_type='points' FOR UPDATE").bind(id).first();
        if (!existing) throw new PointsError('充值套餐不存在', 404);
        await db.prepare("UPDATE products SET name=?,description=?,points_amount=?,price=?,status=?,updated_at=? WHERE id=? AND product_type='points'").bind(name, description, points, price, status, now, id).run();
      } else {
        const result = await db.prepare("INSERT INTO products (name,category,subcategory,price,attributes_json,description,detail,cover_image,detail_image,status,stock,sort_order,product_type,points_amount,updated_at) VALUES (?,'积分充值','',?,'[]',?,'','','',?,99999,10000,'points',?,?)").bind(name, price, description, status, points, now).run();
        savedId = Number(result.meta.last_row_id);
      }
      // 套餐及两种收款配置一起提交；保留其他金额的二维码，供既有订单继续付款。
      for (const type of ['wechat', 'alipay'] as const) {
        const existing = await db.prepare('SELECT id FROM payment_qrs WHERE product_id=? AND type=? AND amount=? FOR UPDATE').bind(savedId, type, price).first();
        const draft = paymentQrs?.find(qr => qr.type === type);
        if (existing && draft) await db.prepare('UPDATE payment_qrs SET image_url=?,status=? WHERE product_id=? AND amount=? AND type=?').bind(draft.imageUrl || null, draft.enabled ? 'active' : 'inactive', savedId, price, type).run();
        else if (!existing) await db.prepare('INSERT INTO payment_qrs (product_id,name,type,amount,image_url,status) VALUES (?,?,?,?,?,?)').bind(savedId, `${type === 'wechat' ? '微信支付' : '支付宝'} ¥${price.toFixed(2)} 收款码`, type, price, draft?.imageUrl || null, draft?.enabled ? 'active' : 'inactive').run();
      }
      return savedId;
    });
    return Response.json({ ok: true, id: productId, message: '套餐及收款配置已保存' });
  } catch (error) { return pointsFailure(error); }
}
