'use client';
/* eslint-disable @next/next/no-img-element -- Uploaded software screenshots use the existing product image service. */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { defaultSoftwarePage, installerName, softwareSize, softwareUploadLimit, type SoftwareAdmin, type SoftwarePage, type SoftwareRelease } from '../lib/software-release';
type Fields = { version: string; systems: string; notes: string };
const emptyFields = (): Fields => ({ version: '', systems: '', notes: '' });
export function SoftwarePublishing({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData] = useState<SoftwareAdmin | null>(null), [page, setPage] = useState<SoftwarePage>(defaultSoftwarePage);
  const [tab, setTab] = useState('versions'), [fields, setFields] = useState(emptyFields), [editing, setEditing] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState<number | null>(null);
  const title = useId(), dialog = useRef<HTMLElement>(null), fileInput = useRef<HTMLInputElement>(null), target = useRef(''), inFlight = useRef(false), xhr = useRef<XMLHttpRequest | null>(null);
  const load = useCallback(async (initial = false, signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/software?tool=${id}`, { cache: 'no-store', signal }); const result = await response.json() as SoftwareAdmin & { message?: string };
    if (!response.ok) throw Error(result.message || '软件发布信息读取失败');
    if (!signal?.aborted) { setData(result); if (initial) setPage(result.page); }
  }, [id]);
  useEffect(() => { const controller = new AbortController(), previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => { void load(true, controller.signal).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }); }, 0); dialog.current?.focus();
    return () => { window.clearTimeout(timer); controller.abort(); xhr.current?.abort(); previous?.focus(); };
  }, [load]);
  async function action(kind: string, extra: Record<string, unknown> = {}) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { const response = await fetch('/api/admin/software', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: id, action: kind, ...extra }) }); const result = await response.json() as { message?: string };
      if (!response.ok) throw Error(result.message || '发布操作失败');
      await load(); if (kind === 'create' || kind === 'edit') { setFields(emptyFields()); setEditing(''); }
      setNotice(kind === 'publish' ? '版本已发布，独立下载页同步生效' : kind === 'unpublish' ? '版本已下架，下载入口已关闭' : '已保存');
    } catch (reason) { setError((reason as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file || inFlight.current) return;
    try { installerName(file.name); if (file.size < 64 || file.size > softwareUploadLimit) throw Error('EXE最大256MB'); } catch (reason) { setError((reason as Error).message); return; }
    inFlight.current = true; setBusy(true); setError(''); setNotice(''); setProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest(); xhr.current = request;
        request.open('POST', `/api/admin/software/upload?tool=${id}&release=${encodeURIComponent(target.current)}`);
        request.timeout = 660000; request.setRequestHeader('Content-Type', 'application/octet-stream'); request.setRequestHeader('X-File-Name', encodeURIComponent(file.name)); request.setRequestHeader('X-File-Size', String(file.size));
        request.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
        request.onload = () => { let result: { message?: string }; try { result = JSON.parse(request.responseText); } catch { reject(Error(`上传返回异常（HTTP ${request.status}），请检查代理上传限制`)); return; } if (request.status < 200 || request.status >= 300) reject(Error(result.message || 'EXE上传失败')); else resolve(); };
        request.onerror = () => reject(Error('上传连接失败，请检查网络或服务器限制')); request.ontimeout = () => reject(Error('上传等待超时，请刷新版本列表检查结果')); request.onabort = () => reject(Error('上传已取消')); request.send(file);
      });
      await load(); setNotice('安装包上传及校验完成，点击发布后开放下载');
    } catch (reason) { setError((reason as Error).message); }
    finally { inFlight.current = false; xhr.current = null; setBusy(false); setProgress(null); }
  }
  async function screenshot(file: File | undefined) {
    if (!file || inFlight.current) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024 || page.screenshots.length >= 8) { setError('截图支持8MB内的PNG、JPG、WebP，最多8张'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try { const form = new FormData(); form.set('file', file); const response = await fetch('/api/product-images', { method: 'POST', body: form }); const result = await response.json() as { url?: string; message?: string }; if (!response.ok || !result.url) throw Error(result.message || '截图上传失败'); setPage(previous => ({ ...previous, screenshots: [...previous.screenshots, { url: result.url!, caption: file.name.replace(/\.[^.]+$/, ''), captionEn: '' }] })); setNotice('截图已上传，保存产品介绍后前台展示'); }
    catch (reason) { setError((reason as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  function chooseRelease(row: SoftwareRelease) { setFields({ version: row.version, systems: row.systems, notes: row.notes }); setEditing(row.id); }
  return <div className="admin-modal-mask"><section className="admin-modal product-editor-modal software-publishing" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape' && !inFlight.current) { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') { const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([hidden]),textarea:not(:disabled),select:not(:disabled),a[href]'); if (!controls?.length) return; const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); } }
  }}>
    <div className="editor-head"><div><span className="section-kicker">软件产品发布</span><b id={title}>C盘清理工具 · 宣传与下载</b></div><button type="button" className="modal-close" aria-label="关闭软件发布" disabled={busy} onClick={onClose}>×</button></div>
    <div className="order-tabs" role="tablist" aria-label="软件发布管理"><button type="button" role="tab" aria-selected={tab === 'versions'} className={tab === 'versions' ? 'active' : ''} onClick={() => setTab('versions')} disabled={busy}>版本发布</button><button type="button" role="tab" aria-selected={tab === 'page'} className={tab === 'page' ? 'active' : ''} onClick={() => setTab('page')} disabled={busy}>宣传内容与截图</button></div>
    <div className="software-editor-body">
      {!data && !error && <p role="status">正在读取软件发布配置…</p>}
      {data && !data.initialized && <p className="tool-stat-notes">请先执行16号软件发布增量SQL；现有工具不受影响。</p>}
      {data && !data.storageReady && <p className="tool-stat-notes">请配置SOFTWARE_OSS或现有VIDEO_OSS存储后上传EXE。宣传内容可先维护。</p>}
      {error && <p className="product-editor-error" role="alert">{error}</p>}{notice && <p className="software-editor-notice" role="status">{notice}</p>}
      {progress !== null && <div className="software-upload-progress" role="status"><progress max="100" value={progress} /><span>{progress >= 100 ? '上传完成，正在校验安装包…' : `正在上传 ${progress}%`}</span></div>}
      {data && tab === 'versions' && <>
        <fieldset disabled={busy || !data.initialized} className="software-version-form"><legend>{editing ? '编辑草稿版本' : '创建新版本'}</legend><div className="tool-editor-grid"><label>版本号<input value={fields.version} maxLength={48} placeholder="例如：1.0.0" onChange={event => setFields({ ...fields, version: event.target.value })} /></label><label>支持的Windows系统<input value={fields.systems} maxLength={200} placeholder="按软件实际兼容系统填写" onChange={event => setFields({ ...fields, systems: event.target.value })} /></label><label className="wide-field">版本更新说明<textarea value={fields.notes} maxLength={6000} onChange={event => setFields({ ...fields, notes: event.target.value })} /></label></div>
          <div className="software-editor-actions">{editing && <button type="button" className="ghost-button" onClick={() => { setEditing(''); setFields(emptyFields()); }}>取消编辑</button>}<button type="button" onClick={() => void action(editing ? 'edit' : 'create', { ...fields, ...(editing ? { id: editing } : {}) })}>{editing ? '保存版本信息' : '创建草稿版本'}</button></div>
        </fieldset>
        <p className="tool-editor-hint">创建草稿 → 上传EXE → 点击发布。上传不会自动开放下载；发布新版本后，原版本自动下架。显示最近50个版本。</p>
        <input ref={fileInput} type="file" accept=".exe" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} />
        <div className="table-wrap"><table><thead><tr><th>版本 / 系统</th><th>安装包</th><th>状态</th><th>下载请求</th><th>操作</th></tr></thead><tbody>{data.releases.map(row => <tr key={row.id}><td><b>{row.version}</b><small>{row.systems}</small></td><td>{row.fileName || '尚未上传'}{row.fileSize > 0 && <small>{softwareSize(row.fileSize)}</small>}{row.sha256 && <details><summary>SHA256</summary><code className="software-hash">{row.sha256}</code></details>}</td><td><span className={`status ${row.status === 'published' ? 'active' : 'inactive'}`}>{row.uploading ? '正在上传' : row.status === 'published' ? '已发布' : row.status === 'draft' ? '草稿' : '已下架'}</span></td><td>{row.downloads}</td><td><div className="software-row-actions">
          {row.status === 'draft' && <><button className="text-action" type="button" disabled={busy || row.uploading} onClick={() => chooseRelease(row)}>编辑</button><button className="text-action" type="button" disabled={busy || row.uploading || !data.storageReady} onClick={() => { target.current = row.id; fileInput.current?.click(); }}>{row.fileSize ? '替换EXE' : '上传EXE'}</button></>}
          {row.status === 'published' ? <button className="text-action" type="button" disabled={busy} onClick={() => void action('unpublish', { id: row.id })}>下架</button> : <button className="text-action" type="button" disabled={busy || row.uploading || !row.fileSize || !data.storageReady} onClick={() => void action('publish', { id: row.id })}>{row.status === 'archived' ? '设为当前版本' : '发布'}</button>}
        </div></td></tr>)}</tbody></table>{!data.releases.length && <p className="tool-directory-empty">暂无版本，先创建草稿并上传安装包。</p>}</div>
        <p className="tool-editor-hint">下载请求仅统计服务器签发下载地址的次数，不代表完成下载或安装人数。EXE最大256MB。</p>
      </>}
      {data && tab === 'page' && <fieldset disabled={busy || !data.initialized} className="software-page-fields">
        <div className="tool-editor-grid"><label className="wide-field">宣传主标题<input maxLength={100} value={page.headline} placeholder="留空使用默认产品主标题" onChange={event => setPage({ ...page, headline: event.target.value })} /></label><label className="wide-field">产品介绍<textarea maxLength={600} value={page.summary} placeholder="请按软件实际功能填写" onChange={event => setPage({ ...page, summary: event.target.value })} /></label></div>
        <details><summary>英文介绍（可选）</summary><div className="tool-editor-grid"><label className="wide-field">英文主标题<input maxLength={160} value={page.headlineEn} onChange={event => setPage({ ...page, headlineEn: event.target.value })} /></label><label className="wide-field">英文产品介绍<textarea maxLength={1000} value={page.summaryEn} onChange={event => setPage({ ...page, summaryEn: event.target.value })} /></label></div></details>
        <div className="software-editor-section-heading"><h3>产品功能</h3><button type="button" disabled={page.features.length >= 8} onClick={() => setPage({ ...page, features: [...page.features, { title: '', detail: '', titleEn: '', detailEn: '' }] })}>＋ 添加功能</button></div>
        {page.features.map((feature, index) => <div className="software-feature-editor" key={index}><div className="tool-editor-grid"><label>功能标题<input maxLength={60} value={feature.title} onChange={event => setPage({ ...page, features: page.features.map((row, i) => i === index ? { ...row, title: event.target.value } : row) })} /></label><label>功能说明<textarea maxLength={400} value={feature.detail} onChange={event => setPage({ ...page, features: page.features.map((row, i) => i === index ? { ...row, detail: event.target.value } : row) })} /></label></div><details><summary>英文功能说明（可选）</summary><input aria-label={`功能${index + 1}英文标题`} maxLength={100} value={feature.titleEn} onChange={event => setPage({ ...page, features: page.features.map((row, i) => i === index ? { ...row, titleEn: event.target.value } : row) })} /><textarea aria-label={`功能${index + 1}英文说明`} maxLength={700} value={feature.detailEn} onChange={event => setPage({ ...page, features: page.features.map((row, i) => i === index ? { ...row, detailEn: event.target.value } : row) })} /></details><button type="button" className="text-action" onClick={() => setPage({ ...page, features: page.features.filter((_, i) => i !== index) })}>移除此功能</button></div>)}
        <div className="software-editor-section-heading"><h3>软件截图（最多8张）</h3><label className="software-image-upload">上传截图<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || page.screenshots.length >= 8} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void screenshot(file); }} /></label></div>
        <div className="software-screenshot-editor">{page.screenshots.map((shot, index) => <article key={shot.url}><img src={shot.url} alt="截图预览" /><input aria-label={`截图${index + 1}说明`} maxLength={100} value={shot.caption} onChange={event => setPage({ ...page, screenshots: page.screenshots.map((row, i) => i === index ? { ...row, caption: event.target.value } : row) })} /><input aria-label={`截图${index + 1}英文说明`} maxLength={160} placeholder="英文说明（可选）" value={shot.captionEn} onChange={event => setPage({ ...page, screenshots: page.screenshots.map((row, i) => i === index ? { ...row, captionEn: event.target.value } : row) })} /><div className="software-row-actions"><button type="button" className="text-action" disabled={index === 0} onClick={() => { const next = [...page.screenshots]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setPage({ ...page, screenshots: next }); }}>前移</button><button type="button" className="text-action" onClick={() => setPage({ ...page, screenshots: page.screenshots.filter((_, i) => i !== index) })}>移除</button></div></article>)}</div>
        <p className="tool-editor-hint">第一张截图用于首屏展示，其余截图在产品界面区轮播。没有截图时展示产品插画，不伪造软件界面。</p>
        <div className="software-editor-actions"><button type="button" onClick={() => void action('page', { page })}>保存产品介绍与截图</button></div>
      </fieldset>}
    </div>
    <div className="admin-form-actions"><a href="/tools/c-drive-cleaner.html" target="_blank" rel="noreferrer">预览独立下载页 ↗</a><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>关闭</button></div>
  </section></div>;
}
