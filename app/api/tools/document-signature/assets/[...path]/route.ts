import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const runtime = 'nodejs';
const require = createRequire(import.meta.url);
const supported = {
  build: /^pdf\.worker\.min\.mjs$/,
  cmaps: /^[\w-]+\.bcmap$/,
  standard_fonts: /^[\w-]+\.(pfb|ttf)$/,
  wasm: /^(?:jbig2|openjpeg|qcms_bg)\.wasm$|^(?:jbig2|openjpeg)_nowasm_fallback\.js$/,
  iccs: /^[\w-]+\.icc$/,
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const [directory, file] = path;
  if (path.length !== 2 || !Object.hasOwn(supported, directory) || !supported[directory as keyof typeof supported].test(file)) {
    return new Response(null, { status: 404 });
  }
  try {
    const root = dirname(require.resolve('pdfjs-dist/package.json'));
    const data = await readFile(join(root, directory, file));
    const type = file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
