import { destination, isAccepting, matcher, validate } from './lexer.js';

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
  if (
    machine.edges.some(
      (e) =>
        (!e.guardDisabled && (e.guard || e.guards?.length)) ||
        (!e.effectDisabled && (e.effect || e.effects?.length)),
    )
  )
    throw Error(
      'The academic finite automaton format cannot represent memory conditions or actions.',
    );
  const names = new Map(machine.states.map((state, i) => [state.id, `q${i}`]));
  const sets = machine.edges.map(rangesFor);
  const alphabet = [];
  for (const [a, b] of sets.flat().sort((a, b) => a[0] - b[0])) {
    const last = alphabet.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else alphabet.push([a, b]);
  }
  const rules = machine.edges.flatMap((edge, i) => {
    const from = names.get(edge.from),
      to = names.get(destination(machine, edge).id);
    if (!sets[i].length) return [];
    if (sets[i].length === 1 && sets[i][0][0] === sets[i][0][1])
      return [`  ${from} ${symbol(sets[i][0][0])} → ${to}`];
    return [`  ${from} a → ${to}  for each a ∈ ${set(sets[i])}`];
  });
  return [
    'M = (Q, Σ, R, s, F)',
    `Q = {${[...names.values()].join(', ')}}`,
    `Σ = ${set(alphabet)}`,
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
    'Character sets abbreviate individual rules pa → q. Groups and portals are flattened.',
    'This describes the automaton graph; token names, skip flags and lexer match priority are not part of M.',
    '',
  ].join('\n');
}
