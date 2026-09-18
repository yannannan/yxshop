import { env } from '@/db/mysql-runtime';
import { createMallSession, ensureDatabase } from '../../../../db/setup';
import { createHmac, timingSafeEqual } from 'node:crypto';

function hashCode(phone: string, code: string) {
  const secret = process.env.AUTH_CODE_SECRET || process.env.MYSQL_PASSWORD || '';
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

export async function POST(request: Request) {
  await ensureDatabase();
  const { phone, email, code } = await request.json() as { phone?: string; email?: string; code?: string };
  if (!phone || !/^1\d{10}$/.test(phone)) return Response.json({ message: '手机号格式不正确' }, { status: 400 });
  if (!code || !/^\d{6}$/.test(code)) return Response.json({ message: '请输入 6 位验证码' }, { status: 400 });
  const verification = await env.DB.prepare('SELECT code_hash,expires_at FROM yxshop_login_verification_codes WHERE phone=?').bind(phone).first<{ code_hash: string; expires_at: string }>();
  const expectedHash = verification?.code_hash;
  const actualHash = hashCode(phone, code);
  const isMatch = Boolean(expectedHash && expectedHash.length === actualHash.length && timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash)));
  if (!verification || new Date(verification.expires_at).getTime() < Date.now() || !isMatch) return Response.json({ message: '验证码不正确或已过期，请重新获取' }, { status: 400 });
  await env.DB.prepare('DELETE FROM yxshop_login_verification_codes WHERE phone=?').bind(phone).run();
  const existing = await env.DB.prepare('SELECT id,email,status FROM users WHERE phone=?').bind(phone).first<{ id: number; email: string; status: string }>();
  if (existing?.status === 'disabled') return Response.json({ message: '账号已被停用' }, { status: 403 });
  if (!existing) {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ message: '首次注册请填写正确的订单邮箱' }, { status: 400 });
    await env.DB.prepare('INSERT INTO users (phone,email,status,created_at) VALUES (?,?,?,?)').bind(phone, email, 'active', new Date().toISOString()).run();
  }
  return new Response(JSON.stringify({ ok: true, phone, email: existing?.email || email }), {
    headers: { 'content-type': 'application/json', 'set-cookie': `mall_session=${encodeURIComponent(createMallSession(phone))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` },
  });
}
