import { loopAngles, applyBend } from './layout.js';
import { visualMachine } from './start-views.js';
import { portalBoxAtTip } from './portals.js';
/** Linear-time drag geometry. Full obstacle routing runs again after release. */
export function interactiveRoutes(machine, label, snapshot) {
  machine = visualMachine(machine);
  if (snapshot && snapshot.routes.length === machine.edges.length) {
    const nodes = new Map(machine.states.map((state) => [state.id, state]));
    return machine.edges.map((edge, index) => {
      const route = snapshot.routes[index],
        delta = (id) => ({
          x: nodes.get(id).x - snapshot.nodes.get(id).x,
          y: nodes.get(id).y - snapshot.nodes.get(id).y,
        }),
        a = delta(edge.from),
        b = edge.portal != null ? a : delta(edge.to),
        move = (point, d) => ({ ...point, x: point.x + d.x, y: point.y + d.y });
      if (!a.x && !a.y && !b.x && !b.y) return route;
      const next = {
        ...route,
        p0: move(route.p0, a),
        c1: move(route.c1, a),
        p3: move(route.p3, b),
        c2: move(route.c2, b),
        label: move(route.label, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        portalBox: route.portalBox ? move(route.portalBox, a) : undefined,
      };
      next.d = `M ${next.p0.x} ${next.p0.y} C ${next.c1.x} ${next.c1.y} ${next.c2.x} ${next.c2.y} ${next.p3.x} ${next.p3.y}`;
      return next;
    });
  }
  const nodes = new Map(machine.states.map((s) => [s.id, s])),
    directions = new Set(machine.edges.map((e) => e.from + '\0' + e.to)),
    loops = new Map(),
    angles = new Map();
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return machine.edges.map((edge) => {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    let route;
    if (edge.portal != null) {
      const offset = edge.portalOffset ?? { x: 140, y: 0 },
        length = Math.hypot(offset.x, offset.y) || 1,
        p0 = { x: a.x + (offset.x / length) * 37, y: a.y + (offset.y / length) * 37 },
        p3 = { x: a.x + offset.x, y: a.y + offset.y };
      route = {
        p0,
        p3,
        c1: lerp(p0, p3, 1 / 3),
        c2: lerp(p0, p3, 2 / 3),
        portalBox: portalBoxAtTip(edge.portal, p3, offset.x < 0 ? 'right' : 'left'),
      };
    } else if (a === b) {
      if (!angles.has(a.id)) angles.set(a.id, loopAngles(machine, a)[0]);
      const lane = loops.get(a.id) ?? 0;
      loops.set(a.id, lane + 1);
      const angle = angles.get(a.id) + Math.PI / 2,
        size = 80 + lane * 24,
        rotate = (x, y) => ({
          x: a.x + x * Math.cos(angle) - y * Math.sin(angle),
          y: a.y + x * Math.sin(angle) + y * Math.cos(angle),
        });
      route = {
        p0: rotate(-22, -29),
        c1: rotate(-size, -size * 1.45),
        c2: rotate(size, -size * 1.45),
        p3: rotate(22, -29),
      };
    } else {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy) || 1,
        bend = directions.has(edge.to + '\0' + edge.from) ? 90 : 0,
        mid = {
          x: (a.x + b.x) / 2 - (dy / length) * bend,
          y: (a.y + b.y) / 2 + (dx / length) * bend,
        };
      const attach = (s, p) => {
        const l = Math.hypot(p.x - s.x, p.y - s.y) || 1;
        return { x: s.x + ((p.x - s.x) / l) * 37, y: s.y + ((p.y - s.y) / l) * 37 };
      };
      const p0 = attach(a, mid),
        p3 = attach(b, mid);
      route = { p0, p3, c1: lerp(p0, mid, 2 / 3), c2: lerp(p3, mid, 2 / 3) };
    }
    const middle = {
      x: (route.p0.x + 3 * route.c1.x + 3 * route.c2.x + route.p3.x) / 8,
      y: (route.p0.y + 3 * route.c1.y + 3 * route.c2.y + route.p3.y) / 8,
    };
    route.label = { x: middle.x, y: middle.y - 13, w: String(label(edge)).length * 7 + 14, h: 22 };
    applyBend(route, edge, a, edge.portal != null ? null : b);
    route.d = `M ${route.p0.x} ${route.p0.y} C ${route.c1.x} ${route.c1.y} ${route.c2.x} ${route.c2.y} ${route.p3.x} ${route.p3.y}`;
    return route;
  });
}
