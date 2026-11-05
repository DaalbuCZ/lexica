export const isStackMachine = (m) =>
  m.machineType === 'extended' || (m.machineType === undefined && !!m.stack);
export const stackDefinition = (m) => m.stack ?? { alphabet: ['S'], initial: 'S' };
export function validateStack(m) {
  const stack = stackDefinition(m);
  if (
    !stack ||
    !Array.isArray(stack.alphabet) ||
    !stack.alphabet.length ||
    stack.alphabet.some((s) => typeof s !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) ||
    new Set(stack.alphabet).size !== stack.alphabet.length ||
    !stack.alphabet.includes(stack.initial)
  )
    throw Error('Define unique ASCII enum names and choose an initial stack symbol.');
  for (const e of m.edges)
    if (
      e.stackRules !== undefined &&
      (!Array.isArray(e.stackRules) ||
        e.stackRules.some(
          (r) =>
            !r ||
            !stack.alphabet.includes(r.top) ||
            !Array.isArray(r.replace) ||
            r.replace.some((s) => !stack.alphabet.includes(s)),
        ))
    )
      throw Error('Stack rules must use symbols from the memory enum.');
}
// Omitted rules mean A -> A for every symbol, never for an empty stack.
export const stackRules = (m, e) =>
  e.stackRules?.length
    ? e.stackRules
    : stackDefinition(m).alphabet.map((top) => ({ top, replace: [top] }));
export const memoryRuleLabel = (r) =>
  `${r.top} → ${
    !r.replace.length
      ? '(pop)'
      : r.replace.length === 1 && r.replace[0] === r.top
        ? '(keep)'
        : r.replace.length === 2 && r.replace[0] === r.top
          ? '(push) ' + r.replace[1]
          : r.replace.join(' ')
  }`;
export function renameStackSymbol(machine, index, name) {
  const stack = (machine.stack ??= structuredClone(stackDefinition(machine)));
  name = name.trim();
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
    stack.alphabet.some((value, i) => i !== index && value === name)
  )
    throw Error('Use a unique ASCII name with letters, digits and underscores.');
  const old = stack.alphabet[index];
  stack.alphabet[index] = name;
  if (stack.initial === old) stack.initial = name;
  for (const edge of machine.edges)
    for (const rule of edge.stackRules ?? []) {
      if (rule.top === old) rule.top = name;
      rule.replace = rule.replace.map((value) => (value === old ? name : value));
    }
}
export function removeStackSymbol(machine, index) {
  const stack = (machine.stack ??= structuredClone(stackDefinition(machine)));
  const value = stack.alphabet[index];
  if (stack.alphabet.length === 1) throw Error('Keep at least one enum value.');
  if (
    machine.edges.some((edge) =>
      edge.stackRules?.some((rule) => rule.top === value || rule.replace.includes(value)),
    )
  )
    throw Error('Remove this value from transition rules before deleting it.');
  stack.alphabet.splice(index, 1);
  if (stack.initial === value) stack.initial = stack.alphabet[0];
}
export function stackAction(rule) {
  if (!rule.replace.length) return 'pop';
  if (rule.replace.length === 1)
    return rule.replace[0] === rule.top ? 'keep' : 'replace:' + rule.replace[0];
  if (rule.replace.length === 2 && rule.replace[0] === rule.top) return 'push:' + rule.replace[1];
  return 'sequence';
}
export function setStackAction(rule, action) {
  if (action === 'pop') rule.replace = [];
  else if (action === 'keep') rule.replace = [rule.top];
  else if (action.startsWith('push:')) rule.replace = [rule.top, action.slice(5)];
  else if (action.startsWith('replace:')) rule.replace = [action.slice(8)];
}

export const stackRuleSuffix = (e) =>
  e.stackRules?.length ? ' · ' + e.stackRules.map(memoryRuleLabel).join(' OR ') : '';
export const copyStackRules = (e) =>
  JSON.stringify({ kind: 'lexica-stack-rules', rules: e.stackRules ?? [] });
export function pasteStackRules(e, text) {
  if (text.length > 1000000) throw Error('Clipboard is too large.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error('Copy stack rules from a transition first.');
  }
  if (data?.kind !== 'lexica-stack-rules' || !Array.isArray(data.rules))
    throw Error('Copy stack rules from a transition first.');
  e.stackRules = data.rules;
}
