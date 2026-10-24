// 引擎只安装到项目目录；--ffmpeg 使用 FFmpeg 官网链接的 Gyan Windows 构建。
import { createHash } from 'node:crypto';
import { mkdir, realpath, writeFile, rename, chmod, unlink, readFile, access, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchSetupBytes, installYtdlp } from './video-engine-download.mjs';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const directory = join(root, 'vendor/video-engine');
const execute = promisify(execFile);
const binary = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const fetchBytes = (url, max) => fetchSetupBytes(url, max);
try {
  if (process.argv.includes('--check')) {
    const ytdlp = resolve(root, process.env.VIDEO_YTDLP_PATH || join(directory, binary));
    const ffmpeg = resolve(root, process.env.VIDEO_FFMPEG_PATH || join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
    for (const [name, path, args] of [['yt-dlp', ytdlp, ['--ignore-config', '--no-plugin-dirs', '--version']], ['FFmpeg', ffmpeg, ['-version']]]) {
      try { const { stdout } = await execute(path, args, { timeout: 30000, maxBuffer: 100000, windowsHide: true }); console.log(`${name}：${stdout.split(/\r?\n/)[0]}`); }
      catch (error) { console.error(`${name} 未就绪（${error.killed ? '版本检查超时' : error.code || '启动失败'}），检查路径：${path}；请按 docs/链接视频提取与部署.md 配置。`); process.exitCode = 1; }
    }
    try {
      const runtime = await readFile(join(directory, 'browser-runtime.json'), 'utf8').then(JSON.parse).catch(() => ({}));
      if (!process.env.VIDEO_BROWSER_PATH && runtime.platform !== process.platform) throw new Error('浏览器运行记录不属于当前系统');
      const { stdout } = await execute(process.env.VIDEO_BROWSER_PATH || runtime.executable, ['--version'], { timeout: 10000, windowsHide: true });
      console.log(`网页解析：${stdout.trim()}`);
    } catch { console.error('网页解析未就绪；CentOS 请运行 bash scripts/install-video-deps-centos.sh，其他系统请执行 node scripts/setup-video-engine.mjs --browser'); process.exitCode = 1; }
  } else if (process.argv.includes('--browser')) {
    await mkdir(directory, { recursive: true });
    if (await realpath(directory) !== directory) throw new Error('安装目标不是项目内的实际目录');
    if (process.argv.includes('--firefox')) {
      const { install, Browser } = await import('@puppeteer/browsers');
      const { PUPPETEER_REVISIONS } = await import('puppeteer-core');
      console.log(`安装 Mozilla 官方 Firefox ${PUPPETEER_REVISIONS.firefox}（项目目录，CentOS 使用 WebDriver BiDi）…`);
      const cacheDir = join(directory, 'firefox'); await mkdir(cacheDir, { recursive: true });
      if (await realpath(cacheDir) !== cacheDir) throw new Error('Firefox 安装目录不能使用链接');
      const result = await install({ browser: Browser.FIREFOX, buildId: PUPPETEER_REVISIONS.firefox, cacheDir });
      const { stdout } = await execute(result.executablePath, ['--version'], { timeout: 15000, windowsHide: true });
      const runtime = { engine: 'firefox', executable: result.executablePath, platform: process.platform, revision: PUPPETEER_REVISIONS.firefox };
      if (process.platform === 'linux' && process.getuid?.() === 0) {
        const user = process.env.YX_VIDEO_WORKER || 'yxshop-video';
        if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(user)) throw new Error('网页解析账号名称无效');
        const uid = Number((await execute('id', ['-u', user])).stdout.trim()), gid = Number((await execute('id', ['-g', user])).stdout.trim());
        if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 1) throw new Error('请先用安装 sh 创建非 root 解析账号');
        let runuser = '';
        for (const path of ['/usr/sbin/runuser', '/sbin/runuser']) try { await access(path); runuser = path; break; } catch { /* 不同发行版位置不同。 */ }
        if (!runuser) throw new Error('缺少 runuser，请安装 util-linux');
        const launcher = join(directory, 'firefox-launch.sh');
        await writeFile(launcher, `#!/bin/sh\nset -eu\nexec '${runuser}' -u '${user}' -- env HOME="$HOME" TMPDIR="$HOME" TMP="$HOME" TEMP="$HOME" "$YX_VIDEO_FIREFOX_BINARY" "$@"\n`, { mode: 0o755 }); await chmod(launcher, 0o755);
        Object.assign(runtime, { worker: { uid, gid }, launcher });
      }
      await writeFile(join(directory, 'browser-runtime.json'), JSON.stringify(runtime, null, 2));
      console.log(stdout.trim());
      console.log('Firefox 已安装；请继续执行 scripts/check-video-link.mjs --runtime 检查实际启动。');
      process.exit(0);
    }
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
    await writeFile(join(directory, 'browser-runtime.json'), JSON.stringify({ engine: 'chromium', executable, revision, platform: process.platform }, null, 2));
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
    await installYtdlp({ root });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
