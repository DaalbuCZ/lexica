import { test, expect } from '@playwright/test';
test('solid guides and labels highlight with the selected transition', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.canvasStrokes = [];
    window.drawnLabels = {};
    const proto = CanvasRenderingContext2D.prototype;
    for (const [method, shape] of [
      ['beginPath', null],
      ['lineTo', 'line'],
      ['roundRect', 'label'],
    ]) {
      const original = proto[method];
      proto[method] = function (...args) {
        this.lexicaShape = shape;
        return original.apply(this, args);
      };
    }
    const stroke = proto.stroke;
    proto.stroke = function (...args) {
      if (this.canvas.id === 'canvas')
        window.canvasStrokes.push({
          shape: args.length ? 'curve' : this.lexicaShape,
          width: this.lineWidth,
          pixels: this.lineWidth * this.getTransform().a,
          color: this.strokeStyle,
          dash: this.getLineDash(),
        });
      return stroke.apply(this, args);
    };
    const fillText = proto.fillText;
    proto.fillText = function (text, x, y, ...rest) {
      if (this.canvas.id === 'canvas') {
        const t = this.getTransform(),
          box = this.canvas.getBoundingClientRect();
        window.drawnLabels[text] = {
          x: box.left + (t.a * x + t.c * y + t.e) / devicePixelRatio,
          y: box.top + (t.b * x + t.d * y + t.f) / devicePixelRatio,
        };
      }
      return fillText.call(this, text, x, y, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  const setting = page.getByLabel('Guides from labels to transitions', { exact: true });
  await expect(setting).not.toBeChecked();
  await expect(page.getByLabel('Labels on curves (experimental)', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    window.canvasStrokes = [];
  });
  await setting.check();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.canvasStrokes.some(
          (s) => s.shape === 'line' && s.dash.length === 0 && Math.abs(s.pixels - 1) < 0.01,
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  const point = await page.evaluate(() => {
    window.canvasStrokes = [];
    return window.drawnLabels['a-zA-Z_'];
  });
  await page.mouse.click(point.x, point.y - 4);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const label = window.canvasStrokes.find((s) => s.shape === 'label' && s.width === 2.5);
        return (
          !!label &&
          window.canvasStrokes.some(
            (s) =>
              s.shape === 'line' &&
              Math.abs(s.pixels - 2.5) < 0.01 &&
              s.color === label.color &&
              s.dash.length === 0,
          ) &&
          window.canvasStrokes.some(
            (s) => s.shape === 'curve' && s.width === 3 && s.color === label.color,
          )
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('selected-label-guide.png') });
  await page.reload();
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(setting).toBeChecked();
});
