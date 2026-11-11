import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  test.skip(!['desktop-laptop', 'desktop-small'].includes(info.project.name));
  await page.addInitScript(() => {
    const qa = { draws: 0, points: [] as number[][], listeners: 0, observers: 0 };
    (window as any).perlinQA = qa;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('perlin-opportunity__canvas')) { qa.draws++; qa.points = []; }
      return clear.apply(this, args);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (this.canvas.classList.contains('perlin-opportunity__canvas')) qa.points.push(args.slice(0, 2));
      return arc.apply(this, args);
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...args: Parameters<typeof add>) {
      if (this instanceof Element && this.classList.contains('perlin-opportunity')) qa.listeners++;
      return add.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args: Parameters<typeof remove>) {
      if (this instanceof Element && this.classList.contains('perlin-opportunity')) qa.listeners--;
      return remove.apply(this, args);
    };
    for (const key of ['ResizeObserver', 'IntersectionObserver'] as const) {
      const Base = window[key];
      (window as any)[key] = class extends Base {
        tracked = false;
        observe(target: Element, options?: any) {
          if (target.classList.contains('perlin-opportunity') && !this.tracked) { this.tracked = true; qa.observers++; }
          return super.observe(target, options);
        }
        disconnect() { if (this.tracked) { qa.observers--; this.tracked = false; } super.disconnect(); }
      };
    }
  });
});

for (const theme of ['light', 'dark']) {
  test(`Perlin interaction, layout and lifecycle ${theme}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(t => localStorage.setItem('starter.theme', JSON.stringify(t)), theme);
    await page.clock.install();
    await page.goto('/#/account');
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(150);
    const panel = page.locator('.perlin-opportunity');
    const card = await page.locator('.account__guest').boundingBox();
    const b = (await panel.boundingBox())!;
    const c = (await panel.locator('canvas').boundingBox())!;
    expect(Math.abs(c.width - (b.width - 1))).toBeLessThan(1);
    expect(c.height).toBe(b.height);
    const metrics = await page.evaluate(() => {
      const r = document.scrollingElement!;
      return { y: r.scrollHeight - r.clientHeight, x: r.scrollWidth - r.clientWidth };
    });
    expect(metrics).toEqual({ y: 0, x: 0 });
    expect(card!.y + card!.height).toBeLessThanOrEqual(info.project.use.viewport!.height);
    await page.locator('.auth-switch button').click();
    expect(await page.locator('.account__guest').boundingBox()).toEqual(card);
    await page.locator('.auth-switch button').click();
    const displaced = () => page.evaluate(() => (window as any).perlinQA.points.filter(([x,y]: number[]) =>
      Math.abs((x - 8) / 16 - Math.round((x - 8) / 16)) > 0.01 || Math.abs((y - 8) / 16 - Math.round((y - 8) / 16)) > 0.01).length);
    expect(await displaced()).toBe(0);
    await page.mouse.move(b.x + 240, b.y + 360);
    await page.clock.runFor(300);
    expect(await displaced()).toBeGreaterThan(50);
    await page.mouse.click(b.x + 240, b.y + 360);
    await page.mouse.move(10, 10);
    await page.clock.runFor(600);
    expect(await displaced()).toBeGreaterThan(100);
    await page.clock.runFor(2200);
    expect(await displaced()).toBe(0);
    await page.mouse.move(b.x + 60, b.y + 360);
    await page.clock.runFor(40);
    await page.mouse.move(b.x + 400, b.y + 360);
    await page.mouse.move(10, 10);
    await page.clock.runFor(600);
    expect(await displaced()).toBeGreaterThan(100); // acceleration burst, without a click
    const draws = () => page.evaluate(() => (window as any).perlinQA.draws);
    let before = await draws();
    await page.clock.runFor(1000);
    expect((await draws()) - before).toBeLessThanOrEqual(30);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    before = await draws(); await page.clock.runFor(1000); expect(await draws()).toBe(before);
    await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(100); expect(await draws()).toBeGreaterThan(before);
    await page.screenshot({ path: info.outputPath(`${theme}-${info.project.name}.png`) });
    await page.goto('/#/saved');
    before = await draws(); await page.clock.runFor(500); expect(await draws()).toBe(before);
    expect(await page.evaluate(() => ({ listeners: (window as any).perlinQA.listeners, observers: (window as any).perlinQA.observers }))).toEqual({ listeners: 0, observers: 0 });
    await page.goto('/#/account'); await page.clock.runFor(150);
    expect(await page.evaluate(() => ({ listeners: (window as any).perlinQA.listeners, observers: (window as any).perlinQA.observers }))).toEqual({ listeners: 4, observers: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.runFor(100);
    before = await draws(); await page.clock.runFor(500); expect(await draws()).toBe(before);
    await page.mouse.click(b.x + 300, b.y + 400); await page.clock.runFor(300); expect(await draws()).toBe(before);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(async () => { await page.clock.runFor(100); return draws(); }).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });
}
