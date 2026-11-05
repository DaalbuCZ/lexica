import { createBendReset } from '../core/reset-bend.js';
import { setupCanvasGestures } from '../core/canvas-gestures.js';
import { canvasTransform } from '../core/canvas-graph.js';
import { editorSettings } from '../core/editor-settings.js';
import {
  commentLayout,
  commentAnchors,
  positionComments,
  commentLinks,
  commentLinkKey,
} from '../core/comments.js';
import { destination, statePortalBox } from '../core/lexer.js';
import { routeEdges, loopDragBend } from '../core/layout.js';
import { graphView, groupFor } from '../core/groups.js';
import { portalTip } from '../core/portals.js';
export function createCanvasInteractions(context) {
  function startCommentConnection(e, id) {
    e.stopPropagation();
    if (context.space || e.button === 1) {
      startPan(e);
      return;
    }
    if (context.source && (e.button === 0 || e.button === 2)) {
      e.preventDefault();
      context.connectComment(id, context.source);
      return;
    }
    if (context.commentSource) {
      context.cancelConnect();
      return;
    }
    if (e.button !== 2 && !(e.button === 0 && e.ctrlKey)) {
      startGroupDrag(e, 'comment', id);
      return;
    }
    e.preventDefault();
    context.cancelConnect();
    context.commentSource = id;
    context.connectPoint = context.point(e);
    context.rightStart = {
      commentId: id,
      x: e.clientX,
      y: e.clientY,
    };
    context.$('canvas').setPointerCapture(e.pointerId);
    context.showProperties(false);
    context.$('modehint').textContent =
      'Click a destination state · Right-drag to connect · Esc to cancel';
    context.draw();
  }
  function startGroupDrag(e, type, key) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (context.space) {
      startPan(e);
      return;
    }
    if (type === 'group') {
      const group = context.machine.groups.find((g) => g.id === key);
      if (!group?.stateIds.length) return;
      const selected = group.stateIds.every((id) => context.selectedStates.has(id));
      if (e.shiftKey && selected) {
        group.stateIds.forEach((id) => context.selectedStates.delete(id));
        context.primaryFromSelection();
        context.markSelection();
        context.queueDraw();
        return;
      }
      context.choose('state', group.stateIds[0], { keep: e.shiftKey || selected });
      group.stateIds.forEach((id) => context.selectedStates.add(id));
      context.showProperties(false);
      context.markSelection();
      context.properties();
      const groups = (context.machine.groups ?? []).filter((g) =>
        g.stateIds.every((id) => context.selectedStates.has(id)),
      );
      const items = [
        ...context.machine.states.filter((s) => context.selectedStates.has(s.id)),
        ...groups,
        ...groups.flatMap((g) => Object.values(g.contextPositions ?? {})),
        ...(context.machine.comments ?? []).filter((c) => context.selectedComments.has(c.id)),
      ];
      context.drag = {
        start: context.point(e),
        moved: false,
        anchors: commentAnchors(context.machine).filter(
          (a) => !context.selectedComments.has(a.comment.id),
        ),
        items: [...new Set(items)].map((item) => ({ item, x: item.x, y: item.y })),
      };
      return;
    }
    const already = context.selectionSet(type).has(key);
    context.choose(type, key, {
      toggle: e.shiftKey,
      keep: !e.shiftKey && already,
    });
    context.showProperties(false);
    context.markSelection();
    context.properties();
    if (!context.selectionSet(type).has(key)) return;
    context.drag = {
      start: context.point(e),
      moved: false,
      anchors: commentAnchors(context.machine).filter(
        (a) => !context.selectedComments.has(a.comment.id),
      ),
      items: [
        ...context.machine.states.filter((s) => context.selectedStates.has(s.id)),
        ...(context.machine.groups ?? [])
          .filter(
            (g) => g.stateIds.length && g.stateIds.every((id) => context.selectedStates.has(id)),
          )
          .flatMap((g) => [g, ...Object.values(g.contextPositions ?? {})]),
        ...(context.machine.comments ?? []).filter((c) => context.selectedComments.has(c.id)),
      ].map((item) => ({
        item,
        x: item.x,
        y: item.y,
      })),
    };
  }
  function startDrag(e, id) {
    e.stopPropagation();
    if (context.commentSource && (e.button === 0 || e.button === 2)) {
      e.preventDefault();
      context.connectComment(context.commentSource, id);
      return;
    }
    if (e.button === 2 && context.selectedStates.has(id)) {
      const group = groupFor(context.machine, id);
      context.showGroupSelectionMenu(
        e,
        () => (group ? context.openGroupById(group.id) : context.makeGroup()),
        true,
      );
      return;
    }
    if (context.space || e.button === 1) {
      startPan(e);
      return;
    }
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      if (context.source && !(e.ctrlKey && context.source === id)) {
        if (e.ctrlKey) context.insertBetween(id);
        else context.connectTo(id);
      } else {
        context.showProperties(false);
        context.$('canvas').setPointerCapture(e.pointerId);
        context.pan = null;
        context.drag = null;
        context.source = id;
        context.connectPoint = context.point(e);
        context.rightStart = {
          id,
          x: e.clientX,
          y: e.clientY,
          insert: e.ctrlKey,
          pointerId: e.pointerId,
        };
        document.body.classList.toggle(
          'connecting-outside-group',
          !!(e.ctrlKey && context.overviewView),
        );
        context.$('modehint').textContent = 'Choose a destination state or group · Esc to cancel';
        context.draw();
      }
      return;
    }
    if (e.button !== 0) return;
    if (context.source) {
      context.connectTo(id);
      return;
    }
    startGroupDrag(e, 'state', id);
  }
  function startPan(e) {
    cancelAnimationFrame(context.cameraFrame);
    e.preventDefault();
    const surface = context.overviewView ? context.overviewCanvas : context.$('canvas'),
      v = context.view();
    context.pan = {
      x: e.clientX,
      y: e.clientY,
      v,
      scale: Math.min(surface.clientWidth / v.width, surface.clientHeight / v.height),
    };
    document.body.classList.add('panning');
  }
  function install() {
    context.scope.signal.addEventListener(
      'abort',
      () => document.body.classList.remove('connecting-outside-group'),
      { once: true },
    );
    let resetBendKey = 'bend';
    const resetBendOnRightClick = createBendReset(
      (e) => {
        if (context.source || context.commentSource) return null;
        const hit = context.graph.hitClient(e);
        resetBendKey = hit?.type === 'group-edge' ? 'groupBend' : 'bend';
        return ['edge', 'group-edge'].includes(hit?.type) ? context.machine.edges[hit.index] : null;
      },
      (edge) => {
        if (!edge[resetBendKey]) return;
        context.checkpoint();
        delete edge[resetBendKey];
        context.changed();
        context.toast('Connection bend reset.');
      },
    );
    context.listen(context.$('canvas'), 'pointermove', (e) => {
      if (e.buttons) {
        context.portalPreview.hidden = true;
        return;
      }
      const hit = context.graph.hitClient(e);
      if (hit?.type !== 'portal-source') {
        context.portalPreview.hidden = true;
        return;
      }
      const edge = context.machine.edges[hit.index];
      let state;
      try {
        state = destination(context.machine, edge);
      } catch {
        context.portalPreview.hidden = true;
        return;
      }
      const next = [
        ...new Set(
          context.machine.edges
            .filter((item) => item.from === state.id)
            .map((item) => {
              try {
                return destination(context.machine, item).name;
              } catch {
                return '?';
              }
            }),
        ),
      ];
      context.portalPreview.textContent = `${state.name}${state.token ? ' · ' + state.token : ''}${next.length ? '\nNext: ' + next.slice(0, 6).join(', ') + (next.length > 6 ? ' …' : '') : '\nNo outgoing states'}\nDrag to move · Double-click to rename`;
      context.portalPreview.style.left = Math.min(e.clientX + 14, innerWidth - 240) + 'px';
      context.portalPreview.style.top = Math.min(e.clientY + 14, innerHeight - 90) + 'px';
      context.portalPreview.hidden = false;
    });
    context.listen(context.$('canvas'), 'pointerleave', () => {
      context.portalPreview.hidden = true;
      context.$('canvas').style.cursor = '';
    });
    context.listen(context.$('canvas'), 'pointermove', (e) => {
      if (e.buttons || context.space) return;
      const hit = context.graph.hitClient(e);
      context.$('canvas').style.cursor =
        context.placingState || context.placingComment || context.source || context.commentSource
          ? 'crosshair'
          : hit && hit.type !== 'outside-state'
            ? 'pointer'
            : '';
    });
    context.listen(context.$('canvas'), 'pointermove', (e) => {
      context.commentCursor = {
        clientX: e.clientX,
        clientY: e.clientY,
      };
      if (context.placingComment || context.placingState) {
        context.placementPoint = context.point(e);
        context.queueDraw();
      }
    });
    context.listen(context.$('canvas'), 'pointerleave', () => {
      context.commentCursor = null;
      if (context.placementPoint) {
        context.placementPoint = null;
        context.queueDraw();
      }
    });
    const resetMainGestures = setupCanvasGestures(context.$('canvas'), {
      getView: () => context.view(),
      setView: (view) => {
        context.setView(view);
        context.flushDraw();
      },
      toWorld: (event) =>
        context.overviewView ? context.overviewGraph.point(event) : context.point(event),
      signal: context.scope.signal,
      viewport: () => (context.overviewView ? context.overviewCanvas : context.$('canvas')),
      sensitivity: () => editorSettings.pinchSensitivity,
      onInterrupt: () => {
        cancelAnimationFrame(context.cameraFrame);
        if (context.drag?.moved) {
          context.save();
        }
        context.drag = null;
        context.pan = null;
        context.marquee = null;
        context.cancelConnect(false);
        context.queueDraw();
        document.body.classList.remove('panning');
      },
    });
    context.listen(
      context.$('canvas'),
      'pointerdown',
      (e) => {
        const hit =
          (context.source || context.commentSource) && e.button === 2
            ? context.graph.hitClient(e)
            : null;
        if ((context.placingComment || context.placingState) && e.button === 2) {
          e.preventDefault();
          e.stopImmediatePropagation();
          context.cancelConnect();
          return;
        }
        if (
          (context.source || context.commentSource) &&
          e.button === 2 &&
          !['state', 'outside-state', 'group', 'comment', 'portal-target', 'start-view'].includes(
            hit?.type,
          )
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          context.cancelConnect();
          return;
        }
        if ((context.placingComment || context.placingState) && e.button === 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const position = context.point(e);
          if (context.placingComment) context.addComment(position);
          else {
            context.cancelConnect();
            context.add(position.x, position.y);
          }
        }
      },
      true,
    );
    context.$('canvas').onpointerdown = (e) => {
      context.$('canvas').focus({ preventScroll: true });
      if (e.button === 0 && e.shiftKey) {
        e.preventDefault();
        context.marquee = {
          start: context.point(e),
          end: context.point(e),
        };
        context.draw();
        return;
      }
      const hit = context.graph.hitClient(e);
      if (e.button === 1 || context.space) {
        startPan(e);
        return;
      }
      if (
        ['portal-target', 'start-view'].includes(hit?.type) &&
        (e.button === 0 || e.button === 2) &&
        (context.commentSource || context.source)
      ) {
        e.preventDefault();
        const id = hit.type === 'start-view' ? context.machine.start : hit.id;
        if (context.commentSource) context.connectComment(context.commentSource, id);
        else context.connectTo(id);
        return;
      }
      if (hit?.type === 'outside-state') {
        if ((e.button === 0 || e.button === 2) && (context.commentSource || context.source)) {
          e.preventDefault();
          if (context.commentSource) context.connectComment(context.commentSource, hit.id);
          else context.connectTo(hit.id);
          return;
        }
        if (e.button === 0 && !e.ctrlKey) {
          const group = context.machine.groups.find((group) => group.id === context.openGroup),
            point = group?.contextPositions?.[hit.id];
          if (point) {
            e.preventDefault();
            context.clearSelection();
            context.showProperties(false);
            context.markSelection();
            context.drag = {
              start: context.point(e),
              moved: false,
              anchors: [],
              items: [{ item: point, x: point.x, y: point.y }],
            };
          }
        }
        return;
      }
      if (hit?.type === 'group') {
        e.preventDefault();
        e.stopPropagation();
        if ((context.source || context.commentSource) && (e.button === 0 || e.button === 2))
          context.connectToGroup(hit.id);
        else if (e.button === 0) startGroupDrag(e, 'group', hit.id);
        return;
      }
      const groupEdge = hit?.type === 'group-edge';
      if (groupEdge) hit.type = 'edge';
      if ((hit?.type === 'portal-source' || hit?.type === 'portal-target') && e.button === 0) {
        const isSource = hit.type === 'portal-source',
          item = isSource
            ? context.machine.edges[hit.index]
            : context.machine.states.find((s) => s.id === hit.id),
          state = isSource ? context.machine.states.find((s) => s.id === item.from) : item,
          route = isSource ? context.graph.edgeRoute(hit.index) : null,
          tip = route?.p3 ?? portalTip(statePortalBox(state));
        context.choose(isSource ? 'edge' : 'state', isSource ? hit.index : hit.id);
        context.markSelection();
        context.properties();
        context.portalDrag = {
          item,
          index: isSource ? hit.index : null,
          state,
          start: context.point(e),
          offset: {
            x: tip.x - state.x,
            y: tip.y - state.y,
          },
          moved: false,
        };
        return;
      }
      if (hit?.type === 'start-view' && e.button === 2) {
        startDrag(e, context.machine.start);
        context.sourceStartView = hit.index;
        context.draw();
        return;
      }
      if (hit?.type === 'start-view' && e.button === 0) {
        const item = context.machine.startViews[hit.index];
        context.choose('state', context.machine.start);
        context.drag = {
          start: context.point(e),
          moved: false,
          anchors: [],
          items: [
            {
              item,
              x: item.x,
              y: item.y,
            },
          ],
        };
        return;
      }
      if (hit?.type === 'state') {
        context.sourceStartView = null;
        startDrag(e, hit.id);
        return;
      }
      if (hit?.type === 'comment') {
        startCommentConnection(e, hit.id);
        return;
      }
      if (hit) {
        if (e.button === 0) {
          context.choose(hit.type, hit.type === 'edge' ? hit.index : hit.id, {
            toggle: e.shiftKey,
          });
          context.showProperties(false);
          context.markSelection();
          context.properties();
          if (hit.type === 'edge' && context.graph.edgeRoute(hit.index)) {
            const edge = context.machine.edges[hit.index];
            const route = context.graph.edgeRoute(hit.index);
            const shown = groupEdge ? graphView(context.machine) : context.machine;
            const displayedEdge = groupEdge
              ? shown.edges.find((item) => item.originalIndex === hit.index)
              : edge;
            const from = shown.states.find((state) => state.id === displayedEdge.from);
            const to =
              displayedEdge.portal == null
                ? shown.states.find((state) => state.id === displayedEdge.to)
                : null;
            context.edgeDrag = {
              edge,
              bendKey: groupEdge ? 'groupBend' : 'bend',
              index: hit.index,
              route,
              from,
              to,
              labelOffset: { x: 0, y: 0 },
              start: context.point(e),
              bend: {
                ...(edge[groupEdge ? 'groupBend' : 'bend'] ?? {
                  x: 0,
                  y: 0,
                }),
              },
              moved: false,
            };
            const midpoint = (axis) =>
              (route.p0[axis] + 3 * route.c1[axis] + 3 * route.c2[axis] + route.p3[axis]) / 8;
            context.edgeDrag.labelOffset = {
              x: route.label.x - midpoint('x'),
              y: route.label.y - midpoint('y') + 13,
            };
            if (edge.from === edge.to && edge.portal == null) {
              context.edgeDrag.center = {
                x: from.x,
                y: from.y,
              };
              context.edgeDrag.apex = {
                x: midpoint('x'),
                y: midpoint('y'),
              };
            }
          }
        }
        return;
      }
      if ((context.source || context.commentSource) && e.button === 0) {
        if (context.commentSource) {
          context.cancelConnect();
          return;
        }
        const p = context.point(e);
        context.add(p.x, p.y, context.source);
        return;
      }
      if (e.button === 0) {
        context.showProperties(false);
        if (context.toolMode === 'select') {
          if (!e.shiftKey) context.clearSelection();
          context.marquee = {
            start: context.point(e),
            end: context.point(e),
          };
          context.draw();
        } else {
          const hadSelection = context.selection.type !== 'none';
          context.clearSelection();
          if (hadSelection) context.properties();
          startPan(e);
          context.queueDraw();
        }
      }
    };
    context.listen(
      context.$('canvas'),
      'dblclick',
      (e) => {
        if (e.button !== 0) return;
        const hit = context.graph.hitClient(e);
        if (hit?.type !== 'group-edge') return;
        const edge = graphView(context.machine).edges.find(
          (item) =>
            item.groupEdge && item.originalIndex === hit.index && item.originalIndices?.length > 1,
        );
        if (!edge) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        context.chooseCombinedTransition(edge);
      },
      true,
    );
    context.$('canvas').oncontextmenu = (e) => {
      e.preventDefault();
      const hit = context.graph.hitClient(e);
      if (hit?.type === 'group') {
        const group = context.machine.groups?.find((item) => item.id === hit.id);
        if (group) {
          context.showGroupSelectionMenu(e, () => context.openGroupById(group.id));
          return;
        }
      }
      resetBendOnRightClick(e);
    };
    context.$('canvas').onpointercancel = () => {
      const moved = context.edgeDrag?.moved || context.portalDrag?.moved;
      context.edgeDrag = null;
      context.portalDrag = null;
      if (moved) {
        context.save();
        context.render();
      }
      context.cancelConnect();
      context.drag = null;
      context.pan = null;
      context.marquee = null;
      document.body.classList.remove('panning');
    };
    context.listen(window, 'pointermove', (e) => {
      if (context.portalDrag) {
        const p = context.point(e),
          dx = p.x - context.portalDrag.start.x,
          dy = p.y - context.portalDrag.start.y;
        if (!context.portalDrag.moved && Math.hypot(dx, dy) < 2) return;
        if (!context.portalDrag.moved) {
          context.checkpoint();
          context.portalDrag.moved = true;
        }
        context.portalDrag.item.portalOffset = {
          x: context.portalDrag.offset.x + dx,
          y: context.portalDrag.offset.y + dy,
        };
        context.queueDraw();
        return;
      }
      if (context.edgeDrag) {
        const p = context.point(e),
          dx = p.x - context.edgeDrag.start.x,
          dy = p.y - context.edgeDrag.start.y;
        if (!context.edgeDrag.moved && Math.hypot(dx, dy) < 2) return;
        if (!context.edgeDrag.moved) {
          context.checkpoint();
          context.edgeDrag.moved = true;
        }
        context.edgeDrag.edge[context.edgeDrag.bendKey] = context.edgeDrag.center
          ? loopDragBend(
              context.edgeDrag.center,
              context.edgeDrag.apex,
              context.edgeDrag.start,
              p,
              context.edgeDrag.bend,
            )
          : {
              x: context.edgeDrag.bend.x + dx,
              y: context.edgeDrag.bend.y + dy,
            };
        context.queueDraw();
        return;
      }
      if (context.marquee) {
        context.marquee.end = context.point(e);
        context.queueDraw();
        return;
      }
      if (context.pan) {
        const scale = context.pan.scale;
        context.setView({
          ...context.pan.v,
          x: context.pan.v.x - (e.clientX - context.pan.x) / scale,
          y: context.pan.v.y - (e.clientY - context.pan.y) / scale,
        });
        return;
      }
      if (context.source || context.commentSource) {
        if (context.rightStart && e.ctrlKey) {
          context.rightStart.insert = true;
          document.body.classList.toggle('connecting-outside-group', !!context.overviewView);
        }
        context.connectPoint = context.point(e);
        context.queueDraw();
        return;
      }
      if (!context.drag) return;
      const p = context.point(e),
        dx = p.x - context.drag.start.x,
        dy = p.y - context.drag.start.y;
      if (!context.drag.moved && Math.hypot(dx, dy) < 2) return;
      if (!context.drag.moved) {
        context.checkpoint();
        context.drag.moved = true;
      }
      for (const { item, x, y } of context.drag.items) {
        item.x = x + Math.round(dx);
        item.y = y + Math.round(dy);
      }
      positionComments(context.drag.anchors);
      context.queueDraw();
    });
    context.listen(window, 'pointerup', (e) => {
      if (context.portalDrag) {
        const moved = context.portalDrag.moved;
        if (moved) {
          context.portalDrag.committing = true;
          context.save();
          context.render();
        }
        context.portalDrag = null;
        return;
      }
      if (context.edgeDrag) {
        const moved = context.edgeDrag.moved;
        if (moved) {
          context.edgeDrag.committing = true;
          context.save();
          context.render();
        }
        context.edgeDrag = null;
        return;
      }
      if (context.marquee) {
        const a = context.marquee.start,
          b = context.marquee.end,
          x = Math.min(a.x, b.x),
          y = Math.min(a.y, b.y),
          w = Math.abs(a.x - b.x),
          h = Math.abs(a.y - b.y);
        const hits = (cx, cy, cw, ch) => cx + cw >= x && cx <= x + w && cy + ch >= y && cy <= y + h;
        for (const s of graphView(context.machine, context.openGroup).states.filter(
          (s) => !s.group && !s.outside,
        ))
          if (hits(s.x - 36, s.y - 36, 72, 72)) context.selectedStates.add(s.id);
        for (const c of graphView(context.machine, context.openGroup).comments ?? []) {
          const size = commentLayout(c);
          if (hits(c.x, c.y, size.w, size.h)) context.selectedComments.add(c.id);
        }
        commentLinks(graphView(context.machine, context.openGroup)).forEach((link) => {
          if (hits(link.from.x, link.from.y, 0, 0) && hits(link.to.x, link.to.y, 0, 0))
            context.selectedCommentLinks.add(commentLinkKey(link.commentId, link.nodeId));
        });
        routeEdges(graphView(context.machine, context.openGroup)).forEach((r, i) => {
          if (
            r.p0.x >= x &&
            r.p0.x <= x + w &&
            r.p0.y >= y &&
            r.p0.y <= y + h &&
            r.p3.x >= x &&
            r.p3.x <= x + w &&
            r.p3.y >= y &&
            r.p3.y <= y + h
          )
            context.selectedEdges.add(
              graphView(context.machine, context.openGroup).edges[i].originalIndex ?? i,
            );
        });
        context.marquee = null;
        context.primaryFromSelection();
        context.render();
        return;
      }
      const connection = context.rightStart;
      const canvas = context.$('canvas');
      if (connection?.pointerId != null && canvas.hasPointerCapture(connection.pointerId))
        canvas.releasePointerCapture(connection.pointerId);
      document.body.classList.remove('connecting-outside-group');
      if (connection?.insert && context.overviewView && context.openGroup) {
        const box = context.groupPanel.getBoundingClientRect();
        if (
          e.clientX < box.left ||
          e.clientX > box.right ||
          e.clientY < box.top ||
          e.clientY > box.bottom
        ) {
          const from = context.source,
            groupId = context.openGroup;
          context.cancelConnect();
          context.onDialog({ type: 'outside-group-target', from, groupId });
          return;
        }
      }
      if (
        context.rightStart &&
        Math.hypot(e.clientX - context.rightStart.x, e.clientY - context.rightStart.y) > 6
      ) {
        const hit = context.graph.hitClient(e);
        if (hit?.type === 'group') {
          if (context.source || context.commentSource) context.connectToGroup(hit.id);
          else context.cancelConnect();
          return;
        }
        const note = hit?.type === 'comment' ? hit.id : null,
          node =
            hit?.type === 'start-view'
              ? context.machine.start
              : ['state', 'outside-state', 'portal-target'].includes(hit?.type)
                ? hit.id
                : null;
        if (context.rightStart.commentId) {
          const id = context.rightStart.commentId;
          if (node) context.connectComment(id, node);
          else context.cancelConnect();
        } else if (note) {
          context.connectComment(note, context.source);
        } else if (node) {
          if (context.rightStart.insert || e.ctrlKey) context.insertBetween(node);
          else context.connectTo(node);
        } else if (document.elementFromPoint(e.clientX, e.clientY) === context.$('canvas')) {
          const p = context.point(e);
          if (context.rightStart.insert || e.ctrlKey) context.insertBetween(null, p);
          else context.add(p.x, p.y, context.source);
        }
      }
      if (connection?.insert && context.source) context.cancelConnect();
      context.rightStart = null;
      const moved = !!context.drag?.moved;
      context.drag = null;
      if (moved) {
        context.settleRoutes?.();
        context.save();
        context.render();
      }
      context.drag = null;
      if (moved) {
        context.groupPanelBounds = null;
        context.queueDraw();
      }
      context.pan = null;
      document.body.classList.remove('panning');
    });
    context.$('canvas').ondblclick = (e) => {
      if (context.source || context.commentSource) return;
      const hit = context.graph.hitClient(e);
      if (hit?.type === 'outside-state') return;
      if (hit?.type === 'group') {
        context.openGroupById(hit.id);
        return;
      }
      if (hit?.type === 'group-edge') hit.type = 'edge';
      if (hit) {
        const type =
          hit.type === 'start-view'
            ? 'state'
            : hit.type === 'portal-source'
              ? 'edge'
              : hit.type === 'portal-target'
                ? 'state'
                : hit.type;
        context.choose(
          type,
          type === 'edge' ? hit.index : hit.type === 'start-view' ? context.machine.start : hit.id,
        );
        context.markSelection();
        context.properties();
        context.showProperties(true, e);
        return;
      }
      const p = context.point(e);
      context.add(p.x, p.y);
    };
    context.$('minimap').onpointerdown = (e) => {
      e.preventDefault();
      context.mapDragging = true;
      context.mapTransform = context.graph.mapTransform();
      context.$('minimap').setPointerCapture(e.pointerId);
      context.navigateMap(e);
    };
    context.$('minimap').onpointermove = (e) => {
      if (context.mapDragging) context.navigateMap(e);
    };
    context.$('minimap').onpointerup = () => {
      context.mapDragging = false;
      context.mapTransform = null;
    };
    context.$('minimap').onpointercancel = () => {
      context.mapDragging = false;
      context.mapTransform = null;
    };
    context.listen(context.overviewCanvas, 'pointerdown', (event) => {
      if (context.rightStart) return;
      if (!event.isPrimary || ![0, 1].includes(event.button)) return;
      if (event.button === 1) event.preventDefault();
      context.outsideGroupPress = {
        id: event.pointerId,
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        view: {
          ...context.overviewView,
        },
        type: event.pointerType,
      };
    });
    context.listen(
      window,
      'pointermove',
      (event) => {
        if (context.outsideGroupPress?.id !== event.pointerId) return;
        const press = context.outsideGroupPress;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.moved = true;
        if (press.moved) {
          const rect = context.overviewCanvas.getBoundingClientRect(),
            scale = canvasTransform(press.view, rect.width, rect.height).scale;
          context.setOverviewView({
            ...press.view,
            x: press.view.x - (event.clientX - press.x) / scale,
            y: press.view.y - (event.clientY - press.y) / scale,
          });
        }
      },
      true,
    );
    context.listen(
      window,
      'pointerup',
      (event) => {
        if (context.outsideGroupPress?.id !== event.pointerId) return;
        const shouldClose =
          !context.outsideGroupPress.moved && context.outsideGroupPress.button === 0;
        context.outsideGroupPress = null;
        if (shouldClose && context.overviewView) context.closeGroup();
      },
      true,
    );
    context.listen(
      window,
      'pointercancel',
      (event) => {
        if (context.outsideGroupPress?.id === event.pointerId) context.outsideGroupPress = null;
      },
      true,
    );
    context.listen(context.overviewCanvas, 'auxclick', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    context.listen(window, 'wheel', context.wheelGraph, {
      passive: false,
      capture: true,
    });
    context.listen(window, 'popstate', (event) => {
      if (context.openGroup && event.state?.lexicaGroup !== context.openGroup)
        context.closeGroup(true);
    });
    context.listen(window, 'blur', () => {
      if (context.drag?.moved || context.edgeDrag?.moved || context.portalDrag?.moved)
        context.save();
      context.space = false;
      context.pan = null;
      context.drag = null;
      context.edgeDrag = null;
      context.portalDrag = null;
      context.marquee = null;
      context.rightStart = null;
      document.body.classList.remove('pan-ready', 'panning');
      context.draw();
    });
    context.listen(window, 'resize', () => {
      context.viewportVersion++;
      context.resizeCanvas();
      context.queueDraw();
      if (!document.body.classList.contains('properties-hidden')) context.showProperties(true);
    });
    const resetOverviewGestures = setupCanvasGestures(context.overviewCanvas, {
      getView: () => context.overviewView,
      setView: (view) => {
        context.setOverviewView(view);
        context.flushDraw();
      },
      toWorld: context.overviewGraph.point,
      sensitivity: () => editorSettings.pinchSensitivity,
      onInterrupt: () => {
        cancelAnimationFrame(context.cameraFrame);
        context.outsideGroupPress = null;
      },
      signal: context.scope.signal,
    });
    context.resetCanvasInteractions = () => {
      resetMainGestures();
      resetOverviewGestures();
      if (context.drag?.moved || context.edgeDrag?.moved || context.portalDrag?.moved)
        context.save();
      context.drag = null;
      context.edgeDrag = null;
      context.portalDrag = null;
      context.pan = null;
      context.marquee = null;
      context.rightStart = null;
      context.outsideGroupPress = null;
      document.body.classList.remove('panning');
    };
  }
  return {
    startCommentConnection,
    startGroupDrag,
    startDrag,
    startPan,
    install,
  };
}
