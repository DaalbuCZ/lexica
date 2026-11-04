import { placeFloatingRect } from './floating-placement.js';

const sides = ['top', 'bottom', 'left', 'right'];
export function nearestDock(x, y, width, height) {
  const distances = [y, height - y, x, width - x];
  return sides[distances.indexOf(Math.min(...distances))];
}
const segments = ['start', 'center', 'end'];

export function nearestDockZone(x, y, width, height) {
  const side = nearestDock(x, y, width, height);
  const fraction = side === 'top' || side === 'bottom' ? x / width : y / height;
  const segment = segments[fraction < 1 / 3 ? 0 : fraction < 2 / 3 ? 1 : 2];
  return segment === 'center' ? side : side + '-' + segment;
}

export function dockSettings(value) {
  return {
    toolbar: sides.includes(value?.toolbar) ? value.toolbar : 'top',
    tester: sides.includes(value?.tester) ? value.tester : 'bottom',
    debugger: sides.some((side) => [side, side + '-start', side + '-end'].includes(value?.debugger))
      ? value.debugger
      : 'top',
  };
}
export function placeDockedPanel(zone, size, area, obstacles, gap = 16) {
  const [side, segment] = zone.split('-');
  const centerX = (area.left + area.right - size.width) / 2;
  const centerY = (area.top + area.bottom - size.height) / 2;
  const align = (start, center, end) =>
    segment === 'start' ? start : segment === 'end' ? end : center;
  const desired = {
    x:
      side === 'left'
        ? area.left + gap
        : side === 'right'
          ? area.right - gap - size.width
          : align(area.left + gap, centerX, area.right - gap - size.width),
    y:
      side === 'top'
        ? area.top + gap
        : side === 'bottom'
          ? area.bottom - gap - size.height
          : align(area.top + gap, centerY, area.bottom - gap - size.height),
  };
  const horizontal = side === 'top' || side === 'bottom';
  const dockLane = horizontal
    ? { ...area, left: desired.x - gap, right: desired.x + size.width + gap }
    : { ...area, top: desired.y - gap, bottom: desired.y + size.height + gap };
  const centered = placeFloatingRect(desired, size, dockLane, obstacles, gap);
  const blocked = obstacles.some(
    (box) =>
      centered.x < box.right + gap &&
      centered.x + size.width > box.left - gap &&
      centered.y < box.bottom + gap &&
      centered.y + size.height > box.top - gap,
  );
  return blocked ? placeFloatingRect(desired, size, area, obstacles, gap) : centered;
}
