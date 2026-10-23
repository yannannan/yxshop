import { access, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, BrowserContext } from 'playwright-core';
import { openVideoProxy } from './video-proxy';
import { videoUrlAddress } from './video-network';
import { douyinCanonicalUrl, douyinDataVideo, douyinPageVideo, douyinRestriction, isDouyinPage, type PublicVideoPage } from './video-public-pages';
import { VideoError } from './video-options';

let active = 0;
export async function videoBrowserExecutable() {
  try {
    const path = process.env.VIDEO_BROWSER_PATH || JSON.parse(await readFile(resolve('vendor/video-engine/browser-runtime.json'), 'utf8')).executable;
    if (typeof path !== 'string' || !path) return '';
    await access(path); return path;
  } catch { return ''; }
}
export type BrowserVideo = { page: PublicVideoPage; referer: string; userAgent: string; urls: string[] };

// 后端解析引擎：全新匿名上下文，不读取用户浏览器、账号或本地 Cookie。
export async function inspectBrowserVideo(source: string, timeout = 22000): Promise<BrowserVideo | null> {
  const executablePath = await videoBrowserExecutable();
  if (!executablePath || process.env.VIDEO_BROWSER_ENABLED === '0') return null;
  if (active >= 2) throw new VideoError('网页解析正在处理中，请稍后重试', 429);
  await videoUrlAddress(source);
  active++;
  const deadline = Date.now() + timeout;
  let browser: Browser | undefined, context: BrowserContext | undefined;
  let proxy: Awaited<ReturnType<typeof openVideoProxy>> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    proxy = await openVideoProxy();
    const { chromium } = await import('playwright-core');
    const temporary = resolve('vendor/video-engine/browser-temporary'); await mkdir(temporary, { recursive: true });
    browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true, timeout: 10000,
      env: { ...process.env, TMP: temporary, TEMP: temporary, TMPDIR: temporary }, downloadsPath: temporary,
      proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
      args: ['--proxy-bypass-list=<-loopback>', '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--autoplay-policy=no-user-gesture-required', '--disable-background-networking'],
    });
    const platform = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
    const userAgent = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`;
    context = await browser.newContext({ userAgent, viewport: { width: 1365, height: 900 }, locale: 'zh-CN', serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    const page = await context.newPage(), douyin = isDouyinPage(new URL(source).hostname);
    const urls = new Set<string>();
    let detail: PublicVideoPage | null = null, finished = false, restriction = '';
    const started = Date.now(); let reloaded = false;
    timer = setTimeout(() => { finished = true; void context?.close().catch(() => {}); }, Math.max(1000, deadline - Date.now()));
    await context.route('**/*', async route => {
      const request = route.request(), raw = request.url();
      try {
        if (!/^https?:\/\//i.test(raw) || ['image', 'font'].includes(request.resourceType())) { await route.abort(); return; }
        if (request.resourceType() === 'media' || /\.(?:m3u8|mp4|webm|mov)(?:[?#]|$)/i.test(raw)) {
          if (!douyin && urls.size < 12) urls.add(raw);
          await route.abort(); return;
        }
        await route.continue(); // 实际连接由临时代理逐次检查并固定公网 DNS。
      } catch { await route.abort().catch(() => {}); }
    });
    page.on('response', response => {
      if (finished) return;
      if (!douyin) {
        const type = response.headers()['content-type'] || '';
        if (response.status() >= 200 && response.status() < 300 && /^(?:video\/(?:mp4|webm|quicktime)|application\/(?:vnd\.apple\.mpegurl|x-mpegurl))/i.test(type) && urls.size < 12) urls.add(response.url());
        return;
      }
      if (!isDouyinPage(new URL(response.url()).hostname) || !response.url().includes('/aweme/')) return;
      void (async () => {
        const length = Number(response.headers()['content-length']);
        if (length > 2 * 1024 ** 2 || response.status() !== 200) return;
        const body = await response.body(); if (finished || body.length > 2 * 1024 ** 2) return;
        const data = JSON.parse(body.toString());
        restriction = douyinRestriction(data, source);
        const found = douyinDataVideo(data, source);
        if (found.media.length || found.imagePost) detail = found;
      })().catch(() => {});
    });
    const target = douyin ? douyinCanonicalUrl(source) || source : source;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: Math.min(14000, Math.max(1000, deadline - Date.now())) }).catch(() => {});
    while (!finished && Date.now() < deadline - 1000 && !detail && !restriction && !urls.size) {
      if (page.isClosed()) break;
      if (douyin && !reloaded && Date.now() - started > 5000 && deadline - Date.now() > 5000) { reloaded = true; await page.reload({ waitUntil: 'domcontentloaded', timeout: Math.min(8000, deadline - Date.now()) }).catch(() => {}); }
      if (douyin) {
        const found = douyinPageVideo(await page.content().catch(() => ''), source);
        if (found.media.length || found.imagePost) detail = found;
      }
      await page.evaluate(() => { for (const video of document.querySelectorAll('video')) { video.muted = true; void video.play().catch(() => {}); } }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (restriction) throw new VideoError(restriction, 403);
    if (page.isClosed()) return null;
    const info = await page.evaluate(() => ({ title: document.title, urls: Array.from(document.querySelectorAll('video, video source')).map(node => node.getAttribute('src') || '').filter(url => /^https?:\/\//.test(url)), userAgent: navigator.userAgent })).catch(() => ({ title: '', urls: [] as string[], userAgent: '' }));
    // 抖音只接受编号匹配的详情，不把推荐流或广告媒体当作用户作品。
    if (douyin && !detail) return null;
    return { page: detail || { title: info.title, thumbnail: '', duration: 0, media: [], imagePost: false }, referer: page.url(), userAgent: info.userAgent, urls: douyin ? [] : [...new Set([...urls, ...info.urls])].slice(0, 12) };
  } catch (error) {
    if (error instanceof VideoError) throw error;
    console.error('网页解析引擎失败', (error as Error).name);
    throw new VideoError('网页解析引擎暂不可用，请管理员检查运行环境和浏览器依赖', 503);
  } finally {
    clearTimeout(timer); await context?.close().catch(() => {}); await browser?.close().catch(() => {}); await proxy?.close().catch(() => {}); active--;
  }
}
