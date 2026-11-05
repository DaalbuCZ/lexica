import { destination, isAccepting, matcher, validate } from './lexer.js';
import { isStackMachine, stackDefinition, stackRules } from './memory.js';

// IFJ, Modely pro regulární jazyky, slide 7: M = (Q, Σ, R, s, F).
// All input sets are restricted to ASCII.
const characterSets = new Map();
function rangesFor(edge, limit = 128) {
  const key = JSON.stringify([edge.label, !!edge.invert, limit]);
  if (characterSets.has(key)) return characterSets.get(key);
  const accepts = matcher(edge.label, edge.invert),
    ranges = [];
  let start = null;
  for (let code = 0; code <= limit; code++) {
    const matches = code < limit && accepts(String.fromCodePoint(code));
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
    : '0x' + code.toString(16).toUpperCase().padStart(2, '0');
}
function set(ranges) {
  return ranges.length
    ? '{' +
        ranges.map(([a, b]) => (a === b ? symbol(a) : `${symbol(a)}..${symbol(b)}`)).join(', ') +
        '}'
    : '{}';
}
export function toAcademic(machine) {
  validate(machine);
  if (!machine.start) throw Error('Choose a start state before exporting an automaton.');
  const extended = isStackMachine(machine),
    stack = stackDefinition(machine);
  const names = new Map(machine.states.map((state, i) => [state.id, `q${i}`]));
  const sets = machine.edges.map((edge) => rangesFor(edge));
  const alphabet = [];
  for (const [a, b] of sets.flat().sort((a, b) => a[0] - b[0])) {
    const last = alphabet.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else alphabet.push([a, b]);
  }
  const aliases = new Map();
  const expressions = new Map();
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
      if (!expressions.has(value)) expressions.set(value, new Set());
      expressions
        .get(value)
        .add(
          (edge.invert ? 'not (' + edge.label + ')' : edge.label).replace(/[\r\n]/g, (char) =>
            char === '\n' ? '\\n' : '\\r',
          ),
        );
    }
    return extended
      ? stackRules(machine, edge).map(
          (rule) => `  ${rule.top} ${from} ${input} → ${rule.replace.join(' ') || 'ε'} ${to}`,
        )
      : [`  ${from} ${input} → ${to}`];
  });
  return [
    extended ? 'M = (Q, Σ, Γ, R, s, S, F)' : 'M = (Q, Σ, R, s, F)',
    `Q = {${[...names.values()].join(', ')}}`,
    `Σ = ${set(alphabet)}`,
    ...[...aliases].map(
      ([value, name]) => `${name} = ${value} // ${[...expressions.get(value)].join('; ')}`,
    ),
    ...(extended ? [`Γ = {${stack.alphabet.join(', ')}}`, `S = ${stack.initial}`] : []),
    rules.length ? `R = {\n${rules.join(',\n')}\n}` : 'R = {}',
    `s = ${names.get(machine.start)}`,
    `F = {${machine.states
      .filter(isAccepting)
      .map((state) => names.get(state.id))
      .join(', ')}}`,
    '',
    'State names:',
    ...machine.states.map(
      (state) =>
        `${names.get(state.id)} = ${JSON.stringify(state.name).replace(/[^\x20-\x7e]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))}`,
    ),
    '',
    'Input domain: ASCII (0-127).',
    '0xNN denotes an ASCII code; .. includes every code between the endpoints.',
    ...(extended
      ? [
          'IFJ stack rules: A p a → w q, where A ∈ Γ, a ∈ Σ, and w ∈ Γ*.',
          'A rule replaces the top A with w. Stack sequences are bottom to top (rightmost on top).',
          'Every transition consumes one ASCII character; epsilon input transitions are not supported.',
          'An input alias abbreviates one rule per character; rules are alternatives (OR).',
          'Initial configuration: S s x. Acceptance: S s x ⇒* w f, f ∈ F (all input consumed).',
          'No rule applies to an empty stack. Omitted stack rules expand to A → A for every A ∈ Γ.',
        ]
      : ['p A → q abbreviates one rule for each character in A.']),
    'Groups and portals are flattened.',
    'This describes the automaton graph; token names, skip flags and longest-match tokenization are not part of M.',
    '',
  ].join('\n');
}
