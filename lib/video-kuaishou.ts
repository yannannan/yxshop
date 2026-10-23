// 只读取公开分享页已经返回的 JSON 数据，不执行脚本、不调用登录接口。
export const isKuaishouPage = (host: string) => ['kuaishou.com', 'chenzhongtech.com', 'gifshow.com'].some(domain => host === domain || host.endsWith(`.${domain}`));
function jsonAt(text: string, offset: number): unknown {
  const start = text.slice(offset).search(/[\[{]/);
  if (start < 0 || start > 50) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let index = offset + start; index < text.length; index++) {
    const char = text[index];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') { if (--depth === 0) { try { return JSON.parse(text.slice(offset + start, index + 1)); } catch { return null; } } }
  }
  return null;
}
export function kuaishouVideoSources(html: string, source: string) {
  const states: unknown[] = [];
  for (const match of html.matchAll(/(?:window\.)?(?:__APOLLO_STATE__|__INITIAL_STATE__|INIT_STATE|__INITIAL_DATA__)\s*=\s*/g)) {
    states.push(jsonAt(html, match.index + match[0].length)); if (states.length >= 5) break;
  }
  for (const match of html.matchAll(/<script\b[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { states.push(JSON.parse(match[1])); } catch { /* 不接受 JavaScript 表达式。 */ }
    if (states.length >= 8) break;
  }
  const url = new URL(source), photoId = url.pathname.match(/\/short-video\/([a-z0-9]+)/i)?.[1] || url.searchParams.get('photoId') || '';
  const queue = states.map(value => ({ value, selected: false, video: false }));
  const urls: string[] = []; let title = '', thumbnail = '', duration = 0, visited = 0;
  while (queue.length && visited++ < 5000) {
    const { value, selected: inherited, video } = queue.shift()!;
    if (!value || typeof value !== 'object') continue;
    const node = value as Record<string, unknown>;
    const selected = inherited || Boolean(photoId && [node.id, node.photoId, node.photo_id].includes(photoId));
    const primary = ['photoUrl', 'playUrl', 'videoUrl', 'play_url', 'video_url'];
    const ownsVideo = primary.some(key => typeof node[key] === 'string') || Boolean(node.videoResource);
    if ((selected || !photoId && ownsVideo) && !title) {
      title = typeof node.caption === 'string' ? node.caption : typeof node.title === 'string' ? node.title : '';
      thumbnail = typeof node.coverUrl === 'string' ? node.coverUrl : typeof node.cover_url === 'string' ? node.cover_url : '';
      const ms = Number(node.durationMillis || node.durationMs || node.duration);
      duration = Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
    }
    for (const [key, child] of Object.entries(node)) {
      const belongs = selected || Boolean(photoId && key.endsWith(`:${photoId}`)) || !photoId && ownsVideo;
      const media = video || /^(?:videoResource|playUrls|videoUrls|h264|hevc|adaptationSet|representation)$/.test(key);
      if (belongs && typeof child === 'string' && (primary.includes(key) || video && key === 'url') && /^https?:\/\//i.test(child)) urls.push(child);
      if (child && typeof child === 'object') queue.push({ value: child, selected: belongs, video: media });
    }
  }
  return { title: title.slice(0, 500), thumbnail, duration, urls: [...new Set(urls)].slice(0, 8) };
}
