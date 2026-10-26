'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ClipboardDocumentIcon, CodeBracketIcon, ExclamationCircleIcon, GlobeAltIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { siteAnalysisRequest } from '../lib/site-analysis-client';
import type { AnalysisSite } from '../lib/site-analysis';
import { siteScriptSnippet } from '../lib/site-script';

type VerificationReceipt = { message: string; checkedAt: string } & ({ state: 'checking' | 'success' | 'failed' } | { state: 'waiting'; retryAt: number });
export function SiteManagement({ sites, toolId, onChanged, onAnalyze }: { sites: AnalysisSite[]; toolId: number; onChanged: () => void; onAnalyze: (site: AnalysisSite) => void }) {
  const { t, locale } = useI18n();
  const [domain,setDomain] = useState(''), [pending,setPending] = useState(''), [error,setError] = useState(''), [message,setMessage] = useState('');
  const [collapsed,setCollapsed] = useState<string[]>([]), [patches,setPatches] = useState<Record<string,AnalysisSite>>({}), [hidden,setHidden] = useState<string[]>([]), [deleting,setDeleting] = useState('');
  const [receipts,setReceipts] = useState<Record<string,VerificationReceipt>>({});
  const [now,setNow] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const cooldownUntil = Math.max(0, ...Object.values(receipts).map(receipt => receipt.state === 'waiting' && receipt.retryAt > now ? receipt.retryAt : 0));
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  const visible = sites.filter(site => !hidden.includes(site.id)).map(site => patches[site.id]?.updatedAt >= site.updatedAt ? patches[site.id] : site);
  for (const site of Object.values(patches)) if (!hidden.includes(site.id) && !visible.some(row => row.id === site.id)) visible.unshift(site);
  const date = (value?: string) => value ? new Date(value).toLocaleString(locale, { timeZone: 'Asia/Shanghai', hour12: false }) : t('尚未收到访问');
  const reveal = (id: string) => setCollapsed(old => old.filter(value => value !== id));
  async function handleChange(action: 'site-add' | 'site-verify' | 'site-delete', site?: AnalysisSite) {
    if (controller.current) return;
    const previous = site && receipts[site.id];
    if (action === 'site-verify' && previous?.state === 'waiting' && previous.retryAt > now) return;
    const request = new AbortController(); controller.current = request; setPending(site?.id || 'new'); setError(''); setMessage('');
    let timeout: AbortSignal | null = null;
    if (action === 'site-verify' && site) { reveal(site.id); setReceipts(old => ({ ...old, [site.id]: { state: 'checking', message: '正在检查站点首页，请稍候…', checkedAt: '' } })); }
    try {
      timeout = action === 'site-verify' ? AbortSignal.timeout(25000) : null;
      const signal = timeout ? AbortSignal.any([request.signal,timeout]) : request.signal;
      const result = await siteAnalysisRequest<{ site?: AnalysisSite }>('', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: toolId, action, ...(action === 'site-add' ? { domain: site?.url || domain.trim() } : { site: site?.id }) }) });
      if (request.signal.aborted) return;
      if (action === 'site-verify' && (!site || result.site?.id !== site.id || typeof result.site.verifiedAt !== 'string' || !Number.isFinite(Date.parse(result.site.verifiedAt)))) throw new Error('验证响应不完整，请重试');
      if (action === 'site-delete' && site) {
        setHidden(old => [...old,site.id]); reveal(site.id); setReceipts(old => { const next = { ...old }; delete next[site.id]; return next; }); setDeleting(''); setMessage('站点已删除，历史报告和统计记录已保留');
      } else if (result.site) {
        const updated = result.site;
        setPatches(old => ({ ...old, [updated.id]: updated })); setHidden(old => old.filter(id => id !== updated.id));
        if (action === 'site-add' && !site) setDomain('');
        if (site) reveal(updated.id);
        if (action === 'site-verify') setReceipts(old => ({ ...old, [updated.id]: { state: 'success', message: '站点验证成功，可以开始分析并接收访问统计', checkedAt: new Date().toISOString() } }));
        else setMessage(site ? '脚本已生成并固定保存，重复生成不会改变。' : '站点已添加，请在本站卡片中生成脚本并验证');
      }
      onChanged();
    } catch (error) { if (!request.signal.aborted) {
      const detail = timeout?.aborted ? '验证等待超时，请重试' : (error as Error)?.name === 'TypeError' ? '网络连接异常，请检查网络后重试' : (error as Error)?.message || '验证请求失败，请重试';
      if (action === 'site-verify' && site) {
        const limited = !timeout?.aborted && (error as { status?: number })?.status === 429;
        const delay = (error as { retryAfter?: number })?.retryAfter;
        const seconds = typeof delay === 'number' && Number.isFinite(delay) ? Math.max(1, Math.min(10, Math.ceil(delay))) : 10;
        const requestedAt = new Date().getTime(); setNow(requestedAt);
        setReceipts(old => ({ ...old, [site.id]: { message: detail, checkedAt: new Date(requestedAt).toISOString(), ...(limited ? { state: 'waiting', retryAt: requestedAt + seconds * 1000 } : { state: 'failed' }) } }));
      }
      else setError(detail);
      onChanged();
    } }
    finally { if (controller.current === request) controller.current = null; if (!request.signal.aborted) setPending(''); }
  }
  function handleAdd(event: FormEvent) { event.preventDefault(); if (domain.trim()) void handleChange('site-add'); }
  function handleGenerate(site: AnalysisSite) {
    if (site.scriptToken && /^[a-f0-9]{64}$/.test(site.scriptToken)) setCollapsed(old => old.includes(site.id) ? old.filter(id => id !== site.id) : [...old,site.id]);
    else void handleChange('site-add',site);
  }
  async function copy(snippet: string) { try { await navigator.clipboard.writeText(snippet); setMessage('脚本已复制'); } catch { setError('复制未完成，请选中脚本后手动复制'); } }
  return <section className="seo-site-management" aria-label={t('站点管理')}>
    <div className="seo-site-onboarding"><span><GlobeAltIcon aria-hidden="true" />{t('添加站点')}</span><span><CodeBracketIcon aria-hidden="true" />{t('安装唯一脚本')}</span><span><ShieldCheckIcon aria-hidden="true" />{t('验证并开始使用')}</span></div>
    <form className="seo-card seo-site-add" onSubmit={handleAdd}><div><h2>{t('添加站点')}</h2><p>{t('先配置站点域名并完成验证，再使用综合看板。')}</p></div><label><span>{t('站点域名')}</span><input value={domain} onChange={event => setDomain(event.target.value)} type="text" autoComplete="url" maxLength={2048} placeholder="https://example.com/" required /></label><button className="seo-primary" disabled={Boolean(pending) || !domain.trim()}><PlusIcon aria-hidden="true" />{t(pending === 'new' ? '正在添加…' : '添加站点')}</button></form>
    {error && <p className="seo-alert" role="alert">{t(error)}</p>}{message && <p className="seo-site-message" role="status"><CheckCircleIcon aria-hidden="true" />{t(message)}</p>}
    <div className="seo-section-title"><div><h2>{t('我的站点')}</h2><p>{t('每个站点对应一个永久固定的唯一脚本，验证和访问统计共用。')}</p></div><span>{visible.length} / 100</span></div>
    {!visible.length ? <div className="seo-card seo-welcome"><GlobeAltIcon aria-hidden="true" /><h2>{t('添加第一个站点')}</h2><p>{t('历史分析中保存的站点也需要安装脚本并验证。')}</p></div> : <div className="seo-managed-sites">{visible.map(site => {
      const scriptId = `seo-site-script-${site.id}`, panelId = `seo-site-install-${site.id}`;
      const snippet = site.scriptToken && /^[a-f0-9]{64}$/.test(site.scriptToken) ? siteScriptSnippet(site.id) : '';
      const open = Boolean(snippet) && !collapsed.includes(site.id), receipt = receipts[site.id];
      const verifying = pending === site.id && receipt?.state === 'checking';
      const retrySeconds = receipt?.state === 'waiting' ? Math.max(0, Math.ceil((receipt.retryAt - now) / 1000)) : 0;
      const verificationState = receipt?.state || (site.verifiedAt ? 'success' : 'pending');
      const verificationMessage = receipt?.state === 'waiting' ? retrySeconds ? `请等待 ${retrySeconds} 秒后再验证。` : '等待已结束，请点击验证。' : receipt?.message || (site.verifiedAt ? '站点已验证，可以开始分析并累计访问统计。' : '安装脚本后点击验证，检查结果会显示在这里。');
      const checkedAt = receipt ? receipt.checkedAt : site.verifiedAt;
      return <article className={`seo-card seo-managed-site${open ? ' selected' : ''}`} key={site.id}>
        <div className="seo-managed-site-heading"><GlobeAltIcon aria-hidden="true" /><strong>{site.host}</strong><span className={`seo-status ${verifying ? 'running' : site.verifiedAt ? 'complete' : receipt?.state === 'failed' ? 'failed' : 'pending'}`}>{t(verifying ? '验证中' : site.verifiedAt ? '已验证' : receipt?.state === 'failed' ? '验证失败' : retrySeconds ? '等待重试' : '待验证')}</span></div>
        <p>{site.url}</p><small>{t('最近统计')}：{date(site.lastSeenAt)}</small>
        <div className="seo-managed-site-actions"><button className="seo-quiet" type="button" disabled={Boolean(pending)} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => handleGenerate(site)}><CodeBracketIcon aria-hidden="true" />{t(snippet ? open ? '收起脚本' : '查看脚本' : '生成脚本')}</button><button className="seo-text-button" type="button" disabled={Boolean(pending) || !site.verifiedAt} onClick={() => onAnalyze(site)}>{t('进入综合看板')}</button><button className="seo-site-delete" type="button" disabled={Boolean(pending)} aria-label={t(`删除站点 ${site.host}`)} onClick={() => setDeleting(site.id)}><TrashIcon aria-hidden="true" /></button></div>
        {open && snippet && <section className="seo-site-install" id={panelId} aria-labelledby={`${panelId}-title`}>
          <div className="seo-site-script-heading"><h3 id={`${panelId}-title`}>{t('本站唯一脚本')}</h3><span><ShieldCheckIcon aria-hidden="true" />{t('永久固定')}</span></div>
          <p className="seo-site-script-note">{t('点击生成脚本后永久固定不变。')}</p>
          <label className="seo-script-label" htmlFor={scriptId}>{t('将此脚本加入本站公共页面的HTML，建议放在head中；同一脚本用于验证和统计。')}</label>
          <textarea id={scriptId} className="seo-site-script" readOnly value={snippet} rows={3} onFocus={event => event.currentTarget.select()} spellCheck={false} />
          <div className="seo-script-actions"><button type="button" className="seo-quiet" onClick={() => void copy(snippet)}><ClipboardDocumentIcon aria-hidden="true" />{t('复制脚本')}</button><button type="button" className="seo-primary" disabled={Boolean(pending) || retrySeconds > 0} aria-busy={verifying} aria-describedby={`${panelId}-verification`} onClick={() => void handleChange('site-verify',site)}><ArrowPathIcon aria-hidden="true" className={verifying ? 'seo-stage-spin' : undefined} />{t(verifying ? '正在验证…' : retrySeconds ? `请等待 ${retrySeconds} 秒` : site.verifiedAt ? '重新验证' : '已安装，开始验证')}</button></div>
          <div id={`${panelId}-verification`} className={`seo-verification-receipt ${verificationState}`} role={receipt ? receipt.state === 'failed' ? 'alert' : 'status' : undefined} aria-busy={verifying}>
            {verificationState === 'checking' ? <ArrowPathIcon aria-hidden="true" className="seo-stage-spin" /> : verificationState === 'success' ? <CheckCircleIcon aria-hidden="true" /> : verificationState === 'failed' ? <ExclamationCircleIcon aria-hidden="true" /> : <ShieldCheckIcon aria-hidden="true" />}
            <div><strong>{t(verificationState === 'checking' ? '正在验证…' : verificationState === 'success' ? '验证通过' : verificationState === 'failed' ? '本次验证失败' : verificationState === 'waiting' ? retrySeconds ? '等待重试' : '可以重新验证' : '等待验证')}</strong><p>{t(verificationMessage)}</p>{checkedAt && <small>{t(receipt?.state === 'waiting' ? '本次请求时间' : receipt ? '本次检查时间' : '最近验证通过')}：{date(checkedAt)}</small>}</div>
          </div>
          <ul className="seo-site-install-notes"><li>{t('验证通过后，用于绑定站点的数据统计与分析。')}</li><li>{t('删除统计脚本后将不再统计，历史分析数据依然保留。')}</li></ul>
        </section>}
        {deleting === site.id && <div className="seo-site-delete-confirm" role="alert"><p>{t('删除后停止新分析和访问统计，历史数据保留；已提交的分析会继续完成。')}</p><button type="button" disabled={Boolean(pending)} onClick={() => void handleChange('site-delete',site)}>{t('确认删除')}</button><button type="button" onClick={() => setDeleting('')}>{t('取消')}</button></div>}
      </article>;
    })}</div>}
  </section>;
}
