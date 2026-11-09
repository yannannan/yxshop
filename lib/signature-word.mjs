import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import yauzl from 'yauzl';

const run = promisify(execFile);
const soffice = '/usr/bin/soffice';
const bwrap = '/usr/bin/bwrap';
const prlimit = '/usr/bin/prlimit';
const maxPdfBytes = 12 * 1024 * 1024;
const dependencies = [soffice, bwrap, prlimit];
const wslDependencies = [...dependencies, '/usr/bin/wslpath', '/usr/bin/timeout'];
let wslProbe;
let wasmRunning = false;
const require = createRequire(import.meta.url);

function wasmSettings() {
  try {
    const runtime = dirname(require.resolve('@matbee/libreoffice-converter/package.json'));
    const script = join(process.cwd(), 'scripts', 'convert-signature-word-wasm.mjs');
    const font = join(process.cwd(), 'assets', 'fonts', 'NotoSansCJKsc-Regular.otf');
    const zod = dirname(require.resolve('zod/package.json', { paths: [runtime] }));
    for (const file of [script, font, join(runtime, 'wasm', 'soffice.wasm'), join(runtime, 'wasm', 'soffice.data')]) {
      accessSync(file, constants.R_OK);
    }
    return { runtime, script, font, zod };
  } catch {
    return null;
  }
}

async function convertInWasm(directory, signal) {
  const settings = wasmSettings();
  if (!settings) throw Error('内置 DOCX 转换依赖尚未安装');
  if (wasmRunning) throw Error('文件签名服务繁忙，请稍后重试');
  wasmRunning = true;
  try {
    const input = join(directory, 'input.docx'), output = join(directory, 'input.pdf');
    // 子进程只读取转换程序、字体、依赖和本次输入，输出限于本次临时文件。
    const readable = [join(process.cwd(), 'node_modules'), settings.runtime, settings.zod, settings.script, settings.font, input];
    await run(process.execPath, [
      '--permission', '--allow-worker', '--max-old-space-size=256',
      '--liftoff-only', '--no-wasm-tier-up', '--wasm-lazy-compilation', '--wasm-max-mem-pages=16384',
      ...readable.map(file => `--allow-fs-read=${file}`), `--allow-fs-write=${output}`,
      settings.script, input, output, settings.font,
    ], {
      signal, timeout: 60_000, maxBuffer: 64 * 1024, killSignal: 'SIGKILL', windowsHide: true,
      env: process.platform === 'win32' ? wslSettings().env : { PATH: '/usr/bin:/bin' },
    });
  } finally {
    wasmRunning = false;
  }
}

function executable(path) {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
}

function wslSettings() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return {
    command: join(root, 'System32', 'wsl.exe'),
    distro: process.env.SIGNATURE_WORD_WSL_DISTRO?.trim(),
    env: { SystemRoot: root, WINDIR: root, PATH: join(root, 'System32') },
  };
}

function runInWsl(settings, program, args, options = {}) {
  return run(settings.command, ['--distribution', settings.distro, '--exec', program, ...args], {
    ...options, env: settings.env, windowsHide: true,
  });
}

async function probeWsl(settings) {
  try {
    const { stdout } = await runInWsl(settings, '/bin/sh', [
      '-c', 'printf "%s\\n" signature-word-probe; for program in "$@"; do [ -x "$program" ] || printf "%s\\n" "$program"; done',
      'signature-check', ...wslDependencies,
    ], { timeout: 12_000, maxBuffer: 32 * 1024 });
    const lines = stdout.trim().split(/\r?\n/);
    if (!lines.includes('signature-word-probe')) throw Error('invalid WSL probe response');
    return { missing: lines.filter(path => wslDependencies.includes(path)), issue: '' };
  } catch {
    return { missing: [], issue: '无法启动指定的 WSL 发行版，请用 wsl.exe --list --verbose 核对名称和版本。' };
  }
}

export async function signatureWordReadiness() {
  const supported = process.platform === 'linux' || process.platform === 'win32';
  const flag = process.env.SIGNATURE_WORD_ENABLED;
  const enabled = flag === undefined || flag === '1';
  const status = { supported, enabled, missing: [], issue: '', ready: false, engine: null };
  if (!supported || !enabled) return status;
  const bundled = wasmSettings() ? { ...status, ready: true, engine: 'wasm' } : null;
  if (process.platform === 'linux') {
    const missing = dependencies.filter(path => !executable(path));
    return missing.length ? bundled ?? { ...status, missing } : { ...status, ready: true, engine: 'native' };
  }
  const settings = wslSettings();
  if (!executable(settings.command)) return bundled ?? { ...status, issue: '当前 Windows 未找到 wsl.exe。' };
  if (!settings.distro) return bundled ?? { ...status, issue: '请设置 SIGNATURE_WORD_WSL_DISTRO 为已安装的 WSL 2 发行版名称。' };
  if (wslProbe?.distro !== settings.distro || wslProbe.expires < Date.now()) {
    wslProbe = { distro: settings.distro, expires: Date.now() + 15_000, result: probeWsl(settings) };
  }
  const probe = await wslProbe.result;
  if (!probe.issue && !probe.missing.length) return { ...status, ready: true, engine: 'native' };
  return bundled ?? { ...status, ...probe };
}

export async function signatureWordReady() {
  return (await signatureWordReadiness()).ready;
}

export async function validateWordArchive(bytes) {
  let archive;
  try {
    archive = await yauzl.fromBufferPromise(bytes, { strictFileNames: true, validateEntrySizes: true });
    if (archive.entryCount > 2000) throw Error('too many entries');
    let total = 0, document = false, documentType = false;
    const names = new Set();
    for await (const entry of archive.eachEntry()) {
      const name = entry.fileName;
      total += entry.uncompressedSize;
      if (total > 64 * 1024 * 1024 || names.has(name) || /(?:^|\/)(?:vba[^/]*|activeX|embeddings)(?:\/|$)/i.test(name) ||
        (entry.generalPurposeBitFlag & 1) || (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) {
        throw Error('unsupported archive entry');
      }
      names.add(name);
      if (name.endsWith('/')) continue;
      const stream = await archive.openReadStreamPromise(entry);
      if (name === '[Content_Types].xml') {
        if (entry.uncompressedSize > 512 * 1024) throw Error('invalid content types');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const types = Buffer.concat(chunks).toString('utf8');
        documentType = types.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
        if (/macroEnabled|vbaProject|<!DOCTYPE|<!ENTITY/i.test(types)) throw Error('unsupported document type');
      } else {
        for await (const chunk of stream) {
          if (chunk.length > entry.uncompressedSize) throw Error('invalid entry size');
        }
      }
      if (name === 'word/document.xml') document = true;
    }
    if (!document || !documentType) throw Error('not a DOCX file');
  } catch {
    throw Error('无法读取 Word 文档，请上传普通 DOCX 文件');
  } finally {
    archive?.close();
  }
}

export async function convertSignatureWord(bytes, signal) {
  const readiness = await signatureWordReadiness();
  if (!readiness.ready) throw Error('Word 转换服务暂未配置');
  await validateWordArchive(bytes);
  const directory = await mkdtemp(join(tmpdir(), 'yx-signature-'));
  try {
    await writeFile(join(directory, 'input.docx'), bytes, { mode: 0o600 });
    if (readiness.engine === 'wasm') {
      await convertInWasm(directory, signal);
    } else {
      try {
        await convertInNative(directory, signal);
      } catch (error) {
        if (signal?.aborted || !wasmSettings()) throw error;
        console.error('系统 Word 转换失败，改用内置转换', error?.code || 'CONVERSION_FAILED');
        await convertInWasm(directory, signal);
      }
    }
    const output = join(directory, 'input.pdf');
    const info = await stat(output);
    if (!info.isFile() || !info.size || info.size > maxPdfBytes) throw Error('invalid PDF output');
    return await readFile(output);
  } catch (error) {
    console.error('签名 Word 转换失败', error?.code || 'CONVERSION_FAILED');
    if (error.message === '文件签名服务繁忙，请稍后重试') throw error;
    throw Error('Word 转换失败，请检查文件或先另存为 PDF');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function convertInNative(directory, signal) {
  await mkdir(join(directory, 'profile', 'user'), { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'profile', 'user', 'registrymodifications.xcu'),
    '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>',
    { mode: 0o600 });
  const settings = process.platform === 'win32' ? wslSettings() : null;
  const job = settings
    ? (await runInWsl(settings, '/usr/bin/wslpath', ['-a', '-u', directory],
      { timeout: 12_000, maxBuffer: 32 * 1024, signal })).stdout.trim()
    : directory;
  if (!job.startsWith('/')) throw Error('invalid conversion directory');
  // Windows 通过 WSL 调用同一套只读系统目录和隔离网络沙箱。
  const args = [
    '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
    '--ro-bind', '/usr', '/usr', '--ro-bind-try', '/bin', '/bin', '--ro-bind-try', '/lib', '/lib',
    '--ro-bind-try', '/lib64', '/lib64', '--ro-bind-try', '/etc/fonts', '/etc/fonts',
    '--ro-bind-try', '/etc/ld.so.cache', '/etc/ld.so.cache',
    '--ro-bind-try', '/var/cache/fontconfig', '/var/cache/fontconfig',
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--bind', job, '/job',
    '--setenv', 'HOME', '/tmp', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'LANG', 'C.UTF-8',
    '--chdir', '/job', '--', prlimit, '--as=2147483648', `--fsize=${maxPdfBytes}`, '--cpu=25', '--',
    soffice, '-env:UserInstallation=file:///job/profile', '--headless', '--norestore', '--nodefault',
    '--infilter=Office Open XML Text', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', '/job', '/job/input.docx',
  ];
  const options = { maxBuffer: 64 * 1024, killSignal: 'SIGKILL', signal };
  if (settings) {
    await runInWsl(settings, '/usr/bin/timeout', ['--signal=KILL', '35s', bwrap, ...args], { ...options, timeout: 40_000 });
  } else {
    await run(bwrap, args, { ...options, timeout: 35_000, env: { PATH: '/usr/bin:/bin' } });
  }
}
