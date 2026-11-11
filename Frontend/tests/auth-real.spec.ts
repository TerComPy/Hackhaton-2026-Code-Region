import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
test.beforeEach(() => {
  test.skip(!test.info().config.configFile?.endsWith("playwright.api.config.ts"), "Requires API-mode Vite server");
});
const key = "starter.api.accessToken";
async function screenshot(page: Page, path: string) {
  // Dismiss only the local antivirus balloon; the app DOM/styles stay untouched.
  for (const frame of page.frames().filter(f => f.url().includes("kaspersky-labs.com"))) {
    const close = frame.locator("#closeButton");
    if (await close.isVisible()) {
      await close.click();
      await page.waitForTimeout(500); // Antivirus balloon closes asynchronously.
    }
  }
  await page.screenshot({ path, fullPage: true });
}
test("real registration, conflict, login, reload, JWT expiry and client logout", async ({ page, request }) => {
  const email = `auth-e2e-${randomBytes(6).toString("hex")}@example.invalid`;
  const password = randomBytes(4).toString("hex"); // Exactly 8: API minimum.
  const messages: string[] = [];
  page.on("console", event => messages.push(event.text()));
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("starter.saved", "[1,2]");
    localStorage.setItem("starter.vue.user", JSON.stringify({ name: "Demo", email: "demo@example.invalid" }));
  });
  await page.goto("/#/account");
  await expect(page.locator(".auth__note")).not.toContainText("Демо");
  await page.locator("#auth-name").fill("TEST FIXTURE API Auth");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  const register = page.waitForResponse(r => r.url().endsWith("/api/auth/register"));
  await page.locator(".auth-submit").click();
  expect((await register).status()).toBe(201);
  await expect(page.locator(".member__email")).toHaveText(email);
  await expect(page.locator(".member h1")).toHaveText("TEST FIXTURE API Auth");
  await expect(page.locator("#account-label")).toHaveText("TEST FIXTURE API Auth");
  await expect(page.locator("#saved-count")).toHaveText("0");
  await page.locator(".member h1").click();
  await page.keyboard.press("Escape");
  await screenshot(page, "docs/auth-real/profile-desktop.png");
  const stored = await page.evaluate(() => ({ token: sessionStorage.getItem("starter.api.accessToken"), local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(!!stored.token).toBe(true);
  expect(stored.local.includes(stored.token!)).toBe(false);
  expect(stored.session.includes(password)).toBe(false);
  const me = page.waitForResponse(r => r.url().endsWith("/api/auth/me"));
  const profile = page.waitForResponse(r => r.url().endsWith("/api/profile"));
  await page.reload();
  expect((await me).status()).toBe(200);
  expect((await profile).status()).toBe(200);
  await expect(page.locator(".member__email")).toHaveText(email);
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBeNull();
  await page.reload();
  await expect(page.locator("#auth-name")).toBeVisible();
  await page.locator("#auth-name").fill("TEST FIXTURE duplicate");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  const duplicate = page.waitForResponse(r => r.url().endsWith("/api/auth/register"));
  await page.locator(".auth-submit").click();
  expect((await duplicate).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("уже зарегистрирован");
  await page.getByRole("button", { name: "Вход", exact: true }).click();
  await page.locator("#auth-password").fill("wrong-password");
  const wrong = page.waitForResponse(r => r.url().endsWith("/api/auth/login"));
  await page.locator(".auth-submit").click();
  expect((await wrong).status()).toBe(401);
  await expect(page.getByRole("alert")).toContainText("Неверный");
  await page.locator(".auth-heading h1").click();
  await page.keyboard.press("Escape");
  await screenshot(page, "docs/auth-real/login-error-desktop.png");
  await page.locator("#auth-password").fill(password);
  const login = page.waitForResponse(r => r.url().endsWith("/api/auth/login"));
  await page.locator(".auth-submit").click();
  expect((await login).status()).toBe(200);
  await expect(page.locator(".member__email")).toHaveText(email);
  await page.clock.fastForward(3601000);
  await expect(page.getByRole("alert")).toContainText("истекла");
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBeNull();
  expect((await request.get("/api/auth/me")).status()).toBe(401);
  expect((await request.post("/api/auth/login", { data: { email, password: "short" } })).status()).toBe(400);
  expect(messages.some(m => m.includes(password) || m.includes(stored.token!))).toBe(false);
});

test("invalid stored JWT clears the session via real 401", async ({ page }) => {
  const invalid = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.invalid`;
  await page.addInitScript(({ key, invalid }) => sessionStorage.setItem(key, invalid), { key, invalid });
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/me"));
  await page.goto("/#/account");
  expect((await response).status()).toBe(401);
  await expect(page.getByRole("alert")).toContainText("недействительна");
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBeNull();
});

for (const failure of ["network", "timeout"] as const) {
  test(`connection ${failure} never authenticates a demo user`, async ({ page }) => {
    await page.route("**/api/auth/login", async route => {
      if (failure === "network") await route.abort("connectionrefused");
      else {
        // Exercise the actual client timeout, then release the intercepted request.
        await new Promise(resolve => setTimeout(resolve, 11000));
        await route.abort().catch(() => {});
      }
    });
    await page.goto("/#/account");
    await page.getByRole("button", { name: "Вход", exact: true }).click();
    await page.locator("#auth-email").fill("offline-fixture@example.invalid");
    await page.locator("#auth-password").fill("offline-fixture-password");
    await page.locator(".auth-submit").click();
    await expect(page.getByRole("alert")).toContainText(failure === "network" ? "подключиться" : "вовремя", { timeout: 15000 });
    await expect(page.locator(".member")).toHaveCount(0);
    expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBeNull();
    if (failure === "network") {
      await page.setViewportSize({ width: 390, height: 844 });
      await screenshot(page, "docs/auth-real/connection-error-mobile.png");
    }
  });
}
