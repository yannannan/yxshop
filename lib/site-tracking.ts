import { createHash } from 'node:crypto';
import { env } from '@/db/mysql-runtime';
import { lockPointsUser } from './points-service';
import { sameSiteHost } from './site-management-service';
import { SiteAnalysisError, type VisitChannel } from './site-analysis';
import { siteIdFromScriptId } from './site-script';

export const validTrackingToken = (token: string) => /^[a-f0-9]{64}$/.test(token) || Boolean(siteIdFromScriptId(token));
type Tracker = { site_id: string; user_id: number; host: string; verified_at: string; script_token: string };
export async function activeTracker(token: string, db: Pick<typeof env.DB, 'prepare'> = env.DB) {
  if (!validTrackingToken(token)) return null;
  const siteId = siteIdFromScriptId(token), field = siteId ? 'i.site_id' : 'i.script_token';
  return db.prepare(`SELECT i.site_id,i.user_id,i.script_token,i.verified_at,s.host FROM site_analysis_integrations i JOIN site_analysis_sites s ON s.id=i.site_id AND s.user_id=i.user_id JOIN users u ON u.id=i.user_id WHERE ${field}=? AND i.deleted_at='' AND u.status='active'`).bind(siteId || token).first<Tracker>();
}
export function trafficChannel(referrer: string, medium: string, host: string): VisitChannel {
  if (/^(email|e-mail|newsletter)$/.test(medium)) return 'email';
  if (/^(social|social-media|social_network)$/.test(medium)) return 'social';
  if (/^(organic|search|cpc|ppc|paidsearch)$/.test(medium)) return 'search';
  if (medium && !['referral','direct','none'].includes(medium)) return 'other';
  let refHost = ''; try { refHost = new URL(referrer).hostname.toLowerCase(); } catch { /* Missing referrer means direct. */ }
  if (!refHost || sameSiteHost(refHost, host)) return 'direct';
  const on = (domains: string[]) => domains.some(domain => refHost === domain || refHost.endsWith(`.${domain}`));
  if (on(['mail.google.com','outlook.live.com','mail.qq.com','mail.163.com'])) return 'email';
  if (on(['baidu.com','bing.com','google.com','google.co.uk','google.com.hk','google.co.jp','duckduckgo.com','yandex.com','yandex.ru','sogou.com','so.com'])) return 'search';
  if (on(['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com','douyin.com','weibo.com','xiaohongshu.com','pinterest.com','reddit.com'])) return 'social';
  return 'referral';
}
const windows = new Map<string, { until: number; count: number }>();
export function trackingRateAllowed(token: string) {
  const time = Date.now();
  if (windows.size > 1000) for (const [key, value] of windows) if (value.until < time) windows.delete(key);
  let row = windows.get(token);
  if (!row || row.until < time) { if (windows.size > 1000) return false; row = { until: time + 60000, count: 0 }; windows.set(token, row); }
  return ++row.count <= 12000;
}
export function trackingOrigin(request: Request, host: string) {
  try {
    const raw = request.headers.get('origin') || '', origin = new URL(raw);
    if (!['https:','http:'].includes(origin.protocol) || origin.port || raw !== origin.origin || !sameSiteHost(origin.hostname, host)) return '';
    return origin.origin;
  } catch { return ''; }
}
export async function recordSiteVisit(token: string, request: Request, body: unknown) {
  const tracker = await activeTracker(token);
  if (!tracker?.verified_at) throw new SiteAnalysisError('统计站点不可用', 403);
  const canonicalToken = tracker.script_token;
  const origin = trackingOrigin(request, tracker.host);
  if (!origin) throw new SiteAnalysisError('统计来源不匹配', 403);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SiteAnalysisError('统计事件格式不正确');
  const event = body as Record<string, unknown>, valid = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
  if (!valid(event.id) || !valid(event.session) || typeof event.page !== 'string' || event.page.length > 2048 || typeof event.referrer !== 'string' || event.referrer.length > 2048 || typeof event.medium !== 'string' || event.medium.length > 40) throw new SiteAnalysisError('统计事件格式不正确');
  let page: URL;
  try { page = new URL(event.page); } catch { throw new SiteAnalysisError('统计页面地址不正确'); }
  if (page.origin !== origin || page.username || page.password || page.pathname.length > 1024) throw new SiteAnalysisError('统计来源不匹配', 403);
  if (/bot|spider|crawler|headless/i.test(request.headers.get('user-agent') || '')) return origin;
  if (!trackingRateAllowed(canonicalToken)) throw new SiteAnalysisError('统计请求较频繁', 429);
  const channel = trafficChannel(event.referrer, event.medium.toLowerCase().trim(), tracker.host), time = new Date().toISOString();
  const session = createHash('sha256').update(`${canonicalToken}\0${event.session}`).digest('hex');
  await env.DB.transaction(async db => {
    await lockPointsUser(db, tracker.user_id);
    if (!(await activeTracker(canonicalToken, db))?.verified_at) throw new SiteAnalysisError('统计站点不可用', 403);
    const first = await db.prepare('SELECT channel FROM site_analysis_visits WHERE site_id=? AND session_key=? ORDER BY created_at LIMIT 1').bind(tracker.site_id, session).first<{ channel: string }>();
    const result = await db.prepare('INSERT IGNORE INTO site_analysis_visits (site_id,event_id,session_key,channel,page_path,country_code,created_at) VALUES (?,?,?,?,?,?,?)').bind(tracker.site_id, event.id, session, first?.channel || channel, page.pathname, '', time).run();
    if (result.meta.changes) await db.prepare("UPDATE site_analysis_integrations SET last_seen_at=?,updated_at=? WHERE site_id=? AND script_token=? AND deleted_at=''").bind(time, time, tracker.site_id, canonicalToken).run();
  });
  return origin;
}

// This function is serialized as standalone browser JavaScript. Keep every
// dependency inside it and never collect cookies, query strings or IP addresses.
function browserTracker(endpoint: string, siteKey = '') {
  try {
    endpoint = (document.currentScript as HTMLScriptElement | null)?.src || endpoint;
    siteKey ||= endpoint;
    const root = window as typeof window & { __yxTrackers?: Record<string, boolean> };
    if (root.__yxTrackers?.[siteKey]) return;
    (root.__yxTrackers ||= {})[siteKey] = true;
    if (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const storageKey = `yx-visit:${siteKey}`, uuid = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    let previous = '', journey: { id: string; at: number; referrer: string; medium: string } | undefined;
    const pageview = () => {
      try {
        const path = location.origin + location.pathname;
        if (path === previous) return;
        previous = path;
        const now = Date.now();
        if (!journey) try { journey = JSON.parse(sessionStorage.getItem(storageKey) || 'null') || undefined; } catch { /* Storage is optional. */ }
        if (!journey || typeof journey.id !== 'string' || now - journey.at > 1800000 || !Number.isFinite(journey.at)) {
          let referrer = ''; try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* Invalid referrer is ignored. */ }
          journey = { id: uuid(), at: now, referrer, medium: (new URLSearchParams(location.search).get('utm_medium') || '').slice(0,40) };
        }
        journey.at = now;
        try { sessionStorage.setItem(storageKey, JSON.stringify(journey)); } catch { /* Continue without persistence. */ }
        void fetch(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ id: uuid(), session: journey.id, page: path, referrer: journey.referrer, medium: journey.medium }) }).catch(() => {});
      } catch { /* Analytics must not break the host website. */ }
    };
    for (const name of ['pushState','replaceState'] as const) {
      const original = history[name];
      history[name] = function(...args) { const result = original.apply(this, args); window.dispatchEvent(new Event('yx-site-page')); return result; };
    }
    window.addEventListener('popstate', pageview); window.addEventListener('yx-site-page', pageview); pageview();
  } catch { /* Leave the host page usable when browser capabilities are restricted. */ }
}
export function siteTrackerScript(endpoint: string, siteKey = '') { return `;(${browserTracker.toString()})(${JSON.stringify(endpoint)},${JSON.stringify(siteKey)});`; }
