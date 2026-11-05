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
export const memoryRuleLabel = (r) => `${r.top} → ${r.replace.join(' ') || 'ε'}`;
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
