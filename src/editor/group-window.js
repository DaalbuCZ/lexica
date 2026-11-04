import { canvasTransform } from '../core/canvas-graph.js';

export function createGroupWindow(context) {
  const panel = context.groupPanel,
    wrap = context.canvasWrap;
  // A small world-space gutter avoids resizing the backing canvas for subpixel
  // changes in routed labels and control points during a drag.
  const padded = (b) => {
    const x = Math.floor((b.x - 32) / 16) * 16,
      y = Math.floor((b.y - 32) / 16) * 16;
    return {
      x,
      y,
      width: Math.ceil((b.x + b.width + 32) / 16) * 16 - x,
      height: Math.ceil((b.y + b.height + 32) / 16) * 16 - y,
    };
  };
  function positionGroupPanel(group, bounds) {
    if (!group || !bounds || !context.overviewView) return;
    const next = padded(bounds),
      t = canvasTransform(context.overviewView, wrap.clientWidth, wrap.clientHeight),
      heading = panel.querySelector('.group-overlay-heading').offsetHeight || 48;
    const opening = context.groupPanelBoundsId !== group.id || !context.groupWindowInitialBounds;
    if (opening) {
      context.groupPanelBoundsId = group.id;
      context.groupWindowInitialBounds = next;
      context.groupWindowOffset = {
        x: group.x - next.x - next.width / 2 - 1 / t.scale,
        y: group.y - next.y - next.height / 2 + heading / (2 * t.scale) - 1 / t.scale,
      };
    }
    const initial = context.groupWindowInitialBounds,
      x = Math.min(initial.x, next.x),
      y = Math.min(initial.y, next.y);
    const box = (context.groupWindowBounds = {
      x,
      y,
      width: Math.max(initial.x + initial.width, next.x + next.width) - x,
      height: Math.max(initial.y + initial.height, next.y + next.height) - y,
    });
    const offset = context.groupWindowOffset;
    const key = [t.x, t.y, t.scale, box.x, box.y, box.width, box.height, heading].join(':');
    if (!opening && context.groupWindowPositionKey === key) return false;
    context.groupWindowPositionKey = key;
    Object.assign(panel.style, {
      left: t.x + (box.x + offset.x) * t.scale + 'px',
      top: t.y + (box.y + offset.y) * t.scale - heading + 'px',
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
    if (opening && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (context.groupTintOpening) {
        context.groupTintAnimation?.cancel();
        context.groupTintAnimation = context.overviewCanvas.animate(
          [{ opacity: 1 }, { opacity: 0.4 }],
          { duration: 170, easing: 'ease-out' },
        );
        context.groupTintOpening = false;
      }
      context.groupAnimation?.cancel();
      panel.style.pointerEvents = 'none';
      const animation = panel.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
        duration: 170,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
      context.groupAnimation = animation;
      animation.finished
        .then(() => {
          if (context.groupAnimation === animation && !context.groupClosing)
            panel.style.pointerEvents = '';
        })
        .catch(() => {});
    }
    return true;
  }
  return { positionGroupPanel };
}
