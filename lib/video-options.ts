export class VideoError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const videoToolSlug = 'video-extractor';
export const videoPage = '/tools/video-extractor.html';
export const videoLogin = '/?returnTo=%2Ftools%2Fvideo-extractor.html';
export const videoRetentionHours = 24;
export const videoTaskId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export type VideoPart = { url: string; headers: Record<string, string>; extension: string };
export type VideoFormat = { id: string; label: string; extension: 'mp4' | 'webm' | 'mov'; height: number; size: number; parts: VideoPart[] };
export type VideoInfo = { title: string; source: string; sourceUrl: string; duration: number; thumbnail: string; formats: VideoFormat[] };
export type VideoPreview = Omit<VideoInfo, 'formats' | 'thumbnail'> & { id: string; expiresAt: string; formats: Omit<VideoFormat, 'parts'>[]; coverUrl: string };
export type VideoTask = { id: string; title: string; status: 'queued' | 'processing' | 'ready' | 'failed'; format: string; extension: string; size: number; progress: number; error: string; createdAt: string; expiresAt: string; charged: boolean; pointsSpent: number; downloadUrl: string };
export type VideoAccess = { signedIn: boolean; canExtract: boolean; chargeType: string; pointsBalance: number; pointsCost: number; remaining: number; membershipName: string; purchaseUrl: string; engineReady: boolean; mergeReady: boolean; maxSizeMb: number; history: VideoTask[]; page: number; total: number };

export function sharedVideoUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 8192) throw new VideoError('请粘贴视频链接或分享文字，最多 8000 字符');
  const normalized = value.replace(/https?\\:\/\//gi, match => match.replace('\\:', ':'));
  const match = normalized.match(/https?:\/\/[^\s<>，。！？，；“”‘’）】》]+/i)?.[0]?.replace(/[;"')]+$/, '');
  if (!match || match.length > 4096) throw new VideoError('没有找到有效链接，请粘贴完整的 http / https 视频地址');
  let url;
  try { url = new URL(match); } catch { throw new VideoError('视频链接格式不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new VideoError('只支持不含账号密码的公开 http / https 链接');
  url.hash = '';
  return url.href;
}
export function videoSize(value: number) { return value > 0 ? value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB` : '大小待确认'; }
export function videoDuration(value: number) { return value > 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '时长待确认'; }
