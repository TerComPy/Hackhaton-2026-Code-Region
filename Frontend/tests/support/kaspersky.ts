import type { Page, Frame } from '@playwright/test';
// Close the local antivirus UI through its own button. App DOM/CSS stay intact.
export async function dismissExternalPasswordBalloon(page: Page) {
  // Isolate this page from the machine-injected password UI before navigation.
  // This affects only external antivirus resources in this test page.
  await page.route(/^https?:\/\/[^/]*kaspersky-labs\.com\//, route => route.abort());
  const pending = new Map<Frame, Promise<void>>();
  const close = (frame: Frame): Promise<void> => {
    if (!frame.url().includes('kaspersky-labs.com/') || !frame.url().includes('/password_control_balloon.html')) return Promise.resolve();
    const active = pending.get(frame);
    if (active) return active;
    const task = (async () => {
      try {
        await frame.locator('#closeButton').click({ timeout: 3000 });
      } catch { /* External frame may already have closed or navigated away. */ }
    })().finally(() => pending.delete(frame));
    pending.set(frame, task);
    return task;
  };
  page.on('framenavigated', frame => { void close(frame); });
  return async () => {
    await Promise.all(page.frames().map(close));
    await Promise.all([...pending.values()]);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
}
