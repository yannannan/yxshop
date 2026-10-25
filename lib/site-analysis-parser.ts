import { load, loadBuffer } from 'cheerio';
import type { RankRecord, SiteKeyword, SitePage } from './site-analysis';

const clean = (text: string, size = 500) => text.replace(/\s+/g, ' ').trim().slice(0, size);
export function parseSitePage(bytes: Buffer, url: string, status = 200, contentType = ''): SitePage {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
  let $;
  try { $ = charset ? load(new TextDecoder(charset).decode(bytes)) : loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8' } }); } catch { $ = loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8' } }); }
  const meta = (name: string) => clean($(`meta[name="${name}" i]`).first().attr('content') || '', 1000);
  const links: string[] = [];
  $('a[href]').each((_, el) => { try { const link = new URL($(el).attr('href')!, url); if (['https:', 'http:'].includes(link.protocol) && !link.username && !link.password && !link.port) { link.hash = ''; links.push(link.href); } } catch { /* Invalid links remain excluded. */ } });
  const page = { url, status, title: clean($('title').first().text()), description: meta('description'), language: clean($('html').attr('lang') || '', 32), h1: $('h1').map((_, e) => clean($(e).text())).get().slice(0, 10), canonical: '', noindex: /(?:^|[,\s])noindex(?:$|[,\s])/i.test(meta('robots')), words: 0, links: [...new Set(links)].slice(0, 500), declared: [...new Set(meta('keywords').split(/[,，;；|]/).map(k => clean(k, 80)).filter(Boolean))].slice(0, 30), text: '', fetchedAt: new Date().toISOString() };
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
export function parseSearchResults(engine: 'baidu' | 'bing', bytes: Buffer, source: string, keyword: string, host: string): RankRecord {
  const $ = loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8' } }), checkedAt = new Date().toISOString();
  if (/验证码|安全验证|异常流量|verify you are|captcha|unusual traffic/i.test($('title').text() + $('body').text().slice(0, 1000))) return { engine, keyword, state: 'restricted', position: null, url: '', checkedAt, source, message: '搜索引擎要求验证，已停止本次查询' };
  const rows = engine === 'bing' ? $('#b_results > li.b_algo') : $('#content_left > .result, #content_left > .result-op');
  const urls: string[] = [];
  rows.each((_, el) => {
    const node = $(el); if (node.find('[data-tuiguang],.ec_tuiguang_pplink').length || /广告/.test(node.find('.ec-tuiguang,.ec-tuiguang-new').text())) return;
    const anchor = node.find('h2 a,h3 a').first(); let target = anchor.attr('href') || '';
    if (engine === 'baidu') target = node.attr('mu') || node.attr('data-landurl') || target;
    try { const parsed = new URL(target, source); if (parsed.hostname === 'www.bing.com' && parsed.pathname.startsWith('/ck/')) { const encoded = parsed.searchParams.get('u'); if (encoded?.startsWith('a1')) target = Buffer.from(encoded.slice(2), 'base64').toString('utf8'); } } catch { /* Opaque links are treated as unverified, not as missed ranks. */ }
    urls.push(target);
  });
  let opaque = false;
  for (let index = 0; index < Math.min(urls.length, 10); index++) {
    try { const url = new URL(urls[index]); if (/^(?:www\.)?(?:baidu|bing)\.com$/.test(url.hostname)) opaque = true;
      if (url.hostname === host || url.hostname.replace(/^www\./, '') === host.replace(/^www\./, '')) return { engine, keyword, state: 'found', position: index + 1, url: url.href, checkedAt, source, message: '' };
    } catch { opaque = true; }
  }
  return { engine, keyword, state: rows.length >= 10 && urls.length >= 10 && !opaque ? 'not_found' : 'failed', position: null, url: '', checkedAt, source, message: rows.length >= 10 && urls.length >= 10 && !opaque ? '本次前10条结果未命中' : '结果不足或无法验证落地地址，不能判断排名' };
}
