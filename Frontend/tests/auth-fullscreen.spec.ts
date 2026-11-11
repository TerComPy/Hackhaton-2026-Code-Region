import { test, expect } from '@playwright/test';
for (const theme of ['light', 'dark']) {
 test(`fullscreen auth and header CTA ${theme}`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(t => localStorage.setItem('starter.theme', JSON.stringify(t)), theme);
  await page.goto('/#/account');
  await expect(page.locator('#auth-name')).toBeVisible();
  const baseline = process.env.CAPTURE_AUTH_BEFORE === '1';
  for (const mode of ['register', 'login']) {
   await page.getByRole('button', {name: mode === 'register' ? 'Регистрация' : 'Вход', exact:true}).click();
   await page.screenshot({animations: "disabled", path:`docs/auth-fullscreen/screenshots/${baseline ? 'before' : 'after'}-${mode}-${theme}-${info.project.name}.png`});
   if (baseline) continue;
   await expect(page.locator('.footer')).toHaveCount(0);
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   if (!info.project.name.startsWith('mobile')) {
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.locator('.auth__note')).toBeInViewport();
    await expect(page.locator('.opportunity__footer')).toBeInViewport();
    const cta = page.locator('.nav__link--cta');
    await expect(cta).toHaveCSS('background-color', theme === 'dark' ? 'rgb(255, 106, 67)' : 'rgb(217, 67, 31)');
    await expect(cta).toHaveCSS('color',theme === 'dark' ? 'rgb(20, 20, 19)' : 'rgb(255, 255, 255)');
    expect(await cta.evaluate(e => getComputedStyle(e,'::after').display)).toBe('none');
    await cta.focus();
    await expect(cta).toBeFocused();
   } else {
    await expect(page.locator('.nav__link--cta')).toHaveCSS('height','64px');
   }
  }
  if (baseline) return;
  await page.getByRole('button',{name:'Регистрация',exact:true}).click();
  await page.getByRole('button',{name:'Создать профиль',exact:true}).click();
  await expect(page.locator('#auth-name:invalid')).toHaveCount(1);
  await page.locator('#auth-name').fill('   ');
  await page.locator('#auth-email').fill('anna@example.org');
  await page.locator('#auth-password').fill('password12345');
  await page.getByRole('button',{name:'Создать профиль',exact:true}).click();
  await expect(page.getByRole('alert')).not.toBeEmpty();
  await expect(page.getByRole('alert')).toBeInViewport();
  await page.screenshot({animations: "disabled", path:`docs/auth-fullscreen/screenshots/after-error-${theme}-${info.project.name}.png`});
  await page.locator('#auth-name').fill('Анна');
  await page.getByRole('button',{name:'Создать профиль',exact:true}).click();
  await expect(page.locator('.member')).toBeVisible();
  await expect(page.locator('.footer')).toBeVisible();
  await page.getByRole('button',{name:'Выйти',exact:true}).click();
  await expect(page.locator('.footer')).toHaveCount(0);
  await page.goto('/#/saved');
  await expect(page.locator('.footer')).toBeVisible();
  expect(errors).toEqual([]);
 });
}
