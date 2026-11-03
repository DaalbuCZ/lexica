import { GraphBuilder } from '@khalidsaidi/topoloom/graph';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { faces } from './planar-grid.js';
import { planarCoordinates, drawingClearance } from './planar-layout.js';

// Split at articulation states so loops/shared destinations are placed together
// instead of being stretched across unrelated branches of a spanning tree.
export function blockLayout(machine, spacing = 0.75) {
  if (!machine.start || machine.states.length > 35) return false;
  const nodes = new Map(machine.states.map((s) => [s.id, s])),
    adj = new Map(machine.states.map((s) => [s.id, new Set()]));
  for (const e of machine.edges)
    if (e.from !== e.to && adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from).add(e.to);
      adj.get(e.to).add(e.from);
    }
  const discovery = new Map(),
    low = new Map(),
    stack = [],
    blocks = [];
  let tick = 0;
  function visit(id, parent) {
    discovery.set(id, ++tick);
    low.set(id, tick);
    for (const next of adj.get(id)) {
      if (!discovery.has(next)) {
        stack.push([id, next]);
        visit(next, id);
        low.set(id, Math.min(low.get(id), low.get(next)));
        if (low.get(next) >= discovery.get(id)) {
          const block = new Set();
          let edge;
          do {
            edge = stack.pop();
            block.add(edge[0]);
            block.add(edge[1]);
          } while (edge[0] !== id || edge[1] !== next);
          blocks.push([...block]);
        }
      } else if (next !== parent && discovery.get(next) < discovery.get(id)) {
        stack.push([id, next]);
        low.set(id, Math.min(low.get(id), discovery.get(next)));
      }
    }
  }
  visit(machine.start, null);
  if (discovery.size !== nodes.size || !blocks.some((b) => b.length >= 3)) return false;
  const incident = new Map(machine.states.map((s) => [s.id, []]));
  blocks.forEach((block, i) => block.forEach((id) => incident.get(id).push(i)));
  function weight(id, parentBlock) {
    return incident
      .get(id)
      .filter((b) => b !== parentBlock)
      .reduce(
        (sum, b) =>
          sum + blocks[b].filter((n) => n !== id).reduce((n, next) => n + 1 + weight(next, b), 0),
        0,
      );
  }
  const gap = Math.max(210, 320 * spacing),
    placed = new Map([
      [
        machine.start,
        {
          x: 0,
          y: 0,
        },
      ],
    ]);
  function local(block, entry, direction) {
    if (block.length === 2) {
      const next = block.find((id) => id !== entry);
      return new Map([
        [
          entry,
          {
            x: 0,
            y: 0,
          },
        ],
        [
          next,
          {
            x: Math.cos(direction) * gap,
            y: Math.sin(direction) * gap,
          },
        ],
      ]);
    }
    const builder = new GraphBuilder(),
      indices = new Map(block.map((id) => [id, builder.addVertex(id)]));
    for (let a = 0; a < block.length; a++)
      for (let b = a + 1; b < block.length; b++)
        if (adj.get(block[a]).has(block[b])) builder.addEdge(a, b);
    const graph = builder.build(),
      result = testPlanarity(graph, {
        backend: 'wasm',
      });
    if (!result.planar) return null;
    const boundary = faces(result.embedding.order.map((r) => r.map((e) => e.to))).find(
      (f) => f.length === block.length && new Set(f).size === block.length,
    );
    let positions;
    if (boundary) {
      const start = boundary.indexOf(indices.get(entry)),
        radius = gap / (2 * Math.sin(Math.PI / block.length)),
        origin = {
          x: Math.cos(direction + Math.PI) * radius,
          y: Math.sin(direction + Math.PI) * radius,
        };
      positions = new Map();
      for (let i = 0; i < boundary.length; i++) {
        const angle = direction + Math.PI + (i * Math.PI * 2) / boundary.length;
        positions.set(block[boundary[(start + i) % boundary.length]], {
          x: Math.cos(angle) * radius - origin.x,
          y: Math.sin(angle) * radius - origin.y,
        });
      }
    } else {
      const model = {
          start: entry,
          states: block.map((id) => ({
            id,
          })),
          edges: machine.edges.filter((e) => indices.has(e.from) && indices.has(e.to)),
        },
        drawing = planarCoordinates(model);
      if (!drawing.positions) return null;
      const root = drawing.positions.get(entry),
        center = [...drawing.positions.values()].reduce(
          (c, p) => ({
            x: c.x + p.x / block.length,
            y: c.y + p.y / block.length,
          }),
          {
            x: 0,
            y: 0,
          },
        ),
        angle = direction - Math.atan2(center.y - root.y, center.x - root.x);
      positions = new Map(
        [...drawing.positions].map(([id, p]) => [
          id,
          {
            x: (p.x - root.x) * Math.cos(angle) - (p.y - root.y) * Math.sin(angle),
            y: (p.x - root.x) * Math.sin(angle) + (p.y - root.y) * Math.cos(angle),
          },
        ]),
      );
    }
    const model = block.map((id) => ({
        id,
        ...positions.get(id),
      })),
      edges = machine.edges.filter((e) => indices.has(e.from) && indices.has(e.to)),
      clearance = drawingClearance(model, edges);
    if (clearance.crossings || clearance.wire < 1e-7) return null;
    const scale = Math.max(1, 75 / clearance.wire);
    for (const p of positions.values()) {
      p.x *= scale;
      p.y *= scale;
    }
    return positions;
  }
  function place(id, parentBlock, direction) {
    const branches = incident
      .get(id)
      .filter((b) => b !== parentBlock)
      .sort(
        (a, b) =>
          blocks[b].filter((n) => n !== id).reduce((sum, n) => sum + 1 + weight(n, b), 0) -
          blocks[a].filter((n) => n !== id).reduce((sum, n) => sum + 1 + weight(n, a), 0),
      );
    for (let i = 0; i < branches.length; i++) {
      const spread =
        parentBlock !== null && branches.length > 1
          ? ((i - (branches.length - 1) / 2) * Math.PI) / 2
          : i === 0
            ? 0
            : i === 1
              ? Math.PI
              : ((i % 2 ? 1 : -1) * Math.PI) / 2;
      const b = branches[i],
        angle = direction + spread,
        positions = local(blocks[b], id, angle);
      if (!positions) return false;
      const origin = placed.get(id);
      for (const [next, p] of positions)
        if (next !== id)
          placed.set(next, {
            x: origin.x + p.x,
            y: origin.y + p.y,
          });
      for (const next of blocks[b]) if (next !== id && !place(next, b, angle)) return false;
    }
    return true;
  }
  if (!place(machine.start, null, Math.PI / 2)) return false;
  const proposed = machine.states.map((s) => ({
      ...s,
      ...placed.get(s.id),
    })),
    clearance = drawingClearance(proposed, machine.edges);
  if (clearance.crossings || clearance.node < 150 || clearance.wire < 65) return false;
  for (const s of machine.states) Object.assign(s, placed.get(s.id));
  return true;
}
