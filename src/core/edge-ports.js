const tau = Math.PI * 2,
  angleDelta = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const sample = (r, t) => ({
  x:
    (1 - t) ** 3 * r.p0.x +
    3 * (1 - t) ** 2 * t * r.c1.x +
    3 * (1 - t) * t * t * r.c2.x +
    t ** 3 * r.p3.x,
  y:
    (1 - t) ** 3 * r.p0.y +
    3 * (1 - t) ** 2 * t * r.c1.y +
    3 * (1 - t) * t * t * r.c2.y +
    t ** 3 * r.p3.y,
});
const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const intersects = (a, b, c, d) =>
  turn(a, b, c) * turn(a, b, d) < -1e-8 && turn(c, d, a) * turn(c, d, b) < -1e-8;
const distance = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** Equal angular ports in the existing cyclic order, constrained by the routed embedding. */
export function spaceEdgePorts(machine, routes) {
  const nodes = new Map(machine.states.map((s) => [s.id, s])),
    ports = new Map(machine.states.map((s) => [s.id, []])),
    paths = new WeakMap(),
    bounds = new WeakMap(),
    blockedCache = new WeakMap();
  const path = (r) => {
    if (!paths.has(r))
      paths.set(
        r,
        Array.from({ length: 17 }, (_, i) => sample(r, i / 16)),
      );
    return paths.get(r);
  };
  const crossing = (a, b, i, j) => {
    const e = machine.edges[i],
      f = machine.edges[j];
    if (
      e.from === f.from ||
      e.from === f.to ||
      e.to === f.from ||
      e.to === f.to ||
      e.portal != null ||
      f.portal != null
    )
      return false;
    const p = path(a),
      q = path(b);
    const box = (route) => {
      if (!bounds.has(route)) {
        const points = path(route),
          xs = points.map((p) => p.x),
          ys = points.map((p) => p.y);
        bounds.set(route, {
          left: Math.min(...xs),
          right: Math.max(...xs),
          top: Math.min(...ys),
          bottom: Math.max(...ys),
        });
      }
      return bounds.get(route);
    };
    const aa = box(a),
      bb = box(b);
    if (aa.right < bb.left || bb.right < aa.left || aa.bottom < bb.top || bb.bottom < aa.top)
      return false;
    for (let u = 1; u < p.length; u++)
      for (let v = 1; v < q.length; v++)
        if (intersects(p[u - 1], p[u], q[v - 1], q[v])) return true;
    return false;
  };
  const blocked = (route, index) => {
    if (blockedCache.has(route)) return blockedCache.get(route);
    const points = path(route),
      edge = machine.edges[index],
      bad = new Set();
    for (const node of machine.states) {
      const own = node.id === edge.from || (edge.portal == null && node.id === edge.to);
      for (let k = 1; k < points.length; k++) {
        if (own && (k === 1 || k === points.length - 1)) continue;
        if (distance(node, points[k - 1], points[k]) < (own ? 34 : 58)) {
          bad.add(node.id);
          break;
        }
      }
    }
    blockedCache.set(route, bad);
    return bad;
  };
  for (const [index, edge] of machine.edges.entries()) {
    if (edge.from === edge.to && edge.portal == null) {
      const state = nodes.get(edge.from),
        mid = sample(routes[index], 0.5);
      ports.get(edge.from).push({
        index,
        end: 'loop',
        angle: Math.atan2(mid.y - state.y, mid.x - state.x),
        fixed: true,
      });
      continue;
    }
    const add = (id, end) => {
      const s = nodes.get(id),
        p = routes[index][end];
      if (s)
        ports
          .get(id)
          .push({ index, end, angle: Math.atan2(p.y - s.y, p.x - s.x), fixed: !!edge.bend });
    };
    add(edge.from, 'p0');
    if (edge.portal == null) add(edge.to, 'p3');
  }
  for (const [id, list] of ports) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.angle - b.angle);
    const state = nodes.get(id),
      step = tau / list.length,
      fixed = list.map((p, i) => ({ ...p, i })).filter((p) => p.fixed),
      phase = fixed.length
        ? fixed.reduce((sum, p) => sum + p.angle - p.i * step, 0) / fixed.length
        : list.reduce((sum, p, i) => sum + p.angle - i * step, 0) / list.length;
    const affected = [...new Set(list.filter((p) => !p.fixed).map((p) => p.index))];
    if (!affected.length) continue;
    const oldBlocked = new Map(affected.map((i) => [i, blocked(routes[i], i)]));
    for (const amount of [1, 0.5, 0.25]) {
      const next = new Map(
        affected.map((i) => [
          i,
          {
            ...routes[i],
            p0: { ...routes[i].p0 },
            c1: { ...routes[i].c1 },
            c2: { ...routes[i].c2 },
            p3: { ...routes[i].p3 },
          },
        ]),
      );
      list.forEach((port, i) => {
        const route = next.get(port.index);
        if (!route) return;
        const angle = port.angle + angleDelta(phase + i * step - port.angle) * amount,
          control = port.end === 'p0' ? 'c1' : 'c2',
          old = route[port.end];
        const handle = Math.max(
          30,
          Math.min(140, Math.hypot(route[control].x - old.x, route[control].y - old.y)),
        );
        route[port.end] = { x: state.x + Math.cos(angle) * 37, y: state.y + Math.sin(angle) * 37 };
        route[control] = {
          x: state.x + Math.cos(angle) * (37 + handle),
          y: state.y + Math.sin(angle) * (37 + handle),
        };
      });
      let safe = true;
      for (const [i, route] of next) {
        if ([...blocked(route, i)].some((id) => !oldBlocked.get(i).has(id))) {
          safe = false;
          break;
        }
        for (let j = 0; j < routes.length; j++)
          if (
            i !== j &&
            crossing(route, next.get(j) ?? routes[j], i, j) &&
            !crossing(routes[i], routes[j], i, j)
          ) {
            safe = false;
            break;
          }
        if (!safe) break;
        const edge = machine.edges[i],
          reverse = machine.edges.findIndex(
            (e, j) =>
              j !== i &&
              e.portal == null &&
              edge.portal == null &&
              e.from === edge.to &&
              e.to === edge.from &&
              e.from !== e.to,
          );
        if (reverse >= 0) {
          const a = nodes.get(edge.from),
            b = nodes.get(edge.to),
            side = (r) => turn(a, b, sample(r, 0.5));
          if (side(route) * side(next.get(reverse) ?? routes[reverse]) >= -1e-5) {
            safe = false;
            break;
          }
        }
      }
      if (!safe) continue;
      for (const [index, route] of next) {
        const middle = sample(route, 0.5);
        route.label = { ...route.label, x: middle.x, y: middle.y - 13 };
        route.d =
          'M ' +
          route.p0.x +
          ' ' +
          route.p0.y +
          ' C ' +
          route.c1.x +
          ' ' +
          route.c1.y +
          ', ' +
          route.c2.x +
          ' ' +
          route.c2.y +
          ', ' +
          route.p3.x +
          ' ' +
          route.p3.y;
        routes[index] = route;
      }
      break;
    }
  }
  return routes;
}
