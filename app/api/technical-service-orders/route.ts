import { env } from '@/db/mysql-runtime';
import { ensureDatabase, getSessionPhone } from '../../../db/setup';

type ServiceRow = {
  id: number;
  provider_id: number;
  slug: string;
  title: string;
  delivery_modes_json: string;
  pricing_mode: string;
  price: number | null;
  status: string;
};

function parseModes(value: string) {
  try {
    const result = JSON.parse(value || '[]');
    return Array.isArray(result) ? result.filter((item) => item === 'online' || item === 'onsite') as string[] : [];
  } catch {
    return [];
  }
}

async function createOrderId(phone: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const id = `YXFW${phone}_${code}`;
    const existing = await env.DB.prepare('SELECT id FROM technical_service_orders WHERE id=?').bind(id).first();
    if (!existing) return id;
  }
  throw new Error('服务订单编号生成失败，请重试');
}

export async function POST(request: Request) {
  await ensureDatabase();
  const phone = getSessionPhone(request);
  if (!phone) return Response.json({ message: '请先登录后再预约技术服务' }, { status: 401 });

  const user = await env.DB.prepare("SELECT id,email FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number; email: string }>();
  if (!user) return Response.json({ message: '用户不可用' }, { status: 401 });

  const body = await request.json() as {
    action?: string;
    orderId?: string;
    serviceSlug?: string;
    deliveryMode?: 'online' | 'onsite';
    scheduledAt?: string;
    serviceAddress?: string;
    requirementText?: string;
    contactName?: string;
    contactPhone?: string;
    addressId?: number;
  };

  if (body.action === 'payment-submitted') {
    const orderId = String(body.orderId || '').trim();
    const order = await env.DB.prepare("SELECT id,status FROM technical_service_orders WHERE id=? AND user_id=?").bind(orderId, user.id).first<{ id: string; status: string }>();
    if (!order) return Response.json({ message: '服务订单不存在' }, { status: 404 });
    if (!['pending_payment','payment_review'].includes(order.status)) return Response.json({ message: '当前订单无需提交支付核验' }, { status: 400 });
    if (order.status !== 'payment_review') await env.DB.prepare("UPDATE technical_service_orders SET status='payment_review',updated_at=? WHERE id=? AND user_id=?").bind(new Date().toISOString(), orderId, user.id).run();
    return Response.json({ ok: true, status: 'payment_review' });
  }

  const slug = String(body.serviceSlug || '').trim();
  const deliveryMode = body.deliveryMode === 'onsite' ? 'onsite' : 'online';
  const scheduledAt = String(body.scheduledAt || '').trim().slice(0, 40);
  let serviceAddress = String(body.serviceAddress || '').trim().slice(0, 500);
  const requirementText = String(body.requirementText || '').trim().slice(0, 4000);
  let contactName = String(body.contactName || '').trim().slice(0, 50);
  let contactPhone = String(body.contactPhone || phone).trim().slice(0, 32);
  let addressId: number | null = null;
  let addressSnapshotJson = '';

  if (!slug) return Response.json({ message: '服务参数不完整' }, { status: 400 });
  if (!scheduledAt) return Response.json({ message: '请选择服务时间' }, { status: 400 });

  if (deliveryMode === 'onsite' && body.addressId) {
    const address = await env.DB.prepare(
      "SELECT id,contact_name,contact_phone,province,city,district,detail_address FROM customer_addresses WHERE id=? AND user_id=?",
    ).bind(Number(body.addressId), user.id).first<{
      id: number;
      contact_name: string;
      contact_phone: string;
      province: string;
      city: string;
      district: string;
      detail_address: string;
    }>();
    if (!address) return Response.json({ message: '所选上门地址不存在，请重新选择' }, { status: 400 });
    addressId = address.id;
    contactName = address.contact_name;
    contactPhone = address.contact_phone;
    serviceAddress = [address.province, address.city, address.district, address.detail_address].filter(Boolean).join('');
    addressSnapshotJson = JSON.stringify({
      contactName: address.contact_name,
      contactPhone: address.contact_phone,
      province: address.province,
      city: address.city,
      district: address.district,
      detailAddress: address.detail_address,
      fullAddress: serviceAddress,
    });
  } else if (deliveryMode === 'onsite' && serviceAddress) {
    addressSnapshotJson = JSON.stringify({
      contactName,
      contactPhone,
      province: '',
      city: '',
      district: '',
      detailAddress: serviceAddress,
      fullAddress: serviceAddress,
    });
  }

  if (deliveryMode === 'onsite' && !serviceAddress) return Response.json({ message: '上门服务请选择或填写上门地址' }, { status: 400 });

  const service = await env.DB.prepare("SELECT id,provider_id,slug,title,delivery_modes_json,pricing_mode,price,status FROM technical_services WHERE slug=? AND status='active'").bind(slug).first<ServiceRow>();
  if (!service) return Response.json({ message: '技术服务不存在或已下架' }, { status: 404 });

  const modes = parseModes(service.delivery_modes_json);
  if (!modes.includes(deliveryMode)) return Response.json({ message: '当前服务不支持所选服务方式' }, { status: 400 });

  const id = await createOrderId(phone);
  const now = new Date().toISOString();
  const status = service.pricing_mode === 'negotiable' ? 'pending_quote' : 'pending_payment';
  const amount = service.pricing_mode === 'negotiable' ? null : Number(service.price || 0);

  await env.DB.batch([
    env.DB.prepare('INSERT INTO technical_service_orders (id,service_id,provider_id,user_id,customer_phone,customer_email,delivery_mode,pricing_mode,amount,requirement_text,service_address,address_id,address_snapshot_json,scheduled_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, service.id, service.provider_id, user.id, phone, user.email || '', deliveryMode, service.pricing_mode, amount, requirementText, serviceAddress, addressId, addressSnapshotJson, scheduledAt, status, now, now),
    env.DB.prepare('INSERT INTO technical_service_appointments (order_id,service_id,provider_id,delivery_mode,scheduled_at,service_address,contact_name,contact_phone,note,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, service.id, service.provider_id, deliveryMode, scheduledAt, serviceAddress, contactName, contactPhone, requirementText.slice(0, 1000), 'pending', now, now),
  ]);

  return Response.json({ ok: true, orderId: id, status, amount, pricingMode: service.pricing_mode });
}

export async function GET(request: Request) {
  await ensureDatabase();
  const phone = getSessionPhone(request);
  if (!phone) return Response.json({ message: '请先登录' }, { status: 401 });

  const user = await env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
  if (!user) return Response.json({ message: '用户不可用' }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (id) {
    const order = await env.DB.prepare("SELECT o.*,s.title AS service_title,s.slug AS service_slug,s.summary AS service_summary,p.name AS provider_name,p.city AS provider_city,p.avatar AS provider_avatar FROM technical_service_orders o JOIN technical_services s ON s.id=o.service_id JOIN technical_providers p ON p.id=o.provider_id WHERE o.id=? AND o.user_id=?").bind(id, user.id).first();
    return order ? Response.json(order, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ message: '服务订单不存在' }, { status: 404 });
  }

  const { results } = await env.DB.prepare("SELECT o.*,s.title AS service_title,s.slug AS service_slug,p.name AS provider_name FROM technical_service_orders o JOIN technical_services s ON s.id=o.service_id JOIN technical_providers p ON p.id=o.provider_id WHERE o.user_id=? ORDER BY o.created_at DESC").bind(user.id).all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
