import OSS from 'ali-oss';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { ChatError, chatFileLimit } from './consultation-message.mjs';
const root = 'yxshop/technical-chat/consultations';
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const pattern = new RegExp(`^${root}/([1-9][0-9]*)/(${uuid})/file$`);
const safeName = name => String(name || 'attachment').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180);
export function chatImageMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16)==='IHDR') return 'image/png';
  if (bytes.length >= 4 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (bytes.length >= 13 && /^GIF8[79]a$/.test(bytes.toString('ascii',0,6))) return 'image/gif';
  if (bytes.length >= 30 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  return 'application/octet-stream';
}
export function createChatStorage({ environment = () => process.env, createClient = options => new OSS(options) } = {}) {
  function config() {
    const env = environment(), custom = ['BUCKET','REGION','ACCESS_KEY_ID','ACCESS_KEY_SECRET','STS_TOKEN'].some(key => env['CHAT_OSS_'+key]?.trim());
    const prefix = custom ? 'CHAT_OSS_' : 'VIDEO_OSS_', read = key => env[prefix+key]?.trim() || '';
    const bucket = read('BUCKET'), region = read('REGION').replace(/\.aliyuncs\.com$/, ''), accessKeyId = read('ACCESS_KEY_ID'), accessKeySecret = read('ACCESS_KEY_SECRET'), stsToken = read('STS_TOKEN');
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !/^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region) || !accessKeyId || !accessKeySecret) throw new ChatError('聊天附件云存储尚未配置，请配置CHAT_OSS或现有VIDEO_OSS凭据',503);
    return { bucket, region, accessKeyId, accessKeySecret, ...(stsToken ? { stsToken } : {}) };
  }
  function validate(file, consultationId) {
    const match = typeof file?.key==='string' && pattern.exec(file.key);
    if (!match || Number(match[1])!==consultationId || match[2]!==file.id || !Number.isSafeInteger(file.size) || file.size<1 || file.size>chatFileLimit || !/^[a-f0-9]{64}$/.test(file.sha256) || safeName(file.name)!==file.name || !['image/png','image/jpeg','image/gif','image/webp','application/octet-stream'].includes(file.mime) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(file.bucket) || !/^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(file.region)) throw new ChatError('附件记录异常',409);
  }
  function client(file) { return createClient({ ...config(), bucket:file.bucket, region:file.region, secure:true, authorizationV4:true, timeout:60000, retryMax:0 }); }
  async function discard(file, consultationId) { try { validate(file,consultationId); await client(file).delete(file.key); } catch { /* Leave private orphan for manual cleanup if OSS is unavailable. */ } }
  async function upload(input, consultationId) {
    if (!Number.isSafeInteger(consultationId) || consultationId<1 || !input.size || input.size>chatFileLimit) throw new ChatError('附件最大20MB',413);
    const settings=config(), bytes=Buffer.from(await input.arrayBuffer());
    if (bytes.length!==input.size) throw new ChatError('附件上传不完整');
    const id=randomUUID(), file={ id, name:safeName(input.name), size:bytes.length, mime:chatImageMime(bytes), bucket:settings.bucket, region:settings.region, key:`${root}/${consultationId}/${id}/file`, sha256:createHash('sha256').update(bytes).digest('hex') };
    try {
      await client(file).put(file.key,bytes,{ mime:file.mime, headers:{ 'x-oss-object-acl':'private','x-oss-forbid-overwrite':'true','Cache-Control':'private, no-store','Content-Disposition':'attachment','Content-MD5':createHash('md5').update(bytes).digest('base64') },meta:{ 'yxshop-sha256':file.sha256 } });
      const head=await client(file).head(file.key);
      if (Number(head.res?.headers?.['content-length'])!==file.size || (head.meta?.['yxshop-sha256']||head.res?.headers?.['x-oss-meta-yxshop-sha256'])!==file.sha256) throw new Error('Upload verification failed');
      return file;
    } catch { await discard(file,consultationId); throw new ChatError('附件上传失败，请稍后重试或联系管理员',503); }
  }
  async function download(file, consultationId, signal) {
    validate(file,consultationId);
    if (signal.aborted) throw new ChatError('请求已取消',499);
    let result;
    try { result=await client(file).getStream(file.key); } catch { throw new ChatError('附件暂时无法读取，请稍后重试',503); }
    const stream=result.stream, headers=result.res?.headers;
    if (Number(headers?.['content-length'])!==file.size || headers?.['x-oss-meta-yxshop-sha256']!==file.sha256) { stream.destroy(); throw new ChatError('附件校验失败',409); }
    const abort=()=>stream.destroy();
    signal.addEventListener('abort',abort,{once:true});
    const cleanup=()=>signal.removeEventListener('abort',abort);
    stream.once('close',cleanup); stream.once('end',cleanup); stream.once('error',cleanup);
    if (signal.aborted) { stream.destroy(); cleanup(); throw new ChatError('请求已取消',499); }
    return Readable.toWeb(stream);
  }
  return { upload, download, discard, validate };
}
export const chatStorage=createChatStorage();
