import { test, expect } from '@playwright/test';

for (const width of [320, 375, 768, 1280]) {
  test(`catalog empty state at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const empty = page.locator('.catalog-empty');
    await expect(page.locator('#catalog .job').first()).toBeVisible();
    await expect(empty).toHaveCount(0);
    await page.locator('#f-q').fill('no-matching-vacancy-123456');
    await expect(empty.locator('h3')).toHaveText('Вакансии не найдены');
    await expect(empty.locator('p')).toHaveText('Попробуйте изменить запрос или сбросить фильтры.');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const img = empty.locator('img');
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const layout = await img.evaluate(el => {
        const r = el.getBoundingClientRect();
        const results = el.closest('.results')!.getBoundingClientRect();
        return { width: r.width, ratio: r.width / r.height,
          offset: Math.abs(r.x + r.width / 2 - results.x - results.width / 2),
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(layout.width).toBe(width <= 720 ? 240 : 290);
      expect(layout.ratio).toBeCloseTo(4 / 3);
      expect(layout.offset).toBeLessThan(1);
      expect(layout.overflow).toBe(false);
      await empty.screenshot({ path: `test-results/catalog-empty-${width}-${theme}.png` });
    }
    await page.locator('#catalog button[type=reset]').click();
    await expect(empty).toHaveCount(0);
    // Simulate an initially empty catalog without changing production data.
    await page.evaluate(() => {
      const app = (document.querySelector('#app') as any).__vue_app__;
      app.config.globalProperties.$pinia._s.get('catalog').jobs = [];
    });
    await expect(empty.locator('h3')).toHaveText('Пока нет вакансий');
    await expect(empty.locator('p')).toHaveText('Здесь появятся новые предложения.');
  });
}
