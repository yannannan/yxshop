'use client';
import { useEffect, useState } from 'react';
import type { ToolAnalytics, ToolMetrics } from '../lib/tool-analytics';
const number = (value: number) => value.toLocaleString('zh-CN');
const time = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
function Metrics({ item, clicksReady }: { item: ToolMetrics; clicksReady: boolean }) {
  return <><td>{clicksReady ? number(item.clicks) : '未启用'}</td><td>{clicksReady ? number(item.views) : '未启用'}</td><td>{clicksReady ? number(item.featureClicks) : '未启用'}</td><td>{number(item.users)}</td><td>{number(item.uses)}</td><td className="tool-stat-points">{number(item.points)}</td><td>{time(item.lastUsed)}</td></>;
}
export function ToolStatistics() {
  const [period, setPeriod] = useState('all'), [filter, setFilter] = useState(''), [data, setData] = useState<ToolAnalytics | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/tool-statistics?period=${period}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json() as ToolAnalytics & { message?: string }; if (!response.ok) throw Error(result.message || '统计读取失败');
      if (!controller.signal.aborted) setData(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, version]);
  function reload() { setLoading(true); setError(''); setVersion(value => value + 1); }
  const cards = data ? [['入口点击', data.totals.clicks], ['使用人数', data.totals.users], ['完成次数', data.totals.uses], ['消耗积分', data.totals.points]] as const : [];
  return <section className="tool-statistics" aria-labelledby="tool-stat-title">
    <div className="tool-stat-heading"><div><h3 id="tool-stat-title">工具使用统计</h3><p>按工具和功能查看点击、使用与真实积分消耗。</p></div><div className="tool-stat-filters">
      <label>统计周期<select value={period} onChange={event => { setPeriod(event.target.value); setLoading(true); setError(''); }}><option value="all">全部时间</option><option value="today">今天</option><option value="7">近7天</option><option value="30">近30天</option></select></label>
      <label>工具<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">全部工具</option>{data?.tools.map(tool => <option key={tool.slug} value={tool.slug}>{tool.name}</option>)}</select></label>
      <button type="button" disabled={loading} onClick={reload}>刷新统计</button>
    </div></div>
    {error && <p className="product-editor-error" role="alert">{error}</p>}
    {loading ? <p className="tool-stat-empty" role="status">正在读取工具统计…</p> : data && !error && <>
      <div className="tool-stat-cards">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{label === '入口点击' && !data.clicksReady ? '未启用' : number(value)}</strong><small>全部工具 · {period === 'all' ? '累计数据' : '所选期间'}</small></article>)}</div>
      {data.warnings.length > 0 && <div className="tool-stat-notes" role="status">{data.warnings.map(message => <p key={message}>{message}</p>)}</div>}
      <div className="table-wrap"><table className="tool-stat-table"><thead><tr><th>工具 / 功能</th><th>入口点击</th><th>页面访问</th><th>功能点击</th><th>使用人数</th><th>完成次数</th><th>消耗积分</th><th>最近使用</th></tr></thead>
        <tbody>{data.tools.filter(tool => !filter || tool.slug === filter).map(tool => <ToolRows key={tool.slug} tool={tool} expanded={Boolean(expanded[tool.slug])} clicksReady={data.clicksReady}
          toggle={() => setExpanded(previous => ({ ...previous, [tool.slug]: !previous[tool.slug] }))} />)}</tbody></table></div>
      {!data.tools.length && <p className="tool-stat-empty">暂无工具</p>}
      <div className="tool-stat-footnotes"><p>完成次数以已保存的成品、分析报告或服务端成功记录为准；预览、失败和重复下载不计入。使用人数按账号去重，不等于在线人数；匿名且未保存的制作不计入。</p>
        <p>消耗积分来自真实扣分流水，免费、套餐及按次权益使用不会计成积分消费。手印单独归属，不与文件签名重复累计。点击从接入后开始记录，可能受浏览器拦截影响。</p>
        <small>更新时间：{time(data.generatedAt)} · 按北京时间统计</small></div>
    </>}
  </section>;
}
function ToolRows({ tool, expanded, clicksReady, toggle }: { tool: ToolAnalytics['tools'][number]; expanded: boolean; clicksReady: boolean; toggle: () => void }) {
  return <><tr><th scope="row"><button type="button" className="text-action tool-stat-expand" onClick={toggle} aria-expanded={expanded} aria-controls={`tool-stat-${tool.slug}`}>{expanded ? '▾' : '▸'} {tool.name}</button></th><Metrics item={tool} clicksReady={clicksReady} /></tr>
    {expanded && <tr className="tool-stat-detail"><td colSpan={8}><div id={`tool-stat-${tool.slug}`} className="table-wrap"><table><thead><tr><th>功能</th><th>入口点击</th><th>页面访问</th><th>功能点击</th><th>使用人数</th><th>完成次数</th><th>消耗积分</th><th>最近使用</th></tr></thead><tbody>{tool.modules.map(module => <tr key={module.key}><th scope="row">{module.name}</th><Metrics item={module} clicksReady={clicksReady} /></tr>)}</tbody></table>{!tool.modules.length && <p>尚无功能使用记录</p>}</div></td></tr>}
  </>;
}
