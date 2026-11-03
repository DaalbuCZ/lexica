import { wheelZoomFactor } from '../core/canvas-gestures.js';
import { canvasTransform } from '../core/canvas-graph.js';
import { editorSettings } from '../core/editor-settings.js';
import { placeFloatingRect } from '../core/floating-placement.js';
import { createGroupWindow } from './group-window.js';
export function createViewport(context) {
  const { positionGroupPanel, installWindow } = createGroupWindow(context);
  context.installGroupWindow = installWindow;
  function floatingObstacles(exclude) {
    return [
      document.querySelector('.brand'),
      document.querySelector('.top-actions'),
      document.querySelector('.toolbar'),
      document.querySelector('.minimap'),
      document.querySelector('.canvas-status'),
      document.querySelector('.inspector'),
      context.groupPanel,
      document.querySelector('.tester'),
      document.querySelector('.debugger-window'),
    ]
      .filter((el) => el && el !== exclude && !el.hidden && getComputedStyle(el).display !== 'none')
      .map((el) => el.getBoundingClientRect());
  }
  function showProperties(show, event) {
    context.onUI({
      propertiesOpen: !!show,
    });
    document.body.classList.toggle('properties-hidden', !show);
    context.$('toggle-properties').setAttribute('aria-expanded', String(show));
    if (!show) {
      if (context.propertiesFrame !== null) cancelAnimationFrame(context.propertiesFrame);
      context.propertiesFrame = null;
      return;
    }
    if (event)
      context.propertiesEvent = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
    if (context.propertiesFrame !== null) return;
    context.propertiesFrame = requestAnimationFrame(() => {
      context.propertiesFrame = null;
      positionProperties();
    });
  }
  function positionProperties() {
    if (document.body.classList.contains('properties-hidden')) return;
    const panel = document.querySelector('.inspector'),
      area = context.canvasWrap.getBoundingClientRect();
    let box = context.graph.selectionBox(context.selection);
    context.propertiesEvent = null;
    if (!box && context.selection.type === 'state') {
      const state = context.machine.states.find((item) => item.id === context.selection.id),
        canvas = context.$('canvas');
      if (state) {
        const rect = canvas.getBoundingClientRect(),
          t = canvasTransform(view(), canvas.clientWidth, canvas.clientHeight);
        box = {
          left: rect.left + t.x + (state.x - 36) * t.scale,
          right: rect.left + t.x + (state.x + 36) * t.scale,
          top: rect.top + t.y + (state.y - 36) * t.scale,
          bottom: rect.top + t.y + (state.y + 36) * t.scale,
        };
      }
    }
    panel.style.position = 'absolute';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = Math.max(40, Math.min(320, area.width - 24)) + 'px';
    panel.style.maxWidth = Math.max(40, area.width - 24) + 'px';
    panel.style.maxHeight = Math.max(40, area.height - 24) + 'px';
    const size = {
        width: panel.offsetWidth,
        height: panel.offsetHeight,
      },
      obstacles = floatingObstacles(panel);
    const anchor = box
        ? {
            x: (box.left + box.right) / 2,
            y: (box.top + box.bottom) / 2,
          }
        : {
            x: area.left + area.width / 2,
            y: area.top + area.height / 2,
          },
      preferLeft = anchor.x > area.left + area.width / 2,
      candidate = {
        x: preferLeft ? (box?.left ?? anchor.x) - size.width - 14 : (box?.right ?? anchor.x) + 14,
        y: anchor.y - size.height / 2,
      },
      placed = placeFloatingRect(candidate, size, area, obstacles, 12);
    panel.style.left = placed.x - area.left + 'px';
    panel.style.top = placed.y - area.top + 'px';
  }
  function view() {
    return context.overviewView ?? context.graph.view();
  }
  function syncGrid() {
    const canvas = context.$('canvas'),
      v = context.graph.view(),
      scale = Math.min(canvas.clientWidth / v.width, canvas.clientHeight / v.height);
    if (!(scale > 0)) return;
    const size = 100 * scale;
    const x = (canvas.clientWidth - v.width * scale) / 2 - v.x * scale - size / 2,
      y = (canvas.clientHeight - v.height * scale) / 2 - v.y * scale - size / 2;
    const grid =
      document.querySelector('.group-overlay:not([hidden])') ??
      document.querySelector('.canvas-wrap');
    grid.style.backgroundSize = `${size}px ${size}px`;
    grid.style.backgroundPosition = `${x}px ${y}px`;
  }
  function setView(v) {
    if (context.overviewView) {
      context.overviewView = v;
      context.overviewGraph.setView(v);
    } else context.graph.setView(v);
    if ((context.placingState || context.placingComment) && context.commentCursor)
      context.placementPoint = context.point(context.commentCursor);
    syncGrid();
    context.queueDraw();
    if (!document.body.classList.contains('properties-hidden')) showProperties(true);
  }
  function fittedView(bounds, canvas) {
    const area = canvas.getBoundingClientRect(),
      tester = document.querySelector('.tester')?.getBoundingClientRect(),
      dock = document.body.dataset.testerDock;
    let left = 35,
      right = canvas.clientWidth - 35,
      top = 80,
      bottom = canvas.clientHeight - 35;
    if (tester) {
      if (dock === 'left') left = Math.max(left, tester.right - area.left + 24);
      else if (dock === 'right') right = Math.min(right, tester.left - area.left - 24);
      else if (dock === 'top') top = Math.max(top, tester.bottom - area.top + 24);
      else bottom = Math.min(bottom, tester.top - area.top - 24);
    }
    const scale = Math.max(
      (bounds.width + 80) / Math.max(120, right - left),
      (bounds.height + 80) / Math.max(120, bottom - top),
    );
    return {
      x: bounds.x + bounds.width / 2 - ((left + right) / 2) * scale,
      y: bounds.y + bounds.height / 2 - ((top + bottom) / 2) * scale,
      width: canvas.clientWidth * scale,
      height: canvas.clientHeight * scale,
    };
  }
  function fitGroupContents() {
    context.draw();
    showProperties(true);
  }
  function fit() {
    if (context.overviewView && context.groupWindowWorldBounds) {
      const bounds = context.groupWindowWorldBounds,
        group = context.machine.groups?.find((g) => g.id === context.openGroup),
        members = context.machine.states.filter((s) => group?.stateIds.includes(s.id));
      if (members.length) {
        const x = members.reduce((sum, s) => sum + s.x, 0) / members.length,
          y = members.reduce((sum, s) => sum + s.y, 0) / members.length;
        const left = Math.min(bounds.x, x - 60),
          top = Math.min(bounds.y, y - 60),
          right = Math.max(bounds.x + bounds.width, x + 60),
          bottom = Math.max(bounds.y + bounds.height, y + 60);
        setView(
          fittedView(
            { x: left, y: top, width: right - left, height: bottom - top },
            context.overviewCanvas,
          ),
        );
        return;
      }
    }
    setView(
      fittedView(
        context.overviewView
          ? (context.groupWindowWorldBounds ?? context.overviewGraph.bounds())
          : context.graph.bounds(),
        context.overviewView ? context.overviewCanvas : context.elements.canvas,
      ),
    );
  }
  function zoom(factor, p) {
    const v = view(),
      center = p ?? {
        x: v.x + v.width / 2,
        y: v.y + v.height / 2,
      };
    if (v.width * factor < 160 || v.width * factor > 30000) return;
    setView({
      x: center.x + (v.x - center.x) * factor,
      y: center.y + (v.y - center.y) * factor,
      width: v.width * factor,
      height: v.height * factor,
    });
  }
  function wheelGraph(e) {
    if (e.target !== context.elements.canvas && e.target !== context.overviewCanvas) return;
    e.preventDefault();
    const outside = !!context.overviewView;
    const canvas = outside ? context.overviewCanvas : context.elements.canvas;
    const current = view();
    if (!current) return;
    const apply = setView;
    if (e.ctrlKey || e.metaKey) {
      if (e.deltaY) {
        const factor = wheelZoomFactor(e.deltaY, editorSettings.pinchSensitivity),
          p = outside ? context.overviewGraph.point(e) : context.point(e);
        if (current.width * factor >= 160 && current.width * factor <= 30000)
          apply({
            x: p.x + (current.x - p.x) * factor,
            y: p.y + (current.y - p.y) * factor,
            width: current.width * factor,
            height: current.height * factor,
          });
      }
      return;
    }
    const v = current,
      unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1,
      shifted = e.deltaMode !== 0 && e.shiftKey && !e.deltaX,
      dx = shifted ? e.deltaY : e.deltaX,
      dy = shifted ? 0 : e.deltaY;
    apply({
      ...v,
      x: v.x + (dx * unit * v.width) / canvas.clientWidth,
      y: v.y + (dy * unit * v.height) / canvas.clientHeight,
    });
  }
  function resizeCanvas() {
    const canvas = context.$('canvas'),
      width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (
      !width ||
      !height ||
      (width === context.canvasSize.width && height === context.canvasSize.height)
    )
      return;
    if (!context.canvasSize.width || !context.canvasSize.height) {
      context.canvasSize = { width, height };
      context.queueDraw();
      return;
    }
    if (context.overviewView) {
      context.canvasSize = { width, height };
      const next = {
          width: context.overviewCanvas.clientWidth,
          height: context.overviewCanvas.clientHeight,
        },
        old = context.overviewCanvasSize ?? next;
      context.overviewCanvasSize = next;
      if (old.width && old.height && (old.width !== next.width || old.height !== next.height))
        setView({
          ...view(),
          width: (view().width * next.width) / old.width,
          height: (view().height * next.height) / old.height,
        });
      return;
    }
    const v = view(),
      nextWidth = (v.width * width) / context.canvasSize.width,
      nextHeight = (v.height * height) / context.canvasSize.height;
    context.canvasSize = {
      width,
      height,
    };
    const next = {
      x: v.x + (v.width - nextWidth) / 2,
      y: v.y + (v.height - nextHeight) / 2,
      width: nextWidth,
      height: nextHeight,
    };
    setView(next);
    if (!document.body.classList.contains('properties-hidden')) showProperties(true);
  }
  function setOverviewView(next) {
    if (!context.overviewView) return;
    setView(next);
  }
  function navigateMap(e) {
    const p = context.graph.mapPoint(e, context.mapTransform ?? context.graph.mapTransform()),
      v = view();
    if (context.overviewView && context.groupWindowOffset) {
      p.x += context.groupWindowOffset.x;
      p.y += context.groupWindowOffset.y;
    }
    setView({
      ...v,
      x: p.x - v.width / 2,
      y: p.y - v.height / 2,
    });
  }
  return {
    floatingObstacles,
    positionGroupPanel,
    positionProperties,
    showProperties,
    view,
    syncGrid,
    setView,
    fittedView,
    fitGroupContents,
    fit,
    zoom,
    wheelGraph,
    resizeCanvas,
    setOverviewView,
    navigateMap,
  };
}
