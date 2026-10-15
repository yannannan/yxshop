import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';

export type TechnicianContext = {
  user: { id: number; phone: string; email: string };
  provider: {
    id: number;
    providerCode: string;
    name: string;
    avatar: string;
    city: string;
    experience: string;
    roleName: string;
    intro: string;
    skillsJson: string;
    onlineStatus: string;
    status: string;
  };
};

export async function getTechnicianContext(request: Request): Promise<TechnicianContext | null> {
  const phone = getVerifiedSessionPhone(request);
  if (!phone) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT u.id AS user_id,u.phone,u.email,u.status AS user_status,u.permission_type,
              p.id AS provider_id,p.provider_code,p.name,p.avatar,p.city,p.experience,p.role_name,p.intro,p.skills_json,p.online_status,p.status AS provider_status
       FROM users u
       JOIN technical_providers p ON p.user_id=u.id
       WHERE u.phone=? LIMIT 1`
    ).bind(phone).first<Record<string, string | number | null>>();
    if (!row || row.user_status !== 'active' || row.provider_status !== 'active' || row.permission_type !== '10003') return null;
    return {
      user: { id: Number(row.user_id), phone: String(row.phone || ''), email: String(row.email || '') },
      provider: {
        id: Number(row.provider_id),
        providerCode: String(row.provider_code || ''),
        name: String(row.name || ''),
        avatar: String(row.avatar || ''),
        city: String(row.city || ''),
        experience: String(row.experience || ''),
        roleName: String(row.role_name || ''),
        intro: String(row.intro || ''),
        skillsJson: String(row.skills_json || '[]'),
        onlineStatus: String(row.online_status || 'offline'),
        status: String(row.provider_status || 'active'),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/technical_providers|user_id|permission_type|doesn't exist|does not exist|unknown column|no such table/i.test(message)) return null;
    throw error;
  }
}

export function technicianDenied(message = '当前账号不是已绑定的技术人员', status = 403) {
  return Response.json({ message }, { status });
}
