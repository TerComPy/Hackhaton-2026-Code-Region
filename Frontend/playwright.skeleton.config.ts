import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests', testMatch: 'catalog-skeleton.spec.ts',
 use: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined, baseURL: 'http://127.0.0.1:5193' },
 webServer: { command: 'npm run dev -- --port 5193 --strictPort', url: 'http://127.0.0.1:5193', env: { VITE_DATA_MODE: 'api' } },
 projects: [375, 1440].flatMap(width => ['light', 'dark'].flatMap(colorScheme => ['reduce', 'no-preference'].map(reducedMotion => ({ name: `${width}-${colorScheme}-${reducedMotion}`, use: { viewport: { width, height: 900 }, colorScheme: colorScheme as 'light' | 'dark', reducedMotion: reducedMotion as 'reduce' | 'no-preference' } })))),
});
