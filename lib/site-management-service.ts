import { randomBytes, randomUUID } from 'node:crypto';
import { loadBuffer } from 'cheerio';
import { env } from '@/db/mysql-runtime';
import { lockPointsUser } from './points-service';
import { normalizeSite, siteRequest } from './site-analysis-network';
import { SiteAnalysisError, visitChannels, type AnalysisSite, type SiteStatistics } from './site-analysis';
import { siteScriptOrigin, siteScriptUrl } from './site-script';

type Database = Pick<typeof env.DB, 'prepare'>;
export type ManagedSite = AnalysisSite & { scriptToken: string; verifiedAt: string; lastSeenAt: string; deletedAt: string };
const validId = (id: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
const stamp = () => new Date().toISOString();
export const scriptPath = (token: string) => `/api/site-tracker/${token}`;
export const sameSiteHost = (left: string, right: string) => left.toLowerCase().replace(/^www\./, '') === right.toLowerCase().replace(/^www\./, '');
const projection = "s.id,s.host,s.url,GREATEST(s.updated_at,COALESCE(i.updated_at,'')) AS updatedAt,COALESCE(i.script_token,'') AS scriptToken,COALESCE(i.verified_at,'') AS verifiedAt,COALESCE(i.last_seen_at,'') AS lastSeenAt,COALESCE(i.deleted_at,'') AS deletedAt";
const join = 'FROM site_analysis_sites s LEFT JOIN site_analysis_integrations i ON i.site_id=s.id AND i.user_id=s.user_id';
export async function listAnalysisSites(userId: number, db: Database = env.DB): Promise<AnalysisSite[]> {
  return (await db.prepare(`SELECT ${projection} ${join} WHERE s.user_id=? AND COALESCE(i.deleted_at,'')='' ORDER BY s.updated_at DESC LIMIT 100`).bind(userId).all<ManagedSite>()).results;
}
export async function ownedManagedSite(userId: number, id: string, includeDeleted = false, db: Database = env.DB) {
  if (!validId(id)) throw new SiteAnalysisError('站点编号不正确');
  const row = await db.prepare(`SELECT ${projection} ${join} WHERE s.user_id=? AND s.id=?${includeDeleted ? '' : " AND COALESCE(i.deleted_at,'')=''"}`).bind(userId, id).first<ManagedSite>();
  if (!row) throw new SiteAnalysisError('站点不存在或不属于当前账号', 404);
  return row;
}
export async function requireVerifiedSite(db: Database, userId: number, host: string) {
  const row = await db.prepare("SELECT s.id,s.url FROM site_analysis_sites s JOIN site_analysis_integrations i ON i.site_id=s.id AND i.user_id=s.user_id WHERE s.user_id=? AND s.host=? AND i.deleted_at='' AND i.verified_at<>'' FOR UPDATE").bind(userId, host).first<{ id: string; url: string }>();
  if (!row) throw new SiteAnalysisError('请先在站点管理添加并验证该域名', 403);
  return row;
}
export async function registerAnalysisSite(userId: number, domain: unknown) {
  const target = normalizeSite(domain);
  return env.DB.transaction(async db => {
    await lockPointsUser(db, userId);
    let row = await db.prepare(`SELECT ${projection} ${join} WHERE s.user_id=? AND s.host=? FOR UPDATE`).bind(userId, target.host).first<ManagedSite>();
    if (row?.scriptToken && !row.deletedAt) return row;
    if ((await listAnalysisSites(userId, db)).length >= 100 && (!row || row.deletedAt)) throw new SiteAnalysisError('已达到当前站点数量上限', 409);
    const time = stamp(), token = row?.scriptToken || randomBytes(32).toString('hex');
    if (!row) {
      const id = randomUUID();
      await db.prepare('INSERT INTO site_analysis_sites (id,user_id,host,url,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, userId, target.host, target.url, time, time).run();
      row = { id, host: target.host, url: target.url, updatedAt: time, scriptToken: '', verifiedAt: '', lastSeenAt: '', deletedAt: '' };
    }
    if (row.scriptToken) await db.prepare("UPDATE site_analysis_integrations SET verified_at='',verify_requested_at='',deleted_at='',updated_at=? WHERE site_id=? AND user_id=?").bind(time, row.id, userId).run();
    else await db.prepare("INSERT INTO site_analysis_integrations (site_id,user_id,script_token,verified_at,last_seen_at,verify_requested_at,deleted_at,created_at,updated_at) VALUES (?,?,?,'','','','',?,?)").bind(row.id, userId, token, time, time).run();
    await db.prepare('UPDATE site_analysis_sites SET url=?,updated_at=? WHERE id=? AND user_id=?').bind(target.url, time, row.id, userId).run();
    return { ...row, url: target.url, scriptToken: token, verifiedAt: '', deletedAt: '', updatedAt: time };
  });
}
export async function deleteAnalysisSite(userId: number, id: string) {
  return env.DB.transaction(async db => {
    await lockPointsUser(db, userId);
    const site = await ownedManagedSite(userId, id, true, db), time = stamp();
    if (!site.scriptToken) await db.prepare("INSERT INTO site_analysis_integrations (site_id,user_id,script_token,verified_at,last_seen_at,verify_requested_at,deleted_at,created_at,updated_at) VALUES (?,?,?,'','','',?,?,?)").bind(id, userId, randomBytes(32).toString('hex'), time, time, time).run();
    else await db.prepare("UPDATE site_analysis_integrations SET deleted_at=?,verified_at='',updated_at=? WHERE site_id=? AND user_id=?").bind(time, time, id, userId).run();
    return { id };
  });
}
export async function verifyAnalysisSite(userId: number, id: string, platformOrigin: string, read = siteRequest) {
  const site = await ownedManagedSite(userId, id);
  if (!site.scriptToken) throw new SiteAnalysisError('请先生成本站接入脚本', 409);
  const time = stamp(), cutoff = new Date(Date.now() - 10000).toISOString();
  // Each verification has its own marker: restoring a deleted site keeps its
  // permanent script token but must reject an earlier in-flight verification.
  const claim = `${time}#${randomBytes(6).toString('hex')}`;
  const claimed = await env.DB.prepare("UPDATE site_analysis_integrations SET verify_requested_at=? WHERE site_id=? AND user_id=? AND script_token=? AND deleted_at='' AND verify_requested_at<?").bind(claim, id, userId, site.scriptToken, cutoff).run();
  if (claimed.meta.changes !== 1) {
    const current = await env.DB.prepare("SELECT verify_requested_at AS requestedAt FROM site_analysis_integrations WHERE site_id=? AND user_id=? AND script_token=? AND deleted_at=''").bind(id, userId, site.scriptToken).first<{ requestedAt: string }>();
    const requestedAt = Date.parse(current?.requestedAt.split('#')[0] || '');
    if (!Number.isFinite(requestedAt)) throw new SiteAnalysisError('站点状态已变化，请刷新后重试', 409);
    const retryAfter = Math.max(1, Math.min(10, Math.ceil((requestedAt + 10000 - Date.now()) / 1000)));
    throw new SiteAnalysisError('验证请求较频繁，请稍后重试', 429, retryAfter);
  }
  let response;
  try { response = await read(site.url, AbortSignal.timeout(15000), 1024 * 1024); }
  catch { throw new SiteAnalysisError('暂时无法读取站点首页，请确认公网可访问后重试', 422); }
  if (response.status < 200 || response.status >= 300 || !/html/i.test(response.contentType) || !sameSiteHost(new URL(response.url).hostname, site.host)) throw new SiteAnalysisError('站点首页访问异常或跳转到其他域名，无法验证', 422);
  const expected = new Set([siteScriptUrl(site.id), new URL(scriptPath(site.scriptToken), platformOrigin).href, new URL(scriptPath(site.scriptToken), siteScriptOrigin).href]);
  const $ = loadBuffer(response.bytes, { encoding: { defaultEncoding: 'utf-8' } });
  $('template,noscript').remove();
  const found = $('script[src]').toArray().some(node => {
    if ($(node).closest('template,noscript').length) return false;
    const type = ($(node).attr('type') || '').trim().toLowerCase();
    if ($(node).attr('nomodule') !== undefined || type && !/^(?:text|application)\/(?:java|ecma)script$/.test(type)) return false;
    try { return expected.has(new URL($(node).attr('src')!, response.url).href); } catch { return false; }
  });
  const updated = await env.DB.prepare("UPDATE site_analysis_integrations SET verified_at=?,updated_at=? WHERE site_id=? AND user_id=? AND script_token=? AND deleted_at='' AND verify_requested_at=?").bind(found ? time : '', time, id, userId, site.scriptToken, claim).run();
  if (updated.meta.changes !== 1) throw new SiteAnalysisError('站点状态已变化，请刷新后重试', 409);
  if (!found) throw new SiteAnalysisError('首页未发现本站唯一脚本，请安装到页面HTML后再验证', 422);
  return ownedManagedSite(userId, id);
}
export async function siteStatistics(userId: number, id: string): Promise<SiteStatistics> {
  const site = await ownedManagedSite(userId, id, true), since = new Date(Date.now() - 30 * 86400000).toISOString();
  const totals = await env.DB.prepare('SELECT COUNT(*) AS pageviews,COUNT(DISTINCT session_key) AS sessions FROM site_analysis_visits WHERE site_id=? AND created_at>=?').bind(id, since).first<{ pageviews: number; sessions: number }>();
  const rows = (await env.DB.prepare('SELECT channel,COUNT(DISTINCT session_key) AS visits FROM site_analysis_visits WHERE site_id=? AND created_at>=? GROUP BY channel').bind(id, since).all<{ channel: string; visits: number }>()).results;
  const countries = (await env.DB.prepare('SELECT country_code AS code,COUNT(DISTINCT session_key) AS visits FROM site_analysis_visits WHERE site_id=? AND created_at>=? GROUP BY country_code').bind(id, since).all<{ code: string; visits: number }>()).results;
  const sessions = Number(totals?.sessions || 0), share = (visits: number) => sessions ? Math.round(visits / sessions * 1000) / 10 : 0;
  return { siteId: id, connected: Boolean(site.verifiedAt || site.lastSeenAt || totals?.pageviews), active: !site.deletedAt, verified: Boolean(site.verifiedAt), lastSeenAt: site.lastSeenAt, since, pageviews: Number(totals?.pageviews || 0), sessions, channels: visitChannels.map(channel => { const visits = Number(rows.find(row => row.channel === channel)?.visits || 0); return { channel, visits, share: share(visits) }; }), countries: countries.map(row => ({ code: row.code || '', visits: Number(row.visits), share: share(Number(row.visits)) })).sort((a,b) => b.visits - a.visits) };
}
