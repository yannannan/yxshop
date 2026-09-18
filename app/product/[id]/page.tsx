'use client';

import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { billingCycleLabel, billingCyclePriceText, defaultBillingCycle, parseProductAttributes, type CatalogProduct } from '../../../lib/catalog';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { fetch(`/api/products?id=${params.id}`, { cache: 'no-store' }).then(async (response) => { if (!response.ok) { setNotFound(true); return; } setProduct(await response.json() as CatalogProduct); }).catch(() => setNotFound(true)); }, [params.id]);
  if (notFound) return <main className="simple-page"><div className="not-found"><h1>商品不存在</h1><a href="/">返回商城</a></div></main>;
  if (!product) return <main className="simple-page"><div className="not-found"><h1>正在读取商品…</h1></div></main>;
  const billingCycle = product.billingCycle || defaultBillingCycle(product.id);
  const attributes = parseProductAttributes(product.attributesJson);

  async function confirmOrder() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: product!.id }) });
      const data = (await response.json().catch(() => ({}))) as { orderId?: string; message?: string };
      if (!response.ok) { if (response.status === 401) window.location.href = `/?product=${product!.id}`; else setError(data.message || '下单失败'); return; }
      window.location.href = `/checkout/${data.orderId}`;
    } catch {
      setError('下单请求失败，请稍后重试');
    } finally { setLoading(false); }
  }

  return <main className="simple-page">
    <header className="inner-header"><a className="brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span></a><div className="stepper"><span className="done">1</span><b>确认商品</b><i></i><span>2</span><b>扫码支付</b><i></i><span>3</span><b>完成订单</b></div><a href="/">返回商城</a></header>
    <nav className="breadcrumb" aria-label="面包屑"><a href="/">商城首页</a><span>›</span><a href="/">{product.category}</a><span>›</span><b>{product.name}</b></nav>
    <div className="detail-wrap">
      <div className="detail-media"><div className={`detail-visual product-visual ${product.tone}${product.detailImage || product.coverImage ? ' has-upload-image' : ''}`}><span className="badge">热销</span>{product.detailImage || product.coverImage ? <Image className="product-upload-image" unoptimized src={product.detailImage || product.coverImage || ''} alt={product.name} fill sizes="(max-width: 760px) 100vw, 720px" /> : <span className="product-logo">{product.initial}</span>}</div><div className="detail-mini-note"><span>✓</span><div><b>官方渠道核验</b><small>商品信息经过人工检查</small></div></div><a className="detail-home-link" href="/"><span>←</span> 返回商城首页</a></div>
      <section className="detail-info"><div className="detail-labels"><span className="section-kicker">PRODUCT DETAILS</span><i>自动发货</i><i>售后保障</i></div><h1>{product.name}</h1><p className="detail-desc">{product.detail}</p><div className="spec-grid"><span><small>商品类型</small><b>数字商品</b></span><span><small>计费周期</small><b>{billingCycleLabel(billingCycle)}</b></span><span><small>交付方式</small><b>订单邮箱</b></span><span><small>预计发货</small><b>支付核验后</b></span>{attributes.map((attribute) => <span key={attribute.name}><small>{attribute.name}</small><b>{attribute.value}</b></span>)}</div><div className="price-panel"><div><small>{billingCycleLabel(billingCycle)}价格</small><strong><em>¥</em>{product.price}<em className="price-cycle">{billingCyclePriceText(billingCycle)}</em></strong><del>原价 ¥{product.oldPrice}</del></div><span>库存充足</span></div><ul className="feature-list"><li><b>✓</b><span><strong>自动发货</strong><small>支付核验后自动发送至订单邮箱</small></span></li><li><b>✓</b><span><strong>售后保障</strong><small>订单问题可联系在线客服处理</small></span></li><li><b>✓</b><span><strong>安全交易</strong><small>订单信息加密保存，保护隐私</small></span></li></ul>{error && <p className="form-error">{error}</p>}<button className="confirm-order" onClick={confirmOrder} disabled={loading}>{loading ? '正在创建订单…' : `确认下单 · ¥${product.price}${billingCyclePriceText(billingCycle)}`} <span>→</span></button><p className="detail-tip">确认即表示已阅读并同意数字商品购买须知</p></section>
    </div>
  </main>;
}
