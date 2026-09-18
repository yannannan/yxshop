import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../../db/setup';

function parseJsonArray<T>(value: unknown, fallback: T[] = []) {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function normalizeList(value: unknown, max = 20) {
  return String(value || '').split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function normalizeServiceIncludes(value: unknown) {
  return String(value || '').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const index = trimmed.search(/[：:]/);
    const title = (index < 0 ? trimmed : trimmed.slice(0, index)).trim().slice(0, 60);
    const detail = (index < 0 ? '' : trimmed.slice(index + 1)).trim().slice(0, 300);
    return title ? [{ title, detail }] : [];
  }).slice(0, 20);
}

async function readPaymentQrs() {
  try {
    const { results } = await env.DB.prepare("SELECT q.*,s.title AS service_title FROM technical_payment_qrs q JOIN technical_services s ON s.id=q.service_id ORDER BY q.service_id,q.type,q.id").all();
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/technical_payment_qrs|doesn't exist|does not exist|no such table/i.test(message)) return [];
    throw error;
  }
}

async function readData() {
  const [providers, services, paymentQrs, orders, appointments, consultations, messages, contactRequests, applications] = await Promise.all([
    env.DB.prepare('SELECT * FROM technical_providers ORDER BY sort_order,id').all(),
    env.DB.prepare("SELECT s.*,p.name AS provider_name,p.provider_code,p.avatar,p.city,p.experience,p.role_name,p.intro,p.skills_json,p.certification_status,p.online_status FROM technical_services s JOIN technical_providers p ON p.id=s.provider_id ORDER BY s.sort_order,s.id").all(),
    readPaymentQrs(),
    env.DB.prepare("SELECT o.*,s.title AS service_title,s.slug AS service_slug,p.name AS provider_name FROM technical_service_orders o JOIN technical_services s ON s.id=o.service_id JOIN technical_providers p ON p.id=o.provider_id ORDER BY o.created_at DESC").all(),
    env.DB.prepare("SELECT a.*,s.title AS service_title,p.name AS provider_name FROM technical_service_appointments a JOIN technical_services s ON s.id=a.service_id JOIN technical_providers p ON p.id=a.provider_id ORDER BY a.scheduled_at DESC,a.id DESC").all(),
    env.DB.prepare("SELECT c.*,s.title AS service_title,s.slug AS service_slug,p.name AS provider_name FROM technical_consultations c JOIN technical_services s ON s.id=c.service_id JOIN technical_providers p ON p.id=c.provider_id ORDER BY c.last_message_at DESC,c.id DESC").all(),
    env.DB.prepare("SELECT m.*,c.service_id,c.provider_id FROM technical_consultation_messages m JOIN technical_consultations c ON c.id=m.consultation_id ORDER BY m.created_at,m.id").all(),
    env.DB.prepare("SELECT r.*,s.title AS service_title,p.name AS provider_name FROM technical_contact_requests r JOIN technical_services s ON s.id=r.service_id JOIN technical_providers p ON p.id=r.provider_id ORDER BY r.requested_at DESC,r.id DESC").all(),
    env.DB.prepare("SELECT * FROM technical_provider_applications ORDER BY created_at DESC,id DESC").all(),
  ]);
  return {
    initialized: true,
    providers: providers.results,
    services: services.results,
    paymentQrs,
    orders: orders.results,
    appointments: appointments.results,
    consultations: consultations.results,
    messages: messages.results,
    contactRequests: contactRequests.results,
    applications: applications.results,
  };
}

export async function GET() {
  await ensureDatabase();
  try {
    return Response.json(await readData(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/technical_providers|technical_services|doesn't exist|does not exist|no such table/i.test(message)) {
      return Response.json({ initialized: false, providers: [], services: [], message: '上门服务数据表尚未初始化，请执行上门服务 SQL。' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('读取上门服务后台数据失败', error);
    return Response.json({ initialized: false, providers: [], services: [], message: '上门服务数据读取失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json() as Record<string, string | number>;
  const action = String(body.action || '');
  const now = new Date().toISOString();
  try {
    switch (action) {
      case 'provider-save': {
        const name = String(body.name || '').trim().slice(0, 50);
        const providerCode = String(body.providerCode || '').trim().slice(0, 64);
        if (!name || !providerCode) return Response.json({ message: '请填写技术人员姓名和人员编码' }, { status: 400 });
        const duplicate = await env.DB.prepare('SELECT id FROM technical_providers WHERE provider_code=? AND id<>?').bind(providerCode, Number(body.id || 0)).first();
        if (duplicate) return Response.json({ message: '技术人员编码已存在' }, { status: 400 });
        const initials = String(body.initials || name.slice(0, 1)).trim().slice(0, 8);
        const avatar = String(body.avatar || '').trim().slice(0, 500);
        const city = String(body.city || '').trim().slice(0, 80);
        const experience = String(body.experience || '').trim().slice(0, 80);
        const roleName = String(body.roleName || '').trim().slice(0, 120);
        const intro = String(body.intro || '').trim().slice(0, 2000);
        const skillsJson = JSON.stringify(normalizeList(body.skillsText, 30));
        const certificationStatus = String(body.certificationStatus || 'verified') === 'pending' ? 'pending' : String(body.certificationStatus || '') === 'rejected' ? 'rejected' : 'verified';
        const onlineStatus = String(body.onlineStatus || 'online') === 'offline' ? 'offline' : 'online';
        const sortOrder = Math.max(0, Number(body.sortOrder || 0));
        const status = String(body.status || '') === 'disabled' ? 'disabled' : 'active';
        if (body.id) {
          await env.DB.prepare('UPDATE technical_providers SET provider_code=?,name=?,initials=?,avatar=?,city=?,experience=?,role_name=?,intro=?,skills_json=?,certification_status=?,online_status=?,sort_order=?,status=?,updated_at=? WHERE id=?')
            .bind(providerCode, name, initials, avatar, city, experience, roleName, intro, skillsJson, certificationStatus, onlineStatus, sortOrder, status, now, body.id).run();
        } else {
          await env.DB.prepare('INSERT INTO technical_providers (provider_code,name,initials,avatar,city,experience,role_name,intro,skills_json,certification_status,online_status,sort_order,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(providerCode, name, initials, avatar, city, experience, roleName, intro, skillsJson, certificationStatus, onlineStatus, sortOrder, status, now, now).run();
        }
        break;
      }
      case 'provider-status':
        await env.DB.prepare('UPDATE technical_providers SET status=?,updated_at=? WHERE id=?').bind(body.status === 'disabled' ? 'disabled' : 'active', now, body.id).run();
        break;
      case 'provider-delete': {
        const id = Number(body.id || 0);
        const services = await env.DB.prepare('SELECT COUNT(*) AS total FROM technical_services WHERE provider_id=?').bind(id).first<{ total: number }>();
        if (Number(services?.total || 0) > 0) return Response.json({ message: '该技术人员仍有关联服务，请先处理服务后再删除' }, { status: 400 });
        await env.DB.prepare('DELETE FROM technical_providers WHERE id=?').bind(id).run();
        break;
      }
      case 'service-save': {
        const title = String(body.title || '').trim().slice(0, 120);
        const slug = String(body.slug || '').trim().slice(0, 100);
        const providerId = Number(body.providerId || 0);
        if (!title || !slug || !providerId) return Response.json({ message: '请填写服务名称、Slug 并选择技术人员' }, { status: 400 });
        const provider = await env.DB.prepare("SELECT id FROM technical_providers WHERE id=? AND status='active'").bind(providerId).first();
        if (!provider) return Response.json({ message: '技术人员不存在或已停用' }, { status: 400 });
        const duplicate = await env.DB.prepare('SELECT id FROM technical_services WHERE slug=? AND id<>?').bind(slug, Number(body.id || 0)).first();
        if (duplicate) return Response.json({ message: '服务 Slug 已存在' }, { status: 400 });
        const summary = String(body.summary || '').trim().slice(0, 500);
        const modes = String(body.deliveryModes || '').split(',').map((item) => item.trim()).filter((item) => ['online', 'onsite'].includes(item));
        if (!modes.length) return Response.json({ message: '请至少选择一种服务方式' }, { status: 400 });
        const coverage = String(body.coverage || '').trim().slice(0, 200);
        const pricingMode = body.pricingMode === 'negotiable' ? 'negotiable' : 'fixed';
        const price = pricingMode === 'fixed' ? Math.max(0, Number(body.price || 0)) : null;
        if (pricingMode === 'fixed' && (!Number.isFinite(price) || Number(price) <= 0)) return Response.json({ message: '固定价格服务必须填写有效价格' }, { status: 400 });
        const unit = String(body.unit || '次').trim().slice(0, 20);
        const onlineResponse = String(body.onlineResponse || '').trim().slice(0, 80);
        const onsiteArrival = String(body.onsiteArrival || '').trim().slice(0, 80);
        const serviceIncludesJson = JSON.stringify(normalizeServiceIncludes(body.serviceIncludesText));
        const deliveryNotesJson = JSON.stringify(normalizeList(body.deliveryNotesText, 20));
        const homepageFeatured = Number(body.homepageFeatured || 0) ? 1 : 0;
        const sortOrder = Math.max(0, Number(body.sortOrder || 0));
        const status = ['inactive', 'closed'].includes(String(body.status)) ? String(body.status) : 'active';
        if (body.id) {
          await env.DB.prepare('UPDATE technical_services SET provider_id=?,slug=?,homepage_featured=?,title=?,summary=?,delivery_modes_json=?,coverage=?,pricing_mode=?,price=?,unit=?,online_response=?,onsite_arrival=?,service_includes_json=?,delivery_notes_json=?,status=?,sort_order=?,updated_at=? WHERE id=?')
            .bind(providerId, slug, homepageFeatured, title, summary, JSON.stringify(modes), coverage, pricingMode, price, unit, onlineResponse, onsiteArrival, serviceIncludesJson, deliveryNotesJson, status, sortOrder, now, body.id).run();
        } else {
          await env.DB.prepare('INSERT INTO technical_services (provider_id,slug,homepage_featured,title,summary,delivery_modes_json,coverage,pricing_mode,price,unit,online_response,onsite_arrival,service_includes_json,delivery_notes_json,status,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(providerId, slug, homepageFeatured, title, summary, JSON.stringify(modes), coverage, pricingMode, price, unit, onlineResponse, onsiteArrival, serviceIncludesJson, deliveryNotesJson, status, sortOrder, now, now).run();
        }
        break;
      }
      case 'service-status':
        await env.DB.prepare('UPDATE technical_services SET status=?,updated_at=? WHERE id=?').bind(body.status === 'active' ? 'active' : 'inactive', now, body.id).run();
        break;
      case 'service-delete': {
        const id = Number(body.id || 0);
        const orders = await env.DB.prepare('SELECT COUNT(*) AS total FROM technical_service_orders WHERE service_id=?').bind(id).first<{ total: number }>();
        if (Number(orders?.total || 0) > 0) return Response.json({ message: '该服务已有历史订单，不能永久删除，可改为下架' }, { status: 400 });
        await env.DB.prepare('DELETE FROM technical_services WHERE id=?').bind(id).run();
        break;
      }
      case 'payment-qr-save': {
        const serviceId = Number(body.serviceId || 0);
        const type = body.type === 'alipay' ? 'alipay' : 'wechat';
        const name = String(body.name || (type === 'alipay' ? '支付宝收款码' : '微信收款码')).trim().slice(0, 80);
        const imageUrl = String(body.imageUrl || '').trim();
        if (!serviceId) return Response.json({ message: '请选择技术服务' }, { status: 400 });
        if (!imageUrl) return Response.json({ message: '请上传收款二维码' }, { status: 400 });
        if (imageUrl.length > 2_000_000) return Response.json({ message: '二维码图片过大，请压缩后重试' }, { status: 400 });
        const service = await env.DB.prepare('SELECT id FROM technical_services WHERE id=?').bind(serviceId).first();
        if (!service) return Response.json({ message: '技术服务不存在' }, { status: 404 });
        const existing = await env.DB.prepare('SELECT id FROM technical_payment_qrs WHERE service_id=? AND type=?').bind(serviceId, type).first<{ id: number }>();
        if (existing) {
          await env.DB.prepare("UPDATE technical_payment_qrs SET name=?,image_url=?,status='active',updated_at=? WHERE id=?").bind(name, imageUrl, now, existing.id).run();
        } else {
          await env.DB.prepare("INSERT INTO technical_payment_qrs (service_id,name,type,image_url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(serviceId, name, type, imageUrl, 'active', now, now).run();
        }
        break;
      }
      case 'payment-qr-delete':
        await env.DB.prepare('DELETE FROM technical_payment_qrs WHERE id=?').bind(body.id).run();
        break;
      case 'order-quote': {
        const id = String(body.id || '').trim();
        const amount = Number(body.amount || 0);
        if (!id || !Number.isFinite(amount) || amount <= 0) return Response.json({ message: '请输入有效服务报价' }, { status: 400 });
        const order = await env.DB.prepare("SELECT id,status,pricing_mode FROM technical_service_orders WHERE id=?").bind(id).first<{ id: string; status: string; pricing_mode: string }>();
        if (!order) return Response.json({ message: '服务订单不存在' }, { status: 404 });
        if (['completed','closed','cancelled'].includes(order.status)) return Response.json({ message: '当前订单状态不能重新报价' }, { status: 400 });
        await env.DB.prepare("UPDATE technical_service_orders SET amount=?,status='pending_payment',updated_at=? WHERE id=?").bind(amount, now, id).run();
        break;
      }
      case 'order-status': {
        const id = String(body.id || '').trim();
        const status = String(body.status || '');
        const allowed = ['pending_quote','pending_payment','payment_review','paid','accepted','in_service','completed','closed','cancelled'];
        if (!allowed.includes(status)) return Response.json({ message: '服务订单状态不正确' }, { status: 400 });
        const timestamps: Record<string, string | null> = {
          paid: 'paid_at',
          accepted: 'accepted_at',
          in_service: 'started_at',
          completed: 'completed_at',
        };
        const field = timestamps[status];
        if (field) await env.DB.prepare(`UPDATE technical_service_orders SET status=?,${field}=?,updated_at=? WHERE id=?`).bind(status, now, now, id).run();
        else await env.DB.prepare('UPDATE technical_service_orders SET status=?,updated_at=? WHERE id=?').bind(status, now, id).run();
        break;
      }
      case 'appointment-status': {
        const status = String(body.status || '');
        if (!['pending','confirmed','arrived','in_service','completed','cancelled'].includes(status)) return Response.json({ message: '预约状态不正确' }, { status: 400 });
        await env.DB.prepare('UPDATE technical_service_appointments SET status=?,updated_at=? WHERE id=?').bind(status, now, body.id).run();
        break;
      }
      case 'consultation-reply': {
        const consultationId = Number(body.consultationId || 0);
        const content = String(body.content || '').trim().slice(0, 4000);
        if (!consultationId || !content) return Response.json({ message: '请输入回复内容' }, { status: 400 });
        const consultation = await env.DB.prepare('SELECT id FROM technical_consultations WHERE id=?').bind(consultationId).first();
        if (!consultation) return Response.json({ message: '咨询会话不存在' }, { status: 404 });
        await env.DB.batch([
          env.DB.prepare("INSERT INTO technical_consultation_messages (consultation_id,sender_type,sender_id,content,read_at,created_at) VALUES (?,?,?,?,?,?)").bind(consultationId, 'provider', null, content, null, now),
          env.DB.prepare("UPDATE technical_consultations SET status='open',last_message_at=?,updated_at=? WHERE id=?").bind(now, now, consultationId),
        ]);
        break;
      }
      case 'consultation-status': {
        const status = body.status === 'closed' ? 'closed' : 'open';
        await env.DB.prepare('UPDATE technical_consultations SET status=?,updated_at=? WHERE id=?').bind(status, now, body.id).run();
        break;
      }
      case 'contact-request-review': {
        const status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : 'pending';
        await env.DB.prepare('UPDATE technical_contact_requests SET status=?,reviewed_at=?,reviewed_by=?,note=? WHERE id=?')
          .bind(status, status === 'pending' ? null : now, null, String(body.note || '').trim().slice(0, 500), body.id).run();
        break;
      }
      case 'application-review': {
        const status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : 'pending';
        await env.DB.prepare('UPDATE technical_provider_applications SET status=?,review_note=?,reviewed_at=?,reviewed_by=?,updated_at=? WHERE id=?')
          .bind(status, String(body.reviewNote || '').trim().slice(0, 1000), status === 'pending' ? null : now, null, now, body.id).run();
        break;
      }
      default:
        return Response.json({ message: '未知上门服务操作' }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await readData()) });
  } catch (error) {
    console.error('上门服务后台操作失败', error);
    const message = error instanceof Error ? error.message : '';
    if (/technical_providers|technical_services|technical_payment_qrs|technical_service_orders|technical_service_appointments|technical_consultations|technical_consultation_messages|technical_contact_requests|technical_provider_applications|doesn't exist|does not exist|no such table/i.test(message)) {
      return Response.json({ message: '上门服务数据表尚未初始化，请先执行上门服务 SQL。' }, { status: 503 });
    }
    return Response.json({ message: '上门服务操作失败，请检查数据和数据库配置' }, { status: 500 });
  }
}
