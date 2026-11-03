import { test, expect } from '@playwright/test';
import { example } from '../src/core/lexer.js';
import { createGroup, graphView } from '../src/core/groups.js';
import { routeEdges } from '../src/core/layout.js';
import { graphBounds, canvasTransform } from '../src/core/canvas-graph.js';
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
    ),
    bounds = graphBounds(diagram, routes);
  const rect = await page.locator('#canvas').boundingBox(),
    scale = Math.max(
      (bounds.width + 100) / Math.max(220, rect.width - 70),
      (bounds.height + 70) / Math.max(180, rect.height - 180),
    );
  const view = {
      x: bounds.x + bounds.width / 2 - (rect.width / 2) * scale,
      y: bounds.y + bounds.height / 2 - (rect.height / 2 + 20) * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    },
    transform = canvasTransform(view, rect.width, rect.height);
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
