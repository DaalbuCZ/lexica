import test from 'node:test';
import assert from 'node:assert/strict';
import { example, parseMachine, tokenize } from '../src/core/lexer.js';
import { machineDocument, serializeMachine } from '../src/core/machine-file.js';
import { convertLegacyStack } from '../src/core/legacy-stack.js';
import { createGroup } from '../src/core/groups.js';
import { enablePortal } from '../src/core/portals.js';

test('versioned machine files retain complete graph, layout, tester and dormant stack settings', () => {
  for (const machineType of ['fsm', 'extended']) {
    const m = example();
    m.machineType = machineType;
    m.stack = { alphabet: ['BOTTOM', 'STRING'], initial: 'BOTTOM' };
    m.edges[0].stackRules = [{ top: '!STRING', replace: ['*', 'STRING'] }];
    m.edges[0].bend = { x: 12, y: -34 };
    m.edges[0].groupBend = { x: 10, y: 20 };
    enablePortal(m, m.edges[0]);
    createGroup(m, ['s1', 's2'], 'Numbers and identifiers', () => 'group');
    m.comments = [{ id: 'comment', text: 'Unicode comment: ž', nodeIds: ['s1'], x: 42, y: 54 }];
    m.startViews = [{ x: 100, y: 200, targets: ['s1'] }];
    m.routingPolicy = 'corridor';
    m.drawingRoutes = [{ view: 'main', key: 'saved-route', routes: [{ x: 1, y: 2 }] }];
    m.tester = { input: 'hello 42\n', showSkipped: true };
    const doc = machineDocument(m);
    assert.equal(doc.format, 'lexica');
    assert.equal(doc.version, 2);
    assert.equal(doc.type, machineType === 'fsm' ? 'standard' : 'stack');
    assert.equal(doc.machineType, undefined);
    assert.equal(doc.cells, undefined);
    const restored = parseMachine(serializeMachine(m));
    assert.deepEqual(restored, m);
    assert.deepEqual(tokenize(restored, m.tester.input), tokenize(m, m.tester.input));
    doc.states[0].x = -1;
    assert.notEqual(m.states[0].x, -1);
  }
});
test('machine files reject unknown versions, incomplete data and invalid enum rules', () => {
  const doc = machineDocument(example());
  for (const change of [
    (d) => (d.version = 999),
    (d) => (d.format = 'other'),
    (d) => (d.type = 'other'),
    (d) => delete d.tester,
    (d) => delete d.states,
    (d) => (d.type = 'stack'),
    (d) => {
      d.stack = { alphabet: ['S'], initial: 'other' };
    },
    (d) => (d.edges[0].stackRules = [{ top: 'missing', replace: [] }]),
  ]) {
    const copy = structuredClone(doc);
    change(copy);
    assert.throws(() => parseMachine(JSON.stringify(copy)));
  }
  assert.deepEqual(parseMachine(JSON.stringify(example())), example());
});
function legacy() {
  const m = example();
  m.machineType = 'extended';
  m.cells = [{ name: 's', type: 'stack', initial: [] }];
  m.edges = [
    {
      from: 's0',
      to: 's1',
      label: 'a',
      guard: { cell: 's', op: 'empty' },
      effect: { cell: 's', op: 'push', value: 1 },
    },
    {
      from: 's0',
      to: 's1',
      label: 'b',
      guard: { cell: 's', op: '==', value: 1 },
      effect: { cell: 's', op: 'pop' },
    },
    {
      from: 's0',
      to: 's1',
      label: 'c',
      guard: { cell: 's', op: '!=', value: 1 },
      guards: [{ cell: 's', op: 'empty' }],
      guardMode: 'any',
    },
  ];
  return m;
}
test('legacy stack conversion preserves empty behavior, OR conditions and numeric push/pop', () => {
  const old = legacy(),
    before = structuredClone(old);
  const m = convertLegacyStack(old, { 1: 'STRING' });
  assert.deepEqual(old, before);
  assert.deepEqual(m.stack, { alphabet: ['BOTTOM', 'STRING'], initial: 'BOTTOM' });
  assert.deepEqual(
    tokenize(m, 'abc').map((t) => t.memoryAfter.stack),
    [['BOTTOM', 'STRING'], ['BOTTOM'], ['BOTTOM']],
  );
  assert.deepEqual(tokenize(m, 'b')[0].memoryAfter.stack, ['BOTTOM']);
  assert.equal(tokenize(m, 'b')[0].token, 'ERROR');
  assert.deepEqual(parseMachine(JSON.stringify(old)).stack.alphabet, ['BOTTOM', 'VALUE_1']);
  assert.ok(!serializeMachine(old).includes('"cells"'));
});
test('legacy conversion rejects unsupported memory instead of silently dropping behavior', () => {
  for (const change of [
    (m) => m.cells.push({ name: 'counter', initial: 0 }),
    (m) => (m.edges[0].effect.op = 'clear'),
    (m) => (m.cells[0].initial = [1]),
    (m) =>
      (m.edges[0].effects = [
        { cell: 's', op: 'pop' },
        { cell: 's', op: 'pop' },
        { cell: 's', op: 'pop' },
      ]),
  ]) {
    const m = legacy();
    change(m);
    assert.throws(() => convertLegacyStack(m));
  }
});
