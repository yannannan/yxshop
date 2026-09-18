import { env } from '@/db/mysql-runtime';
import { ensureDatabase, ensurePaymentQrRecords } from '../../../db/setup';
import { sendConfiguredEmail, sendOrderNotification } from '../../../lib/order-notifications';
import { adminDenied, getAdminContext, hasAdminPermission } from '../../../lib/admin-auth';

export async function GET(request: Request) {
  await ensureDatabase();
  const admin = await getAdminContext(request);
  if (!admin) return adminDenied();
  if (!hasAdminPermission(admin, 'products')) return adminDenied('无商品管理权限');
  const url = new URL(request.url);
  if (url.searchParams.get('resource') !== 'payment-qrs') return Response.json({ message: '资源不存在' }, { status: 404 });
  const productId = Number(url.searchParams.get('productId'));
  const amount = Number(url.searchParams.get('amount'));
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(amount) || amount <= 0) return Response.json({ message: '商品或金额参数不正确' }, { status: 400 });
  const { results } = await env.DB.prepare('SELECT id,product_id,name,type,amount,image_url,status FROM payment_qrs WHERE product_id=? AND amount=? ORDER BY id DESC').bind(productId, Number(amount.toFixed(2))).all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const admin = await getAdminContext(request);
  if (!admin) return adminDenied();
  const body = await request.json() as Record<string, string | number>;
  const action = String(body.action || '');
  const now = new Date().toISOString();

  const permissionByAction: Record<string, string> = {
    'product-save': 'products',
    'product-sort': 'products',
    'product-status': 'products',
    'product-delete': 'products',
    'product-batch-delete': 'products',
    'product-clone': 'products',
    'qr-save': 'products',
    'qr-status': 'products',
    'qr-delete': 'products',
    'category-save': 'categories',
    'category-status': 'categories',
    'category-delete': 'categories',
    'user-status': 'users',
    'user-permission': 'users',
    'order-status': 'orders',
    'order-batch-status': 'orders',
    'order-delete': 'orders',
    'order-batch-delete': 'orders',
    'order-delivery': 'orders',
    'notification-settings-save': 'notifications',
    'email-config-save': 'notifications',
    'email-config-test': 'notifications',
    'email-send-custom': 'notifications',
    'credential-save': 'credentials',
    'credential-status': 'credentials',
    'credential-delete': 'credentials',
    'credential-batch-delete': 'credentials',
  };
  const requiredPermission = permissionByAction[action];
  if (!requiredPermission || !hasAdminPermission(admin, requiredPermission)) return adminDenied('无此后台操作权限');

  switch (action) {
    case 'product-save': {
      const name = String(body.name || '').trim();
      const category = String(body.category || '').trim();
      const subcategory = String(body.subcategory || '').trim();
      if (!name || !category || !subcategory) return Response.json({ message: '请填写商品名称和分类' }, { status: 400 });
      const price = Number(body.price || 0);
      const billingCycle = validBillingCycle(body.billingCycle);
      const attributesJson = normalizeProductAttributes(body.attributesText);
      const coverImage = validateProductImage(body.coverImage);
      const detailImage = validateProductImage(body.detailImage);
      if (coverImage === null || detailImage === null) return Response.json({ message: '商品图片地址不正确，请重新上传' }, { status: 400 });
      const values = [name, category, subcategory, price, Number(body.costPrice || 0), Number(body.oldPrice || body.price || 0), String(body.description || ''), String(body.detail || ''), String(body.tag || '在售'), String(body.tone || 'dark'), String(body.initial || name.slice(0, 1)), coverImage, detailImage, Number(body.stock || 0), billingCycle, attributesJson, now];
      let productId = Number(body.id || 0);
      const isNew = !productId;
      if (productId) await env.DB.prepare('UPDATE products SET name=?,category=?,subcategory=?,price=?,cost_price=?,old_price=?,description=?,detail=?,tag=?,tone=?,initial=?,cover_image=?,detail_image=?,stock=?,billing_cycle=?,attributes_json=?,updated_at=? WHERE id=?').bind(...values, productId).run();
      else {
        const result = await env.DB.prepare('INSERT INTO products (name,category,subcategory,price,cost_price,old_price,description,detail,tag,tone,initial,cover_image,detail_image,status,stock,billing_cycle,attributes_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,\'inactive\',?,?,?,?)').bind(...values).run();
        productId = Number(result.meta.last_row_id);
      }
      if (isNew) await env.DB.prepare('UPDATE products SET sort_order=(SELECT COALESCE(MAX(sort_order),0)+1 FROM products WHERE id<>?) WHERE id=?').bind(productId, productId).run();
      await ensurePaymentQrRecords(productId, price);
      break;
    }
    case 'product-sort': {
      const productId = Number(body.id || 0);
      const targetId = Number(body.targetId || 0);
      if (!productId || !targetId || productId === targetId) return Response.json({ message: '商品排序参数不正确' }, { status: 400 });
      const [product, target] = await Promise.all([
        env.DB.prepare("SELECT id,sort_order FROM products WHERE id=? AND status<>'closed'").bind(productId).first<{ id: number; sort_order: number }>(),
        env.DB.prepare("SELECT id,sort_order FROM products WHERE id=? AND status<>'closed'").bind(targetId).first<{ id: number; sort_order: number }>(),
      ]);
      if (!product || !target) return Response.json({ message: '参与排序的商品不存在或已作废' }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare('UPDATE products SET sort_order=?,updated_at=? WHERE id=?').bind(target.sort_order, now, product.id),
        env.DB.prepare('UPDATE products SET sort_order=?,updated_at=? WHERE id=?').bind(product.sort_order, now, target.id),
      ]);
      break;
    }
    case 'product-status': {
      const status = String(body.status || '');
      if (!['active', 'inactive', 'closed'].includes(status)) return Response.json({ message: '商品状态不正确' }, { status: 400 });
      await env.DB.prepare('UPDATE products SET status=?,updated_at=? WHERE id=?').bind(status, now, body.id).run(); break;
    }
    case 'product-delete': {
      const productId = Number(body.id || 0);
      if (!Number.isInteger(productId) || productId <= 0) return Response.json({ message: '商品参数不正确' }, { status: 400 });
      const product = await env.DB.prepare("SELECT id FROM products WHERE id=? AND status='closed'").bind(productId).first<{ id: number }>();
      if (!product) return Response.json({ message: '商品不存在或已删除' }, { status: 404 });
      const orderCount = await env.DB.prepare('SELECT COUNT(*) AS total FROM orders WHERE product_id=?').bind(productId).first<{ total: number }>();
      if (Number(orderCount?.total || 0) > 0) return Response.json({ message: '该商品已有历史订单，不能删除；可以将商品下架后保留订单记录。' }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare('DELETE FROM credential_assignments WHERE credential_id IN (SELECT id FROM credentials WHERE product_id=?)').bind(productId),
        env.DB.prepare('DELETE FROM credentials WHERE product_id=?').bind(productId),
        env.DB.prepare('DELETE FROM payment_qrs WHERE product_id=?').bind(productId),
        env.DB.prepare('DELETE FROM products WHERE id=?').bind(productId),
      ]);
      break;
    }
    case 'product-batch-delete': {
      const productIds = String(body.productIds || '').split(',').map((id) => Number(id.trim())).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100);
      if (!productIds.length) return Response.json({ message: '请选择要删除的商品' }, { status: 400 });
      for (const productId of productIds) {
        const product = await env.DB.prepare("SELECT id,name,status FROM products WHERE id=?").bind(productId).first<{ id: number; name: string; status: string }>();
        if (!product) return Response.json({ message: `商品 ID ${productId} 不存在或已删除` }, { status: 404 });
        if (product.status !== 'closed') return Response.json({ message: `“${product.name}”尚未作废，本次批量删除已取消。` }, { status: 400 });
        const orderCount = await env.DB.prepare('SELECT COUNT(*) AS total FROM orders WHERE product_id=?').bind(productId).first<{ total: number }>();
        if (Number(orderCount?.total || 0) > 0) return Response.json({ message: `“${product.name}”已有历史订单，本次批量删除已取消。` }, { status: 400 });
      }
      for (const productId of productIds) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM credential_assignments WHERE credential_id IN (SELECT id FROM credentials WHERE product_id=?)').bind(productId),
          env.DB.prepare('DELETE FROM credentials WHERE product_id=?').bind(productId),
          env.DB.prepare('DELETE FROM payment_qrs WHERE product_id=?').bind(productId),
          env.DB.prepare('DELETE FROM products WHERE id=?').bind(productId),
        ]);
      }
      break;
    }
    case 'product-clone': {
      const productId = Number(body.id || 0);
      const source = await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Record<string, string | number | null>>();
      if (!source) return Response.json({ message: '要克隆的商品不存在' }, { status: 404 });
      const result = await env.DB.prepare("INSERT INTO products (name,category,subcategory,price,cost_price,old_price,billing_cycle,attributes_json,description,detail,tag,tone,initial,cover_image,detail_image,status,stock,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'inactive',?,?)").bind(
        `${String(source.name)}（副本）`, source.category, source.subcategory, source.price, source.cost_price || 0, source.old_price, source.billing_cycle || 'once', source.attributes_json || '[]', source.description || '', source.detail || '', source.tag || '在售', source.tone || 'dark', source.initial || '', source.cover_image || '', source.detail_image || '', source.stock || 0, now,
      ).run();
      const clonedProductId = Number(result.meta.last_row_id);
      await env.DB.prepare('UPDATE products SET sort_order=(SELECT COALESCE(MAX(sort_order),0)+1 FROM products WHERE id<>?) WHERE id=?').bind(clonedProductId, clonedProductId).run();
      await ensurePaymentQrRecords(clonedProductId, Number(source.price || 0));
      break;
    }
    case 'category-save': {
      const name = String(body.name || '').trim();
      const parentId = body.parentId ? Number(body.parentId) : null;
      if (!name) return Response.json({ message: '请填写分类名称' }, { status: 400 });
      const parentName = parentId ? await env.DB.prepare('SELECT name FROM categories WHERE id=?').bind(parentId).first<{ name: string }>() : null;
      if (parentId && !parentName) return Response.json({ message: '所属一级分类不存在' }, { status: 400 });
      if (body.id) {
        const old = await env.DB.prepare('SELECT c.*,p.name AS parent_name FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.id=?').bind(body.id).first<{ id: number; parent_id: number | null; name: string; parent_name: string | null }>();
        if (!old) return Response.json({ message: '分类不存在' }, { status: 404 });
        await env.DB.prepare('UPDATE categories SET parent_id=?,name=?,sort=?,status=? WHERE id=?').bind(parentId, name, Number(body.sort || 0), body.status || 'active', body.id).run();
        if (!old.parent_id) await env.DB.prepare('UPDATE products SET category=?,updated_at=? WHERE category=?').bind(name, now, old.name).run();
        else await env.DB.prepare('UPDATE products SET category=?,subcategory=?,updated_at=? WHERE category=? AND subcategory=?').bind(parentName?.name || old.parent_name, name, now, old.parent_name, old.name).run();
      } else await env.DB.prepare('INSERT INTO categories (parent_id,name,sort,status,created_at) VALUES (?,?,?,?,?)').bind(parentId, name, Number(body.sort || 0), body.status || 'active', now).run();
      break;
    }
    case 'category-status':
      await env.DB.prepare('UPDATE categories SET status=? WHERE id=?').bind(body.status, body.id).run(); break;
    case 'category-delete': {
      const category = await env.DB.prepare('SELECT c.*,p.name AS parent_name FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.id=?').bind(body.id).first<{ id: number; parent_id: number | null; name: string; parent_name: string | null }>();
      if (!category) return Response.json({ message: '分类不存在' }, { status: 404 });
      const children = await env.DB.prepare('SELECT COUNT(*) AS total FROM categories WHERE parent_id=?').bind(category.id).first<{ total: number }>();
      const products = await env.DB.prepare(category.parent_id ? 'SELECT COUNT(*) AS total FROM products WHERE category=? AND subcategory=?' : 'SELECT COUNT(*) AS total FROM products WHERE category=?').bind(...(category.parent_id ? [category.parent_name, category.name] : [category.name])).first<{ total: number }>();
      if (children?.total || products?.total) return Response.json({ message: '分类下仍有关联内容，不能删除' }, { status: 400 });
      await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(body.id).run(); break;
    }
    case 'user-status':
      await env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(body.status, body.id).run(); break;
    case 'user-permission': {
      const id = Number(body.id || 0);
      const permissionType = String(body.permissionType || '');
      if (!['10001','10002'].includes(permissionType)) return Response.json({ message: '用户权限类型不正确' }, { status: 400 });
      const user = await env.DB.prepare('SELECT id,phone FROM users WHERE id=?').bind(id).first<{ id: number; phone: string }>();
      if (!user) return Response.json({ message: '用户不存在' }, { status: 404 });
      if (user.phone === admin.admin.username && permissionType !== '10002') return Response.json({ message: '不能取消当前登录超级管理员的管理权限' }, { status: 400 });
      const permissionTypeName = permissionType === '10002' ? '超级管理员' : '普通用户';
      await env.DB.prepare('UPDATE users SET permission_type=?,permission_type_name=? WHERE id=?').bind(permissionType, permissionTypeName, id).run();
      if (permissionType === '10002') {
        const role = await env.DB.prepare("SELECT id FROM sys_role WHERE role_code='super_admin' AND status='active'").first<{ id: number }>();
        if (role) {
          const now2 = new Date().toISOString();
          let adminUser = await env.DB.prepare('SELECT id FROM sys_admin_user WHERE username=?').bind(user.phone).first<{ id: number }>();
          if (!adminUser) {
            const created = await env.DB.prepare("INSERT INTO sys_admin_user (username,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(user.phone, '超级管理员', '', 'active', now2, now2).run();
            adminUser = { id: Number(created.meta.last_row_id) };
          } else {
            await env.DB.prepare("UPDATE sys_admin_user SET status='active',updated_at=? WHERE id=?").bind(now2, adminUser.id).run();
          }
          await env.DB.prepare('INSERT IGNORE INTO sys_admin_user_role (admin_user_id,role_id) VALUES (?,?)').bind(adminUser.id, role.id).run();
        }
      }
      break;
    }
    case 'order-status': {
      const status = String(body.status || '');
      if (!['pending', 'paid', 'pending_delivery', 'delivered', 'closed'].includes(status)) return Response.json({ message: '订单状态不正确' }, { status: 400 });
      if (status === 'delivered') await env.DB.prepare('UPDATE orders SET status=?,delivered_at=COALESCE(delivered_at,?),updated_at=? WHERE id=?').bind(status, now, now, body.id).run();
      else {
        await releaseOrderCredential(String(body.id));
        await env.DB.prepare('UPDATE orders SET status=?,delivered_at=NULL,updated_at=? WHERE id=?').bind(status, now, body.id).run();
      }
      if (status === 'delivered') await notifyOrderDelivery(String(body.id));
      break;
    }
    case 'order-batch-status': {
      const status = String(body.status || '');
      const orderIds = String(body.orderIds || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 100);
      if (status !== 'closed' || orderIds.length === 0) return Response.json({ message: '批量作废参数不正确' }, { status: 400 });
      for (const orderId of orderIds) {
        await releaseOrderCredential(orderId);
        await env.DB.prepare("UPDATE orders SET status='closed',delivered_at=NULL,updated_at=? WHERE id=? AND status<>'closed'").bind(now, orderId).run();
      }
      break;
    }
    case 'order-delete': {
      const closedOrder = await env.DB.prepare("SELECT id FROM orders WHERE id=? AND status='closed'").bind(body.id).first();
      if (!closedOrder) return Response.json({ message: '仅已作废订单可删除' }, { status: 400 });
      await releaseOrderCredential(String(body.id));
      await env.DB.prepare("DELETE FROM orders WHERE id=? AND status='closed'").bind(body.id).run();
      break;
    }
    case 'order-batch-delete': {
      const orderIds = String(body.orderIds || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 100);
      if (orderIds.length === 0) return Response.json({ message: '请选择要删除的已作废订单' }, { status: 400 });
      for (const orderId of orderIds) {
        const closedOrder = await env.DB.prepare("SELECT id FROM orders WHERE id=? AND status='closed'").bind(orderId).first();
        if (!closedOrder) return Response.json({ message: `订单 ${orderId} 尚未作废，本次批量删除已取消` }, { status: 400 });
      }
      for (const orderId of orderIds) {
        await releaseOrderCredential(orderId);
        await env.DB.prepare("DELETE FROM orders WHERE id=? AND status='closed'").bind(orderId).run();
      }
      break;
    }
    case 'order-delivery': {
      const orderId = String(body.id || '');
      const credentialId = Number(body.credentialId || 0);
      const order = await env.DB.prepare('SELECT o.id,o.product_id,o.credential_id,o.status,p.name AS product_name,p.category,p.subcategory,p.billing_cycle FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=?').bind(orderId).first<{ id: string; product_id: number; credential_id: number | null; status: string; product_name: string; category: string; subcategory: string; billing_cycle: string }>();
      if (!order) return Response.json({ message: '订单不存在' }, { status: 404 });
      if (order.status === 'pending') return Response.json({ message: '待支付订单不能发货，请先确认收款' }, { status: 400 });
      if (credentialId > 0) {
        const credential = await env.DB.prepare('SELECT id,product_id,account,password,email_auth_code,verification_url,content,status FROM credentials WHERE id=?').bind(credentialId).first<{ id: number; product_id: number; account: string; password: string; email_auth_code: string; verification_url: string; content: string; status: string }>();
        if (!credential || credential.product_id !== order.product_id) return Response.json({ message: '所选账号卡密与订单商品不匹配' }, { status: 400 });
        if (credential.status !== 'available' && credential.id !== Number(order.credential_id || 0)) return Response.json({ message: '该账号卡密已被其他订单占用，请重新选择' }, { status: 400 });
        if (order.credential_id && Number(order.credential_id) !== credential.id) await releaseOrderCredential(orderId);
        const account = credential.account || credential.content;
        const deliveryContent = [`账号/卡密：${account}`, credential.password && `密码：${credential.password}`, credential.email_auth_code && `邮箱授权码：${credential.email_auth_code}`, credential.verification_url && `验证码获取地址：${credential.verification_url}`].filter(Boolean).join('\n');
        const activeAssignment = await env.DB.prepare("SELECT id FROM credential_assignments WHERE credential_id=? AND order_id=? AND status='active'").bind(credential.id, orderId).first();
        const statements = [
          env.DB.prepare("UPDATE credentials SET status='used' WHERE id=?").bind(credential.id),
          env.DB.prepare("UPDATE orders SET credential_id=?,delivery_content=?,status='delivered',delivered_at=COALESCE(delivered_at,?),updated_at=? WHERE id=?").bind(credential.id, deliveryContent, now, now, orderId),
        ];
        if (!activeAssignment) statements.push(env.DB.prepare("INSERT INTO credential_assignments (credential_id,order_id,user_id,product_name,category,subcategory,billing_cycle,status,assigned_at) VALUES (?,?,(SELECT user_id FROM orders WHERE id=?),?,?,?,?, 'active',?)").bind(credential.id, orderId, orderId, order.product_name, order.category, order.subcategory, order.billing_cycle, now));
        await env.DB.batch(statements);
      } else {
        const deliveryContent = String(body.deliveryContent || '').trim();
        if (!deliveryContent) return Response.json({ message: '请选择账号卡密或填写手动交付内容' }, { status: 400 });
        await releaseOrderCredential(orderId);
        await env.DB.prepare("UPDATE orders SET credential_id=NULL,delivery_content=?,status='delivered',delivered_at=COALESCE(delivered_at,?),updated_at=? WHERE id=?").bind(deliveryContent, now, now, orderId).run();
      }
      await notifyOrderDelivery(orderId);
      break;
    }
    case 'notification-settings-save': {
      const type = String(body.type || '');
      const recipients = String(body.recipientEmails || '').trim();
      if (!['payment', 'delivery'].includes(type)) return Response.json({ message: '通知类型不正确' }, { status: 400 });
      const emails = recipients ? recipients.split(/[，,;；\s]+/).filter(Boolean) : [];
      if (emails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) return Response.json({ message: '通知邮箱格式不正确' }, { status: 400 });
      await env.DB.prepare('INSERT INTO notification_settings (type,recipient_emails,enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(type) DO UPDATE SET recipient_emails=excluded.recipient_emails,enabled=excluded.enabled,updated_at=excluded.updated_at').bind(type, emails.join(', '), Number(body.enabled) ? 1 : 0, now).run();
      break;
    }
    case 'email-config-save': {
      const provider = String(body.provider || 'smtp');
      const fromAddress = String(body.fromAddress || '').trim();
      const smtpHost = String(body.smtpHost || '').trim();
      const smtpPort = Number(body.smtpPort || 465);
      const smtpSecurity = String(body.smtpSecurity || 'tls');
      const smtpUsername = String(body.smtpUsername || '').trim();
      const imapHost = String(body.imapHost || '').trim();
      const imapPort = Number(body.imapPort || 993);
      const imapSecurity = String(body.imapSecurity || 'tls');
      const imapUsername = String(body.imapUsername || '').trim();
      if (!['smtp', 'resend'].includes(provider) || !['tls', 'starttls'].includes(smtpSecurity) || !['tls', 'starttls'].includes(imapSecurity) || !Number.isInteger(smtpPort) || !Number.isInteger(imapPort)) return Response.json({ message: '邮箱配置参数不正确' }, { status: 400 });
      if (fromAddress && !/^[^<>]*<\S+@\S+\.\S+>$|^\S+@\S+\.\S+$/.test(fromAddress)) return Response.json({ message: '发件人格式不正确' }, { status: 400 });
      const old = await env.DB.prepare('SELECT smtp_password,imap_password FROM email_config WHERE id=1').first<{ smtp_password: string; imap_password: string }>();
      const smtpPassword = String(body.smtpPassword || '').trim() || old?.smtp_password || '';
      const imapPassword = String(body.imapPassword || '').trim() || old?.imap_password || '';
      if (provider === 'smtp' && (!fromAddress || !smtpHost || !smtpUsername || !smtpPassword)) return Response.json({ message: '请完整填写 SMTP 发件配置和授权码' }, { status: 400 });
      await env.DB.prepare('INSERT INTO email_config (id,provider,from_address,smtp_host,smtp_port,smtp_security,smtp_username,smtp_password,imap_host,imap_port,imap_security,imap_username,imap_password,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,from_address=excluded.from_address,smtp_host=excluded.smtp_host,smtp_port=excluded.smtp_port,smtp_security=excluded.smtp_security,smtp_username=excluded.smtp_username,smtp_password=excluded.smtp_password,imap_host=excluded.imap_host,imap_port=excluded.imap_port,imap_security=excluded.imap_security,imap_username=excluded.imap_username,imap_password=excluded.imap_password,updated_at=excluded.updated_at').bind(provider, fromAddress, smtpHost, smtpPort, smtpSecurity, smtpUsername, smtpPassword, imapHost, imapPort, imapSecurity, imapUsername, imapPassword, now).run();
      break;
    }
    case 'email-config-test': {
      const recipient = String(body.recipient || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(recipient)) return Response.json({ message: '请填写测试收件邮箱' }, { status: 400 });
      await sendConfiguredEmail(recipient, '【宇星商城】SMTP 测试邮件', '这是一封 SMTP 测试邮件。收到此邮件说明订单通知发信配置有效。');
      return Response.json({ ok: true, message: `测试邮件已发送至 ${recipient}` });
    }
    case 'email-send-custom': {
      const recipient = String(body.recipient || '').trim();
      const subject = String(body.subject || '').trim();
      const content = String(body.content || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(recipient) || !subject || !content) return Response.json({ message: '请完整填写收件人、主题和内容' }, { status: 400 });
      await sendConfiguredEmail(recipient, subject.slice(0, 120), content.slice(0, 5000));
      return Response.json({ ok: true, message: `邮件已发送至 ${recipient}` });
    }
    case 'credential-save': {
      const productId = Number(body.productId || 0);
      const account = String(body.account || '').trim();
      const password = String(body.password || '').trim();
      const emailAuthCode = String(body.emailAuthCode || '').trim();
      const verificationUrl = String(body.verificationUrl || '').trim();
      const product = await env.DB.prepare('SELECT price FROM products WHERE id=?').bind(productId).first<{ price: number }>();
      if (!product) return Response.json({ message: '请选择对应商品' }, { status: 400 });
      if (!account) return Response.json({ message: '请填写账号或卡密' }, { status: 400 });
      if (verificationUrl && !/^https?:\/\/\S+$/i.test(verificationUrl)) return Response.json({ message: '验证码获取地址必须是完整的 http 或 https 地址' }, { status: 400 });
      const costPrice = Math.max(0, Number(body.costPrice || 0));
      const salePrice = Math.max(0, Number(body.salePrice || product.price));
      const content = password ? `${account}\n${password}` : account;
      if (body.id) await env.DB.prepare('UPDATE credentials SET product_id=?,content=?,account=?,password=?,email_auth_code=?,verification_url=?,cost_price=?,sale_price=? WHERE id=?').bind(productId, content, account, password, emailAuthCode, verificationUrl, costPrice, salePrice, body.id).run();
      else await env.DB.prepare('INSERT INTO credentials (product_id,content,account,password,email_auth_code,verification_url,cost_price,sale_price,status) VALUES (?,?,?,?,?,?,?,?,?)').bind(productId, content, account, password, emailAuthCode, verificationUrl, costPrice, salePrice, 'available').run();
      break;
    }
    case 'credential-status': {
      const status = String(body.status || '');
      if (!['available', 'disabled', 'closed'].includes(status)) return Response.json({ message: '卡密状态不正确' }, { status: 400 });
      const activeAssignment = await env.DB.prepare("SELECT id FROM credential_assignments WHERE credential_id=? AND status='active' LIMIT 1").bind(body.id).first();
      if (activeAssignment) return Response.json({ message: '该账号仍关联已发货订单，不能手动变更状态' }, { status: 400 });
      await env.DB.prepare('UPDATE credentials SET status=? WHERE id=?').bind(status, body.id).run();
      break;
    }
    case 'credential-delete': {
      const credentialId = Number(body.id || 0);
      const credential = await env.DB.prepare("SELECT id FROM credentials WHERE id=? AND status='closed'").bind(credentialId).first<{ id: number }>();
      if (!credential) return Response.json({ message: '仅已作废账号可永久删除' }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare('DELETE FROM credential_assignments WHERE credential_id=?').bind(credentialId),
        env.DB.prepare("DELETE FROM credentials WHERE id=? AND status='closed'").bind(credentialId),
      ]);
      break;
    }
    case 'credential-batch-delete': {
      const credentialIds = String(body.credentialIds || '').split(',').map((id) => Number(id.trim())).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100);
      if (!credentialIds.length) return Response.json({ message: '请选择要删除的已作废账号' }, { status: 400 });
      for (const credentialId of credentialIds) {
        const credential = await env.DB.prepare("SELECT id FROM credentials WHERE id=? AND status='closed'").bind(credentialId).first<{ id: number }>();
        if (!credential) return Response.json({ message: `账号 #${credentialId} 尚未作废，本次批量删除已取消` }, { status: 400 });
      }
      for (const credentialId of credentialIds) await env.DB.batch([
        env.DB.prepare('DELETE FROM credential_assignments WHERE credential_id=?').bind(credentialId),
        env.DB.prepare("DELETE FROM credentials WHERE id=? AND status='closed'").bind(credentialId),
      ]);
      break;
    }
    case 'qr-save': {
      const type = body.type === 'alipay' ? 'alipay' : 'wechat';
      const amount = Number(body.amount || 0);
      const productId = Number(body.productId || 0);
      if (!Number.isFinite(amount) || amount <= 0) return Response.json({ message: '请填写对应订单金额' }, { status: 400 });
      const product = await env.DB.prepare('SELECT price FROM products WHERE id=?').bind(productId).first<{ price: number }>();
      if (!product) return Response.json({ message: '对应商品不存在' }, { status: 400 });
      if (Number(product.price) !== amount) return Response.json({ message: '二维码金额必须与对应商品售价一致' }, { status: 400 });
      const name = String(body.name || '').trim() || `${type === 'wechat' ? '微信支付' : '支付宝'} ¥${amount.toFixed(2)} 收款码`;
      const imageUrl = String(body.imageUrl || '');
      if (imageUrl && !/^data:image\//.test(imageUrl)) return Response.json({ message: '二维码图片格式不正确' }, { status: 400 });
      if (body.id) await env.DB.prepare('UPDATE payment_qrs SET name=?,type=?,amount=?,image_url=? WHERE id=? AND product_id=?').bind(name, type, amount, imageUrl || null, body.id, productId).run();
      else {
        const existing = await env.DB.prepare('SELECT id FROM payment_qrs WHERE product_id=? AND type=? AND amount=?').bind(productId, type, amount).first();
        if (existing) await env.DB.prepare('UPDATE payment_qrs SET name=?,image_url=? WHERE id=?').bind(name, imageUrl || null, existing.id).run();
        else await env.DB.prepare('INSERT INTO payment_qrs (product_id,name,type,amount,image_url,status) VALUES (?,?,?,?,?,?)').bind(productId, name, type, amount, imageUrl || null, 'active').run();
      }
      break;
    }
    case 'qr-status': {
      await env.DB.prepare('UPDATE payment_qrs SET status=? WHERE id=?').bind(body.status, body.id).run();
      break;
    }
    case 'qr-delete': {
      await env.DB.prepare('DELETE FROM payment_qrs WHERE id=?').bind(body.id).run();
      break;
    }
    default:
      return Response.json({ message: '未知操作' }, { status: 400 });
  }
  return Response.json({ ok: true });
}

async function releaseOrderCredential(orderId: string) {
  const order = await env.DB.prepare('SELECT credential_id FROM orders WHERE id=?').bind(orderId).first<{ credential_id: number | null }>();
  if (!order?.credential_id) return;
  const releasedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE credential_assignments SET status='released',released_at=? WHERE order_id=? AND status='active'").bind(releasedAt, orderId),
    env.DB.prepare('UPDATE orders SET credential_id=NULL WHERE id=?').bind(orderId),
  ]);
  const otherAssignments = await env.DB.prepare("SELECT COUNT(*) AS total FROM credential_assignments WHERE credential_id=? AND status='active'").bind(order.credential_id).first<{ total: number }>();
  if (!Number(otherAssignments?.total || 0)) await env.DB.prepare("UPDATE credentials SET status='available' WHERE id=?").bind(order.credential_id).run();
}

async function notifyOrderDelivery(orderId: string) {
  const order = await env.DB.prepare('SELECT o.id,o.amount,o.status,o.created_at,p.name AS product_name,p.category,u.phone,u.email FROM orders o JOIN products p ON p.id=o.product_id JOIN users u ON u.id=o.user_id WHERE o.id=?').bind(orderId).first<{ id: string; amount: number; status: string; created_at: string; product_name: string; category: string; phone: string; email: string }>();
  if (order) await sendOrderNotification('delivery', order);
}

function validateProductImage(value: string | number | undefined) {
  const imageUrl = String(value || '').trim();
  return !imageUrl || imageUrl.startsWith('/api/product-images?key=products%2F') ? imageUrl : null;
}

function validBillingCycle(value: string | number | undefined) {
  return ['once', 'day', 'week', 'month', 'year', 'times'].includes(String(value)) ? String(value) : 'once';
}

function normalizeProductAttributes(value: string | number | undefined) {
  const attributes = String(value || '').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const separator = trimmed.search(/[：:]/);
    const name = (separator < 0 ? '说明' : trimmed.slice(0, separator)).trim().slice(0, 20);
    const attributeValue = (separator < 0 ? trimmed : trimmed.slice(separator + 1)).trim().slice(0, 80);
    return name && attributeValue ? [{ name, value: attributeValue }] : [];
  }).slice(0, 8);
  return JSON.stringify(attributes);
}
