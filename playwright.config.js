import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  use: {
    baseURL: process.env.LEXICA_TEST_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.LEXICA_TEST_URL ? 'pnpm preview --host 127.0.0.1 --port 4173' : 'pnpm dev',
    url: process.env.LEXICA_TEST_URL || 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
