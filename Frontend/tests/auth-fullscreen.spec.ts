import { test, expect } from '@playwright/test';
import { dismissExternalPasswordBalloon } from './support/kaspersky';
for (const theme of ['light', 'dark']) {
  test(`auth viewport and form spacing ${theme}`, async ({ page }, info) => {
    const settleExternalUI = await dismissExternalPasswordBalloon(page);
    await page.addInitScript(t => localStorage.setItem('starter.theme', JSON.stringify(t)), theme);
    await page.goto('/#/account');
    await expect(page.locator('#auth-name')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const boxes = () => Promise.all(['.account__guest', '.account__intro', '.opportunity'].map(s => page.locator(s).boundingBox()));
    const initial = await boxes();
    const desktop = !info.project.name.startsWith('mobile');
    async function check() {
      await settleExternalUI();
      const m = await page.evaluate(() => {
        const root = document.scrollingElement!;
        const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const subtitle = box('.auth-subtitle');
        const first = box('.auth .field');
        const card = box('.account__guest');
        const note = box('.auth__note');
        return { innerHeight, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight,
          scrollY: root.scrollHeight - root.clientHeight, scrollX: root.scrollWidth - root.clientWidth,
          bottom: card.bottom, top: card.top, noteBottom: note.bottom, gap: first.top - subtitle.bottom };
      });
      if (m.scrollX !== 0) {
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => {
          const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > document.documentElement.clientWidth || r.left < 0);
        }).map(e => { const style = getComputedStyle(e); return { tag: e.tagName, id: e.id, class: String(e.className), rect: e.getBoundingClientRect().toJSON(), styles: { width: style.width, minWidth: style.minWidth, display: style.display, padding: style.padding, boxSizing: style.boxSizing, overflowX: style.overflowX } }; }));
        console.log('AUTH_OVERFLOW', JSON.stringify(overflow));
        await info.attach('overflow.json', { body: JSON.stringify(overflow, null, 2), contentType: 'application/json' });
      }
      expect(m.scrollX).toBe(0);
      expect(m.gap).toBeGreaterThanOrEqual(8);
      expect(m.gap).toBeLessThanOrEqual(20);
      if (desktop) {
        expect(m.scrollY).toBe(0);
        expect(m.bottom).toBeLessThanOrEqual(m.innerHeight);
        expect(m.noteBottom).toBeLessThanOrEqual(m.bottom);
        expect(m.top).toBeGreaterThanOrEqual(64);
      }
      return m;
    }
    for (const mode of ['register', 'login']) {
      if (mode === 'login') { await page.locator('#auth-password').blur(); await settleExternalUI(); await page.locator('.auth-switch button').click(); }
      if (desktop) expect(await boxes()).toEqual(initial);
      await expect(page.locator('#auth-name')).toHaveCount(mode === 'login' ? 0 : 1);
      const m = await check();
      if (theme === 'light' && info.project.name === 'desktop-laptop') {
        console.log(mode, m);
        await page.screenshot({ path: info.outputPath(`${mode}-1366x768.png`) });
      }
      // Native required-field validation, then the application error path.
      await page.locator('.auth-submit').click();
      await expect(page.locator('.auth input:invalid').first()).toBeVisible();
      await check();
      if (mode === 'register') {
        await page.locator('#auth-name').fill('   ');
        await page.locator('#auth-email').fill('qa@example.org');
        await page.locator('#auth-password').fill('password12345');
      }
      // Bypass only native validation to exercise the visible app error in both modes.
      await page.locator('.auth').evaluate((form: HTMLFormElement) => {
        form.noValidate = true;
        (form.querySelector('#auth-password') as HTMLInputElement).value = '';
        form.querySelector('#auth-password')!.dispatchEvent(new Event('input', { bubbles: true }));
        form.requestSubmit();
      });
      await expect(page.getByRole('alert')).not.toBeEmpty();
      await check();
    }
    await page.locator('.auth-switch button').click();
    if (desktop) expect(await boxes()).toEqual(initial);
    if (desktop) {
      // Browser chrome / toolbars can leave substantially less than 768px of content.
      await page.setViewportSize({ width: 1366, height: 650 });
      // Chromium updates the root scrollable area asynchronously after a viewport resize.
      await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight)).toBe(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await check();
      await page.locator('.auth-switch button').click();
      await check();
    }
  });
}
