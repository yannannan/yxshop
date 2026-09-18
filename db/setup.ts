import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './mysql-runtime';

let ready: Promise<void> | null = null;

// 既有商城业务表已初始化；验证码表以商城前缀按需创建，避免影响同库其他项目。
export function ensureDatabase() {
  ready ??= env.DB.prepare('SELECT 1').first()
    .then(() => env.DB.prepare("CREATE TABLE IF NOT EXISTS yxshop_login_verification_codes (phone VARCHAR(32) NOT NULL, code_hash CHAR(64) NOT NULL, expires_at VARCHAR(40) NOT NULL, sent_at VARCHAR(40) NOT NULL, channel VARCHAR(32) NOT NULL DEFAULT 'sms', PRIMARY KEY (phone), KEY idx_yxshop_login_codes_expires_at (expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci").run())
    .then(() => undefined);
  return ready;
}

export async function ensurePaymentQrRecords(productId: number, amount: number) {
  const normalizedAmount = Number(Number(amount).toFixed(2));
  if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return;
  for (const [type, label] of [['wechat', '微信支付'], ['alipay', '支付宝']] as const) {
    const existing = await env.DB.prepare('SELECT id FROM payment_qrs WHERE product_id=? AND type=? AND amount=?').bind(productId, type, normalizedAmount).first();
    if (!existing) await env.DB.prepare('INSERT INTO payment_qrs (product_id,name,type,amount,image_url,status) VALUES (?,?,?,?,?,?)').bind(productId, `${label} ¥${normalizedAmount.toFixed(2)} 收款码`, type, normalizedAmount, null, 'active').run();
  }
}

function rawSessionValue(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const value = cookie.match(/(?:^|;\s*)mall_session=([^;]+)/)?.[1];
  return value ? decodeURIComponent(value) : '';
}

function sessionSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.AUTH_CODE_SECRET || process.env.MYSQL_PASSWORD || '';
}

export function createMallSession(phone: string) {
  const signature = createHmac('sha256', sessionSecret()).update(`mall_session:${phone}`).digest('hex');
  return `${phone}.${signature}`;
}

export function getVerifiedSessionPhone(request: Request) {
  const value = rawSessionValue(request);
  const match = value.match(/^(1\d{10})\.([a-f0-9]{64})$/i);
  if (!match) return null;
  const phone = match[1];
  const actual = match[2].toLowerCase();
  const expected = createHmac('sha256', sessionSecret()).update(`mall_session:${phone}`).digest('hex');
  if (actual.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected)) ? phone : null;
}

export function getSessionPhone(request: Request) {
  const verified = getVerifiedSessionPhone(request);
  if (verified) return verified;
  const legacy = rawSessionValue(request);
  return /^1\d{10}$/.test(legacy) ? legacy : null;
}
