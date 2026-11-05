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
