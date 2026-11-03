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
  await choose(page, '#format', 'Vector diagram (.svg)');
  await expect(page.locator('#export-preview')).toHaveValue(/<svg/);
  await choose(page, '#format', 'LaTeX / TikZ (.tex)');
  await expect(page.locator('#export-preview')).toHaveValue(/documentclass/);
  await page.getByRole('button', { name: 'Close Export your machine', exact: true }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Simplified view', { exact: true }).check();
  await page.getByLabel('Show skipped tokens', { exact: true }).check();
  await page.getByRole('radio', { name: /Extended FSM/ }).check();
  await page.getByRole('button', { name: 'Switch theme', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
  await expect(page.locator('#tokens .token')).toHaveCount(5);
  await page.getByRole('button', { name: 'Manage memory cells', exact: true }).click();
  await page.getByRole('button', { name: 'Add stack', exact: false }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Memory cells', exact: true })
      .getByLabel('Name', { exact: true }),
  ).toHaveValue('stack');
  await page
    .getByRole('dialog', { name: 'Memory cells', exact: true })
    .getByLabel('Name', { exact: true })
    .fill('memory');
  await page
    .getByRole('dialog', { name: 'Memory cells', exact: true })
    .getByLabel('Name', { exact: true })
    .press('Tab');
  await page.getByRole('button', { name: 'Close Memory cells', exact: true }).click();
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
  await page.getByRole('button', { name: 'Group selected states', exact: true }).click();
  await page.locator('#group-name').fill('My group');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await choose(page, '#layout-mode', 'Spring');
  await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Arrange graph', exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('#input')).toHaveValue('hello 42+');
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
