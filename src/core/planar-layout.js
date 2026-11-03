import { GraphBuilder } from '@khalidsaidi/topoloom/graph';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { planarGrid } from './planar-grid.js';
const cache = new Map();
const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function drawingClearance(states, edges) {
  const nodes = new Map(states.map((s) => [s.id, s])),
    links = edges
      .filter((e) => e.from !== e.to && nodes.has(e.from) && nodes.has(e.to))
      .map((e) => [nodes.get(e.from), nodes.get(e.to)]);
  let node = Infinity,
    wire = Infinity,
    crossings = 0;
  for (let i = 0; i < states.length; i++)
    for (let j = i + 1; j < states.length; j++)
      node = Math.min(node, Math.hypot(states[i].x - states[j].x, states[i].y - states[j].y));
  for (let i = 0; i < links.length; i++) {
    const [a, b] = links[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    for (const s of states) {
      if (s === a || s === b) continue;
      const t = length
        ? Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.y - a.y) * dy) / length))
        : 0;
      wire = Math.min(wire, Math.hypot(s.x - a.x - t * dx, s.y - a.y - t * dy));
    }
    for (let j = i + 1; j < links.length; j++) {
      const [c, d] = links[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) crossings++;
    }
  }
  return {
    node,
    wire,
    crossings,
  };
}

// Topology is solved independently of the current drawing. Loops and parallel edges
// share the simple undirected skeleton; their distinct rules remain in the machine.
export function planarCoordinates(machine) {
  const ids = machine.states.map((s) => s.id),
    index = new Map(ids.map((id, i) => [id, i])),
    pairs = new Map();
  for (const edge of machine.edges) {
    if (
      edge.portal != null ||
      edge.from === edge.to ||
      !index.has(edge.from) ||
      !index.has(edge.to)
    )
      continue;
    const a = index.get(edge.from),
      b = index.get(edge.to),
      key = [Math.min(a, b), Math.max(a, b)].join(':');
    pairs.set(key, [Math.min(a, b), Math.max(a, b)]);
  }
  const skeleton = [...pairs.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    key = JSON.stringify([ids, skeleton, machine.start]);
  if (cache.has(key)) return structuredClone(cache.get(key));
  const neighbors = ids.map(() => []);
  for (const [a, b] of skeleton) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  const seen = new Set(),
    positions = new Map();
  let left = 0,
    planar = true,
    valid = true;
  for (let root = 0; root < ids.length; root++) {
    if (seen.has(root)) continue;
    const component = [root];
    seen.add(root);
    for (let i = 0; i < component.length; i++)
      for (const next of neighbors[component[i]])
        if (!seen.has(next)) {
          seen.add(next);
          component.push(next);
        }
    if (component.length === 1) {
      positions.set(ids[root], {
        x: left,
        y: 0,
      });
      left += 300;
      continue;
    }
    const builder = new GraphBuilder(),
      local = new Map(component.map((v) => [v, builder.addVertex(ids[v])]));
    for (const [a, b] of skeleton)
      if (local.has(a) && local.has(b)) builder.addEdge(local.get(a), local.get(b));
    let graph = builder.build(),
      result = testPlanarity(graph, {
        backend: 'wasm',
      });
    if (!result.planar) {
      planar = false;
      valid = false;
      break;
    }
    try {
      const edges = skeleton
        .filter(([a, b]) => local.has(a) && local.has(b))
        .map(([a, b]) => ({
          from: ids[a],
          to: ids[b],
        }));
      const drawing = planarGrid(graph, result, local.get(index.get(machine.start)) ?? 0);
      const states = component.map((v) => ({
          id: ids[v],
          ...drawing.get(local.get(v)),
        })),
        clearance = drawingClearance(states, edges);
      if (
        states.some((s) => !Number.isFinite(s.x) || !Number.isFinite(s.y)) ||
        clearance.crossings ||
        clearance.node < 1e-8 ||
        clearance.wire < 1e-8
      ) {
        valid = false;
        continue;
      }
      const scale = Math.max(1, 220 / clearance.node, 85 / clearance.wire),
        minX = Math.min(...states.map((s) => s.x)),
        minY = Math.min(...states.map((s) => s.y));
      for (const s of states)
        positions.set(s.id, {
          x: left + (s.x - minX) * scale,
          y: (s.y - minY) * scale,
        });
      left += (Math.max(...states.map((s) => s.x)) - minX) * scale + 300;
    } catch {
      valid = false;
    }
  }
  const result = {
    planar,
    positions: valid && positions.size === ids.length ? positions : null,
  };
  cache.set(key, result);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return structuredClone(result);
}
