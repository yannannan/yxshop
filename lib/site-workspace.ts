export const workspacePages = {
  sites: { label: '站点管理', description: '配置域名、安装脚本与验证，统一管理站点接入。' },
  overview: { label: '综合看板', description: '从域名档案到搜索表现，记录每一次分析与变化。' },
  realtime: { label: '实时访客', description: '查看最近访问与采集状态，了解站点当前的访问活动。' },
  traffic: { label: '流量分析', description: '查看访问规模、变化趋势和渠道来源。' },
  pages: { label: '页面与行为', description: '通过页面标题与路径，了解页面内容和访问表现。' },
  seo: { label: 'SEO搜索分析', description: '集中查看搜索表现、关键词与排名、页面收录。' },
  conversions: { label: '转化与营收', description: '连接咨询、注册、订单与支付，分析转化链路。' },
  health: { label: '网站健康与性能', description: '检查页面响应、内容问题和网站体验。' },
  crawlers: { label: '搜索爬虫', description: '接入服务器访问日志，查看搜索爬虫的抓取记录。' },
  backlinks: { label: '外链分析', description: '分析外部引用页面、引用域名及链接变化。' },
  competitors: { label: '竞品分析', description: '比较目标网站的关键词、内容和竞争机会。' },
  content: { label: '内容运营', description: '整理已采集页面，发现内容缺口与优化任务。' },
  assistant: { label: 'AI SEO助手', description: '汇总优化事项，为后续AI分析提供依据。' },
  alerts: { label: '智能预警', description: '集中查看已发现的问题，规划持续监测和通知。' },
  history: { label: '分析记录与报表', description: '查看已保存的报告，保留每一次分析的结果。' },
  leads: { label: '线索总览', description: '汇总站点产生的咨询、有效线索及转化。' },
  'lead-management': { label: '线索管理', description: '统一管理主动提交的咨询、注册和客户线索。' },
  'lead-advice': { label: 'AI获客建议', description: '结合访问与转化，寻找可执行的获客机会。' },
  'lead-followup': { label: '跟进记录', description: '记录线索负责人、跟进过程和转化结果。' },
} as const;
export type WorkspaceView = keyof typeof workspacePages;
export const workspaceGroups: { id: string; label: string; view?: WorkspaceView; children?: WorkspaceView[] }[] = [
  { id: 'sites', label: '站点管理', view: 'sites' },
  { id: 'overview', label: '综合看板', view: 'overview' },
  { id: 'analysis', label: '站点分析', children: ['realtime','traffic','pages','seo','conversions','health','crawlers','backlinks','competitors'] },
  { id: 'operations', label: '运营工具', children: ['content','assistant','alerts','history'] },
  { id: 'acquisition', label: 'AI智能获客', children: ['leads','lead-management','lead-advice','lead-followup'] },
];
export function workspaceGroup(view: WorkspaceView) { return workspaceGroups.find(group => group.view === view || group.children?.includes(view))!; }
export function workspaceView(search: string): WorkspaceView {
  const query = new URLSearchParams(search), value = query.get('view') || '';
  if (Object.hasOwn(workspacePages, value)) return value as WorkspaceView;
  return query.get('run') ? 'overview' : 'sites';
}
export function workspaceHref(href: string, view: WorkspaceView, run?: string, site?: string) {
  const url = new URL(href); url.searchParams.set('view',view); url.hash = '';
  if (run !== undefined) { if (run) url.searchParams.set('run',run); else url.searchParams.delete('run'); }
  if (site !== undefined) { if (site) url.searchParams.set('site',site); else url.searchParams.delete('site'); }
  return url.pathname + url.search;
}
