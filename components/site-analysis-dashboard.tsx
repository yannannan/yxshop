'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdjustmentsHorizontalIcon, ArrowDownTrayIcon, ArrowLeftIcon, ArrowPathIcon, ArrowRightIcon, ChartBarIcon, ChartPieIcon, CheckCircleIcon, ClockIcon, DocumentChartBarIcon, ExclamationTriangleIcon, GlobeAltIcon, InformationCircleIcon, MagnifyingGlassIcon, MinusCircleIcon, PrinterIcon, ShieldCheckIcon, Squares2X2Icon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { notifyAccountChanged, useAccount } from '../lib/account-client';
import { accountLoginHref } from '../lib/account';
import { engineDefinitions, engineSearchUrl, siteRunLabels, stageLabels, type AnalysisSite, type EngineId, type SiteReport, type SiteRun } from '../lib/site-analysis';
import { toolPagePath, type ToolService } from '../lib/tool-services';
import { siteAnalysisRequest as api } from '../lib/site-analysis-client';
import { SiteAnalysisProfile } from './site-analysis-profile';
import { SearchEngineIdentity } from './search-engine-identity';
import { SiteAnalysisOverviewPanels } from './site-analysis-overview-panels';
import { prioritizeSiteKeywords } from '../lib/site-analysis-keywords';

type Workspace = { authenticated: boolean; sites: AnalysisSite[]; history: SiteRun[]; total: number; page: number; workerReady: boolean; access: { canAnalyze: boolean; chargeType: string; pointsCost: number; balance: number | null; hasMembership: boolean } };
const kinds: Record<string, string> = { all: '全部来源', declared: '网站设置词', content: '内容提取词', manual: '用户添加词', search: '搜索发现词' };
const stepNames: Record<string, string> = { dns: '域名解析', registration: '注册信息', pages: '网站页面', keywords: '网站关键词', ...Object.fromEntries(engineDefinitions.map(engine => [`engine:${engine.id}`, engine.name])), report: '生成报告', billing: '权益结算' };
const safeLink = (value: string) => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };
/* eslint-disable @next/next/no-html-link-for-pages -- 工具工作台的跨页导航沿用项目原生链接约定。 */
export function SiteAnalysisDashboard({ tool }: { tool: ToolService }) {
  const { t, locale } = useI18n(), { account, loading: accountLoading } = useAccount();
  const owner = account?.authenticated ? account.user?.id : undefined;
  const [view, setView] = useState<'overview' | 'history' | 'sites'>('overview');
  const [siteId, setSiteId] = useState(''), [runId, setRunId] = useState(''), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [workspace, setWorkspace] = useState<{ owner?: number; data: Workspace | null }>({ data: null });
  const [record, setRecord] = useState<{ owner?: number; run: SiteRun | null }>({ run: null });
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [domain, setDomain] = useState('');
  const [maxPages, setMaxPages] = useState(20), [engines, setEngines] = useState<EngineId[]>(engineDefinitions.map(engine => engine.id)), [manual, setManual] = useState('');
  const [engineGroup, setEngineGroup] = useState('all'), [keywordFilter, setKeywordFilter] = useState('all'), [keywordSearch, setKeywordSearch] = useState(''), [keywordPage, setKeywordPage] = useState(1);
  const [issueLimit, setIssueLimit] = useState(20);
  const post = useRef<{ key: string; id: string } | null>(null), identity = useRef(owner), requestVersion = useRef(0), draftTouched = useRef(false);
  useEffect(() => {
    const changed = identity.current !== owner && identity.current !== undefined; identity.current = owner; requestVersion.current++; post.current = null; draftTouched.current = false;
    void Promise.resolve().then(() => { setPending(false); if (changed) { setSiteId(''); setRunId(''); setDomain(''); setRecord({ run: null }); setWorkspace({ data: null }); setError(''); } });
  }, [owner]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('run'); if (id) void Promise.resolve().then(() => setRunId(id)); }, []);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    void api<Workspace>(`?tool=${tool.id}&page=${page}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted || identity.current !== owner) return;
      setWorkspace({ owner, data }); setError('');
      setRunId(current => current || data.history?.[0]?.id || '');
    }).catch(e => { if (!controller.signal.aborted) { setWorkspace({ owner, data: null }); setError(e.message); } });
    return () => controller.abort();
  }, [owner, tool.id, page, revision]);
  useEffect(() => {
    if (!owner || !runId) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await api<{ run: SiteRun }>(`?tool=${tool.id}&run=${encodeURIComponent(runId)}`, { signal: controller.signal });
        if (controller.signal.aborted || identity.current !== owner) return;
        setRecord({ owner, run: data.run }); setError('');
        if (['queued','running'].includes(data.run.status)) timer = setTimeout(load, 3000);
        else { setRevision(n => n + 1); if (data.run.charged) notifyAccountChanged(); }
      } catch (e) { if (!controller.signal.aborted) { setError((e as Error).message); timer = setTimeout(load, 10000); } }
    };
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [owner, tool.id, runId]);
  const data = workspace.owner === owner ? workspace.data : null;
  const run = record.owner === owner && record.run?.id === runId ? record.run : null, report = run?.report;
  const busy = pending || Boolean(run && ['queued','running'].includes(run.status));
  useEffect(() => {
    if (!run || draftTouched.current) return;
    let active = true;
    const site = data?.sites.find(item => item.id === run.siteId);
    void Promise.resolve().then(() => {
      if (!active || draftTouched.current || identity.current !== owner) return;
      setSiteId(run.siteId); setDomain(site?.url || `https://${run.host}`);
    });
    return () => { active = false; };
  }, [run, data?.sites, owner]);
  const date = (value: string) => { const stamp = new Date(value); return Number.isFinite(stamp.getTime()) ? stamp.toLocaleString(locale, { timeZone: 'Asia/Shanghai', hour12: false }) : t('尚未采集'); };
  const selectSite = (id: string) => { const site = data?.sites.find(item => item.id === id); draftTouched.current = true; setSiteId(site?.id || ''); setDomain(site?.url || ''); post.current = null; };
  const chooseRun = (id: string) => { requestVersion.current++; setPending(false); setRunId(id); setView('overview'); const target = data?.history.find(item => item.id === id); if (target) { draftTouched.current = true; setSiteId(target.siteId); setDomain(data?.sites.find(site => site.id === target.siteId)?.url || `https://${target.host}`); } const url = new URL(window.location.href); url.searchParams.set('run', id); window.history.replaceState(null, '', url); };
  async function markIssue(code: string, url: string, state: string) {
    if (!run || !owner) return;
    const version = ++requestVersion.current; setPending(true);
    try {
      const result = await api<{ run: SiteRun }>('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue', tool: tool.id, run: run.id, code, url, state }) });
      if (identity.current === owner && requestVersion.current === version) setRecord({ owner, run: result.run });
    } catch (e) { if (identity.current === owner && requestVersion.current === version) setError((e as Error).message); }
    finally { if (identity.current === owner && requestVersion.current === version) setPending(false); }
  }
  async function analyze(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const target = domain.trim();
    if (!target) { setError('请输入域名或选择已有站点'); return; }
    const options = { maxPages, engines, keywords: manual.split(/[,，\n]/).map(w => w.trim()).filter(Boolean), language: locale, device: 'desktop' };
    const key = JSON.stringify({ target, options, owner });
    if (post.current?.key !== key) post.current = { key, id: crypto.randomUUID() };
    const version = ++requestVersion.current; setPending(true); setError('');
    try {
      const result = await api<{ run: SiteRun }>('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: post.current.id, tool: tool.id, domain: target, options }) });
      if (identity.current !== owner || requestVersion.current !== version) return;
      setRecord({ owner, run: result.run }); setSiteId(result.run.siteId); setPage(1); chooseRun(result.run.id); setRevision(n => n + 1); post.current = null;
    } catch (e) { if (identity.current === owner) setError((e as Error).message); }
    finally { if (identity.current === owner) setPending(false); }
  }
  function exportReport() {
    if (!report || !run) return;
    const file = new Blob([JSON.stringify({ id: run.id, status: run.status, report }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = `${run.host}-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const showHistory = () => setView('history');
  const filteredKeywords = report ? prioritizeSiteKeywords(report.keywords, report).filter(k => (keywordFilter === 'all' || k.sources.some(s => s.kind === keywordFilter)) && k.word.toLowerCase().includes(keywordSearch.toLowerCase())) : [];
  const wordsPage = Math.max(1, Math.min(Math.ceil(filteredKeywords.length / 10) || 1, keywordPage));
  const panels = [
    { key: 'overview', label: '综合看板', icon: Squares2X2Icon }, { key: 'keywords', label: '关键词挖掘', icon: MagnifyingGlassIcon }, { key: 'rankings', label: '搜索排名', icon: ChartBarIcon }, { key: 'competitors', label: '竞品对比', icon: ChartPieIcon }, { key: 'history', label: '分析记录', icon: DocumentChartBarIcon }, { key: 'sites', label: '站点管理', icon: WrenchScrewdriverIcon },
  ];
  return <div className="seo-workspace">
    <aside className="seo-sidebar"><div className="seo-sidebar-heading"><span>SEO WORKSPACE</span><h2>{t('站长分析工具')}</h2></div>
      <nav aria-label={t('站长分析导航')}>{panels.map(item => { const enabled = ['overview','history','sites'].includes(item.key); return <button key={item.key} className={view === item.key ? 'active' : ''} disabled={!enabled} aria-current={view === item.key ? 'page' : undefined} title={!enabled ? t('后续模块，待功能设计') : undefined} onClick={() => setView(item.key as typeof view)}><item.icon aria-hidden="true" /><span>{t(item.label)}</span>{!enabled && <small>{t('筹备中')}</small>}</button>; })}</nav>
      <a className="seo-return" href="/tools"><ArrowLeftIcon aria-hidden="true" />{t('返回工具服务')}</a>
    </aside>
    <main className="seo-main"><nav className="seo-breadcrumb" aria-label={t('面包屑')}><a href="/">{t('首页')}</a><span>/</span><a href="/tools">{t('工具服务')}</a><span>/</span><span>{t('站长分析工具')}</span></nav>
      <div className="seo-title-row"><div><span className="seo-eyebrow">WEBSITE INTELLIGENCE</span><h1>{t(view === 'history' ? '分析记录' : view === 'sites' ? '站点管理' : '综合看板')}</h1><p>{t('从域名档案到搜索表现，记录每一次分析与变化。')}</p></div><button className="seo-quiet" onClick={() => setRevision(n => n + 1)}><ArrowPathIcon aria-hidden="true" />{t('刷新记录')}</button></div>
      {error && <p className="seo-alert" role="alert">{t(error)}<button onClick={() => setRevision(n => n + 1)}>{t('重试读取')}</button></p>}
      {!owner ? <section className="seo-card seo-welcome"><GlobeAltIcon aria-hidden="true" /><h2>{t('从一个域名，了解你的网站')}</h2><p>{t('登录后输入网站地址，采集公开信息、生成综合报告，并保存分析历史。')}</p><a className="seo-primary" href={accountLoginHref(toolPagePath(tool.slug))}>{t(accountLoading ? '正在读取账户…' : '登录并开始分析')}</a><div className="seo-welcome-steps"><span>{t('域名档案')}</span><span>{t('关键词概况')}</span><span>{t('各引擎表现')}</span><span>{t('运营建议')}</span></div></section> : <>
      <form className="seo-card seo-controls seo-console" onSubmit={analyze} aria-labelledby="seo-conditions-title">
        <div className="seo-console-heading"><span className="seo-heading-icon"><AdjustmentsHorizontalIcon aria-hidden="true" /></span><div><h2 id="seo-conditions-title">{t('分析条件')}</h2><p>{t('选择网站会填入完整地址，点击分析按钮后才创建分析任务。')}</p></div></div>
        <div className="seo-conditions-body">
          <div className="seo-domain-row">
            <label>{t('选择网站')}<select aria-label={t('选择已有站点')} value={siteId} onChange={e => selectSite(e.target.value)}><option value="">{t('选择已有站点')}</option>{data?.sites.map(site => <option value={site.id} key={site.id}>{site.host}</option>)}</select></label>
            <label>{t('最多采集页面')}<select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}>{[5,20,50].map(n => <option key={n} value={n}>{n} {t('页')}</option>)}</select></label>
            <label className="seo-domain-input">{t('网站地址')}<input type="text" autoComplete="url" placeholder="https://example.com" value={domain} maxLength={2048} onChange={e => { draftTouched.current = true; setDomain(e.target.value); setSiteId(''); }} /></label>
            <label className="seo-priority-keywords">{t('重点查询关键词（可选）')}<input value={manual} onChange={e => setManual(e.target.value)} placeholder={t('例如：AI获客、网站分析；最多20个')} aria-describedby="seo-keyword-purpose" /></label>
            <button className="seo-primary" type="submit" disabled={busy || !data?.access.canAnalyze || data.workerReady === false}><MagnifyingGlassIcon aria-hidden="true" />{t(busy ? '正在分析…' : run ? '重新分析' : '开始分析')}<ArrowRightIcon aria-hidden="true" /></button>
          </div>
          <p className="seo-keyword-help" id="seo-keyword-purpose">{t('填写你关心的搜索词，优先用于排名查询；留空则自动提取，不会修改网站的关键词设置。每轮最多查询前5个重点词。')}</p>
        {data && !data.access.canAnalyze && <p className="seo-inline-note">{t(data.access.chargeType === 'pending' ? '收费方式待确认，暂未开放分析' : data.access.chargeType === 'points' ? '积分不足，请充值后分析' : '暂无有效套餐，请购买后分析')}<a href={data.access.chargeType === 'points' ? '/points' : `/product/${tool.id}`}>{t('查看权益')}</a></p>}
        {data?.access.chargeType === 'points' && <p className="seo-inline-note">{t('剩余积分')}：{data.access.balance ?? '—'} · {t('每份完整报告')}：{data.access.pointsCost} {t('积分')}{data.access.hasMembership && ` · ${t('有效套餐优先使用')}`}</p>}
        {data?.workerReady === false && <p className="seo-alert">{t('采集进程尚未就绪，请管理员检查站长采集日志')}</p>}
        <details className="seo-options" open>
          <summary>{t('分析范围与搜索引擎')}</summary>
          <fieldset className="seo-engine-selection" aria-describedby="seo-engine-purpose">
            <legend>{t('搜索引擎查询')}</legend>
            <p className="seo-engine-selection-meta"><span>{t('默认全选，可按需取消')}</span><span>{t(`已选 ${engines.length} 个引擎`)}</span></p>
            <div className="seo-engine-options">{engineDefinitions.map(engine => <label key={engine.id} className="seo-check"><SearchEngineIdentity engine={engine} showDomain /><input type="checkbox" checked={engines.includes(engine.id)} onChange={e => setEngines(old => e.target.checked ? [...old, engine.id] : old.filter(id => id !== engine.id))} /></label>)}</div>
          </fieldset>
          <p className="seo-query-note" id="seo-engine-purpose"><InformationCircleIcon aria-hidden="true" /><span>{t('每个引擎最多查询5个关键词、前10条自然结果；受访问规则或验证限制时，会保留原因。排名仅代表本次采集节点观测，不代表所有地区。')}</span></p>
        </details>
        </div>
        <div className="seo-control-meta"><span><ClockIcon aria-hidden="true" />{t('最近分析')}：{run ? date(run.createdAt) : t('尚未采集')}</span><span><ShieldCheckIcon aria-hidden="true" />{t('完整报告成功后使用权益，部分完成或失败不扣费。')}</span></div>
      </form>
      {view === 'history' ? <section className="seo-card"><div className="seo-section-title"><div><h2>{t('历史分析报告')}</h2><p>{t('每次分析独立保存，打开历史记录不会重新采集或扣费。')}</p></div><span>{data?.total ?? '—'} {t('份报告')}</span></div><div className="seo-table-wrap"><table><thead><tr><th>{t('网站')}</th><th>{t('分析时间')}</th><th>{t('状态')}</th><th>{t('积分消耗')}</th><th>{t('操作')}</th></tr></thead><tbody>{data?.history.map(item => <tr key={item.id}><td><strong>{item.host}</strong><small>{item.id.slice(0,8)}</small></td><td>{date(item.createdAt)}</td><td><span className={`seo-status ${item.status}`}>{t(siteRunLabels[item.status])}</span></td><td>{item.pointsSpent}</td><td><button className="seo-text-button" onClick={() => chooseRun(item.id)}>{t('查看报告')}</button></td></tr>)}</tbody></table></div>{!data?.history.length && <p className="seo-empty">{t('暂无分析记录，输入域名开始第一份报告。')}</p>}<div className="seo-pagination"><button disabled={page <= 1} onClick={() => setPage(n => n - 1)}>{t('上一页')}</button><span>{data?.page || 1} / {Math.max(1, Math.ceil((data?.total || 0) / 10))}</span><button disabled={page * 10 >= (data?.total || 0)} onClick={() => setPage(n => n + 1)}>{t('下一页')}</button></div></section> : view === 'sites' ? <section className="seo-card"><div className="seo-section-title"><div><h2>{t('我的站点')}</h2><p>{t('输入域名并完成任务创建后，站点会自动保存。')}</p></div></div><div className="seo-sites">{data?.sites.map(site => <button key={site.id} onClick={() => { selectSite(site.id); setView('overview'); }}><GlobeAltIcon aria-hidden="true" /><strong>{site.host}</strong><small>{date(site.updatedAt)}</small><span>{t('选择并填入地址')}</span></button>)}</div>{!data?.sites.length && <p className="seo-empty">{t('暂无站点，请在上方输入域名开始分析。')}</p>}</section> : <>
        {run && <section className="seo-card seo-run-state seo-console" aria-live="polite" aria-labelledby="seo-run-title">
          <div className="seo-section-title"><div className="seo-run-identity"><span className="seo-heading-icon"><DocumentChartBarIcon aria-hidden="true" /></span><div><span className="seo-eyebrow">{t('任务进度与导出')}</span><h2 id="seo-run-title">{run.host}</h2></div></div><div className="seo-report-actions"><span className={`seo-status ${run.status}`}>{t(siteRunLabels[run.status])}</span><button className="seo-quiet" onClick={exportReport} disabled={!report || busy}><ArrowDownTrayIcon aria-hidden="true" />{t('导出JSON')}</button><button className="seo-quiet" onClick={() => window.print()} disabled={!report || busy}><PrinterIcon aria-hidden="true" />{t('打印报告')}</button></div></div>
          <dl className="seo-report-meta"><div><dt>{t('报告编号')}</dt><dd>{run.id.slice(0,8)}</dd></div><div><dt>{t('分析时间')}</dt><dd>{date(run.createdAt)}</dd></div><div><dt>{t('权益结算')}</dt><dd>{t(run.pointsSpent ? `已使用 ${run.pointsSpent} 积分` : run.status === 'completed' ? '已按当前权益结算' : '本次尚未扣费')}</dd></div></dl>
          <div className="seo-progress-label"><span>{t('分析进度')}</span><strong>{run.progress}%</strong></div><progress max={100} value={run.progress} aria-label={t('分析进度')} />
          <div className="seo-stage-list">{report?.stages.map(stage => <span key={stage.key} title={t(stage.message)} className={stage.state}><StageIcon state={stage.state} /><span>{t(stepNames[stage.key] || stage.key)}<small>{t(stageLabels[stage.state])}</small></span></span>)}</div>{run.error && <p className="seo-inline-note">{t(run.error)}</p>}
        </section>}
        <div className="seo-report-heading"><div className="seo-report-heading-title"><span className="seo-heading-icon"><DocumentChartBarIcon aria-hidden="true" /></span><div><h2>{t('分析报告')}</h2><p>{report ? `${report.host} · ${date(report.collectedAt)}` : t('完成采集后，网站基本信息与分析结果将在下方展示。')}</p></div></div></div>
        {report && <nav className="seo-report-nav" aria-label={t('报告章节')}>{[['seo-domain-profile','站点基本信息'],['seo-overview-panels','数据概览'],['seo-engine-visibility','各引擎表现'],['seo-keyword-details','关键词明细'],['seo-report-findings','运营建议']].map(([anchor,label]) => <a href={`#${anchor}`} key={anchor}>{t(label)}</a>)}</nav>}
        {!report ? <section className="seo-card seo-welcome"><GlobeAltIcon aria-hidden="true" /><h2>{t(run ? '正在准备你的网站报告' : '建立网站的第一份分析档案')}</h2><p>{t(run ? '任务已保存，页面关闭后后台仍会继续处理。' : '输入域名后，基础信息、页面内容与关键词将分步呈现。')}</p><div className="seo-welcome-steps"><span>{t('确认域名')}</span><span>{t('采集数据')}</span><span>{t('生成报告')}</span><span>{t('保存历史')}</span></div></section> : <>
        <SiteAnalysisProfile report={report} date={date} />
        <SiteAnalysisOverviewPanels report={report} onKeyword={word => { setKeywordFilter('all'); setKeywordSearch(word); setKeywordPage(1); }} />
        <EngineVisibility report={report} date={date} group={engineGroup} onGroup={setEngineGroup} />
        <section className="seo-card seo-report-panel" id="seo-keyword-details"><div className="seo-section-title"><div><h2>{t('域名关键词概况')}</h2><p>{t('候选词与真实排名分开展示，每个词保留来源。')}</p></div><span>{report.keywords.length} {t('个候选词')}</span></div><div className="seo-keyword-filters"><label><span className="seo-sr-only">{t('筛选关键词')}</span><input placeholder={t('搜索本次报告关键词')} value={keywordSearch} onChange={e => { setKeywordSearch(e.target.value); setKeywordPage(1); }} /></label><select aria-label={t('关键词来源')} value={keywordFilter} onChange={e => { setKeywordFilter(e.target.value); setKeywordPage(1); }}>{Object.entries(kinds).map(([id,label]) => <option key={id} value={id}>{t(label)}</option>)}</select></div><div className="seo-table-wrap"><table><thead><tr><th>{t('关键词')}</th><th>{t('来源')}</th><th>{t('关联页面')}</th><th>{t('已观测排名')}</th></tr></thead><tbody>{filteredKeywords.slice((wordsPage - 1) * 10, wordsPage * 10).map(word => <tr key={word.word}><td><strong>{word.word}</strong></td><td>{[...new Set(word.sources.map(s => s.kind))].map(kind => t(kinds[kind])).join(' / ')}</td><td><details><summary>{new Set(word.sources.map(s => s.url).filter(Boolean)).size} {t('个页面')}</summary>{word.sources.filter(s => s.url).map((source, i) => <a key={`${source.url}:${i}`} href={safeLink(source.url)} target="_blank" rel="noreferrer">{source.url}</a>)}</details></td><td>{report.rankings.filter(r => r.keyword === word.word && r.state === 'found').map(r => `${engineDefinitions.find(e => e.id === r.engine)?.name} #${r.position}`).join(' · ') || t(report.rankings.some(r => r.keyword === word.word && r.state === 'not_found') ? '本次查询范围未命中' : '暂无有效排名数据')}</td></tr>)}</tbody></table></div>{!filteredKeywords.length && <p className="seo-empty">{t('暂无匹配关键词')}</p>}<div className="seo-pagination"><button disabled={wordsPage <= 1} onClick={() => setKeywordPage(wordsPage - 1)}>{t('上一页')}</button><span>{wordsPage} / {Math.max(1, Math.ceil(filteredKeywords.length / 10))}</span><button disabled={wordsPage * 10 >= filteredKeywords.length} onClick={() => setKeywordPage(wordsPage + 1)}>{t('下一页')}</button></div></section>
        <div className="seo-two-columns"><section className="seo-card seo-report-panel"><div className="seo-section-title"><h2>{t('重点页面')}</h2><span>{t('本轮已读取')}</span></div><div className="seo-page-list">{report.pages.slice(0, 10).map((item, index) => <div key={`${item.url}:${index}`}><span className={`seo-status ${item.status < 400 ? 'complete' : 'failed'}`}>{item.status}</span><div><strong>{item.title || t('页面标题未读取')}</strong><a href={safeLink(item.url)} target="_blank" rel="noreferrer">{item.url}</a></div></div>)}</div></section><section className="seo-card seo-report-panel"><div className="seo-section-title"><h2>{t('本次变化')}</h2></div>{report.comparison ? <div className="seo-comparison"><p>{t('与上一次相同分析条件的报告比较')}</p><dl><div><dt>{t('新增候选词')}</dt><dd>{report.comparison.added}</dd></div><div><dt>{t('未再提取到的候选词')}</dt><dd>{report.comparison.removed}</dd></div><div><dt>{t('排名上升')}</dt><dd>{report.comparison.up}</dd></div><div><dt>{t('排名下降')}</dt><dd>{report.comparison.down}</dd></div></dl><small>{t('只比较双方均成功查询的相同关键词，不把失败计为下降。')}</small></div> : <p className="seo-empty">{t('暂无可比历史。相同条件再次分析后展示变化。')}</p>}<p className="seo-inline-note">{t('竞品摘要将在竞品模块完成设计与接入后提供。')}</p></section></div>
        <section className="seo-card seo-report-panel" id="seo-report-findings"><div className="seo-section-title"><div><h2>{t('运营机会与待处理事项')}</h2><p>{t('建议基于本轮实际采集页面，请结合网站用途判断。')}</p></div><span>{report.issues.length} {t('项')}</span></div>{report.issues.slice(0, issueLimit).map((issue, i) => <div className="seo-issue" key={`${issue.code}:${i}`}><span className={`seo-status ${issue.severity}`}>{t(issue.severity === 'high' ? '优先检查' : issue.severity === 'info' ? '提示' : '建议处理')}</span><div><strong>{t(issue.title)}</strong><p>{t(issue.advice)}</p><a href={safeLink(issue.url)} target="_blank" rel="noreferrer">{issue.url}</a></div><select aria-label={t('事项处理状态')} value={issue.state || 'pending'} disabled={busy || !['completed','partial'].includes(run?.status || '')} onChange={e => void markIssue(issue.code, issue.url, e.target.value)}><option value="pending">{t('待处理')}</option><option value="resolved">{t('已处理')}</option><option value="ignored">{t('已忽略')}</option></select></div>)}{report.issues.length > issueLimit && <button className="seo-text-button" onClick={() => setIssueLimit(n => n + 20)}>{t('查看更多事项')}</button>}{!report.issues.length && <p className="seo-empty">{t('本轮采集范围内未发现上述规则对应的问题。')}</p>}</section>
        <p className="seo-footnote">{t('报告基于公开数据和本轮采集范围；关键词数量不等于搜索量，观测排名不等于真实流量。')}<button className="seo-text-button" onClick={showHistory}>{t('查看分析记录')}</button></p>
        </>}
      </>}
      </>}
    </main>
  </div>;
}
function EngineVisibility({ report, date, group, onGroup }: { report: SiteReport; date: (value: string) => string; group: string; onGroup: (value: string) => void }) {
  const { t } = useI18n();
  return <section className="seo-card seo-report-panel" id="seo-engine-visibility">
    <div className="seo-section-title"><div><h2>{t('各引擎展示情况')}</h2><p>{t('分别展示实际采集状态，未接入和失败不会显示为零排名。')}</p></div><div className="seo-filter-tabs">{[['all','全部引擎'],['domestic','国内'],['overseas','海外']].map(([id,label]) => <button key={id} aria-pressed={group === id} onClick={() => onGroup(id)}>{t(label)}</button>)}</div></div>
    <div className="seo-table-wrap"><table><thead><tr><th>{t('搜索引擎')}</th><th>{t('站点抓取许可')}</th><th>{t('HTML索引声明')}</th><th>{t('采集状态')}</th><th>{t('已查询词数')}</th><th>{t('前十名关键词')}</th><th>{t('检查时间')}</th><th>{t('说明')}</th><th>{t('人工核对')}</th></tr></thead><tbody>{engineDefinitions.filter(engine => group === 'all' || engine.group === group).map(engine => {
      const row = report.engines.find(e => e.id === engine.id);
      const checkedAt = row?.checkedAt || row?.siteCheckedAt;
      return <tr key={engine.id}><td><SearchEngineIdentity engine={engine} showDomain /></td><td>{t(row?.siteRobotsAllowed === undefined ? '尚未检查' : row.siteRobotsAllowed ? '允许抓取' : '禁止抓取')}</td><td>{t(row?.htmlIndexAllowed === undefined ? '尚未检查' : row.htmlIndexAllowed ? '未声明禁止索引' : '声明禁止索引')}</td><td><span className={`seo-status ${row?.state || 'unavailable'}`}>{t(row ? stageLabels[row.state] : '尚未获取')}</span></td><td>{row && (row.checkedAt || row.queried || row.state === 'complete') ? row.queried : '—'}</td><td>{row?.top10 ?? '—'}</td><td>{checkedAt ? date(checkedAt) : '—'}</td><td>{t(row ? row.message || stageLabels[row.state] : '本报告未包含此引擎，请重新分析')}</td><td><a className="seo-text-button" href={engineSearchUrl(engine.id, `site:${report.host}`, report.options.language)} target="_blank" rel="noreferrer">{t('查看域名搜索结果')}</a>{report.keywords[0] && <a className="seo-text-button" href={engineSearchUrl(engine.id, report.keywords[0].word, report.options.language)} target="_blank" rel="noreferrer">{t('核对首个关键词')}</a>}</td></tr>;
    })}</tbody></table></div>
    {report.engines.some(engine => engine.state === 'skipped' || engine.message === '尚未接入可用数据来源') && <p className="seo-inline-note">{t('本报告未查询的引擎不会自动补采。请在上方选择引擎并点击开始分析，生成新报告后按当前权益结算。')}</p>}
    <p className="seo-inline-note">{t('抓取许可与HTML索引声明取自目标网站，不代表搜索引擎已经收录或产生排名；HTTP响应头中的索引指令暂未纳入此项。')}</p>
    <p className="seo-inline-note">{t('人工核对会打开搜索引擎网页，不会修改报告、自动回填排名或产生扣费。')}</p>
  </section>;
}

function StageIcon({ state }: { state: string }) {
  const Icon = state === 'complete' ? CheckCircleIcon : state === 'running' ? ArrowPathIcon : state === 'skipped' ? MinusCircleIcon : ['failed', 'restricted', 'unavailable', 'partial'].includes(state) ? ExclamationTriangleIcon : ClockIcon;
  return <Icon aria-hidden="true" className={state === 'running' ? 'seo-stage-spin' : undefined} />;
}
