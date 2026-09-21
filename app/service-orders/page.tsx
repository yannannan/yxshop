"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type ServiceOrder = {
  id: string;
  service_title: string;
  service_slug: string;
  provider_name: string;
  delivery_mode: string;
  amount: number | null;
  status: string;
  scheduled_at: string;
  created_at: string;
};

const statusText: Record<string, string> = {
  pending_quote: "待报价", pending_payment: "待支付", payment_review: "支付核验", paid: "已支付", in_service: "服务中", completed: "已完成", closed: "已关闭", cancelled: "已取消",
};

export default function TechnicalServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/technical-service-orders", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!active) return;
      if (response.status === 401) setUnauthorized(true);
      else setOrders(Array.isArray(result) ? result : []);
    }).catch(() => { if (active) setOrders([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = orders.filter((order) => !["closed","cancelled"].includes(order.status));

  return <main className="simple-page orders-page">
    <header className="inner-header">
      <Link className="brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span></Link>
      <span className="orders-header-label">技术服务订单</span>
      <div className="orders-header-actions"><Link href="/addresses">我的地址</Link><Link href="/orders">商城订单</Link></div>
    </header>
    <section className="orders-wrap">
      <div className="orders-title"><div><span className="section-kicker">SERVICE ORDER CENTER</span><h1>我的技术服务订单</h1><p>查看购买、支付和技术服务进度</p></div><Link href="/?channel=technical">继续选择技术服务 →</Link></div>
      {loading ? <div className="orders-empty">正在读取技术服务订单…</div> : unauthorized ? <div className="orders-empty"><b>登录后查看技术服务订单</b><p>请使用商城手机号登录后再查看。</p><Link href="/?channel=technical">返回技术服务</Link></div> : !visible.length ? <div className="orders-empty"><b>暂时没有技术服务订单</b><p>购买技术服务后，订单会显示在这里。</p><Link href="/?channel=technical">选择技术服务</Link></div> : <div className="orders-list">{visible.map((order) => <article className="order-card" key={order.id}>
        <div className="order-card-top"><span>服务订单号：{order.id}</span><b className={`order-status status-${order.status}`}>{statusText[order.status] || order.status}</b></div>
        <div className="order-card-body"><span className="order-product-icon">服</span><div className="order-product"><small>技术服务</small><b>{order.service_title}</b><span>{order.provider_name} · {order.delivery_mode === "onsite" ? "上门服务" : "在线服务"}</span></div><div className="order-price"><small>服务金额</small><b>{order.amount === null ? "待报价" : <><em>¥</em>{order.amount}</>}</b></div><div className="order-action"><small>服务时间：{String(order.scheduled_at).replace("T"," ").slice(0,16)}</small><Link href={`/service-orders/${encodeURIComponent(order.id)}`}>查看订单</Link></div></div>
      </article>)}</div>}
    </section>
  </main>;
}
