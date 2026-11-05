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
async function setup(page, presentation = 'overlay', m = machine) {
  await page.addInitScript(
    ({ m, presentation }) => {
      localStorage.setItem('lexica-machine', JSON.stringify(m));
      localStorage.setItem(
        'lexica-editor-settings',
        JSON.stringify({ groupPresentation: presentation }),
      );
      localStorage.setItem('lexica-tester-collapsed', 'true');
    },
    { m, presentation },
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
    const scale = await page.locator('#canvas').evaluate((c) => {
      const ctx = c.getContext('2d'),
        roundRect = ctx.roundRect.bind(ctx);
      window.lastGroupPaint = null;
      ctx.roundRect = (...args) => {
        if (args[2] === 88 && args[3] === 72)
          window.lastGroupPaint = { x: args[0] + 44, y: args[1] + 36 };
        return roundRect(...args);
      };
      return ctx.getTransform().a;
    });
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 70, p.y + 40, { steps: 5 });
    // Assert the painted proxy follows the pointer before release, rather than
    // checking only the committed document after pointerup.
    await expect
      .poll(() => page.evaluate(() => window.lastGroupPaint?.x))
      .toBeCloseTo(before.groups[0].x + Math.round(70 / scale), 3);
    await expect
      .poll(() => page.evaluate(() => window.lastGroupPaint?.y))
      .toBeCloseTo(before.groups[0].y + Math.round(40 / scale), 3);
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

test('Ctrl-drag inserts inside the group and offers a searchable destination outside', async ({
  page,
}) => {
  await setup(page);
  const proxy = await groupPoint(page);
  await page.mouse.dblclick(proxy.x, proxy.y);
  await expect(page.locator('.group-overlay')).toBeVisible();
  const point = (x, y) =>
    page.locator('#canvas').evaluate(
      (canvas, [x, y]) => {
        const t = canvas.getContext('2d').getTransform(),
          r = canvas.getBoundingClientRect();
        return { x: r.left + t.e + x * t.a, y: r.top + t.f + y * t.d };
      },
      [x, y],
    );
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')));
  const drag = async (to) => {
    const from = await point(0, 0);
    await page.keyboard.down('Control');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await expect(page.locator('body')).toHaveClass(/connecting-outside-group/);
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('body')).not.toHaveClass(/connecting-outside-group/);
  };
  await drag(await point(80, 35));
  await expect.poll(async () => (await read()).groups[0].stateIds.length).toBe(3);
  const close = page.getByRole('button', { name: 'Close properties' });
  if (await close.isVisible()) await close.click();
  const bounds = await page.locator('.group-overlay').boundingBox();
  await drag({ x: bounds.x + bounds.width / 2, y: bounds.y - 20 });
  const picker = page.getByRole('dialog', { name: 'Connect outside this group' });
  await expect(picker).toBeVisible();
  await picker.getByRole('textbox', { name: 'Search states' }).fill('END');
  await picker.getByRole('button', { name: 'End Overview' }).click();
  await expect
    .poll(async () => (await read()).edges.some((e) => e.from === 'a' && e.to === 'end'))
    .toBe(true);
  expect((await read()).states).toHaveLength(5);
});

test('a long group name paints at full size and the wider node can be opened', async ({ page }) => {
  const m = structuredClone(machine);
  m.groups[0].name = 'A much longer group name';
  await setup(page, 'overlay', m);
  await expect(page.locator('#app-loading')).toBeHidden();
  const point = await page.locator('#canvas').evaluate((canvas) => {
    const t = canvas.getContext('2d').getTransform();
    const r = canvas.getBoundingClientRect();
    return { x: r.left + t.e + 155 * t.a, y: r.top + t.f };
  });
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator('.group-overlay')).toBeVisible();
  await expect(page.locator('#group-overlay-title')).toHaveValue(m.groups[0].name);
});

for (const presentation of ['canvas', 'overlay'])
  test(`Ctrl+P finds and centers a state across groups in ${presentation} mode`, async ({
    page,
  }) => {
    const m = structuredClone(machine);
    m.states.find((s) => s.id === 'b').token = 'TARGET';
    await setup(page, presentation, m);
    await expect(page.locator('#app-loading')).toBeHidden();
    const search = page.getByRole('combobox', { name: 'Find a state' });
    await page.locator('#zoom-out').click();
    await page.keyboard.press('Control+p');
    await expect(search).toBeFocused();
    await search.fill('group target');
    const target = page.getByRole('option', { name: 'B Group' });
    await expect(target).toHaveAttribute('aria-selected', 'true');
    await expect(target.locator('.state-palette-name')).toHaveAttribute('style', /--token-accent/);
    await search.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
    await expect(page.locator('.group-navigation [data-current]')).toHaveCount(1);
    const distance = (state) =>
      page.locator('#canvas').evaluate((canvas, state) => {
        const t = canvas.getContext('2d').getTransform();
        const canvasBox = canvas.getBoundingClientRect();
        const wrap = document.querySelector('.canvas-wrap').getBoundingClientRect();
        return Math.hypot(
          canvasBox.left + t.e + t.a * state.x - (wrap.left + wrap.width / 2),
          canvasBox.top + t.f + t.d * state.y - (wrap.top + wrap.height / 2),
        );
      }, state);
    await expect.poll(() => distance(m.states.find((s) => s.id === 'b'))).toBeLessThan(2);
    const zoom = () =>
      page
        .locator('#canvas')
        .evaluate((canvas) => canvas.getContext('2d').getTransform().a / devicePixelRatio);
    await expect.poll(zoom).toBeCloseTo(1.15, 4);
    await page.keyboard.press('Control+p');
    await search.fill('End');
    await search.press('Enter');
    await expect(page.locator('.group-navigation [data-current]')).toHaveCount(0);
    await expect.poll(() => distance(m.states.find((s) => s.id === 'end'))).toBeLessThan(2);
    await expect.poll(zoom).toBeCloseTo(1.15, 4);
  });
