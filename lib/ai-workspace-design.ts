// Local sample data for the interface prototype. No platform or model is called.
export type WorkspaceView = 'collect' | 'social' | 'marketing' | 'website' | 'leads' | 'customers' | 'history';
export type LocalizedText = { zh: string; en: string };
export type ProspectStatus = 'new' | 'qualified' | 'followup' | 'converted';
export type WorkspaceProspect = {
  id: string; name: string; industry: LocalizedText; region: LocalizedText; platform: string;
  interest: LocalizedText; status: ProspectStatus; score: number; email: string; note: string;
};
export const workspaceAgents = [
  {
    key: 'collect', avatar: 'market-advisor', zh: 'AI智能获客', en: 'AI prospecting',
    roleZh: '市场拓展智能体', roleEn: 'Market intelligence agent',
    detailZh: '拆解目标市场，协同跨平台检索与高意向线索筛选。',
    detailEn: 'Plan market discovery and qualify high-intent leads.',
    skillsZh: ['关键词分析', '精准筛选', '线索归集'], skillsEn: ['Keywords', 'Qualification', 'Lead capture'],
  },
  {
    key: 'social', avatar: 'content-strategist', zh: 'AI新媒体运营', en: 'AI social media',
    roleZh: '内容运营智能体', roleEn: 'Content operations agent',
    detailZh: '统筹品牌选题、内容创作与多平台自动化发布计划。',
    detailEn: 'Coordinate brand content and publishing workflows.',
    skillsZh: ['选题策划', '内容生成', '发布排期'], skillsEn: ['Ideation', 'Content', 'Scheduling'],
  },
  {
    key: 'marketing', avatar: 'campaign-advisor', zh: 'AI自动化营销', en: 'AI marketing',
    roleZh: '营销协同智能体', roleEn: 'Marketing workflow agent',
    detailZh: '结合客户画像，编排精准触达、会话互动与持续跟进。',
    detailEn: 'Orchestrate outreach, conversations and follow-up.',
    skillsZh: ['策略编排', '会话协同', '客户跟进'], skillsEn: ['Outreach', 'Conversations', 'Follow-up'],
  },
  {
    key: 'website', avatar: 'website-architect', zh: 'AI智能建站', en: 'AI website builder',
    roleZh: '品牌建站智能体', roleEn: 'Website experience agent',
    detailZh: '理解企业资料，规划多语言品牌网站与获客落地页。',
    detailEn: 'Plan multilingual brand sites and conversion pages.',
    skillsZh: ['网站规划', '多语言', '线索承接'], skillsEn: ['Site planning', 'Languages', 'Conversion'],
  },
] as const;

export const sampleProspects: WorkspaceProspect[] = [
  { id: 'sample-ev', name: 'Northstar Mobility · 示例', industry: { zh: '电动车', en: 'Electric mobility' }, region: { zh: '东南亚', en: 'Southeast Asia' }, platform: 'Facebook', interest: { zh: '寻找电动车零配件与渠道合作伙伴', en: 'EV components and distribution partnerships' }, status: 'qualified', score: 92, email: 'mobility@example.com', note: '' },
  { id: 'sample-med', name: 'Clearview Medical · 示例', industry: { zh: '眼科设备', en: 'Ophthalmic equipment' }, region: { zh: '中国国内', en: 'China' }, platform: '1688', interest: { zh: '关注眼科诊断设备与供应链合作', en: 'Diagnostic equipment and supply-chain partnerships' }, status: 'new', score: 86, email: 'medical@example.com', note: '' },
  { id: 'sample-trade', name: 'Horizon Trading · 示例', industry: { zh: '国际贸易', en: 'International trade' }, region: { zh: '欧洲', en: 'Europe' }, platform: 'Alibaba.com', interest: { zh: '筛选具有出口经验的制造商', en: 'Discovering manufacturers with export experience' }, status: 'followup', score: 89, email: 'trading@example.com', note: '' },
  { id: 'sample-retail', name: 'Urban Retail · 示例', industry: { zh: '消费零售', en: 'Consumer retail' }, region: { zh: '北美', en: 'North America' }, platform: 'TikTok', interest: { zh: '关注新品内容与品牌分销合作', en: 'Product discovery and brand distribution' }, status: 'new', score: 81, email: 'retail@example.com', note: '' },
];

export const sampleCustomers: WorkspaceProspect[] = [
  { ...sampleProspects[0], id: 'customer-ev', name: 'Evergreen Distribution · 示例', email: 'evergreen@example.com', status: 'converted', note: '' },
  { ...sampleProspects[2], id: 'customer-trade', name: 'Atlas Industry · 示例', email: 'atlas@example.com', status: 'converted' },
  { ...sampleProspects[1], id: 'customer-med', name: 'Summit Vision · 示例', email: 'summit@example.com', status: 'converted' },
];

export function convertProspect(customers: WorkspaceProspect[], prospect: WorkspaceProspect) {
  if (customers.some(customer => customer.id === prospect.id || prospect.email && customer.email.toLowerCase() === prospect.email.toLowerCase())) return customers;
  return [{ ...prospect, status: 'converted' as const }, ...customers];
}

export function filterProspects(records: WorkspaceProspect[], search: string, status: string, locale: string) {
  const needle = search.trim().toLocaleLowerCase();
  return records.filter(record => (status === 'all' || record.status === status)
    && [record.name, record.platform, locale === 'en' ? record.industry.en : record.industry.zh, record.email].join(' ').toLocaleLowerCase().includes(needle));
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function websitePreview(input: { brand: string; business: string; description: string; language: string; style: string; kind: string }) {
  const en = input.language === 'en', brand = escapeHtml(input.brand.trim() || (en ? 'Your Brand' : '你的品牌'));
  const business = escapeHtml(input.business.trim() || (en ? 'Products and services' : '产品与服务'));
  const description = escapeHtml(input.description.trim() || (en ? 'Discover our products, expertise and partnership opportunities.' : '了解我们的产品、专业能力与合作机会。'));
  const accent = input.style === 'teal' ? '#087e83' : input.style === 'navy' ? '#1c3658' : '#2563eb';
  const headline = input.kind === 'landing' ? (en ? 'Your next opportunity starts here.' : '让每一次了解，都成为合作的开始。') : input.kind === 'trade' ? (en ? 'Quality products. Global partnerships.' : '以优质产品，连接全球合作伙伴。') : (en ? 'Expertise that moves your business forward.' : '以专业产品，连接更广阔的市场。');
  return '<!doctype html><html lang="' + (en ? 'en' : 'zh-CN') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;color:#17314f;font:15px/1.8 system-ui,sans-serif;background:#fff}*{box-sizing:border-box}header{padding:20px 6%;border-bottom:1px solid #e4ebf3;display:flex;justify-content:space-between;gap:20px;align-items:center}header b{font-size:20px}nav{font-size:13px;color:#657b93}main{padding:64px 8%;background:#f2f7fc}.eyebrow{font-size:12px;color:' + accent + ';font-weight:700}h1{font-size:clamp(28px,4vw,46px);line-height:1.4;max-width:700px;margin:18px 0}p{max-width:640px;color:#657b93}.cta{display:inline-block;padding:11px 24px;background:' + accent + ';color:#fff;border-radius:6px;margin-top:16px}section{padding:34px 8%}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}article{border-top:2px solid ' + accent + ';padding:16px 0}h2{font-size:23px}h3{font-size:17px}footer{padding:20px 8%;background:#17314f;color:#dbe8f7;font-size:12px}@media(max-width:520px){main{padding:38px 7%}nav{display:none}.grid{grid-template-columns:1fr}}</style></head><body><header><b>' + brand + '</b><nav>' + (en ? 'Home　 Products　 About　 Contact' : '首页　 产品服务　 关于我们　 联系我们') + '</nav></header><main><span class="eyebrow">' + business + '</span><h1>' + headline + '</h1><p>' + description + '</p><span class="cta">' + (en ? 'Explore our solutions' : '了解合作方案') + '</span></main><section><h2>' + (en ? 'Built around your needs' : '围绕你的需求，提供专业支持') + '</h2><div class="grid">' + (en ? ['Product expertise', 'Flexible partnerships', 'Dedicated support'] : ['专业产品方案', '灵活合作方式', '持续服务支持']).map(title => '<article><h3>' + title + '</h3><p>' + business + ' · ' + (en ? 'Discover solutions for your business.' : '为你的业务提供清晰的解决方案。') + '</p></article>').join('') + '</div></section><footer>' + brand + ' · ' + (en ? 'Website design preview' : '网站设计预览') + '</footer></body></html>';
}
