import { test, expect } from "@playwright/test";
test("routes, filters, favorites, sheet and persistence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#catalog .job")).toHaveCount(6);
  await page.locator("#f-q").fill("бариста");
  await expect(page.locator("#catalog .job")).toHaveCount(1);
  await page.locator("#catalog .save").click();
  await page.locator("#catalog .job__open").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Как у работодателя" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/#/saved");
  await expect(page.locator(".saved .job")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".saved .job")).toHaveCount(1);
  await page.locator(".saved .save").click();
  await expect(page.locator(".saved .job")).toHaveCount(0);
  await expect(
    page.getByText("Здесь будут сохранённые вакансии"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("matching, demo profile and theme", async ({ page }) => {
  await page.goto("/#/match");
  await page.getByRole("button", { name: "Школьник, люблю технику" }).click();
  await page
    .getByRole("button", { name: "Подобрать профессии", exact: true })
    .click();
  await expect(page.locator(".direction")).toHaveCount(3);
  await page.goto("/#/account");
  await page.locator("#auth-name").fill("Анна");
  await page.locator("#auth-email").fill("anna@example.org");
  await page.locator("#auth-password").fill("password12345");
  await page.getByRole("button", { name: "Создать профиль" }).click();
  await expect(page.locator(".member .page-title")).toHaveText("Анна");
  await page.locator("#theme-toggle").click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
  await expect(page.locator(".member .page-title")).toHaveText("Анна");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "password12345",
  );
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.body.clientWidth),
  );
});
