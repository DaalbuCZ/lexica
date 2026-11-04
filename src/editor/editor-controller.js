import { createCanvasRenderer } from './canvas-renderer.js';
import { createViewport } from './viewport.js';
import { createGroupNavigation } from './group-navigation.js';
import { createCanvasInteractions } from './canvas-interactions.js';
import { createGraphCanvas } from '../core/canvas-graph.js';
import { insertState } from '../core/transitions.js';
import {
  makeComment,
  commentAnchors,
  commentNodeIds,
  commentLinks,
  commentLinkKey,
  connectCommentNode,
  removeCommentLinks,
} from '../core/comments.js';
import { copySelection, pasteSelection } from '../core/selection.js';
import { validate, isAccepting, setAccepting } from '../core/lexer.js';
import { createGroup, dissolveGroup, graphView } from '../core/groups.js';
import { listenScope } from './events.js';
export function createEditorController(
  elements,
  { initialMachine, onChange, onUI, onDialog, notify, getTester, onRestoreTester },
) {
  const context = {};
  context.elements = elements;
  context.onUI = onUI;
  context.onDialog = onDialog;
  context.save = save;
  context.changed = changed;
  context.render = render;
  context.clearSelection = clearSelection;
  context.selectionSet = selectionSet;
  context.primaryFromSelection = primaryFromSelection;
  context.choose = choose;
  context.edgeSelected = edgeSelected;
  context.addComment = addComment;
  context.checkpoint = checkpoint;
  context.point = point;
  context.markSelection = markSelection;
  context.cancelConnect = cancelConnect;
  context.connectTo = connectTo;
  context.insertBetween = insertBetween;
  context.connectComment = connectComment;
  context.add = add;
  const scope = listenScope();
  context.scope = scope;
  const listen = scope.listen;
  context.listen = listen;
  const $ = (id) => document.getElementById(id);
  context.$ = $;
  context.documentVersion = 0;
  context.machine = initialMachine;
  context.selection = {
    type: 'none',
  };
  context.source = null;
  context.history = [];
  context.future = [];
  context.sourceStartView = null;
  context.selectedStates = new Set();
  context.selectedEdges = new Set();
  context.selectedComments = new Set();
  context.selectedCommentLinks = new Set();
  context.toolMode = 'pan';
  context.marquee = null;
  context.clipboardText = '';
  context.pasteCount = 0;
  context.lastTransitionRule = '';
  context.openGroup = null;
  context.overviewView = null;
  context.groupPanelBounds = null;
  context.groupPanelBoundsId = null;
  context.groupPanelSize = null;
  context.groupPanelViewInitialized = false;
  context.commentCursor = null;
  context.placingComment = false;
  context.placingState = false;
  context.placementPoint = null;
  context.commentSource = null;
  context.graphTrace = null;
  context.graphFailures = {
    states: [],
    edges: [],
  };
  context.drag = null;
  context.edgeDrag = null;
  context.portalDrag = null;
  context.pan = null;
  context.space = false;
  context.connectPoint = null;
  context.rightStart = null;
  context.propertiesFrame = null;
  context.propertiesEvent = null;
  context.drawFrame = null;
  context.disposed = false;
  context.mapDragging = false;
  context.mapTransform = null;
  context.outsideGroupPress = null;
  const canvasWrap = elements.wrap,
    groupBar = elements.breadcrumbs,
    groupPanel = elements.groupPanel,
    overviewCanvas = elements.overview,
    portalPreview = elements.portalPreview;
  context.canvasWrap = canvasWrap;
  context.groupBar = groupBar;
  context.groupPanel = groupPanel;
  context.overviewCanvas = overviewCanvas;
  context.portalPreview = portalPreview;
  const graph = createGraphCanvas(elements.canvas, elements.minimap),
    overviewGraph = createGraphCanvas(overviewCanvas, elements.minimap);
  context.graph = graph;
  context.overviewGraph = overviewGraph;
  context.canvasSize = {
    width: elements.canvas.clientWidth,
    height: elements.canvas.clientHeight,
  };
  const { draw, drawMap, queueDraw } = createCanvasRenderer(context);
  context.draw = draw;
  context.queueDraw = queueDraw;
  const {
    positionGroupPanel,
    showProperties,
    view,
    syncGrid,
    setView,
    fit,
    zoom,
    wheelGraph,
    resizeCanvas,
    setOverviewView,
    navigateMap,
  } = createViewport(context);
  context.positionGroupPanel = positionGroupPanel;
  context.showProperties = showProperties;
  context.view = view;
  context.syncGrid = syncGrid;
  context.setView = setView;
  context.fit = fit;
  context.wheelGraph = wheelGraph;
  context.resizeCanvas = resizeCanvas;
  context.setOverviewView = setOverviewView;
  context.navigateMap = navigateMap;
  const {
    syncGroupPresentation,
    closeGroup,
    openGroupById,
    renameGroup,
    makeGroup,
    showGroupSelectionMenu,
    moveSelectedStateToGroup,
    connectToGroup,
    chooseCombinedTransition,
  } = createGroupNavigation(context);
  context.closeGroup = closeGroup;
  context.openGroupById = openGroupById;
  context.makeGroup = makeGroup;
  context.showGroupSelectionMenu = showGroupSelectionMenu;
  context.connectToGroup = connectToGroup;
  context.chooseCombinedTransition = chooseCombinedTransition;
  const { install: installInteractions } = createCanvasInteractions(context);
  const toast = notify;
  context.toast = toast;
  const properties = () => publish();
  context.properties = properties;
  function publish() {
    if (!context.disposed)
      onChange({
        machine: context.machine,
        version: context.documentVersion,
        selection: {
          ...context.selection,
        },
        selectedStates: new Set(context.selectedStates),
        selectedEdges: new Set(context.selectedEdges),
        selectedComments: new Set(context.selectedComments),
        selectedCommentLinks: new Set(context.selectedCommentLinks),
        openGroup: context.openGroup,
        canUndo: !!context.history.length,
        canRedo: !!context.future.length,
        tool: context.toolMode,
      });
  }
  function save() {
    context.documentVersion++;
    publish();
  }
  function changed() {
    context.documentVersion++;
    pruneSelection();
    render();
  }
  function render() {
    if (context.disposed) return;
    commentAnchors(context.machine);
    pruneSelection();
    syncGroupPresentation();
    draw();
    drawMap();
    publish();
  }
  function clearSelection() {
    context.selectedStates.clear();
    context.selectedEdges.clear();
    context.selectedComments.clear();
    context.selectedCommentLinks.clear();
    context.selection = {
      type: 'none',
    };
  }
  function selectionSet(type) {
    return type === 'state'
      ? context.selectedStates
      : type === 'edge'
        ? context.selectedEdges
        : type === 'comment-link'
          ? context.selectedCommentLinks
          : context.selectedComments;
  }
  function primaryFromSelection() {
    if (context.selectedStates.size)
      context.selection = {
        type: 'state',
        id: [...context.selectedStates][0],
      };
    else if (context.selectedComments.size)
      context.selection = {
        type: 'comment',
        id: [...context.selectedComments][0],
      };
    else if (context.selectedEdges.size)
      context.selection = {
        type: 'edge',
        index: [...context.selectedEdges][0],
      };
    else if (context.selectedCommentLinks.size)
      context.selection = {
        type: 'comment-link',
        id: [...context.selectedCommentLinks][0],
      };
    else
      context.selection = {
        type: 'none',
      };
  }
  function choose(type, key, { toggle = false, keep = false } = {}) {
    const set = selectionSet(type),
      had = set.has(key);
    if (!toggle && !keep) clearSelection();
    if (toggle && had) set.delete(key);
    else set.add(key);
    context.selection =
      type === 'edge'
        ? {
            type,
            index: key,
          }
        : {
            type,
            id: key,
          };
    if (!set.has(key)) primaryFromSelection();
  }
  function edgeSelected(e, i) {
    return (
      context.selectedEdges.has(i) ||
      (context.selectedStates.has(e.from) && (e.portal != null || context.selectedStates.has(e.to)))
    );
  }
  function pruneSelection() {
    if (context.machine.startViews) {
      const ids = new Set(context.machine.states.map((s) => s.id));
      context.machine.startViews = context.machine.startViews
        .map((v) => ({
          ...v,
          targets: v.targets.filter((id) => ids.has(id)),
        }))
        .filter((v) => v.targets.length);
      if (!ids.has(context.machine.start)) delete context.machine.startViews;
    }
    const links = new Set(
      (context.machine.comments ?? []).flatMap((c) =>
        commentNodeIds(c).map((id) => commentLinkKey(c.id, id)),
      ),
    );
    context.selectedCommentLinks = new Set(
      [...context.selectedCommentLinks].filter((key) => links.has(key)),
    );
    context.selectedStates = new Set(
      [...context.selectedStates].filter((id) => context.machine.states.some((s) => s.id === id)),
    );
    context.selectedEdges = new Set(
      [...context.selectedEdges].filter((i) => context.machine.edges[i]),
    );
    context.selectedComments = new Set(
      [...context.selectedComments].filter((id) =>
        (context.machine.comments ?? []).some((c) => c.id === id),
      ),
    );
    if (
      context.selection.type === 'none' ||
      !selectionSet(context.selection.type).has(
        context.selection.type === 'edge' ? context.selection.index : context.selection.id,
      )
    )
      primaryFromSelection();
  }
  function setTool(mode) {
    context.toolMode = mode;
    document.body.classList.toggle('selecting-mode', mode === 'select');
    publish();
  }
  function beginPlacement(type) {
    cancelConnect();
    context.placingState = type === 'state';
    context.placingComment = type === 'comment';
    showProperties(false);
    document.body.classList.add('placing-' + type);
    $('modehint').textContent = 'Click to place a ' + type + ' · Esc to cancel';
    $('canvas').focus({
      preventScroll: true,
    });
  }
  function beginComment() {
    beginPlacement('comment');
  }
  function addComment(position) {
    if (!position) {
      beginComment();
      return;
    }
    context.placingComment = false;
    context.placementPoint = null;
    document.body.classList.remove('placing-comment');
    const c = makeComment(context.machine, position);
    if (context.openGroup) {
      const members =
          context.machine.groups.find((g) => g.id === context.openGroup)?.stateIds ?? [],
        state = context.machine.states
          .filter((s) => members.includes(s.id))
          .sort(
            (a, b) =>
              Math.hypot(a.x - position.x, a.y - position.y) -
              Math.hypot(b.x - position.x, b.y - position.y),
          )[0];
      c.nodeIds = state ? [state.id] : [];
    }
    checkpoint();
    (context.machine.comments ??= []).push(c);
    choose('comment', c.id);
    cancelConnect();
    changed();
    showProperties(true);
    requestAnimationFrame(() => {
      $('comment-text')?.focus();
      $('comment-text')?.select();
    });
  }
  async function copyItems(cut = false) {
    const fragment = copySelection(
      context.machine,
      context.selectedStates,
      context.selectedEdges,
      context.selectedComments,
      context.selectedCommentLinks,
    );
    if (!fragment.states.length && !fragment.edges.length && !fragment.comments.length) return;
    context.clipboardText = JSON.stringify(fragment);
    context.pasteCount = 0;
    // Capture and cut synchronously: clipboard permission prompts can outlive a selection.
    if (cut) remove();
    try {
      await navigator.clipboard.writeText(context.clipboardText);
      toast(cut ? 'Selection cut.' : 'Selection copied.');
    } catch {
      toast('Copied inside this editor.');
    }
  }
  async function pasteItems() {
    let text = context.clipboardText;
    try {
      text = (await navigator.clipboard.readText()) || text;
    } catch {}
    if (context.disposed) return;
    try {
      if (text.length > 1000000) throw Error('Clipboard selection is too large.');
      if (text !== context.clipboardText) context.pasteCount = 0;
      const next = structuredClone(context.machine),
        result = pasteSelection(next, JSON.parse(text), {
          x: 40 * (context.pasteCount + 1),
          y: 40 * (context.pasteCount + 1),
        });
      if (context.openGroup)
        next.groups
          ?.find((group) => group.id === context.openGroup)
          ?.stateIds.push(...result.states);
      context.clipboardText = text;
      checkpoint();
      context.machine = next;
      context.selectedStates = result.states;
      context.selectedEdges = result.edges;
      context.selectedComments = result.comments;
      context.selectedCommentLinks.clear();
      primaryFromSelection();
      context.pasteCount++;
      showProperties(false);
      changed();
    } catch (error) {
      toast(error.message);
    }
  }
  function checkpoint() {
    context.editGroup = null;
    context.history.push(
      JSON.stringify({
        ...context.machine,
        tester: getTester(),
      }),
    );
    if (context.history.length > 80) context.history.shift();
    context.future = [];
  }
  function remove() {
    if (
      !context.selectedStates.size &&
      !context.selectedEdges.size &&
      !context.selectedComments.size &&
      !context.selectedCommentLinks.size
    )
      return;
    checkpoint();
    removeCommentLinks(context.machine, context.selectedCommentLinks);
    context.machine.states = context.machine.states.filter(
      (s) => !context.selectedStates.has(s.id),
    );
    context.machine.edges = context.machine.edges.filter(
      (e, i) =>
        !context.selectedEdges.has(i) &&
        !context.selectedStates.has(e.from) &&
        (e.portal != null || !context.selectedStates.has(e.to)),
    );
    context.machine.comments = (context.machine.comments ?? []).filter(
      (c) => !context.selectedComments.has(c.id),
    );
    context.machine.groups = (context.machine.groups ?? [])
      .map((g) => ({
        ...g,
        stateIds: g.stateIds.filter((id) => !context.selectedStates.has(id)),
      }))
      .filter((g) => g.stateIds.length);
    for (const c of context.machine.comments) {
      c.nodeIds = commentNodeIds(c).filter((id) => !context.selectedStates.has(id));
      delete c.nodeId;
    }
    if (context.selectedComments.has(context.commentSource)) context.commentSource = null;
    if (context.selectedStates.has(context.machine.start)) context.machine.start = null;
    if (context.selectedStates.has(context.source)) {
      context.source = null;
      context.connectPoint = null;
    }
    clearSelection();
    showProperties(false);
    changed();
  }
  function point(e) {
    return graph.point(e);
  }
  function markSelection() {
    draw();
    publish();
  }
  function cancelConnect() {
    context.sourceStartView = null;
    context.commentSource = null;
    context.placingComment = false;
    context.placingState = false;
    context.placementPoint = null;
    document.body.classList.remove('placing-comment', 'placing-state');
    context.source = null;
    context.connectPoint = null;
    context.rightStart = null;
    $('modehint').textContent = '';
    draw();
  }
  function connectTo(id) {
    checkpoint();
    context.machine.edges.push({
      from: context.source,
      to: id,
      label: context.source === id ? context.lastTransitionRule : '',
    });
    choose('edge', context.machine.edges.length - 1);
    context.source = null;
    context.connectPoint = null;
    context.rightStart = null;
    $('modehint').textContent = '';
    changed();
    showProperties(true);
    const input = $('edge-label') ?? $('simple-characters');
    input?.focus();
    input?.select();
  }
  function insertBetween(to, position) {
    checkpoint();
    const state = insertState(context.machine, context.source, to, position);
    context.source = null;
    context.connectPoint = null;
    context.rightStart = null;
    $('modehint').textContent = '';
    choose('state', state.id);
    changed();
    if (to == null) {
      context.source = state.id;
      context.connectPoint = {
        x: state.x,
        y: state.y,
      };
      $('modehint').textContent =
        'Click the next destination · Ctrl-drag to insert another state · Esc to finish';
      draw();
    } else {
      showProperties(true);
    }
  }
  function connectComment(commentId, nodeId) {
    checkpoint();
    connectCommentNode(context.machine, commentId, nodeId);
    cancelConnect();
    choose('comment-link', commentLinkKey(commentId, nodeId));
    changed();
    showProperties(true);
  }
  function add(x, y, from = null) {
    const v = view();
    checkpoint();
    const id = crypto.randomUUID();
    context.machine.states.push({
      id,
      name: 'q' + context.machine.states.length,
      token: '',
      x: x ?? v.x + v.width / 2,
      y: y ?? v.y + v.height / 2,
    });
    if (context.openGroup)
      context.machine.groups.find((g) => g.id === context.openGroup)?.stateIds.push(id);
    if (from !== null)
      context.machine.edges.push({
        from,
        to: id,
        label: '',
      });
    if (
      from === context.machine.start &&
      context.sourceStartView !== null &&
      context.machine.startViews?.[context.sourceStartView]
    )
      context.machine.startViews[context.sourceStartView].targets.push(id);
    context.sourceStartView = null;
    context.source = null;
    context.commentSource = null;
    context.connectPoint = null;
    $('modehint').textContent = '';
    choose('state', id);
    changed();
    showProperties(true);
  }
  installInteractions();
  const observer = new ResizeObserver(() => {
    resizeCanvas();
    queueDraw();
  });
  observer.observe(elements.canvas);
  observer.observe(canvasWrap);
  const testerPanel = document.querySelector('.tester');
  if (testerPanel) observer.observe(testerPanel);
  const themeObserver = new MutationObserver(() => queueDraw());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  document.fonts.ready.then(() => {
    if (!context.disposed) queueDraw();
  });
  render();
  const firstFrame = requestAnimationFrame(fit);
  function update(change, { historyKey = null } = {}) {
    const next = structuredClone(context.machine);
    try {
      change(next);
      validate(next);
    } catch (error) {
      toast(error.message);
      publish();
      return false;
    }
    if (!historyKey || historyKey !== context.editGroup) checkpoint();
    context.editGroup = historyKey;
    context.machine = next;
    changed();
    return true;
  }
  function undo() {
    if (!context.history.length) return;
    cancelConnect();
    context.future.push(
      JSON.stringify({
        ...context.machine,
        tester: getTester(),
      }),
    );
    context.machine = JSON.parse(context.history.pop());
    onRestoreTester(context.machine.tester);
    clearSelection();
    showProperties(false);
    changed();
  }
  function redo() {
    if (!context.future.length) return;
    cancelConnect();
    context.history.push(
      JSON.stringify({
        ...context.machine,
        tester: getTester(),
      }),
    );
    context.machine = JSON.parse(context.future.pop());
    onRestoreTester(context.machine.tester);
    clearSelection();
    showProperties(false);
    changed();
  }
  return {
    getMachine: () => context.machine,
    update,
    undo,
    redo,
    fit,
    zoom,
    setTool,
    makeGroup,
    moveSelectedStateToGroup,
    renameGroup,
    openGroup: openGroupById,
    closeGroup,
    remove,
    copy: copyItems,
    paste: pasteItems,
    cancel: () => {
      cancelConnect();
      showProperties(false);
    },
    place: beginPlacement,
    showProperties,
    select(type, id) {
      choose(type, id);
      render();
      showProperties(true);
    },
    selectAll() {
      const shown = graphView(context.machine, context.openGroup);
      context.selectedStates = new Set(
        shown.states.filter((s) => !s.group && !s.outside).map((s) => s.id),
      );
      context.selectedEdges = new Set(shown.edges.map((e, i) => e.originalIndex ?? i));
      context.selectedComments = new Set((shown.comments ?? []).map((c) => c.id));
      context.selectedCommentLinks = new Set(
        commentLinks(shown).map((l) => commentLinkKey(l.commentId, l.nodeId)),
      );
      primaryFromSelection();
      render();
    },
    space(pressed) {
      context.space = pressed;
      document.body.classList.toggle('pan-ready', pressed);
    },
    refresh: render,
    setTrace(trace, failures) {
      context.graphTrace = trace;
      if (failures) context.graphFailures = failures;
      if (trace?.kind) {
        const id = trace.state ?? trace.traceStates?.at(-1),
          group = context.machine.groups?.find((g) => g.stateIds.includes(id));
        if (group && group.id !== context.openGroup) openGroupById(group.id, false);
        else if (id && !group && context.openGroup) closeGroup(true, false);
      }
      queueDraw();
    },
    replace(next) {
      checkpoint();
      cancelConnect();
      context.machine = next;
      onRestoreTester(context.machine.tester);
      clearSelection();
      showProperties(false);
      changed();
      fit();
    },
    connect(from, to) {
      context.source = from;
      connectTo(to);
    },
    attachComment: connectComment,
    ungroup(id) {
      update((next) => dissolveGroup(next, id));
      if (context.openGroup === id) closeGroup();
    },
    group(name, id) {
      if (!name.trim()) return false;
      if (id)
        return update((next) => {
          next.groups.find((g) => g.id === id).name = name.trim();
        });
      if (update((next) => createGroup(next, context.selectedStates, name.trim()))) {
        clearSelection();
        changed();
        if (!context.openGroup) fit();
        return true;
      }
      return false;
    },
    moveToGroup(ids, id) {
      return update((next) => {
        const set = new Set(ids);
        next.groups = (next.groups ?? []).map((g) => ({
          ...g,
          stateIds: g.stateIds.filter((s) => !set.has(s)),
        }));
        if (id) next.groups.find((g) => g.id === id).stateIds.push(...ids);
        next.groups = next.groups.filter((g) => g.stateIds.length);
      });
    },
    toggleAccepting() {
      if (!context.selectedStates.size) return;
      update((next) => {
        const value = ![...context.selectedStates].every((id) =>
          isAccepting(next.states.find((s) => s.id === id)),
        );
        for (const s of next.states) if (context.selectedStates.has(s.id)) setAccepting(s, value);
      });
    },
    async arrange(options) {
      const next = structuredClone(context.machine);
      try {
        const { smartArrange } = await import('../core/smart-layout.js');
        if (context.disposed) return;
        if (options.disregardGroups) next.groups = [];
        const groups = smartArrange(
          next,
          options.disregardGroups ? null : context.openGroup,
          options,
        );
        validate(next);
        checkpoint();
        context.machine = next;
        if (options.disregardGroups) context.openGroup = null;
        clearSelection();
        changed();
        if (!context.openGroup) fit();
        toast(
          groups
            ? 'Arranged graph and created ' + groups + ' connected groups. Undo to restore.'
            : 'States arranged. Undo to restore.',
        );
      } catch (error) {
        toast(error.message);
      }
    },
    dispose() {
      context.disposed = true;
      context.groupAnimation?.cancel();
      scope.dispose();
      observer.disconnect();
      themeObserver.disconnect();
      cancelAnimationFrame(firstFrame);
      if (context.drawFrame !== null) cancelAnimationFrame(context.drawFrame);
      if (context.propertiesFrame !== null) cancelAnimationFrame(context.propertiesFrame);
      for (const element of [elements.canvas, elements.minimap, overviewCanvas])
        for (const key of [
          'onpointerdown',
          'onpointerup',
          'onpointermove',
          'onpointercancel',
          'oncontextmenu',
          'ondblclick',
        ])
          element[key] = null;
      if (elements.canvas.parentElement !== elements.surface)
        elements.surface.append(elements.canvas);
      document.body.classList.remove('panning', 'pan-ready', 'placing-state', 'placing-comment');
    },
  };
}
