import test from 'node:test';
import assert from 'node:assert/strict';
import { curveClearance } from '../src/core/curve-clearance.js';
import { validateRouteSeparation } from '../src/core/layout-validation.js';
const line = (x, y, u, v) => ({
  p0: { x, y },
  c1: { x, y },
  c2: { x: u, y: v },
  p3: { x: u, y: v },
});
test('certifies separated curves but never certifies crossings or tangencies', () => {
  assert.equal(curveClearance(line(0, 0, 10, 10), line(0, 20, 10, 30)).status, 'clear');
  assert.equal(curveClearance(line(0, 0, 10, 10), line(0, 10, 10, 0)).status, 'unverified');
  assert.equal(curveClearance(line(0, 0, 10, 0), line(10, 0, 20, 0)).status, 'unverified');
});
test('clearance inflation and bounded work are conservative', () => {
  assert.equal(
    curveClearance(line(0, 0, 10, 0), line(0, 1, 10, 1), { clearance: 2 }).status,
    'unverified',
  );
  const result = curveClearance(line(0, 0, 10, 10), line(0, 10, 10, 0), { maxPairs: 2 });
  assert.equal(result.status, 'unverified');
  assert.ok(result.checks <= 2);
});
test('invalid input cannot receive a clearance certificate', () => {
  assert.equal(curveClearance(line(NaN, 0, 1, 1), line(0, 2, 1, 2)).status, 'unverified');
});

test('route validation includes loops, reciprocal lanes and incident curves', () => {
  const loop = {
    p0: { x: 0, y: 0 },
    c1: { x: -20, y: -40 },
    c2: { x: 20, y: -40 },
    p3: { x: 0, y: 0 },
  };
  const result = validateRouteSeparation([loop, line(-30, -20, 30, -20)]);
  assert.equal(result.status, 'unverified');
  assert.deepEqual(
    result.witnesses.map((w) => [w.first, w.second]),
    [[0, 1]],
  );
  assert.equal(validateRouteSeparation([line(0, 0, 20, 0), line(20, 4, 0, 4)]).status, 'clear');
});
