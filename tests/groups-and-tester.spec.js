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
  machine.stack = { alphabet: ['BOTTOM', 'INTERPOLATION_EXPR'], initial: 'BOTTOM' };
  const group = createGroup(machine, new Set(['s1', 's2']), 'Tokens');
  await page.addInitScript((machine) => {
    if (localStorage.getItem('lexica-machine')) return;
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
  const diagram = graphView(machine);
  let routes = routeEdges(diagram, (edge) =>
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
    .dblclick({ position: point(diagram.states.find((state) => state.id === group.id)) });
  await expect(page.locator('.group-overlay')).toBeVisible();
  await expect(page.locator('.group-overlay #canvas')).toHaveCount(1);
  await expect(page.locator('#group-overlay-title')).toHaveValue('Tokens');
  await page.locator('#group-overlay-title').fill('Renamed tokens');
  await page.locator('#group-overlay-title').press('Enter');
  await page.screenshot({ path: testInfo.outputPath('group-overlay.png') });
  await page.getByRole('button', { name: 'Close group', exact: true }).click();
  await expect(page.locator('.canvas-surface #canvas')).toHaveCount(1);
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('lexica-machine')));
  routes = routeEdges(graphView(current), (edge) =>
    edge.originalIndices?.length > 1
      ? `${edge.originalIndices.length} transitions`
      : simpleTransitionLabel(edge),
  );
  transform = await camera();
  await page.locator('#canvas').dblclick({ position: point(routes[0].label) });
  await page
    .getByRole('dialog', { name: 'Choose a transition to edit', exact: true })
    .getByRole('button', { name: /start → identifier/ })
    .click();
  await page.locator('#memory-rules summary').click();
  await page.getByRole('button', { name: 'Add stack rule', exact: true }).click();
  await page.getByRole('button', { name: 'Add stack rule', exact: true }).click();
  await expect(page.locator('.stack-rule-or')).toHaveText('OR');
  await expect(page.getByLabel('Combine conditions', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Epsilon input (ε)')).toHaveCount(0);
  await page.getByLabel('Stack action 1', { exact: true }).click();
  await expect(page.getByRole('option', { name: 'BOTTOM', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: '(pop)', exact: true }).click();
  await expect(page.getByLabel('Stack action 1', { exact: true })).toHaveText('(pop)');
  await page.getByLabel('Stack action 1', { exact: true }).click();
  await page.getByRole('option', { name: '(keep)', exact: true }).click();
  await page.getByLabel('Stack action 2', { exact: true }).click();
  await page.getByRole('option', { name: 'push INTERPOLATION_EXPR', exact: true }).click();
  const overflowing = await page
    .locator('.stack-rule-row')
    .evaluateAll((rows) => rows.some((row) => row.scrollWidth > row.clientWidth + 1));
  expect(overflowing).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('stack-rules.png') });
  await page.getByRole('button', { name: 'Remove rule 2', exact: true }).click();
  await page.getByRole('button', { name: 'Remove rule 1', exact: true }).click();
  await page.getByRole('button', { name: 'Close properties', exact: true }).click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('lexica-editor-settings')).stackRulesOpen,
      ),
    )
    .toBe(true);
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
