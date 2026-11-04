import { memoryRuleLabel } from './memory.js';
const STORAGE_KEY = 'lexica-editor-settings';
export function readEditorSettings(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(STORAGE_KEY) || '{}');
    const sensitivity = Number(saved.pinchSensitivity);
    return {
      groupPresentation: saved.groupPresentation === 'overlay' ? 'overlay' : 'canvas',
      simplified: saved.simplified === true,
      followDebugState: saved.followDebugState !== false,
      pinchSensitivity: Number.isFinite(sensitivity) ? Math.max(0.2, Math.min(2, sensitivity)) : 1,
    };
  } catch {
    return {
      groupPresentation: 'canvas',
      simplified: false,
      followDebugState: true,
      pinchSensitivity: 1,
    };
  }
}
export const editorSettings = readEditorSettings();
export function simpleCharacterClass(label, inverted = false) {
  if (!label)
    return {
      characters: '',
      inverted,
    };
  if (label === '.') return null;
  const match = label.match(/^\[((?:\\[\s\S]|[^\]\\])*)\]$/u);
  if (match) {
    const negated = match[1].startsWith('^');
    return {
      characters: negated ? match[1].slice(1) : match[1],
      inverted: inverted !== negated,
    };
  }
  // Only one regex atom can be represented by a character set. Concatenation
  // such as abc must never silently become [abc] when switching views.
  if (
    /^\\(?:[dDsSwWnrtfv]|[\\.^$|?*+()[\]{}\/\-]|x[\da-fA-F]{2}|u[\da-fA-F]{4}|u\{[\da-fA-F]+\})$/u.test(
      label,
    )
  )
    return {
      characters: label,
      inverted,
    };
  if ([...label].length === 1 && !/[.^$|?*+()[\]{}\\]/u.test(label))
    return {
      characters: label,
      inverted,
    };
  return null;
}
export function characterClassExpression(characters) {
  return `[${characters}]`;
}
export function simpleTransitionLabel(edge) {
  const set = simpleCharacterClass(edge.label, edge.invert),
    match = set ? `${set.inverted ? 'not ' : ''}${set.characters || '…'}` : edge.label || '…';
  const guards = edge.guardDisabled
    ? []
    : [...(edge.guard ? [edge.guard] : []), ...(edge.guards ?? [])];
  return (
    match +
    (guards.length
      ? ' · ' + guards.map(memoryRuleLabel).join(edge.guardMode === 'any' ? ' OR ' : ' AND ')
      : '') +
    (edge.effectDisabled
      ? ''
      : [...(edge.effect ? [edge.effect] : []), ...(edge.effects ?? [])]
          .map((a) => ' · ' + memoryRuleLabel(a))
          .join(''))
  );
}
