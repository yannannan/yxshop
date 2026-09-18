import { env } from '@/db/mysql-runtime';
import { ensureDatabase, getSessionPhone } from '../../../db/setup';

async function currentUser(request: Request) {
  const phone = getSessionPhone(request);
  if (!phone) return null;
  const user = await env.DB.prepare("SELECT id,email FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number; email: string }>();
  return user ? { ...user, phone } : null;
}

async function getService(slug: string) {
  return env.DB.prepare("SELECT s.id,s.provider_id,s.title,s.slug,p.name AS provider_name FROM technical_services s JOIN technical_providers p ON p.id=s.provider_id WHERE s.slug=? AND s.status='active' AND p.status='active'").bind(slug).first<{ id: number; provider_id: number; title: string; slug: string; provider_name: string }>();
}

export async function GET(request: Request) {
  await ensureDatabase();
  const user = await currentUser(request);
  if (!user) return Response.json({ message: '请先登录' }, { status: 401 });
  const url = new URL(request.url);
  const serviceSlug = String(url.searchParams.get('serviceSlug') || '').trim();

  if (serviceSlug) {
    const service = await getService(serviceSlug);
    if (!service) return Response.json({ message: '技术服务不存在或已下架' }, { status: 404 });
    const consultation = await env.DB.prepare("SELECT c.*,s.title AS service_title,p.name AS provider_name FROM technical_consultations c JOIN technical_services s ON s.id=c.service_id JOIN technical_providers p ON p.id=c.provider_id WHERE c.service_id=? AND c.user_id=? ORDER BY c.id DESC LIMIT 1").bind(service.id, user.id).first<{ id: number } & Record<string, unknown>>();
    if (!consultation) return Response.json({ consultation: null, messages: [], contactRequest: null });
    const [messages, contactRequest] = await Promise.all([
      env.DB.prepare('SELECT id,consultation_id,sender_type,sender_id,content,read_at,created_at FROM technical_consultation_messages WHERE consultation_id=? ORDER BY created_at,id').bind(consultation.id).all(),
      env.DB.prepare('SELECT * FROM technical_contact_requests WHERE consultation_id=? ORDER BY id DESC LIMIT 1').bind(consultation.id).first(),
    ]);
    await env.DB.prepare("UPDATE technical_consultation_messages SET read_at=? WHERE consultation_id=? AND sender_type='provider' AND read_at IS NULL").bind(new Date().toISOString(), consultation.id).run();
    return Response.json({ consultation, messages: messages.results, contactRequest }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { results } = await env.DB.prepare("SELECT c.*,s.title AS service_title,s.slug AS service_slug,p.name AS provider_name FROM technical_consultations c JOIN technical_services s ON s.id=c.service_id JOIN technical_providers p ON p.id=c.provider_id WHERE c.user_id=? ORDER BY c.last_message_at DESC,c.id DESC").bind(user.id).all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await currentUser(request);
  if (!user) return Response.json({ message: '请先登录后再使用在线技术支持' }, { status: 401 });
  const body = await request.json() as Record<string, string | number>;
  const action = String(body.action || 'send');
  const serviceSlug = String(body.serviceSlug || '').trim();
  const service = await getService(serviceSlug);
  if (!service) return Response.json({ message: '技术服务不存在或已下架' }, { status: 404 });
  const now = new Date().toISOString();

  let consultation = await env.DB.prepare('SELECT id,status FROM technical_consultations WHERE service_id=? AND user_id=? ORDER BY id DESC LIMIT 1').bind(service.id, user.id).first<{ id: number; status: string }>();

  if (!consultation) {
    const inserted = await env.DB.prepare('INSERT INTO technical_consultations (service_id,provider_id,user_id,customer_phone,customer_email,status,last_message_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(service.id, service.provider_id, user.id, user.phone, user.email || '', 'open', now, now, now).run();
    consultation = { id: inserted.meta.last_row_id, status: 'open' };
    await env.DB.prepare("INSERT INTO technical_consultation_messages (consultation_id,sender_type,sender_id,content,read_at,created_at) VALUES (?,?,?,?,?,?)")
      .bind(consultation.id, 'provider', null, `您好，我是${service.provider_name}。请说明您的需求、使用场景和期望服务时间。`, null, now).run();
  } else if (consultation.status === 'closed') {
    await env.DB.prepare("UPDATE technical_consultations SET status='open',updated_at=? WHERE id=?").bind(now, consultation.id).run();
  }

  if (action === 'contact-request') {
    const existing = await env.DB.prepare("SELECT id,status FROM technical_contact_requests WHERE consultation_id=? ORDER BY id DESC LIMIT 1").bind(consultation.id).first<{ id: number; status: string }>();
    if (existing && ['pending','approved'].includes(existing.status)) return Response.json({ ok: true, consultationId: consultation.id, contactRequestStatus: existing.status });
    await env.DB.prepare('INSERT INTO technical_contact_requests (consultation_id,service_id,provider_id,user_id,status,requested_at,reviewed_at,reviewed_by,note) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(consultation.id, service.id, service.provider_id, user.id, 'pending', now, null, null, '').run();
    return Response.json({ ok: true, consultationId: consultation.id, contactRequestStatus: 'pending' });
  }

  const content = String(body.content || '').trim().slice(0, 4000);
  if (!content) return Response.json({ message: '请输入咨询内容' }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO technical_consultation_messages (consultation_id,sender_type,sender_id,content,read_at,created_at) VALUES (?,?,?,?,?,?)')
      .bind(consultation.id, 'customer', user.id, content, null, now),
    env.DB.prepare("UPDATE technical_consultations SET status='open',last_message_at=?,updated_at=? WHERE id=?").bind(now, now, consultation.id),
  ]);
  return Response.json({ ok: true, consultationId: consultation.id });
}
