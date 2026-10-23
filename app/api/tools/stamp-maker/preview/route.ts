import { parseStampOptions } from '@/lib/stamp-options';
import { renderStamp } from '@/lib/stamp-renderer';
import { getStampTool, StampError } from '@/lib/stamp-service';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (Number(request.headers.get('content-length') || 0) > 8192) return Response.json({ message: '参数过大' }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 8192) return Response.json({ message: '参数过大' }, { status: 413, headers });
    let options;
    try { options = parseStampOptions(JSON.parse(raw)); }
    catch (error) { return Response.json({ message: error instanceof SyntaxError ? '预览参数格式不正确' : (error as Error).message }, { status: 400, headers }); }
    await getStampTool();
    const png = await renderStamp(options, true);
    return new Response(new Uint8Array(png), { headers: { ...headers, 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (error instanceof StampError) return Response.json({ message: error.message }, { status: error.status, headers });
    console.error('印章预览失败', error);
    return Response.json({ message: '预览暂不可用，请稍后重试。预览不会扣次。' }, { status: 503, headers });
  }
}
