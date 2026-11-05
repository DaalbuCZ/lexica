import test from 'node:test';
import assert from 'node:assert/strict';
import { lexerSteps, tokenize, validate, matcher, toTikz } from '../src/core/lexer.js';
import { toAcademic } from '../src/core/academic-export.js';
import { copyStackRules, pasteStackRules } from '../src/core/memory.js';
import { createTokenizationCache } from '../src/core/lexer-cache.js';
import { createDebugSession } from '../src/core/debug-session.js';
import { createWorkerHandler } from '../src/core/lexer-worker.js';
export function stackMachine() {
  return {
    machineType: 'extended',
    start: 'a',
    stack: { alphabet: ['S', 'OPEN'], initial: 'S' },
    states: [
      ['a', ''],
      ['b', 'TOKEN'],
    ].map(([id, token], x) => ({ id, name: id, token, x: x * 100, y: 0 })),
    edges: [
      {
        from: 'a',
        to: 'b',
        label: '\\(',
        stackRules: [
          { top: 'S', replace: ['S', 'OPEN'] },
          { top: 'OPEN', replace: ['OPEN', 'OPEN'] },
        ],
      },
      { from: 'a', to: 'b', label: '\\)', stackRules: [{ top: 'OPEN', replace: [] }] },
      { from: 'a', to: 'b', label: 'x', stackRules: [{ top: 'S', replace: [] }] },
    ],
  };
}
test('one enum stack replaces top atomically, OR alternatives work, empty stack blocks', () => {
  const m = stackMachine(),
    before = structuredClone(m),
    frames = [...lexerSteps(m, '(())xx')];
  assert.deepEqual(
    frames.filter((f) => f.result).map((f) => f.memory.stack),
    [['S', 'OPEN'], ['S', 'OPEN', 'OPEN'], ['S', 'OPEN'], ['S'], [], []],
  );
  assert.equal(frames.filter((f) => f.result).at(-1).token, 'ERROR');
  assert.deepEqual(frames[0].memory.stack, ['S']);
  assert.deepEqual(m, before);
  assert.match(toTikz(m), / OR /);
  assert.ok(toTikz(m).includes('\\ensuremath{\\rightarrow}'));
  assert.ok(toTikz(m).includes('\\ensuremath{\\varepsilon}'));
});
test('enum validates alphabet, initial symbol and every replacement', () => {
  for (const change of [
    (m) => (m.stack.alphabet = []),
    (m) => m.stack.alphabet.push('S'),
    (m) => m.stack.alphabet.push('é'),
    (m) => (m.stack.initial = 'missing'),
    (m) => (m.stack.initial = []),
    (m) => (m.edges[0].stackRules[0].top = 'missing'),
    (m) => (m.edges[0].stackRules[0].replace = [7]),
    (m) => (m.edges[0].stackRules = {}),
  ]) {
    const m = stackMachine();
    change(m);
    assert.throws(() => validate(m));
  }
});
test('stack lookahead rolls back and caches and workers agree across edits', () => {
  const m = stackMachine();
  m.states.push({ id: 'c', name: 'c', token: '', x: 200, y: 0 });
  m.edges.push({ from: 'b', to: 'c', label: 'z', stackRules: [{ top: 'OPEN', replace: [] }] });
  assert.deepEqual(
    tokenize(m, '(z)').map((t) => t.memoryAfter.stack),
    [['S', 'OPEN'], ['S', 'OPEN'], ['S']],
  );
  const cache = createTokenizationCache(tokenize),
    worker = createWorkerHandler();
  for (const input of ['()x', '(()', '(z)', '()xx', '((()))']) {
    assert.deepEqual(cache.get(m, input), tokenize(m, input));
    assert.deepEqual(worker({ id: 1, machine: m, input }).tokens, tokenize(m, input));
  }
  m.stack.initial = 'OPEN';
  assert.deepEqual(cache.get(m, ')'), tokenize(m, ')'));
  m.edges[1].stackRules[0].replace = ['S'];
  assert.deepEqual(cache.get(m, ')'), tokenize(m, ')'));
});
test('debugger seeks and restores stack snapshots', () => {
  const session = createDebugSession(stackMachine(), '()');
  assert.deepEqual(session.seek(1).memory.stack, ['S', 'OPEN']);
  assert.deepEqual(session.next().memory.stack, ['S']);
  assert.deepEqual(session.seek(0).memory.stack, ['S']);
});
test('IFJ export uses stack rules and ASCII input with no epsilon transitions', () => {
  const m = stackMachine(),
    text = toAcademic(m);
  assert.match(text, /M = \(Q, Σ, Γ, R, s, S, F\)/);
  assert.match(text, /Γ = \{S, OPEN\}/);
  assert.match(text, /OPEN q0 "\)" → ε q1/);
  assert.match(text, /S q0 "\(" → S OPEN q1/);
  assert.match(text, /ASCII/);
  m.edges[0].label = '';
  assert.throws(() => tokenize(m, '('), /empty/);
});
test('ambiguity identifies conflicting OR alternatives', () => {
  const m = stackMachine();
  m.edges[0].stackRules.push({ top: 'S', replace: [] });
  assert.throws(() => tokenize(m, '('), /Ambiguous/);
});
test('ASCII domain includes controls and DEL and excludes Unicode even for complements', () => {
  for (const expression of ['[\\s\\S]', '[^a]', '\\D']) {
    const match = matcher(expression);
    assert.equal(match('é'), false);
    assert.equal(match('😀'), false);
    assert.equal(match('\x7f'), true);
  }
  assert.equal(matcher('a', true)('é'), false);
  assert.equal(matcher('[\\s\\S]')('\0'), true);
  for (const expression of ['é', '\\u0080', '\\u{1F600}', '\\xFF'])
    assert.throws(() => matcher(expression), /ASCII/);
});
test('stack clipboard copies alternatives and rejects unknown enum values on validation', () => {
  const m = stackMachine(),
    target = m.edges[1];
  pasteStackRules(target, copyStackRules(m.edges[0]));
  assert.deepEqual(target.stackRules, m.edges[0].stackRules);
  assert.throws(() => pasteStackRules(target, 'broken'), /Copy stack rules/);
  pasteStackRules(
    target,
    JSON.stringify({ kind: 'lexica-stack-rules', rules: [{ top: 'unknown', replace: [] }] }),
  );
  assert.throws(() => validate(m), /enum/);
});
