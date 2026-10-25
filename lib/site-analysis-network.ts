import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve4, resolve6, resolveCname, resolveNs } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { getDomain } from 'tldts';
import { videoUrlAddress } from './video-network';
import { SiteAnalysisError } from './site-analysis';

export function normalizeSite(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value.trim())) throw new SiteAnalysisError('请输入有效的公网网站域名');
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value.trim() : `https://${value.trim()}`); } catch { throw new SiteAnalysisError('请输入有效的公网网站域名'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || isIP(host) || !getDomain(host, { extractHostname: false }) || /\.(?:local|localhost|internal|lan|test|invalid|example)$/.test(host)) throw new SiteAnalysisError('请输入有效的公网网站域名');
  return { host, domain: getDomain(host, { extractHostname: false })!, url: `${url.protocol}//${host}/` };
}
export type SiteResponse = { url: string; status: number; bytes: Buffer; contentType: string };
export async function siteRequest(raw: string, signal: AbortSignal, limit = 2 * 1024 * 1024, hops = 0): Promise<SiteResponse> {
  signal.throwIfAborted();
  if (hops > 5) throw new SiteAnalysisError('站点跳转次数过多', 422);
  const { url, address } = await videoUrlAddress(raw);
  url.hash = '';
  signal.throwIfAborted();
  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, signal,
      headers: { 'User-Agent': 'YxstarSiteBot/1.0 (+https://www.yxstar.shop)', 'Accept': 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' },
      lookup: (_host, options, callback) => { if (options.all) callback(null, [address]); else callback(null, address.address, address.family); },
    }, resolve);
    req.setTimeout(12000, () => req.destroy(new Error('站点响应超时'))); req.on('error', reject); req.end();
  });
  const status = response.statusCode || 0;
  if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
    const next = new URL(response.headers.location, url).href; response.destroy(); return siteRequest(next, signal, limit, hops + 1);
  }
  const encoding = response.headers['content-encoding'];
  const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'br' ? createBrotliDecompress() : encoding === 'deflate' ? createInflate() : null;
  if (decoder) response.on('error', error => decoder.destroy(error));
  const stream = decoder ? response.pipe(decoder) : response;
  const chunks: Buffer[] = []; let length = 0;
  try {
    for await (const data of stream) { signal.throwIfAborted(); const chunk = Buffer.from(data); length += chunk.length; if (length > limit) throw new SiteAnalysisError('页面超过采集大小限制', 413); chunks.push(chunk); }
    return { url: url.href, status, bytes: Buffer.concat(chunks), contentType: String(response.headers['content-type'] || '') };
  } finally { stream.destroy(); response.destroy(); }
}
export async function siteDns(host: string) {
  const bounded = <T>(promise: Promise<T>) => { let timer: ReturnType<typeof setTimeout>; return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); })]).finally(() => clearTimeout(timer)); };
  const rows = await Promise.allSettled([bounded(resolve4(host)), bounded(resolve6(host)), bounded(resolveCname(host)), bounded(resolveNs(getDomain(host)!))]);
  const values = rows.map(row => row.status === 'fulfilled' ? row.value : []);
  if (!values[0].length && !values[1].length) throw new SiteAnalysisError('域名 DNS 解析失败', 422);
  return { addresses: [...values[0], ...values[1]], cname: values[2], nameservers: values[3] };
}
let bootstrap: { until: number; services: [string[], string[]][] } | undefined;
export async function registrationData(domain: string, signal: AbortSignal) {
  if (!bootstrap || bootstrap.until < Date.now()) {
    const response = await siteRequest('https://data.iana.org/rdap/dns.json', signal, 1024 * 1024);
    if (response.status !== 200) throw new Error('RDAP bootstrap unavailable');
    const parsed = JSON.parse(response.bytes.toString('utf8'));
    if (!Array.isArray(parsed.services)) throw new Error('RDAP bootstrap invalid');
    bootstrap = { until: Date.now() + 86400000, services: parsed.services };
  }
  const base = bootstrap.services.find(([suffixes]) => suffixes.includes(domain.split('.').at(-1)!))?.[1].find(url => url.startsWith('https://'));
  if (!base) throw new Error('该域名后缀暂无可用 RDAP 服务');
  const source = new URL(`domain/${encodeURIComponent(domain)}`, base.endsWith('/') ? base : `${base}/`).href;
  const response = await siteRequest(source, signal, 1024 * 1024);
  if (response.status !== 200) throw new Error('域名注册信息暂不可用');
  return { data: JSON.parse(response.bytes.toString('utf8')), source: response.url };
}
