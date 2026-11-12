import { test, expect } from "@playwright/test";
import { catalog } from "../src/entities/catalog";
for (const width of [375, 768, 1280]) for (const theme of ["light", "dark"]) {
  test(`ring focus ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator("html").evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    const cards = page.locator("#ring .ring__card");
    await expect(cards).toHaveCount(10);
    for (const card of await cards.all()) {
      const title = await card.getAttribute("aria-label");
      const focus = catalog.jobs.find(j => j.title === title)?.focus ?? [0.5, 0.5];
      const images = card.locator("img");
      await expect(images).toHaveCount(2);
      for (const img of await images.all()) {
        await expect(img).toHaveCSS("object-position", `${focus[0] * 100}% ${focus[1] * 100}%`);
        await expect(img).toHaveCSS("object-fit", "cover");
        const url = new URL((await img.getAttribute("src"))!);
        expect(url.searchParams.has("h")).toBe(false);
        expect(Number(url.searchParams.get("w"))).toBeGreaterThanOrEqual(832);
      }
      expect(await images.first().getAttribute("src")).toBe(await images.last().getAttribute("src"));
    }
  });
}
