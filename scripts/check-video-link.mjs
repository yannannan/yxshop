// 直接检查后端解析 / 文件生成，不启动网站、不连接数据库、不扣积分。
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url), modules = {};
const execute = promisify(execFile);
process.chdir(root);
async function runtimeDiagnostics(runtime) {
  console.error(`[Firefox诊断] Node ${process.versions.node}；系统 ${process.platform}；浏览器 ${runtime.executable}`);
  if (process.platform !== 'linux') return;
  for (const [label, command, args] of [
    ['内核', 'uname', ['-rm']], ['内存', 'free', ['-m']], ['磁盘', 'df', ['-h', root, '/tmp', '/dev/shm']],
    ['用户命名空间', 'sysctl', ['user.max_user_namespaces']],
  ]) {
    try { const { stdout } = await execute(command, args, { timeout: 5000, maxBuffer: 32000, windowsHide: true }); console.error(`[Firefox诊断] ${label}\n${stdout.trim()}`); }
    catch (error) { console.error(`[Firefox诊断] ${label}无法读取（${error.code || '失败'}）`); }
  }
  if (runtime.worker && process.getuid?.() === 0) {
    try {
      const user = (await execute('id', ['-nu', String(runtime.worker.uid)], { timeout: 5000 })).stdout.trim();
      const runuser = ['/usr/sbin/runuser', '/sbin/runuser'].find(path => existsSync(path));
      if (!runuser) throw new Error('没有找到 runuser');
      await execute(runuser, ['-u', user, '--', 'unshare', '--user', 'true'], { timeout: 5000, maxBuffer: 16000 });
      console.error('[Firefox诊断] 专用账号可以创建用户命名空间。');
    } catch (error) { console.error(`[Firefox诊断] 专用账号无法创建用户命名空间：${(error.stderr || error.message).trim()}`); }
  }
  for (const name of ['firefox', 'libxul.so', 'crashreporter']) {
    const target = join(dirname(runtime.executable), name);
    if (!existsSync(target)) continue;
    try {
      // Firefox 启动器会加载同目录的私有库；直接ldd libxul会把这些库误报为缺失。
      const env = { ...process.env, LD_LIBRARY_PATH: [dirname(runtime.executable), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
      const { stdout } = await execute('ldd', [target], { env, timeout: 10000, maxBuffer: 64000 });
      const missing = stdout.split(/\r?\n/).filter(line => /not found|version .* not found/i.test(line));
      console.error(`[Firefox诊断] ${name} 动态库：${missing.length ? missing.join('; ') : '未发现缺失项'}`);
    } catch (error) { console.error(`[Firefox诊断] ${name} 动态库检查失败：${(error.stderr || error.stdout || error.message).trim().slice(0, 2000)}`); }
  }
}
function local(name) {
  if (!/^video-[a-z-]+$/.test(name)) throw new Error('不支持的解析模块');
  if (modules[name]) return modules[name];
  const exports = {}; modules[name] = exports;
  const code = ts.transpileModule(readFileSync(join(root, 'lib', `${name}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, URL, URLSearchParams, Buffer, process, fetch, AbortSignal, setTimeout, clearTimeout, console, require: name => name.startsWith('./') ? local(name.slice(2)) : require(name) });
  return exports;
}
try {
  if (process.argv.includes('--runtime')) {
    const runtime = await local('video-browser').videoBrowserRuntime();
    if (!runtime) throw new Error('没有当前系统的视频浏览器运行记录，请先运行依赖安装脚本');
    if (runtime.engine !== 'firefox') throw new Error('--runtime 当前用于 CentOS Firefox 启动检查');
    const diagnostics = process.argv.includes('--diagnostic');
    if (diagnostics) await runtimeDiagnostics(runtime);
    const result = await local('video-firefox').inspectFirefoxVideo('https://example.com/', runtime, 12000, true, diagnostics);
    console.log(`${result.page.title}：${result.userAgent}`);
    process.exit(0);
  }
  const input = process.argv.slice(2).find(value => !value.startsWith('--'));
  if (!input) throw new Error('用法：node scripts/check-video-link.mjs "视频链接或分享文字" [--download]');
  const engine = local('video-engine'), source = local('video-options').sharedVideoUrl(input), started = Date.now();
  const info = await engine.inspectVideo(source);
  console.log(JSON.stringify({ title: info.title, source: info.source, duration: info.duration, formats: info.formats.map(({ id, label, size }) => ({ id, label, size })), seconds: (Date.now() - started) / 1000 }, null, 2));
  if (process.argv.includes('--download')) {
    const id = randomUUID(), format = info.formats.find(item => item.height <= 720) || info.formats[0];
    const result = await engine.materializeVideo(id, format, () => {});
    console.log(JSON.stringify({ task: id, file: result.path, bytes: result.size, seconds: (Date.now() - started) / 1000 }, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
