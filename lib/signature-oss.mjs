import OSS from 'ali-oss';
import { createHash, randomUUID } from 'node:crypto';

const prefix = 'yxshop/document-signatures';
const idPattern = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const objectPattern = new RegExp(`^${prefix}/users/([1-9][0-9]*)/(${idPattern})/(${idPattern})\\.(pdf|png)$`);
const validBucket = bucket => typeof bucket === 'string' && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket);
const validRegion = region => typeof region === 'string' && /^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region);

export class SignatureStorageError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

export function createSignatureStorage({ environment = () => process.env, createClient = options => new OSS(options) } = {}) {
  function config() {
    const env = environment();
    const custom = ['BUCKET', 'REGION', 'ACCESS_KEY_ID', 'ACCESS_KEY_SECRET', 'STS_TOKEN'].some(key => env[`SIGNATURE_OSS_${key}`]?.trim());
    const variable = custom ? 'SIGNATURE_OSS_' : 'VIDEO_OSS_';
    const read = key => env[variable + key]?.trim() || '';
    const bucket = read('BUCKET'), region = read('REGION').replace(/\.aliyuncs\.com$/, '');
    const accessKeyId = read('ACCESS_KEY_ID'), accessKeySecret = read('ACCESS_KEY_SECRET'), stsToken = read('STS_TOKEN');
    if (!validBucket(bucket) || !validRegion(region) || !accessKeyId || !accessKeySecret) {
      throw new SignatureStorageError('签署文件云存储暂未配置');
    }
    return { bucket, region, accessKeyId, accessKeySecret, ...(stsToken ? { stsToken } : {}) };
  }

  function clientFor(object, internal = false) {
    return createClient({
      ...config(), bucket: object.bucket, region: object.region, internal,
      secure: true, authorizationV4: true, timeout: 30_000, retryMax: 0,
    });
  }

  function ready() {
    try { config(); return true; } catch { return false; }
  }

  function validate(object, userId, id) {
    const match = typeof object?.key === 'string' && objectPattern.exec(object.key);
    if (!match || match[1] !== String(userId) || match[2] !== id || !validBucket(object.bucket) ||
      !validRegion(object.region) || !Number.isSafeInteger(object.size) || object.size <= 0 ||
      !/^[a-f0-9]{64}$/.test(object.sha256)) {
      throw new SignatureStorageError('签署文件存储记录异常', 409);
    }
    return object;
  }

  async function upload({ userId, id, name, format, bytes }) {
    const { bucket, region } = config();
    const object = {
      bucket, region, key: `${prefix}/users/${userId}/${id}/${randomUUID()}.${format}`,
      size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    validate(object, userId, id);
    const filename = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
    const client = clientFor(object, environment().SIGNATURE_OSS_INTERNAL_UPLOAD === '1');
    try {
      await client.put(object.key, bytes, {
        mime: format === 'pdf' ? 'application/pdf' : 'image/png',
        headers: {
          'Content-MD5': createHash('md5').update(bytes).digest('base64'),
          'Content-Disposition': `attachment; filename="signed.${format}"; filename*=UTF-8''${filename}`,
          'Cache-Control': 'private, no-store',
          'x-oss-object-acl': 'private',
          'x-oss-forbid-overwrite': 'true',
        },
        meta: { 'yxshop-sha256': object.sha256 },
      });
      const head = await client.head(object.key);
      if (Number(head.res?.headers?.['content-length']) !== object.size ||
        (head.meta?.['yxshop-sha256'] || head.res?.headers?.['x-oss-meta-yxshop-sha256']) !== object.sha256) {
        throw new SignatureStorageError('签署文件上传校验失败，本次未扣费');
      }
      return object;
    } catch (error) {
      await discard(object, userId, id);
      console.error('签署文件 OSS 上传失败', error?.code || 'OSS_REQUEST_FAILED', Number(error?.status) || 0);
      throw new SignatureStorageError('签署文件上传失败，本次未扣费');
    }
  }

  async function downloadUrl(object, userId, id) {
    validate(object, userId, id);
    const url = await clientFor(object).signatureUrlV4('GET', 300, { headers: {}, queries: {} }, object.key);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== `${object.bucket}.${object.region}.aliyuncs.com`) {
      throw new SignatureStorageError('签署文件下载地址异常');
    }
    return url;
  }

  async function discard(object, userId, id) {
    try {
      validate(object, userId, id);
      await clientFor(object, environment().SIGNATURE_OSS_INTERNAL_UPLOAD === '1').delete(object.key);
    } catch (error) {
      console.error('签署文件 OSS 临时对象回收失败', error?.code || 'OSS_DELETE_FAILED');
    }
  }

  return { ready, upload, downloadUrl, discard };
}

export const signatureStorage = createSignatureStorage();
