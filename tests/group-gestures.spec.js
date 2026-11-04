import { test, expect } from '@playwright/test';
test.use({ hasTouch: true, reducedMotion: 'reduce' });
const machine = {
  start: 'root',
  states: [
    { id: 'root', name: 'Start', token: '', x: -400, y: 0 },
    { id: 'a', name: 'A', token: '', x: 0, y: 0 },
    { id: 'b', name: 'B', token: '', x: 160, y: 0 },
    { id: 'end', name: 'End', token: '', x: 500, y: 0 },
  ],
  edges: [
    { from: 'root', to: 'a', label: 'a' },
    { from: 'a', to: 'b', label: 'b' },
    { from: 'b', to: 'end', label: 'c' },
  ],
  groups: [{ id: 'g', name: 'Group', stateIds: ['a', 'b'], x: 80, y: 0 }],
  comments: [],
};
async function setup(page, presentation = 'overlay') {
  await page.addInitScript(
    ({ m, presentation }) => {
      localStorage.setItem('lexica-machine', JSON.stringify(m));
      localStorage.setItem(
        'lexica-editor-settings',
        JSON.stringify({ groupPresentation: presentation }),
      );
      localStorage.setItem('lexica-tester-collapsed', 'true');
    },
    { m: machine, presentation },
  );
  await page.goto('/');
}

for (const presentation of ['canvas', 'overlay'])
  test(`${presentation}: single click selects, dragging moves the group, double click opens`, async ({
    page,
  }) => {
    await setup(page, presentation);
    const p = await groupPoint(page);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('.group-navigation [data-current]')).toHaveCount(0);
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')));
    const before = await read();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 70, p.y + 40, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await read()).groups[0].x).not.toBe(before.groups[0].x);
    const moved = await read(),
      dx = moved.groups[0].x - before.groups[0].x,
      dy = moved.groups[0].y - before.groups[0].y;
    expect(dx).not.toBe(0);
    expect(dy).not.toBe(0);
    for (const id of ['a', 'b']) {
      const a = before.states.find((s) => s.id === id),
        b = moved.states.find((s) => s.id === id);
      expect(b.x - a.x).toBe(dx);
      expect(b.y - a.y).toBe(dy);
    }
    expect(moved.states.filter((s) => !['a', 'b'].includes(s.id))).toEqual(
      before.states.filter((s) => !['a', 'b'].includes(s.id)),
    );
    await expect(page.locator('.group-navigation [data-current]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await read()).groups[0].x).toBe(before.groups[0].x);
    const restored = await groupPoint(page);
    await page.mouse.dblclick(restored.x, restored.y);
    await expect(page.locator('.group-navigation [data-current]')).toHaveCount(1);
    if (presentation === 'overlay') await expect(page.locator('.group-overlay')).toBeVisible();
  });
const transform = (page, selector) =>
  page.locator(selector).evaluate((c) => {
    const t = c.getContext('2d').getTransform();
    return { x: t.e, y: t.f, scale: t.a };
  });
async function groupPoint(page) {
  return page.locator('#canvas').evaluate((c) => {
    const t = c.getContext('2d').getTransform(),
      r = c.getBoundingClientRect();
    return { x: r.left + t.e + 80 * t.a, y: r.top + t.f };
  });
}
async function backgroundPoint(page) {
  return page.evaluate(() => {
    const c =
        document.querySelector('.group-overview-backdrop:not([hidden])') ??
        document.querySelector('#canvas'),
      r = c.getBoundingClientRect();
    for (let y = r.top + 120; y < r.bottom - 80; y += 70)
      for (let x = r.left + 220; x < r.right - 80; x += 100)
        if (document.elementFromPoint(x, y) === c) return { x, y };
    throw Error('No uncovered canvas point');
  });
}
test('mouse wheel pans the background while a subgroup stays open', async ({ page }) => {
  await setup(page);
  const p = await groupPoint(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator('.group-overlay')).toBeVisible();
  const outside = await backgroundPoint(page),
    before = await transform(page, '.group-overview-backdrop');
  await page.mouse.move(outside.x, outside.y);
  await page.mouse.wheel(100, 80);
  await expect
    .poll(async () => {
      const t = await transform(page, '.group-overview-backdrop');
      return Math.hypot(t.x - before.x, t.y - before.y);
    })
    .toBeGreaterThan(2);
  await expect(page.locator('.group-overlay')).toBeVisible();
});

test('middle-button background pan moves the overview and its dots together', async ({ page }) => {
  await setup(page);
  const p = await groupPoint(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator('.group-overlay')).toBeVisible();
  const outside = await backgroundPoint(page),
    before = await transform(page, '.group-overview-backdrop'),
    gridBefore = await page
      .locator('.canvas-wrap')
      .evaluate((el) => el.style.backgroundPosition.split(' ').map(parseFloat));
  await page.mouse.move(outside.x, outside.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(outside.x + 50, outside.y + 30, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect
    .poll(async () => {
      const t = await transform(page, '.group-overview-backdrop');
      return Math.hypot(t.x - before.x, t.y - before.y);
    })
    .toBeGreaterThan(2);
  const after = await transform(page, '.group-overview-backdrop'),
    gridAfter = await page
      .locator('.canvas-wrap')
      .evaluate((el) => el.style.backgroundPosition.split(' ').map(parseFloat));
  expect(gridAfter[0] - gridBefore[0]).toBeCloseTo(after.x - before.x, 2);
  expect(gridAfter[1] - gridBefore[1]).toBeCloseTo(after.y - before.y, 2);
  await expect(page.locator('.group-overlay')).toBeVisible();
  const blank = await backgroundPoint(page);
  await page.mouse.click(blank.x, blank.y, { button: 'middle' });
  await expect(page.locator('.group-overlay')).toBeVisible();
});
test('touch opening, background panning and closing do not leave a phantom finger', async ({
  page,
  context,
}) => {
  await setup(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type, p, id = 1) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ id, x: p.x, y: p.y }] : [] });
  for (let cycle = 0; cycle < 2; cycle++) {
    const p = await groupPoint(page);
    await touch('touchStart', p);
    await touch('touchEnd');
    await touch('touchStart', p);
    await touch('touchEnd');
    await expect(page.locator('.group-overlay')).toBeVisible();
    const outside = await backgroundPoint(page),
      before = await transform(page, '.group-overview-backdrop');
    await touch('touchStart', outside, 2);
    await touch('touchMove', { x: outside.x + 50, y: outside.y + 20 }, 2);
    await touch('touchEnd');
    await expect
      .poll(async () => {
        const t = await transform(page, '.group-overview-backdrop');
        return Math.hypot(t.x - before.x, t.y - before.y);
      })
      .toBeGreaterThan(2);
    const close = await backgroundPoint(page);
    await touch('touchStart', close, 3);
    await touch('touchEnd');
    await expect(page.locator('.group-overlay')).toBeHidden();
    const blank = await backgroundPoint(page),
      main = await transform(page, '#canvas');
    await touch('touchStart', blank, 4);
    await touch('touchMove', { x: blank.x + 40, y: blank.y + 20 }, 4);
    await touch('touchEnd');
    await expect
      .poll(async () => {
        const t = await transform(page, '#canvas');
        return Math.hypot(t.x - main.x, t.y - main.y);
      })
      .toBeGreaterThan(2);
    expect((await transform(page, '#canvas')).scale).toBeCloseTo(main.scale, 5);
  }
});
