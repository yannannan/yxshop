import { env } from '@/db/mysql-runtime';
import { ensureDatabase, getSessionPhone } from '../../../db/setup';

type AddressInput = {
  id?: number;
  contactName?: string;
  contactPhone?: string;
  province?: string;
  city?: string;
  district?: string;
  detailAddress?: string;
  isDefault?: boolean;
};

async function getActiveUser(request: Request) {
  const phone = getSessionPhone(request);
  if (!phone) return null;
  return env.DB.prepare("SELECT id,phone FROM users WHERE phone=? AND status='active'")
    .bind(phone)
    .first<{ id: number; phone: string }>();
}

function normalize(body: AddressInput) {
  return {
    contactName: String(body.contactName || '').trim().slice(0, 50),
    contactPhone: String(body.contactPhone || '').trim().slice(0, 32),
    province: String(body.province || '').trim().slice(0, 50),
    city: String(body.city || '').trim().slice(0, 50),
    district: String(body.district || '').trim().slice(0, 80),
    detailAddress: String(body.detailAddress || '').trim().slice(0, 300),
    isDefault: body.isDefault ? 1 : 0,
  };
}

function validate(address: ReturnType<typeof normalize>) {
  if (!address.contactName) return '请填写联系人姓名';
  if (!address.contactPhone) return '请填写联系电话';
  if (!address.province || !address.city || !address.district) return '请完整填写省、市、区';
  if (!address.detailAddress) return '请填写详细地址';
  return '';
}

export async function GET(request: Request) {
  await ensureDatabase();
  const user = await getActiveUser(request);
  if (!user) return Response.json({ message: '请先登录' }, { status: 401 });
  try {
    const { results } = await env.DB.prepare(
      'SELECT id,contact_name,contact_phone,province,city,district,detail_address,is_default,created_at,updated_at FROM customer_addresses WHERE user_id=? ORDER BY is_default DESC,updated_at DESC,id DESC',
    ).bind(user.id).all();
    return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: '地址管理尚未初始化，请先执行 yxshop-customer-address-V1.4.sql' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await getActiveUser(request);
  if (!user) return Response.json({ message: '请先登录' }, { status: 401 });
  const body = await request.json() as AddressInput;
  const address = normalize(body);
  const error = validate(address);
  if (error) return Response.json({ message: error }, { status: 400 });
  const now = new Date().toISOString();

  try {
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM customer_addresses WHERE user_id=?')
      .bind(user.id).first<{ total: number }>();
    const shouldDefault = address.isDefault || Number(count?.total || 0) === 0;
    if (shouldDefault) {
      await env.DB.prepare('UPDATE customer_addresses SET is_default=0,updated_at=? WHERE user_id=?')
        .bind(now, user.id).run();
    }
    const result = await env.DB.prepare(
      'INSERT INTO customer_addresses (user_id,contact_name,contact_phone,province,city,district,detail_address,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      user.id,address.contactName,address.contactPhone,address.province,address.city,address.district,address.detailAddress,
      shouldDefault ? 1 : 0,now,now,
    ).run();
    return Response.json({ ok: true, id: Number(result.meta.last_row_id || 0) });
  } catch {
    return Response.json({ message: '地址保存失败，请确认地址表已初始化' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  await ensureDatabase();
  const user = await getActiveUser(request);
  if (!user) return Response.json({ message: '请先登录' }, { status: 401 });
  const body = await request.json() as AddressInput;
  const id = Number(body.id || 0);
  if (!id) return Response.json({ message: '地址参数错误' }, { status: 400 });
  const address = normalize(body);
  const error = validate(address);
  if (error) return Response.json({ message: error }, { status: 400 });
  const existing = await env.DB.prepare('SELECT id,is_default FROM customer_addresses WHERE id=? AND user_id=?')
    .bind(id,user.id).first<{ id: number; is_default: number }>();
  if (!existing) return Response.json({ message: '地址不存在' }, { status: 404 });
  const now = new Date().toISOString();
  if (Number(existing.is_default) === 1 && !address.isDefault) {
    const anotherDefault = await env.DB.prepare('SELECT id FROM customer_addresses WHERE user_id=? AND id<>? AND is_default=1 LIMIT 1')
      .bind(user.id,id).first();
    if (!anotherDefault) address.isDefault = 1;
  }
  if (address.isDefault) {
    await env.DB.prepare('UPDATE customer_addresses SET is_default=0,updated_at=? WHERE user_id=?')
      .bind(now,user.id).run();
  }
  await env.DB.prepare(
    'UPDATE customer_addresses SET contact_name=?,contact_phone=?,province=?,city=?,district=?,detail_address=?,is_default=?,updated_at=? WHERE id=? AND user_id=?',
  ).bind(address.contactName,address.contactPhone,address.province,address.city,address.district,address.detailAddress,address.isDefault,now,id,user.id).run();
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const user = await getActiveUser(request);
  if (!user) return Response.json({ message: '请先登录' }, { status: 401 });
  const body = await request.json() as { id?: number };
  const id = Number(body.id || 0);
  if (!id) return Response.json({ message: '地址参数错误' }, { status: 400 });
  const existing = await env.DB.prepare('SELECT id FROM customer_addresses WHERE id=? AND user_id=?').bind(id,user.id).first();
  if (!existing) return Response.json({ message: '地址不存在' }, { status: 404 });
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE customer_addresses SET is_default=0,updated_at=? WHERE user_id=?').bind(now,user.id),
    env.DB.prepare('UPDATE customer_addresses SET is_default=1,updated_at=? WHERE id=? AND user_id=?').bind(now,id,user.id),
  ]);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  await ensureDatabase();
  const user = await getActiveUser(request);
  if (!user) return Response.json({ message: '请先登录' }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get('id') || 0);
  if (!id) return Response.json({ message: '地址参数错误' }, { status: 400 });
  const existing = await env.DB.prepare('SELECT id,is_default FROM customer_addresses WHERE id=? AND user_id=?')
    .bind(id,user.id).first<{ id: number; is_default: number }>();
  if (!existing) return Response.json({ message: '地址不存在' }, { status: 404 });
  await env.DB.prepare('DELETE FROM customer_addresses WHERE id=? AND user_id=?').bind(id,user.id).run();
  if (Number(existing.is_default) === 1) {
    const next = await env.DB.prepare('SELECT id FROM customer_addresses WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 1')
      .bind(user.id).first<{ id: number }>();
    if (next) {
      await env.DB.prepare('UPDATE customer_addresses SET is_default=1,updated_at=? WHERE id=? AND user_id=?')
        .bind(new Date().toISOString(),next.id,user.id).run();
    }
  }
  return Response.json({ ok: true });
}
