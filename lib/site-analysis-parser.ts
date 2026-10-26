import { load, loadBuffer } from 'cheerio';
import { engineDefinitions, type EngineId, type RankRecord, type SiteKeyword, type SitePage } from './site-analysis';

const clean = (text: string, size = 500) => text.replace(/\s+/g, ' ').trim().slice(0, size);
export function parseSitePage(bytes: Buffer, url: string, status = 200, contentType = ''): SitePage {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
  let $;
  try { $ = charset ? load(new TextDecoder(charset).decode(bytes)) : loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8' } }); } catch { $ = loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8' } }); }
  const meta = (name: string) => clean($(`meta[name="${name}" i]`).first().attr('content') || '', 1000);
  const directives = (name: string) => $(`meta[name="${name}" i]`).map((_, node) => $(node).attr('content') || '').get().join(',');
  const links: string[] = [];
  $('a[href]').each((_, el) => { try { const link = new URL($(el).attr('href')!, url); if (['https:', 'http:'].includes(link.protocol) && !link.username && !link.password && !link.port) { link.hash = ''; links.push(link.href); } } catch { /* Invalid links remain excluded. */ } });
  const noindex = (value: string) => /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(value);
  const page: SitePage = { url, status, title: clean($('title').first().text()), description: meta('description'), language: clean($('html').attr('lang') || '', 32), h1: $('h1').map((_, e) => clean($(e).text())).get().slice(0, 10), canonical: '', noindex: noindex(directives('robots')), engineNoindex: Object.fromEntries(engineDefinitions.map(engine => [engine.id, engine.metaBot ? noindex(directives(engine.metaBot)) : false])), words: 0, links: [...new Set(links)].slice(0, 500), declared: [...new Set(meta('keywords').split(/[,，;；|]/).map(k => clean(k, 80)).filter(Boolean))].slice(0, 30), text: '', fetchedAt: new Date().toISOString() };
  try { const canonical = $('link[rel="canonical"]').first().attr('href'); if (canonical) page.canonical = new URL(canonical, url).href; } catch { /* Non-URL canonical is not fetched. */ }
  $('script,style,noscript,svg,nav,footer,header,form').remove();
  page.text = clean($('main,article').first().text() || $('body').text(), 24000); page.words = page.text.length;
  return page;
}
const stopWords = new Set('首页 关于 我们 联系 更多 查看 点击 登录 注册 用户 服务 网站 文章 内容 分类 导航 返回 下一页 上一页 版权 所有 有限公司 有限 公司 产品 the and with this that from your you for are not more home contact about login copyright read learn'.split(' '));
export function extractSiteKeywords(pages: SitePage[], manual: string[]): SiteKeyword[] {
  const words = new Map<string, SiteKeyword>();
  const add = (word: string, kind: SiteKeyword['kind'], url: string, score: number) => {
    word = clean(word, 80).replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, ''); const key = word.toLowerCase();
    if (word.length < 2 || stopWords.has(key) || /^\d+$/.test(word)) return;
    let row = words.get(key);
    if (!row) { row = { word, kind, score: 0, sources: [] }; words.set(key, row); }
    row.score += score;
    if (kind === 'manual' || kind === 'declared' && row.kind === 'content') row.kind = kind;
    if (!row.sources.some(s => s.url === url && s.kind === kind) && row.sources.length < 10) row.sources.push({ url, kind });
  };
  for (const word of manual) add(word, 'manual', '', 100);
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  for (const page of pages.filter(p => p.status >= 200 && p.status < 300)) {
    for (const word of page.declared) add(word, 'declared', page.url, 30);
    for (const [text, score] of [[`${page.title} ${page.h1.join(' ')}`, 5], [page.description, 3], [page.text, 1]] as const) {
      const occurrences = new Map<string, number>();
      for (const term of segmenter.segment(text)) if (term.isWordLike && term.segment.length >= 2 && term.segment.length <= 32) occurrences.set(term.segment, Math.min(5, (occurrences.get(term.segment) || 0) + 1));
      for (const [word, count] of occurrences) add(word, 'content', page.url, score * count);
    }
  }
  return [...words.values()].sort((a,b) => b.score - a.score || a.word.localeCompare(b.word)).slice(0, 200);
}
export function parseSearchResults(engine: EngineId, bytes: Buffer, source: string, keyword: string, host: string): RankRecord {
  const $ = loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8' } }), checkedAt = new Date().toISOString();
  if (/验证码|安全验证|异常流量|verify you are|captcha|unusual traffic|before you continue to google|Подтвердите|Я не робот/i.test($('title').text() + $('body').text().slice(0, 1000)) || $('form[action*="anomaly"],form[action*="showcaptcha"],.anomaly-modal,#anomaly-modal').length) return { engine, keyword, state: 'restricted', position: null, url: '', checkedAt, source, message: '搜索引擎要求验证，已停止本次查询' };
  const rows = engine === 'bing' ? $('#b_results > li.b_algo') : engine === 'google' ? $('#rso h3, #search h3') : engine === 'duckduckgo' ? ($('[data-testid="result"]').length ? $('[data-testid="result"]') : $('.result')) : engine === 'yandex' ? $('.serp-item') : $('#content_left > .result, #content_left > .result-op');
  const urls: string[] = [];
  const anchors = new Set<unknown>();
  rows.each((_, el) => {
    const node = $(el); if (node.find('[data-tuiguang],.ec_tuiguang_pplink').length || /广告/.test(node.find('.ec-tuiguang,.ec-tuiguang-new').text())) return;
    if (engine === 'google' && node.closest('[data-text-ad],[data-ad-slot],#tads,#bottomads').length) return;
    if (engine === 'duckduckgo' && node.closest('.result--ad,[data-layout="ad"],[data-testid="ad"]').length) return;
    if (engine === 'yandex' && (node.is('.serp-item_type_ad,[data-fast-name="direct"]') || node.find('.AdvOrganic,[data-fast-name="direct"]').length)) return;
    const anchor = engine === 'google' ? node.closest('a[href]') : engine === 'duckduckgo' ? node.find('a[data-testid="result-title-a"],a.result__a').first() : engine === 'yandex' ? node.find('a.OrganicTitle-Link,a.organic__url-link').first() : node.find('h2 a,h3 a').first();
    if (anchor.length && anchors.has(anchor.get(0))) return;
    if (anchor.length) anchors.add(anchor.get(0));
    let target = anchor.attr('href') || '';
    if (engine === 'baidu') target = node.attr('mu') || node.attr('data-landurl') || target;
    try { const parsed = new URL(target, source); if (parsed.hostname === 'www.bing.com' && parsed.pathname.startsWith('/ck/')) { const encoded = parsed.searchParams.get('u'); if (encoded?.startsWith('a1')) target = Buffer.from(encoded.slice(2), 'base64').toString('utf8'); } else if (engine === 'google' && /^(?:www\.)?google\.com$/.test(parsed.hostname) && parsed.pathname === '/url') target = parsed.searchParams.get('q') || parsed.searchParams.get('url') || target; else if (engine === 'duckduckgo' && /^(?:www\.)?duckduckgo\.com$/.test(parsed.hostname) && parsed.pathname === '/l/') target = parsed.searchParams.get('uddg') || target; } catch { /* Opaque links are treated as unverified, not as missed ranks. */ }
    urls.push(target);
  });
  let opaque = false;
  for (let index = 0; index < Math.min(urls.length, 10); index++) {
    try { const url = new URL(urls[index]); const provider = engineDefinitions.some(item => { const domain = item.domain.replace(/^www\./, ''); return url.hostname === domain || url.hostname.endsWith(`.${domain}`); }); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || provider) opaque = true;
      if (!opaque && (url.hostname === host || url.hostname.replace(/^www\./, '') === host.replace(/^www\./, ''))) return { engine, keyword, state: 'found', position: index + 1, url: url.href, checkedAt, source, message: '' };
    } catch { opaque = true; }
  }
  return { engine, keyword, state: rows.length >= 10 && urls.length >= 10 && !opaque ? 'not_found' : 'failed', position: null, url: '', checkedAt, source, message: rows.length >= 10 && urls.length >= 10 && !opaque ? '本次前10条结果未命中' : '结果不足或无法验证落地地址，不能判断排名' };
}
