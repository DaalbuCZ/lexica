import { groupWidth, tokenCaption } from './labels.js';
import { curvePoint, curveAvoidsBox, routeBounds } from './route-geometry.js';
import { SpatialIndex } from './spatial-index.js';
import { commentLayout } from './comments.js';
import { segmentHitsBox } from './label-guides.js';

export const renderedLabelBox = (l) => ({
  left: l.x - l.w / 2,
  right: l.x + l.w / 2,
  top: l.y - 4 - 12 * (l.scale ?? 1),
  bottom: l.y - 4 + 12 * (l.scale ?? 1),
});
export function sizedTransitionRoutes(machine, routes, scale = 1) {
  if (scale === 1) return routes;
  return reflowRouteLabels(
    machine,
    routes.map((route) => ({
      ...route,
      label: { ...route.label, w: route.label.w * scale, scale },
    })),
    undefined,
    false,
    scale,
  );
}
const expand = (box, n) => ({
  left: box.left - n,
  right: box.right + n,
  top: box.top - n,
  bottom: box.bottom + n,
});

function labelObstacles(machine, routes, placement, scale) {
  const obstacles = new SpatialIndex();
  machine.states.forEach((s, i) => {
    const half = !placement && s.group ? groupWidth(s) / 2 + 11 : 47;
    obstacles.set(i, { left: s.x - half, right: s.x + half, top: s.y - 47, bottom: s.y + 47 });
    const caption = tokenCaption(s, scale);
    if (caption) obstacles.set('token:' + i, caption);
  });
  (machine.comments ?? []).forEach((c, i) => {
    const { w, h } = commentLayout(c);
    obstacles.set('comment:' + i, { left: c.x, right: c.x + w, top: c.y, bottom: c.y + h });
  });
  routes.forEach((r, i) => {
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
  return obstacles;
}

export function transitionLabelCollisions(machine, routes, scale = 1) {
  const obstacles = labelObstacles(machine, routes, false, scale);
  let collisions = 0;
  if (scale > 1)
    machine.states.forEach((state, i) => {
      const caption = tokenCaption(state, scale);
      if (caption)
        collisions += obstacles
          .query(caption)
          .filter((key) =>
            typeof key === 'number'
              ? key !== i
              : key.startsWith('token:') && Number(key.slice(6)) < i,
          ).length;
    });
  routes.forEach(({ label }, i) => {
    const box = expand(renderedLabelBox(label), 4);
    collisions += obstacles.query(box).length;
    obstacles.set('label:' + i, box);
  });
  return collisions;
}

export function reflowRouteLabels(
  machine,
  routes,
  dirty = new Set(routes.keys()),
  placement = false,
  scale = 1,
) {
  const obstacles = labelObstacles(machine, routes, placement, scale),
    captions = new SpatialIndex(),
    wires = new SpatialIndex();
  routes.forEach((r, i) => {
    wires.set(i, routeBounds(r));
    if (!dirty.has(i) || machine.edges[i]?.bend) captions.set(i, renderedLabelBox(r.label));
  });
  for (const i of [...dirty].sort((a, b) => routes[b].label.w - routes[a].label.w || a - b)) {
    const route = routes[i];
    if (machine.edges[i]?.bend) continue;
    const loop = machine.edges[i]?.from === machine.edges[i]?.to;
    let best = route.label,
      bestCost = Infinity;
    let bestOverlaps = Infinity;
    const offer = (label, preference, gap, anchor) => {
      const box = renderedLabelBox(label),
        padded = expand(box, 4),
        near = expand(box, Math.max(8, gap));
      const nodeOverlaps = obstacles.query(padded).length,
        labelOverlaps = captions.query(padded).length;
      let cost =
        nodeOverlaps * 100000 +
        labelOverlaps * 10000 +
        wires.query(near).reduce((sum, j) => {
          if (j === i) return sum;
          if (!curveAvoidsBox(routes[j], padded)) return sum + 2000;
          return sum + (!curveAvoidsBox(routes[j], near) ? 250 : 0);
        }, 0) +
        preference;
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
        cost += Math.min(shortest, 200);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestOverlaps = nodeOverlaps + labelOverlaps;
        best = label;
      }
    };
    if (loop) offer(route.label, 30, 8, curvePoint(route, 0.5));
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]) {
      if (bestCost === 0) break;
      const p = curvePoint(route, t),
        a = curvePoint(route, t - 0.01),
        b = curvePoint(route, t + 0.01);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy) || 1;
      const halfHeight = 12 * (route.label.scale ?? 1),
        nx = -dy / length,
        ny = dx / length,
        half = (Math.abs(nx) * route.label.w) / 2 + Math.abs(ny) * halfHeight;
      // Prefer a clear position on the owning curve; obstacle/caption/wire penalties still dominate.
      offer({ ...route.label, x: p.x, y: p.y + 4 }, Math.abs(t - 0.5) * 20, 8);
      for (const gap of [5, 14, 30, 55]) {
        if (bestCost < gap * 2) break;
        const offsets = [
          { x: -nx * (half + gap), y: -ny * (half + gap) },
          { x: nx * (half + gap), y: ny * (half + gap) },
        ];
        if (loop && !placement && t === 0.5)
          offsets.push({ x: 0, y: -halfHeight - gap }, { x: 0, y: halfHeight + gap });
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
    // Wide labels can often fit just above or below an edge, even when both
    // perpendicular offsets would send them into neighboring nodes.
    if (scale > 1 && bestOverlaps)
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const p = curvePoint(route, t);
        for (const gap of [8, 28, 60, 100]) {
          for (const offset of [-1, 1]) {
            const y = p.y + offset * (12 * scale + gap);
            offer({ ...route.label, x: p.x, y: y + 4 }, 50 + gap * 2, gap, p);
          }
          if (!bestOverlaps) break;
        }
        if (!bestOverlaps) break;
      }
    routes[i] = { ...route, label: best };
    captions.set(i, renderedLabelBox(best));
  }
  return routes;
}

export function clearNodeLabels(machine, routes, placement = false) {
  return reflowRouteLabels(machine, routes, undefined, placement);
}
