import { test, expect } from '@playwright/test';
import { example } from '../src/core/lexer.js';
import { machineDocument } from '../src/core/machine-file.js';
import { createGroup } from '../src/core/groups.js';
import { enablePortal } from '../src/core/portals.js';

for (const type of ['standard', 'stack']) {
  test(`${type} machine file imports from txt and survives reload with the complete graph`, async ({
    page,
  }) => {
    const machine = example();
    machine.machineType = type === 'stack' ? 'extended' : 'fsm';
    machine.stack = { alphabet: ['BOTTOM', 'STRING'], initial: 'BOTTOM' };
    machine.tester = { input: 'hello 42', showSkipped: true };
    machine.edges[0].bend = { x: 13, y: -21 };
    enablePortal(machine, machine.edges[0]);
    createGroup(machine, ['s1', 's2'], 'Tokens', () => 'token-group');
    machine.comments = [{ id: 'note', text: 'Keep this comment', nodeIds: ['s1'], x: 200, y: 100 }];
    const document = machineDocument(machine);
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'fsm.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(page.getByRole('dialog', { name: 'Import machine', exact: true })).toHaveCount(0);
    await expect(page.locator('#input')).toHaveValue('hello 42');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')).version))
      .toBe(2);
    await page.reload();
    await expect(page.locator('#input')).toHaveValue('hello 42');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
    const saved = JSON.parse(await page.locator('#export-preview').inputValue());
    for (const key of [
      'format',
      'version',
      'type',
      'start',
      'states',
      'edges',
      'groups',
      'comments',
      'tester',
      'stack',
      'labelBoxes',
    ])
      expect(saved[key]).toEqual(document[key]);
  });
}
