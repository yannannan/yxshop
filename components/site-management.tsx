'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ClipboardDocumentIcon, CodeBracketIcon, GlobeAltIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { siteAnalysisRequest } from '../lib/site-analysis-client';
import type { AnalysisSite } from '../lib/site-analysis';

export function SiteManagement({ sites, toolId, onChanged, onAnalyze }: { sites: AnalysisSite[]; toolId: number; onChanged: () => void; onAnalyze: (site: AnalysisSite) => void }) {
  const { t, locale } = useI18n();
  const [domain,setDomain] = useState(''), [pending,setPending] = useState(''), [error,setError] = useState(''), [message,setMessage] = useState('');
  const [selected,setSelected] = useState(''), [patch,setPatch] = useState<AnalysisSite | null>(null), [hidden,setHidden] = useState<string[]>([]), [deleting,setDeleting] = useState(''), [origin,setOrigin] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { void Promise.resolve().then(() => setOrigin(window.location.origin)); return () => controller.current?.abort(); }, []);
  const visible = sites.filter(site => !hidden.includes(site.id)).map(site => patch?.id === site.id && patch.updatedAt > site.updatedAt ? patch : site);
  if (patch && !hidden.includes(patch.id) && !visible.some(site => site.id === patch.id)) visible.unshift(patch);
  const active = visible.find(site => site.id === selected) || visible[0];
  const snippet = active?.scriptToken && /^[a-f0-9]{64}$/.test(active.scriptToken) && origin ? `<script async src="${origin}/api/site-tracker/${active.scriptToken}"></script>` : '';
  const date = (value?: string) => value ? new Date(value).toLocaleString(locale, { timeZone: 'Asia/Shanghai', hour12: false }) : t('尚未收到访问');
  async function change(action: 'site-add' | 'site-verify' | 'site-delete', site?: AnalysisSite) {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setPending(site?.id || 'new'); setError(''); setMessage('');
    try {
      const result = await siteAnalysisRequest<{ site?: AnalysisSite } >('', { method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: toolId, action, ...(action === 'site-add' ? { domain: site?.url || domain.trim() } : { site: site?.id }) }) });
      if (request.signal.aborted) return;
      if (action === 'site-delete' && site) { setHidden(old => [...old,site.id]); setPatch(old => old?.id === site.id ? null : old); setDeleting(''); setMessage('站点已删除，历史报告和统计记录已保留'); }
      else if (result.site) { setPatch(result.site); setSelected(result.site.id); setHidden(old => old.filter(id => id !== result.site!.id)); if (action === 'site-add') setDomain(''); setMessage(action === 'site-verify' ? '站点验证成功，可以开始分析并接收访问统计' : '站点已添加，请安装唯一脚本并验证'); }
      onChanged();
    } catch (error) { if (!request.signal.aborted) { setError((error as Error).message); onChanged(); } }
    finally { if (controller.current === request) controller.current = null; if (!request.signal.aborted) setPending(''); }
  }
  function add(event: FormEvent) { event.preventDefault(); if (domain.trim()) void change('site-add'); }
  async function copy() { try { await navigator.clipboard.writeText(snippet); setMessage('脚本已复制'); } catch { setError('复制未完成，请选中脚本后手动复制'); } }
  return <section className="seo-site-management" aria-label={t('站点管理')}>
    <div className="seo-site-onboarding"><span><GlobeAltIcon aria-hidden="true" />{t('添加站点')}</span><span><CodeBracketIcon aria-hidden="true" />{t('安装唯一脚本')}</span><span><ShieldCheckIcon aria-hidden="true" />{t('验证并开始使用')}</span></div>
    <form className="seo-card seo-site-add" onSubmit={add}><div><h2>{t('添加站点')}</h2><p>{t('先配置站点域名并完成验证，再使用综合看板。')}</p></div><label><span>{t('站点域名')}</span><input value={domain} onChange={event => setDomain(event.target.value)} type="text" autoComplete="url" maxLength={2048} placeholder="https://example.com/" required /></label><button className="seo-primary" disabled={Boolean(pending) || !domain.trim()}><PlusIcon aria-hidden="true" />{t(pending === 'new' ? '正在添加…' : '添加站点')}</button></form>
    {error && <p className="seo-alert" role="alert">{t(error)}</p>}{message && <p className="seo-site-message" role="status"><CheckCircleIcon aria-hidden="true" />{t(message)}</p>}
    <div className="seo-section-title"><div><h2>{t('我的站点')}</h2><p>{t('每个站点对应一个唯一脚本，验证和访问统计共用。')}</p></div><span>{visible.length} / 100</span></div>
    {!visible.length ? <div className="seo-card seo-welcome"><GlobeAltIcon aria-hidden="true" /><h2>{t('添加第一个站点')}</h2><p>{t('历史分析中保存的站点也需要安装脚本并验证。')}</p></div> : <>
      <div className="seo-managed-sites">{visible.map(site => <article className={`seo-card seo-managed-site${active?.id === site.id ? ' selected' : ''}`} key={site.id}><div className="seo-managed-site-heading"><GlobeAltIcon aria-hidden="true" /><strong>{site.host}</strong><span className={`seo-status ${site.verifiedAt ? 'complete' : 'pending'}`}>{t(site.verifiedAt ? '已验证' : '待验证')}</span></div><p>{site.url}</p><small>{t('最近统计')}：{date(site.lastSeenAt)}</small><div className="seo-managed-site-actions"><button className="seo-quiet" type="button" onClick={() => { setSelected(site.id); setDeleting(''); }}>{t('查看接入脚本')}</button><button className="seo-text-button" type="button" disabled={Boolean(pending) || !site.verifiedAt} onClick={() => onAnalyze(site)}>{t('进入综合看板')}</button><button className="seo-site-delete" type="button" disabled={Boolean(pending)} aria-label={t(`删除站点 ${site.host}`)} onClick={() => { setSelected(site.id); setDeleting(site.id); }}><TrashIcon aria-hidden="true" /></button></div>{deleting === site.id && <div className="seo-site-delete-confirm" role="alert"><p>{t('删除后停止新分析和访问统计，历史数据保留；已提交的分析会继续完成。')}</p><button type="button" disabled={Boolean(pending)} onClick={() => void change('site-delete',site)}>{t('确认删除')}</button><button type="button" onClick={() => setDeleting('')}>{t('取消')}</button></div>}</article>)}</div>
      {active && <section className="seo-card seo-site-install" aria-labelledby="seo-site-install-title"><div className="seo-section-title"><div><h2 id="seo-site-install-title">{t('站点接入')} · {active.host}</h2><p>{t('将此脚本加入本站公共页面的HTML，建议放在head中；同一脚本用于验证和统计。')}</p></div><span className={`seo-status ${active.verifiedAt ? 'complete' : 'pending'}`}>{t(active.verifiedAt ? '已验证' : '待验证')}</span></div>
        {snippet ? <><label className="seo-script-label" htmlFor="seo-site-script">{t('本站唯一脚本')}</label><textarea id="seo-site-script" className="seo-site-script" readOnly value={snippet} rows={3} onFocus={event => event.currentTarget.select()} spellCheck={false} /><div className="seo-script-actions"><button type="button" className="seo-quiet" onClick={() => void copy()}><ClipboardDocumentIcon aria-hidden="true" />{t('复制脚本')}</button><button type="button" className="seo-primary" disabled={Boolean(pending)} onClick={() => void change('site-verify',active)}><ArrowPathIcon aria-hidden="true" />{t(pending === active.id ? '正在验证…' : active.verifiedAt ? '重新验证' : '已安装，开始验证')}</button></div></> : <button className="seo-primary" type="button" disabled={Boolean(pending)} onClick={() => void change('site-add',active)}><CodeBracketIcon aria-hidden="true" />{t('生成本站唯一脚本')}</button>}
        <ul className="seo-site-install-notes"><li>{t('请从平台公网HTTPS地址复制脚本，确保访客能够加载。')}</li><li>{t('验证时由服务器读取首页确认脚本，不通过伪造访问上报取得验证。')}</li><li>{t('验证成功后开始累计页面访问和来源；脚本不读取Cookie，不上报网址查询参数或片段。')}</li><li>{t('如站点启用了CSP，请允许本站脚本来源及统计请求。')}</li><li>{t('删除后原脚本失效，重新添加同一域名需要安装新的脚本，历史数据仍保留。')}</li></ul>
      </section>}
    </>}
  </section>;
}
