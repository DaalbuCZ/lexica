import { placementPreview } from '../core/placement.js';
import { graphBounds } from '../core/canvas-graph.js';
import { editorSettings, simpleTransitionLabel } from '../core/editor-settings.js';
import { transitionLabel } from '../core/labels.js';
import { transitionError } from '../core/lexer.js';
import { routeEdges } from '../core/layout.js';
import { graphView, groupFor } from '../core/groups.js';
import { tokenColorClass } from '../core/token-colors.js';
import { visibleViewport, measureVisibleViewport } from './visible-viewport.js';
import { dragEdgeRoute, interactiveRoutes } from '../core/interactive-routes.js';
import { visualMachine } from '../core/start-views.js';
import { createLiveRouting } from './live-routing.js';
import { repairDraggedRoutes } from '../core/incremental-layout.js';
import { storeDrawingRoutes } from '../core/drawing-routes.js';
export function createCanvasRenderer(context) {
  const liveRouting = createLiveRouting(context);
  context.disposeRouting = () => {
    liveRouting.dispose();
    context.settleRoutes = null;
  };
  let mapScene = null;
  let shownCache = null;
  let routeSnapshot = null;
  context.settleRoutes = () => {
    if (!routeSnapshot || routeSnapshot.group !== context.openGroup) return;
    const shown = visualMachine(graphView(context.machine, context.openGroup)),
      baseLabel = editorSettings.simplified ? simpleTransitionLabel : transitionLabel,
      label = (e) =>
        e.originalIndices?.length > 1 ? `${e.originalIndices.length} transitions` : baseLabel(e);
    if (
      shown.edges.length !== routeSnapshot.routes.length ||
      !shown.states.every((s) => routeSnapshot.nodes.has(s.id))
    )
      return;
    const repair = repairDraggedRoutes(shown, label, routeSnapshot);
    storeDrawingRoutes(
      context.machine,
      shown,
      shown.edges.map(label),
      repair.routes,
      `${context.openGroup ?? 'main'}:${editorSettings.simplified}`,
    );
  };
  let overviewCache = null;
  let viewportMetrics, viewportVersion;
  let validationVersion = -1,
    invalidEdges = new Set();
  let paletteTheme,
    tokenStyle,
    tokenColors = new Map();
  function drawMap() {
    const view = context.view(),
      surface = context.overviewView ? context.overviewCanvas : context.elements.canvas;
    if (!viewportMetrics || viewportVersion !== context.viewportVersion) {
      viewportMetrics = measureVisibleViewport(surface);
      viewportVersion = context.viewportVersion;
    }
    const viewport = visibleViewport(view, surface, viewportMetrics);
    if (context.overviewView) {
      const offset = context.groupWindowOffset,
        left = viewport.x - offset.x,
        top = viewport.y - offset.y;
      context.graph.drawMap(
        {
          x: left,
          y: top,
          width: viewport.width,
          height: viewport.height,
        },
        mapScene ?? undefined,
      );
    } else context.graph.drawMap(viewport, mapScene ?? undefined);
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
  context.flushDraw = () => {
    if (context.disposed) return;
    if (context.drawFrame !== null) cancelAnimationFrame(context.drawFrame);
    context.drawFrame = null;
    draw();
    drawMap();
  };
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
    const theme = document.documentElement.dataset.theme;
    if (!tokenStyle || paletteTheme !== theme) {
      paletteTheme = theme;
      tokenStyle = getComputedStyle(document.documentElement);
      tokenColors = new Map();
    }
    if (validationVersion !== context.documentVersion) {
      validationVersion = context.documentVersion;
      invalidEdges = new Set(
        context.machine.edges.flatMap((edge, index) =>
          transitionError(context.machine, edge) ? [index] : [],
        ),
      );
    }
    const edgeEdit = context.edgeDrag?.moved ? context.edgeDrag : null;
    const portalEdit = context.portalDrag?.moved ? context.portalDrag : null;
    const manualEdit = edgeEdit ?? portalEdit;
    const dragging = context.drag?.moved || manualEdit;
    const routing = dragging ? interactiveRoutes : routeEdges;
    const sameTopology =
      shownCache?.version === context.documentVersion && shownCache.group === context.openGroup;
    const shown = sameTopology ? shownCache.machine : graphView(context.machine, context.openGroup);
    if (sameTopology && context.openGroup) {
      const positions = context.machine.groups.find(
        (group) => group.id === context.openGroup,
      )?.contextPositions;
      for (const state of shown.states)
        if (state.outside && positions?.[state.id]) Object.assign(state, positions[state.id]);
    }
    shownCache = { machine: shown, version: context.documentVersion, group: context.openGroup };
    const project = (id) => (context.openGroup ? id : (groupFor(context.machine, id)?.id ?? id)),
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
      hasError =
        invalidGraph ||
        context.graphFailures.states.length ||
        context.graphFailures.edges.length ||
        context.graphTrace?.token === 'ERROR',
      tokenColor = (name) => {
        if (hasError) return null;
        if (!tokenColors.has(name))
          tokenColors.set(
            name,
            tokenStyle.getPropertyValue('--token-accent-' + tokenColorClass(name).slice(-1)).trim(),
          );
        return tokenColors.get(name);
      },
      baseLabel = editorSettings.simplified ? simpleTransitionLabel : transitionLabel,
      label = (edge) =>
        edge.originalIndices?.length > 1
          ? `${edge.originalIndices.length} transitions`
          : baseLabel(edge),
      liveSnapshot =
        !manualEdit &&
        (dragging || routeSnapshot?.manualVersion !== context.documentVersion) &&
        editorSettings.rerouteWhileDragging &&
        (dragging || liveRouting.started)
          ? liveRouting.snapshot(shown, editorSettings.simplified, routeSnapshot)
          : null,
      shownRoutes =
        manualEdit && routeSnapshot
          ? routeSnapshot.routes.map((route, i) => {
              const edge = shown.edges[i];
              if ((edge.originalIndex ?? i) !== manualEdit.index) return route;
              if (edgeEdit) return dragEdgeRoute(edgeEdit);
              return interactiveRoutes(
                { ...shown, edges: [{ ...edge, portalOffset: portalEdit.item.portalOffset }] },
                label,
              )[0];
            })
          : !dragging && shown.drawingRoutes?.length
            ? routeEdges(shown, label)
            : liveSnapshot
              ? interactiveRoutes(shown, label, liveSnapshot)
              : dragging
                ? interactiveRoutes(shown, label, context.drag?.moved ? routeSnapshot : null)
                : editorSettings.rerouteWhileDragging &&
                    liveRouting.started &&
                    routeSnapshot?.group === context.openGroup
                  ? interactiveRoutes(shown, label, routeSnapshot)
                  : routeSnapshot?.version === context.documentVersion &&
                      routeSnapshot.group === context.openGroup &&
                      routeSnapshot.simple === editorSettings.simplified &&
                      visualMachine(shown).states.every((state) => {
                        const old = routeSnapshot.nodes.get(state.id);
                        return old?.x === state.x && old?.y === state.y;
                      })
                    ? routeSnapshot.routes
                    : routeEdges(shown, label);
    if (!dragging || manualEdit?.committing)
      routeSnapshot = {
        routes: shownRoutes,
        comments: structuredClone(shown.comments ?? []),
        version: context.documentVersion,
        group: context.openGroup,
        simple: editorSettings.simplified,
        manualVersion: manualEdit?.committing
          ? context.documentVersion
          : routeSnapshot?.manualVersion,
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
      const reuse =
          overviewCache &&
          (dragging ||
            (overviewCache.version === context.documentVersion &&
              overviewCache.simple === editorSettings.simplified)),
        overview = reuse ? overviewCache.machine : graphView(context.machine),
        overviewRoutes = reuse ? overviewCache.routes : routing(overview, label);
      overviewCache = {
        machine: overview,
        routes: overviewRoutes,
        version: context.documentVersion,
        simple: editorSettings.simplified,
      };
      context.overviewGraph.setView(context.overviewView);
      const panelMoved =
        (!manualEdit || manualEdit.committing) &&
        context.positionGroupPanel(
          overview.states.find((state) => state.id === context.openGroup),
          graphBounds(shown, shownRoutes),
        );
      if (!dragging || !reuse)
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
      mapScene = { machine: shown, routes: shownRoutes };
      if (panelMoved) context.syncGrid();
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
  }
  return {
    draw,
    drawMap,
    queueDraw,
    connectionPreviewPath,
  };
}
