import { chown, chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { videoBrowserRuntime } from './video-browser';
import { videoUrlAddress } from './video-network';
import { openVideoProxy } from './video-proxy';

// Dedicated anonymous process/profile; reuse only installed binaries and the public-IP proxy.
export async function renderSitePage(url: string, signal: AbortSignal): Promise<Buffer> {
  const runtime = await videoBrowserRuntime();
  if (!runtime) throw new Error('浏览器渲染尚未配置');
  await videoUrlAddress(url); signal.throwIfAborted();
  const temporary = resolve('vendor/video-engine/browser-temporary'); await mkdir(temporary, { recursive: true });
  const profile = await mkdtemp(`${temporary}/site-analysis-`); await chmod(profile, 0o700);
  let proxy: Awaited<ReturnType<typeof openVideoProxy>> | undefined;
  let close: (() => Promise<void>) | undefined;
  const abort = () => { void close?.().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    proxy = await openVideoProxy({ browserAuthentication: runtime.engine === 'firefox' });
    let html: string;
    if (runtime.engine === 'firefox') {
      const { default: puppeteer } = await import('puppeteer-core');
      const worker = runtime.worker && process.getuid?.() === 0 ? runtime.worker : undefined;
      if (worker) { if (!Number.isSafeInteger(worker.uid) || worker.uid < 1 || !Number.isSafeInteger(worker.gid) || worker.gid < 1 || !runtime.launcher) throw new Error('浏览器运行账号配置错误'); await chown(profile, worker.uid, worker.gid); }
      const endpoint = new URL(proxy.server), env = { ...process.env, HOME: profile, XDG_RUNTIME_DIR: profile, XDG_CACHE_HOME: profile, XDG_CONFIG_HOME: profile, TMPDIR: profile, YX_VIDEO_FIREFOX_BINARY: runtime.executable };
      for (const key of Object.keys(env)) if (/^MOZ_DISABLE_.*SANDBOX$/.test(key)) delete env[key as keyof typeof env];
      const browser = await puppeteer.launch({ browser: 'firefox', protocol: 'webDriverBiDi', executablePath: worker ? runtime.launcher : runtime.executable, userDataDir: profile, headless: true, timeout: 25000, protocolTimeout: 20000, signal, env, extraPrefsFirefox: { 'network.proxy.type': 1, 'network.proxy.http': endpoint.hostname, 'network.proxy.http_port': Number(endpoint.port), 'network.proxy.ssl': endpoint.hostname, 'network.proxy.ssl_port': Number(endpoint.port), 'network.proxy.no_proxies_on': '', 'network.proxy.failover_direct': false, 'network.trr.mode': 5, 'network.dns.disablePrefetch': true, 'network.prefetch-next': false, 'network.http.http3.enable': false, 'media.peerconnection.enabled': false, 'dom.serviceWorkers.enabled': false, 'browser.cache.disk.enable': false } });
      close = () => browser.close(); signal.throwIfAborted();
      const page = (await browser.pages()).find(p => p.url() === 'about:blank') || await browser.newPage();
      await page.authenticate({ username: proxy.username, password: proxy.password });
      await page.goto(proxy.authenticationUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.setRequestInterception(true);
      page.on('request', request => { if (['image','media','font','websocket'].includes(request.resourceType())) void request.abort().catch(() => {}); else void request.continue().catch(() => {}); });
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (response?.status() !== 200 || new URL(page.url()).origin !== new URL(url).origin) throw new Error('动态页面访问失败');
      await page.waitForFunction(() => (document.body?.innerText.length || 0) > 80, { timeout: 5000 }).catch(() => {}); html = await page.content();
    } else {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: runtime.executable, headless: true, chromiumSandbox: true, timeout: 25000, downloadsPath: profile, proxy: { server: proxy.server, username: proxy.username, password: proxy.password }, args: ['--proxy-bypass-list=<-loopback>', '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-background-networking'] });
      close = () => browser.close(); signal.throwIfAborted();
      const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
      await context.route('**/*', route => ['image','media','font','websocket'].includes(route.request().resourceType()) ? route.abort() : route.continue());
      const page = await context.newPage(); const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (response?.status() !== 200 || new URL(page.url()).origin !== new URL(url).origin) throw new Error('动态页面访问失败');
      await page.waitForFunction(() => (document.body?.innerText.length || 0) > 80, { timeout: 5000 }).catch(() => {}); html = await page.content();
    }
    signal.throwIfAborted(); if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('动态页面超过采集大小限制');
    return Buffer.from(html);
  } finally { signal.removeEventListener('abort', abort); await close?.().catch(() => {}); await proxy?.close().catch(() => {}); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
}
