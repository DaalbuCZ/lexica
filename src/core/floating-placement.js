// Find the nearest on-screen position that does not cover a fixed control.
export function placeFloatingRect(desired, size, area, obstacles = [], gap = 10) {
  const left = area.left + gap,
    top = area.top + gap,
    right = Math.max(left, area.right - size.width - gap),
    bottom = Math.max(top, area.bottom - size.height - gap);
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const xValues = [
    desired.x,
    ...obstacles.flatMap((o) => [o.left - size.width - gap, o.right + gap]),
  ];
  const yValues = [
    desired.y,
    ...obstacles.flatMap((o) => [o.top - size.height - gap, o.bottom + gap]),
  ];
  let best = null;
  for (const rawX of xValues)
    for (const rawY of yValues) {
      const x = clamp(rawX, left, right),
        y = clamp(rawY, top, bottom);
      const overlap = obstacles.reduce(
        (sum, o) =>
          sum +
          Math.max(0, Math.min(x + size.width + gap, o.right) - Math.max(x - gap, o.left)) *
            Math.max(0, Math.min(y + size.height + gap, o.bottom) - Math.max(y - gap, o.top)),
        0,
      );
      const score = overlap * 100 + Math.hypot(x - desired.x, y - desired.y);
      if (!best || score < best.score)
        best = {
          x,
          y,
          score,
        };
    }
  return {
    x: best.x,
    y: best.y,
  };
}
