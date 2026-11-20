"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- 保持原有跨页原生导航，兼容异常软路由。 */
import { useI18n } from '@/components/language-provider';


import { StorefrontHeader } from './storefront-header';
import Image from "next/image";
import dynamic from 'next/dynamic';
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { technicalAvatarImage, technicalHeroImage } from '../lib/technical-images';
import {
  formatServicePrice,
  serviceDeliveryLabels,
  servicePriceText,
  type ServiceDeliveryMode,
  type TechnicalService,
} from "../lib/technical-services";

const TechnicalSupportChat = dynamic(() => import('./technical-support-chat').then(module => module.TechnicalSupportChat), { ssr: false });

type DetailTab = "content" | "flow" | "delivery" | "notes";
type ProviderDetailTab = "service" | "provider" | "cases" | "credentials";
type CustomerAddress = {
  id: number;
  contact_name: string;
  contact_phone: string;
  province: string;
  city: string;
  district: string;
  detail_address: string;
  is_default: number;
};

const detailTabs: { id: DetailTab; label: string }[] = [
  { id: "content", label: "服务内容" },
  { id: "flow", label: "服务流程" },
  { id: "delivery", label: "交付周期" },
  { id: "notes", label: "服务说明" },
];

const providerDetailTabs: { id: ProviderDetailTab; label: string }[] = [
  { id: "service", label: "服务与购买" },
  { id: "cases", label: "服务案例" },
  { id: "credentials", label: "资质证书" },
];

export function TechnicalServiceDetail({ slug, services: serviceItems, unavailable = false }: { slug: string; services: TechnicalService[]; unavailable?: boolean }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const foundService = serviceItems.find(item => item.slug === slug);
  const [selectedMode, setSelectedMode] = useState<ServiceDeliveryMode | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<DetailTab>("content");
  const [providerDetailTab, setProviderDetailTab] =
    useState<ProviderDetailTab>("service");
  const [technicalChatOpen, setTechnicalChatOpen] = useState(
    () => searchParams.get("consult") === "1",
  );
  const [technicalChatVisited, setTechnicalChatVisited] = useState(false);
  const [technicalChatService, setTechnicalChatService] =
    useState<TechnicalService | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [serviceTime, setServiceTime] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [requirementText, setRequirementText] = useState("");
  const [contactName, setContactName] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  useEffect(() => {
    if (!purchaseOpen) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setAddressesLoading(true);
      return fetch("/api/addresses", { cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response || controller.signal.aborted) return [];
        if (!response.ok) return [];
        return response.json() as Promise<CustomerAddress[]>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        const list = Array.isArray(result) ? result : [];
        setAddresses(list);
        if (!selectedAddressId && list.length) {
          const preferred = list.find((item) => Number(item.is_default) === 1) ?? list[0];
          setSelectedAddressId(preferred.id);
          setContactName(preferred.contact_name || "");
          setServiceAddress([preferred.province, preferred.city, preferred.district, preferred.detail_address].filter(Boolean).join(""));
        }
      })
      .catch(() => { if (!controller.signal.aborted) setAddresses([]); })
      .finally(() => { if (!controller.signal.aborted) setAddressesLoading(false); });
    return () => controller.abort();
  }, [purchaseOpen, selectedAddressId]);

  if (!foundService) {
    return (
      <><StorefrontHeader channel="technical" /><main className="simple-page">
        <div className="not-found">
          <h1>{t(unavailable ? '服务暂不可用，请稍后重试' : '服务不存在')}</h1>
          <a href="/">{t("返回商城")}</a>
        </div>
      </main></>
    );
  }
  const service = foundService;

  const fixedPrice = service.pricingMode === "fixed";
  const currentMode =
    selectedMode && service.deliveryModes.includes(selectedMode)
      ? selectedMode
      : service.deliveryModes[0];
  const selectedModeLabel = serviceDeliveryLabels[currentMode];
  const providerOtherServices = serviceItems.filter((item) => item.providerId === service.providerId && item.slug !== service.slug);
  const relatedServices = providerOtherServices.slice(0, 2);

  function renderPrice() {
    if (!fixedPrice || service.price === undefined) {
      return (
        <div className="technical-price technical-price-negotiable">
          <b>{t(fixedPrice ? "价格待确认" : "价格面议")}</b>
        </div>
      );
    }

    return (
      <div className="technical-price">
        <span>¥</span>
        <b>{t(formatServicePrice(service.price))}</b>
        <em>/ {t(service.unit)}</em>
      </div>
    );
  }

  async function createServiceOrder() {
    if (!service || creatingOrder) return;
    setPurchaseError("");
    if (!serviceTime) {
      setPurchaseError("请选择服务时间");
      return;
    }
    if (currentMode === "onsite" && !serviceAddress.trim()) {
      setPurchaseError("上门服务请选择或填写上门地址");
      return;
    }
    setCreatingOrder(true);
    try {
      const response = await fetch("/api/technical-service-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceSlug: service.slug,
          deliveryMode: currentMode,
          scheduledAt: serviceTime,
          serviceAddress,
          addressId: currentMode === "onsite" ? selectedAddressId : null,
          requirementText,
          contactName,
        }),
      });
      const result = await response.json() as { orderId?: string; message?: string };
      if (!response.ok || !result.orderId) {
        setPurchaseError(result.message || "服务订单创建失败");
        return;
      }
      window.location.assign(`/service-orders/${encodeURIComponent(result.orderId)}`);
    } catch {
      setPurchaseError("服务订单创建失败，请稍后重试");
    } finally {
      setCreatingOrder(false);
    }
  }

  function renderReferencePrice() {
    if (!fixedPrice || service.price === undefined) {
      return <b className="technical-provider-detail-negotiable">{t("价格面议")}</b>;
    }

    return (
      <strong className="technical-provider-detail-price">
        <i>¥</i>
        <b>{t(formatServicePrice(service.price))}</b>
        <em>/ {t(service.unit ?? "次")}</em>
      </strong>
    );
  }

  return (
    <main className="technical-detail-page">
      <StorefrontHeader channel="technical" />

      <div className="technical-detail-shell">
        <nav className="technical-breadcrumb" aria-label={t("面包屑")}>
          <a href="/">{t("商城首页")}</a>
          <span>›</span>
          <a href="/?channel=technical">{t("上门技术服务")}</a>
          <span>›</span>
          <b>{service.title}</b>
        </nav>

        <section className="technical-provider-detail-banner" aria-label={t("技术服务介绍")}>
          <Image
            src={technicalHeroImage}
            unoptimized
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 100vw, 1510px"
          />
          <div>
            <span>TECHNICAL SERVICE</span>
            <h1>{t("专业的技术服务，让复杂的问题变简单")}</h1>
            <p>{t("在线服务 · 上门服务 · 专业交付支持")}</p>
          </div>
        </section>

        <section className="technical-provider-detail-layout" aria-label={t("技术人员与服务详情")}>
          <aside className="technical-provider-profile-card">
            <div className="technical-provider-portrait-wrap">
              <Image
                src={technicalAvatarImage(service.avatar, 'portrait')}
                unoptimized
                priority
                alt={t(`${service.provider}技术人员头像`)}
                fill
                sizes="(max-width: 960px) 280px, 320px"
              />
              <span>{t("在线接单")}</span>
            </div>

            <header>
              <div>
                <h2>{t(service.provider)}</h2>
                <b>{t("已认证")}</b>
              </div>
              <p>
                {service.city} · {t(service.experience)}
              </p>
              <small>{t(service.providerRole)}</small>
            </header>

            <p className="technical-provider-profile-intro">
              {t(service.providerIntro)}
            </p>

            <div className="technical-provider-skill-tags" aria-label={t("技术能力")}>
              {service.skills.map((skill) => (
                <span key={skill}>{t(skill)}</span>
              ))}
            </div>

            <section className="technical-provider-sla-list" aria-label={t("服务时效")}>
              {service.deliveryModes.includes("online") && service.onlineResponse && (
                <article>
                  <span>{t("在线沟通最快")}</span>
                  <b>{t(service.onlineResponse)}</b>
                </article>
              )}
              {service.deliveryModes.includes("onsite") && service.onsiteArrival && (
                <article>
                  <span>{t("上门服务")}</span>
                  <b>{t(service.onsiteArrival)}</b>
                </article>
              )}
            </section>

            <dl className="technical-provider-profile-facts">
              <div>
                <dt>{t("所在城市")}</dt>
                <dd>{service.city}</dd>
              </div>
              <div>
                <dt>{t("服务方式")}</dt>
                <dd>
                  {t(service.deliveryModes
                    .map((mode) => serviceDeliveryLabels[mode])
                    .join(" / "))}
                </dd>
              </div>
              {service.coverage && (
                <div>
                  <dt>{t("服务区域")}</dt>
                  <dd>{service.coverage}</dd>
                </div>
              )}
              <div>
                <dt>{t("服务安排")}</dt>
                <dd>
                  {t(currentMode === "onsite"
                    ? "购买前选择服务时间和上门地址"
                    : "确认订单前选择服务时间")}
                </dd>
              </div>
            </dl>
          </aside>

          <section className="technical-provider-detail-main">
            <nav className="technical-provider-detail-tabs" aria-label={t("服务详情标签")}>
              {providerDetailTabs.map((tab) => (
                <button
                  type="button"
                  className={providerDetailTab === tab.id ? "active" : ""}
                  key={tab.id}
                  onClick={() => setProviderDetailTab(tab.id)}
                >
                  {t(tab.label)}
                </button>
              ))}
            </nav>

            {providerDetailTab === "service" && (
              <div className="technical-provider-tab-panel technical-current-service-panel">
                <section className="technical-purchase-overview">
                <section className="technical-service-standard-flow" aria-label={t("服务流程")}>
                  <header>
                    <span>SERVICE FLOW</span>
                    <h2>{t("服务流程")}</h2>
                    <p>{t("所有技术服务按统一流程推进，服务方式与价格会在关键节点确认。")}</p>
                  </header>
                  <ol>
                    <li>
                      <b>{t("确认服务方式")}</b>
                      <span>{t("选择在线服务或上门服务")}</span>
                    </li>
                    <li>
                      <b>
                        {t(currentMode === "onsite"
                          ? "选择上门时间和地址"
                          : "选择在线服务时间")}
                      </b>
                      <span>
                        {t(currentMode === "onsite"
                          ? "确认可服务的到场时间和上门地址"
                          : "确认在线服务时间")}
                      </span>
                    </li>
                    <li>
                      <b>{t("确认订单并支付")}</b>
                      <span>
                        {t(fixedPrice
                          ? "确认服务内容后完成支付"
                          : "确认服务价格后完成支付")}
                      </span>
                    </li>
                    <li>
                      <b>
                        {t(currentMode === "onsite" ? "等待到场" : "等待技术响应")}
                      </b>
                      <span>
                        {t(currentMode === "onsite"
                          ? `最快${service.onsiteArrival ?? "20分钟到场"}`
                          : `最快${service.onlineResponse ?? "1–5 分钟响应"}`)}
                      </span>
                    </li>
                  </ol>
                </section>

                <header className="technical-current-service-heading">
                  <div>
                    <span>{t("服务购买")}</span>
                    <h2>{service.title}</h2>
                    <p>{service.summary}</p>
                  </div>
                  {t(renderReferencePrice())}
                </header>

                <section className="technical-current-service-purchase">
                  <div>
                    <span>{t("服务方式")}</span>
                    <div className="technical-current-service-modes">
                      {service.deliveryModes.map((mode) => (
                        <button
                          type="button"
                          className={currentMode === mode ? "active" : ""}
                          key={mode}
                          onClick={() => setSelectedMode(mode)}
                        >
                          {t(serviceDeliveryLabels[mode])}
                        </button>
                      ))}
                    </div>
                    <small>
                      {t(currentMode === "online"
                        ? "确认在线服务时间后，再确认订单并支付"
                        : "确认上门时间和地址后，再提交订单并支付")}
                    </small>
                  </div>
                  <div className="technical-current-service-actions">
                    <button
                      type="button"
                      className="technical-current-service-consult"
                      onClick={() => {
                        setTechnicalChatService(service);
                        setTechnicalChatOpen(true);
                      }}
                    >
                      {t("在线免费技术支持")}</button>
                    <button
                      type="button"
                      className="technical-current-service-buy"
                      onClick={() => setPurchaseOpen(true)}
                    >
                      {t("购买服务")}</button>
                  </div>
                </section>

                {service.deliveryModes.includes("onsite") && (
                  <p className="technical-current-service-appointment-note">
                    {t("上门服务请先选择上门时间和地址，再确认订单并完成支付；支付成功后服务者将按约到场。")}</p>
                )}
                </section>

              </div>
            )}

            {providerDetailTab === "provider" && (
              <div className="technical-provider-tab-panel technical-provider-about-panel">
                <section>
                  <span>ABOUT THE PROVIDER</span>
                  <h2>{t("个人介绍")}</h2>
                  <p>{t(service.providerIntro)}</p>
                  <blockquote>
                    {t("以清晰的服务范围、及时的沟通和可验收的交付，让技术服务真正解决问题。")}<cite>— {t(service.provider)}</cite>
                  </blockquote>
                </section>
                <section>
                  <h2>{t("服务流程")}</h2>
                  <ol className="technical-provider-flow">
                    <li>{t("确认服务方式")}</li>
                    <li>
                      {t(currentMode === "onsite"
                        ? "选择上门时间和地址"
                        : "选择在线服务时间")}
                    </li>
                    <li>{t("确认订单并支付")}</li>
                    <li>
                      {t(currentMode === "onsite"
                        ? `等待到场（最快${service.onsiteArrival ?? "20分钟到场"}）`
                        : `等待技术响应（最快${service.onlineResponse ?? "1–5 分钟响应"}）`)}
                    </li>
                  </ol>
                </section>
              </div>
            )}

            {providerDetailTab === "cases" && (
              <div className="technical-provider-tab-panel technical-provider-cases-panel">
                <header>
                  <span>SERVICE CASES</span>
                  <h2>{t("服务案例")}</h2>
                  <p>{t("服务者发布并经平台审核后的实际案例会在这里展示。")}</p>
                </header>
                <div>
                  {service.serviceIncludes.slice(0, 3).map((item, index) => (
                    <article key={item.title}>
                      <span>{t("能力方向 0")}{t(index + 1)}</span>
                      <b>{item.title}</b>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {providerDetailTab === "credentials" && (
              <div className="technical-provider-tab-panel technical-provider-credentials-panel">
                <header>
                  <span>VERIFICATION</span>
                  <h2>{t("资质证书")}</h2>
                  <p>{t("认证资料、能力证明和服务评价会由平台审核后统一展示。")}</p>
                </header>
                <div>
                  <article>
                    <b>{t("身份与服务者认证")}</b>
                    <span>{t("已认证技术服务者")}</span>
                  </article>
                  <article>
                    <b>{t("技术能力资料")}</b>
                    <span>{t("由服务者后台补充并提交审核")}</span>
                  </article>
                  <article>
                    <b>{t("服务评价与记录")}</b>
                    <span>{t("完成订单后按规则公开展示")}</span>
                  </article>
                </div>
              </div>
            )}

            <section className="technical-other-services-panel">
              <section className="technical-service-projects">
                <header>
                  <div>
                    <span>SERVICE ITEMS</span>
                    <h2>{t(service.provider)}{t("的其他技术服务")}</h2>
                  </div>
                  <p>{t("由 ")}{t(service.provider)}{t(" 提供；说明、价格与操作入口均与服务列表保持一致。")}</p>
                </header>
                <div className="technical-market-service-list">
                  {providerOtherServices.length ? (
                    providerOtherServices.map((project) => (
                      <article className="technical-market-service-row" key={project.slug}>
                        <Image
                          src={technicalAvatarImage(project.avatar)}
                          unoptimized
                          alt={t(`${project.provider}技术人员头像`)}
                          width={50}
                          height={50}
                        />
                        <div>
                          <b>{project.title}</b>
                          <p>{project.summary}</p>
                          <small>{t(project.providerRole)}</small>
                        </div>
                        <span className="technical-market-service-modes">
                          {project.deliveryModes.map((mode) => (
                            <i key={mode}>{t(serviceDeliveryLabels[mode])}</i>
                          ))}
                        </span>
                        <strong>{t(servicePriceText(project))}</strong>
                        <div className="technical-market-service-actions">
                          {project.deliveryModes.includes("online") && (
                            <button
                              type="button"
                              onClick={() => {
                                setTechnicalChatService(project);
                                setTechnicalChatOpen(true);
                              }}
                            >
                              {t("免费技术支持")}</button>
                          )}
                          <a
                            className="primary"
                            href={`/service/${project.slug}`}
                          >
                            {t(project.pricingMode === "fixed"
                              ? "购买服务"
                              : "购买服务")}
                          </a>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="technical-other-services-empty">
                      {t("该技术服务者暂未发布其他可购服务。")}</p>
                  )}
                </div>
              </section>
            </section>
          </section>
        </section>

        <section className="technical-detail-layout technical-detail-layout-legacy">
          <div className="technical-detail-primary">
            <article className="technical-service-summary">
              <div className="technical-summary-copy">
                <div className="technical-service-label">
                  <span>TECHNICAL SERVICE</span>
                  <b>{t("上门技术服务")}</b>
                  <small>{t("专业技术人才 · 快速响应 · 高质量交付")}</small>
                </div>
                <div className="technical-provider-inline">
                  <span className="technical-avatar" aria-hidden="true">
                    {t(service.initials)}
                  </span>
                  <span>
                    <b>{t(service.provider)}</b>
                    <em>{t("已认证 · 在线接单")}</em>
                  </span>
                </div>
                <h1>{service.title}</h1>
                <p>{service.summary}</p>
                <div
                  className="technical-detail-modes"
                  aria-label={t("选择服务方式")}
                >
                  {service.deliveryModes.map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      className={currentMode === mode ? "active" : ""}
                      onClick={() => setSelectedMode(mode)}
                    >
                      {t(serviceDeliveryLabels[mode])}
                    </button>
                  ))}
                  {service.coverage && service.deliveryModes.includes("onsite") && (
                    <span>{service.coverage}</span>
                  )}
                </div>
                {service.deliveryModes.includes("onsite") && (
                  <p className="technical-post-order-note">
                    {t("购买上门服务时请确认服务时间和上门地址。")}</p>
                )}
              </div>
              <div className="technical-service-illustration" aria-hidden="true">
                <Image
                  src={technicalHeroImage}
                  unoptimized
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 42vw"
                  loading="lazy"
                />
              </div>
              <div className="technical-response-highlights">
                {service.onlineResponse && service.deliveryModes.includes("online") && (
                  <span>
                    <b>{t("远程咨询最快")}</b>
                    <strong>{t(service.onlineResponse)}</strong>
                  </span>
                )}
                {service.onsiteArrival && service.deliveryModes.includes("onsite") && (
                  <span>
                    <b>{t("上门服务最快")}</b>
                    <strong>{t(service.onsiteArrival)}</strong>
                  </span>
                )}
              </div>
            </article>

            <section className="technical-detail-tabs" aria-label={t("服务详情")}>
              <nav>
                {detailTabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={activeTab === tab.id ? "active" : ""}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {t(tab.label)}
                  </button>
                ))}
              </nav>

              {activeTab === "content" && (
                <div className="technical-tab-panel">
                  <h2>{t("本服务包含")}</h2>
                  <p>
                    {t("围绕“")}{service.title}{t("”提供完整技术支持，服务范围会在开始前与您确认。")}</p>
                  <div className="technical-feature-grid">
                    {service.serviceIncludes.map((item) => (
                      <article key={item.title}>
                        <b>{item.title}</b>
                        <span>{item.detail}</span>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "flow" && (
                <div className="technical-tab-panel">
                  <h2>{t("服务流程")}</h2>
                  <ol className="technical-flow">
                    <li>
                      {t(currentMode === "onsite"
                        ? "确认服务方式"
                        : "确认在线服务方式")}
                    </li>
                    <li>
                      {t(currentMode === "onsite"
                        ? "选择上门时间和地址"
                        : "选择在线服务时间")}
                    </li>
                    <li>{t("确认订单并支付")}</li>
                    <li>
                      {t(currentMode === "onsite"
                        ? `等待到场（最快${service.onsiteArrival ?? "20分钟到场"}）`
                        : `等待技术响应（最快${service.onlineResponse ?? "1–5 分钟响应"}）`)}
                    </li>
                  </ol>
                </div>
              )}

              {activeTab === "delivery" && (
                <div className="technical-tab-panel">
                  <h2>{t("交付周期")}</h2>
                  <div className="technical-delivery-list">
                    {service.deliveryNotes.map((note, index) => (
                      <span key={note}>
                        <b>0{t(index + 1)}</b>
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="technical-tab-panel">
                  <h2>{t("服务说明")}</h2>
                  <p>
                    {t("固定价格服务可直接购买；价格面议服务提交购买需求后，由技术人员确认服务范围与最终价格。")}{t(currentMode === "onsite"
                      ? " 上门服务下单时选择服务时间和上门地址，再按订单状态完成支付。"
                      : " 在线服务下单时选择服务时间，再按订单状态完成支付。")}
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="technical-detail-sidebar">
            <section className="technical-buy-panel">
              <span className="technical-buy-kicker">{t("服务价格")}</span>
              {t(renderPrice())}
              <p>
                {t(fixedPrice
                  ? "价格透明，无隐藏费用"
                  : "先沟通需求，再确认服务价格")}
              </p>
              <button type="button" onClick={() => setPurchaseOpen(true)}>
                {t("购买服务")}</button>
              {service.deliveryModes.includes("online") && (
                <button
                  type="button"
                  className="technical-outline technical-consult-cta"
                  onClick={() => {
                    setTechnicalChatService(service);
                    setTechnicalChatOpen(true);
                  }}
                >
                  <span>{t("在线沟通")}</span>
                  <small>
                    {t(service.onlineResponse
                      ? `最快 ${service.onlineResponse}`
                      : "咨询服务细节")}
                  </small>
                </button>
              )}
              <small>
                {t(currentMode === "onsite"
                  ? `当前选择：${selectedModeLabel}（选择服务时间与上门地址）`
                  : `当前选择：${selectedModeLabel}`)}
              </small>
            </section>

            <section className="technical-provider-panel">
              <header>
                <b>{t("服务技术人员")}</b>
                <a href="/?channel=technical">{t("查看技术人才主页 ›")}</a>
              </header>
              <div className="technical-provider-profile">
                <span className="technical-avatar large" aria-hidden="true">
                  {t(service.initials)}
                </span>
                <div>
                  <h2>{t(service.provider)}</h2>
                  <b>{t("已认证 · 在线接单")}</b>
                  <p>{service.city} · {t(service.experience)}</p>
                  <small>{t(service.providerRole)}</small>
                </div>
              </div>
              <p className="technical-provider-intro">{t(service.providerIntro)}</p>
            </section>

            <section className="technical-provider-more">
              <header>
                <b>{t(service.provider)}{t("的其他服务")}</b>
                <a href="/?channel=technical">{t("查看全部服务 ›")}</a>
              </header>
              {relatedServices.map((item) => (
                <a href={`/service/${item.slug}`} key={item.slug}>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.summary}</small>
                  </span>
                  <em>{t(servicePriceText(item))}</em>
                </a>
              ))}
            </section>
          </aside>
        </section>
      </div>

      {(technicalChatOpen || technicalChatVisited) && <TechnicalSupportChat
        activeService={technicalChatService ?? service}
        open={technicalChatOpen}
        services={serviceItems}
        onClose={() => { setTechnicalChatVisited(true); setTechnicalChatOpen(false); }}
      />}

      {purchaseOpen && (
        <div className="technical-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPurchaseOpen(false)}>
          <section className="technical-appointment-modal technical-order-modal" role="dialog" aria-modal="true" aria-label={t("服务订单")}>
            <button className="modal-close" aria-label={t("关闭")} onClick={() => setPurchaseOpen(false)}>×</button>
            <span>✓</span>
            <h2>{t("购买服务")}</h2>
            <p>{t(`当前选择：${selectedModeLabel}。确认服务时间${currentMode === "onsite" ? "、上门地址" : ""}和需求后提交订单。`)}{t(!fixedPrice ? " 本服务为面议价格，提交后由技术人员确认最终金额。" : "")}</p>
            <div className="technical-order-form">
              <label><span>{t(currentMode === "onsite" ? "期望到场时间" : "期望在线服务时间")}</span><input type="datetime-local" value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} /></label>
              {currentMode === "onsite" && (
                <div className="technical-order-address-field">
                  <div className="technical-order-address-title">
                    <span>{t("上门地址")}</span>
                    <a href="/addresses" target="_blank" rel="noreferrer">{t("管理我的地址")}</a>
                  </div>
                  {addressesLoading ? (
                    <div className="technical-order-address-empty">{t("正在读取常用地址…")}</div>
                  ) : addresses.length ? (
                    <div className="technical-order-address-options">
                      {addresses.map((address) => {
                        const fullAddress = [address.province, address.city, address.district, address.detail_address].filter(Boolean).join("");
                        return (
                          <button
                            type="button"
                            className={selectedAddressId === address.id ? "active" : ""}
                            key={address.id}
                            onClick={() => {
                              setSelectedAddressId(address.id);
                              setContactName(address.contact_name || "");
                              setServiceAddress(fullAddress);
                            }}
                          >
                            <b>{address.contact_name} · {t(address.contact_phone)}</b>
                            <span>{t(fullAddress)}</span>
                            {Number(address.is_default) === 1 && <em>{t("默认")}</em>}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={selectedAddressId === null ? "active manual" : "manual"}
                        onClick={() => {
                          setSelectedAddressId(null);
                          setServiceAddress("");
                        }}
                      >
                        <b>{t("临时上门地址")}</b>
                        <span>{t("本次订单使用，不保存到地址簿")}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="technical-order-address-empty">
                      {t("暂无常用地址，可直接填写本次上门地址，或前往“我的地址”保存。")}</div>
                  )}
                  {(!addresses.length || selectedAddressId === null) && (
                    <input value={serviceAddress} onChange={(event) => setServiceAddress(event.target.value)} placeholder={t("请输入完整上门地址（省市区 + 街道门牌）")} />
                  )}
                </div>
              )}
              <label><span>{t("联系人")}</span><input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder={t("选填，方便技术人员联系")} /></label>
              <label><span>{t("需求说明")}</span><textarea value={requirementText} onChange={(event) => setRequirementText(event.target.value)} placeholder={t("请描述问题、当前环境、希望解决的目标等")} /></label>
              {fixedPrice && <div className="technical-order-price-confirm"><span>{t("服务金额")}</span>{t(renderReferencePrice())}</div>}
              {purchaseError && <small className="form-error">{t(purchaseError)}</small>}
            </div>
            <div className="technical-order-modal-actions">
              <button type="button" className="technical-order-consult" onClick={() => { setPurchaseOpen(false); setTechnicalChatService(service); setTechnicalChatOpen(true); }}>{t("先在线沟通")}</button>
              <button type="button" disabled={creatingOrder} onClick={() => void createServiceOrder()}>{t(creatingOrder ? "正在提交…" : "确认购买服务")}</button>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}
