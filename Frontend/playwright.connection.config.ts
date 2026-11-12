import { defineConfig } from '@playwright/test';
const api = process.env.UI_DATA_MODE !== 'mock';
export default defineConfig({
  testDir: './tests', testMatch: 'connection-catalog-ui.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5197', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: 'npm run dev -- --port 5197 --strictPort', url: 'http://127.0.0.1:5197', env: { VITE_DATA_MODE: api ? 'api' : 'mock' } },
  projects: [
    { name: 'desktop-light', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    { name: 'mobile-light', use: { viewport: { width: 320, height: 740 }, colorScheme: 'light', isMobile: true } },
    { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true } },
  ],
});
