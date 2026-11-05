import { drawingClearance } from './planar-layout.js';
import { placementCorridorRoutes } from './corridor-routing.js';
import { simpleTransitionLabel } from './editor-settings.js';

// Rebalance the first ring without inheriting the unequal radii of local
// branch compaction. Try both a polar warp and harmonic displacement; accept
// only a complete non-crossing drawing, then pin this ring during cleanup.
export function circularStartRing(machine) {
  const root = machine.states.find((s) => s.id === machine.start);
  if (!root) return machine.states;
  const ids = new Set(
    machine.edges
      .filter((e) => e.from === root.id && e.to !== root.id && e.portal == null)
      .map((e) => e.to),
  );
  const ring = machine.states
    .filter((s) => ids.has(s.id))
    .map((s) => ({
      s,
      angle: (Math.atan2(s.y - root.y, s.x - root.x) + Math.PI * 2) % (Math.PI * 2),
      radius: Math.hypot(s.x - root.x, s.y - root.y),
    }))
    .sort((a, b) => a.angle - b.angle || (a.s.id < b.s.id ? -1 : 1));
  if (ring.length < 4) return machine.states;
  const labels = machine.edges.map(simpleTransitionLabel),
    demand = Math.max(
      240,
      ...machine.edges.flatMap((e, i) => (e.from === root.id ? [labels[i].length * 7 + 100] : [])),
    ),
    minimum = Math.max(demand, 190 / (2 * Math.sin(Math.PI / ring.length))),
    radii = [minimum, minimum * 1.25, minimum * 1.6, minimum * 2];
  const adjacency = new Map(machine.states.map((s) => [s.id, new Set()]));
  for (const e of machine.edges)
    if (e.from !== e.to && adjacency.has(e.from) && adjacency.has(e.to)) {
      adjacency.get(e.from).add(e.to);
      adjacency.get(e.to).add(e.from);
    }
  const depth = new Map([[root.id, 0]]),
    queue = [root.id];
  for (let i = 0; i < queue.length; i++)
    for (const id of adjacency.get(queue[i]))
      if (!depth.has(id)) {
        depth.set(id, depth.get(queue[i]) + 1);
        queue.push(id);
      }
  let best = null,
    bestArea = Infinity;
  const remaining = new Set(machine.states.filter((s) => s.id !== root.id).map((s) => s.id)),
    branches = [];
  for (const id of remaining) {
    remaining.delete(id);
    const branch = [id];
    for (let i = 0; i < branch.length; i++)
      for (const next of adjacency.get(branch[i])) if (remaining.delete(next)) branch.push(next);
    branches.push(branch);
  }
  const initialArea =
    (Math.max(...machine.states.map((s) => s.x)) -
      Math.min(...machine.states.map((s) => s.x)) +
      160) *
    (Math.max(...machine.states.map((s) => s.y)) -
      Math.min(...machine.states.map((s) => s.y)) +
      160);
  for (const radius of radii)
    for (const mode of ['branches', 'polar', 'harmonic', 'translate']) {
      const targets = new Map(
        ring.map((p, i) => [
          p.s.id,
          {
            x:
              root.x +
              Math.cos(
                mode === 'translate' ? p.angle : ring[0].angle + (i * Math.PI * 2) / ring.length,
              ) *
                radius,
            y:
              root.y +
              Math.sin(
                mode === 'translate' ? p.angle : ring[0].angle + (i * Math.PI * 2) / ring.length,
              ) *
                radius,
          },
        ]),
      );
      const states = machine.states.map((s) => ({ ...s }));
      if (mode === 'branches') {
        const nodes = new Map(states.map((s) => [s.id, s]));
        for (const branch of branches) {
          const anchors = branch.filter((id) => targets.has(id));
          if (anchors.length === 1) {
            const anchor = { ...nodes.get(anchors[0]) },
              target = targets.get(anchor.id),
              others = branch.filter((id) => id !== anchor.id).map((id) => nodes.get(id));
            const cx = others.reduce((v, s) => v + s.x - anchor.x, 0),
              cy = others.reduce((v, s) => v + s.y - anchor.y, 0),
              angle = Math.atan2(target.y - root.y, target.x - root.x) - Math.atan2(cy, cx),
              cos = Math.cos(angle),
              sin = Math.sin(angle);
            for (const id of branch) {
              const s = nodes.get(id),
                x = s.x - anchor.x,
                y = s.y - anchor.y;
              s.x = target.x + x * cos - y * sin;
              s.y = target.y + x * sin + y * cos;
            }
          } else {
            // Fixed circle attachments, with the remaining local geometry
            // following the nearest attachment rather than a global warp.
            const owner = new Map(anchors.map((id) => [id, id])),
              queue = [...anchors];
            for (let i = 0; i < queue.length; i++)
              for (const next of adjacency.get(queue[i]))
                if (next !== root.id && !owner.has(next)) {
                  owner.set(next, owner.get(queue[i]));
                  queue.push(next);
                }
            const old = new Map(machine.states.map((s) => [s.id, s]));
            for (const id of branch) {
              const s = nodes.get(id),
                a = old.get(owner.get(id)),
                t = targets.get(a?.id);
              if (t) {
                s.x += t.x - a.x;
                s.y += t.y - a.y;
              }
            }
          }
        }
      } else if (mode !== 'harmonic')
        for (const s of states) {
          if (s.id === root.id) continue;
          const angle = (Math.atan2(s.y - root.y, s.x - root.x) + Math.PI * 2) % (Math.PI * 2);
          let i = ring.findLastIndex((p) => p.angle <= angle);
          if (i < 0) i = ring.length - 1;
          const j = (i + 1) % ring.length,
            start = ring[i].angle,
            end = ring[j].angle + (j === 0 ? Math.PI * 2 : 0),
            a = angle < start ? angle + Math.PI * 2 : angle,
            t = (a - start) / Math.max(1e-8, end - start),
            mapped =
              mode === 'translate' ? angle : ring[0].angle + ((i + t) * Math.PI * 2) / ring.length,
            localRadius = ring[i].radius * (1 - t) + ring[j].radius * t,
            r =
              mode === 'translate'
                ? Math.max(1, Math.hypot(s.x - root.x, s.y - root.y) + radius - localRadius)
                : (Math.hypot(s.x - root.x, s.y - root.y) * radius) / Math.max(1, localRadius);
          s.x = root.x + Math.cos(mapped) * r;
          s.y = root.y + Math.sin(mapped) * r;
        }
      else {
        let delta = new Map(
          machine.states.map((s) => {
            const p = targets.get(s.id);
            return [s.id, p ? { x: p.x - s.x, y: p.y - s.y } : { x: 0, y: 0 }];
          }),
        );
        for (let pass = 0; pass < 64; pass++) {
          const next = new Map(delta);
          for (const s of states)
            if (s.id !== root.id && !targets.has(s.id)) {
              const links = [...adjacency.get(s.id)].filter((id) => id !== root.id);
              if (!links.length) continue;
              next.set(s.id, {
                x: links.reduce((v, id) => v + delta.get(id).x, 0) / links.length,
                y: links.reduce((v, id) => v + delta.get(id).y, 0) / links.length,
              });
            }
          delta = next;
        }
        for (const s of states) {
          s.x += delta.get(s.id).x;
          s.y += delta.get(s.id).y;
        }
      }
      for (const s of states) if (targets.has(s.id)) Object.assign(s, targets.get(s.id));
      for (const s of states)
        if (mode === 'polar' && s.id !== root.id && !targets.has(s.id)) {
          const dx = s.x - root.x,
            dy = s.y - root.y,
            r = Math.hypot(dx, dy),
            desired = radius + 180 * Math.max(1, (depth.get(s.id) ?? 2) - 1);
          if (r < desired && r > 1e-8) {
            s.x = root.x + (dx * desired) / r;
            s.y = root.y + (dy * desired) / r;
          }
        }
      const c = drawingClearance(states, machine.edges);
      if (c.crossings || c.node < 1e-6 || c.wire < 1e-6) continue;
      const scale = Math.max(1, 176 / c.node, 71 / c.wire);
      for (const s of states) {
        s.x = root.x + (s.x - root.x) * scale;
        s.y = root.y + (s.y - root.y) * scale;
      }
      const area =
        (Math.max(...states.map((s) => s.x)) - Math.min(...states.map((s) => s.x))) *
        (Math.max(...states.map((s) => s.y)) - Math.min(...states.map((s) => s.y)));
      if (mode !== 'branches' && area > initialArea * 1.1) continue;
      if (
        area < bestArea &&
        placementCorridorRoutes({ ...machine, states, comments: [] }, labels)
      ) {
        best = states;
        bestArea = area;
      }
    }
  return best ?? machine.states;
}
