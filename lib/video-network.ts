import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { VideoError } from './video-options';

export function publicVideoAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  const value = address.toLowerCase();
  return /^[23][0-9a-f]{3}:/.test(value) && !/^2001:(?:0{0,4}:|0?db8:)/.test(value) && !value.startsWith('2002:');
}
export async function videoUrlAddress(raw: string) {
  let url;
  try { url = new URL(raw); } catch { throw new VideoError('视频资源地址不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new VideoError('该视频资源地址不受支持');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || !host.includes('.') && !isIP(host) || /\.(?:localhost|local|internal|lan|test|invalid)$/.test(host)) throw new VideoError('不支持本地或内网地址');
  let addresses;
  try {
    if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
    else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { addresses = await Promise.race([lookup(host, { all: true, verbatim: true }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); })]); }
      finally { clearTimeout(timer); }
    }
  }
  catch { throw new VideoError('无法解析视频站点地址，请检查链接', 422); }
  if (!addresses.length || addresses.some(item => !publicVideoAddress(item.address))) throw new VideoError('不支持本地、内网或保留网络地址');
  return { url, address: addresses[0] };
}
export function videoRequestHeaders(headers: unknown): Record<string, string> {
  const result: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (compatible; YxstarVideo/1.0)', 'Accept-Encoding': 'identity' };
  if (headers && typeof headers === 'object') for (const [key, value] of Object.entries(headers)) {
    if (['user-agent', 'referer', 'origin', 'accept', 'accept-language'].includes(key.toLowerCase()) && typeof value === 'string' && value.length <= 2048 && !/[\r\n]/.test(value)) result[key] = value;
  }
  return result;
}
// DNS 在连接前校验并固定到公有 IP；每一次重定向重新校验，避免二次解析与 DNS 重绑定。
export async function videoResponse(raw: string, headers: Record<string, string> = {}, redirects = 0, timeout = 180000): Promise<{ response: IncomingMessage; url: string }> {
  if (redirects > 5) throw new VideoError('视频链接重定向次数过多', 422);
  const { url, address } = await videoUrlAddress(raw);
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, signal: AbortSignal.timeout(timeout), headers: { ...videoRequestHeaders(headers), ...(headers.Range ? { Range: headers.Range } : {}) },
      lookup: (_host, options, callback) => { if (options.all) callback(null, [address as { address: string; family: number }]); else callback(null, address.address, address.family); },
    }, resolve);
    request.setTimeout(15000, () => request.destroy(new VideoError('视频站点响应超时，请稍后重试', 504)));
    request.on('error', () => reject(new VideoError('无法连接视频站点，请稍后重试', 422)));
    request.end();
  });
  const status = response.statusCode || 0;
  if ([301, 302, 303, 307, 308].includes(status)) {
    const location = response.headers.location; response.destroy();
    if (!location) throw new VideoError('视频站点返回无效跳转', 422);
    const next = new URL(location, url);
    if (next.origin !== url.origin) headers = {};
    return videoResponse(next.href, headers, redirects + 1, timeout);
  }
  if (status < 200 || status >= 300) { response.destroy(); throw new VideoError([401, 403].includes(status) ? '该视频需要登录或站点拒绝访问，请换一个公开链接' : '视频资源暂不可用，请检查链接或稍后重试', 422); }
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { response.destroy(); throw new VideoError('站点未提供可直接读取的视频资源', 422); }
  return { response, url: url.href };
}
export async function videoResponseBytes(response: IncomingMessage, limit: number) {
  const chunks: Buffer[] = []; let length = 0;
  try {
    for await (const data of response) {
      const chunk = Buffer.from(data); length += chunk.length;
      if (length > limit) throw new VideoError('资源内容超出读取限制', 413);
      chunks.push(chunk);
    }
  } finally { response.destroy(); }
  return Buffer.concat(chunks);
}
