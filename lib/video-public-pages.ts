export const publicVideoPageUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const isDouyinPage = (host: string) => ['douyin.com', 'iesdouyin.com', 'amemv.com'].some(domain => host === domain || host.endsWith(`.${domain}`));
export const isHaokanPage = (host: string) => host === 'haokan.baidu.com' || host.endsWith('.haokan.baidu.com');
export function douyinVideoId(raw: string) { const url = new URL(raw); return url.pathname.match(/\/(?:share\/)?video\/(\d{10,25})/)?.[1] || (/^\d{10,25}$/.test(url.searchParams.get('modal_id') || '') ? url.searchParams.get('modal_id')! : ''); }
export const douyinCanonicalUrl = (raw: string) => { const id = douyinVideoId(raw); return id ? `https://www.douyin.com/video/${id}` : ''; };
type Media = { url: string; label: string; height: number; size: number };
export type PublicVideoPage = { title: string; thumbnail: string; duration: number; media: Media[]; imagePost: boolean };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 4096) : '';
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
function address(raw: unknown, base: string) { try { const url = new URL(text(raw), base); return text(raw) && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
function assignedJson(html: string, name: string): unknown {
  const marker = new RegExp(`(?:window\\.)?${name}\\s*=\\s*`).exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  if (!['{', '['].includes(html[start])) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') if (--depth === 0) { try { return JSON.parse(html.slice(start, index + 1)); } catch { return null; } }
  }
  return null;
}
export function haokanPageVideo(html: string, source: string): PublicVideoPage {
  const root = record(assignedJson(html, '__PRELOADED_STATE__')), meta = record(root.curVideoMeta);
  const requested = new URL(source).searchParams.get('vid');
  if (requested && text(meta.id) && String(meta.id) !== requested) return { title: '', thumbnail: '', duration: 0, media: [], imagePost: false };
  const media: Media[] = [];
  for (const item of Array.isArray(meta.clarityUrl) ? meta.clarityUrl : []) {
    const row = record(item), url = address(row.url, source);
    if (url) media.push({ url, label: text(row.title) || '原始画质', height: positive(text(row.vodVideoHW).split('$$')[0]), size: positive(row.videoSize) * 1024 ** 2 });
  }
  for (const value of [meta.html5_playurl, meta.playurl]) { const url = address(value, source); if (url && !media.some(item => item.url === url)) media.push({ url, label: '原始画质', height: 0, size: 0 }); }
  return { title: text(meta.title || meta.seo_title).slice(0, 500), thumbnail: address(meta.poster, source), duration: positive(meta.duration || meta.time_length), media: media.slice(0, 8), imagePost: false };
}
export function douyinPageVideo(html: string, source: string): PublicVideoPage {
  const expected = douyinVideoId(source), queue: unknown[] = [assignedJson(html, '_ROUTER_DATA'), assignedJson(html, '__INITIAL_STATE__'), assignedJson(html, 'SIGI_STATE')];
  for (const match of html.matchAll(/<script\b[^>]*id=["'](?:RENDER_DATA|SIGI_STATE)["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { queue.push(JSON.parse(match[1].startsWith('%') ? decodeURIComponent(match[1]) : match[1])); } catch { /* 仅解析数据，不执行网页脚本。 */ } }
  let visited = 0;
  while (queue.length && visited++ < 5000) {
    const value = queue.shift(); if (!value || typeof value !== 'object') continue;
    const node = record(value), id = String(node.aweme_id || node.awemeId || node.id || '');
    if (node.video && (!expected || id === expected)) {
      const video = record(node.video), imagePost = [2, 68, 150].includes(Number(node.aweme_type)) || Array.isArray(node.images) && node.images.length > 0;
      const media: Media[] = [];
      const append = (raw: unknown, label: string, height: unknown) => {
        const data = record(raw), urls = Array.isArray(data.url_list) ? data.url_list : Array.isArray(data.urlList) ? data.urlList : [data.src];
        for (const rawUrl of urls.slice(0, 2)) { const url = address(rawUrl, source); if (url && !media.some(item => item.url === url)) media.push({ url, label, height: positive(height || data.height), size: positive(data.data_size || data.file_size) }); }
      };
      if (!imagePost) {
        for (const value of Array.isArray(video.bit_rate) ? video.bit_rate : []) { const row = record(value); append(row.play_addr, text(row.gear_name) || '原始画质', row.height || video.height); }
        append(video.play_addr || video.playAddr, '原始画质', video.height); append(video.play_addr_h264, '兼容画质', video.height);
      }
      const cover = record(video.cover || video.origin_cover), coverUrls = Array.isArray(cover.url_list) ? cover.url_list : [];
      return { title: text(node.desc || node.title).slice(0, 500), thumbnail: address(coverUrls[0], source), duration: positive(video.duration || node.duration) / 1000, media: media.slice(0, 8), imagePost };
    }
    queue.push(...Object.values(value).filter(child => child && typeof child === 'object'));
  }
  return { title: '', thumbnail: '', duration: 0, media: [], imagePost: false };
}
