import { env } from '@/db/mysql-runtime';
import { requireAccount, accountFailure, accountHeaders } from '@/lib/account-service';
export async function GET(request: Request) {
  try {
    const user = await requireAccount(request);
    const row = await env.DB.prepare('SELECT avatar_data,avatar_mime FROM yxshop_user_profiles WHERE user_id=?').bind(user.id).first<{ avatar_data: string; avatar_mime: string }>();
    if (!row?.avatar_data || !['image/png','image/jpeg'].includes(row.avatar_mime)) return new Response(null, { status: 404, headers: accountHeaders });
    return new Response(Buffer.from(row.avatar_data, 'base64'), { headers: { ...accountHeaders, 'Content-Type': row.avatar_mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch (error) { return accountFailure(error); }
}
