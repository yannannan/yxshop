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
const quote = value => `'${slashes(value).replaceAll("'", "'\\''")}'`;
const upgrade = readFileSync(new URL('../upgrade.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const videoInstaller = readFileSync(new URL('../scripts/install-video-deps-centos.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

async function fixture(t, branch = 'main', { trackedEnvironment = false, subdirectory = '' } = {}) {
  const root = await mkdtemp(join(process.cwd(), '.upgrade-test-'));
  t.after(async () => {
    const actual = await realpath(root), child = relative(process.cwd(), actual);
    assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.upgrade-test-'));
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const bin = join(root, 'bin'), seedRepository = join(root, 'seed'), clientRepository = join(root, 'client'), seed = join(seedRepository, subdirectory), remote = join(root, 'remote.git'), client = join(clientRepository, subdirectory), trace = join(root, 'trace');
  await mkdir(bin); await mkdir(seed, { recursive: true }); await writeFile(trace, '');
  await writeFile(join(root, 'git-config'), '');
  await writeFile(join(root, 'os-release'), 'ID=centos\nVERSION_ID=7\nPRETTY_NAME="CentOS Linux 7 (Core)"\n');
  await writeFile(join(seed, 'upgrade.sh'), upgrade);
  await writeFile(join(seed, '.gitignore'), '.env.mysql\n.env.local\n.env.upgrade.*/\nuploads/\nvendor/video-engine/\n');
  if (trackedEnvironment) {
    await writeFile(join(seed, '.env.mysql'), 'old-template-mysql\n');
    await writeFile(join(seed, '.env.local'), 'old-template-local\n');
  }
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
  await git(root, 'init', '--bare', remote); await git(root, 'init', '-b', branch, seedRepository);
  await git(seed, 'config', 'user.name', 'Upgrade test'); await git(seed, 'config', 'user.email', 'upgrade@example.invalid'); await git(seed, 'config', 'core.autocrlf', 'false');
  await git(seed, 'add', '.');
  if (trackedEnvironment) await git(seed, 'add', '-f', '.env.local', '.env.mysql');
  await git(seed, 'commit', '-m', 'base'); await git(seed, 'remote', 'add', 'origin', remote); await git(seed, 'push', 'origin', branch);
  await git(root, 'clone', '-b', branch, remote, clientRepository); await git(client, 'config', 'core.autocrlf', 'false');
  await writeFile(join(client, '.env.mysql'), 'keep-server-environment');
  await writeFile(join(client, '.env.local'), 'keep-local-environment');
  await mkdir(join(client, 'uploads')); await writeFile(join(client, 'uploads/keep.txt'), 'keep-user-upload');
  async function publish(extra) {
    await writeFile(join(seed, 'app.txt'), 'v2\n'); await writeFile(join(seed, '.next/routes.d.ts'), 'types-v2\n');
    if (extra) await extra(seed);
    await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'new release'); await git(seed, 'push', 'origin', branch);
  }
  async function run(args = [], overrides = {}) {
    try { const result = await execute(bash, [slashes(join(client, 'upgrade.sh')), ...args], { cwd: root, env: { ...env, ...overrides }, timeout: 30000, windowsHide: true }); return { ...result, code: 0 }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  async function runVideo(args = [], overrides = {}, { install = false, keyIssue = '' } = {}) {
    let script = videoInstaller.replaceAll('/etc/os-release', quote(join(root, 'os-release')));
    if (install) {
      // Windows 的 Git Bash 不提供真实 Linux root；只绕过此 guard，所有安装命令仍被替身拦截。
      assert.ok(script.includes('[[ "$EUID" -eq 0 ]]'));
      script = script.replace('[[ "$EUID" -eq 0 ]]', '[[ 0 -eq 0 ]]');
      const keys = join(client, 'scripts/keys'); await mkdir(keys, { recursive: true });
      for (const name of ['RPM-GPG-KEY-CentOS-7', 'RPM-GPG-KEY-CentOS-SIG-SCLo']) {
        await writeFile(join(keys, name), await readFile(new URL(`../scripts/keys/${name}`, import.meta.url)));
      }
      if (keyIssue === 'missing') await rm(join(keys, 'RPM-GPG-KEY-CentOS-SIG-SCLo'));
      if (keyIssue === 'corrupt') await writeFile(join(keys, 'RPM-GPG-KEY-CentOS-SIG-SCLo'), 'corrupted-key\n');
    }
    await writeFile(join(client, 'scripts/install-video-deps-centos.sh'), script);
    await writeFile(join(bin, 'uname'), '#!/bin/bash\nif [[ "$1" == -s ]]; then echo Linux; else echo x86_64; fi\n', { mode: 0o755 });
    await writeFile(join(bin, 'node-video-test'), '#!/bin/bash\ncase "$*" in *setup-video-engine.mjs*) echo binary-check >>"$UPGRADE_TRACE"; exit "${BINARY_FAILURE:-0}";; *check-video-link.mjs*) echo browser-check >>"$UPGRADE_TRACE"; exit "${BROWSER_FAILURE:-0}";; *) exit 0;; esac\n', { mode: 0o755 });
    for (const name of ['yum', 'dnf', 'useradd']) await writeFile(join(bin, name), '#!/bin/bash\necho 不允许测试安装系统依赖 >&2\nexit 91\n', { mode: 0o755 });
    if (install) {
      await writeFile(join(bin, 'flock'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
      await writeFile(join(bin, 'yum'), '#!/bin/bash\necho yum >>"$UPGRADE_TRACE"\n[[ "$1" == -c ]] || exit 92\ncat "$2" >"$UPGRADE_YUM_CAPTURE"\necho 模拟归档源全部不可用 >&2\nexit 78\n', { mode: 0o755 });
    }
    const options = { cwd: root, env: { ...env, NODE_BIN: slashes(join(bin, 'node-video-test')), UPGRADE_YUM_CAPTURE: slashes(join(root, 'generated-yum.conf')), ...overrides }, timeout: 10000, windowsHide: true };
    const testBin = process.platform === 'win32' ? (await execute(bash, ['-c', 'cygpath -u "$1"', '--', slashes(bin)], options)).stdout.trim() : bin;
    try { const result = await execute(bash, ['-c', 'export PATH="$1:$PATH"\nshift\nvideo_test_script="$1"\nshift\nsource "$video_test_script" "$@"', '--', testBin, slashes(join(client, 'scripts/install-video-deps-centos.sh')), ...args], options); return { ...result, code: 0 }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  return { root, client, seed, clientRepository, seedRepository, trace, git, publish, run, runVideo, events: async () => (await readFile(trace, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => line.trim()) };
}

test('main 分支按现有跟踪关系升级，只调用一次独立 video 脚本，保留环境与上传文件', async t => {
  const f = await fixture(t); await f.publish();
  await writeFile(join(f.client, '.next/routes.d.ts'), 'local-generated-draft\n');
  await writeFile(join(f.client, 'app.txt'), 'server-local-edit\n');
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /本次同步目标：origin\/main/);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), 'keep-server-environment');
  assert.equal(await readFile(join(f.client, 'uploads/keep.txt'), 'utf8'), 'keep-user-upload');
  assert.equal(await readFile(join(f.client, '.next/routes.d.ts'), 'utf8'), 'types-v2\n');
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script --check', 'pnpm build', 'start']);
});

test('远程升级入口仍会自动安装时，在停服和reset之前拒绝覆盖新的仅检查策略', async t => {
  const f = await fixture(t, 'master');
  await f.publish(async seed => {
    const path = join(seed, 'upgrade.sh');
    await writeFile(path, (await readFile(path, 'utf8')).replace('# video-upgrade-policy: check-only-v1\n', ''));
  });
  const result = await f.run(); assert.notEqual(result.code, 0);
  assert.match(result.stderr, /远程 origin\/master.*仅检查策略/); assert.match(result.stderr, /商城尚未停止/);
  assert.deepEqual(await f.events(), []); assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v1\n');
});

test('日常升级复用已安装视频引擎和离线缓存，自检失败也不替换或删除这些文件', async t => {
  const f = await fixture(t); await f.publish();
  const engine = join(f.client, 'vendor/video-engine');
  const files = { 'yt-dlp': 'installed-ytdlp', ffmpeg: 'installed-ffmpeg', 'browser-runtime.json': '{"engine":"firefox","platform":"linux"}', 'firefox/current/firefox': 'installed-browser', 'downloads/ffmpeg/9.0.2/ffmpeg-9.0.2.tar.xz': 'offline-source' };
  for (const [name, content] of Object.entries(files)) { const path = join(engine, name); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, content); }
  const result = await f.run([], { VIDEO_INSTALL_FAILURE: '23' }); assert.equal(result.code, 0, result.stderr);
  assert.ok((await f.events()).includes('video-script --check')); assert.ok((await f.events()).includes('start'));
  for (const [name, content] of Object.entries(files)) assert.equal(await readFile(join(engine, name), 'utf8'), content, name);
  assert.match(result.stderr, /不自动下载或修复/);
});

test('远程误提交Windows或其他视频引擎文件时提前拒绝，不覆盖本机Linux引擎', async t => {
  const f = await fixture(t, 'master');
  const engine = join(f.client, 'vendor/video-engine'); await mkdir(engine, { recursive: true }); await writeFile(join(engine, 'yt-dlp'), 'server-linux-engine');
  await f.publish(async seed => {
    await mkdir(join(seed, 'vendor/video-engine'), { recursive: true });
    await writeFile(join(seed, 'vendor/video-engine/yt-dlp'), 'wrong-binary');
    await f.git(seed, 'add', '-f', 'vendor/video-engine/yt-dlp');
  });
  const result = await f.run(); assert.notEqual(result.code, 0);
  assert.match(result.stderr, /远程代码包含视频引擎目录/); assert.deepEqual(await f.events(), []);
  assert.equal(await readFile(join(engine, 'yt-dlp'), 'utf8'), 'server-linux-engine');
});

test('项目位于仓库yxshopdev子目录时正确读取远程入口，保留本机环境与引擎', async t => {
  const f = await fixture(t, 'master', { subdirectory: 'yxshopdev', trackedEnvironment: true });
  const engine = join(f.client, 'vendor/video-engine'); await mkdir(engine, { recursive: true }); await writeFile(join(engine, 'ffmpeg'), 'linux-engine');
  await f.publish(async seed => { await f.git(seed, 'rm', '--cached', '.env.local', '.env.mysql'); });
  assert.match((await f.git(f.client, 'show', 'origin/master:./upgrade.sh')).stdout, /check-only-v1/);
  const entry = join(f.client, 'upgrade.sh');
  await writeFile(entry, upgrade.replace('"$UPGRADE_REF:${PROJECT_PREFIX}upgrade.sh"', '"$UPGRADE_REF:upgrade.sh"'));
  const rejected = await f.run(); assert.notEqual(rejected.code, 0); assert.match(rejected.stderr, /fatal: path/i); assert.deepEqual(await f.events(), []);
  const replacement = 's|"$UPGRADE_REF:upgrade.sh"|"$UPGRADE_REF:./upgrade.sh"|';
  await execute(bash, ['-c', 'sed -i.bak "$1" "$2"', '--', replacement, slashes(entry)], { cwd: f.root, windowsHide: true });
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /fatal: path|尚未包含/i); assert.match(result.stdout, /origin\/master/);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), 'keep-server-environment');
  assert.equal(await readFile(join(engine, 'ffmpeg'), 'utf8'), 'linux-engine');
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script --check', 'pnpm build', 'start']);
});

test('嵌套且含空格的项目路径可以升级，仓库其他目录的同名引擎不误拦截', async t => {
  const f = await fixture(t, 'master', { subdirectory: 'deploy/apps/yxshop dev' });
  await mkdir(join(f.seedRepository, 'vendor/video-engine'), { recursive: true });
  await writeFile(join(f.seedRepository, 'vendor/video-engine/another-project'), 'unrelated');
  await f.git(f.seedRepository, 'add', 'vendor/video-engine/another-project');
  await f.publish();
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.ok((await f.events()).includes('video-script --check'));
});

test('子目录项目自身的引擎误入远程版本管理时仍提前拒绝，不遗漏或双重追加前缀', async t => {
  const f = await fixture(t, 'master', { subdirectory: 'yxshopdev' });
  await f.publish(async seed => {
    await mkdir(join(seed, 'vendor/video-engine'), { recursive: true });
    await writeFile(join(seed, 'vendor/video-engine/ffmpeg'), 'wrong-engine');
    await f.git(seed, 'add', '-f', 'vendor/video-engine/ffmpeg');
  });
  const result = await f.run(); assert.notEqual(result.code, 0);
  assert.match(result.stderr, /远程代码包含视频引擎目录/); assert.deepEqual(await f.events(), []);
});

test('旧服务器环境文件从 Git 跟踪转为忽略后，首次升级仍保留两份真实本地配置', async t => {
  const f = await fixture(t, 'master', { trackedEnvironment: true });
  await f.publish(async seed => { await f.git(seed, 'rm', '--cached', '.env.local', '.env.mysql'); });
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), 'keep-server-environment');
  assert.equal(await readFile(join(f.client, '.env.local'), 'utf8'), 'keep-local-environment');
  assert.equal((await f.git(f.client, 'ls-files', '--', '.env.local', '.env.mysql')).stdout.trim(), '');
  assert.ok(!(await readdir(f.client)).some(name => name.startsWith('.env.upgrade.')));
  assert.doesNotMatch(result.stdout + result.stderr, /keep-server-environment|keep-local-environment/);
});

test('远程仍跟踪环境模板时升级保留本机值；reset 或后续安装失败也不丢配置', async t => {
  for (const failure of ['none', 'reset', 'install']) {
    const f = await fixture(t, 'main', { trackedEnvironment: true });
    await f.publish(async seed => { await writeFile(join(seed, '.env.mysql'), 'new-remote-template\n'); await writeFile(join(seed, '.env.local'), 'new-local-template\n'); });
    if (failure === 'reset') await writeFile(join(f.client, '.git/index.lock'), 'simulated-lock');
    const result = await f.run([], failure === 'install' ? { INSTALL_FAILURE: '23' } : {});
    assert.equal(result.code === 0, failure === 'none', result.stderr);
    assert.equal(await readFile(join(f.client, '.env.mysql'), 'utf8'), 'keep-server-environment');
    assert.equal(await readFile(join(f.client, '.env.local'), 'utf8'), 'keep-local-environment');
    assert.ok(!(await readdir(f.client)).some(name => name.startsWith('.env.upgrade.')));
  }
});

test('服务器只有 master 时同步 origin/master，不依赖不存在的 origin/main', async t => {
  const f = await fixture(t, 'master'); await f.publish();
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /本次同步目标：origin\/master/);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script --check', 'pnpm build', 'start']);
});

test('master 已跟踪 origin/master 时不被缓存的 main 或 origin/HEAD 改变目标', async t => {
  const f = await fixture(t, 'master');
  const { stdout: base } = await f.git(f.client, 'rev-parse', 'HEAD');
  await f.git(f.client, 'update-ref', 'refs/remotes/origin/main', base.trim());
  await f.git(f.client, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  await f.git(f.client, 'branch', '-m', 'deploy');
  await f.publish();
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /本次同步目标：origin\/master/);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
});

test('未配置上游时使用当前分支的 origin 同名分支', async t => {
  const f = await fixture(t, 'master'); await f.publish();
  await f.git(f.client, 'branch', '--unset-upstream');
  const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /本次同步目标：origin\/master/);
  assert.equal(await readFile(join(f.client, 'app.txt'), 'utf8'), 'v2\n');
});

test('远程分支缺失或处于游离 HEAD 时提前退出，不停止现有商城', async t => {
  const f = await fixture(t);
  await f.git(f.client, 'switch', '-c', 'missing');
  const missing = await f.run(); assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /未找到远程分支 origin\/missing/); assert.match(missing.stderr, /商城尚未停止/);
  assert.deepEqual(await f.events(), []);
  await f.git(f.client, 'checkout', '--detach');
  const detached = await f.run(); assert.notEqual(detached.code, 0); assert.match(detached.stderr, /游离 HEAD/);
  assert.deepEqual(await f.events(), []);
});

test('当前分支跟踪其他远程时拒绝混用 origin，不停止现有商城', async t => {
  const f = await fixture(t);
  await f.git(f.client, 'remote', 'add', 'other', join(f.root, 'remote.git'));
  await f.git(f.client, 'fetch', 'other');
  await f.git(f.client, 'branch', '--set-upstream-to=other/main');
  const result = await f.run(); assert.notEqual(result.code, 0);
  assert.match(result.stderr, /当前分支跟踪 other\/main/); assert.deepEqual(await f.events(), []);
});
test('video 仅检查失败单独提示，仍继续构建和启动商城，不误报视频就绪', async t => {
  const f = await fixture(t); await f.publish();
  const result = await f.run([], { VIDEO_INSTALL_FAILURE: '23' }); assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await f.events(), ['stop', 'pnpm install --frozen-lockfile --prod=false', 'video-script --check', 'pnpm build', 'start']);
  assert.match(result.stderr, /视频依赖检查未通过/); assert.match(result.stdout, /商城已启动；视频依赖检查未通过/);
  assert.doesNotMatch(result.stdout, /升级发布完成/);
});
test('不再保留 pull-only 第二种升级模式，错误参数不触发部署', async t => {
  const f = await fixture(t);
  const result = await f.run(['--pull-only']); assert.equal(result.code, 2); assert.match(result.stderr, /不需要参数/);
  assert.deepEqual(await f.events(), []);
});
test('拉取失败在停服前报错退出，不执行依赖安装、构建和启动', async t => {
  const f = await fixture(t);
  await f.git(f.client, 'remote', 'set-url', 'origin', join(f.root, 'missing.git'));
  const result = await f.run(); assert.notEqual(result.code, 0); assert.deepEqual(await f.events(), []);
});
test('项目依赖或构建失败仍中断升级，不将项目失败当作 video 失败忽略', async t => {
  const f = await fixture(t); await f.publish();
  const failed = await f.run([], { INSTALL_FAILURE: '23' });
  assert.notEqual(failed.code, 0); assert.match(failed.stderr, /升级失败/); assert.ok(!(await f.events()).includes('video-script --check')); assert.ok(!(await f.events()).includes('start'));
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

test('浏览器实际启动自检失败也不进入yum、pnpm或引擎下载修复', async t => {
  const f = await fixture(t);
  const result = await f.runVideo(['--check'], { BROWSER_FAILURE: '26' }); assert.notEqual(result.code, 0);
  assert.deepEqual(await f.events(), ['binary-check', 'browser-check']);
  assert.match(result.stdout, /不会进入安装或下载流程/); assert.doesNotMatch(result.stdout, /安装系统库|安装及启动检查通过/);
  assert.match(result.stderr, /视频依赖检查失败/); assert.doesNotMatch(result.stderr, /视频依赖安装失败/);
});

test('CentOS 7 安装使用三个 HTTPS 归档镜像和本地官方公钥，yum 失败不改动已有引擎或启动商城', async t => {
  const f = await fixture(t);
  const engine = join(f.client, 'vendor/video-engine'); await mkdir(engine, { recursive: true });
  await writeFile(join(engine, 'browser-runtime.json'), '{"oldRuntime":true}');
  await writeFile(join(engine, 'ffmpeg'), 'old-engine');
  const result = await f.runVideo([], { BINARY_FAILURE: '25' }, { install: true });
  assert.equal(result.code, 78, result.stderr);
  assert.match(result.stderr, /视频依赖安装失败/); assert.doesNotMatch(result.stdout, /安装及启动检查通过/);
  const config = await readFile(join(f.root, 'generated-yum.conf'), 'utf8');
  function section(name) {
    const value = config.split(`[${name}]\n`)[1]; assert.ok(value, name);
    return value.split(/\n\[/)[0];
  }
  for (const [name, path, key] of [
    ['video-c7-base', 'os/$basearch', 'RPM-GPG-KEY-CentOS-7'],
    ['video-c7-updates', 'updates/$basearch', 'RPM-GPG-KEY-CentOS-7'],
    ['video-c7-scl', 'sclo/$basearch/rh', 'RPM-GPG-KEY-CentOS-SIG-SCLo'],
  ]) {
    const repo = section(name), urls = repo.match(/https:\/\/\S+/g);
    assert.deepEqual(urls, [
      `https://mirrors.aliyun.com/centos-vault/7.9.2009/${path}/`,
      `https://repo.huaweicloud.com/centos-vault/7.9.2009/${path}/`,
      `https://vault.centos.org/7.9.2009/${path}/`,
    ]);
    assert.match(repo, /failovermethod=priority/); assert.match(repo, /gpgcheck=1/);
    assert.match(repo, new RegExp(`gpgkey=file://[^\\n]+/scripts/keys/${key}(?:\\n|$)`));
    assert.ok((await readFile(join(f.client, 'scripts/keys', key), 'utf8')).startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----'));
  }
  assert.match(section('main'), /cachedir=.+\/vendor\/video-engine\/yum-cache\/\$basearch\/\$releasever/);
  assert.match(section('main'), /reposdir=\/dev\/null/); assert.match(section('main'), /plugins=0/); assert.match(section('main'), /sslverify=1/);
  assert.doesNotMatch(config, /mirrorlist=|gpgcheck=0|sslverify=0|gpgkey=https:/);
  assert.equal(await readFile(join(engine, 'browser-runtime.json'), 'utf8'), '{"oldRuntime":true}');
  assert.equal(await readFile(join(engine, 'ffmpeg'), 'utf8'), 'old-engine');
  assert.deepEqual(await f.events(), ['binary-check', 'yum']);
});

test('CentOS 官方公钥文件缺失或被修改时停止安装，不联系 yum 或跳过签名检查', async t => {
  const f = await fixture(t);
  for (const keyIssue of ['missing', 'corrupt']) {
    await writeFile(f.trace, '');
    const result = await f.runVideo([], { BINARY_FAILURE: '25' }, { install: true, keyIssue });
    assert.notEqual(result.code, 0); assert.match(result.stderr, keyIssue === 'missing' ? /缺少官方公钥/ : /公钥校验失败/);
    assert.deepEqual(await f.events(), ['binary-check']); assert.doesNotMatch(result.stdout, /安装及启动检查通过/);
  }
});
