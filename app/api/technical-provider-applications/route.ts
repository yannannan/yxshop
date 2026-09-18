import { env } from '@/db/mysql-runtime';
import { ensureDatabase, getSessionPhone } from '../../../db/setup';

function normalizeList(value: unknown, max = 30) {
  return String(value || '').split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json() as Record<string, string>;
  const sessionPhone = getSessionPhone(request);
  const applicantName = String(body.applicantName || '').trim().slice(0, 50);
  const phone = String(body.phone || sessionPhone || '').trim().slice(0, 32);
  const email = String(body.email || '').trim().slice(0, 120);
  const city = String(body.city || '').trim().slice(0, 80);
  const experience = String(body.experience || '').trim().slice(0, 80);
  const roleName = String(body.roleName || '').trim().slice(0, 120);
  const intro = String(body.intro || '').trim().slice(0, 3000);
  const skillsJson = JSON.stringify(normalizeList(body.skillsText));
  const credentialUrlsJson = JSON.stringify(normalizeList(body.credentialUrlsText, 20));

  if (!applicantName || !phone || !city || !roleName) return Response.json({ message: '请填写姓名、手机号、所在城市和技术方向' }, { status: 400 });
  if (!/^(?:\+?\d[\d\- ]{6,20}|1\d{10})$/.test(phone)) return Response.json({ message: '手机号格式不正确' }, { status: 400 });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ message: '邮箱格式不正确' }, { status: 400 });

  const existing = await env.DB.prepare("SELECT id,status FROM technical_provider_applications WHERE phone=? AND status='pending' ORDER BY id DESC LIMIT 1").bind(phone).first<{ id: number; status: string }>();
  if (existing) return Response.json({ message: '该手机号已有待审核入驻申请，请勿重复提交' }, { status: 400 });

  const now = new Date().toISOString();
  const result = await env.DB.prepare('INSERT INTO technical_provider_applications (applicant_name,phone,email,city,experience,role_name,intro,skills_json,credential_urls_json,status,review_note,reviewed_by,reviewed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(applicantName, phone, email, city, experience, roleName, intro, skillsJson, credentialUrlsJson, 'pending', '', null, null, now, now).run();

  return Response.json({ ok: true, applicationId: result.meta.last_row_id, status: 'pending' });
}
