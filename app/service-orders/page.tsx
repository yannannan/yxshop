"use client";
import { useI18n } from '@/components/language-provider';


import { StorefrontHeader } from "../../components/storefront-header";
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
  pending_quote: "待报价", pending_payment: "待支付", payment_review: "支付核验", paid: "已支付", in_service: "服务中", awaiting_acceptance: "待验收", completed: "已完成", closed: "已关闭", cancelled: "已取消",
};

export default function TechnicalServiceOrdersPage() {
  const { t } = useI18n();
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
    <StorefrontHeader channel="technical" />
    <section className="orders-wrap">
      <div className="orders-title"><div><span className="section-kicker">SERVICE ORDER CENTER</span><h1>{t("我的技术服务订单")}</h1><p>{t("查看购买、支付和技术服务进度")}</p></div><Link href="/?channel=technical">{t("继续选择技术服务 →")}</Link></div>
      {loading ? <div className="orders-empty">{t("正在读取技术服务订单…")}</div> : unauthorized ? <div className="orders-empty"><b>{t("登录后查看技术服务订单")}</b><p>{t("请使用商城手机号登录后再查看。")}</p><Link href="/?channel=technical">{t("返回技术服务")}</Link></div> : !visible.length ? <div className="orders-empty"><b>{t("暂时没有技术服务订单")}</b><p>{t("购买技术服务后，订单会显示在这里。")}</p><Link href="/?channel=technical">{t("选择技术服务")}</Link></div> : <div className="orders-list">{visible.map((order) => <article className="order-card" key={order.id}>
        <div className="order-card-top"><span>{t("服务订单号：")}{order.id}</span><b className={`order-status status-${order.status}`}>{t(statusText[order.status] || order.status)}</b></div>
        <div className="order-card-body"><span className="order-product-icon">{t("服")}</span><div className="order-product"><small>{t("技术服务")}</small><b>{order.service_title}</b><span>{order.provider_name} · {t(order.delivery_mode === "onsite" ? "上门服务" : "在线服务")}</span></div><div className="order-price"><small>{t("服务金额")}</small><b>{order.amount === null ? "待报价" : <><em>¥</em>{t(order.amount)}</>}</b></div><div className="order-action"><small>{t("服务时间：")}{t(String(order.scheduled_at).replace("T"," ").slice(0,16))}</small><Link href={`/service-orders/${encodeURIComponent(order.id)}`}>{t("查看订单")}</Link></div></div>
      </article>)}</div>}
    </section>
  </main>;
}
