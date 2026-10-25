'use client';
import { useI18n } from '@/components/language-provider';


import { useParams } from 'next/navigation';
import { StorefrontHeader } from "../../../components/storefront-header";
import Image from 'next/image';
import { toolPlanKey, toolPlanQuery, toolPlanLabel, toolPagePath, toolPlanPrice } from '../../../lib/tool-services';
import { useEffect, useState } from 'react';
import { billingCycleLabel, billingCyclePriceText, defaultBillingCycle, parseProductAttributes, type CatalogProduct } from '../../../lib/catalog';

export default function ProductDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCycle, setSelectedCycle] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');
  useEffect(() => { fetch(`/api/products?id=${params.id}`, { cache: 'no-store' }).then(async (response) => { if (!response.ok) { setNotFound(true); return; } const data = await response.json() as CatalogProduct; if (data.productType === 'tool' && data.toolChargeType === 'points' && data.toolSlug) { window.location.replace(toolPagePath(data.toolSlug)); return; } setProduct(data); setSelectedCycle(new URLSearchParams(window.location.search).get('cycle') || ''); setSelectedPlan(new URLSearchParams(window.location.search).get('plan') || ''); }).catch(() => setNotFound(true)); }, [params.id]);
  if (notFound) return <><StorefrontHeader /><main className="simple-page"><div className="not-found"><h1>{t("商品不存在")}</h1><a href="/">{t("返回商城")}</a></div></main></>;
  if (!product) return <><StorefrontHeader /><main className="simple-page"><div className="not-found"><h1>{t("正在读取商品…")}</h1></div></main></>;
  const plan = product.toolPlans?.find(plan => toolPlanKey(plan) === selectedPlan) || product.toolPlans?.find(plan => plan.cycle === selectedCycle) || product.toolPlans?.[0];
  const billingCycle = plan?.cycle || product.billingCycle || defaultBillingCycle(product.id);
  const price = plan?.price ?? product.price;
  const attributes = parseProductAttributes(product.attributesJson);
  const isTool = product.productType === 'tool';

  async function confirmOrder() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: product!.id, toolCycle: plan?.cycle, toolPlan: plan ? toolPlanKey(plan) : undefined }) });
      const data = (await response.json().catch(() => ({}))) as { orderId?: string; message?: string };
      if (!response.ok) { if (response.status === 401) window.location.href = `/?product=${product!.id}${plan ? `&${toolPlanQuery(plan)}` : ""}`; else setError(data.message || '下单失败'); return; }
      window.location.href = `/checkout/${data.orderId}`;
    } catch {
      setError('下单请求失败，请稍后重试');
    } finally { setLoading(false); }
  }

  return <main className="simple-page">
    <StorefrontHeader /><div className="checkout-progress"><span className="done">1</span><b>{t("确认商品")}</b><i></i><span>2</span><b>{t("扫码支付")}</b><i></i><span>3</span><b>{t("完成订单")}</b></div>
    <nav className="breadcrumb" aria-label={t("面包屑")}><a href="/">{t("商城首页")}</a><span>›</span><a href="/">{t(product.category)}</a><span>›</span><b>{product.name}</b></nav>
    <div className="detail-wrap">
      <div className="detail-media"><div className={`detail-visual product-visual ${product.tone}${product.detailImage || product.coverImage ? ' has-upload-image' : ''}`}><span className="badge">{t("热销")}</span>{product.detailImage || product.coverImage ? <Image className="product-upload-image" unoptimized src={product.detailImage || product.coverImage || ''} alt={t(product.name)} fill sizes="(max-width: 760px) 100vw, 720px" /> : <span className="product-logo">{t(product.initial)}</span>}</div><div className="detail-mini-note"><span>✓</span><div><b>{t("官方渠道核验")}</b><small>{t("商品信息经过人工检查")}</small></div></div><a className="detail-home-link" href="/"><span>←</span>{t(" 返回商城首页")}</a></div>
      <section className="detail-info"><div className="detail-labels"><span className="section-kicker">PRODUCT DETAILS</span><i>{t(isTool ? '工具使用' : '自动发货')}</i><i>{t("售后保障")}</i></div><h1>{product.name}</h1><p className="detail-desc">{product.detail}</p><div className="spec-grid"><span><small>{t("商品类型")}</small><b>{t(isTool ? '工具服务' : '数字商品')}</b></span><span><small>{t("计费周期")}</small><b>{t(billingCycleLabel(billingCycle))}</b></span><span><small>{t("交付方式")}</small><b>{t(isTool ? '支付核验后开放入口' : '订单邮箱')}</b></span><span><small>{t("预计发货")}</small><b>{t("支付核验后")}</b></span>{attributes.map((attribute) => <span key={attribute.name}><small>{attribute.name}</small><b>{t(attribute.value)}</b></span>)}</div>{isTool && <div className="tool-purchase-plans">{product.toolPlans?.map(item => <button type="button" key={toolPlanKey(item)} aria-pressed={plan && toolPlanKey(plan) === toolPlanKey(item)} onClick={() => { setSelectedPlan(toolPlanKey(item)); setSelectedCycle(item.cycle); }}>{t(toolPlanLabel(item))} · {t(toolPlanPrice(item))}</button>)}</div>}<div className="price-panel"><div><small>{t(billingCycleLabel(billingCycle))}{t("价格")}</small><strong><em>¥</em>{t(price)}<em className="price-cycle">{t(billingCyclePriceText(billingCycle))}</em></strong><del>{t("原价 ¥")}{t(product.oldPrice)}</del></div><span>{t("库存充足")}</span></div><ul className="feature-list"><li><b>✓</b><span><strong>{t(isTool ? '工具入口' : '自动发货')}</strong><small>{t(isTool ? '支付核验后返回工具页面使用' : '支付核验后自动发送至订单邮箱')}</small></span></li><li><b>✓</b><span><strong>{t("售后保障")}</strong><small>{t("订单问题可联系在线客服处理")}</small></span></li><li><b>✓</b><span><strong>{t("安全交易")}</strong><small>{t("订单信息加密保存，保护隐私")}</small></span></li></ul>{error && <p className="form-error">{t(error)}</p>}<button className="confirm-order" onClick={confirmOrder} disabled={loading || (isTool && !plan)}>{t(loading ? '正在创建订单…' : `确认下单 · ¥${price}${billingCyclePriceText(billingCycle)}`)} <span>→</span></button>{isTool && product.toolSlug && <a className="tool-purchase-link" href={toolPagePath(product.toolSlug)}>{t("返回工具页面")}</a>}<p className="detail-tip">{t("确认即表示已阅读并同意数字商品购买须知")}</p></section>
    </div>
  </main>;
}
