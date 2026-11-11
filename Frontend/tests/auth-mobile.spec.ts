import { test, expect } from '@playwright/test';
import { dismissExternalPasswordBalloon } from './support/kaspersky';
for (const width of [320, 375, 390]) for (const theme of ['light', 'dark']) {
  test(`auth mobile ${width}px ${theme}`, async ({ page }, info) => {
    const settle = await dismissExternalPasswordBalloon(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 812 });
    await page.addInitScript(t => localStorage.setItem('starter.theme', JSON.stringify(t)), theme);
    await page.goto('/#/account');
    await page.locator('#auth-name').waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Unmask any overflow: the production stylesheet predates this task and
    // includes body overflow-x:clip. The regression must not rely on it.
    await page.addStyleTag({ content: 'body { overflow-x: visible !important; }' });
    const evidence: unknown[] = [];
    for (const mode of ['register', 'login']) {
      if (mode === 'login') { await page.locator('#auth-password').blur(); await settle(); await page.locator('.auth-switch button').click(); }
      for (const state of ['initial', 'required', 'error']) {
        if (state === 'required') await page.locator('.auth-submit').click();
        if (state === 'error') {
          if (mode === 'register') await page.locator('#auth-name').fill('   ');
          await page.locator('#auth-email').fill('qa@example.org');
          await page.locator('#auth-password').fill('password12345');
          await page.locator('#auth-password').fill('');
          await page.locator('.auth').evaluate((form: HTMLFormElement) => { form.noValidate = true; form.requestSubmit(); });
          await expect(page.getByRole('alert')).not.toBeEmpty();
        }
        await settle();
        await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        const measurement = await page.evaluate(() => ({
          viewport: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.scrollingElement!.scrollWidth,
          elements: [...document.querySelectorAll('.account, .auth-content, .auth, .auth .field, .auth .input, .input-wrap')].map(e => {
            const s = getComputedStyle(e);
            return { tag: e.tagName, id: e.id, class: e.className, rect: e.getBoundingClientRect().toJSON(), styles: { width: s.width, minWidth: s.minWidth, display: s.display, padding: s.padding, boxSizing: s.boxSizing, overflowX: s.overflowX } };
          }),
        }));
        expect(measurement.viewport).toBe(width);
        for (const e of measurement.elements) { expect(e.rect.left).toBeGreaterThanOrEqual(0); expect(e.rect.right).toBeLessThanOrEqual(width); }
        evidence.push({ mode, state, ...measurement });
      }
    }
    await info.attach('geometry.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });
}
