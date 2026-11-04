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
    routing.dispose();
    assert.ok(worker.terminated);
  } finally {
    globalThis.Worker = originalWorker;
  }
});
