import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, open, stat, unlink } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { videoResponse, videoResponseBytes, videoUrlAddress, videoRequestHeaders } from './video-network';
import { isKuaishouPage, kuaishouVideoSources } from './video-kuaishou';
import { douyinCanonicalUrl, douyinVideoId, douyinPageVideo, haokanPageVideo, isDouyinPage, isHaokanPage, publicVideoPageUserAgent, type PublicVideoPage } from './video-public-pages';
import { VideoError, videoTaskId, type VideoFormat, type VideoInfo } from './video-options';
import { openVideoProxy } from './video-proxy';
import { inspectBrowserVideo, videoBrowserExecutable } from './video-browser';
import { hlsVariants, hlsSegments, hlsMediaHeader } from './video-hls';

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
export async function videoEngineHealth() { const [engineReady, mergeReady, browser] = await Promise.all([executable(enginePath()), executable(mergePath()), videoBrowserExecutable()]); return { engineReady, mergeReady, browserReady: Boolean(browser) && process.env.VIDEO_BROWSER_ENABLED !== '0', maxSizeMb: videoMaxBytes() / 1024 ** 2 }; }
const platforms = ['douyin.com', 'iesdouyin.com', 'kuaishou.com', 'chenzhongtech.com', 'gifshow.com', 'xiaohongshu.com', 'xhslink.com', 'bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be', 'tiktok.com', 'vimeo.com', 'facebook.com', 'fb.watch', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'weibo.com', 'weibo.cn', 'dailymotion.com'];
export const videoPlatform = (host: string) => isDouyinPage(host) || isHaokanPage(host) || platforms.some(domain => host === domain || host.endsWith(`.${domain}`));
export async function platformVideoUrl(raw: string) {
  const url = new URL(raw);
  if (/(^|\.)facebook\.com$/.test(url.hostname) && /^\/(?:l\.php|flx\/warn)/.test(url.pathname)) throw new VideoError('请粘贴 Facebook 视频本身的分享链接，而非外部跳转链接');
  if (['b23.tv', 'youtu.be', 'fb.watch', 'xhslink.com', 'v.douyin.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    // 分享短链常由通用提取器跳转；我们自行安全解开，再交给指定平台规则。
    const resolved = await videoResponse(raw, { 'User-Agent': publicVideoPageUserAgent }, 0, 8000); resolved.response.destroy();
    if (!videoPlatform(new URL(resolved.url).hostname)) throw new VideoError('分享链接跳转到了不支持的平台，请复制原视频链接', 422);
    return isDouyinPage(new URL(resolved.url).hostname) ? douyinCanonicalUrl(resolved.url) || resolved.url : resolved.url;
  }
  return isDouyinPage(url.hostname) ? douyinCanonicalUrl(raw) || raw : raw;
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
  if (/mpegurl/.test(contentType) || /\.m3u8(?:[?#]|$)/i.test(url)) { response.destroy(); const full = await videoResponse(url, headers, 0, 8000); return { html: '', url: full.url, size: 0, extension: null, hls: (await videoResponseBytes(full.response, 1024 ** 2)).toString('utf8') }; }
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) return { html: (await videoResponseBytes(response, 2 * 1024 ** 2)).toString('utf8'), url, size: 0, extension: null };
  const size = number(response.headers['content-range']?.match(/\/(\d+)$/)?.[1]) || number(response.headers['content-length']);
  const chunks: Buffer[] = [];
  try { for await (const chunk of response) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length >= 32) break; } } finally { response.destroy(); }
  return { html: '', url, size, extension: videoFileExtension(Buffer.concat(chunks)) };
}
export function engineFormats(metadata: Record<string, unknown>, mergeReady: boolean): VideoFormat[] {
  const rows = (Array.isArray(metadata.formats) ? metadata.formats : [metadata]).filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  const protocols = ['http', 'https', 'm3u8', 'm3u8_native'];
  const audio = rows.filter(item => !item.has_drm && ['m4a', 'mp4', 'webm'].includes(String(item.ext)) && item.vcodec === 'none' && item.acodec && item.acodec !== 'none' && /^https?:\/\//.test(String(item.url)) && protocols.includes(String(item.protocol || 'https'))).sort((a, b) => Number(b.ext === 'm4a') - Number(a.ext === 'm4a') || number(b.abr) - number(a.abr))[0];
  const result: VideoFormat[] = [];
  for (const row of rows) {
    if (row.has_drm || row.vcodec === 'none' || !/^https?:\/\//.test(String(row.url)) || !protocols.includes(String(row.protocol || 'https')) || !['mp4', 'webm', 'mov'].includes(String(row.ext))) continue;
    if (String(row.protocol).startsWith('m3u8') && (!mergeReady || row.ext !== 'mp4')) continue;
    const separated = row.acodec === 'none';
    if (separated && (!mergeReady || !audio)) continue;
    if (separated && row.ext === 'webm' && !['opus', 'vorbis'].includes(String(audio?.acodec))) continue;
    const parts = [row, ...(separated ? [audio!] : [])].map(item => ({ url: String(item.url), headers: videoRequestHeaders(item.http_headers || metadata.http_headers), extension: clean(item.ext, 8) || 'mp4', ...(String(item.protocol).startsWith('m3u8') ? { playlist: 'hls' as const } : {}) }));
    const height = number(row.height), extension = String(row.ext) as VideoFormat['extension'];
    const size = number(row.filesize || row.filesize_approx) + (separated ? number(audio?.filesize || audio?.filesize_approx) : 0);
    if (size > videoMaxBytes()) continue;
    const id = `format-${result.length}`;
    result.push({ id, extension, height, size, label: `${height ? `${height}p` : '原始画质'} · ${extension.toUpperCase()}${separated ? ' · 含音频合并' : ''}`, parts });
  }
  return result.sort((a, b) => b.height - a.height || a.size - b.size).slice(0, 12);
}
async function hlsFormats(text: string, url: string, headers: Record<string, string>): Promise<VideoFormat[]> {
  if (!await executable(mergePath())) throw new VideoError('此视频需要转换播放分段，请管理员先配置 FFmpeg', 503);
  const variants = hlsVariants(text, url);
  if (!variants.length) { hlsSegments(text, url); return [{ id: 'hls-0', label: '原始画质 · MP4', extension: 'mp4', height: 0, size: 0, parts: [{ url, headers, extension: 'mp4', playlist: 'hls' }] }]; }
  return variants.map((variant, index) => ({ id: `hls-${index}`, label: variant.label, extension: 'mp4', height: variant.height, size: 0, parts: [{ url: variant.url, headers, extension: 'mp4', playlist: 'hls' }, ...(variant.audio ? [{ url: variant.audio, headers, extension: 'm4a', playlist: 'hls' as const }] : [])] }));
}
async function browserVideo(source: string, started: number, diagnostics = false): Promise<VideoInfo | null> {
  const remaining = 55000 - (Date.now() - started);
  if (diagnostics) console.error(`[视频解析诊断] 网页引擎剩余总预算 ${Math.max(0, remaining)}ms，作品编号 ${douyinVideoId(source) || '非抖音编号链接'}`);
  if (remaining < 3000) return null;
  const result = await inspectBrowserVideo(source, Math.min(24000, remaining), diagnostics);
  if (diagnostics) console.error(`[视频解析诊断] 网页引擎返回 ${result ? `媒体候选 ${result.page.media.length} 个，请求候选 ${result.urls.length} 个` : '空结果'}`);
  if (!result) return null;
  const found = await pageVideo(result.page, source, result.referer, result.userAgent, diagnostics);
  if (found) return found;
  for (const url of result.urls) {
    try {
      const headers = { Referer: result.referer, 'User-Agent': result.userAgent }, file = await probe(url, headers);
      const formats = file.hls ? await hlsFormats(file.hls, file.url, headers) : file.extension && file.size <= videoMaxBytes() ? [{ id: 'browser-0', label: `原始画质 · ${file.extension.toUpperCase()}`, extension: file.extension, size: file.size, height: 0, parts: [{ url: file.url, headers, extension: file.extension }] }] : [];
      if (formats.length) return { title: clean(result.page.title) || '网页视频', thumbnail: result.page.thumbnail, duration: result.page.duration, sourceUrl: source, source: new URL(source).hostname, formats };
    } catch (error) { if (error instanceof VideoError && /加密|直播/.test(error.message)) throw error; }
  }
  return null;
}
async function nativeVideo(source: string, platformUrl: string, started: number, fast = false): Promise<VideoInfo> {
  const health = await videoEngineHealth();
  if (!health.engineReady) throw new VideoError('平台解析引擎尚未安装，请管理员完成视频引擎安装', 503);
  const proxy = await openVideoProxy();
  try {
    const { stdout } = await execute(enginePath(), ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-remote-components', '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`, '--proxy', proxy.url, '--geo-verification-proxy', proxy.url, '--no-playlist', '--playlist-items', '1', '--dump-single-json', '--skip-download', '--no-warnings', '--socket-timeout', '10', '--retries', '0', '--extractor-retries', '0', '--use-extractors', 'default', '--', platformUrl], { timeout: Math.min(fast ? 18000 : 40000, Math.max(1000, 53000 - (Date.now() - started))), maxBuffer: 2 * 1024 ** 2, windowsHide: true, cwd: process.cwd() });
    const metadata = JSON.parse(stdout) as Record<string, unknown>;
    if (metadata.is_live || metadata.live_status === 'is_live' || number(metadata.duration) > 3600 || metadata._type === 'playlist') throw new VideoError('暂不支持直播、合集或超过 60 分钟的视频', 422);
    const formats = engineFormats(metadata, health.mergeReady);
    if (!formats.length) {
      if (!health.mergeReady && engineFormats(metadata, true).length) throw new VideoError('此视频需要音视频合并或分段转换，服务器尚未配置 FFmpeg，请管理员先安装合并组件', 503);
      throw new VideoError('没有找到可提取的公开视频文件，请换一个链接或稍后重试', 422);
    }
    for (const format of formats) for (const part of format.parts) await videoUrlAddress(part.url);
    return { title: clean(metadata.title) || '链接视频', source: new URL(source).hostname, sourceUrl: source, duration: number(metadata.duration), thumbnail: clean(metadata.thumbnail, 4096), formats };
  } finally { await proxy.close(); }
}
async function publicPage(raw: string) {
  const { response, url } = await videoResponse(raw, { 'User-Agent': publicVideoPageUserAgent }, 0, 12000);
  if (!isDouyinPage(new URL(url).hostname) && !isHaokanPage(new URL(url).hostname)) { response.destroy(); throw new VideoError('分享页跳转到了不支持的平台', 422); }
  return { html: (await videoResponseBytes(response, 2 * 1024 ** 2)).toString('utf8'), url };
}
async function pageVideo(info: PublicVideoPage, sourceUrl: string, referer: string, userAgent = publicVideoPageUserAgent, diagnostics = false): Promise<VideoInfo | null> {
  if (info.imagePost) throw new VideoError('这是抖音图文作品，当前工具只提取视频，暂不支持图文转视频', 422);
  if (info.duration > 3600) throw new VideoError('暂不支持超过 60 分钟的视频', 422);
  const formats: VideoFormat[] = [];
  const started = Date.now();
  for (const item of info.media) {
    if (Date.now() - started > 20000) break;
    if (item.size > videoMaxBytes()) continue;
    try {
      const found = await probe(item.url, { Referer: referer, 'User-Agent': userAgent });
      if (found.extension && found.size <= videoMaxBytes()) formats.push({ id: `page-${formats.length}`, label: `${item.label} · ${found.extension.toUpperCase()}`, extension: found.extension, height: item.height, size: found.size || item.size, parts: [{ url: found.url, headers: { Referer: referer, 'User-Agent': userAgent }, extension: found.extension }] });
    } catch (error) {
      // 只输出已知本地错误或错误类型，不打印源站签名地址和请求头。
      if (diagnostics) console.error('[视频解析诊断] 媒体探测失败', error instanceof VideoError ? error.message : (error as Error).name);
    }
  }
  return formats.length ? { title: clean(info.title) || '分享视频', source: new URL(sourceUrl).hostname, sourceUrl, duration: info.duration, thumbnail: info.thumbnail, formats: formats.sort((a, b) => b.height - a.height) } : null;
}
export async function inspectVideo(sourceUrl: string, embedded = false, diagnostics = false): Promise<VideoInfo> {
  const started = Date.now();
  await videoUrlAddress(sourceUrl);
  const haokan = isHaokanPage(new URL(sourceUrl).hostname), douyin = isDouyinPage(new URL(sourceUrl).hostname);
  let publicSource = sourceUrl;
  if (haokan || douyin) {
    try {
      const id = douyin ? douyinVideoId(sourceUrl) : '';
      const page = await publicPage(id ? `https://www.iesdouyin.com/share/video/${id}/` : sourceUrl);
      publicSource = page.url;
      const info = haokan ? haokanPageVideo(page.html, page.url) : douyinPageVideo(page.html, page.url);
      if (diagnostics) console.error(`[视频解析诊断] 公开页：作品编号 ${douyinVideoId(page.url) || '无'}，HTML ${page.html.length} 字符，媒体 ${info.media.length} 个`);
      const found = await pageVideo(info, sourceUrl, page.url, publicVideoPageUserAgent, diagnostics);
      if (found) return found;
    } catch (error) {
      if (diagnostics) console.error('[视频解析诊断] 公开页未提供可用媒体', error instanceof VideoError ? error.message : (error as Error).name);
      if (haokan || error instanceof VideoError && /图文|60 分钟/.test(error.message)) throw error;
    }
    if (douyin) {
      const url = await platformVideoUrl(publicSource);
      const found = await browserVideo(url, started, diagnostics); if (found) return { ...found, sourceUrl, source: new URL(sourceUrl).hostname };
    }
  }
  const kuaishou = isKuaishouPage(new URL(sourceUrl).hostname);
  if (!kuaishou && videoPlatform(new URL(sourceUrl).hostname)) {
    const platformUrl = await platformVideoUrl(publicSource);
    try {
      return await nativeVideo(sourceUrl, platformUrl, started, Boolean(await videoBrowserExecutable()));
    } catch (error) {
      if (diagnostics) console.error('[视频解析诊断] 平台程序未返回结果', (error as Error).name || 'Error');
      if (error instanceof VideoError && /FFmpeg|直播|60 分钟/.test(error.message)) throw error;
      if (!douyin) { const found = await browserVideo(sourceUrl, started); if (found) return found; }
      const reason = String((error as { stderr?: string }).stderr || '');
      if (douyin) throw new VideoError(/Unsupported URL/i.test(reason) ? '抖音分享链接未识别到视频编号，请重新复制完整分享链接' : '抖音当前未返回可读取的视频源，请确认作品公开；管理员可检查网页解析引擎是否就绪', 422);
      if (error instanceof VideoError) throw error;
      throw new VideoError(/timed? ?out|ETIMEDOUT|socket/i.test(reason) ? '视频平台连接超时，请稍后重试' : '平台未返回可提取的视频，可能存在访问校验或链接已失效', 422);
    }
  }
  let first: Awaited<ReturnType<typeof probe>>;
  try { first = await probe(sourceUrl); }
  catch (error) {
    try { return await nativeVideo(sourceUrl, sourceUrl, started, true); } catch (nativeError) { if (nativeError instanceof VideoError && /FFmpeg|直播|60 分钟/.test(nativeError.message)) throw nativeError; }
    const found = await browserVideo(sourceUrl, started); if (found) return found;
    throw error;
  }
  let title = decode(new URL(first.url).pathname.split('/').pop() || '链接视频'), thumbnail = '', duration = 0, formats: VideoFormat[] = [];
  if (first.hls) formats = await hlsFormats(first.hls, first.url, {});
  else if (first.extension && first.size <= videoMaxBytes()) formats = [{ id: 'direct', label: `原始文件 · ${first.extension.toUpperCase()}`, extension: first.extension, height: 0, size: first.size, parts: [{ url: first.url, headers: {}, extension: first.extension }] }];
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
        if (found.hls) formats.push(...await hlsFormats(found.hls, found.url, { Referer: first.url }));
        else if (found.extension && found.size <= videoMaxBytes()) formats.push({ id: `web-${formats.length}`, label: `网页视频 ${formats.length + 1} · ${found.extension.toUpperCase()}`, extension: found.extension, height: 0, size: found.size, parts: [{ url: found.url, headers: { Referer: first.url }, extension: found.extension }] });
      } catch { /* 某个网页候选不可用时继续其他公开候选。 */ }
    }
    if (!formats.length && !embedded && Date.now() - started < 8000) for (const tag of first.html.match(/<iframe\b[^>]{0,8192}>/gi) || []) {
      try {
        const frame = new URL(attribute(tag, 'src'), first.url);
        if (videoPlatform(frame.hostname)) return inspectVideo(frame.href, true);
      } catch { /* 只接续已支持平台的嵌入视频，不递归浏览任意网页。 */ }
    }
  }
  if (!formats.length) {
    try { return await nativeVideo(sourceUrl, first.url, started, true); } catch (error) { if (error instanceof VideoError && /FFmpeg|直播|60 分钟/.test(error.message)) throw error; }
    const found = await browserVideo(sourceUrl, started); if (found) return found;
    throw new VideoError(kuaishou ? '快手未返回可读取的公开视频，请确认链接有效且作品公开' : '未找到可提取的视频，请确认页面包含公开且未加密的视频', 422);
  }
  formats = formats.slice(0, 12).map((format, index) => ({ ...format, id: `web-${index}` }));
  return { title: clean(title), source: new URL(first.url).hostname, sourceUrl, duration, thumbnail, formats };
}

export async function materializeVideo(id: string, format: VideoFormat, progress: (value: number) => void) {
  const directory = videoTaskDirectory(id); await mkdir(directory, { recursive: true });
  const output = join(directory, `result.${format.extension}`), temporary: string[] = [];
  let received = 0;
  const deadline = Date.now() + 180000;
  try {
    for (const [index, part] of format.parts.entries()) {
      const path = join(directory, `part-${index}.media`); temporary.push(path);
      let sources: { url: string; range?: { start: number; end: number } }[] = [{ url: part.url }];
      if (part.playlist === 'hls') {
        if (!await executable(mergePath())) throw new VideoError('此视频需要 FFmpeg 转换，请管理员先安装合并组件', 503);
        const playlist = await videoResponse(part.url, part.headers, 0, 10000);
        sources = hlsSegments((await videoResponseBytes(playlist.response, 1024 ** 2)).toString('utf8'), playlist.url).parts;
      }
      for (const [segment, source] of sources.entries()) {
      const remaining = deadline - Date.now(); if (remaining <= 0) throw new VideoError('视频提取超时，请稍后重试', 504);
      const { response } = await videoResponse(source.url, { ...part.headers, ...(source.range ? { Range: `bytes=${source.range.start}-${source.range.end}` } : {}) }, 0, remaining);
      if (source.range && (response.statusCode !== 206 || String(response.headers['content-range']).split('/')[0] !== `bytes ${source.range.start}-${source.range.end}`)) { response.destroy(); throw new VideoError('视频站点未返回请求的分段范围', 422); }
      if (number(response.headers['content-length']) + received > videoMaxBytes()) { response.destroy(); throw new VideoError('视频文件超过单次大小限制，请选择较低清晰度', 413); }
      let segmentBytes = 0;
      const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length; segmentBytes += chunk.length;
        if (received > videoMaxBytes()) { callback(new VideoError('视频文件超过单次大小限制', 413)); return; }
        progress(format.size ? Math.min(90, Math.floor(received / format.size * 90)) : Math.min(85, 10 + Math.floor(received / videoMaxBytes() * 70)));
        callback(null, chunk);
      } });
      const timer = setTimeout(() => response.destroy(new VideoError('视频提取超时，请稍后重试', 504)), remaining);
      try { await pipeline(response, meter, createWriteStream(path, { flags: segment ? 'a' : 'wx' })); } finally { clearTimeout(timer); }
      if (source.range && segmentBytes !== source.range.end - source.range.start + 1) throw new VideoError('视频分段数据长度不正确，请稍后重试', 422);
      }
      // 输入只能是媒体容器，不能让 FFmpeg 将网页或播放列表当成本地文件清单读取。
      const partFile = await open(path, 'r');
      try { const header = Buffer.alloc(512); await partFile.read(header, 0, 512, 0); if (!videoFileExtension(header) && !(part.playlist === 'hls' && hlsMediaHeader(header))) throw new VideoError('站点返回的不是有效视频文件，请换一个链接', 422); } finally { await partFile.close(); }
    }
    if (format.parts.length > 1 || format.parts.some(part => part.playlist === 'hls')) {
      if (!await executable(mergePath())) throw new VideoError('当前画质暂不能生成，请选择其他画质', 503);
      try { await execute(mergePath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', temporary[0], ...(format.parts.length > 1 ? ['-protocol_whitelist', 'file,pipe', '-i', temporary[1], '-map', '0:v:0', '-map', '1:a:0'] : ['-map', '0:v:0', '-map', '0:a:0?']), '-c', 'copy', ...(format.extension === 'mp4' ? ['-movflags', '+faststart'] : []), output], { timeout: 60000, maxBuffer: 256000, windowsHide: true }); }
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
