import { placeFloatingRect } from './floating-placement.js';

const sides = ['top', 'bottom', 'left', 'right'];
export function nearestDock(x, y, width, height) {
  const distances = [y, height - y, x, width - x];
  return sides[distances.indexOf(Math.min(...distances))];
}
export function dockSettings(value) {
  return {
    toolbar: sides.includes(value?.toolbar) ? value.toolbar : 'top',
    tester: sides.includes(value?.tester) ? value.tester : 'bottom',
    debugger: sides.includes(value?.debugger) ? value.debugger : 'top',
  };
}
export function placeDockedPanel(side, size, area, obstacles, gap = 16) {
  const centerX = (area.left + area.right - size.width) / 2;
  const centerY = (area.top + area.bottom - size.height) / 2;
  const desired = {
    x:
      side === 'left'
        ? area.left + gap
        : side === 'right'
          ? area.right - gap - size.width
          : centerX,
    y:
      side === 'top'
        ? area.top + gap
        : side === 'bottom'
          ? area.bottom - gap - size.height
          : centerY,
  };
  const horizontal = side === 'top' || side === 'bottom';
  const centeredLane = horizontal
    ? { ...area, left: centerX - gap, right: centerX + size.width + gap }
    : { ...area, top: centerY - gap, bottom: centerY + size.height + gap };
  const centered = placeFloatingRect(desired, size, centeredLane, obstacles, gap);
  const blocked = obstacles.some(
    (box) =>
      centered.x < box.right + gap &&
      centered.x + size.width > box.left - gap &&
      centered.y < box.bottom + gap &&
      centered.y + size.height > box.top - gap,
  );
  return blocked ? placeFloatingRect(desired, size, area, obstacles, gap) : centered;
}
