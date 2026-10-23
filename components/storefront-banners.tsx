"use client";

import { useEffect, useState } from "react";

function FeatureIcon({ kind }: { kind: "shield" | "mail" | "support" | "location" | "chat" }) {
  const paths = {
    shield: <><path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    support: <><path d="M4 14v-3a8 8 0 0 1 16 0v3m0 3v1a3 3 0 0 1-3 3h-3" /><rect x="2" y="11" width="4" height="7" rx="2" /><rect x="18" y="11" width="4" height="7" rx="2" /></>,
    location: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    chat: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" /><path d="M7 10h10M7 14h6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>;
}

function DigitalIllustration() {
  return <svg className="storefront-banner-art" viewBox="0 0 500 330" fill="none" aria-hidden="true" focusable="false">
    <circle cx="289" cy="155" r="145" fill="#FFE4C8" />
    <circle cx="426" cy="59" r="19" fill="#FFD1A6" />
    <circle cx="65" cy="125" r="7" fill="#F3B681" />
    <path d="M61 76h16m-8-8v16M437 231h16m-8-8v16" stroke="#DFAC7D" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="263" cy="302" rx="177" ry="12" fill="#EDD3BA" fillOpacity=".55" />
    <path d="m232 248-9 35h75l-10-35" fill="#B6C1CE" />
    <rect x="193" y="278" width="135" height="13" rx="6.5" fill="#D1DAE3" />
    <rect x="93" y="46" width="320" height="211" rx="20" fill="#344357" />
    <rect x="104" y="57" width="298" height="181" rx="11" fill="#FFFDF9" />
    <circle cx="253" cy="247" r="3" fill="#A5AFBC" />
    <rect x="127" y="82" width="250" height="25" rx="7" fill="#F7F1E9" />
    <circle cx="140" cy="94" r="3" fill="#F6A36C" /><circle cx="151" cy="94" r="3" fill="#E4C59F" /><circle cx="162" cy="94" r="3" fill="#CDD7C7" />
    <path d="M285 94h77" stroke="#DCD5CC" strokeWidth="4" strokeLinecap="round" />
    <rect x="127" y="123" width="87" height="89" rx="16" fill="#FFEBDA" />
    <text x="170" y="181" textAnchor="middle" fill="#D76829" fontSize="43" fontWeight="750" fontFamily="Arial, sans-serif">AI</text>
    <path d="M236 133h126M236 150h89" stroke="#D3DBE3" strokeWidth="7" strokeLinecap="round" />
    <rect x="232" y="171" width="39" height="39" rx="10" fill="#E8F0FC" />
    <path d="M244 183h15v15h-15zm0 7h15m-8-7v15" stroke="#628CC5" strokeWidth="2" />
    <rect x="280" y="171" width="39" height="39" rx="10" fill="#E7F0E7" />
    <path d="m289 190 7 7 12-14" stroke="#789A79" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="328" y="171" width="39" height="39" rx="10" fill="#FFF0DD" />
    <path d="m340 184 15 8-15 8v-16Z" fill="#D5A05C" />
    <g className="banner-art-floating">
      <rect x="32" y="173" width="108" height="88" rx="19" fill="white" stroke="#F0DBCA" />
      <circle cx="65" cy="202" r="10" fill="#D7E6FB" />
      <path d="M49 230c0-19 32-19 32 0" fill="#9DBDE5" />
      <path d="M94 200h29m-29 13h20m-73 32h76" stroke="#DFE5EC" strokeWidth="5" strokeLinecap="round" />
    </g>
    <g className="banner-art-floating">
      <rect x="368" y="24" width="79" height="79" rx="21" fill="white" stroke="#F0DBCA" />
      <rect x="386" y="42" width="16" height="16" rx="4" fill="#F5AF7B" />
      <rect x="412" y="42" width="16" height="16" rx="4" fill="#A8C6E7" />
      <rect x="386" y="68" width="16" height="16" rx="4" fill="#B7CFB2" />
      <path d="M412 76h16m-8-8v16" stroke="#D69C61" strokeWidth="3" strokeLinecap="round" />
    </g>
  </svg>;
}

function TechnicalIllustration() {
  return <svg className="storefront-banner-art" viewBox="0 0 500 330" fill="none" aria-hidden="true" focusable="false">
    <circle cx="282" cy="158" r="142" fill="#DCEBFF" />
    <circle cx="433" cy="64" r="17" fill="#BDD7F5" />
    <path d="M58 150h14m-7-7v14M448 191h14m-7-7v14" stroke="#A9C6E6" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="253" cy="296" rx="179" ry="12" fill="#C5D8EF" fillOpacity=".65" />
    <path d="m281 221-6 24h62l-7-24" fill="#9DAFC4" />
    <rect x="256" y="240" width="100" height="9" rx="4.5" fill="#B7C9DC" />
    <rect x="206" y="75" width="223" height="154" rx="15" fill="#3C536F" />
    <rect x="216" y="85" width="203" height="128" rx="7" fill="white" />
    <circle cx="317" cy="135" r="24" fill="#E6F1E9" />
    <path d="m305 135 8 8 17-19" stroke="#71967C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M277 176h80m-63 14h46" stroke="#D5E2EF" strokeWidth="6" strokeLinecap="round" />
    <path d="M103 230v-51c0-24 17-39 39-39s38 15 38 39v51" fill="#4E85C9" />
    <path d="m123 146 18 21 18-21" fill="#F5F9FE" />
    <rect x="131" y="131" width="20" height="23" rx="8" fill="#EFC29E" />
    <circle cx="141" cy="110" r="28" fill="#F7D3B2" />
    <path d="M114 112c-7-24 10-39 29-36 20 2 30 16 25 33-5-4-9-12-10-18-12 10-26 12-44 10v11Z" fill="#354C68" />
    <circle cx="134" cy="113" r="1.7" fill="#526277" /><circle cx="153" cy="113" r="1.7" fill="#526277" />
    <path d="M137 124c3 3 7 3 10 0" stroke="#BC8D71" strokeWidth="2" strokeLinecap="round" />
    <path d="M112 115v-9c0-16 13-29 29-29m27 34v13l-14 5" stroke="#7498C3" strokeWidth="5" strokeLinecap="round" />
    <rect x="107" y="106" width="9" height="18" rx="4.5" fill="#8FADD2" /><rect x="164" y="106" width="9" height="18" rx="4.5" fill="#8FADD2" />
    <path d="m110 176-19 43c-4 10 4 17 13 17h26m39-60 14 40h27" stroke="#4E85C9" strokeWidth="19" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M126 236h15m66-20h17" stroke="#F0C8A7" strokeWidth="12" strokeLinecap="round" />
    <rect x="224" y="237" width="91" height="7" rx="3.5" fill="#8DA9C9" />
    <rect x="68" y="248" width="381" height="12" rx="6" fill="#9DBBDD" />
    <path d="M93 260v31m330-31v31" stroke="#A9C3E0" strokeWidth="10" strokeLinecap="round" />
    <rect x="363" y="217" width="65" height="45" rx="10" fill="#F4B67F" />
    <path d="M383 216v-7h25v7" stroke="#DDA16D" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M395 229v21m-7-10h14" stroke="#FFF8EE" strokeWidth="4" strokeLinecap="round" />
    <g className="banner-art-floating">
      <path d="M60 30h88a12 12 0 0 1 12 12v26a12 12 0 0 1-12 12h-31l-15 12V80H60a12 12 0 0 1-12-12V42a12 12 0 0 1 12-12Z" fill="white" stroke="#C9DEF4" />
      <circle cx="83" cy="55" r="4" fill="#90B3E0" /><circle cx="104" cy="55" r="4" fill="#90B3E0" /><circle cx="125" cy="55" r="4" fill="#90B3E0" />
    </g>
    <g className="banner-art-floating">
      <path d="M447 117c0 19-25 39-25 39s-25-20-25-39a25 25 0 1 1 50 0Z" fill="#6796D3" />
      <circle cx="422" cy="116" r="9" fill="#F4F9FF" />
    </g>
  </svg>;
}

export function StorefrontBanners() {
  const [slide, setSlide] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (hovered || focused) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const updateAutoplay = () => {
      window.clearInterval(timer);
      timer = motion.matches ? undefined : window.setInterval(() => setSlide(current => (current + 1) % 2), 5000);
    };
    updateAutoplay();
    motion.addEventListener("change", updateAutoplay);
    return () => { window.clearInterval(timer); motion.removeEventListener("change", updateAutoplay); };
  }, [hovered, focused]);

  const slides = ["AI 数字商城", "在线与上门技术服务"];
  return <section className={`storefront-banners banner-theme-${slide === 0 ? "digital" : "service"}`} aria-label="宇星商城服务介绍" aria-roledescription="轮播图" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="storefront-banner-track" style={{ transform: `translateX(-${slide * 50}%)` }}>
      <div id="storefront-banner-digital" className="storefront-banner storefront-banner-digital" role="group" aria-roledescription="幻灯片" aria-label="第 1 张，共 2 张：AI 数字商城" aria-hidden={slide !== 0}>
        <div className="storefront-banner-copy">
          <span className="storefront-banner-eyebrow"><b>宇星商城</b><i />AI 数字商城</span>
          <h1>AI 会员与实用工具<br /><em>一站选购，省心使用</em></h1>
          <p>会员账号、充值服务、效率工具，一站选购。<br className="banner-desktop-break" />清晰交付，人工售后，让每一次使用都更省心。</p>
          <div className="storefront-banner-features"><span><FeatureIcon kind="shield" />丰富数字商品</span><span><FeatureIcon kind="mail" />订单邮箱交付</span><span><FeatureIcon kind="support" />人工售后保障</span></div>
        </div>
        <DigitalIllustration />
      </div>
      <div id="storefront-banner-service" className="storefront-banner storefront-banner-service" role="group" aria-roledescription="幻灯片" aria-label="第 2 张，共 2 张：在线与上门技术服务" aria-hidden={slide !== 1}>
        <div className="storefront-banner-copy">
          <span className="storefront-banner-eyebrow"><b>宇星商城</b><i />在线与上门技术服务</span>
          <h2>在线解答，上门服务<br /><em>技术问题，交给专业</em></h2>
          <p>从远程协助到上门技术服务，找到适合的技术人员。<br className="banner-desktop-break" />让专业支持离你更近，工作生活更轻松。</p>
          <div className="storefront-banner-features"><span><FeatureIcon kind="chat" />在线技术咨询</span><span><FeatureIcon kind="location" />上门技术服务</span><span><FeatureIcon kind="support" />7 × 24 人工客服</span></div>
        </div>
        <TechnicalIllustration />
      </div>
    </div>
    <div className="storefront-banner-dots" role="group" aria-label="切换宣传内容">{slides.map((name, index) => <button type="button" key={name} aria-label={`切换到第 ${index + 1} 张：${name}`} aria-pressed={slide === index} aria-controls={index === 0 ? "storefront-banner-digital" : "storefront-banner-service"} onClick={() => setSlide(index)} />)}</div>
  </section>;
}
