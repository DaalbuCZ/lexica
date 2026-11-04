import { drawingClearance } from './planar-layout.js';
import { corridorRoutes } from './corridor-routing.js';
import { simpleTransitionLabel } from './editor-settings.js';

// Improve an already routed planar drawing. Aesthetic scores never buy a
// crossing: each accepted candidate must have a complete feasible route set.
export function compactAesthetics(machine, { sweeps = 3, maxRoutes = 48 } = {}) {
  const states = machine.states.map((s) => ({ ...s })),
    nodes = new Map(states.map((s) => [s.id, s])),
    neighbors = new Map(states.map((s) => [s.id, new Set()])),
    links = new Map(),
    labels = machine.edges.map(simpleTransitionLabel);
  for (const [i, e] of machine.edges.entries()) {
    if (e.portal != null || e.from === e.to || !nodes.has(e.from) || !nodes.has(e.to)) continue;
    neighbors.get(e.from).add(e.to);
    neighbors.get(e.to).add(e.from);
    const key = JSON.stringify([e.from, e.to].sort()),
      demand = Math.max(160, labels[i].length * 7 + 100);
    if (!links.has(key)) links.set(key, { a: e.from, b: e.to, demand });
    else links.get(key).demand = Math.max(links.get(key).demand, demand);
  }
  const root = nodes.get(machine.start),
    edges = [...links.values()];
  if (
    root &&
    neighbors.get(root.id).size === states.length - 1 &&
    states.length > 4 &&
    states.filter((s) => s !== root).every((s) => neighbors.get(s.id).size === 3)
  )
    return states;
  const distance = (e) =>
    Math.hypot(nodes.get(e.a).x - nodes.get(e.b).x, nodes.get(e.a).y - nodes.get(e.b).y);
  for (const e of edges) e.minimum = Math.min(distance(e), e.demand);
  const baseline = drawingClearance(states, machine.edges),
    minimumNode = Math.min(175, baseline.node),
    minimumWire = Math.min(70, baseline.wire);
  const inner = states.filter((s) => !s.outside),
    outer = states.filter((s) => s.outside),
    initialLeft = Math.min(...inner.map((s) => s.x)),
    leftGap = Math.min(140, ...outer.map((s) => initialLeft - s.x));
  const score = () => {
    let cost = 0;
    for (const e of edges) cost += Math.max(0, distance(e) - e.demand) ** 2 / e.demand;
    const w = Math.max(...states.map((s) => s.x)) - Math.min(...states.map((s) => s.x)),
      h = Math.max(...states.map((s) => s.y)) - Math.min(...states.map((s) => s.y));
    return cost + 0.15 * (w + h);
  };
  const chunks = new Map();
  const offer = (ids) => {
    if (!ids.length || ids.length === states.length || ids.includes(machine.start)) return;
    ids.sort();
    chunks.set(JSON.stringify(ids), new Set(ids));
  };
  // All articulation-side chunks, not just branches of the start node.
  // This lets a cyclic subgroup move as a rigid object toward its attachment.
  for (const cut of states) {
    const remaining = new Set(states.filter((s) => s !== cut).map((s) => s.id));
    const components = [];
    for (const id of remaining) {
      remaining.delete(id);
      const ids = [id];
      for (let i = 0; i < ids.length; i++)
        for (const next of neighbors.get(ids[i])) if (remaining.delete(next)) ids.push(next);
      components.push(ids);
    }
    if (components.length > 1) components.forEach(offer);
  }
  states.forEach((s) => offer([s.id]));
  let best = score(),
    routeChecks = 0;
  for (let sweep = 0; sweep < sweeps && routeChecks < maxRoutes; sweep++) {
    let changed = false;
    const proposals = [];
    for (const ids of chunks.values())
      for (const e of edges) {
        if (ids.has(e.a) === ids.has(e.b)) continue;
        const a = nodes.get(ids.has(e.a) ? e.a : e.b),
          b = nodes.get(ids.has(e.a) ? e.b : e.a),
          d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= e.demand + 2) continue;
        proposals.push({
          ids,
          dx: ((b.x - a.x) * (d - e.demand)) / d,
          dy: ((b.y - a.y) * (d - e.demand)) / d,
          gain: (d - e.demand) ** 2 / e.demand,
        });
      }
    proposals.sort((a, b) => b.gain - a.gain || b.ids.size - a.ids.size);
    for (const p of proposals.slice(0, 64)) {
      if (routeChecks >= maxRoutes) break;
      const members = [...p.ids].map((id) => nodes.get(id)),
        old = members.map((s) => ({ x: s.x, y: s.y }));
      for (const fraction of [1, 0.5, 0.25]) {
        if (routeChecks >= maxRoutes) break;
        members.forEach((s, i) => {
          s.x = old[i].x + p.dx * fraction;
          s.y = old[i].y + p.dy * fraction;
        });
        const next = score(),
          c = next < best - 0.01 ? drawingClearance(states, machine.edges) : null;
        if (
          c &&
          !c.crossings &&
          c.node >= minimumNode - 1e-6 &&
          c.wire >= minimumWire - 1e-6 &&
          outer.every((s) => s.x <= Math.min(...inner.map((s) => s.x)) - leftGap + 1e-6) &&
          edges.every((e) => distance(e) >= e.minimum - 1e-6)
        ) {
          routeChecks++;
          if (corridorRoutes({ ...machine, states, comments: [] }, labels)) {
            best = next;
            changed = true;
            break;
          }
        }
        members.forEach((s, i) => Object.assign(s, old[i]));
      }
    }
    if (!changed) break;
  }
  return states;
}
