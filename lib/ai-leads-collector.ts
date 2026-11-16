import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { siteRequest, type SiteResponse } from './site-analysis-network';
import { LeadsError, platformForUrl, publicLeadUrl, rankLead, type Lead, type LeadOptions } from './ai-leads';

type IO = { read: typeof siteRequest; json: (url: string, signal: AbortSignal) => Promise<unknown> };
const bot = 'YxstarSiteBot';
const digest = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 32);
export function parsePublicLead(response: SiteResponse): Lead {
  const $ = cheerio.load(response.bytes.toString('utf8'));
  $('script,style,noscript,iframe,form,nav,footer').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const bio = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || text.slice(0, 500);
  const mail = $('a[href^="mailto:"]').first().attr('href')?.slice(7).split('?')[0] || '';
  const telephone = $('a[href^="tel:"]').first().attr('href')?.slice(4) || '';
  const email = /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d.-]+\.[a-z]{2,}$/i.test(mail) ? mail.slice(0, 254) : '';
  const phone = /^\+?[\d ()-]{6,32}$/.test(telephone) ? telephone : '';
  const image = $('meta[property="og:image"]').attr('content') || '';
  const name = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || $('h1').first().text()).trim().slice(0, 250);
  if (!name) throw new LeadsError('公开页面没有可读取的名称');
  const url = publicLeadUrl(response.url); if (!url) throw new LeadsError('公开页面地址无效');
  return { id: digest(url), platform: platformForUrl(url), url, name, avatar: image ? publicLeadUrl(new URL(image, url).href) : '', accountId: '', phone, email, bio: bio.slice(0, 1500), category: '待分类', score: 0, matched: [], collectedAt: new Date().toISOString(), status: 'fresh', note: '' };
}
async function publicPage(raw: string, signal: AbortSignal, io: IO) {
  const origin = new URL(raw).origin, rules = await io.read(`${origin}/robots.txt`, signal, 256 * 1024);
  if (new URL(rules.url).origin !== origin || ![200, 404, 410].includes(rules.status)) throw new LeadsError('站点采集规则暂不可用');
  const policy = robotsParser(`${origin}/robots.txt`, rules.status === 200 ? rules.bytes.toString('utf8') : '');
  if (policy.isAllowed(raw, bot) === false) throw new LeadsError('站点采集规则不允许读取该主页');
  const response = await io.read(raw, signal);
  // Do not parse a redirect destination until its own policy has been checked.
  if (response.url !== raw) {
    const target = new URL(response.url), nextRules = await io.read(`${target.origin}/robots.txt`, signal, 256 * 1024);
    if (new URL(nextRules.url).origin !== target.origin || ![200,404,410].includes(nextRules.status) || robotsParser(`${target.origin}/robots.txt`, nextRules.status === 200 ? nextRules.bytes.toString('utf8') : '').isAllowed(target.href, bot) === false) throw new LeadsError('跳转页面的采集规则不允许读取');
  }
  if ([401,403,429].includes(response.status) || /captcha|verifycenter|验证码|安全验证|登录后查看/i.test(response.bytes.toString('utf8').slice(0, 300000))) throw new LeadsError('平台要求登录或验证，未继续采集');
  if (response.status !== 200 || !/text\/html|application\/xhtml/i.test(response.contentType)) throw new LeadsError('该公开主页暂不可读');
  return parsePublicLead(response);
}
async function youtube(options: LeadOptions, signal: AbortSignal, io: IO, key: string) {
  const results: Lead[] = []; let page = '';
  do {
    const search = new URL('https://www.googleapis.com/youtube/v3/search');
    search.search = new URLSearchParams({ part: 'snippet', type: 'channel', q: `${options.keyword} ${options.marketing}`.trim(), maxResults: String(Math.min(50, options.limit - results.length)), key, ...(page ? { pageToken: page } : {}) }).toString();
    const data = await io.json(search.href, signal) as { items?: { id?: { channelId?: string }; snippet?: { title?: string; description?: string; thumbnails?: { default?: { url?: string } } } }[]; nextPageToken?: string };
    for (const item of data.items || []) {
      const id = item.id?.channelId; if (!id || !/^[a-zA-Z\d_-]{10,64}$/.test(id) || !item.snippet?.title) continue;
      const url = `https://www.youtube.com/channel/${id}`;
      results.push({ id: digest(url), platform: 'youtube', url, name: item.snippet.title.slice(0,250), bio: (item.snippet.description || '').slice(0,1500), avatar: publicLeadUrl(item.snippet.thumbnails?.default?.url), accountId: id, phone: '', email: '', category: '', score: 0, matched: [], collectedAt: new Date().toISOString(), status: 'fresh', note: '' });
    }
    page = data.nextPageToken || '';
  } while (page && results.length < options.limit);
  return results.slice(0, options.limit);
}
export async function collectLeads(options: LeadOptions, signal: AbortSignal, supplied?: Partial<IO>, youtubeKey = process.env.AI_LEADS_YOUTUBE_API_KEY || '') {
  const io: IO = { read: siteRequest, json: async (url, signal) => {
    const response = await siteRequest(url, signal, 2 * 1024 * 1024);
    if (response.status !== 200) throw new LeadsError('YouTube数据源暂不可用，请检查接口配置或配额');
    return JSON.parse(response.bytes.toString('utf8'));
  }, ...supplied };
  const messages: string[] = [], found: Lead[] = [], visited = new Set<string>();
  if (options.platforms.includes('youtube') && youtubeKey) {
    try { found.push(...await youtube(options, signal, io, youtubeKey)); } catch { messages.push('YouTube检索未完成，请检查接口配置或配额'); }
  }
  for (const url of options.sourceUrls) {
    if (signal.aborted || found.length >= options.limit) break;
    const origin = new URL(url).origin;
    if (visited.has(origin)) { messages.push('同一站点本轮只读取一个主页，其余链接已跳过'); continue; } visited.add(origin);
    try { const lead = await publicPage(url, signal, io); if (!options.platforms.includes(lead.platform)) throw new LeadsError('主页跳转到了未选择的平台'); found.push(lead); }
    catch (error) { messages.push(`${new URL(url).hostname}：${error instanceof LeadsError ? error.message : '公开主页读取失败'}`); }
  }
  for (const platform of options.platforms) if (!(platform === 'youtube' && youtubeKey) && !options.sourceUrls.some(url => platformForUrl(url) === platform)) messages.push(`${platform}：自动检索尚未接入，可使用公开检索入口或补充公开主页链接`);
  const unique = new Map<string, Lead>();
  for (const value of found) {
    const lead = rankLead(value, options);
    if (!lead.matched.length || options.contactOnly && !lead.email && !lead.phone) continue;
    // Only persist explicitly selected optional fields. The name and source anchor the record.
    for (const field of ['avatar','phone','email','bio','accountId'] as const) if (!options.fields.includes(field)) lead[field] = '';
    unique.set(lead.url, lead);
  }
  return { leads: [...unique.values()].sort((a,b) => b.score-a.score).slice(0,options.limit), messages: [...new Set(messages)], analysis: 'rules' as const };
}
