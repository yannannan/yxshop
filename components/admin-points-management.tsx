'use client';

import { useCallback, useEffect, useState } from 'react';
import { ToolPaymentConfig } from './admin-tool-payment';
import { pointsLedgerLabels, type PointsPackage } from '../lib/points';

type Resource = 'packages' | 'orders' | 'wallets' | 'ledger';
type Row = { id: string | number; user_id: number; phone: string; email: string; balance: number; operation_id: string; kind: string; delta: number; balance_after: number; product_name: string; order_id: string; created_at: string; amount: number; points_amount: number; status: string };
const titles: Record<Resource, string> = { packages: '充值套餐', orders: '充值订单', wallets: '用户积分', ledger: '积分流水' };
export function PointsManagement() {
  const [resource, setResource] = useState<Resource>('packages');
  const [packages, setPackages] = useState<PointsPackage[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<PointsPackage | null>(null);
  const [verify, setVerify] = useState<Row | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/points?resource=${resource}&page=${page}&q=${encodeURIComponent(search)}`, { cache: 'no-store' });
      const data = await response.json() as { message?: string; packages?: PointsPackage[]; rows?: Row[]; total?: number };
      if (!response.ok) throw new Error(data.message || '读取失败');
      if (resource === 'packages') setPackages(data.packages || []);
      else { setRows(data.rows || []); setTotal(Number(data.total || 0)); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '读取失败'); }
    finally { setLoading(false); }
  }, [resource, page, search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function action(body: object) {
    if (busy) return null;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json() as { message?: string; id?: number };
      if (!response.ok) throw new Error(data.message || '保存失败');
      setMessage(data.message || '已保存'); void load(); return data;
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); return null; }
    finally { setBusy(false); }
  }
  return <div className="admin-points"><div className="panel-title"><div><h2>积分管理</h2><p>全工具通用余额；充值核验、赠送及消费均保留流水。</p></div><button disabled={loading} onClick={() => void load()}>刷新</button></div>
    <div className="order-tabs">{(Object.keys(titles) as Resource[]).map(key => <button key={key} className={key === resource ? 'active' : ''} onClick={() => { setResource(key); setPage(1); setRows([]); setMessage(''); }}>{titles[key]}</button>)}</div>
    {message && <p className="points-message" role="status">{message}</p>}
    {resource === 'packages' ? <><p className="admin-points-notice">每位用户赠送 100 积分。充值金额与积分以下单时的快照为准；改价后需重新配置相应金额的收款码。已有订单不受套餐改价影响。</p><button onClick={() => setForm({ id: 0, name: '', points: 200, price: 20, description: '', status: 'inactive' })}>新增充值套餐</button><div className="points-packages">{packages.map(pack => <article className="points-package" key={pack.id}><b>{pack.name}</b><h3>{pack.points} <small>积分</small></h3><div className="points-price">¥{pack.price}</div><p>{pack.description}</p><small>{pack.status === 'active' ? '已上架' : '已下架'} · {pack.paymentReady ? '收款码已配置' : '待配置收款码'}</small><button className="points-primary" onClick={() => setForm(pack)}>编辑 / 配置收款码</button><button className="text-action" disabled={busy} onClick={() => void action({ action: 'status', id: pack.id, status: pack.status === 'active' ? 'inactive' : 'active' })}>{pack.status === 'active' ? '下架' : '上架'}</button></article>)}</div></> : <><form className="admin-points-filter" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query); }}><input value={query} placeholder="按手机号查询" aria-label="按手机号查询" onChange={event => setQuery(event.target.value)} /><button>查询</button></form><div className="table-wrap"><table><thead><tr>{(resource === 'wallets' ? ['用户', '邮箱', '可用积分'] : resource === 'orders' ? ['订单号', '用户', '套餐', '金额', '到账积分', '状态', '下单时间', '操作'] : ['时间', '用户', '类型 / 工具', '积分变动', '变动后余额', '关联订单']).map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.operation_id || row.id}>{resource === 'wallets' ? <><td>{row.phone}</td><td>{row.email}</td><td>{row.balance}</td></> : resource === 'orders' ? <><td>{row.id}</td><td>{row.phone}</td><td>{row.product_name}</td><td>¥{row.amount}</td><td>{row.points_amount}</td><td>{row.status === 'delivered' ? '已到账' : row.status === 'pending' ? '待支付核验' : row.status === 'closed' ? '已关闭' : row.status}</td><td>{new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })}</td><td>{row.status === 'pending' && <button disabled={busy} className="text-action" onClick={() => setVerify(row)}>核验收款并到账</button>}</td></> : <><td>{new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })}</td><td>{row.phone}</td><td>{pointsLedgerLabels[row.kind] || row.kind}<small>{row.product_name}</small></td><td>{Number(row.delta) > 0 ? '+' : ''}{row.delta}</td><td>{row.balance_after}</td><td>{row.order_id || '—'}</td></>}</tr>)}</tbody></table></div>{!rows.length && <p>{loading ? '读取中…' : '暂无记录'}</p>}<div className="points-pagination"><button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil(total / 20))}</span><button disabled={loading || page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>下一页</button></div></>}
    {form && <div className="admin-modal-mask"><section className="admin-modal admin-points-dialog" role="dialog" aria-modal="true" aria-labelledby="points-edit-title"><div className="modal-heading"><h2 id="points-edit-title">{form.id ? '编辑积分充值套餐' : '新增积分充值套餐'}</h2><button disabled={busy} onClick={() => setForm(null)} aria-label="关闭">×</button></div><form onSubmit={async event => { event.preventDefault(); const data = await action({ ...form, action: 'save' }); if (data) setForm({ ...form, id: Number(data.id) }); }}><label>套餐名称<input required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><div className="admin-form-grid"><label>到账积分<input required type="number" min={1} max={1000000} step={1} value={form.points} onChange={event => setForm({ ...form, points: Number(event.target.value) })} /></label><label>充值金额（元）<input required type="number" min={.01} max={1000000} step={.01} value={form.price} onChange={event => setForm({ ...form, price: Number(event.target.value) })} /></label></div><label>套餐说明<textarea maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label><label>状态<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="active">上架</option><option value="inactive">下架</option></select></label><div className="admin-form-actions"><button disabled={busy}>{busy ? '保存中…' : '保存套餐'}</button><button type="button" className="ghost-button" disabled={busy} onClick={() => setForm(null)}>关闭</button></div></form><p className="admin-points-notice">先保存套餐，再上传并启用与当前金额对应的微信 / 支付宝收款码。未配置收款码时，前台不能发起购买。</p>{Boolean(form.id) && <ToolPaymentConfig id={form.id} endpoint="/api/admin/points" plans={[{ cycle: 'once', price: form.price, name: form.name }]} disabled={busy || packages.find(pack => pack.id === form.id)?.price !== form.price} />}</section></div>}
    {verify && <div className="admin-modal-mask"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="points-verify-title"><h2 id="points-verify-title">确认已实际收到充值款？</h2><p>订单 {verify.id}</p><p>收款 ¥{verify.amount}，向 {verify.phone} 充值 {verify.points_amount} 积分。请核对真实到账款项后确认。</p><div className="admin-form-actions"><button className="ghost-button" disabled={busy} onClick={() => setVerify(null)}>取消</button><button disabled={busy} onClick={async () => { if (await action({ action: 'verify', orderId: verify.id })) setVerify(null); }}>确认收款并到账</button></div></section></div>}
  </div>;
}
