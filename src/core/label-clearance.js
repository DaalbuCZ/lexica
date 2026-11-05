import { groupWidth, tokenCaption } from './labels.js';
import { curvePoint, curveAvoidsBox, routeBounds } from './route-geometry.js';
import { SpatialIndex } from './spatial-index.js';
import { commentLayout } from './comments.js';
import { segmentHitsBox } from './label-guides.js';

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
    const loop = machine.edges[i]?.from === machine.edges[i]?.to;
    const searchLoopPocket = loop && !placement;
    let best = route.label,
      bestCost = Infinity,
      bestNeedsDetour = false;
    const offer = (label, preference, gap, anchor, tight = false) => {
      const box = renderedLabelBox(label),
        padded = tight ? box : expand(box, 4),
        near = expand(box, Math.max(8, gap));
      let needsDetour = false;
      let cost =
        obstacles.query(padded).length * 100000 +
        captions.query(padded).length * 10000 +
        wires.query(near).reduce((sum, j) => {
          if (j === i) return sum;
          if (!curveAvoidsBox(routes[j], padded)) return sum + 2000;
          return sum + (!curveAvoidsBox(routes[j], near) ? (tight ? 8 : 250) : 0);
        }, 0) +
        preference;
      if (tight && cost >= 2000) return;
      // A displaced loop label is easier to follow when its guide can run
      // straight to the loop. Keep on-curve placements and clearance first.
      if (loop && !placement && anchor && cost < bestCost && curveAvoidsBox(route, box)) {
        const sides = [
          { x: box.left, y: label.y - 4, faces: anchor.x <= box.left },
          { x: box.right, y: label.y - 4, faces: anchor.x >= box.right },
          { x: label.x, y: box.top, faces: anchor.y <= box.top },
          { x: label.x, y: box.bottom, faces: anchor.y >= box.bottom },
        ];
        const shortest = sides.reduce((best, side) => {
          if (!side.faces) return best;
          const length = Math.hypot(side.x - anchor.x, side.y - anchor.y);
          if (length >= best) return best;
          const span = {
            left: Math.min(side.x, anchor.x),
            right: Math.max(side.x, anchor.x),
            top: Math.min(side.y, anchor.y),
            bottom: Math.max(side.y, anchor.y),
          };
          for (const index of [obstacles, captions])
            if (
              index
                .query(span)
                .some((key) => segmentHitsBox(side, anchor, index.items.get(key).box))
            )
              return best;
          return length;
        }, Infinity);
        needsDetour = !Number.isFinite(shortest);
        cost += Math.min(shortest, 200);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = label;
        bestNeedsDetour = needsDetour;
      }
    };
    if (loop) offer(route.label, 30, 8, curvePoint(route, 0.5));
    const samples = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
    for (const t of samples) {
      if (bestCost === 0) break;
      const p = curvePoint(route, t),
        a = curvePoint(route, t - 0.01),
        b = curvePoint(route, t + 0.01);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length,
        ny = dx / length,
        half = (Math.abs(nx) * route.label.w) / 2 + Math.abs(ny) * 12;
      // Prefer a clear position on the owning curve; obstacle/caption/wire penalties still dominate.
      offer({ ...route.label, x: p.x, y: p.y + 4 }, Math.abs(t - 0.5) * 20, 8);
      for (const gap of [5, 14, 30, 55]) {
        if (bestCost < gap * 2) break;
        const offsets = [
          { x: -nx * (half + gap), y: -ny * (half + gap) },
          { x: nx * (half + gap), y: ny * (half + gap) },
        ];
        if (searchLoopPocket && t === 0.5)
          offsets.push({ x: 0, y: -12 - gap }, { x: 0, y: 12 + gap });
        for (const offset of offsets) {
          offer(
            { ...route.label, x: p.x + offset.x, y: p.y + offset.y + 4 },
            30 +
              gap * 2 +
              Math.abs(t - 0.5) * 20 +
              Math.hypot(p.x + offset.x - route.label.x, p.y + offset.y + 4 - route.label.y) *
                0.035,
            gap,
            p,
          );
        }
      }
    }
    // A narrow pocket can still fit a loop label with its edge on the curve.
    // Keep the full label box clear, and only trade padding for a guide-free fit.
    if (searchLoopPocket && bestNeedsDetour) {
      for (let step = 3; step <= 17; step++) {
        const t = step / 20;
        const p = curvePoint(route, t);
        for (const shift of [0, -0.2, 0.2, -0.4, 0.4]) {
          offer(
            { ...route.label, x: p.x + shift * route.label.w, y: p.y + 4 },
            28 + Math.abs(t - 0.5) * 20 + Math.abs(shift) * 12,
            8,
            null,
            true,
          );
        }
      }
    }
    routes[i] = { ...route, label: best };
    captions.set(i, renderedLabelBox(best));
  }
  return routes;
}

export function clearNodeLabels(machine, routes, placement = false) {
  return reflowRouteLabels(machine, routes, undefined, placement);
}
