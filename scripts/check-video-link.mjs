// 直接检查后端解析 / 文件生成，不启动网站、不连接数据库、不扣积分。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url), modules = {};
process.chdir(root);
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
    const result = await local('video-firefox').inspectFirefoxVideo('https://example.com/', runtime, 12000, true);
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
