import { placementPreview } from '../core/placement.js';
import { graphBounds } from '../core/canvas-graph.js';
import { editorSettings, simpleTransitionLabel } from '../core/editor-settings.js';
import { transitionLabel } from '../core/labels.js';
import { transitionError } from '../core/lexer.js';
import { routeEdges } from '../core/layout.js';
import { graphView, groupFor } from '../core/groups.js';
import { tokenColorClass } from '../core/token-colors.js';
import { visibleViewport } from './visible-viewport.js';
import { interactiveRoutes } from '../core/interactive-routes.js';
import { visualMachine } from '../core/start-views.js';
export function createCanvasRenderer(context) {
  let mapScene = null;
  let routeSnapshot = null;
  let overviewCache = null,
    mapDrawTime = 0;
  let validationVersion = -1,
    invalidEdges = new Set();
  function drawMap() {
    const now = performance.now();
    if (context.drag?.moved && now - mapDrawTime < 80) return;
    mapDrawTime = now;
    const view = context.view(),
      surface = context.overviewView ? context.overviewCanvas : context.elements.canvas;
    (context.overviewView ? context.overviewGraph : context.graph).drawMap(
      visibleViewport(view, surface),
      mapScene ?? undefined,
    );
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
    if (validationVersion !== context.documentVersion) {
      validationVersion = context.documentVersion;
      invalidEdges = new Set(
        context.machine.edges.flatMap((edge, index) =>
          transitionError(context.machine, edge) ? [index] : [],
        ),
      );
    }
    const dragging = context.drag?.moved || context.edgeDrag?.moved || context.portalDrag?.moved;
    const routing = dragging ? interactiveRoutes : routeEdges;
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
      const invalid = invalidEdges.has(index);
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
      shownRoutes = dragging
        ? interactiveRoutes(shown, label, context.drag?.moved ? routeSnapshot : null)
        : routeEdges(shown, label);
    if (!dragging)
      routeSnapshot = {
        routes: shownRoutes,
        nodes: new Map(
          visualMachine(shown).states.map((state) => [state.id, { x: state.x, y: state.y }]),
        ),
      };
    if (context.openGroup) {
      const group = context.machine.groups.find((group) => group.id === context.openGroup);
      if (group) {
        group.contextPositions ??= Object.create(null);
        for (const state of shown.states)
          if (state.outside && !Object.hasOwn(group.contextPositions, state.id))
            Object.defineProperty(group.contextPositions, state.id, {
              value: { x: state.x, y: state.y },
              writable: true,
              enumerable: true,
              configurable: true,
            });
      }
    }
    if (context.overviewView) {
      const reuse = dragging && overviewCache,
        overview = reuse ? overviewCache.machine : graphView(context.machine),
        overviewRoutes = reuse ? overviewCache.routes : routing(overview, label);
      overviewCache = { machine: overview, routes: overviewRoutes };
      context.overviewGraph.setView(context.overviewView);
      context.positionGroupPanel(
        overview.states.find((state) => state.id === context.openGroup),
        graphBounds(shown, shownRoutes),
      );
      if (!reuse)
        context.overviewGraph.draw({
          machine: overview,
          routes: overviewRoutes,
          invalidEdges,
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
      const offset = context.groupWindowOffset,
        move = (point) => ({ ...point, x: point.x + offset.x, y: point.y + offset.y });
      mapScene = {
        machine: {
          states: [...overview.states, ...shown.states.map(move)],
          edges: [],
          comments: [...(overview.comments ?? []), ...(shown.comments ?? []).map(move)],
        },
        routes: [
          ...overviewRoutes,
          ...shownRoutes.map((route) => ({
            ...route,
            p0: move(route.p0),
            p3: move(route.p3),
            c1: move(route.c1),
            c2: move(route.c2),
            label: move(route.label),
            portalBox: route.portalBox ? move(route.portalBox) : undefined,
          })),
        ],
      };
    } else mapScene = { machine: shown, routes: shownRoutes };
    context.graph.draw({
      machine: shown,
      routes: shownRoutes,
      invalidEdges,
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
