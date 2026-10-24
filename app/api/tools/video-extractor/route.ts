import { inspectVideo } from '@/lib/video-engine';
import { videoResponse, videoResponseBytes } from '@/lib/video-network';
import { VideoError, sharedVideoUrl, videoTaskId, type VideoInfo } from '@/lib/video-options';
import { beginVideoAnalysis, getVideoTool, queueVideoTask, readVideoTask, saveVideoPreview, videoAccess, videoPreviewLimit, videoPreviewRecord, videoUser } from '@/lib/video-service';
import { PointsError } from '@/lib/points-service';
import { VideoStorageError } from '@/lib/video-object-storage.mjs';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
async function requestText(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 16384) { await reader.cancel(); throw new VideoError('请求内容过大', 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
function failure(error: unknown) {
  if (error instanceof VideoError || error instanceof PointsError || error instanceof VideoStorageError) return Response.json({ message: error.message }, { status: error.status, headers });
  if (error instanceof SyntaxError) return Response.json({ message: '请求参数格式不正确' }, { status: 400, headers });
  const missing = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes((error as { code?: string }).code || '');
  console.error('视频提取服务失败', (error as { code?: string }).code || (error as Error).name);
  return Response.json({ message: missing ? '视频工具尚未初始化，请管理员执行 08 视频工具增量 SQL' : '视频工具暂不可用，请稍后重试', }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    const user = await videoUser(request), params = new URL(request.url).searchParams;
    const id = params.get('task'), cover = params.get('cover');
    if (id || cover) {
      if (!user) throw new VideoError('请登录后读取自己的视频记录', 401);
      if (!videoTaskId(id || cover)) throw new VideoError('视频记录不存在', 404);
      if (id) return Response.json({ task: await readVideoTask(user.id, id.toLowerCase()) }, { headers });
      const record = await videoPreviewRecord(user.id, cover!.toLowerCase());
      const metadata = JSON.parse(record.metadata_json) as VideoInfo;
      if (!metadata.thumbnail) throw new VideoError('没有视频封面', 404);
      const { response } = await videoResponse(metadata.thumbnail);
      const type = String(response.headers['content-type'] || '').split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) { response.destroy(); throw new VideoError('封面格式不可用', 422); }
      const bytes = await videoResponseBytes(response, 2 * 1024 ** 2);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } });
    }
    return Response.json(await videoAccess(await getVideoTool(), user, Number(params.get('page')) || 1), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 16384) throw new VideoError('请求内容过大', 413);
    const text = await requestText(request);
    if (text.length > 16384) throw new VideoError('请求内容过大', 413);
    const body = JSON.parse(text) as { action?: string; input?: string; id?: string; previewId?: string; formatId?: string };
    if (!body || typeof body !== 'object') throw new VideoError('请求内容不正确');
    const user = await videoUser(request);
    if (!user) throw new VideoError('请登录后解析和提取视频，解析不消耗权益', 401);
    const tool = await getVideoTool();
    if (body.action === 'analyze') {
      const url = sharedVideoUrl(body.input);
      const release = beginVideoAnalysis(user.id);
      try {
        await videoPreviewLimit(user.id);
        const metadata = await inspectVideo(url);
        return Response.json({ preview: await saveVideoPreview(user.id, tool, metadata) }, { headers });
      } finally { release(); }
    }
    if (body.action !== 'extract' || !videoTaskId(body.id) || !videoTaskId(body.previewId) || typeof body.formatId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(body.formatId)) throw new VideoError('请先解析链接并选择有效画质');
    const task = await queueVideoTask(user.id, tool, body.id.toLowerCase(), body.previewId.toLowerCase(), body.formatId);
    return Response.json({ task }, { status: task.status === 'ready' || task.status === 'failed' ? 200 : 202, headers });
  } catch (error) { return failure(error); }
}
