import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          // Cache UI libraries separately; arrangement stays behind its dynamic import.
          if (
            /\/node_modules\/(?:react|react-dom|scheduler|@radix-ui|zustand|@tanstack|lucide-react)(?:\/|$)/.test(
              id.replaceAll('\\', '/'),
            )
          )
            return 'ui-vendor';
        },
      },
    },
  },
});
