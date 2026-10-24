import { mkdir, mkdtemp, chmod, chown, realpath, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import type { Browser, BrowserContext } from 'puppeteer-core';
import { openVideoProxy } from './video-proxy';
import { douyinCanonicalUrl, douyinDataVideo, douyinPageVideo, douyinRestriction, isDouyinPage, type PublicVideoPage } from './video-public-pages';
import { VideoError } from './video-options';
import type { BrowserVideo } from './video-browser';

export type FirefoxRuntime = { executable: string; launcher?: string; worker?: { uid: number; gid: number } };

// CentOS 7 使用 Mozilla 原版 Firefox + WebDriver BiDi，不依赖新版 Chromium / glibc。
export async function inspectFirefoxVideo(source: string, runtime: FirefoxRuntime, timeout: number, probe = false): Promise<BrowserVideo | null> {
  const { default: puppeteer } = await import('puppeteer-core');
  const temporary = resolve('vendor/video-engine/browser-temporary');
  await mkdir(temporary, { recursive: true });
  const profile = await mkdtemp(join(temporary, 'firefox-'));
  let browser: Browser | undefined, context: BrowserContext | undefined;
  let proxy: Awaited<ReturnType<typeof openVideoProxy>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, finished = false;
  try {
    const worker = process.getuid?.() === 0 ? runtime.worker : undefined;
    if (process.platform === 'linux' && process.getuid?.() === 0 && (!worker || !runtime.launcher)) throw new VideoError('请先运行 CentOS 视频依赖安装脚本，配置非 root 网页解析账号', 503);
    if (worker) {
      if (!Number.isSafeInteger(worker.uid) || worker.uid < 1 || !Number.isSafeInteger(worker.gid) || worker.gid < 1) throw new Error('解析账号无效');
      await chown(profile, worker.uid, worker.gid);
    }
    await chmod(profile, 0o700);
    proxy = await openVideoProxy();
    const proxyUrl = new URL(proxy.server), deadline = Date.now() + timeout;
    const environment: NodeJS.ProcessEnv = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, HOME: profile, XDG_RUNTIME_DIR: profile, XDG_CACHE_HOME: profile, XDG_CONFIG_HOME: profile, YX_VIDEO_FIREFOX_BINARY: runtime.executable };
    // 不继承运维终端里可能存在的“关闭沙箱”开关。
    for (const name of Object.keys(environment)) if (/^MOZ_DISABLE_.*SANDBOX$/.test(name)) delete environment[name];
    browser = await puppeteer.launch({ browser: 'firefox', protocol: 'webDriverBiDi', executablePath: worker ? runtime.launcher : runtime.executable,
      headless: true, userDataDir: profile, timeout: 12000, protocolTimeout: 10000, env: environment,
      extraPrefsFirefox: {
        'network.proxy.type': 1, 'network.proxy.http': proxyUrl.hostname, 'network.proxy.http_port': Number(proxyUrl.port),
        'network.proxy.ssl': proxyUrl.hostname, 'network.proxy.ssl_port': Number(proxyUrl.port),
        'network.proxy.no_proxies_on': '', 'network.proxy.allow_hijacking_localhost': true, 'network.proxy.failover_direct': false,
        'network.trr.mode': 5, 'network.dns.disablePrefetch': true, 'network.prefetch-next': false, 'network.http.speculative-parallel-limit': 0,
        'network.http.http3.enable': false, 'media.peerconnection.enabled': false, 'dom.serviceWorkers.enabled': false,
        'intl.accept_languages': 'zh-CN,zh,en-US,en', 'browser.cache.disk.enable': false,
        // 沙箱采用当前 Firefox 默认策略，不降低级别。
      },
    });
    context = await browser.createBrowserContext();
    const page = await context.newPage(), douyin = isDouyinPage(new URL(source).hostname), urls = new Set<string>();
    await page.authenticate({ username: proxy.username, password: proxy.password });
    await page.setViewport({ width: 1365, height: 900 });
    if (probe) {
      await page.goto('about:blank');
      const userAgent = await page.evaluate(() => navigator.userAgent);
      return { page: { title: 'Firefox 启动检查通过', thumbnail: '', duration: 0, media: [], imagePost: false }, referer: 'about:blank', userAgent, urls: [] };
    }
    await page.setRequestInterception(true);
    let detail: PublicVideoPage | null = null, restriction = '', reloaded = false;
    const started = Date.now();
    timer = setTimeout(() => { finished = true; void browser?.close().catch(() => {}); }, Math.max(1000, deadline - Date.now()));
    page.on('request', request => {
      void (async () => {
        const url = request.url();
        let type = ''; try { type = request.resourceType(); } catch { /* Firefox 按请求头兜底。 */ }
        if (!type) type = request.headers()['sec-fetch-dest'] || '';
        if (!/^https?:\/\//i.test(url) || ['image', 'font'].includes(type)) { await request.abort(); return; }
        if (['media', 'video', 'audio'].includes(type) || /\.(?:m3u8|mp4|webm|mov)(?:[?#]|$)/i.test(url)) {
          if (!douyin && urls.size < 12) urls.add(url);
          await request.abort(); return;
        }
        await request.continue();
      })().catch(() => request.abort().catch(() => {}));
    });
    page.on('response', response => {
      if (finished) return;
      if (!douyin) {
        if (response.ok() && /^(?:video\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl))/i.test(response.headers()['content-type'] || '') && urls.size < 12) urls.add(response.url());
        return;
      }
      if (!isDouyinPage(new URL(response.url()).hostname) || !response.url().includes('/aweme/') || response.status() !== 200 || Number(response.headers()['content-length']) > 2 * 1024 ** 2) return;
      void (async () => {
        const body = await response.content();
        if (finished || body.length > 2 * 1024 ** 2) return;
        const data = JSON.parse(Buffer.from(body).toString());
        restriction = douyinRestriction(data, source);
        const found = douyinDataVideo(data, source);
        if (found.media.length || found.imagePost) detail = found;
      })().catch(() => {});
    });
    await page.goto(douyin ? douyinCanonicalUrl(source) || source : source, { waitUntil: 'domcontentloaded', timeout: Math.min(14000, Math.max(1000, deadline - Date.now())) }).catch(() => {});
    while (!finished && !page.isClosed() && Date.now() < deadline - 1000 && !detail && !restriction && !urls.size) {
      if (douyin && !reloaded && Date.now() - started > 5000 && deadline - Date.now() > 5000) { reloaded = true; await page.reload({ waitUntil: 'domcontentloaded', timeout: Math.min(8000, deadline - Date.now()) }).catch(() => {}); }
      if (douyin) { const found = douyinPageVideo(await page.content().catch(() => ''), source); if (found.media.length || found.imagePost) detail = found; }
      await page.evaluate(() => { for (const video of document.querySelectorAll('video')) { video.muted = true; void video.play().catch(() => {}); } }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (restriction) throw new VideoError(restriction, 403);
    if (page.isClosed() || (douyin && !detail)) return null;
    const info = await page.evaluate(() => ({ title: document.title, userAgent: navigator.userAgent, urls: Array.from(document.querySelectorAll('video, video source')).map(node => node.getAttribute('src') || '').filter(url => /^https?:\/\//.test(url)) }));
    return { page: detail || { title: info.title, thumbnail: '', duration: 0, media: [], imagePost: false }, referer: page.url(), userAgent: info.userAgent, urls: douyin ? [] : [...new Set([...urls, ...info.urls])].slice(0, 12) };
  } finally {
    finished = true; clearTimeout(timer);
    await context?.close().catch(() => {}); await browser?.close().catch(() => {}); await proxy?.close().catch(() => {});
    const actual = await realpath(profile), child = relative(await realpath(temporary), actual);
    if (!isAbsolute(child) && !child.startsWith('..') && /^firefox-[^/\\]+$/.test(child)) await rm(actual, { recursive: true, force: true });
  }
}
