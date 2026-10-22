import { getPublishedTools } from '@/lib/tool-service-data';

export async function GET() {
  try { return Response.json(await getPublishedTools(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    console.error('工具列表读取失败', error);
    return Response.json({ message: '工具服务尚未就绪，请稍后重试' }, { status: 503 });
  }
}
