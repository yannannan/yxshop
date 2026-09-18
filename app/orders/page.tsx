'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type Order = { id: string; amount: number; status: string; product_name: string; email: string; created_at: string };

const statusText: Record<string, string> = { pending: '待支付', verification: '待发货', paid: '已支付', pending_delivery: '待发货', delivered: '已发货', closed: '已关闭' };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const visibleOrders = orders.filter((order) => order.status !== 'closed');

  useEffect(() => {
    let active = true;
    fetch('/api/orders').then(async (response) => {
      const data = await response.json();
      if (!active) return;
      if (response.status === 401) setUnauthorized(true);
      else setOrders(Array.isArray(data) ? data : []);
    }).catch(() => { if (active) setOrders([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <main className="simple-page orders-page">
    <header className="inner-header"><Link className="brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span></Link><span className="orders-header-label">订单中心</span><Link href="/">返回商城</Link></header>
    <section className="orders-wrap"><div className="orders-title"><div><span className="section-kicker">ORDER CENTER</span><h1>我的订单</h1><p>查看订单状态与商品交付信息</p></div><Link href="/">继续选购 →</Link></div>
      {loading ? <div className="orders-empty">正在读取订单…</div> : unauthorized ? <div className="orders-empty"><b>登录后查看订单</b><p>请使用下单手机号登录后，再查看订单记录。</p><Link href="/">返回商城登录</Link></div> : visibleOrders.length === 0 ? <div className="orders-empty"><b>暂时没有订单</b><p>选购商品后，订单会显示在这里。</p><Link href="/">去选购商品</Link></div> : <div className="orders-list">{visibleOrders.map((order) => <article className="order-card" key={order.id}><div className="order-card-top"><span>订单号：{order.id}</span><b className={`order-status status-${order.status}`}>{statusText[order.status] || order.status}</b></div><div className="order-card-body"><span className="order-product-icon">Q</span><div className="order-product"><small>购买商品</small><b>{order.product_name}</b><span>接收邮箱：{order.email}</span></div><div className="order-price"><small>实付金额</small><b><em>¥</em>{order.amount}</b></div><div className="order-action"><small>{new Date(order.created_at).toLocaleString('zh-CN', { hour12: false })}</small>{order.status === 'pending' ? <Link href={`/checkout/${order.id}`}>继续支付</Link> : <Link href={`/checkout/${order.id}`}>查看订单</Link>}</div></div></article>)}</div>}
    </section>
  </main>;
}
