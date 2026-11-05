import { placeFloatingRect } from './src/core/floating-placement.js';
test('floating panels stop at canvas edges and leave a gap around controls', () => {
  const area = {
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
    },
    obstacle = {
      left: 270,
      top: 0,
      right: 340,
      bottom: 180,
    },
    size = {
      width: 120,
      height: 100,
    };
  const placed = placeFloatingRect(
    {
      x: 275,
      y: 35,
    },
    size,
    area,
    [obstacle],
    12,
  );
  assert.ok(
    placed.x >= 12 &&
      placed.y >= 12 &&
      placed.x + size.width <= 588 &&
      placed.y + size.height <= 388,
  );
  assert.ok(
    placed.x + size.width + 12 <= obstacle.left ||
      placed.x - 12 >= obstacle.right ||
      placed.y - 12 >= obstacle.bottom,
  );
});
import { createTokenizationCache } from './src/core/lexer-cache.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  example,
  tokenize,
  toTikz,
  validate,
  isAccepting,
  setAccepting,
} from './src/core/lexer.js';
test('lexer emits longest matches and marks whitespace skipped', () => {
  assert.deepEqual(
    tokenize(example(), 'hello_2 42+').map((t) => [t.token, t.value, !!t.skip]),
    [
      ['IDENT', 'hello_2', false],
      ['WS', ' ', true],
      ['NUMBER', '42', false],
      ['ERROR', '+', false],
    ],
  );
});
test('ambiguity is reported instead of selecting a random transition', () => {
  const m = example();
  m.edges.push({
    from: 's0',
    to: 's2',
    label: '[a-z]',
  });
  assert.throws(() => tokenize(m, 'a'), /Ambiguous/);
});
test('TikZ exports positions, loops, accepting and initial states; escapes labels', () => {
  const m = example();
  m.states[1].token = 'ID_%';
  const t = toTikz(m);
  assert.match(t, /documentclass/);
  assert.match(t, /state,initial/);
  assert.match(t, /state,accepting/);
  assert.match(t, /controls/);
  assert.ok(t.includes('ID\\_\\%'));
  assert.ok(t.includes('\\textbackslash{}s'));
  assert.ok(!toTikz(m, false).includes('documentclass'));
});
test('import rejects broken references and malformed regex', () => {
  const m = example();
  m.edges[0].to = 'missing';
  assert.throws(() => validate(m));
  m.edges[0].to = 's1';
  m.edges[0].label = '[';
  assert.throws(() => validate(m));
});
test('longest match backtracks to last accepting state', () => {
  const m = {
    start: 'a',
    states: [
      {
        id: 'a',
        name: 'a',
        token: '',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        name: 'b',
        token: 'B',
        x: 1,
        y: 1,
      },
      {
        id: 'c',
        name: 'c',
        token: '',
        x: 2,
        y: 2,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'a',
      },
      {
        from: 'b',
        to: 'c',
        label: 'b',
      },
    ],
  };
  assert.deepEqual(
    tokenize(m, 'ab').map((t) => t.token),
    ['B', 'ERROR'],
  );
});
import { autoLayout, routeEdges, loopDragBend, loopAngles } from './src/core/layout.js';
test('reciprocal connections take distinct sides with separate labels', () => {
  const machine = {
    states: [
      {
        id: 'a',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        x: 200,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'forward',
      },
      {
        from: 'b',
        to: 'a',
        label: 'back',
      },
    ],
  };
  const [forward, back] = routeEdges(machine);
  assert.ok(forward.label.y < 0 && back.label.y > 0);
  assert.ok(Math.abs(forward.label.y - back.label.y) > 70);
});
import { statePortalBox } from './src/core/portals.js';
test('angular refinement spreads neighbors without changing their cyclic order or placing comments', () => {
  const m = {
    start: 'hub',
    states: [
      { id: 'hub', x: 0, y: 0 },
      ...[0, 0.5, 3.4].map((a, i) => ({ id: 'n' + i, x: 450 * Math.cos(a), y: 450 * Math.sin(a) })),
    ],
    edges: [0, 1, 2].map((i) => ({ from: 'hub', to: 'n' + i, label: 'a' })),
    comments: [{ id: 'note', text: 'Later', nodeIds: ['hub'], x: 40, y: 50 }],
  };
  const before = angularResolution(m),
    order = () =>
      m.states
        .slice(1)
        .toSorted((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x))
        .map((s) => s.id),
    original = order();
  regularizeAngles(m);
  assert.ok(angularResolution(m) < before * 0.1);
  const next = order(),
    start = next.indexOf(original[0]);
  assert.deepEqual(
    original,
    next.map((_, i) => next[(start + i) % next.length]),
  );
  assert.equal(crossingPairs(m).length, 0);
  assert.deepEqual([m.comments[0].x, m.comments[0].y], [40, 50]);
});
test('a small radial star uses equal angular slots without bending its spokes', () => {
  const m = {
    start: 'hub',
    states: [
      { id: 'hub', x: 0, y: 0 },
      ...[0, 0.6, 3.5].map((a, i) => ({ id: 'n' + i, x: 600 * Math.cos(a), y: 600 * Math.sin(a) })),
    ],
    edges: [
      { from: 'hub', to: 'n0', label: 'a' },
      { from: 'n1', to: 'hub', label: 'b' },
      { from: 'hub', to: 'n2', label: 'c' },
    ],
  };
  regularizeAngles(m);
  const routes = routeEdges(m),
    angles = routes
      .map((r, i) => {
        const p = m.edges[i].from === 'hub' ? r.p0 : r.p3;
        assert.ok(Math.abs(Math.hypot(p.x, p.y) - 37) < 1e-8);
        return Math.atan2(p.y, p.x);
      })
      .sort((a, b) => a - b);
  for (let i = 0; i < angles.length; i++)
    assert.ok(
      Math.abs(
        (i === angles.length - 1 ? angles[0] + 2 * Math.PI : angles[i + 1]) -
          angles[i] -
          (2 * Math.PI) / 3,
      ) < 1e-6,
    );
  assert.equal(crossingPairs(m, true).length, 0);
  for (const { p0, p3, c1, c2 } of routes)
    for (const control of [c1, c2])
      assert.ok(
        Math.abs((p3.x - p0.x) * (control.y - p0.y) - (p3.y - p0.y) * (control.x - p0.x)) < 1e-6,
      );
});
test('reciprocal curves stay on opposite physical sides even with an obstacle', () => {
  const m = {
    start: null,
    states: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 400, y: 0 },
      { id: 'obstacle', x: 200, y: 90 },
    ],
    edges: [
      { from: 'a', to: 'b', label: 'a' },
      { from: 'b', to: 'a', label: 'b' },
    ],
  };
  const [a, b] = routeEdges(m),
    middle = (r) => (r.p0.y + 3 * r.c1.y + 3 * r.c2.y + r.p3.y) / 8;
  assert.ok(middle(a) * middle(b) < 0);
});
test('auto layout separates all states and retains topology', () => {
  const m = example();
  for (const s of m.states) {
    s.x = 0;
    s.y = 0;
  }
  const edges = JSON.stringify(m.edges);
  autoLayout(m);
  assert.equal(JSON.stringify(m.edges), edges);
  for (let i = 0; i < m.states.length; i++)
    for (let j = i + 1; j < m.states.length; j++)
      assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 160);
  assert.ok(m.states.find((s) => s.id === m.start).x < m.states[1].x);
});
test('routed labels avoid nodes and one another after layout', () => {
  const m = autoLayout(example()),
    routes = routeEdges(m);
  for (const r of routes) {
    for (const s of m.states)
      assert.ok(
        Math.abs(r.label.x - s.x) > (r.label.w + 90) / 2 ||
          Math.abs(r.label.y - s.y) > (r.label.h + 90) / 2,
      );
    assert.ok(!r.d.includes('NaN'));
  }
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i].label,
        b = routes[j].label;
      assert.ok(Math.abs(a.x - b.x) > (a.w + b.w) / 2 || Math.abs(a.y - b.y) > (a.h + b.h) / 2);
    }
});
test('layout handles disconnected states and multiple loops', () => {
  const m = example();
  m.states.push({
    id: 'unused',
    name: 'unused',
    token: '',
    x: 0,
    y: 0,
  });
  m.edges.push({
    from: 's1',
    to: 's1',
    label: '[0-9]',
  });
  autoLayout(m);
  assert.equal(new Set(m.states.map((s) => s.x + ',' + s.y)).size, m.states.length);
  const r = routeEdges(m);
  assert.notEqual(r[1].d, r.at(-1).d);
  assert.equal(r.length, m.edges.length);
});
test('accepting toggles preserve token names and affect lexer and TikZ', () => {
  const m = example(),
    s = m.states[1];
  s.token = 'CUSTOM';
  setAccepting(s, false);
  assert.equal(s.token, 'CUSTOM');
  assert.equal(isAccepting(s), false);
  assert.equal(tokenize(m, 'a')[0].token, 'ERROR');
  assert.ok(!toTikz(m).includes('texttt{CUSTOM}'));
  setAccepting(s, true);
  assert.equal(tokenize(m, 'a')[0].token, 'CUSTOM');
  assert.ok(toTikz(m).includes('texttt{CUSTOM}'));
});
test('an unassigned initial state can be saved and exported, but cannot run', () => {
  const m = example();
  m.start = null;
  assert.equal(validate(m), m);
  assert.ok(!toTikz(m).includes('state,initial'));
  assert.throws(() => tokenize(m, 'a'), /initial state/);
  m.start = 's1';
  assert.equal((toTikz(m).match(/state,initial/g) || []).length, 1);
});
import { destination, enablePortal, renamePortal } from './src/core/lexer.js';
import { readFileSync } from 'node:fs';
test('portal aliases preserve tokenization, survive JSON and export as TeX tags', () => {
  const m = example(),
    before = tokenize(m, 'hello 42');
  enablePortal(m, m.edges[0]);
  assert.deepEqual(tokenize(m, 'hello 42'), before);
  assert.equal(destination(m, m.edges[0]).id, 's1');
  assert.deepEqual(validate(JSON.parse(JSON.stringify(m))), m);
  assert.ok(routeEdges(m)[0].portalBox);
  assert.match(toTikz(m), /IDENTIFIER/);
});
test('portal resolution uses its name and detects missing or duplicate targets', () => {
  const m = example();
  enablePortal(m, m.edges[0]);
  m.states[1].portal = '';
  assert.throws(() => tokenize(m, 'a'), /no destination/);
  m.states[2].portal = 'IDENTIFIER';
  assert.equal(tokenize(m, 'a')[0].token, 'NUMBER');
  m.states[1].portal = 'IDENTIFIER';
  assert.throws(() => tokenize(m, 'a'), /multiple destinations/);
});
test('portal rename updates references and deleted targets remain repairable', () => {
  const m = example();
  enablePortal(m, m.edges[0]);
  renamePortal(m, m.states[1], 'NAME_%');
  assert.equal(m.edges[0].portal, 'NAME_%');
  assert.ok(toTikz(m).includes('NAME\\_\\%'));
  m.states = m.states.filter((s) => s.id !== 's1');
  m.edges = m.edges.filter((e) => e.from !== 's1');
  validate(m);
  assert.throws(() => tokenize(m, 'a'), /no destination/);
  assert.doesNotThrow(() => toTikz(m));
});
test('portal JSON fixture produces the expected tokens', () => {
  const m = validate(
    JSON.parse(readFileSync(new URL('./fixtures/portal_machine.json', import.meta.url))),
  );
  assert.deepEqual(
    tokenize(m, 'hello 42')
      .filter((t) => !t.skip)
      .map((t) => t.token),
    ['IDENT', 'NUMBER'],
  );
});
import { copySelection, pasteSelection } from './src/core/selection.js';
import { commentLayout } from './src/core/comments.js';
import { regularizeAngles, angularResolution } from './src/core/angular-layout.js';
test('pasting a group remaps state IDs and internal edges without duplicating the initial state', () => {
  const m = example();
  const fragment = copySelection(m, new Set(['s0', 's1']), new Set(), new Set());
  let n = 0;
  const group = pasteSelection(
    m,
    fragment,
    {
      x: 40,
      y: 60,
    },
    () => `copy${n++}`,
  );
  assert.equal(group.states.size, 2);
  assert.equal(m.states.length, 6);
  assert.equal(m.start, 's0');
  assert.equal(m.states.at(-2).x, 180);
  assert.equal(m.states.at(-2).y, 310);
  assert.equal(m.edges.at(-2).from, 'copy0');
  assert.equal(m.edges.at(-2).to, 'copy1');
  assert.equal(m.edges.at(-1).from, 'copy1');
  assert.equal(m.edges.at(-1).to, 'copy1');
  validate(m);
});
test('pasted portals rename copied destinations and update their copied references', () => {
  const m = example();
  enablePortal(m, m.edges[0]);
  const fragment = copySelection(m, new Set(['s0', 's1']), new Set(), new Set());
  let n = 0;
  pasteSelection(
    m,
    fragment,
    {
      x: 20,
      y: 20,
    },
    () => `portal-copy${n++}`,
  );
  assert.equal(m.states.at(-1).portal, 'IDENTIFIER_2');
  assert.equal(m.edges.at(-2).portal, 'IDENTIFIER_2');
  assert.equal(destination(m, m.edges.at(-2)).id, m.states.at(-1).id);
});
test('copying a portal source alone preserves its link to the existing destination', () => {
  const m = example();
  enablePortal(m, m.edges[0]);
  const fragment = copySelection(m, new Set(['s0']), new Set(), new Set());
  let n = 0;
  pasteSelection(
    m,
    fragment,
    {
      x: 20,
      y: 20,
    },
    () => `source-copy${n++}`,
  );
  assert.equal(m.edges.at(-1).portal, 'IDENTIFIER');
  assert.equal(destination(m, m.edges.at(-1)).id, 's1');
});
test('comments round trip, export with TeX escaping, and do not change lexer output', () => {
  const m = example(),
    before = tokenize(m, 'hello 42');
  m.comments = [
    {
      id: 'note',
      x: -100,
      y: 20,
      text: 'Lexer & tokens\nuse ID_%',
    },
  ];
  validate(m);
  assert.deepEqual(tokenize(m, 'hello 42'), before);
  const tex = toTikz(m);
  assert.ok(tex.includes('Lexer \\& tokens'));
  assert.ok(tex.includes('ID\\_\\%'));
  assert.ok(commentLayout(m.comments[0]).lines.length === 2);
  assert.deepEqual(JSON.parse(JSON.stringify(m)).comments, m.comments);
});
test('comments can be copied and pasted without states, including into an empty machine', () => {
  const m = example();
  m.comments = [
    {
      id: 'note',
      text: 'Notes',
      x: 10,
      y: 20,
    },
  ];
  const f = copySelection(m, new Set(), new Set(), new Set(['note']));
  const empty = {
    states: [],
    edges: [],
    comments: [],
    start: null,
  };
  let n = 0;
  const result = pasteSelection(
    empty,
    f,
    {
      x: 40,
      y: 40,
    },
    () => `note-copy${n++}`,
  );
  assert.equal(empty.states.length, 0);
  assert.equal(empty.comments[0].x, 50);
  assert.equal(empty.comments[0].y, 60);
  assert.equal(result.comments.size, 1);
  validate(empty);
  autoLayout(empty);
  assert.doesNotThrow(() => toTikz(empty));
});
test('invalid clipboard data and comments are rejected before changing the machine', () => {
  const m = example(),
    before = JSON.stringify(m);
  assert.throws(() =>
    pasteSelection(m, {
      kind: 'wrong',
    }),
  );
  assert.equal(JSON.stringify(m), before);
  m.comments = [
    {
      id: 'bad',
      text: 'bad',
      x: NaN,
      y: 0,
    },
  ];
  assert.throws(() => validate(m), /comment/);
});
test('unfinished blank transition rules survive saves and exports but cannot run as epsilon', () => {
  const m = example();
  m.edges[0].label = '';
  assert.deepEqual(validate(JSON.parse(JSON.stringify(m))), m);
  assert.doesNotThrow(() => toTikz(m));
  assert.throws(() => tokenize(m, 'hello'), /Transition cannot be empty/);
});
import { insertState } from './src/core/transitions.js';
test('inserting an intermediary connects parent to new state to destination', () => {
  const m = example(),
    before = structuredClone(m),
    s = insertState(m, 's0', 's2', undefined, 'middle');
  assert.equal(m.states.length, before.states.length + 1);
  assert.deepEqual(m.edges.slice(-2), [
    {
      from: 's0',
      to: 'middle',
      label: '',
    },
    {
      from: 'middle',
      to: 's2',
      label: '',
    },
  ]);
  assert.equal(s.x, (before.states[0].x + before.states[2].x) / 2);
  assert.deepEqual(m.edges.slice(0, -2), before.edges);
  assert.equal(m.start, before.start);
  validate(m);
});
test('inserting on blank canvas leaves a connected state for continuing the arrow', () => {
  const m = example();
  insertState(
    m,
    's0',
    null,
    {
      x: -150,
      y: 900,
    },
    'middle',
  );
  assert.deepEqual(m.edges.at(-1), {
    from: 's0',
    to: 'middle',
    label: '',
  });
  assert.equal(m.states.at(-1).x, -150);
  validate(m);
  const before = JSON.stringify(m);
  assert.throws(() => insertState(m, 's0', 'missing'));
  assert.equal(JSON.stringify(m), before);
});
test('tree layout reserves separate bands for uneven subtrees and centers each parent', () => {
  const m = {
    start: 'root',
    states: ['root', 'a', 'b', 'a1', 'a2', 'a3', 'b1', 'b2'].map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['root', 'a'],
      ['root', 'b'],
      ['a', 'a1'],
      ['a', 'a2'],
      ['a2', 'a3'],
      ['b', 'b1'],
      ['b', 'b2'],
      ['b2', 'root'],
    ].map(([from, to]) => ({
      from,
      to,
      label: '[a-z]',
    })),
    comments: [
      {
        id: 'note',
        text: 'Notes',
        x: 0,
        y: 0,
      },
    ],
  };
  autoLayout(m);
  const get = (id) => m.states.find((s) => s.id === id);
  assert.ok(
    Math.max(...['a', 'a1', 'a2', 'a3'].map((id) => get(id).y)) + 150 <
      Math.min(...['b', 'b1', 'b2'].map((id) => get(id).y)),
  );
  assert.equal(get('root').y, (get('a').y + get('b').y) / 2);
  assert.ok(get('a').x > get('root').x);
  assert.ok(get('a3').x > get('a2').x);
  assert.deepEqual(m.comments[0].nodeIds, ['root']);
  assert.ok(Math.hypot(m.comments[0].x - get('root').x, m.comments[0].y - get('root').y) > 40);
  const first = JSON.stringify(m);
  autoLayout(m);
  assert.equal(JSON.stringify(m), first);
  validate(m);
});
test('tree layout keeps a shared destination with its specific parent instead of a distant root shortcut', () => {
  const m = {
    start: 'root',
    states: ['root', 'integer', 'other', 'dot', 'double', 'underscore'].map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['root', 'integer'],
      ['root', 'other'],
      ['integer', 'dot'],
      ['dot', 'double'],
      ['integer', 'underscore'],
      ['underscore', 'integer'],
      ['root', 'dot'],
    ].map(([from, to]) => ({
      from,
      to,
      label: 'x',
    })),
  };
  const edges = JSON.stringify(m.edges);
  autoLayout(m);
  const get = (id) => m.states.find((s) => s.id === id);
  assert.ok(get('dot').x > get('integer').x);
  assert.ok(Math.abs(get('dot').y - get('integer').y) < 300);
  assert.ok(
    get('other').y > Math.max(get('integer').y, get('dot').y, get('double').y, get('underscore').y),
  );
  assert.equal(JSON.stringify(m.edges), edges);
  validate(m);
});
test('radial layout centers the parent and spreads children around it with descendants farther out', () => {
  for (const count of [1, 2, 8, 40]) {
    const m = {
      start: 'q0',
      states: Array.from(
        {
          length: count,
        },
        (_, i) => ({
          id: 'q' + i,
          name: 'q' + i,
          token: 'TOKEN_' + i,
          x: 0,
          y: 0,
        }),
      ),
      edges: Array.from(
        {
          length: count - 1,
        },
        (_, i) => ({
          from: 'q0',
          to: 'q' + (i + 1),
          label: 'x',
        }),
      ),
    };
    const edges = JSON.stringify(m.edges);
    autoLayout(m, 'circle');
    const parent = m.states[0];
    const radii = m.states.slice(1).map((s) => Math.hypot(s.x - parent.x, s.y - parent.y));
    for (const r of radii) assert.ok(r >= 319.99);
    if (count > 2) {
      assert.ok(m.states.some((s) => s.x < parent.x - 1));
      assert.ok(m.states.some((s) => s.x > parent.x + 1));
    }
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++)
        assert.ok(
          Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 319.99,
        );
    assert.equal(JSON.stringify(m.edges), edges);
    validate(m);
    assert.doesNotThrow(() => toTikz(m));
    const first = JSON.stringify(m);
    autoLayout(m, 'circle');
    assert.equal(JSON.stringify(m), first);
  }
  const m = {
    start: 'root',
    states: ['root', 'a', 'b', 'a1', 'a2', 'b1', 'isolated'].map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['root', 'a'],
      ['root', 'b'],
      ['a', 'a1'],
      ['a', 'a2'],
      ['b', 'b1'],
      ['a2', 'root'],
    ].map(([from, to]) => ({
      from,
      to,
      label: 'x',
    })),
  };
  autoLayout(m, 'circle');
  const get = (id) => m.states.find((s) => s.id === id),
    distance = (id) => Math.hypot(get(id).x - get('root').x, get(id).y - get('root').y);
  assert.ok(distance('a1') > distance('a'));
  assert.ok(distance('b1') > distance('b'));
  for (let i = 0; i < m.states.length; i++)
    for (let j = i + 1; j < m.states.length; j++)
      assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 319.99);
  assert.doesNotThrow(() =>
    autoLayout(
      {
        states: [],
        edges: [],
        start: null,
      },
      'circle',
    ),
  );
});
test('radial layout keeps independent branches close when one branch needs a wide sector', () => {
  const leaves = Array.from(
      {
        length: 25,
      },
      (_, i) => 'leaf' + i,
    ),
    chain = Array.from(
      {
        length: 8,
      },
      (_, i) => 'chain' + i,
    ),
    ids = ['root', ...leaves, ...chain];
  const m = {
    start: 'root',
    states: ids.map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [
      ...leaves.map((id) => ({
        from: 'root',
        to: id,
        label: 'x',
      })),
      {
        from: 'root',
        to: chain[0],
        label: 'x',
      },
      ...chain.slice(1).map((id, i) => ({
        from: chain[i],
        to: id,
        label: 'x',
      })),
    ],
  };
  autoLayout(m, 'circle', 0.5);
  const root = m.states[0],
    dist = (s) => Math.hypot(s.x - root.x, s.y - root.y);
  assert.ok(Math.min(...m.states.slice(1, 26).map(dist)) < 750);
  for (let i = 0; i < m.states.length; i++)
    for (let j = i + 1; j < m.states.length; j++)
      assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 159.99);
});
test('layout density adjusts spacing in both modes without changing connections', () => {
  for (const mode of ['tree', 'circle']) {
    const source = example(),
      edges = JSON.stringify(source.edges),
      sizes = [];
    for (const spacing of [0.35, 0.5, 0.75, 1]) {
      const m = autoLayout(structuredClone(source), mode, spacing),
        xs = m.states.map((s) => s.x),
        ys = m.states.map((s) => s.y);
      sizes.push(Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys)));
      assert.equal(JSON.stringify(m.edges), edges);
      assert.equal(m.start, source.start);
      validate(m);
      for (let i = 0; i < m.states.length; i++)
        for (let j = i + 1; j < m.states.length; j++)
          assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) > 110);
    }
    assert.ok(sizes.every((size, i) => i === 0 || size > sizes[i - 1]));
    assert.ok(sizes[0] <= sizes[1] * 0.9);
    assert.deepEqual(
      autoLayout(structuredClone(source), mode, NaN),
      autoLayout(structuredClone(source), mode),
    );
  }
});
test('transition label boxes round trip and toggle in TikZ without changing lexer behavior', () => {
  const m = { ...example(), labelBoxes: false },
    before = tokenize(m, 'hello 42'),
    plain = toTikz(m);
  assert.ok(!plain.includes('rounded corners=1pt'));
  m.labelBoxes = true;
  assert.equal(validate(JSON.parse(JSON.stringify(m))).labelBoxes, true);
  const boxed = toTikz(m);
  assert.equal((boxed.match(/draw=gray,rounded corners=1pt/g) || []).length, m.edges.length);
  assert.deepEqual(tokenize(m, 'hello 42'), before);
  m.labelBoxes = false;
  assert.equal(toTikz(m), plain);
  m.labelBoxes = 'yes';
  assert.throws(() => validate(m), /label box/);
});
test('opaque TeX label boxes render after every transition arrow', () => {
  const m = example();
  m.labelBoxes = true;
  const tex = toTikz(m);
  assert.ok(
    tex.indexOf('node[fill=white,draw=gray,rounded corners=1pt') > tex.lastIndexOf('draw[->]'),
  );
  assert.equal((tex.match(/node\[fill=white,draw=gray/g) || []).length, m.edges.length);
});
import { stateLabel } from './src/core/labels.js';
test('state names wrap at whitespace only when too long, stay centered, and escape TeX', () => {
  assert.deepEqual(stateLabel('  text in   string ').lines, ['text in', 'string']);
  assert.deepEqual(stateLabel('a b').lines, ['a b']);
  assert.deepEqual(stateLabel('identifier').lines, ['identifier']);
  const label = stateLabel('one two three four five six seven eight nine ten eleven twelve');
  assert.ok(label.fontSize < 12);
  assert.ok(label.lineHeight * label.lines.length < 50);
  const m = example();
  m.states[1].name = 'string with ID_%';
  const before = JSON.stringify(m),
    tex = toTikz(m);
  assert.ok(tex.includes('\\shortstack{\\strut string\\\\\\strut with ID\\_\\%}'));
  assert.equal(JSON.stringify(m), before);
});
import { makeComment } from './src/core/comments.js';
test('comments begin exactly at the cursor and attach to the nearest state', () => {
  const m = example(),
    p = {
      x: 450,
      y: 100,
    },
    c = makeComment(m, p, 'cursor-note');
  assert.equal(c.x, p.x);
  assert.equal(c.y, p.y);
  assert.deepEqual(c.nodeIds, ['s1']);
  assert.deepEqual(
    makeComment(
      {
        states: [],
      },
      p,
      'free',
    ).nodeIds,
    [],
  );
});
function assertCommentClearance(machine, comment) {
  const { w, h } = commentLayout(comment);
  assert.ok(Number.isFinite(comment.x) && Number.isFinite(comment.y));
  for (const state of machine.states) {
    const dx = Math.max(comment.x - state.x, 0, state.x - comment.x - w),
      dy = Math.max(comment.y - state.y, 0, state.y - comment.y - h);
    assert.ok(Math.hypot(dx, dy) >= 51.99);
  }
}
test('tree and radial layouts place attached notes in free space and leave detached notes in place', () => {
  for (const mode of ['tree', 'circle'])
    for (const spacing of [0.35, 0.75, 1]) {
      const m = example(),
        s = m.states[1];
      m.comments = [
        {
          id: 'attached',
          text: 'About identifiers',
          nodeId: s.id,
          x: s.x + 80,
          y: s.y - 100,
        },
        {
          id: 'free',
          text: 'Free note',
          nodeId: null,
          x: -300,
          y: -500,
        },
      ];
      autoLayout(m, mode, spacing);
      assertCommentClearance(m, m.comments[0]);
      assert.equal(m.comments[1].x, -300);
      assert.equal(m.comments[1].y, -500);
      const first = JSON.stringify(m);
      autoLayout(m, mode, spacing);
      assert.equal(JSON.stringify(m), first);
      validate(m);
    }
});
test('copying states carries attached notes and remaps attachments, while notes alone detach', () => {
  const m = example();
  m.comments = [
    makeComment(
      m,
      {
        x: 450,
        y: 100,
      },
      'note',
    ),
  ];
  const group = copySelection(m, new Set(['s1']), new Set(), new Set());
  assert.equal(group.comments.length, 1);
  let n = 0;
  pasteSelection(
    m,
    group,
    {
      x: 40,
      y: 40,
    },
    () => `attached-copy${n++}`,
  );
  assert.deepEqual(m.comments.at(-1).nodeIds, ['attached-copy0']);
  assert.equal(m.comments.at(-1).x, 490);
  const noteOnly = copySelection(m, new Set(), new Set(), new Set(['note']));
  assert.deepEqual(noteOnly.comments[0].nodeIds, []);
  const empty = {
    start: null,
    states: [],
    edges: [],
  };
  pasteSelection(
    empty,
    noteOnly,
    {
      x: 0,
      y: 0,
    },
    () => 'free-copy',
  );
  validate(empty);
  assert.deepEqual(empty.comments[0].nodeIds, []);
  m.comments[0].nodeIds = ['missing'];
  assert.throws(() => validate(m), /attachment/);
});
import {
  commentAnchors,
  positionComments,
  commentLinks,
  toggleCommentNode,
  placeCommentsAfterLayout,
} from './src/core/comments.js';
test('layout moves an attached comment away from a state and crossing wire', () => {
  const m = {
    start: 'a',
    states: [
      {
        id: 'a',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        x: 200,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'x',
      },
    ],
    comments: [
      {
        id: 'note',
        text: 'Explanation',
        x: 0,
        y: 0,
        nodeIds: ['a'],
      },
    ],
  };
  placeCommentsAfterLayout(m);
  assert.ok(Math.hypot(m.comments[0].x, m.comments[0].y) > 40);
  const placed = {
    x: m.comments[0].x,
    y: m.comments[0].y,
  };
  placeCommentsAfterLayout(m);
  assert.deepEqual(
    {
      x: m.comments[0].x,
      y: m.comments[0].y,
    },
    placed,
  );
});
test('several states share one comment with toggleable dashed attachments and centroid movement', () => {
  const m = example();
  m.comments = [
    makeComment(
      m,
      {
        x: 600,
        y: 100,
      },
      'note',
    ),
  ];
  m.comments[0].nodeIds = ['s0'];
  toggleCommentNode(m, 'note', 's1');
  assert.deepEqual(m.comments[0].nodeIds, ['s0', 's1']);
  const links = commentLinks(m);
  assert.equal(links.length, 2);
  assert.ok(links.every((link) => Number.isFinite(link.from.x) && Number.isFinite(link.to.y)));
  const anchors = commentAnchors(m);
  m.states[0].x += 100;
  positionComments(anchors);
  assert.equal(m.comments[0].x, 650);
  const before = tokenize(m, 'hi 42');
  assert.ok(toTikz(m).includes('draw[dashed,gray]'));
  assert.deepEqual(tokenize(m, 'hi 42'), before);
  toggleCommentNode(m, 'note', 's0');
  assert.deepEqual(m.comments[0].nodeIds, ['s1']);
  validate(m);
  m.comments[0].nodeIds = ['s1', 's1'];
  assert.throws(() => validate(m), /attachment/);
});
test('many-state comments avoid nodes and copies remap only copied connections', () => {
  for (const mode of ['tree', 'circle']) {
    const m = example();
    m.comments = [
      {
        id: 'note',
        text: 'Shared explanation',
        x: 700,
        y: 50,
        nodeIds: ['s0', 's1'],
      },
    ];
    autoLayout(m, mode);
    assertCommentClearance(m, m.comments[0]);
    const fragment = copySelection(m, new Set(['s1']), new Set(), new Set());
    assert.deepEqual(fragment.comments[0].nodeIds, ['s1']);
    let n = 0;
    pasteSelection(
      m,
      fragment,
      {
        x: 40,
        y: 40,
      },
      () => `multi-copy${n++}`,
    );
    assert.deepEqual(m.comments.at(-1).nodeIds, ['multi-copy0']);
    validate(m);
  }
});
test('dashed comment links terminate on the state circle and the comment box border', () => {
  const m = example();
  m.comments = [
    {
      id: 'note',
      text: 'Explanation',
      x: 650,
      y: 50,
      nodeIds: ['s0', 's1'],
    },
  ];
  for (const link of commentLinks(m)) {
    const state = m.states.find((s) => s.id === link.nodeId),
      note = m.comments[0],
      size = commentLayout(note);
    assert.ok(Math.abs(Math.hypot(link.to.x - state.x, link.to.y - state.y) - 36) < 1e-8);
    assert.ok(
      Math.min(
        Math.abs(link.from.x - note.x),
        Math.abs(link.from.x - note.x - size.w),
        Math.abs(link.from.y - note.y),
        Math.abs(link.from.y - note.y - size.h),
      ) < 1e-8,
    );
  }
});
import { parseMachine } from './src/core/lexer.js';
test('pasted machine JSON shares file validation and enforces the 1 MB limit', () => {
  const machine = example();
  machine.comments = [
    {
      id: 'note',
      text: 'Imported note',
      nodeIds: ['s1'],
      x: 450,
      y: 100,
    },
  ];
  assert.deepEqual(parseMachine(JSON.stringify(machine)), machine);
  assert.throws(() => parseMachine('   '), /Paste machine JSON/);
  assert.throws(() => parseMachine('{broken'), /Invalid JSON/);
  assert.throws(
    () =>
      parseMachine(
        JSON.stringify({
          ...machine,
          start: 'missing',
        }),
      ),
    /start state/,
  );
  assert.throws(() => parseMachine('é'.repeat(500001)), /too large/);
});
import { commentLinkKey, connectCommentNode, removeCommentLinks } from './src/core/comments.js';
test('deleting selected dashed lines preserves their endpoints and unrelated connections', () => {
  const m = example();
  m.comments = [
    {
      id: 'note',
      text: 'Shared note',
      x: 550,
      y: 50,
      nodeIds: ['s0', 's1'],
    },
    {
      id: 'note-two',
      text: 'Second note',
      x: 10,
      y: 30,
      nodeIds: ['s1'],
    },
  ];
  const before = structuredClone(m),
    keys = new Set([commentLinkKey('note', 's1')]);
  removeCommentLinks(m, keys);
  assert.deepEqual(m.states, before.states);
  assert.deepEqual(m.edges, before.edges);
  assert.equal(m.comments.length, 2);
  assert.deepEqual(m.comments[0].nodeIds, ['s0']);
  assert.deepEqual(m.comments[1].nodeIds, ['s1']);
  removeCommentLinks(m, new Set([commentLinkKey('note', 's0')]));
  assert.deepEqual(m.comments[0].nodeIds, []);
  commentAnchors(m);
  assert.deepEqual(m.comments[0].nodeIds, []);
  validate(m);
});
test('selecting a dashed line can be copied with its comment and state endpoint', () => {
  const m = example();
  m.comments = [
    {
      id: 'note',
      text: 'Note',
      x: 550,
      y: 50,
      nodeIds: ['s0', 's1'],
    },
  ];
  const fragment = copySelection(
    m,
    new Set(),
    new Set(),
    new Set(),
    new Set([commentLinkKey('note', 's1')]),
  );
  assert.deepEqual(
    fragment.states.map((s) => s.id),
    ['s1'],
  );
  assert.deepEqual(fragment.comments[0].nodeIds, ['s1']);
  let n = 0;
  pasteSelection(
    m,
    fragment,
    {
      x: 40,
      y: 40,
    },
    () => `connection-copy${n++}`,
  );
  assert.deepEqual(m.comments.at(-1).nodeIds, ['connection-copy0']);
  validate(m);
});
test('comment connection identities do not collide with arbitrary imported IDs', () => {
  assert.notEqual(commentLinkKey('a:b', 'c'), commentLinkKey('a', 'b:c'));
  const m = example();
  m.comments = [
    {
      id: 'note',
      text: 'Note',
      x: 500,
      y: 80,
      nodeIds: [],
    },
  ];
  connectCommentNode(m, 'note', 's1');
  connectCommentNode(m, 'note', 's1');
  assert.deepEqual(m.comments[0].nodeIds, ['s1']);
  assert.throws(() => connectCommentNode(m, 'missing', 's1'), /attachment/);
});
test('direct links to shared destinations keep sibling branches close in tree and radial layouts', () => {
  const punctuation = Array.from(
      {
        length: 18,
      },
      (_, i) => 'punctuation' + i,
    ),
    ids = ['root', 'integer', 'decimal', 'double', ...punctuation, 'period'];
  const source = {
    start: 'root',
    states: ids.map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['root', 'integer'],
      ['integer', 'decimal'],
      ['decimal', 'double'],
      ...punctuation.map((id) => ['root', id]),
      ['root', 'period'],
      ['period', 'double'],
    ].map(([from, to]) => ({
      from,
      to,
      label: 'x',
    })),
  };
  for (const mode of ['tree', 'circle'])
    for (const density of [0.35, 0.5, 0.75, 1]) {
      const m = autoLayout(structuredClone(source), mode, density),
        get = (id) => m.states.find((s) => s.id === id),
        step = Math.max(120, 320 * density);
      assert.ok(
        Math.hypot(get('period').x - get('double').x, get('period').y - get('double').y) < step * 4,
      );
      assert.deepEqual(m.edges, source.edges);
      assert.equal(m.states.length, source.states.length);
      for (let i = 0; i < m.states.length; i++)
        for (let j = i + 1; j < m.states.length; j++)
          assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 72);
      const first = JSON.stringify(m);
      autoLayout(m, mode, density);
      assert.equal(JSON.stringify(m), first);
    }
});
test('transition diagnostics identify unfinished rules and failed tokens retain the attempted path', async () => {
  const { transitionError } = await import('./src/core/lexer.js');
  const m = {
    start: 'a',
    states: [
      {
        id: 'a',
        name: 'start',
        token: '',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        name: 'pending',
        token: '',
        x: 100,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'x',
      },
    ],
  };
  assert.equal(transitionError(m, m.edges[0]), '');
  assert.match(
    transitionError(m, {
      ...m.edges[0],
      label: '',
    }),
    /empty/,
  );
  assert.match(
    transitionError(m, {
      ...m.edges[0],
      label: '[',
    }),
    /Invalid/,
  );
  const [failed] = tokenize(m, 'x');
  assert.equal(failed.failureState, 'b');
  assert.deepEqual(failed.traceStates, ['a', 'b']);
  assert.deepEqual(failed.traceEdges, [0]);
  m.edges.push({
    ...m.edges[0],
  });
  assert.throws(
    () => tokenize(m, 'x'),
    (error) => error.stateId === 'a' && error.edgeIndices.join(',') === '0,1',
  );
});
test('inverted transitions complement one-character matches and survive saves, copies, and TeX', async () => {
  const { matcher } = await import('./src/core/lexer.js');
  const exceptEol = matcher('[\\r\\n]', true);
  for (const ch of ['a', ' ']) assert.equal(exceptEol(ch), true);
  for (const ch of ['\r', '\n', '\u2028', '\u2029']) assert.equal(exceptEol(ch), false);
  assert.throws(() => matcher('', true), /empty/);
  assert.throws(() => matcher('[', true), /Invalid/);
  const m = {
    start: 'a',
    states: [
      {
        id: 'a',
        name: 'start',
        token: '',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        name: 'text',
        token: 'TEXT',
        x: 200,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: '[\\r\\n]',
        invert: true,
      },
    ],
  };
  assert.equal(tokenize(m, 'a')[0].token, 'TEXT');
  assert.equal(tokenize(m, '\n')[0].token, 'ERROR');
  assert.equal(parseMachine(JSON.stringify(m)).edges[0].invert, true);
  assert.match(toTikz(m), /not \(/);
  const fragment = copySelection(m, new Set(['a', 'b']), new Set(), new Set());
  let n = 0;
  pasteSelection(
    m,
    fragment,
    {
      x: 10,
      y: 10,
    },
    () => `inverted${n++}`,
  );
  assert.equal(m.edges.at(-1).invert, true);
  m.edges[0].invert = 'yes';
  assert.throws(() => validate(m), /Invalid transition/);
});
test('docking chooses the nearest edge and validates saved panel positions', async () => {
  const { nearestDock, dockSettings } = await import('./src/core/docking.js');
  for (const [x, y, side] of [
    [400, 5, 'top'],
    [400, 590, 'bottom'],
    [5, 300, 'left'],
    [795, 300, 'right'],
  ])
    assert.equal(nearestDock(x, y, 800, 600), side);
  assert.deepEqual(
    dockSettings({
      toolbar: 'right',
      breadcrumbs: 'left',
      tester: 'left',
      debugger: 'bottom',
    }),
    {
      toolbar: 'right',
      breadcrumbs: 'left',
      tester: 'left',
      debugger: 'bottom',
    },
  );
  assert.deepEqual(
    dockSettings({
      toolbar: 'bad',
      tester: null,
    }),
    {
      toolbar: 'left',
      breadcrumbs: 'top',
      tester: 'right',
      debugger: 'top',
    },
  );
  assert.deepEqual(dockSettings(null), {
    toolbar: 'left',
    breadcrumbs: 'top',
    tester: 'right',
    debugger: 'top',
  });
});
test('self loops choose an unobstructed side and can use diagonal angle bisectors', () => {
  const directions = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (let open = 0; open < 4; open++) {
    const states = [
      {
        id: 'root',
        name: 'root',
        token: '',
        x: 0,
        y: 0,
      },
      ...directions
        .filter((_, i) => i !== open)
        .map(([x, y], i) => ({
          id: 'block' + i,
          name: 'block',
          token: '',
          x: x * 105,
          y: y * 105,
        })),
    ];
    const m = {
        start: 'root',
        states,
        edges: [
          {
            from: 'root',
            to: 'root',
            label: 'x',
          },
        ],
      },
      r = routeEdges(m)[0],
      x = (r.c1.x + r.c2.x) / 2,
      y = (r.c1.y + r.c2.y) / 2;
    assert.ok(x * directions[open][0] + y * directions[open][1] > 0);
    assert.equal(Math.round(Math.abs(directions[open][0] ? y : x)), 0);
    assert.deepEqual(routeEdges(m), routeEdges(m));
  }
  const m = {
    start: 'root',
    states: [
      {
        id: 'root',
        x: 0,
        y: 0,
      },
      {
        id: 'east',
        x: 200,
        y: 0,
      },
      {
        id: 'north',
        x: 0,
        y: 200,
      },
    ],
    edges: [
      {
        from: 'root',
        to: 'east',
        label: 'a',
      },
      {
        from: 'root',
        to: 'north',
        label: 'b',
      },
      {
        from: 'root',
        to: 'root',
        label: 'c',
      },
    ],
  };
  const bisector = loopAngles(m, m.states[0])[0];
  assert.ok(Math.abs(Math.cos(bisector) + Math.SQRT1_2) < 0.01);
  assert.ok(Math.abs(Math.sin(bisector) + Math.SQRT1_2) < 0.01);
});
test('routing reuses unchanged graph geometry and invalidates when nodes, rules or comments change', () => {
  const m = example(),
    initial = routeEdges(m);
  assert.equal(routeEdges(m), initial);
  m.states[0].x += 25;
  const moved = routeEdges(m);
  assert.notEqual(moved, initial);
  assert.equal(routeEdges(m), moved);
  m.edges[0].label = '[a-zA-Z0-9_]';
  const edited = routeEdges(m);
  assert.notEqual(edited, moved);
  m.comments = [
    {
      id: 'note',
      text: 'Note',
      x: 200,
      y: 100,
    },
  ];
  const noted = routeEdges(m);
  assert.notEqual(noted, edited);
  m.comments[0].x += 30;
  assert.notEqual(routeEdges(m), noted);
});
import { crossingPairs } from './src/core/layout.js';
import { lexerSteps } from './src/core/lexer.js';
test('tree and radial layouts keep stable subtree placement without changing topology', () => {
  const links = [
    ['s2', 's3'],
    ['s5', 's7'],
    ['s0', 's3'],
    ['s7', 's5'],
    ['s0', 's6'],
    ['s2', 's4'],
    ['s5', 's8'],
    ['s2', 's9'],
    ['s8', 's3'],
    ['s6', 's5'],
    ['s2', 's1'],
    ['s0', 's3'],
  ];
  const m = {
    start: 's0',
    states: Array.from(
      {
        length: 10,
      },
      (_, i) => ({
        id: 's' + i,
        name: 'state' + i,
        token: '',
        x: 0,
        y: 0,
      }),
    ),
    edges: [
      ...Array.from(
        {
          length: 9,
        },
        (_, i) => ['s0', 's' + (i + 1)],
      ),
      ...links,
    ].map(([from, to]) => ({
      from,
      to,
      label: 'x',
    })),
  };
  for (const mode of ['tree', 'circle']) {
    const next = autoLayout(structuredClone(m), mode);
    assert.deepEqual(next.edges, m.edges);
    assert.equal(next.states.length, 10);
    const first = JSON.stringify(next);
    autoLayout(next, mode);
    assert.equal(JSON.stringify(next), first);
    for (let i = 0; i < next.states.length; i++)
      for (let j = i + 1; j < next.states.length; j++)
        assert.ok(
          Math.hypot(next.states[i].x - next.states[j].x, next.states[i].y - next.states[j].y) >=
            72,
        );
  }
});
test('automatic portals preserve small branches despite remaining crossings', () => {
  const m = {
    start: 'r',
    states: ['r', 'a', 'b', 'c', 'x', 'y', 'z'].map((id, i) => ({
      id,
      name: id,
      token: i > 3 ? 'END' : '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['r', 'a', 'a'],
      ['r', 'b', 'b'],
      ['r', 'c', 'c'],
      ...['a', 'b', 'c'].flatMap((a) => ['x', 'y', 'z'].map((b, i) => [a, b, String(i)])),
    ].map(([from, to, label]) => ({
      from,
      to,
      label,
    })),
  };
  const before = tokenize(m, 'a0b1c2'),
    plain = autoLayout(structuredClone(m));
  assert.ok(crossingPairs(plain, true).length > 0);
  assert.ok(plain.edges.every((e) => e.portal == null));
  autoLayout(m, 'tree', 1, true);
  assert.equal(m.states.length, 7);
  assert.equal(m.edges.length, 12);
  assert.ok(m.edges.filter((e) => e.portal != null).every((e) => ['a', 'b', 'c'].includes(e.to)));
  assert.deepEqual(tokenize(m, 'a0b1c2'), before);
  validate(m);
  assert.doesNotThrow(() => toTikz(m));
  for (const e of m.edges) assert.equal(destination(m, e).id, e.to);
});
test('character steps reject non-ASCII input and preserve portal and inversion behavior', () => {
  const m = example();
  enablePortal(m, m.edges[0]);
  m.edges[0].label = '[\\r\\n0-9 ]';
  m.edges[0].invert = true;
  const input = '😀 42\n',
    steps = [...lexerSteps(m, input)],
    reads = steps.filter((s) => s.kind === 'character');
  assert.equal(steps.find((s) => s.result).token, 'ERROR');
  assert.equal(reads[0].character, ' ');
  assert.equal(reads[0].end, 3);
  assert.equal(steps.at(-1).kind, 'done');
  assert.deepEqual(
    steps.filter((s) => s.result).map((s) => s.result),
    tokenize(m, input),
  );
  assert.ok(steps.some((s) => s.result?.skip));
});
test('stepping exposes longest-match backtracking, nonaccepting errors and ambiguity', () => {
  const m = {
    start: 'a',
    states: [
      ['a', ''],
      ['b', 'B'],
      ['c', ''],
    ].map(([id, token], i) => ({
      id,
      name: id,
      token,
      x: i * 150,
      y: 0,
    })),
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'a',
      },
      {
        from: 'b',
        to: 'c',
        label: 'b',
      },
    ],
  };
  const steps = [...lexerSteps(m, 'ab!')];
  assert.ok(steps.some((s) => s.message.includes('Backtrack to 1')));
  assert.ok(steps.some((s) => s.kind === 'blocked'));
  assert.deepEqual(
    steps.filter((s) => s.result).map((s) => s.result),
    tokenize(m, 'ab!'),
  );
  m.states[1].token = '';
  const errors = [...lexerSteps(m, 'a')];
  assert.equal(errors.find((s) => s.result).result.failureState, 'b');
  m.edges.push({
    ...m.edges[0],
  });
  assert.throws(() => [...lexerSteps(m, 'a')], /Ambiguous/);
  assert.equal([...lexerSteps(example(), '')].at(-1).kind, 'done');
});
test('portals assign a usable generated name to an unnamed destination', () => {
  const m = example();
  m.states[1].name = '';
  enablePortal(m, m.edges[0]);
  assert.equal(m.edges[0].portal, 'STATE');
  assert.equal(destination(m, m.edges[0]).id, 's1');
  validate(m);
});
test('spring layout separates states and comments, preserves lexer semantics, and is deterministic from the same positions', () => {
  for (const spacing of [0.35, 0.5, 0.75, 1]) {
    const m = example();
    m.states.push({
      id: 'disconnected',
      name: 'alone',
      token: '',
      x: 0,
      y: 0,
    });
    m.comments = [
      {
        id: 'note',
        text: 'Note',
        x: m.states[1].x + 70,
        y: m.states[1].y - 80,
        nodeIds: ['s1'],
      },
    ];
    const source = structuredClone(m),
      before = tokenize(m, 'hi 42'),
      edges = structuredClone(m.edges);
    autoLayout(m, 'spring', spacing);
    validate(m);
    assert.deepEqual(m.edges, edges);
    assert.deepEqual(tokenize(m, 'hi 42'), before);
    for (let i = 0; i < m.states.length; i++)
      for (let j = i + 1; j < m.states.length; j++)
        assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 88);
    assertCommentClearance(m, m.comments[0]);
    const repeated = autoLayout(source, 'spring', spacing);
    assert.deepEqual(
      repeated.states.map((s) => [s.x, s.y]),
      m.states.map((s) => [s.x, s.y]),
    );
  }
});
test('spring density controls spacing and supports cycles, portals, coincident nodes, and a single state', () => {
  const source = example();
  enablePortal(source, source.edges[0]);
  source.edges.push({
    from: 's1',
    to: 's0',
    label: '!',
  });
  for (const s of source.states) {
    s.x = 0;
    s.y = 0;
  }
  const compact = autoLayout(structuredClone(source), 'spring', 0.35),
    spacious = autoLayout(structuredClone(source), 'spring', 1);
  const length = (m) =>
    m.edges
      .filter((e) => e.from !== e.to)
      .reduce((n, e) => {
        const a = m.states.find((s) => s.id === e.from),
          b = destination(m, e);
        return n + Math.hypot(a.x - b.x, a.y - b.y);
      }, 0);
  assert.ok(length(spacious) > length(compact));
  assert.deepEqual(tokenize(compact, 'hello 42'), tokenize(spacious, 'hello 42'));
  const one = {
    start: 'a',
    states: [
      {
        id: 'a',
        name: 'a',
        token: 'A',
        x: 0,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'a',
        label: 'a',
      },
    ],
  };
  autoLayout(one, 'spring');
  assert.ok(Number.isFinite(one.states[0].x));
  assert.doesNotThrow(() => toTikz(one));
});
test('spring layout retains small branches without portals', () => {
  const m = {
    start: 'r',
    states: ['r', 'a', 'b', 'c', 'x', 'y', 'z'].map((id, i) => ({
      id,
      name: id,
      token: i > 3 ? 'END' : '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['r', 'a', 'a'],
      ['r', 'b', 'b'],
      ['r', 'c', 'c'],
      ...['a', 'b', 'c'].flatMap((a) => ['x', 'y', 'z'].map((b, i) => [a, b, String(i)])),
    ].map(([from, to, label]) => ({
      from,
      to,
      label,
    })),
  };
  const expected = tokenize(m, 'a0b1c2');
  autoLayout(m, 'spring', 0.75, true);
  assert.ok(m.edges.filter((e) => e.portal != null).every((e) => ['a', 'b', 'c'].includes(e.to)));
  assert.equal(m.states.length, 7);
  assert.equal(m.edges.length, 12);
  assert.deepEqual(tokenize(m, 'a0b1c2'), expected);
});
import { springSettings, SPRING_DEFAULTS } from './src/core/spring-settings.js';
test('spring settings validate saved values and clamp each independent force control', () => {
  assert.deepEqual(springSettings(), SPRING_DEFAULTS);
  assert.deepEqual(springSettings(null), SPRING_DEFAULTS);
  assert.deepEqual(
    springSettings({
      center: -1,
      repel: 500,
      link: NaN,
      distance: 2,
    }),
    {
      center: 0,
      repel: 20,
      link: 0.4,
      distance: 40,
    },
  );
});
test('spring solver lets the initial state move and applies link force and distance independently', () => {
  const source = {
    start: 'a',
    states: [
      {
        id: 'a',
        name: 'a',
        token: '',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        name: 'b',
        token: '',
        x: 600,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'x',
      },
    ],
  };
  const run = (forces) =>
      autoLayout(structuredClone(source), 'spring', 1, false, {
        center: 0,
        repel: 0,
        link: 1,
        distance: 300,
        ...forces,
      }),
    distance = (m) => Math.hypot(m.states[0].x - m.states[1].x, m.states[0].y - m.states[1].y);
  const relaxed = run({});
  assert.ok(Math.abs(distance(relaxed) - 300) < 2);
  assert.ok(Math.abs(relaxed.states[0].x - source.states[0].x) > 100);
  assert.deepEqual(
    run({
      link: 0,
    }).states,
    source.states,
  );
  assert.ok(
    distance(
      run({
        distance: 500,
      }),
    ) >
      distance(
        run({
          distance: 150,
        }),
      ) +
        250,
  );
  assert.ok(
    relaxed.states.every((s) => !('vx' in s) && !('vy' in s) && !('index' in s) && !('fx' in s)),
  );
});
test('repulsion spreads nodes and center attraction controls compactness without subtree grouping', () => {
  const source = {
    start: 'a',
    states: [
      {
        id: 'a',
        name: 'a',
        token: '',
        x: -200,
        y: 0,
      },
      {
        id: 'b',
        name: 'b',
        token: '',
        x: 200,
        y: 0,
      },
    ],
    edges: [],
  };
  const run = (forces) =>
      autoLayout(structuredClone(source), 'spring', 1, false, {
        center: 0.12,
        repel: 5,
        link: 0,
        distance: 320,
        ...forces,
      }),
    distance = (m) => Math.hypot(m.states[0].x - m.states[1].x, m.states[0].y - m.states[1].y);
  assert.ok(
    distance(
      run({
        center: 0,
        repel: 10,
      }),
    ) >
      distance(
        run({
          center: 0,
          repel: 2,
        }),
      ),
  );
  assert.ok(
    distance(
      run({
        center: 1,
      }),
    ) <
      distance(
        run({
          center: 0.05,
        }),
      ),
  );
});
test('lexer stepping starts at the requested cursor with absolute offsets and intact Unicode characters', () => {
  const m = example(),
    input = 'hello 42 world',
    steps = [...lexerSteps(m, input, true, 6)];
  assert.equal(steps[0].offset, 6);
  assert.equal(steps.find((s) => s.kind === 'character').character, '4');
  const tokens = steps.filter((s) => s.result).map((s) => s.result);
  assert.equal(tokens[0].token, 'NUMBER');
  assert.equal(tokens[0].offset, 6);
  assert.equal(tokens[0].value, '42');
  assert.equal(tokens.at(-1).offset, 9);
  assert.ok(steps.every((s) => s.offset >= 6));
  const inside = [...lexerSteps(m, input, true, 2)];
  assert.equal(inside.find((s) => s.result).result.value, 'llo');
  assert.equal(inside.find((s) => s.result).result.offset, 2);
  assert.deepEqual(
    [...lexerSteps(m, input, true, input.length)].map((s) => [s.kind, s.offset]),
    [['done', input.length]],
  );
  const unicode = [...lexerSteps(m, 'x😀!', true, 2)];
  assert.equal(unicode[0].offset, 1);
  assert.equal(unicode.find((s) => s.result).result.value, '😀');
  assert.equal(unicode.at(-1).offset, 4);
  assert.deepEqual(
    tokenize(m, input).map((s) => s.value),
    ['hello', ' ', '42', ' ', 'world'],
  );
});
import { nextErrorToken } from './src/core/error-navigation.js';
test('next error follows the input cursor, advances past selections and wraps with Unicode offsets', () => {
  const errors = [
    {
      token: 'ERROR',
      value: '😀',
      offset: 2,
    },
    {
      token: 'ERROR',
      value: '!',
      offset: 8,
    },
  ];
  assert.equal(nextErrorToken(errors, 0), errors[0]);
  assert.equal(nextErrorToken(errors, 2), errors[0]);
  assert.equal(nextErrorToken(errors, 4), errors[1]);
  assert.equal(nextErrorToken(errors, 9), errors[0]);
  assert.equal(nextErrorToken([], 0), null);
});
import { machineWithTester, restoreTester } from './src/core/tester-state.js';
test('saved machines restore tester text and skipped-token preference, including blank input', () => {
  const m = example(),
    input = {
      value: 'hi\t42\n😀',
    },
    skip = {
      checked: true,
    },
    saved = machineWithTester(m, input, skip),
    parsed = parseMachine(JSON.stringify(saved));
  assert.deepEqual(parsed.tester, {
    input: input.value,
    showSkipped: true,
  });
  assert.equal(m.tester, undefined);
  assert.deepEqual(tokenize(parsed, input.value), tokenize(m, input.value));
  const restored = {
      value: 'default',
    },
    restoredSkip = {
      checked: false,
    };
  restoreTester(parsed, restored, restoredSkip);
  assert.equal(restored.value, input.value);
  assert.equal(restoredSkip.checked, true);
  restoreTester(
    {
      ...m,
      tester: {
        input: '',
      },
    },
    restored,
    restoredSkip,
  );
  assert.equal(restored.value, '');
  assert.equal(restoredSkip.checked, false);
  restored.value = 'keep current text';
  restoreTester(m, restored, restoredSkip);
  assert.equal(restored.value, 'keep current text');
  for (const tester of [
    null,
    [],
    {
      input: 42,
    },
    {
      input: 'x',
      showSkipped: 'yes',
    },
  ])
    assert.throws(
      () =>
        validate({
          ...m,
          tester,
        }),
      /tester/,
    );
});
import { createDebugSession } from './src/core/debug-session.js';
import { simpleCharacterClass, readEditorSettings } from './src/core/editor-settings.js';
import { singleCharacterError, characterBounds } from './src/core/regex-analysis.js';
import { errorSpans, underlineSegments } from './src/core/error-underlines.js';
test('debugger seeks the token under the cursor and jumps by token or character', () => {
  const session = createDebugSession(example(), 'hello 42 world');
  assert.equal(session.seek(3).offset, 0);
  assert.equal(session.next().character, 'h');
  assert.equal(session.previous().kind, 'start');
  assert.equal(session.nextToken().tokenStart, 5);
  assert.equal(session.nextToken().tokenStart, 6);
  assert.equal(session.next().character, '4');
  assert.equal(session.previousToken().tokenStart, 5);
  assert.equal(session.seek(7).tokenStart, 6);
  assert.equal(session.seek(14).tokenStart, 9);
  assert.equal(session.nextToken().kind, 'done');
  assert.equal(session.canNext(), false);
  assert.equal(session.previousToken().tokenStart, 9);
});
test('simplified editing preserves regex meaning and refuses concatenations', () => {
  assert.equal(simpleCharacterClass('abc'), null);
  assert.equal(simpleCharacterClass('a|bc'), null);
  assert.equal(simpleCharacterClass('[a][b]'), null);
  assert.equal(simpleCharacterClass('.'), null);
  for (const source of ['[abc]', '[^a-z]', 'a', '\\n', '\\d', '\\+', '😀']) {
    const simple = simpleCharacterClass(source);
    assert.ok(simple, source);
    const original = new RegExp('^(?:' + source + ')$', 'u'),
      converted = new RegExp('^[' + simple.characters + ']$', 'u');
    for (const char of ['a', 'b', 'c', 'z', '0', '\n', '+', '😀'])
      assert.equal(
        original.test(char),
        simple.inverted ? !converted.test(char) : converted.test(char),
        source + ' on ' + JSON.stringify(char),
      );
  }
});
test('Unicode regex escape pairs are one character for static transition diagnostics', () => {
  assert.equal(singleCharacterError('\\uD83D\\uDE00'), '');
  assert.equal(characterBounds('😀').min, 1);
  assert.equal(characterBounds('\\u{1F600}').min, 1);
  assert.equal(singleCharacterError('\\uD83D\\uDE00a').length > 0, true);
});
test('emitted debugger frames keep the token being emitted as their full-token highlight', () => {
  const session = createDebugSession(example(), 'hello 42');
  session.seek(0);
  while (session.current().kind !== 'emit') session.next();
  assert.equal(session.current().tokenStart, 0);
  assert.equal(session.current().tokenEnd, 5);
  assert.equal(session.current().state, 's1');
});
test('adjacent error characters form continuous underlines without joining skipped whitespace', () => {
  const tokens = [
    {
      token: 'ERROR',
      offset: 0,
      value: '"',
    },
    {
      token: 'WS',
      offset: 1,
      value: ' ',
      skip: true,
    },
    {
      token: 'ERROR',
      offset: 2,
      value: '$',
    },
    {
      token: 'ERROR',
      offset: 3,
      value: '{',
    },
    {
      token: 'ERROR',
      offset: 4,
      value: '😀',
    },
  ];
  assert.deepEqual(errorSpans(tokens), [
    {
      start: 0,
      end: 1,
    },
    {
      start: 2,
      end: 6,
    },
  ]);
  const segments = underlineSegments(
    [
      {
        left: 12,
        right: 28,
        top: 10,
        bottom: 24,
      },
      {
        left: 12,
        right: 12,
        top: 24,
        bottom: 38,
      },
      {
        left: 0,
        right: 6,
        top: -30,
        bottom: -15,
      },
    ],
    {
      left: 1,
      top: 1,
      bottom: 100,
    },
  );
  assert.deepEqual(segments, [
    {
      left: 11,
      top: 22,
      width: 16,
      phase: -5,
    },
  ]);
});
test('debugger surfaces invalid configurations instead of throwing before the session starts', () => {
  const m = example();
  m.edges[0].label = '';
  const session = createDebugSession(m, 'hello');
  session.seek(0);
  assert.equal(session.current().kind, 'error');
  assert.match(session.current().message, /empty/);
  assert.equal(session.canNext(), false);
});
test('simplified settings restore safely without changing graph preferences', () => {
  assert.deepEqual(
    readEditorSettings({
      getItem: () => '{"simplified":true,"pinchSensitivity":2}',
    }),
    {
      groupPresentation: 'overlay',
      simplified: true,
      stackRulesOpen: false,
      followDebugState: true,
      rerouteWhileDragging: true,
      colorEdges: true,
      pinchSensitivity: 2,
    },
  );
  assert.deepEqual(
    readEditorSettings({
      getItem: () => '{broken',
    }),
    {
      groupPresentation: 'overlay',
      simplified: true,
      stackRulesOpen: false,
      followDebugState: true,
      rerouteWhileDragging: true,
      colorEdges: true,
      pinchSensitivity: 1,
    },
  );
  assert.deepEqual(
    readEditorSettings({
      getItem() {
        throw Error('Storage unavailable');
      },
    }),
    {
      groupPresentation: 'overlay',
      simplified: true,
      stackRulesOpen: false,
      followDebugState: true,
      rerouteWhileDragging: true,
      colorEdges: true,
      pinchSensitivity: 1,
    },
  );
});
import {
  canvasTransform,
  clientToWorld,
  graphBounds,
  createGraphCanvas,
  graphPalette,
} from './src/core/canvas-graph.js';
test('Canvas coordinate conversion preserves pointer anchors at every zoom and aspect ratio', () => {
  for (const [width, height] of [
    [800, 600],
    [400, 900],
    [1600, 500],
  ])
    for (const zoom of [0.1, 1, 8]) {
      const view = {
          x: -200,
          y: 350,
          width: 1200 * zoom,
          height: 700 * zoom,
        },
        t = canvasTransform(view, width, height),
        rect = {
          left: 320,
          top: 60,
        },
        world = {
          x: 141,
          y: 287,
        };
      const result = clientToWorld(
        {
          x: rect.left + t.x + world.x * t.scale,
          y: rect.top + t.y + world.y * t.scale,
        },
        rect,
        t,
      );
      assert.ok(Math.abs(result.x - world.x) < 1e-8);
      assert.ok(Math.abs(result.y - world.y) < 1e-8);
    }
});
function routingFixture() {
  const m = example();
  for (let i = 0; i < 72; i++)
    m.states.push({
      id: 'q' + i,
      name: 'State ' + i,
      token: i % 4 ? '' : 'TOKEN',
      x: Math.cos(i * 0.7) * (300 + i * 8),
      y: Math.sin(i * 0.7) * (300 + i * 8),
    });
  for (let i = 0; i < 72; i++) {
    m.edges.push({
      from: i ? 'q' + (i - 1) : 's0',
      to: 'q' + i,
      label: i % 3 ? '[a-z]' : '[0-9]',
    });
    if (i % 5 === 0)
      m.edges.push({
        from: 'q' + i,
        to: 'q' + i,
        label: 'x',
      });
  }
  m.states[10].portal = 'Target';
  m.edges.push({
    from: 'q3',
    to: 'q6',
    label: 'p',
    portal: 'Target',
  });
  m.comments = [
    {
      id: 'note',
      text: 'Routing obstacle',
      x: 240,
      y: -140,
    },
  ];
  return m;
}
test('routing is deterministic as states move', () => {
  const m = routingFixture();
  for (let i = 0; i < 8; i++) {
    m.states[i].x += 25;
    m.states[i].y -= 17;
    assert.deepEqual(routeEdges(m), routeEdges(structuredClone(m)));
  }
});
test('routing moves a transition label along its curve to avoid a state', () => {
  const m = {
    states: [
      {
        id: 'a',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        x: 1000,
        y: 0,
      },
      {
        id: 'c',
        x: 500,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'test',
      },
    ],
  };
  const r = routeEdges(m)[0],
    mid = {
      x: (r.p0.x + 3 * r.c1.x + 3 * r.c2.x + r.p3.x) / 8,
      y: (r.p0.y + 3 * r.c1.y + 3 * r.c2.y + r.p3.y) / 8 - 13,
    };
  assert.ok(Math.abs(r.label.x - mid.x) > 20);
  assert.ok(
    Math.abs(r.label.x - 500) > (r.label.w + 90) / 2 + 8 ||
      Math.abs(r.label.y) > (r.label.h + 90) / 2 + 8,
  );
});
test('portal routing keeps the transition label separate from its destination tag', () => {
  const m = {
    states: [
      {
        id: 'a',
        name: 'source',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        name: 'destination',
        portal: 'DESTINATION',
        x: 600,
        y: 0,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        portal: 'DESTINATION',
        label: '[a-z]',
        stackRules: [{ top: 'S', replace: ['S'] }],
      },
    ],
  };
  const [route] = routeEdges(m, simpleTransitionLabel),
    a = route.label,
    b = route.portalBox;
  assert.equal(route.label.w, simpleTransitionLabel(m.edges[0]).length * 7 + 14);
  assert.ok(
    Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + 8 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + 8,
  );
  assert.equal(destination(m, m.edges[0]).id, 'b');
});
test('portal tips attach to wires and moved portal positions survive JSON', () => {
  const m = example(),
    edge = m.edges[0],
    target = m.states.find((s) => s.id === edge.to);
  enablePortal(m, edge);
  edge.portalOffset = {
    x: -260,
    y: 80,
  };
  target.portalOffset = {
    x: 160,
    y: -50,
  };
  let r = routeEdges(m)[0],
    box = statePortalBox(target);
  assert.equal(r.portalBox.side, 'right');
  assert.equal(r.p3.x, r.portalBox.x + r.portalBox.w / 2);
  assert.equal(r.p3.y, r.portalBox.y);
  assert.equal(box.side, 'left');
  assert.equal(box.x - box.w / 2, target.x + 160);
  assert.equal(box.y, target.y - 50);
  const restored = validate(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(restored.edges[0].portalOffset, edge.portalOffset);
  assert.deepEqual(
    restored.states.find((s) => s.id === target.id).portalOffset,
    target.portalOffset,
  );
  edge.portalOffset = {
    x: 260,
    y: 80,
  };
  r = routeEdges(m)[0];
  assert.equal(r.portalBox.side, 'left');
  assert.equal(r.p3.x, r.portalBox.x - r.portalBox.w / 2);
  target.portalOffset = {
    x: -160,
    y: 50,
  };
  box = statePortalBox(target);
  assert.equal(box.side, 'right');
  assert.equal(box.x + box.w / 2, target.x - 160);
  restored.edges[0].portalOffset.x = 'bad';
  assert.throws(() => validate(restored), /transition/);
});
test('radial layout uses a portal for a long start branch without duplicating transitions', () => {
  const ids = ['root', 'a', 'b', 'c', 'd', 'other'],
    links = [
      ['root', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['root', 'other'],
    ];
  const m = {
    start: 'root',
    states: ids.map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: links.map(([from, to]) => ({
      from,
      to,
      label: 'x',
    })),
  };
  autoLayout(m, 'circle', 0.5, true);
  const edge = m.edges.find((e) => e.from === 'root' && e.to === 'a');
  assert.ok(edge.portal);
  assert.equal(destination(m, edge).id, 'a');
  assert.equal(m.edges.length, links.length);
  assert.equal(m.states.length, ids.length);
  const get = (id) => m.states.find((s) => s.id === id),
    distance = (id) => Math.hypot(get(id).x - get('root').x, get(id).y - get('root').y);
  assert.ok(distance('a') > distance('other') + 300);
});
test('Canvas paints current routes and hit-tests states, labels, portals and comments without SVG nodes', () => {
  const previousDocument = globalThis.document,
    previousPath = globalThis.Path2D;
  globalThis.document = {
    documentElement: {
      dataset: {
        theme: 'light',
      },
    },
  };
  globalThis.Path2D = class {
    constructor(d) {
      this.d = d;
    }
  };
  try {
    const calls = [],
      context = () =>
        new Proxy(
          {
            isPointInStroke: () => false,
          },
          {
            get(target, key) {
              return key in target
                ? target[key]
                : (...args) =>
                    calls.push({
                      method: key,
                      args,
                      stroke: target.strokeStyle,
                      width: target.lineWidth,
                    });
            },
            set(target, key, value) {
              target[key] = value;
              return true;
            },
          },
        );
    const canvas = {
        clientWidth: 800,
        clientHeight: 600,
        getContext: () => main,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
        }),
      },
      map = {
        clientWidth: 170,
        clientHeight: 106,
        getContext: () => mini,
      },
      main = context(),
      mini = context(),
      renderer = createGraphCanvas(canvas, map),
      m = example();
    m.states[1].portal = 'IDENT';
    m.states[1].portalOffset = {
      x: -200,
      y: -300,
    };
    m.comments = [
      {
        id: 'note',
        text: 'Canvas note',
        x: 1000,
        y: 1000,
      },
    ];
    m.edges.push({
      from: 's0',
      to: 's1',
      label: 'p',
      portal: 'IDENT',
    });
    const scene = {
      machine: m,
      routes: routeEdges(m),
      selectedStates: new Set(),
      selectedComments: new Set(),
      selectedCommentLinks: new Set(),
      edgeSelected: () => false,
      failures: {
        states: [],
        edges: [],
      },
      trace: {
        kind: 'character',
        state: 's1',
        traceStates: ['s0', 's1'],
        traceEdges: [0],
      },
    };
    renderer.draw(scene);
    renderer.drawMap();
    assert.equal(canvas.width, 800);
    assert.equal(map.width, 170);
    assert.ok(calls.some((c) => c.method === 'stroke' && c.stroke === '#a71abb' && c.width === 4));
    assert.deepEqual(renderer.hit(m.states[1]), {
      type: 'state',
      id: 's1',
    });
    assert.deepEqual(
      renderer.hit({
        x: 1005,
        y: 1005,
      }),
      {
        type: 'comment',
        id: 'note',
      },
    );
    assert.deepEqual(renderer.hit(statePortalBox(m.states[1])), {
      type: 'portal-target',
      id: 's1',
    });
    const r = scene.routes.at(-1);
    assert.deepEqual(renderer.hit(r.portalBox), {
      type: 'portal-source',
      index: m.edges.length - 1,
    });
    assert.deepEqual(
      renderer.hit({
        x: scene.routes[0].label.x,
        y: scene.routes[0].label.y - 5,
      }),
      {
        type: 'edge',
        index: 0,
      },
    );
    scene.label = simpleTransitionLabel;
    const captionStart = calls.length;
    renderer.draw(scene);
    assert.ok(
      calls
        .slice(captionStart)
        .some((c) => c.method === 'fillText' && c.args[0] === simpleTransitionLabel(m.edges[0])),
    );
    const before = scene.routes[0].d;
    m.states[1].x += 200;
    scene.routes = routeEdges(m);
    renderer.draw(scene);
    assert.notEqual(scene.routes[0].d, before);
    assert.ok(calls.some((c) => c.method === 'stroke' && c.args[0]?.d === scene.routes[0].d));
    const bounds = graphBounds(m, scene.routes);
    assert.ok(bounds.x + bounds.width >= 1000);
    assert.ok(bounds.y + bounds.height >= 1000);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousPath === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previousPath;
  }
});
test('Canvas retains the light-blue dark theme highlights and reads shared theme variables', () => {
  const dark = graphPalette(true),
    light = graphPalette(false);
  assert.equal(dark.green, '#a9d5ff');
  assert.equal(dark.selected, '#c7e5ff');
  assert.equal(dark.selectedFill, '#3d566b');
  assert.equal(dark.trace, '#c5e4ff');
  assert.equal(dark.step, '#efb0ff');
  assert.equal(dark.mapFill, '#a3c9e025');
  assert.equal(light.green, '#386b4e');
  assert.equal(light.trace, '#14864d');
  const custom = graphPalette(true, {
    getPropertyValue: (name) =>
      name === '--green' ? ' #123456 ' : name === '--step-color' ? ' #abcdef ' : '',
  });
  assert.equal(custom.green, '#123456');
  assert.equal(custom.step, '#abcdef');
});
import { wheelZoomFactor, pinchView, setupCanvasGestures } from './src/core/canvas-gestures.js';
import { placementPreview } from './src/core/placement.js';
import { simpleTransitionLabel } from './src/core/editor-settings.js';
test('simplified captions remove regex brackets without changing stored rules or advanced expressions', () => {
  const edge = {
      label: '[^a-z]',
      invert: true,
    },
    before = JSON.stringify(edge);
  assert.equal(simpleTransitionLabel(edge), 'a-z');
  assert.equal(
    simpleTransitionLabel({
      label: '[a-z]',
      invert: true,
    }),
    'not a-z',
  );
  assert.equal(
    simpleTransitionLabel({
      label: 'abc',
    }),
    'abc',
  );
  assert.equal(
    simpleTransitionLabel({
      label: '',
    }),
    '…',
  );
  assert.equal(JSON.stringify(edge), before);
  assert.equal(
    simpleTransitionLabel({
      label: '[0-9]',
      stackRules: [{ top: 'S', replace: ['S', 'OPEN'] }],
    }),
    '0-9 · S → S OPEN',
  );
});
test('pinch zoom preserves its world anchor while scaling and moving across letterboxed views', () => {
  for (const size of [
    {
      width: 800,
      height: 600,
    },
    {
      width: 500,
      height: 900,
    },
  ])
    for (const factor of [0.05, 0.8, 2, 100]) {
      const initial = {
          x: -300,
          y: 200,
          width: 1600,
          height: 800,
        },
        anchor = {
          x: 400,
          y: 350,
        },
        center = {
          x: 170,
          y: 220,
        },
        next = pinchView(initial, anchor, center, size, factor),
        t = canvasTransform(next, size.width, size.height),
        point = clientToWorld(
          center,
          {
            left: 0,
            top: 0,
          },
          t,
        );
      assert.ok(Math.abs(point.x - anchor.x) < 1e-8);
      assert.ok(Math.abs(point.y - anchor.y) < 1e-8);
      assert.ok(next.width >= 160 && next.width <= 30000);
      assert.equal(next.width / next.height, 2);
    }
  assert.equal(wheelZoomFactor(0), 1);
  assert.ok(wheelZoomFactor(-5) < 1);
  assert.ok(wheelZoomFactor(5) > 1);
  assert.ok(wheelZoomFactor(5, 2) > wheelZoomFactor(5, 1));
});
test('touch termination outside a reparented canvas and explicit reset clear tracked fingers', () => {
  const handlers = {},
    hostHandlers = {},
    captured = new Set(),
    released = [],
    host = { addEventListener: (name, fn) => (hostHandlers[name] = fn) },
    canvas = {
      clientWidth: 800,
      clientHeight: 600,
      ownerDocument: { defaultView: host },
      addEventListener: (name, fn) => (handlers[name] = fn),
      setPointerCapture: (id) => captured.add(id),
      hasPointerCapture: (id) => captured.has(id),
      releasePointerCapture: (id) => {
        captured.delete(id);
        released.push(id);
      },
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };
  let interrupts = 0;
  const reset = setupCanvasGestures(canvas, {
    getView: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    setView() {},
    toWorld: () => ({ x: 0, y: 0 }),
    onInterrupt: () => interrupts++,
  });
  const event = (id) => ({
    pointerType: 'touch',
    pointerId: id,
    clientX: id * 100,
    clientY: 100,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  handlers.pointerdown(event(1));
  hostHandlers.pointerup(event(1));
  handlers.pointerdown(event(2));
  assert.equal(interrupts, 0);
  handlers.pointerdown(event(3));
  assert.equal(interrupts, 1);
  reset();
  assert.deepEqual(released.sort(), [2, 3]);
  handlers.pointerdown(event(4));
  assert.equal(interrupts, 1);
  hostHandlers.pointercancel(event(4));
  handlers.pointerdown(event(5));
  assert.equal(interrupts, 1);
});

test('two-finger gestures interrupt dragging, zoom around the midpoint, and consume remaining touches', () => {
  const handlers = {},
    canvas = {
      clientWidth: 800,
      clientHeight: 600,
      addEventListener: (name, fn) => (handlers[name] = fn),
      setPointerCapture() {},
      getBoundingClientRect: () => ({
        left: 20,
        top: 40,
      }),
    };
  let v = {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    },
    interrupts = 0,
    stops = 0;
  setupCanvasGestures(canvas, {
    getView: () => v,
    setView: (next) => (v = next),
    toWorld: (event) =>
      clientToWorld(
        {
          x: event.clientX,
          y: event.clientY,
        },
        canvas.getBoundingClientRect(),
        canvasTransform(v, 800, 600),
      ),
    onInterrupt: () => interrupts++,
  });
  const event = (id, x, y) => ({
    pointerType: 'touch',
    pointerId: id,
    clientX: x,
    clientY: y,
    preventDefault() {},
    stopImmediatePropagation: () => stops++,
  });
  handlers.pointerdown(event(1, 120, 140));
  assert.equal(interrupts, 0);
  handlers.pointerdown(event(2, 220, 140));
  assert.equal(interrupts, 1);
  handlers.pointermove(event(2, 320, 140));
  assert.equal(v.width, 400);
  const point = clientToWorld(
    {
      x: 220,
      y: 140,
    },
    canvas.getBoundingClientRect(),
    canvasTransform(v, 800, 600),
  );
  assert.equal(point.x, 150);
  assert.equal(point.y, 100);
  const beforeThird = { ...v };
  handlers.pointerdown(event(3, 400, 240));
  assert.deepEqual(v, beforeThird);
  handlers.pointerup(event(2, 320, 140));
  assert.deepEqual(v, beforeThird);
  handlers.pointermove(event(1, 140, 160));
  handlers.pointermove(event(3, 420, 260));
  assert.equal(v.width, beforeThird.width);
  assert.ok(Math.abs(v.x - beforeThird.x + 10) < 1e-8);
  handlers.pointerup(event(3, 420, 260));
  const beforeSingle = { ...v };
  const before = stops;
  handlers.pointermove(event(1, 160, 180));
  assert.equal(stops, before + 1);
  assert.equal(v.width, beforeSingle.width);
  assert.ok(Math.abs(v.x - beforeSingle.x + 10) < 1e-8);
  handlers.pointercancel(event(1, 160, 180));
  handlers.pointerdown(event(3, 100, 100));
  assert.equal(interrupts, 1);
});
test('placement ghosts follow the cursor without changing the machine and predict comment attachment', () => {
  const m = example(),
    before = JSON.stringify(m),
    state = placementPreview(m, 'state', {
      x: 50,
      y: 90,
    }),
    note = placementPreview(m, 'comment', {
      x: 410,
      y: 150,
    });
  assert.equal(state.item.name, 'q4');
  assert.equal(state.item.x, 50);
  assert.equal(note.item.x, 410);
  assert.deepEqual(note.item.nodeIds, ['s1']);
  assert.equal(JSON.stringify(m), before);
  assert.equal(placementPreview(m, 'state', null), null);
});
import { createLexerAnalyzer } from './src/core/lexer-analyzer.js';
import { createWorkerHandler } from './src/core/lexer-worker.js';
import { createDebouncedTask } from './src/core/debounced-task.js';
test('long accepted tokens retain complete paths and earlier debugger snapshots', () => {
  const input = 'a'.repeat(50000),
    m = example(),
    tokens = tokenize(m, input);
  assert.equal(tokens[0].value, input);
  assert.equal(tokens[0].traceStates.length, input.length + 1);
  assert.equal(tokens[0].traceEdges.length, input.length);
  const iterator = lexerSteps(m, 'a'.repeat(5000));
  iterator.next();
  const first = iterator.next().value;
  for (let i = 0; i < 4000; i++) iterator.next();
  assert.deepEqual(first.traceStates, ['s0', 's1']);
  assert.deepEqual(first.traceEdges, [0]);
});
test('background lexer analysis cancels obsolete input and rejects late worker messages', async () => {
  const workers = [];
  const analyzer = createLexerAnalyzer(tokenize, {
      threshold: 1,
      workerFactory: () => {
        const worker = {
          requests: [],
          postMessage(request) {
            this.requests.push(request);
          },
          terminate() {
            this.terminated = true;
          },
        };
        workers.push(worker);
        return worker;
      },
    }),
    m = example();
  const old = analyzer.get(m, 'hello').catch((error) => error.name),
    first = workers[0],
    latest = analyzer.get(m, '42');
  assert.equal(await old, 'AbortError');
  assert.equal(first.terminated, true);
  const second = workers[1],
    request = second.requests[0];
  first.onmessage({
    data: {
      id: first.requests[0].id,
      tokens: [],
    },
  });
  second.onmessage({
    data: createWorkerHandler()(request),
  });
  assert.deepEqual(await latest, tokenize(m, '42'));
  assert.deepEqual(analyzer.get(m, '42'), tokenize(m, '42'));
});
test('worker analysis preserves errors and full trace order', () => {
  const handle = createWorkerHandler(),
    m = example(),
    input = 'hello 😀 42';
  assert.deepEqual(
    handle({
      id: 1,
      machine: m,
      input,
    }).tokens,
    tokenize(m, input),
  );
  m.edges.push({
    ...m.edges[0],
  });
  const result = handle({
    id: 2,
    machine: m,
    input: 'a',
  });
  assert.match(result.error.message, /Ambiguous/);
  assert.deepEqual(result.error.edgeIndices, [0, m.edges.length - 1]);
});
test('blocked workers fall back to the native lexer without disabling the tester', async () => {
  const m = example(),
    missing = createLexerAnalyzer(tokenize, {
      threshold: 1,
      workerFactory() {
        throw Error('Worker blocked');
      },
    });
  assert.deepEqual(missing.get(m, 'hello'), tokenize(m, 'hello'));
  let worker;
  const broken = createLexerAnalyzer(tokenize, {
      threshold: 1,
      workerFactory: () =>
        (worker = {
          postMessage() {},
          terminate() {},
        }),
    }),
    pending = broken.get(m, '42');
  worker.onerror({
    message: 'Blocked',
  });
  assert.deepEqual(await pending, tokenize(m, '42'));
  assert.deepEqual(broken.get(m, 'hello'), tokenize(m, 'hello'));
});
test('input debounce runs only the latest work and flushes before debugger startup', () => {
  const tasks = new Map();
  let id = 0,
    runs = 0;
  const work = createDebouncedTask(() => runs++, {
    setTimer: (fn) => {
      tasks.set(++id, fn);
      return id;
    },
    clearTimer: (id) => tasks.delete(id),
  });
  work.schedule();
  work.schedule();
  work.schedule();
  assert.equal(tasks.size, 1);
  assert.equal(runs, 0);
  work.flush();
  assert.equal(tasks.size, 0);
  assert.equal(runs, 1);
  work.flush();
  assert.equal(runs, 1);
});
test('simplified label boxes include stack rules in routing and hit bounds', () => {
  const m = example(),
    edge = m.edges[0];
  edge.stackRules = [{ top: 'LONG_ENUM_NAME', replace: ['LONG_ENUM_NAME', 'SYMBOL'] }];
  const classic = routeEdges(m),
    simplified = routeEdges(m, simpleTransitionLabel);
  assert.equal(simplified[0].label.w, simpleTransitionLabel(edge).length * 7 + 14);
  assert.ok(simplified[0].label.w > 100);
  assert.equal(routeEdges(m), classic);
  assert.equal(routeEdges(m, simpleTransitionLabel), simplified);
});
function tokenTestElement() {
  const element = {
    children: [],
    setAttribute() {},
    replaceChildren() {
      this.children = [];
    },
    append(node) {
      node.parentNode = this;
      this.children.push(node);
    },
    get firstElementChild() {
      return this.children[0];
    },
    get lastElementChild() {
      return this.children.at(-1);
    },
    get innerHTML() {
      return this.children.map((n) => n.html).join('');
    },
    set innerHTML(html) {
      this.children = html ? [node(html)] : [];
    },
  };
  function node(html) {
    return {
      html,
      parentNode: element,
      replaceWith(next) {
        next.parentNode = element;
        element.children[element.children.indexOf(this)] = next;
        this.parentNode = null;
      },
      remove() {
        element.children.splice(element.children.indexOf(this), 1);
      },
    };
  }
  element.ownerDocument = {
    createElement() {
      return {
        set innerHTML(html) {
          this.content = {
            firstElementChild: node(html),
          };
        },
      };
    },
  };
  return element;
}
test('incremental lexer matches full analysis across edits and memory changes', () => {
  const m = example(),
    cache = createTokenizationCache(tokenize);
  let input = 'hello 42 world '.repeat(80);
  let old = cache.get(m, input);
  for (const [position, remove, text] of [
    [100, 0, 'x'],
    [0, 1, ' '],
    [500, 8, '42'],
    [1000, 0, '😀'],
    [10, 20, ''],
  ]) {
    input = input.slice(0, position) + text + input.slice(position + remove);
    const next = cache.get(m, input);
    assert.deepEqual(next, tokenize(m, input));
    if (position === 100) assert.equal(next[0], old[0]);
    old = next;
  }
});
test('incremental cache invalidates speculative lookahead and restores stack checkpoints', () => {
  const m = {
      start: 'a',
      machineType: 'extended',
      stack: { alphabet: ['S'], initial: 'S' },
      states: [
        {
          id: 'a',
          name: 'a',
          token: '',
          x: 0,
          y: 0,
        },
        {
          id: 'b',
          name: 'b',
          token: 'B',
          x: 1,
          y: 1,
        },
        {
          id: 'c',
          name: 'c',
          token: '',
          x: 2,
          y: 2,
        },
      ],
      edges: [
        {
          from: 'a',
          to: 'b',
          label: 'a',
          stackRules: [{ top: 'S', replace: ['S', 'S'] }],
        },
        {
          from: 'b',
          to: 'c',
          label: 'b',
        },
        {
          from: 'c',
          to: 'b',
          label: 'c',
        },
      ],
    },
    cache = createTokenizationCache(tokenize);
  for (const input of ['aaaaabbbbb', 'aaaaabbbbc', 'aaaaaa', 'aabaa', '😀aaaa'])
    assert.deepEqual(cache.get(m, input), tokenize(m, input));
});
test('incremental analysis reuses converged suffixes and matches full lexing through random edits', () => {
  const m = example(),
    cache = createTokenizationCache(tokenize);
  let input = 'hello 42 world '.repeat(80),
    before = cache.get(m, input);
  const replacement = 'j' + input.slice(1),
    after = cache.get(m, replacement);
  assert.equal(after.at(-1), before.at(-1));
  assert.deepEqual(after, tokenize(m, replacement));
  input = replacement;
  let seed = 12345;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  for (let i = 0; i < 150; i++) {
    const at = next() % (input.length + 1),
      remove = next() % 5,
      insert = ['a', ' ', '42', '😀', '\n', ''][next() % 6];
    input = input.slice(0, at) + insert + input.slice(at + remove);
    assert.deepEqual(cache.get(m, input), tokenize(m, input));
  }
});
test('manual bends move the curve and survive serialization and TikZ export', () => {
  const m = example(),
    before = routeEdges(m)[0];
  m.edges[0].bend = {
    x: 30,
    y: 50,
  };
  const saved = validate(JSON.parse(JSON.stringify(m))),
    after = routeEdges(saved)[0];
  assert.notDeepEqual(after.p0, before.p0);
  assert.notDeepEqual(after.p3, before.p3);
  for (const [point, state, radius] of [
    [after.p0, saved.states[0], 37],
    [after.p3, saved.states[1], 37],
  ])
    assert.ok(Math.abs(Math.hypot(point.x - state.x, point.y - state.y) - radius) < 0.001);
  assert.notEqual(toTikz(saved), toTikz(example()));
  saved.edges[0].bend.x = 'bad';
  assert.throws(() => validate(saved), /bend/);
});
test('dragging a self-loop toward its state shrinks it while keeping its endpoints attached', () => {
  const m = example(),
    edge = m.edges[1],
    state = m.states.find((s) => s.id === edge.from),
    before = routeEdges(m)[1],
    apex = {
      x: before.label.x - state.x,
      y: before.label.y + 13 - state.y,
    };
  edge.bend = {
    x: -apex.x * 0.45,
    y: -apex.y * 0.45,
  };
  const after = routeEdges(m)[1],
    distance = (p) => Math.hypot(p.x - state.x, p.y - state.y);
  assert.ok(distance(after.c1) < distance(before.c1));
  assert.ok(distance(after.c2) < distance(before.c2));
  assert.ok(Math.abs(distance(after.p0) - distance(before.p0)) < 0.001);
  assert.ok(Math.abs(distance(after.p3) - distance(before.p3)) < 0.001);
});
test('dragging a loop around its state rotates it and keeps its size', () => {
  const m = example(),
    edge = m.edges[1],
    state = m.states.find((s) => s.id === edge.from),
    before = routeEdges(m)[1],
    center = {
      x: state.x,
      y: state.y,
    },
    apex = {
      x: before.label.x,
      y: before.label.y + 13,
    },
    initial = {
      x: center.x + 100,
      y: center.y,
    },
    current = {
      x: center.x,
      y: center.y + 100,
    };
  edge.bend = loopDragBend(center, apex, initial, current, {
    x: 0,
    y: 0,
  });
  const after = routeEdges(m)[1],
    v = {
      x: apex.x - center.x,
      y: apex.y - center.y,
    };
  assert.ok(Math.abs(after.label.x - center.x + v.y) < 0.001);
  assert.ok(Math.abs(after.label.y + 13 - center.y - v.x) < 0.001);
});
import { createBendReset } from './src/core/reset-bend.js';
test('double right-click resets only the same nearby connection within the time limit', () => {
  const a = {},
    b = {};
  let resets = 0;
  const click = createBendReset(
      (e) => e.edge,
      () => resets++,
    ),
    event = (edge, time, x = 0) => ({
      edge,
      timeStamp: time,
      clientX: x,
      clientY: 0,
    });
  click(event(a, 0));
  click(event(b, 100));
  click(event(a, 200));
  assert.equal(resets, 0);
  click(event(a, 250, 20));
  assert.equal(resets, 0);
  click(event(a, 800, 20));
  assert.equal(resets, 0);
  click(event(a, 900, 21));
  assert.equal(resets, 1);
  click(event(a, 950, 21));
  assert.equal(resets, 1);
});

test('ordinary transition tips reach the state boundary', () => {
  const m = example();
  for (const bend of [
    undefined,
    {
      x: 30,
      y: 50,
    },
  ]) {
    m.edges[0].bend = bend;
    const r = routeEdges(m)[0],
      target = m.states.find((s) => s.id === m.edges[0].to);
    assert.ok(Math.abs(Math.hypot(r.p3.x - target.x, r.p3.y - target.y) - 37) < 0.001);
  }
});
import { visualMachine } from './src/core/start-views.js';
test('grouped radial starts keep one logical start and render each transition once', () => {
  const ids = [
      'root',
      ...Array.from(
        {
          length: 12,
        },
        (_, i) => 'q' + i,
      ),
    ],
    m = {
      start: 'root',
      states: ids.map((id) => ({
        id,
        name: id,
        token: id === 'root' ? '' : 'END',
        x: 0,
        y: 0,
      })),
      edges: ids.slice(1).map((id, i) => ({
        from: 'root',
        to: id,
        label: String.fromCharCode(97 + i),
      })),
    };
  const expected = tokenize(m, 'abcdefghijkl'),
    before = structuredClone(m.edges);
  autoLayout(m, 'circle', 0.5, true);
  assert.ok(m.startViews.length > 0);
  assert.equal(m.states.length, ids.length);
  assert.deepEqual(m.edges, before);
  assert.deepEqual(tokenize(m, 'abcdefghijkl'), expected);
  const displayed = visualMachine(m);
  assert.equal(displayed.edges.length, m.edges.length);
  assert.equal(new Set(displayed.states.map((s) => s.id)).size, displayed.states.length);
  assert.equal(routeEdges(m).length, m.edges.length);
  for (const view of m.startViews) assert.ok(view.targets.length <= 12);
  for (const state of displayed.states)
    if (state.startView !== undefined)
      assert.ok(displayed.edges.filter((e) => e.from === state.id).length <= 6);
  const restored = validate(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(tokenize(restored, 'abc'), tokenize(m, 'abc'));
  assert.doesNotThrow(() => toTikz(m));
  const first = JSON.stringify(m);
  autoLayout(m, 'circle', 0.5, true);
  assert.equal(JSON.stringify(m), first);
});
test('manual connection bends keep their base curve stable during dragging', () => {
  const m = example(),
    edge = m.edges[0];
  edge.bend = {
    x: 40,
    y: 30,
  };
  const a = routeEdges(m)[0];
  edge.bend = {
    x: 41,
    y: 31,
  };
  const b = routeEdges(m)[0];
  assert.ok(Math.abs(b.c1.x - a.c1.x - 4 / 3) < 1e-6);
  assert.ok(Math.abs(b.c1.y - a.c1.y - 4 / 3) < 1e-6);
});
import { arrangeGraph } from './src/core/basic-layout.js';
import { smartArrange, layoutQuality, untangle } from './src/core/smart-layout.js';
import { createGroup, dissolveGroup, graphView } from './src/core/groups.js';
import { planarCoordinates, drawingClearance } from './src/core/planar-layout.js';
import { radialTree } from './src/core/tidy-tree.js';
test('a multi-entry identifier group stays compact without long boundary crossings', () => {
  const ids = [
    'outside',
    'identifier',
    'underscore',
    'prefix',
    'quote1',
    'quote2',
    'quote3',
    'dollar',
    'brace',
    'doubleDollar',
  ];
  const pairs = [
    ['outside', 'identifier'],
    ['outside', 'underscore'],
    ['outside', 'prefix'],
    ['outside', 'dollar'],
    ['identifier', 'identifier'],
    ['underscore', 'identifier'],
    ['prefix', 'identifier'],
    ['prefix', 'quote1'],
    ['quote1', 'quote2'],
    ['quote2', 'quote3'],
    ['dollar', 'identifier'],
    ['dollar', 'brace'],
    ['dollar', 'underscore'],
    ['dollar', 'doubleDollar'],
  ];
  const m = {
      start: 'outside',
      states: ids.map((id) => ({
        id,
        name: id,
        token: '',
        x: 0,
        y: 0,
      })),
      edges: pairs.map(([from, to], i) => ({
        from,
        to,
        label: String.fromCharCode(65 + i),
      })),
    },
    group = createGroup(m, ids.slice(1), 'Identifiers'),
    before = structuredClone(m.states[0]);
  smartArrange(m, group.id, {
    mode: 'circle',
  });
  const view = graphView(m, group.id),
    clearance = drawingClearance(view.states, view.edges);
  assert.equal(crossingPairs(graphView(m, group.id, false), true).length, 0);
  assert.equal(view.states.filter((s) => s.outside).length, 1);
  assert.ok(clearance.node >= 159.99);
  assert.ok(clearance.wire >= 64.99);
  const xs = view.states.map((s) => s.x),
    ys = view.states.map((s) => s.y);
  assert.ok((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) < 2000000);
  assert.deepEqual(m.states[0], before);
  assert.ok(view.states.filter((s) => s.outside).every((s) => s.outsideSource === 'outside'));
  validate(m);
});
test('outside references choose an unobstructed side of a triangle with two entry targets', () => {
  const ids = ['outside', 'entry', 'left', 'right', 'end'],
    pairs = [
      ['outside', 'entry'],
      ['outside', 'right'],
      ['entry', 'left'],
      ['entry', 'right'],
      ['left', 'right'],
      ['left', 'end'],
      ['right', 'right'],
    ];
  const m = {
      start: 'outside',
      states: ids.map((id) => ({
        id,
        name: id,
        token: '',
        x: 0,
        y: 0,
      })),
      edges: pairs.map(([from, to], i) => ({
        from,
        to,
        label: String.fromCharCode(65 + i),
      })),
    },
    group = createGroup(m, ids.slice(1), 'Triangle');
  smartArrange(m, group.id, {
    mode: 'circle',
  });
  const view = graphView(m, group.id);
  assert.equal(crossingPairs(view, true).length, 0);
  assert.ok(drawingClearance(view.states, view.edges).node >= 159.99);
  const nodes = new Map(view.states.map((s) => [s.id, s]));
  for (const edge of view.edges.filter((e) => e.outside)) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    assert.ok(a.x < Math.min(...view.states.filter((s) => !s.outside).map((s) => s.x)));
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 850);
  }
});
test('a string-like subgraph keeps its complete contextual graph compact and uncrossed', () => {
  const names = [
    'outside',
    'open',
    'content',
    'accepted',
    'empty',
    'tripleEntry',
    'quote1',
    'body',
    'quote2',
    'tripleAccepted',
    'escape',
  ];
  const pairs = [
    ['outside', 'open'],
    ['open', 'content'],
    ['content', 'accepted'],
    ['content', 'content'],
    ['open', 'empty'],
    ['empty', 'tripleEntry'],
    ['tripleEntry', 'quote1'],
    ['tripleEntry', 'body'],
    ['body', 'quote1'],
    ['quote1', 'quote2'],
    ['quote2', 'tripleAccepted'],
    ['body', 'body'],
    ['content', 'escape'],
    ['escape', 'content'],
    ['open', 'escape'],
    ['quote1', 'body'],
    ['quote2', 'body'],
  ];
  const m = {
      start: 'outside',
      states: names.map((id) => ({
        id,
        name: id,
        token: '',
        x: 0,
        y: 0,
      })),
      edges: pairs.map(([from, to]) => ({
        from,
        to,
        label: 'a',
      })),
    },
    edges = JSON.stringify(m.edges),
    group = createGroup(m, names.slice(1), 'Strings');
  const baseline = structuredClone(graphView(m, group.id, false));
  baseline.start = 'open';
  radialTree(baseline);
  const area = (states) =>
    (Math.max(...states.map((s) => s.x)) - Math.min(...states.map((s) => s.x))) *
    (Math.max(...states.map((s) => s.y)) - Math.min(...states.map((s) => s.y)));
  smartArrange(m, group.id, {
    mode: 'circle',
  });
  const view = graphView(m, group.id, false);
  assert.equal(crossingPairs(view, true).length, 0);
  assert.ok(area(view.states) < area(baseline.states) * 0.6);
  const contextual = graphView(m, group.id),
    clearance = drawingClearance(contextual.states, contextual.edges);
  assert.equal(crossingPairs(contextual, true).length, 0);
  assert.ok(clearance.node >= 159.99 && clearance.wire >= 64.99);
  assert.equal(JSON.stringify(m.edges), edges);
  validate(m);
});
test('Radial retains centered breadth-first rings even when planar embedding finds a different drawing', () => {
  const m = {
    start: 'root',
    states: [
      'root',
      ...Array.from(
        {
          length: 12,
        },
        (_, i) => `n${i}`,
      ),
    ].map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [],
  };
  for (let i = 0; i < 12; i++) {
    m.edges.push({
      from: 'root',
      to: `n${i}`,
      label: 'a',
    });
    m.edges.push({
      from: `n${i}`,
      to: `n${(i + 1) % 12}`,
      label: 'b',
    });
  }
  smartArrange(m, null, {
    mode: 'circle',
    smartGroups: false,
  });
  const root = m.states[0],
    radii = m.states.slice(1).map((s) => Math.hypot(s.x - root.x, s.y - root.y));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-6);
  assert.ok(Math.max(...radii) < 1000);
  const xs = m.states.slice(1).map((s) => s.x),
    ys = m.states.slice(1).map((s) => s.y);
  assert.ok(Math.min(...xs) < root.x && Math.max(...xs) > root.x);
  assert.ok(Math.min(...ys) < root.y && Math.max(...ys) > root.y);
});
test('Radial Compact gives the same drawing after moving nodes and bending edges', () => {
  const first = example();
  const group = createGroup(first, ['s1', 's2'], 'Tokens');
  const moved = structuredClone(first);
  moved.states.forEach((state, index) => {
    state.x = 800 * index;
    state.y = -300 * index;
  });
  moved.edges[0].bend = { x: 140, y: 200 };
  moved.groups[0].x = 900;
  moved.groups[0].contextPositions = { s0: { x: -500, y: -600 } };
  const options = { mode: 'circle', spacing: 0.5, smartGroups: false };
  smartArrange(first, group.id, options);
  smartArrange(moved, group.id, options);
  assert.deepEqual(graphView(first, group.id), graphView(moved, group.id));
  smartArrange(first, null, options);
  smartArrange(moved, null, options);
  assert.deepEqual(graphView(first), graphView(moved));
  assert.deepEqual(graphView(first, group.id), graphView(moved, group.id));
});
test('Tree remains a compact forward tree despite long labels and planar coordinate alternatives', () => {
  const m = {
    start: 'root',
    states: ['root', 'a', 'b', 'c', 'a1', 'a2', 'b1', 'c1'].map((id) => ({
      id,
      name: id,
      token: '',
      x: 0,
      y: 0,
    })),
    edges: [
      ['root', 'a'],
      ['root', 'b'],
      ['root', 'c'],
      ['a', 'a1'],
      ['a', 'a2'],
      ['b', 'b1'],
      ['c', 'c1'],
    ].map(([from, to]) => ({
      from,
      to,
      label: 'x'.repeat(150),
    })),
  };
  smartArrange(m, null, {
    mode: 'tree',
    smartGroups: false,
  });
  const get = (id) => m.states.find((s) => s.id === id);
  assert.equal(get('a').x, get('b').x);
  assert.equal(get('b').x, get('c').x);
  assert.ok(get('root').x < get('a').x && get('a').x < get('a1').x);
  const xs = m.states.map((s) => s.x),
    ys = m.states.map((s) => s.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 1000);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 1500);
});
test('topological grid embedding handles planar cycles, nested faces, cut vertices and disconnected components', () => {
  const fixtures = [
    [
      4,
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
    ],
    [
      8,
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ],
    ],
    [
      8,
      [
        [0, 1],
        [1, 2],
        [2, 0],
        [2, 3],
        [3, 4],
        [4, 2],
        [4, 5],
        [6, 7],
      ],
    ],
    [
      9,
      Array.from(
        {
          length: 9,
        },
        (_, v) => [...(v % 3 < 2 ? [[v, v + 1]] : []), ...(v < 6 ? [[v, v + 3]] : [])],
      ).flat(),
    ],
  ];
  for (const [n, pairs] of fixtures) {
    const m = {
        start: '0',
        states: Array.from(
          {
            length: n,
          },
          (_, id) => ({
            id: String(id),
            name: String(id),
            token: '',
            x: 0,
            y: 0,
          }),
        ),
        edges: pairs.map(([a, b]) => ({
          from: String(a),
          to: String(b),
          label: 'a',
        })),
      },
      before = JSON.stringify(m);
    const result = planarCoordinates(m);
    assert.equal(result.planar, true);
    assert.ok(result.positions);
    assert.equal(JSON.stringify(m), before);
    const nodes = m.states.map((s) => ({
        ...s,
        ...result.positions.get(s.id),
      })),
      clearance = drawingClearance(nodes, m.edges);
    assert.equal(clearance.crossings, 0);
    assert.ok(clearance.node >= 219.999);
    assert.ok(clearance.wire >= 84.999);
    assert.deepEqual(planarCoordinates(m).positions, result.positions);
  }
});
test('planarity test rejects K3,3 even though it passes the Euler edge-count bound', () => {
  const m = {
    states: Array.from(
      {
        length: 6,
      },
      (_, id) => ({
        id: String(id),
      }),
    ),
    edges: Array.from(
      {
        length: 3,
      },
      (_, a) =>
        Array.from(
          {
            length: 3,
          },
          (_, b) => ({
            from: String(a),
            to: String(b + 3),
          }),
        ),
    ).flat(),
  };
  assert.ok(m.edges.length <= 3 * m.states.length - 6);
  const result = planarCoordinates(m);
  assert.equal(result.planar, false);
  assert.equal(result.positions, null);
});
test('ordinary unblocked transitions route straight while loops and manual bends retain their geometry', () => {
  const m = {
      states: [
        {
          id: 'a',
          name: 'a',
          token: '',
          x: 0,
          y: 0,
        },
        {
          id: 'b',
          name: 'b',
          token: '',
          x: 400,
          y: 0,
        },
      ],
      edges: [
        {
          from: 'a',
          to: 'b',
          label: 'a',
        },
      ],
    },
    route = routeEdges(m)[0];
  assert.ok(Math.abs(route.c1.y - route.p0.y) < 1e-8);
  assert.ok(Math.abs(route.c2.y - route.p3.y) < 1e-8);
  m.edges[0].bend = {
    x: 0,
    y: 90,
  };
  assert.notEqual(routeEdges(m)[0].c1.y, route.c1.y);
});
test('a small subgraph fork flows from the outside start through its entry to both destinations', () => {
  for (const mode of ['tree', 'circle', 'spring']) {
    const m = {
      start: 'start',
      states: ['start', 'entry', 'first', 'second'].map((id) => ({
        id,
        name: id,
        token: '',
        x: 0,
        y: 0,
      })),
      edges: [
        {
          from: 'start',
          to: 'entry',
          label: '<',
        },
        {
          from: 'entry',
          to: 'first',
          label: '-',
        },
        {
          from: 'entry',
          to: 'second',
          label: '=',
        },
      ],
    };
    const group = createGroup(m, ['first', 'entry', 'second'], 'Operators');
    smartArrange(m, group.id, {
      mode,
    });
    const view = graphView(m, group.id),
      get = (id) => view.states.find((s) => s.id === id),
      entry = get('entry');
    assert.ok(get('start').x < entry.x);
    assert.ok(Math.abs(get('start').y - entry.y) < 1e-6);
    assert.ok(entry.x < get('first').x);
    assert.ok(Math.abs(get('first').x - get('second').x) < 1e-6);
    assert.ok(Math.abs(entry.y - (get('first').y + get('second').y) / 2) < 1e-6);
    assert.notEqual(get('first').y, get('second').y);
  }
});
test('untangling removes avoidable wire crossings without changing occupied positions or topology', () => {
  const m = {
    start: null,
    states: [
      ['a', 0, 0],
      ['b', 200, 200],
      ['c', 0, 200],
      ['d', 200, 0],
    ].map(([id, x, y]) => ({
      id,
      name: id,
      token: '',
      x,
      y,
    })),
    edges: [
      {
        from: 'a',
        to: 'b',
        label: 'a',
      },
      {
        from: 'c',
        to: 'd',
        label: 'b',
      },
    ],
  };
  const positions = m.states.map((s) => `${s.x},${s.y}`).sort(),
    edges = JSON.stringify(m.edges);
  assert.equal(crossingPairs(m).length, 1);
  untangle(m);
  assert.equal(crossingPairs(m).length, 0);
  assert.deepEqual(m.states.map((s) => `${s.x},${s.y}`).sort(), positions);
  assert.equal(JSON.stringify(m.edges), edges);
});
test('overview combines parallel group wires and retains every transition for details', () => {
  const m = example(),
    g = createGroup(m, ['s1', 's2'], 'Tokens'),
    overview = graphView(m);
  const incoming = overview.edges.filter((edge) => edge.to === g.id);
  assert.equal(incoming.length, 1);
  assert.deepEqual(incoming[0].originalIndices, [0, 2]);
  assert.equal(routeEdges(overview).length, overview.edges.length);
  m.edges[1].bend = {
    x: 900,
    y: 900,
  };
  m.edges[0].bend = {
    x: 12,
    y: 13,
  };
  smartArrange(m, g.id, {
    mode: 'circle',
  });
  assert.equal(m.edges[1].bend, undefined);
  assert.deepEqual(m.edges[0].bend, {
    x: 12,
    y: 13,
  });
});
test('smart arrangement folds connected crowded branches and preserves lexer behavior in every mode', () => {
  const source = {
    start: 'root',
    states: [
      {
        id: 'root',
        name: 'start',
        token: '',
        x: 0,
        y: 0,
      },
    ],
    edges: [],
  };
  for (let branch = 0; branch < 9; branch++)
    for (let step = 0; step < 4; step++) {
      const id = `b${branch}-${step}`;
      source.states.push({
        id,
        name: id,
        token: `TOKEN_${branch}`,
        x: 0,
        y: 0,
      });
      source.edges.push({
        from: step ? `b${branch}-${step - 1}` : 'root',
        to: id,
        label: step ? 'x' : String.fromCharCode(97 + branch),
      });
    }
  const expected = tokenize(source, 'axxx bxxx');
  for (const mode of ['tree', 'circle', 'spring']) {
    const plain = structuredClone(source);
    assert.equal(
      smartArrange(plain, null, {
        mode,
        smartGroups: false,
      }),
      0,
    );
    const grouped = structuredClone(source);
    assert.ok(
      smartArrange(grouped, null, {
        mode,
      }) > 0,
    );
    validate(grouped);
    assert.ok(layoutQuality(grouped).score < layoutQuality(plain).score);
    assert.deepEqual(tokenize(grouped, 'axxx bxxx'), expected);
    assert.ok(
      grouped.groups.every((g) =>
        g.stateIds.every((id) => id.startsWith(g.stateIds[0].split('-')[0] + '-')),
      ),
    );
  }
  const small = example();
  assert.equal(smartArrange(small), 0);
  assert.equal(small.groups, undefined);
});
test('groups collapse visually while preserving lexer states and transitions', () => {
  const m = example(),
    before = tokenize(m, 'hello 42');
  const group = createGroup(m, ['s1', 's2'], 'Words and numbers');
  validate(m);
  const overview = graphView(m),
    inside = graphView(m, group.id);
  assert.equal(overview.states.length, 3);
  assert.equal(overview.states.find((s) => s.id === group.id).count, 2);
  assert.deepEqual(
    new Set(inside.states.filter((s) => !s.outside).map((s) => s.id)),
    new Set(['s1', 's2']),
  );
  assert.deepEqual(
    inside.states.filter((s) => s.outside).map((s) => s.id),
    ['s0'],
  );
  assert.deepEqual(
    inside.edges.filter((e) => e.outside).map((e) => e.originalIndex),
    [0, 2],
  );
  const outside = structuredClone(m.states[0]);
  smartArrange(m, group.id);
  assert.deepEqual(m.states[0], outside);
  assert.deepEqual(tokenize(validate(JSON.parse(JSON.stringify(m))), 'hello 42'), before);
  assert.throws(() => createGroup(m, ['s1'], 'Duplicate'), /one group/);
  dissolveGroup(m, group.id);
  assert.equal(graphView(m).states.length, 4);
});
test('basic arrangement is deterministic, separates states, and preserves the lexer', () => {
  const source = example(),
    before = tokenize(source, 'hello 42'),
    edges = JSON.stringify(source.edges);
  const m = arrangeGraph(structuredClone(source));
  assert.equal(JSON.stringify(m.edges), edges);
  assert.deepEqual(tokenize(m, 'hello 42'), before);
  for (let i = 0; i < m.states.length; i++)
    for (let j = i + 1; j < m.states.length; j++)
      assert.ok(Math.hypot(m.states[i].x - m.states[j].x, m.states[i].y - m.states[j].y) >= 180);
  assert.deepEqual(
    arrangeGraph(structuredClone(source)).states.map((s) => [s.x, s.y]),
    m.states.map((s) => [s.x, s.y]),
  );
  const group = createGroup(m, ['s1', 's2'], 'Tokens');
  arrangeGraph(m);
  arrangeGraph(m, group.id);
  validate(m);
  assert.deepEqual(tokenize(m, 'hello 42'), before);
});
import './tests/curve-clearance.test.mjs';
import './tests/layout-algorithms.test.mjs';

test('academic IFJ export expands characters, resolves portals and uses unique state names', async () => {
  const { toAcademic } = await import('./src/core/academic-export.js');
  const m = {
    start: 'a',
    states: [
      { id: 'a', name: 'same', token: '', x: 0, y: 0 },
      { id: 'b', name: 'same', token: 'OK', portal: 'target', x: 100, y: 0 },
    ],
    edges: [{ from: 'a', portal: 'target', label: '[a-c]' }],
  };
  const before = structuredClone(m);
  const text = toAcademic(m);
  assert.match(text, /M = \(Q, Σ, R, s, F\)/);
  assert.match(text, /Q = \{q0, q1\}/);
  assert.match(text, /Σ = \{a\.\.c\}/);
  assert.match(text, /q0 A1 → q1/);
  assert.match(text, /s = q0/);
  assert.match(text, /F = \{q1\}/);
  assert.deepEqual(m, before);
  m.edges[0].label = 'a';
  m.edges[0].invert = true;
  assert.match(toAcademic(m), /b\.\.0x7F/);
  assert.throws(() => {
    m.edges[0].label = '\\u{1F600}';
    toAcademic(m);
  }, /ASCII/);
  m.edges[0].label = 'a';
  m.start = null;
  assert.throws(() => toAcademic(m), /start state/);
});

test('overview bends persist without changing internal transition bends', () => {
  const m = example();
  m.groups = [{ id: 'g', name: 'G', stateIds: ['s1'], x: 400, y: 145 }];
  m.edges[0].bend = { x: 7, y: 9 };
  m.edges[0].groupBend = { x: 30, y: 60 };
  const restored = validate(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(graphView(restored).edges.find((e) => e.originalIndex === 0).bend, {
    x: 30,
    y: 60,
  });
  assert.deepEqual(restored.edges[0].bend, { x: 7, y: 9 });
});

test('Auto layout chooses tree below ten nodes and radial at ten, always compact', async () => {
  const { createLayoutTask } = await import('./src/editor/layout-task.js');
  const previous = globalThis.Worker;
  const requests = [];
  globalThis.Worker = class {
    postMessage(request) {
      requests.push(request);
    }
    terminate() {}
  };
  try {
    for (const count of [9, 10]) {
      const scope = new AbortController();
      const run = createLayoutTask({ scope });
      const machine = {
        start: 's0',
        states: Array.from({ length: count }, (_, i) => ({
          id: `s${i}`,
          name: `S${i}`,
          token: '',
          x: i * 100,
          y: 0,
        })),
        edges: [],
      };
      const task = run(machine, null, { mode: 'auto', spacing: 1 });
      assert.equal(requests.at(-1).options.mode, count < 10 ? 'tree' : 'circle');
      assert.equal(requests.at(-1).options.spacing, 0.5);
      scope.abort();
      await assert.rejects(task, { name: 'AbortError' });
    }
  } finally {
    globalThis.Worker = previous;
  }
});

import './tests/stack-automaton.test.mjs';

import './tests/machine-file.test.mjs';
