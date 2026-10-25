import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, relative, isAbsolute, delimiter } from 'node:path';

const execute = promisify(execFile);
const gitExec = (await execute('git', ['--exec-path'])).stdout.trim();
const bash = process.platform === 'win32' ? resolve(gitExec, '../../..', 'bin/bash.exe') : '/bin/bash';
const slashes = value => value.replaceAll('\\', '/');
const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const migration = source('migration_upgrade.sh'), upgrade = source('upgrade.sh');
const mysql = 'private-test-password="with spaces"\r\nOSS_KEY=fake-test-value\r\n';

async function fixture(t, { branch = 'main', subdirectory = '', trackedEnvironment = false } = {}) {
  const root = await mkdtemp(join(process.cwd(), '.migration-upgrade-test-'));
  t.after(async () => {
    const actual = await realpath(root), child = relative(process.cwd(), actual);
    assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.migration-upgrade-test-'));
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const bin = join(root, 'bin'), seedRoot = join(root, 'seed'), clientRoot = join(root, 'client'), remote = join(root, 'remote.git');
  const seed = join(seedRoot, subdirectory), client = join(clientRoot, subdirectory), trace = join(root, 'trace');
  await mkdir(bin); await mkdir(seed, { recursive: true }); await writeFile(trace, '');
  await writeFile(join(root, 'git-config'), '');
  await writeFile(join(seed, 'migration_upgrade.sh'), migration); await writeFile(join(seed, 'upgrade.sh'), upgrade);
  await writeFile(join(seed, '.gitignore'), '.env.*\n!/.env.mysql.example\nuploads/\nvendor/video-engine/\n');
  await mkdir(join(seed, 'scripts/migrations'), { recursive: true });
  await writeFile(join(seed, 'scripts/migrations/10-video-deps.sh'), source('scripts/migrations/10-video-deps.sh'));
  await writeFile(join(seed, 'scripts/migrations/README.md'), '不是脚本，不执行\n');
  await writeFile(join(seed, 'scripts/install-video-deps-centos.sh'), '#!/bin/bash\necho "video-script${*:+ $*}" >>"$MIGRATION_TRACE"\n[[ "${VIDEO_FAILURE:-0}" == 0 ]] || exit "$VIDEO_FAILURE"\nif [[ -f vendor/video-engine/ffmpeg ]]; then echo video-reuse >>"$MIGRATION_TRACE"; else mkdir -p vendor/video-engine; echo linux-engine >vendor/video-engine/ffmpeg; echo video-first-install >>"$MIGRATION_TRACE"; fi\n');
  await writeFile(join(seed, 'stop.sh'), '#!/bin/bash\necho stop >>"$MIGRATION_TRACE"\n');
  await writeFile(join(seed, 'start.sh'), '#!/bin/bash\necho start >>"$MIGRATION_TRACE"\nexit "${START_FAILURE:-0}"\n');
  await writeFile(join(seed, 'app.txt'), 'old\n');
  if (trackedEnvironment) { await writeFile(join(seed, '.env.mysql'), 'old-template'); await writeFile(join(seed, '.env.local'), 'old-local-template'); }
  for (const [name, script] of Object.entries({
    uname: '#!/bin/bash\necho Linux\n',
    node: '#!/bin/bash\nexit "${NODE_VERSION_FAILURE:-0}"\n',
    pnpm: '#!/bin/bash\necho "pnpm $*" >>"$MIGRATION_TRACE"\nif [[ "$1" == build ]]; then exit "${BUILD_FAILURE:-0}"; else exit "${INSTALL_FAILURE:-0}"; fi\n',
  })) await writeFile(join(bin, name), script, { mode: 0o755 });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
  Object.assign(env, { PATH: `${bin}${delimiter}${process.env.PATH || process.env.Path}`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'git-config'), MIGRATION_TRACE: slashes(trace), NODE_BIN: slashes(join(bin, 'node')) });
  const git = async (cwd, ...args) => execute('git', args, { cwd, env, windowsHide: true });
  await git(root, 'init', '--bare', remote); await git(root, 'init', '-b', branch, seedRoot);
  await git(seed, 'config', 'user.name', 'Migration test'); await git(seed, 'config', 'user.email', 'migration@example.invalid'); await git(seed, 'config', 'core.autocrlf', 'false');
  await git(seed, 'add', '.'); if (trackedEnvironment) await git(seed, 'add', '-f', '.env.mysql', '.env.local');
  await git(seed, 'commit', '-m', 'base'); await git(seed, 'remote', 'add', 'origin', remote); await git(seed, 'push', 'origin', branch);
  await git(root, 'clone', '-b', branch, remote, clientRoot); await git(client, 'config', 'core.autocrlf', 'false');
  await writeFile(join(client, '.env.mysql'), mysql); await writeFile(join(client, '.env.local'), 'keep-local-env\n');
  await mkdir(join(client, 'uploads')); await writeFile(join(client, 'uploads/keep.txt'), 'keep-upload');
  async function publish(change) {
    await writeFile(join(seed, 'app.txt'), 'new\n'); if (change) await change(seed);
    await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'release'); await git(seed, 'push', 'origin', branch);
  }
  async function run(overrides = {}, args = []) {
    const options = { cwd: root, env: { ...env, ...overrides }, timeout: 30000, windowsHide: true };
    const testBin = process.platform === 'win32' ? (await execute(bash, ['-c', 'cygpath -u "$1"', '--', slashes(bin)], options)).stdout.trim() : bin;
    // Git Bash 启动会前置自身系统目录，进入 shell 后再将 Linux / 安装替身放到最前。
    try { return { code: 0, ...await execute(bash, ['-c', 'export PATH="$1:$PATH"\nshift\nmigration_entry="$1"\nshift\nsource "$migration_entry" "$@"', '--', testBin, slashes(join(client, 'migration_upgrade.sh')), ...args], options) }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  return { root, seedRoot, seed, clientRoot, client, trace, remote, git, publish, run, events: async () => (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean) };
}

test('首次没有vendor时一键同步、安装视频业务依赖、构建启动，保留环境和上传文件', async t => {
  const f = await fixture(t); await f.publish();
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-first-install', 'pnpm build', 'start']);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'new\n');
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), mysql);
  assert.equal(await readFile(join(f.client, 'uploads/keep.txt'), 'utf8'), 'keep-upload');
  assert.equal(await readFile(join(f.client, 'upgrade.sh'), 'utf8'), upgrade);
  assert.doesNotMatch(result.stdout + result.stderr, /private-test-password|fake-test-value/);
  assert.match(result.stdout, /迁移部署完成/);
});

test('master与多层含空格子目录兼容，重复迁移复用Linux引擎并保护取消跟踪的环境', async t => {
  const f = await fixture(t, { branch: 'master', subdirectory: 'apps/yxshop dev', trackedEnvironment: true });
  await mkdir(join(f.seedRoot, 'vendor/video-engine'), { recursive: true }); await writeFile(join(f.seedRoot, 'vendor/video-engine/sibling'), 'not-this-project');
  await f.git(f.seedRoot, 'add', 'vendor/video-engine/sibling');
  await f.publish(async () => { await f.git(f.seed, 'rm', '--cached', '.env.mysql', '.env.local'); });
  for (let i = 0; i < 2; i++) {
    await writeFile(f.trace, ''); const result = await f.run(); assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /origin\/master/);
    assert.ok((await f.events()).includes(i ? 'video-reuse' : 'video-first-install'));
    assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), mysql);
    assert.equal(await readFile(join(f.client, '.env.local'), 'utf8'), 'keep-local-env\n');
    assert.ok(!(await readdir(f.client)).some(name => name.startsWith('.env.migration.')));
  }
});

test('同步后自动发现本次新发布的业务步骤，按编号执行且忽略说明文件', async t => {
  const f = await fixture(t);
  await f.publish(async seed => {
    for (const number of [30, 20]) await writeFile(join(seed, `scripts/migrations/${number}-extra.sh`), `#!/bin/bash\necho step-${number} >>"$MIGRATION_TRACE"\n`);
    await writeFile(join(seed, 'scripts/migrations/99-not-a-step.txt'), 'exit 99\n');
  });
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-first-install', 'step-20', 'step-30', 'pnpm build', 'start']);
});

test('reset同时更新入口文件时使用本次已解析的执行块，不混读新旧脚本', async t => {
  const f = await fixture(t); await f.publish(async seed => {
    await writeFile(join(seed, 'migration_upgrade.sh'), migration + '\n' + '# new-entry-padding\n'.repeat(300) + 'echo unexpected-entry-tail >>"$MIGRATION_TRACE"\nexit 92\n');
  });
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-first-install', 'pnpm build', 'start']);
});

for (const [stage, overrides, expected] of [
  ['项目依赖', { INSTALL_FAILURE: '22' }, ['stop', 'pnpm install --frozen-lockfile --prod=false']],
  ['视频安装', { VIDEO_FAILURE: '23' }, ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script']],
  ['构建', { BUILD_FAILURE: '24' }, ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-first-install', 'pnpm build']],
  ['启动', { START_FAILURE: '25' }, ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-first-install', 'pnpm build', 'start']],
]) test(`${stage}失败即中断，不报告成功，真实本机配置不丢失`, async t => {
  const f = await fixture(t, { trackedEnvironment: true }); await f.publish(async () => { await f.git(f.seed, 'rm', '--cached', '.env.mysql', '.env.local'); });
  const result = await f.run(overrides); assert.notEqual(result.code, 0); assert.deepEqual(await f.events(), expected);
  assert.match(result.stderr, /迁移部署失败/); assert.doesNotMatch(result.stdout, /迁移部署完成/);
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), mysql);
  assert.equal(await readFile(join(f.client, '.env.local'), 'utf8'), 'keep-local-env\n');
});

test('新模块失败阻止后续模块和启动，修复后重跑复用已完成的视频依赖', async t => {
  const f = await fixture(t); await f.publish(async seed => {
    await writeFile(join(seed, 'scripts/migrations/20-extra.sh'), '#!/bin/bash\necho step-20 >>"$MIGRATION_TRACE"\nexit "${STEP_FAILURE:-0}"\n');
    await writeFile(join(seed, 'scripts/migrations/30-extra.sh'), '#!/bin/bash\necho step-30 >>"$MIGRATION_TRACE"\n');
  });
  const failed = await f.run({ STEP_FAILURE: '26' }); assert.equal(failed.code, 26); assert.match(failed.stderr, /20-extra.sh/);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-first-install', 'step-20']);
  await writeFile(f.trace, ''); assert.equal((await f.run()).code, 0);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script', 'video-reuse', 'step-20', 'step-30', 'pnpm build', 'start']);
});

test('缺少配置、Node无效或过旧、错误参数在停止现有商城前退出', async t => {
  const f = await fixture(t);
  for (const [overrides, args, pattern] of [[{ NODE_BIN: '/nonexistent-node' }, [], /Node/], [{ NODE_VERSION_FAILURE: '1' }, [], /Node 版本/], [{}, ['--pull-only'], /不需要参数/]]) {
    const result = await f.run(overrides, args); assert.notEqual(result.code, 0); assert.match(result.stderr, pattern); assert.deepEqual(await f.events(), []);
  }
  await rm(join(f.client, '.env.mysql')); const missing = await f.run(); assert.notEqual(missing.code, 0); assert.match(missing.stderr, /准备 .env.mysql/); assert.deepEqual(await f.events(), []);
});

test('不存在的远程分支、游离HEAD及其他远程上游不停止现有商城', async t => {
  const f = await fixture(t); await f.git(f.client, 'switch', '-c', 'missing');
  assert.match((await f.run()).stderr, /未找到远程分支/); assert.deepEqual(await f.events(), []);
  await f.git(f.client, 'checkout', '--detach'); assert.match((await f.run()).stderr, /游离 HEAD/);
  await f.git(f.client, 'switch', 'main'); await f.git(f.client, 'remote', 'add', 'other', f.remote); await f.git(f.client, 'fetch', 'other'); await f.git(f.client, 'branch', '--set-upstream-to=other/main');
  assert.match((await f.run()).stderr, /只从 origin/); assert.deepEqual(await f.events(), []);
});

for (const policy of ['migration', 'upgrade', 'video']) test(`远程缺少${policy}完整部署内容时在停服前拒绝`, async t => {
  const f = await fixture(t); await f.publish(async seed => {
    if (policy === 'migration') await writeFile(join(seed, 'migration_upgrade.sh'), '#!/bin/bash\necho old\n');
    else if (policy === 'upgrade') await writeFile(join(seed, 'upgrade.sh'), '#!/bin/bash\necho old\n');
    else await f.git(seed, 'rm', 'scripts/migrations/10-video-deps.sh');
  });
  const result = await f.run(); assert.notEqual(result.code, 0); assert.match(result.stderr, /商城尚未停止/); assert.deepEqual(await f.events(), []);
});

test('远程误跟踪视频引擎时拒绝覆盖，Git同步失败也恢复本机环境', async t => {
  const f = await fixture(t, { subdirectory: 'yxshopdev', trackedEnvironment: true });
  await f.publish(async seed => { await mkdir(join(seed, 'vendor/video-engine'), { recursive: true }); await writeFile(join(seed, 'vendor/video-engine/ffmpeg'), 'wrong-engine'); await f.git(seed, 'add', '-f', 'vendor/video-engine/ffmpeg'); });
  assert.match((await f.run()).stderr, /远程代码包含视频引擎目录/); assert.deepEqual(await f.events(), []);
  await f.git(f.seed, 'rm', '--cached', 'vendor/video-engine/ffmpeg'); await f.publish(async () => { await f.git(f.seed, 'rm', '--cached', '.env.mysql', '.env.local'); });
  await writeFile(join(f.clientRoot, '.git/index.lock'), 'simulate-reset-failure');
  const failed = await f.run(); assert.notEqual(failed.code, 0); assert.deepEqual(await f.events(), ['stop']);
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), mysql);
});
