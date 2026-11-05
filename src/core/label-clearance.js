import { groupWidth, tokenCaption } from './labels.js';
import { curvePoint, curveAvoidsBox, routeBounds } from './route-geometry.js';
import { SpatialIndex } from './spatial-index.js';
import { commentLayout } from './comments.js';

export const renderedLabelBox = (l) => ({
  left: l.x - l.w / 2,
  right: l.x + l.w / 2,
  top: l.y - 16,
  bottom: l.y + 8,
});
const expand = (box, n) => ({
  left: box.left - n,
  right: box.right + n,
  top: box.top - n,
  bottom: box.bottom + n,
});

export function reflowRouteLabels(
  machine,
  routes,
  dirty = new Set(routes.keys()),
  placement = false,
) {
  const obstacles = new SpatialIndex(),
    captions = new SpatialIndex(),
    wires = new SpatialIndex();
  machine.states.forEach((s, i) => {
    const half = !placement && s.group ? groupWidth(s) / 2 + 11 : 47;
    obstacles.set(i, { left: s.x - half, right: s.x + half, top: s.y - 47, bottom: s.y + 47 });
    const caption = tokenCaption(s);
    if (caption) obstacles.set('token:' + i, caption);
  });
  (machine.comments ?? []).forEach((c, i) => {
    const { w, h } = commentLayout(c);
    obstacles.set('comment:' + i, { left: c.x, right: c.x + w, top: c.y, bottom: c.y + h });
  });
  routes.forEach((r, i) => {
    wires.set(i, routeBounds(r));
    if (!dirty.has(i) || machine.edges[i]?.bend) captions.set(i, renderedLabelBox(r.label));
    if (r.portalBox) {
      const { x, y, w, h } = r.portalBox;
      obstacles.set('portal:' + i, {
        left: x - w / 2,
        right: x + w / 2,
        top: y - h / 2,
        bottom: y + h / 2,
      });
    }
  });
  for (const i of [...dirty].sort((a, b) => routes[b].label.w - routes[a].label.w || a - b)) {
    const route = routes[i];
    if (machine.edges[i]?.bend) continue;
    let best = route.label,
      bestCost = Infinity;
    const offer = (label, preference, gap) => {
      const box = renderedLabelBox(label),
        padded = expand(box, 4),
        near = expand(box, Math.max(8, gap));
      const cost =
        obstacles.query(padded).length * 100000 +
        captions.query(padded).length * 10000 +
        wires.query(near).reduce((sum, j) => {
          if (j === i) return sum;
          if (!curveAvoidsBox(routes[j], padded)) return sum + 2000;
          return sum + (!curveAvoidsBox(routes[j], near) ? 250 : 0);
        }, 0) +
        preference;
      if (cost < bestCost) {
        bestCost = cost;
        best = label;
      }
    };
    if (machine.edges[i]?.from === machine.edges[i]?.to) offer(route.label, 0, 8);
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]) {
      if (bestCost === 10) break;
      const p = curvePoint(route, t),
        a = curvePoint(route, t - 0.01),
        b = curvePoint(route, t + 0.01);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length,
        ny = dx / length,
        half = (Math.abs(nx) * route.label.w) / 2 + Math.abs(ny) * 12;
      for (const gap of [5, 14, 30, 55]) {
        if (bestCost < gap * 2) break;
        for (const side of [-1, 1]) {
          const offset = (half + gap) * side;
          offer(
            { ...route.label, x: p.x + nx * offset, y: p.y + ny * offset + 4 },
            gap * 2 +
              Math.abs(t - 0.5) * 20 +
              Math.hypot(p.x + nx * offset - route.label.x, p.y + ny * offset + 4 - route.label.y) *
                0.035,
            gap,
          );
        }
      }
      // A label may sit on its own wire when the free space beside it is tight.
      offer({ ...route.label, x: p.x, y: p.y + 4 }, 18 + Math.abs(t - 0.5) * 36, 8);
    }
    routes[i] = { ...route, label: best };
    captions.set(i, renderedLabelBox(best));
  }
  return routes;
}

export function clearNodeLabels(machine, routes, placement = false) {
  return reflowRouteLabels(machine, routes, undefined, placement);
}
