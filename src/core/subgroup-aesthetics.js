import { drawingClearance } from './planar-layout.js';
import { corridorRoutes } from './corridor-routing.js';
import { simpleTransitionLabel } from './editor-settings.js';
import { cycleAnalysis, insideCycle } from './cycle-aesthetics.js';

// Compare complete small subgroup drawings. In particular, a separator flip
// changes the embedding instead of trying to drag a branch through its cycle.
export function polishSubgroup(
  machine,
  { fixedIds = [], maxRoutes = 24, acceptCandidate = () => true, radialOrigin = null } = {},
) {
  if (
    machine.states.length > 24 ||
    machine.states.some((s) => s.group) ||
    machine.edges.some((e) => e.portal != null || e.bend)
  )
    return machine.states;
  const original = machine.states,
    nodes = new Map(original.map((s) => [s.id, s])),
    analysis = cycleAnalysis(machine),
    adjacency = analysis.neighbors,
    root = original.find((s) => s.outside) ?? nodes.get(machine.start);
  if (!root) return original;
  const fixed = new Set(fixedIds);
  const depth = new Map([[root.id, 0]]),
    queue = [root.id];
  for (let i = 0; i < queue.length; i++)
    for (const next of adjacency.get(queue[i]))
      if (!depth.has(next)) {
        depth.set(next, depth.get(queue[i]) + 1);
        queue.push(next);
      }
  if (depth.size !== original.length) return original;
  const labels = machine.edges.map(simpleTransitionLabel),
    base = drawingClearance(original, machine.edges);
  if (base.crossings) return original;
  const score = (states) => {
    const map = new Map(states.map((s) => [s.id, s]));
    let cost = 0;
    for (const cycle of analysis.cycles)
      for (const s of states) if (!cycle.includes(s.id) && insideCycle(s, cycle, map)) cost += 2000;
    for (const [i, e] of machine.edges.entries()) {
      const a = map.get(e.from),
        b = map.get(e.to);
      if (!a || !b || a === b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        delta = depth.get(b.id) - depth.get(a.id),
        advance = delta
          ? (radialOrigin
              ? Math.hypot(b.x - radialOrigin.x, b.y - radialOrigin.y) -
                Math.hypot(a.x - radialOrigin.x, a.y - radialOrigin.y)
              : b.x - a.x) * Math.sign(delta)
          : 0;
      // Entry-distance columns describe progress even when a directed return
      // transition runs backwards. Short same-column links are allowed.
      if (delta) cost += Math.max(0, 150 - advance) * 2;
      cost += 0.08 * d;
      if (adjacency.get(a.id).size === 2 && adjacency.get(b.id).size === 2)
        cost += 0.25 * Math.abs(a.y - b.y);
      if (Math.abs(a.y - b.y) < 1)
        cost += Math.max(0, labels[i].length * 7 + 160 - Math.abs(a.x - b.x));
    }
    return cost;
  };
  let best = original,
    bestCost = score(original),
    checked = 0;
  const offer = (states) => {
    const next = score(states);
    if (
      next >= bestCost - 0.1 ||
      checked >= maxRoutes ||
      states.some((s) => {
        const old = nodes.get(s.id);
        return fixed.has(s.id) && (Math.abs(old.x - s.x) > 1e-6 || Math.abs(old.y - s.y) > 1e-6);
      })
    )
      return;
    const c = drawingClearance(states, machine.edges);
    if (
      c.crossings ||
      c.node < Math.min(175, base.node) - 1e-6 ||
      c.wire < Math.min(70, base.wire) - 1e-6
    )
      return;
    const left = Math.min(...states.filter((s) => !s.outside).map((s) => s.x));
    if (states.some((s) => s.outside && s.x > left - 140)) return;
    checked++;
    if (!corridorRoutes({ ...machine, states, comments: [] }, labels)) return;
    if (!acceptCandidate(states)) return;
    best = states;
    bestCost = next;
  };
  // Whole-column alternatives expose the diamond and stair-step arrangements
  // that a one-node-at-a-time optimizer cannot reach without crossings.
  const levels = Array.from({ length: Math.max(...depth.values()) + 1 }, () => []);
  for (const s of original) levels[depth.get(s.id)].push(s);
  for (const reverse of [false, true])
    for (const gap of [200, 260]) {
      const placed = new Map(),
        columns = [root.x];
      for (let k = 1; k < levels.length; k++) {
        const demand = Math.max(
          levels.length === 3 && levels[1].length === 1 && levels[2].length === 2 && k === 2
            ? 150
            : 200,
          ...machine.edges.flatMap((e, i) =>
            Math.min(depth.get(e.from), depth.get(e.to)) === k - 1 &&
            Math.max(depth.get(e.from), depth.get(e.to)) === k
              ? [Math.min(600, labels[i].length * 7 + 160)]
              : [],
          ),
        );
        columns[k] = columns[k - 1] + demand;
      }
      for (const [k, level] of levels.entries()) {
        const sorted = [...level].sort(
            (a, b) => (reverse ? -1 : 1) * (a.y - b.y) || a.id.localeCompare(b.id),
          ),
          parents = sorted.flatMap((s) =>
            [...adjacency.get(s.id)].filter((id) => placed.has(id)).map((id) => placed.get(id).y),
          ),
          center = parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : root.y;
        sorted.forEach((s, i) =>
          placed.set(s.id, { ...s, x: columns[k], y: center + (i - (level.length - 1) / 2) * gap }),
        );
      }
      offer(original.map((s) => placed.get(s.id)));
    }
  // A dense entry fan can contain same-depth triangles. Enumerate its small
  // vertical order and stagger one vertex, rather than drawing through a
  // middle vertex or retaining a large enclosing triangle.
  if (levels[1]?.length >= 3 && levels[1].length <= 4) {
    const permutations = (items) =>
      items.length
        ? items.flatMap((s, i) =>
            permutations(items.filter((_, j) => j !== i)).map((tail) => [s, ...tail]),
          )
        : [[]];
    const entryGap = Math.max(
      250,
      ...machine.edges.flatMap((e, i) =>
        e.from === root.id || e.to === root.id ? [labels[i].length * 7 + 160] : [],
      ),
    );
    for (const order of permutations(levels[1]))
      for (const shifted of order) {
        const placed = new Map([[root.id, { ...root }]]);
        order.forEach((s, i) =>
          placed.set(s.id, {
            ...s,
            x: root.x + entryGap + (s === shifted ? 200 : 0),
            y: root.y + (i - (order.length - 1) / 2) * 220,
          }),
        );
        for (let k = 2; k < levels.length; k++) {
          const targets = levels[k]
            .map((s) => {
              const parents = [...adjacency.get(s.id)]
                .filter((id) => depth.get(id) < k)
                .map((id) => placed.get(id));
              return {
                s,
                x:
                  Math.max(...parents.map((p) => p.x)) +
                  Math.max(
                    200,
                    ...machine.edges.flatMap((e, i) =>
                      (e.from === s.id && depth.get(e.to) < k) ||
                      (e.to === s.id && depth.get(e.from) < k)
                        ? [Math.min(600, labels[i].length * 7 + 160)]
                        : [],
                    ),
                  ),
                y: parents.reduce((sum, p) => sum + p.y, 0) / parents.length,
              };
            })
            .sort((a, b) => a.y - b.y);
          let bottom = -Infinity;
          for (const { s, x, y } of targets) {
            const nextY = Math.max(y, bottom + 200);
            bottom = nextY;
            placed.set(s.id, { ...s, x, y: nextY });
          }
        }
        offer(original.map((s) => placed.get(s.id)));
      }
  }
  // An articulation's tail may need to leave the current outer face entirely.
  // Rotate the entire tail, including its descendants, around that articulation.
  for (const cut of original) {
    const remaining = new Set(original.filter((s) => s !== cut).map((s) => s.id));
    while (remaining.size) {
      const chunk = [remaining.values().next().value];
      remaining.delete(chunk[0]);
      for (let i = 0; i < chunk.length; i++)
        for (const id of adjacency.get(chunk[i])) if (remaining.delete(id)) chunk.push(id);
      if (chunk.includes(root.id) || chunk.length === original.length - 1) continue;
      const ids = new Set(chunk),
        seed = best,
        anchor = seed.find((s) => s.id === cut.id);
      const turns = radialOrigin ? 24 : 8;
      for (let turn = 1; turn < turns; turn++) {
        const angle = (turn * 2 * Math.PI) / turns,
          cos = Math.cos(angle),
          sin = Math.sin(angle);
        offer(
          seed.map((s) => {
            if (!ids.has(s.id)) return s;
            const x = s.x - anchor.x,
              y = s.y - anchor.y;
            return { ...s, x: anchor.x + x * cos - y * sin, y: anchor.y + x * sin + y * cos };
          }),
        );
      }
    }
  }
  // Reflect each component separated by two vertices across their shared
  // chord. Both attachment points remain fixed; entire attached tails follow.
  for (let pass = 0; pass < 2; pass++) {
    const seed = best,
      map = new Map(seed.map((s) => [s.id, s]));
    for (let i = 0; i < seed.length; i++)
      for (let j = i + 1; j < seed.length; j++) {
        const a = seed[i],
          b = seed[j],
          remaining = new Set(seed.filter((s) => s !== a && s !== b).map((s) => s.id));
        while (remaining.size) {
          const first = remaining.values().next().value,
            chunk = [first];
          remaining.delete(first);
          for (let k = 0; k < chunk.length; k++)
            for (const id of adjacency.get(chunk[k])) if (remaining.delete(id)) chunk.push(id);
          if (
            chunk.includes(root.id) ||
            chunk.length === seed.length - 2 ||
            ![a, b].every((s) => chunk.some((id) => adjacency.get(s.id).has(id)))
          )
            continue;
          const dx = b.x - a.x,
            dy = b.y - a.y,
            d2 = dx * dx + dy * dy;
          if (!d2) continue;
          const ids = new Set(chunk);
          offer(
            seed.map((s) => {
              if (!ids.has(s.id)) return s;
              const p = map.get(s.id),
                t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / d2;
              return { ...s, x: 2 * (a.x + t * dx) - p.x, y: 2 * (a.y + t * dy) - p.y };
            }),
          );
        }
      }
    if (best === seed) break;
  }
  return best;
}
