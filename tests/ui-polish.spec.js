import { test, expect } from '@playwright/test';

test('HTML loader stays visible until the bundle and initial lexer are ready', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(/(?:\/src\/main\.jsx|\/assets\/index-[^/]+\.js)$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#app-loading')).toBeVisible();
  await expect(page.locator('.loading-token')).toHaveCount(4);
  expect(
    await page
      .locator('.loading-token')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toContain('token-recognize');
  release();
  await expect(page.locator('#app-loading')).toBeHidden();
  await expect(page.locator('#tokens .token')).toHaveCount(3);
});

test('fresh defaults, canvas focus, centered dialogs and IFJ export', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveAttribute('data-toolbar-dock', 'left');
  await expect(page.locator('body')).toHaveAttribute('data-tester-dock', 'right');
  await expect(page.locator('body')).toHaveClass(/simplified-view/);
  await expect(page.locator('#group-selection, #toggle-properties')).toHaveCount(0);
  await page.locator('#tokens .token').first().click();
  await expect(page.locator('#tokens .token').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#canvas').click({ position: { x: 700, y: 120 } });
  await expect(page.locator('#input')).not.toBeFocused();
  await expect(page.locator('#tokens [aria-pressed=true]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('default-layout.png') });
  for (const name of ['Settings', 'Import', 'Export']) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
    const dialog = page.locator('.react-dialog');
    await expect(dialog).toBeVisible();
    // Inspect intermediate frames: scale must preserve the viewport center.
    const centers = await dialog.evaluate(async (el) => {
      const values = [];
      for (let i = 0; i < 14; i++) {
        await new Promise(requestAnimationFrame);
        const r = el.getBoundingClientRect();
        values.push([r.x + r.width / 2, r.y + r.height / 2]);
      }
      return values;
    });
    for (const [x, y] of centers) {
      expect(x).toBeCloseTo(720, 0);
      expect(y).toBeCloseTo(450, 0);
    }
    if (name === 'Settings') {
      await expect(page.getByLabel('Label backgrounds', { exact: true })).toBeChecked();
      await expect(page.locator('#group-presentation')).toHaveText('Floating window');
    }
    if (name === 'Export') {
      await page.locator('#format').click();
      await page.getByRole('option', { name: 'Academic FSM / IFJ (.txt)' }).click();
      await expect(page.locator('#export-preview')).toHaveValue(/M = \(Q, Σ, R, s, F\)/);
      const downloaded = page.waitForEvent('download');
      await page.locator('#download').click();
      expect((await downloaded).suggestedFilename()).toBe('lexer.txt');
      await page.locator('#copy').click();
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
      await expect(page.locator('[data-sonner-toast] [data-close-button]')).toHaveCount(0);
    }
    await dialog.evaluate((el) => {
      window.closingCenters = [];
      const record = () => {
        if (!el.isConnected) return;
        if (el.dataset.state === 'closed') {
          const r = el.getBoundingClientRect();
          window.closingCenters.push([r.x + r.width / 2, r.y + r.height / 2]);
        }
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    await dialog.getByRole('button', { name: /^Close / }).click();
    await expect(dialog).toHaveCount(0);
    const closingCenters = await page.evaluate(() => window.closingCenters);
    expect(closingCenters.length).toBeGreaterThan(0);
    for (const [x, y] of closingCenters) {
      expect(x).toBeCloseTo(720, 0);
      expect(y).toBeCloseTo(450, 0);
    }
  }
  expect(errors).toEqual([]);
});

test('tool windows animate from each docked trigger and tester expands', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden();
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
    await page.locator('#toolbar-grip').focus();
    await page.locator('#toolbar-grip').press(key);
    await page.locator('#layout-toggle').click();
    const dialog = page.locator('.tool-panel');
    await expect(dialog).toBeVisible();
    const gap = await dialog.evaluate(async (el) => {
      const dock = document.body.dataset.toolbarDock;
      const tile = document.querySelector('.toolbar').getBoundingClientRect();
      const frames = [];
      for (let i = 0; i < 8; i++) {
        const box = el.getBoundingClientRect();
        frames.push(
          {
            left: box.left - tile.right,
            right: tile.left - box.right,
            top: box.top - tile.bottom,
            bottom: tile.top - box.bottom,
          }[dock],
        );
        await new Promise(requestAnimationFrame);
      }
      return Math.min(...frames);
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#layout-mode')).toHaveText('Auto');
    await expect(page.locator('#layout-density')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close Arrange graph' }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.locator('#toggle-tester').click();
  await expect(page.locator('body')).toHaveClass(/tester-collapsed/);
  await page.locator('#toggle-tester').click();
  await expect(page.locator('.test-grid')).toBeVisible();
  expect(await page.locator('.tester').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'tester-reveal',
  );
});

test('combined group transitions drag, persist, undo and open only on double click', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('lexica-tester-collapsed', 'true');
    if (!localStorage.getItem('lexica-machine'))
      localStorage.setItem(
        'lexica-machine',
        JSON.stringify({
          start: 's',
          states: [
            { id: 's', name: 'Start', token: '', x: 0, y: 0 },
            { id: 'a', name: 'A', token: 'A', x: 400, y: 0 },
            { id: 'b', name: 'B', token: 'B', x: 500, y: 0 },
          ],
          edges: [
            { from: 's', to: 'a', label: 'a' },
            { from: 's', to: 'b', label: 'b' },
          ],
          groups: [{ id: 'g', name: 'Group', stateIds: ['a', 'b'], x: 400, y: 0 }],
        }),
      );
  });
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden();
  const point = await page.locator('#canvas').evaluate((c) => {
    const t = c.getContext('2d').getTransform(),
      r = c.getBoundingClientRect();
    return { x: r.left + t.e + 200 * t.a, y: r.top + t.f };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y + 80, { steps: 8 });
  await page.mouse.up();
  const bend = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')).edges[0].groupBend);
  await expect.poll(bend).toBeTruthy();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await bend();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(bend).toBeFalsy();
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.getByRole('dialog', { name: 'Choose a transition to edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Choose a transition to edit' }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(bend).toEqual(saved);
  await page.reload();
  await expect(page.locator('#app-loading')).toBeHidden();
  expect(await bend()).toEqual(saved);
});

test('Ctrl+P is ready before the lazy dialogs finish loading', async ({ page }) => {
  let release;
  let intercepted = false;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(
    /(?:\/src\/components\/Dialogs\.jsx|\/assets\/Dialogs-[^/]+\.js)(?:\?.*)?$/,
    async (route) => {
      intercepted = true;
      await ready;
      await route.continue();
    },
  );
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#app-loading')).toBeHidden();
    await expect.poll(() => intercepted).toBe(true);
    await page.keyboard.press('Control+p');
    await expect(page.getByRole('combobox', { name: 'Find a state' })).toBeFocused();
    const animation = await page
      .locator('.state-palette')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  } finally {
    release();
  }
});
