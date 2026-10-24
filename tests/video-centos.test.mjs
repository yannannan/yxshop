import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as options from '../lib/video-options.ts';

const require = createRequire(import.meta.url);
function load(file, mocks, processMock = process) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, URL, Buffer, process: processMock, AbortSignal, setTimeout, clearTimeout, console, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const publicPages = load('../lib/video-public-pages.ts', {});
const source = 'https://www.douyin.com/video/7692515320217407402';
const video = { aweme_id: '7692515320217407402', desc: '匿名公开视频', video: { duration: 5000, play_addr: { url_list: ['https://cdn.example/public.mp4'] } } };
function harness({ data = { aweme_detail: video }, root = false, launchError = false } = {}) {
  const state = { browserClosed: 0, contextClosed: 0, proxyClosed: 0, removed: [], navigations: [] };
  let responseHandler;
  const page = {
    authenticate: async credentials => { state.credentials = credentials; }, setViewport: async () => {}, setRequestInterception: async value => { state.intercept = value; },
    on(name, handler) { if (name === 'response') responseHandler = handler; else if (name === 'request') state.request = handler; },
    async goto(url) { state.navigations.push(url); responseHandler?.({ url: () => 'https://www.douyin.com/aweme/v1/web/aweme/detail/', headers: () => ({}), status: () => 200, content: async () => Buffer.from(JSON.stringify(data)) }); await Promise.resolve(); },
    content: async () => '', isClosed: () => false, url: () => source,
    evaluate: async fn => fn.toString().includes('document.title') ? { title: '标题', urls: [], userAgent: 'Firefox/158' } : 'Firefox/158',
  };
  const context = { newPage: async () => page, close: async () => { state.contextClosed++; } };
  const browser = { createBrowserContext: async () => context, close: async () => { state.browserClosed++; } };
  state.api = load('../lib/video-firefox.ts', {
    './video-options': options, './video-public-pages': publicPages,
    './video-proxy': { openVideoProxy: async () => ({ server: 'http://127.0.0.1:12345', username: 'video', password: 'temporary', close: async () => { state.proxyClosed++; } }) },
    'puppeteer-core': { __esModule: true, default: { launch: async config => { state.launch = config; if (launchError) throw Error('launch failed'); return browser; } } },
    'node:fs/promises': { mkdir: async () => {}, mkdtemp: async prefix => `${prefix}123456`, chmod: async () => {}, chown: async (...args) => { state.owner = args; }, realpath: async value => value, rm: async path => { state.removed.push(path); } },
  }, { ...process, platform: root ? 'linux' : 'win32', getuid: () => root ? 0 : 1000, env: { MOZ_DISABLE_CONTENT_SANDBOX: '1' } });
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
  assert.equal(state.credentials.password, 'temporary'); assert.equal(state.proxyClosed, 1); assert.equal(state.contextClosed, 1); assert.equal(state.browserClosed, 1); assert.equal(state.removed.length, 1);
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
test('启动自检只访问 about:blank，不连接业务库或请求真实网站', async () => {
  const state = harness(); const result = await state.api.inspectFirefoxVideo(source, { executable: '/project/firefox' }, 10000, true);
  assert.equal(result.referer, 'about:blank'); assert.deepEqual(state.navigations, ['about:blank']); assert.equal(state.proxyClosed, 1);
});
test('浏览器配置识别 Firefox，拒绝跨操作系统路径记录，保留旧 Chromium 记录兼容', async () => {
  function runtime(record, env = {}) { return load('../lib/video-browser.ts', { './video-options': options, './video-public-pages': publicPages, './video-network': {}, './video-proxy': {}, 'node:fs/promises': { readFile: async () => JSON.stringify(record), access: async () => {} } }, { ...process, platform: 'linux', env }); }
  assert.equal((await runtime({ executable: '/firefox', engine: 'firefox', platform: 'linux' }).videoBrowserRuntime()).engine, 'firefox');
  assert.equal(await runtime({ executable: 'C:/chrome.exe', platform: 'win32' }).videoBrowserExecutable(), '');
  assert.equal((await runtime({ executable: '/chrome', platform: 'linux' }).videoBrowserRuntime()).engine, 'chromium');
  assert.equal((await runtime({}, { VIDEO_BROWSER_PATH: '/custom/firefox', VIDEO_BROWSER_ENGINE: 'firefox' }).videoBrowserRuntime()).engine, 'firefox');
});
