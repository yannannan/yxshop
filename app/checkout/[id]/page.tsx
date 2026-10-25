"use client";
import { useI18n } from '@/components/language-provider';


import { useParams } from "next/navigation";
import { StorefrontHeader } from "../../../components/storefront-header";
import { notifyAccountChanged } from '../../../lib/account-client';
import Image from "next/image";
import Link from "next/link";
import { toolBillingLabels, isToolBillingCycle, toolPagePath } from '../../../lib/tool-services';
import { useEffect, useState } from "react";

type Order = {
  id: string;
  product_id: number;
  product_type?: string;
  points_amount?: number;
  tool_slug?: string;
  tool_billing_cycle?: string;
  tool_plan_name?: string;
  amount: number;
  status: string;
  product_name: string;
  category: string;
  subcategory: string;
  email: string;
  phone: string;
};
type PaymentQr = {
  id: number;
  name: string;
  type: "wechat" | "alipay";
  amount: number;
  imageUrl: string | null;
};

export default function CheckoutPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState<"wechat" | "alipay">("wechat");
  const [paymentQr, setPaymentQr] = useState<PaymentQr | null>(null);
  const [seconds, setSeconds] = useState(15 * 60);
  const [orderCopied, setOrderCopied] = useState(false);
  const [rechargeJson, setRechargeJson] = useState("");
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
  const [rechargeError, setRechargeError] = useState("");
  const [payConfirmChecking, setPayConfirmChecking] = useState(false);
  const [payConfirmError, setPayConfirmError] = useState("");
  const [paymentVerifying, setPaymentVerifying] = useState(false);

  useEffect(() => {
    fetch(`/api/orders?id=${params.id}`)
      .then((response) => response.json())
      .then((result: unknown) => setOrder(result as Order))
      .catch(() => null);
  }, [params.id]);
  useEffect(() => {
    if (order?.status === "pending_delivery" || (order?.product_type === 'tool' && ['paid', 'delivered'].includes(order.status)) || (order?.product_type === 'points' && ['paid', 'delivered'].includes(order.status))) {
      setPaid(true);
      setPaymentVerifying(false);
      if (order?.product_type === 'points') notifyAccountChanged();
    }
  }, [order?.status, order?.product_type]);
  useEffect(() => {
    if (!paymentVerifying) return;
    let disposed = false;
    const refreshOrder = async () => {
      try {
        const response = await fetch(`/api/orders?id=${encodeURIComponent(params.id)}`, {
          cache: "no-store",
        });
        if (!response.ok || disposed) return;
        setOrder((await response.json()) as Order);
      } catch {
        // 保持核验等待状态，下一次轮询会继续尝试。
      }
    };
    void refreshOrder();
    const timer = window.setInterval(() => void refreshOrder(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [params.id, paymentVerifying]);
  useEffect(() => {
    if (!order?.amount || !order.product_id) return;
    fetch(
      `/api/payment-qrs?productId=${encodeURIComponent(order.product_id)}&amount=${encodeURIComponent(order.amount)}&type=${method}`,
    )
      .then(async (response) => (response.ok ? response.json() : null))
      .then((result: unknown) => setPaymentQr(result as PaymentQr | null))
      .catch(() => setPaymentQr(null));
  }, [method, order?.amount, order?.product_id]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const remaining = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const isChatGptRecharge =
    order?.category === "会员充值服务" &&
    order?.subcategory === "ChatGPT会员充值";

  async function copyOrderId() {
    const orderId = order?.id || params.id;
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(orderId);
      else {
        const input = document.createElement("textarea");
        input.value = orderId;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setOrderCopied(true);
      window.setTimeout(() => setOrderCopied(false), 1600);
    } catch {
      setOrderCopied(false);
    }
  }

  async function submitRechargeInfo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rechargeJson.trim() || rechargeSubmitting) return;
    setRechargeSubmitting(true);
    setRechargeError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recharge-submit", orderId: order?.id || params.id, rechargeJson }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "提交失败，请稍后重试");
      window.location.href = "/orders";
    } catch (error) {
      setRechargeError(error instanceof Error ? error.message : "提交失败，请稍后重试");
      setRechargeSubmitting(false);
    }
  }

  async function confirmPaymentFinished() {
    if (payConfirmChecking) return;
    setPayConfirmChecking(true);
    setPayConfirmError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "payment-finished", orderId: order?.id || params.id }),
      });
      const result = (await response.json()) as { message?: string; status?: string; nextStep?: string };
      if (!response.ok) {
        if (response.status === 400 && order?.status === "pending") {
          setPaymentVerifying(true);
          return;
        }
        throw new Error(result.message || "请扫码支付后再点击已完成支付");
      }
      setOrder((current) => current ? { ...current, status: result.status || "pending_delivery" } : current);
      setPaid(true);
      setPaymentVerifying(false);
    } catch (error) {
      setPayConfirmError(
        error instanceof Error
          ? error.message
          : "请扫码支付后再点击已完成支付",
      );
    } finally {
      setPayConfirmChecking(false);
    }
  }

  useEffect(() => {
    if (!paymentVerifying || order?.status !== "paid" || ['tool', 'points'].includes(order.product_type || '') || payConfirmChecking) return;
    void confirmPaymentFinished();
  }, [order?.status, order?.product_type, payConfirmChecking, paymentVerifying]);

  return (
    <main className="checkout-page refined-checkout">
      <StorefrontHeader />
      <div className="checkout-progress">
        <span className="done">1</span>
        <b>{t("确认订单")}</b>
        <i />
        <span className={paid ? "done" : "active"}>2</span>
        <b>{t("扫码支付")}</b>
        <i />
        {isChatGptRecharge ? (
          <>
            <span className={paid ? "active" : ""}>3</span>
            <b>{t("等待提交充值信息")}</b>
            <i />
            <span>4</span>
            <b>{t("完成订单")}</b>
          </>
        ) : (
          <>
            <span className={paid ? "active" : ""}>3</span>
            <b>{t("完成订单")}</b>
          </>
        )}
      </div>
      <div className="checkout-content">
        <section className="checkout-card refined-checkout-card">
          {paid ? (
            isChatGptRecharge ? (
              <div className="paid-state recharge-state">
                <span>✓</span>
                <h1>{t(order?.status === "pending_delivery" ? "充值信息已提交" : "支付已确认")}</h1>
                <div className="paid-order recharge-order">
                  <span>{t("订单编号")}</span>
                  <b>{order?.id || params.id}</b>
                </div>
                {order?.status === "pending_delivery" ? (
                  <>
                    <p>
                      {t("充值信息已提交，充值将自动到账。")}<br />
                      {t("请关注查收邮件和重新刷新登录账号。")}</p>
                    <Link className="recharge-home-button" href="/orders">
                      {t("返回我的订单")}</Link>
                  </>
                ) : (
                  <>
                    <p>
                      {t("请按步骤提交充值信息。")}<br />
                      {t("充值商品信息和充值脚本已发送至：")}<b>{order?.email || t("您的订单邮箱")}</b>
                    </p>
                    <section className="recharge-guide">
                      <h2>{t("充值步骤")}</h2>
                      <ol>
                        <li>
                          <b>1、</b>
                          <span>{t("请先打开浏览器登录 ChatGPT 账号。")}</span>
                        </li>
                        <li>
                          <b>2、</b>
                          <span>
                            {t("请下载邮件中的附件脚本，或使用下方 BAT 脚本并直接运行。")}<span className="recharge-tools">
                              <a
                                className="recharge-tool"
                                href="/chatgpt_vip_bat/chatgpt_vipauth.bat"
                                download="ChatGPT充值脚本.bat"
                              >
                                <img
                                  className="recharge-platform-image"
                                  src="/ico_imgs/windows.png"
                                  alt=""
                                  aria-hidden="true"
                                />
                                {t("ChatGPT充值脚本下载")}</a>
                              <a
                                className="recharge-tool"
                                href="https://chatgpt.com/api/auth/session"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  className="recharge-platform-image"
                                  src="/ico_imgs/ios.png"
                                  alt=""
                                  aria-hidden="true"
                                />
                                {t("Safari浏览器直接访问")}</a>
                            </span>
                          </span>
                        </li>
                        <li>
                          <b>3、</b>
                          <span>
                            {t("复制弹出浏览器输出的完整 JSON 字符串，粘贴到下方输入框并提交。")}</span>
                        </li>
                        <li>
                          <b>4、</b>
                          <span>{t("提交后 1–5 分钟自动到账。")}</span>
                        </li>
                      </ol>
                    </section>
                    <form className="recharge-form" onSubmit={submitRechargeInfo}>
                      <label>
                        {t("粘贴浏览器弹出的完整JSON字符串")}<textarea
                          value={rechargeJson}
                          onChange={(event) => setRechargeJson(event.target.value)}
                          placeholder={t("请完整复制弹出浏览器中的完整JSON字符串粘贴此处")}
                        />
                      </label>
                      <button type="submit" disabled={!rechargeJson.trim() || rechargeSubmitting}>
                        {t(rechargeSubmitting ? "正在提交…" : "提交充值信息")}
                      </button>
                      {rechargeError && <small className="form-error">{t(rechargeError)}</small>}
                    </form>
                  </>
                )}
              </div>
            ) : (
              <div className="paid-state">
                <span>✓</span>
                <h1>{t(order?.product_type === 'points' ? '积分充值已到账' : order?.product_type === 'tool' ? '工具购买已确认' : '支付确认已提交')}</h1>
                <p>
                  {t(order?.product_type === 'points' ? `${order.points_amount} 积分已充值至您的账户` : order?.product_type === 'tool' ? '支付已通过核验，可返回工具页面使用' : '我们正在核验支付结果')}
                  <br />
                  {order?.product_type === 'points' ? '支持积分的工具共用余额，成功处理后扣分。' : order?.product_type === 'tool' ? '点击下方按钮进入对应工具页面。' : <>{t("商品信息将发送至 ")}{order?.email || t("您的订单邮箱")}</>}
                </p>
                <div className="paid-order">
                  <span>{t("订单编号")}</span>
                  <b>{order?.id || params.id}</b>
                </div>
                {order?.product_type === 'points' ? <Link href="/points">{t("查看积分余额与明细")}</Link> : order?.product_type === 'tool' && order.tool_slug ? <Link href={toolPagePath(order.tool_slug)}>{t("返回工具页面并使用")}</Link> : <Link href="/">{t("继续选购")}</Link>}
              </div>
            )
          ) : (
            <>
              <div className="checkout-title">
                <div>
                  <span>{t("订单待支付")}</span>
                  <small>{t("请在倒计时结束前完成支付")}</small>
                </div>
                <b>{t(remaining)}</b>
              </div>
              <div className="checkout-product">
                <span className="checkout-product-icon">Q</span>
                <div>
                  <small>{t("正在购买")}</small>
                  <b>{t(order?.product_name || "正在读取订单…")}</b>{order?.product_type === 'points' && <small>{t("充值到账 ")}{t(order.points_amount)}{t(" 积分")}</small>}{order?.tool_billing_cycle && isToolBillingCycle(order.tool_billing_cycle) && <small>{t("所选套餐：")}{t([order.tool_plan_name, toolBillingLabels[order.tool_billing_cycle]].filter(Boolean).join(' · '))}</small>}
                </div>
                <strong>
                  <em>¥</em>
                  {t(order?.amount ?? "--")}
                </strong>
              </div>
              <div className="pay-methods" role="tablist" aria-label={t("支付方式")}>
                <button
                  className={method === "wechat" ? "active" : ""}
                  onClick={() => setMethod("wechat")}
                >
                  <span className="wechat-dot">✓</span>{t("微信支付")}</button>
                <button
                  className={method === "alipay" ? "active" : ""}
                  onClick={() => setMethod("alipay")}
                >
                  <span className="alipay-dot">{t("支")}</span>{t("支付宝")}</button>
              </div>
              <div
                className={`qr-box payment-qr-box ${method}`}
                aria-label={t(`${method === "wechat" ? "微信支付" : "支付宝"}二维码`)}
              >
                {paymentQr?.imageUrl ? (
                  <Image
                    unoptimized
                    src={paymentQr.imageUrl}
                    alt={t(`${method === "wechat" ? "微信支付" : "支付宝"}收款二维码`)}
                    width={220}
                    height={220}
                  />
                ) : (
                  <div className="qr-placeholder">
                    <b>{t("待上传收款二维码")}</b>
                    <small>
                      {t(method === "wechat" ? "微信支付" : "支付宝")} · ¥
                      {t(order?.amount ?? "--")}
                    </small>
                  </div>
                )}
              </div>
              <p className="scan-tip">
                {t(paymentQr?.imageUrl
                  ? `打开${method === "wechat" ? "微信" : "支付宝"}，使用“扫一扫”完成支付`
                  : `该商品的${method === "wechat" ? "微信" : "支付宝"}二维码尚未上传，请联系商家配置`)}
              </p>
              <p className="phone-transfer-tip">
                <b>{t("重要提示")}</b>{t(" 转账时备注填写：")}<strong>{t("对应的订单编号")}</strong>
              </p>
              <div className="order-line order-id-line">
                <span>{t("订单编号")}</span>
                <div>
                  <b>{order?.id || params.id}</b>
                  <button
                    className={`copy-order-button${orderCopied ? " copied" : ""}`}
                    type="button"
                    onClick={() => void copyOrderId()}
                    aria-label={t("复制订单编号")}
                  >
                    <i className="copy-icon" aria-hidden="true" />
                    {t(orderCopied ? "已复制" : "复制订单编号")}
                  </button>
                </div>
              </div>
              <div className="order-line">
                <span>{t("接收邮箱")}</span>
                <b>{order?.email || t("读取中…")}</b>
              </div>
              <button
                className="paid-button"
                onClick={() => void confirmPaymentFinished()}
                disabled={payConfirmChecking || paymentVerifying}
              >
                {t(paymentVerifying
                  ? "支付核验中（自动跳转）…"
                  : payConfirmChecking
                    ? "正在核验支付状态…"
                    : "我已完成支付")}
              </button>
              {paymentVerifying && (
                <small className="payment-verifying-note">
                  {t("支付核验中，预计 1–2 分钟完成；管理员确认收款后将自动进入下一步。")}</small>
              )}
              <small className="demo-note">
                {t("请核对支付类型与金额，确认无误后再完成支付。")}</small>
            </>
          )}
        </section>
        <aside className="checkout-support">
          <span className="support-kicker">{t("7 × 24 小时在线客服")}</span>
          <h2>{t("支付遇到问题？")}</h2>
          <p>{t("微信扫码联系人工客服")}</p>
          <div className="support-qr support-qr-image">
            <Image
              unoptimized
              src="/customer-service-wechat.png"
              alt={t("在线微信客服二维码")}
              width={184}
              height={234}
            />
          </div>
          <small>{t("扫码添加在线微信客服")}</small>
        </aside>
      </div>
      <div className="checkout-assurance">
        <span>{t("✓ 支付信息安全加密")}</span>
        <span>{t("✓ 订单问题售后处理")}</span>
        <span>{t("✓ 数字商品自动交付")}</span>
      </div>
      {payConfirmError && (
        <div
          className="pay-confirm-modal-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setPayConfirmError("")
          }
        >
          <section
            className="pay-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-confirm-title"
          >
            <span>!</span>
            <h2 id="pay-confirm-title">{t("系统尚未检测到支付！")}</h2>
            <p>{t(payConfirmError)}</p>
            <small>{t("请稍后再试，或联系右侧在线客服处理。")}</small>
            <button type="button" onClick={() => setPayConfirmError("")}>
              {t("我知道了")}</button>
          </section>
        </div>
      )}
    </main>
  );
}
