"use client";

import { useEffect, useState } from "react";

type IconName = "spark" | "account" | "tools" | "location" | "shield" | "mail" | "check";

function BannerIcon({ name }: { name: IconName }) {
  const paths = {
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    account: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.8-2.7 5.2-2.7 6 0m3-6h3m-3 4h3" /></>,
    tools: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><path d="M14 17h6m-3-3v6" /></>,
    location: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    shield: <><path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6l8-3Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function ServiceMap() {
  return <div className="banner-service-map" aria-hidden="true">
    <div className="banner-map-orbit" />
    <svg className="banner-map-lines" viewBox="0 0 440 300" fill="none" preserveAspectRatio="none">
      <path d="M75 53H155Q220 53 220 150M366 53H285Q220 53 220 150M88 255H158Q220 255 220 150M360 255H282Q220 255 220 150" />
      <circle cx="220" cy="150" r="92" />
    </svg>
    <div className="banner-map-node banner-map-digital"><span><BannerIcon name="account" /></span><div><b>数字商城</b><small>会员 · 账号 · 数字服务</small></div></div>
    <div className="banner-map-node banner-map-tools"><span><BannerIcon name="tools" /></span><div><b>实用工具</b><small>让日常工作更简单</small></div></div>
    <div className="banner-map-hub"><span><BannerIcon name="spark" /></span><b>宇星商城</b><small>连接每一种所需</small></div>
    <div className="banner-map-node banner-map-onsite"><span><BannerIcon name="location" /></span><div><b>技术服务</b><small>在线咨询 · 上门服务</small></div></div>
    <div className="banner-map-support"><span className="banner-online-dot" /><b>7 × 24</b><small>人工客服，随时为你</small></div>
    <span className="banner-map-caption">DIGITAL SERVICES, REAL CONNECTIONS.</span>
  </div>;
}

function DigitalCollection() {
  return <div className="banner-digital-scene" aria-hidden="true">
    <div className="banner-collection-card">
      <div className="banner-collection-header"><span><i /><i /><i /></span><small>YXSTAR COLLECTION</small><BannerIcon name="spark" /></div>
      <div className="banner-collection-title"><small>为高效生活，精选每一份所需</small><b>你的数字服务清单</b></div>
      <div className="banner-collection-row"><span className="banner-icon-peach"><BannerIcon name="account" /></span><div><b>会员与账号</b><small>丰富选择，按需购买</small></div><em>01</em></div>
      <div className="banner-collection-row"><span className="banner-icon-mint"><BannerIcon name="tools" /></span><div><b>效率与工具</b><small>发现工作中的实用帮手</small></div><em>02</em></div>
      <div className="banner-collection-footer"><BannerIcon name="shield" /><span>清晰的服务说明 · 专属订单记录</span></div>
    </div>
    <div className="banner-delivery-card"><span className="banner-delivery-check"><BannerIcon name="check" /></span><div><b>每一单，都认真交付</b><small>支付核验后，按订单内容交付</small></div><span className="banner-delivery-mail"><BannerIcon name="mail" />订单邮箱接收，随时查阅</span></div>
    <span className="banner-digital-caption">CURATED FOR YOUR EVERYDAY.</span>
  </div>;
}

export function StorefrontBanners() {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (paused || hovered || focused) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const updateAutoplay = () => {
      window.clearInterval(timer);
      timer = motion.matches ? undefined : window.setInterval(() => setSlide(current => (current + 1) % 2), 5000);
    };
    updateAutoplay();
    motion.addEventListener("change", updateAutoplay);
    return () => { window.clearInterval(timer); motion.removeEventListener("change", updateAutoplay); };
  }, [paused, hovered, focused]);

  const slides = ["一站式综合服务", "精选数字商城"];
  return <section className={`storefront-banners banner-theme-${slide === 0 ? "service" : "digital"}`} aria-label="宇星商城服务介绍" aria-roledescription="轮播图" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="storefront-banner-track" style={{ transform: `translateX(-${slide * 50}%)` }}>
      <div id="storefront-banner-service" className="storefront-banner storefront-banner-service" role="group" aria-roledescription="幻灯片" aria-label="第 1 张，共 2 张：一站式综合服务" aria-hidden={slide !== 0}>
        <div className="storefront-banner-copy">
          <span className="storefront-banner-eyebrow"><i />宇星商城 · 从线上到身边</span>
          <h1>数字生活所需，<br /><em>在宇星，一站找到。</em></h1>
          <p>从 AI 会员、实用工具，到在线咨询与上门技术服务，<br className="banner-desktop-break" />连接你的工作与生活。</p>
          <div className="storefront-banner-features"><span><BannerIcon name="account" />数字商城</span><span><BannerIcon name="tools" />实用工具</span><span><BannerIcon name="location" />技术服务</span></div>
        </div>
        <ServiceMap />
      </div>
      <div id="storefront-banner-digital" className="storefront-banner storefront-banner-digital" role="group" aria-roledescription="幻灯片" aria-label="第 2 张，共 2 张：精选数字商城" aria-hidden={slide !== 1}>
        <div className="storefront-banner-copy">
          <span className="storefront-banner-eyebrow"><i />精选数字服务 · 用心交付</span>
          <h2>每一份数字所需，<br /><em>都值得安心选择。</em></h2>
          <p>会员、账号与数字服务，清晰选购，省心交付。<br className="banner-desktop-break" />从下单到售后，始终有人为你解答。</p>
          <div className="storefront-banner-features"><span><BannerIcon name="shield" />官方正规渠道</span><span><BannerIcon name="mail" />订单邮箱交付</span><span><BannerIcon name="check" />售后保障</span></div>
        </div>
        <DigitalCollection />
      </div>
    </div>
    <div className="storefront-banner-controls">
      <div className="storefront-banner-selectors" role="group" aria-label="切换宣传内容">{slides.map((name, index) => <button type="button" key={name} aria-label={`查看${name}`} aria-pressed={slide === index} aria-controls={index === 0 ? "storefront-banner-service" : "storefront-banner-digital"} onClick={() => setSlide(index)}><span>0{index + 1}</span><i /><b>{name}</b></button>)}</div>
      <button className="storefront-banner-play" type="button" aria-label={paused ? "继续自动轮播" : "暂停自动轮播"} aria-pressed={paused} title={paused ? "继续自动轮播" : "暂停自动轮播"} onClick={() => setPaused(value => !value)}>{paused ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zm5 0h3v12h-3z" /></svg>}</button>
    </div>
  </section>;
}
