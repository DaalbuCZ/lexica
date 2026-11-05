import { radialTree, tidyTree } from '../../src/core/tidy-tree.js';
import { feasibleRadial } from '../../src/core/feasible-layout.js';
import { planarCoordinates } from '../../src/core/planar-layout.js';
import { routeEdges } from '../../src/core/layout.js';
import { cycleAnalysis, cycleProposals } from '../../src/core/cycle-aesthetics.js';

export const skeleton = {
  nodes: ['S', 'A', 'B', 'C'],
  edges: [
    [0, 1, 'a'],
    [1, 2, 'b'],
    [2, 3, 'c'],
    [3, 0, 'd'],
    [1, 0, 'x', 30, true],
    [2, 2, 'y', 0, true],
    [0, 1, 'z', 0, true],
  ],
  steps: [
    {
      label: 'Original',
      points: [
        [175, 70],
        [425, 180],
        [425, 70],
        [175, 180],
      ],
      note: 'Follow S → A → B → C → S. The two diagonals cross.',
    },
    {
      label: 'Skeleton',
      points: [
        [175, 70],
        [425, 180],
        [425, 70],
        [175, 180],
      ],
      bare: true,
      note: 'For the planarity test, forget the directions, fold the two S–A arrows into one link, and set the loop aside.',
    },
    {
      label: 'Uncross',
      points: [
        [175, 70],
        [425, 70],
        [425, 180],
        [175, 180],
      ],
      bare: true,
      note: 'Put the four states in cycle order around the outside. The crossing was a property of the drawing.',
    },
  ],
};

const branchNodes = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const branchEdges = [
  [0, 1],
  [1, 2],
  [1, 3],
  [0, 4],
  [4, 5],
  [5, 6],
];
const branchColors = [0, 1, 1, 1, 2, 2, 2];
const treeSeed = tidyTree({
  start: 'S',
  states: branchNodes.map((id) => ({ id })),
  edges: branchEdges.map(([from, to]) => ({ from: branchNodes[from], to: branchNodes[to] })),
});
const treeMinX = Math.min(...treeSeed.states.map((s) => s.x));
const treeMinY = Math.min(...treeSeed.states.map((s) => s.y));
const treeScale = Math.min(
  460 / (Math.max(...treeSeed.states.map((s) => s.x)) - treeMinX),
  170 / (Math.max(...treeSeed.states.map((s) => s.y)) - treeMinY),
);
export const treePlacement = {
  nodes: branchNodes,
  edges: branchEdges,
  colors: branchColors,
  steps: [
    {
      label: 'Reserve whole rectangles',
      points: [
        [70, 124],
        [223, 62],
        [376, 28],
        [376, 96],
        [223, 183],
        [376, 183],
        [530, 183],
      ],
      note: 'Reserving a rectangle for every subtree leaves empty space at depths where that subtree has no states.',
    },
    {
      label: 'Merge by depth',
      points: treeSeed.states.map((s) => [
        70 + (s.x - treeMinX) * treeScale,
        36 + (s.y - treeMinY) * treeScale,
      ]),
      note: 'Lexica compares occupied contours at each depth, slides siblings together until a gap is needed, then centers the parent between its first and last child.',
    },
  ],
};
const radialNodes = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const radialEdges = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 6],
];
const radialSeed = radialTree({
  start: 'S',
  states: radialNodes.map((id) => ({ id })),
  edges: radialEdges.map(([from, to]) => ({ from: radialNodes[from], to: radialNodes[to] })),
});
const [hub] = radialSeed.states;
const scale = 142 / Math.hypot(radialSeed.states[3].x - hub.x, radialSeed.states[3].y - hub.y);
const rings = radialSeed.states.map(({ x, y }) => [
  300 + (x - hub.x) * scale,
  182 + (y - hub.y) * scale,
]);
const radii = [1, 3].map((i) => Math.hypot(rings[i][0] - 300, rings[i][1] - 182));

export const placement = {
  nodes: radialNodes,
  edges: radialEdges,
  colors: [0, 1, 2, 1, 1, 1, 2],
  viewBox: '96 0 408 364',
  steps: [
    {
      label: 'Count steps',
      points: [
        [140, 182],
        [271, 117],
        [271, 278],
        [446, 53],
        [446, 117],
        [446, 181],
        [446, 278],
      ],
      guides: 'depth',
      note: 'From S, breadth-first search reaches A and B in one step, then C through F in two.',
    },
    {
      label: 'Wrap into rings',
      points: rings,
      guides: 'rings',
      radii,
      note: 'Each column becomes a ring around S. A and B are on the same ring because both are one step away.',
    },
    {
      label: 'Show branch sectors',
      points: rings,
      guides: 'sectors',
      radii,
      note: 'A has three leaves and gets 270°. B has one leaf and gets 90°. Each node sits halfway across the sector it owns.',
    },
  ],
};

export const branches = {
  nodes: branchNodes,
  edges: [...branchEdges, [2, 3], [6, 4, '', 30]],
  colors: branchColors,
  steps: [
    {
      label: 'At the hub',
      points: [
        [300, 124],
        [396, 106],
        [201, 61],
        [434, 199],
        [238, 193],
        [152, 148],
        [384, 46],
      ],
      note: 'The amber and green branches meet only at S, even though their links tangle in this sketch.',
    },
    {
      label: 'Lift out S',
      points: [
        [300, 124],
        [424, 192],
        [377, 60],
        [503, 60],
        [176, 56],
        [92, 186],
        [221, 186],
      ],
      hidden: [0],
      note: 'Without S, the branches are independent. Each can be drawn on its own, with space for S at its edge.',
    },
    {
      label: 'Pack into wedges',
      points: [
        [300, 124],
        [390, 124],
        [495, 60],
        [495, 188],
        [214, 124],
        [116, 66],
        [116, 182],
      ],
      wedges: true,
      note: 'Turn and squeeze each drawing into its own slice, then put the hub back. The links stay inside their slice.',
    },
  ],
};

export const compaction = {
  nodes: ['S', 'A', 'B', 'C', 'D'],
  edges: [
    [0, 1],
    [1, 2],
    [1, 3],
    [0, 4],
  ],
  colors: [0, 1, 1, 1, 2],
  steps: [
    {
      label: 'Clear, but long',
      points: [
        [120, 140],
        [405, 140],
        [520, 77],
        [520, 203],
        [303, 96],
      ],
      note: 'The amber branch is clear, but following S → A takes up most of the width.',
    },
    {
      label: 'Pull too far',
      points: [
        [120, 140],
        [255, 140],
        [370, 77],
        [370, 203],
        [303, 96],
      ],
      guard: [303, 96],
      note: 'This move shortens S → A, but A → B cuts into D’s clearance. Reject the whole move.',
    },
    {
      label: 'Try a smaller move',
      points: [
        [120, 140],
        [325, 140],
        [440, 77],
        [440, 203],
        [303, 96],
      ],
      guard: [303, 96],
      note: 'Slide the same branch a shorter distance. Its shape stays intact, and the link keeps its clearance.',
    },
  ],
};

export const routing = {
  nodes: ['A', 'B', 'C'],
  edges: [
    [0, 1, 'letter', 0],
    [1, 0, 'digit', 0, true],
    [0, 0, 'space', 0, true],
    [1, 2, 'end'],
  ],
  steps: [
    {
      label: 'Single link',
      points: [
        [115, 132],
        [360, 132],
        [512, 132],
      ],
      bare: true,
      note: 'The skeleton needs one A–B link. The machine needs a forward arrow, a return arrow, and a loop on A.',
    },
    {
      label: 'Make lanes',
      points: [
        [115, 132],
        [360, 132],
        [512, 132],
      ],
      bends: [-64, -64],
      note: 'Give the two A–B arrows different lanes and spread their endpoints around each state. Look for an empty angle for the loop.',
    },
    {
      label: 'Give it room',
      points: [
        [79, 137],
        [372, 137],
        [533, 137],
      ],
      bends: [-92, -92],
      note: 'Extra room around the bundle gives the curves and their labels more breathing space.',
    },
  ],
};

export const groups = {
  nodes: ['S', 'A', 'B', 'C', 'D'],
  edges: [
    [0, 1, 'letter'],
    [1, 2],
    [2, 3],
    [0, 4, 'digit'],
  ],
  colors: [0, 1, 1, 1, 2],
  steps: [
    {
      label: 'All states',
      points: [
        [100, 125],
        [251, 75],
        [369, 75],
        [495, 75],
        [251, 181],
      ],
      note: 'The letter branch has three internal states. At the top level, the interesting choice is letter or digit.',
    },
    {
      label: 'Overview',
      points: [
        [100, 125],
        [310, 75],
        [310, 75],
        [310, 75],
        [251, 181],
      ],
      hidden: [2, 3],
      group: 1,
      note: 'Collapse the branch to a single Letter node. Its incoming transition remains visible.',
    },
    {
      label: 'Inside Letter',
      points: [
        [82, 125],
        [233, 125],
        [369, 125],
        [495, 125],
        [251, 181],
      ],
      hidden: [4],
      context: 0,
      note: 'Inside the group, S appears as outside context. You can still see how you enter the branch.',
    },
  ],
};

// Keep the diagrams tied to production geometry. Only the deliberately tangled
// input and intermediate projections are illustrative.
function model(example) {
  return {
    start: example.nodes[0],
    states: example.nodes.map((id) => ({ id, x: 0, y: 0 })),
    edges: example.edges.map(([from, to]) => ({
      from: example.nodes[from],
      to: example.nodes[to],
      label: '',
    })),
    groups: [],
    comments: [],
  };
}

function fit(states) {
  const xs = states.map((s) => s.x);
  const ys = states.map((s) => s.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  const scale = Math.min(460 / Math.max(1, width), 170 / Math.max(1, height));
  return states.map((s) => [
    300 + (s.x - left - width / 2) * scale,
    124 + (s.y - top - height / 2) * scale,
  ]);
}

const planar = planarCoordinates(model(skeleton));
if (planar.positions) {
  skeleton.steps[2].points = fit(skeleton.nodes.map((id) => planar.positions.get(id)));
  skeleton.steps[2].note =
    'The planar grid routine finds a crossing-free drawing of this same cycle.';
}

const branchModel = model(branches);
const branchResult = feasibleRadial(branchModel);
if (branchResult.states) {
  const positions = new Map(branchResult.states.map((s) => [s.id, s]));
  branches.steps[2].points = fit(branches.nodes.map((id) => positions.get(id)));
  branches.steps[2].wedges = true;
  branches.steps[2].label = 'Feasible assembly';
  branches.steps[2].note =
    'The two branches occupy separate shaded sectors on opposite sides of S. Their internal connections stay within their respective sectors.';
}

const compactModel = model(compaction);
const compactSeed = radialTree(structuredClone(compactModel));
const compactResult = feasibleRadial(compactModel);
const compactPositions = new Map(
  (compactResult.states ?? compactSeed.states).map((s) => [s.id, s]),
);
compaction.steps = [
  {
    label: 'Breadth-first seed',
    points: [],
    note: 'A radial seed from Lexica’s breadth-first placement. The solver still needs to compare its clearance and cost with other candidates.',
  },
  {
    label: 'Feasible result',
    points: [],
    note: 'The feasible radial solver’s result for the same graph, after candidate selection and constrained compaction. Both views use one uniform scale per drawing.',
  },
];
const compactFrames = fit([
  ...compactSeed.states.map((s) => ({
    x: s.x - compactSeed.states[0].x,
    y: s.y - compactSeed.states[0].y,
  })),
  ...compaction.nodes.map((id) => ({
    x: compactPositions.get(id).x - compactPositions.get('S').x,
    y: compactPositions.get(id).y - compactPositions.get('S').y,
  })),
]);
compaction.steps.forEach((step, i) => {
  step.points = compactFrames.slice(i * compaction.nodes.length, (i + 1) * compaction.nodes.length);
});
compaction.steps[1].note =
  'The selected candidate has been compacted under clearance constraints. Shorter links reduce its cost while state and link separation remain above the required limits.';

const routed = model(routing);
routed.routingPolicy = 'corridor';
routed.states.forEach((s, i) => Object.assign(s, { x: i * 280, y: 0 }));
const curves = routeEdges(routed, () => '');
const allPoints = [...routed.states, ...curves.flatMap((r) => [r.p0, r.c1, r.c2, r.p3])];
const minX = Math.min(...allPoints.map((p) => p.x));
const maxX = Math.max(...allPoints.map((p) => p.x));
const minY = Math.min(...allPoints.map((p) => p.y));
const maxY = Math.max(...allPoints.map((p) => p.y));
const routeScale = Math.min(500 / (maxX - minX), 180 / (maxY - minY));
const project = (p) => [
  300 + (p.x - (minX + maxX) / 2) * routeScale,
  124 + (p.y - (minY + maxY) / 2) * routeScale,
];
routing.steps = [
  {
    label: 'Skeleton',
    points: routed.states.map(project),
    note: 'The opposing A–B arrows and the loop are visible, but they still need the production router’s separated ports and lanes.',
  },
  {
    label: 'Routed transitions',
    points: routed.states.map(project),
    routes: curves.map(
      (r) =>
        `M ${project(r.p0).join(' ')} C ${project(r.c1).join(' ')} ${project(r.c2).join(' ')} ${project(r.p3).join(' ')}`,
    ),
    note: 'Opposing transitions use separate lanes and attachment points. The loop occupies a free sector around A.',
  },
];

const groupTree = tidyTree(model(groups));
groups.steps[0].points = fit(groupTree.states);
const overview = tidyTree({
  start: 'S',
  states: ['S', 'Letter', 'D'].map((id) => ({ id })),
  edges: [
    { from: 'S', to: 'Letter' },
    { from: 'S', to: 'D' },
  ],
});
const overviewPoints = fit(overview.states);
groups.steps[1].points = [
  overviewPoints[0],
  overviewPoints[1],
  overviewPoints[1],
  overviewPoints[1],
  overviewPoints[2],
];
const interior = tidyTree({
  start: 'S',
  states: ['S', 'A', 'B', 'C'].map((id) => ({ id })),
  edges: [
    { from: 'S', to: 'A' },
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C' },
  ],
});
groups.steps[2].points = [...fit(interior.states), [300, 124]];
groups.steps = [groups.steps[0], groups.steps[2], groups.steps[1]];

function proposalExample(nodes, edges, points, chunk, labels, notes) {
  const graph = {
    states: nodes.map((id, i) => ({ id, x: points[i][0], y: points[i][1] })),
    edges: edges.map(([a, b]) => ({ from: nodes[a], to: nodes[b], label: '' })),
  };
  const map = new Map(graph.states.map((s) => [s.id, s]));
  const proposal = cycleProposals(cycleAnalysis(graph), map, [new Set(chunk)])[0];
  return {
    nodes,
    edges,
    steps: [
      { label: labels[0], points, note: notes[0] },
      {
        label: labels[1],
        points: nodes.map((id, i) => {
          const p = proposal?.targets.get(id);
          return p ? [p.x, p.y] : points[i];
        }),
        note: notes[1],
      },
    ],
  };
}

export const exteriorSwing = proposalExample(
  ['S', 'A', 'B', 'C', 'D'],
  [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
  ],
  [
    [160, 124],
    [300, 35],
    [440, 124],
    [300, 213],
    [255, 124],
  ],
  ['D'],
  ['Find the enclosed branch', 'Propose an exterior swing'],
  [
    'D is attached only at S and lies inside the cycle. A point-in-polygon test detects the enclosure.',
    'D swings around S toward the outside of the cycle. Clearance and complete route checks decide whether this proposal can be kept.',
  ],
);
export const directionalFlow = proposalExample(
  ['I', 'S', 'O'],
  [
    [0, 1],
    [1, 2],
  ],
  [
    [170, 65],
    [300, 124],
    [180, 190],
  ],
  ['O'],
  ['Measure the directions', 'Propose opposite flow'],
  [
    'The incoming neighbor I and outgoing neighbor O occupy nearly the same side of S. Their average direction vectors have a positive dot product.',
    'O moves opposite the incoming direction while preserving its distance from S. The translated outgoing piece keeps its internal shape.',
  ],
);

export const cycleBalance = proposalExample(
  ['S', 'A', 'B', 'C'],
  [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ],
  [
    [180, 124],
    [275, 75],
    [480, 124],
    [285, 190],
  ],
  [],
  ['Uneven cycle', 'Regular polygon proposal'],
  [
    'A clear cycle has uneven side lengths.',
    'The cycle vertices lie on a regular polygon with equal sides. Clearance and route verification decide whether this proposal can be kept.',
  ],
);
const cycleFrames = fit(
  cycleBalance.steps.flatMap((step) => step.points.map(([x, y]) => ({ x, y }))),
);
cycleBalance.steps.forEach((step, i) => {
  step.points = cycleFrames.slice(
    i * cycleBalance.nodes.length,
    (i + 1) * cycleBalance.nodes.length,
  );
});
// These two views isolate component partitioning and packing, rather than
// suggesting that disconnected pieces influence each other's local solution.
export const components = {
  nodes: ['S', 'A', 'B', 'X', 'Y'],
  edges: [
    [0, 1],
    [1, 2],
    [3, 4],
  ],
  colors: [1, 1, 1, 2, 2],
  steps: [
    {
      points: [
        [90, 124],
        [230, 124],
        [370, 124],
        [230, 55],
        [370, 55],
      ],
      note: 'Two disconnected pieces share the same canvas.',
    },
    {
      points: [
        [70, 124],
        [210, 124],
        [350, 124],
        [430, 124],
        [570, 124],
      ],
      note: 'The components sit side by side in separate dashed boxes. Translation preserves the internal geometry of each component.',
    },
  ],
};

const identification = [
  [
    skeleton,
    [0, 1, 2, 3],
    'The highlighted S–A bundle contains two S → A arrows and one A → S arrow. The skeleton will merge them into one undirected link and omit the loop on B.',
  ],
  [
    branches,
    [0],
    'S is the shared attachment. Removing S separates the amber and green pieces, so their interiors can be placed independently.',
  ],
  [
    placement,
    [1, 2],
    'A and B have depth one. A has three descendant leaves; B has one. Their angular shares are therefore in a 3:1 ratio.',
  ],
  [
    treePlacement,
    [1, 4],
    'The colored contours mark each subtree’s occupied vertical span at each depth. The longer green branch extends into a column that the amber branch leaves empty.',
  ],
  [
    compaction,
    [1, 2, 3],
    'The highlighted amber branch contributes several links to the wire-length score. It can move as one piece while keeping its internal shape.',
  ],
  [
    groups,
    [1, 2, 3],
    'After removing S, A–B–C is a connected candidate branch. Its interior can become a separate placement problem.',
  ],
  [
    routing,
    [0, 1],
    'The opposing A–B arrows need distinct ports and lanes. The loop needs an empty angular sector around A.',
  ],
  [
    exteriorSwing,
    [4],
    'The point-in-polygon test places D inside the cycle, even though its only attachment to the cycle is S.',
  ],
  [
    directionalFlow,
    [0, 2],
    'Incoming I and outgoing O lie on nearly the same side of S. Their average direction vectors are poorly separated.',
  ],
  [
    cycleBalance,
    [0, 1, 2, 3],
    'The highlighted cycle has unequal side lengths. Their squared deviations from the mean contribute to the cycle penalty.',
  ],
  [
    components,
    [0, 1, 2],
    'Reachability through undirected links finds S–A–B as one piece. X–Y is a different piece.',
  ],
];
for (const [example, identify, note] of identification) {
  const first = example.steps[0];
  const last = example.steps.at(-1);
  example.steps = [
    { ...first, label: 'Original' },
    { ...first, label: 'Identify', identify, note },
    { ...last, label: 'Fix' },
  ];
}
skeleton.steps[1].identifyEdges = [0, 4, 6];
routing.steps[1].identifyEdges = [0, 1, 2];
cycleBalance.steps[1].identifyEdges = [0, 1, 2, 3];
treePlacement.steps[1].contours = [
  { x: 198, y: 37, width: 50, height: 50, tone: 'amber' },
  { x: 351, y: 3, width: 50, height: 118, tone: 'amber' },
  { x: 198, y: 158, width: 50, height: 50, tone: 'green' },
  { x: 351, y: 158, width: 50, height: 50, tone: 'green' },
  { x: 505, y: 158, width: 50, height: 50, tone: 'green' },
];
export const partition = {
  ...components,
  steps: [
    components.steps[0],
    components.steps[1],
    {
      ...components.steps[0],
      label: 'Partition',
      regions: [
        { members: [0, 1, 2], tone: 'amber' },
        { members: [3, 4], tone: 'green' },
      ],
      note: 'The graph is partitioned into {S, A, B} and {X, Y}. Each component occupies its own colored dashed box.',
    },
  ],
};
components.steps[1].identify = [0, 1, 2, 3, 4];
components.steps[2].regions = partition.steps[2].regions;
branches.steps[1].identify = [1, 2, 3, 4, 5, 6];

// Enlarge both comparisons with one transform so spacing stays readable and
// differences between frames remain meaningful.
for (const example of [branches, compaction]) {
  example.steps.forEach((step) => {
    step.points = step.points.map(([x, y]) => [300 + (x - 300) * 1.6, 124 + (y - 124) * 1.6]);
  });
}
const separated = [...branches.steps[0].points];
for (const [ids, centerX] of [
  [[1, 2, 3], 145],
  [[4, 5, 6], 455],
]) {
  const local = {
    start: branches.nodes[ids[0]],
    states: ids.map((i) => ({ id: branches.nodes[i] })),
    edges: branches.edges
      .filter(([a, b]) => ids.includes(a) && ids.includes(b))
      .map(([a, b]) => ({ from: branches.nodes[a], to: branches.nodes[b] })),
  };
  const seed = planarCoordinates(local);
  const points = local.states.map((s) => seed.positions.get(s.id));
  const left = Math.min(...points.map((p) => p.x));
  const right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const bottom = Math.max(...points.map((p) => p.y));
  const localScale = Math.min(160 / Math.max(1, right - left), 140 / Math.max(1, bottom - top));
  ids.forEach((id, i) => {
    separated[id] = [
      centerX + (points[i].x - (left + right) / 2) * localScale,
      124 + (points[i].y - (top + bottom) / 2) * localScale,
    ];
  });
}
branches.steps.splice(2, 0, {
  label: 'Place branches',
  points: separated,
  hidden: [0],
  regions: [
    { members: [1, 2, 3], tone: 'amber' },
    { members: [4, 5, 6], tone: 'green' },
  ],
  note: 'With S removed, each triangular branch gets its own planar drawing. The pieces can now be oriented and placed in separate sectors around the shared root.',
});
routing.viewBox = '0 0 600 248';
branches.steps.at(-1).points = branches.steps
  .at(-1)
  .points.map(([x, y]) => [300 - y + 124, 124 - x + 300]);

const ringOriginal = placement.steps[0];
const ringIdentify = placement.steps[1];
const ringFinal = placement.steps[2];
placement.steps = [
  ringOriginal,
  ringIdentify,
  {
    ...ringFinal,
    label: 'Allocate sectors',
    hidden: [1, 2, 3, 4, 5, 6],
    radii: [],
    note: 'S divides the circle in a 3:1 ratio. The amber sector spans 270° for A’s three leaves; the green sector spans 90° for B’s one leaf.',
  },
  {
    ...ringFinal,
    label: 'Place the first ring',
    hidden: [3, 4, 5, 6],
    radii: [radii[0]],
    note: 'A and B sit at the midpoints of their sectors on the first ring. The closest angular gap determines how large this ring must be.',
  },
  {
    ...ringFinal,
    label: 'Place the outer ring',
    note: 'A subdivides its 270° into three equal sectors for C, D, and E. B’s sector goes to F. The second radius leaves room between layers and between neighbors on the outer ring.',
  },
];

const corridorOriginal = routing.steps[0];
const corridorFinal = routing.steps[2];
const corridorTones = ['amber', 'green', 'neutral', 'neutral'];
routing.steps = [
  {
    ...corridorOriginal,
    bare: true,
    label: 'Placement links',
    note: 'Placement gives a single A–B link and a B–C link. The actual machine also has a B → A return transition and a loop on A.',
  },
  {
    ...corridorOriginal,
    bare: true,
    label: 'Assign attachment points',
    ports: curves
      .slice(0, 2)
      .flatMap((r, i) => [r.p0, r.p3].map((p) => ({ point: project(p), tone: corridorTones[i] }))),
    note: 'The amber pair marks the endpoints of A → B. The green pair marks B → A. Distinct attachment points keep the two transitions from sharing the same lane.',
  },
  {
    ...corridorFinal,
    label: 'Route the opposing lanes',
    hideEdges: [2],
    edgeTones: corridorTones,
    note: 'The amber A → B curve and green B → A curve take opposite sides of the link. Each curve joins its assigned attachment points and clears the other transitions.',
  },
  {
    ...corridorFinal,
    label: 'Place the loop',
    edgeTones: corridorTones,
    note: 'The loop on A occupies an empty angular sector, away from the incident lanes. A complete set of routes must pass the separation checks together.',
  },
];
