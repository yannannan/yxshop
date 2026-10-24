import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, relative, isAbsolute, delimiter } from 'node:path';

const execute = promisify(execFile);
const gitExec = (await execute('git', ['--exec-path'])).stdout.trim();
const bash = process.platform === 'win32' ? resolve(gitExec, '../../..', 'bin/bash.exe') : '/bin/bash';
const slashes = value => value.replaceAll('\\', '/');
const quote = value => `'${slashes(value).replaceAll("'", "'\\''")}'`;
const upgrade = readFileSync(new URL('../upgrade.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const videoInstaller = readFileSync(new URL('../scripts/install-video-deps-centos.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

async function fixture(t) {
  const root = await mkdtemp(join(process.cwd(), '.upgrade-test-'));
  t.after(async () => {
    const actual = await realpath(root), child = relative(process.cwd(), actual);
    assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.upgrade-test-'));
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const bin = join(root, 'bin'), seed = join(root, 'seed'), remote = join(root, 'remote.git'), client = join(root, 'client'), trace = join(root, 'trace');
  await mkdir(bin); await mkdir(seed); await writeFile(trace, '');
  await writeFile(join(root, 'git-config'), '');
  await writeFile(join(root, 'os-release'), 'ID=centos\nVERSION_ID=7\n');
  await writeFile(join(seed, 'upgrade.sh'), upgrade);
  await writeFile(join(seed, '.gitignore'), '.env.mysql\nuploads/\n');
  await writeFile(join(seed, 'app.txt'), 'v1\n');
  await mkdir(join(seed, '.next')); await writeFile(join(seed, '.next/routes.d.ts'), 'types-v1\n');
  await mkdir(join(seed, 'dist')); await writeFile(join(seed, 'dist/server.js'), 'old-build\n');
  await mkdir(join(seed, 'scripts'));
  await writeFile(join(seed, 'stop.sh'), '#!/bin/bash\necho stop >>"$UPGRADE_TRACE"\n');
  await writeFile(join(seed, 'start.sh'), '#!/bin/bash\necho start >>"$UPGRADE_TRACE"\n');
  await writeFile(join(seed, 'scripts/install-video-deps-centos.sh'), '#!/bin/bash\necho "video-script $*" >>"$UPGRADE_TRACE"\nexit "${VIDEO_INSTALL_FAILURE:-0}"\n');
  await writeFile(join(bin, 'pnpm'), '#!/bin/bash\necho "pnpm $*" >>"$UPGRADE_TRACE"\nif [[ "$1" == build ]]; then exit "${BUILD_FAILURE:-0}"; else exit "${INSTALL_FAILURE:-0}"; fi\n', { mode: 0o755 });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
  Object.assign(env, { PATH: `${bin}${delimiter}${process.env.PATH || process.env.Path}`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'git-config'), UPGRADE_TRACE: slashes(trace), NODE_BIN: slashes(process.execPath) });
  const git = async (cwd, ...args) => execute('git', args, { cwd, env, windowsHide: true });
  await git(root, 'init', '--bare', remote); await git(seed, 'init', '-b', 'main');
  await git(seed, 'config', 'user.name', 'Upgrade test'); await git(seed, 'config', 'user.email', 'upgrade@example.invalid'); await git(seed, 'config', 'core.autocrlf', 'false');
  await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'base'); await git(seed, 'remote', 'add', 'origin', remote); await git(seed, 'push', 'origin', 'main');
  await git(root, 'clone', '-b', 'main', remote, client); await git(client, 'config', 'core.autocrlf', 'false');
  await writeFile(join(client, '.env.mysql'), 'keep-server-environment'); await mkdir(join(client, 'uploads')); await writeFile(join(client, 'uploads/keep.txt'), 'keep-user-upload');
  async function publish(extra) {
    await writeFile(join(seed, 'app.txt'), 'v2\n'); await writeFile(join(seed, '.next/routes.d.ts'), 'types-v2\n');
    if (extra) await extra(seed);
    await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'new release'); await git(seed, 'push', 'origin', 'main');
  }
  async function run(args = [], overrides = {}) {
    try { const result = await execute(bash, [slashes(join(client, 'upgrade.sh')), ...args], { cwd: root, env: { ...env, ...overrides }, timeout: 30000, windowsHide: true }); return { ...result, code: 0 }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  async function runVideo(args = [], overrides = {}) {
    await writeFile(join(client, 'scripts/install-video-deps-centos.sh'), videoInstaller.replaceAll('/etc/os-release', quote(join(root, 'os-release'))));
    await writeFile(join(bin, 'uname'), '#!/bin/bash\nif [[ "$1" == -s ]]; then echo Linux; else echo x86_64; fi\n', { mode: 0o755 });
    await writeFile(join(bin, 'node-video-test'), '#!/bin/bash\ncase "$*" in *setup-video-engine.mjs*) echo binary-check >>"$UPGRADE_TRACE"; exit "${BINARY_FAILURE:-0}";; *check-video-link.mjs*) echo browser-check >>"$UPGRADE_TRACE"; exit 0;; *) exit 0;; esac\n', { mode: 0o755 });
    for (const name of ['yum', 'dnf', 'useradd']) await writeFile(join(bin, name), '#!/bin/bash\necho 不允许测试安装系统依赖 >&2\nexit 91\n', { mode: 0o755 });
    const options = { cwd: root, env: { ...env, NODE_BIN: slashes(join(bin, 'node-video-test')), ...overrides }, timeout: 10000, windowsHide: true };
    const testBin = process.platform === 'win32' ? (await execute(bash, ['-c', 'cygpath -u "$1"', '--', slashes(bin)], options)).stdout.trim() : bin;
    try { const result = await execute(bash, ['-c', 'export PATH="$1:$PATH"\nshift\nvideo_test_script="$1"\nshift\nsource "$video_test_script" "$@"', '--', testBin, slashes(join(client, 'scripts/install-video-deps-centos.sh')), ...args], options); return { ...result, code: 0 }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  return { root, client, seed, trace, git, publish, run, runVideo, events: async () => (await readFile(trace, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => line.trim()) };
}

test('恢复单一升级流程，强制同步 main 后只调用一次独立 video 脚本，保留环境与上传文件', async t => {
  const f = await fixture(t); await f.publish();
  await writeFile(join(f.client, '.next/routes.d.ts'), 'local-generated-draft\n');
  await writeFile(join(f.client, 'app.txt'), 'server-local-edit\n');
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), 'keep-server-environment');
  assert.equal(await readFile(join(f.client, 'uploads/keep.txt'), 'utf8'), 'keep-user-upload');
  assert.equal(await readFile(join(f.client, '.next/routes.d.ts'), 'utf8'), 'types-v2\n');
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'pnpm build', 'start']);
});
test('video 脚本失败单独提示，仍继续构建和启动商城，不误报视频安装成功', async t => {
  const f = await fixture(t); await f.publish();
  const result = await f.run([], { VIDEO_INSTALL_FAILURE: '23' }); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'pnpm build', 'start']);
  assert.match(result.stderr, /视频依赖安装失败/); assert.match(result.stdout, /商城已启动；视频依赖未就绪/);
  assert.doesNotMatch(result.stdout, /升级发布完成/);
});
test('不再保留 pull-only 第二种升级模式，错误参数不触发部署', async t => {
  const f = await fixture(t);
  const result = await f.run(['--pull-only']); assert.equal(result.code, 2); assert.match(result.stderr, /不需要参数/);
  assert.deepEqual(await f.events(), []);
});
test('拉取失败按原流程报错退出，不继续执行依赖安装、构建和启动', async t => {
  const f = await fixture(t);
  await f.git(f.client, 'remote', 'set-url', 'origin', join(f.root, 'missing.git'));
  const result = await f.run(); assert.notEqual(result.code, 0); assert.deepEqual(await f.events(), ['stop']);
});
test('项目依赖或构建失败仍中断升级，不将项目失败当作 video 失败忽略', async t => {
  const f = await fixture(t); await f.publish();
  const failed = await f.run([], { INSTALL_FAILURE: '23' });
  assert.notEqual(failed.code, 0); assert.match(failed.stderr, /升级失败/); assert.ok(!(await f.events()).includes('video-script')); assert.ok(!(await f.events()).includes('start'));
  await writeFile(f.trace, '');
  const build = await f.run([], { BUILD_FAILURE: '24' }); assert.notEqual(build.code, 0); assert.match(build.stderr, /升级失败/);
  assert.ok(!(await f.events()).includes('start')); assert.doesNotMatch(build.stdout, /升级发布完成/);
});
test('独立 video 脚本自行判断已安装，默认执行也只自检并跳过安装', async t => {
  const f = await fixture(t);
  const result = await f.runVideo(); assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /已就绪，跳过重复安装/);
  assert.deepEqual(await f.events(), ['binary-check', 'browser-check']);
});
test('video 只读自检失败返回非零，不会偷偷安装或报告就绪', async t => {
  const f = await fixture(t);
  const result = await f.runVideo(['--check'], { BINARY_FAILURE: '25' }); assert.notEqual(result.code, 0);
  assert.deepEqual(await f.events(), ['binary-check']); assert.doesNotMatch(result.stdout, /跳过重复安装/);
});
