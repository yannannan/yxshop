'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toolPlanKey, toolPlanLabel, toolPlanPrice, toolPlanQuery, type ToolService } from '../lib/tool-services';
import { videoDuration, videoLogin, videoSize, type VideoAccess, type VideoPreview, type VideoTask } from '../lib/video-options';

const endpoint = '/api/tools/video-extractor';
const active = (task: VideoTask | null) => task?.status === 'queued' || task?.status === 'processing';
async function videoJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(data.message || '请求未完成，请稍后重试');
  return data;
}
export function VideoExtractor({ tool }: { tool: ToolService }) {
  const [input, setInput] = useState(''), [preview, setPreview] = useState<VideoPreview | null>(null), [formatId, setFormatId] = useState('');
  const [access, setAccess] = useState<VideoAccess | null>(null), [task, setTask] = useState<VideoTask | null>(null);
  const [parsing, setParsing] = useState(false), [submitting, setSubmitting] = useState(false), [message, setMessage] = useState(''), [accessError, setAccessError] = useState(''), [pollError, setPollError] = useState('');
  const [page, setPage] = useState(1), [pollVersion, setPollVersion] = useState(0);
  const [time, setTime] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null), busyRef = useRef(false);
  const busy = parsing || submitting || active(task);
  const refresh = useCallback(async () => {
    try { setAccess(await videoJson<VideoAccess>(`${endpoint}?page=${page}`)); setAccessError(''); }
    catch (error) { setAccessError((error as Error).message || '权益读取失败，请稍后刷新'); }
  }, [page]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  useEffect(() => { const initial = setTimeout(() => setTime(Date.now()), 0), timer = setInterval(() => setTime(Date.now()), 10000); return () => { clearTimeout(initial); clearInterval(timer); }; }, []);
  useEffect(() => {
    // 刷新页面只恢复同一任务，不重新发起提取或扣费。
    try {
      const id = sessionStorage.getItem('yxstar-video-task');
      if (id) void videoJson<{ task: VideoTask }>(`${endpoint}?task=${encodeURIComponent(id)}`).then(data => setTask(data.task)).catch(() => {});
    } catch { /* 禁用本地存储时仍可通过历史记录恢复。 */ }
  }, []);
  useEffect(() => {
    if (!task || !active(task)) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await videoJson<{ task: VideoTask }>(`${endpoint}?task=${task!.id}`);
        if (disposed) return;
        setTask(data.task); setPollError('');
        if (active(data.task)) timer = setTimeout(poll, 1800);
        else { void refresh(); }
      } catch (error) {
        if (!disposed) { setPollError(`${(error as Error).message}。任务不会因此重复提交，可稍后查询。`); timer = setTimeout(poll, 6000); }
      }
    }
    timer = setTimeout(poll, 1000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [task?.id, task?.status, pollVersion, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze() {
    if (busyRef.current || active(task)) return;
    busyRef.current = true; setParsing(true); setMessage(''); setPreview(null); setTask(null); request.current = null;
    try {
      const data = await videoJson<{ preview: VideoPreview }>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze', input }) });
      setPreview(data.preview); setFormatId(data.preview.formats[0]?.id || '');
    } catch (error) { setMessage((error as Error).message); }
    finally { setParsing(false); busyRef.current = false; }
  }
  async function extract() {
    if (!preview || !formatId || busyRef.current || active(task)) return;
    busyRef.current = true; setSubmitting(true); setMessage('');
    const key = `${preview.id}:${formatId}`;
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const id = request.current.id;
    try {
      const data = await videoJson<{ task: VideoTask }>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'extract', id, previewId: preview.id, formatId }) });
      setTask(data.task);
      try { sessionStorage.setItem('yxstar-video-task', id); } catch { /* 历史记录仍保存在服务端。 */ }
      if (!active(data.task)) void refresh();
    } catch (error) {
      // 响应丢失时先查询原任务；重试继续使用同一个编号。
      try { const data = await videoJson<{ task: VideoTask }>(`${endpoint}?task=${id}`); setTask(data.task); }
      catch { setMessage((error as Error).message); }
    } finally { setSubmitting(false); busyRef.current = false; }
  }
  async function paste() {
    try { setInput(await navigator.clipboard.readText()); setMessage(''); }
    catch { setMessage('浏览器未允许读取剪贴板，请直接粘贴到输入框。'); }
  }
  const selected = preview?.formats.find(format => format.id === formatId);
  const entitlement = !access ? '正在读取权益' : !access.signedIn ? '登录后使用' : access.chargeType === 'free' ? '免费提取' : access.membershipName ? access.membershipName : access.chargeType === 'points' ? `${access.pointsCost} 积分 / 次` : access.chargeType === 'paid' ? '本工具专属套餐' : '提取暂未开放';
  const expired = (item: VideoTask) => !item.permanent && Date.parse(item.expiresAt) <= time;
  const failed = task?.status === 'failed';
  return <main className="video-page">
    <nav className="tool-breadcrumb" aria-label="面包屑"><Link href="/">商城首页</Link><span>›</span><Link href="/tools">工具服务</Link><span>›</span><span>{tool.name}</span></nav>
    <header className="video-heading"><div><span className="video-kicker">YXSTAR VIDEO TOOLS</span><h1>{tool.name}</h1><p>把分享链接，变成方便保存的视频。</p></div><ol className="video-steps"><li><span>01</span><b>粘贴链接</b><small>支持完整分享文字</small></li><li><span>02</span><b>选择画质</b><small>解析预览不扣积分</small></li><li><span>03</span><b>提取下载</b><small>文件生成成功才计费</small></li></ol></header>
    <div className="video-workspace"><div className="video-main">
      <section className="video-panel video-input-panel" aria-labelledby="video-input-title"><div className="video-panel-heading"><div><span className="video-step">01</span><h2 id="video-input-title">粘贴视频链接</h2></div><span className="video-chip">免费解析</span></div><div className="video-panel-body"><label className="sr-only" htmlFor="video-link">视频分享链接或分享文字</label><textarea id="video-link" value={input} maxLength={8192} disabled={busy} onChange={event => setInput(event.target.value)} placeholder="粘贴抖音、快手、小红书、B站、Facebook 等视频分享链接，也可以粘贴完整分享文字或网页地址…" /><div className="video-input-actions"><div><button type="button" className="video-quiet" disabled={busy} onClick={() => void paste()}>粘贴链接</button><button type="button" className="video-quiet" disabled={busy || !input} onClick={() => setInput('')}>清空</button></div>{access && !access.signedIn ? <Link className="video-primary" href={videoLogin}>登录并解析 <span>→</span></Link> : <button type="button" className="video-primary" disabled={busy || !input.trim() || !access} onClick={() => void analyze()}>{parsing ? '正在解析…' : '开始解析'} <span>→</span></button>}</div><div className="video-platforms"><span>常见分享链接</span>{['抖音', '快手', '小红书', 'B站', '好看视频', 'Facebook', 'YouTube', '更多网页'].map(name => <b key={name}>{name}</b>)}</div><p className="video-note">支持公开平台视频、网页视频及未加密的 M3U8 点播。仅好友可见、私密、直播与加密内容无法通过公开链接提取。</p>{message && <p className="video-alert" role="alert">{message}</p>}</div></section>
      {parsing && <div className="video-panel video-empty" role="status"><span className="video-loading" /><h2>正在读取视频信息</h2><p>平台链接解析可能需要一些时间，本步骤不扣费。</p></div>}
      {preview && <section className="video-panel" aria-labelledby="video-result-title"><div className="video-panel-heading"><div><span className="video-step">02</span><h2 id="video-result-title">解析结果</h2></div><span className="video-chip">已找到视频</span></div><div className="video-panel-body"><div className="video-preview-info">{preview.coverUrl ? <Image unoptimized src={preview.coverUrl} alt="视频封面" width={160} height={104} onError={event => { event.currentTarget.style.display = 'none'; }} /> : <span className="video-cover-placeholder" aria-hidden="true">▷</span>}<div><h3>{preview.title}</h3><p>{preview.source}</p><small>{videoDuration(preview.duration)} · {preview.formats.length} 个可用选项</small></div></div><div className="video-format-row"><label>清晰度与文件格式<select disabled={busy} value={formatId} onChange={event => { setFormatId(event.target.value); request.current = null; setTask(null); }}><option disabled value="">请选择画质</option>{preview.formats.map(format => <option key={format.id} value={format.id}>{format.label}{format.size ? ` · 约 ${videoSize(format.size)}` : ''}</option>)}</select></label><div className="video-format-summary"><b>{selected?.extension.toUpperCase()}</b><small>{selected ? videoSize(selected.size) : ''}</small></div><button type="button" className="video-primary" disabled={busy || !access?.canExtract || !selected || task?.status === 'ready' || failed} onClick={() => void extract()}>{submitting ? '正在提交…' : active(task) ? '正在提取…' : task?.status === 'ready' ? '已生成文件' : failed ? '请重新解析' : '提取视频'} <span>↓</span></button></div><p className="video-note">以源站实际提供的画质为准，不额外提升清晰度。{access?.storageProvider === 'oss' ? '视频长期保存，可随时在提取记录中下载。' : '文件保留 24 小时。'}同一成品重复下载不再扣费。</p>{access && !access.canExtract && <p className="video-alert">{access.storageReady === false ? access.storageMessage : access.signedIn ? access.chargeType === 'pending' ? '后台尚未开放提取，可先查看解析结果。' : '当前权益不足，请在右侧充值积分或购买本工具套餐。' : '请先登录后提取。'}</p>}</div></section>}
      {task && <section className="video-panel" aria-labelledby="video-task-title"><div className="video-panel-heading"><div><span className="video-step">03</span><h2 id="video-task-title">{task.status === 'ready' ? '提取完成' : failed ? '提取未完成' : '正在生成视频文件'}</h2></div><span className="video-chip">{task.format}</span></div><div className="video-panel-body" aria-live="polite"><h3 className="video-task-name">{task.title}</h3>{active(task) && <><progress max={100} value={task.progress} aria-label="视频处理进度" /><p className="video-note">{task.status === 'queued' ? '任务已排队，等待开始处理。' : `${task.progress}% · 正在下载、合并或保存视频，请稍候。`} 处理完成前不扣费。</p></>}{failed && <p className="video-alert" role="alert">{task.error || '提取失败，本次未扣费。'}<button type="button" className="video-quiet" onClick={() => { request.current = null; setTask(null); }}>重新提取</button></p>}{pollError && <p className="video-alert" role="status">{pollError}<button type="button" className="video-quiet" onClick={() => setPollVersion(value => value + 1)}>查询进度</button></p>}{task.status === 'ready' && (expired(task) ? <p className="video-alert">文件已过期，请重新解析提取。</p> : <><video className="video-output" key={task.id} controls preload="metadata" src={`${task.downloadUrl}&inline=1`}>当前浏览器无法预览此格式，请下载后播放。</video><div className="video-download-row"><div><b>{task.permanent ? '视频已云端保存，可随时下载' : '视频已保存，可以下载了'}</b><p>{videoSize(task.size)} · {task.pointsSpent ? `已扣 ${task.pointsSpent} 积分` : task.charged ? '已使用 1 次权益' : '本次未扣积分或次数'}</p></div><a className="video-primary" href={task.downloadUrl}>下载视频 <span>↓</span></a></div></>)}</div></section>}
      {!preview && !task && !parsing && <section className="video-panel video-empty"><span className="video-empty-symbol" aria-hidden="true">▷</span><h2>喜欢的视频，轻松留存</h2><p>从分享菜单复制链接，或复制浏览器地址，粘贴到上方开始。</p><div><span>分享链接</span><i>→</i><span>画质选择</span><i>→</i><span>视频文件</span></div></section>}
      <section className="video-panel" aria-labelledby="video-history-title"><div className="video-panel-heading"><div><h2 id="video-history-title">我的提取记录</h2><span className="video-count">{access?.total || 0}</span></div><button type="button" className="video-quiet" onClick={() => void refresh()}>刷新</button></div><div className="video-history">{!access?.history.length ? <p className="video-note">{access?.signedIn ? '还没有提取记录，完成后会显示在这里。' : '登录后查看自己的提取记录。'}</p> : access.history.map(item => <div className="video-history-row" key={item.id}><span className="video-file-icon">{item.extension.toUpperCase()}</span><div><b>{item.title}</b><p>{item.format} · {new Date(item.createdAt).toLocaleString('zh-CN')}</p><small>{expired(item) ? '已过期' : item.status === 'ready' ? `${videoSize(item.size)} · ${item.permanent ? '长期保存' : '可重复下载'}` : item.status === 'failed' ? item.error : '正在处理'}</small></div>{item.status === 'ready' && !expired(item) ? <a href={item.downloadUrl} className="video-history-action">下载 ↓</a> : <button type="button" className="video-quiet" onClick={() => { setTask(item); setPollVersion(value => value + 1); }}>查看</button>}</div>)}</div>{access && access.total > 5 && <nav className="video-pagination" aria-label="提取记录分页"><button type="button" disabled={access.page <= 1} onClick={() => setPage(access.page - 1)}>上一页</button><span>{access.page} / {Math.ceil(access.total / 5)}</span><button type="button" disabled={access.page * 5 >= access.total} onClick={() => setPage(access.page + 1)}>下一页</button></nav>}</section>
    </div><aside className="video-sidebar"><section className="video-panel"><div className="video-panel-heading"><h2>当前使用权益</h2><button type="button" className="video-quiet" onClick={() => void refresh()}>刷新</button></div><div className="video-panel-body"><div className="video-entitlement"><span>仅成功生成文件后计费</span><h3>{entitlement}</h3><p>{access?.chargeType === 'points' ? `账户余额 ${access.pointsBalance} 积分${access.remaining ? ` · 可用次数 ${access.remaining}` : ''}` : access?.remaining ? `剩余 ${access.remaining} 次` : access?.chargeType === 'free' ? '无需购买，登录后即可提取' : '每个工具的会员权益独立'}</p></div>{accessError && <p className="video-alert" role="alert">{accessError}</p>}{access?.storageReady === false && <p className="video-alert" role="alert">{access.storageMessage}</p>}{access && !access.signedIn ? <Link className="video-secondary" href={videoLogin}>登录账户</Link> : access?.chargeType === 'points' ? <Link className="video-secondary" href="/points">充值通用积分 →</Link> : access?.chargeType === 'paid' && tool.plans.map(plan => <Link key={toolPlanKey(plan)} className="video-plan" href={`/product/${tool.id}?${toolPlanQuery(plan)}`}><span>{toolPlanLabel(plan)}</span><b>{toolPlanPrice(plan)}</b></Link>)}<ul className="video-rights-notes"><li>解析、失败不扣积分或次数</li><li>有效会员与已有次数优先使用</li><li>同一任务重复下载不额外计费</li></ul></div></section><section className="video-panel"><div className="video-panel-heading"><h2>使用小贴士</h2></div><div className="video-panel-body video-tips"><p><b>分享链接怎么找？</b>打开视频的分享菜单，点击“复制链接”。分享文字也可以直接粘贴。</p><p><b>浏览器里的视频呢？</b>复制网页地址即可尝试。支持公开直链、动态网页视频和 M3U8 点播，系统会自动选择解析方式。</p><p><b>为什么有些链接不能提取？</b>作品未公开、权限受限、源站验证或加密保护都会影响提取，页面会显示具体结果。</p><p><b>处理限制</b>平台视频最长 60 分钟；单次最多 {access?.maxSizeMb || 200} MB，每个账户同时最多处理 2 条。</p>{access && !access.engineReady && !access.browserReady && <p className="video-alert">平台解析引擎尚未安装，目前可尝试视频直链和公开网页视频。</p>}{access?.engineReady && !access.mergeReady && <p className="video-note">音视频合并组件尚未配置，部分 B站等分离画质暂不可用。</p>}</div></section><Link className="video-discover" href="/tools">← 发现更多实用工具</Link></aside></div>
    <section className="video-about"><h2>关于{tool.name}</h2><p>{tool.description || '支持常见平台分享链接与公开网页视频的解析、画质选择和下载。'}</p><p>支持尝试抖音、快手、小红书、B站、Facebook、YouTube、Instagram、X 等平台公开链接。具体可用性与清晰度由源站决定，仅保存你有权使用的内容。</p></section>
  </main>;
}
