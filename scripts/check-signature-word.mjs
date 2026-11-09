import { readFile, stat } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { convertSignatureWord, signatureWordReadiness } from '../lib/signature-word.mjs';

const [file, ...extra] = process.argv.slice(2);
if (extra.length || (file && !/\.docx$/i.test(file))) {
  console.error('用法：node --env-file=.env.mysql scripts/check-signature-word.mjs [测试文档.docx]');
  process.exitCode = 2;
} else {
  const readiness = await signatureWordReadiness();
  if (!readiness.supported) console.error('DOCX 转换支持 Windows 的 WSL 2 和 Linux。');
  if (!readiness.enabled) console.error('尚未启用转换，请设置 SIGNATURE_WORD_ENABLED=1。');
  if (readiness.issue) console.error(readiness.issue);
  if (readiness.missing.length) console.error('缺少可执行依赖：' + readiness.missing.join('、'));
  if (!readiness.ready) {
    process.exitCode = 1;
  } else if (file) {
    try {
      const info = await stat(file);
      if (!info.isFile() || !info.size || info.size > 12 * 1024 * 1024) throw Error('请提供 12MB 以内的 DOCX 文件。');
      const pdf = await convertSignatureWord(await readFile(file));
      const document = await PDFDocument.load(pdf);
      console.log(`DOCX 转换通过，共 ${document.getPageCount()} 页，PDF ${pdf.length} 字节。`);
    } catch (error) {
      console.error('DOCX 检查失败：' + error.message);
      process.exitCode = 1;
    }
  } else {
    console.log('转换开关与程序路径检查通过。传入测试 DOCX 可核对实际沙箱转换。');
  }
}
