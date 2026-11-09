import { createHash } from 'node:crypto';
import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { pointsBalance } from './points-service';
import { defaultAvatar, maskPhone, type Account, type AccountRecord, type AccountRecords } from './account';
import { signatureApi } from './signature-tool';

export class AccountError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const accountHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
type User = { id: number; phone: string; email: string; status: string; permission_type: string | number; created_at: string };
type Profile = { nickname: string; avatar_version: string };
function missingTable(error: unknown) { return (error as { code?: string })?.code === 'ER_NO_SUCH_TABLE'; }
export async function accountUser(request: Request): Promise<User | null> {
  let phone: string | null;
  try { phone = getVerifiedSessionPhone(request); } catch (error) { if (error instanceof URIError) return null; throw error; }
  if (!phone) return null;
  const row = await env.DB.prepare('SELECT id,phone,email,status,permission_type,created_at FROM users WHERE phone=?').bind(phone).first<User>();
  return row?.status === 'active' ? row : null;
}
export async function requireAccount(request: Request) {
  const user = await accountUser(request);
  if (!user) throw new AccountError('请登录后管理个人账户', 401);
  return user;
}
export async function readAccount(request: Request): Promise<Account> {
  const user = await accountUser(request);
  if (!user) return { authenticated: false, user: null, pointsBalance: null };
  let profile: Profile | null = null, profileReady = true;
  try { profile = await env.DB.prepare('SELECT nickname,avatar_version FROM yxshop_user_profiles WHERE user_id=?').bind(user.id).first<Profile>(); }
  catch (error) { if (!missingTable(error)) throw error; profileReady = false; }
  let balance: number | null = null, pointsMessage = '';
  try { balance = await pointsBalance(Number(user.id)); }
  catch (error) { console.error('账户积分读取失败', (error as { code?: string })?.code || 'unavailable'); pointsMessage = '积分暂不可用，请稍后刷新'; }
  return {
    authenticated: true, profileReady, pointsBalance: balance, ...(pointsMessage ? { pointsMessage } : {}),
    user: { id: Number(user.id), nickname: profile?.nickname || `用户${user.phone.slice(-4)}`, phone: user.phone, maskedPhone: maskPhone(user.phone), email: user.email,
      avatarUrl: profile?.avatar_version ? `/api/account/avatar?v=${encodeURIComponent(profile.avatar_version)}` : defaultAvatar,
      isAdmin: String(user.permission_type) === '10002', isTechnician: String(user.permission_type) === '10003', createdAt: user.created_at },
  };
}

// 每次保存包含资料和头像，验证完成后在同一事务提交，不产生未保存的上传文件。
export function validateAvatar(value: unknown) {
  if (!value || typeof value !== 'object') throw new AccountError('头像格式不正确');
  const { data, mime } = value as { data?: unknown; mime?: unknown };
  if (typeof data !== 'string' || typeof mime !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new AccountError('头像格式不正确');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString('base64') !== data) throw new AccountError('头像不能超过 1MB，请重新选择图片');
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR';
  let jpeg = false;
  if (mime === 'image/jpeg' && bytes.length > 16 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    let cursor = 2, frame = false;
    while (cursor + 4 <= bytes.length) {
      if (bytes[cursor++] !== 255) break;
      while (bytes[cursor] === 255) cursor++;
      const marker = bytes[cursor++];
      if (cursor + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(cursor);
      if (length < 2 || cursor + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if (length < 8) break;
        const height = bytes.readUInt16BE(cursor + 3), width = bytes.readUInt16BE(cursor + 5);
        if (!width || !height || width > 4096 || height > 4096) throw new AccountError('头像尺寸不能超过 4096 像素');
        frame = true;
      }
      if (marker === 218) { jpeg = frame; break; }
      cursor += length;
    }
  }
  // 头像只接受栅格 PNG/JPEG，拒绝 SVG、HTML 和 MIME 伪装；客户端同时解码并缩小图片。
  if (!(mime === 'image/png' && png || mime === 'image/jpeg' && jpeg)) throw new AccountError('头像仅支持有效的 PNG、JPG 图片');
  if (png && (bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096 || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20))) throw new AccountError('头像尺寸不能超过 4096 像素');
  return { data, mime, version: createHash('sha256').update(bytes).digest('hex') };
}
export async function saveAccountProfile(request: Request) {
  const user = await requireAccount(request);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AccountError('请使用 JSON 提交个人资料', 415);
  const limit = 1500000;
  if (Number(request.headers.get('content-length')) > limit) throw new AccountError('头像或资料过大', 413);
  const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new AccountError('头像或资料过大', 413); } chunks.push(value); } }
    finally { reader.releaseLock(); }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const body = JSON.parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccountError('资料格式不正确');
  // 只接受资料白名单，前端不能修改手机号、身份权限、积分或其他用户资料。
  if (typeof body.nickname !== 'string' || !body.nickname.trim() || [...body.nickname.trim()].length > 32 || /[\p{Cc}\p{Cf}]/u.test(body.nickname)) throw new AccountError('昵称需为 1～32 个字符');
  if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new AccountError('请填写正确的联系邮箱');
  if (body.removeAvatar !== undefined && typeof body.removeAvatar !== 'boolean') throw new AccountError('头像参数不正确');
  if (body.avatar && body.removeAvatar) throw new AccountError('不能同时上传和移除头像');
  const avatar = body.avatar !== undefined ? validateAvatar(body.avatar) : null;
  const now = new Date().toISOString();
  await env.DB.transaction(async db => {
    const active = await db.prepare("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE").bind(user.id).first();
    if (!active) throw new AccountError('账户已失效，请重新登录', 401);
    const old = await db.prepare('SELECT avatar_data,avatar_mime,avatar_version FROM yxshop_user_profiles WHERE user_id=?').bind(user.id).first<{ avatar_data: string; avatar_mime: string; avatar_version: string }>();
    const data = avatar?.data ?? (body.removeAvatar ? '' : old?.avatar_data || '');
    const mime = avatar?.mime ?? (body.removeAvatar ? '' : old?.avatar_mime || '');
    const version = avatar?.version ?? (body.removeAvatar ? '' : old?.avatar_version || '');
    await db.prepare('INSERT INTO yxshop_user_profiles (user_id,nickname,avatar_data,avatar_mime,avatar_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nickname=VALUES(nickname),avatar_data=VALUES(avatar_data),avatar_mime=VALUES(avatar_mime),avatar_version=VALUES(avatar_version),updated_at=VALUES(updated_at)').bind(user.id, body.nickname.trim(), data, mime, version, now, now).run();
    await db.prepare('UPDATE users SET email=? WHERE id=?').bind(body.email.trim(), user.id).run();
  });
}

type RecordRow = { id: string; title: string; kind: string; status: string; created_at: string; amount?: number | null };
function recordHref(row: RecordRow) {
  const id = encodeURIComponent(row.id);
  if (row.kind.startsWith('site:')) return `/tools/${encodeURIComponent(row.kind.slice(5))}.html?run=${id}`;
  switch (row.kind) {
    case 'technical': return `/service-orders/${id}`;
    case 'video': return `/tools/video-extractor.html?task=${id}`;
    case 'stamp': return `/tools/stamp-maker.html?result=${id}`;
    case 'signature': return row.status === 'ready' ? `${signatureApi}/${id}?kind=signature` : null;
    case 'signed-document': return row.status === 'ready' ? `${signatureApi}/${id}` : null;
    default: return `/checkout/${id}`;
  }
}

export async function readAccountRecords(userId: number, group: 'orders' | 'activity', requested = 1, filter = 'all'): Promise<AccountRecords> {
  const warnings = new Set<string>(), sources: { sql: string; args: unknown[]; warning?: string }[] = [];
  if (group === 'orders') {
    if (['all','mall','points'].includes(filter)) sources.push({ sql: `SELECT o.id,p.name AS title,CASE WHEN p.product_type='points' THEN 'points' ELSE 'mall' END AS kind,o.status,o.created_at,o.amount FROM orders o JOIN products p ON p.id=o.product_id WHERE o.user_id=?${filter === 'points' ? " AND p.product_type='points'" : filter === 'mall' ? " AND p.product_type<>'points'" : ''}`, args: [userId] });
    if (['all','technical'].includes(filter)) sources.push({ sql: "SELECT o.id,COALESCE(s.title,'技术服务') AS title,'technical' AS kind,o.status,o.created_at,o.amount FROM technical_service_orders o LEFT JOIN technical_services s ON s.id=o.service_id WHERE o.user_id=?", args: [userId] });
  } else {
    if (['all','video'].includes(filter)) sources.push({ sql: "SELECT id,title,'video' AS kind,status,created_at,NULL AS amount FROM video_extraction_tasks WHERE user_id=?", args: [userId] });
    if (['all','stamp'].includes(filter)) sources.push({ sql: "SELECT id,'印章制作' AS title,'stamp' AS kind,'ready' AS status,created_at,NULL AS amount FROM tool_generation_results WHERE user_id=?", args: [userId] });
    if (['all','site'].includes(filter)) sources.push({ sql: "SELECT r.id,CONCAT('站长分析 · ',r.host) AS title,CONCAT('site:',p.tool_slug) AS kind,r.status,r.created_at,NULL AS amount FROM site_analysis_runs r JOIN products p ON p.id=r.product_id WHERE r.user_id=?", args: [userId] });
    if (['all','signature'].includes(filter)) {
      sources.push({
        sql: "SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_general_ci AS id,name AS title,'signature' AS kind,CASE WHEN deleted_at IS NULL THEN 'ready' ELSE 'deleted' END AS status,created_at,NULL AS amount FROM document_signatures WHERE user_id=?",
        args: [userId], warning: '文件签名记录尚未初始化',
      }, {
        sql: "SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_general_ci AS id,file_name AS title,'signed-document' AS kind,CASE WHEN expires_at<=? THEN 'expired' ELSE 'ready' END AS status,created_at,NULL AS amount FROM signed_documents WHERE user_id=?",
        args: [new Date().toISOString(), userId], warning: '文件签名记录尚未初始化',
      });
    }
  }
  if (!sources.length) throw new AccountError('记录筛选条件不正确');
  // 各模块独立查询以兼容尚未初始化的历史模块；真正查询失败不会伪装成空记录。
  const usable: typeof sources = []; let total = 0;
  for (const source of sources) {
    try { const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM (${source.sql}) account_records`).bind(...source.args).first<{ total: number }>(); total += Number(count?.total || 0); usable.push(source); }
    catch (error) { if (!missingTable(error)) throw error; warnings.add(source.warning || (source.sql.includes('site_analysis_runs') ? '站长分析记录尚未初始化' : source.sql.includes('video_extraction') ? '视频记录尚未初始化' : source.sql.includes('tool_generation') ? '印章记录尚未初始化' : '部分订单记录尚未初始化')); }
  }
  const pageSize = 10, page = Math.max(1, Math.min(Math.ceil(total / pageSize) || 1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  const rows = usable.length ? (await env.DB.prepare(`SELECT * FROM (${usable.map(s => s.sql).join(' UNION ALL ')}) account_records ORDER BY created_at DESC,kind,id DESC LIMIT 10 OFFSET ?`).bind(...usable.flatMap(s => s.args), (page - 1) * pageSize).all<RecordRow>()).results : [];
  const items: AccountRecord[] = rows.map(row => ({ id: row.id, title: row.title, kind: row.kind.startsWith('site:') ? 'site' : row.kind, status: row.status, createdAt: row.created_at, ...(group === 'orders' ? { amount: row.amount === null ? null : Number(row.amount) } : {}),
    href: recordHref(row) }));
  return { items, total, page, pageSize, warnings: [...warnings] };
}
export function accountFailure(error: unknown) {
  if (error instanceof AccountError) return Response.json({ message: error.message }, { status: error.status, headers: accountHeaders });
  if (error instanceof SyntaxError) return Response.json({ message: '资料格式不正确' }, { status: 400, headers: accountHeaders });
  console.error('个人中心服务失败', (error as { code?: string })?.code || (error as Error)?.name);
  return Response.json({ message: missingTable(error) ? '个人资料尚未初始化，请管理员执行 09 个人中心增量 SQL' : '账户服务暂不可用，请稍后重试' }, { status: 503, headers: accountHeaders });
}
