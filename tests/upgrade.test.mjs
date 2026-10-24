import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, relative, isAbsolute, delimiter } from 'node:path';

const execute = promisify(execFile);
const gitExec = (await execute('git', ['--exec-path'])).stdout.trim();
const bash = process.platform === 'win32' ? resolve(gitExec, '../../..', 'bin/bash.exe') : '/bin/bash';
const slashes = value => value.replaceAll('\\', '/');
const quote = value => `'${slashes(value).replaceAll("'", "'\\''")}'`;
const upgrade = readFileSync(new URL('../upgrade.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

async function fixture(t, { centos = true } = {}) {
  const root = await mkdtemp(join(process.cwd(), '.upgrade-test-'));
  t.after(async () => {
    const actual = await realpath(root), child = relative(process.cwd(), actual);
    assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.upgrade-test-'));
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const bin = join(root, 'bin'), seed = join(root, 'seed'), remote = join(root, 'remote.git'), client = join(root, 'client'), trace = join(root, 'trace');
  await mkdir(bin); await mkdir(seed); await writeFile(trace, '');
  await writeFile(join(root, 'git-config'), '');
  await writeFile(join(root, 'os-release'), centos ? 'ID=centos\nVERSION_ID=7\n' : 'ID=debian\nVERSION_ID=12\n');
  // 仅将系统文件位置替换为隔离测试数据，真实执行其余全部升级流程和 Git 命令。
  await writeFile(join(seed, 'upgrade.sh'), upgrade.replaceAll('/etc/os-release', quote(join(root, 'os-release'))));
  await writeFile(join(seed, '.gitignore'), '.env.mysql\nuploads/\n');
  await writeFile(join(seed, 'app.txt'), 'v1\n');
  await mkdir(join(seed, '.next')); await writeFile(join(seed, '.next/routes.d.ts'), 'types-v1\n');
  await mkdir(join(seed, 'dist')); await writeFile(join(seed, 'dist/server.js'), 'old-build\n');
  await mkdir(join(seed, 'scripts'));
  await writeFile(join(seed, 'stop.sh'), '#!/bin/bash\necho stop >>"$UPGRADE_TRACE"\n');
  await writeFile(join(seed, 'start.sh'), '#!/bin/bash\nif { true >&9; } 2>/dev/null; then echo 升级锁泄漏 >&2; exit 9; fi\necho start >>"$UPGRADE_TRACE"\n');
  await writeFile(join(seed, 'scripts/install-video-deps-centos.sh'), '#!/bin/bash\nif [[ "${1:-}" == --check ]]; then echo video-check >>"$UPGRADE_TRACE"; [[ "${VIDEO_NEEDS_INSTALL:-0}" == 0 ]]; else echo video-install >>"$UPGRADE_TRACE"; exit "${VIDEO_INSTALL_FAILURE:-0}"; fi\n');
  await writeFile(join(bin, 'flock'), '#!/bin/bash\nexit "${LOCK_FAILURE:-0}"\n', { mode: 0o755 });
  await writeFile(join(bin, 'pnpm'), '#!/bin/bash\necho "pnpm $*" >>"$UPGRADE_TRACE"\nif [[ "$1" == build ]]; then exit "${BUILD_FAILURE:-0}"; fi\n', { mode: 0o755 });
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
  return { root, client, seed, trace, git, publish, run, events: async () => (await readFile(trace, 'utf8')).trim().split(/\r?\n/).filter(Boolean) };
}

test('拉取模式从 main 快进更新，保留环境 / 上传文件，并备份生成文件改动', async t => {
  const f = await fixture(t); await f.publish();
  await writeFile(join(f.client, '.next/routes.d.ts'), 'local-generated-draft\n');
  const result = await f.run(['--pull-only']); assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), 'keep-server-environment');
  assert.equal(await readFile(join(f.client, 'uploads/keep.txt'), 'utf8'), 'keep-user-upload');
  assert.deepEqual(await f.events(), []);
  const backup = (await readdir(join(f.client, '.git'))).find(name => name.startsWith('yxshop-generated-backup.'));
  assert.match(await readFile(join(f.client, '.git', backup), 'utf8'), /local-generated-draft/);
});
test('常规升级先拉代码，再停止、装依赖、补齐视频引擎、构建和启动；服务不继承锁', async t => {
  const f = await fixture(t); await f.publish();
  const result = await f.run([], { VIDEO_NEEDS_INSTALL: '1' }); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-check', 'video-install', 'pnpm build', 'start']);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
});
test('视频自检已通过时不重复安装，已有 dist 改动不被强制重置', async t => {
  const f = await fixture(t); await f.publish(); await writeFile(join(f.client, 'dist/server.js'), 'local-running-build\n');
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(f.client, 'dist/server.js'), 'utf8'), 'local-running-build\n');
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-check', 'pnpm build', 'start']);
});
test('本地业务代码修改时不覆盖源码、不停止服务', async t => {
  const f = await fixture(t); await f.publish(); await writeFile(join(f.client, 'app.txt'), 'local-edit\n');
  const result = await f.run(); assert.notEqual(result.code, 0); assert.match(result.stderr, /本地业务代码修改/);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'local-edit\n'); assert.deepEqual(await f.events(), []);
});
test('拉取失败或未跟踪文件冲突时保留当前服务和原文件', async t => {
  const f = await fixture(t); await f.publish(async seed => writeFile(join(seed, 'new.txt'), 'remote-file'));
  await writeFile(join(f.client, 'new.txt'), 'local-file');
  const conflict = await f.run(); assert.notEqual(conflict.code, 0); assert.deepEqual(await f.events(), []);
  assert.equal(await readFile(join(f.client, 'new.txt'), 'utf8'), 'local-file');
  await f.git(f.client, 'remote', 'set-url', 'origin', join(f.root, 'missing.git'));
  const network = await f.run(); assert.notEqual(network.code, 0); assert.deepEqual(await f.events(), []);
});
test('视频依赖安装失败或构建失败时不继续启动、不误报升级完成', async t => {
  const f = await fixture(t); await f.publish();
  const failed = await f.run([], { VIDEO_NEEDS_INSTALL: '1', VIDEO_INSTALL_FAILURE: '23' });
  assert.notEqual(failed.code, 0); assert.match(failed.stderr, /升级失败/); assert.ok(!(await f.events()).includes('pnpm build')); assert.ok(!(await f.events()).includes('start'));
  await writeFile(f.trace, '');
  const build = await f.run([], { BUILD_FAILURE: '24' }); assert.notEqual(build.code, 0); assert.match(build.stderr, /升级失败/);
  assert.ok(!(await f.events()).includes('start')); assert.doesNotMatch(build.stdout, /升级完成/);
});
