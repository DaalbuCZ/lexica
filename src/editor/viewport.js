import { wheelZoomFactor } from '../core/canvas-gestures.js';
import { canvasTransform } from '../core/canvas-graph.js';
import { editorSettings } from '../core/editor-settings.js';
import { placeFloatingRect } from '../core/floating-placement.js';
export function createViewport(context) {
  function floatingObstacles(exclude) {
    return [
      document.querySelector('.brand'),
      document.querySelector('.top-actions'),
      document.querySelector('.toolbar'),
      document.querySelector('.minimap'),
      document.querySelector('.canvas-status'),
      document.querySelector('.inspector'),
      context.groupPanel,
    ]
      .filter((el) => el && el !== exclude && !el.hidden && getComputedStyle(el).display !== 'none')
      .map((el) => el.getBoundingClientRect());
  }
  function positionGroupPanel(group, bounds) {
    const area = context.canvasWrap.getBoundingClientRect();
    if (!group || !area.width || !area.height || !bounds) return;
    if (context.groupPanelBoundsId !== group.id) {
      context.groupPanelBoundsId = group.id;
      context.groupPanelBounds = null;
      context.groupPanelSize = null;
      context.groupPanelViewInitialized = false;
    }
    const isDragging = !!context.drag?.moved,
      layoutBounds = isDragging && context.groupPanelBounds ? context.groupPanelBounds : bounds;
    if (!isDragging)
      context.groupPanelBounds = {
        ...bounds,
      };
    const { scale, x, y } = canvasTransform(context.overviewView, area.width, area.height),
      heading = context.groupPanel.querySelector('.group-overlay-heading').offsetHeight || 42;
    let panelWidth =
        context.groupPanelSize?.width ??
        Math.max(180, Math.min(area.width * 0.78, area.width - 20)),
      panelHeight =
        context.groupPanelSize?.height ??
        Math.max(140, Math.min(area.height * 0.78, area.height - 20));
    const center = {
      x: area.left + x + group.x * scale,
      y: area.top + y + group.y * scale,
    };
    context.groupPanel.style.width = panelWidth + 'px';
    context.groupPanel.style.height = panelHeight + 'px';
    if (!isDragging) {
      context.groupPanel.style.left = center.x - area.left + 'px';
      context.groupPanel.style.top = center.y - area.top + 'px';
    }
    if (!context.groupPanelSize)
      context.groupPanelSize = {
        width: panelWidth,
        height: panelHeight,
      };
    if (!context.groupPanelViewInitialized) {
      const innerHeight = panelHeight - heading,
        worldPerPixel = Math.max(
          (layoutBounds.width + 80) / panelWidth,
          (layoutBounds.height + 80) / innerHeight,
        );
      context.graph.setView({
        x: layoutBounds.x + layoutBounds.width / 2 - (panelWidth * worldPerPixel) / 2,
        y: layoutBounds.y + layoutBounds.height / 2 - (innerHeight * worldPerPixel) / 2,
        width: panelWidth * worldPerPixel,
        height: innerHeight * worldPerPixel,
      });
      context.groupPanelViewInitialized = true;
    }
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
    panel.style.width = Math.max(40, Math.min(224, area.width - 24)) + 'px';
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
    return context.graph.view();
  }
  function syncGrid() {
    const canvas = context.$('canvas'),
      v = view(),
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
      if (context.openGroup) {
        const group = context.machine.groups?.find((item) => item.id === context.openGroup),
          scale = canvasTransform(
            v,
            context.overviewCanvas.clientWidth,
            context.overviewCanvas.clientHeight,
          ).scale,
          canvas = context.$('canvas');
        if (group && scale > 0)
          context.graph.setView({
            x: group.x - canvas.clientWidth / (2 * scale),
            y: group.y - canvas.clientHeight / (2 * scale),
            width: canvas.clientWidth / scale,
            height: canvas.clientHeight / scale,
          });
      }
    } else {
      context.graph.setView(v);
      if ((context.placingState || context.placingComment) && context.commentCursor)
        context.placementPoint = context.point(context.commentCursor);
      syncGrid();
    }
    context.queueDraw();
    if (!document.body.classList.contains('properties-hidden')) showProperties(true);
  }
  function fittedView(bounds, canvas) {
    const scale = Math.max(
      (bounds.width + 100) / Math.max(220, canvas.clientWidth - 70),
      (bounds.height + 70) / Math.max(180, canvas.clientHeight - 180),
    );
    return {
      x: bounds.x + bounds.width / 2 - (canvas.clientWidth / 2) * scale,
      y: bounds.y + bounds.height / 2 - (canvas.clientHeight / 2 + 20) * scale,
      width: canvas.clientWidth * scale,
      height: canvas.clientHeight * scale,
    };
  }
  function fitGroupContents() {
    context.draw();
    showProperties(true);
  }
  function fit() {
    setView(
      fittedView(
        context.overviewView ? context.overviewGraph.bounds() : context.graph.bounds(),
        context.overviewView ? context.overviewCanvas : context.$('canvas'),
      ),
    );
  }
  function zoom(factor, p) {
    const v = context.overviewView ?? view(),
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
    e.preventDefault();
    const canvas = context.overviewView ? context.overviewCanvas : context.$('canvas');
    if (e.ctrlKey || e.metaKey) {
      if (e.deltaY)
        zoom(
          wheelZoomFactor(e.deltaY, editorSettings.pinchSensitivity),
          context.overviewView ? context.overviewGraph.point(e) : context.point(e),
        );
      return;
    }
    const v = context.overviewView ?? view(),
      unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1,
      shifted = e.deltaMode !== 0 && e.shiftKey && !e.deltaX,
      dx = shifted ? e.deltaY : e.deltaX,
      dy = shifted ? 0 : e.deltaY;
    setView({
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
    if (context.overviewView) context.draw();
    else setView(next);
    if (!document.body.classList.contains('properties-hidden')) showProperties(true);
  }
  function setOverviewView(next) {
    setView(next);
  }
  function navigateMap(e) {
    const p = context.graph.mapPoint(e, context.mapTransform ?? context.graph.mapTransform()),
      v = context.overviewView ?? view();
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
