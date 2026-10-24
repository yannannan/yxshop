import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { consumePoints, lockPointsUser, pointsBalance, PointsError } from './points-service';
import { usableToolOrder, type ToolOrderAccess } from './tool-entitlements';
import { materializeVideo, videoEngineHealth, videoTaskDirectory } from './video-engine';
import { VideoError, videoRetentionHours, type VideoAccess, type VideoFormat, type VideoInfo, type VideoPreview, type VideoTask } from './video-options';
import { videoObjectStorage, VideoStorageError, type StoredVideo } from './video-object-storage.mjs';
import { cleanVideoStorage, removeLocalVideoCopy } from './video-storage-cleanup.mjs';

export type VideoTool = { id: number; tool_charge_type: string; tool_points_cost: number };
type TaskRow = { id: string; user_id: number; product_id: number; request_hash: string; title: string; format_label: string; format_json: string; billing_mode: string; points_cost: number; status: VideoTask['status']; progress: number; file_extension: string; file_size: number; charged: number; points_spent: number; error_message: string; created_at: string; updated_at: string; expires_at: string };
function publicTask(row: TaskRow): VideoTask {
  let permanent = false;
  try { const storage = JSON.parse(row.format_json).storage; permanent = storage?.provider === 'oss' && storage.retention === 'permanent' && !storage.deletedAt; } catch { /* 历史记录仍可显示，下载时严格校验。 */ }
  return { id: row.id, title: row.title, status: row.status, format: row.format_label, extension: row.file_extension, size: Number(row.file_size), progress: Number(row.progress), error: row.error_message, createdAt: row.created_at, expiresAt: row.expires_at, permanent, charged: Boolean(row.charged), pointsSpent: Number(row.points_spent), downloadUrl: row.status === 'ready' ? `/api/tools/video-extractor/download?id=${row.id}` : '' };
}
export async function getVideoTool() {
  const tool = await env.DB.prepare("SELECT id,tool_charge_type,tool_points_cost FROM products WHERE tool_slug='video-extractor' AND product_type='tool' AND status='active'").first<VideoTool>();
  if (!tool) throw new VideoError('视频工具不存在或已停用', 404);
  if (!['free', 'paid', 'points', 'pending'].includes(tool.tool_charge_type)) throw new VideoError('视频工具收费配置异常', 409);
  return tool;
}
export async function videoUser(request: Request) {
  const phone = getVerifiedSessionPhone(request);
  return phone ? env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>() : null;
}
async function ordersFor(userId: number, productId: number) {
  return (await env.DB.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining,tool_plan_name FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id").bind(userId, productId).all<ToolOrderAccess>()).results.filter(order => usableToolOrder(order)).sort((a, b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'));
}
export async function videoAccess(tool: VideoTool, user: { id: number } | null, requestedPage = 1): Promise<VideoAccess> {
  scheduleVideoCleanup();
  const storage = videoObjectStorage.readiness();
  const rights = user && ['paid', 'points'].includes(tool.tool_charge_type) ? await ordersFor(user.id, tool.id) : [];
  const wallet = user && tool.tool_charge_type === 'points' ? await pointsBalance(user.id) : 0;
  const count = user ? await env.DB.prepare('SELECT COUNT(*) AS total FROM video_extraction_tasks WHERE user_id=? AND product_id=?').bind(user.id, tool.id).first<{ total: number }>() : null;
  const total = Number(count?.total || 0), page = Math.max(1, Math.min(Math.ceil(total / 5) || 1, Math.floor(requestedPage) || 1));
  const rows = user ? (await env.DB.prepare('SELECT * FROM video_extraction_tasks WHERE user_id=? AND product_id=? ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET ?').bind(user.id, tool.id, (page - 1) * 5).all<TaskRow>()).results : [];
  for (let index = 0; index < rows.length; index++) if (rows[index].status === 'processing') rows[index] = await ownedVideoTask(user!.id, rows[index].id);
  for (const row of rows.filter(row => row.status === 'queued')) startVideoTask(row.id, Number(row.user_id));
  return { signedIn: Boolean(user), chargeType: tool.tool_charge_type, canExtract: storage.ready && Boolean(user) && (tool.tool_charge_type === 'free' || rights.length > 0 && ['paid', 'points'].includes(tool.tool_charge_type) || tool.tool_charge_type === 'points' && Number(tool.tool_points_cost) > 0 && wallet >= Number(tool.tool_points_cost)), storageProvider: storage.provider, storageReady: storage.ready, storageMessage: storage.message, pointsBalance: wallet, pointsCost: Number(tool.tool_points_cost), remaining: rights.reduce((sum, row) => sum + (row.tool_billing_cycle === 'times' ? Number(row.tool_uses_remaining) : 0), 0), membershipName: rights[0]?.tool_plan_name || (rights[0] ? rights[0].tool_billing_cycle === 'times' ? '按次权益' : '有效会员' : ''), purchaseUrl: tool.tool_charge_type === 'points' ? '/points' : `/product/${tool.id}`, ...await videoEngineHealth(), history: rows.map(publicTask), page, total };
}
export async function videoPreviewLimit(userId: number) {
  const since = new Date(Date.now() - 3600000).toISOString();
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM video_extraction_previews WHERE user_id=? AND created_at>=?').bind(userId, since).first<{ total: number }>();
  if (Number(count?.total || 0) >= 30) throw new VideoError('本小时解析次数较多，请稍后再试', 429);
}
type AnalysisWindow = { active: number; attempts: number; startsAt: number };
const analysisUsers = new Map<number, AnalysisWindow>();
let activeAnalyses = 0;
// 失败的解析也计入进程内限流，防止反复无效链接占满解析子进程。
export function beginVideoAnalysis(userId: number) {
  const now = Date.now();
  for (const [id, window] of analysisUsers) if (!window.active && now - window.startsAt >= 3600000) analysisUsers.delete(id);
  const window = analysisUsers.get(userId) || { active: 0, attempts: 0, startsAt: now };
  if (window.attempts >= 30 || window.active >= 2 || activeAnalyses >= 8) throw new VideoError('当前解析请求较多，请稍后再试', 429);
  analysisUsers.set(userId, window); window.active++; window.attempts++; activeAnalyses++;
  let released = false;
  return () => { if (!released) { released = true; window.active--; activeAnalyses--; } };
}
export async function saveVideoPreview(userId: number, tool: VideoTool, info: VideoInfo): Promise<VideoPreview> {
  const id = crypto.randomUUID(), now = new Date().toISOString(), expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
  await env.DB.prepare('INSERT INTO video_extraction_previews (id,user_id,product_id,source_url,metadata_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(id, userId, tool.id, info.sourceUrl, JSON.stringify(info), now, expiresAt).run();
  return { id, title: info.title, source: info.source, sourceUrl: info.sourceUrl, duration: info.duration, expiresAt, coverUrl: info.thumbnail ? `/api/tools/video-extractor?cover=${id}` : '', formats: info.formats.map(({ parts: _private, ...format }) => { void _private; return format; }) };
}
export async function videoPreviewRecord(userId: number, id: string) {
  const row = await env.DB.prepare('SELECT * FROM video_extraction_previews WHERE id=? AND user_id=?').bind(id, userId).first<{ id: string; user_id: number; product_id: number; metadata_json: string; expires_at: string }>();
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new VideoError('解析结果已过期，请重新解析链接', 410);
  return row;
}
export async function queueVideoTask(userId: number, tool: VideoTool, id: string, previewId: string, formatId: string) {
  const hash = createHash('sha256').update(JSON.stringify({ previewId, formatId })).digest('hex');
  // 预检在用户锁之外；最终扣费仍在 finishVideoTask 的事务中复核。
  const access = await videoAccess(tool, { id: userId });
  const task = await env.DB.transaction(async db => {
    await lockPointsUser(db, userId);
    const existing = await db.prepare('SELECT * FROM video_extraction_tasks WHERE id=? FOR UPDATE').bind(id).first<TaskRow>();
    if (existing) {
      if (Number(existing.user_id) !== userId || Number(existing.product_id) !== tool.id || existing.request_hash !== hash) throw new VideoError('提取任务与当前请求不匹配，请重新发起', 409);
      return publicTask(existing);
    }
    if (access.storageReady === false) throw new VideoStorageError(access.storageMessage || '视频存储尚未配置，请联系管理员');
    if (tool.tool_charge_type === 'pending') throw new VideoError('收费方式待确认，暂未开放提取', 409);
    if (!access.canExtract) throw new VideoError(tool.tool_charge_type === 'points' ? '积分不足，请充值后提取' : '暂无有效套餐，请购买后提取', 402);
    const now = new Date().toISOString();
    await db.prepare("UPDATE video_extraction_tasks SET status='failed',error_message=?,updated_at=? WHERE user_id=? AND status='processing' AND updated_at<?").bind('处理已中断，请重新提取；本次未扣费', now, userId, new Date(Date.now() - 10 * 60000).toISOString()).run();
    const count = await db.prepare("SELECT COUNT(*) AS total FROM video_extraction_tasks WHERE user_id=? AND status IN ('queued','processing')").bind(userId).first<{ total: number }>();
    if (Number(count?.total || 0) >= 2) throw new VideoError('已有视频正在提取，请完成后再试', 429);
    const preview = await videoPreviewRecord(userId, previewId);
    if (Number(preview.product_id) !== tool.id) throw new VideoError('解析结果与当前工具不匹配', 409);
    const info = JSON.parse(preview.metadata_json) as VideoInfo, format = info.formats.find(item => item.id === formatId);
    if (!format) throw new VideoError('所选画质不可用，请重新解析', 409);
    const expiresAt = new Date(Date.now() + videoRetentionHours * 3600000).toISOString();
    await db.prepare("INSERT INTO video_extraction_tasks (id,user_id,product_id,request_hash,title,format_label,format_json,billing_mode,points_cost,status,progress,file_extension,file_size,charged,points_spent,billing_order_id,error_message,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,'queued',0,?,0,0,0,'','',?,?,?)").bind(id, userId, tool.id, hash, info.title, format.label, JSON.stringify(format), tool.tool_charge_type, tool.tool_points_cost || 0, format.extension, now, now, expiresAt).run();
    return { id, title: info.title, status: 'queued' as const, format: format.label, extension: format.extension, size: 0, progress: 0, error: '', createdAt: now, expiresAt, charged: false, pointsSpent: 0, downloadUrl: '' };
  });
  if (task.status === 'queued') startVideoTask(id, userId);
  return task;
}
export async function ownedVideoTask(userId: number, id: string) {
  const row = await env.DB.prepare('SELECT * FROM video_extraction_tasks WHERE id=? AND user_id=?').bind(id, userId).first<TaskRow>();
  if (!row) throw new VideoError('视频任务不存在或不属于当前账号', 404);
  if (row.status === 'processing' && Date.parse(row.updated_at) < Date.now() - 10 * 60000) {
    const update = await env.DB.prepare("UPDATE video_extraction_tasks SET status='failed',error_message=?,updated_at=? WHERE id=? AND status='processing' AND updated_at=?").bind('处理已中断，请重新提取；本次未扣费', new Date().toISOString(), id, row.updated_at).run();
    if (update.meta.changes !== 1) return ownedVideoTask(userId, id);
    row.status = 'failed'; row.error_message = '处理已中断，请重新提取；本次未扣费';
  }
  return row;
}
export async function readVideoTask(userId: number, id: string) {
  const row = await ownedVideoTask(userId, id);
  if (row.status === 'queued') startVideoTask(id, userId);
  return publicTask(row);
}
export async function finishVideoTask(userId: number, id: string, size: number, stored: StoredVideo | null = null) {
  return env.DB.transaction(async db => {
    await lockPointsUser(db, userId);
    const task = await db.prepare('SELECT * FROM video_extraction_tasks WHERE id=? AND user_id=? FOR UPDATE').bind(id, userId).first<TaskRow>();
    if (!task) throw new VideoError('视频任务不存在', 404);
    if (task.status === 'ready') return publicTask(task);
    if (task.status !== 'processing') throw new VideoError('提取任务状态已变化，请刷新后重试', 409);
    if (Date.parse(task.expires_at) <= Date.now() || !Number.isSafeInteger(size) || size <= 0) throw new VideoError('任务已过期或文件无效；本次未扣费', 410);
    const formatJson = stored ? JSON.stringify({ ...JSON.parse(task.format_json), storage: stored }) : task.format_json;
    if (stored) videoObjectStorage.readRecord({ ...task, file_size: size, format_json: formatJson });
    const tool = await db.prepare("SELECT id,tool_charge_type,tool_points_cost FROM products WHERE id=? AND product_type='tool' AND tool_slug='video-extractor' AND status='active' FOR UPDATE").bind(task.product_id).first<VideoTool>();
    if (!tool || tool.tool_charge_type !== task.billing_mode || tool.tool_charge_type === 'points' && Number(tool.tool_points_cost) !== Number(task.points_cost)) throw new VideoError('工具配置已变化，请重新解析提取；本次未扣费', 409);
    let order: ToolOrderAccess | undefined, charged = false, pointsSpent = 0;
    if (['paid', 'points'].includes(tool.tool_charge_type)) {
      const { results } = await db.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id FOR UPDATE").bind(userId, task.product_id).all<ToolOrderAccess>();
      order = results.filter(item => usableToolOrder(item)).sort((a, b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'))[0];
      if (order) {
        charged = order.tool_billing_cycle === 'times';
        if (charged) await db.prepare('UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND tool_uses_remaining>0').bind(order.id, userId).expectChanges(1).run();
        await db.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)').bind(`video:${id}`, order.id, new Date().toISOString()).run();
      } else if (tool.tool_charge_type === 'points') {
        const points = await consumePoints(db, userId, Number(task.product_id), Number(tool.tool_points_cost), `video:${id}`); charged = points.charged; pointsSpent = points.pointsSpent;
      } else throw new VideoError('会员已到期或次数不足，请续购后重试；本次未扣费', 402);
    } else if (tool.tool_charge_type !== 'free') throw new VideoError('该工具暂未开放提取', 409);
    const now = new Date().toISOString();
    if (stored) await db.prepare("UPDATE video_extraction_tasks SET status='ready',progress=100,file_size=?,charged=?,points_spent=?,billing_order_id=?,updated_at=?,format_json=? WHERE id=?").bind(size, charged ? 1 : 0, pointsSpent, order?.id || '', now, formatJson, id).run();
    else await db.prepare("UPDATE video_extraction_tasks SET status='ready',progress=100,file_size=?,charged=?,points_spent=?,billing_order_id=?,updated_at=? WHERE id=?").bind(size, charged ? 1 : 0, pointsSpent, order?.id || '', now, id).run();
    return publicTask({ ...task, format_json: formatJson, status: 'ready', progress: 100, file_size: size, charged: charged ? 1 : 0, points_spent: pointsSpent });
  });
}

type Work = { ids: Set<string>; queue: { id: string; userId: number }[]; running: number; cleanupTimer?: ReturnType<typeof setInterval> };
const runtime = globalThis as typeof globalThis & { __yxshopVideoWork?: Work };
const work = runtime.__yxshopVideoWork ??= { ids: new Set(), queue: [], running: 0 };
function scheduleVideoCleanup() {
  if (work.cleanupTimer) return;
  void cleanVideoFiles().catch(() => { console.error('视频临时文件清理暂不可用，稍后重试'); });
  work.cleanupTimer = setInterval(() => { void cleanVideoFiles().catch(() => { console.error('视频临时文件定时清理失败，稍后重试'); }); }, 15 * 60000);
  work.cleanupTimer.unref();
}
export function startVideoTask(id: string, userId: number) {
  scheduleVideoCleanup();
  if (work.ids.has(id)) return;
  work.ids.add(id); work.queue.push({ id, userId }); drainVideoTasks();
}
function drainVideoTasks() {
  while (work.running < 2 && work.queue.length) {
    const task = work.queue.shift()!; work.running++;
    void runVideoTask(task.id, task.userId).catch(() => {}).finally(() => { work.running--; work.ids.delete(task.id); drainVideoTasks(); });
  }
}
async function runVideoTask(id: string, userId: number) {
  const claimed = await env.DB.prepare("UPDATE video_extraction_tasks SET status='processing',progress=1,updated_at=? WHERE id=? AND user_id=? AND status='queued'").bind(new Date().toISOString(), id, userId).run();
  if (claimed.meta.changes !== 1) return;
  let file: { path: string; size: number } | null = null;
  let stored: StoredVideo | null = null;
  const cloudRequested = videoObjectStorage.readiness().provider === 'oss';
  try {
    const task = await ownedVideoTask(userId, id);
    if (Date.parse(task.expires_at) <= Date.now()) throw new VideoError('任务已过期，请重新解析链接', 410);
    let updated = 0;
    file = await materializeVideo(id, JSON.parse(task.format_json) as VideoFormat, progress => {
      if (Date.now() - updated < 1500) return;
      updated = Date.now();
      void env.DB.prepare("UPDATE video_extraction_tasks SET progress=?,updated_at=? WHERE id=? AND status='processing'").bind(progress, new Date().toISOString(), id).run().catch(() => {});
    });
    stored = await videoObjectStorage.upload({ ...file, userId, id, extension: task.file_extension });
    await finishVideoTask(userId, id, file.size, stored);
    if (stored) await discardUploadedLocalCopy(id, userId);
  } catch (error) {
    // 提交响应丢失时先确认状态，不能删除一份可能已成功扣费的文件。
    const persisted = await env.DB.prepare('SELECT status,format_json,file_size,user_id,id,file_extension FROM video_extraction_tasks WHERE id=? AND user_id=?').bind(id, userId).first<TaskRow>().catch(() => null);
    if (persisted?.status === 'ready') {
      if (stored) {
        const committed = videoObjectStorage.readRecord(persisted);
        if (committed?.key === stored.key && committed.bucket === stored.bucket) await discardUploadedLocalCopy(id, userId);
      }
      return;
    }
    if (stored && persisted) await videoObjectStorage.remove(stored).catch(() => { console.error('未完成视频云文件回收失败', id); });
    const message = error instanceof VideoError || error instanceof PointsError || error instanceof VideoStorageError ? error.message : '提取失败，请重新解析后重试；本次未扣费';
    await env.DB.prepare("UPDATE video_extraction_tasks SET status='failed',error_message=?,updated_at=? WHERE id=? AND status<>'ready'").bind(message.slice(0, 500), new Date().toISOString(), id).run();
    // 已确认未完成的云任务不收费，临时文件也立即回收；数据库结果不确定时留待清理重试。
    if (persisted && (file || cloudRequested)) await removeLocalVideoCopy(id).catch(() => { console.error('未完成视频临时文件稍后重试清理', id); });
  } finally {
    void cleanVideoFiles().catch(() => {});
  }
}
async function discardUploadedLocalCopy(id: string, userId: number) {
  try {
    await removeLocalVideoCopy(id);
    await env.DB.prepare("UPDATE video_extraction_tasks SET format_json=JSON_SET(format_json,'$.storage.localDeletedAt',?) WHERE id=? AND user_id=? AND status='ready'").bind(new Date().toISOString(), id, userId).run();
  } catch { console.error('视频已保存 OSS，本地副本稍后重试清理', id); }
}
let cleaning: Promise<void> | null = null;
export async function cleanVideoFiles() {
  if (cleaning) return cleaning;
  cleaning = cleanVideoStorage(env.DB, { retentionHours: videoRetentionHours }).then(() => {}).finally(() => { cleaning = null; });
  return cleaning;
}
export async function videoDownloadFile(userId: number, id: string) {
  const task = await ownedVideoTask(userId, id);
  if (task.status !== 'ready') throw new VideoError('视频尚未提取完成', 409);
  if (!['mp4', 'webm', 'mov'].includes(task.file_extension)) throw new VideoError('文件信息不正确', 409);
  const storage = videoObjectStorage.readRecord(task);
  if (storage) return { path: '', size: Number(task.file_size), task, storage };
  if (Date.parse(task.expires_at) <= Date.now()) throw new VideoError('文件保存期限已过，请重新提取；读取文件不会扣费', 410);
  const path = join(videoTaskDirectory(id), `result.${task.file_extension}`);
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) throw new VideoError('视频文件已失效，读取文件不会扣费', 410);
  return { path, size: file.size, task, storage: null };
}
