import { canvasTransform } from '../core/canvas-graph.js';

/** Project a growing world-space frame at exactly the overview's scale. */
export function createGroupWindow(context) {
  const panel = context.groupPanel,
    wrap = context.canvasWrap;
  const padded = (b) => ({ x: b.x - 32, y: b.y - 32, width: b.width + 64, height: b.height + 64 });
  function positionGroupPanel(group, bounds) {
    if (!group || !bounds || !context.overviewView) return;
    const next = padded(bounds),
      size = { width: wrap.clientWidth, height: wrap.clientHeight };
    const t = canvasTransform(context.overviewView, size.width, size.height);
    if (context.groupPanelBoundsId !== group.id || !context.groupWindowBounds) {
      context.groupPanelBoundsId = group.id;
      context.groupWindowBounds = next;
      context.groupWindowOffset = {
        x: group.x - (next.x + next.width / 2),
        y: group.y - next.height - 68 - next.y,
      };
    } else {
      const old = context.groupWindowBounds,
        x = Math.min(old.x, next.x),
        y = Math.min(old.y, next.y);
      context.groupWindowBounds = {
        x,
        y,
        width: Math.max(old.x + old.width, next.x + next.width) - x,
        height: Math.max(old.y + old.height, next.y + next.height) - y,
      };
    }
    const box = context.groupWindowBounds,
      offset = context.groupWindowOffset;
    const heading = panel.querySelector('.group-overlay-heading').offsetHeight || 48;
    const left = t.x + (box.x + offset.x) * t.scale,
      top = t.y + (box.y + offset.y) * t.scale - heading;
    Object.assign(panel.style, {
      left: left + 'px',
      top: top + 'px',
      width: box.width * t.scale + 2 + 'px',
      height: box.height * t.scale + heading + 2 + 'px',
    });
    context.groupWindowWorldBounds = {
      x: box.x + offset.x,
      y: box.y + offset.y - heading / t.scale,
      width: box.width,
      height: box.height + heading / t.scale,
    };
    context.graph.setView({
      x: box.x,
      y: box.y,
      width: context.elements.canvas.clientWidth / t.scale,
      height: context.elements.canvas.clientHeight / t.scale,
    });
    context.canvasSize = {
      width: context.elements.canvas.clientWidth,
      height: context.elements.canvas.clientHeight,
    };
  }
  function installWindow() {
    const grip = panel.querySelector('[data-group-grip]');
    let drag = null;
    context.listen(grip, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      grip.setPointerCapture(event.pointerId);
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offset: { ...context.groupWindowOffset },
        scale: canvasTransform(context.overviewView, wrap.clientWidth, wrap.clientHeight).scale,
      };
    });
    context.listen(grip, 'pointermove', (event) => {
      if (drag?.id !== event.pointerId) return;
      context.groupWindowOffset = {
        x: drag.offset.x + (event.clientX - drag.x) / drag.scale,
        y: drag.offset.y + (event.clientY - drag.y) / drag.scale,
      };
      context.queueDraw();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      context.listen(grip, type, () => {
        drag = null;
      });
    context.listen(grip, 'keydown', (event) => {
      const delta = {
        ArrowLeft: [-20, 0],
        ArrowRight: [20, 0],
        ArrowUp: [0, -20],
        ArrowDown: [0, 20],
      }[event.key];
      if (!delta || !context.overviewView) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasTransform(
        context.overviewView,
        wrap.clientWidth,
        wrap.clientHeight,
      ).scale;
      context.groupWindowOffset = {
        x: context.groupWindowOffset.x + delta[0] / scale,
        y: context.groupWindowOffset.y + delta[1] / scale,
      };
      context.queueDraw();
    });
  }
  return { positionGroupPanel, installWindow };
}
