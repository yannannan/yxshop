import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const phone = getVerifiedSessionPhone(request);
  if (!phone) return Response.json({ authenticated: false, isAdmin: false, isTechnician: false }, { headers });
  try {
    const user = await env.DB.prepare('SELECT phone,status,permission_type FROM users WHERE phone=?').bind(phone).first<{ phone: string; status: string; permission_type: string | number }>();
    if (!user || user.status !== 'active') return Response.json({ authenticated: false, isAdmin: false, isTechnician: false }, { headers });
    return Response.json({ authenticated: true, phone: user.phone, isAdmin: String(user.permission_type) === '10002', isTechnician: String(user.permission_type) === '10003' }, { headers });
  } catch (error) {
    console.error('商城会话读取失败', (error as { code?: string }).code || (error as Error).name);
    return Response.json({ message: '账户身份暂不可用，请稍后刷新' }, { status: 503, headers });
  }
}
