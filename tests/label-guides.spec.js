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
