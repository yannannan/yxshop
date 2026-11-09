import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import yauzl from 'yauzl';

const run = promisify(execFile);
const soffice = '/usr/bin/soffice';
const bwrap = '/usr/bin/bwrap';
const prlimit = '/usr/bin/prlimit';
const maxPdfBytes = 12 * 1024 * 1024;

export function signatureWordReady() {
  return process.platform === 'linux' && process.env.SIGNATURE_WORD_ENABLED === '1' &&
    [soffice, bwrap, prlimit].every(path => existsSync(path));
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
  if (!signatureWordReady()) throw Error('Word 转换服务暂未配置');
  await validateWordArchive(bytes);
  const directory = await mkdtemp(join(tmpdir(), 'yx-signature-'));
  try {
    await mkdir(join(directory, 'profile', 'user'), { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'profile', 'user', 'registrymodifications.xcu'),
      '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>',
      { mode: 0o600 });
    await writeFile(join(directory, 'input.docx'), bytes, { mode: 0o600 });
    // 沙箱只读挂载转换所需系统文件，隔离网络及宿主项目目录。
    await run(bwrap, [
      '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
      '--ro-bind', '/usr', '/usr', '--ro-bind-try', '/bin', '/bin', '--ro-bind-try', '/lib', '/lib',
      '--ro-bind-try', '/lib64', '/lib64', '--ro-bind-try', '/etc/fonts', '/etc/fonts',
      '--ro-bind-try', '/etc/ld.so.cache', '/etc/ld.so.cache',
      '--ro-bind-try', '/var/cache/fontconfig', '/var/cache/fontconfig',
      '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--bind', directory, '/job',
      '--setenv', 'HOME', '/tmp', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'LANG', 'C.UTF-8',
      '--chdir', '/job', '--', prlimit, '--as=2147483648', `--fsize=${maxPdfBytes}`, '--cpu=25', '--',
      soffice, '-env:UserInstallation=file:///job/profile', '--headless', '--norestore', '--nodefault',
      '--infilter=Office Open XML Text', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', '/job', '/job/input.docx',
    ], { timeout: 35_000, maxBuffer: 64 * 1024, killSignal: 'SIGKILL', signal, env: { PATH: '/usr/bin:/bin' } });
    const output = join(directory, 'input.pdf');
    const info = await stat(output);
    if (!info.isFile() || !info.size || info.size > maxPdfBytes) throw Error('invalid PDF output');
    return await readFile(output);
  } catch (error) {
    console.error('签名 Word 转换失败', error?.code || 'CONVERSION_FAILED');
    throw Error('Word 转换失败，请检查文件或先另存为 PDF');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
