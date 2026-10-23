import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { VideoError, videoTaskId } from '@/lib/video-options';
import { videoDownloadFile, videoUser } from '@/lib/video-service';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await videoUser(request), params = new URL(request.url).searchParams, id = params.get('id');
    if (!user) throw new VideoError('请登录后下载自己的视频', 401);
    if (!videoTaskId(id)) throw new VideoError('视频记录不存在', 404);
    const { path, size, task } = await videoDownloadFile(user.id, id.toLowerCase());
    let start = 0, end = size - 1;
    const range = request.headers.get('range');
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match || !match[1] && !match[2]) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(size - 1, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const name = `${task.title.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '-').slice(0, 100) || 'video'}.${task.file_extension}`;
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'Content-Type': task.file_extension === 'webm' ? 'video/webm' : task.file_extension === 'mov' ? 'video/quicktime' : 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Disposition': `${params.get('inline') === '1' ? 'inline' : 'attachment'}; filename="yxstar-video.${task.file_extension}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)}`, 'X-Content-Type-Options': 'nosniff' };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    const stream = createReadStream(path, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    return Response.json({ message: error instanceof VideoError ? error.message : '视频读取失败，请稍后重试' }, { status: error instanceof VideoError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
