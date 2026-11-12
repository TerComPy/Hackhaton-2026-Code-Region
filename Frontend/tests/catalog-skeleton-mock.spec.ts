import { test, expect } from '@playwright/test';
test('mock catalog keeps its existing loading behavior', async ({ page }) => {
 await page.goto('/');
 await expect(page.locator('#catalog [data-vacancy-id], #catalog .job').first()).toBeVisible();
 await expect(page.locator('.job--skeleton')).toHaveCount(0);
 await page.locator('#f-q').fill('no-such-mock-vacancy-82736');
 await expect(page.locator('.catalog-empty')).toBeVisible();
 await expect(page.locator('.job--skeleton')).toHaveCount(0);
});
