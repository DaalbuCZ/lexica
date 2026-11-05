import { destination, isAccepting, matcher, validate } from './lexer.js';
import { memoryRuleLabel, stackCell } from './memory.js';

// IFJ, Modely pro regulární jazyky, slide 7: M = (Q, Σ, R, s, F).
// Enumerate the finite Unicode input domain, compressing consecutive symbols.
const characterSets = new Map();
function rangesFor(edge) {
  const key = JSON.stringify([edge.label, !!edge.invert]);
  if (characterSets.has(key)) return characterSets.get(key);
  const accepts = matcher(edge.label, edge.invert),
    ranges = [];
  let start = null;
  for (let code = 0; code <= 0x110000; code++) {
    const matches = code < 0x110000 && accepts(String.fromCodePoint(code));
    if (matches && start === null) start = code;
    if (!matches && start !== null) {
      ranges.push([start, code - 1]);
      start = null;
    }
  }
  if (characterSets.size >= 128) characterSets.clear();
  characterSets.set(key, ranges);
  return ranges;
}
function symbol(code) {
  return code >= 33 && code <= 126
    ? JSON.stringify(String.fromCodePoint(code))
    : 'U+' + code.toString(16).toUpperCase().padStart(4, '0');
}
function set(ranges) {
  return ranges.length
    ? '{' +
        ranges.map(([a, b]) => (a === b ? symbol(a) : `${symbol(a)}…${symbol(b)}`)).join(', ') +
        '}'
    : '∅';
}
export function toAcademic(machine) {
  validate(machine);
  if (!machine.start) throw Error('Choose a start state before exporting a finite automaton.');
  const extended =
    machine.machineType !== 'fsm' &&
    (machine.machineType === 'extended' ||
      machine.cells?.length ||
      machine.edges.some((e) => e.guard || e.guards?.length || e.effect || e.effects?.length));
  const cells = new Map((machine.cells ?? []).map((cell) => [cell.name, cell]));
  const guardText = (guard) => {
    const label = memoryRuleLabel(guard);
    return stackCell(cells.get(guard.cell)) && !['empty', 'notEmpty'].includes(guard.op)
      ? label.replace(guard.cell, `top(${guard.cell})`)
      : label;
  };
  const names = new Map(machine.states.map((state, i) => [state.id, `q${i}`]));
  const sets = machine.edges.map(rangesFor);
  const alphabet = [];
  for (const [a, b] of sets.flat().sort((a, b) => a[0] - b[0])) {
    const last = alphabet.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else alphabet.push([a, b]);
  }
  const aliases = new Map();
  const rules = machine.edges.flatMap((edge, i) => {
    const from = names.get(edge.from),
      to = names.get(destination(machine, edge).id);
    if (!sets[i].length) return [];
    let input;
    if (sets[i].length === 1 && sets[i][0][0] === sets[i][0][1]) input = symbol(sets[i][0][0]);
    else {
      const value = set(sets[i]);
      if (!aliases.has(value)) aliases.set(value, `A${aliases.size + 1}`);
      input = aliases.get(value);
    }
    const guards =
      !extended || edge.guardDisabled
        ? []
        : [...(edge.guard ? [edge.guard] : []), ...(edge.guards ?? [])];
    const actions =
      !extended || edge.effectDisabled
        ? []
        : [...(edge.effect ? [edge.effect] : []), ...(edge.effects ?? [])];
    const condition = guards.length
      ? ` [${guards.map(guardText).join(edge.guardMode === 'any' ? ' ∨ ' : ' ∧ ')}]`
      : '';
    const effect = actions.length ? ` / ${actions.map(memoryRuleLabel).join('; ')}` : '';
    return [`  ${from} ${input}${condition}${effect} → ${to}`];
  });
  return [
    extended
      ? 'M = (Q, Σ, R, s, F, C, μ₀) — IFJ notation extended with memory'
      : 'M = (Q, Σ, R, s, F)',
    `Q = {${[...names.values()].join(', ')}}`,
    `Σ = ${set(alphabet)}`,
    ...[...aliases].map(([value, name]) => `${name} = ${value}`),
    ...(extended
      ? [
          `C = {${[...cells.values()].map((cell) => `${cell.name}: ${stackCell(cell) ? 'stack' : 'counter'}`).join(', ')}}`,
          `μ₀ = {${[...cells.values()].map((cell) => `${cell.name} = ${JSON.stringify(cell.initial ?? (stackCell(cell) ? [] : 0))}`).join(', ')}}`,
        ]
      : []),
    rules.length ? `R = {\n${rules.join(',\n')}\n}` : 'R = ∅',
    `s = ${names.get(machine.start)}`,
    `F = {${machine.states
      .filter(isAccepting)
      .map((state) => names.get(state.id))
      .join(', ')}}`,
    '',
    'State names:',
    ...machine.states.map(
      (state) =>
        `${names.get(state.id)} = ${JSON.stringify(state.name)} (id ${JSON.stringify(state.id)})`,
    ),
    '',
    'Notation: U+XXXX denotes a Unicode character; … includes every code point between the endpoints.',
    'p A [guard] / actions → q abbreviates one rule for each character in A. Omitted guard = true; omitted actions = identity.',
    ...(extended
      ? [
          'Guards read memory before the transition. Actions run left to right, atomically. A failed pop disables the transition.',
          'Stacks are listed bottom to top; comparisons use top(stack) and fail on an empty stack. Counters are safe integers.',
          'μ₀ initializes memory for the input. Successful tokens carry memory forward. Disabled memory rules are omitted.',
        ]
      : []),
    'Groups and portals are flattened.',
    'This describes the automaton graph; token names, skip flags and longest-match tokenization are not part of M.',
    '',
  ].join('\n');
}
