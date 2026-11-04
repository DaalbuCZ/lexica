import { test, expect } from '@playwright/test';
import { example } from '../src/core/lexer.js';
import { createGroup, graphView } from '../src/core/groups.js';
test.use({ reducedMotion: 'reduce' });
for (const live of [false, true])
  test(`overview routes and labels survive subgroup navigation (live routing ${live})`, async ({
    page,
  }) => {
    const machine = example();
    createGroup(machine, ['s1', 's2'], 'Tokens', () => 'tokens');
    machine.edges.push({ from: 's3', to: 's0', label: 'r' });
    machine.states.push(
      { id: 'aux1', name: 'Aux 1', token: '', x: 100, y: 600 },
      { id: 'aux2', name: 'Aux 2', token: '', x: 650, y: 600 },
    );
    machine.edges.push({ from: 'aux1', to: 'aux2', label: '[m]', bend: { x: 0, y: 25 } });
    await page.addInitScript(
      ({ machine, live }) => {
        localStorage.setItem('lexica-machine', JSON.stringify(machine));
        localStorage.setItem(
          'lexica-editor-settings',
          JSON.stringify({ groupPresentation: 'overlay', rerouteWhileDragging: live }),
        );
        localStorage.setItem('lexica-tester-collapsed', 'true');
        const Native = window.Path2D;
        window.Path2D = class extends Native {
          constructor(data) {
            super(data);
            if (typeof data === 'string') this.recordedPath = data;
          }
        };
        const proto = CanvasRenderingContext2D.prototype,
          clear = proto.clearRect,
          stroke = proto.stroke,
          fill = proto.fillText;
        proto.clearRect = function (...args) {
          this.canvas.recordedPaint = { paths: [], texts: [] };
          return clear.apply(this, args);
        };
        proto.stroke = function (...args) {
          if (args[0]?.recordedPath) this.canvas.recordedPaint?.paths.push(args[0].recordedPath);
          return stroke.apply(this, args);
        };
        proto.fillText = function (...args) {
          this.canvas.recordedPaint?.texts.push(args.slice(0, 3));
          return fill.apply(this, args);
        };
      },
      { machine, live },
    );
    await page.goto('/');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const paint = (selector) => page.locator(selector).evaluate((c) => c.recordedPaint);
    const group = graphView(machine).states.find((s) => s.id === 'tokens');
    const point = await page.locator('#canvas').evaluate((c, p) => {
      const t = c.getContext('2d').getTransform(),
        r = c.getBoundingClientRect();
      return { x: r.left + t.e + p.x * t.a, y: r.top + t.f + p.y * t.a };
    }, group);
    // Exercise the worker/settled-route path before navigation as well.
    if (live) {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 35, point.y + 25, { steps: 5 });
      await page.mouse.up();
    }
    await expect.poll(async () => (await paint('#canvas'))?.paths.length ?? 0).toBeGreaterThan(0);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const before = await paint('#canvas');
    for (let cycle = 0; cycle < 3; cycle++) {
      const current = await page.evaluate(async () => {
        const { useStudio } = await import('/src/state/studio.js'),
          { graphView } = await import('/src/core/groups.js'),
          p = graphView(useStudio.getState().scene.machine).states.find((s) => s.id === 'tokens'),
          c = document.querySelector('#canvas'),
          t = c.getContext('2d').getTransform(),
          r = c.getBoundingClientRect();
        return { x: r.left + t.e + p.x * t.a, y: r.top + t.f + p.y * t.a };
      });
      await page.mouse.dblclick(current.x, current.y);
      await expect(page.locator('.group-overlay')).toBeVisible();
      await expect.poll(() => paint('.group-overview-backdrop')).toEqual(before);
      const outside = await page.evaluate(() => {
        const c = document.querySelector('.group-overview-backdrop'),
          r = c.getBoundingClientRect();
        for (let y = r.top + 120; y < r.bottom - 80; y += 80)
          for (let x = r.left + 220; x < r.right - 80; x += 100)
            if (document.elementFromPoint(x, y) === c) return { x, y };
        throw Error('No uncovered background');
      });
      await page.mouse.click(outside.x, outside.y);
      await expect(page.locator('.group-overlay')).toBeHidden();
      await expect.poll(() => paint('#canvas')).toEqual(before);
    }
  });
