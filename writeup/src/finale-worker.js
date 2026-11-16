import { solveLayout } from '../../src/core/smart-layout.js';
import { routeEdges } from '../../src/core/layout.js';
import { graphView } from '../../src/core/groups.js';

const states = [{ id: 'S', x: 0, y: 0 }];
const edges = [];
for (let branch = 0; branch < 3; branch++) {
  const ids = Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + branch) + i);
  states.push(
    ...ids.map((id, i) => ({
      id,
      x: [200, 450, 450, 200][i],
      y: (branch - 1) * 230 + [-70, -70, 70, 70][i],
    })),
  );
  edges.push(
    { from: 'S', to: ids[0] },
    ...ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
    { from: ids[3], to: ids[0] },
    { from: ids[0], to: ids[2] },
  );
}
states.push(
  { id: 'L', x: 325, y: -230 },
  { id: 'X', x: 800, y: -70 },
  { id: 'Y', x: 1050, y: -70 },
  { id: 'Z', x: 925, y: 70 },
);
edges.push(
  { from: 'A0', to: 'A1' },
  { from: 'A1', to: 'A0' },
  { from: 'B1', to: 'B1' },
  { from: 'X', to: 'Y' },
  { from: 'Y', to: 'Z' },
  { from: 'Z', to: 'X' },
  { from: 'A0', to: 'L' },
);
const topology = {
  start: 'S',
  states,
  edges: edges.map((e) => ({ ...e, label: '' })),
  groups: [],
  comments: [],
};
const pack = (machine, routed = false) => {
  const view = graphView(machine);
  return {
    states: view.states.map(({ id, x, y, group }) => ({ id, x, y, group })),
    edges: view.edges.map(({ from, to }) => ({ from, to })),
    routes: routed ? routeEdges(view, () => '').map(({ d }) => d) : null,
  };
};
self.onmessage = ({ data }) => {
  try {
    const frames = [];
    const original = structuredClone(topology);
    frames.push({ phase: 'input', key: 'whole', graph: pack(original, true) });
    for (const key of ['main', 'island']) {
      const members = new Set(
        original.states
          .filter((s) => ['X', 'Y', 'Z'].includes(s.id) === (key === 'island'))
          .map((s) => s.id),
      );
      frames.push({
        phase: 'partition',
        key,
        graph: pack(
          {
            ...original,
            states: original.states.filter((s) => members.has(s.id)),
            edges: original.edges.filter((e) => members.has(e.from) && members.has(e.to)),
          },
          true,
        ),
      });
    }
    const result = solveLayout(
      topology,
      null,
      data,
      () => {},
      (phase, machine) => {
        frames.push({
          phase,
          key: machine.states.some((s) => s.id === 'S')
            ? phase === 'packing'
              ? 'whole'
              : 'main'
            : 'island',
          graph: pack(machine, phase === 'routing' || phase === 'alignment' || phase === 'packing'),
        });
      },
    );
    self.postMessage({ frames, groups: result.machine.groups.length });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
