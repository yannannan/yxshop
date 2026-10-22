'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toolChargeLabels, toolPagePath, type ToolChargeType } from '../lib/tool-services';

type Row = Record<string, string | number | null>;
type Form = { id?: number; name: string; slug: string; description: string; detail: string; logo: string; entryUrl: string; chargeType: ToolChargeType; price: string; seoTitle: string; seoDescription: string; status: string };
export type ToolDraft = Partial<Pick<Form, 'name' | 'description' | 'detail' | 'logo' | 'price'>>;
const emptyForm = (): Form => ({ name: '', slug: '', description: '', detail: '', logo: '', entryUrl: '', chargeType: 'pending', price: '0', seoTitle: '', seoDescription: '', status: 'inactive' });
const value = (input: unknown) => String(input ?? '');

export function ToolManagement({ autoCreate = false, initialDraft, onCreateClose, onPayment }: { autoCreate?: boolean; initialDraft?: ToolDraft; onCreateClose: () => void; onPayment: (tool: Row) => void }) {
  const [tools, setTools] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<Form | null>(() => autoCreate ? { ...emptyForm(), ...initialDraft } : null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tools', { cache: 'no-store' });
      const result = await response.json() as { tools?: Row[]; message?: string };
      if (!response.ok) { setNotice(result.message || '工具读取失败'); return; }
      setTools(result.tools || []);
    } catch { setNotice('无法读取工具列表，请稍后重试'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  function close() { setForm(null); setError(''); onCreateClose(); }
  function edit(tool: Row) {
    setError('');
    setForm({ id: Number(tool.id), name: value(tool.name), slug: value(tool.tool_slug), description: value(tool.description), detail: value(tool.detail), logo: value(tool.cover_image), entryUrl: value(tool.tool_url), chargeType: (value(tool.tool_charge_type) || 'pending') as ToolChargeType, price: value(tool.price || 0), seoTitle: value(tool.seo_title), seoDescription: value(tool.seo_description), status: value(tool.status) });
  }
  async function save() {
    if (!form || saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', ...form }) });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok || !result || typeof result !== 'object') { setError(result?.message || (response.ok ? '服务端返回异常，请稍后重试' : `保存失败（HTTP ${response.status}）`)); return; }
      close(); setNotice('工具已保存。收费工具可在列表中继续配置支付二维码。'); await load();
    } catch { setError('无法连接服务器，请稍后重试'); }
    finally { setSaving(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Logo 支持 JPG、PNG、WebP 图片'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Logo 不能超过 5MB'); return; }
    setUploading(true); setError('');
    try {
      const body = new FormData(); body.set('file', file);
      const response = await fetch('/api/product-images', { method: 'POST', body });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok || !result.url) { setError(result.message || 'Logo 上传失败'); return; }
      setForm(current => current ? { ...current, logo: result.url! } : current);
    } catch { setError('Logo 上传失败，请稍后重试'); }
    finally { setUploading(false); }
  }
  async function changeStatus(tool: Row) {
    try {
      const response = await fetch('/api/admin/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status', id: Number(tool.id), status: tool.status === 'active' ? 'inactive' : 'active' }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) { setNotice(result.message || '操作失败'); return; }
      await load();
    } catch { setNotice('状态更新失败，请稍后重试'); }
  }
  const visible = tools.filter(tool => `${value(tool.name)} ${value(tool.description)} ${value(tool.tool_slug)}`.toLowerCase().includes(keyword.trim().toLowerCase()));
  return <>
    {notice && <div className="admin-message" role="status">{notice}</div>}
    <div className="panel-title"><div><h2>工具服务</h2><p>独立维护工具入口、页面介绍、收费方式与支付配置</p></div><div className="panel-title-actions"><button onClick={() => void load()} disabled={loading}>↻ 刷新列表</button><button onClick={() => { setError(''); setForm(emptyForm()); }}>＋ 添加工具</button></div></div>
    <div className="product-filter"><b>查找工具</b><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="工具名称、描述、页面标识" /><small>共 {visible.length} 个工具</small></div>
    <div className="table-wrap"><table><thead><tr><th>工具</th><th>独立页面</th><th>收费方式</th><th>入口配置</th><th>状态</th><th>操作</th></tr></thead><tbody>{visible.map(tool => <tr key={Number(tool.id)}><td><div className="admin-product-cell">{tool.cover_image ? <Image unoptimized src={value(tool.cover_image)} alt="" width={44} height={44} /> : <span>工</span>}<div><b>{value(tool.name)}</b><small>{value(tool.description)}</small></div></div></td><td><Link href={toolPagePath(value(tool.tool_slug))} target="_blank">{toolPagePath(value(tool.tool_slug))}</Link></td><td>{toolChargeLabels[value(tool.tool_charge_type) as ToolChargeType] || '收费待确认'}{tool.tool_charge_type === 'paid' && <small>¥{Number(tool.price).toFixed(2)}</small>}</td><td>{tool.tool_url ? '已配置' : '待配置'}</td><td>{tool.status === 'active' ? '已启用' : '已停用'}</td><td><button className="text-action" onClick={() => edit(tool)}>编辑</button>{tool.tool_charge_type === 'paid' && <button className="text-action" onClick={() => onPayment(tool)}>支付二维码</button>}<button className="text-action" onClick={() => void changeStatus(tool)}>{tool.status === 'active' ? '停用' : '启用'}</button></td></tr>)}</tbody></table>{!loading && !visible.length && <p className="tool-directory-empty">暂无工具，请添加或执行初始化 SQL。</p>}</div>
    {form && <div className="admin-modal-mask"><section className="admin-modal tool-editor-modal product-editor-modal" role="dialog" aria-modal="true" aria-labelledby="tool-editor-title"><div className="editor-head"><div><span className="section-kicker">TOOL SERVICE</span><b id="tool-editor-title">{form.id ? '编辑工具' : '添加工具'}</b></div><button className="modal-close" disabled={saving || uploading} onClick={close} aria-label="关闭工具编辑">×</button></div>
      <div className="tool-editor-section"><h3>入口展示</h3><div className="tool-editor-grid">
        <label>工具名称<input autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>工具 Logo<div className="tool-logo-upload">{form.logo && <Image unoptimized src={form.logo} alt="Logo 预览" width={52} height={52} />}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => void upload(event.target.files?.[0])} /></div></label>
        <label className="wide-field">工具描述<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="工具列表中的简短介绍" /></label>
        <label className="wide-field">工具入口链接<input value={form.entryUrl} onChange={event => setForm({ ...form, entryUrl: event.target.value })} placeholder="https://… 或 /站内工具路径，可暂时留空" /></label>
        <label>展示状态<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="inactive">暂不展示</option><option value="active">启用展示</option></select></label>
      </div></div>
      <div className="tool-editor-section"><h3>收费与收款</h3><div className="tool-editor-grid"><label>收费方式<select value={form.chargeType} onChange={event => setForm({ ...form, chargeType: event.target.value as ToolChargeType })}><option value="pending">待确认</option><option value="free">免费</option><option value="paid">收费</option></select></label>{form.chargeType === 'paid' && <label>使用价格（元）<input type="number" min="0.01" step="0.01" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /></label>}</div><p className="tool-editor-hint">收费工具沿用商城下单、二维码支付及人工核验。先保存工具，再从列表配置微信或支付宝收款码。</p></div>
      <div className="tool-editor-section"><h3>独立页面与搜索展示</h3><div className="tool-editor-grid"><label className="wide-field">页面标识<input value={form.slug} readOnly={Boolean(form.id && form.slug)} onChange={event => setForm({ ...form, slug: event.target.value })} placeholder="例如 c-drive-cleaner" /><small>独立地址：{toolPagePath(form.slug || 'your-tool')}，保存后固定。</small></label><label className="wide-field">工具详细介绍<textarea value={form.detail} onChange={event => setForm({ ...form, detail: event.target.value })} placeholder="独立页面展示的功能说明和使用方式" /></label><label className="wide-field">SEO 标题（可选）<input value={form.seoTitle} onChange={event => setForm({ ...form, seoTitle: event.target.value })} placeholder="留空时使用工具名称" /></label><label className="wide-field">SEO 描述（可选）<textarea value={form.seoDescription} onChange={event => setForm({ ...form, seoDescription: event.target.value })} placeholder="留空时使用工具描述" /></label></div></div>
      {error && <div className="product-editor-error" role="alert">{error}</div>}<div className="admin-form-actions"><button className="ghost-button" disabled={saving || uploading} onClick={close}>取消</button><button disabled={saving || uploading} onClick={() => void save()}>{saving ? '正在保存…' : uploading ? '正在上传…' : '保存工具'}</button></div>
    </section></div>}
  </>;
}
