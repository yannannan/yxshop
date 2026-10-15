import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';
import { getTechnicianContext, technicianDenied } from '../../../lib/technician-auth';

function jsonArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readDashboard(providerId: number) {
  const [orders, logs, reviews] = await Promise.all([
    env.DB.prepare(
      `SELECT o.*,s.title AS service_title,s.slug AS service_slug,s.summary AS service_summary,
              a.contact_name,a.contact_phone,a.note AS appointment_note
       FROM technical_service_orders o
       JOIN technical_services s ON s.id=o.service_id
       LEFT JOIN technical_service_appointments a ON a.order_id=o.id
       WHERE o.provider_id=?
       ORDER BY o.created_at DESC`
    ).bind(providerId).all(),
    env.DB.prepare(
      'SELECT * FROM technical_service_logs WHERE provider_id=? ORDER BY created_at DESC,id DESC'
    ).bind(providerId).all(),
    env.DB.prepare(
      `SELECT r.*,s.title AS service_title,u.phone AS customer_phone
       FROM technical_service_reviews r
       JOIN technical_services s ON s.id=r.service_id
       JOIN users u ON u.id=r.user_id
       WHERE r.provider_id=? AND r.status='active'
       ORDER BY r.created_at DESC,r.id DESC`
    ).bind(providerId).all(),
  ]);
  return { orders: orders.results, logs: logs.results, reviews: reviews.results };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const context = await getTechnicianContext(request);
  if (!context) return technicianDenied();
  try {
    const data = await readDashboard(context.provider.id);
    const stats = {
      total: data.orders.length,
      waiting: data.orders.filter((item) => ['paid'].includes(String(item.status))).length,
      inService: data.orders.filter((item) => String(item.status) === 'in_service').length,
      awaitingAcceptance: data.orders.filter((item) => String(item.status) === 'awaiting_acceptance').length,
      completed: data.orders.filter((item) => String(item.status) === 'completed').length,
      rating: data.reviews.length ? Number((data.reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / data.reviews.length).toFixed(1)) : 0,
    };
    return Response.json({
      authenticated: true,
      user: context.user,
      provider: { ...context.provider, skills: jsonArray(context.provider.skillsJson) },
      ...data,
      stats,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('技术人员工作台读取失败', error);
    const message = error instanceof Error ? error.message : '';
    if (/technical_service_logs|technical_service_reviews|provider_completed_at|customer_accepted_at|doesn't exist|does not exist|unknown column|no such table/i.test(message)) {
      return Response.json({ message: '技术人员工作台尚未初始化，请先执行 sql/yxshop-technician-workbench-V1.5.sql' }, { status: 503 });
    }
    return Response.json({ message: '技术人员工作台读取失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await ensureDatabase();
  const context = await getTechnicianContext(request);
  if (!context) return technicianDenied();

  const body = await request.json() as Record<string, string | number>;
  const action = String(body.action || '');
  const now = new Date().toISOString();

  try {
    if (action === 'profile-save') {
      const city = String(body.city || '').trim().slice(0, 80);
      const experience = String(body.experience || '').trim().slice(0, 80);
      const roleName = String(body.roleName || '').trim().slice(0, 120);
      const intro = String(body.intro || '').trim().slice(0, 2000);
      const skills = String(body.skillsText || '').split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
      const onlineStatus = String(body.onlineStatus || '') === 'offline' ? 'offline' : 'online';
      await env.DB.prepare(
        'UPDATE technical_providers SET city=?,experience=?,role_name=?,intro=?,skills_json=?,online_status=?,updated_at=? WHERE id=? AND user_id=?'
      ).bind(city, experience, roleName, intro, JSON.stringify(skills), onlineStatus, now, context.provider.id, context.user.id).run();
      return Response.json({ ok: true, message: '个人资料已保存' });
    }

    const orderId = String(body.orderId || '').trim();
    if (!orderId) return Response.json({ message: '服务订单不能为空' }, { status: 400 });
    const order = await env.DB.prepare(
      'SELECT id,status,provider_id FROM technical_service_orders WHERE id=? AND provider_id=?'
    ).bind(orderId, context.provider.id).first<{ id: string; status: string; provider_id: number }>();
    if (!order) return Response.json({ message: '服务订单不存在或不属于当前技术人员' }, { status: 404 });

    if (action === 'start-service') {
      if (order.status !== 'paid') return Response.json({ message: '只有已支付订单才能开始服务' }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare("UPDATE technical_service_orders SET status='in_service',started_at=?,updated_at=? WHERE id=? AND provider_id=?").bind(now, now, orderId, context.provider.id),
        env.DB.prepare("UPDATE technical_service_appointments SET status='in_service',updated_at=? WHERE order_id=? AND provider_id=?").bind(now, orderId, context.provider.id),
        env.DB.prepare("INSERT INTO technical_service_logs (order_id,provider_id,operator_user_id,log_type,content,created_at) VALUES (?,?,?,?,?,?)").bind(orderId, context.provider.id, context.user.id, 'start', '技术人员开始服务', now),
      ]);
      return Response.json({ ok: true, status: 'in_service', message: '已开始服务' });
    }

    if (action === 'add-log') {
      if (!['in_service','awaiting_acceptance'].includes(order.status)) return Response.json({ message: '当前订单状态不能添加服务记录' }, { status: 400 });
      const content = String(body.content || '').trim().slice(0, 2000);
      if (!content) return Response.json({ message: '请输入服务记录内容' }, { status: 400 });
      await env.DB.prepare(
        "INSERT INTO technical_service_logs (order_id,provider_id,operator_user_id,log_type,content,created_at) VALUES (?,?,?,?,?,?)"
      ).bind(orderId, context.provider.id, context.user.id, 'note', content, now).run();
      return Response.json({ ok: true, message: '服务记录已保存' });
    }

    if (action === 'finish-service') {
      if (order.status !== 'in_service') return Response.json({ message: '只有服务中的订单才能提交完成' }, { status: 400 });
      const summary = String(body.content || '').trim().slice(0, 2000);
      if (!summary) return Response.json({ message: '请填写本次服务完成说明' }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare("UPDATE technical_service_orders SET status='awaiting_acceptance',provider_completed_at=?,updated_at=? WHERE id=? AND provider_id=?").bind(now, now, orderId, context.provider.id),
        env.DB.prepare("UPDATE technical_service_appointments SET status='completed',updated_at=? WHERE order_id=? AND provider_id=?").bind(now, orderId, context.provider.id),
        env.DB.prepare("INSERT INTO technical_service_logs (order_id,provider_id,operator_user_id,log_type,content,created_at) VALUES (?,?,?,?,?,?)").bind(orderId, context.provider.id, context.user.id, 'finish', summary, now),
      ]);
      return Response.json({ ok: true, status: 'awaiting_acceptance', message: '已提交服务完成，等待客户验收' });
    }

    return Response.json({ message: '未知技术人员操作' }, { status: 400 });
  } catch (error) {
    console.error('技术人员工作台操作失败', error);
    const message = error instanceof Error ? error.message : '';
    if (/technical_service_logs|technical_service_reviews|provider_completed_at|customer_accepted_at|doesn't exist|does not exist|unknown column|no such table/i.test(message)) {
      return Response.json({ message: '技术人员工作台尚未初始化，请先执行 sql/yxshop-technician-workbench-V1.5.sql' }, { status: 503 });
    }
    return Response.json({ message: '操作失败，请稍后重试' }, { status: 500 });
  }
}
