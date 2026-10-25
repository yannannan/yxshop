import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  // Cheerio's encoding dependencies require Node's CommonJS loader. Vinext's
  // development wrapper redeclares iconv-lite's local `module` variable.
  ssr: { external: ['mysql2', 'mysql2/promise', 'nodemailer', '@resvg/resvg-wasm', 'ali-oss', 'cheerio'] },
  plugins: [vinext()],
});
