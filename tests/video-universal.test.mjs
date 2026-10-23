import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, isAbsolute } from 'node:path';
import { request as httpRequest } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { PassThrough, Readable } from 'node:stream';
import { promisify } from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import * as options from '../lib/video-options.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, URL, Buffer, process, AbortSignal, setTimeout, clearTimeout, ...globals, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const publicPages = load('../lib/video-public-pages.ts');
const hls = load('../lib/video-hls.ts', { './video-options': options });
const network = load('../lib/video-network.ts', { './video-options': options });
const kuaishou = load('../lib/video-kuaishou.ts');
const noBrowser = { inspectBrowserVideo: async () => null, videoBrowserExecutable: async () => '' };
const proxyStub = { openVideoProxy: async () => ({ url: 'http://video:temporary@127.0.0.1:12345', close: async () => {} }) };
const base = { './video-options': options, './video-public-pages': publicPages, './video-network': network, './video-kuaishou': kuaishou, './video-hls': hls, './video-browser': noBrowser, './video-proxy': proxyStub };
const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff', source = 'https://www.douyin.com/video/7692515320217407402';
const video = { aweme_id: '7692515320217407402', desc: '公开作品', video: { duration: 5000, height: 720, play_addr: { url_list: ['https://cdn.example/video.mp4'] } } };
const media = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(100)]);
const stream = (bytes, headers = {}, statusCode = 200) => Object.assign(Readable.from([bytes]), { headers, statusCode });
async function scratch(t) {
  const root = await mkdtemp(join(process.cwd(), '.video-universal-test-'));
  t.after(async () => { const path = await realpath(root), child = relative(process.cwd(), path); assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.video-universal-test-')); await rm(path, { recursive: true, force: true }); });
  return root;
}
test('抖音必须匹配请求作品；好友、私密和删除状态准确提示，不能误用推荐视频', () => {
  const other = { ...video, aweme_id: '7692515320217407403' };
  assert.equal(publicPages.douyinDataVideo({ aweme_list: [other] }, source).media.length, 0);
  assert.equal(publicPages.douyinDataVideo({ aweme_list: [other, video] }, source).title, '公开作品');
  for (const [reason, message] of [['status_friend_see', '好友'], ['status_self_see', '私密'], ['status_deleted', '删除']]) assert.match(publicPages.douyinRestriction({ filter_detail: { aweme_id: video.aweme_id, filter_reason: reason } }, source), new RegExp(message));
  assert.equal(publicPages.douyinRestriction({ filter_detail: { aweme_id: other.aweme_id, filter_reason: 'status_friend_see' } }, source), '');
});

function browserHarness(data, launchError = false) {
  const state = { contextClosed: 0, browserClosed: 0, proxyClosed: 0, validated: [] }; let listener;
  const page = { on(_name, handler) { listener = handler; }, async goto() { listener({ url: () => 'https://www.douyin.com/aweme/v1/web/aweme/detail/', headers: () => ({ 'content-type': 'application/json' }), status: () => 200, body: async () => Buffer.from(JSON.stringify(data)) }); await Promise.resolve(); }, isClosed: () => false, content: async () => '', url: () => source, evaluate: async callback => callback.toString().includes('document.title') ? { title: '标题', urls: [], userAgent: 'Chrome' } : null };
  const context = { newPage: async () => page, route: async (_pattern, handler) => { state.route = handler; }, close: async () => { state.contextClosed++; } };
  const browser = { version: () => '156.0.0.0', newContext: async config => { state.context = config; return context; }, close: async () => { state.browserClosed++; } };
  state.api = load('../lib/video-browser.ts', {
    './video-options': options, './video-public-pages': publicPages,
    './video-network': { videoUrlAddress: async url => { state.validated.push(url); if (url.includes('localhost')) throw Error('内网'); } },
    './video-proxy': { openVideoProxy: async () => ({ server: 'http://127.0.0.1:12345', username: 'video', password: 'temporary', close: async () => { state.proxyClosed++; } }) },
    'node:fs/promises': { access: async () => {}, mkdir: async () => {} },
    'playwright-core': { chromium: { launch: async config => { state.launch = config; if (launchError) throw Error('launch failed'); return browser; } } },
  }, { process: { ...process, env: { VIDEO_BROWSER_PATH: '/project/browser' } } });
  return state;
}
test('动态解析使用独立匿名上下文、公网代理和当前浏览器 UA，成功后释放所有资源', async () => {
  const state = browserHarness({ aweme_detail: video }); const result = await state.api.inspectBrowserVideo(source);
  assert.equal(result.page.title, '公开作品'); assert.equal(result.page.media.length, 1);
  assert.match(state.context.userAgent, /Chrome\/156/); assert.equal(state.context.serviceWorkers, 'block'); assert.deepEqual(plain(state.context.permissions), []);
  assert.equal(state.launch.proxy.password, 'temporary'); assert.ok(state.launch.args.includes('--proxy-bypass-list=<-loopback>')); assert.equal(state.launch.chromiumSandbox, true);
  assert.equal(state.context.storageState, undefined); assert.equal(state.launch.userDataDir, undefined); assert.match(state.launch.env.TEMP, /vendor[\\/]video-engine/);
  assert.equal(state.contextClosed, 1); assert.equal(state.browserClosed, 1); assert.equal(state.proxyClosed, 1);
  let aborted = false; await state.route({ request: () => ({ url: () => 'file:///etc/passwd', resourceType: () => 'document' }), abort: async () => { aborted = true; } }); assert.ok(aborted);
});
test('动态解析准确透传好友可见限制，失败或引擎启动异常也释放代理与容量', async () => {
  const restricted = browserHarness({ filter_detail: { aweme_id: video.aweme_id, filter_reason: 'status_friend_see' } });
  await assert.rejects(restricted.api.inspectBrowserVideo(source), error => error.status === 403 && /好友/.test(error.message));
  assert.equal(restricted.proxyClosed, 1); assert.equal(restricted.browserClosed, 1);
  const failed = browserHarness({}, true); await assert.rejects(failed.api.inspectBrowserVideo(source), error => error.status === 503 && /网页解析引擎暂不可用/.test(error.message)); assert.equal(failed.proxyClosed, 1);
});

test('HLS 多画质及独立音轨按实际地址解析，支持相对路径', () => {
  const result = hls.hlsVariants('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",DEFAULT=YES,URI="audio/list.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,AUDIO="aac"\nvideo/list.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\nlow.m3u8', 'https://cdn.example/root/master.m3u8');
  assert.deepEqual(plain(result), [{ url: 'https://cdn.example/root/video/list.m3u8', height: 720, label: '720p · MP4', audio: 'https://cdn.example/root/audio/list.m3u8' }, { url: 'https://cdn.example/root/low.m3u8', height: 360, label: '360p · MP4' }]);
});
test('HLS VOD 支持初始化分段和连续字节范围，拒绝直播、加密、本地协议与超时长', () => {
  const result = hls.hlsSegments('#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"\n#EXTINF:1,\n#EXT-X-BYTERANGE:50@100\nfile.mp4\n#EXTINF:1,\n#EXT-X-BYTERANGE:50\nfile.mp4\n#EXT-X-ENDLIST', 'https://cdn.example/list.m3u8');
  assert.equal(result.duration, 2); assert.deepEqual(plain(result.parts.map(part => part.range)), [{ start: 0, end: 99 }, { start: 100, end: 149 }, { start: 150, end: 199 }]);
  for (const text of ['#EXTM3U\n#EXTINF:1,\nv.ts', '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXT-X-ENDLIST', '#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST', '#EXTM3U\n#EXTINF:3601,\nv.ts\n#EXT-X-ENDLIST', '#EXTM3U\n#EXT-X-BYTERANGE:50\nv.ts\n#EXT-X-ENDLIST']) assert.throws(() => hls.hlsSegments(text, 'https://cdn.example/list.m3u8'));
});

test('未列在前端平台标签的站点也使用通用规则，解析过程强制走受保护代理', async t => {
  const root = await scratch(t); await mkdir(join(root, 'vendor/video-engine'), { recursive: true }); await writeFile(join(root, 'vendor/video-engine', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'), 'stub', { mode: 0o755 });
  let args, closed = false;
  const engine = load('../lib/video-engine.ts', { ...base, './video-network': { ...network, videoUrlAddress: async () => ({}), videoResponse: async url => ({ url, response: stream(Buffer.from('<title>一般网页</title>'), { 'content-type': 'text/html' }) }) }, './video-proxy': { openVideoProxy: async () => ({ url: 'http://protected-proxy', close: async () => { closed = true; } }) }, 'node:child_process': { execFile(_file, given, _config, callback) { args = given; callback(null, { stdout: JSON.stringify({ title: '新增平台', formats: [{ url: 'https://cdn.example/video', ext: 'mp4', vcodec: 'avc1', acodec: 'aac' }] }) }); } } }, { process: { ...process, cwd: () => root, env: {} } });
  const info = await engine.inspectVideo('https://video-new.example/watch/1');
  assert.equal(info.title, '新增平台'); assert.equal(args[args.indexOf('--use-extractors') + 1], 'default'); assert.equal(args[args.indexOf('--proxy') + 1], 'http://protected-proxy'); assert.ok(closed);
});

test('HLS 下载逐分段限制大小，拒绝源站忽略字节范围，并清理未完成文件', async t => {
  const root = await scratch(t), binary = join(process.cwd(), 'vendor/video-engine', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  let claimsRange = false;
  const engine = load('../lib/video-engine.ts', { ...base, './video-network': { ...network, videoResponse: async url => ({ url, response: url.endsWith('list.m3u8') ? stream(Buffer.from('#EXTM3U\n#EXTINF:1,\n#EXT-X-BYTERANGE:24@0\nvideo.mp4\n#EXT-X-ENDLIST')) : stream(media, claimsRange ? { 'content-range': 'bytes 0-23/1024' } : {}, claimsRange ? 206 : 200) }) } }, { process: { ...process, cwd: () => root, env: { VIDEO_FFMPEG_PATH: binary } } });
  await assert.rejects(engine.materializeVideo(id, { extension: 'mp4', size: 0, parts: [{ url: 'https://cdn.example/list.m3u8', headers: {}, extension: 'mp4', playlist: 'hls' }] }, () => {}), /分段范围|FFmpeg/);
  await assert.rejects(stat(join(root, 'uploads/video-extractions', id, 'result.mp4')));
  if ((await stat(binary).catch(() => null))?.isFile()) { claimsRange = true; await assert.rejects(engine.materializeVideo(id, { extension: 'mp4', size: 0, parts: [{ url: 'https://cdn.example/list.m3u8', headers: {}, extension: 'mp4', playlist: 'hls' }] }, () => {}), /分段数据长度/); }
});

test('真实离线 HLS 经过应用逐段下载并转为包含音画的 MP4；加密源不发放文件', async t => {
  const root = await scratch(t), binary = join(process.cwd(), 'vendor/video-engine', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  try { await stat(binary); } catch { t.skip('尚未安装项目 FFmpeg'); return; }
  const run = promisify(require('node:child_process').execFile), playlist = join(root, 'input.m3u8');
  await run(binary, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=96x64:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=600', '-t', '1.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '5', '-c:a', 'aac', '-f', 'hls', '-hls_time', '0.5', '-hls_list_size', '0', playlist], { timeout: 15000, windowsHide: true });
  const requests = []; let encrypted = false;
  const engine = load('../lib/video-engine.ts', { ...base, './video-network': { ...network, videoUrlAddress: async () => ({}), videoResponse: async (url, headers = {}) => { requests.push({ url, headers }); const name = new URL(url).pathname.slice(1); assert.match(name, /^(?:input\.m3u8|input\d+\.ts)$/); return { url, response: stream(name === 'input.m3u8' && encrypted ? Buffer.from('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\n#EXT-X-ENDLIST') : await readFile(join(root, name)), { 'content-type': name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }) }; } } }, { process: { ...process, cwd: () => root, env: { VIDEO_FFMPEG_PATH: binary } } });
  const info = await engine.inspectVideo('https://cdn.example/input.m3u8'); assert.equal(info.formats[0].parts[0].playlist, 'hls');
  const result = await engine.materializeVideo(id, info.formats[0], () => {}); assert.ok(result.size > 0);
  await run(binary, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', result.path, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], { timeout: 10000, windowsHide: true });
  assert.ok(requests.some(item => item.url.endsWith('.ts'))); encrypted = true;
  const other = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; await assert.rejects(engine.materializeVideo(other, info.formats[0], () => {}), /加密/); await assert.rejects(stat(join(root, 'uploads/video-extractions', other, 'result.mp4')));
});

test('临时代理拒绝无凭据及内网 CONNECT，合法连接固定到校验 IP，关闭时清理隧道', async () => {
  const targets = [];
  const proxyApi = load('../lib/video-proxy.ts', { './video-network': { videoUrlAddress: async url => { if (url.includes('example.com')) return { url: new URL(url), address: { address: '8.8.8.8', family: 4 } }; return network.videoUrlAddress(url); } }, 'node:net': { connect(config) { targets.push(config); const socket = new PassThrough(); socket.setTimeout = () => socket; queueMicrotask(() => socket.emit('connect')); return socket; } } });
  const proxy = await proxyApi.openVideoProxy(), auth = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`;
  try {
    const unauthorized = await new Promise((resolve, reject) => { const request = httpRequest(proxy.server, { path: 'http://example.com/video' }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end(); }); assert.equal(unauthorized, 407);
    async function tunnel(target) { return new Promise((resolve, reject) => { const socket = tcpConnect(Number(new URL(proxy.server).port), '127.0.0.1'); socket.on('error', reject); socket.on('data', chunk => { socket.destroy(); resolve(chunk.toString()); }); socket.on('connect', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${auth}\r\n\r\n`)); }); }
    assert.match(await tunnel('127.0.0.1:443'), /403/); assert.equal(targets.length, 0);
    assert.match(await tunnel('example.com:443'), /200/); assert.equal(targets[0].host, '8.8.8.8'); assert.equal(targets[0].port, 443);
  } finally { await proxy.close(); }
});
