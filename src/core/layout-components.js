import { graphBounds } from './canvas-graph.js';
import { routeEdges } from './layout.js';
import { graphView } from './groups.js';
import { simpleTransitionLabel } from './editor-settings.js';
// Solve weak components independently so an unrelated island cannot change
// the seed, radius, candidate budget or grouping policy of the main graph.
export function solveComponents(topology, options, solve) {
  const adjacency = new Map(topology.states.map((s) => [s.id, new Set()]));
  const link = (a, b) => {
    if (adjacency.has(a) && adjacency.has(b)) {
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    }
  };
  for (const e of topology.edges) link(e.from, e.to);
  for (const g of topology.groups ?? []) for (const id of g.stateIds) link(g.stateIds[0], id);
  const unseen = new Set([...adjacency.keys()].sort()),
    components = [];
  for (const first of unseen) {
    unseen.delete(first);
    const ids = [first];
    for (let i = 0; i < ids.length; i++)
      for (const next of adjacency.get(ids[i])) if (unseen.delete(next)) ids.push(next);
    components.push(new Set(ids));
  }
  if (components.length < 2) return null;
  components.sort((a, b) => Number(b.has(topology.start)) - Number(a.has(topology.start)));
  const states = new Map(),
    edges = new Map(),
    groups = [],
    comments = new Map();
  const usedIds = new Set([...topology.states, ...(topology.groups ?? [])].map((item) => item.id));
  let right = -Infinity,
    count = 0,
    main;
  const metrics = { components: components.length, totalMs: 0 };
  for (const ids of components) {
    const indices = topology.edges.flatMap((e, i) => (ids.has(e.from) ? [i] : [])),
      local = {
        ...topology,
        start: ids.has(topology.start) ? topology.start : null,
        states: topology.states.filter((s) => ids.has(s.id)),
        edges: indices.map((i) => topology.edges[i]),
        groups: (topology.groups ?? []).filter((g) => g.stateIds.some((id) => ids.has(id))),
        comments: (topology.comments ?? []).filter((c) =>
          (c.nodeIds ?? [c.nodeId]).some((id) => ids.has(id)),
        ),
      };
    const result = solve(local, null, options),
      m = result.machine;
    if (!main) main = m;
    const shown = graphView(m),
      bounds = graphBounds(shown, routeEdges(shown, simpleTransitionLabel));
    const left = bounds.x,
      dx = states.size ? right + 320 - left : 0;
    for (const s of m.states) {
      s.x += dx;
      states.set(s.id, s);
    }
    indices.forEach((index, i) => edges.set(index, m.edges[i]));
    for (const g of m.groups ?? []) {
      if (!local.groups.some((old) => old.id === g.id)) {
        const base = `component:${[...ids].sort()[0]}:${g.id}`;
        if (usedIds.has(g.id)) {
          g.id = base;
          let suffix = 1;
          while (usedIds.has(g.id)) g.id = base + ':' + suffix++;
        }
        usedIds.add(g.id);
      }
      g.x += dx;
      for (const p of Object.values(g.contextPositions ?? {})) p.x += dx;
      groups.push(g);
    }
    for (const c of m.comments ?? []) {
      c.x += dx;
      comments.set(c.id, c);
    }
    right = Math.max(right, bounds.x + bounds.width + dx);
    count += result.groups;
    for (const [key, value] of Object.entries(result.metrics ?? {}))
      if (typeof value === 'number') metrics[key] = (metrics[key] ?? 0) + value;
  }
  return {
    machine: {
      ...main,
      states: topology.states.map((s) => states.get(s.id)),
      edges: topology.edges.map((e, i) => edges.get(i) ?? e),
      groups,
      comments: (topology.comments ?? []).map((c) => comments.get(c.id) ?? { ...c, x: 0, y: 0 }),
    },
    groups: count,
    metrics,
  };
}
