import { curvePoint } from './route-geometry.js';
const guides = new WeakMap();
// Find the nearest part of this curve, then clip the guide to the label rectangle.
export function labelGuide(route) {
  if (guides.has(route)) return guides.get(route);
  const center = { x: route.label.x, y: route.label.y - 4 };
  const distance = (t) => {
    const p = curvePoint(route, t);
    return (p.x - center.x) ** 2 + (p.y - center.y) ** 2;
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
    dx = to.x - center.x,
    dy = to.y - center.y;
  const fraction = Math.min((route.label.w / 2 + 2) / Math.abs(dx), 13 / Math.abs(dy));
  const guide =
    fraction < 1
      ? { from: { x: center.x + dx * fraction, y: center.y + dy * fraction }, to }
      : null;
  guides.set(route, guide);
  return guide;
}
