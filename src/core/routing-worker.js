import { routeEdges } from './layout.js';
import { simpleTransitionLabel } from './editor-settings.js';
import { transitionLabel } from './labels.js';
import { visualMachine } from './start-views.js';
import { repairDraggedRoutes } from './incremental-layout.js';

let previous;
let current;

self.onmessage = ({ data }) => {
  try {
    if (data.machine) current = data.machine;
    else {
      if (!current) throw Error('Routing session has no baseline');
      const positions = new Map(data.patch.states.map((s) => [s.id, s]));
      for (const state of current.states)
        if (positions.has(state.id)) Object.assign(state, positions.get(state.id));
      current.comments = data.patch.comments;
      current.startViews = data.patch.startViews;
      data.machine = current;
    }
    const label = (edge) =>
      edge.originalIndices?.length > 1
        ? `${edge.originalIndices.length} transitions`
        : data.simple
          ? simpleTransitionLabel(edge)
          : transitionLabel(edge);
    const snapshot =
      previous?.topology === data.topology
        ? previous
        : data.snapshot
          ? {
              routes: data.snapshot.routes,
              nodes: new Map(data.snapshot.nodes),
              comments: data.snapshot.comments,
            }
          : null;
    const repair = snapshot
      ? repairDraggedRoutes(data.machine, label, snapshot)
      : { routes: routeEdges(data.machine, label), status: 'initial', dirty: [] };
    const nodes = visualMachine(data.machine).states.map(({ id, x, y }) => [id, { x, y }]);
    previous = {
      routes: repair.routes,
      nodes: new Map(nodes),
      topology: data.topology,
      comments: structuredClone(data.machine.comments ?? []),
    };
    self.postMessage({
      key: data.key,
      topology: data.topology,
      routes: repair.routes,
      status: repair.status,
      dirty: repair.dirty,
      nodes,
    });
  } catch {
    self.postMessage({ error: true });
  }
};
