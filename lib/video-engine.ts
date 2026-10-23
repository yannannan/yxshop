import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, open, stat, unlink } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { videoResponse, videoResponseBytes, videoUrlAddress, videoRequestHeaders } from './video-network';
import { isKuaishouPage, kuaishouVideoSources } from './video-kuaishou';
import { VideoError, videoTaskId, type VideoFormat, type VideoInfo } from './video-options';

const execute = promisify(execFile);
export const videoMaxBytes = () => Math.max(20, Math.min(1024, Number(process.env.VIDEO_MAX_FILE_MB) || 200)) * 1024 ** 2;
const enginePath = () => resolve(process.env.VIDEO_YTDLP_PATH || join(process.cwd(), 'vendor/video-engine', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'));
const mergePath = () => resolve(process.env.VIDEO_FFMPEG_PATH || join(process.cwd(), 'vendor/video-engine', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
export const videoStorage = () => resolve(process.cwd(), 'uploads/video-extractions');
export function videoTaskDirectory(id: string) {
  if (!videoTaskId(id)) throw new VideoError('视频任务编号不正确');
  return join(videoStorage(), id);
}
async function executable(path: string) { try { await access(path, constants.X_OK); return (await stat(path)).isFile(); } catch { return false; } }
export async function videoEngineHealth() { const [engineReady, mergeReady] = await Promise.all([executable(enginePath()), executable(mergePath())]); return { engineReady, mergeReady, maxSizeMb: videoMaxBytes() / 1024 ** 2 }; }
const platforms = ['douyin.com', 'iesdouyin.com', 'kuaishou.com', 'chenzhongtech.com', 'gifshow.com', 'xiaohongshu.com', 'xhslink.com', 'bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be', 'tiktok.com', 'vimeo.com', 'facebook.com', 'fb.watch', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'weibo.com', 'weibo.cn', 'dailymotion.com'];
export const videoPlatform = (host: string) => platforms.some(domain => host === domain || host.endsWith(`.${domain}`));
export async function platformVideoUrl(raw: string) {
  const url = new URL(raw);
  if (/(^|\.)facebook\.com$/.test(url.hostname) && /^\/(?:l\.php|flx\/warn)/.test(url.pathname)) throw new VideoError('请粘贴 Facebook 视频本身的分享链接，而非外部跳转链接');
  if (['b23.tv', 'youtu.be', 'fb.watch', 'xhslink.com', 'v.douyin.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    // 分享短链常由通用提取器跳转；我们自行安全解开，再交给指定平台规则。
    const resolved = await videoResponse(raw, {}, 0, 8000); resolved.response.destroy();
    if (!videoPlatform(new URL(resolved.url).hostname)) throw new VideoError('分享链接跳转到了不支持的平台，请复制原视频链接', 422);
    return resolved.url;
  }
  return raw;
}
const number = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const clean = (value: unknown, length = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').slice(0, length) : '';
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => { const n = Number(code); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; });
function attribute(tag: string, name: string) { const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return decode(match?.[1] || match?.[2] || match?.[3] || ''); }
export function htmlVideoSources(html: string, source: string) {
  const urls: string[] = []; let title = decode(html.match(/<title[^>]*>([^<]{1,500})<\/title>/i)?.[1] || '网页视频'), thumbnail = '';
  for (const tag of html.match(/<(?:video|source|meta)\b[^>]{0,8192}>/gi) || []) {
    const property = attribute(tag, 'property') || attribute(tag, 'name');
    if (/^og:video(?::(?:url|secure_url))?$/.test(property)) urls.push(attribute(tag, 'content'));
    if (property === 'og:title') title = attribute(tag, 'content') || title;
    if (property === 'og:image') thumbnail = attribute(tag, 'content');
    if (/^<(?:video|source)\b/i.test(tag)) urls.push(attribute(tag, 'src'));
    if (/^<video\b/i.test(tag)) thumbnail ||= attribute(tag, 'poster');
  }
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const queue: unknown[] = [JSON.parse(script[1])]; let visited = 0;
      while (queue.length && visited++ < 200) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        const node = item as Record<string, unknown>;
        if (node['@type'] === 'VideoObject' || Array.isArray(node['@type']) && node['@type'].includes('VideoObject')) {
          if (typeof node.contentUrl === 'string') urls.push(node.contentUrl);
          title = clean(node.name) || title; thumbnail ||= clean(Array.isArray(node.thumbnailUrl) ? node.thumbnailUrl[0] : node.thumbnailUrl, 4096);
        }
        queue.push(...Object.values(node).filter(value => value && typeof value === 'object'));
      }
    } catch { /* 非法结构化数据不执行，也不影响普通 HTML5 视频源。 */ }
  }
  try { thumbnail = thumbnail ? new URL(thumbnail, source).href : ''; } catch { thumbnail = ''; }
  return { title: clean(title), thumbnail, urls: [...new Set(urls.filter(Boolean).map(raw => { try { return new URL(raw, source).href; } catch { return ''; } }).filter(Boolean))].slice(0, 8) };
}
export function videoFileExtension(bytes: Buffer): 'mp4' | 'webm' | 'mov' | null {
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return bytes.toString('ascii', 8, 12) === 'qt  ' ? 'mov' : 'mp4';
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}
async function probe(raw: string, headers: Record<string, string> = {}) {
  const { response, url } = await videoResponse(raw, { ...headers, Range: 'bytes=0-65535' }, 0, 8000);
  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) return { html: (await videoResponseBytes(response, 2 * 1024 ** 2)).toString('utf8'), url, size: 0, extension: null };
  const size = number(response.headers['content-range']?.match(/\/(\d+)$/)?.[1]) || number(response.headers['content-length']);
  const chunks: Buffer[] = [];
  try { for await (const chunk of response) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length >= 32) break; } } finally { response.destroy(); }
  return { html: '', url, size, extension: videoFileExtension(Buffer.concat(chunks)) };
}
export function engineFormats(metadata: Record<string, unknown>, mergeReady: boolean): VideoFormat[] {
  const rows = (Array.isArray(metadata.formats) ? metadata.formats : [metadata]).filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  const audio = rows.filter(item => !item.has_drm && ['m4a', 'mp4', 'webm'].includes(String(item.ext)) && item.vcodec === 'none' && item.acodec && item.acodec !== 'none' && /^https?:\/\//.test(String(item.url)) && ['http', 'https'].includes(String(item.protocol || 'https'))).sort((a, b) => Number(b.ext === 'm4a') - Number(a.ext === 'm4a') || number(b.abr) - number(a.abr))[0];
  const result: VideoFormat[] = [];
  for (const row of rows) {
    if (row.has_drm || row.vcodec === 'none' || !/^https?:\/\//.test(String(row.url)) || !['http', 'https'].includes(String(row.protocol || 'https')) || !['mp4', 'webm', 'mov'].includes(String(row.ext))) continue;
    const separated = row.acodec === 'none';
    if (separated && (!mergeReady || !audio)) continue;
    if (separated && row.ext === 'webm' && !['opus', 'vorbis'].includes(String(audio?.acodec))) continue;
    const parts = [row, ...(separated ? [audio!] : [])].map(item => ({ url: String(item.url), headers: videoRequestHeaders(item.http_headers || metadata.http_headers), extension: clean(item.ext, 8) || 'mp4' }));
    const height = number(row.height), extension = String(row.ext) as VideoFormat['extension'];
    const size = number(row.filesize || row.filesize_approx) + (separated ? number(audio?.filesize || audio?.filesize_approx) : 0);
    if (size > videoMaxBytes()) continue;
    const id = `format-${result.length}`;
    result.push({ id, extension, height, size, label: `${height ? `${height}p` : '原始画质'} · ${extension.toUpperCase()}${separated ? ' · 含音频合并' : ''}`, parts });
  }
  return result.sort((a, b) => b.height - a.height || a.size - b.size).slice(0, 12);
}
export async function inspectVideo(sourceUrl: string, embedded = false): Promise<VideoInfo> {
  const started = Date.now();
  await videoUrlAddress(sourceUrl);
  const kuaishou = isKuaishouPage(new URL(sourceUrl).hostname);
  if (!kuaishou && videoPlatform(new URL(sourceUrl).hostname)) {
    const health = await videoEngineHealth();
    if (!health.engineReady) throw new VideoError('该平台解析暂未开放，可尝试视频直链或稍后重试', 503);
    let metadata: Record<string, unknown>;
    const platformUrl = await platformVideoUrl(sourceUrl);
    try {
      const { stdout } = await execute(enginePath(), ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-remote-components', '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`, '--no-playlist', '--playlist-items', '1', '--dump-single-json', '--skip-download', '--no-warnings', '--socket-timeout', '12', '--retries', '1', '--extractor-retries', '1', '--use-extractors', 'default,-generic', '--', platformUrl], { timeout: 45000, maxBuffer: 2 * 1024 ** 2, windowsHide: true, cwd: process.cwd() });
      metadata = JSON.parse(stdout);
    } catch { throw new VideoError('当前链接未能解析，可能需要站点登录、验证或暂不支持，请换一个公开链接重试', 422); }
    if (metadata.is_live || metadata.live_status === 'is_live' || number(metadata.duration) > 3600 || metadata._type === 'playlist') throw new VideoError('暂不支持直播、合集或超过 60 分钟的视频', 422);
    const formats = engineFormats(metadata, health.mergeReady);
    if (!formats.length) {
      if (!health.mergeReady && engineFormats(metadata, true).length) throw new VideoError('此视频的音频和画面需要合并，服务器尚未配置 FFmpeg，请管理员先安装合并组件', 503);
      throw new VideoError('没有找到可提取的公开视频文件，请换一个链接或稍后重试', 422);
    }
    for (const format of formats) for (const part of format.parts) await videoUrlAddress(part.url);
    return { title: clean(metadata.title) || '链接视频', source: new URL(sourceUrl).hostname, sourceUrl, duration: number(metadata.duration), thumbnail: clean(metadata.thumbnail, 4096), formats };
  }
  const first = await probe(sourceUrl);
  let title = decode(new URL(first.url).pathname.split('/').pop() || '链接视频'), thumbnail = '', duration = 0, formats: VideoFormat[] = [];
  if (first.extension && first.size <= videoMaxBytes()) formats = [{ id: 'direct', label: `原始文件 · ${first.extension.toUpperCase()}`, extension: first.extension, height: 0, size: first.size, parts: [{ url: first.url, headers: {}, extension: first.extension }] }];
  else if (first.html) {
    const parsed = htmlVideoSources(first.html, first.url); title = parsed.title; thumbnail = parsed.thumbnail;
    if (kuaishou && isKuaishouPage(new URL(first.url).hostname)) {
      const state = kuaishouVideoSources(first.html, first.url);
      parsed.urls = [...new Set([...state.urls, ...parsed.urls])].slice(0, 8);
      title = state.title || title; thumbnail = state.thumbnail || thumbnail; duration = state.duration;
      if (duration > 3600) throw new VideoError('暂不支持超过 60 分钟的视频', 422);
    }
    for (const raw of parsed.urls) {
      if (Date.now() - started > 32000) break;
      try {
        const found = await probe(raw, { Referer: first.url });
        if (found.extension && found.size <= videoMaxBytes()) formats.push({ id: `web-${formats.length}`, label: `网页视频 ${formats.length + 1} · ${found.extension.toUpperCase()}`, extension: found.extension, height: 0, size: found.size, parts: [{ url: found.url, headers: { Referer: first.url }, extension: found.extension }] });
      } catch { /* 某个网页候选不可用时继续其他公开候选。 */ }
    }
    if (!formats.length && !embedded && Date.now() - started < 8000) for (const tag of first.html.match(/<iframe\b[^>]{0,8192}>/gi) || []) {
      try {
        const frame = new URL(attribute(tag, 'src'), first.url);
        if (videoPlatform(frame.hostname)) return inspectVideo(frame.href, true);
      } catch { /* 只接续已支持平台的嵌入视频，不递归浏览任意网页。 */ }
    }
  }
  if (!formats.length) throw new VideoError(kuaishou ? '快手分享页未返回可读取的视频，可能需要登录或验证，请换一个公开视频链接' : '未找到可直接提取的视频，支持公开 MP4 / WebM / MOV 直链及包含视频源的网页', 422);
  return { title: clean(title), source: new URL(first.url).hostname, sourceUrl, duration, thumbnail, formats };
}

export async function materializeVideo(id: string, format: VideoFormat, progress: (value: number) => void) {
  const directory = videoTaskDirectory(id); await mkdir(directory, { recursive: true });
  const output = join(directory, `result.${format.extension}`), temporary: string[] = [];
  let received = 0;
  try {
    for (const [index, part] of format.parts.entries()) {
      const path = join(directory, `part-${index}.media`); temporary.push(path);
      const { response } = await videoResponse(part.url, part.headers);
      if (number(response.headers['content-length']) + received > videoMaxBytes()) { response.destroy(); throw new VideoError('视频文件超过单次大小限制，请选择较低清晰度', 413); }
      const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > videoMaxBytes()) { callback(new VideoError('视频文件超过单次大小限制', 413)); return; }
        progress(format.size ? Math.min(90, Math.floor(received / format.size * 90)) : Math.min(85, 10 + Math.floor(received / videoMaxBytes() * 70)));
        callback(null, chunk);
      } });
      const timer = setTimeout(() => response.destroy(new VideoError('视频提取超时，请稍后重试', 504)), 180000);
      try { await pipeline(response, meter, createWriteStream(path, { flags: 'wx' })); } finally { clearTimeout(timer); }
      // 输入只能是媒体容器，不能让 FFmpeg 将网页或播放列表当成本地文件清单读取。
      const partFile = await open(path, 'r');
      try { const header = Buffer.alloc(64); await partFile.read(header, 0, 64, 0); if (!videoFileExtension(header)) throw new VideoError('站点返回的不是有效视频文件，请换一个链接', 422); } finally { await partFile.close(); }
    }
    if (format.parts.length > 1) {
      if (!await executable(mergePath())) throw new VideoError('当前画质暂不能生成，请选择其他画质', 503);
      try { await execute(mergePath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', temporary[0], '-protocol_whitelist', 'file,pipe', '-i', temporary[1], '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', ...(format.extension === 'mp4' ? ['-movflags', '+faststart'] : []), output], { timeout: 60000, maxBuffer: 256000, windowsHide: true }); }
      catch { throw new VideoError('音视频合并失败，请选择其他画质后重试', 422); }
    } else {
      const { rename } = await import('node:fs/promises'); await rename(temporary[0], output);
    }
    const file = await open(output, 'r');
    try { const header = Buffer.alloc(64); await file.read(header, 0, 64, 0); if (!videoFileExtension(header)) throw new VideoError('站点返回的不是有效视频文件，请换一个链接', 422); } finally { await file.close(); }
    const size = (await stat(output)).size;
    if (!size || size > videoMaxBytes()) throw new VideoError('视频文件无效或超过大小限制', 413);
    return { size, path: output };
  } catch (error) { await unlink(output).catch(() => {}); throw error; }
  finally { await Promise.all(temporary.map(path => unlink(path).catch(() => {}))); }
}
