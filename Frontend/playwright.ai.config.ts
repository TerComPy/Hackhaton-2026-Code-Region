import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["ai-summary-ui.spec.ts"],
  use: { baseURL: "http://127.0.0.1:5198", browserName: "chromium", headless: true },
  webServer: {
    command: "npm run dev -- --port 5198 --strictPort",
    url: "http://127.0.0.1:5198",
    env: { VITE_DATA_MODE: "api" },
    reuseExistingServer: !process.env.CI
  }
});
