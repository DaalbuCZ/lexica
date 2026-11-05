import { curvePoint } from './route-geometry.js';
const guides = new WeakMap(),
  onCurve = new WeakMap();
// Attach only at a side midpoint, choosing the shortest connection to this curve.
export function labelGuide(route) {
  if (guides.has(route)) return guides.get(route);
  const x = route.label.x,
    y = route.label.y - 4,
    halfWidth = route.label.w / 2,
    halfHeight = 11;
  for (let i = 0; i <= 40; i++) {
    const p = curvePoint(route, i / 40);
    if (Math.abs(p.x - x) <= halfWidth && Math.abs(p.y - y) <= halfHeight) {
      guides.set(route, null);
      return null;
    }
  }
  let guide = null,
    shortest = Infinity;
  for (const from of [
    { x: x - halfWidth, y },
    { x: x + halfWidth, y },
    { x, y: y - halfHeight },
    { x, y: y + halfHeight },
  ]) {
    const distance = (t) => {
      const p = curvePoint(route, t);
      return (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
    };
    let best = 0;
    for (let i = 1; i <= 40; i++) if (distance(i / 40) < distance(best)) best = i / 40;
    let low = Math.max(0, best - 1 / 40),
      high = Math.min(1, best + 1 / 40);
    for (let i = 0; i < 18; i++) {
      const a = low + (high - low) / 3,
        b = high - (high - low) / 3;
      if (distance(a) < distance(b)) high = b;
      else low = a;
    }
    const t = (low + high) / 2,
      length = distance(t);
    if (length < shortest) {
      shortest = length;
      guide = { from, to: curvePoint(route, t) };
    }
  }
  guides.set(route, guide);
  return guide;
}
// A display-only copy keeps routing, saved layout and the experimental toggle independent.
export function labelOnCurve(route) {
  if (!onCurve.has(route)) {
    const center = curvePoint(route, 0.5);
    onCurve.set(route, { ...route, label: { ...route.label, x: center.x, y: center.y + 4 } });
  }
  return onCurve.get(route);
}
