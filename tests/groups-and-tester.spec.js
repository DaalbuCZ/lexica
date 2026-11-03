import { test, expect } from '@playwright/test';
import { example } from '../src/core/lexer.js';
import { createGroup, graphView } from '../src/core/groups.js';
import { routeEdges } from '../src/core/layout.js';
import { simpleTransitionLabel } from '../src/core/editor-settings.js';

test('overlay groups, memory rules, docking and large inputs remain interactive', async ({
  page,
}, testInfo) => {
  const machine = example();
  machine.machineType = 'extended';
  machine.cells = [{ name: 'stack', type: 'stack', initial: [] }];
  const group = createGroup(machine, new Set(['s1', 's2']), 'Tokens');
  await page.addInitScript((machine) => {
    localStorage.setItem('lexica-machine', JSON.stringify(machine));
    localStorage.setItem(
      'lexica-editor-settings',
      JSON.stringify({ groupPresentation: 'overlay', simplified: true, pinchSensitivity: 1 }),
    );
  }, machine);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#tokens .token')).toHaveCount(3);
  const diagram = graphView(machine),
    routes = routeEdges(diagram, (edge) =>
      edge.originalIndices?.length > 1
        ? `${edge.originalIndices.length} transitions`
        : simpleTransitionLabel(edge),
    );
  const camera = () =>
    page.locator('#canvas').evaluate((canvas) => {
      const t = canvas.getContext('2d').getTransform();
      return { x: t.e, y: t.f, scale: t.a };
    });
  let transform = await camera();
  const point = (p) => ({
    x: transform.x + p.x * transform.scale,
    y: transform.y + p.y * transform.scale,
  });
  await page
    .locator('#canvas')
    .click({ position: point(diagram.states.find((state) => state.id === group.id)) });
  await expect(page.locator('.group-overlay')).toBeVisible();
  await expect(page.locator('.group-overlay #canvas')).toHaveCount(1);
  await expect(page.locator('#group-overlay-title')).toHaveValue('Tokens');
  await page.locator('#group-overlay-title').fill('Renamed tokens');
  await page.locator('#group-overlay-title').press('Enter');
  await page.screenshot({ path: testInfo.outputPath('group-overlay.png') });
  await page.getByRole('button', { name: 'Close group', exact: true }).click();
  await expect(page.locator('.canvas-surface #canvas')).toHaveCount(1);
  transform = await camera();
  await page.locator('#canvas').click({ position: point(routes[0].label) });
  await page
    .getByRole('dialog', { name: 'Choose a transition to edit', exact: true })
    .getByRole('button', { name: /start → identifier/ })
    .click();
  await page.locator('#memory-rules summary').click();
  await page.getByLabel('Use a condition', { exact: true }).check();
  await page.getByRole('button', { name: 'Add condition', exact: false }).click();
  await expect(page.getByLabel('Combine conditions', { exact: true })).toBeVisible();
  await page.getByLabel('Combine conditions', { exact: true }).click();
  await page.getByRole('option', { name: 'Any condition (OR)', exact: true }).click();
  await page.getByLabel('Use a condition', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close properties', exact: true }).click();
  await page.locator('#toolbar-grip').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-toolbar-dock', 'right');
  await page.locator('#tester-grip').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('body')).toHaveAttribute('data-tester-dock', 'left');
  await page.locator('#tester-grip').press('ArrowDown');
  await page.locator('#input').fill('hello 42 '.repeat(2000));
  await expect(page.locator('#tokens')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(page.locator('#tokens')).toHaveClass('react-virtual-tokens');
  expect(await page.locator('#tokens .token').count()).toBeLessThan(250);
  await page.locator('#input').focus();
  await page.locator('#input').press('Control+End');
  await page.locator('#input').press('ArrowLeft');
  await page.locator('#input').press('ArrowLeft');
  await expect
    .poll(() => page.locator('#tokens').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(1000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  expect(errors).toEqual([]);
});
