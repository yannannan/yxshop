import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { LibreOfficeConverter } from '@matbee/libreoffice-converter/server';

const [source, output, font] = process.argv.slice(2);
const require = createRequire(import.meta.url);
// The worker wrapper forwards the WASM path but drops custom fonts.
const converter = new LibreOfficeConverter({
  wasmPath: join(dirname(require.resolve('@matbee/libreoffice-converter/package.json')), 'wasm'),
  wasmLoader: require('@matbee/libreoffice-converter/wasm/loader'),
  fonts: [{ filename: 'NotoSansCJKsc-Regular.otf', data: await readFile(font) }],
});
async function convert() {
  try {
    await converter.initialize();
    const document = await converter.convert(await readFile(source), {
      inputFormat: 'docx', outputFormat: 'pdf',
    }, 'input.docx');
    if (document.data.length > 12 * 1024 * 1024) throw Error('PDF output exceeds limit');
    await writeFile(output, document.data, { mode: 0o600 });
  } finally {
    converter.destroy();
  }
}

// The WASM thread pool stays alive after destroy. This process handles one file.
await convert().then(() => process.exit(0), error => {
  console.error(error.message);
  process.exit(1);
});
