'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { validPoints, type PointsPackage } from '../lib/points';

type Method = 'wechat' | 'alipay';
type Qr = { type: string; amount: number; image_url: string | null; status: string };
type Draft = { imageUrl: string; enabled: boolean };
const methods = { wechat: '微信支付', alipay: '支付宝' } as const;

export function PointsPackageEditor({ initial, onClose, onSaved }: { initial: PointsPackage; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...initial, price: String(initial.price), points: String(initial.points) });
  const [qrs, setQrs] = useState<Qr[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<Method, Draft>>>>({});
  const [ready, setReady] = useState(!initial.id);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const saving = useRef(false), reading = useRef(false);
  const dialog = useRef<HTMLElement>(null), nameInput = useRef<HTMLInputElement>(null);
  const price = Number(form.price);
  const validPrice = Number.isFinite(price) && price > 0 && price <= 1000000 && Math.abs(price * 100 - Math.round(price * 100)) <= .000001;
  const amountKey = validPrice ? price.toFixed(2) : '';

  const loadQrs = useCallback(async (signal?: AbortSignal) => {
    setReady(false); setLoadError('');
    try {
      const response = await fetch(`/api/admin/points?resource=payment-qrs&id=${initial.id}`, { cache: 'no-store', signal });
      const data = await response.json() as { qrs?: Qr[]; message?: string };
      if (!response.ok || !Array.isArray(data.qrs)) throw new Error(data.message || '收款码读取失败');
      if (!signal?.aborted) { setQrs(data.qrs); setReady(true); }
    } catch (failure) { if (!signal?.aborted) setLoadError(failure instanceof Error ? failure.message : '收款码读取失败，请重试'); }
  }, [initial.id]);
  useEffect(() => {
    if (!initial.id) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadQrs(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [initial.id, loadQrs]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameInput.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving.current && !reading.current) onClose();
      } else if (event.key === 'Tab') {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
        const available = [...(nodes || [])].filter(node => !node.matches(':disabled'));
        const first = available[0], last = available.at(-1);
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [onClose]);

  function draftFor(type: Method): Draft {
    const draft = drafts[amountKey]?.[type];
    if (draft) return draft;
    const qr = qrs.find(item => item.type === type && Number(item.amount) === price);
    return { imageUrl: qr?.image_url || '', enabled: qr?.status === 'active' && Boolean(qr.image_url) };
  }
  function changeQr(type: Method, draft: Draft) {
    setDrafts(current => ({ ...current, [amountKey]: { ...current[amountKey], [type]: draft } }));
  }
  async function upload(type: Method, file?: File) {
    if (!file || reading.current || saving.current) return;
    if (!validPrice) { setError('请先填写有效的充值金额'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) { setError('收款码支持不超过 1MB 的 JPG、PNG、WebP 图片'); return; }
    reading.current = true; setUploading(true); setError('');
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.onabort = reject; reader.readAsDataURL(file);
      });
      changeQr(type, { imageUrl, enabled: true });
    } catch { setError('图片读取失败，请重新选择'); }
    finally { reading.current = false; setUploading(false); }
  }
  function close() { if (!saving.current && !reading.current) onClose(); }
  async function save() {
    if (saving.current || reading.current || !ready) return;
    if (!validPrice || !validPoints(Number(form.points)) || !form.name.trim()) { setError('请填写套餐名称、正整数积分和有效的充值金额'); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      const paymentQrs = (Object.keys(methods) as Method[]).map(type => ({ type, amount: price, ...draftFor(type) }));
      const response = await fetch('/api/admin/points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', id: initial.id, name: form.name, description: form.description, points: Number(form.points), price, status: form.status, paymentQrs }) });
      const data = await response.json().catch(() => null) as { ok?: boolean; id?: number; message?: string } | null;
      if (!response.ok) throw new Error(data?.message || (response.status === 413 ? '图片总大小超过服务器限制，请缩小图片后重试' : '保存失败，请稍后重试'));
      if (!data?.ok || !Number.isSafeInteger(data.id)) throw new Error('服务端返回异常，请重新读取套餐确认保存结果');
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '连接失败，请稍后重试'); }
    finally { saving.current = false; setBusy(false); }
  }

  return <div className="admin-modal-mask points-package-mask"><section ref={dialog} className="admin-modal points-package-dialog" role="dialog" aria-modal="true" aria-labelledby="points-edit-title" aria-describedby="points-edit-hint">
    <header className="points-package-heading"><div><span>积分充值套餐</span><h2 id="points-edit-title">{initial.id ? '编辑套餐与收款配置' : '新增套餐与收款配置'}</h2><p id="points-edit-hint">填写套餐信息和支付二维码，最后统一保存。</p></div><button className="points-package-close" type="button" disabled={busy || uploading} onClick={close} aria-label="关闭套餐编辑">×</button></header>
    <form className="points-package-form" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}>
      <div className="points-package-body">
        <fieldset className="points-package-fields" disabled={busy || uploading}><legend>套餐信息</legend><div className="points-package-grid"><label className="points-package-wide">套餐名称<input ref={nameInput} required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：轻享积分包" /></label><label>到账积分<input required type="number" min={1} max={1000000} step={1} value={form.points} onChange={event => setForm({ ...form, points: event.target.value })} /></label><label>充值金额（元）<input required type="number" min={.01} max={1000000} step={.01} value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /></label><label className="points-package-wide">套餐说明<textarea rows={2} maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="介绍这个套餐适合的使用需求" /></label><label className="points-package-wide">展示状态<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="active">上架</option><option value="inactive">下架</option></select></label></div></fieldset>
        <section className="points-package-payments" aria-labelledby="points-package-payments-title"><div className="points-package-section-title"><h3 id="points-package-payments-title">支付二维码</h3><span>{validPrice ? `本次充值 ¥${price.toFixed(2)}` : '请先填写有效金额'}</span></div><p>图片上传后只在本面板预览，点击底部“保存全部配置”后才生效。</p>{Boolean(initial.id) && validPrice && price !== initial.price && <p className="points-package-price-note">当前金额已修改，请配置与新金额对应的收款码。旧金额配置仍供原订单使用。</p>}
          {!ready && <div className={loadError ? 'points-package-error' : 'points-package-loading'} role={loadError ? 'alert' : 'status'}>{loadError || '正在读取已有收款码…'}{loadError && <button type="button" disabled={busy || uploading} onClick={() => void loadQrs()}>重新读取</button>}</div>}
          <fieldset className="points-package-qr-fields" disabled={busy || uploading || !ready || !validPrice}><legend className="sr-only">微信与支付宝收款配置</legend><div className="points-package-methods">{(Object.entries(methods) as [Method, string][]).map(([type, label]) => {
            const draft = draftFor(type), changed = Boolean(drafts[amountKey]?.[type]);
            return <article className={`points-package-method ${type}`} key={type}><div className="points-package-method-title"><span aria-hidden="true">{type === 'wechat' ? '微' : '支'}</span><h4>{label}</h4><small>{changed ? '待保存' : draft.imageUrl ? draft.enabled ? '已启用' : '已停用' : '未配置'}</small></div><div className="points-package-qr-preview">{draft.imageUrl ? <Image unoptimized src={draft.imageUrl} alt={`${label}收款码预览`} width={156} height={156} /> : <div><span aria-hidden="true">＋</span><span>待上传收款码</span></div>}</div><label className="points-package-upload"><span>{draft.imageUrl ? '更换图片' : '选择图片'}</span><input type="file" aria-label={`${label}收款码图片`} accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(type, file); }} /></label><small className="points-package-file-hint">JPG、PNG、WebP，单张不超过 1MB</small><div className="points-package-method-actions"><label><input type="checkbox" checked={draft.enabled} disabled={!draft.imageUrl} onChange={event => changeQr(type, { ...draft, enabled: event.target.checked })} />启用{label}</label>{draft.imageUrl && <button type="button" onClick={() => changeQr(type, { imageUrl: '', enabled: false })}>移除图片</button>}</div></article>;
          })}</div></fieldset><small className="points-package-payment-hint">可以只启用一种支付方式；未上传或未启用的方式不会开放收款。付款后仍由管理员核验。</small>
        </section>
      </div>
      <footer className="points-package-footer">{error && <p className="points-package-error" role="alert">{error}</p>}<div><p>{uploading ? '正在读取图片，请稍候…' : '套餐信息与两种收款配置将一起保存。'}<small>关闭将放弃本次未保存的修改。</small></p><div className="points-package-footer-actions"><button className="points-package-cancel" type="button" disabled={busy || uploading} onClick={close}>取消</button><button className="points-package-save" type="submit" disabled={busy || uploading || !ready}>{busy ? '正在保存…' : '保存全部配置'}</button></div></div></footer>
    </form>
  </section></div>;
}
