"use client";

import { useParams } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";

type Order = {
  id: string;
  product_id: number;
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
    if (order?.status === "pending_delivery") {
      setPaid(true);
      setPaymentVerifying(false);
    }
  }, [order?.status]);
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
    if (!paymentVerifying || order?.status !== "paid" || payConfirmChecking) return;
    void confirmPaymentFinished();
  }, [order?.status, payConfirmChecking, paymentVerifying]);

  return (
    <main className="checkout-page refined-checkout">
      <header className="inner-header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Image
              src="/yxstar_logo.png"
              alt="宇星商城 Logo"
              fill
              sizes="34px"
            />
          </span>
          <span>宇星商城</span>
        </a>
        <span className="secure-pay">
          <i>✓</i> 安全收银台
        </span>
        <a className="checkout-home-link" href="/" onClick={(event) => { event.preventDefault(); window.location.assign("/"); }}>返回商城</a>
      </header>
      <div className="checkout-progress">
        <span className="done">1</span>
        <b>确认订单</b>
        <i />
        <span className={paid ? "done" : "active"}>2</span>
        <b>扫码支付</b>
        <i />
        {isChatGptRecharge ? (
          <>
            <span className={paid ? "active" : ""}>3</span>
            <b>等待提交充值信息</b>
            <i />
            <span>4</span>
            <b>完成订单</b>
          </>
        ) : (
          <>
            <span className={paid ? "active" : ""}>3</span>
            <b>完成订单</b>
          </>
        )}
      </div>
      <div className="checkout-content">
        <section className="checkout-card refined-checkout-card">
          {paid ? (
            isChatGptRecharge ? (
              <div className="paid-state recharge-state">
                <span>✓</span>
                <h1>{order?.status === "pending_delivery" ? "充值信息已提交" : "支付已确认"}</h1>
                <div className="paid-order recharge-order">
                  <span>订单编号</span>
                  <b>{order?.id || params.id}</b>
                </div>
                {order?.status === "pending_delivery" ? (
                  <>
                    <p>
                      充值信息已提交，充值将自动到账。
                      <br />
                      请关注查收邮件和重新刷新登录账号。
                    </p>
                    <Link className="recharge-home-button" href="/orders">
                      返回我的订单
                    </Link>
                  </>
                ) : (
                  <>
                    <p>
                      请按步骤提交充值信息。
                      <br />
                      充值商品信息和充值脚本已发送至：
                      <b>{order?.email || "您的订单邮箱"}</b>
                    </p>
                    <section className="recharge-guide">
                      <h2>充值步骤</h2>
                      <ol>
                        <li>
                          <b>1、</b>
                          <span>请先打开浏览器登录 ChatGPT 账号。</span>
                        </li>
                        <li>
                          <b>2、</b>
                          <span>
                            请下载邮件中的附件脚本，或使用下方 BAT 脚本并直接运行。
                            <span className="recharge-tools">
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
                                ChatGPT充值脚本下载
                              </a>
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
                                Safari浏览器直接访问
                              </a>
                            </span>
                          </span>
                        </li>
                        <li>
                          <b>3、</b>
                          <span>
                            复制弹出浏览器输出的完整 JSON
                            字符串，粘贴到下方输入框并提交。
                          </span>
                        </li>
                        <li>
                          <b>4、</b>
                          <span>提交后 1–5 分钟自动到账。</span>
                        </li>
                      </ol>
                    </section>
                    <form className="recharge-form" onSubmit={submitRechargeInfo}>
                      <label>
                        粘贴浏览器弹出的完整JSON字符串
                        <textarea
                          value={rechargeJson}
                          onChange={(event) => setRechargeJson(event.target.value)}
                          placeholder="请完整复制弹出浏览器中的完整JSON字符串粘贴此处"
                        />
                      </label>
                      <button type="submit" disabled={!rechargeJson.trim() || rechargeSubmitting}>
                        {rechargeSubmitting ? "正在提交…" : "提交充值信息"}
                      </button>
                      {rechargeError && <small className="form-error">{rechargeError}</small>}
                    </form>
                  </>
                )}
              </div>
            ) : (
              <div className="paid-state">
                <span>✓</span>
                <h1>支付确认已提交</h1>
                <p>
                  我们正在核验支付结果
                  <br />
                  商品信息将发送至 {order?.email || "您的订单邮箱"}
                </p>
                <div className="paid-order">
                  <span>订单编号</span>
                  <b>{order?.id || params.id}</b>
                </div>
                <Link href="/">继续选购</Link>
              </div>
            )
          ) : (
            <>
              <div className="checkout-title">
                <div>
                  <span>订单待支付</span>
                  <small>请在倒计时结束前完成支付</small>
                </div>
                <b>{remaining}</b>
              </div>
              <div className="checkout-product">
                <span className="checkout-product-icon">Q</span>
                <div>
                  <small>正在购买</small>
                  <b>{order?.product_name || "正在读取订单…"}</b>
                </div>
                <strong>
                  <em>¥</em>
                  {order?.amount ?? "--"}
                </strong>
              </div>
              <div className="pay-methods" role="tablist" aria-label="支付方式">
                <button
                  className={method === "wechat" ? "active" : ""}
                  onClick={() => setMethod("wechat")}
                >
                  <span className="wechat-dot">✓</span>微信支付
                </button>
                <button
                  className={method === "alipay" ? "active" : ""}
                  onClick={() => setMethod("alipay")}
                >
                  <span className="alipay-dot">支</span>支付宝
                </button>
              </div>
              <div
                className={`qr-box payment-qr-box ${method}`}
                aria-label={`${method === "wechat" ? "微信支付" : "支付宝"}二维码`}
              >
                {paymentQr?.imageUrl ? (
                  <Image
                    unoptimized
                    src={paymentQr.imageUrl}
                    alt={`${method === "wechat" ? "微信支付" : "支付宝"}收款二维码`}
                    width={220}
                    height={220}
                  />
                ) : (
                  <div className="qr-placeholder">
                    <b>待上传收款二维码</b>
                    <small>
                      {method === "wechat" ? "微信支付" : "支付宝"} · ¥
                      {order?.amount ?? "--"}
                    </small>
                  </div>
                )}
              </div>
              <p className="scan-tip">
                {paymentQr?.imageUrl
                  ? `打开${method === "wechat" ? "微信" : "支付宝"}，使用“扫一扫”完成支付`
                  : `该商品的${method === "wechat" ? "微信" : "支付宝"}二维码尚未上传，请联系商家配置`}
              </p>
              <p className="phone-transfer-tip">
                <b>重要提示</b> 转账时备注填写：<strong>对应的订单编号</strong>
              </p>
              <div className="order-line order-id-line">
                <span>订单编号</span>
                <div>
                  <b>{order?.id || params.id}</b>
                  <button
                    className={`copy-order-button${orderCopied ? " copied" : ""}`}
                    type="button"
                    onClick={() => void copyOrderId()}
                    aria-label="复制订单编号"
                  >
                    <i className="copy-icon" aria-hidden="true" />
                    {orderCopied ? "已复制" : "复制订单编号"}
                  </button>
                </div>
              </div>
              <div className="order-line">
                <span>接收邮箱</span>
                <b>{order?.email || "读取中…"}</b>
              </div>
              <button
                className="paid-button"
                onClick={() => void confirmPaymentFinished()}
                disabled={payConfirmChecking || paymentVerifying}
              >
                {paymentVerifying
                  ? "支付核验中（自动跳转）…"
                  : payConfirmChecking
                    ? "正在核验支付状态…"
                    : "我已完成支付"}
              </button>
              {paymentVerifying && (
                <small className="payment-verifying-note">
                  支付核验中，预计 1–2 分钟完成；管理员确认收款后将自动进入下一步。
                </small>
              )}
              <small className="demo-note">
                请核对支付类型与金额，确认无误后再完成支付。
              </small>
            </>
          )}
        </section>
        <aside className="checkout-support">
          <span className="support-kicker">7 × 24 小时在线客服</span>
          <h2>支付遇到问题？</h2>
          <p>微信扫码联系人工客服</p>
          <div className="support-qr support-qr-image">
            <Image
              unoptimized
              src="/customer-service-wechat.png"
              alt="在线微信客服二维码"
              width={184}
              height={234}
            />
          </div>
          <small>扫码添加在线微信客服</small>
        </aside>
      </div>
      <div className="checkout-assurance">
        <span>✓ 支付信息安全加密</span>
        <span>✓ 订单问题售后处理</span>
        <span>✓ 数字商品自动交付</span>
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
            <h2 id="pay-confirm-title">系统尚未检测到支付！</h2>
            <p>{payConfirmError}</p>
            <small>请稍后再试，或联系右侧在线客服处理。</small>
            <button type="button" onClick={() => setPayConfirmError("")}>
              我知道了
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
