export type ServiceDeliveryMode = "online" | "onsite";
export type ServicePricingMode = "fixed" | "negotiable";

export type TechnicalService = {
  slug: string;
  providerId: string;
  homepageFeatured: boolean;
  provider: string;
  initials: string;
  avatar: string;
  city: string;
  experience: string;
  title: string;
  summary: string;
  deliveryModes: ServiceDeliveryMode[];
  coverage?: string;
  pricingMode: ServicePricingMode;
  price?: number;
  unit?: string;
  onlineResponse?: string;
  onsiteArrival?: string;
  providerRole: string;
  providerIntro: string;
  skills: string[];
  serviceIncludes: { title: string; detail: string }[];
  deliveryNotes: string[];
};

export const serviceDeliveryLabels: Record<ServiceDeliveryMode, string> = {
  online: "在线服务",
  onsite: "上门服务",
};

export const technicalServices: TechnicalService[] = [
  {
    slug: "ai-site-deployment",
    providerId: "provider-zhangwei",
    homepageFeatured: true,
    provider: "张伟",
    initials: "张",
    avatar: "/technical-services/provider-zhangwei-v1.png",
    city: "北京",
    experience: "8年经验",
    title: "AI网站部署与技术搭建",
    summary: "覆盖环境部署、域名配置、系统上线与后续技术支持。",
    deliveryModes: ["online", "onsite"],
    coverage: "全市服务",
    pricingMode: "fixed",
    price: 500,
    unit: "次",
    onlineResponse: "1–5 分钟响应",
    onsiteArrival: "20分钟到场",
    providerRole: "AI 部署与网站技术服务专家",
    providerIntro:
      "专注 AI 网站部署、服务器环境搭建与上线交付，提供从配置到稳定运行的完整技术支持。",
    skills: ["网站运维", "服务器", "Linux", "企业 IT", "系统部署", "故障排查"],
    serviceIncludes: [
      { title: "服务器环境部署", detail: "配置运行环境与必要组件，保障系统稳定运行。" },
      { title: "域名配置与解析", detail: "协助域名绑定、DNS 解析及 SSL 证书配置。" },
      { title: "网站程序部署", detail: "完成程序、数据库配置与功能调试优化。" },
      { title: "AI 应用集成", detail: "对接主流 AI 能力，完成模型部署与应用配置。" },
      { title: "系统测试与优化", detail: "进行功能测试、性能优化及安全检查。" },
      { title: "上线支持与培训", detail: "协助正式上线，并提供基础操作指引。" },
    ],
    deliveryNotes: ["需求确认后开始实施", "过程同步与阶段验收", "交付说明与后续答疑"],
  },
  {
    slug: "ai-system-customization",
    providerId: "provider-lina",
    homepageFeatured: true,
    provider: "李娜",
    initials: "李",
    avatar: "/technical-services/provider-lina-v1.png",
    city: "上海",
    experience: "6年经验",
    title: "企业 AI 系统定制与实施",
    summary: "适用于企业内部工具、流程自动化和 AI 应用落地。",
    deliveryModes: ["online", "onsite"],
    coverage: "区域服务 · 上海、苏州、杭州",
    pricingMode: "negotiable",
    onlineResponse: "1–5 分钟响应",
    onsiteArrival: "20分钟到场",
    providerRole: "企业 AI 系统定制顾问",
    providerIntro:
      "聚焦企业 AI 工具落地、流程自动化与系统集成，先梳理业务需求，再确认可执行的服务方案。",
    skills: ["Java 开发", "Python", "Web 应用", "系统集成", "AI 工具", "流程自动化"],
    serviceIncludes: [
      { title: "业务需求梳理", detail: "明确使用场景、目标与实施边界。" },
      { title: "AI 方案设计", detail: "输出可落地的系统与流程建议。" },
      { title: "系统定制实施", detail: "按确认范围进行配置、开发与联调。" },
      { title: "上线验收支持", detail: "配合测试、验收与使用交接。" },
    ],
    deliveryNotes: ["先免费沟通需求", "确认方案与服务价格", "安排实施与验收交付"],
  },
  {
    slug: "server-operation-security",
    providerId: "provider-wangqiang",
    homepageFeatured: true,
    provider: "王强",
    initials: "王",
    avatar: "/technical-services/provider-wangqiang-v1.png",
    city: "深圳",
    experience: "10年经验",
    title: "服务器运维与安全加固",
    summary: "系统巡检、故障排查、安全防护与稳定性优化。",
    deliveryModes: ["online"],
    pricingMode: "fixed",
    price: 600,
    unit: "次",
    onlineResponse: "1–5 分钟响应",
    providerRole: "服务器运维与安全工程师",
    providerIntro:
      "提供服务器巡检、故障排查和安全加固服务，帮助业务系统保持稳定、可持续运行。",
    skills: ["安防监控", "门禁系统", "弱电工程", "智能硬件", "服务器", "安全加固"],
    serviceIncludes: [
      { title: "服务器健康巡检", detail: "检查系统、进程、资源与关键告警。" },
      { title: "故障排查处理", detail: "定位异常原因并给出可执行处理建议。" },
      { title: "安全基线加固", detail: "优化账户、访问策略与基础安全配置。" },
      { title: "稳定性优化", detail: "针对瓶颈提出性能与可用性改善方案。" },
    ],
    deliveryNotes: ["说明服务器与问题现状", "在线沟通后开始处理", "确认处理结果与后续建议"],
  },
  {
    slug: "enterprise-server-environment",
    providerId: "provider-zhangwei",
    homepageFeatured: false,
    provider: "张伟",
    initials: "张",
    avatar: "/technical-services/provider-zhangwei-v1.png",
    city: "北京",
    experience: "8年经验",
    title: "企业服务器环境部署",
    summary: "Linux / Windows 服务器部署、环境配置与基础稳定性优化。",
    deliveryModes: ["online", "onsite"],
    coverage: "全市服务",
    pricingMode: "fixed",
    price: 500,
    unit: "次",
    onlineResponse: "1–5 分钟响应",
    onsiteArrival: "20分钟到场",
    providerRole: "AI 部署与网站技术服务专家",
    providerIntro:
      "专注 AI 网站部署、服务器环境搭建与上线交付，提供从配置到稳定运行的完整技术支持。",
    skills: ["网站运维", "服务器", "Linux", "企业 IT", "系统部署", "故障排查"],
    serviceIncludes: [
      { title: "运行环境配置", detail: "完成系统、运行时与基础组件配置。" },
      { title: "部署与联调", detail: "完成服务部署、启动验证与基础联调。" },
      { title: "稳定性检查", detail: "检查关键资源、权限与运行状态。" },
    ],
    deliveryNotes: ["确认服务器与目标环境", "执行部署并同步进度", "完成验证与交付说明"],
  },
  {
    slug: "enterprise-network-repair",
    providerId: "provider-zhangwei",
    homepageFeatured: false,
    provider: "张伟",
    initials: "张",
    avatar: "/technical-services/provider-zhangwei-v1.png",
    city: "北京",
    experience: "8年经验",
    title: "企业网络故障排查与修复",
    summary: "无法上网、网络波动与访问异常的快速排查和修复支持。",
    deliveryModes: ["online", "onsite"],
    coverage: "全市服务",
    pricingMode: "fixed",
    price: 300,
    unit: "小时",
    onlineResponse: "1–5 分钟响应",
    onsiteArrival: "20分钟到场",
    providerRole: "AI 部署与网站技术服务专家",
    providerIntro:
      "专注 AI 网站部署、服务器环境搭建与上线交付，提供从配置到稳定运行的完整技术支持。",
    skills: ["网站运维", "服务器", "Linux", "企业 IT", "系统部署", "故障排查"],
    serviceIncludes: [
      { title: "异常定位", detail: "分析网络连通性、访问链路与异常日志。" },
      { title: "修复建议", detail: "给出可执行的修复方案并协助处理。" },
      { title: "结果确认", detail: "完成连通性验证并说明后续注意事项。" },
    ],
    deliveryNotes: ["说明网络异常现象", "选择在线服务或上门服务", "确认修复结果"],
  },
  {
    slug: "ai-process-automation",
    providerId: "provider-lina",
    homepageFeatured: false,
    provider: "李娜",
    initials: "李",
    avatar: "/technical-services/provider-lina-v1.png",
    city: "上海",
    experience: "6年经验",
    title: "企业 AI 流程自动化实施",
    summary: "梳理重复业务流程，完成 AI 工具与自动化流程的落地实施。",
    deliveryModes: ["online", "onsite"],
    coverage: "区域服务 · 上海、苏州、杭州",
    pricingMode: "negotiable",
    onlineResponse: "1–5 分钟响应",
    onsiteArrival: "20分钟到场",
    providerRole: "企业 AI 系统定制顾问",
    providerIntro:
      "聚焦企业 AI 工具落地、流程自动化与系统集成，先梳理业务需求，再确认可执行的服务方案。",
    skills: ["Java 开发", "Python", "Web 应用", "系统集成", "AI 工具", "流程自动化"],
    serviceIncludes: [
      { title: "流程梳理", detail: "明确重复工作、触发条件与执行边界。" },
      { title: "自动化方案", detail: "设计可执行的 AI 工具与自动化方案。" },
      { title: "上线支持", detail: "完成测试、交接与使用说明。" },
    ],
    deliveryNotes: ["在线沟通需求", "确认方案与价格", "安排实施与验收"],
  },
  {
    slug: "ai-application-integration",
    providerId: "provider-lina",
    homepageFeatured: false,
    provider: "李娜",
    initials: "李",
    avatar: "/technical-services/provider-lina-v1.png",
    city: "上海",
    experience: "6年经验",
    title: "AI 应用集成与系统联调",
    summary: "连接业务系统、AI 能力与数据流程，支持上线前后的联调优化。",
    deliveryModes: ["online", "onsite"],
    coverage: "区域服务 · 上海、苏州、杭州",
    pricingMode: "negotiable",
    onlineResponse: "1–5 分钟响应",
    onsiteArrival: "20分钟到场",
    providerRole: "企业 AI 系统定制顾问",
    providerIntro:
      "聚焦企业 AI 工具落地、流程自动化与系统集成，先梳理业务需求，再确认可执行的服务方案。",
    skills: ["Java 开发", "Python", "Web 应用", "系统集成", "AI 工具", "流程自动化"],
    serviceIncludes: [
      { title: "接口与能力对接", detail: "梳理系统接口、AI 能力与数据流转方式。" },
      { title: "联调与验证", detail: "完成关键流程联调及异常处理验证。" },
      { title: "上线优化", detail: "根据使用反馈优化配置与调用流程。" },
    ],
    deliveryNotes: ["确认集成范围", "沟通方案与服务价格", "执行联调并完成验收"],
  },
  {
    slug: "server-health-inspection",
    providerId: "provider-wangqiang",
    homepageFeatured: false,
    provider: "王强",
    initials: "王",
    avatar: "/technical-services/provider-wangqiang-v1.png",
    city: "深圳",
    experience: "10年经验",
    title: "服务器健康巡检与故障处理",
    summary: "针对资源、日志、进程与告警进行系统巡检和故障处理。",
    deliveryModes: ["online"],
    pricingMode: "fixed",
    price: 300,
    unit: "小时",
    onlineResponse: "1–5 分钟响应",
    providerRole: "服务器运维与安全工程师",
    providerIntro:
      "提供服务器巡检、故障排查和安全加固服务，帮助业务系统保持稳定、可持续运行。",
    skills: ["安防监控", "门禁系统", "弱电工程", "智能硬件", "服务器", "安全加固"],
    serviceIncludes: [
      { title: "健康巡检", detail: "检查服务器资源、服务进程和关键告警。" },
      { title: "故障处理", detail: "定位异常原因并协助恢复服务。" },
      { title: "巡检报告", detail: "输出关键问题与后续处理建议。" },
    ],
    deliveryNotes: ["说明服务器和问题现状", "在线诊断并处理", "确认结果与后续建议"],
  },
  {
    slug: "security-baseline-hardening",
    providerId: "provider-wangqiang",
    homepageFeatured: false,
    provider: "王强",
    initials: "王",
    avatar: "/technical-services/provider-wangqiang-v1.png",
    city: "深圳",
    experience: "10年经验",
    title: "企业安全基线加固",
    summary: "优化账户、访问策略与基础安全配置，降低常见运行风险。",
    deliveryModes: ["online"],
    pricingMode: "fixed",
    price: 800,
    unit: "次",
    onlineResponse: "1–5 分钟响应",
    providerRole: "服务器运维与安全工程师",
    providerIntro:
      "提供服务器巡检、故障排查和安全加固服务，帮助业务系统保持稳定、可持续运行。",
    skills: ["安防监控", "门禁系统", "弱电工程", "智能硬件", "服务器", "安全加固"],
    serviceIncludes: [
      { title: "账户与权限检查", detail: "检查高风险账户和访问权限配置。" },
      { title: "基础安全加固", detail: "优化关键服务、访问策略与安全基线。" },
      { title: "风险说明", detail: "说明已处理风险与后续维护建议。" },
    ],
    deliveryNotes: ["说明安全需求与当前环境", "在线执行检查与加固", "确认处理结果"],
  },
];

export const homepageTechnicalServices = technicalServices.filter(
  (service) => service.homepageFeatured,
);

export function getProviderOtherServices(service: TechnicalService) {
  return technicalServices.filter(
    (item) =>
      item.providerId === service.providerId && item.slug !== service.slug,
  );
}

export function servicePriceText(service: TechnicalService) {
  if (service.pricingMode === "negotiable") return "价格面议";
  if (service.price === undefined || service.price === null) {
    return "价格待确认";
  }
  return `¥${formatServicePrice(service.price)} / ${service.unit ?? "次"}`;
}

export function formatServicePrice(price: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(price);
}

export function getTechnicalService(slug: string) {
  return technicalServices.find((service) => service.slug === slug);
}
