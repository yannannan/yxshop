import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, relative, isAbsolute } from 'node:path';

const execute = promisify(execFile), gitExec = (await execute('git', ['--exec-path'])).stdout.trim();
const bash = process.platform === 'win32' ? resolve(gitExec, '../../..', 'bin/bash.exe') : '/bin/bash';
const installer = (await readFile(new URL('../scripts/install-video-deps-centos.sh', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const helper = (await readFile(new URL('../scripts/lib/video-download.sh', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const media = 'official-source-fixture';

const mockCurl = `
curl() {
    [[ "$1" == --disable ]] || return 90
    local output="" item previous="" flags="$*" offset=0
    [[ "$flags" == *'--speed-limit 1 --speed-time 120 --continue-at -'* ]] || return 91
    [[ "$flags" != *'--retry '* && "$flags" != *'--max-time '* ]] || return 92
    [[ "$flags" == *"--proto =https --proto-redir =https"* ]] || return 93
    for item in "$@"; do [[ "$previous" != --output ]] || output="$item"; previous="$item"; done
    [[ -n "$output" ]] || return 94
    [[ ! -f "$output" ]] || offset="$(wc -c <"$output")"
    echo "$offset" >>"$APP_DIR/curl.trace"
    local count
    count="$(wc -l <"$APP_DIR/curl.trace")"
    case "\${DOWNLOAD_MODE:-ok}" in
      fail) if (( offset == 0 )); then printf offic >"$output"; fi; printf 200; return 28 ;;
      once) if (( count == 1 )); then printf offic >"$output"; printf 200; return 28; fi ;;
      range) if (( count == 1 )); then printf 200; return 33; fi ;;
      empty) printf 200; return 0 ;;
      huge) printf 'oversized-contents' >"$output"; printf 200; return 0 ;;
    esac
    local content='${media}'
    if (( offset > 0 )); then printf '%s' "\${content:offset}" >>"$output"; printf 206
    else printf '%s' '${media}' >"$output"; printf 200; fi
}
sleep() { :; }
`;

async function fixture(t) {
  const parent = await realpath(join(process.cwd(), 'tests')), root = await mkdtemp(join(parent, '.native-download-'));
  t.after(async () => {
    const actual = await realpath(root), child = relative(parent, actual);
    assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.native-download-'));
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  await writeFile(join(root, 'scripts/lib/video-download.sh'), helper);
  await writeFile(join(root, 'curl.trace'), '');
  const source = join(root, 'source.tar.xz');
  async function run(body, env = {}) {
    const preamble = 'set -Eeuo pipefail\ncd -- "$1"\nAPP_DIR="$(pwd -P)"\n. "$APP_DIR/scripts/lib/video-download.sh"\n';
    await writeFile(join(root, 'run.sh'), `${preamble}${mockCurl}\n${body}`);
    try { return { ...(await execute(bash, [join(root, 'run.sh').replaceAll('\\', '/'), root.replaceAll('\\', '/')], { env: { ...process.env, ...env }, timeout: 10000, windowsHide: true })), code: 0 }; }
    catch (error) { return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  return { root, source, run, offsets: async () => (await readFile(join(root, 'curl.trace'), 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(Number) };
}

test('CentOS curl 下载中断后按已写入大小续传，不使用会丢弃进度的内建 retry', async t => {
  const f = await fixture(t), result = await f.run('video_download https://ffmpeg.org/source "$APP_DIR/source.tar.xz" 1000', { DOWNLOAD_MODE: 'once' });
  assert.equal(result.code, 0, result.stderr); assert.deepEqual(await f.offsets(), [0, 5]); assert.equal(await readFile(f.source, 'utf8'), media);
});

test('下载三次失败和退出后仍保留断点，重开进程继续且不提前出现成品', async t => {
  const f = await fixture(t), command = 'video_download https://ffmpeg.org/source "$APP_DIR/source.tar.xz" 1000';
  const failed = await f.run(command, { DOWNLOAD_MODE: 'fail' });
  assert.notEqual(failed.code, 0); assert.match(failed.stderr, /下载三次失败/); assert.deepEqual(await f.offsets(), [0, 5, 5]);
  assert.equal(await lstat(f.source).catch(() => null), null); assert.equal(await readFile(`${f.source}.part`, 'utf8'), 'offic');
  assert.equal((await f.run(command)).code, 0); assert.equal(await readFile(f.source, 'utf8'), media); assert.deepEqual(await f.offsets(), [0, 5, 5, 5]);
});

test('存在缓存或手工离线文件时不访问网络，仍交给后续签名验证', async t => {
  const f = await fixture(t); await writeFile(f.source, media);
  const result = await f.run('video_download https://ffmpeg.org/source "$APP_DIR/source.tar.xz" 1000', { DOWNLOAD_MODE: 'fail' });
  assert.equal(result.code, 0); assert.deepEqual(await f.offsets(), []); assert.match(result.stdout, /后续仍验证官方签名/);
});

test('源站不支持续传时先清除断点，再从零获取，不能拼接重复内容', async t => {
  const f = await fixture(t); await writeFile(`${f.source}.part`, 'offic');
  const result = await f.run('video_download https://ffmpeg.org/source "$APP_DIR/source.tar.xz" 1000', { DOWNLOAD_MODE: 'range' });
  assert.equal(result.code, 0, result.stderr); assert.deepEqual(await f.offsets(), [5, 0]); assert.equal(await readFile(f.source, 'utf8'), media);
});

test('空响应、超限下载、目录路径不能被当作完整缓存', async t => {
  const f = await fixture(t), command = 'video_download https://ffmpeg.org/source "$APP_DIR/source.tar.xz" 8';
  assert.notEqual((await f.run(command, { DOWNLOAD_MODE: 'empty' })).code, 0);
  assert.notEqual((await f.run(command, { DOWNLOAD_MODE: 'huge' })).code, 0);
  assert.equal(await lstat(f.source).catch(() => null), null); assert.equal(await lstat(`${f.source}.part`).catch(() => null), null);
  await mkdir(`${f.source}.part`);
  assert.notEqual((await f.run(command)).code, 0);
});

const stage = installer.slice(installer.indexOf("echo '[4/6]"), installer.indexOf("echo '[5/6]"));
const stageSetup = `
ENGINE="$APP_DIR/vendor/video-engine"
JOBS=2
mkdir -p "$ENGINE"
fail() { echo "错误：$*" >&2; exit 1; }
${process.platform === 'win32' ? '# Git Bash 无法给 Windows 临时目录应用 Linux 0700；只在隔离测试中略过该模式参数。\nmkdir() { if [[ "${1:-}" == -m ]]; then shift 2; fi; command mkdir "$@"; }' : ''}
gpg() {
    echo gpg >>"$APP_DIR/phase.trace"
    if [[ "$*" == *--verify* ]]; then
        case "\${SIGNATURE_MODE:-ok}" in bad) return 1;; wrong) echo '[GNUPG:] VALIDSIG 0000000000000000000000000000000000000000 '; return 0;; esac
        echo '[GNUPG:] VALIDSIG FCF986EA15E6E293A5644F10B4322F04D67658D8 '
    fi
}
tar() {
    echo extract >>"$APP_DIR/phase.trace"
    local directory="\${@: -1}/ffmpeg-9.0.2"
    mkdir -p "$directory"
    printf '#!/usr/bin/env bash\\nexit 0\\n' >"$directory/configure"
    printf '#!/usr/bin/env bash\\nexit 0\\n' >"$directory/ffmpeg"
    chmod 755 "$directory/configure" "$directory/ffmpeg"
}
make() { echo make >>"$APP_DIR/phase.trace"; return "\${MAKE_FAILURE:-0}"; }
`;

test('真实 FFmpeg 安装阶段使用持久缓存，并在解包和编译前核对签名及固定指纹', async t => {
  const f = await fixture(t), result = await f.run(stageSetup + stage);
  assert.equal(result.code, 0, result.stderr); assert.equal((await f.offsets()).length, 3);
  assert.deepEqual((await readFile(join(f.root, 'phase.trace'), 'utf8')).trim().split(/\r?\n/), ['gpg', 'gpg', 'extract', 'make']);
  assert.equal(await readFile(join(f.root, 'vendor/video-engine/downloads/ffmpeg/9.0.2/ffmpeg-9.0.2.tar.xz'), 'utf8'), media);
});

test('签名无效或签名人指纹不符时清除坏缓存，不能解包、编译或替换旧引擎', async t => {
  for (const mode of ['bad', 'wrong']) {
    const f = await fixture(t), engine = join(f.root, 'vendor/video-engine'); await mkdir(engine, { recursive: true });
    const old = '#!/usr/bin/env bash\nexit 1\n'; await writeFile(join(engine, 'ffmpeg'), old, { mode: 0o755 });
    const result = await f.run(stageSetup + stage, { SIGNATURE_MODE: mode });
    assert.notEqual(result.code, 0); assert.match(result.stderr, /官方签名校验失败/);
    assert.doesNotMatch(await readFile(join(f.root, 'phase.trace'), 'utf8'), /extract|make/);
    assert.equal(await readFile(join(engine, 'ffmpeg'), 'utf8'), old);
    assert.equal(await lstat(join(engine, 'downloads/ffmpeg/9.0.2/ffmpeg-9.0.2.tar.xz')).catch(() => null), null);
  }
});

test('本机编译失败仍保留源码缓存，重跑不重新下载三个文件', async t => {
  const f = await fixture(t), failed = await f.run(stageSetup + stage, { MAKE_FAILURE: '61' });
  assert.equal(failed.code, 61, failed.stderr); assert.equal((await f.offsets()).length, 3);
  const success = await f.run(stageSetup + stage);
  assert.equal(success.code, 0, success.stderr); assert.equal((await f.offsets()).length, 3);
});
