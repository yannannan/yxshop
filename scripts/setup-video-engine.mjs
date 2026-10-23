// 引擎只安装到项目目录；--ffmpeg 使用 FFmpeg 官网链接的 Gyan Windows 构建。
import { createHash } from 'node:crypto';
import { mkdir, realpath, writeFile, rename, chmod, unlink, readFile, access, readdir } from 'node:fs/promises';
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
    try {
      const runtime = JSON.parse(await readFile(join(directory, 'browser-runtime.json'), 'utf8'));
      const { stdout } = await execute(process.env.VIDEO_BROWSER_PATH || runtime.executable, ['--version'], { timeout: 10000, windowsHide: true });
      console.log(`网页解析：${stdout.trim()}`);
    } catch { console.error('网页解析未就绪，抖音等动态页面请先执行 node scripts/setup-video-engine.mjs --browser'); process.exitCode = 1; }
  } else if (process.argv.includes('--browser')) {
    await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw new Error('安装目标不是项目内的实际目录');
    const browserDirectory = join(directory, 'browser');
    await mkdir(browserDirectory, { recursive: true });
    if (await realpath(browserDirectory) !== browserDirectory) throw new Error('浏览器安装目录不能使用链接');
    console.log('安装后端网页解析运行时（Playwright 官方 Chromium Headless Shell，仅项目目录）…');
    await execute(process.execPath, [join(root, 'node_modules/playwright-core/cli.js'), 'install', 'chromium', '--only-shell'], { cwd: root, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserDirectory }, timeout: 240000, maxBuffer: 2 * 1024 ** 2, windowsHide: true });
    const specification = JSON.parse(await readFile(join(root, 'node_modules/playwright-core/browsers.json'), 'utf8'));
    const revision = specification.browsers.find(item => item.name === 'chromium-headless-shell')?.revision;
    if (!/^\d+$/.test(revision || '')) throw new Error('网页解析版本信息缺失');
    const installation = join(browserDirectory, `chromium_headless_shell-${revision}`), candidates = [];
    for (const child of await readdir(installation, { withFileTypes: true })) if (child.isDirectory() && !child.isSymbolicLink()) for (const name of ['headless_shell', 'chrome-headless-shell', 'chrome-headless-shell.exe']) candidates.push(join(installation, child.name, name));
    let executable = '';
    for (const candidate of candidates) try { await access(candidate); executable = candidate; break; } catch { /* 当前平台的文件名不同。 */ }
    if (!executable) throw new Error('网页解析程序文件缺失');
    await writeFile(join(directory, 'browser-runtime.json'), JSON.stringify({ executable, revision, platform: process.platform }, null, 2));
    console.log('网页解析引擎已就绪；Linux 需使用支持 Chromium 的系统和非 root 服务账号。');
  } else if (process.argv.includes('--ffmpeg')) {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('--ffmpeg 当前支持 Windows x64；其他系统请配置兼容系统的 FFmpeg 路径。');
    await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw new Error('安装目标不是项目内的实际目录');
    const url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
    console.log('下载 FFmpeg 官网链接的 Gyan Windows 构建并验证 SHA256…');
    const expected = (await fetchBytes(`${url}.sha256`, 4096)).toString().match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase();
    if (!expected) throw new Error('FFmpeg SHA256 校验记录缺失');
    const version = (await fetchBytes(`${url}.ver`, 4096)).toString().trim();
    if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('FFmpeg 发布版本不正确');
    const mirror = `https://github.com/GyanD/codexffmpeg/releases/download/${version}/ffmpeg-${version}-essentials_build.zip`;
    const bytes = await fetchBytes(mirror, 180 * 1024 ** 2);
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('FFmpeg SHA256 校验失败，未安装');
    const archive = join(directory, `ffmpeg-${process.pid}.zip`), temporary = join(directory, `ffmpeg-${process.pid}.exe.tmp`);
    const psString = value => `'${value.replace(/'/g, "''")}'`;
    // 只把确定的 ffmpeg.exe 条目复制到固定临时文件，不展开压缩包内的路径。
    const command = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[System.IO.Compression.ZipFile]::OpenRead(${psString(archive)}); try { $entry=@($zip.Entries | Where-Object { $_.FullName -match '^[^/]+/bin/ffmpeg\\.exe$' }); if ($entry.Count -ne 1 -or $entry[0].Length -gt 300MB) { throw 'FFmpeg archive entry invalid' }; [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry[0],${psString(temporary)},$false) } finally { $zip.Dispose() }`;
    try {
      await writeFile(archive, bytes, { flag: 'wx' });
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 60000, maxBuffer: 100000, windowsHide: true });
      await rename(temporary, join(directory, 'ffmpeg.exe'));
    } finally { await unlink(archive).catch(() => {}); await unlink(temporary).catch(() => {}); }
    console.log('FFmpeg 已安装到项目目录，未修改系统 PATH。');
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
