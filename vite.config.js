import {defineConfig} from 'vite';

export default defineConfig({
  root: 'dist',
  server: {host: '127.0.0.1', port: 5173, strictPort: true},
  build: {outDir: '../build', emptyOutDir: true},
});
