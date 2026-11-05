import { wheelZoomFactor } from '../core/canvas-gestures.js';
import { canvasTransform } from '../core/canvas-graph.js';
import { editorSettings } from '../core/editor-settings.js';
import { placeFloatingRect } from '../core/floating-placement.js';
import { createGroupWindow } from './group-window.js';
import { visibleViewport, measureVisibleViewport } from './visible-viewport.js';
export function createViewport(context) {
  const { positionGroupPanel } = createGroupWindow(context);
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
      .filter(
        (el) =>
          el &&
          el !== exclude &&
          !el.hidden &&
          el.getAttribute('aria-hidden') !== 'true' &&
          el.dataset.state !== 'closed' &&
          getComputedStyle(el).display !== 'none',
      )
      .map((el) => el.getBoundingClientRect());
  }
  function showProperties(show, event) {
    const wasOpen = !document.body.classList.contains('properties-hidden');
    if (wasOpen !== !!show) {
      context.onUI({ propertiesOpen: !!show });
      document.body.classList.toggle('properties-hidden', !show);
      context.$('toggle-properties')?.setAttribute('aria-expanded', String(show));
    }
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
    panel.style.transformOrigin = `${anchor.x - placed.x}px ${anchor.y - placed.y}px`;
    const tester = document.querySelector('.tester'),
      bottom =
        document.body.dataset.testerDock === 'bottom' && tester
          ? Math.min(area.bottom, tester.getBoundingClientRect().top)
          : area.bottom;
    panel.style.maxHeight = Math.max(80, bottom - placed.y - 12) + 'px';
  }
  function view() {
    return context.overviewView ?? context.graph.view();
  }
  function syncGrid() {
    const update = (grid, canvas, v) => {
      if (!grid || !canvas || !v) return;
      const t = canvasTransform(v, canvas.clientWidth, canvas.clientHeight);
      if (!(t.scale > 0)) return;
      const size = 100 * t.scale,
        area = canvas.getBoundingClientRect(),
        parent = grid.getBoundingClientRect();
      grid.style.backgroundSize = `${size}px ${size}px`;
      grid.style.backgroundPosition = `${area.left - parent.left + t.x - size / 2}px ${area.top - parent.top + t.y - size / 2}px`;
    };
    update(
      context.canvasWrap,
      context.overviewView ? context.overviewCanvas : context.$('canvas'),
      context.overviewView ?? context.graph.view(),
    );
    if (context.overviewView) update(context.groupPanel, context.$('canvas'), context.graph.view());
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
  function followState(id, center = false) {
    cancelAnimationFrame(context.cameraFrame);
    const state = context.machine.states.find((s) => s.id === id);
    if (!state) return;
    const start = view(),
      surface = context.overviewView ? context.overviewCanvas : context.elements.canvas,
      visible = visibleViewport(start, surface),
      offset = context.overviewView ? context.groupWindowOffset : { x: 0, y: 0 };
    const area = surface.getBoundingClientRect(),
      transform = canvasTransform(start, area.width, area.height),
      scale = transform.scale,
      obstacles = floatingObstacles(context.groupPanel),
      screen = {
        x: area.left + transform.x + (state.x + offset.x) * scale,
        y: area.top + transform.y + (state.y + offset.y) * scale,
      },
      size = { width: 110 * scale, height: 144 * scale },
      covered = obstacles.some(
        (box) =>
          screen.x + size.width / 2 + 12 > box.left &&
          screen.x - size.width / 2 - 12 < box.right &&
          screen.y + size.height / 2 + 12 > box.top &&
          screen.y - size.height / 2 - 12 < box.bottom,
      );
    // Keep nearby steps still; pan only when the active node leaves the comfortable viewing area.
    const x = state.x + offset.x,
      y = state.y + offset.y,
      margin = Math.min(130 / scale, visible.width / 4, visible.height / 4);
    if (
      !center &&
      !covered &&
      x >= visible.x + margin &&
      x <= visible.x + visible.width - margin &&
      y >= visible.y + margin &&
      y <= visible.y + visible.height - margin
    )
      return;
    const available = {
      left: area.left + transform.x + visible.x * scale,
      top: area.top + transform.y + visible.y * scale,
      right: area.left + transform.x + (visible.x + visible.width) * scale,
      bottom: area.top + transform.y + (visible.y + visible.height) * scale,
    };
    const centered = {
      x: (available.left + available.right - size.width) / 2,
      y: (available.top + available.bottom - size.height) / 2,
    };
    const placed = center ? centered : placeFloatingRect(centered, size, available, obstacles, 12);
    const target = {
      ...start,
      x: start.x + (screen.x - placed.x - size.width / 2) / scale,
      y: start.y + (screen.y - placed.y - size.height / 2) / scale,
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(target);
      return;
    }
    const began = performance.now();
    const tick = (now) => {
      if (context.disposed) return;
      const progress = Math.min(1, (now - began) / 320),
        ease = progress * progress * (3 - 2 * progress);
      setView({
        ...start,
        x: start.x + (target.x - start.x) * ease,
        y: start.y + (target.y - start.y) * ease,
      });
      if (progress < 1) context.cameraFrame = requestAnimationFrame(tick);
    };
    context.cameraFrame = requestAnimationFrame(tick);
  }
  function fittedView(bounds, canvas) {
    const visible = measureVisibleViewport(canvas),
      left = visible.left + 35,
      right = visible.right - 35,
      top = visible.top + 65,
      bottom = visible.bottom - 65;
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
        const x = group.x ?? members.reduce((sum, s) => sum + s.x, 0) / members.length,
          y = group.y ?? members.reduce((sum, s) => sum + s.y, 0) / members.length;
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
    cancelAnimationFrame(context.cameraFrame);
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
    cancelAnimationFrame(context.cameraFrame);
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
    cancelAnimationFrame(context.cameraFrame);
    const map = context.graph;
    const p = map.mapPoint(e, context.mapTransform ?? map.mapTransform()),
      v = view();
    if (context.overviewView) {
      p.x += context.groupWindowOffset.x;
      p.y += context.groupWindowOffset.y;
    }
    const visible = visibleViewport(
      v,
      context.overviewView ? context.overviewCanvas : context.elements.canvas,
    );
    setView({
      ...v,
      x: p.x - visible.width / 2 - (visible.x - v.x),
      y: p.y - visible.height / 2 - (visible.y - v.y),
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
    followState,
  };
}
