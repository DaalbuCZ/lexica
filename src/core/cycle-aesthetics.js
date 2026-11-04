import { transitionBundles } from './graph-bundles.js';
import { simpleTransitionLabel } from './editor-settings.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function cycleAnalysis(machine) {
  const bundles = transitionBundles(machine, (e) => e.portal == null && e.from !== e.to),
    neighbors = new Map(machine.states.map((s) => [s.id, new Set()])),
    incoming = new Map(machine.states.map((s) => [s.id, new Set()])),
    outgoing = new Map(machine.states.map((s) => [s.id, new Set()]));
  for (const b of bundles)
    if (neighbors.has(b.a) && neighbors.has(b.b)) {
      neighbors.get(b.a).add(b.b);
      neighbors.get(b.b).add(b.a);
      if (b.forward.length && !b.reverse.length) {
        incoming.get(b.b).add(b.a);
        outgoing.get(b.a).add(b.b);
      }
      if (b.reverse.length && !b.forward.length) {
        incoming.get(b.a).add(b.b);
        outgoing.get(b.b).add(b.a);
      }
    }
  const cycles = [],
    seen = new Set(),
    demands = new Map();
  for (const bundle of bundles)
    demands.set(
      JSON.stringify([bundle.a, bundle.b]),
      Math.max(
        180,
        ...bundle.indices.map((i) => simpleTransitionLabel(machine.edges[i]).length * 7 + 100),
      ),
    );
  const addCycle = (path) => {
    const reverse = [path[0], ...path.slice(1).reverse()],
      a = JSON.stringify(path),
      b = JSON.stringify(reverse),
      key = a < b ? a : b;
    if (!seen.has(key) && cycles.length < 64) {
      seen.add(key);
      cycles.push(path);
    }
  };
  // Simple biconnected cycles have no length limit. Short chordless cycles in
  // more complex blocks are added by the bounded search below.
  const discovery = new Map(),
    low = new Map(),
    stack = [];
  let tick = 0;
  const visit = (id, parent) => {
    discovery.set(id, ++tick);
    low.set(id, tick);
    for (const next of [...neighbors.get(id)].sort()) {
      if (!discovery.has(next)) {
        stack.push([id, next]);
        visit(next, id);
        low.set(id, Math.min(low.get(id), low.get(next)));
        if (low.get(next) >= discovery.get(id)) {
          const block = new Map();
          let edge;
          do {
            edge = stack.pop();
            for (const [a, b] of [edge, [edge[1], edge[0]]]) {
              if (!block.has(a)) block.set(a, []);
              block.get(a).push(b);
            }
          } while (edge[0] !== id || edge[1] !== next);
          if (block.size >= 3 && [...block.values()].every((r) => r.length === 2)) {
            const start = [...block.keys()].sort()[0],
              path = [start];
            let previous = null,
              current = start;
            do {
              const next = block
                .get(current)
                .sort()
                .find((n) => n !== previous);
              previous = current;
              current = next;
              if (current !== start) path.push(current);
            } while (current !== start);
            addCycle(path);
          }
        }
      } else if (next !== parent && discovery.get(next) < discovery.get(id)) {
        stack.push([id, next]);
        low.set(id, Math.min(low.get(id), discovery.get(next)));
      }
    }
  };
  for (const id of [...neighbors.keys()].sort()) if (!discovery.has(id)) visit(id, null);
  let visits = 0;
  for (const start of [...neighbors.keys()].sort()) {
    const walk = (path) => {
      if (++visits > 20000 || cycles.length >= 64) return;
      const last = path.at(-1);
      for (const next of [...neighbors.get(last)].sort()) {
        if (next === start && path.length >= 3) {
          const reverse = [start, ...path.slice(1).reverse()],
            key = JSON.stringify(
              [path, reverse].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))[0],
            );
          if (
            !seen.has(key) &&
            path.every(
              (id, i) => [...neighbors.get(id)].filter((n) => path.includes(n)).length === 2,
            )
          ) {
            seen.add(key);
            cycles.push([...path]);
          }
        } else if (next > start && !path.includes(next) && path.length < 8) walk([...path, next]);
      }
    };
    walk([start]);
  }
  return { neighbors, incoming, outgoing, cycles, demands };
}
export function insideCycle(p, cycle, nodes) {
  let inside = false;
  for (let i = 0, j = cycle.length - 1; i < cycle.length; j = i++) {
    const a = nodes.get(cycle[i]),
      b = nodes.get(cycle[j]);
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
export function cycleScore(analysis, nodes) {
  let score = 0;
  for (const cycle of analysis.cycles) {
    const lengths = cycle.map((id, i) =>
        distance(nodes.get(id), nodes.get(cycle[(i + 1) % cycle.length])),
      ),
      mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    score += 4 * lengths.reduce((sum, d) => sum + (d - mean) ** 2 / Math.max(160, mean), 0);
    const ids = new Set(cycle);
    for (const id of cycle)
      for (const next of analysis.neighbors.get(id))
        if (
          !ids.has(next) &&
          [...analysis.neighbors.get(next)].filter((n) => ids.has(n)).length === 1 &&
          insideCycle(nodes.get(next), cycle, nodes)
        )
          score += 1200;
  }
  for (const [id, ins] of analysis.incoming) {
    const outs = analysis.outgoing.get(id);
    if (!ins.size || !outs.size) continue;
    const s = nodes.get(id),
      vector = (ids) => {
        let x = 0,
          y = 0;
        for (const n of ids) {
          const p = nodes.get(n),
            d = distance(p, s) || 1;
          x += (p.x - s.x) / d;
          y += (p.y - s.y) / d;
        }
        const d = Math.hypot(x, y) || 1;
        return { x: x / d, y: y / d };
      },
      a = vector(ins),
      b = vector(outs);
    score += 8 * Math.max(0, 0.5 + a.x * b.x + a.y * b.y);
  }
  return score;
}
export function cycleProposals(analysis, nodes, chunks) {
  chunks = [...chunks];
  const proposals = [],
    add = (targets) => {
      const moved = new Map([...targets].filter(([id, p]) => distance(nodes.get(id), p) > 1e-6));
      if (moved.size) {
        const p = { ids: new Set(moved.keys()), targets: moved, gain: 1200 };
        proposals.push(p);
        return p;
      }
    };
  for (const cycle of analysis.cycles.slice(0, 24)) {
    const ids = new Set(cycle),
      center = {
        x: cycle.reduce((sum, id) => sum + nodes.get(id).x, 0) / cycle.length,
        y: cycle.reduce((sum, id) => sum + nodes.get(id).y, 0) / cycle.length,
      };
    // Rigidly swing a dangling chunk into the exterior half-plane.
    for (const anchor of cycle)
      for (const chunk of chunks) {
        if (chunk.has(anchor) || [...chunk].some((id) => ids.has(id))) continue;
        const attached = [...chunk].filter((id) => analysis.neighbors.get(anchor).has(id));
        if (attached.length !== 1) continue;
        const p = nodes.get(attached[0]);
        if (!insideCycle(p, cycle, nodes)) continue;
        const a = nodes.get(anchor),
          base = Math.atan2(a.y - center.y, a.x - center.x),
          old = Math.atan2(p.y - a.y, p.x - a.x);
        for (const turn of [0, -Math.PI / 4, Math.PI / 4]) {
          const angle = base + turn - old,
            cos = Math.cos(angle),
            sin = Math.sin(angle);
          add(
            new Map(
              [...chunk].map((id) => {
                const s = nodes.get(id),
                  x = s.x - a.x,
                  y = s.y - a.y;
                return [id, { x: a.x + x * cos - y * sin, y: a.y + x * sin + y * cos }];
              }),
            ),
          );
        }
      }
    const anchor = [...cycle].sort(
        (a, b) => nodes.get(a).x - nodes.get(b).x || (a < b ? -1 : 1),
      )[0],
      a = nodes.get(anchor),
      start = cycle.indexOf(anchor),
      order = [...cycle.slice(start), ...cycle.slice(0, start)],
      side = Math.max(
        ...cycle.map(
          (id, i) =>
            analysis.demands.get(JSON.stringify([id, cycle[(i + 1) % cycle.length]].sort())) ?? 180,
        ),
        cycle.reduce(
          (sum, id, i) => sum + distance(nodes.get(id), nodes.get(cycle[(i + 1) % cycle.length])),
          0,
        ) / cycle.length,
      ),
      radius = Math.max(180, side) / (2 * Math.sin(Math.PI / cycle.length));
    for (const direction of [0, Math.atan2(center.y - a.y, center.x - a.x)])
      for (const orientation of [-1, 1]) {
        const theta = direction + Math.PI,
          cx = a.x - radius * Math.cos(theta),
          cy = a.y - radius * Math.sin(theta),
          targets = new Map(
            order.map((id, i) => [
              id,
              {
                x: cx + radius * Math.cos(theta + (orientation * i * 2 * Math.PI) / cycle.length),
                y: cy + radius * Math.sin(theta + (orientation * i * 2 * Math.PI) / cycle.length),
              },
            ]),
          );
        // Components attached at just one polygon vertex follow that vertex.
        for (const chunk of chunks) {
          if ([...chunk].some((id) => ids.has(id))) continue;
          const attached = cycle.filter((id) =>
            [...analysis.neighbors.get(id)].some((n) => chunk.has(n)),
          );
          if (attached.length !== 1) continue;
          const s = nodes.get(attached[0]),
            p = targets.get(s.id);
          for (const id of chunk)
            targets.set(id, { x: nodes.get(id).x + p.x - s.x, y: nodes.get(id).y + p.y - s.y });
        }
        add(targets);
      }
  }
  // Weakly separate incoming and outgoing directions using available chunks.
  for (const [id, ins] of analysis.incoming) {
    const outs = analysis.outgoing.get(id);
    if (!ins.size || !outs.size) continue;
    const s = nodes.get(id),
      x = [...ins].reduce((sum, n) => sum + nodes.get(n).x - s.x, 0),
      y = [...ins].reduce((sum, n) => sum + nodes.get(n).y - s.y, 0),
      d = Math.hypot(x, y);
    if (d < 1e-6) continue;
    const ox = [...outs].reduce((sum, n) => sum + nodes.get(n).x - s.x, 0),
      oy = [...outs].reduce((sum, n) => sum + nodes.get(n).y - s.y, 0),
      od = Math.hypot(ox, oy);
    if (od && (x * ox + y * oy) / (d * od) < -0.5) continue;
    for (const out of outs) {
      const chunk = [...chunks].find(
        (c) => c.has(out) && !c.has(id) && ![...ins].some((n) => c.has(n)),
      );
      if (!chunk) continue;
      const p = nodes.get(out),
        length = distance(p, s),
        dx = s.x - (x / d) * length - p.x,
        dy = s.y - (y / d) * length - p.y;
      const targets = new Map(
        [...chunk].map((n) => [n, { x: nodes.get(n).x + dx, y: nodes.get(n).y + dy }]),
      );
      const proposal = add(targets);
      if (proposal) proposal.gain = 16;
    }
  }
  return proposals;
}
