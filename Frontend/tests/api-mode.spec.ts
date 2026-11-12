import { test, expect } from "@playwright/test";
test("API mode preserves routes and exposes connection failure without mock fallback", async ({ page }) => {
  test.skip(!test.info().config.configFile?.endsWith("playwright.api.config.ts"));
  await page.route("**/api/health", route => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/ready", route => route.fulfill({ status: 503, json: { status: "unavailable", database: "error" } }));
  await page.goto("/");
  await expect(page.getByRole("dialog")).toContainText("503");
  await expect(page.locator('[data-view="home"]')).toBeVisible();
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await page.goto("/#/saved");
  await expect(page.locator("h1")).toHaveText("Избранное");
  await page.goto("/#/account");
  await expect(page.getByText("Express API · предварительная интеграция")).toHaveCount(0);
});
