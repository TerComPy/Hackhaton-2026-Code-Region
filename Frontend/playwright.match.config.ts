import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: ['matching-api-ui.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:5199', browserName: 'chromium', headless: true },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    env: { VITE_DATA_MODE: 'api' },
    reuseExistingServer: !process.env.CI
  }
});
