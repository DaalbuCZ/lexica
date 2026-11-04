import { routeEdges } from './layout.js';
import { simpleTransitionLabel } from './editor-settings.js';
import { transitionLabel } from './labels.js';
import { visualMachine } from './start-views.js';

self.onmessage = ({ data }) => {
  try {
    const label = (edge) =>
      edge.originalIndices?.length > 1
        ? `${edge.originalIndices.length} transitions`
        : data.simple
          ? simpleTransitionLabel(edge)
          : transitionLabel(edge);
    self.postMessage({
      key: data.key,
      topology: data.topology,
      routes: routeEdges(data.machine, label),
      nodes: visualMachine(data.machine).states.map(({ id, x, y }) => [id, { x, y }]),
    });
  } catch {
    self.postMessage({ error: true });
  }
};
