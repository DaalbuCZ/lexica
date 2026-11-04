import dagre from '@dagrejs/dagre';
import { destination } from './portals.js';

/** Rank cyclic/shared branches together instead of treating them as unrelated subtrees. */
export function layeredLayout(machine, spacing = 0.75, reverse = false) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: 'LR',
    nodesep: Math.max(85, 140 * spacing),
    ranksep: Math.max(105, 180 * spacing),
    ranker: 'network-simplex',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const state of machine.states) graph.setNode(state.id, { width: 90, height: 90 });
  const edges = reverse ? machine.edges.toReversed() : machine.edges;
  edges.forEach((edge, index) => {
    let to;
    try {
      to = destination(machine, edge)?.id;
    } catch {
      return;
    }
    if (edge.from !== to && graph.hasNode(edge.from) && graph.hasNode(to))
      graph.setEdge(
        edge.from,
        to,
        { weight: 1, width: Math.min(260, (edge.label?.length ?? 0) * 7), height: 24 },
        String(index),
      );
  });
  dagre.layout(graph);
  for (const state of machine.states) {
    const point = graph.node(state.id);
    state.x = point.x;
    state.y = point.y;
  }
  return machine;
}
