// 仅安装官方 yt-dlp 独立二进制到项目目录，不改系统 Python、Git 或包管理器。
import { createHash } from 'node:crypto';
import { mkdir, realpath, writeFile, rename, chmod, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const directory = join(root, 'vendor/video-engine');
const execute = promisify(execFile);
const binary = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const binaries = { 'win32:x64': 'yt-dlp.exe', 'win32:arm64': 'yt-dlp_arm64.exe', 'linux:x64': 'yt-dlp_linux', 'linux:arm64': 'yt-dlp_linux_aarch64', 'darwin:x64': 'yt-dlp_macos', 'darwin:arm64': 'yt-dlp_macos' };
async function fetchBytes(url, max) {
  const response = await fetch(url, { headers: { 'User-Agent': 'yxshop-video-engine-setup', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error(`官方下载失败：HTTP ${response.status}`);
  const chunks = []; let length = 0;
  for await (const chunk of response.body) { length += chunk.length; if (length > max) throw new Error('下载文件超过预期大小'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
try {
  if (process.argv.includes('--check')) {
    const ytdlp = resolve(root, process.env.VIDEO_YTDLP_PATH || join(directory, binary));
    const ffmpeg = resolve(root, process.env.VIDEO_FFMPEG_PATH || join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
    for (const [name, path, args] of [['yt-dlp', ytdlp, ['--ignore-config', '--no-plugin-dirs', '--version']], ['FFmpeg', ffmpeg, ['-version']]]) {
      try { const { stdout } = await execute(path, args, { timeout: 10000, maxBuffer: 100000, windowsHide: true }); console.log(`${name}：${stdout.split(/\r?\n/)[0]}`); }
      catch { console.error(`${name} 未就绪，请按 docs/链接视频提取与部署.md 配置。`); process.exitCode = 1; }
    }
  } else {
    const assetName = binaries[`${process.platform}:${process.arch}`];
    if (!assetName) throw new Error('当前系统架构请手动从 yt-dlp 官方发行页安装。');
    await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw new Error('安装目标不是项目内的实际目录，请移除目录链接后重试。');
    const release = JSON.parse((await fetchBytes('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', 2000000)).toString());
    const find = name => release.assets.find(asset => asset.name === name)?.browser_download_url;
    const assetUrl = find(assetName), sumsUrl = find('SHA2-256SUMS');
    if (![assetUrl, sumsUrl].every(url => typeof url === 'string' && url.startsWith('https://github.com/yt-dlp/yt-dlp/releases/download/'))) throw new Error('官方发行文件或校验文件缺失');
    console.log(`下载官方 yt-dlp ${release.tag_name}（${assetName}）…`);
    const sums = (await fetchBytes(sumsUrl, 1000000)).toString();
    const expected = sums.split(/\r?\n/).map(line => line.trim().split(/\s+\*?/)).find(parts => parts[1] === assetName)?.[0]?.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('官方 SHA256 校验记录缺失');
    const bytes = await fetchBytes(assetUrl, 150 * 1024 ** 2);
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('SHA256 校验失败，未安装下载文件');
    const target = join(directory, binary), temporary = `${target}.${process.pid}.tmp`;
    try { await writeFile(temporary, bytes, { flag: 'wx' }); await chmod(temporary, 0o755); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => {}); }
    console.log('yt-dlp 安装成功。B站等分离音视频画质还需配置 FFmpeg，再执行 --check。');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
