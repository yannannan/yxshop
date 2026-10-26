import robotsParser from 'robots-parser';
import { loadBuffer } from 'cheerio';
import { normalizeSite, registrationData, siteDns, siteRequest } from './site-analysis-network';
import { extractSiteKeywords, parseSearchResults, parseSitePage } from './site-analysis-parser';
import { engineDefinitions, engineSearchUrl, type AnalysisOptions, type SiteReport, type AnalysisStage, type StageState, type SitePage, type SiteIssue } from './site-analysis';

export type AnalysisIO = {
  request: typeof siteRequest; dns: typeof siteDns; registration: typeof registrationData;
  render?: (url: string, signal: AbortSignal) => Promise<Buffer>;
};
const defaultIO: AnalysisIO = { request: siteRequest, dns: siteDns, registration: registrationData, async render(url, signal) { const { renderSitePage } = await import('./site-analysis-browser'); return renderSitePage(url, signal); } };
export function blankReport(host: string, options: AnalysisOptions): SiteReport {
  return { version: 1, host, collectedAt: new Date().toISOString(), options, profile: { host, domain: normalizeSite(host).domain, finalUrl: '', name: '', title: '', description: '', language: '', industry: '', industrySource: '', addresses: [], cname: [], nameservers: [], registrar: '', registrant: '', registeredAt: '', expiresAt: '', domainStatus: [], registrationSource: '', registrationState: 'pending', httpStatus: null, https: null }, stages: [], pages: [], keywords: [], rankings: [], engines: engineDefinitions.map(e => ({ id: e.id, state: options.engines.includes(e.id) ? 'pending' : 'skipped', queried: 0, hits: null, top10: null, checkedAt: '', message: options.engines.includes(e.id) ? '等待查询' : '未启用本轮查询' })), issues: [], coverage: { discovered: 0, fetched: 0, limited: false }, comparison: null };
}
export async function collectSiteReport(input: string, options: AnalysisOptions, onProgress: (report: SiteReport, progress: number) => Promise<void>, io: AnalysisIO = defaultIO, signal = AbortSignal.timeout(180000)) {
  const site = normalizeSite(input), report = blankReport(site.host, options), bot = 'YxstarSiteBot';
  const stage = async (key: string, state: StageState, message: string, progress: number) => {
    const value: AnalysisStage = { key, state, message, at: new Date().toISOString() }, old = report.stages.findIndex(s => s.key === key);
    if (old < 0) report.stages.push(value); else report.stages[old] = value;
    await onProgress(report, progress);
  };
  const read = (url: string, limit?: number) => io.request(url, AbortSignal.any([signal, AbortSignal.timeout(15000)]), limit);
  const explain = (error: unknown) => error instanceof Error && /域名|公网|内网|DNS|大小|跳转|超时|机器人|robots|浏览器|动态/.test(error.message) ? error.message.slice(0, 180) : signal.aborted ? '分析时间已到，保留已完成结果' : '数据源暂不可用，请稍后重试';
  await stage('dns', 'running', '正在查询域名解析', 3);
  try { Object.assign(report.profile, await io.dns(site.host)); await stage('dns', 'complete', '已读取当前域名解析', 8); }
  catch (e) { await stage('dns', 'failed', explain(e), 8); }
  await stage('registration', 'running', '正在查询公开注册信息', 10);
  try {
    const result = await io.registration(site.domain, AbortSignal.any([signal, AbortSignal.timeout(20000)]));
    type Entity = { roles?: string[]; vcardArray?: [string, [string, unknown, string, unknown][]] };
    const data = result.data as { events?: { eventAction: string; eventDate: string }[]; entities?: Entity[]; status?: string[] };
    const name = (entity: Entity | undefined) => { const values = entity?.vcardArray?.[1] || []; const value = values.find(v => v[0] === 'org')?.[3] || values.find(v => v[0] === 'fn')?.[3]; return typeof value === 'string' ? value.slice(0, 200) : ''; };
    report.profile.registrar = name(data.entities?.find(e => e.roles?.includes('registrar')));
    report.profile.registrant = name(data.entities?.find(e => e.roles?.includes('registrant')));
    report.profile.registeredAt = data.events?.find(e => e.eventAction === 'registration')?.eventDate || '';
    report.profile.expiresAt = data.events?.find(e => e.eventAction === 'expiration')?.eventDate || '';
    report.profile.domainStatus = (data.status || []).filter(s => typeof s === 'string').slice(0, 10);
    report.profile.registrationSource = result.source; report.profile.registrationState = 'complete';
    await stage('registration', 'complete', '已查询公开注册信息，隐藏字段保持未公开', 18);
  } catch (e) { report.profile.registrationState = 'unavailable'; await stage('registration', 'unavailable', explain(e), 18); }
  const eligible = (raw: string, origin: string) => { try { const url = new URL(raw); return url.origin === origin && !url.username && !url.password && !url.search && !/\.(?:zip|rar|pdf|png|jpe?g|webp|gif|mp[34]|exe|css|js|svg|woff2?)(?:$|\?)/i.test(url.pathname) && !/(?:^|\/)(?:logout|login|signin|cart|checkout|search|admin|api)(?:\/|$)/i.test(url.pathname); } catch { return false; } };
  let crawlIncomplete = false;
  await stage('pages', 'running', '正在读取网站页面与采集规则', 20);
  try {
    // Resolve the public redirect chain first, then apply the final site's robots policy before parsing content or following links.
    const rulesResponse = await read(new URL('/robots.txt', site.url).href, 256 * 1024);
    if (rulesResponse.status !== 404 && rulesResponse.status !== 410 && rulesResponse.status !== 200) throw new Error('robots 规则暂不可用');
    const finalOrigin = new URL(rulesResponse.url).origin;
    if (normalizeSite(finalOrigin).host.replace(/^www\./, '') !== site.host.replace(/^www\./, '')) throw new Error('站点跳转超出当前域名范围');
    let origin = finalOrigin, policy = robotsParser(`${origin}/robots.txt`, rulesResponse.status === 200 ? rulesResponse.bytes.toString('utf8') : '');
    const recordSitePolicy = () => { for (const engine of report.engines) { const definition = engineDefinitions.find(item => item.id === engine.id)!; engine.siteRobotsAllowed = policy.isAllowed(`${origin}/`, definition.bot) !== false; engine.siteCheckedAt = new Date().toISOString(); } };
    recordSitePolicy();
    const allowed = (url: string) => eligible(url, origin) && policy.isAllowed(url, bot) !== false;
    let delay = Math.max(500, Number(policy.getCrawlDelay(bot) || 0) * 1000);
    let lastRead = 0;
    const politeRead = async (url: string, limit?: number, canonicalHome = false) => {
      if (!allowed(url)) throw new Error('robots 规则不允许采集此页面');
      const pause = Math.max(0, lastRead + delay - Date.now());
      if (pause) await new Promise<void>((resolve, reject) => { const done = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); }; const abort = () => { done(); reject(new Error('采集超时')); }; const timer = setTimeout(() => { done(); resolve(); }, pause); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
      signal.throwIfAborted(); lastRead = Date.now(); const result = await read(url, limit);
      if (new URL(result.url).origin !== origin) {
        if (!canonicalHome || normalizeSite(result.url).host.replace(/^www\./, '') !== site.host.replace(/^www\./, '')) throw new Error('站点跳转超出允许采集范围');
        const nextOrigin = new URL(result.url).origin, nextRules = await read(`${nextOrigin}/robots.txt`, 256 * 1024);
        if (![200, 404, 410].includes(nextRules.status)) throw new Error('robots 规则暂不可用');
        if (new URL(nextRules.url).origin !== nextOrigin) throw new Error('站点跳转超出允许采集范围');
        origin = nextOrigin; policy = robotsParser(`${origin}/robots.txt`, nextRules.status === 200 ? nextRules.bytes.toString('utf8') : '');
        delay = Math.max(500, Number(policy.getCrawlDelay(bot) || 0) * 1000); recordSitePolicy();
      }
      if (!allowed(result.url)) throw new Error('robots 规则不允许采集此页面');
      return result;
    };
    const home = await politeRead(`${origin}/`, undefined, true);
    report.profile.httpStatus = home.status; report.profile.finalUrl = home.url; report.profile.https = home.url.startsWith('https:');
    if (home.status < 200 || home.status >= 300 || !/html/i.test(home.contentType)) throw new Error('首页暂不可访问');
    let first = parseSitePage(home.bytes, home.url, home.status, home.contentType);
    if (/验证码|安全验证|access denied|just a moment/i.test(first.title)) throw new Error('网站要求访问验证');
    Object.assign(report.profile, { name: first.title.split(/[|｜—]/)[0].trim(), title: first.title, description: first.description, language: first.language });
    report.pages.push(first); report.coverage = { discovered: 1, fetched: 1, limited: false };
    await stage('pages', 'running', '已读取首页基础信息，正在补充页面内容', 23);
    if (first.words < 60 && /<script\b/i.test(home.bytes.toString('utf8')) && io.render) {
      try {
        const rendered = parseSitePage(await io.render(home.url, AbortSignal.any([signal, AbortSignal.timeout(45000)])), home.url);
        if (/验证码|安全验证|access denied|just a moment/i.test(rendered.title)) throw new Error('网站要求访问验证');
        first = { ...rendered, rendered: true, title: rendered.title || first.title, description: rendered.description || first.description, language: rendered.language || first.language, canonical: rendered.canonical || first.canonical, declared: rendered.declared.length ? rendered.declared : first.declared, noindex: first.noindex || rendered.noindex, engineNoindex: Object.fromEntries(engineDefinitions.map(e => [e.id, Boolean(first.engineNoindex?.[e.id] || rendered.engineNoindex?.[e.id])])) };
      }
      catch { crawlIncomplete = true; report.issues.push({ code: 'dynamic', severity: 'medium', title: '动态内容未完整读取', url: home.url, advice: '浏览器渲染暂不可用，已保留静态页面信息' }); }
    }
    Object.assign(report.profile, { name: first.title.split(/[|｜—]/)[0].trim(), title: first.title, description: first.description, language: first.language });
    for (const engine of report.engines) engine.htmlIndexAllowed = !first.noindex && !first.engineNoindex?.[engine.id];
    const industryRules: [string, RegExp][] = [['电子商务', /商城|购物|电商|ecommerce|shopping/i], ['软件与技术', /软件|开发|编程|software|developer/i], ['教育培训', /培训|课程|教育|education|training/i], ['金融财经', /金融|财经|投资|finance|investment/i], ['医疗健康', /医疗|健康|health|medical/i]];
    report.profile.industry = industryRules.find(([, expression]) => expression.test(`${first.title} ${first.description}`))?.[0] || '';
    report.profile.industrySource = report.profile.industry ? '根据网站标题和描述推测' : '';
    report.pages[0] = first;
    const pending = [...first.links.filter(link => allowed(link))], discovered = new Set([home.url, ...pending]);
    const sitemaps = [...new Set([...policy.getSitemaps(), `${origin}/sitemap.xml`])].filter(url => eligible(url, origin)).slice(0, 3);
    for (let index = 0; index < sitemaps.length; index++) {
      try {
        const xml = await politeRead(sitemaps[index], 1024 * 1024);
        if (xml.status !== 200) continue;
        const $ = loadBuffer(xml.bytes, { xmlMode: true });
        $('sitemap > loc').each((_, node) => { const link = $(node).text().trim(); if (sitemaps.length < 3 && eligible(link, origin) && !sitemaps.includes(link)) sitemaps.push(link); });
        $('url > loc').slice(0, 1000).each((_, node) => { try { const candidate = new URL($(node).text().trim()); candidate.hash = ''; const link = candidate.href; if (allowed(link) && !discovered.has(link)) { pending.push(link); discovered.add(link); } } catch { /* Invalid sitemap entry is ignored. */ } });
      } catch { /* Sitemap is optional; links still provide a bounded crawl. */ }
    }
    const visited = new Set([home.url]);
    while (pending.length && visited.size < options.maxPages && !signal.aborted) {
      const url = pending.shift()!; if (visited.has(url)) continue; visited.add(url);
      try {
        const response = await politeRead(url);
        if (!/html/i.test(response.contentType)) continue;
        if (report.pages.some(page => page.url === response.url)) continue;
        visited.add(response.url);
        const page = parseSitePage(response.bytes, response.url, response.status, response.contentType); report.pages.push(page);
        if (response.status >= 400) crawlIncomplete = true;
        for (const link of page.links) if (discovered.size < 1000 && allowed(link) && !discovered.has(link)) { discovered.add(link); pending.push(link); }
      } catch { crawlIncomplete = true; }
      report.coverage = { discovered: discovered.size, fetched: report.pages.length, limited: pending.length > 0 };
      await stage('pages', 'running', '正在采集站内页面', 25 + Math.floor(30 * visited.size / options.maxPages));
    }
    report.coverage = { discovered: discovered.size, fetched: report.pages.length, limited: pending.length > 0 };
    if (signal.aborted) crawlIncomplete = true;
    await stage('pages', crawlIncomplete ? 'partial' : 'complete', crawlIncomplete ? '部分页面未完成，已保留可读取内容' : '已完成本轮范围内的网站采集', 58);
  } catch (e) { await stage('pages', 'failed', explain(e), 58); }
  await stage('keywords', 'running', '正在整理网站关键词', 60);
  report.keywords = extractSiteKeywords(report.pages, options.keywords, report.profile);
  await stage('keywords', report.keywords.length ? 'complete' : 'unavailable', report.keywords.length ? '已整理关键词并保存来源' : '暂无足够内容提取关键词', 65);
  const seeds = [...new Set([...options.keywords, ...report.keywords.map(k => k.word)])].slice(0, 5);
  for (const engine of options.engines) {
    const summary = report.engines.find(e => e.id === engine)!;
    const engineSignal = AbortSignal.any([signal, AbortSignal.timeout(35000)]);
    const engineRead = (url: string, limit?: number) => io.request(url, AbortSignal.any([engineSignal, AbortSignal.timeout(15000)]), limit);
    const progress = 68 + Math.floor(options.engines.indexOf(engine) * 19 / options.engines.length), finishedProgress = 68 + Math.floor((options.engines.indexOf(engine) + 1) * 19 / options.engines.length);
    summary.state = 'running'; summary.checkedAt = new Date().toISOString(); summary.message = '正在查询所选引擎的公开搜索结果';
    await stage(`engine:${engine}`, 'running', summary.message, progress);
    if (!seeds.length) { summary.state = 'unavailable'; summary.message = '暂无可查询关键词'; await stage(`engine:${engine}`, 'unavailable', summary.message, finishedProgress); continue; }
    const base = new URL(engineSearchUrl(engine, '')).origin;
    try {
      const rules = await engineRead(`${base}/robots.txt`, 256 * 1024);
      if ([401, 403, 429].includes(rules.status)) { summary.state = 'restricted'; throw new Error('搜索引擎限制当前查询，请稍后再试'); }
      if (![200, 404].includes(rules.status)) throw new Error('搜索引擎采集规则暂不可用');
      if (rules.status === 200 && /<html\b|<!doctype\s+html/i.test(rules.bytes.toString('utf8').slice(0, 1000))) { summary.state = 'restricted'; throw new Error('搜索引擎要求验证，已停止本次查询'); }
      const policy = robotsParser(`${base}/robots.txt`, rules.status === 200 ? rules.bytes.toString('utf8') : '');
      for (const keyword of seeds) {
        engineSignal.throwIfAborted();
        const source = new URL(engineSearchUrl(engine, keyword, options.language));
        if (policy.isAllowed(source.href, bot) === false) { summary.state = 'restricted'; summary.message = '搜索引擎 robots 规则限制自动查询'; break; }
        const pause = Math.max(1000, Number(policy.getCrawlDelay(bot) || 0) * 1000);
        if (summary.queried) await new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(new Error('查询超时')); }; const timer = setTimeout(() => { engineSignal.removeEventListener('abort', abort); resolve(); }, pause); engineSignal.addEventListener('abort', abort, { once: true }); if (engineSignal.aborted) abort(); });
        const response = await engineRead(source.href);
        summary.checkedAt = new Date().toISOString();
        if ([401, 403, 429].includes(response.status)) { summary.state = 'restricted'; summary.message = '搜索引擎限制当前查询，请稍后再试'; break; }
        if (response.status !== 200) {
          const challenge = parseSearchResults(engine, response.bytes, source.href, keyword, site.host);
          if (challenge.state === 'restricted') { summary.state = 'restricted'; summary.message = challenge.message; break; }
          throw new Error('搜索结果暂不可用');
        }
        const record = parseSearchResults(engine, response.bytes, source.href, keyword, site.host); report.rankings.push(record); summary.queried++;
        if (record.state === 'restricted') { summary.state = 'restricted'; summary.message = record.message; break; }
        await stage(`engine:${engine}`, 'running', summary.message, progress);
      }
      const records = report.rankings.filter(r => r.engine === engine), valid = records.filter(r => ['found', 'not_found'].includes(r.state));
      summary.hits = valid.length ? valid.filter(r => r.state === 'found').length : null; summary.top10 = summary.hits;
      if (summary.state !== 'restricted') { summary.state = valid.length === seeds.length ? 'complete' : valid.length ? 'partial' : 'unavailable'; summary.message = valid.length === seeds.length ? '已查询前10条自然结果' : '部分结果无法验证，未将其计为无排名'; }
    } catch (error) { const restricted = summary.state === 'restricted'; summary.state = restricted ? 'restricted' : 'failed'; summary.message = restricted ? (error as Error).message : signal.aborted ? '本轮查询超时' : engineSignal.aborted ? '本引擎查询超时，已保留其他采集结果' : '搜索引擎数据源暂不可用'; }
    const valid = report.rankings.filter(r => r.engine === engine && ['found','not_found'].includes(r.state));
    if (valid.length) { summary.hits = valid.filter(r => r.state === 'found').length; summary.top10 = summary.hits; if (summary.state === 'failed') summary.state = 'partial'; }
    await stage(`engine:${engine}`, summary.state, summary.message, finishedProgress);
  }
  const issue = (page: SitePage, code: string, title: string, advice: string, severity: SiteIssue['severity'] = 'medium') => report.issues.push({ code, title, advice, url: page.url, severity });
  const titles = new Set<string>();
  for (const page of report.pages) {
    if (page.status >= 400) { issue(page, 'http', '页面访问异常', '检查页面地址和服务器响应', 'high'); continue; }
    if (!page.title) issue(page, 'title', '页面缺少标题', '为页面设置清晰且独立的标题');
    else if (titles.has(page.title)) issue(page, 'duplicate-title', '多个页面使用相同标题', '检查页面定位，为不同内容设置独立标题');
    titles.add(page.title);
    if (!page.description) issue(page, 'description', '页面缺少描述', '补充与页面内容一致的摘要');
    if (page.noindex) issue(page, 'noindex', '页面声明不参与索引', '确认是否需要让此页面出现在搜索结果', 'info');
  }
  report.issues = report.issues.slice(0, 200); report.collectedAt = new Date().toISOString();
  await stage('report', 'complete', '分析报告已生成', 95);
  return report;
}
