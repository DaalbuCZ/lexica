export function tokenColorClass(name) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return `token-color-${hash % 10}`;
}
