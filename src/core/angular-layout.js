const tau = Math.PI * 2;
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

/** Spread a small, isolated star by moving its leaves, so spokes can stay straight. */
export function regularizeAngles(machine) {
  if (machine.states.length < 4 || machine.states.length > 5) return;
  if (machine.edges.some((edge) => edge.portal != null || edge.bend)) return;

  const spokes = machine.edges.filter((edge) => edge.from !== edge.to);
  if (spokes.length !== machine.states.length - 1) return;
  const hub = machine.states.find(
    (state) =>
      !state.outside && spokes.every((edge) => edge.from === state.id || edge.to === state.id),
  );
  if (!hub) return;

  const leafIds = new Set(spokes.map((edge) => (edge.from === hub.id ? edge.to : edge.from)));
  const leaves = machine.states.filter((state) => leafIds.has(state.id));
  if (leaves.length !== spokes.length || leaves.filter((state) => state.outside).length > 1) return;

  const angle = (state) => Math.atan2(state.y - hub.y, state.x - hub.x);
  leaves.sort((a, b) => angle(a) - angle(b));
  const step = tau / leaves.length;
  const external = leaves.findIndex((state) => state.outside);
  const phase =
    external >= 0
      ? Math.PI - external * step
      : leaves.reduce((sum, state, i) => sum + angle(state) - i * step, 0) / leaves.length;
  const radius = Math.max(
    ...leaves.map((state) => Math.hypot(state.x - hub.x, state.y - hub.y)),
    180,
  );
  leaves.forEach((state, i) => {
    state.x = hub.x + Math.cos(phase + i * step) * radius;
    state.y = hub.y + Math.sin(phase + i * step) * radius;
  });
}
