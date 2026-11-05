import { graphView } from '../src/core/groups.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { feasibleRadial } from '../src/core/feasible-layout.js';
import { corridorRoutes } from '../src/core/corridor-routing.js';
import { validateRouteSeparation } from '../src/core/layout-validation.js';
import { repairDraggedRoutes } from '../src/core/incremental-layout.js';
import { SpatialIndex } from '../src/core/spatial-index.js';
import { drawingClearance } from '../src/core/planar-layout.js';
import { storeDrawingRoutes } from '../src/core/drawing-routes.js';
import { routeEdges } from '../src/core/layout.js';
import { parseMachine } from '../src/core/lexer.js';
import { createLiveRouting } from '../src/editor/live-routing.js';
import { compactAesthetics } from '../src/core/aesthetic-layout.js';
import { curvePoint, curveAvoidsBox } from '../src/core/route-geometry.js';
import { placeCommentsAfterLayout, commentLayout } from '../src/core/comments.js';
import { circularStartRing } from '../src/core/radial-ring.js';
import { createViewport } from '../src/editor/viewport.js';
import { canvasTransform } from '../src/core/canvas-graph.js';
import { solveLayout } from '../src/core/smart-layout.js';
import { layoutTopology } from '../src/core/layout-topology.js';
import { alignHorizontal } from '../src/core/horizontal-layout.js';
import { renderedLabelBox } from '../src/core/label-clearance.js';
import { interactiveRoutes } from '../src/core/interactive-routes.js';
import { cycleAnalysis, insideCycle, cycleScore } from '../src/core/cycle-aesthetics.js';
import { transitionBundles } from '../src/core/graph-bundles.js';
import { polishSubgroup } from '../src/core/subgroup-aesthetics.js';
import { polishRadialBranches } from '../src/core/radial-aesthetics.js';
import { simpleTransitionLabel } from '../src/core/editor-settings.js';

test('radial assembly keeps a cyclic branch exit outside its cycles before late cleanup', () => {
  const m = {
    start: 'root',
    states: [
      'root',
      'text',
      'quote',
      'double',
      'end',
      ...Array.from({ length: 33 }, (_, i) => `leaf${i}`),
    ].map((id) => ({ id, name: id, x: 0, y: 0 })),
    edges: [
      ['root', 'text'],
      ['root', 'quote'],
      ['quote', 'text'],
      ['quote', 'double'],
      ['double', 'text'],
      ['double', 'end'],
      ...Array.from({ length: 33 }, (_, i) => ['root', `leaf${i}`]),
    ].map(([from, to]) => ({ from, to, label: 'x' })),
    groups: [],
    comments: [],
  };
  const result = solveLayout(layoutTopology(m), null, {
      mode: 'circle',
      spacing: 0.5,
      smartGroups: false,
    }),
    nodes = new Map(result.machine.states.map((s) => [s.id, s]));
  assert.equal(result.machine.groups.length, 0);
  for (const cycle of cycleAnalysis(result.machine).cycles)
    assert.equal(insideCycle(nodes.get('end'), cycle, nodes), false);
  assert.equal(
    validateRouteSeparation(routeEdges(result.machine, simpleTransitionLabel), {
      maxDepth: 24,
      maxPairs: 4096,
    }).status,
    'clear',
  );
  assert.equal(result.metrics.radialAesthetics.budgetExhausted, false);
});

test('attached comments prefer an open face even when the cycle interior has the widest free sector', () => {
  const m = {
    states: [
      ['a', 0, 0],
      ['b', 600, -600],
      ['c', 600, 600],
      ['l', -300, 0],
      ['u', -300, -300],
      ['d', -300, 300],
    ].map(([id, x, y]) => ({ id, x, y })),
    edges: [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['a', 'l'],
      ['a', 'u'],
      ['a', 'd'],
    ].map(([from, to]) => ({ from, to, label: 'x' })),
    comments: [{ id: 'note', nodeIds: ['a'], text: 'Keep this outside the cycle', x: 100, y: 0 }],
  };
  const before = structuredClone(m.states);
  placeCommentsAfterLayout(m);
  const note = m.comments[0],
    { w, h } = commentLayout(note),
    nodes = new Map(m.states.map((s) => [s.id, s]));
  for (const x of [note.x, note.x + w / 2, note.x + w])
    for (const y of [note.y, note.y + h / 2, note.y + h])
      assert.equal(insideCycle({ x, y }, ['a', 'b', 'c'], nodes), false);
  assert.deepEqual(m.states, before);
});

test('large ungrouped radial charts release enclosed branch nodes without changing the start ring or other branches', () => {
  const m = {
    start: 'root',
    states: [
      { id: 'root', x: 0, y: 0 },
      { id: 'a', x: 1000, y: 0 },
      { id: 'b', x: 1400, y: -300 },
      { id: 'c', x: 1400, y: 300 },
      { id: 'leaf', x: 1250, y: 0 },
    ],
    edges: [
      ['root', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['a', 'leaf'],
    ].map(([from, to]) => ({ from, to, label: 'x' })),
  };
  // Add enough independent branches to exceed the subgroup size budget.
  for (let i = 1; i < 20; i++) {
    const angle = (i * Math.PI) / 10,
      id = `ring${i}`,
      tip = `tip${i}`;
    m.states.push(
      { id, x: 1000 * Math.cos(angle), y: 1000 * Math.sin(angle) },
      { id: tip, x: 1200 * Math.cos(angle), y: 1200 * Math.sin(angle) },
    );
    m.edges.push({ from: 'root', to: id, label: 'x' }, { from: id, to: tip, label: 'x' });
  }
  const states = polishRadialBranches(m),
    nodes = new Map(states.map((s) => [s.id, s]));
  assert.equal(insideCycle(nodes.get('leaf'), ['a', 'b', 'c'], nodes), false);
  for (const s of m.states.filter((s) => s.id !== 'leaf' && s.id !== 'b' && s.id !== 'c'))
    assert.deepEqual(nodes.get(s.id), s);
  const routes = corridorRoutes(
    { ...m, states },
    m.edges.map((e) => e.label),
  );
  assert.ok(routes);
  assert.equal(validateRouteSeparation(routes, { maxDepth: 24, maxPairs: 4096 }).status, 'clear');
});

test('subgroup candidates give the entry caption room and shorten a balanced fork', () => {
  const m = {
    start: 'root',
    states: [
      { id: 'root', x: 0, y: 0, outside: true },
      { id: 'entry', x: 396, y: 0 },
      { id: 'up', x: 596, y: -100 },
      { id: 'down', x: 596, y: 100 },
    ],
    edges: [
      { from: 'root', to: 'entry', label: 'x'.repeat(38) },
      { from: 'entry', to: 'up', label: '=' },
      { from: 'entry', to: 'down', label: '-' },
    ],
  };
  const states = polishSubgroup(m),
    [root, entry, up, down] = states;
  assert.ok(entry.x - root.x >= 426);
  assert.ok(up.x - entry.x < 200);
  assert.equal(up.x, down.x);
  assert.equal(up.y + down.y, 2 * entry.y);
  assert.equal(
    validateRouteSeparation(
      corridorRoutes(
        { ...m, states },
        m.edges.map((e) => e.label),
      ),
      { maxDepth: 24 },
    ).status,
    'clear',
  );
});

test('whole subgroup candidates reach a diamond that local cycle moves cannot expose', () => {
  const m = {
    start: 'root',
    states: [
      { id: 'root', x: 0, y: 0, outside: true },
      { id: 'quote', x: 350, y: 150 },
      { id: 'text', x: 400, y: -100 },
      { id: 'double', x: 600, y: 120 },
      { id: 'end', x: 600, y: -140 },
    ],
    edges: [
      ['root', 'text'],
      ['root', 'quote'],
      ['quote', 'text'],
      ['quote', 'double'],
      ['double', 'text'],
      ['double', 'end'],
      ['text', 'text'],
    ].map(([from, to]) => ({ from, to, label: 'x' })),
  };
  const states = polishSubgroup(m),
    nodes = new Map(states.map((s) => [s.id, s]));
  assert.equal(nodes.get('quote').x, nodes.get('text').x);
  assert.equal(nodes.get('double').y, nodes.get('end').y);
  assert.ok(nodes.get('end').x > nodes.get('double').x);
  assert.equal(
    validateRouteSeparation(
      corridorRoutes(
        { ...m, states },
        m.edges.map((e) => e.label),
      ),
      { maxDepth: 24 },
    ).status,
    'clear',
  );
  assert.deepEqual(polishSubgroup(m), states);
});

test('alternate entry fan embeddings release a complete tail from enclosing cycles', () => {
  const m = {
    start: 'root',
    states: [
      ['root', -736, -306],
      ['s', -371, -382],
      ['id', 28, -657],
      ['underscore', 95, -834],
      ['dollar', 272, -125],
      ['tail1', -208, -317],
      ['tail2', -42, -264],
      ['tail3', 46, -416],
      ['leaf1', 332, -292],
      ['leaf2', 448, -92],
    ].map(([id, x, y]) => ({ id, x, y, ...(id === 'root' ? { outside: true } : {}) })),
    edges: [
      ['root', 'id'],
      ['root', 'underscore'],
      ['root', 's'],
      ['root', 'dollar'],
      ['underscore', 'id'],
      ['s', 'id'],
      ['dollar', 'id'],
      ['dollar', 'underscore'],
      ['s', 'tail1'],
      ['tail1', 'tail2'],
      ['tail2', 'tail3'],
      ['dollar', 'leaf1'],
      ['dollar', 'leaf2'],
    ].map(([from, to]) => ({
      from,
      to,
      label: from === 'root' ? 'x'.repeat(40) : to === 'tail3' ? 'x'.repeat(34) : 'x',
    })),
  };
  const states = polishSubgroup(m),
    nodes = new Map(states.map((s) => [s.id, s])),
    cycles = cycleAnalysis(m).cycles,
    count = (items) => {
      const map = new Map(items.map((s) => [s.id, s]));
      return cycles.reduce(
        (sum, c) => sum + items.filter((s) => !c.includes(s.id) && insideCycle(s, c, map)).length,
        0,
      );
    };
  assert.ok(count(states) < count(m.states));
  assert.equal(nodes.get('tail1').y, nodes.get('tail2').y);
  assert.equal(nodes.get('tail2').y, nodes.get('tail3').y);
  assert.equal(
    validateRouteSeparation(
      corridorRoutes(
        { ...m, states },
        m.edges.map((e) => e.label),
      ),
      { maxDepth: 24 },
    ).status,
    'clear',
  );
});
const machine = () => ({
  start: 'n0',
  states: Array.from({ length: 14 }, (_, i) => ({
    id: `n${i}`,
    name: `n${i}`,
    token: '',
    x: i * 240,
    y: 0,
  })),
  edges: Array.from({ length: 13 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: 'a' })),
  comments: [],
});
const snapshot = (m, routes) => ({
  routes,
  nodes: new Map(m.states.map((s) => [s.id, { x: s.x, y: s.y }])),
});

test('cycle balancing improves edge equality while preserving routed feasibility', () => {
  const m = {
    start: 'entry',
    states: [
      { id: 'entry', x: -500, y: 0 },
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 300, y: -200 },
      { id: 'c', x: 300, y: 200 },
    ],
    edges: [
      { from: 'entry', to: 'a', label: 'entry' },
      { from: 'a', to: 'b', label: 'a' },
      { from: 'b', to: 'c', label: 'b' },
      { from: 'c', to: 'a', label: 'c' },
    ],
  };
  const variation = (states) => {
    const n = new Map(states.map((s) => [s.id, s])),
      lengths = [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ].map(([a, b]) => Math.hypot(n.get(a).x - n.get(b).x, n.get(a).y - n.get(b).y));
    return (Math.max(...lengths) - Math.min(...lengths)) / (lengths.reduce((a, b) => a + b, 0) / 3);
  };
  const result = compactAesthetics(m);
  assert.ok(variation(result) < variation(m.states));
  assert.ok(
    corridorRoutes(
      { ...m, states: result },
      m.edges.map((e) => e.label),
    ),
  );
});

test('long simple cycles and their analysis are independent of parallel transition multiplicity', () => {
  const m = {
    states: Array.from({ length: 12 }, (_, i) => ({
      id: `v${String(i).padStart(2, '0')}`,
      x: Math.cos((i * Math.PI) / 6) * 400,
      y: Math.sin((i * Math.PI) / 6) * 400,
    })),
    edges: [],
  };
  m.states.forEach((s, i) =>
    m.edges.push({ from: s.id, to: m.states[(i + 1) % 12].id, label: 'a' }),
  );
  const cycles = cycleAnalysis(m).cycles;
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 12);
  m.edges.push({ ...m.edges[0], label: 'b' }, { ...m.edges[0], label: 'c' });
  assert.deepEqual(cycleAnalysis(m).cycles, cycles);
});

test('flow separation is a weak score and already opposed directions have no penalty', () => {
  const m = {
      states: [
        { id: 'in', x: -200, y: 0 },
        { id: 'middle', x: 0, y: 0 },
        { id: 'out', x: -200, y: 100 },
      ],
      edges: [
        { from: 'in', to: 'middle', label: 'a' },
        { from: 'middle', to: 'out', label: 'b' },
      ],
    },
    analysis = cycleAnalysis(m);
  const cramped = cycleScore(analysis, new Map(m.states.map((s) => [s.id, s])));
  const opposed = cycleScore(
    analysis,
    new Map(m.states.map((s) => [s.id, s.id === 'out' ? { ...s, x: 200, y: 0 } : s])),
  );
  assert.ok(cramped > opposed);
  assert.ok(cramped <= 12);
  assert.equal(opposed, 0);
});

test('a dangling state can move out of a cycle without adding crossings', () => {
  const m = {
      start: 'a',
      states: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 600, y: 0 },
        { id: 'c', x: 300, y: 600 },
        { id: 'leaf', x: 300, y: 350 },
      ],
      edges: [
        { from: 'a', to: 'b', label: 'a' },
        { from: 'b', to: 'c', label: 'b' },
        { from: 'c', to: 'a', label: 'c' },
        { from: 'c', to: 'leaf', label: 'exit' },
      ],
    },
    cycle = cycleAnalysis(m).cycles[0];
  assert.ok(insideCycle(m.states[3], cycle, new Map(m.states.map((s) => [s.id, s]))));
  const states = compactAesthetics(m),
    nodes = new Map(states.map((s) => [s.id, s]));
  assert.equal(insideCycle(nodes.get('leaf'), cycle, nodes), false);
  assert.ok(
    corridorRoutes(
      { ...m, states },
      m.edges.map((e) => e.label),
    ),
  );
});

test('unequal reciprocal bundles keep all lanes in clockwise directional bands', () => {
  for (const [a, b] of [
    ['a', 'b'],
    ['z', 'a'],
  ]) {
    const m = {
        states: [
          { id: a, x: 0, y: 0 },
          { id: b, x: 400, y: 0 },
        ],
        edges: [
          { from: a, to: b, label: '1' },
          { from: a, to: b, label: '2' },
          { from: b, to: a, label: 'back' },
          { from: a, to: b, label: '3' },
        ],
      },
      before = JSON.stringify(m.edges),
      routes = corridorRoutes(
        m,
        m.edges.map((e) => e.label),
      );
    assert.ok(routes);
    assert.equal(transitionBundles(m).length, 1);
    for (const [i, e] of m.edges.entries()) {
      const from = m.states.find((s) => s.id === e.from),
        to = m.states.find((s) => s.id === e.to),
        p = curvePoint(routes[i], 0.5);
      assert.ok((to.x - from.x) * (p.y - from.y) - (to.y - from.y) * (p.x - from.x) < 0);
    }
    assert.equal(validateRouteSeparation(routes, { maxDepth: 24 }).status, 'clear');
    assert.equal(JSON.stringify(m.edges), before);
  }
});

test('circle construction can move a whole branch even when the old area cutoff would reject it', () => {
  const states = [
      { id: 'r', x: 0, y: 0 },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`,
        x: Math.cos((i * Math.PI) / 3) * (220 + i * 30),
        y: Math.sin((i * Math.PI) / 3) * (220 + i * 30),
      })),
      { id: 'tip', x: 420, y: 0 },
    ],
    edges = [
      ...Array.from({ length: 6 }, (_, i) => ({ from: 'r', to: `s${i}`, label: 'x'.repeat(70) })),
      { from: 's0', to: 'tip', label: 'a' },
    ],
    m = { start: 'r', states, edges },
    result = circularStartRing(m),
    radii = result.filter((s) => s.id.startsWith('s')).map((s) => Math.hypot(s.x, s.y));
  assert.ok(Math.min(...radii) >= 590);
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-6);
  assert.ok(
    corridorRoutes(
      { ...m, states: result },
      edges.map((e) => e.label),
    ),
  );
  const anchor = result.find((s) => s.id === 's0'),
    tip = result.find((s) => s.id === 'tip');
  assert.ok(Math.hypot(tip.x, tip.y) > Math.hypot(anchor.x, anchor.y));
});

test('dragging reattaches automatic curves and reflows labels despite an unrelated manual bend', () => {
  const m = {
      states: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 240, y: 0 },
        { id: 'c', x: 1000, y: 0 },
        { id: 'd', x: 1240, y: 0 },
      ],
      edges: [
        { from: 'a', to: 'b', label: 'abc' },
        { from: 'c', to: 'd', label: 'manual', bend: { x: 0, y: 50 } },
      ],
    },
    routes = routeEdges(m, (e) => e.label),
    base = snapshot(m, routes);
  m.states[1].x = 0;
  m.states[1].y = 240;
  const preview = interactiveRoutes(m, (e) => e.label, base)[0];
  assert.ok(Math.abs(preview.p0.x) < 1e-6);
  assert.ok(Math.abs(preview.p0.y - 37) < 1e-6);
  assert.ok(Math.abs(preview.label.x) > 10);
  const result = repairDraggedRoutes(m, (e) => e.label, base),
    r = result.routes[0];
  assert.equal(result.status, 'repaired');
  assert.ok(Math.abs(r.p0.x) < 1e-6);
  assert.ok(Math.abs(r.p0.y - 37) < 1e-6);
  assert.ok(Math.abs(r.label.x) > 10);
  assert.equal(result.routes[1], routes[1]);
  assert.notDeepEqual(r.label, routes[0].label);
});

test('disconnected nodes do not change the connected graph or its automatic groups', () => {
  const m = {
    start: 'root',
    states: [{ id: 'root', name: 'Root', token: '', x: 0, y: 0 }],
    edges: [],
    groups: [],
    comments: [],
  };
  for (let branch = 0; branch < 3; branch++)
    for (let i = 0; i < 11; i++) {
      const id = `b${branch}:${i}`;
      m.states.push({ id, name: id, token: '', x: 0, y: 0 });
      m.edges.push({ from: i ? `b${branch}:${i - 1}` : 'root', to: id, label: 'a' });
    }
  const options = { mode: 'circle', spacing: 0.5, smartGroups: true },
    original = solveLayout(layoutTopology(m), null, options).machine,
    extended = structuredClone(m);
  extended.states.push({ id: 'island', name: 'Island', token: '', x: 999, y: 999 });
  const result = solveLayout(layoutTopology(extended), null, options).machine;
  assert.deepEqual(
    result.states.filter((s) => s.id !== 'island'),
    original.states,
  );
  assert.deepEqual(result.groups, original.groups);
  assert.deepEqual(result.edges, original.edges);
});

test('long transition captions stay clear of their source and destination nodes', () => {
  const m = {
      routingPolicy: 'corridor',
      states: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 350, y: 0 },
      ],
      edges: [{ from: 'a', to: 'b', label: 'x'.repeat(90) }],
    },
    route = routeEdges(m, (e) => e.label)[0],
    box = renderedLabelBox(route.label);
  for (const s of m.states)
    assert.ok(
      box.right < s.x - 46 || box.left > s.x + 46 || box.bottom < s.y - 46 || box.top > s.y + 46,
    );
  assert.ok(Math.abs(route.p0.y) < 1e-8);
  assert.ok(Math.abs(route.p3.y) < 1e-8);
});

test('almost horizontal transitions align exactly when feasible and retain clearance', () => {
  const m = {
      start: 'a',
      states: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 300, y: 12 },
        { id: 'c', x: 600, y: 12 },
      ],
      edges: [
        { from: 'a', to: 'b', label: 'a' },
        { from: 'b', to: 'c', label: 'b' },
      ],
    },
    states = alignHorizontal(m);
  assert.deepEqual(
    states.map((s) => s.y),
    [0, 0, 0],
  );
  assert.equal(validateRouteSeparation(routeEdges({ ...m, states })).status, 'clear');
  const blocked = { ...m, states: [...m.states.slice(0, 2), { id: 'obstacle', x: 300, y: 0 }] };
  blocked.edges = [m.edges[0]];
  assert.equal(alignHorizontal(blocked)[1].y, 12);
});

test('radial auto groups keeps a circular start ring with long captions and group names', () => {
  const m = {
    start: 'root',
    states: [{ id: 'root', name: 'Root', token: '', x: 0, y: 0 }],
    edges: [],
  };
  let seed = 1;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let branch = 0; branch < 7; branch++) {
    const key = (index) => `s${branch}_${index}`;
    for (let index = 0; index < 6; index++) {
      const id = key(index);
      const token = random() < 0.6 ? 'TOKEN_' + 'X'.repeat(20 + Math.floor(random() * 250)) : '';
      m.states.push({ id, name: id, token, x: 0, y: 0 });
      m.edges.push({
        from: index ? key(Math.floor(random() * index)) : m.start,
        to: id,
        label: String.fromCharCode(97 + branch),
      });
      if (index > 1 && random() < 0.4)
        m.edges.push({ from: id, to: key(Math.floor(random() * index)), label: 'x' });
    }
  }
  const result = solveLayout(layoutTopology(m), null, {
    mode: 'circle',
    smartGroups: true,
    spacing: 0.5,
  });
  assert.ok(result.groups > 0);
  assert.deepEqual(result.machine.edges, m.edges);
  const overview = graphView(result.machine);
  const root = overview.states.find((state) => state.id === overview.start);
  const neighbors = new Set(
    overview.edges
      .filter((edge) => edge.from === root.id && edge.to !== root.id)
      .map((edge) => edge.to),
  );
  const radii = overview.states
    .filter((state) => neighbors.has(state.id))
    .map((state) => Math.hypot(state.x - root.x, state.y - root.y));
  assert.ok(radii.length >= 3);
  assert.ok(Math.min(...radii) > 0);
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-6, `Start ring radii: ${radii}`);
});

test('a corridor enters an accepting state from below without crossing its token caption', () => {
  const machine = {
    states: [
      { id: 'source', x: 0, y: 250 },
      { id: 'final', x: 0, y: 0, token: 'LONG_ACCEPTING_TOKEN_NAME' },
    ],
    edges: [{ from: 'source', to: 'final', label: 'a' }],
  };
  const routes = corridorRoutes(machine, ['a']);
  assert.ok(routes);
  assert.ok(curveAvoidsBox(routes[0], { left: -73, right: 73, top: 46, bottom: 60 }));
});

test('a feasible start ring remains circular through aesthetic cleanup', () => {
  const m = {
    start: 'root',
    states: [
      { id: 'root', x: 0, y: 0 },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `a${i}`,
        x: Math.cos((i * Math.PI) / 3) * (300 + i * 50),
        y: Math.sin((i * Math.PI) / 3) * (300 + i * 50),
      })),
    ],
    edges: Array.from({ length: 6 }, (_, i) => ({ from: 'root', to: `a${i}`, label: 'a' })),
  };
  const ring = circularStartRing(m),
    states = compactAesthetics({ ...m, states: ring }, { radial: true, preserveStartRing: true });
  const radii = states.slice(1).map((s) => Math.hypot(s.x, s.y));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-6);
  assert.ok(
    corridorRoutes(
      { ...m, states },
      m.edges.map((e) => e.label),
    ),
  );
});

test('radial flow favors descendants outward while keeping routed feasibility', () => {
  const m = {
    start: 'r',
    states: [
      { id: 'r', x: 0, y: 0 },
      { id: 'p', x: 300, y: 0 },
      { id: 'c', x: 100, y: 100 },
    ],
    edges: [
      { from: 'r', to: 'p', label: 'a' },
      { from: 'p', to: 'c', label: 'b' },
    ],
  };
  const states = compactAesthetics(m, { radial: true }),
    p = states[1],
    c = states[2];
  assert.ok(Math.hypot(c.x, c.y) > Math.hypot(p.x, p.y));
  assert.ok(corridorRoutes({ ...m, states }, ['a', 'b']));
});

test('fit centers the graph on the canvas when a side tester is collapsed', () => {
  const previous = globalThis.document;
  globalThis.document = {
    body: { dataset: { testerDock: 'right' }, classList: { contains: () => true } },
    querySelector: () => ({
      getBoundingClientRect: () => ({
        left: 750,
        right: 1000,
        top: 0,
        bottom: 600,
        width: 250,
        height: 600,
      }),
    }),
  };
  try {
    const canvas = {
        clientWidth: 1000,
        clientHeight: 600,
        getBoundingClientRect: () => ({
          left: 0,
          right: 1000,
          top: 0,
          bottom: 600,
          width: 1000,
          height: 600,
        }),
      },
      bounds = { x: -100, y: 50, width: 400, height: 300 },
      v = createViewport({}).fittedView(bounds, canvas),
      t = canvasTransform(v, 1000, 600);
    assert.ok(Math.abs(t.x + (bounds.x + bounds.width / 2) * t.scale - 500) < 1e-6);
    assert.ok(Math.abs(t.y + (bounds.y + bounds.height / 2) * t.scale - 300) < 1e-6);
  } finally {
    globalThis.document = previous;
  }
});

test('label-aware compaction shortens short branches without shrinking the configured edge', () => {
  const m = {
    start: 'root',
    states: [
      { id: 'root', x: -800, y: 0 },
      { id: 'join', x: 0, y: 0 },
      { id: 'up', x: 200, y: -600 },
      { id: 'down', x: 200, y: 600 },
    ],
    edges: [
      { from: 'root', to: 'join', label: 'x'.repeat(70) },
      { from: 'join', to: 'up', label: 'a' },
      { from: 'join', to: 'down', label: 'b' },
    ],
  };
  const states = compactAesthetics(m),
    nodes = new Map(states.map((s) => [s.id, s]));
  const distance = (a, b) =>
    Math.hypot(nodes.get(a).x - nodes.get(b).x, nodes.get(a).y - nodes.get(b).y);
  assert.ok(distance('root', 'join') >= 590);
  assert.ok(distance('join', 'up') < 350);
  assert.ok(distance('join', 'down') < 350);
  assert.ok(
    corridorRoutes(
      { ...m, states },
      m.edges.map((e) => e.label),
    ),
  );
});

test('reciprocal lanes prefer readable separation while remaining disjoint', () => {
  const m = {
    states: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 240 },
    ],
    edges: [
      { from: 'a', to: 'b', label: 'a' },
      { from: 'b', to: 'a', label: 'b' },
    ],
  };
  const routes = corridorRoutes(m, ['a', 'b']),
    a = curvePoint(routes[0], 0.5),
    b = curvePoint(routes[1], 0.5);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 25);
  assert.equal(validateRouteSeparation(routes).status, 'clear');
});

test('attached comments can choose the free side of their anchor', () => {
  const m = {
    routingPolicy: 'corridor',
    states: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 240, y: 0 },
    ],
    edges: [{ from: 'a', to: 'b', label: 'a' }],
    comments: [{ id: 'c', nodeId: 'a', text: 'A note', x: 0, y: 0 }],
  };
  placeCommentsAfterLayout(m);
  const c = m.comments[0],
    size = commentLayout(c),
    routes = routeEdges(m, (e) => e.label);
  assert.ok(
    routes.every((r) =>
      curveAvoidsBox(r, { left: c.x, right: c.x + size.w, top: c.y, bottom: c.y + size.h }),
    ),
  );
});
test('feasible layout is independent of drawing geometry and retains clear skeletons', () => {
  const m = machine(),
    a = feasibleRadial(m),
    moved = structuredClone(m);
  moved.states.reverse().forEach((s, i) => {
    s.x = i * 53;
    s.y = -i * 15;
  });
  moved.edges.reverse();
  const b = feasibleRadial(moved);
  assert.deepEqual(a.states, b.states);
  const c = drawingClearance(a.states, m.edges);
  assert.equal(c.crossings, 0);
  assert.ok(c.node >= 200);
  assert.ok(c.wire >= 110);
});
test('corridor routes certify all reciprocal and parallel lanes and loops', () => {
  const m = machine();
  m.edges.push(
    { from: 'n1', to: 'n0', label: 'b' },
    { from: 'n0', to: 'n1', label: 'c' },
    { from: 'n3', to: 'n3', label: 'd' },
  );
  const routes = corridorRoutes(
    m,
    m.edges.map((e) => e.label),
  );
  assert.ok(routes);
  assert.equal(routes.length, m.edges.length);
  assert.equal(validateRouteSeparation(routes, { maxDepth: 24 }).status, 'clear');
});
test('drag repair preserves every route outside the geometric dirty region exactly', () => {
  const m = machine(),
    routes = corridorRoutes(
      m,
      m.edges.map((e) => e.label),
    ),
    base = snapshot(m, routes);
  m.states.at(-1).y = 100;
  const result = repairDraggedRoutes(m, (e) => e.label, base);
  assert.equal(result.status, 'repaired');
  assert.ok(result.dirty.length < 4);
  for (let i = 0; i < routes.length; i++)
    if (!result.dirty.includes(i)) assert.equal(result.routes[i], routes[i]);
  assert.deepEqual(
    m.states.slice(0, -1).map((s) => ({ x: s.x, y: s.y })),
    [...base.nodes.values()].slice(0, -1),
  );
});
test('drag repair detours a wire when a state moves onto its centerline', () => {
  const m = {
    states: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 600, y: 0 },
      { id: 'obstacle', x: 300, y: 180 },
    ],
    edges: [{ from: 'a', to: 'b', label: 'x' }],
  };
  const base = snapshot(m, corridorRoutes(m, ['x']));
  m.states[2].y = 0;
  const repaired = repairDraggedRoutes(m, (e) => e.label, base);
  assert.equal(repaired.status, 'repaired');
  assert.ok(curveAvoidsBox(repaired.routes[0], { left: 254, right: 346, top: -46, bottom: 46 }));
});
test('drag region budget preserves the user edit and reports unverified geometry', () => {
  const m = machine(),
    routes = corridorRoutes(
      m,
      m.edges.map((e) => e.label),
    ),
    base = snapshot(m, routes);
  m.states[0].x = 2000;
  const result = repairDraggedRoutes(m, (e) => e.label, base, { maxDirty: 1 });
  assert.equal(result.status, 'unverified');
  assert.equal(m.states[0].x, 2000);
});
test('spatial hash handles long segments, updates and deletion', () => {
  const index = new SpatialIndex(10);
  index.set('long', { left: -1e5, right: 1e5, top: 0, bottom: 1 });
  index.set('small', { left: 0, right: 1, top: 0, bottom: 1 });
  assert.deepEqual(index.query({ left: 0, right: 2, top: 0, bottom: 2 }).sort(), ['long', 'small']);
  index.set('small', { left: 100, right: 101, top: 100, bottom: 101 });
  index.delete('long');
  assert.deepEqual(index.query({ left: 0, right: 2, top: 0, bottom: 2 }), []);
});

test('settled geometry survives JSON import and becomes invalid after another edit', () => {
  const m = machine(),
    routes = corridorRoutes(
      m,
      m.edges.map((e) => e.label),
    );
  routes[0].label.y -= 40;
  storeDrawingRoutes(
    m,
    m,
    m.edges.map((e) => e.label),
    routes,
  );
  const loaded = parseMachine(JSON.stringify(m));
  assert.deepEqual(
    routeEdges(loaded, (e) => e.label),
    routes,
  );
  loaded.states[0].y += 50;
  assert.notDeepEqual(
    routeEdges(loaded, (e) => e.label),
    routes,
  );
});

test('live routing rejects stale geometry and sends patches after its baseline', () => {
  const originalWorker = globalThis.Worker,
    workers = [];
  class FakeWorker {
    constructor() {
      this.messages = [];
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  }
  globalThis.Worker = FakeWorker;
  try {
    const m = machine(),
      routing = createLiveRouting({ queueDraw() {}, openGroup: null }),
      base = snapshot(
        m,
        corridorRoutes(
          m,
          m.edges.map((e) => e.label),
        ),
      );
    routing.snapshot(m, false, base);
    const worker = workers[0],
      first = worker.messages[0];
    m.states[0].y += 20;
    routing.snapshot(m, false, base);
    worker.onmessage({
      data: {
        key: first.key,
        topology: first.topology,
        routes: base.routes,
        nodes: [...base.nodes],
      },
    });
    assert.equal(routing.snapshot(m, false, base), null);
    const patch = worker.messages[1];
    assert.equal(patch.machine, undefined);
    assert.equal(patch.patch.states.length, 1);
    worker.onmessage({
      data: {
        key: patch.key,
        topology: patch.topology,
        routes: base.routes,
        nodes: [...base.nodes],
      },
    });
    assert.ok(routing.snapshot(m, false, base));
    m.states[0].y += 20;
    const lastGood = routing.snapshot(m, false, base);
    assert.ok(lastGood);
    const blocked = worker.messages[2];
    worker.onmessage({
      data: {
        key: blocked.key,
        topology: blocked.topology,
        status: 'unverified',
      },
    });
    assert.equal(routing.snapshot(m, false, base), lastGood);
    routing.dispose();
    assert.ok(worker.terminated);
  } finally {
    globalThis.Worker = originalWorker;
  }
});
