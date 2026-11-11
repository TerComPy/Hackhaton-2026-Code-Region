import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:5186",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: "npm run dev -- --port 5186",
    url: "http://127.0.0.1:5186",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop-laptop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "desktop-large", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "desktop-small", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-small", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
