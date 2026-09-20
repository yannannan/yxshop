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
  pending_payment: { label: "待支付", description: "服务金额已经确认，请扫码完成付款；提交支付核验后，平台确认收款并进入接单流程。" },
  payment_review: { label: "支付核验", description: "您已提交支付核验，平台正在确认收款结果，请保持页面或稍后回来查看。" },
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
  const [payMethod, setPayMethod] = useState<"wechat" | "alipay">("wechat");
  const [paymentQr, setPaymentQr] = useState<{ imageUrl?: string; amount?: number; message?: string } | null>(null);
  const [paymentQrError, setPaymentQrError] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

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

  useEffect(() => {
    if (!order || !["pending_payment","payment_review"].includes(order.status) || order.amount === null) {
      setPaymentQr(null);
      setPaymentQrError("");
      return;
    }
    fetch(`/api/technical-payment-qrs?orderId=${encodeURIComponent(order.id)}&type=${payMethod}&refresh=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { imageUrl?: string; amount?: number; message?: string };
        if (!response.ok) {
          setPaymentQr(null);
          setPaymentQrError(result.message || "暂未配置收款二维码");
          return;
        }
        setPaymentQr(result);
        setPaymentQrError("");
      })
      .catch(() => { setPaymentQr(null); setPaymentQrError("收款二维码读取失败"); });
  }, [order?.id, order?.status, order?.amount, payMethod]);

  async function submitPaymentReview() {
    if (!order || submittingPayment) return;
    setSubmittingPayment(true);
    setMessage("");
    try {
      const response = await fetch("/api/technical-service-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "payment-submitted", orderId: order.id }),
      });
      const result = await response.json() as { message?: string; status?: string };
      if (!response.ok) {
        setMessage(result.message || "支付核验提交失败");
        return;
      }
      setOrder((current) => current ? { ...current, status: result.status || "payment_review" } : current);
    } catch {
      setMessage("支付核验提交失败，请稍后重试");
    } finally {
      setSubmittingPayment(false);
    }
  }

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
              <div><dt>服务方式</dt><dd>{order.delivery_mode === "onsite" ? "上门服务" : "在线服务"}</dd></div>
              <div><dt>预约时间</dt><dd>{String(order.scheduled_at).replace("T"," ").slice(0,16)}</dd></div>
              {order.delivery_mode === "onsite" && <div><dt>上门地址</dt><dd>{order.service_address || "待确认"}</dd></div>}
              <div><dt>服务金额</dt><dd className="money">{order.amount === null ? "待报价" : `¥${order.amount}`}</dd></div>
              <div><dt>需求说明</dt><dd>{order.requirement_text || "未填写补充需求"}</dd></div>
            </dl>
            {["pending_payment","payment_review"].includes(order.status) && order.amount !== null && <section className="technical-service-payment">
              <header><div><span>PAYMENT</span><h2>{order.status === "payment_review" ? "支付核验中" : "服务付款"}</h2></div><b>¥{order.amount}</b></header>
              <div className="technical-service-pay-methods"><button className={payMethod === "wechat" ? "active" : ""} onClick={() => setPayMethod("wechat")}>微信支付</button><button className={payMethod === "alipay" ? "active" : ""} onClick={() => setPayMethod("alipay")}>支付宝</button></div>
              {paymentQr?.imageUrl ? <div className="technical-service-pay-qr"><img src={paymentQr.imageUrl} alt={payMethod === "wechat" ? "微信收款二维码" : "支付宝收款二维码"} /><small>请支付 ¥{order.amount}，转账备注填写服务订单编号：{order.id}</small></div> : <div className="technical-service-pay-empty"><b>暂未配置{payMethod === "wechat" ? "微信" : "支付宝"}收款码</b><p>{paymentQrError || "请联系在线技术支持确认付款方式。"}</p></div>}
              {order.status === "pending_payment" ? <button className="technical-service-paid-button" disabled={submittingPayment} onClick={() => void submitPaymentReview()}>{submittingPayment ? "正在提交…" : "我已完成支付，提交核验"}</button> : <p className="technical-service-payment-reviewing">平台正在核验收款，确认后订单会自动进入“已支付”。</p>}
            </section>}
            {message && <div className="technical-service-order-message">{message}</div>}
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
