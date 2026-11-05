import test from 'node:test';
import assert from 'node:assert/strict';
import { reflowRouteLabels } from '../src/core/label-clearance.js';
import { labelGuidesFor, segmentHitsBox } from '../src/core/label-guides.js';
const route = (x, y, endX, endY, label) => ({
  p0: { x, y },
  c1: { x, y },
  c2: { x: endX, y: endY },
  p3: { x: endX, y: endY },
  label,
});
test('a clear on-curve label is preferred over an offset position', () => {
  const m = { states: [], edges: [{ from: 'a', to: 'b' }] };
  const [r] = reflowRouteLabels(m, [route(0, 0, 300, 0, { x: 150, y: -35, w: 60 })]);
  assert.equal(r.label.x, 150);
  assert.equal(r.label.y, 4);
});
test('on-curve preference never beats a clear alternative when a node occupies that position', () => {
  const m = {
    states: [{ id: 'obstacle', x: 150, y: 0, name: 'O' }],
    edges: [{ from: 'a', to: 'b' }],
  };
  const [r] = reflowRouteLabels(m, [route(0, 0, 500, 0, { x: 150, y: -35, w: 60 })]);
  assert.ok(r.label.x - 30 > 197 || r.label.x + 30 < 103 || Math.abs(r.label.y - 4) > 59);
});
test('guides avoid intervening labels and nodes while keeping side-midpoint attachments', () => {
  const routes = [
    route(0, 0, 300, 0, { x: 150, y: 140, w: 100 }),
    route(400, 0, 500, 0, { x: 150, y: 75, w: 160 }),
  ];
  const m = { states: [{ id: 'block', name: 'Block', x: 150, y: 36 }], edges: [{}, {}] };
  const guides = labelGuidesFor(m, routes),
    guide = guides[0];
  assert.ok(guide);
  assert.ok(
    [
      { x: 100, y: 136 },
      { x: 200, y: 136 },
      { x: 150, y: 125 },
      { x: 150, y: 147 },
    ].some((p) => p.x === guide.from.x && p.y === guide.from.y),
  );
  for (let i = 1; i < guide.points.length; i++) {
    assert.equal(
      segmentHitsBox(guide.points[i - 1], guide.points[i], {
        left: 70,
        right: 230,
        top: 60,
        bottom: 82,
      }),
      false,
    );
    assert.equal(
      segmentHitsBox(guide.points[i - 1], guide.points[i], {
        left: 113,
        right: 187,
        top: -1,
        bottom: 73,
      }),
      false,
    );
  }
});
test('an enclosing obstacle suppresses an unsafe guide', () => {
  const m = { states: [], edges: [{}, {}] };
  const routes = [
    route(0, 0, 100, 0, { x: 50, y: 150, w: 40 }),
    route(200, 0, 300, 0, { x: 50, y: 150, w: 200 }),
  ];
  assert.equal(labelGuidesFor(m, routes)[0], null);
});

test('a guide detours around a label that blocks every direct connection', () => {
  const m = { states: [], edges: [{}, {}] };
  const routes = [
    route(0, 0, 100, 0, { x: 50, y: 150, w: 40 }),
    route(400, 0, 500, 0, { x: 50, y: 75, w: 200 }),
  ];
  const guide = labelGuidesFor(m, routes)[0];
  assert.ok(guide && guide.points.length > 2);
  for (let i = 1; i < guide.points.length; i++)
    assert.equal(
      segmentHitsBox(guide.points[i - 1], guide.points[i], {
        left: -50,
        right: 150,
        top: 60,
        bottom: 82,
      }),
      false,
    );
});
