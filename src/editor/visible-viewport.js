import { canvasTransform } from '../core/canvas-graph.js';

export function measureVisibleViewport(canvas) {
  const area = canvas.getBoundingClientRect(),
    tester = document.querySelector('.tester')?.getBoundingClientRect(),
    dock = document.body.dataset.testerDock;
  let left = 0,
    top = 0,
    right = area.width,
    bottom = area.height;
  if (
    tester &&
    tester.width > 0 &&
    tester.height > 0 &&
    !document.body.classList.contains('tester-collapsed') &&
    tester.right > area.left &&
    tester.left < area.right &&
    tester.bottom > area.top &&
    tester.top < area.bottom
  ) {
    if (dock === 'left') left = Math.max(left, tester.right - area.left);
    else if (dock === 'right') right = Math.min(right, tester.left - area.left);
    else if (dock === 'top') top = Math.max(top, tester.bottom - area.top);
    else bottom = Math.min(bottom, tester.top - area.top);
  }
  left = Math.max(0, Math.min(area.width, left));
  right = Math.max(left, Math.min(area.width, right));
  top = Math.max(0, Math.min(area.height, top));
  bottom = Math.max(top, Math.min(area.height, bottom));
  return { left, top, right, bottom, width: area.width, height: area.height };
}
export function visibleViewport(view, canvas, metrics = measureVisibleViewport(canvas)) {
  const { left, top, right, bottom, width, height } = metrics;
  const t = canvasTransform(view, width, height);
  return {
    x: (left - t.x) / t.scale,
    y: (top - t.y) / t.scale,
    width: Math.max(1, right - left) / t.scale,
    height: Math.max(1, bottom - top) / t.scale,
  };
}
