export const softwareToolSlug = 'c-drive-cleaner';
export const softwareUploadLimit = 256 * 1024 * 1024;
export const isSoftwareId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export class SoftwareError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type SoftwareFeature = { title: string; detail: string; titleEn: string; detailEn: string };
export type SoftwareScreenshot = { url: string; caption: string; captionEn: string };
export type SoftwarePage = { headline: string; headlineEn: string; summary: string; summaryEn: string; features: SoftwareFeature[]; screenshots: SoftwareScreenshot[] };
export type SoftwareRelease = { id: string; version: string; systems: string; notes: string; status: string; fileName: string; fileSize: number; sha256: string; createdAt: string; publishedAt: string; downloads: number; uploading: boolean };
export type SoftwareAdmin = { initialized: boolean; storageReady: boolean; tool: { id: number; name: string; status: string; chargeType: string }; page: SoftwarePage; releases: SoftwareRelease[] };
export const defaultSoftwarePage: SoftwarePage = { headline: '', headlineEn: '', summary: '', summaryEn: '', features: [], screenshots: [] };
function text(value: unknown, max: number) { if (typeof value !== 'string' || value.length > max) throw new SoftwareError('介绍内容过长或格式不正确'); return value.trim(); }
export function parseSoftwarePage(raw: unknown): SoftwarePage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SoftwareError('产品介绍格式不正确');
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.features) || p.features.length > 8 || !Array.isArray(p.screenshots) || p.screenshots.length > 8) throw new SoftwareError('功能及截图最多各8项');
  return { headline: text(p.headline, 100), headlineEn: text(p.headlineEn, 160), summary: text(p.summary, 600), summaryEn: text(p.summaryEn, 1000),
    features: p.features.map(row => { if (!row || typeof row !== 'object') throw new SoftwareError('功能格式不正确'); const feature = { title: text(row.title, 60), detail: text(row.detail, 400), titleEn: text(row.titleEn, 100), detailEn: text(row.detailEn, 700) }; if (!feature.title || !feature.detail) throw new SoftwareError('请填写每项功能的标题和说明'); return feature; }),
    screenshots: p.screenshots.map(row => { if (!row || typeof row !== 'object' || typeof row.url !== 'string' || !/^\/api\/product-images\?key=products%2F[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/.test(row.url)) throw new SoftwareError('请使用管理端上传的软件截图'); return { url: row.url, caption: text(row.caption, 100), captionEn: text(row.captionEn, 160) }; }),
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
