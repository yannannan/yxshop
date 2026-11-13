export const softwareToolSlug = 'c-drive-cleaner';
export const softwareUploadLimit = 256 * 1024 * 1024;
export const isSoftwareId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export class SoftwareError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type SoftwareFeature = { title: string; detail: string; titleEn: string; detailEn: string };
export type SoftwareScreenshot = { url: string; caption: string; captionEn: string };
export type SoftwarePage = { headline: string; headlineEn: string; summary: string; summaryEn: string; features: SoftwareFeature[]; screenshots: SoftwareScreenshot[] };
export type SoftwareRelease = { id: string; version: string; systems: string; notes: string; status: string; fileName: string; fileSize: number; sha256: string; createdAt: string; publishedAt: string; downloads: number; uploading: boolean };
export type SoftwareAdmin = { initialized: boolean; storageReady: boolean; tool: { id: number; name: string; status: string; chargeType: string }; page: SoftwarePage; releases: SoftwareRelease[] };
export const softwareScreenshotNames = ['overview', 'disks', 'analysis', 'file-report', 'cleanup', 'residuals', 'ai-mall', 'ai-tools'] as const;
const bundledScreenshot = (name: typeof softwareScreenshotNames[number]) => `/software/c-drive-cleaner/${name}.png`;
export const defaultSoftwarePage: SoftwarePage = {
  headline: '宇星磁盘管家\n免费C盘清理100%释放', headlineEn: 'Yuxing Disk Manager\nFree C: drive cleanup · 100% space release',
  summary: '宇星磁盘管家，将磁盘分析、C盘清理与残留扫描放在一起。从空间分布到具体文件，先看清占用，再选择需要整理的项目。',
  summaryEn: 'Yuxing Disk Manager brings disk analysis, C: drive cleanup and residual scans together. Understand where space goes, then choose what to clean.',
  features: [
    { title: '系统与磁盘总览', titleEn: 'System & disk overview', detail: '系统信息、磁盘容量、已用与剩余空间集中展示，整理进展一目了然。', detailEn: 'See system details, disk capacities, used space and available space together.' },
    { title: '深度磁盘分析', titleEn: 'In-depth disk analysis', detail: '按空间分类、文件类型与大文件查看占用，支持导出 HTML 分析报告。', detailEn: 'Explore space categories, file types and large files, with HTML report export.' },
    { title: 'C盘智能清理', titleEn: 'C: drive cleanup', detail: '区分可清理缓存与需要确认的内容，先分析项目，再按需选择处理。', detailEn: 'Review cache and items that need confirmation, then select what to clean.' },
    { title: '残留项目扫描', titleEn: 'Residual scans', detail: '发现安装、卸载、更新与应用留下的残留项目，查看路径后再决定是否整理。', detailEn: 'Find residual items from installation, removal, updates and applications. Review their locations before taking action.' },
  ],
  screenshots: [
    { url: bundledScreenshot('overview'), caption: '系统与清理总览', captionEn: 'System & cleanup overview' },
    { url: bundledScreenshot('disks'), caption: '多磁盘容量分布', captionEn: 'Disk capacity overview' },
    { url: bundledScreenshot('analysis'), caption: '深度扫描与空间分析', captionEn: 'Deep scan & space analysis' },
    { url: bundledScreenshot('file-report'), caption: '文件类型与大文件列表', captionEn: 'File types & large files' },
    { url: bundledScreenshot('cleanup'), caption: 'C盘智能清理', captionEn: 'C: drive cleanup' },
    { url: bundledScreenshot('residuals'), caption: '残留项目扫描', captionEn: 'Residual scans' },
    { url: bundledScreenshot('ai-mall'), caption: '软件内工具与服务', captionEn: 'Tools & services in the app' },
    { url: bundledScreenshot('ai-tools'), caption: '工具服务快捷入口', captionEn: 'Tool service shortcuts' },
  ],
};
const bundledScreenshots = new Set<string>(softwareScreenshotNames.map(bundledScreenshot));
function text(value: unknown, max: number) { if (typeof value !== 'string' || value.length > max) throw new SoftwareError('介绍内容过长或格式不正确'); return value.trim(); }
export function parseSoftwarePage(raw: unknown): SoftwarePage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SoftwareError('产品介绍格式不正确');
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.features) || p.features.length > 8 || !Array.isArray(p.screenshots) || p.screenshots.length > 8) throw new SoftwareError('功能及截图最多各8项');
  return { headline: text(p.headline, 100), headlineEn: text(p.headlineEn, 160), summary: text(p.summary, 600), summaryEn: text(p.summaryEn, 1000),
    features: p.features.map(row => { if (!row || typeof row !== 'object') throw new SoftwareError('功能格式不正确'); const feature = { title: text(row.title, 60), detail: text(row.detail, 400), titleEn: text(row.titleEn, 100), detailEn: text(row.detailEn, 700) }; if (!feature.title || !feature.detail) throw new SoftwareError('请填写每项功能的标题和说明'); return feature; }),
    screenshots: p.screenshots.map(row => { if (!row || typeof row !== 'object' || typeof row.url !== 'string' || (!bundledScreenshots.has(row.url) && !/^\/api\/product-images\?key=products%2F[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/.test(row.url))) throw new SoftwareError('请使用预置截图或管理端上传的软件截图'); return { url: row.url, caption: text(row.caption, 100), captionEn: text(row.captionEn, 160) }; }),
  };
}
export function parseReleaseFields(raw: Record<string, unknown>) {
  const version = text(raw.version, 48), systems = text(raw.systems, 200), notes = text(raw.notes, 6000);
  if (!version || !systems) throw new SoftwareError('请填写版本号和支持的Windows系统');
  return { version, systems, notes };
}
export function installerName(value: unknown) {
  if (typeof value !== 'string' || value.length > 160 || !/\.exe$/i.test(value) || /[\x00-\x1f\x7f/\\]/.test(value) || value.includes('..')) throw new SoftwareError('请选择有效的EXE文件名');
  return value;
}
export const softwareDownloadPath = (id: string) => `/api/tools/software/download?release=${encodeURIComponent(id)}`;
export const softwareSize = (size: number) => `${(size / (1024 * 1024)).toFixed(1)} MB`;
