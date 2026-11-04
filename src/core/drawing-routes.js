import { finishRoute } from './route-geometry.js';
export function drawingRouteKey(machine, labels) {
  return JSON.stringify([
    machine.states,
    machine.edges,
    machine.comments,
    labels,
    machine.routingPolicy,
  ]);
}
export function savedRoutes(machine, key) {
  if (!Array.isArray(machine.drawingRoutes)) return null;
  const record = machine.drawingRoutes.find((r) => r?.key === key);
  if (!record || !Array.isArray(record.routes) || record.routes.length !== machine.edges.length)
    return null;
  const point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (
    !record.routes.every(
      (r) =>
        r &&
        [r.p0, r.c1, r.c2, r.p3, r.label].every(point) &&
        Number.isFinite(r.label.w) &&
        Number.isFinite(r.label.h) &&
        r.label.w >= 0 &&
        r.label.h >= 0,
    )
  )
    return null;
  return record.routes.map((r) => finishRoute(structuredClone(r)));
}
export function storeDrawingRoutes(machine, view, labels, routes, viewId = 'main') {
  const key = drawingRouteKey(view, labels),
    records = (Array.isArray(machine.drawingRoutes) ? machine.drawingRoutes : []).filter(
      (r) => r?.view !== viewId,
    );
  // Optional drawing metadata. Older readers ignore it; topology never consumes it.
  machine.drawingRoutes = [
    ...records.slice(-15),
    { view: viewId, key, routes: structuredClone(routes) },
  ];
}
