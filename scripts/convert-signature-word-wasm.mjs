import { readFile, writeFile } from 'node:fs/promises';
import { createWorkerConverter } from '@matbee/libreoffice-converter/server';

const [source, output, font] = process.argv.slice(2);
const converter = await createWorkerConverter({
  fonts: [{ filename: 'NotoSansCJKsc-Regular.otf', data: await readFile(font) }],
});
try {
  const document = await converter.convert(await readFile(source), {
    inputFormat: 'docx', outputFormat: 'pdf',
  }, 'input.docx');
  if (document.data.length > 12 * 1024 * 1024) throw Error('PDF output exceeds limit');
  await writeFile(output, document.data, { mode: 0o600 });
} finally {
  await converter.destroy();
}
