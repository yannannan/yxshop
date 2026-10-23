import { VideoError } from './video-options';

export type HlsPart = { url: string; range?: { start: number; end: number } };
const attrs = (line: string) => Object.fromEntries([...line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,\s]+)/g)].map(match => [match[1], match[2].replace(/^"|"$/g, '')]));
function address(raw: string, source: string) {
  const url = new URL(raw, source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new VideoError('播放列表包含不支持的资源地址', 422);
  return url.href;
}
function lines(text: string) {
  if (Buffer.byteLength(text) > 1024 ** 2 || !text.replace(/^\uFEFF/, '').startsWith('#EXTM3U')) throw new VideoError('视频播放列表格式不正确', 422);
  const result = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (result.some(line => /^#EXT-X-(?:SESSION-)?KEY:/.test(line) && attrs(line).METHOD !== 'NONE')) throw new VideoError('此视频使用加密播放列表，暂不支持提取', 422);
  if (result.some(line => /^#EXT-X-(?:DEFINE|SESSION-DATA|CONTENT-STEERING):/.test(line))) throw new VideoError('该视频播放列表暂不支持提取', 422);
  return result;
}
export function hlsVariants(text: string, source: string) {
  const rows = lines(text), formats: { url: string; height: number; label: string; audio?: string }[] = [];
  const audio = new Map<string, string>();
  for (const line of rows) if (line.startsWith('#EXT-X-MEDIA:')) { const row = attrs(line); if (row.TYPE === 'AUDIO' && row.URI && row['GROUP-ID'] && (!audio.has(row['GROUP-ID']) || row.DEFAULT === 'YES')) audio.set(row['GROUP-ID'], address(row.URI, source)); }
  for (let index = 0; index < rows.length; index++) if (rows[index].startsWith('#EXT-X-STREAM-INF:')) {
    const row = attrs(rows[index]), next = rows[index + 1]; if (!next || next.startsWith('#')) continue;
    const height = Number(row.RESOLUTION?.split('x')[1]) || 0;
    formats.push({ url: address(next, source), height, label: `${height ? `${height}p` : '原始画质'} · MP4`, ...(row.AUDIO && audio.has(row.AUDIO) ? { audio: audio.get(row.AUDIO) } : {}) });
    if (formats.length >= 12) break;
  }
  return formats.sort((a, b) => b.height - a.height);
}
export function hlsSegments(text: string, source: string) {
  const rows = lines(text);
  if (!rows.includes('#EXT-X-ENDLIST')) throw new VideoError('暂不支持正在直播或尚未结束的视频', 422);
  if (rows.some(line => line.startsWith('#EXT-X-STREAM-INF:'))) throw new VideoError('请选择具体视频画质后提取', 422);
  const parts: HlsPart[] = []; let duration = 0, pending = '', previous: HlsPart | undefined;
  const part = (raw: string, rawRange = '') => {
    const url = address(raw, source), match = rawRange.match(/^(\d+)(?:@(\d+))?$/);
    if (rawRange && !match) throw new VideoError('视频分段范围不正确', 422);
    if (!match) return { url };
    const start = match[2] === undefined ? previous?.url === url && previous.range ? previous.range.end + 1 : NaN : Number(match[2]);
    const end = start + Number(match[1]) - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end - start > 200 * 1024 ** 2) throw new VideoError('视频分段范围不正确', 422);
    return { url, range: { start, end } };
  };
  for (const line of rows) {
    if (line.startsWith('#EXT-X-MAP:')) { const row = attrs(line); if (!row.URI) throw new VideoError('视频初始化分段缺失', 422); const item = part(row.URI, row.BYTERANGE); parts.push(item); previous = item; }
    else if (line.startsWith('#EXT-X-BYTERANGE:')) pending = line.slice(17);
    else if (line.startsWith('#EXTINF:')) { const seconds = Number(line.slice(8).split(',')[0]); if (!Number.isFinite(seconds) || seconds < 0) throw new VideoError('视频分段时长不正确', 422); duration += seconds; }
    else if (!line.startsWith('#')) { const item = part(line, pending); parts.push(item); previous = item; pending = ''; }
    if (parts.length > 1200 || duration > 3600) throw new VideoError('暂不支持超过 60 分钟或分段过多的视频', 422);
  }
  if (!parts.length) throw new VideoError('播放列表没有可提取的视频分段', 422);
  return { parts, duration };
}
export function hlsMediaHeader(bytes: Buffer) {
  return bytes.length >= 12 && (bytes.toString('ascii', 4, 8) === 'ftyp' || bytes.toString('ascii', 4, 8) === 'styp' || bytes.toString('ascii', 4, 8) === 'moof') || bytes.length >= 377 && bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47 || bytes.length >= 7 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
}
