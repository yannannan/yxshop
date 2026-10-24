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
type VideoAddress = { address: string; family: number };
const publicDnsCache = new Map<string, { addresses: VideoAddress[]; expiresAt: number }>();
const publicDnsPending = new Map<string, Promise<VideoAddress[]>>();
const dnsName = (value: unknown) => typeof value === 'string' ? value.toLowerCase().replace(/\.$/, '') : '';
async function publicDnsAddresses(host: string): Promise<VideoAddress[]> {
  const cached = publicDnsCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;
  if (publicDnsPending.has(host)) return publicDnsPending.get(host)!;
  const pending = (async () => {
    // 仅向固定 HTTPS 解析服务查询域名，不请求用户指定的解析端点；禁止重定向。
    for (const endpoint of ['https://dns.alidns.com/resolve', 'https://cloudflare-dns.com/dns-query']) {
      try {
        const query = new URL(endpoint); query.searchParams.set('name', host); query.searchParams.set('type', 'A');
        const response = await fetch(query, { headers: { Accept: 'application/dns-json' }, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) });
        if (!response.ok || !response.body) { await response.body?.cancel(); continue; }
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
        try {
          for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 65536) { await reader.cancel(); throw new Error('DNS response too large'); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { Status?: number; Question?: { name?: string } | { name?: string }[]; Answer?: { name?: string; type?: number; data?: string; TTL?: number }[] };
        const question = Array.isArray(data.Question) ? data.Question[0] : data.Question;
        if (data.Status !== 0 || dnsName(question?.name) !== host || !Array.isArray(data.Answer)) continue;
        const names = new Set([host]);
        for (let depth = 0; depth < 8; depth++) for (const row of data.Answer) if (row.type === 5 && names.has(dnsName(row.name))) names.add(dnsName(row.data));
        const records = data.Answer.filter(row => row.type === 1 && names.has(dnsName(row.name)));
        if (!records.length || records.some(row => !row.data || isIP(row.data) !== 4 || !publicVideoAddress(row.data))) continue;
        const addresses = [...new Set(records.map(row => row.data!))].slice(0, 16).map(address => ({ address, family: 4 }));
        const ttl = Math.max(1, Math.min(60, ...records.map(row => Number(row.TTL) || 1)));
        for (const [key, value] of publicDnsCache) if (value.expiresAt <= Date.now() || publicDnsCache.size >= 512) publicDnsCache.delete(key);
        publicDnsCache.set(host, { addresses, expiresAt: Date.now() + ttl * 1000 });
        return addresses;
      } catch { /* 某个固定解析服务不可用时尝试备用服务，不放行系统返回的私网 IP。 */ }
    }
    return [];
  })().finally(() => { publicDnsPending.delete(host); });
  publicDnsPending.set(host, pending);
  return pending;
}
export async function videoUrlAddress(raw: string) {
  let url;
  try { url = new URL(raw); } catch { throw new VideoError('视频资源地址不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new VideoError('该视频资源地址不受支持');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || !host.includes('.') && !isIP(host) || /\.(?:localhost|local|internal|lan|test|invalid)$/.test(host)) throw new VideoError('不支持本地或内网地址');
  let addresses: VideoAddress[] = [];
  try {
    if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
    else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { addresses = await Promise.race([lookup(host, { all: true, verbatim: true }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); })]); }
      finally { clearTimeout(timer); }
    }
  }
  catch { /* 系统 DNS 不可用时仍可向固定公网解析服务复核。 */ }
  if (!addresses.length || addresses.some(item => !publicVideoAddress(item.address))) {
    if (isIP(host)) throw new VideoError('不支持本地、内网或保留网络地址');
    const publicAddresses = await publicDnsAddresses(host);
    if (!publicAddresses.length) throw new VideoError(`视频域名 ${host} 的 DNS 解析异常或指向内网/代理地址，无法确认公网地址，请检查 DNS 或代理设置`, 422);
    addresses = publicAddresses;
  }
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
export async function videoResponse(raw: string, headers: Record<string, string> = {}, redirects = 0, timeout = 180000, deadline = Infinity): Promise<{ response: IncomingMessage; url: string }> {
  if (redirects > 5) throw new VideoError('视频链接重定向次数过多', 422);
  if (Date.now() >= deadline) throw new VideoError('视频解析等待超时，请稍后重试', 504);
  const { url, address } = await videoUrlAddress(raw);
  const remaining = Math.min(timeout, deadline - Date.now());
  if (remaining <= 0) throw new VideoError('视频解析等待超时，请稍后重试', 504);
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, signal: AbortSignal.timeout(remaining), headers: { ...videoRequestHeaders(headers), ...(headers.Range ? { Range: headers.Range } : {}) },
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
    return videoResponse(next.href, headers, redirects + 1, timeout, deadline);
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
