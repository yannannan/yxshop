import type { Metadata } from 'next';
import type { Locale } from './i18n';
import type { ToolService } from './tool-services';

export const requiredSeoKeywords = ['宇星脉通', 'AI智能获客', 'AI贸易获客', 'AI外贸获客'] as const;
type Copy = { title: string; description: string; keywords: string[] };
type Profile = { zh: Copy; en: Copy; path?: string; private?: boolean; follow?: boolean };

// Page-specific copy comes first. The four site terms are added afterwards so
// custom descriptions and the English locale cannot accidentally remove them.
export const pageSeoProfiles = {
  home: {
    path: '/',
    zh: { title: 'AI数字服务、实用工具与技术支持', description: '宇星脉通汇集AI会员与账号服务、在线实用工具、远程与上门技术支持，提供AI智能获客、AI贸易获客、AI外贸获客场景介绍和工作台预览。', keywords: ['AI数字服务', 'AI会员服务', '在线工具', '上门技术服务'] },
    en: { title: 'AI Digital Services, Online Tools & Technical Support', description: 'Discover AI memberships, account services, practical online tools and technical support, with previews of domestic and overseas prospecting workflows.', keywords: ['AI digital services', 'online tools', 'technical support', 'AI prospecting'] },
  },
  tools: {
    path: '/tools',
    zh: { title: '工具服务｜在线签名、印章、图片处理与C盘清理', description: '查找文件在线签名、印章与手印制作、视频提取、图片处理、站长分析和免费C盘清理工具，查看各工具功能、使用入口及收费说明。', keywords: ['工具服务', '在线签名', '印章制作', '手印制作', '图片处理', 'C盘清理'] },
    en: { title: 'Online Tools & Utilities', description: 'Explore document signing, stamp and fingerprint design, video extraction, image editing, website analysis and free disk cleanup, with usage and pricing details.', keywords: ['online utilities', 'document signing', 'stamp maker', 'image editor', 'disk cleanup'] },
  },
  products: {
    path: '/products',
    zh: { title: '数字商品目录｜AI会员、账号与充值服务', description: '浏览AI会员、账号及数字服务商品，按分类检索所需服务，了解商品说明、计费周期、交付方式与售后规则。', keywords: ['数字商品', 'AI会员', '账号服务', '会员充值', '商品目录'] },
    en: { title: 'Digital Product Catalog', description: 'Browse AI memberships, accounts and digital services. Compare product information, billing periods, delivery methods and support terms by category.', keywords: ['digital products', 'AI memberships', 'account services', 'membership recharge'] },
  },
  aiLeads: {
    path: '/ai-leads',
    zh: { title: 'AI智能获客｜国内与海外贸易线索工作台预览', description: '了解AI智能获客面向国内与海外市场的关键词检索、多平台选择、数据精度筛选、客户画像及线索分类管理。AI贸易获客、AI外贸获客当前为界面与流程预览，尚未开放真实采集。', keywords: ['海外获客', '国内获客', '外贸客户开发', '关键词获客', '客户画像', '线索管理', 'Facebook获客', 'TikTok获客', '阿里国际站获客'] },
    en: { title: 'AI Lead Intelligence for Domestic & Overseas Markets', description: 'Explore keyword discovery, platform selection, precision filters, customer profiles and lead management for domestic and international trade. Interface preview; live collection is not available.', keywords: ['AI lead generation', 'trade prospecting', 'overseas leads', 'customer profiles', 'lead management'] },
  },
  aiLeadsWorkspace: {
    private: true, follow: true,
    zh: { title: '获客工作台预览｜关键词、平台与线索筛选', description: '体验获客关键词输入、每次数量选择、平台勾选、数据字段筛选与线索记录管理。当前仅演示交互界面，不执行真实抓取，不消耗积分。', keywords: ['获客工作台', '平台筛选', '数据精度', '线索分类', '获客记录'] },
    en: { title: 'Prospecting Workspace Preview', description: 'Preview keyword input, result quantities, platform and data-field selection, and lead records. This interactive demo does not collect real data or use points.', keywords: ['prospecting workspace', 'keyword filters', 'platform selection', 'lead records'] },
  },
  aiOperations: {
    path: '/ai-operations',
    zh: { title: 'AI运营工具｜网站分析与站长综合看板', description: '从AI运营工具进入站长分析看板，查看域名基础信息、关键词分析、网站报告与历史记录，辅助日常网站运营。', keywords: ['AI运营工具', '站长工具', '网站分析', '关键词分析', '网站报告'] },
    en: { title: 'AI Operations & Website Analysis Tools', description: 'Open the webmaster dashboard for domain information, keyword analysis, website reports and saved analysis history.', keywords: ['AI operations', 'webmaster tools', 'website analysis', 'keyword analysis'] },
  },
  product: {
    zh: { title: '商品详情与购买说明', description: '查看数字商品的功能说明、计费周期、交付方式和售后约定，确认信息后创建订单。', keywords: ['商品详情', '数字服务', '购买说明', '订单交付'] },
    en: { title: 'Product Details & Purchase Information', description: 'Review product features, billing periods, delivery methods and support terms before placing an order.', keywords: ['product details', 'digital services', 'purchase information'] },
  },
  service: {
    zh: { title: '在线与上门技术服务', description: '了解技术服务内容、服务方式、技术人员资料、交付流程与服务说明，通过在线咨询确认需求与安排。', keywords: ['在线技术服务', '上门服务', '技术咨询', '网站部署', '服务器维护'] },
    en: { title: 'Remote & Onsite Technical Services', description: 'Review service scope, delivery options, provider information and delivery steps, then discuss your needs through online consultation.', keywords: ['technical services', 'remote support', 'onsite support', 'technical consultation'] },
  },
  account: {
    private: true,
    zh: { title: '个人中心｜账户概览', description: '登录后查看账户概览、积分余额、订单与工具使用记录，管理个人资料和常用服务。', keywords: ['个人中心', '账户概览', '积分余额', '工具记录'] },
    en: { title: 'Account Center & Overview', description: 'Sign in to review your account, points, orders and tool activity, and manage your personal information.', keywords: ['account center', 'account overview', 'points balance', 'tool activity'] },
  },
  accountOrders: {
    private: true,
    zh: { title: '我的订单｜购买与交付记录', description: '在个人中心查看数字商品订单、支付状态、交付信息及售后记录，按订单跟进购买进度。', keywords: ['我的订单', '购买记录', '订单状态', '交付记录'] },
    en: { title: 'My Orders & Delivery Records', description: 'Review your digital product orders, payment status, delivery information and support records in your account.', keywords: ['my orders', 'purchase history', 'delivery records'] },
  },
  accountActivity: {
    private: true,
    zh: { title: '工具记录｜使用与积分消耗明细', description: '查看当前账户的工具使用记录、制作与处理结果及积分消耗明细，按类型查找历史任务。', keywords: ['工具记录', '使用历史', '制作记录', '积分明细'] },
    en: { title: 'Tool Activity & Points History', description: 'Review tool usage, saved results and points history for your account, and locate previous tasks by type.', keywords: ['tool history', 'saved results', 'points history'] },
  },
  accountProfile: {
    private: true,
    zh: { title: '账号资料｜个人信息设置', description: '管理当前账户的头像、昵称与联系资料，查看账户基础信息并保存个人设置。', keywords: ['账号资料', '个人信息', '头像设置', '账户设置'] },
    en: { title: 'Profile & Account Settings', description: 'Manage your avatar, display name and contact details, and review your account information.', keywords: ['account profile', 'personal information', 'account settings'] },
  },
  points: {
    private: true,
    zh: { title: '我的积分与充值', description: '查看通用积分余额、充值套餐与收支记录，了解积分到账和工具使用的扣费情况。', keywords: ['积分充值', '通用积分', '积分余额', '积分收支'] },
    en: { title: 'My Points & Top-ups', description: 'Review your points balance, top-up packages and transaction history, including credits and tool usage charges.', keywords: ['points top-up', 'points balance', 'points transactions'] },
  },
  addresses: {
    private: true,
    zh: { title: '地址管理｜上门服务联系地址', description: '管理上门服务使用的联系人、联系电话及地址，设置默认地址，便于预约与服务安排。', keywords: ['地址管理', '服务地址', '默认地址', '上门预约'] },
    en: { title: 'Address Management for Onsite Services', description: 'Manage your service contacts and addresses, and choose a default address for onsite appointments.', keywords: ['address management', 'service address', 'onsite appointments'] },
  },
  checkout: {
    private: true,
    zh: { title: '订单支付｜确认商品与付款', description: '核对订单商品、金额与付款信息，按页面提示完成支付确认，并在订单中查看交付进度。', keywords: ['订单支付', '付款确认', '扫码支付', '订单核对'] },
    en: { title: 'Checkout & Payment Confirmation', description: 'Check your order items and amount, follow the payment instructions, and review delivery progress in your order.', keywords: ['checkout', 'payment confirmation', 'order review'] },
  },
  orders: {
    private: true,
    zh: { title: '订单查询｜支付状态与商品交付', description: '查询当前账户的订单状态、支付进度及商品交付信息，查看订单详情和售后入口。', keywords: ['订单查询', '支付状态', '商品交付', '订单售后'] },
    en: { title: 'Order Lookup & Delivery Status', description: 'Check your order status, payment progress and product delivery details, with access to order support.', keywords: ['order lookup', 'payment status', 'delivery status'] },
  },
  serviceOrders: {
    private: true,
    zh: { title: '技术服务订单｜预约与进度管理', description: '查看在线与上门技术服务订单、预约安排、实施进度及验收状态，跟进服务交付。', keywords: ['技术服务订单', '预约管理', '服务进度', '服务验收'] },
    en: { title: 'Technical Service Orders & Appointments', description: 'Review your remote and onsite service orders, appointments, delivery progress and acceptance status.', keywords: ['service orders', 'appointments', 'service progress'] },
  },
  serviceOrder: {
    private: true,
    zh: { title: '技术服务订单详情', description: '查看当前技术服务订单的需求、预约、付款、实施及验收信息，与技术人员沟通服务进度。', keywords: ['服务订单详情', '技术服务进度', '预约详情', '服务沟通'] },
    en: { title: 'Technical Service Order Details', description: 'Review service requirements, appointments, payment and acceptance information, and discuss progress with your technician.', keywords: ['service order details', 'service progress', 'appointment details'] },
  },
  technician: {
    private: true,
    zh: { title: '技术人员工作台｜服务与咨询管理', description: '技术人员登录后管理服务资料、咨询会话、预约与服务订单，跟进客户需求和交付进度。', keywords: ['技术人员工作台', '咨询管理', '服务管理', '预约订单'] },
    en: { title: 'Technician Workspace', description: 'Sign in to manage service information, consultations, appointments and service orders, and follow customer requirements and delivery progress.', keywords: ['technician workspace', 'consultation management', 'service management'] },
  },
  admin: {
    private: true,
    zh: { title: '管理后台', description: '宇星脉通管理后台，用于维护商品、工具服务、软件发布、订单、技术服务与运营配置。', keywords: ['管理后台', '工具管理', '软件发布', '运营管理'] },
    en: { title: 'Administration', description: 'Administration for products, tools, software releases, orders, technical services and operational settings.', keywords: ['administration', 'tool management', 'software releases'] },
  },
  missingTool: {
    private: true,
    zh: { title: '工具不存在', description: '当前工具不存在或尚未开放，请返回工具服务目录查看已发布的实用工具。', keywords: ['工具服务', '工具目录'] },
    en: { title: 'Tool Not Found', description: 'This tool is unavailable. Return to the tool directory to browse published utilities.', keywords: ['tool directory', 'available tools'] },
  },
  missingProduct: {
    private: true,
    zh: { title: '商品不存在', description: '当前商品不存在或已下架，请返回商品目录查看在售的数字商品与服务。', keywords: ['商品目录', '数字商品'] },
    en: { title: 'Product Not Found', description: 'This product is unavailable. Return to the catalog to browse published products and services.', keywords: ['product catalog', 'digital products'] },
  },
  missingService: {
    private: true,
    zh: { title: '技术服务暂不可用', description: '当前技术服务不存在或暂不可用，请返回首页查看可提供的在线与上门技术服务。', keywords: ['技术服务', '在线咨询'] },
    en: { title: 'Technical Service Unavailable', description: 'This service is currently unavailable. Return to the homepage to explore remote and onsite technical support.', keywords: ['technical services', 'online consultation'] },
  },
} satisfies Record<string, Profile>;

export type SeoPage = keyof typeof pageSeoProfiles;
export type SeoOptions = { locale?: Locale; origin?: string; title?: string; description?: string; keywords?: string[]; path?: string | null; images?: string[]; index?: boolean; follow?: boolean };
const plainText = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function seoDescription(value: string, locale: Locale = 'zh-CN') {
  const summary = Array.from(plainText(value)).slice(0, locale === 'en' ? 260 : 160).join('');
  const missing = requiredSeoKeywords.filter(keyword => !summary.includes(keyword));
  if (!missing.length) return summary;
  return locale === 'en' ? `${summary.replace(/[.\s]+$/, '')}. Related: ${missing.join(', ')}.` : `${summary.replace(/[。；\s]+$/, '')}。相关服务：${missing.join('、')}。`;
}

export function buildPageMetadata(page: SeoPage, options: SeoOptions = {}): Metadata {
  const profile: Profile = pageSeoProfiles[page];
  const locale = options.locale || 'zh-CN';
  const copy = locale === 'en' ? profile.en : profile.zh;
  const origin = (options.origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yxstar.shop').replace(/\/$/, '');
  const title = plainText(options.title || `${copy.title}${locale === 'en' ? ' | Yuxing Maitong' : '｜宇星脉通'}`);
  const description = seoDescription(options.description || copy.description, locale);
  const keywords = [...new Set([...requiredSeoKeywords, ...copy.keywords, ...(options.keywords || [])].map(plainText).filter(Boolean))];
  const path = options.path === undefined ? profile.path : options.path;
  const canonical = path ? new URL(path, `${origin}/`).href : null;
  const images = options.images ?? ['/og.png'];
  return {
    metadataBase: new URL(origin), title, description, keywords,
    alternates: { canonical },
    robots: { index: options.index ?? !profile.private, follow: options.follow ?? profile.follow ?? !profile.private },
    openGraph: { title, description, type: 'website', locale: locale === 'en' ? 'en_US' : 'zh_CN', siteName: locale === 'en' ? 'Yuxing Maitong' : '宇星脉通', ...(canonical ? { url: canonical } : {}), images },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}

type ToolCopy = { zh: Omit<Copy, 'title'>; en: Omit<Copy, 'title'> };
const toolSeoProfiles: Record<string, ToolCopy> = {
  'c-drive-cleaner': {
    zh: { description: '宇星磁盘管家提供磁盘空间分析、C盘清理与残留项目扫描。了解软件功能和真实界面，免费下载安装包，无需登录商城。', keywords: ['宇星磁盘管家', '免费C盘清理', '磁盘空间分析', 'Windows清理工具', '软件下载'] },
    en: { description: 'Explore Yuxing Disk Manager for disk usage analysis, C: drive cleanup and residual file scanning. Download the Windows application for free without signing in.', keywords: ['Yuxing Disk Manager', 'free disk cleanup', 'disk usage analysis', 'Windows download'] },
  },
  'document-signature': {
    zh: { description: '在线制作手写签名，在PDF、DOCX和图片中放置签名、印章与手印，调整大小、位置、旋转、透明度及边缘淡化，生成签署文件并查看制作记录。', keywords: ['文件在线签名', 'PDF签名', 'Word签署', '手写签名', '印章签署', '手印签署'] },
    en: { description: 'Create a handwritten signature and place signatures, stamps or fingerprints on PDF, DOCX and image files. Adjust size, position, rotation, opacity and edge fading before exporting.', keywords: ['online document signing', 'PDF signature', 'DOCX signing', 'signature opacity'] },
  },
  'stamp-maker': {
    zh: { description: '在线设计圆形、椭圆形、方形及姓名印章，调整文字大小、字距、字体粗细与透明度，实时预览，支持256至4096像素PNG、JPG及SVG导出，查看制作记录与套餐说明。', keywords: ['印章在线制作', '电子印章设计', '圆形印章', '透明印章', '印章字体', '印章字距'] },
    en: { description: 'Design round, oval, square and name stamps. Adjust font size, character spacing, weight and opacity with live preview, and export PNG, JPG or SVG at 256 to 4096 pixels.', keywords: ['online stamp maker', 'stamp design', 'transparent stamp', 'stamp fonts'] },
  },
  'handprint-maker': {
    zh: { description: '上传手印照片提取透明手印，或生成装饰性指纹图案，调整颜色、浓度、边缘淡化及横穿裂纹角度、长度和宽度，保存透明PNG并复用制作记录。', keywords: ['手印制作', '透明手印', '指纹图案生成', '手印提取', '手印边缘淡化'] },
    en: { description: 'Extract a transparent fingerprint from a photo or generate a decorative pattern. Adjust color, intensity, edge fading and crossing cracks, then save a reusable transparent PNG.', keywords: ['fingerprint maker', 'transparent fingerprint', 'decorative fingerprint', 'fingerprint extraction'] },
  },
  'video-extractor': {
    zh: { description: '解析抖音、快手、小红书、B站、Facebook等公开视频分享链接及网页视频源，选择画质并提取下载。解析免费，生成文件成功后使用积分或套餐权益。', keywords: ['链接视频提取', '视频解析', '视频下载', '抖音视频', 'B站视频', 'Facebook视频'] },
    en: { description: 'Parse public video links and webpage sources from supported platforms, choose quality and download. Parsing is free; points or plan benefits apply after successful file creation.', keywords: ['video link extractor', 'video parsing', 'video download', 'video quality selection'] },
  },
  'image-processor': {
    zh: { description: '在线进行图片压缩、图像拼接、去水印及基础图像编辑，预览处理效果，下载结果并查询历史处理记录与收费说明。', keywords: ['图片在线处理', '图片压缩', '图片拼接', '图片去水印', '在线图片编辑'] },
    en: { description: 'Compress and combine images, remove watermarks and perform basic image editing online. Preview results and review download options, processing history and pricing.', keywords: ['online image editor', 'image compression', 'image stitching', 'watermark removal'] },
  },
  webmaster: {
    zh: { description: '站长分析工具支持域名基础信息、网站关键词分析、SEO报告与历史记录管理，使用综合看板了解网站运营情况并跟进优化工作。', keywords: ['站长工具', '站长运营工具', '网站分析', 'SEO分析', '关键词挖掘', '网站报告'] },
    en: { description: 'Analyze domain information, website keywords and SEO reports in a webmaster dashboard, with saved history for ongoing website operations.', keywords: ['webmaster tools', 'website analysis', 'SEO reports', 'keyword research'] },
  },
};

export function buildToolMetadata(tool: Pick<ToolService, 'slug' | 'name' | 'description' | 'detail' | 'logo' | 'seoTitle' | 'seoDescription'>, options: SeoOptions = {}) {
  if (tool.slug === 'ai-leads') return buildPageMetadata('aiLeads', options);
  const webmaster = ['webmaster-tools', 'webmaster-analysis', 'webmaster', 'site-analysis', 'site-analyzer', 'website-analysis', 'yxstar-site-tool'].includes(tool.slug) || ['站长分析工具', '站长运营工具'].includes(tool.name.trim());
  const profile = toolSeoProfiles[webmaster ? 'webmaster' : tool.slug];
  const copy = options.locale === 'en' ? profile?.en : profile?.zh;
  const name = tool.slug === 'c-drive-cleaner' ? options.locale === 'en' ? 'Yuxing Disk Manager · Free C: Drive Cleanup' : '宇星磁盘管家｜免费C盘清理工具' : tool.name;
  return buildPageMetadata('tools', {
    ...options,
    title: tool.seoTitle || `${name}${options.locale === 'en' ? ' | Yuxing Maitong' : '｜宇星脉通'}`,
    description: tool.seoDescription || copy?.description || tool.description || tool.detail || `${tool.name}：查看工具介绍、使用方式与收费说明。`,
    keywords: [tool.name, ...(copy?.keywords || []), ...(options.keywords || [])],
    path: `/tools/${encodeURIComponent(tool.slug)}.html`, images: tool.logo ? [tool.logo] : [],
  });
}
