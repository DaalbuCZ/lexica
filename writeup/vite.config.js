import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        writeup: fileURLToPath(new URL('index.html', import.meta.url)),
        implementation: fileURLToPath(new URL('implementation.html', import.meta.url)),
      },
    },
  },
});
