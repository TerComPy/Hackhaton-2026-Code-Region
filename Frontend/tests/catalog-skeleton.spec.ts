import { test, expect, type Route } from '@playwright/test';
test('catalog loading lifecycle and layout', async ({ page }, info) => {
 const user = { id: 'test', profileId: 'test', email: 'test@example.invalid', displayName: 'Test', role: 'user' };
 const token = `test.${Buffer.from(JSON.stringify({ exp: Date.now()/1000+3600 })).toString('base64url')}.test`;
 await page.route('**/api/**', r => r.fulfill({ json: { status: 'ok', items: [], user, profile: { id: 'test' }, accessToken: token } }));
 await page.route('**/api/favorites?*', r => r.fulfill({ json: { items: [], page: 1, pageSize: 20 } }));
 await page.route('**/api/health', r => r.fulfill({ json: { status: 'ok' } }));
 await page.route('**/api/ready', r => r.fulfill({ json: { status: 'ready', database: 'ok' } }));
 const pending: Route[] = [];
 await page.route('**/api/vacancies?*', r => { pending.push(r); });
 await page.goto('/');
 await expect(page.locator('.catalog-guest')).toBeVisible();
 await expect(page.locator('.job--skeleton')).toHaveCount(0);
 await page.evaluate(async () => {
  const session = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('session');
  await session.authenticate('login', { email: 'test@example.invalid', password: 'test-password' });
 });
 const skeleton = page.locator('.job--skeleton');
 const real = page.locator('[data-vacancy-id]');
 async function loading() {
  await expect(skeleton).toHaveCount(6);
  await expect(page.locator('#catalog [role=status]')).toHaveCount(1);
  await expect(page.locator('.catalog-empty')).toHaveCount(0);
  await expect(page.locator('#catalog [role=alert]')).toHaveCount(0);
  await expect.poll(() => pending.length).toBe(1);
 }
 async function respond(count: number, pageNumber = 1) {
  await pending.shift()!.fulfill({ json: { items: Array.from({ length: count }, (_, i) => ({ id: `${pageNumber}-${i}`, title: 'Frontend developer', company_name: 'Company', city: 'Москва', source_name: 'API', published_at: '2026-11-12', salary_min: '100000', salary_max: null, currency: 'RUB', work_format: 'remote' })), page: pageNumber, pageSize: 6 } });
  await expect(skeleton).toHaveCount(0);
 }
 await loading();
 await expect(page.locator('#catalog .section-head')).not.toContainText('Загружено: 0');
 expect(await skeleton.first().locator('.sk').first().evaluate(e => getComputedStyle(e).animationName)).toBe(info.project.name.endsWith('-reduce') ? 'none' : 'pulse');
 const skeletonHeight = (await skeleton.first().boundingBox())!.height;
 const before = await skeleton.first().locator('.job__media').boundingBox();
 await respond(6);
 await expect(real).toHaveCount(6);
 const after = await real.first().locator('.job__media').boundingBox();
 expect(Math.abs(skeletonHeight - (await real.first().boundingBox())!.height)).toBeLessThan(1);
 expect(before?.width).toBe(after?.width);
 expect(before?.height).toBe(after?.height);
 await page.locator('.catalog__more').click();
 await loading();
 await expect(real).toHaveCount(6);
 expect(await skeleton.first().evaluate(e => e.previousElementSibling === null)).toBe(true);
 expect((await skeleton.first().boundingBox())!.y).toBeGreaterThan((await real.last().boundingBox())!.y);
 await respond(1, 2);
 await expect(real).toHaveCount(7);
 await page.locator('#f-q').fill('engineer');
 await loading(); await expect(real).toHaveCount(0); await respond(6);
 await page.locator('#f-city').fill('Москва');
 await loading(); await pending.shift()!.fulfill({ status: 500, json: {} });
 await expect(skeleton).toHaveCount(0);
 await expect(page.locator('#catalog [role=alert] button')).toBeVisible();
 await page.locator('#catalog [role=alert] button').click();
 await loading(); await respond(0);
 await expect(page.locator('.catalog-empty')).toBeVisible();
});
