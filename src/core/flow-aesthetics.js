// Soft preferences for left-to-right drawings. Feedback inside a strongly
// connected region has no global direction; only its boundary edges do.
export function flowAnalysis(machine) {
  const outgoing = new Map(machine.states.map((s) => [s.id, new Set()]));
  for (const e of machine.edges)
    if (e.portal == null && e.from !== e.to && outgoing.has(e.from) && outgoing.has(e.to))
      outgoing.get(e.from).add(e.to);
  const reach = new Map();
  for (const id of outgoing.keys()) {
    const seen = new Set(),
      queue = [id];
    for (let i = 0; i < queue.length; i++)
      for (const next of outgoing.get(queue[i]))
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    reach.set(id, seen);
  }
  return [...outgoing].flatMap(([from, tos]) =>
    [...tos].filter((to) => !reach.get(to).has(from)).map((to) => ({ from, to })),
  );
}
export function flowScore(edges, nodes) {
  let cost = 0;
  for (const e of edges) {
    const a = nodes.get(e.from),
      b = nodes.get(e.to),
      dx = b.x - a.x,
      dy = b.y - a.y,
      d = Math.hypot(dx, dy);
    // Flat outgoing chains and symmetric fans are preferable to steep stairs.
    cost += 0.3 * (d - dx) + Math.max(0, 100 - dx) ** 2 / 160;
  }
  return cost;
}
export function flowProposals(edges, nodes, chunks) {
  const proposals = [];
  for (const ids of chunks)
    for (const e of edges) {
      if (ids.has(e.from) === ids.has(e.to)) continue;
      const moving = ids.has(e.to),
        a = nodes.get(moving ? e.from : e.to),
        b = nodes.get(moving ? e.to : e.from),
        old = Math.atan2(b.y - a.y, b.x - a.x),
        d = Math.hypot(b.x - a.x, b.y - a.y);
      for (const angle of [0, -Math.PI / 4, Math.PI / 4]) {
        const turn = angle + (moving ? 0 : Math.PI) - old,
          cos = Math.cos(turn),
          sin = Math.sin(turn);
        proposals.push({
          ids,
          gain: d,
          targets: new Map(
            [...ids].map((id) => {
              const s = nodes.get(id),
                x = s.x - a.x,
                y = s.y - a.y;
              return [id, { x: a.x + x * cos - y * sin, y: a.y + x * sin + y * cos }];
            }),
          ),
        });
      }
    }
  return proposals;
}
