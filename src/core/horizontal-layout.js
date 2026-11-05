import { drawingClearance } from './planar-layout.js';
import { routeEdges } from './layout.js';
import { validateRouteSeparation } from './layout-validation.js';
import { simpleTransitionLabel } from './editor-settings.js';
import { cycleAnalysis, cycleScore } from './cycle-aesthetics.js';

export function alignHorizontal(machine) {
  const states = machine.states.map((s) => ({ ...s })),
    nodes = new Map(states.map((s) => [s.id, s])),
    baseline = drawingClearance(states, machine.edges),
    motifs = cycleAnalysis(machine),
    motifCost = cycleScore(motifs, nodes);
  if (baseline.crossings) return states;
  let checked = 0;
  for (const e of machine.edges) {
    const a = nodes.get(e.from),
      b = nodes.get(e.to);
    if (!a || !b || a === b || e.portal != null) continue;
    const dx = Math.abs(a.x - b.x),
      dy = Math.abs(a.y - b.y);
    if (dx < 80 || dy < 1e-6 || dy > Math.min(48, dx * 0.15)) continue;
    for (const [move, target] of [
      [b, a],
      [a, b],
    ]) {
      if (move.id === machine.start || move.outside || move.group || checked >= 24) continue;
      const previous = move.y;
      move.y = target.y;
      const c = drawingClearance(states, machine.edges);
      if (
        c.node >= Math.min(160, baseline.node) - 1e-6 &&
        c.wire >= Math.min(65, baseline.wire) - 1e-6 &&
        !c.crossings &&
        cycleScore(motifs, nodes) <= motifCost + 1
      ) {
        checked++;
        const routes = routeEdges(
          { ...machine, states, comments: [] },
          simpleTransitionLabel,
          true,
        );
        if (validateRouteSeparation(routes, { maxDepth: 24, maxPairs: 512 }).status === 'clear')
          break;
      }
      move.y = previous;
    }
  }
  return states;
}
