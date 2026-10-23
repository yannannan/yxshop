"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultStampOptions, parseStampOptions, stampFonts, stampPresets, type StampAccess, type StampOptions, type StampResult } from '../lib/stamp-options';
import { toolBillingLabels, toolPlanPrice, toolPlanKey, toolPlanQuery, toolPlanLabel, type ToolService } from '../lib/tool-services';

function time(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
function entitlementText(access: StampAccess | null) {
  if (!access) return '正在读取使用权益';
  if (access.chargeType === 'free') return '免费制作';
  if (access.chargeType === 'pending') return '收费方式待确认';
  if (!access.canGenerate) return access.signedIn ? '暂无可用套餐' : '登录后使用套餐';
  if (access.cycle === 'times') return `剩余 ${access.remaining} 次`;
  return `${access.membershipName || toolBillingLabels[(access.cycle || 'once') as keyof typeof toolBillingLabels]}权益生效中`;
}

export function StampMaker({ tool }: { tool: ToolService }) {
  const [options, setOptions] = useState(defaultStampOptions);
  const [preview, setPreview] = useState('/stamp-previews/circle.png');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [access, setAccess] = useState<StampAccess | null>(null);
  const [accessError, setAccessError] = useState('');
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [result, setResult] = useState<(StampResult & { signature?: string }) | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(tool.plans[0] ? toolPlanKey(tool.plans[0]) : '');
  const request = useRef<{ id: string; signature: string } | null>(null);
  const previewObjectUrl = useRef('');
  const working = useRef(false);
  let normalized: StampOptions | null = null, validationError = '';
  try { normalized = parseStampOptions(options); }
  catch (error) { validationError = (error as Error).message; }
  const signature = normalized ? JSON.stringify(normalized) : '';
  const sameResult = Boolean(result?.signature && result.signature === signature);
  const updatingPreview = previewBusy && Boolean(signature);
  const round = options.shape === 'circle' || options.shape === 'ellipse';

  const refresh = useCallback(async () => {
    setChecking(true); setAccessError('');
    try {
      const response = await fetch('/api/tools/stamp-maker', { cache: 'no-store' });
      const data = await response.json() as StampAccess & { message?: string };
      if (!response.ok) { setAccessError(data.message || '权益读取失败'); setAccess(null); return; }
      setAccess(data);
    } catch { setAccessError('无法读取权益，请点击刷新后重试。'); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    if (!signature) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewBusy(true); setPreviewError('');
      try {
        const response = await fetch('/api/tools/stamp-maker/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: signature, signal: controller.signal });
        if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message || '预览更新失败'); }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
        previewObjectUrl.current = URL.createObjectURL(blob);
        setPreview(previewObjectUrl.current);
      } catch (error) { if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : '预览更新失败'); }
      finally { if (!controller.signal.aborted) setPreviewBusy(false); }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [signature, previewVersion]);
  useEffect(() => () => { if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current); }, []);

  function update(patch: Partial<StampOptions>) { setOptions(previous => ({ ...previous, ...patch })); setMessage(''); setRetryPending(false); }
  async function generate() {
    if (working.current || !normalized || (!access?.canGenerate && !retryPending)) return;
    working.current = true; setBusy(true); setMessage(''); setMessageSuccess(false);
    if (!request.current || request.current.signature !== signature) request.current = { id: crypto.randomUUID(), signature };
    try {
      const response = await fetch('/api/tools/stamp-maker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: request.current.id, options: normalized }) });
      const data = await response.json() as { result?: StampResult; message?: string };
      if (!response.ok || !data.result) { setRetryPending(response.status >= 500); setMessage(data.message || '制作失败，请重试'); return; }
      setResult({ ...data.result, signature });
      setRetryPending(false);
      setMessageSuccess(true);
      setMessage(data.result.reused ? '已恢复这次制作的成品，没有重复扣次。' : data.result.charged ? '制作成功，已使用 1 次权益。可以重复下载此成品。' : '制作成功，可以下载高清印章。');
    } catch { setRetryPending(true); setMessage('网络中断，可以重试本次制作。相同任务不会重复扣次。'); }
    finally { working.current = false; setBusy(false); void refresh(); }
  }
  async function restore(id: string) {
    if (working.current) return;
    working.current = true; setBusy(true); setMessage(''); setMessageSuccess(false);
    try {
      const response = await fetch(`/api/tools/stamp-maker?result=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await response.json() as { result?: StampResult; message?: string };
      if (!response.ok || !data.result) { setMessage(data.message || '成品读取失败'); return; }
      setResult(data.result); setRetryPending(false); setMessageSuccess(true); setMessage('已打开已制作的成品，重复下载不扣次。');
    } catch { setMessage('成品读取失败，请稍后重试。读取成品不会扣次。'); }
    finally { working.current = false; setBusy(false); }
  }
  const maxText = options.shape === 'name' ? 4 : options.shape === 'square' ? 12 : 32;
  const chosenPlan = tool.plans.find(plan => toolPlanKey(plan) === selectedPlan) || tool.plans[0];
  const buyHref = `/product/${tool.id}${chosenPlan ? `?${toolPlanQuery(chosenPlan)}` : ''}`;

  const layoutPanel = <section className="stamp-panel stamp-layout-panel" aria-labelledby="stamp-layout-title">
          <div className="stamp-panel-heading"><h2 id="stamp-layout-title">颜色与排版</h2></div>
          <fieldset disabled={busy} className="stamp-fields"><legend className="sr-only">颜色与排版设置</legend>
            <div className="stamp-form-section stamp-layout-grid">
              <div className="stamp-colors"><span>印章颜色</span>{['#c83932', '#aa302d', '#315a9a', '#293448'].map(color => <button type="button" key={color} className={options.color === color ? 'selected' : ''} style={{ backgroundColor: color }} aria-label={`选择颜色 ${color}`} aria-pressed={options.color === color} onClick={() => update({ color })} />)}<input type="color" value={options.color} aria-label="自定义印章颜色" onChange={event => update({ color: event.target.value })} /></div>
              <label>印章字体<select value={options.font} onChange={event => update({ font: event.target.value as StampOptions['font'] })}>{stampFonts.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
              <label>边框粗细<output>{options.border}</output><input type="range" min={6} max={24} value={options.border} onChange={event => update({ border: Number(event.target.value) })} /></label>
              {round && <><label>文字大小<output>{options.fontSize}</output><input type="range" min={28} max={80} value={options.fontSize} onChange={event => update({ fontSize: Number(event.target.value) })} /></label><label>文字弧度<output>{options.arc}°</output><input type="range" min={180} max={280} value={options.arc} onChange={event => update({ arc: Number(event.target.value) })} /></label><div><label>文字距边框<output>{options.textInset}</output><input type="range" min={0} max={100} value={options.textInset} aria-describedby="stamp-text-inset-hint" onChange={event => update({ textInset: Number(event.target.value) })} /></label><p id="stamp-text-inset-hint" className="stamp-field-hint">数值越大，印章名称越靠内；辅助文字和编号位置保持固定。</p></div><label>中心图案<select value={options.symbol} onChange={event => update({ symbol: event.target.value as StampOptions['symbol'] })}><option value="star">五角星</option><option value="dot">圆点</option><option value="none">不显示</option></select></label></>}
              <label>印章旋转<output>{options.rotation}°</output><input type="range" min={-20} max={20} value={options.rotation} onChange={event => update({ rotation: Number(event.target.value) })} /></label>
              <label className="stamp-checkbox"><input type="checkbox" checked={options.innerRing} onChange={event => update({ innerRing: event.target.checked })} />显示内边框</label>
            </div>
          </fieldset>
        </section>;
  const exportPanel = <section className="stamp-panel stamp-export-panel" aria-labelledby="stamp-export-title"><div className="stamp-panel-heading"><div><span className="stamp-step">03</span><h2 id="stamp-export-title">制作与下载</h2></div></div>
          <div className="stamp-export-bar">
          <fieldset className="stamp-export-options" disabled={busy}><legend className="sr-only">导出设置</legend><label>导出尺寸<select value={options.size} onChange={event => update({ size: Number(event.target.value) as StampOptions['size'] })}><option value={1024}>1024 × 1024 px</option><option value={1600}>1600 × 1600 px · 推荐</option><option value={2048}>2048 × 2048 px</option></select></label><label>图片背景<select value={options.background} onChange={event => update({ background: event.target.value as StampOptions['background'] })}><option value="transparent">透明背景</option><option value="white">白色背景</option></select></label></fieldset>
          <div className="stamp-entitlement"><div><span>当前使用权益</span><button className="stamp-text-button" type="button" disabled={checking || busy} onClick={() => void refresh()}>{checking ? '读取中…' : '刷新'}</button></div><strong>{entitlementText(access)}</strong>{access?.expiresAt && <p>有效期至 {time(access.expiresAt)}（北京时间）</p>}{access?.cycle && access.cycle !== 'times' && <p>当前有效权益内制作不扣次</p>}{access?.cycle === 'times' && <p>每成功制作一张，扣 1 次</p>}{access?.chargeType === 'free' && <p>无需购买，制作后直接下载</p>}{access?.chargeType === 'pending' && <p>你可以先调整样式并查看预览</p>}</div>
          <div className="stamp-export-action">
          {accessError && <p className="stamp-inline-error" role="alert">{accessError}</p>}
          {access?.chargeType === 'paid' && !access.canGenerate && !retryPending ? <Link className="stamp-create-button" href={buyHref}>{access.signedIn ? '购买 / 续购套餐' : '登录并购买套餐'} <span>↗</span></Link> : <button className="stamp-create-button" type="button" disabled={busy || checking || (!access?.canGenerate && !retryPending) || Boolean(validationError) || sameResult} onClick={() => void generate()}>{busy ? '正在处理…' : sameResult ? '制作完成，请下载' : retryPending ? '重试本次制作' : '制作高清印章'}<span>{busy ? '…' : '→'}</span></button>}
          <p className="stamp-charge-note">失败不扣次；重复下载不扣次。按次、包月、包年等规则以所购套餐为准。</p>
          </div>
          </div>
          {message && <p className={`stamp-operation-message${messageSuccess ? ' success' : ''}`} role={messageSuccess ? 'status' : 'alert'}>{message}</p>}
        </section>;

  return <main className="stamp-page">
    <nav className="stamp-breadcrumb" aria-label="面包屑"><Link href="/">商城首页</Link><span>／</span><Link href="/tools">工具服务</Link><span>／</span><span>{tool.name}</span></nav>
    <header className="stamp-heading"><div><span className="stamp-kicker">YXSTAR CREATIVE TOOLS</span><h1>{tool.name}</h1><p>选一个样式，写下你的文字。让每一枚印章，都有自己的表达。</p></div><div className="stamp-help"><span>简单三步，完成制作</span><ol><li><b>选择样式</b><p>从经典圆章、椭圆、方章或姓名章开始。</p></li><li><b>调整文字</b><p>编辑文字、配色与排版，查看实时效果。</p></li><li><b>制作并下载</b><p>生成高清 PNG，透明背景便于使用。</p></li></ol></div><div className="stamp-feature-pills"><span>透明 PNG</span><span>最高 2048 像素</span><span>预览不扣次</span></div></header>

    <div className="stamp-workspace">
      <section className="stamp-panel stamp-settings" aria-labelledby="stamp-settings-title">
        <div className="stamp-panel-heading"><div><span className="stamp-step">01</span><h2 id="stamp-settings-title">设计你的印章</h2></div><button type="button" className="stamp-text-button" disabled={busy} onClick={() => update(defaultStampOptions())}>重置</button></div>
        <fieldset disabled={busy} className="stamp-fields"><legend className="sr-only">印章设置</legend>
          <label className="stamp-field-title">选择样式</label>
          <div className="stamp-templates">{stampPresets.map(preset => <button type="button" key={preset.shape} className={options.shape === preset.shape ? 'selected' : ''} aria-pressed={options.shape === preset.shape} onClick={() => update({ ...preset.options, size: options.size, background: options.background, color: options.color, font: options.font, textInset: options.textInset })}><Image src={`/stamp-previews/${preset.shape}.png`} alt="" width={76} height={76} unoptimized /><b>{preset.name}</b><small>{preset.note}</small></button>)}</div>
          <div className="stamp-form-section"><h3>印章内容</h3><label>印章名称<span>{[...options.text].length} / {maxText}</span><input value={options.text} maxLength={maxText} onChange={event => update({ text: event.target.value })} placeholder={options.shape === 'name' ? '填写二至四个字' : '例如：宇星创意工作室'} /></label>
            {options.shape !== 'name' && <><label>辅助文字<small>选填</small><input value={options.subtitle} maxLength={12} onChange={event => update({ subtitle: event.target.value })} placeholder="例如：设计专用章" /></label><label>底部编号<small>选填</small><input value={options.code} maxLength={20} onChange={event => update({ code: event.target.value })} placeholder="字母、数字或短横线" /></label></>}
          </div>
        </fieldset>
      </section>

      <section className="stamp-center" aria-labelledby="stamp-preview-title">
        <div className="stamp-panel stamp-preview-panel"><div className="stamp-panel-heading"><div><span className="stamp-step">02</span><h2 id="stamp-preview-title">效果预览</h2></div><span className="stamp-preview-indicator">{updatingPreview ? '正在更新' : '实时预览'}</span></div><div className={`stamp-preview-stage ${options.background === 'white' ? 'white' : ''}`} aria-busy={updatingPreview}><span className="stamp-corner top-left" /><span className="stamp-corner bottom-right" /><Image className={updatingPreview ? 'is-updating' : ''} unoptimized src={preview} width={420} height={420} alt="当前印章的带水印效果预览" /><div className="stamp-preview-caption">{options.background === 'transparent' ? '棋盘格表示透明背景' : '白色背景'}<span>成品将移除预览水印</span></div></div>{(validationError || previewError) && <div className="stamp-inline-error stamp-preview-error" role="alert"><span>{validationError || previewError}</span>{previewError && !validationError && <button type="button" className="stamp-preview-retry" disabled={updatingPreview} onClick={() => setPreviewVersion(previous => previous + 1)}>重新预览</button>}</div>}<div className="stamp-preview-footer"><span>修改参数后自动更新</span><b>预览免费 · 制作成功才使用权益</b></div></div>
        {exportPanel}
        {result && <div className="stamp-panel stamp-result"><div><span className="stamp-success-icon">✓</span><div><h2>你的印章已制作完成</h2><p>{result.size} × {result.size} px · PNG{result.signature && !sameResult ? ' · 这是修改参数前的成品' : ''}</p></div></div><Image unoptimized src={result.image} alt="已制作的高清印章成品" width={160} height={160} /><a className="stamp-download-button" href={result.image} download={`yxstar-stamp-${result.id}.png`}>下载高清 PNG <span>↓</span></a><small>重复下载此成品不会扣次。修改参数并重新制作属于一次新的处理。</small></div>}
      </section>

      <aside className="stamp-sidebar" aria-labelledby="stamp-layout-title">
        {layoutPanel}
        {tool.chargeType === 'paid' && <section className="stamp-panel stamp-plan-panel"><h2>选择工具套餐</h2><p>支付核验后，回到本页刷新权益。</p><div className="stamp-plan-options">{tool.plans.map(plan => <label key={toolPlanKey(plan)} className={selectedPlan === toolPlanKey(plan) ? 'selected' : ''}><input type="radio" name="stamp-plan" checked={selectedPlan === toolPlanKey(plan)} onChange={() => setSelectedPlan(toolPlanKey(plan))} /><span>{toolPlanLabel(plan)}</span><b>{toolPlanPrice(plan)}</b></label>)}</div><Link href={buyHref}>查看套餐与支付方式 →</Link></section>}
        {Boolean(access?.recent.length) && <section className="stamp-panel stamp-recent"><h2>最近制作</h2><p>已生成的成品可以再次下载。</p>{access?.recent.map(item => <button type="button" disabled={busy} key={item.id} onClick={() => void restore(item.id)}><span><b>{item.size} px 印章</b><small>{time(item.createdAt)}</small></span><span>打开 ↗</span></button>)}</section>}
        <Link className="stamp-back-tools" href="/tools">← 发现更多实用工具</Link>
      </aside>
    </div>
    <section className="stamp-about"><h2>关于印章在线制作</h2><p>在浏览器中设计印章图片，支持圆形、椭圆形、方形和个人姓名章。调整名称、辅助文字、边框与颜色，生成清晰的透明或白底 PNG 图片。</p>{tool.detail && !tool.detail.includes('实际工具入口') && <p>{tool.detail}</p>}<div><article><h3>预览会消耗次数吗？</h3><p>不会。修改文字、颜色和样式都可以预览；点击制作且成功生成成品后，按次套餐才会扣除一次。</p></article><article><h3>包月、包年如何使用？</h3><p>沿用本工具后台配置的套餐及价格，在有效期内使用；有效时长权益优先于按次权益。</p></article><article><h3>下载失败怎么办？</h3><p>付费制作的成品会保留在最近制作中，同一成品可以重新打开和下载，不会重复扣次。</p></article></div></section>
  </main>;
}
