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
            (r.top !== '*' && !stack.alphabet.includes(r.top)) ||
            !Array.isArray(r.replace) ||
            r.replace.some((s) => !stack.alphabet.includes(s) && !(r.top === '*' && s === '*')),
        ))
    )
      throw Error('Stack rules must use symbols from the memory enum.');
}
// Any is shorthand only: execution and scientific export see concrete IFJ rules.
// A '*' in an Any replacement denotes the matched top, preserving keep/push semantics.
export function stackRules(machine, edge) {
  const alphabet = stackDefinition(machine).alphabet;
  if (!edge.stackRules?.length) return alphabet.map((top) => ({ top, replace: [top] }));
  return edge.stackRules.flatMap((rule) =>
    rule.top === '*'
      ? alphabet.map((top) => ({
          top,
          replace: rule.replace.map((symbol) => (symbol === '*' ? top : symbol)),
        }))
      : [rule],
  );
}
function actionLabel(rule) {
  const action = stackAction(rule);
  if (action === 'keep') return '';
  if (action === 'pop') return 'pop';
  if (action.startsWith('push:')) return 'push ' + action.slice(5);
  if (action.startsWith('replace:')) return 'replace ' + action.slice(8);
  return 'replace ' + rule.replace.join(' ');
}
export const memoryRuleLabel = (rule) =>
  (rule.top === '*' ? '(any)' : rule.top) + (actionLabel(rule) ? ' → ' + actionLabel(rule) : '');
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

// Presentation only: group equivalent actions without changing rule order or execution.
export function stackRuleSuffix(edge) {
  const groups = new Map();
  for (const rule of edge.stackRules ?? []) {
    const action = actionLabel(rule);
    if (!groups.has(action)) groups.set(action, []);
    const tops = groups.get(action);
    const top = rule.top === '*' ? '(any)' : rule.top;
    if (!tops.includes(top)) tops.push(top);
  }
  return groups.size
    ? ' · ' +
        [...groups]
          .map(([action, tops]) => tops.join(', ') + (action ? ' → ' + action : ''))
          .join(' OR ')
    : '';
}
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
