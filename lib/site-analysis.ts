export const siteAnalysisPath = '/tools/webmaster-tools.html';
export const engineDefinitions = [
  { id: 'baidu', name: '百度', domain: 'www.baidu.com', icon: '/search-engines/baidu.ico', bot: 'Baiduspider', metaBot: 'baiduspider', search: 'https://www.baidu.com/s', query: 'wd', group: 'domestic', available: true },
  { id: 'google', name: 'Google', domain: 'www.google.com', icon: '/search-engines/google.ico', bot: 'Googlebot', metaBot: 'googlebot', search: 'https://www.google.com/search', query: 'q', group: 'overseas', available: true },
  { id: 'bing', name: 'Bing', domain: 'bing.com', icon: '/search-engines/bing.ico', bot: 'bingbot', metaBot: 'bingbot', search: 'https://www.bing.com/search', query: 'q', group: 'overseas', available: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', domain: 'duckduckgo.com', icon: '/search-engines/duckduckgo.ico', bot: 'DuckDuckBot', metaBot: '', search: 'https://duckduckgo.com/', query: 'q', group: 'overseas', available: true },
  { id: 'yandex', name: 'Yandex', domain: 'yandex.com', icon: '/search-engines/yandex.ico', bot: 'YandexBot', metaBot: 'yandex', search: 'https://yandex.com/search/', query: 'text', group: 'overseas', available: true },
] as const;
export type EngineId = typeof engineDefinitions[number]['id'];
export function engineSearchUrl(engine: EngineId, query: string, language = 'zh-CN') {
  const definition = engineDefinitions.find(item => item.id === engine);
  if (!definition) throw new Error('搜索引擎选项不正确');
  const url = new URL(definition.search);
  url.searchParams.set(definition.query, query);
  if (engine === 'baidu') url.searchParams.set('rn', '10');
  else if (engine === 'bing') { url.searchParams.set('count', '10'); url.searchParams.set('setlang', language); }
  else if (engine === 'google') { url.searchParams.set('num', '10'); url.searchParams.set('hl', language); }
  return url.href;
}
export type AnalysisOptions = { maxPages: number; keywords: string[]; engines: EngineId[]; language: 'zh-CN' | 'en'; device: 'desktop' | 'mobile'; depth: 10 };
export type StageState = 'pending' | 'running' | 'complete' | 'partial' | 'failed' | 'restricted' | 'unavailable' | 'skipped';
export type AnalysisStage = { key: string; state: StageState; message: string; at: string };
export type SitePage = { url: string; status: number; title: string; description: string; language: string; h1: string[]; canonical: string; noindex: boolean; engineNoindex?: Partial<Record<EngineId, boolean>>; words: number; links: string[]; declared: string[]; text: string; fetchedAt: string; rendered?: boolean };
export type SiteKeyword = { word: string; kind: 'declared' | 'content' | 'manual' | 'search'; score: number; sources: { url: string; kind: string }[] };
export type RankRecord = { engine: EngineId; keyword: string; state: 'found' | 'not_found' | 'restricted' | 'failed'; position: number | null; url: string; checkedAt: string; source: string; message: string };
export type EngineReport = { id: EngineId; state: StageState; queried: number; hits: number | null; top10: number | null; checkedAt: string; message: string; siteRobotsAllowed?: boolean; htmlIndexAllowed?: boolean; siteCheckedAt?: string };
export type SiteIssue = { code: string; severity: 'high' | 'medium' | 'info'; title: string; url: string; advice: string; state?: 'pending' | 'resolved' | 'ignored' };
export type SiteProfile = { host: string; domain: string; finalUrl: string; name: string; title: string; description: string; language: string; industry: string; industrySource: string; addresses: string[]; cname: string[]; nameservers: string[]; registrar: string; registrant: string; registeredAt: string; expiresAt: string; domainStatus: string[]; registrationSource: string; registrationState: StageState; httpStatus: number | null; https: boolean | null };
export type SiteReport = { version: 1; host: string; collectedAt: string; options: AnalysisOptions; profile: SiteProfile; stages: AnalysisStage[]; pages: SitePage[]; keywords: SiteKeyword[]; rankings: RankRecord[]; engines: EngineReport[]; issues: SiteIssue[]; coverage: { discovered: number; fetched: number; limited: boolean }; comparison: { previousId: string; added: number; removed: number; up: number; down: number; comparable: number } | null };
export type SiteRun = { id: string; siteId: string; host: string; status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'; progress: number; stage: string; error: string; createdAt: string; updatedAt: string; completedAt: string; charged: boolean; pointsSpent: number; report: SiteReport | null };
export type AnalysisSite = { id: string; host: string; url: string; updatedAt: string; scriptToken?: string; verifiedAt?: string; lastSeenAt?: string };
export const visitChannels = ['direct', 'search', 'email', 'referral', 'social', 'other'] as const;
export type VisitChannel = typeof visitChannels[number];
export type SiteStatistics = { siteId: string; connected: boolean; active: boolean; verified: boolean; lastSeenAt: string; since: string; pageviews: number; sessions: number; channels: { channel: VisitChannel; visits: number; share: number }[]; countries: { code: string; visits: number; share: number }[] };
export const siteRunLabels: Record<SiteRun['status'], string> = { queued: '排队中', running: '采集中', completed: '已完成', partial: '部分完成', failed: '分析失败' };
export const stageLabels: Record<StageState, string> = { pending: '等待采集', running: '采集中', complete: '已完成', partial: '部分完成', failed: '采集失败', restricted: '访问受限', unavailable: '暂不可用', skipped: '未启用' };
export class SiteAnalysisError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function analysisOptions(value: unknown): AnalysisOptions {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const maxPages = v.maxPages === undefined ? 20 : Number(v.maxPages);
  if (![5, 20, 50].includes(maxPages)) throw new SiteAnalysisError('页面采集范围不正确');
  if (v.engines !== undefined && (!Array.isArray(v.engines) || v.engines.some(e => !engineDefinitions.some(engine => engine.id === e)))) throw new SiteAnalysisError('搜索引擎选项不正确');
  if (v.keywords !== undefined && (!Array.isArray(v.keywords) || v.keywords.length > 20 || v.keywords.some(k => typeof k !== 'string' || k.length > 80 || /[\u0000-\u001f]/.test(k)))) throw new SiteAnalysisError('请最多填写20个关键词，每个不超过80字');
  if (v.language !== undefined && !['zh-CN', 'en'].includes(String(v.language)) || v.device !== undefined && v.device !== 'desktop') throw new SiteAnalysisError('语言或设备选项不正确');
  return { maxPages, keywords: [...new Set((v.keywords as string[] || []).map(k => k.trim()).filter(Boolean))], engines: [...new Set((v.engines as EngineId[] | undefined) || [])].sort(), language: v.language === 'en' ? 'en' : 'zh-CN', device: 'desktop', depth: 10 };
}
export function compareReports(previous: SiteReport, current: SiteReport, previousId: string) {
  if (JSON.stringify(previous.options) !== JSON.stringify(current.options)) return null;
  const oldWords = new Set(previous.keywords.map(k => k.word.toLowerCase())), newWords = new Set(current.keywords.map(k => k.word.toLowerCase()));
  let up = 0, down = 0, comparable = 0;
  for (const now of current.rankings) {
    const old = previous.rankings.find(r => r.keyword === now.keyword && r.engine === now.engine);
    if (!old || !['found', 'not_found'].includes(old.state) || !['found', 'not_found'].includes(now.state)) continue;
    comparable++;
    const before = old.position ?? 11, after = now.position ?? 11;
    if (after < before) up++; else if (after > before) down++;
  }
  return { previousId, added: [...newWords].filter(k => !oldWords.has(k)).length, removed: [...oldWords].filter(k => !newWords.has(k)).length, up, down, comparable };
}
