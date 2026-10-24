import { createReadStream, createWriteStream, constants } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const executeFile = promisify(execFile);
const binaries = { 'win32:x64': 'yt-dlp.exe', 'win32:arm64': 'yt-dlp_arm64.exe', 'linux:x64': 'yt-dlp_linux', 'linux:arm64': 'yt-dlp_linux_aarch64', 'darwin:x64': 'yt-dlp_macos', 'darwin:arm64': 'yt-dlp_macos' };
const maxBinaryBytes = 150 * 1024 ** 2;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const requestHeaders = accept => ({ 'User-Agent': 'yxshop-video-engine-setup', Accept: accept });
const reason = error => /timeout|abort/i.test(`${error.name} ${error.code} ${error.cause?.code}`) ? '连接或下载超时' : error.status ? `HTTP ${error.status}` : '网络连接或响应异常';

async function responseFor(url, { fetchImpl, timeoutMs, accept }) {
  const response = await fetchImpl(url, { headers: requestHeaders(accept), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw Object.assign(new Error('官方下载响应不可用'), { status: response.status }); }
  if (response.url && new URL(response.url).protocol !== 'https:') { await response.body.cancel(); throw new Error('官方下载必须使用 HTTPS'); }
  return response;
}

export async function fetchSetupBytes(urls, max, { fetchImpl = fetch, timeoutMs = 120000, attempts = 3, sleep = pause, warn = console.error } = {}) {
  const sources = (Array.isArray(urls) ? urls : [urls]).map(source => typeof source === 'string' ? { url: source, accept: 'application/octet-stream' } : source);
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const source = sources[attempt % sources.length];
      const response = await responseFor(source.url, { fetchImpl, timeoutMs, accept: source.accept || 'application/octet-stream' });
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > max) throw new Error('下载文件超过预期大小'); chunks.push(chunk); }
      return Buffer.concat(chunks);
    } catch (error) {
      failure = error;
      if (attempt + 1 < attempts) { warn(`官方下载${reason(error)}，准备重试（${attempt + 1}/${attempts}）。`); await sleep(1000 * (attempt + 1)); }
    }
  }
  throw new Error(`官方下载失败：${reason(failure)}；已尝试 ${attempts} 次`);
}

async function directory(path) {
  await mkdir(path, { recursive: true });
  if (await realpath(path) !== path) throw new Error('视频下载目录不能使用链接');
}
async function digestFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBinaryBytes) throw new Error('视频引擎缓存文件不正确');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { hash: hash.digest('hex'), size: info.size };
}
async function smallFile(path, max) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max) throw new Error('视频引擎缓存记录不正确');
  return readFile(path, 'utf8');
}
function checksum(sums, name) {
  const matches = sums.split(/\r?\n/).map(line => line.trim().split(/\s+\*?/)).filter(parts => parts[1] === name);
  if (matches.length !== 1 || !/^[a-f0-9]{64}$/i.test(matches[0][0])) throw new Error('官方 SHA256 校验记录缺失或重复');
  return matches[0][0].toLowerCase();
}
function releaseAsset(release, name) {
  if (!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(release?.tag_name) || !Array.isArray(release.assets)) throw new Error('yt-dlp 官方版本记录不正确');
  const asset = release.assets.find(item => item.name === name);
  if (!asset || asset.browser_download_url !== `https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/${name}` || !Number.isSafeInteger(asset.id) || asset.id < 1) throw new Error('官方发行文件或地址不正确');
  // 元数据 API 已可达的服务器，优先尝试同一官方 API 的二进制下载；保留发行页作为回退。
  return { ...asset, sources: [{ url: `https://api.github.com/repos/yt-dlp/yt-dlp/releases/assets/${asset.id}`, accept: 'application/octet-stream' }, { url: asset.browser_download_url, accept: 'application/octet-stream' }] };
}

async function partialSize(path, expectedSize) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > expectedSize) throw new Error('yt-dlp 断点文件不正确，请移走该文件后重试');
    return info.size;
  } catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}

async function downloadBinary(cached, asset, expected, { fetchImpl, sleep, log, warn, connectTimeoutMs, idleTimeoutMs }) {
  const partial = `${cached}.part`;
  // 版本目录和官方摘要固定了下载对象；中断后保留同一个文件供下次执行继续。
  if (await partialSize(partial, asset.size) === asset.size) {
    if ((await digestFile(partial)).hash === expected) { await rename(partial, cached); return; }
    await unlink(partial);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = await partialSize(partial, asset.size), controller = new AbortController();
    let timer, response;
    const arm = milliseconds => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(new DOMException('下载连接或接收数据超时', 'TimeoutError')), milliseconds);
    };
    try {
      const source = asset.sources[attempt % asset.sources.length];
      log(`yt-dlp ${offset ? `从 ${(offset / 1024 ** 2).toFixed(1)} MB 断点续传` : '开始下载'} / ${(asset.size / 1024 ** 2).toFixed(1)} MB（第 ${attempt + 1}/3 次）。`);
      arm(connectTimeoutMs);
      response = await fetchImpl(source.url, { headers: { ...requestHeaders(source.accept), 'Accept-Encoding': 'identity', ...(offset ? { Range: `bytes=${offset}-` } : {}) }, signal: controller.signal });
      controller.signal.throwIfAborted();
      arm(idleTimeoutMs);
      if (response.status === 416) { await unlink(partial).catch(error => { if (error.code !== 'ENOENT') throw error; }); throw new Error('断点范围不可用，下一次从头下载'); }
      if (!response.ok || !response.body) throw Object.assign(new Error('官方下载响应不可用'), { status: response.status });
      if (response.url && new URL(response.url).protocol !== 'https:') throw new Error('官方下载必须使用 HTTPS');
      if ((response.headers.get('content-type') || '').includes('json')) throw new Error('官方 API 返回了元数据，切换发行文件地址');
      if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity') throw new Error('官方下载响应使用了不兼容断点续传的压缩');
      let start = 0, end = asset.size - 1;
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
        if (!range || Number(range[1]) !== offset || Number(range[2]) < offset || Number(range[2]) >= asset.size || Number(range[3]) !== asset.size) throw new Error('官方响应的续传范围不正确，未追加文件');
        start = offset; end = Number(range[2]);
      } else if (response.status !== 200) throw new Error('官方下载响应状态不正确');
      else if (offset) log('该官方地址未接受续传，安全地从头下载，不拼接重复内容。');
      const lengthHeader = response.headers.get('content-length');
      if (lengthHeader !== null && (!/^\d+$/.test(lengthHeader) || Number(lengthHeader) !== end - start + 1)) throw new Error('官方下载文件长度与预期范围不一致');
      let length = start, reported = start, reportedAt = Date.now();
      const meter = new Transform({ transform(chunk, encoding, callback) {
        arm(idleTimeoutMs); length += chunk.length;
        if (length > end + 1) return callback(Object.assign(new Error('yt-dlp 下载长度超过官方大小，未安装'), { integrity: true }));
        if (length - reported >= 5 * 1024 ** 2 || Date.now() - reportedAt >= 15000) {
          reported = length; reportedAt = Date.now(); log(`yt-dlp 已下载 ${(length / 1024 ** 2).toFixed(1)} / ${(asset.size / 1024 ** 2).toFixed(1)} MB…`);
        }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, { flags: (start ? constants.O_APPEND : constants.O_TRUNC) | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), mode: 0o600 }), { signal: controller.signal });
      clearTimeout(timer);
      const info = await digestFile(partial);
      if (info.size !== asset.size) throw new Error('下载提前结束，保留断点继续');
      if (info.hash !== expected) throw Object.assign(new Error('yt-dlp SHA256 校验失败，未安装下载文件'), { integrity: true });
      await rename(partial, cached); return;
    } catch (error) {
      if (error.integrity) { await unlink(partial).catch(() => {}); throw error; }
      warn(`yt-dlp 官方下载${reason(controller.signal.aborted ? controller.signal.reason : error)}（第 ${attempt + 1}/3 次），保留已下载进度。`);
      if (attempt === 2) throw new Error('yt-dlp 下载三次失败，断点已保留，下次运行会继续。也可将官方文件和同版本 SHA2-256SUMS 放入 vendor/video-engine/downloads/yt-dlp/offline/ 后重跑原安装脚本');
    } finally {
      clearTimeout(timer); controller.abort();
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
    await sleep(1000 * (attempt + 1));
  }
}

// 仅获取及校验指定平台文件，可在 Windows 准备 Linux 离线包；不会执行跨平台程序。
export async function downloadYtdlp({ root, platform = process.platform, arch = process.arch, fetchImpl = fetch, sleep = pause, log = console.log, warn = console.error, connectTimeoutMs = 60000, idleTimeoutMs = 120000 } = {}) {
  root = await realpath(root);
  const engine = join(root, 'vendor/video-engine'), assetName = binaries[`${platform}:${arch}`];
  if (!assetName) throw new Error('当前系统架构请手动从 yt-dlp 官方发行页安装');
  await directory(engine);
  const cache = join(engine, 'downloads/yt-dlp'); await directory(cache);
  let cached, expected, release, binaryAsset;
  const offline = join(cache, 'offline');
  try { await access(join(offline, assetName)); await access(join(offline, 'SHA2-256SUMS')); cached = join(offline, assetName); } catch { /* 没有手工准备完整离线包时继续在线 / 版本缓存。 */ }
  if (cached) {
    if (await realpath(offline) !== offline) throw new Error('离线缓存目录不能使用链接');
    expected = checksum(await smallFile(join(offline, 'SHA2-256SUMS'), 1000000), assetName);
    log('使用本机准备的 yt-dlp 离线包，仍校验 SHA256。');
  } else {
    const metadataPath = join(cache, 'release.json');
    try { release = JSON.parse(await smallFile(metadataPath, 2000000)); releaseAsset(release, assetName); releaseAsset(release, 'SHA2-256SUMS'); }
    catch {
      release = JSON.parse((await fetchSetupBytes([{ url: 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', accept: 'application/vnd.github+json' }], 2000000, { fetchImpl, sleep, warn, timeoutMs: 60000 })).toString());
      releaseAsset(release, assetName); releaseAsset(release, 'SHA2-256SUMS');
      const temporary = `${metadataPath}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(release), { flag: 'wx' }); await rename(temporary, metadataPath); } finally { await unlink(temporary).catch(() => {}); }
    }
    binaryAsset = releaseAsset(release, assetName);
    if (!Number.isSafeInteger(binaryAsset.size) || binaryAsset.size < 1 || binaryAsset.size > maxBinaryBytes) throw new Error('官方发行文件大小不正确');
    const sumsAsset = releaseAsset(release, 'SHA2-256SUMS');
    const versionCache = join(cache, release.tag_name); await directory(versionCache);
    const sumsPath = join(versionCache, 'SHA2-256SUMS');
    let sums;
    try { sums = await smallFile(sumsPath, 1000000); expected = checksum(sums, assetName); }
    catch {
      sums = (await fetchSetupBytes(sumsAsset.sources, 1000000, { fetchImpl, sleep, warn })).toString(); expected = checksum(sums, assetName);
      const temporary = `${sumsPath}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, sums, { flag: 'wx' }); await rename(temporary, sumsPath); } finally { await unlink(temporary).catch(() => {}); }
    }
    if (binaryAsset.digest?.startsWith('sha256:') && binaryAsset.digest.slice(7) !== expected) throw new Error('官方资产摘要与 SHA256 清单不一致');
    cached = join(versionCache, assetName);
  }
  let verified = false;
  try { verified = (await digestFile(cached)).hash === expected; } catch { /* 缓存缺失或不完整时重新下载。 */ }
  if (!verified && !binaryAsset) throw new Error('离线包 SHA256 校验失败，未安装；请从同一官方版本重新获取文件和 SHA2-256SUMS');
  if (!verified) {
    log(`下载官方 yt-dlp ${release.tag_name}（${assetName}），支持断点续传；连接超时 ${connectTimeoutMs / 1000} 秒，连续 ${idleTimeoutMs / 1000} 秒无数据才重试，最多 3 次。`);
    await downloadBinary(cached, binaryAsset, expected, { fetchImpl, sleep, log, warn, connectTimeoutMs, idleTimeoutMs });
  } else log('复用已通过 SHA256 校验的 yt-dlp 缓存，不重新下载。');
  return { path: cached, sha256: expected, assetName, version: release?.tag_name };
}

export async function installYtdlp({ root, platform = process.platform, arch = process.arch, environment = process.env, execute = executeFile, log = console.log, ...downloadOptions } = {}) {
  root = await realpath(root);
  const target = join(root, 'vendor/video-engine', platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const selected = resolve(root, environment.VIDEO_YTDLP_PATH || target);
  const versionArgs = ['--ignore-config', '--no-plugin-dirs', '--version'];
  try {
    const { stdout } = await execute(selected, versionArgs, { timeout: 30000, maxBuffer: 100000, windowsHide: true });
    if (!/^\d{4}\.\d{2}\.\d{2}/.test(stdout.trim())) throw new Error('无效版本');
    log(`保留已经可运行的 yt-dlp ${stdout.trim().split(/\r?\n/)[0]}，不下载、不更新。`);
    return { installed: false, path: selected };
  } catch { if (environment.VIDEO_YTDLP_PATH && selected !== target) throw new Error('VIDEO_YTDLP_PATH 指定的程序不可运行，请修正或清空该配置；未覆盖其他路径'); }
  const { path: cached } = await downloadYtdlp({ root, platform, arch, log, ...downloadOptions });
  const temporary = `${target}.${randomUUID()}.tmp${platform === 'win32' ? '.exe' : ''}`;
  try {
    await copyFile(cached, temporary, constants.COPYFILE_EXCL); await chmod(temporary, 0o755);
    const { stdout } = await execute(temporary, versionArgs, { timeout: 30000, maxBuffer: 100000, windowsHide: true });
    if (!/^\d{4}\.\d{2}\.\d{2}/.test(stdout.trim())) throw new Error('下载的 yt-dlp 无法运行，未替换现有引擎');
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
  log('yt-dlp 校验及启动检查通过，安装成功。');
  return { installed: true, path: target };
}
