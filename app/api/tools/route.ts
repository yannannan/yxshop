import { getPublishedTools } from '@/lib/tool-service-data';

export async function GET() {
  const started = Date.now();
  const headers = () => ({ 'Cache-Control': 'no-store', 'Server-Timing': `tools;dur=${Date.now() - started}` });
  try { const tools = await getPublishedTools(); return Response.json(tools, { headers: headers() }); }
  catch (error) {
    console.error('工具列表读取失败', error);
    return Response.json({ message: '工具服务尚未就绪，请稍后重试' }, { status: 503, headers: headers() });
  }
}
