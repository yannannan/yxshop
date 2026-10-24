import { mkdir, mkdtemp, chmod, chown, realpath, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { openVideoProxy } from './video-proxy';
import { douyinCanonicalUrl, douyinDataVideo, douyinPageVideo, douyinRestriction, isDouyinPage, type PublicVideoPage } from './video-public-pages';
import { VideoError } from './video-options';
import type { BrowserVideo } from './video-browser';

export type FirefoxRuntime = { executable: string; launcher?: string; worker?: { uid: number; gid: number } };

// CentOS 7 使用 Mozilla 原版 Firefox + WebDriver BiDi，不依赖新版 Chromium / glibc。
export async function inspectFirefoxVideo(source: string, runtime: FirefoxRuntime, timeout: number, probe = false, diagnostics = false): Promise<BrowserVideo | null> {
  const { default: puppeteer } = await import('puppeteer-core');
  const temporary = resolve('vendor/video-engine/browser-temporary');
  await mkdir(temporary, { recursive: true });
  const profile = await mkdtemp(join(temporary, 'firefox-'));
  let browser: Browser | undefined;
  let proxy: Awaited<ReturnType<typeof openVideoProxy>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, finished = false;
  const began = Date.now();
  const report = (stage: string) => { if (diagnostics) console.error(`[${probe ? 'Firefox启动检查' : 'Firefox解析诊断'} +${Date.now() - began}ms] ${stage}`); };
  const failureType = (error: unknown) => {
    const message = String((error as Error)?.message || '');
    const command = message.match(/\b(?:network|browsingContext|session|script)\.[a-zA-Z]+\b/)?.[0] || '';
    const code = message.match(/\b(?:NS_ERROR_|ERR_|SEC_ERROR_|SSL_ERROR_|MOZILLA_PKIX_ERROR_)[A-Z0-9_]+\b/)?.[0] || '';
    return [(error as Error)?.name || 'Error', command, code].filter(Boolean).join(' ');
  };
  try {
    const worker = process.getuid?.() === 0 ? runtime.worker : undefined;
    if (process.platform === 'linux' && process.getuid?.() === 0 && (!worker || !runtime.launcher)) throw new VideoError('请先运行 CentOS 视频依赖安装脚本，配置非 root 网页解析账号', 503);
    if (worker) {
      if (!Number.isSafeInteger(worker.uid) || worker.uid < 1 || !Number.isSafeInteger(worker.gid) || worker.gid < 1) throw new Error('解析账号无效');
      await chown(profile, worker.uid, worker.gid);
    }
    await chmod(profile, 0o700);
    proxy = await openVideoProxy({ browserAuthentication: true });
    const budget = probe ? 90000 : Math.max(1000, timeout);
    const proxyUrl = new URL(proxy.server), deadline = began + budget;
    const environment: NodeJS.ProcessEnv = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, HOME: profile, XDG_RUNTIME_DIR: profile, XDG_CACHE_HOME: profile, XDG_CONFIG_HOME: profile, YX_VIDEO_FIREFOX_BINARY: runtime.executable };
    // 不继承运维终端里可能存在的“关闭沙箱”开关。
    for (const name of Object.keys(environment)) if (/^MOZ_DISABLE_.*SANDBOX$/.test(name)) delete environment[name];
    report(`准备浏览器进程和 BiDi 会话；本次总预算 ${budget}ms。`);
    browser = await puppeteer.launch({ browser: 'firefox', protocol: 'webDriverBiDi', executablePath: worker ? runtime.launcher : runtime.executable,
      headless: true, userDataDir: profile, timeout: probe ? 60000 : Math.min(30000, budget), protocolTimeout: probe ? 60000 : Math.min(30000, budget), env: environment,
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())), dumpio: probe && diagnostics,
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
    report('BiDi 会话已建立，正在读取本次新进程的初始空白页。');
    // 每次调用都有独立进程和 mkdtemp 档案，不复用其他任务的状态。
    // Firefox 启动已创建 about:blank，避免再走一次 browsingContext.create。
    const context = browser.defaultBrowserContext();
    const initial = (await context.pages()).find(page => !page.isClosed() && page.url() === 'about:blank');
    const page = initial || await context.newPage(), douyin = isDouyinPage(new URL(source).hostname), urls = new Set<string>();
    report(initial ? '已复用本次新进程的空白页，准备检查页面脚本。' : '本次新进程没有空白页，已创建新页面。');
    await page.authenticate({ username: proxy.username, password: proxy.password });
    report('页面认证处理器已就绪，正在完成本机代理握手（不请求外网）。');
    const authenticated = await page.goto(proxy.authenticationUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(10000, Math.max(1000, deadline - Date.now())) });
    if (authenticated?.status() !== 200) throw new VideoError('网页解析代理认证失败，请管理员检查视频引擎', 503);
    await page.setViewport({ width: 1365, height: 900 });
    if (probe) {
      report('正在检查 about:blank 和页面脚本。');
      await page.goto('about:blank', { timeout: 10000 });
      const userAgent = await page.evaluate(() => navigator.userAgent);
      return { page: { title: 'Firefox 启动检查通过', thumbnail: '', duration: 0, media: [], imagePost: false }, referer: 'about:blank', userAgent, urls: [] };
    }
    report(`浏览器与代理已就绪；页面解析剩余 ${Math.max(0, deadline - Date.now())}ms。`);
    await page.setRequestInterception(true);
    let detail: PublicVideoPage | null = null, restriction = '', reloaded = false, apiRequests = 0, apiResponses = 0, bodyFailures = 0, nextPageRead = 0;
    const started = Date.now();
    timer = setTimeout(() => { report(`解析总预算已用尽；作品接口 ${apiResponses} 次，响应体失败 ${bodyFailures} 次，匹配媒体 ${detail ? (detail as PublicVideoPage).media.length : 0} 个。`); finished = true; void browser?.close().catch(() => {}); }, Math.max(1, deadline - Date.now()));
    page.on('request', request => {
      void (async () => {
        const url = request.url();
        if (douyin && /^https?:\/\//i.test(url) && isDouyinPage(new URL(url).hostname) && url.includes('/aweme/')) apiRequests++;
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
      if (!isDouyinPage(new URL(response.url()).hostname) || !response.url().includes('/aweme/')) return;
      apiResponses++;
      if (apiResponses <= 8) report(`作品接口响应 ${response.status()}，声明大小 ${Number(response.headers()['content-length']) || 0} 字节。`);
      if (response.status() !== 200 || Number(response.headers()['content-length']) > 2 * 1024 ** 2) return;
      void (async () => {
        const body = await response.content();
        if (finished || body.length > 2 * 1024 ** 2) return;
        const data = JSON.parse(Buffer.from(body).toString());
        restriction = douyinRestriction(data, source);
        const found = douyinDataVideo(data, source);
        if (apiResponses <= 8) report(`作品数据已读取；状态码 ${Number(data?.status_code) || 0}，匹配媒体 ${found.media.length} 个，图文 ${found.imagePost}，访问受限 ${Boolean(restriction)}。`);
        if (found.media.length || found.imagePost) detail = found;
      })().catch(error => { bodyFailures++; if (bodyFailures <= 4) report(`作品响应体读取失败：${failureType(error)}。`); });
    });
    report('正在打开视频页面。');
    await page.goto(douyin ? douyinCanonicalUrl(source) || source : source, { waitUntil: 'domcontentloaded', timeout: Math.min(14000, Math.max(1000, deadline - Date.now())) }).then(response => { report(`视频页面导航响应 ${response?.status() || 0}。`); }).catch(error => { report(`视频页面导航未完成：${failureType(error)}。`); });
    while (!finished && !page.isClosed() && Date.now() < deadline - 1000 && !detail && !restriction && !urls.size) {
      // 慢机器先等待首次加载；过早刷新会中断尚未返回的作品请求。
      if (douyin && !reloaded && !apiRequests && !apiResponses && Date.now() - started > 12000 && deadline - Date.now() > 8000) {
        reloaded = true; const reloadStarted = Date.now(); report('首次加载12秒仍无作品接口请求，尝试一次刷新。');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: Math.min(8000, deadline - Date.now()) }).then(response => report(`刷新完成，响应 ${response?.status() || 0}，耗时 ${Date.now() - reloadStarted}ms。`)).catch(error => report(`刷新未完成：${failureType(error)}，耗时 ${Date.now() - reloadStarted}ms。`));
      }
      if (douyin && !finished && !page.isClosed() && Date.now() < deadline - 1000 && Date.now() >= nextPageRead) {
        const readStarted = Date.now();
        // 只取受支持的数据脚本，限制文本量且每2秒读取一次，避免反复序列化整个动态页面。
        const html = await page.evaluate(() => {
          const scripts: string[] = []; let characters = 0;
          for (const script of Array.from(document.querySelectorAll('script')).slice(0, 500)) {
            const text = script.textContent || '';
            if (!['RENDER_DATA', 'SIGI_STATE'].includes(script.id) && !/_ROUTER_DATA|__INITIAL_STATE__|SIGI_STATE/.test(text)) continue;
            if (characters + text.length > 2 * 1024 ** 2) continue;
            const html = script.outerHTML;
            if (characters + html.length <= 2 * 1024 ** 2) { scripts.push(html); characters += html.length; }
          }
          return scripts.join('');
        }).catch(() => '');
        const readFinished = Date.now();
        const found = douyinPageVideo(html, source); if (found.media.length || found.imagePost) detail = found;
        if (readFinished - readStarted > 2000 || Date.now() - readFinished > 1000) report(`数据脚本 ${html.length} 字符，浏览器读取 ${readFinished - readStarted}ms，本机解析 ${Date.now() - readFinished}ms。`);
        nextPageRead = Date.now() + 2000;
      }
      await page.evaluate(() => { for (const video of document.querySelectorAll('video')) { video.muted = true; void video.play().catch(() => {}); } }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    report(`页面解析耗时 ${Date.now() - started}ms；作品接口 ${apiResponses} 次，响应体失败 ${bodyFailures} 次，匹配媒体 ${detail ? (detail as PublicVideoPage).media.length : 0} 个，剩余 ${Math.max(0, deadline - Date.now())}ms。`);
    if (diagnostics && !page.isClosed()) {
      const state = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return { titleLength: document.title.length, videoCount: document.querySelectorAll('video').length, verificationPrompt: /安全验证|请完成验证|拖动滑块|验证码/.test(text), loginPrompt: /登录后观看|请先登录/.test(text) };
      }).catch(() => null);
      report(`最终页面状态 ${JSON.stringify(state)}；作品接口 ${apiResponses} 次，响应体失败 ${bodyFailures} 次，匹配媒体 ${detail ? (detail as PublicVideoPage).media.length : 0} 个。`);
    }
    if (restriction) throw new VideoError(restriction, 403);
    if (page.isClosed() || (douyin && !detail)) return null;
    const info = await page.evaluate(() => ({ title: document.title, userAgent: navigator.userAgent, urls: Array.from(document.querySelectorAll('video, video source')).map(node => node.getAttribute('src') || '').filter(url => /^https?:\/\//.test(url)) }));
    return { page: detail || { title: info.title, thumbnail: '', duration: 0, media: [], imagePost: false }, referer: page.url(), userAgent: info.userAgent, urls: douyin ? [] : [...new Set([...urls, ...info.urls])].slice(0, 12) };
  } finally {
    report('关闭本次浏览器、代理并清理匿名档案。');
    finished = true; clearTimeout(timer);
    await browser?.close().catch(() => {}); await proxy?.close().catch(() => {});
    const actual = await realpath(profile), child = relative(await realpath(temporary), actual);
    if (!isAbsolute(child) && !child.startsWith('..') && /^firefox-[^/\\]+$/.test(child)) await rm(actual, { recursive: true, force: true });
  }
}
