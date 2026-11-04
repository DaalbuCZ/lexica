const tau = Math.PI * 2;
const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const crosses = (a, b, c, d) =>
  turn(a, b, c) * turn(a, b, d) < -1e-7 && turn(c, d, a) * turn(c, d, b) < -1e-7;
const distanceToSegment = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
export function angularResolution(machine) {
  const nodes = new Map(machine.states.map((s) => [s.id, s])),
    adjacency = new Map(machine.states.map((s) => [s.id, new Set()]));
  for (const edge of machine.edges)
    if (
      edge.portal == null &&
      edge.from !== edge.to &&
      nodes.has(edge.from) &&
      nodes.has(edge.to)
    ) {
      adjacency.get(edge.from).add(edge.to);
      adjacency.get(edge.to).add(edge.from);
    }
  let total = 0,
    count = 0;
  for (const [id, neighbors] of adjacency)
    if (neighbors.size >= 2) {
      const node = nodes.get(id),
        angles = [...neighbors]
          .map((id) => {
            const p = nodes.get(id);
            return Math.atan2(p.y - node.y, p.x - node.x);
          })
          .sort((a, b) => a - b),
        ideal = tau / angles.length;
      total +=
        angles.reduce(
          (sum, a, i) =>
            sum + ((i === angles.length - 1 ? angles[0] + tau : angles[i + 1]) - a - ideal) ** 2,
          0,
        ) / angles.length;
      count++;
    }
  return count ? total / count : 0;
}

/** Local geometric improvement without changing the planar embedding or moving across a wire. */
export function regularizeAngles(machine, { forward = false } = {}) {
  if (machine.states.length > 160) return;
  const nodes = new Map(machine.states.map((s) => [s.id, s])),
    adj = new Map(machine.states.map((s) => [s.id, new Set()])),
    links = [];
  for (const edge of machine.edges)
    if (
      edge.portal == null &&
      edge.from !== edge.to &&
      nodes.has(edge.from) &&
      nodes.has(edge.to)
    ) {
      adj.get(edge.from).add(edge.to);
      adj.get(edge.to).add(edge.from);
      if (
        !links.some(
          ([a, b]) =>
            (a.id === edge.from && b.id === edge.to) || (a.id === edge.to && b.id === edge.from),
        )
      )
        links.push([nodes.get(edge.from), nodes.get(edge.to)]);
    }
  if (!links.length) return;
  if (
    links.length === machine.states.length - 1 &&
    [...adj.values()].every((neighbors) => neighbors.size <= 2)
  )
    return;
  const neighborOrder = new Map(
    machine.states.map((s) => [
      s.id,
      [...adj.get(s.id)].sort(
        (a, b) =>
          Math.atan2(nodes.get(a).y - s.y, nodes.get(a).x - s.x) -
          Math.atan2(nodes.get(b).y - s.y, nodes.get(b).x - s.x),
      ),
    ]),
  );
  const average =
    links.reduce((sum, [a, b]) => sum + Math.hypot(a.x - b.x, a.y - b.y), 0) / links.length;
  const hub = machine.states.find((s) => adj.get(s.id).size === machine.states.length - 1);
  if (hub) {
    const leaves = machine.states.filter((s) => s !== hub),
      radii = leaves.map((s) => Math.hypot(s.x - hub.x, s.y - hub.y));
    if (
      Math.max(...radii) - Math.min(...radii) < 1e-6 &&
      leaves.every((s) => adj.get(s.id).size === adj.get(leaves[0].id).size) &&
      angularResolution({
        states: machine.states,
        edges: machine.edges.filter((e) => e.from === hub.id || e.to === hub.id),
      }) < 1e-10
    )
      return;
    if (links.length === leaves.length) {
      leaves.sort(
        (a, b) => Math.atan2(a.y - hub.y, a.x - hub.x) - Math.atan2(b.y - hub.y, b.x - hub.x),
      );
      const step = tau / leaves.length,
        external = leaves.findIndex((s) => s.outside),
        phase =
          external >= 0
            ? Math.PI - external * step
            : leaves.reduce(
                (sum, s, i) => sum + Math.atan2(s.y - hub.y, s.x - hub.x) - i * step,
                0,
              ) / leaves.length,
        radius = Math.max(average, 180 / (2 * Math.sin(Math.PI / leaves.length)));
      leaves.forEach((s, i) => {
        s.x = hub.x + Math.round(Math.cos(phase + i * step) * radius * 1e8) / 1e8;
        s.y = hub.y + Math.round(Math.sin(phase + i * step) * radius * 1e8) / 1e8;
      });
      return;
    }
  }
  const minNode =
    Math.min(
      170,
      ...machine.states.flatMap((a, i) =>
        machine.states.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
      ),
    ) * 0.999999;
  const minWire =
    Math.min(
      65,
      ...links.flatMap(([a, b]) =>
        machine.states.filter((s) => s !== a && s !== b).map((s) => distanceToSegment(s, a, b)),
      ),
    ) * 0.999999;
  const angularCost = (s) => {
    const neighbors = [...adj.get(s.id)];
    if (neighbors.length < 2) return 0;
    const angles = neighbors
        .map((id) => {
          const n = nodes.get(id);
          return Math.atan2(n.y - s.y, n.x - s.x);
        })
        .sort((a, b) => a - b),
      ideal = tau / angles.length;
    return (
      (angles.reduce(
        (sum, a, i) =>
          sum + ((i === angles.length - 1 ? angles[0] + tau : angles[i + 1]) - a - ideal) ** 2,
        0,
      ) /
        angles.length) *
      (neighbors.length === 2 ? 0.35 : 1)
    );
  };
  const canMove = (node, old) => {
    for (const other of machine.states)
      if (other !== node && distanceToSegment(other, old, node) < minNode) return false;
    for (const [a, b] of links)
      if (a !== node && b !== node) {
        if (distanceToSegment(node, a, b) < minWire || crosses(old, node, a, b)) return false;
        for (const id of adj.get(node.id)) {
          const n = nodes.get(id);
          if (n !== a && n !== b && crosses(node, n, a, b) && !crosses(old, n, a, b)) return false;
        }
      }
    for (const id of adj.get(node.id)) {
      const n = nodes.get(id);
      for (const other of machine.states)
        if (other !== node && other !== n && distanceToSegment(other, node, n) < minWire)
          return false;
      const order = neighborOrder.get(id);
      if (order.length < 3) continue;
      const index = order.indexOf(node.id),
        before = nodes.get(order[(index + order.length - 1) % order.length]),
        after = nodes.get(order[(index + 1) % order.length]);
      const angle = (p) => Math.atan2(p.y - n.y, p.x - n.x),
        positive = (a) => ((a % tau) + tau) % tau;
      if (positive(angle(node) - angle(before)) >= positive(angle(after) - angle(before)))
        return false;
    }
    const order = neighborOrder.get(node.id);
    if (order.length >= 3) {
      const sorted = [...adj.get(node.id)].sort(
          (a, b) =>
            Math.atan2(nodes.get(a).y - node.y, nodes.get(a).x - node.x) -
            Math.atan2(nodes.get(b).y - node.y, nodes.get(b).x - node.x),
        ),
        first = sorted.indexOf(order[0]);
      if (!order.every((id, i) => sorted[(first + i) % order.length] === id)) return false;
    }
    return true;
  };
  const cost = (node) => {
    let total =
      angularCost(node) +
      [...adj.get(node.id)].reduce((sum, id) => sum + angularCost(nodes.get(id)), 0);
    for (const id of adj.get(node.id)) {
      const n = nodes.get(id);
      total += (Math.hypot(node.x - n.x, node.y - n.y) / average) * 0.06;
    }
    if (forward)
      for (const edge of machine.edges)
        if (
          edge.from !== edge.to &&
          (edge.from === node.id || edge.to === node.id) &&
          !machine.edges.some((e) => e.from === edge.to && e.to === edge.from)
        ) {
          const a = nodes.get(edge.from),
            b = nodes.get(edge.to);
          if (a && b) total += (Math.max(0, a.x - b.x) / average) * 0.16;
        }
    if (forward) {
      const left = Math.min(...machine.states.filter((s) => !s.outside).map((s) => s.x));
      for (const outside of machine.states.filter((s) => s.outside))
        total += (Math.max(0, outside.x - left + 150) / average) * 5;
    }
    return total;
  };
  for (const step of [40, 24, 12, 6])
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const node of machine.states) {
        const old = { x: node.x, y: node.y };
        let best = { ...old, cost: cost(node) };
        for (let i = 0; i < 8; i++) {
          node.x = old.x + Math.cos((i * Math.PI) / 4) * step;
          node.y = old.y + Math.sin((i * Math.PI) / 4) * step;
          const next = cost(node);
          if (next < best.cost - 1e-5 && canMove(node, old))
            best = { x: node.x, y: node.y, cost: next };
        }
        node.x = best.x;
        node.y = best.y;
        moved ||= best.x !== old.x || best.y !== old.y;
      }
      if (!moved) break;
    }
}
