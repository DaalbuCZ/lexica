import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const numbers = JSON.parse(
  readFileSync(new URL('../fixtures/numbers-and-floats.json', import.meta.url)),
);
test.use({ reducedMotion: 'reduce' });

test('nonplanar numbers group stays compact with groups enabled', async ({ page }, testInfo) => {
  await page.addInitScript((machine) => {
    localStorage.setItem('lexica-machine', JSON.stringify(machine));
    localStorage.setItem('lexica-layout-mode', 'circle');
    localStorage.setItem('lexica-layout-disregard-groups', 'false');
    localStorage.setItem('lexica-layout-smart-groups', 'false');
    localStorage.setItem('lexica-tester-collapsed', 'true');
    localStorage.setItem('lexica-editor-settings', JSON.stringify({ groupPresentation: 'canvas' }));
  }, numbers);
  await page.goto('/');
  await page.evaluate(async () => {
    const { useStudio } = await import('/src/state/studio.js');
    useStudio.getState().controller.openGroup('auto-group-1');
  });
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Arrange graph', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  const size = await page.evaluate(async () => {
    const { useStudio } = await import('/src/state/studio.js');
    const { graphView } = await import('/src/core/groups.js');
    const m = useStudio.getState().scene.machine,
      v = graphView(m, 'auto-group-1');
    return {
      groups: m.groups.length,
      width: Math.max(...v.states.map((s) => s.x)) - Math.min(...v.states.map((s) => s.x)),
      height: Math.max(...v.states.map((s) => s.y)) - Math.min(...v.states.map((s) => s.y)),
    };
  });
  expect(size.groups).toBe(1);
  expect(size.width).toBeLessThan(1500);
  expect(size.height).toBeLessThan(800);
  await page.screenshot({ path: testInfo.outputPath('numbers-group.png') });
});

test('dragging a group boundary edge stays attached to the displayed start and persists', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('lexica-machine'))
      localStorage.setItem(
        'lexica-machine',
        JSON.stringify({
          start: 'root',
          states: [
            { id: 'root', name: 'Start', token: '', x: 4000, y: 4000 },
            { id: 'a', name: 'A', token: '', x: 0, y: 0 },
            { id: 'b', name: 'B', token: '', x: 250, y: 0 },
          ],
          edges: [
            { from: 'root', to: 'a', label: 'x' },
            { from: 'a', to: 'b', label: 'y' },
          ],
          groups: [
            {
              id: 'g',
              name: 'Group',
              stateIds: ['a', 'b'],
              x: 125,
              y: 0,
              contextPositions: { root: { x: -300, y: 0 } },
            },
          ],
          comments: [],
        }),
      );
    localStorage.setItem('lexica-editor-settings', JSON.stringify({ groupPresentation: 'canvas' }));
    localStorage.setItem('lexica-tester-collapsed', 'true');
    const Native = window.Path2D;
    window.Path2D = class extends Native {
      constructor(data) {
        super(data);
        this.recordedPath = data;
      }
    };
    const proto = CanvasRenderingContext2D.prototype,
      stroke = proto.stroke,
      clear = proto.clearRect;
    proto.clearRect = function (...args) {
      this.canvas.paths = [];
      return clear.apply(this, args);
    };
    proto.stroke = function (...args) {
      if (typeof args[0]?.recordedPath === 'string') this.canvas.paths?.push(args[0].recordedPath);
      return stroke.apply(this, args);
    };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { useStudio } = await import('/src/state/studio.js');
    useStudio.getState().controller.openGroup('g');
  });
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  await page.getByRole('button', { name: 'Select mode', exact: true }).click();
  const p = await page.locator('#canvas').evaluate((c) => {
    const path = c.paths.find((path) => path.startsWith('M '));
    const [x0, y0, x1, y1, x2, y2, x3, y3] = path
      .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)
      .map(Number);
    const x = (x0 + 3 * x1 + 3 * x2 + x3) / 8,
      y = (y0 + 3 * y1 + 3 * y2 + y3) / 8;
    const t = c.getContext('2d').getTransform(),
      r = c.getBoundingClientRect();
    return { x: r.left + t.e + x * t.a, y: r.top + t.f + y * t.a };
  });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y + 45, { steps: 5 });
  const radius = () =>
    page.locator('#canvas').evaluate((c) => {
      const path = c.paths?.find((p) => p.startsWith('M '));
      if (!path) return Infinity;
      const [x, y] = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
      return Math.hypot(x + 300, y);
    });
  await expect.poll(radius).toBeCloseTo(37, 1);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')).edges[0].bend?.y ?? 0),
    )
    .not.toBe(0);
  const bend = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lexica-machine')).edges[0].bend,
  );
  expect(Math.abs(bend.y)).toBeGreaterThan(0);
  const draggedPath = await page
    .locator('#canvas')
    .evaluate((c) => c.paths.find((p) => p.startsWith('M ')).replaceAll(',', ''));
  await page.reload();
  await page.evaluate(async () => {
    const { useStudio } = await import('/src/state/studio.js');
    useStudio.getState().controller.openGroup('g');
  });
  await expect.poll(radius).toBeCloseTo(37, 1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')));
  expect(saved.edges[0].bend).toEqual(bend);
  await expect
    .poll(() =>
      page
        .locator('#canvas')
        .evaluate((c) => c.paths.find((p) => p.startsWith('M ')).replaceAll(',', '')),
    )
    .toEqual(draggedPath);
  expect(saved.drawingRoutes.length).toBeGreaterThan(0);
});

test('disregarding groups keeps independent branches clear of a nonplanar numeric branch', async ({
  page,
}, testInfo) => {
  const machine = structuredClone(numbers);
  for (let i = 0; i < 24; i++) {
    const a = `branch-${i}-a`,
      b = `branch-${i}-b`;
    machine.states.push(...[a, b].map((id) => ({ id, name: id, token: '', x: 0, y: 0 })));
    machine.edges.push({ from: machine.start, to: a, label: 'x' }, { from: a, to: b, label: 'y' });
  }
  await page.addInitScript((m) => {
    localStorage.setItem('lexica-machine', JSON.stringify(m));
    localStorage.setItem('lexica-layout-mode', 'circle');
    localStorage.setItem('lexica-layout-disregard-groups', 'true');
    localStorage.setItem('lexica-layout-smart-groups', 'false');
    localStorage.setItem('lexica-tester-collapsed', 'true');
  }, machine);
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Arrange graph', exact: true })).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { useStudio } = await import('/src/state/studio.js');
    const { crossingPairs } = await import('/src/core/layout.js');
    const { simpleTransitionLabel } = await import('/src/core/editor-settings.js');
    const m = useStudio.getState().scene.machine;
    return {
      groups: m.groups,
      states: m.states.length,
      edges: m.edges,
      crossings: crossingPairs(m, true, simpleTransitionLabel, true).length,
    };
  });
  expect(result.groups).toEqual([]);
  expect(result.states).toBe(machine.states.length);
  expect(result.edges).toEqual(machine.edges);
  expect(result.crossings).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('ungrouped-radial.png') });
});
