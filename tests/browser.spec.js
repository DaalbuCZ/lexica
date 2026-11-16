import { test, expect } from '@playwright/test';
import fs from 'node:fs';
async function choose(page, id, name) {
  await page.locator(id).click();
  await page.getByRole('option', { name, exact: true }).click();
}
test('editor workflows preserve machine data and preferences', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  await page.getByRole('button', { name: 'Select mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Pan mode', exact: true }).click();
  await page.locator('#canvas').dblclick({ position: { x: 1100, y: 180 } });
  await expect(page.locator('#state-name')).toBeVisible();
  await page.locator('#state-name').fill('NEW_STATE');
  await page.locator('#state-name').press('Enter');
  await expect(page.locator('#state-name')).toHaveValue('NEW_STATE');
  await page.locator('#state-name').fill('cancel me');
  await page.locator('#state-name').press('Escape');
  await expect(page.locator('#state-name')).toHaveValue('NEW_STATE');
  await page.getByRole('button', { name: 'Close properties', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
  let data = JSON.parse(await page.locator('#export-preview').inputValue());
  expect(data.states.some((s) => s.name === 'NEW_STATE')).toBeTruthy();
  expect(data.format).toBe('lexica');
  expect(data.version).toBe(2);
  expect(data.type).toBe('standard');
  await choose(page, '#format', 'Vector diagram (.svg)');
  await expect(page.getByRole('img', { name: 'Main graph SVG preview' })).toBeVisible();
  await choose(page, '#format', 'LaTeX / TikZ (.tex)');
  await expect(page.locator('#export-preview')).toHaveValue(/documentclass/);
  await page.getByRole('button', { name: 'Close Export your machine', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Simplified view', { exact: true }).check();
  await page.getByLabel('Show skipped tokens', { exact: true }).check();
  await page.getByRole('radio', { name: /Stack automaton/ }).check();
  await page.getByRole('radio', { name: 'Light mode', exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  await expect(page.locator('#tokens .token')).toHaveCount(5);
  await page.getByRole('button', { name: 'Manage stack alphabet', exact: true }).click();
  const memory = page.getByRole('dialog', { name: 'Stack alphabet', exact: true });
  await expect(memory.getByLabel('Enum value 1', { exact: true })).toHaveValue('S');
  for (const [i, name] of [
    [2, 'OPEN'],
    [3, 'BLOCK'],
  ]) {
    await memory.getByRole('button', { name: 'Add enum value', exact: true }).click();
    await expect(memory.getByLabel(`Enum value ${i}`, { exact: true })).toBeFocused();
    await memory.getByLabel(`Enum value ${i}`, { exact: true }).fill(name);
    await memory.getByLabel(`Enum value ${i}`, { exact: true }).press('Enter');
  }
  await memory.getByLabel('Initial stack symbol (S)', { exact: true }).click();
  await page.getByRole('option', { name: 'BLOCK', exact: true }).click();
  await expect(memory.getByLabel('Initial stack symbol (S)', { exact: true })).toHaveText('BLOCK');
  await expect(memory.getByRole('button', { name: 'Add stack', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('stack-alphabet.png') });
  await page.getByRole('button', { name: 'Close Stack alphabet', exact: true }).click();
  await page.locator('#input').fill('hello 42+');
  await expect(page.locator('#error-count')).toHaveText('1 error');
  await page.getByRole('button', { name: 'Next error', exact: true }).click();
  await expect
    .poll(() => page.locator('#input').evaluate((e) => [e.selectionStart, e.selectionEnd]))
    .toEqual([8, 9]);
  await page.getByRole('button', { name: 'Start debugging', exact: true }).click();
  await expect(page.locator('#step-status')).toBeVisible();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('button', { name: 'Stop debugging', exact: true }).last().click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Simplified view', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  await page.locator('#canvas').focus();
  await page.keyboard.press('Control+a');
  const startPoint = await page.locator('#canvas').evaluate((canvas) => {
    const t = canvas.getContext('2d').getTransform();
    const machine = JSON.parse(localStorage.getItem('lexica-machine'));
    const start = machine.states.find((state) => state.id === machine.start);
    return { x: t.e + start.x * t.a, y: t.f + start.y * t.a };
  });
  await page.locator('#canvas').click({ button: 'right', position: startPoint });
  await page.getByRole('menuitem', { name: 'Group states', exact: true }).click();
  await page.locator('#group-name').fill('My group');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await choose(page, '#layout-mode', 'Tree');
  await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Arrange graph', exact: true })).toHaveCount(0, {
    timeout: 20000,
  });
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('#input')).toHaveValue('hello 42+');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')));
  expect(saved.type).toBe('stack');
  expect(saved.stack).toEqual({ alphabet: ['S', 'OPEN', 'BLOCK'], initial: 'BLOCK' });
  expect(saved.tester).toEqual({ input: 'hello 42+', showSkipped: true });
  await expect(page.locator('#tokens .token')).toHaveCount(4);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
  await page.locator('#import-json').fill('{broken');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(page.locator('#import-error')).not.toBeEmpty();
  await page.locator('#import-json').fill(fs.readFileSync('fixtures/portal_machine.json', 'utf8'));
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Import machine', exact: true })).toHaveCount(0);
  await page.locator('#input').fill('hello 42');
  await expect(page.locator('#error-count')).toHaveText('0 errors');
  await page.screenshot({ path: testInfo.outputPath('verified.png') });
  expect(errors).toEqual([]);
});

test('debugger docks above the input and can be moved back out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start debugging', exact: true }).click();
  await expect(page.locator('#step-status')).toBeVisible();
  const grip = await page.locator('#debugger-grip').boundingBox();
  const slot = await page.locator('#tester-debugger-slot').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#tester-debugger-slot #step-status')).toBeVisible();
  const checkLayout = async (horizontal) => {
    const input = await page.locator('.input-wrap').boundingBox();
    const output = await page.locator('#tokens').boundingBox();
    const panel = await page.locator('.tester').boundingBox();
    const debuggerBox = await page.locator('#tester-debugger-slot .debugger-window').boundingBox();
    expect(debuggerBox.y + debuggerBox.height).toBeLessThan(input.y);
    expect(input.height).toBeCloseTo(output.height);
    expect(output.y + output.height).toBeLessThan(panel.y + panel.height);
    expect(input.height).toBeGreaterThan(40);
    if (horizontal) expect(input.width).toBeCloseTo(output.width);
    expect(
      await page
        .locator('#tester-debugger-slot .debugger-window')
        .evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true);
  };
  await checkLayout(false);
  await page.locator('#tester-grip').press('ArrowDown');
  await expect(page.locator('body')).toHaveAttribute('data-tester-dock', 'bottom');
  await expect
    .poll(async () => (await page.locator('.input-wrap').boundingBox()).height)
    .toBeGreaterThan(40);
  await checkLayout(true);
  await page.locator('#debugger-grip').press('ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-debugger-dock', 'top');
  await expect(page.locator('#tester-debugger-slot #step-status')).toHaveCount(0);
});

test('token tooltip is centered over the pointer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  const input = await page.locator('#input').boundingBox();
  const x = input.x + 20;
  const y = input.y + 18;
  await page.mouse.move(x, y);
  const tooltip = page.locator('.input-token-hover');
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box.x + box.width / 2).toBeCloseTo(x, 0);
  expect(box.y + box.height).toBeLessThan(y);
});
