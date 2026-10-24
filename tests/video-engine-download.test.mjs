import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, rm, lstat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { downloadYtdlp, fetchSetupBytes, installYtdlp } from '../scripts/video-engine-download.mjs';

const bytes = Buffer.from('fake-official-linux-program-for-isolated-tests');
const hash = createHash('sha256').update(bytes).digest('hex');
const version = '2026.10.21', assetName = 'yt-dlp_linux';
const sums = `${hash}  ${assetName}\n`;
const release = { tag_name: version, assets: [
  { id: 1, name: 'SHA2-256SUMS', browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/SHA2-256SUMS` },
  { id: 2, name: assetName, size: bytes.length, digest: `sha256:${hash}`, browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${assetName}` },
] };

async function fixture(t) {
  const parent = await realpath(join(process.cwd(), 'tests')), root = await mkdtemp(join(parent, '.video-download-'));
  t.after(async () => { const child = relative(parent, await realpath(root)); assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.video-download-')); await rm(root, { recursive: true, force: true }); });
  const engine = join(root, 'vendor/video-engine'); await mkdir(engine, { recursive: true });
  const cache = join(engine, 'downloads/yt-dlp'), requests = [], logs = [], warnings = [];
  const config = { root, platform: 'linux', arch: 'x64', environment: {}, sleep: async () => {}, log: value => logs.push(value), warn: value => warnings.push(value), execute: async path => {
    if (!path.includes('.tmp')) throw Object.assign(Error('not ready'), { code: 'ENOENT' });
    assert.deepEqual(await readFile(path), bytes); return { stdout: `${version}\n` };
  }, fetchImpl: async (url, options) => {
    requests.push([url, options]);
    if (url.endsWith('/latest')) return Response.json(release);
    if (url.endsWith('/assets/1') || url.endsWith('/SHA2-256SUMS')) return new Response(sums);
    return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
  } };
  return { root, engine, cache, config, requests, logs, warnings, install: options => installYtdlp({ ...config, ...options }) };
}

test('已可运行的 yt-dlp 直接保留，不访问网络、不写安装缓存', async t => {
  const f = await fixture(t), path = join(f.engine, 'yt-dlp'); await writeFile(path, 'existing-program');
  const result = await f.install({ execute: async () => ({ stdout: `${version}\n` }) });
  assert.equal(result.installed, false); assert.equal(f.requests.length, 0); assert.equal(await readFile(path, 'utf8'), 'existing-program'); assert.equal(await lstat(f.cache).catch(() => null), null);
});

test('显式配置的外部引擎可复用，配置无效时不盲目安装到未使用的位置', async t => {
  const f = await fixture(t);
  assert.equal((await f.install({ environment: { VIDEO_YTDLP_PATH: 'custom/yt-dlp' }, execute: async () => ({ stdout: `${version}\n` }) })).installed, false);
  await assert.rejects(f.install({ environment: { VIDEO_YTDLP_PATH: 'custom/missing' } }), /VIDEO_YTDLP_PATH/); assert.equal(f.requests.length, 0);
});

test('从官方资产 API 流式下载并核对 SHA256、大小和版本后才安装', async t => {
  const f = await fixture(t); assert.equal((await f.install()).installed, true);
  assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
  assert.equal(f.requests.length, 3); assert.ok(f.requests[2][0].endsWith('/assets/2')); assert.equal(f.requests[2][1].headers.Accept, 'application/octet-stream');
  assert.deepEqual(await readFile(join(f.cache, version, assetName)), bytes);
  assert.ok(!(await readdir(f.engine)).some(name => name.includes('.tmp')));
});

test('官方 API 超时后回退发行地址，继续校验而不跳过 TLS 或使用第三方镜像', async t => {
  const f = await fixture(t), fetchImpl = f.config.fetchImpl; let fail = true;
  await f.install({ fetchImpl: async (url, options) => { if (url.endsWith('/assets/2') && fail) { fail = false; throw new DOMException('timeout', 'TimeoutError'); } return fetchImpl(url, options); } });
  assert.ok(f.requests.some(([url]) => url === release.assets[1].browser_download_url)); assert.ok(f.warnings.some(value => value.includes('超时')));
  assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
});

test('API 意外返回元数据时使用官方发行文件，不能把 JSON 当成可执行程序', async t => {
  const f = await fixture(t), fetchImpl = f.config.fetchImpl;
  await f.install({ fetchImpl: (url, options) => url.endsWith('/assets/2') ? Promise.resolve(Response.json({ metadata: true })) : fetchImpl(url, options) });
  assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes); assert.ok(f.requests.some(([url]) => url === release.assets[1].browser_download_url));
});

test('无有效数据的断线会回退下载，成功后不遗留断点', async t => {
  const f = await fixture(t), fetchImpl = f.config.fetchImpl; let broken = false;
  await f.install({ fetchImpl: async (url, options) => {
    if (url.endsWith('/assets/2') && !broken) { broken = true; return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 5)); controller.error(Error('connection reset')); } })); }
    return fetchImpl(url, options);
  } });
  assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes); assert.ok(!(await readdir(join(f.cache, version))).some(name => name.endsWith('.part')));
});

test('下载三次失败保留已有文件，后续可从完整缓存继续，无需重取版本和清单', async t => {
  const f = await fixture(t), fetchImpl = f.config.fetchImpl, target = join(f.engine, 'yt-dlp'); await writeFile(target, 'old-unusable-program'); let attempts = 0;
  await assert.rejects(f.install({ fetchImpl: async (url, options) => {
    if (url.endsWith('/assets/2') || url.endsWith(`/${assetName}`)) { attempts++; throw new DOMException('timeout', 'TimeoutError'); }
    return fetchImpl(url, options);
  } }), /三次失败.*offline/);
  assert.equal(attempts, 3); assert.equal(await readFile(target, 'utf8'), 'old-unusable-program'); assert.ok(!(await readdir(join(f.cache, version))).some(name => name.endsWith('.part')));
  f.requests.length = 0; await f.install(); assert.equal(f.requests.length, 1); assert.deepEqual(await readFile(target), bytes);
  // 模拟仅最终安装失败 / 目标被删除的重试；完整校验缓存不访问网络。
  await f.install({ fetchImpl: async () => { throw Error('不应再次访问网络'); } });
});

test('SHA256 不匹配不替换原引擎，不保留伪造的完整缓存或断点', async t => {
  const f = await fixture(t), fetchImpl = f.config.fetchImpl, target = join(f.engine, 'yt-dlp'); await writeFile(target, 'old-program');
  await assert.rejects(f.install({ fetchImpl: (url, options) => url.endsWith('/assets/2') ? Promise.resolve(new Response(Buffer.alloc(bytes.length, 1))) : fetchImpl(url, options) }), /SHA256/);
  assert.equal(await readFile(target, 'utf8'), 'old-program'); assert.equal(await lstat(join(f.cache, version, assetName)).catch(() => null), null);
  assert.equal(await lstat(join(f.cache, version, `${assetName}.part`)).catch(() => null), null);
});

test('本机离线包使用同一 SHA256 清单，完全不连接 GitHub；缺失或错误摘要拒绝安装', async t => {
  const f = await fixture(t), offline = join(f.cache, 'offline'); await mkdir(offline, { recursive: true });
  await writeFile(join(offline, assetName), bytes); await writeFile(join(offline, 'SHA2-256SUMS'), sums);
  await f.install({ fetchImpl: async () => { throw Error('离线包不应请求网络'); } }); assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
  await writeFile(join(offline, 'SHA2-256SUMS'), `${'0'.repeat(64)}  ${assetName}\n`);
  await assert.rejects(f.install(), /离线包 SHA256/); assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
});

test('官方元数据中的任意下载地址、非法版本与不一致摘要被拒绝', async t => {
  for (const kind of ['url', 'version', 'digest']) {
    const f = await fixture(t), changed = structuredClone(release), fetchImpl = f.config.fetchImpl;
    if (kind === 'url') changed.assets[1].browser_download_url = 'https://untrusted.invalid/program';
    if (kind === 'version') changed.tag_name = '../escape';
    if (kind === 'digest') changed.assets[1].digest = `sha256:${'0'.repeat(64)}`;
    await assert.rejects(f.install({ fetchImpl: (url, options) => url.endsWith('/latest') ? Promise.resolve(Response.json(changed)) : fetchImpl(url, options) }));
    assert.equal(await lstat(join(f.engine, 'yt-dlp')).catch(() => null), null);
  }
});

test('校验后的临时程序无法运行时保留旧引擎，缓存仍可供修复系统后重试', async t => {
  const f = await fixture(t), target = join(f.engine, 'yt-dlp'); await writeFile(target, 'old-program');
  await assert.rejects(f.install({ execute: async () => { throw Error('GLIBC missing'); } }), /GLIBC/);
  assert.equal(await readFile(target, 'utf8'), 'old-program'); assert.deepEqual(await readFile(join(f.cache, version, assetName)), bytes);
});

test('小型官方元数据与校验清单也支持超时重试及响应大小限制', async () => {
  let calls = 0;
  const bytes = await fetchSetupBytes('https://api.github.com/example', 100, { sleep: async () => {}, warn: () => {}, fetchImpl: async () => { if (++calls < 3) throw new DOMException('timeout', 'TimeoutError'); return new Response('ok'); } });
  assert.equal(bytes.toString(), 'ok'); assert.equal(calls, 3);
  await assert.rejects(fetchSetupBytes('https://api.github.com/example', 1, { attempts: 1, warn: () => {}, fetchImpl: async () => new Response('too large') }), /失败/);
});

const binaryRequest = url => url.endsWith('/assets/2') || url.endsWith(`/${assetName}`);
function rangedResponse(offset, options = {}) {
  return new Response(bytes.subarray(offset), { status: 206, headers: { 'Content-Range': `bytes ${offset}-${bytes.length - 1}/${bytes.length}`, 'Content-Length': String(bytes.length - offset), ...options } });
}
async function cachedPartial(f, content) {
  const folder = join(f.cache, version); await mkdir(folder, { recursive: true });
  await writeFile(join(f.cache, 'release.json'), JSON.stringify(release));
  await writeFile(join(folder, 'SHA2-256SUMS'), sums);
  await writeFile(join(folder, `${assetName}.part`), content);
}

test('进程重启后从磁盘断点发送 Range，206 只追加剩余内容并校验完整文件', async t => {
  const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 7));
  await f.install({ fetchImpl: async (url, options) => { assert.ok(binaryRequest(url)); assert.equal(options.headers.Range, 'bytes=7-'); assert.equal(options.headers['Accept-Encoding'], 'identity'); return rangedResponse(7); } });
  assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
  assert.equal(await lstat(join(f.cache, version, `${assetName}.part`)).catch(() => null), null);
});

test('网络持续失败后保留有效残片，下一次运行继续而不重新下载前缀', async t => {
  const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 7));
  await assert.rejects(f.install({ fetchImpl: async () => { throw Error('connection reset'); } }), /三次失败.*断点已保留/);
  assert.deepEqual(await readFile(join(f.cache, version, `${assetName}.part`)), bytes.subarray(0, 7));
  await f.install({ fetchImpl: async (url, options) => { assert.equal(options.headers.Range, 'bytes=7-'); return rangedResponse(7); } });
});

test('收到一部分数据后断线，重试直接使用新写入的断点', async t => {
  const f = await fixture(t), fetchImpl = f.config.fetchImpl; let binaryCalls = 0;
  await f.install({ fetchImpl: async (url, options) => {
    if (!binaryRequest(url)) return fetchImpl(url, options);
    if (++binaryCalls > 1) { assert.equal(options.headers.Range, 'bytes=9-'); return rangedResponse(9); }
    let sent = false;
    return new Response(new ReadableStream({ async pull(controller) {
      if (!sent) { sent = true; controller.enqueue(bytes.subarray(0, 9)); }
      else { await new Promise(resolve => setTimeout(resolve, 40)); controller.error(Error('connection reset')); }
    } }));
  } });
  assert.equal(binaryCalls, 2); assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
});

test('官方地址忽略 Range 返回 200 时截断旧文件，不重复拼接', async t => {
  const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 7));
  await f.install({ fetchImpl: async () => new Response(bytes) });
  assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes); assert.ok(f.logs.some(value => value.includes('未接受续传')));
});

test('错误 Content-Range、总大小或长度不能污染已有断点', async t => {
  for (const headers of [{ 'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` }, { 'Content-Range': `bytes 7-${bytes.length - 1}/${bytes.length + 1}` }, { 'Content-Length': '999999999' }]) {
    const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 7));
    await assert.rejects(f.install({ fetchImpl: async () => rangedResponse(7, headers) }), /三次失败/);
    assert.deepEqual(await readFile(join(f.cache, version, `${assetName}.part`)), bytes.subarray(0, 7));
  }
});

test('416 范围拒绝时丢弃过期断点，并在下一地址重新校验下载', async t => {
  const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 7)); let calls = 0;
  await f.install({ fetchImpl: async (url, options) => { if (++calls === 1) return new Response(null, { status: 416 }); assert.equal(options.headers.Range, undefined); return new Response(bytes); } });
  assert.equal(calls, 2); assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
});

test('完整残片可直接验证提升为缓存，损坏完整残片会丢弃后重取', async t => {
  for (const content of [bytes, Buffer.alloc(bytes.length, 1)]) {
    const f = await fixture(t); await cachedPartial(f, content); let calls = 0;
    await f.install({ fetchImpl: async (url, options) => { calls++; assert.equal(options.headers.Range, undefined); return new Response(bytes); } });
    assert.equal(calls, content === bytes ? 0 : 1); assert.deepEqual(await readFile(join(f.engine, 'yt-dlp')), bytes);
  }
});

test('持续慢速传输超过一个空闲窗口也不超时，只有连续无数据才中断续传', async t => {
  const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 0)); let calls = 0;
  const began = Date.now();
  await f.install({ idleTimeoutMs: 120, fetchImpl: async () => {
    calls++; let offset = 0;
    return new Response(new ReadableStream({ async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 30));
      controller.enqueue(bytes.subarray(offset, offset + 5)); offset += 5;
      if (offset >= bytes.length) controller.close();
    } }));
  } });
  assert.ok(Date.now() - began > 120); assert.equal(calls, 1);
});

test('长时间无数据会取消流并保留断点，回退地址继续而不是卡死', async t => {
  const f = await fixture(t); await cachedPartial(f, bytes.subarray(0, 7)); let calls = 0, cancelled = false;
  await f.install({ idleTimeoutMs: 60, fetchImpl: async (url, options) => {
    if (++calls > 1) { assert.equal(options.headers.Range, 'bytes=10-'); return rangedResponse(10); }
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(7, 10)); }, cancel() { cancelled = true; } }), { status: 206, headers: { 'Content-Range': `bytes 7-${bytes.length - 1}/${bytes.length}` } });
  } });
  assert.equal(calls, 2); assert.ok(cancelled); assert.ok(f.warnings.some(value => value.includes('超时')));
});

test('连接响应超时会取消连接并重试，不遗留计时器', async t => {
  const f = await fixture(t); await cachedPartial(f, Buffer.alloc(0)); let calls = 0;
  await f.install({ connectTimeoutMs: 40, fetchImpl: async (url, options) => {
    if (++calls > 1) return new Response(bytes);
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  assert.equal(calls, 2); assert.ok(f.warnings.some(value => value.includes('超时')));
});

test('准备跨平台离线文件只做下载和摘要检查，不执行或覆盖本机引擎', async t => {
  const f = await fixture(t), target = join(f.engine, 'yt-dlp'); await writeFile(target, 'existing-program');
  const prepared = await downloadYtdlp(f.config);
  assert.equal(prepared.sha256, hash); assert.equal(prepared.assetName, assetName); assert.equal(prepared.version, version);
  assert.deepEqual(await readFile(prepared.path), bytes); assert.equal(await readFile(target, 'utf8'), 'existing-program');
});
