import { test, expect } from '@playwright/test';
for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`sheet animation and repeated closing ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    const original = await page.locator('body').evaluate(e => e.style.overflow);
    for (const method of ['button', 'escape', 'backdrop', 'button']) {
      await page.locator('#catalog .job__open').first().click();
      const panel = page.locator('.sheet__panel');
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(panel).toHaveCSS('transform', 'none');
      const b = (await panel.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(b.x).toBeGreaterThanOrEqual(-1);
      expect(b.y).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
      if (method === 'button') await page.locator('.sheet__bar button').click();
      if (method === 'escape') await page.keyboard.press('Escape');
      if (method === 'backdrop') await page.mouse.click(b.x > 10 ? b.x / 2 : 5, b.y > 10 ? b.y / 2 : 5);
      if (reducedMotion === 'no-preference') {
        await expect(page.locator('dialog')).toHaveCount(1);
        await expect(page.locator('dialog')).not.toHaveClass(/is-open/);
      }
      await expect(page.locator('dialog')).toHaveCount(0);
      expect(await page.locator('body').evaluate(e => e.style.overflow)).toBe(original);
    }
    expect(errors).toEqual([]);
  });
}
