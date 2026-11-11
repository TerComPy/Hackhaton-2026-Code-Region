import { expect, test } from '@playwright/test';

for (const width of [375, 1280]) {
  test(`home entrance and theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() =>
      localStorage.setItem('starter.theme', JSON.stringify('light')),
    );
    await page.goto('/#/');

    await expect(page.locator('#hero-title .hero__line')).toHaveText([
      'Вакансии',
      /со.всей сети —/,
      'без канцелярита.',
    ]);
    await expect(page.locator('#sources li')).toHaveText([
      'Работа России', 'hh.ru', 'SuperJob',
    ]);
    await expect(page.locator('#sources')).not.toContainText('Демо-каталог');

    const motion = await page.evaluate((viewportWidth) => {
      const style = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!);
      return {
        header: style(viewportWidth < 721 ? '.topbar .logo' : '.topbar').animationName,
        title: style('#hero-title .hero__line').animationName,
        titleDelays: [...document.querySelectorAll('#hero-title .hero__line')]
          .map(el => Number.parseFloat(getComputedStyle(el).animationDelay)),
        link: style('.hero__alt').animationName,
        source: style('#sources li').animationName,
        sourceDelays: [...document.querySelectorAll('#sources li')]
          .map(el => Number.parseFloat(getComputedStyle(el).animationDelay)),
      };
    }, width);
    expect(motion.header).toBe('home-header-in');
    expect(motion.title).toBe('home-line-in');
    expect(motion.titleDelays).toEqual([0.26, 0.42, 0.58]);
    expect(motion.link).toBe('home-link-in');
    expect(motion.source).toBe('home-source-in');
    expect(motion.sourceDelays).toEqual([1.6, 1.72, 1.84]);

    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(241, 239, 234)');
    await expect(page.locator('#how')).toHaveCSS('background-color', 'rgb(232, 229, 223)');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('#how')).toHaveCSS('background-color', 'rgb(26, 26, 24)');

    // The header must not trap fixed mobile navigation inside a transformed ancestor.
    await expect(page.locator('.topbar')).toHaveCSS('transform', 'none', { timeout: 3000 });
    if (width < 721) {
      const bottomGap = await page.locator('.nav')
        .evaluate(el => Math.abs(el.getBoundingClientRect().bottom - innerHeight));
      expect(bottomGap).toBeLessThan(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('reduced motion does not animate home elements', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/');
  for (const selector of [
    '.topbar', '.topbar .logo', '#hero-title .hero__line',
    '.hero__alt', '#sources li',
  ]) {
    await expect(page.locator(selector).first()).toHaveCSS('animation-name', 'none');
  }
});
