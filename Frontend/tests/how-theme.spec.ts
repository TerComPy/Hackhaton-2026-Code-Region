import { test, expect } from '@playwright/test';

test('how scene follows theme through scroll stages', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('starter.theme', JSON.stringify('dark')));
  await page.goto('/');
  const section = page.locator('#how');
  const track = page.locator('#how-track');
  await expect(section).toHaveCSS('background-color', 'rgb(26, 26, 24)');
  await expect(page.locator('.how__sticky')).toHaveCSS('position', 'sticky');
  for (const [progress, step] of [[0, 0], [.3, 1], [.45, 1], [.8, 2]] as const) {
    await track.evaluate((el, p) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + (el.clientHeight - innerHeight) * p), progress);
    await expect(page.locator('.step.is-active .step__btn')).toHaveAttribute('data-step', String(step));
    // Allow the existing inertial scroll and step transitions to settle.
    await expect.poll(() => track.evaluate(el => Number(getComputedStyle(el.querySelector('.how__progress')!).getPropertyValue('--p')))).toBeCloseTo(progress, 2);
    await page.locator('#theme-toggle').evaluate((el: HTMLElement) => el.click());
    await expect(section).toHaveCSS('background-color', 'rgb(232, 229, 223)');
    await expect(page.locator('.step.is-active .step__btn')).toHaveCSS('color', 'rgb(20, 20, 19)');
    await expect(page.locator('.step:not(.is-active) .step__btn').first()).toHaveCSS('color', 'rgb(107, 104, 98)');
    await expect(page.locator('.src-card').first()).toHaveCSS('background-color', 'rgb(251, 250, 247)');
    await expect(page.locator('.doc__front')).toHaveCSS('color', 'rgb(20, 20, 19)');
    if (progress === .8) await expect(page.locator('#fit-note')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `test-results/how-${info.project.name}-${step}-${progress}-light.png` });
    await page.locator('#theme-toggle').evaluate((el: HTMLElement) => el.click());
    await expect(section).toHaveCSS('background-color', 'rgb(26, 26, 24)');
    await expect(page.locator('.src-card').first()).toHaveCSS('background-color', 'rgb(233, 230, 223)');
    await expect(page.locator('.step.is-active .step__btn')).toHaveCSS('color', 'rgb(237, 235, 229)');
    await expect(page.locator('#doc')).not.toHaveCSS('transform', 'none');
    await expect.poll(() => track.evaluate(el => Number(getComputedStyle(el.querySelector('.how__progress')!).getPropertyValue('--p')))).toBeCloseTo(progress, 2);
    await page.screenshot({ path: `test-results/how-${info.project.name}-${step}-${progress}-dark.png` });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
