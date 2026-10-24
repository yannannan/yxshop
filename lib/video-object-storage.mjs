import OSS from 'ali-oss';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const extensions = ['mp4', 'webm', 'mov'];
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const validBucket = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
const validRegion = value => typeof value === 'string' && /^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value);
const validPrefix = value => typeof value === 'string' && value.length <= 160 && /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value);
const mimeType = extension => extension === 'webm' ? 'video/webm' : extension === 'mov' ? 'video/quicktime' : 'video/mp4';

export class VideoStorageError extends Error {
  constructor(message, status = 503) { super(message); this.name = 'VideoStorageError'; this.status = status; }
}

function validateObject(object) {
  if (!object || object.provider !== 'oss' || object.retention !== 'permanent' || !validBucket(object.bucket) || !validRegion(object.region) || typeof object.key !== 'string' || !/^[a-zA-Z0-9_/-]+\/result\.(mp4|webm|mov)$/.test(object.key) || !Number.isSafeInteger(object.size) || object.size <= 0 || !/^[a-f0-9]{64}$/.test(object.sha256)) throw new VideoStorageError('视频云存储记录异常', 409);
  if (object.deletedAt) throw new VideoStorageError('视频文件已过期，请重新提取', 410);
  return object;
}

function assertOwner(object, userId, id, extension) {
  validateObject(object);
  const suffix = `/users/${userId}/${id}/result.${extension}`;
  if (!Number.isSafeInteger(userId) || userId <= 0 || !validId(id) || !extensions.includes(extension) || !object.key.endsWith(suffix) || !validPrefix(object.key.slice(0, -suffix.length))) throw new VideoStorageError('视频云文件与当前任务不匹配', 409);
  return object;
}

async function fileDigests(path, size) {
  const info = await stat(path);
  if (!info.isFile() || info.size !== size || !Number.isSafeInteger(size) || size <= 0) throw new VideoStorageError('本地视频文件无效，本次未扣费', 409);
  const md5 = createHash('md5'), sha256 = createHash('sha256');
  // 分块计算和上传，避免将整段视频读入 Node 内存。
  for await (const chunk of createReadStream(path)) { md5.update(chunk); sha256.update(chunk); }
  return { md5: md5.digest('base64'), sha256: sha256.digest('hex') };
}

export function createVideoObjectStorage({ environment = () => process.env, createClient = options => new OSS(options), sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  function credentials() {
    const env = environment();
    if (!env.VIDEO_OSS_ACCESS_KEY_ID?.trim() || !env.VIDEO_OSS_ACCESS_KEY_SECRET?.trim()) throw new VideoStorageError('视频 OSS 凭据未配置，请联系管理员');
    return { accessKeyId: env.VIDEO_OSS_ACCESS_KEY_ID.trim(), accessKeySecret: env.VIDEO_OSS_ACCESS_KEY_SECRET.trim(), ...(env.VIDEO_OSS_STS_TOKEN?.trim() ? { stsToken: env.VIDEO_OSS_STS_TOKEN.trim() } : {}) };
  }
  function settings() {
    const env = environment(), driver = env.VIDEO_STORAGE_DRIVER || 'oss';
    if (!['local', 'oss'].includes(driver)) throw new VideoStorageError('视频存储模式配置错误，请联系管理员');
    if (driver === 'local') return null;
    const bucket = env.VIDEO_OSS_BUCKET?.trim(), region = env.VIDEO_OSS_REGION?.trim().replace(/\.aliyuncs\.com$/, ''), prefix = (env.VIDEO_OSS_PREFIX || 'yxshop/video-extractions').replace(/^\/+|\/+$/g, '');
    if (!validBucket(bucket) || !validRegion(region) || !validPrefix(prefix)) throw new VideoStorageError('视频 OSS 的 Bucket、地域或目录尚未正确配置');
    credentials();
    return { bucket, region, prefix };
  }
  function clientFor(object, internal = false) {
    return createClient({ ...credentials(), bucket: object.bucket, region: object.region, secure: true, authorizationV4: true, internal, timeout: 180000, retryMax: 0 });
  }
  function readiness() {
    try { const config = settings(); return { provider: config ? 'oss' : 'local', ready: true, message: '' }; }
    catch { return { provider: 'oss', ready: false, message: '视频云存储暂不可用，请稍后重试或联系管理员' }; }
  }
  function readRecord(task) {
    let format;
    try { format = JSON.parse(task.format_json); } catch { throw new VideoStorageError('视频存储记录损坏', 409); }
    if (!format || typeof format !== 'object' || Array.isArray(format)) throw new VideoStorageError('视频存储记录损坏', 409);
    if (!format.storage) return null; // 升级前的本地成品继续按原路径下载。
    const object = assertOwner(format.storage, Number(task.user_id), task.id, task.file_extension);
    if (object.size !== Number(task.file_size)) throw new VideoStorageError('视频云文件大小与记录不匹配', 409);
    return object;
  }
  function verifyHead(head, object, userId, id) {
    const headers = head.res?.headers || {};
    const meta = head.meta || {};
    if (Number(headers['content-length']) !== object.size || (headers['x-oss-meta-yxshop-sha256'] || meta['yxshop-sha256']) !== object.sha256 || String(headers['x-oss-meta-yxshop-user'] || meta['yxshop-user']) !== String(userId) || (headers['x-oss-meta-yxshop-task'] || meta['yxshop-task']) !== id) throw new VideoStorageError('OSS 文件校验未通过，本次未扣费', 409);
  }
  async function upload({ path, size, userId, id, extension }) {
    const config = settings();
    if (!config) return null;
    if (!Number.isSafeInteger(userId) || userId <= 0 || !validId(id) || !extensions.includes(extension)) throw new VideoStorageError('视频上传任务不正确', 409);
    const hashes = await fileDigests(path, size);
    const object = { provider: 'oss', retention: 'permanent', bucket: config.bucket, region: config.region, key: `${config.prefix}/users/${userId}/${id}/result.${extension}`, size, sha256: hashes.sha256 };
    const client = clientFor(object, environment().VIDEO_OSS_INTERNAL_UPLOAD === '1');
    let failure;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let existing;
        try { existing = await client.head(object.key); } catch (error) { if (error.status !== 404 && error.code !== 'NoSuchKey') throw error; }
        if (existing) { verifyHead(existing, object, userId, id); return object; }
        // 每次重试重新打开流；禁止覆盖其他内容。OSS 验证 Content-MD5。
        const stream = createReadStream(path);
        try {
          await client.putStream(object.key, stream, { contentLength: size, mime: mimeType(extension), timeout: 180000, headers: { 'Content-MD5': hashes.md5, 'x-oss-object-acl': 'private', 'x-oss-forbid-overwrite': 'true', 'Cache-Control': 'private, no-store' }, meta: { 'yxshop-sha256': object.sha256, 'yxshop-user': String(userId), 'yxshop-task': id } });
        } finally { stream.destroy(); }
        verifyHead(await client.head(object.key), object, userId, id);
        return object;
      } catch (error) {
        if (error instanceof VideoStorageError) throw error;
        failure = error;
        if ([400, 401, 403].includes(error.status)) break;
        if (attempt < 2) await sleep(500 * (attempt + 1));
      }
    }
    // 不将 SDK 请求头、凭据、签名地址或原始响应打印到客户端 / 日志。
    console.error('视频 OSS 上传失败', failure?.code || 'OSS_REQUEST_FAILED', Number(failure?.status) || 0);
    throw new VideoStorageError('视频上传 OSS 失败，请稍后重试；本次未扣费');
  }
  async function downloadUrl(object, { userId, id, extension, title, inline = false }) {
    assertOwner(object, userId, id, extension);
    // 对象长期保留，签名仅短期有效；历史记录每次下载重新签发，无需重新提取。
    const seconds = 900;
    const client = clientFor(object); // 下载地址必须是公网 HTTPS，不能使用 ECS 内网地址。
    const filename = `${String(title || 'video').replace(/[\u0000-\u001f\\/:*?"<>|]/g, '-').slice(0, 100)}.${extension}`;
    const disposition = `${inline ? 'inline' : 'attachment'}; filename="yxstar-video.${extension}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)}`;
    const url = await client.signatureUrlV4('GET', seconds, { headers: {}, queries: { 'response-content-disposition': disposition, 'response-content-type': mimeType(extension) } }, object.key);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== `${object.bucket}.${object.region}.aliyuncs.com`) throw new VideoStorageError('OSS 下载地址配置异常');
    return url;
  }
  async function remove(object) {
    validateObject(object);
    try { await clientFor(object).delete(object.key); }
    catch (error) { if (error.status !== 404 && error.code !== 'NoSuchKey') throw new VideoStorageError('未完成 OSS 视频回收失败，请稍后重试'); }
  }
  return { readiness, upload, readRecord, downloadUrl, remove };
}

export const videoObjectStorage = createVideoObjectStorage();
