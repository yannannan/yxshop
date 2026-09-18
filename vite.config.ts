import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  ssr: { external: ['mysql2', 'mysql2/promise', 'nodemailer'] },
  plugins: [vinext()],
});
