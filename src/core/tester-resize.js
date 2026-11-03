export function testerSize(value, side, width, height) {
  const vertical = side === 'left' || side === 'right',
    limit = vertical ? width : height,
    min = Math.min(vertical ? 220 : 140, limit * 0.5),
    max = Math.max(min, limit - 240);
  return Math.round(
    Math.max(min, Math.min(Number.isFinite(value) ? value : vertical ? 320 : 190, max)),
  );
}
