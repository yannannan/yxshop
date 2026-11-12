import { randomUUID } from 'node:crypto';
import { env } from '@/db/mysql-runtime';
import type { PointsDatabase } from './points-service';
import { softwareStorage, type SoftwareObject } from './software-storage.mjs';
import { defaultSoftwarePage, installerName, isSoftwareId, parseReleaseFields, parseSoftwarePage, SoftwareError, softwareToolSlug, type SoftwareAdmin, type SoftwarePage, type SoftwareRelease } from './software-release';

type Tool = { id: number; name: string; status: string; tool_charge_type: string };
type Row = { id: string; product_id: number; version: string; supported_systems: string; release_notes: string; status: string; file_name: string; file_size: number; sha256: string; object_json: string; upload_token: string; upload_started_at: string; created_at: string; published_at: string; download_requests: number };
const missing = (error: unknown) => (error as { code?: string })?.code === 'ER_NO_SUCH_TABLE';
const activeUpload = (row: Row) => Boolean(row.upload_token && Date.parse(row.upload_started_at) > Date.now() - 1800000);
function publicRelease(row: Row): SoftwareRelease { return { id: row.id, version: row.version, systems: row.supported_systems, notes: row.release_notes, status: row.status, fileName: row.file_name, fileSize: Number(row.file_size), sha256: row.sha256, createdAt: row.created_at, publishedAt: row.published_at, downloads: Number(row.download_requests), uploading: activeUpload(row) }; }
function content(value: string | undefined): SoftwarePage { return value ? parseSoftwarePage(JSON.parse(value)) : { ...defaultSoftwarePage, features: [], screenshots: [] }; }
async function tool(db: PointsDatabase, id: number, lock = false) {
  const row = await db.prepare("SELECT id,name,status,tool_charge_type FROM products WHERE id=? AND product_type='tool' AND tool_slug=?" + (lock ? ' FOR UPDATE' : '')).bind(id, softwareToolSlug).first<Tool>();
  if (!row) throw new SoftwareError('软件工具不存在', 404); return row;
}
async function release(db: PointsDatabase, id: string, productId: number, lock = false) {
  if (!isSoftwareId(id)) throw new SoftwareError('版本参数不正确');
  const row = await db.prepare('SELECT * FROM tool_software_releases WHERE id=? AND product_id=?' + (lock ? ' FOR UPDATE' : '')).bind(id, productId).first<Row>();
  if (!row) throw new SoftwareError('软件版本不存在', 404); return row;
}
export async function softwareAdmin(productId: number): Promise<SoftwareAdmin> {
  const owner = await tool(env.DB, productId);
  try {
    const page = await env.DB.prepare('SELECT content_json FROM tool_software_pages WHERE product_id=?').bind(productId).first<{ content_json: string }>();
    const releases = (await env.DB.prepare('SELECT * FROM tool_software_releases WHERE product_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(productId).all<Row>()).results;
    return { initialized: true, storageReady: softwareStorage.ready(), tool: { id: productId, name: owner.name, status: owner.status, chargeType: owner.tool_charge_type }, page: content(page?.content_json), releases: releases.map(publicRelease) };
  } catch (error) { if (!missing(error)) throw error; return { initialized: false, storageReady: softwareStorage.ready(), tool: { id: productId, name: owner.name, status: owner.status, chargeType: owner.tool_charge_type }, page: content(undefined), releases: [] }; }
}
export async function publicSoftware(productId: number, free: boolean) {
  try {
    const page = await env.DB.prepare('SELECT content_json FROM tool_software_pages WHERE product_id=?').bind(productId).first<{ content_json: string }>();
    const versions = free ? (await env.DB.prepare("SELECT * FROM tool_software_releases WHERE product_id=? AND status IN ('published','archived') ORDER BY published_at DESC,id DESC LIMIT 5").bind(productId).all<Row>()).results : [];
    return { page: content(page?.content_json), release: versions.find(row => row.status === 'published') ? publicRelease(versions.find(row => row.status === 'published')!) : null, versions: versions.map(publicRelease), downloadReady: free && softwareStorage.ready() };
  } catch (error) { if (!missing(error)) throw error; return { page: content(undefined), release: null, versions: [] as SoftwareRelease[], downloadReady: false }; }
}
export async function saveSoftwarePage(productId: number, raw: unknown) {
  const page = parseSoftwarePage(raw);
  await env.DB.transaction(async db => {
    await tool(db, productId, true);
    await db.prepare('INSERT INTO tool_software_pages (product_id,content_json,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE content_json=VALUES(content_json),updated_at=VALUES(updated_at)').bind(productId, JSON.stringify(page), new Date().toISOString()).run();
  });
}
export async function createSoftwareRelease(productId: number, adminId: number, raw: Record<string, unknown>) {
  const fields = parseReleaseFields(raw), id = randomUUID(), now = new Date().toISOString();
  await env.DB.transaction(async db => {
    await tool(db, productId, true);
    if (await db.prepare('SELECT id FROM tool_software_releases WHERE product_id=? AND version=?').bind(productId, fields.version).first()) throw new SoftwareError('该版本号已存在，请编辑原草稿或使用新版本号', 409);
    await db.prepare("INSERT INTO tool_software_releases (id,product_id,version,supported_systems,release_notes,status,file_name,file_size,sha256,object_json,upload_token,upload_started_at,created_by,created_at,updated_at,published_at,download_requests) VALUES (?,?,?,?,?,'draft','',0,'','','','',?,?,?,'',0)").bind(id, productId, fields.version, fields.systems, fields.notes, adminId, now, now).run();
  }); return id;
}
export async function editSoftwareRelease(productId: number, id: string, raw: Record<string, unknown>) {
  const fields = parseReleaseFields(raw);
  await env.DB.transaction(async db => {
    await tool(db, productId, true); const row = await release(db, id, productId, true);
    if (row.status !== 'draft' || activeUpload(row)) throw new SoftwareError('仅可编辑未在上传的草稿版本', 409);
    const duplicate = await db.prepare('SELECT id FROM tool_software_releases WHERE product_id=? AND version=? AND id<>?').bind(productId, fields.version, id).first();
    if (duplicate) throw new SoftwareError('该版本号已存在', 409);
    await db.prepare('UPDATE tool_software_releases SET version=?,supported_systems=?,release_notes=?,updated_at=? WHERE id=? AND product_id=?').bind(fields.version, fields.systems, fields.notes, new Date().toISOString(), id, productId).expectChanges(1).run();
  });
}
export async function uploadSoftwareInstaller(productId: number, id: string, request: Request, rawName: string, size: number) {
  const name = installerName(rawName), token = randomUUID(); let old: Row | undefined;
  if (!softwareStorage.ready()) throw new SoftwareError('请先配置软件OSS存储', 503);
  await env.DB.transaction(async db => {
    await tool(db, productId, true); const row = await release(db, id, productId, true);
    if (row.status !== 'draft' || activeUpload(row)) throw new SoftwareError('该版本不能上传或已有上传进行中，请稍后刷新', 409);
    old = row; const now = new Date().toISOString();
    await db.prepare('UPDATE tool_software_releases SET upload_token=?,upload_started_at=?,updated_at=? WHERE id=? AND product_id=?').bind(token, now, now, id, productId).expectChanges(1).run();
  });
  let object: SoftwareObject | undefined;
  try {
    object = await softwareStorage.upload({ request, release: id, name, size });
    const uploaded = object;
    await env.DB.transaction(async db => {
      await tool(db, productId, true); const row = await release(db, id, productId, true);
      if (row.status !== 'draft' || row.upload_token !== token) throw new SoftwareError('上传任务状态已变化，请刷新版本列表', 409);
      await db.prepare("UPDATE tool_software_releases SET file_name=?,file_size=?,sha256=?,object_json=?,upload_token='',upload_started_at='',updated_at=? WHERE id=? AND product_id=? AND upload_token=?").bind(name, uploaded.size, uploaded.sha256, JSON.stringify(uploaded), new Date().toISOString(), id, productId, token).expectChanges(1).run();
    });
    if (old?.object_json && old.object_json !== JSON.stringify(object)) await softwareStorage.discard(JSON.parse(old.object_json), id);
    return { fileName: name, fileSize: object.size, sha256: object.sha256 };
  } catch (error) {
    // A committed response may be lost. Read back before discarding any cloud object.
    try {
      const saved = await release(env.DB, id, productId);
      if (object && saved.object_json === JSON.stringify(object)) return { fileName: saved.file_name, fileSize: saved.file_size, sha256: saved.sha256 };
      if (object) await softwareStorage.discard(object, id);
      await env.DB.prepare("UPDATE tool_software_releases SET upload_token='',upload_started_at='' WHERE id=? AND product_id=? AND upload_token=?").bind(id, productId, token).run();
    } catch { /* Unknown commit state: retain the private object and let the reservation expire. */ }
    throw error;
  }
}
export async function publishSoftwareRelease(productId: number, id: string) {
  const candidate = await release(env.DB, id, productId);
  if (!candidate.object_json || activeUpload(candidate)) throw new SoftwareError('请先完成EXE上传并校验后再发布', 409);
  await softwareStorage.verify(JSON.parse(candidate.object_json), id);
  await env.DB.transaction(async db => {
    const owner = await tool(db, productId, true), row = await release(db, id, productId, true);
    if (owner.status !== 'active' || owner.tool_charge_type !== 'free') throw new SoftwareError('请先启用该工具并设置为免费使用', 409);
    if (row.object_json !== candidate.object_json || activeUpload(row)) throw new SoftwareError('安装包已变化，请刷新后重新发布', 409);
    const now = new Date().toISOString();
    await db.prepare("UPDATE tool_software_releases SET status='archived',updated_at=? WHERE product_id=? AND status='published' AND id<>?").bind(now, productId, id).run();
    await db.prepare("UPDATE tool_software_releases SET status='published',published_at=?,updated_at=? WHERE id=? AND product_id=?").bind(now, now, id, productId).expectChanges(1).run();
  });
}
export async function unpublishSoftwareRelease(productId: number, id: string) {
  await env.DB.transaction(async db => { await tool(db, productId, true); const row = await release(db, id, productId, true); if (row.status !== 'published') throw new SoftwareError('该版本当前未发布', 409);
    await db.prepare("UPDATE tool_software_releases SET status='archived',updated_at=? WHERE id=? AND product_id=?").bind(new Date().toISOString(), id, productId).expectChanges(1).run(); });
}
export async function softwareDownload(id: string) {
  if (!isSoftwareId(id)) throw new SoftwareError('软件版本不存在', 404);
  const row = await env.DB.prepare("SELECT r.* FROM tool_software_releases r JOIN products p ON p.id=r.product_id WHERE r.id=? AND r.status='published' AND p.product_type='tool' AND p.tool_slug=? AND p.status='active' AND p.tool_charge_type='free'").bind(id, softwareToolSlug).first<Row>();
  if (!row?.object_json) throw new SoftwareError('该版本暂未开放下载', 404);
  const url = await softwareStorage.downloadUrl(JSON.parse(row.object_json), id);
  await env.DB.transaction(async db => {
    const owner = await tool(db, row.product_id, true), current = await release(db, id, row.product_id, true);
    if (owner.status !== 'active' || owner.tool_charge_type !== 'free' || current.status !== 'published' || current.object_json !== row.object_json) throw new SoftwareError('软件发布状态已变化，请刷新下载页', 409);
    await db.prepare('UPDATE tool_software_releases SET download_requests=download_requests+1 WHERE id=? AND product_id=?').bind(id, row.product_id).expectChanges(1).run();
  }); return url;
}
export function softwareFailure(error: unknown, publicMode = false) {
  const status = (error as { status?: number })?.status ?? (error instanceof SyntaxError || error instanceof URIError ? 400 : 503);
  return Response.json({ message: publicMode ? error instanceof SoftwareError && status < 500 ? error.message : '软件暂时无法下载，请稍后重试' : missing(error) ? '请先执行16号软件发布增量SQL' : error instanceof SoftwareError || (error as Error)?.name === 'SoftwareStorageError' ? (error as Error).message : status === 400 ? '发布参数格式不正确' : status === 403 ? '请从管理端发起软件发布' : '软件发布服务暂不可用，请检查服务器配置' }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
