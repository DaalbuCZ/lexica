export const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const routePoints = (r) => [r.p0, r.c1, r.c2, r.p3];
export function routeBounds(r, padding = 0) {
  const points = routePoints(r);
  return {
    left: Math.min(...points.map((p) => p.x)) - padding,
    right: Math.max(...points.map((p) => p.x)) + padding,
    top: Math.min(...points.map((p) => p.y)) - padding,
    bottom: Math.max(...points.map((p) => p.y)) + padding,
  };
}
export function finishRoute(r) {
  r.d = `M ${r.p0.x} ${r.p0.y} C ${r.c1.x} ${r.c1.y}, ${r.c2.x} ${r.c2.y}, ${r.p3.x} ${r.p3.y}`;
  return r;
}
export function curvePoint(r, t) {
  const a = mix(r.p0, r.c1, t),
    b = mix(r.c1, r.c2, t),
    c = mix(r.c2, r.p3, t);
  return mix(mix(a, b, t), mix(b, c, t), t);
}
// Box/control-hull subdivision is conservative, including endpoint contacts.
export function curveAvoidsBox(r, box, depth = 0) {
  const b = routeBounds(r);
  if (b.right < box.left || b.left > box.right || b.bottom < box.top || b.top > box.bottom)
    return true;
  if (depth === 12) return false;
  const a = mix(r.p0, r.c1, 0.5),
    c = mix(r.c1, r.c2, 0.5),
    d = mix(r.c2, r.p3, 0.5),
    e = mix(a, c, 0.5),
    f = mix(c, d, 0.5),
    g = mix(e, f, 0.5);
  return (
    curveAvoidsBox({ p0: r.p0, c1: a, c2: e, p3: g }, box, depth + 1) &&
    curveAvoidsBox({ p0: g, c1: f, c2: d, p3: r.p3 }, box, depth + 1)
  );
}
