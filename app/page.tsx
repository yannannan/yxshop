"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { TechnicalSupportChat } from "../components/technical-support-chat";
import { TechnicalProviderApplication } from "../components/technical-provider-application";
import {
  billingCyclePriceText,
  catalog,
  defaultBillingCycle,
  parseProductAttributes,
  type CatalogProduct,
} from "../lib/catalog";
import { categoryTree } from "../lib/categories";
import {
  formatServicePrice,
  serviceDeliveryLabels,
  servicePriceText,
  technicalServices,
  type TechnicalService,
} from "../lib/technical-services";

type CategoryGroup = { name: string; children: { name: string }[] };
const pageSize = 9;

export default function StorePage() {
  const [category, setCategory] = useState("全部商品");
  const [subcategory, setSubcategory] = useState("全部");
  const [categoryGroups, setCategoryGroups] =
    useState<Record<string, string[]>>(categoryTree);
  const [products, setProducts] = useState<CatalogProduct[]>(catalog);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [authOpen, setAuthOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<number | null>(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [phoneRegistered, setPhoneRegistered] = useState<boolean | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [providerApplicationOpen, setProviderApplicationOpen] = useState(false);
  const [promoSlide, setPromoSlide] = useState(0);
  const [channel, setChannel] = useState<"mall" | "technical">("mall");
  const [technicalChatOpen, setTechnicalChatOpen] = useState(false);
  const [technicalChatService, setTechnicalChatService] =
    useState<TechnicalService | null>(null);
  const [technicalServiceItems, setTechnicalServiceItems] =
    useState<TechnicalService[]>(technicalServices);
  const homepageTechnicalServices = useMemo(
    () => technicalServiceItems.filter((service) => service.homepageFeatured),
    [technicalServiceItems],
  );
  const homepageTechnicalProviderCount = new Set(
    homepageTechnicalServices.map((service) => service.providerId),
  ).size;

  useEffect(() => {
    const savedPhone = window.localStorage.getItem("mall_phone");
    if (savedPhone) {
      setPhone(savedPhone);
      setLoggedIn(true);
    }
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("channel") === "technical") {
      setChannel("technical");
    }
    const requested = Number(searchParams.get("product"));
    if (requested) {
      setPendingProduct(requested);
      setAuthOpen(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((result: unknown) => {
        if (Array.isArray(result)) setProducts(result as CatalogProduct[]);
      })
      .catch(() => null);
    fetch("/api/categories")
      .then((response) => (response.ok ? response.json() : []))
      .then((result: unknown) => {
        const groups = result as CategoryGroup[];
        if (!Array.isArray(groups) || !groups.length) return;
        const next: Record<string, string[]> = Object.fromEntries(
          groups.map((item) => [
            item.name,
            item.children.map((child) => child.name),
          ]),
        );
        setCategoryGroups(next);
      })
      .catch(() => null);
    fetch("/api/technical-services", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((result: unknown) => {
        if (Array.isArray(result)) setTechnicalServiceItems(result as TechnicalService[]);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!authOpen) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setAuthOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [authOpen]);

  useEffect(() => {
    if (!codeCooldown) return;
    const timer = window.setInterval(
      () => setCodeCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setPromoSlide((current) => (current + 1) % 2),
      5000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => {
    const filtered = products.filter(
      (product) =>
        (category === "全部商品" || product.category === category) &&
        (subcategory === "全部" || product.subcategory === subcategory) &&
        `${product.name}${product.desc}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
    return filtered;
  }, [products, category, subcategory, query]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const showGroupedCatalog = category === "全部商品" && subcategory === "全部";
  const groupedVisibleProducts = useMemo(() => {
    const groups = new Map<string, CatalogProduct[]>();
    for (const product of visible) {
      const items = groups.get(product.category) || [];
      items.push(product);
      groups.set(product.category, items);
    }
    return Array.from(groups, ([name, items]) => ({ name, items }));
  }, [visible]);
  const categories = ["全部商品", ...Object.keys(categoryGroups)];
  const availableSubcategories =
    category === "全部商品"
      ? ["全部"]
      : ["全部", ...(categoryGroups[category] || [])];

  function order(id: number) {
    if (!loggedIn) {
      setPendingProduct(id);
      setAuthOpen(true);
      return;
    }
    window.location.href = `/product/${id}`;
  }

  function switchChannel(
    next: "mall" | "technical",
    scrollTarget?: "content" | "talent-entry",
  ) {
    setChannel(next);
    if (!scrollTarget) return;
    window.setTimeout(() => {
      document
        .getElementById(
          scrollTarget === "talent-entry" ? "talent-entry" : "channel-content",
        )
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openTechnicalChat(service: TechnicalService) {
    setTechnicalChatService(service);
    setTechnicalChatOpen(true);
  }

  function renderProductCard(product: CatalogProduct) {
    return (
      <article
        className="product-card refined-card"
        key={product.id}
        role="link"
        tabIndex={0}
        aria-label={`查看${product.name}详情`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a,button")) return;
          window.location.href = `/product/${product.id}`;
        }}
        onKeyDown={(event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            !(event.target as HTMLElement).closest("a,button")
          ) {
            event.preventDefault();
            window.location.href = `/product/${product.id}`;
          }
        }}
      >
        <a
          className={`product-visual ${product.tone}${product.coverImage ? " has-upload-image" : ""}`}
          href={`/product/${product.id}`}
          aria-label={`查看${product.name}详情`}
        >
          <span className="badge">热销</span>
          {product.coverImage ? (
            <Image
              className="product-upload-image"
              unoptimized
              src={product.coverImage}
              alt={product.name}
              fill
              sizes="(max-width: 720px) 100vw, 33vw"
            />
          ) : (
            <span className="product-logo">{product.initial}</span>
          )}
          <span className="visual-arrow">查看详情 →</span>
        </a>
        <div className="product-info">
          <div className="product-meta">
            <span>
              {product.category} · {product.subcategory}
            </span>
            <i>库存充足</i>
          </div>
          <h3>
            <a href={`/product/${product.id}`}>{product.name}</a>
          </h3>
          <p>{product.desc}</p>
          <div className="delivery-note">
            <span>✓</span> 支付后自动发至订单邮箱
          </div>
          <div className="product-attribute-tags">
            {parseProductAttributes(product.attributesJson)
              .slice(0, 3)
              .map((attribute) => (
                <span key={attribute.name}>
                  {attribute.name}：{attribute.value}
                </span>
              ))}
          </div>
          <div className="buy-row">
            <div>
              <strong>
                <small>¥</small>
                {product.price}
                <em className="price-cycle">
                  {billingCyclePriceText(
                    product.billingCycle || defaultBillingCycle(product.id),
                  )}
                </em>
              </strong>
              <del>¥{product.oldPrice}</del>
            </div>
            <button onClick={() => order(product.id)}>立即下单</button>
          </div>
        </div>
      </article>
    );
  }

  function renderTechnicalServiceCard(service: TechnicalService) {
    const supportsOnline = service.deliveryModes.includes("online");
    const supportsOnsite = service.deliveryModes.includes("onsite");
    return (
      <article className="technical-reference-card" key={service.slug}>
        <a
          className="technical-card-hitarea"
          href={`/service/${service.slug}`}
          aria-label={`查看${service.title}服务详情`}
        />

        <header className="technical-reference-card-header">
          <Image
            className="technical-reference-card-avatar"
            src={service.avatar}
            alt={`${service.provider}技术人员头像`}
            width={108}
            height={108}
            sizes="108px"
          />
          <div className="technical-reference-card-provider">
            <div>
              <b>{service.provider}</b>
              <span>已认证</span>
            </div>
            <p>
              {service.city} · {service.experience}
            </p>
            <small>{service.providerRole}</small>
          </div>
          <em>在线接单</em>
        </header>

        <section className="technical-reference-card-service">
          <h3>{service.title}</h3>
          <p>{service.summary}</p>
          <div className="technical-reference-card-skills" aria-label="技术能力">
            {service.skills.slice(0, 4).map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </section>

        <section className="technical-reference-card-service-info" aria-label="服务方式与价格">
          <div className="technical-reference-card-delivery">
            {service.deliveryModes.map((mode) => (
              <span key={mode}>{serviceDeliveryLabels[mode]}</span>
            ))}
            {supportsOnsite && (
              <small>
                {service.coverage || "支持指定地点服务"} · 确认订单前选择时间和地点
              </small>
            )}
          </div>
          <div className="technical-reference-card-price" aria-label="服务价格">
            {service.pricingMode === "fixed" && service.price !== undefined ? (
              <span
                className="technical-card-price"
                aria-label={servicePriceText(service)}
              >
                <i>¥</i>
                <b>{formatServicePrice(service.price)}</b>
                <em>/ {service.unit ?? "次"}</em>
              </span>
            ) : (
              <strong className="negotiable">
                {service.pricingMode === "negotiable" ? "价格面议" : "价格待确认"}
              </strong>
            )}
            {service.pricingMode === "negotiable" && (
              <small>根据实际需求确认服务价格</small>
            )}
          </div>
        </section>

        <div className="technical-reference-card-actions">
          {supportsOnline && (
            <button
              type="button"
              className="technical-reference-card-consult"
              onClick={() => openTechnicalChat(service)}
            >
              <span>
                <b>在线免费技术支持</b>
                <small>先沟通需求，再确认服务安排</small>
              </span>
              <em>{service.onlineResponse ? `最快 ${service.onlineResponse}` : "立即沟通"}</em>
            </button>
          )}
          <div className="technical-reference-card-secondary-actions">
            <a href={`/service/${service.slug}`}>查看服务</a>
            <a
              className="primary"
              href={`/service/${service.slug}`}
            >
              {service.pricingMode === "fixed" ? "立即购买" : "沟通确认价格"}
            </a>
          </div>
        </div>
      </article>
    );
  }

  async function sendCode() {
    if (codeCooldown) return;
    setAuthError("");
    setAuthNotice("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        demoCode?: string;
        registered?: boolean;
      };
      if (!response.ok) setAuthError(data.message || "验证码发送失败");
      else {
        setCode(data.demoCode || "");
        setAuthNotice(data.message || "验证码已发送，请查收短信");
        setPhoneRegistered(Boolean(data.registered));
        setCodeCooldown(60);
      }
    } catch {
      setAuthError("验证码请求失败，请稍后重试");
    }
  }

  async function signIn() {
    setAuthLoading(true);
    setAuthError("");
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, email, code }),
    });
    const data = (await response.json()) as { message?: string };
    setAuthLoading(false);
    if (!response.ok) {
      setAuthError(data.message || "登录失败");
      return;
    }
    window.localStorage.setItem("mall_phone", phone);
    setLoggedIn(true);
    setAuthOpen(false);
    if (pendingProduct) window.location.href = `/product/${pendingProduct}`;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.localStorage.removeItem("mall_phone");
    setLoggedIn(false);
    setPhone("");
    setEmail("");
    setCode("");
    setPhoneRegistered(null);
  }

  return (
    <main className="store-shell refined-store">
      <header
        className={`topbar refined-topbar compact-topbar${loggedIn && phone === "13564802098" ? " has-admin-entry" : ""}`}
      >
        <a className="brand" href="/" aria-label="宇星商城首页">
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
        <nav className="site-navigation" aria-label="主导航">
          <button
            className={channel === "mall" ? "active" : ""}
            onClick={() => switchChannel("mall", "content")}
          >
            AI商城服务
          </button>
          <button
            className={channel === "technical" ? "active" : ""}
            onClick={() => switchChannel("technical", "content")}
          >
            上门技术服务
          </button>
          <a
            href="#talent-entry"
            onClick={(event) => {
              event.preventDefault();
              switchChannel("technical", "talent-entry");
            }}
          >
            技术人才入驻
          </a>
        </nav>
        {loggedIn && phone === "13564802098" && (
          <a
            className="admin-entry"
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
          >
            进入管理后台
          </a>
        )}
        <div className="account-actions">
          {loggedIn ? (
            <>
              <a className="orders-link" href="/orders">
                我的订单
              </a>
              <div className="account-chip">
                <span>
                  {phone.slice(0, 3)} **** {phone.slice(-4)}
                </span>
                <button onClick={signOut}>退出</button>
              </div>
            </>
          ) : (
            <button className="login-btn" onClick={() => setAuthOpen(true)}>
              登录 / 注册
            </button>
          )}
        </div>
      </header>

      <div className="store-layout refined-layout no-sidebar-layout">
        <section className="content refined-content">
          <div
            className="hero refined-hero promo-hero"
            aria-roledescription="carousel"
            aria-label="商城宣传推广"
          >
            <div className="hero-promo-viewport">
              <div
                className="hero-promo-track"
                style={{ transform: `translateX(-${promoSlide * 50}%)` }}
              >
                <section
                  className="hero-promo-slide promo-slide-primary"
                  aria-hidden={promoSlide !== 1}
                >
                  <div className="hero-copy">
                    <span className="eyebrow">SAFE · FAST · RELIABLE</span>
                    <h1>
                      官方正规渠道
                      <br />
                      下单自动发货
                    </h1>
                    <p>
                      账号/卡密/会员—&gt;自动推送至订单邮箱，安心购买，售后无忧。
                      <br />
                      <strong>7 × 24 小时客服人工在线服务</strong>
                    </p>
                    <div className="hero-metrics">
                      <span>
                        <b>7 × 24</b>
                        <small>账号 / 卡密自动发货</small>
                      </span>
                      <span>
                        <b>官方Visa直充</b>
                        <small>官方Visa会员代充</small>
                      </span>
                      <span>
                        <b>无效退款</b>
                        <small>保质保量，售后保障</small>
                      </span>
                    </div>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit one" />
                    <div className="orbit two" />
                    <div className="glow-card">
                      <span>✓</span>
                      <strong>即时交付</strong>
                      <small>支付核验后发送至订单邮箱</small>
                    </div>
                    <div className="cube c1">AI</div>
                    <div className="cube c2">N</div>
                    <div className="cube c3">⌘</div>
                  </div>
                </section>
                <section
                  className="hero-promo-slide promo-slide-service"
                  aria-hidden={promoSlide !== 0}
                >
                  <div className="hero-copy">
                    <span className="eyebrow">ONE-STOP · AI · SERVICE</span>
                    <h1 className="service-banner-title">
                      <span>宇星商城</span>
                      <span>一站式网络与现实综合服务</span>
                      <span>不一样的AI时代网络商城</span>
                    </h1>
                    <div className="hero-metrics">
                      <span>
                        <b>网络与服务</b>
                      </span>
                      <span>
                        <b>技术上门服务</b>
                      </span>
                      <span>
                        <b>7 * 24小时在线</b>
                      </span>
                    </div>
                  </div>
                  <div className="hero-art hero-art-service" aria-hidden="true">
                    <div className="orbit one" />
                    <div className="orbit two" />
                    <div className="glow-card">
                      <span>✦</span>
                      <strong>一站式服务</strong>
                      <small>AI 时代网络服务触手可及</small>
                    </div>
                    <div className="cube c1">AI</div>
                    <div className="cube c2">24</div>
                    <div className="cube c3">∞</div>
                  </div>
                </section>
              </div>
              <div className="hero-promo-dots" role="tablist" aria-label="宣传推广切换">
                {[0, 1].map((index) => (
                  <button
                    type="button"
                    key={index}
                    role="tab"
                    aria-selected={promoSlide === index}
                    aria-label={`查看第 ${index + 1} 条宣传`}
                    className={promoSlide === index ? "active" : ""}
                    onClick={() => setPromoSlide(index)}
                  />
                ))}
              </div>
            </div>
          </div>

          <section className="channel-switch" aria-label="服务频道">
            <button
              type="button"
              className={channel === "mall" ? "active" : ""}
              aria-pressed={channel === "mall"}
              onClick={() => switchChannel("mall")}
            >
              <span className="channel-icon">⌘</span>
              <span>
                <b>AI商城服务</b>
                <small>会员、账号、工具与 AI 教程，即买即用</small>
              </span>
              <em>{channel === "mall" ? "当前频道" : "切换频道"}</em>
            </button>
            <button
              type="button"
              className={channel === "technical" ? "active" : ""}
              aria-pressed={channel === "technical"}
              onClick={() => switchChannel("technical")}
            >
              <span className="channel-icon">⌖</span>
              <span>
                <b>上门技术服务</b>
                <small>在线咨询最快 1–5 分钟，到场最快 20 分钟</small>
              </span>
              <em>{channel === "technical" ? "当前频道" : "切换频道"}</em>
            </button>
          </section>

          <div className="channel-content" id="channel-content">
          {channel === "mall" && <>
          <div className="quick-benefits" id="services">
            <span>
              <b>自动发货</b>
              <small>支付核验后自动账号 / 卡密推送至邮箱</small>
            </span>
            <span>
              <b>7 × 24 小时客服人工在线</b>
              <small>客服真人在线，让你安心购买</small>
            </span>
            <span>
              <b>保质保量</b>
              <small>官方渠道保质保量，无效退款</small>
            </span>
          </div>

          <div className="catalog-filter-area" id="products">
            <div className="catalog-filter-row">
              <nav className="category-tabs" aria-label="商品类型">
                {categories.map((item) => (
                  <button
                    key={item}
                    aria-pressed={category === item}
                    className={category === item ? "active" : ""}
                    onClick={() => {
                      setCategory(item);
                      setSubcategory("全部");
                      setPage(1);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </nav>
              <label className="search catalog-search">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="搜索商品"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索商品、品牌或服务"
                />
                <button type="button">搜索</button>
              </label>
              <div className="product-tools product-tools-row">
                <span>共 {visible.length} 件</span>
                {!showGroupedCatalog && visible.length > pageSize && (
                  <nav
                    className="pagination pagination-inline"
                    aria-label="商品翻页"
                  >
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      ← 上一页
                    </button>
                    <span>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setPage((value) => Math.min(totalPages, value + 1))
                      }
                    >
                      下一页 →
                    </button>
                  </nav>
                )}
              </div>
            </div>
            <nav
              className="subcategory-tabs"
              aria-label={`${category}二级分类`}
            >
              {availableSubcategories.map((item) => (
                <button
                  key={item}
                  aria-pressed={subcategory === item}
                  className={subcategory === item ? "active" : ""}
                  onClick={() => {
                    setSubcategory(item);
                    setPage(1);
                  }}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>

          {showGroupedCatalog ? (
            <div className="product-category-groups">
              {groupedVisibleProducts.map((group) => (
                <section className="product-category-section" key={group.name}>
                  <header>
                    <h2>{group.name}</h2>
                    <span>{group.items.length} 件商品</span>
                  </header>
                  <div className="product-grid refined-grid">
                    {group.items.map(renderProductCard)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="product-grid refined-grid">
              {pagedProducts.map(renderProductCard)}
            </div>
          )}
          {visible.length === 0 && (
            <div className="empty refined-empty">
              <span>⌕</span>
              <h3>没有找到相关商品</h3>
              <p>试试更短的关键词，或返回查看全部商品。</p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("全部商品");
                  setPage(1);
                }}
              >
                查看全部商品
              </button>
            </div>
          )}

          <section className="help-banner">
            <div>
              <span>?</span>
              <div>
                <b>购买前还有疑问？</b>
                <p>查看购买说明，或联系售后确认商品是否适合你。</p>
              </div>
            </div>
            <button onClick={() => setServiceOpen(true)}>在线微信客服</button>
          </section>
          </>}

          {channel === "technical" && (
            <section className="technical-services-section" aria-labelledby="technical-services-title">
              <header className="technical-services-heading">
                <div>
                  <span className="section-kicker">TECHNICAL SERVICES</span>
                  <h2 id="technical-services-title">上门技术服务</h2>
                  <p>认证技术人才 · 固定价格或价格面议 · 在线沟通与到场服务</p>
                </div>
                <span>共 {homepageTechnicalProviderCount} 位服务者</span>
              </header>
              <div className="technical-services-grid">
                {homepageTechnicalServices.map(renderTechnicalServiceCard)}
              </div>
              <section className="talent-entry" id="talent-entry">
                <div>
                  <span>TECH TALENT</span>
                  <h3>你是技术服务者？</h3>
                  <p>发布擅长服务、服务方式和价格，面向真实需求在线接单。</p>
                </div>
                <button type="button" onClick={() => setProviderApplicationOpen(true)}>
                  申请技术人才入驻
                </button>
              </section>
            </section>
          )}
          </div>
        </section>
      </div>

      <footer className="store-footer">
        <div>
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
          <p>简单、透明、可靠的数字商品购买体验。</p>
        </div>
        <div>
          <b>购买帮助</b>
          <a href="#services">发货说明</a>
          <a href="#services">售后保障</a>
        </div>
        <div>
          <b>商城信息</b>
          {loggedIn && phone === "13564802098" && <a href="/admin">管理后台</a>}
          <span>© 2026 宇星商城</span>
        </div>
      </footer>

      <TechnicalSupportChat
        activeService={technicalChatService}
        open={technicalChatOpen}
        services={technicalServiceItems}
        onClose={() => setTechnicalChatOpen(false)}
      />

      <TechnicalProviderApplication
        open={providerApplicationOpen}
        onClose={() => setProviderApplicationOpen(false)}
      />

      <div className="service-widget">
        {serviceOpen && (
          <section
            className="service-panel"
            role="dialog"
            aria-label="在线微信客服"
          >
            <button
              className="service-close"
              aria-label="关闭在线客服"
              onClick={() => setServiceOpen(false)}
            >
              ×
            </button>
            <span className="service-panel-kicker">ONLINE SERVICE</span>
            <b>在线微信客服</b>
            <p>扫码联系 7 × 24 小时人工客服</p>
            <div className="service-qr service-qr-image">
              <Image
                unoptimized
                src="/customer-service-wechat.png"
                alt="在线微信客服二维码"
                width={190}
                height={242}
              />
            </div>
            <small>扫码添加客服后，请说明订单号</small>
          </section>
        )}
        <button
          className="service-float"
          aria-expanded={serviceOpen}
          onClick={() => setServiceOpen((value) => !value)}
        >
          <span className="wechat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M12.1 4.1C7.7 4.1 4.2 6.9 4.2 10.4c0 1.9 1 3.7 2.7 4.9l-.7 2.4 2.8-1.4c.9.3 1.9.4 3 .4 4.4 0 7.9-2.8 7.9-6.3s-3.5-6.3-7.9-6.3Z"
              />
              <path
                fill="currentColor"
                d="M19.8 13.1c0 2.7-2.7 4.9-6 4.9-.8 0-1.6-.1-2.3-.4l-2.1 1 .5-1.8c-1.3-.9-2.1-2.2-2.1-3.7 0-2.7 2.7-4.9 6-4.9s6 2.2 6 4.9Z"
              />
              <circle cx="8.8" cy="10" r=".9" fill="#22b96d" />
              <circle cx="14" cy="10" r=".9" fill="#22b96d" />
              <circle cx="11.9" cy="13.3" r=".8" fill="#22b96d" />
              <circle cx="16" cy="13.3" r=".8" fill="#22b96d" />
            </svg>
          </span>
          <b>在线微信客服</b>
          <small>微信扫码联系</small>
        </button>
      </div>

      {authOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setAuthOpen(false)
          }
        >
          <section
            className="auth-modal refined-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <button
              className="modal-close"
              aria-label="关闭"
              onClick={() => setAuthOpen(false)}
            >
              ×
            </button>
            <div className="modal-brand">
              <span className="brand-mark">
                <Image
                  src="/yxstar_logo.png"
                  alt="宇星商城 Logo"
                  fill
                  sizes="34px"
                />
              </span>
            </div>
            <h2 id="auth-title">手机号登录 / 注册</h2>
            <p className="modal-sub">获取验证码后自动识别登录或注册</p>
            <label>
              登录手机号
              <div className="phone-field">
                <span>+86</span>
                <input
                  value={phone}
                  maxLength={11}
                  onChange={(event) => {
                    setPhone(event.target.value.replace(/\D/g, ""));
                    setPhoneRegistered(null);
                    setEmail("");
                    setCode("");
                    setAuthNotice("");
                  }}
                  placeholder="请输入手机号"
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </div>
            </label>
            <label>
              短信验证码
              <div className="code-field">
                <input
                  value={code}
                  maxLength={6}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="6 位验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button onClick={sendCode} disabled={Boolean(codeCooldown)}>
                  {codeCooldown ? `${codeCooldown}s 后重试` : "获取验证码"}
                </button>
              </div>
            </label>
            {phoneRegistered === true && (
              <div className="new-user-tip">
                <span>✓</span> 该手机号已注册，验证验证码后即可登录
              </div>
            )}
            {phoneRegistered === false && (
              <>
                <div className="new-user-tip">
                  <span>i</span> 新手机号，请填写订单接收邮箱后完成注册
                </div>
                <label>
                  接收订单的邮箱 <span>新用户必填</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    autoComplete="email"
                  />
                </label>
              </>
            )}
            {authError && (
              <p className="form-error" role="alert">
                {authError}
              </p>
            )}
            {authNotice && <p className="new-user-tip" role="status">{authNotice}</p>}
            <button
              className="primary-wide"
              onClick={signIn}
              disabled={authLoading || phoneRegistered === null}
            >
              {authLoading
                ? "正在验证…"
                : phoneRegistered === null
                  ? "请先获取验证码"
                  : phoneRegistered === false
                    ? "注册并继续"
                    : "验证并登录"}{" "}
              <span>→</span>
            </button>
            <small className="agreement">
              继续即表示同意《用户协议》和《隐私政策》
            </small>
            <small className="demo-login-note">短信服务异常时将自动使用演示验证码</small>
          </section>
        </div>
      )}
    </main>
  );
}
