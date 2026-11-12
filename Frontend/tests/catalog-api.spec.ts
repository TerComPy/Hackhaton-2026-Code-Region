import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
test("empty state excludes loading and API errors", async ({ page }) => {
  test.skip(!test.info().config.configFile?.endsWith("api.config.ts"));
  await page.route("**/api/health", r => r.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/ready", r => r.fulfill({ json: { status: "ready", database: "ok" } }));
  const user = { id: 'test', profileId: 'test', email: 'test@example.invalid', displayName: 'Test', role: 'user' };
  const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.route("**/api/favorites?*", r => r.fulfill({ json: { items: [], page: 1, pageSize: 20 } }));
  await page.route("**/api/auth/login", r => r.fulfill({ json: { user, accessToken: token } }));
  await page.route("**/api/auth/me", r => r.fulfill({ json: { user } }));
  await page.route("**/api/profile", r => r.fulfill({ json: { profile: { id: 'test', displayName: 'Test', city: null } } }));
  await page.route("**/api/vacancies?*", async r => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await r.fulfill({ json: { items: [], page: 1, pageSize: 6 } });
  });
  await page.goto('/');
  const empty = page.locator('.catalog-empty');
  await expect(empty).toHaveCount(0);
  await page.evaluate(async () => {
    const session = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('session');
    await session.authenticate('login', { email: 'test@example.invalid', password: 'test-password' });
  });
  await expect(page.locator('#catalog .job--skeleton')).toHaveCount(6);
  await expect(page.locator('#catalog [role=status]')).toHaveText('Загружаем вакансии');
  await expect(empty).toHaveCount(0);
  await expect(empty.locator('h3')).toHaveText('Пока нет вакансий');
  await expect(page.locator('.job--skeleton')).toHaveCount(0);
  await page.locator('#f-q').fill('empty');
  await expect(empty.locator('h3')).toHaveText('Вакансии не найдены');
  await page.route("**/api/vacancies?*", r => r.fulfill({ status: 500, json: {} }));
  await page.locator('#f-q').fill('failure');
  await expect(page.locator('#catalog [role=alert]')).toBeVisible();
  await expect(page.locator('.job--skeleton')).toHaveCount(0);
  await expect(empty).toHaveCount(0);
});
test("real catalog: JWT, seed, filters, pagination, failures and retry", async ({ page }) => {
  test.skip(!test.info().config.configFile?.endsWith("playwright.api.config.ts"));
  await page.goto("/#/account");
  await page.locator("#auth-name").fill("Catalog E2E");
  await page.locator("#auth-email").fill(`catalog-${randomBytes(6).toString("hex")}@example.invalid`);
  await page.locator("#auth-password").fill("catalog-e2e-password");
  await page.locator(".auth-submit").click();
  await expect(page.locator(".member")).toBeVisible();
  const response = page.waitForResponse(r => r.url().includes("/api/vacancies?"));
  await page.goto("/");
  const first = await response;
  expect(first.status()).toBe(200);
  expect(first.request().headers().authorization).toMatch(/^Bearer /);
  const payload = await first.json();
  expect(payload.items.length).toBeGreaterThan(0);
  await expect(page.locator("#catalog .job")).toHaveCount(payload.items.length);
  for (const item of payload.items) {
    expect(typeof item.id).toBe("string");
    await expect(page.locator(`[data-vacancy-id="${item.id}"]`)).toContainText(item.title);
  }
  if (payload.items.length === 6) {
    const next = page.waitForResponse(r => new URL(r.url()).searchParams.get("page") === "2");
    await page.locator("#catalog").getByRole("button", { name: "Показать ещё" }).click();
    expect((await next).status()).toBe(200);
    const ids = await page.locator("[data-vacancy-id]").evaluateAll(ns => ns.map(n => n.getAttribute("data-vacancy-id")));
    expect(new Set(ids).size).toBe(ids.length);
  }
  for (const [selector, value, param] of [["#f-q", "инженер", "search"], ["#f-city", "Москва", "city"]]) {
    const sent = page.waitForRequest(r => new URL(r.url()).searchParams.get(param!) === value);
    await page.locator(selector!).fill(value!);
    expect(new URL((await sent).url()).searchParams.get("page")).toBe("1");
  }
  const format = page.waitForRequest(r => new URL(r.url()).searchParams.get("workFormat") === "remote");
  await page.locator("#catalog").getByLabel("Удалённо", { exact: true }).check();
  await format;
  const salary = page.waitForRequest(r => new URL(r.url()).searchParams.get("minSalary") === "70000");
  await page.locator("#f-salary").selectOption("70000");
  await salary;
  const experience = page.waitForRequest(r => new URL(r.url()).searchParams.get("onlyNoExperience") === "true");
  await page.getByLabel("Можно без опыта").check();
  await experience;
  await page.route("**/api/vacancies?*", r => r.abort("connectionrefused"));
  await page.locator("#f-q").fill("offline");
  await expect(page.locator("#catalog [role=alert]")).toContainText("Не удалось");
  await expect(page.locator("#catalog .job")).toHaveCount(0);
  await page.route("**/api/vacancies?*", r => r.fulfill({ json: { items: [{ id: "9007199254740993123", title: "Точность DTO", salary_min: "9007199254740993.01", salary_max: null, currency: "RUB", work_format: "unknown" }], page: 1, pageSize: 6 } }));
  await page.locator("#catalog").getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator('[data-vacancy-id="9007199254740993123"]')).toContainText("9 007 199 254 740 993,01");
  await page.route("**/api/vacancies?*", r => r.fulfill({ json: { items: [], page: 1, pageSize: 6 } }));
  await page.locator("#f-q").fill("empty");
  await expect(page.locator("#catalog")).toContainText("Вакансии не найдены");
  await page.route("**/api/vacancies?*", r => r.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }));
  await page.locator("#f-q").fill("unauthorized");
  await expect(page.locator("#catalog")).toContainText("войдите в аккаунт");
  expect(await page.evaluate(() => sessionStorage.getItem("starter.api.accessToken"))).toBeNull();
});
