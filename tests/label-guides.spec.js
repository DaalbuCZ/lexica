import { test, expect } from '@playwright/test';
test('label guides default off and persist when enabled', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.labelGuideDashes = 0;
    const original = CanvasRenderingContext2D.prototype.setLineDash;
    CanvasRenderingContext2D.prototype.setLineDash = function (dashes) {
      const scale = this.getTransform().a;
      if (
        dashes.length === 2 &&
        Math.abs(dashes[0] * scale - 4) < 0.01 &&
        Math.abs(dashes[1] * scale - 4) < 0.01
      )
        window.labelGuideDashes++;
      return original.call(this, dashes);
    };
  });
  await page.goto('/');
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  const setting = page.getByLabel('Dashed guides from labels to transitions', { exact: true });
  await expect(setting).not.toBeChecked();
  expect(await page.evaluate(() => window.labelGuideDashes)).toBe(0);
  await setting.check();
  await expect.poll(() => page.evaluate(() => window.labelGuideDashes)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('label-guides.png') });
  await page.reload();
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.labelGuideDashes)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await page.reload();
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  expect(await page.evaluate(() => window.labelGuideDashes)).toBe(0);
});

test('experimental on-curve labels persist and remain selectable', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.drawnLabels = {};
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (this.canvas.id === 'canvas') {
        const t = this.getTransform(),
          box = this.canvas.getBoundingClientRect();
        window.drawnLabels[text] = {
          x: box.left + (t.a * x + t.c * y + t.e) / devicePixelRatio,
          y: box.top + (t.b * x + t.d * y + t.f) / devicePixelRatio,
        };
      }
      return original.call(this, text, x, y, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  const setting = page.getByLabel('Labels on curves (experimental)', { exact: true });
  await expect(setting).not.toBeChecked();
  const old = await page.evaluate(() => window.drawnLabels['a-zA-Z_']);
  await setting.check();
  await expect.poll(() => page.evaluate(() => window.drawnLabels['a-zA-Z_'])).not.toEqual(old);
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('labels-on-curves.png') });
  const point = await page.evaluate(() => window.drawnLabels['a-zA-Z_']);
  await page.mouse.dblclick(point.x, point.y - 4);
  await expect(page.getByLabel('Characters and ranges', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(setting).toBeChecked();
});
