'use client';
import { useI18n } from '@/components/language-provider';


import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StorefrontHeader } from "../../components/storefront-header";
import { toolBillingLabels, isToolBillingCycle } from '../../lib/tool-services';

type Order = { product_type?: string; points_amount?: number; tool_plan_name?: string; tool_billing_cycle?: string; id: string; amount: number; status: string; product_name: string; email: string; created_at: string };

const statusText: Record<string, string> = { pending: '待支付', verification: '待发货', paid: '已支付', pending_delivery: '待发货', delivered: '已发货', closed: '已关闭' };

export default function OrdersPage() {
  const { t } = useI18n();
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
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 首页入口采用原生导航，保证软路由异常时仍可返回商城。 */}
    <StorefrontHeader />
    <section className="orders-wrap"><div className="orders-title"><div><span className="section-kicker">ORDER CENTER</span><h1>{t("我的订单")}</h1><p>{t("查看订单状态与商品交付信息")}</p></div><Link href="/">{t("继续选购 →")}</Link></div>
      {loading ? <div className="orders-empty">{t("正在读取订单…")}</div> : unauthorized ? <div className="orders-empty"><b>{t("登录后查看订单")}</b><p>{t("请使用下单手机号登录后，再查看订单记录。")}</p><Link href="/">{t("返回商城登录")}</Link></div> : visibleOrders.length === 0 ? <div className="orders-empty"><b>{t("暂时没有订单")}</b><p>{t("选购商品后，订单会显示在这里。")}</p><Link href="/">{t("去选购商品")}</Link></div> : <div className="orders-list">{visibleOrders.map((order) => <article className="order-card" key={order.id}><div className="order-card-top"><span>{t("订单号：")}{order.id}</span><b className={`order-status status-${order.status}`}>{t(order.product_type === 'points' && order.status === 'delivered' ? '已到账' : statusText[order.status] || order.status)}</b></div><div className="order-card-body"><span className="order-product-icon">Q</span><div className="order-product"><small>{t("购买商品")}</small><b>{order.product_name}</b>{order.product_type === 'points' && <small>{t("充值数量：")}{t(order.points_amount)}{t(" 积分")}</small>}{order.tool_billing_cycle && isToolBillingCycle(order.tool_billing_cycle) && <small>{t("套餐：")}{t([order.tool_plan_name, toolBillingLabels[order.tool_billing_cycle]].filter(Boolean).join(' · '))}</small>}<span>{t("接收邮箱：")}{order.email}</span></div><div className="order-price"><small>{t("实付金额")}</small><b><em>¥</em>{t(order.amount)}</b></div><div className="order-action"><small>{t(new Date(order.created_at).toLocaleString('zh-CN', { hour12: false }))}</small>{order.status === 'pending' ? <Link href={`/checkout/${order.id}`}>{t("继续支付")}</Link> : <Link href={`/checkout/${order.id}`}>{t("查看订单")}</Link>}</div></div></article>)}</div>}
    </section>
  </main>;
}
