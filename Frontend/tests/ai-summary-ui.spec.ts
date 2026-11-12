import { test, expect, type Page, type Route } from "@playwright/test";

test.beforeEach(() => {
  const config = test.info().config.configFile ?? "";
  test.skip(
    !config.endsWith("playwright.ai.config.ts") && !config.endsWith("playwright.api.config.ts"),
    "AI summaries require VITE_DATA_MODE=api"
  );
});

const vacancy = {
  id: "4", title: "Инженер технической поддержки", company_name: "Тестовая компания",
  city: "Москва", status: "active", work_format: "remote",
  salary_min: "60000.00", salary_max: null, currency: "RUB", salary_period: "month",
  salary_gross: null, original_url: "https://example.com/jobs/4", source_name: "Тестовый источник",
  description: "Техническая поддержка пользователей",
  requirements: "Опыт общения с людьми", responsibilities: "Отвечать на вопросы пользователей",
  schedule_text: null, schedule_type: "five_two", experience_months_min: 0
};
const simple = {
  simpleTitle: "Помощник пользователей",
  whatYouDo: ["Отвечать на вопросы пользователей"],
  requirements: ["Опыт общения с людьми"],
  conditions: ["Удалённо"],
  beginnerFriendly: true
};
type State = "unavailable" | "pending" | "processing" | "done" | "failed";
const reply = (status: State) => ({
  status, display: status === "done" ? "ai" : "original",
  summary: status === "done" ? simple : null
});
const token = "e30." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url") + ".test";

async function prepare(page: Page, response: (route: Route, calls: { gets: number; posts: number }) => Promise<void> | void) {
  const calls = { gets: 0, posts: 0 };
  await page.addInitScript(value => {
    sessionStorage.setItem("starter.api.accessToken", value);
  }, token);
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/health") return route.fulfill({ json: { status: "ok" } });
    if (path === "/api/ready") return route.fulfill({ json: { status: "ready", database: "ok" } });
    if (path === "/api/auth/me") return route.fulfill({ json: {
      user: { id: "fixture-account", profileId: "10", email: "fixture@example.invalid",
        displayName: "Fixture", role: "user" }
    } });
    if (path === "/api/profile") return route.fulfill({ json: {
      profile: { id: "10", displayName: "Fixture", city: "Москва" }
    } });
    if (path === "/api/favorites") return route.fulfill({ json: { items: [], page: 1, pageSize: 20 } });
    if (path === "/api/vacancies") return route.fulfill({ json: { items: [vacancy], page: 1, pageSize: 6 } });
    if (path === "/api/vacancies/4") return route.fulfill({ json: { vacancy, skills: [] } });
    if (path === "/api/vacancies/4/summary") {
      if (request.method() === "POST") calls.posts++;
      else calls.gets++;
      expect(request.headers().authorization).toBe("Bearer " + token);
      return response(route, calls);
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Fixture only" } } });
  });
  await page.goto("/");
  await expect(page.locator("#catalog .job__open")).toHaveCount(1);
  await page.locator("#catalog .job__open").click();
  await expect(page.locator(".sheet__panel")).toHaveCSS("opacity", "1");
  await expect(page.locator("dialog")).toContainText("Отвечать на вопросы пользователей");
  return calls;
}

test("on-demand AI generation polls the worker; source text remains available", async ({ page }) => {
  const calls = await prepare(page, (route, count) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 202, json: reply("pending") });
    return route.fulfill({ json: reply(count.gets === 1 ? "unavailable" : count.gets === 2 ? "processing" : "done") });
  });
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "original");
  expect(calls.posts).toBe(0);
  await page.getByRole("button", { name: "Простыми словами" }).click();
  await expect(page.locator("dialog [role=status]")).toContainText("ИИ готовит");
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "plain", { timeout: 12000 });
  await expect(page.locator(".sheet__simple-title")).toContainText("Помощник пользователей");
  await expect(page.locator(".sheet__beginner")).toContainText("без опыта");
  expect(calls.posts).toBe(1);
  expect(calls.gets).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Как у работодателя" }).click();
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "original");
  await expect(page.locator("dialog")).toContainText("Техническая поддержка пользователей");
});

test("cached AI summary is available without a new POST", async ({ page }) => {
  const calls = await prepare(page, route => route.fulfill({ json: reply("done") }));
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-ai-status", "done");
  await page.getByRole("button", { name: "Простыми словами" }).click();
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "plain");
  expect(calls.posts).toBe(0);
});

test("provider unavailable keeps original and can retry without mock text", async ({ page }) => {
  let configured = false;
  const calls = await prepare(page, route => {
    if (route.request().method() === "POST") {
      return configured
        ? route.fulfill({ json: reply("done") })
        : route.fulfill({ status: 503, json: { error: { code: "AI_NOT_CONFIGURED" } } });
    }
    return route.fulfill({ json: reply("unavailable") });
  });
  await page.getByRole("button", { name: "Простыми словами" }).click();
  await expect(page.locator("dialog [role=alert]")).toContainText("ИИ пока не настроен");
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "original");
  await expect(page.locator("dialog")).toContainText("Техническая поддержка пользователей");
  configured = true;
  await page.locator(".sheet__ai-feedback").getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "plain");
  expect(calls.posts).toBe(2);
});

test("closing the sheet prevents further polling and leaves no stale modal", async ({ page }) => {
  const calls = await prepare(page, (route, count) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 202, json: reply("pending") });
    return route.fulfill({ json: reply(count.gets === 1 ? "unavailable" : "processing") });
  });
  await page.getByRole("button", { name: "Простыми словами" }).click();
  await expect(page.locator("dialog [role=status]")).toContainText("ИИ готовит");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  const before = calls.gets;
  await page.waitForTimeout(1900);
  expect(calls.gets).toBe(before);
});

test("a session change invalidates the cached AI summary", async ({ page }) => {
  await prepare(page, route => route.fulfill({ json: reply("done") }));
  await page.getByRole("button", { name: "Простыми словами" }).click();
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "plain");
  await page.evaluate(async () => {
    const { useSession } = await import("/src/entities/session.ts");
    useSession().clear();
  });
  await expect(page.locator(".sheet__api-flip")).toHaveAttribute("data-mode", "original");
  await expect(page.locator(".sheet__simple-title")).toHaveCount(0);
});

test('generation shimmer blocks duplicates and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let done = false;
  const calls = await prepare(page, (route, count) => route.fulfill({ json: reply(
    route.request().method() === 'POST' ? 'pending' : count.gets === 1 ? 'unavailable' : done ? 'done' : 'processing'
  ) }));
  const button = page.locator('button[data-mode=plain]');
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-busy', 'false');
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.sheet__ai-note')).toHaveClass(/ai-shimmer/);
  await button.evaluate((node: HTMLButtonElement) => { node.click(); node.click(); });
  expect(calls.posts).toBe(1);
  await expect(page.locator('button[data-mode=original]')).toBeEnabled();
  await expect(page.locator('.sheet__api-flip')).toHaveAttribute('data-mode', 'original');
  done = true;
  await expect(button).toBeEnabled({ timeout: 12000 });
  await expect(button).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.sheet__api-flip')).toHaveAttribute('data-mode', 'plain');
});
