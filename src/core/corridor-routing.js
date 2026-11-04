import { curveClearance } from './curve-clearance.js';
import { SpatialIndex } from './spatial-index.js';
import { mix, curvePoint, finishRoute, curveAvoidsBox, routeBounds } from './route-geometry.js';
import { commentLayout } from './comments.js';
import { renderedLabelBox, reflowRouteLabels } from './label-clearance.js';
import { bundleLanes, transitionBundles } from './graph-bundles.js';

const compare = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
export function corridorRoutes(machine, labels, { previous = null, dirty = null, onFailure } = {}) {
  for (const laneScale of [2, 1.5, 1]) {
    const routes = routeLanes(machine, labels, {
      previous,
      dirty,
      onFailure: laneScale === 1 ? onFailure : undefined,
      laneScale,
    });
    if (routes) return routes;
  }
  return null;
}
function routeLanes(machine, labels, { previous, dirty, onFailure, laneScale }) {
  const nodes = new Map(machine.states.map((s) => [s.id, s])),
    bundles = new Map(),
    routes = previous ? [...previous] : [],
    index = new SpatialIndex(),
    obstacles = new SpatialIndex();
  const frozen = new Set();
  for (const s of machine.states)
    obstacles.set(s.id, { left: s.x - 46, right: s.x + 46, top: s.y - 46, bottom: s.y + 46 });
  for (const [i, e] of machine.edges.entries()) {
    if (e.portal != null || e.bend || !nodes.has(e.from) || !nodes.has(e.to)) {
      if (!previous?.[i]) return null;
      frozen.add(i);
      continue;
    }
  }
  for (const bundle of transitionBundles(machine, (_, i) => !frozen.has(i)))
    bundles.set(JSON.stringify([bundle.a, bundle.b]), bundle.indices);
  if (previous)
    for (let i = 0; i < previous.length; i++)
      if (!dirty?.has(i) || frozen.has(i)) index.set(i, routeBounds(previous[i], 2));
  const ports = new Map(),
    rings = new Map(),
    lanes = new Map();
  for (const members of bundles.values()) {
    members.sort(
      (a, b) =>
        compare(machine.edges[a].from, machine.edges[b].from) ||
        compare(machine.edges[a].label, machine.edges[b].label) ||
        a - b,
    );
    for (const [i, lane] of bundleLanes(machine, members, laneScale)) lanes.set(i, lane);
    members.forEach((i) => {
      const e = machine.edges[i],
        a = nodes.get(e.from),
        b = nodes.get(e.to);
      if (a === b) return;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1,
        sign = compare(e.from, e.to) <= 0 ? 1 : -1,
        port = lanes.get(i).port,
        along = Math.sqrt(37 * 37 - port * port);
      for (const [s, forward, key] of [
        [a, 1, `${i}:a`],
        [b, -1, `${i}:b`],
      ]) {
        const angle = Math.atan2(
          (dy / len) * along * forward + (dx / len) * sign * port,
          (dx / len) * along * forward - (dy / len) * sign * port,
        );
        if (!rings.has(s.id)) rings.set(s.id, []);
        const base=(Math.atan2(dy*forward,dx*forward)+Math.PI*2)%(Math.PI*2);
        rings.get(s.id).push({ key,base,angle:base+Math.atan2(Math.sin(angle-base),Math.cos(angle-base)) });
      }
    });
  }
  for (const [id, ring] of rings) {
    ring.sort((a, b) => a.base-b.base || a.angle - b.angle || compare(a.key, b.key));
    const gap = Math.min(0.16, (Math.PI * 2) / (ring.length + 1));
    for (let pass = 0; pass < 64; pass++)
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length,
          delta = ring[j].angle + (j === 0 ? Math.PI * 2 : 0) - ring[i].angle;
        if (delta < gap) {
          const shift = (gap - delta) / 2;
          ring[i].angle -= shift;
          ring[j].angle += shift;
        }
      }
    const s = nodes.get(id);
    for (const p of ring)
      ports.set(p.key, { x: s.x + 37 * Math.cos(p.angle), y: s.y + 37 * Math.sin(p.angle) });
  }
  let conflict;
  const valid = (r, e) => {
    for (const id of obstacles.query(routeBounds(r))) {
      if (id === e.from || id === e.to) continue;
      if (!curveAvoidsBox(r, obstacles.items.get(id).box)) {
        conflict = { node: id };
        return false;
      }
    }
    for (const i of index.query(routeBounds(r, 2)))
      if (
        curveClearance(r, routes[i], { clearance: 2, maxPairs: 512, maxDepth: 24 }).status !==
        'clear'
      ) {
        conflict = { route: i };
        return false;
      }
    return true;
  };
  const ordered = [...bundles.values()].sort((a, b) => {
    const x = machine.edges[a[0]],
      y = machine.edges[b[0]];
    return (x.from === x.to) - (y.from === y.to) || compare(x.from, y.from) || compare(x.to, y.to);
  });
  for (const members of ordered) {
    members.sort(
      (a, b) =>
        compare(machine.edges[a].from, machine.edges[b].from) ||
        compare(machine.edges[a].label, machine.edges[b].label) ||
        a - b,
    );
    for (let lane = 0; lane < members.length; lane++) {
      const i = members[lane],
        e = machine.edges[i];
      if (previous && !dirty?.has(i)) continue;
      const a = nodes.get(e.from),
        b = nodes.get(e.to);
      let chosen = null;
      if (a !== b) {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          len = Math.hypot(dx, dy) || 1,
          // Directed bands occupy opposite sides, clockwise in screen space.
          sign = compare(e.from, e.to) <= 0 ? 1 : -1,
          offset = lanes.get(i).offset;
        for (const extra of laneScale === 1 ? [0, 8, 16] : [16, 8, 0]) {
          const shift = offset === 0 ? 0 : offset + Math.sign(offset) * extra;
          const nx = (-dy / len) * sign,
            ny = (dx / len) * sign,
            port = lanes.get(i).port,
            along = Math.sqrt(37 * 37 - port * port);
          const p0 = {
              x: a.x + (dx / len) * along + nx * port,
              y: a.y + (dy / len) * along + ny * port,
            },
            p3 = {
              x: b.x - (dx / len) * along + nx * port,
              y: b.y - (dy / len) * along + ny * port,
            },
            c1 = mix(a, b, 1 / 3),
            c2 = mix(a, b, 2 / 3);
          c1.x += nx * shift;
          c1.y += ny * shift;
          c2.x += nx * shift;
          c2.y += ny * shift;
          const r = { p0: ports.get(`${i}:a`) ?? p0, p3: ports.get(`${i}:b`) ?? p3, c1, c2 };
          if (extra === 0) {
            const reach = Math.min(100, len / 3);
            r.c1 = {
              x: r.p0.x + ((r.p0.x - a.x) / 37) * reach,
              y: r.p0.y + ((r.p0.y - a.y) / 37) * reach,
            };
            r.c2 = {
              x: r.p3.x + ((r.p3.x - b.x) / 37) * reach,
              y: r.p3.y + ((r.p3.y - b.y) / 37) * reach,
            };
          }
          if (valid(r, e)) {
            chosen = r;
            break;
          }
        }
      } else {
        // Rank all sectors by the distance from incident spokes before testing.
        const neighbors = machine.edges
          .filter((x) => x.from !== x.to && (x.from === a.id || x.to === a.id))
          .map((x) => nodes.get(x.from === a.id ? x.to : x.from))
          .filter(Boolean);
        const sectors = Array.from({ length: 32 }, (_, k) => (k * Math.PI) / 16).sort((x, y) => {
          const score = (t) =>
            Math.min(
              Math.PI,
              ...neighbors.map((n) =>
                Math.abs(
                  Math.atan2(
                    Math.sin(t - Math.atan2(n.y - a.y, n.x - a.x)),
                    Math.cos(t - Math.atan2(n.y - a.y, n.x - a.x)),
                  ),
                ),
              ),
            );
          return score(y) - score(x) || x - y;
        });
        for (const size of [72 + lane * 20, 96 + lane * 20, 128 + lane * 20]) {
          for (const angle of sectors) {
            const t = angle + Math.PI / 2,
              rotate = (x, y) => ({
                x: a.x + x * Math.cos(t) - y * Math.sin(t),
                y: a.y + x * Math.sin(t) + y * Math.cos(t),
              }),
              r = {
                p0: rotate(-22, -29),
                c1: rotate(-size, -size * 1.45),
                c2: rotate(size, -size * 1.45),
                p3: rotate(22, -29),
              };
            if (valid(r, e)) {
              chosen = r;
              break;
            }
          }
          if (chosen) break;
        }
      }
      if (!chosen) {
        onFailure?.({ index: i, edge: e, conflict });
        return null;
      }
      const center = curvePoint(chosen, 0.5);
      chosen.label = { x: center.x, y: center.y - 13, w: String(labels[i]).length * 7 + 14, h: 22 };
      routes[i] = finishRoute(chosen);
      index.set(i, routeBounds(chosen, 2));
    }
  }
  // Labels move independently from wires. Deterministic bounded candidates.
  const labelIndex = new SpatialIndex();
  if (previous)
    for (const i of frozen)
      if (dirty?.has(i)) routes[i] = { ...routes[i], label: { ...routes[i].label } };
  for (const [i, c] of (machine.comments ?? []).entries()) {
    const size = commentLayout(c);
    labelIndex.set(`comment:${i}`, {
      left: c.x,
      right: c.x + size.w,
      top: c.y,
      bottom: c.y + size.h,
    });
  }
  for (const s of machine.states)
    if (s.token && s.accepting !== false) {
      const w = (s.token.length + (s.skip ? 7 : 0)) * 5.5 + 8;
      labelIndex.set(`caption:${s.id}`, {
        left: s.x - w / 2,
        right: s.x + w / 2,
        top: s.y + 46,
        bottom: s.y + 60,
      });
    }
  if (previous)
    routes.forEach((r, i) => {
      if (!dirty?.has(i)) labelIndex.set(i, labelBox(r.label));
    });
  for (let i = 0; i < routes.length; i++) {
    if (previous && !dirty?.has(i)) continue;
    const r = routes[i];
    let best = r.label,
      bestScore = Infinity,
      bestNodeHits = Infinity;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8])
      for (const dy of [-13, 18, -30, 35, -64, 64, -96, 96]) {
        const p = curvePoint(r, t),
          label = { ...r.label, x: p.x, y: p.y + dy },
          box = labelBox(label);
        const nodeHits = obstacles.query(box).length;
        const score =
          labelIndex.query(box).length * 500 +
          index.query(box).filter((j) => j !== i && !curveAvoidsBox(routes[j], box)).length * 100 +
          Math.abs(t - 0.5) +
          Math.abs(dy + 13) * 0.01;
        if (nodeHits < bestNodeHits || (nodeHits === bestNodeHits && score < bestScore)) {
          best = label;
          bestScore = score;
          bestNodeHits = nodeHits;
        }
        if (score === 0 && nodeHits === 0) break;
      }
    r.label = best;
    labelIndex.set(i, labelBox(best));
  }
  return previous ? reflowRouteLabels(machine, routes, dirty ?? new Set()) : routes;
}
export function labelBox(l) {
  return renderedLabelBox(l);
}
