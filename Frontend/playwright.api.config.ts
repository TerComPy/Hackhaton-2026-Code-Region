import { defineConfig } from "@playwright/test";
const port = Number(process.env.PLAYWRIGHT_API_PORT || 5190);
export default defineConfig({
  testDir: "./tests",
  testMatch: ["api-mode.spec.ts", "auth-real.spec.ts", "catalog-api.spec.ts", "details-api.spec.ts", "favorites-profile-api.spec.ts", "ai-summary-ui.spec.ts"],
  use: { baseURL: `http://127.0.0.1:${port}`, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    env: { VITE_DATA_MODE: "api" },
  },
});
