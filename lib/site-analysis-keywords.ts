import type { SiteKeyword, SitePage, SiteProfile } from './site-analysis';

type KeywordContext = {
  profile?: Partial<Pick<SiteProfile, 'title' | 'description' | 'industry'>>;
  pages?: Partial<Pick<SitePage, 'status' | 'title' | 'description' | 'declared' | 'h1'>>[];
};

const genericWords = new Set('正在 使用 说明 信息 适合 当前 短期 长期 会员 订单 商品 购买 开通 自动 交付 邮箱 立即 在线 免费 优惠 支持 了解 相关 详情 页面 系统 时间 功能 产品 租用 套餐 工具 use using information details current account member order product purchase delivery email online free support help now new pro'.split(' '));
const industryTerms = new Map<string, string[]>([
  ['电子商务', ['电商', '购物', '商城', '零售', '批发', '数字商品', 'ecommerce', 'shopping', 'retail', 'wholesale']],
  ['软件与技术', ['软件', '开发', '编程', '人工智能', 'ai', 'chatgpt', 'claude', 'saas', 'api', 'software', 'developer', 'programming']],
  ['教育培训', ['教育', '培训', '课程', '教学', '学习', 'education', 'training', 'course', 'learning']],
  ['金融财经', ['金融', '财经', '投资', '理财', '交易', 'finance', 'investment', 'trading']],
  ['医疗健康', ['医疗', '健康', '诊疗', '医院', 'health', 'medical', 'healthcare']],
]);
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

// Reorder observed candidates only. Evidence is bounded so repeated boilerplate
// cannot outweigh site metadata; scores and source records remain unchanged.
export function prioritizeSiteKeywords(keywords: SiteKeyword[], context: KeywordContext = {}): SiteKeyword[] {
  const pages = (context.pages || []).filter(page => page.status === undefined || page.status >= 200 && page.status < 300);
  const home = pages[0], profile = context.profile || {};
  const title = normalize(profile.title || home?.title || ''), description = normalize(profile.description || home?.description || '');
  const headings = (home?.h1 || []).map(normalize);
  const pageTitles = pages.slice(1).map(page => normalize(page.title || ''));
  const pageHeadings = pages.slice(1).flatMap(page => (page.h1 || []).map(normalize));
  const declared = new Set(pages.flatMap(page => (page.declared || []).map(normalize)));
  const industry = normalize(profile.industry || ''), terms = industryTerms.get(profile.industry || '') || [];
  return keywords.map((keyword, index) => {
    const word = normalize(keyword.word);
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(`${/^[a-z0-9]/.test(word) ? '(?:^|[^a-z0-9])' : ''}${escaped}${/[a-z0-9]$/.test(word) ? '(?=$|[^a-z0-9])' : ''}`, 'u');
    const matches = (text: string) => Boolean(word) && expression.test(text);
    const manual = keyword.kind === 'manual' || keyword.sources?.some(source => source.kind === 'manual');
    const explicit = declared.has(word) || keyword.kind === 'declared' || keyword.sources?.some(source => source.kind === 'declared');
    let relevance = (matches(title) ? 60 : 0) + (matches(description) ? 35 : 0);
    relevance += headings.some(matches) ? 45 : 0;
    relevance += Math.min(3, pageTitles.filter(matches).length) * 12;
    relevance += Math.min(3, pageHeadings.filter(matches).length) * 8;
    if (matches(industry) || terms.some(term => matches(normalize(term)))) relevance += 20;
    if (genericWords.has(word)) relevance *= .1;
    const evidence = Math.log1p(Math.max(0, Math.min(10000, Number(keyword.score) || 0)));
    return { keyword, index, priority: (manual ? 1000 : explicit ? 500 : 0) + relevance + evidence };
  }).sort((a, b) => b.priority - a.priority || a.index - b.index).map(item => item.keyword);
}
