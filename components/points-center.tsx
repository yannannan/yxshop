'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { initialPoints, pointsLedgerLabels, type PointsAccount } from '../lib/points';

export function PointsCenter() {
  const [account, setAccount] = useState<PointsAccount | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(0);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const response = await fetch(`/api/points?page=${page}`, { cache: 'no-store' });
      const data = await response.json() as PointsAccount & { message?: string };
      if (!response.ok) throw new Error(data.message || '积分读取失败');
      setAccount(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : '积分读取失败，请稍后重试'); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function recharge(packageId: number) {
    if (buying) return;
    setBuying(packageId); setMessage('');
    try {
      const response = await fetch('/api/points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId }) });
      const data = await response.json() as { orderId?: string; message?: string };
      if (!response.ok || !data.orderId) throw new Error(data.message || '创建充值订单失败');
      window.location.assign(`/checkout/${encodeURIComponent(data.orderId)}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '连接失败，请稍后重试'); }
    finally { setBuying(0); }
  }
  return <main className="points-page">
    <header className="points-hero"><div><span className="section-kicker">YXSTAR POINTS</span><h1>一份积分，多种可能</h1><p>全站支持积分的工具共用余额，按各工具标明的积分数使用。</p><small>每位用户赠送 {initialPoints} 积分 · 成功处理后扣分 · 充值积分无到期时间</small></div><div className="points-balance"><span>我的可用积分</span><strong>{account?.signedIn ? account.balance.toLocaleString('zh-CN') : '—'}</strong>{account?.signedIn ? <button disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新余额 ↻'}</button> : <Link href="/?returnTo=/points">登录领取 {initialPoints} 积分 →</Link>}</div></header>
    {message && <p className="points-message" role="alert">{message}<button onClick={() => void load()}>重新读取</button></p>}
    <section aria-labelledby="points-packs-title"><div className="points-section-title"><div><h2 id="points-packs-title">选择积分充值套餐</h2><p>微信 / 支付宝扫码支付，管理员核验收款后到账。</p></div><Link href="/orders">查看充值订单 →</Link></div>
      {loading && !account ? <p role="status">正在读取充值套餐…</p> : <div className="points-packages">{account?.packages.map((pack, index) => <article key={pack.id} className={`points-package${index === 1 ? ' featured' : ''}`}><span className="points-package-label">{pack.name}</span><h3>{pack.points.toLocaleString('zh-CN')}<small>积分</small></h3><div className="points-price"><span>¥</span>{pack.price}<small> / 份</small></div><p>{pack.description || '灵活充值，多种工具共用'}</p><ul><li>到账积分：{pack.points}</li><li>成功处理才消耗积分</li><li>余额与使用记录随时可查</li></ul>{!account.signedIn ? <Link className="points-primary" href="/?returnTo=/points">登录后充值</Link> : <button className="points-primary" disabled={Boolean(buying) || !pack.paymentReady} onClick={() => void recharge(pack.id)}>{buying === pack.id ? '正在创建订单…' : pack.paymentReady ? '立即充值 →' : '收款配置中'}</button>}{!pack.paymentReady && <small>暂未开放购买，请联系管理员配置收款码。</small>}</article>)}</div>}
    </section>
    <section className="points-how"><article><b>01</b><h3>充值到账</h3><p>选择套餐并付款，核验后积分进入当前账号。</p></article><article><b>02</b><h3>自由选工具</h3><p>每个工具独立标价，使用同一个积分余额。</p></article><article><b>03</b><h3>成功才扣分</h3><p>有效的原会员与按次权益优先使用，重复下载不扣分。</p></article></section>
    <section className="points-records" aria-labelledby="points-records-title"><div className="points-section-title"><h2 id="points-records-title">积分明细</h2><Link href="/tools">发现实用工具 →</Link></div>{account?.signedIn ? <><div className="table-wrap"><table><thead><tr><th>时间</th><th>类型 / 工具</th><th>积分变动</th><th>变动后余额</th><th>关联订单</th></tr></thead><tbody>{account.ledger.map(row => <tr key={row.operation_id}><td>{new Date(row.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</td><td>{pointsLedgerLabels[row.kind] || row.kind}{row.product_name && <small>{row.product_name}</small>}</td><td className={Number(row.delta) > 0 ? 'points-credit' : ''}>{Number(row.delta) > 0 ? '+' : ''}{row.delta}</td><td>{row.balance_after}</td><td>{row.order_id ? <Link href={`/checkout/${encodeURIComponent(row.order_id)}`}>查看订单</Link> : '—'}</td></tr>)}</tbody></table></div>{!account.ledger.length && <p>暂无积分记录</p>}<div className="points-pagination"><button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {account.page} / {Math.max(1, Math.ceil(account.total / 20))} 页</span><button disabled={loading || page >= Math.ceil(account.total / 20)} onClick={() => setPage(page + 1)}>下一页</button></div></> : <p>登录后查看自己的积分余额与明细。</p>}</section>
  </main>;
}
