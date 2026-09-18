import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../../db/setup';
import { createHmac, randomInt } from 'node:crypto';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;

function hashCode(phone: string, code: string) {
  const secret = process.env.AUTH_CODE_SECRET || process.env.MYSQL_PASSWORD || '';
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

async function saveCode(phone: string, code: string, channel: 'sms' | 'fallback') {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  await env.DB.prepare('INSERT INTO yxshop_login_verification_codes (phone,code_hash,expires_at,sent_at,channel) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),sent_at=VALUES(sent_at),channel=VALUES(channel)')
    .bind(phone, hashCode(phone, code), expiresAt, now.toISOString(), channel)
    .run();
}

export async function POST(request: Request) {
  const { phone } = await request.json() as { phone?: string };
  if (!phone || !/^1\d{10}$/.test(phone)) return Response.json({ message: '请输入正确的手机号' }, { status: 400 });
  await ensureDatabase();

  const previous = await env.DB.prepare('SELECT sent_at FROM yxshop_login_verification_codes WHERE phone=?').bind(phone).first<{ sent_at: string }>();
  if (previous?.sent_at && Date.now() - new Date(previous.sent_at).getTime() < RESEND_INTERVAL_MS) {
    return Response.json({ message: '请 60 秒后再获取验证码' }, { status: 429 });
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE phone=?').bind(phone).first();
  const code = String(randomInt(100000, 1000000));
  const message = `【宇星商城】您的验证码为：${code}，宇星商城`;
  const smsApiUrl = process.env.SMS_API_URL || 'http://127.0.0.1:9268/api/sms/send';

  try {
    const response = await fetch(smsApiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mobile: phone, message, dstime: '' }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null) as { code?: string | number; remark?: string } | null;
    if (!response.ok || String(result?.code) !== '0') throw new Error(result?.remark || `短信服务返回 HTTP ${response.status}`);
    await saveCode(phone, code, 'sms');
    return Response.json({ ok: true, registered: Boolean(existing), message: '验证码已发送，请查收短信' });
  } catch (error) {
    console.warn('短信验证码发送失败，已切换演示验证码。', error instanceof Error ? error.message : error);
    await saveCode(phone, '888888', 'fallback');
    return Response.json({ ok: true, registered: Boolean(existing), message: '短信服务暂不可用，已自动填入演示验证码', demoCode: '888888', fallback: true });
  }
}
