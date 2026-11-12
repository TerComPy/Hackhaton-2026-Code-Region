import { test, expect } from '@playwright/test';
test.beforeEach(() => { test.skip(!test.info().config.configFile?.endsWith('playwright.connection.config.ts')); });
const api = process.env.UI_DATA_MODE !== 'mock';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', r => r.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/ready', r => r.fulfill({ json: { status: 'ready', database: 'ok' } }));
});
test('successful connection has no banner; guest artwork and login fit both themes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('API и MySQL доступны.', { exact: false })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('main > section.wrap')).toHaveCount(0);
  if (api) {
    const guest = page.locator('.catalog-guest');
    await guest.scrollIntoViewIfNeeded();
    await expect(guest.getByRole('heading')).toHaveText('Твоя следующая работа уже близко');
    await expect(guest.locator('img')).toBeVisible();
    expect(await guest.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    for (const size of [420, 800, 1200]) expect((await page.request.get(`/images/branding/starter-catalog-guest-${size}.webp`)).status()).toBe(200);
    expect(await guest.evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBeTruthy();
    await guest.getByRole('link').click();
    await expect(page).toHaveURL(/#\/account/);
  } else {
    await expect(page.locator('.catalog-guest')).toHaveCount(0);
    await expect(page.locator('#catalog .job').first()).toBeVisible();
  }
});
test('HTTP 500 dialog retries both checks and restores focus', async ({ page }) => {
  test.skip(!api);
  let fail = true, health = 0, ready = 0;
  await page.route('**/api/health', r => { health++; return r.fulfill({ json: { status: 'ok' } }); });
  await page.route('**/api/ready', r => { ready++; return r.fulfill(fail ? { status: 500, body: '<html>secret stack trace</html>' } : { json: { status: 'ready', database: 'ok' } }); });
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Не удалось подключиться к серверу');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toContainText('/api/ready · HTTP 500');
  await expect(dialog).not.toContainText('stack trace');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await dialog.getByRole('button', { name: 'Повторить' }).click();
  await expect.poll(() => ready).toBe(2);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBeTruthy();
  fail = false;
  await dialog.getByRole('button', { name: 'Повторить' }).click();
  await expect(dialog).not.toBeVisible();
  expect(health).toBe(3);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
for (const close of ['button', 'Escape']) test(`close with ${close} preserves route`, async ({ page }) => {
  test.skip(!api);
  await page.route('**/api/health', r => r.fulfill({ status: 503, json: {} }));
  await page.goto('/#/saved');
  await expect(page.getByRole('dialog')).toBeVisible();
  if (close === 'Escape') await page.keyboard.press('Escape');
  else await page.getByRole('button', { name: 'Закрыть окно' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/#\/saved/);
});
for (const error of ['network', 'timeout', '401']) test(`connection ${error}`, async ({ page }) => {
  test.skip(!api);
  if (error === 'timeout') await page.clock.install();
  await page.route('**/api/health', async r => {
    if (error === 'network') await r.abort('failed');
    else if (error === '401') await r.fulfill({ status: 401, json: {} });
    // Timeout request deliberately remains pending.
  });
  await page.goto('/');
  if (error === 'timeout') await page.clock.runFor(11000);
  if (error === '401') await expect(page.locator('dialog[open]')).toHaveCount(0);
  else await expect(page.getByRole('dialog')).toContainText(error === 'network' ? 'Ошибка сети' : 'Таймаут соединения');
});

test('authenticated catalog keeps loading, errors and empty states separate from guest', async ({ page }) => {
  test.skip(!api);
  const user = { id: 'test', profileId: 'test', email: 'test@example.invalid', displayName: 'Test', role: 'user' };
  const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.route('**/api/auth/me', r => r.fulfill({ json: { user } }));
  await page.route('**/api/profile', r => r.fulfill({ json: { profile: { id: 'test', displayName: 'Test', city: null } } }));
  await page.route('**/api/auth/login', r => r.fulfill({ json: { user, accessToken: token } }));
  await page.route('**/api/favorites?*', r => r.fulfill({ json: { items: [], page: 1, pageSize: 20 } }));
  await page.route('**/api/vacancies?*', async r => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await r.fulfill({ json: { items: [{ id: '1', title: 'Разработчик', company_name: 'СТАРТЕР', city: 'Москва', salary_min: null, salary_max: null, currency: null, original_url: 'https://example.com', source_name: 'test', status: 'active', work_format: 'remote' }], page: 1, pageSize: 6 } });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const session = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('session');
    await session.authenticate('login', { email: 'test@example.invalid', password: 'password', displayName: 'Test' });
  });
  await expect(page.locator('.catalog-guest')).toHaveCount(0);
  await expect(page.locator('#catalog .job')).toContainText('Разработчик');
  await page.route('**/api/vacancies?*', r => r.fulfill({ status: 500, json: {} }));
  await page.locator('#f-q').fill('failure');
  await expect(page.locator('#catalog [role=alert]')).toBeVisible();
  await expect(page.locator('.catalog-guest')).toHaveCount(0);
  await page.route('**/api/vacancies?*', r => r.fulfill({ json: { items: [], page: 1, pageSize: 6 } }));
  await page.locator('#catalog').getByRole('button', { name: 'Повторить' }).click();
  await expect(page.locator('.catalog-empty')).toBeVisible();
  await expect(page.locator('.catalog-guest')).toHaveCount(0);
});
