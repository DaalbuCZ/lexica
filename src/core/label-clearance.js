import { curvePoint } from './route-geometry.js';
export const renderedLabelBox = (l) => ({
  left: l.x - l.w / 2,
  right: l.x + l.w / 2,
  top: l.y - 16,
  bottom: l.y + 8,
});
const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
// Labels can move independently. Never sacrifice a node's legibility merely
// to reduce label-to-label congestion or keep a caption on its midpoint.
export function clearNodeLabels(machine, routes) {
  const obstacles = machine.states.map((s) => ({
    left: s.x - 47,
    right: s.x + 47,
    top: s.y - 47,
    bottom: s.y + 47,
  }));
  for (const [index, route] of routes.entries()) {
    if (machine.edges[index]?.bend) continue;
    if (!obstacles.some((box) => overlaps(renderedLabelBox(route.label), box))) continue;
    let chosen;
    for (const shift of [-64, 64, -96, 96, -144, 144, -208, 208]) {
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const p = curvePoint(route, t),
          label = { ...route.label, x: p.x, y: p.y + shift };
        if (!obstacles.some((box) => overlaps(renderedLabelBox(label), box))) {
          chosen = label;
          break;
        }
      }
      if (chosen) break;
    }
    if (chosen) route.label = chosen;
  }
  return routes;
}

// Reflow only affected captions around the current connection, including when
// full obstacle routing is disabled or a manually bent wire must stay intact.
export function reflowRouteLabels(machine, routes, dirty) {
  const obstacles = machine.states.map((s) => ({
    left: s.x - 47,
    right: s.x + 47,
    top: s.y - 47,
    bottom: s.y + 47,
  }));
  for (const i of dirty) {
    const route = routes[i];
    if (!route?.label) continue;
    const dx = route.p3.x - route.p0.x,
      dy = route.p3.y - route.p0.y,
      length = Math.hypot(dx, dy) || 1;
    let best = route.label,
      bestHits = Infinity,
      bestScore = Infinity;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8])
      for (const offset of [-20, 20, -40, 40, -64, 64, -96, 96]) {
        const p = curvePoint(route, t),
          label = {
            ...route.label,
            x: p.x - (dy / length) * offset,
            y: p.y + (dx / length) * offset,
          },
          box = renderedLabelBox(label),
          hits = obstacles.filter((b) => overlaps(box, b)).length,
          score =
            routes.reduce(
              (sum, r, j) => sum + (j !== i && overlaps(box, renderedLabelBox(r.label)) ? 500 : 0),
              0,
            ) +
            Math.abs(t - 0.5) * 10 +
            Math.abs(offset) * 0.01;
        if (hits < bestHits || (hits === bestHits && score < bestScore)) {
          best = label;
          bestHits = hits;
          bestScore = score;
        }
      }
    routes[i] = { ...route, label: best };
  }
  return routes;
}
