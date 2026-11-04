import { interactiveRoutes } from './interactive-routes.js';
import { corridorRoutes, labelBox } from './corridor-routing.js';
import { routeBounds } from './route-geometry.js';
import { SpatialIndex } from './spatial-index.js';
import { visualMachine } from './start-views.js';
import { commentLayout } from './comments.js';

const union = (a, b) => ({
  left: Math.min(a.left, b.left),
  right: Math.max(a.right, b.right),
  top: Math.min(a.top, b.top),
  bottom: Math.max(a.bottom, b.bottom),
});
const nodeBox = (s) => ({ left: s.x - 60, right: s.x + 60, top: s.y - 60, bottom: s.y + 60 });
/** Route-only free-drag repair. Nodes outside the selection are never moved.
 * Failure retains the endpoint-transport preview and is explicitly unverified. */
export function repairDraggedRoutes(machine, label, snapshot, { maxDirty = 64 } = {}) {
  machine = visualMachine(machine);
  const routes = interactiveRoutes(machine, label, snapshot),
    index = new SpatialIndex(),
    dirty = new Set(),
    moved = new Set();
  if (!snapshot || snapshot.routes.length !== machine.edges.length)
    return {
      routes,
      status: 'unverified',
      dirty: machine.edges.map((_, i) => i),
      reason: 'missing snapshot',
    };
  for (let i = 0; i < routes.length; i++)
    index.set(i, union(routeBounds(routes[i], 8), labelBox(routes[i].label)));
  const commentBox = (c) => {
    const size = commentLayout(c);
    return { left: c.x, right: c.x + size.w, top: c.y, bottom: c.y + size.h };
  };
  const oldComments = new Map((snapshot.comments ?? []).map((c) => [c.id, c]));
  for (const c of machine.comments ?? []) {
    const old = oldComments.get(c.id);
    oldComments.delete(c.id);
    if (!old || old.x !== c.x || old.y !== c.y || old.text !== c.text)
      for (const i of index.query(old ? union(commentBox(old), commentBox(c)) : commentBox(c)))
        dirty.add(i);
  }
  for (const c of oldComments.values()) for (const i of index.query(commentBox(c))) dirty.add(i);
  for (const state of machine.states) {
    const old = snapshot.nodes.get(state.id);
    if (!old || old.x !== state.x || old.y !== state.y) {
      moved.add(state.id);
      const box = old ? union(nodeBox(old), nodeBox(state)) : nodeBox(state);
      for (const i of index.query(box)) dirty.add(i);
    }
  }
  for (const [i, e] of machine.edges.entries())
    if (moved.has(e.from) || moved.has(e.to)) {
      dirty.add(i);
      for (const j of index.query(
        union(routeBounds(snapshot.routes[i], 8), routeBounds(routes[i], 8)),
      ))
        dirty.add(j);
    }
  // Lane and junction decisions are shared by every member of a dirty bundle.
  const bundles = new Set(
    [...dirty].map((i) => JSON.stringify([machine.edges[i].from, machine.edges[i].to].sort())),
  );
  machine.edges.forEach((e, i) => {
    if (bundles.has(JSON.stringify([e.from, e.to].sort()))) dirty.add(i);
  });
  if (!dirty.size) return { routes: snapshot.routes, status: 'unchanged', dirty: [] };
  if (dirty.size > maxDirty)
    return { routes, status: 'unverified', dirty: [...dirty], reason: 'region budget' };
  const repaired = corridorRoutes(machine, machine.edges.map(label), { previous: routes, dirty });
  return {
    routes: repaired ?? routes,
    status: repaired ? 'repaired' : 'unverified',
    dirty: [...dirty],
    reason: repaired ? undefined : 'fixed geometry conflict',
  };
}
