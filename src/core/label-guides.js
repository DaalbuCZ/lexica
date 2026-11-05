import { curvePoint } from './route-geometry.js';
const guides = new WeakMap();
// Minimize distance to the label rectangle, allowing attachment on any side.
export function labelGuide(route) {
  if (guides.has(route)) return guides.get(route);
  const center = { x: route.label.x, y: route.label.y - 4 };
  const halfWidth = route.label.w / 2 + 2,
    halfHeight = 13;
  const closest = (p) => ({
    x: Math.max(center.x - halfWidth, Math.min(center.x + halfWidth, p.x)),
    y: Math.max(center.y - halfHeight, Math.min(center.y + halfHeight, p.y)),
  });
  const distance = (t) => {
    const p = curvePoint(route, t),
      from = closest(p);
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
  const to = curvePoint(route, (low + high) / 2),
    from = closest(to);
  const guide = Math.hypot(to.x - from.x, to.y - from.y) > 0.01 ? { from, to } : null;
  guides.set(route, guide);
  return guide;
}
