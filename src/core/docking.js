const sides = ['top', 'bottom', 'left', 'right'];
export function nearestDock(x, y, width, height) {
  const distances = [y, height - y, x, width - x];
  return sides[distances.indexOf(Math.min(...distances))];
}
export function dockSettings(value) {
  return {
    toolbar: sides.includes(value?.toolbar) ? value.toolbar : 'top',
    tester: sides.includes(value?.tester) ? value.tester : 'bottom',
  };
}
