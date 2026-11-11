import { test, expect } from '@playwright/test';

for (const width of [320, 375, 768, 1280]) {
  test(`branding and reactive theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('starter.theme', JSON.stringify('light')));
    await page.goto('/#/');
    await page.evaluate(() => { (window as any).__brandingPage = true; });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('#theme-toggle').click();
      await expect(page.locator('.topbar .logo img')).toHaveAttribute('src', `/images/branding/starter-wordmark-on-${theme}.webp`);
      const cat = page.locator('.footer__cat');
      await cat.scrollIntoViewIfNeeded();
      await expect.poll(() => cat.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const layout = await cat.evaluate(img => {
        const r = img.getBoundingClientRect(), footer = img.closest('footer')!;
        const bottom = footer.querySelector('.footer__bottom')!.getBoundingClientRect();
        return { height: r.height, clear: r.top >= bottom.bottom, right: r.right, bottom: r.bottom, footerBottom: footer.getBoundingClientRect().bottom, pointer: getComputedStyle(img).pointerEvents, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(layout.height).toBe(width <= 720 ? 100 : 150);
      expect(layout.clear).toBe(true);
      expect(layout.overflow).toBe(false);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.bottom).toBe(layout.footerBottom);
      expect(layout.pointer).toBe('none');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      if (width <= 720) {
        await expect.poll(() => cat.evaluate(el => {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
          // Allow the nav border and fractional scroll rounding.
          return el.getBoundingClientRect().bottom <= document.querySelector('.nav')!.getBoundingClientRect().top + 2;
        })).toBe(true);
      }
      await page.screenshot({ path: `docs/branding/footer-${width}-${theme}.png` });
    }
    await page.locator('.topbar a[href="#/account"]').click();
    await expect(page.locator('.footer__cat')).toHaveCount(0);
    for (const mode of ['register', 'login']) {
      if (mode === 'login') await page.locator('.auth-switch button').click();
      for (const theme of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
        const img = page.locator('.auth-brand img');
        await expect(img).toHaveAttribute('src', `/images/branding/starter-cat-outline-on-${theme}.webp`);
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
        expect(await img.evaluate(el => el.getBoundingClientRect().height)).toBe(28);
        const centered = await img.evaluate(el => {
          const r = el.getBoundingClientRect(), p = el.closest('.auth-content')!.getBoundingClientRect();
          return Math.abs(r.x + r.width / 2 - p.x - p.width / 2) < 1;
        });
        expect(centered).toBe(true);
        await expect(page.locator('.auth-content img[src*=wordmark]')).toHaveCount(0);
        expect(await page.evaluate(() => (window as any).__brandingPage)).toBe(true);
      }
    }
  });
}
