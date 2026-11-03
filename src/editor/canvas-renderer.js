import { placementPreview } from '../core/placement.js';
import { graphBounds } from '../core/canvas-graph.js';
import { editorSettings, simpleTransitionLabel } from '../core/editor-settings.js';
import { transitionLabel } from '../core/labels.js';
import { transitionError } from '../core/lexer.js';
import { routeEdges } from '../core/layout.js';
import { graphView, groupFor } from '../core/groups.js';
import { tokenColorClass } from '../core/token-colors.js';
export function createCanvasRenderer(context) {
  function drawMap() {
    context.graph.drawMap();
  }
  function queueDraw() {
    if (context.disposed || context.drawFrame !== null) return;
    context.drawFrame = requestAnimationFrame(() => {
      context.drawFrame = null;
      if (context.disposed) return;
      draw();
      drawMap();
    });
  }
  function connectionPreviewPath(a, p) {
    if (Math.hypot(p.x - a.x, p.y - a.y) <= 36)
      return routeEdges({
        ...context.machine,
        edges: [
          ...context.machine.edges,
          {
            from: a.id,
            to: a.id,
            label: context.lastTransitionRule,
          },
        ],
      }).at(-1).d;
    return `M ${a.x} ${a.y} L ${p.x} ${p.y}`;
  }
  function draw() {
    const shown = graphView(context.machine, context.openGroup),
      project = (id) => (context.openGroup ? id : (groupFor(context.machine, id)?.id ?? id)),
      failedGroups = new Set(),
      markGroup = (id) => {
        const group = groupFor(context.machine, id);
        if (group) failedGroups.add(group.id);
      },
      failureEdges = new Set(context.graphFailures.edges),
      traceErrorEdges = new Set(
        context.graphTrace?.token === 'ERROR' ? (context.graphTrace.traceEdges ?? []) : [],
      );
    let invalidGraph = false;
    for (const id of context.graphFailures.states) markGroup(id);
    if (context.graphTrace?.token === 'ERROR')
      for (const id of context.graphTrace.traceStates ?? []) markGroup(id);
    context.machine.edges.forEach((edge, index) => {
      const invalid = !!transitionError(context.machine, edge);
      invalidGraph ||= invalid;
      if (invalid || failureEdges.has(index) || traceErrorEdges.has(index)) {
        markGroup(edge.from);
        markGroup(edge.to);
      }
    });
    const trace = context.graphTrace
        ? {
            ...context.graphTrace,
            state: project(context.graphTrace.state),
            traceStates: context.graphTrace.traceStates?.map(project),
          }
        : null,
      failures = {
        states: [...context.graphFailures.states, ...failedGroups].map(project),
        edges: context.graphFailures.edges,
      },
      tokenStyle = getComputedStyle(document.documentElement),
      hasError =
        invalidGraph ||
        context.graphFailures.states.length ||
        context.graphFailures.edges.length ||
        context.graphTrace?.token === 'ERROR',
      tokenColor = (name) =>
        hasError
          ? null
          : tokenStyle.getPropertyValue('--token-accent-' + tokenColorClass(name).slice(-1)).trim(),
      baseLabel = editorSettings.simplified ? simpleTransitionLabel : transitionLabel,
      label = (edge) =>
        edge.originalIndices?.length > 1
          ? `${edge.originalIndices.length} transitions`
          : baseLabel(edge),
      shownRoutes = routeEdges(shown, label);
    if (context.overviewView) {
      const overview = graphView(context.machine);
      context.overviewGraph.setView(context.overviewView);
      context.positionGroupPanel(
        overview.states.find((state) => state.id === context.openGroup),
        graphBounds(shown, shownRoutes),
      );
      context.overviewGraph.draw({
        machine: overview,
        routes: routeEdges(overview, label),
        label,
        tokenColor,
        selectedStates: new Set(),
        selectedComments: new Set(),
        selectedCommentLinks: new Set(),
        edgeSelected: () => false,
        failures: {
          states: [...failedGroups],
          edges: context.graphFailures.edges,
        },
      });
    }
    context.graph.draw({
      machine: shown,
      routes: shownRoutes,
      tokenColor,
      selectedStates: context.selectedStates,
      selectedComments: context.selectedComments,
      selectedCommentLinks: context.selectedCommentLinks,
      edgeSelected: (e, i) => context.edgeSelected(e, e.originalIndex ?? i),
      source: context.source,
      commentSource: context.commentSource,
      connectPoint: context.connectPoint,
      previewPath:
        context.source && context.connectPoint
          ? connectionPreviewPath(
              context.machine.states.find((s) => s.id === context.source),
              context.connectPoint,
            )
          : null,
      marquee: context.marquee,
      trace,
      failures,
      label,
      placement: placementPreview(
        context.machine,
        context.placingState ? 'state' : context.placingComment ? 'comment' : null,
        context.placementPoint,
      ),
    });
    if (context.overviewView) context.syncGrid();
  }
  return {
    draw,
    drawMap,
    queueDraw,
    connectionPreviewPath,
  };
}
