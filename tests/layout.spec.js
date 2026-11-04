import { test, expect } from '@playwright/test';

test('load and Arrange center drawing bounds with a collapsed right tester', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lexica-docks', JSON.stringify({ tester: 'right' }));
    localStorage.setItem('lexica-tester-collapsed', 'true');
    localStorage.setItem('lexica-layout-smart-groups', 'false');
  });
  await page.goto('/');
  const error = () =>
    page.evaluate(async () => {
      const { graphBounds } = await import('/src/core/canvas-graph.js'),
        { routeEdges } = await import('/src/core/layout.js'),
        m = JSON.parse(localStorage.getItem('lexica-machine')),
        canvas = document.querySelector('#canvas');
      const machine = m ?? (await import('/src/core/lexer.js')).example();
      const b = graphBounds(machine, routeEdges(machine)),
        t = canvas.getContext('2d').getTransform();
      return Math.max(
        Math.abs(t.e + (b.x + b.width / 2) * t.a - canvas.clientWidth / 2),
        Math.abs(t.f + (b.y + b.height / 2) * t.a - canvas.clientHeight / 2),
      );
    });
  await expect.poll(error).toBeLessThan(2);
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Arrange graph', exact: true })).toHaveCount(0);
  await expect.poll(error).toBeLessThan(2);
});

test('radial Arrange and local drag survive reload without moving unrelated states', async ({
  page,
}, testInfo) => {
  const machine = {
    start: 'n0',
    states: Array.from({ length: 14 }, (_, i) => ({
      id: `n${i}`,
      name: `n${i}`,
      token: '',
      x: i * 180,
      y: 0,
    })),
    edges: Array.from({ length: 13 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: 'a' })),
    comments: [],
    groups: [],
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((m) => {
    if (!localStorage.getItem('lexica-machine'))
      localStorage.setItem('lexica-machine', JSON.stringify(m));
    localStorage.setItem('lexica-layout-smart-groups', 'false');
    localStorage.setItem('lexica-layout-mode', 'circle');
    localStorage.setItem('lexica-layout-density', '0.5');
    localStorage.setItem('lexica-editor-settings', JSON.stringify({ rerouteWhileDragging: true }));
  }, machine);
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Arrange graph', exact: true })).toHaveCount(0);
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')));
  const arranged = await read();
  expect(arranged.edges).toEqual(machine.edges);
  const node = arranged.states.find((s) => s.id === 'n7');
  const point = await page.locator('#canvas').evaluate((canvas, s) => {
    const t = canvas.getContext('2d').getTransform(),
      box = canvas.getBoundingClientRect();
    return { x: box.left + t.e + s.x * t.a, y: box.top + t.f + s.y * t.a };
  }, node);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 45, point.y + 25, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await read()).states.find((s) => s.id === 'n7').x)
    .not.toBe(node.x);
  const moved = await read();
  expect(moved.states.filter((s) => s.id !== 'n7')).toEqual(
    arranged.states.filter((s) => s.id !== 'n7'),
  );
  expect(moved.drawingRoutes?.length).toBeGreaterThan(0);
  await page.reload();
  expect(await read()).toEqual(moved);
  await page.screenshot({ path: testInfo.outputPath('radial-drag-reloaded.png') });
  expect(errors).toEqual([]);
});
