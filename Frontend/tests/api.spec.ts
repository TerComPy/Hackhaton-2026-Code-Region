import { test, expect } from "@playwright/test";
test("API adapter preserves IDs, bearer, 204 and structured errors", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    expect(req.headers()["authorization"]).toBe("Bearer test-token");
    if (req.method() === "PUT") return route.fulfill({ status: 204 });
    if (req.url().includes("/vacancies/"))
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Требуется вход" },
        }),
      });
    return route.fulfill({
      json: {
        items: [
          { id: "9007199254740993", title: "Тест", salary_min: "123456.78" },
        ],
        page: 1,
        pageSize: 20,
      },
    });
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createApi } = await import("/src/shared/api.ts");
    const api = createApi("", () => "test-token");
    const list = await api.vacancies({
      search: "тест",
      onlyNoExperience: true,
    });
    const saved = await api.save("9007199254740993");
    let error;
    try {
      await api.vacancy("1");
    } catch (e) {
      error = { status: e.status, code: e.code, message: e.message };
    }
    return {
      id: list.items[0].id,
      salary: list.items[0].salary_min,
      saved,
      error,
    };
  });
  expect(result).toEqual({
    id: "9007199254740993",
    salary: "123456.78",
    saved: undefined,
    error: { status: 401, code: "UNAUTHORIZED", message: "Требуется вход" },
  });
});
