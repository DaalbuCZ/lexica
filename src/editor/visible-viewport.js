import { canvasTransform } from '../core/canvas-graph.js';

export function measureVisibleViewport(canvas) {
  const area = canvas.getBoundingClientRect(),
    tester = document.querySelector('.tester')?.getBoundingClientRect(),
    dock = document.body.dataset.testerDock;
  let left = 0,
    top = 0,
    right = area.width,
    bottom = area.height;
  if (tester) {
    if (dock === 'left') left = Math.max(left, tester.right - area.left);
    else if (dock === 'right') right = Math.min(right, tester.left - area.left);
    else if (dock === 'top') top = Math.max(top, tester.bottom - area.top);
    else bottom = Math.min(bottom, tester.top - area.top);
  }
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
