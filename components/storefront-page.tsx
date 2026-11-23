"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- 保留原生跨页导航，兼容异常软路由。 */
import { useI18n } from '@/components/language-provider';


import Image from "next/image";
import dynamic from 'next/dynamic';
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { technicalAvatarImage } from '../lib/technical-images';
import { ToolDirectory } from "../components/tool-directory";
import { ArrowUpRightIcon, CommandLineIcon, WrenchScrewdriverIcon, MagnifyingGlassIcon, ShieldCheckIcon, EnvelopeIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { StorefrontHeader } from "../components/storefront-header";
import { accountReturnPath } from "../lib/account";
import { notifyAccountChanged } from "../lib/account-client";
import { StoreProductCard } from "../components/store-product-card";
import { HomepageCatalog } from "../components/homepage-catalog";
import { CatalogPagination } from "../components/catalog-pagination";
import { defaultHomepageDisplay, readHomepageDisplay, orderItems, paginate } from "../lib/homepage-display";
import type { ToolService } from "../lib/tool-services";
import {
  catalog,
  type CatalogProduct,
} from "../lib/catalog";
import { categoryTree, matchesProductCategory, type CategoryNode } from "../lib/categories";
import {
  formatServicePrice,
  serviceDeliveryLabels,
  servicePriceText,
  technicalServices,
  type TechnicalService,
} from "../lib/technical-services";

const TechnicalSupportChat = dynamic(() => import('../components/technical-support-chat').then(module => module.TechnicalSupportChat), { ssr: false });
const TechnicalProviderApplication = dynamic(() => import('../components/technical-provider-application').then(module => module.TechnicalProviderApplication), { ssr: false });

type CategoryGroup = CategoryNode & { id?: number };
const pageSize = 12;

export default function StorePage({ initialTools = null, initialToolsError = '', initialConfig = null, initialChannel = 'mall' }: {
  initialTools?: ToolService[] | null; initialToolsError?: string; initialConfig?: ReturnType<typeof defaultHomepageDisplay> | null; initialChannel?: 'mall' | 'technical';
} = {}) {
  const { t } = useI18n();
  const [category, setCategory] = useState("全部商品");
  const [subcategory, setSubcategory] = useState("全部");
  const [thirdCategory, setThirdCategory] = useState("全部");
  const [categoryGroups, setCategoryGroups] =
    useState<CategoryGroup[]>(categoryTree);
  const [products, setProducts] = useState<CatalogProduct[]>(catalog);
  const [tools, setTools] = useState<ToolService[]>(initialTools || []);
  const [toolsLoaded, setToolsLoaded] = useState(Boolean(initialTools || initialToolsError));
  const [toolsLoading, setToolsLoading] = useState(!initialTools && !initialToolsError);
  const [toolsError, setToolsError] = useState(initialToolsError);
  const [productsError, setProductsError] = useState('');
  const [homepageDisplay, setHomepageDisplay] = useState(initialConfig || defaultHomepageDisplay);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [authOpen, setAuthOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTechnician, setIsTechnician] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<number | null>(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [phoneRegistered, setPhoneRegistered] = useState<boolean | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [providerApplicationOpen, setProviderApplicationOpen] = useState(false);
  const [providerApplicationVisited, setProviderApplicationVisited] = useState(false);
  const [channel, setChannel] = useState<"mall" | "technical">(initialChannel);
  const [channelInitialized, setChannelInitialized] = useState(false);
  const [technicalChatOpen, setTechnicalChatOpen] = useState(false);
  const [technicalChatVisited, setTechnicalChatVisited] = useState(false);
  const [technicalChatService, setTechnicalChatService] =
    useState<TechnicalService | null>(null);
  const [technicalServiceItems, setTechnicalServiceItems] =
    useState<TechnicalService[]>(technicalServices);
  const [showAllTechnical, setShowAllTechnical] = useState(false);
  const [technicalPage, setTechnicalPage] = useState(1);
  const homepageTechnicalServices = useMemo(
    () => technicalServiceItems.filter((service) => showAllTechnical || service.homepageFeatured),
    [technicalServiceItems, showAllTechnical],
  );
  const technicalResult = paginate(homepageTechnicalServices, technicalPage, 12);
  const homepageTechnicalProviderCount = new Set(
    homepageTechnicalServices.map((service) => service.providerId),
  ).size;

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      let savedPhone: string | null = null;
      try { savedPhone = window.localStorage.getItem("mall_phone"); } catch { /* 存储不可用时仍继续频道与目录初始化。 */ }
      if (savedPhone) setPhone(savedPhone);
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("channel") === "technical") setChannel("technical");
      if (searchParams.get("allServices") === "1") setShowAllTechnical(true);
      setChannelInitialized(true);
      if (accountReturnPath(searchParams.get("returnTo"))) setAuthOpen(true);
      const requested = Number(searchParams.get("product"));
      if (requested) { setPendingProduct(requested); setAuthOpen(true); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (channel === 'technical' && window.location.hash === '#talent-entry') {
      document.getElementById('talent-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [channel]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const session = await response.json() as { authenticated?: boolean; phone?: string; isAdmin?: boolean; isTechnician?: boolean };
      if (!active) return;
      setIsAdmin(session.authenticated === true && session.isAdmin === true);
      setIsTechnician(session.authenticated === true && session.isTechnician === true);
      setLoggedIn(session.authenticated === true);
      if (session.authenticated && session.phone) setPhone(session.phone);
    }).catch(() => { if (active) { setIsAdmin(false); setIsTechnician(false); } });
    return () => {
      active = false;
    };
  }, [loggedIn]);

  useEffect(() => {
    if (initialConfig) return;
    fetch('/api/homepage-display', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (result) setHomepageDisplay(readHomepageDisplay(result)); })
      .catch(() => null);
  }, [initialConfig]);

  useEffect(() => {
    if (!channelInitialized || channel !== 'mall' || toolsLoaded) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    void fetch('/api/tools', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('工具服务暂不可用，请稍后重试');
        const result: unknown = await response.json();
        if (!Array.isArray(result)) throw new Error('工具服务暂不可用，请稍后重试');
        if (active) setTools(result as ToolService[]);
      })
      .catch(() => { if (active) setToolsError(controller.signal.aborted ? '工具列表读取超时，请重试' : '工具服务暂不可用，请稍后重试'); })
      .finally(() => { clearTimeout(timer); if (active) { setToolsLoading(false); setToolsLoaded(true); } });
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [channelInitialized, channel, toolsLoaded]);

  function retryTools() { setToolsError(''); setToolsLoading(true); setToolsLoaded(false); }

  useEffect(() => {
    if (!channelInitialized || channel !== 'mall') return;
    fetch("/api/products", { cache: "no-store" })
      .then(async response => { const result = await response.json().catch(() => null) as unknown; if (!response.ok) throw new Error((result as { message?: string })?.message || '商品列表暂不可用'); if (!Array.isArray(result)) throw new Error('商品列表暂不可用'); return result; })
      .then((result: unknown) => {
        if (Array.isArray(result)) { setProducts(result as CatalogProduct[]); setProductsError(''); }
      })
      .catch(error => { setProducts([]); setProductsError((error as Error).message || '商品列表读取失败，请稍后刷新'); });
    fetch("/api/categories")
      .then((response) => (response.ok ? response.json() : []))
      .then((result: unknown) => {
        const groups = result as CategoryGroup[];
        if (!Array.isArray(groups) || !groups.length) return;
        setCategoryGroups(groups);
      })
      .catch(() => null);
  }, [channelInitialized, channel]);

  useEffect(() => {
    if (!channelInitialized || channel !== 'technical') return;
    fetch("/api/technical-services", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((result: unknown) => {
        if (Array.isArray(result)) setTechnicalServiceItems(result as TechnicalService[]);
      })
      .catch(() => null);
  }, [channelInitialized, channel]);

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

  const selectedPrimary = categoryGroups.find((item) => item.name === category);
  const isToolsCategory = category === '工具服务';
  const visibleTools = orderItems(tools, homepageDisplay.itemOrder).filter(tool => `${tool.name} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedSecondary = selectedPrimary?.children.find(
    (item) => item.name === subcategory,
  );
  const secondaryCategoryNames = selectedPrimary?.children.map((item) => item.name) || [];

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orderItems(products, homepageDisplay.itemOrder).filter((product) => {
      return (
        matchesProductCategory(product, categoryGroups, category, subcategory, thirdCategory) &&
        `${product.name}${product.desc}`.toLowerCase().includes(keyword)
      );
    });
  }, [
    products,
    category,
    subcategory,
    thirdCategory,
    query,
    categoryGroups,
    homepageDisplay.itemOrder,
  ]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const showGroupedCatalog =
    category === "全部商品" &&
    subcategory === "全部" &&
    thirdCategory === "全部";
  const showCatalogEmpty = !isToolsCategory && visible.length === 0 &&
    (!showGroupedCatalog || (!toolsLoading && !toolsError && visibleTools.length === 0));
  const categories = ["全部商品", ...categoryGroups.map((item) => item.name)];
  const availableSubcategories =
    category === "全部商品"
      ? ["全部"]
      : ["全部", ...secondaryCategoryNames];
  const availableThirdCategories =
    subcategory === "全部"
      ? ["全部"]
      : ["全部", ...(selectedSecondary?.children.map((item) => item.name) || [])];
  const moreProductsParams = new URLSearchParams({ category });
  if (subcategory !== '全部') moreProductsParams.set('secondary', subcategory);
  if (thirdCategory !== '全部') moreProductsParams.set('third', thirdCategory);
  if (query.trim()) moreProductsParams.set('q', query.trim());

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
    return <StoreProductCard key={product.id} product={product} onOrder={order} />;
  }

  function renderTechnicalServiceCard(service: TechnicalService) {
    const supportsOnline = service.deliveryModes.includes("online");
    const supportsOnsite = service.deliveryModes.includes("onsite");
    return (
      <article className="technical-reference-card" key={service.slug}>
        <a
          className="technical-card-hitarea"
          href={`/service/${service.slug}`}
          aria-label={t(`查看${service.title}服务详情`)}
        />

        <header className="technical-reference-card-header">
          <Image
            className="technical-reference-card-avatar"
            src={technicalAvatarImage(service.avatar)}
            unoptimized
            alt={t(`${service.provider}技术人员头像`)}
            width={108}
            height={108}
            sizes="108px"
          />
          <div className="technical-reference-card-provider">
            <div>
              <b>{t(service.provider)}</b>
              <span>{t("已认证")}</span>
            </div>
            <p>
              {service.city} · {t(service.experience)}
            </p>
            <small>{t(service.providerRole)}</small>
          </div>
          <em>{t(service.onlineStatus === "offline" ? "暂停服务" : "可服务")}</em>
        </header>

        <section className="technical-reference-card-service">
          <h3>{service.title}</h3>
          <p>{service.summary}</p>
          <div className="technical-reference-card-skills" aria-label={t("技术能力")}>
            {service.skills.slice(0, 4).map((skill) => (
              <span key={skill}>{t(skill)}</span>
            ))}
          </div>
        </section>

        <section className="technical-reference-card-service-info" aria-label={t("服务方式与价格")}>
          <div className="technical-reference-card-delivery">
            {service.deliveryModes.map((mode) => (
              <span key={mode}>{t(serviceDeliveryLabels[mode])}</span>
            ))}
            {supportsOnsite && (
              <small>
                {service.coverage || t("支持上门服务")}{t(" · 购买时选择服务时间和上门地址")}</small>
            )}
          </div>
          <div className="technical-reference-card-price" aria-label={t("服务价格")}>
            {service.pricingMode === "fixed" && service.price !== undefined ? (
              <span
                className="technical-card-price"
                aria-label={t(servicePriceText(service))}
              >
                <i>¥</i>
                <b>{t(formatServicePrice(service.price))}</b>
                <em>/ {t(service.unit ?? "次")}</em>
              </span>
            ) : (
              <strong className="negotiable">
                {t(service.pricingMode === "negotiable" ? "价格面议" : "价格待确认")}
              </strong>
            )}
            {service.pricingMode === "negotiable" && (
              <small>{t("根据实际需求确认服务价格")}</small>
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
                <b>{t("在线免费技术支持")}</b>
                <small>{t("先沟通需求，再确认服务安排")}</small>
              </span>
              <em>{t(service.onlineResponse ? `最快 ${service.onlineResponse}` : "立即沟通")}</em>
            </button>
          )}
          <div className="technical-reference-card-secondary-actions">
            <a href={`/service/${service.slug}`}>{t("查看服务")}</a>
            <a
              className="primary"
              href={`/service/${service.slug}`}
            >
              {t("购买服务")}</a>
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
    notifyAccountChanged();
    const returnTo = accountReturnPath(new URLSearchParams(window.location.search).get("returnTo"));
    if (returnTo) { window.location.assign(returnTo); return; }
    if (pendingProduct) { const params = new URLSearchParams(window.location.search); const selected = new URLSearchParams(); for (const key of ["cycle", "plan"]) { const value = params.get(key); if (value) selected.set(key, value); } window.location.href = `/product/${pendingProduct}${selected.size ? `?${selected}` : ""}`; }
  }

  function signOut() {
    setLoggedIn(false);
    setIsAdmin(false);
    setIsTechnician(false);
    setPhone("");
    setEmail("");
    setCode("");
    setPhoneRegistered(null);
  }

  return (
    <main className="store-shell refined-store glass-home">
      <StorefrontHeader channel={channel} onNavigate={switchChannel} isAdmin={isAdmin} isTechnician={isTechnician} onSignIn={() => setAuthOpen(true)} onSignedOut={signOut} />

      <div className="store-layout refined-layout no-sidebar-layout">
        <section className="content refined-content">
          <div className="portal-welcome"><div><span>YUXING · DIGITAL WORKSPACE</span><h1>{t('连接 AI，开启更多可能')}</h1></div><p>{t('实用工具 · 数字服务 · 专业技术支持')}</p></div>
          <section className="channel-switch" aria-label={t("服务频道")}>
            <button
              type="button"
              className={channel === "mall" ? "active" : ""}
              aria-pressed={channel === "mall"}
              onClick={() => switchChannel("mall")}
            >
              <span className="channel-icon"><CommandLineIcon aria-hidden="true" /></span>
              <span>
                <b>{t("AI数字服务")}</b>
                <small>{t("会员、账号、工具与 AI 教程，即买即用")}</small>
              </span>
              <em>{t(channel === "mall" ? "当前频道" : "切换频道")}<ArrowUpRightIcon aria-hidden="true" /></em>
            </button>
            <button
              type="button"
              className={channel === "technical" ? "active" : ""}
              aria-pressed={channel === "technical"}
              onClick={() => switchChannel("technical")}
            >
              <span className="channel-icon"><WrenchScrewdriverIcon aria-hidden="true" /></span>
              <span>
                <b>{t("上门技术服务")}</b>
                <small>{t("在线咨询最快 1–5 分钟，到场最快 20 分钟")}</small>
              </span>
              <em>{t(channel === "technical" ? "当前频道" : "切换频道")}<ArrowUpRightIcon aria-hidden="true" /></em>
            </button>
          </section>

          <div className="channel-content" id="channel-content">
          {channel === "mall" && <>
          {!isToolsCategory && <div className="quick-benefits" id="services">
            <span>
              <b>{t("自动发货")}</b>
              <small>{t("支付核验后自动账号 / 卡密推送至邮箱")}</small>
            </span>
            <span>
              <b>{t("7 × 24 小时客服人工在线")}</b>
              <small>{t("客服真人在线，让你安心购买")}</small>
            </span>
            <span>
              <b>{t("保质保量")}</b>
              <small>{t("官方渠道保质保量，无效退款")}</small>
            </span>
          </div>

          }
          <div className="catalog-filter-area" id="products">
            <div className="catalog-filter-row">
              <nav className="category-tabs" aria-label={t("商品类型")}>
                {categories.map((item) => (
                  <button
                    key={item}
                    aria-pressed={category === item}
                    className={category === item ? "active" : ""}
                    onClick={() => {
                      setCategory(item);
                      setSubcategory("全部");
                      setThirdCategory("全部");
                      setPage(1);
                    }}
                  >
                    {t(item)}
                  </button>
                ))}
              </nav>
              <label className="search catalog-search">
                <span aria-hidden="true"><MagnifyingGlassIcon /></span>
                <input
                  aria-label={t(isToolsCategory ? '搜索工具' : showGroupedCatalog ? '搜索商品或工具' : '搜索商品')}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder={t(isToolsCategory ? '搜索需要的工具' : showGroupedCatalog ? '搜索商品、工具或服务' : '搜索商品、品牌或服务')}
                />
                <button type="button">{t("搜索")}</button>
              </label>
              <div className="product-tools product-tools-row">
                <span>{t(isToolsCategory ? `共 ${visibleTools.length} 个工具` : showGroupedCatalog ? `共 ${visibleTools.length} 个工具 · ${visible.length} 件商品` : `共 ${visible.length} 件`)}</span>
              </div>
            </div>
            {!isToolsCategory && category !== "全部商品" && availableSubcategories.length > 1 && (
              <nav
                className="subcategory-tabs"
                aria-label={t(`${category}二级分类`)}
              >
                {availableSubcategories.map((item) => (
                  <button
                    key={item}
                    aria-pressed={subcategory === item}
                    className={subcategory === item ? "active" : ""}
                    onClick={() => {
                      setSubcategory(item);
                      setThirdCategory("全部");
                      setPage(1);
                    }}
                  >
                    {t(item)}
                  </button>
                ))}
              </nav>
            )}
            {!isToolsCategory && subcategory !== "全部" && availableThirdCategories.length > 1 && (
              <nav
                className="subcategory-tabs third-category-tabs"
                aria-label={t(`${subcategory}三级分类`)}
              >
                {availableThirdCategories.map((item) => (
                  <button
                    key={item}
                    aria-pressed={thirdCategory === item}
                    className={thirdCategory === item ? "active" : ""}
                    onClick={() => {
                      setThirdCategory(item);
                      setPage(1);
                    }}
                  >
                    {t(item)}
                  </button>
                ))}
              </nav>
            )}
          </div>

          {!isToolsCategory && productsError && <p className="catalog-load-error" role="alert">{t(productsError)}{t("。请稍后刷新，或联系客服。")}</p>}
          {isToolsCategory ? <ToolDirectory key={query} tools={visibleTools} loading={toolsLoading} error={toolsError} onRetry={retryTools} /> : showGroupedCatalog ? (
            <HomepageCatalog products={visible} tools={visibleTools} settings={homepageDisplay} loading={toolsLoading} error={toolsError} onToolsRetry={retryTools} query={query} renderProduct={renderProductCard} portal />
          ) : (
            <><div className="catalog-list-heading"><h2>{t(thirdCategory !== '全部' ? thirdCategory : subcategory !== '全部' ? subcategory : category)}</h2><Link className="catalog-more-link" href={`/products?${moreProductsParams}`}>{t("更多商品 →")}</Link></div><div className="product-grid refined-grid homepage-product-grid">{t(pagedProducts.map(renderProductCard))}</div><CatalogPagination page={currentPage} totalPages={totalPages} onChange={setPage} label={t("商品分页")} /></>
          )}
          {showCatalogEmpty && (
            <div className="empty refined-empty">
              <span>⌕</span>
              <h3>{t(showGroupedCatalog ? '没有找到相关商品或工具' : '没有找到相关商品')}</h3>
              <p>{t("试试更短的关键词，或返回查看全部商品。")}</p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("全部商品");
                  setSubcategory("全部");
                  setThirdCategory("全部");
                  setPage(1);
                }}
              >
                {t("查看全部商品")}</button>
            </div>
          )}

          <section className="help-banner">
            <div>
              <span>?</span>
              <div>
                <b>{t(isToolsCategory ? '工具使用遇到问题？' : '购买前还有疑问？')}</b>
                <p>{t(isToolsCategory ? '联系在线客服，了解工具入口与使用方式。' : '查看购买说明，或联系售后确认商品是否适合你。')}</p>
              </div>
            </div>
            <button onClick={() => setServiceOpen(true)}>{t("在线微信客服")}</button>
          </section>
          </>}

          {channel === "technical" && (
            <section className="technical-services-section" aria-labelledby="technical-services-title">
              <header className="technical-services-heading">
                <div>
                  <span className="section-kicker">TECHNICAL SERVICES</span>
                  <h2 id="technical-services-title">{t("上门技术服务")}</h2>
                  <p>{t("认证技术人才 · 固定价格或价格面议 · 在线沟通与到场服务")}</p>
                </div>
                <div><span>{t("共 ")}{t(homepageTechnicalProviderCount)}{t(" 位服务者")}</span><button type="button" className="catalog-more-link" onClick={() => { setShowAllTechnical(!showAllTechnical); setTechnicalPage(1); }}>{t(showAllTechnical ? "返回首页推荐 →" : "更多服务 →")}</button></div>
              </header>
              <div className="technical-services-grid">
                {t(technicalResult.items.map(renderTechnicalServiceCard))}
              </div>
              {!homepageTechnicalServices.length && <p className="tool-directory-empty">{t("暂无可展示的技术服务。")}</p>}
              <CatalogPagination page={technicalResult.page} totalPages={technicalResult.totalPages} onChange={setTechnicalPage} label={t("技术服务分页")} />
              <section className="talent-entry" id="talent-entry">
                <div>
                  <span>TECH TALENT</span>
                  <h3>{t("你是技术服务者？")}</h3>
                  <p>{t("发布擅长服务、服务方式和价格，面向真实需求在线接单。")}</p>
                </div>
                <button type="button" onClick={() => setProviderApplicationOpen(true)}>
                  {t("申请技术人才入驻")}</button>
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
                alt={t("宇星脉通 Logo")}
                fill
                sizes="34px"
              />
            </span>
            <span>{t("宇星脉通")}</span>
          </a>
          <p>{t("简单、透明、可靠的数字商品购买体验。")}</p><div className="portal-footer-assurances"><span><ShieldCheckIcon aria-hidden="true" />{t('品质保障')}</span><span><EnvelopeIcon aria-hidden="true" />{t('订单邮箱交付')}</span><span><ChatBubbleLeftRightIcon aria-hidden="true" />{t('人工售后服务')}</span></div>
        </div>
        <div>
          <b>{t("购买帮助")}</b>
          <a href="#services">{t("发货说明")}</a>
          <a href="#services">{t("售后保障")}</a>
        </div>
        <div>
          <b>{t("商城信息")}</b>
          <a href="/tools">{t("工具服务")}</a>
          {isAdmin && <a href="/admin">{t("管理后台")}</a>}
          <span>{t("© 2026 宇星脉通")}</span>
        </div>
      </footer>

      {(technicalChatOpen || technicalChatVisited) && <TechnicalSupportChat
        activeService={technicalChatService}
        open={technicalChatOpen}
        services={technicalServiceItems}
        onClose={() => { setTechnicalChatVisited(true); setTechnicalChatOpen(false); }}
      />}

      {(providerApplicationOpen || providerApplicationVisited) && <TechnicalProviderApplication
        open={providerApplicationOpen}
        onClose={() => { setProviderApplicationVisited(true); setProviderApplicationOpen(false); }}
      />}

      <div className="service-widget">
        {serviceOpen && (
          <section
            className="service-panel"
            role="dialog"
            aria-label={t("在线微信客服")}
          >
            <button
              className="service-close"
              aria-label={t("关闭在线客服")}
              onClick={() => setServiceOpen(false)}
            >
              ×
            </button>
            <span className="service-panel-kicker">ONLINE SERVICE</span>
            <b>{t("在线微信客服")}</b>
            <p>{t("扫码联系 7 × 24 小时人工客服")}</p>
            <div className="service-qr service-qr-image">
              <Image
                unoptimized
                src="/customer-service-wechat.png"
                alt={t("在线微信客服二维码")}
                width={190}
                height={242}
              />
            </div>
            <small>{t("扫码添加客服后，请说明订单号")}</small>
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
          <b>{t("在线微信客服")}</b>
          <small>{t("微信扫码联系")}</small>
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
              aria-label={t("关闭")}
              onClick={() => setAuthOpen(false)}
            >
              ×
            </button>
            <div className="modal-brand">
              <span className="brand-mark">
                <Image
                  src="/yxstar_logo.png"
                  alt={t("宇星脉通 Logo")}
                  fill
                  sizes="34px"
                />
              </span>
            </div>
            <h2 id="auth-title">{t("手机号登录 / 注册")}</h2>
            <p className="modal-sub">{t("获取验证码后自动识别登录或注册")}</p>
            <label>
              {t("登录手机号")}<div className="phone-field">
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
                  placeholder={t("请输入手机号")}
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </div>
            </label>
            <label>
              {t("短信验证码")}<div className="code-field">
                <input
                  value={code}
                  maxLength={6}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("6 位验证码")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button onClick={sendCode} disabled={Boolean(codeCooldown)}>
                  {t(codeCooldown ? `${codeCooldown}s 后重试` : "获取验证码")}
                </button>
              </div>
            </label>
            {phoneRegistered === true && (
              <div className="new-user-tip">
                <span>✓</span>{t(" 该手机号已注册，验证验证码后即可登录")}</div>
            )}
            {phoneRegistered === false && (
              <>
                <div className="new-user-tip">
                  <span>i</span>{t(" 新手机号，请填写订单接收邮箱后完成注册")}</div>
                <label>
                  {t("接收订单的邮箱 ")}<span>{t("新用户必填")}</span>
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
                {t(authError)}
              </p>
            )}
            {authNotice && <p className="new-user-tip" role="status">{t(authNotice)}</p>}
            <button
              className="primary-wide"
              onClick={signIn}
              disabled={authLoading || phoneRegistered === null}
            >
              {t(authLoading
                ? "正在验证…"
                : phoneRegistered === null
                  ? "请先获取验证码"
                  : phoneRegistered === false
                    ? "注册并继续"
                    : "验证并登录")}{t(" ")}
              <span>→</span>
            </button>
            <small className="agreement">
              {t("继续即表示同意《用户协议》和《隐私政策》")}</small>
            <small className="demo-login-note">{t("短信服务异常时将自动使用演示验证码")}</small>
          </section>
        </div>
      )}
    </main>
  );
}
