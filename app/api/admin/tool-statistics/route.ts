import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { readToolAnalytics } from '@/lib/tool-analytics-service';
export async function GET(request: Request) {
  const admin = await getAdminContext(request); if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  const period = new URL(request.url).searchParams.get('period') || 'all';
  if (!['all', 'today', '7', '30'].includes(period)) return Response.json({ message: '统计周期不正确' }, { status: 400 });
  try { return Response.json(await readToolAnalytics(period), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { console.error('工具统计读取失败', error); return Response.json({ message: '工具统计暂不可用，请查看服务端日志' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }); }
}
