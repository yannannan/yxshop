import OSS from 'ali-oss';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, open, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = 'yxshop/software-releases/c-drive-cleaner';
const id = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const keyPattern = new RegExp(`^${root}/(${id})/(${id})/installer\\.exe$`);
const bucketValid = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
const regionValid = value => typeof value === 'string' && /^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value);
export class SoftwareStorageError extends Error { constructor(message, status = 503) { super(message); this.name = 'SoftwareStorageError'; this.status = status; } }
export function createSoftwareStorage({ environment = () => process.env, createClient = options => new OSS(options), stagingRoot = () => resolve(process.cwd(), 'uploads/software-staging') } = {}) {
  function config() {
    const env = environment(), custom = ['BUCKET', 'REGION', 'ACCESS_KEY_ID', 'ACCESS_KEY_SECRET', 'STS_TOKEN'].some(key => env['SOFTWARE_OSS_' + key]?.trim());
    const prefix = custom ? 'SOFTWARE_OSS_' : 'VIDEO_OSS_', read = key => env[prefix + key]?.trim() || '';
    const bucket = read('BUCKET'), region = read('REGION').replace(/\.aliyuncs\.com$/, ''), accessKeyId = read('ACCESS_KEY_ID'), accessKeySecret = read('ACCESS_KEY_SECRET'), stsToken = read('STS_TOKEN');
    if (!bucketValid(bucket) || !regionValid(region) || !accessKeyId || !accessKeySecret) throw new SoftwareStorageError('软件云存储尚未配置，请配置SOFTWARE_OSS或现有VIDEO_OSS凭据');
    return { bucket, region, accessKeyId, accessKeySecret, ...(stsToken ? { stsToken } : {}) };
  }
  function validate(object, release) {
    const match = typeof object?.key === 'string' && keyPattern.exec(object.key);
    if (!match || match[1] !== release || !bucketValid(object.bucket) || !regionValid(object.region) || !Number.isSafeInteger(object.size) || object.size < 64 || object.size > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(object.sha256)) throw new SoftwareStorageError('软件文件存储记录异常', 409);
    return object;
  }
  function client(object, internal = false) { return createClient({ ...config(), bucket: object.bucket, region: object.region, internal, secure: true, authorizationV4: true, timeout: 300000, retryMax: 0 }); }
  function ready() { try { config(); return true; } catch { return false; } }
  async function verify(object, release) {
    validate(object, release);
    const result = await client(object, environment().SOFTWARE_OSS_INTERNAL_UPLOAD === '1').head(object.key);
    if (Number(result.res?.headers?.['content-length']) !== object.size || (result.meta?.['yxshop-sha256'] || result.res?.headers?.['x-oss-meta-yxshop-sha256']) !== object.sha256) throw new SoftwareStorageError('软件文件校验失败，请重新上传');
  }
  async function discard(object, release) { try { validate(object, release); await client(object, environment().SOFTWARE_OSS_INTERNAL_UPLOAD === '1').delete(object.key); } catch { /* Keep unreferenced private objects for later cleanup on failure. */ } }
  async function upload({ request, release, name, size }) {
    const settings = config();
    if (!new RegExp(`^${id}$`).test(release) || !Number.isSafeInteger(size) || size < 64 || size > 256 * 1024 * 1024 || !request.body) throw new SoftwareStorageError('EXE文件大小无效，最大256MB', 400);
    const base = stagingRoot(); await mkdir(base, { recursive: true });
    const directory = await mkdtemp(join(base, 'upload-')), path = join(directory, 'installer.exe');
    const digest = createHash('sha256'), md5 = createHash('md5'); let received = 0, object;
    try {
      const input = Readable.fromWeb(request.body), counter = new Transform({ transform(chunk, encoding, callback) {
        received += chunk.length; if (received > size) { callback(new SoftwareStorageError('上传文件大小与声明不符', 400)); return; }
        digest.update(chunk); md5.update(chunk); callback(null, chunk);
      } });
      await pipeline(input, counter, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal: AbortSignal.any([request.signal, AbortSignal.timeout(300000)]) });
      if (received !== size) throw new SoftwareStorageError('文件上传不完整，请重试', 400);
      const file = await open(path, 'r');
      try {
        const header = Buffer.alloc(64); await file.read(header, 0, 64, 0);
        const offset = header.readUInt32LE(60);
        if (header[0] !== 0x4d || header[1] !== 0x5a || offset < 64 || offset > size - 4) throw new SoftwareStorageError('文件不是有效的Windows EXE', 400);
        const pe = Buffer.alloc(4); await file.read(pe, 0, 4, offset);
        if (!pe.equals(Buffer.from([0x50, 0x45, 0, 0]))) throw new SoftwareStorageError('文件不是有效的Windows EXE', 400);
      } finally { await file.close(); }
      object = { bucket: settings.bucket, region: settings.region, key: `${root}/${release}/${randomUUID()}/installer.exe`, size, sha256: digest.digest('hex') };
      const filename = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
      await client(object, environment().SOFTWARE_OSS_INTERNAL_UPLOAD === '1').putStream(object.key, createReadStream(path), {
        mime: 'application/octet-stream', contentLength: size, headers: { 'Content-MD5': md5.digest('base64'), 'Content-Disposition': `attachment; filename="c-drive-cleaner.exe"; filename*=UTF-8''${filename}`, 'Cache-Control': 'private, no-store', 'x-oss-object-acl': 'private', 'x-oss-forbid-overwrite': 'true' }, meta: { 'yxshop-sha256': object.sha256 },
      });
      await verify(object, release); return object;
    } catch (error) { if (object) await discard(object, release); throw error instanceof SoftwareStorageError ? error : new SoftwareStorageError('软件上传失败，请检查云存储与网络配置'); }
    finally { await unlink(path).catch(() => {}); await rmdir(directory).catch(() => {}); }
  }
  async function downloadUrl(object, release) {
    validate(object, release); await verify(object, release);
    const signed = await client(object).signatureUrlV4('GET', 300, { headers: {}, queries: {} }, object.key), url = new URL(signed);
    if (url.protocol !== 'https:' || url.hostname !== `${object.bucket}.${object.region}.aliyuncs.com`) throw new SoftwareStorageError('软件云下载地址异常');
    return signed;
  }
  return { ready, validate, upload, verify, downloadUrl, discard };
}
export const softwareStorage = createSoftwareStorage();
