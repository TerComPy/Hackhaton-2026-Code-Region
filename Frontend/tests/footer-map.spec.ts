import { test, expect } from '@playwright/test';
for (const theme of ['light', 'dark']) {
  test(`footer map failure in ${theme}`, async ({ page }) => {
    await page.addInitScript(t => localStorage.setItem('starter.theme', t), theme);
    let requests = 0;
    await page.route('https://api-maps.yandex.ru/**', route => { requests++; return route.abort(); });
    await page.goto('/');
    await page.locator('#office-map').scrollIntoViewIfNeeded();
    await expect(page.locator('#office-map')).toContainText('Не удалось загрузить карту');
    await expect(page.locator('.footer__map a')).toHaveAttribute('href', /37.8028/);
    expect(requests).toBe(1);
  });
}
test('initializes once with office marker and disables wheel zoom', async ({ page }) => {
  await page.route('https://api-maps.yandex.ru/**', route => route.fulfill({ contentType: 'application/javascript', body: `window.ymaps = {ready: cb => cb(), Map: class { constructor(el, options) { el.dataset.options = JSON.stringify(options); this.behaviors = {disable: name => el.dataset.disabled = name}; this.geoObjects = {add: marker => el.dataset.marker = JSON.stringify(marker)}; } destroy() {} }, Placemark: class { constructor(coordinates, properties) { this.coordinates = coordinates; this.properties = properties; } }};` }));
  await page.goto('/');
  await page.locator('#office-map').scrollIntoViewIfNeeded();
  const canvas = page.locator('.office-map__canvas');
  await expect(canvas).toHaveAttribute('data-disabled', 'scrollZoom');
  await expect(canvas).toHaveAttribute('data-options', /48.0159,37.8028/);
  await expect(canvas).toHaveAttribute('data-marker', /Офис Стартера/);
  await expect(page.locator('#office-map [role=status]')).toHaveCount(0);
});
