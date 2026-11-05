import { drawingClearance } from './planar-layout.js';
import { placementCorridorRoutes } from './corridor-routing.js';
import { simpleTransitionLabel } from './editor-settings.js';
import { cycleAnalysis, cycleScore, cycleProposals } from './cycle-aesthetics.js';

// Improve an already routed planar drawing. Aesthetic scores never buy a
// crossing: each accepted candidate must have a complete feasible route set.
export function compactAesthetics(
  machine,
  { sweeps = 3, maxRoutes = 48, preserveStartRing = false, radial = false, fixedIds = [] } = {},
) {
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
  const motifs = cycleAnalysis(machine);
  const depth = new Map(root ? [[root.id, 0]] : []),
    queue = root ? [root.id] : [];
  for (let i = 0; i < queue.length; i++)
    for (const id of neighbors.get(queue[i]))
      if (!depth.has(id)) {
        depth.set(id, depth.get(queue[i]) + 1);
        queue.push(id);
      }
  const radius = (id) =>
    root ? Math.hypot(nodes.get(id).x - root.x, nodes.get(id).y - root.y) : 0;
  const pinned = new Set([
    ...fixedIds,
    ...(preserveStartRing
      ? machine.edges.filter((e) => e.from === machine.start && e.portal == null).map((e) => e.to)
      : []),
  ]);
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
    if (radial && root) {
      const ring = [...neighbors.get(root.id)],
        mean = ring.reduce((sum, id) => sum + radius(id), 0) / Math.max(1, ring.length);
      cost += ring.reduce(
        (sum, id) => sum + (3 * (radius(id) - mean) ** 2) / Math.max(160, mean),
        0,
      );
      for (const e of edges) {
        const a = depth.get(e.a),
          b = depth.get(e.b);
        if (a === b || a === undefined || b === undefined) continue;
        const parent = a < b ? e.a : e.b,
          child = a < b ? e.b : e.a;
        cost += (2 * Math.max(0, radius(parent) + 100 - radius(child)) ** 2) / 160;
      }
    }
    const w = Math.max(...states.map((s) => s.x)) - Math.min(...states.map((s) => s.x)),
      h = Math.max(...states.map((s) => s.y)) - Math.min(...states.map((s) => s.y));
    return cost + 0.15 * (w + h) + cycleScore(motifs, nodes);
  };
  const chunks = new Map();
  const offer = (ids) => {
    if (
      !ids.length ||
      ids.length === states.length ||
      ids.includes(machine.start) ||
      ids.some((id) => pinned.has(id))
    )
      return;
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
    proposals.push(
      ...cycleProposals(motifs, nodes, chunks.values()).filter(
        (p) => !p.ids.has(machine.start) && ![...p.ids].some((id) => pinned.has(id)),
      ),
    );
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
    if (radial && root) {
      const first = [...neighbors.get(root.id)],
        mean = first.reduce((sum, id) => sum + radius(id), 0) / Math.max(1, first.length);
      for (const s of states) {
        if (s === root || pinned.has(s.id)) continue;
        const r = radius(s.id),
          parents = [...neighbors.get(s.id)].filter((id) => depth.get(id) < depth.get(s.id)),
          target =
            depth.get(s.id) === 1 ? mean : Math.max(0, ...parents.map((id) => radius(id) + 160));
        if (r > 1e-6 && (depth.get(s.id) === 1 || r < target))
          proposals.push({
            ids: new Set([s.id]),
            dx: (s.x - root.x) * (target / r - 1),
            dy: (s.y - root.y) * (target / r - 1),
            gain: (3 * (target - r) ** 2) / Math.max(160, target),
          });
      }
    }
    proposals.sort((a, b) => b.gain - a.gain || b.ids.size - a.ids.size);
    for (const p of proposals.slice(0, 64)) {
      if (routeChecks >= maxRoutes) break;
      const members = [...p.ids].map((id) => nodes.get(id)),
        old = members.map((s) => ({ x: s.x, y: s.y }));
      for (const fraction of [1, 0.5, 0.25]) {
        if (routeChecks >= maxRoutes) break;
        members.forEach((s, i) => {
          const target = p.targets?.get(s.id);
          s.x = old[i].x + (target ? target.x - old[i].x : p.dx) * fraction;
          s.y = old[i].y + (target ? target.y - old[i].y : p.dy) * fraction;
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
          if (placementCorridorRoutes({ ...machine, states, comments: [] }, labels)) {
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
