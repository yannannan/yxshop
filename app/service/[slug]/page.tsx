"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TechnicalSupportChat } from "../../../components/technical-support-chat";
import {
  formatServicePrice,
  getTechnicalService,
  serviceDeliveryLabels,
  servicePriceText,
  technicalServices,
  type ServiceDeliveryMode,
  type TechnicalService,
} from "../../../lib/technical-services";

type DetailTab = "content" | "flow" | "delivery" | "notes";
type ProviderDetailTab = "service" | "provider" | "cases" | "credentials";

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

export default function TechnicalServiceDetailPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const [serviceItems, setServiceItems] = useState<TechnicalService[]>(technicalServices);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const service = useMemo(
    () => servicesLoaded
      ? serviceItems.find((item) => item.slug === params.slug)
      : getTechnicalService(params.slug),
    [params.slug, serviceItems, servicesLoaded],
  );
  const [selectedMode, setSelectedMode] = useState<ServiceDeliveryMode | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<DetailTab>("content");
  const [providerDetailTab, setProviderDetailTab] =
    useState<ProviderDetailTab>("service");
  const [technicalChatOpen, setTechnicalChatOpen] = useState(
    () => searchParams.get("consult") === "1",
  );
  const [technicalChatService, setTechnicalChatService] =
    useState<TechnicalService | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [serviceTime, setServiceTime] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [requirementText, setRequirementText] = useState("");
  const [contactName, setContactName] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/technical-services", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((result: unknown) => {
        if (!active || !Array.isArray(result)) return;
        setServiceItems(result as TechnicalService[]);
        setServicesLoaded(true);
      })
      .catch(() => null);
    return () => { active = false; };
  }, []);

  if (!service) {
    return (
      <main className="simple-page">
        <div className="not-found">
          <h1>服务不存在</h1>
          <a href="/">返回商城</a>
        </div>
      </main>
    );
  }

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
          <b>{fixedPrice ? "价格待确认" : "价格面议"}</b>
        </div>
      );
    }

    return (
      <div className="technical-price">
        <span>¥</span>
        <b>{formatServicePrice(service.price)}</b>
        <em>/ {service.unit}</em>
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
      setPurchaseError("指定地点服务请填写服务地址");
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
          requirementText,
          contactName,
        }),
      });
      const result = await response.json() as { orderId?: string; message?: string };
      if (!response.ok || !result.orderId) {
        setPurchaseError(result.message || "服务订单创建失败");
        return;
      }
      window.location.href = `/service-orders/${encodeURIComponent(result.orderId)}`;
    } catch {
      setPurchaseError("服务订单创建失败，请稍后重试");
    } finally {
      setCreatingOrder(false);
    }
  }

  function renderReferencePrice() {
    if (!fixedPrice || service.price === undefined) {
      return <b className="technical-provider-detail-negotiable">价格面议</b>;
    }

    return (
      <strong className="technical-provider-detail-price">
        <i>¥</i>
        <b>{formatServicePrice(service.price)}</b>
        <em>/ {service.unit ?? "次"}</em>
      </strong>
    );
  }

  return (
    <main className="technical-detail-page">
      <header className="technical-detail-header">
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
        <nav aria-label="服务导航">
          <a href="/">AI商城服务</a>
          <a className="active" href="/?channel=technical">
            上门技术服务
          </a>
          <a href="/orders">我的订单</a>
        </nav>
        <a href="/">返回商城</a>
      </header>

      <div className="technical-detail-shell">
        <nav className="technical-breadcrumb" aria-label="面包屑">
          <a href="/">商城首页</a>
          <span>›</span>
          <a href="/?channel=technical">上门技术服务</a>
          <span>›</span>
          <b>{service.title}</b>
        </nav>

        <section className="technical-provider-detail-banner" aria-label="技术服务介绍">
          <Image
            src="/technical-services/ai-technical-service-hero-v1.png"
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 100vw, 1510px"
          />
          <div>
            <span>TECHNICAL SERVICE</span>
            <h1>专业的技术服务，让复杂的问题变简单</h1>
            <p>在线沟通 · 指定地点服务 · 专业交付支持</p>
          </div>
        </section>

        <section className="technical-provider-detail-layout" aria-label="技术人员与服务详情">
          <aside className="technical-provider-profile-card">
            <div className="technical-provider-portrait-wrap">
              <Image
                src={service.avatar}
                alt={`${service.provider}技术人员头像`}
                fill
                sizes="(max-width: 960px) 280px, 320px"
              />
              <span>在线接单</span>
            </div>

            <header>
              <div>
                <h2>{service.provider}</h2>
                <b>已认证</b>
              </div>
              <p>
                {service.city} · {service.experience}
              </p>
              <small>{service.providerRole}</small>
            </header>

            <p className="technical-provider-profile-intro">
              {service.providerIntro}
            </p>

            <div className="technical-provider-skill-tags" aria-label="技术能力">
              {service.skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>

            <section className="technical-provider-sla-list" aria-label="服务时效">
              {service.deliveryModes.includes("online") && service.onlineResponse && (
                <article>
                  <span>在线沟通最快</span>
                  <b>{service.onlineResponse}</b>
                </article>
              )}
              {service.deliveryModes.includes("onsite") && service.onsiteArrival && (
                <article>
                  <span>指定地点服务</span>
                  <b>{service.onsiteArrival}</b>
                </article>
              )}
            </section>

            <dl className="technical-provider-profile-facts">
              <div>
                <dt>所在城市</dt>
                <dd>{service.city}</dd>
              </div>
              <div>
                <dt>服务方式</dt>
                <dd>
                  {service.deliveryModes
                    .map((mode) => serviceDeliveryLabels[mode])
                    .join(" / ")}
                </dd>
              </div>
              {service.coverage && (
                <div>
                  <dt>服务区域</dt>
                  <dd>{service.coverage}</dd>
                </div>
              )}
              <div>
                <dt>预约规则</dt>
                <dd>
                  {currentMode === "onsite"
                    ? "确认订单前选择时间和地点"
                    : "确认订单前选择服务时间"}
                </dd>
              </div>
            </dl>
          </aside>

          <section className="technical-provider-detail-main">
            <nav className="technical-provider-detail-tabs" aria-label="服务详情标签">
              {providerDetailTabs.map((tab) => (
                <button
                  type="button"
                  className={providerDetailTab === tab.id ? "active" : ""}
                  key={tab.id}
                  onClick={() => setProviderDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {providerDetailTab === "service" && (
              <div className="technical-provider-tab-panel technical-current-service-panel">
                <section className="technical-purchase-overview">
                <section className="technical-service-standard-flow" aria-label="服务流程">
                  <header>
                    <span>SERVICE FLOW</span>
                    <h2>服务流程</h2>
                    <p>所有技术服务按统一流程推进，服务方式与价格会在关键节点确认。</p>
                  </header>
                  <ol>
                    <li>
                      <b>确认服务方式</b>
                      <span>选择在线沟通或指定地点服务</span>
                    </li>
                    <li>
                      <b>
                        {currentMode === "onsite"
                          ? "选择到场时间和地点"
                          : "选择在线服务时间"}
                      </b>
                      <span>
                        {currentMode === "onsite"
                          ? "确认可服务的到场时间和指定地点"
                          : "确认可在线沟通的服务时间"}
                      </span>
                    </li>
                    <li>
                      <b>确认订单并支付</b>
                      <span>
                        {fixedPrice
                          ? "确认服务内容后完成支付"
                          : "确认服务价格后完成支付"}
                      </span>
                    </li>
                    <li>
                      <b>
                        {currentMode === "onsite" ? "等待到场" : "等待技术响应"}
                      </b>
                      <span>
                        {currentMode === "onsite"
                          ? `最快${service.onsiteArrival ?? "20分钟到场"}`
                          : `最快${service.onlineResponse ?? "1–5 分钟响应"}`}
                      </span>
                    </li>
                  </ol>
                </section>

                <header className="technical-current-service-heading">
                  <div>
                    <span>服务购买</span>
                    <h2>{service.title}</h2>
                    <p>{service.summary}</p>
                  </div>
                  {renderReferencePrice()}
                </header>

                <section className="technical-current-service-purchase">
                  <div>
                    <span>服务方式</span>
                    <div className="technical-current-service-modes">
                      {service.deliveryModes.map((mode) => (
                        <button
                          type="button"
                          className={currentMode === mode ? "active" : ""}
                          key={mode}
                          onClick={() => setSelectedMode(mode)}
                        >
                          {serviceDeliveryLabels[mode]}
                        </button>
                      ))}
                    </div>
                    <small>
                      {currentMode === "online"
                        ? "确认在线服务时间后，再确认订单并支付"
                        : "确认到场时间和地点后，再确认订单并支付"}
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
                      在线免费技术支持
                    </button>
                    <button
                      type="button"
                      className="technical-current-service-buy"
                      onClick={() => setPurchaseOpen(true)}
                    >
                      {fixedPrice ? "立即购买" : "沟通确认价格"}
                    </button>
                  </div>
                </section>

                {service.deliveryModes.includes("onsite") && (
                  <p className="technical-current-service-appointment-note">
                    指定地点服务请先选择到场时间和地点，再确认订单并完成支付；支付成功后服务者将按约到场。
                  </p>
                )}
                </section>

              </div>
            )}

            {providerDetailTab === "provider" && (
              <div className="technical-provider-tab-panel technical-provider-about-panel">
                <section>
                  <span>ABOUT THE PROVIDER</span>
                  <h2>个人介绍</h2>
                  <p>{service.providerIntro}</p>
                  <blockquote>
                    以清晰的服务范围、及时的沟通和可验收的交付，让技术服务真正解决问题。
                    <cite>— {service.provider}</cite>
                  </blockquote>
                </section>
                <section>
                  <h2>服务流程</h2>
                  <ol className="technical-provider-flow">
                    <li>确认服务方式</li>
                    <li>
                      {currentMode === "onsite"
                        ? "选择到场时间和地点"
                        : "选择在线服务时间"}
                    </li>
                    <li>确认订单并支付</li>
                    <li>
                      {currentMode === "onsite"
                        ? `等待到场（最快${service.onsiteArrival ?? "20分钟到场"}）`
                        : `等待技术响应（最快${service.onlineResponse ?? "1–5 分钟响应"}）`}
                    </li>
                  </ol>
                </section>
              </div>
            )}

            {providerDetailTab === "cases" && (
              <div className="technical-provider-tab-panel technical-provider-cases-panel">
                <header>
                  <span>SERVICE CASES</span>
                  <h2>服务案例</h2>
                  <p>服务者发布并经平台审核后的实际案例会在这里展示。</p>
                </header>
                <div>
                  {service.serviceIncludes.slice(0, 3).map((item, index) => (
                    <article key={item.title}>
                      <span>能力方向 0{index + 1}</span>
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
                  <h2>资质证书</h2>
                  <p>认证资料、能力证明和服务评价会由平台审核后统一展示。</p>
                </header>
                <div>
                  <article>
                    <b>身份与服务者认证</b>
                    <span>已认证技术服务者</span>
                  </article>
                  <article>
                    <b>技术能力资料</b>
                    <span>由服务者后台补充并提交审核</span>
                  </article>
                  <article>
                    <b>服务评价与记录</b>
                    <span>完成订单后按规则公开展示</span>
                  </article>
                </div>
              </div>
            )}

            <section className="technical-other-services-panel">
              <section className="technical-service-projects">
                <header>
                  <div>
                    <span>SERVICE ITEMS</span>
                    <h2>{service.provider}的其他技术服务</h2>
                  </div>
                  <p>由 {service.provider} 提供；说明、价格与操作入口均与服务列表保持一致。</p>
                </header>
                <div className="technical-market-service-list">
                  {providerOtherServices.length ? (
                    providerOtherServices.map((project) => (
                      <article className="technical-market-service-row" key={project.slug}>
                        <Image
                          src={project.avatar}
                          alt={`${project.provider}技术人员头像`}
                          width={50}
                          height={50}
                        />
                        <div>
                          <b>{project.title}</b>
                          <p>{project.summary}</p>
                          <small>{project.providerRole}</small>
                        </div>
                        <span className="technical-market-service-modes">
                          {project.deliveryModes.map((mode) => (
                            <i key={mode}>{serviceDeliveryLabels[mode]}</i>
                          ))}
                        </span>
                        <strong>{servicePriceText(project)}</strong>
                        <div className="technical-market-service-actions">
                          {project.deliveryModes.includes("online") && (
                            <button
                              type="button"
                              onClick={() => {
                                setTechnicalChatService(project);
                                setTechnicalChatOpen(true);
                              }}
                            >
                              免费技术支持
                            </button>
                          )}
                          <a
                            className="primary"
                            href={`/service/${project.slug}`}
                          >
                            {project.pricingMode === "fixed"
                              ? "立即购买"
                              : "沟通确认价格"}
                          </a>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="technical-other-services-empty">
                      该技术服务者暂未发布其他可购服务。
                    </p>
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
                  <b>上门技术服务</b>
                  <small>专业技术人才 · 快速响应 · 高质量交付</small>
                </div>
                <div className="technical-provider-inline">
                  <span className="technical-avatar" aria-hidden="true">
                    {service.initials}
                  </span>
                  <span>
                    <b>{service.provider}</b>
                    <em>已认证 · 在线接单</em>
                  </span>
                </div>
                <h1>{service.title}</h1>
                <p>{service.summary}</p>
                <div
                  className="technical-detail-modes"
                  aria-label="选择服务方式"
                >
                  {service.deliveryModes.map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      className={currentMode === mode ? "active" : ""}
                      onClick={() => setSelectedMode(mode)}
                    >
                      {serviceDeliveryLabels[mode]}
                    </button>
                  ))}
                  {service.coverage && service.deliveryModes.includes("onsite") && (
                    <span>{service.coverage}</span>
                  )}
                </div>
                {service.deliveryModes.includes("onsite") && (
                  <p className="technical-post-order-note">
                    指定地点服务请先确认到场时间和地点，再确认订单并完成支付。
                  </p>
                )}
              </div>
              <div className="technical-service-illustration" aria-hidden="true">
                <Image
                  src="/technical-services/ai-technical-service-hero-v1.png"
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 42vw"
                  priority
                />
              </div>
              <div className="technical-response-highlights">
                {service.onlineResponse && service.deliveryModes.includes("online") && (
                  <span>
                    <b>远程咨询最快</b>
                    <strong>{service.onlineResponse}</strong>
                  </span>
                )}
                {service.onsiteArrival && service.deliveryModes.includes("onsite") && (
                  <span>
                    <b>上门服务最快</b>
                    <strong>{service.onsiteArrival}</strong>
                  </span>
                )}
              </div>
            </article>

            <section className="technical-detail-tabs" aria-label="服务详情">
              <nav>
                {detailTabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={activeTab === tab.id ? "active" : ""}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {activeTab === "content" && (
                <div className="technical-tab-panel">
                  <h2>本服务包含</h2>
                  <p>
                    围绕“{service.title}”提供完整技术支持，服务范围会在开始前与您确认。
                  </p>
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
                  <h2>服务流程</h2>
                  <ol className="technical-flow">
                    <li>
                      {currentMode === "onsite"
                        ? "确认服务方式"
                        : "确认在线服务方式"}
                    </li>
                    <li>
                      {currentMode === "onsite"
                        ? "选择到场时间和地点"
                        : "选择在线服务时间"}
                    </li>
                    <li>确认订单并支付</li>
                    <li>
                      {currentMode === "onsite"
                        ? `等待到场（最快${service.onsiteArrival ?? "20分钟到场"}）`
                        : `等待技术响应（最快${service.onlineResponse ?? "1–5 分钟响应"}）`}
                    </li>
                  </ol>
                </div>
              )}

              {activeTab === "delivery" && (
                <div className="technical-tab-panel">
                  <h2>交付周期</h2>
                  <div className="technical-delivery-list">
                    {service.deliveryNotes.map((note, index) => (
                      <span key={note}>
                        <b>0{index + 1}</b>
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="technical-tab-panel">
                  <h2>服务说明</h2>
                  <p>
                    固定价格服务可直接购买；价格面议服务会先沟通需求，确认服务内容与价格后再生成可支付订单。
                    {currentMode === "onsite"
                      ? " 指定地点服务会先确认到场时间和地点，再确认订单并完成支付。"
                      : " 在线沟通服务会先确认服务时间，再确认订单并完成支付。"}
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="technical-detail-sidebar">
            <section className="technical-buy-panel">
              <span className="technical-buy-kicker">服务价格</span>
              {renderPrice()}
              <p>
                {fixedPrice
                  ? "价格透明，无隐藏费用"
                  : "先沟通需求，再确认服务价格"}
              </p>
              <button type="button" onClick={() => setPurchaseOpen(true)}>
                {fixedPrice ? "立即购买" : "沟通确认价格"}
              </button>
              {service.deliveryModes.includes("online") && (
                <button
                  type="button"
                  className="technical-outline technical-consult-cta"
                  onClick={() => {
                    setTechnicalChatService(service);
                    setTechnicalChatOpen(true);
                  }}
                >
                  <span>在线沟通</span>
                  <small>
                    {service.onlineResponse
                      ? `最快 ${service.onlineResponse}`
                      : "咨询服务细节"}
                  </small>
                </button>
              )}
              <small>
                {currentMode === "onsite"
                  ? `当前选择：${selectedModeLabel}（先选择时间与地点）`
                  : `当前选择：${selectedModeLabel}`}
              </small>
            </section>

            <section className="technical-provider-panel">
              <header>
                <b>服务技术人员</b>
                <a href="/?channel=technical">查看技术人才主页 ›</a>
              </header>
              <div className="technical-provider-profile">
                <span className="technical-avatar large" aria-hidden="true">
                  {service.initials}
                </span>
                <div>
                  <h2>{service.provider}</h2>
                  <b>已认证 · 在线接单</b>
                  <p>{service.city} · {service.experience}</p>
                  <small>{service.providerRole}</small>
                </div>
              </div>
              <p className="technical-provider-intro">{service.providerIntro}</p>
            </section>

            <section className="technical-provider-more">
              <header>
                <b>{service.provider}的其他服务</b>
                <a href="/?channel=technical">查看全部服务 ›</a>
              </header>
              {relatedServices.map((item) => (
                <a href={`/service/${item.slug}`} key={item.slug}>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.summary}</small>
                  </span>
                  <em>{servicePriceText(item)}</em>
                </a>
              ))}
            </section>
          </aside>
        </section>
      </div>

      <TechnicalSupportChat
        activeService={technicalChatService ?? service}
        open={technicalChatOpen}
        services={serviceItems}
        onClose={() => setTechnicalChatOpen(false)}
      />

      {purchaseOpen && (
        <div className="technical-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPurchaseOpen(false)}>
          <section className="technical-appointment-modal technical-order-modal" role="dialog" aria-modal="true" aria-label="服务订单">
            <button className="modal-close" aria-label="关闭" onClick={() => setPurchaseOpen(false)}>×</button>
            <span>✓</span>
            <h2>{fixedPrice ? "确认服务并创建订单" : "提交需求等待报价"}</h2>
            <p>{fixedPrice ? `当前选择：${selectedModeLabel}。确认服务时间${currentMode === "onsite" ? "、服务地点" : ""}和需求后创建服务订单。` : "提交需求和预约时间后，平台或技术人员确认服务范围并给出最终报价。"}</p>
            <div className="technical-order-form">
              <label><span>{currentMode === "onsite" ? "期望到场时间" : "期望在线服务时间"}</span><input type="datetime-local" value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} /></label>
              {currentMode === "onsite" && <label><span>服务地点</span><input value={serviceAddress} onChange={(event) => setServiceAddress(event.target.value)} placeholder="请填写详细服务地址" /></label>}
              <label><span>联系人</span><input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="选填，方便技术人员联系" /></label>
              <label><span>需求说明</span><textarea value={requirementText} onChange={(event) => setRequirementText(event.target.value)} placeholder="请描述问题、当前环境、希望解决的目标等" /></label>
              {fixedPrice && <div className="technical-order-price-confirm"><span>服务金额</span>{renderReferencePrice()}</div>}
              {purchaseError && <small className="form-error">{purchaseError}</small>}
            </div>
            <div className="technical-order-modal-actions">
              <button type="button" className="technical-order-consult" onClick={() => { setPurchaseOpen(false); setTechnicalChatService(service); setTechnicalChatOpen(true); }}>先在线沟通</button>
              <button type="button" disabled={creatingOrder} onClick={() => void createServiceOrder()}>{creatingOrder ? "正在创建…" : fixedPrice ? "创建服务订单" : "提交需求等待报价"}</button>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}
