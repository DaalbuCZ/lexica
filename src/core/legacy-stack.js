// Explicit conversion for the former single numeric stack. Never silently discard memory behavior.
export function convertLegacyStack(source, names = {}) {
  const machine = structuredClone(source);
  if (machine.cells?.length !== 1 || machine.cells[0].type !== 'stack')
    throw Error('Conversion requires exactly one legacy stack and no counters.');
  const cell = machine.cells[0],
    values = new Set(cell.initial ?? []);
  for (const edge of machine.edges) {
    for (const rule of [
      edge.guard,
      ...(edge.guards ?? []),
      edge.effect,
      ...(edge.effects ?? []),
    ].filter(Boolean)) {
      if (rule.cell !== cell.name) throw Error('Rule references a different memory cell.');
      if (['push', '==', '!=', '>', '>=', '<', '<='].includes(rule.op)) values.add(rule.value);
      if (!['push', 'pop', '==', '!=', '>', '>=', '<', '<=', 'empty', 'notEmpty'].includes(rule.op))
        throw Error('Cannot convert legacy operation: ' + rule.op);
    }
  }
  if ((cell.initial ?? []).length) throw Error('This converter requires an initially empty stack.');
  const symbols = new Map(
    [...values].map((value) => {
      if (!Number.isSafeInteger(value)) throw Error('Legacy stack values must be safe integers.');
      return [value, names[value] ?? (value < 0 ? 'NEG_' + -value : 'VALUE_' + value)];
    }),
  );
  const bottom = names.bottom ?? 'BOTTOM';
  const tops = [null, ...values];
  const allows = (rule, top) => {
    if (rule.op === 'empty') return top === null;
    if (rule.op === 'notEmpty') return top !== null;
    if (top === null) return false;
    switch (rule.op) {
      case '==':
        return top === rule.value;
      case '!=':
        return top !== rule.value;
      case '>':
        return top > rule.value;
      case '>=':
        return top >= rule.value;
      case '<':
        return top < rule.value;
      case '<=':
        return top <= rule.value;
      default:
        throw Error('Unsupported stack condition.');
    }
  };
  for (const edge of machine.edges) {
    const guards = edge.guardDisabled ? [] : [edge.guard, ...(edge.guards ?? [])].filter(Boolean);
    const actions = edge.effectDisabled
      ? []
      : [edge.effect, ...(edge.effects ?? [])].filter(Boolean);
    const rules = [];
    for (const top of tops) {
      if (
        guards.length &&
        !(edge.guardMode === 'any'
          ? guards.some((g) => allows(g, top))
          : guards.every((g) => allows(g, top)))
      )
        continue;
      const symbol = top === null ? bottom : symbols.get(top);
      const replace = [symbol];
      let possible = true;
      for (const action of actions) {
        if (action.op === 'push') replace.push(symbols.get(action.value));
        else if (action.op === 'pop') {
          if (replace.at(-1) === bottom) {
            possible = false;
            break;
          }
          if (!replace.length)
            throw Error('Multiple pops cannot be represented by one top replacement.');
          replace.pop();
        } else throw Error('Unsupported stack action.');
      }
      if (possible) rules.push({ top: symbol, replace });
    }
    if (!rules.length)
      throw Error('A permanently disabled transition cannot be converted without removing it.');
    if (
      rules.length === tops.length &&
      rules.every((rule) => rule.replace.length === 1 && rule.replace[0] === rule.top)
    )
      delete edge.stackRules;
    else edge.stackRules = rules;
    for (const key of [
      'guard',
      'guards',
      'guardMode',
      'guardDisabled',
      'effect',
      'effects',
      'effectDisabled',
    ])
      delete edge[key];
  }
  delete machine.cells;
  machine.machineType = source.machineType === 'fsm' ? 'fsm' : 'extended';
  machine.stack = { alphabet: [bottom, ...symbols.values()], initial: bottom };
  return machine;
}
