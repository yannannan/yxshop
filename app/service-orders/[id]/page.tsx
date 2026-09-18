"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type ServiceOrder = {
  id: string;
  service_title: string;
  service_slug: string;
  service_summary: string;
  provider_name: string;
  provider_city: string;
  provider_avatar: string;
  delivery_mode: string;
  pricing_mode: string;
  amount: number | null;
  requirement_text: string;
  service_address: string;
  scheduled_at: string;
  status: string;
  created_at: string;
};

const statusInfo: Record<string, { label: string; description: string }> = {
  pending_quote: { label: "待报价", description: "服务需求已经提交，平台或技术人员正在确认服务范围与最终价格。" },
  pending_payment: { label: "待支付", description: "服务金额已经确认，请根据平台指引完成付款；后台确认收款后进入接单流程。" },
  paid: { label: "已支付", description: "平台已确认收款，等待技术人员确认接单。" },
  accepted: { label: "已接单", description: "技术人员已经接单，请按预约时间保持联系方式畅通。" },
  in_service: { label: "服务中", description: "技术人员正在提供本次技术服务。" },
  completed: { label: "已完成", description: "本次技术服务已完成。" },
  closed: { label: "已关闭", description: "本次服务订单已关闭。" },
  cancelled: { label: "已取消", description: "本次服务订单已取消。" },
};

export default function TechnicalServiceOrderPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/technical-service-orders?id=${encodeURIComponent(params.id)}&refresh=${Date.now()}`, { cache: "no-store" });
        const result = await response.json() as ServiceOrder & { message?: string };
        if (!active) return;
        if (!response.ok) {
          setMessage(result.message || "服务订单读取失败");
          return;
        }
        setOrder(result);
        setMessage("");
      } catch {
        if (active) setMessage("服务订单读取失败，请稍后重试");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [params.id]);

  const status = order ? statusInfo[order.status] || { label: order.status, description: "订单状态已更新。" } : null;

  return <main className="technical-order-page">
    <header className="inner-header">
      <Link className="brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span></Link>
      <span className="orders-header-label">技术服务订单</span>
      <Link href="/?channel=technical">返回上门服务</Link>
    </header>
    <section className="technical-order-wrap">
      {loading ? <div className="orders-empty">正在读取服务订单…</div> : !order ? <div className="orders-empty"><b>无法读取服务订单</b><p>{message}</p><Link href="/?channel=technical">返回技术服务</Link></div> : <>
        <div className="technical-order-head">
          <div><span className="section-kicker">SERVICE ORDER</span><h1>{order.service_title}</h1><p>订单编号：{order.id}</p></div>
          <span className={`technical-order-status ${order.status}`}>{status?.label}</span>
        </div>
        <div className="technical-order-layout">
          <section className="technical-order-card">
            <div className="technical-order-progress">
              <b>{status?.label}</b>
              <p>{status?.description}</p>
            </div>
            <dl className="technical-order-facts">
              <div><dt>技术人员</dt><dd>{order.provider_name} · {order.provider_city}</dd></div>
              <div><dt>服务方式</dt><dd>{order.delivery_mode === "onsite" ? "指定地点服务" : "在线服务"}</dd></div>
              <div><dt>预约时间</dt><dd>{String(order.scheduled_at).replace("T"," ").slice(0,16)}</dd></div>
              {order.delivery_mode === "onsite" && <div><dt>服务地点</dt><dd>{order.service_address || "待确认"}</dd></div>}
              <div><dt>服务金额</dt><dd className="money">{order.amount === null ? "待报价" : `¥${order.amount}`}</dd></div>
              <div><dt>需求说明</dt><dd>{order.requirement_text || "未填写补充需求"}</dd></div>
            </dl>
            <div className="technical-order-actions">
              <Link href={`/service/${order.service_slug}?consult=1`}>在线沟通服务细节</Link>
              <Link className="primary" href={`/service/${order.service_slug}`}>查看服务详情</Link>
            </div>
          </section>
          <aside className="technical-order-help">
            <span>7 × 24 小时人工在线服务</span>
            <h2>服务过程中遇到问题？</h2>
            <p>可随时返回服务详情进入在线免费技术支持，与技术人员或平台继续沟通。</p>
            <Link href={`/service/${order.service_slug}?consult=1`}>进入在线技术支持</Link>
          </aside>
        </div>
      </>}
    </section>
  </main>;
}
