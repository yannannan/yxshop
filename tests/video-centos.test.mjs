import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as fileSystem from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as options from '../lib/video-options.ts';

const require = createRequire(import.meta.url);
function load(file, mocks, processMock = process, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, URL, Buffer, process: processMock, AbortSignal, setTimeout, clearTimeout, console, ...globals, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const publicPages = load('../lib/video-public-pages.ts', {});
const source = 'https://www.douyin.com/video/7692515320217407402';
const video = { aweme_id: '7692515320217407402', desc: '匿名公开视频', video: { duration: 5000, play_addr: { url_list: ['https://cdn.example/public.mp4'] } } };
function harness({ data = { aweme_detail: video }, root = false, launchError = false, coldStart = false, initialPage = true, createError = false, authenticationStatus = 200, realProfiles = false, bodyError = false } = {}) {
  const state = { browserClosed: 0, contextClosed: 0, proxyClosed: 0, removed: [], navigations: [], budgets: [], diagnostics: [], newPageCalls: 0, launches: 0 };
  let responseHandler;
  const page = {
    authenticate: async credentials => { state.credentials = credentials; }, setViewport: async () => {}, setRequestInterception: async value => { state.intercept = value; },
    on(name, handler) { if (name === 'response') responseHandler = handler; else if (name === 'request') state.request = handler; },
    async goto(url) { state.navigations.push(url); responseHandler?.({ url: () => 'https://www.douyin.com/aweme/v1/web/aweme/detail/?token=never-log-this', headers: () => ({}), status: () => 200, content: async () => { if (bodyError) { state.pageClosed = true; throw Object.assign(Error('network.getData failed secret-cookie proxy-password'), { name: 'ProtocolError' }); } return Buffer.from(JSON.stringify(data)); } }); await Promise.resolve(); return { status: () => authenticationStatus }; },
    content: async () => '', isClosed: () => Boolean(state.pageClosed), url: () => state.navigations.at(-1) || 'about:blank',
    evaluate: async fn => fn.toString().includes('verificationPrompt') ? { titleLength: 2, videoCount: 0, verificationPrompt: true, loginPrompt: false } : fn.toString().includes('document.title') ? { title: '标题', urls: [], userAgent: 'Firefox/158' } : 'Firefox/158',
  };
  const context = { pages: async () => initialPage ? [page] : [], newPage: async () => { state.newPageCalls++; if (createError) throw Error('browsingContext.create timed out'); return page; }, close: async () => { state.contextClosed++; } };
  const browser = { defaultBrowserContext: () => context, createBrowserContext: async () => { throw Error('不应在全新进程中再次创建隔离上下文'); }, close: async () => { state.browserClosed++; } };
  state.api = load('../lib/video-firefox.ts', {
    './video-options': options, './video-public-pages': publicPages,
    './video-proxy': { openVideoProxy: async config => { state.proxyConfig = config; return { server: 'http://127.0.0.1:12345', username: 'video', password: 'temporary', authenticationUrl: 'http://video-proxy.invalid/random-handshake', close: async () => { state.proxyClosed++; } }; } },
    'puppeteer-core': { __esModule: true, default: { launch: async config => { state.launch = config; state.launches++; if (launchError) throw Error('launch failed'); if (coldStart && config.protocolTimeout <= 10000) throw Error('session.new timed out'); return browser; } } },
    'node:fs/promises': realProfiles ? { ...fileSystem, rm: async (path, options) => { state.removed.push(path); await fileSystem.rm(path, options); } } : { mkdir: async () => {}, mkdtemp: async prefix => `${prefix}123456`, chmod: async () => {}, chown: async (...args) => { state.owner = args; }, realpath: async value => value, rm: async path => { state.removed.push(path); } },
  }, { ...process, platform: root ? 'linux' : 'win32', getuid: () => root ? 0 : 1000, env: { MOZ_DISABLE_CONTENT_SANDBOX: '1' } }, {
    AbortSignal: { timeout: value => { state.budgets.push(value); return AbortSignal.timeout(value); } },
    console: { ...console, error: value => state.diagnostics.push(value) },
  });
  return state;
}
test('CentOS Firefox 解析匹配视频，代理无本机豁免、禁止直接回退，沙箱保持开启', async () => {
  const state = harness(); const result = await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 15000);
  assert.equal(result.page.title, '匿名公开视频'); assert.equal(result.page.media.length, 1);
  assert.equal(state.launch.browser, 'firefox'); assert.equal(state.launch.protocol, 'webDriverBiDi');
  assert.equal(state.launch.extraPrefsFirefox['network.proxy.no_proxies_on'], '');
  assert.equal(state.launch.extraPrefsFirefox['network.proxy.allow_hijacking_localhost'], true);
  assert.equal(state.launch.extraPrefsFirefox['network.proxy.failover_direct'], false);
  assert.equal(state.launch.extraPrefsFirefox['media.peerconnection.enabled'], false);
  assert.equal(state.launch.extraPrefsFirefox['security.sandbox.content.level'], undefined);
  assert.equal(state.launch.env.MOZ_DISABLE_CONTENT_SANDBOX, undefined);
  assert.equal(state.credentials.password, 'temporary'); assert.equal(state.proxyClosed, 1); assert.equal(state.contextClosed, 0); assert.equal(state.browserClosed, 1); assert.equal(state.removed.length, 1);
  let aborted = false, continued = false;
  state.request({ url: () => 'file:///etc/passwd', resourceType: () => 'document', abort: async () => { aborted = true; }, continue: async () => { continued = true; } });
  await Promise.resolve(); assert.ok(aborted); assert.equal(continued, false);
});
test('root 商城通过专用账号启动 Firefox，临时匿名档案归属该账号', async () => {
  const state = harness({ root: true });
  await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox', launcher: '/project/firefox-launch.sh', worker: { uid: 997, gid: 997 } }, 15000);
  assert.equal(state.launch.executablePath, '/project/firefox-launch.sh');
  assert.equal(state.launch.env.YX_VIDEO_FIREFOX_BINARY, '/project/firefox'); assert.equal(state.owner[1], 997);
  assert.match(state.launch.userDataDir, /firefox-123456$/);
});
test('root 缺少隔离账号时拒绝启动，不通过关闭沙箱勉强运行', async () => {
  const state = harness({ root: true });
  await assert.rejects(state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 10000), /非 root/);
  assert.equal(state.launch, undefined); assert.equal(state.removed.length, 1);
});
test('Firefox 启动失败或作品仅好友可见时仍释放浏览器、代理和匿名档案', async () => {
  const failed = harness({ launchError: true });
  await assert.rejects(failed.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 10000), /launch failed/);
  assert.equal(failed.proxyClosed, 1); assert.equal(failed.removed.length, 1);
  const restricted = harness({ data: { filter_detail: { aweme_id: video.aweme_id, filter_reason: 'status_friend_see' } } });
  await assert.rejects(restricted.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 15000), error => error.status === 403 && /好友/.test(error.message));
  assert.equal(restricted.browserClosed, 1); assert.equal(restricted.proxyClosed, 1); assert.equal(restricted.removed.length, 1);
});
test('启动自检只进行本机代理握手和 about:blank，不连接业务库或真实网站', async () => {
  const state = harness(); const result = await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 10000, true);
  assert.equal(result.referer, 'about:blank'); assert.deepEqual(state.navigations, ['http://video-proxy.invalid/random-handshake', 'about:blank']); assert.equal(state.proxyClosed, 1);
  assert.equal(state.proxyConfig.browserAuthentication, true);
});

test('代理握手失败不访问视频源站，释放本次进程、代理及档案', async () => {
  const state = harness({ authenticationStatus: 403 });
  await assert.rejects(state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000), /代理认证失败/);
  assert.deepEqual(state.navigations, ['http://video-proxy.invalid/random-handshake']);
  assert.equal(state.browserClosed, 1); assert.equal(state.proxyClosed, 1); assert.equal(state.removed.length, 1);
});

test('冷启动自检不再用10秒会话限制，允许60秒握手且总预算90秒', async () => {
  const state = harness({ coldStart: true });
  const result = await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 12000, true);
  assert.equal(result.referer, 'about:blank'); assert.equal(state.launch.timeout, 60000); assert.equal(state.launch.protocolTimeout, 60000);
  assert.deepEqual(state.budgets, [90000]); assert.equal(state.launch.signal.aborted, false);
  assert.equal(state.launch.dumpio, false); assert.deepEqual(state.diagnostics, []);
});

test('实际解析仍受请求总预算约束，不跟随安装自检放大到90秒', async () => {
  const state = harness({ coldStart: true }); await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000);
  assert.equal(state.launch.timeout, 20000); assert.equal(state.launch.protocolTimeout, 20000); assert.deepEqual(state.budgets, [24000]);
  assert.equal(state.launch.dumpio, false); assert.deepEqual(state.diagnostics, []);
});

test('显式真实解析诊断显示作品接口与阶段，不启用原始stderr或泄漏源地址和Cookie', async () => {
  const state = harness(); await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000, false, true);
  assert.equal(state.launch.dumpio, false); assert.deepEqual(state.budgets, [24000]);
  const output = state.diagnostics.join('\n');
  assert.match(output, /Firefox解析诊断/); assert.match(output, /视频页面导航响应 200/); assert.match(output, /匹配媒体 1 个/); assert.match(output, /verificationPrompt/);
  assert.doesNotMatch(output, /never-log-this|secret-cookie|proxy-password|cdn\.example|random-handshake/);
  assert.equal(state.proxyClosed, 1); assert.equal(state.removed.length, 1);
  const failure = harness({ bodyError: true }); assert.equal(await failure.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000, false, true), null);
  const errors = failure.diagnostics.join('\n'); assert.match(errors, /作品响应体读取失败：ProtocolError network.getData/);
  assert.doesNotMatch(errors, /never-log-this|secret-cookie|proxy-password/); assert.equal(failure.browserClosed, 1); assert.equal(failure.removed.length, 1);
});

test('诊断仅在自检显式开启，输出阶段与浏览器stderr，启动失败仍清理', async () => {
  const state = harness(); await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 12000, true, true);
  assert.equal(state.launch.dumpio, true); assert.ok(state.diagnostics.some(value => value.includes('BiDi 会话已建立')));
  assert.ok(state.diagnostics.some(value => value.includes('about:blank'))); assert.equal(state.browserClosed, 1);
  const failed = harness({ launchError: true });
  await assert.rejects(failed.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 12000, true, true), /launch failed/);
  assert.equal(failed.proxyClosed, 1); assert.equal(failed.removed.length, 1);
  assert.ok(failed.diagnostics.some(value => value.includes('清理匿名档案')));
});

test('自检和真实解析都使用各自新进程的初始空白页，不触发额外页面创建', async () => {
  for (const probe of [true, false]) {
    const state = harness({ createError: true });
    const result = await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000, probe);
    assert.ok(result); assert.equal(state.newPageCalls, 0); assert.equal(state.launches, 1);
    assert.equal(state.browserClosed, 1); assert.equal(state.removed.length, 1);
  }
});

test('只有启动时没有空白页才新建页面，创建失败仍关闭本次进程和代理', async () => {
  const fallback = harness({ initialPage: false }); await fallback.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000, true);
  assert.equal(fallback.newPageCalls, 1); assert.equal(fallback.browserClosed, 1);
  const failed = harness({ initialPage: false, createError: true });
  await assert.rejects(failed.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000, true), /browsingContext.create/);
  assert.equal(failed.browserClosed, 1); assert.equal(failed.proxyClosed, 1); assert.equal(failed.removed.length, 1);
});

test('同时解析各有独立真实临时档案和浏览器生命周期，结束只删除各自档案', async () => {
  const first = harness({ realProfiles: true }), second = harness({ realProfiles: true });
  await Promise.all([first, second].map(state => state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 24000, true)));
  assert.notEqual(first.launch.userDataDir, second.launch.userDataDir);
  for (const state of [first, second]) {
    assert.equal(state.launches, 1); assert.equal(state.browserClosed, 1); assert.equal(state.removed.length, 1);
    await assert.rejects(fileSystem.stat(state.launch.userDataDir), { code: 'ENOENT' });
  }
});
test('浏览器配置识别 Firefox，拒绝跨操作系统路径记录，保留旧 Chromium 记录兼容', async () => {
  function runtime(record, env = {}) { return load('../lib/video-browser.ts', { './video-options': options, './video-public-pages': publicPages, './video-network': {}, './video-proxy': {}, 'node:fs/promises': { readFile: async () => JSON.stringify(record), access: async () => {} } }, { ...process, platform: 'linux', env }); }
  assert.equal((await runtime({ executable: '/firefox', engine: 'firefox', platform: 'linux' }).videoBrowserRuntime()).engine, 'firefox');
  assert.equal(await runtime({ executable: 'C:/chrome.exe', platform: 'win32' }).videoBrowserExecutable(), '');
  assert.equal((await runtime({ executable: '/chrome', platform: 'linux' }).videoBrowserRuntime()).engine, 'chromium');
  assert.equal((await runtime({}, { VIDEO_BROWSER_PATH: '/custom/firefox', VIDEO_BROWSER_ENGINE: 'firefox' }).videoBrowserRuntime()).engine, 'firefox');
});

test('真实链接诊断从浏览器选择透传到 Firefox，普通调用默认关闭且不输出档案路径', async () => {
  const calls = [], output = [];
  const api = load('../lib/video-browser.ts', {
    './video-options': options, './video-public-pages': publicPages, './video-proxy': {},
    './video-network': { videoUrlAddress: async () => ({}) },
    './video-firefox': { inspectFirefoxVideo: async (...args) => { calls.push(args); return null; } },
    'node:fs/promises': { readFile: async () => JSON.stringify({ engine: 'firefox', platform: 'linux', executable: '/private-profile/firefox' }), access: async () => {} },
  }, { ...process, platform: 'linux', env: {} }, { console: { error: value => output.push(value) } });
  await api.inspectBrowserVideo(source, 24000, true);
  assert.equal(calls[0][3], false); assert.equal(calls[0][4], true); assert.match(output.join('\n'), /网页引擎：firefox/);
  assert.doesNotMatch(output.join('\n'), /private-profile/); output.length = 0;
  await api.inspectBrowserVideo(source, 24000);
  assert.equal(calls[1][4], false); assert.deepEqual(output, []);
});
