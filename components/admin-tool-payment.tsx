'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toolPlanLabel, type ToolPlan } from '../lib/tool-services';

type Qr = { id: number; type: string; amount: number; image_url: string | null; status: string };
type Draft = { image: string; enabled: boolean };
const methods = { wechat: '微信支付', alipay: '支付宝' } as const;

export function ToolPaymentConfig({ id, plans, disabled }: { id: number; plans: ToolPlan[]; disabled: boolean }) {
  const [qrs, setQrs] = useState<Qr[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    setReady(false);
    try {
      const response = await fetch(`/api/admin/tools?resource=payment-qrs&id=${id}`, { cache: 'no-store' });
      const result = await response.json() as { qrs?: Qr[]; message?: string };
      if (!response.ok) { setMessage(result.message || '收款码读取失败'); return; }
      setQrs(result.qrs || []); setDrafts({}); setReady(true);
    } catch { setMessage('收款码读取失败，请重试'); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  function draftFor(amount: number, type: string): Draft {
    const qr = qrs.find(qr => qr.type === type && Number(qr.amount) === amount);
    return drafts[`${amount}-${type}`] || { image: qr?.image_url || '', enabled: qr?.status === 'active' };
  }
  async function upload(amount: number, type: string, file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) { setMessage('收款码支持不超过 1MB 的 JPG、PNG、WebP 图片'); return; }
    setBusy(true); setMessage('');
    try {
      const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      setDrafts(current => ({ ...current, [`${amount}-${type}`]: { image, enabled: true } }));
    } catch { setMessage('图片读取失败，请重新选择'); }
    finally { setBusy(false); }
  }
  async function save(amount: number, type: string) {
    setBusy(true); setMessage('');
    try {
      const draft = draftFor(amount, type);
      const response = await fetch('/api/admin/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'qr-save', id, amount, type, imageUrl: draft.image, enabled: draft.enabled }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) { setMessage(result.message || '收款码保存失败'); return; }
      setQrs(current => [{ id: 0, type, amount, image_url: draft.image || null, status: draft.enabled ? 'active' : 'inactive' }, ...current.filter(qr => qr.type !== type || Number(qr.amount) !== amount)]);
      setDrafts(current => { const next = { ...current }; delete next[`${amount}-${type}`]; return next; });
      setMessage('收款码已保存');
    } catch { setMessage('收款码保存失败，请稍后重试'); }
    finally { setBusy(false); }
  }
  const amounts = [...new Set(plans.map(plan => plan.price))];
  return <div className="tool-payment-config"><h4>支付二维码</h4><p className="tool-editor-hint">按套餐金额配置收款码，相同金额的套餐共用一组。支付后由后台人工核验。</p>
    {disabled && <p className="tool-editor-hint">套餐已修改，请先点击“保存并配置收款码”。</p>}
    {message && <p role="status" className="tool-payment-message">{message}</p>}
    {!ready && <button type="button" disabled={busy} onClick={() => void load()}>重新读取收款码</button>}
    <fieldset disabled={disabled || busy || !ready}>{amounts.map(amount => <section className="tool-payment-group" key={amount}><b>{plans.filter(plan => plan.price === amount).map(plan => toolPlanLabel(plan)).join(' / ')} · ¥{amount.toFixed(2)}</b><div className="tool-payment-methods">{Object.entries(methods).map(([type, label]) => {
      const draft = draftFor(amount, type);
      const saved = qrs.find(qr => qr.type === type && Number(qr.amount) === amount);
      const configured = Boolean(saved?.image_url && saved.status === 'active');
      return <article key={type}><div className="tool-payment-preview">{draft.image ? <Image unoptimized src={draft.image} alt={`${label}收款码预览`} width={90} height={90} /> : <span>待上传</span>}</div><b>{label}</b><small>{configured ? '已配置并启用' : '未配置或未启用'}{drafts[`${amount}-${type}`] ? ' · 有未保存修改' : ''}</small><input aria-label={`${label} ¥${amount.toFixed(2)} 收款码`} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void upload(amount, type, event.target.files?.[0])} /><label><input type="checkbox" checked={draft.enabled} onChange={event => setDrafts(current => ({ ...current, [`${amount}-${type}`]: { ...draft, enabled: event.target.checked } }))} />启用该收款方式</label><button type="button" onClick={() => void save(amount, type)}>保存该收款码</button></article>;
    })}</div></section>)}</fieldset>
  </div>;
}
