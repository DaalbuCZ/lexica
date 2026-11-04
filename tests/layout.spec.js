import { test, expect } from '@playwright/test';

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
