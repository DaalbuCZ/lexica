import { simpleTransitionLabel } from './editor-settings.js';
export function linearLayout(machine, spacing = 0.5) {
  if (!machine.states.length) return false;
  const neighbors = new Map(machine.states.map((s) => [s.id, new Set()])),
    incoming = new Map(machine.states.map((s) => [s.id, 0]));
  for (const edge of machine.edges) {
    if (edge.from === edge.to) continue;
    if (!neighbors.has(edge.from) || !neighbors.has(edge.to)) return false;
    neighbors.get(edge.from).add(edge.to);
    neighbors.get(edge.to).add(edge.from);
    incoming.set(edge.to, incoming.get(edge.to) + 1);
  }
  if (
    [...neighbors.values()].some((set) => set.size > 2) ||
    [...neighbors.values()].reduce((sum, set) => sum + set.size, 0) !==
      (machine.states.length - 1) * 2
  )
    return false;
  const ends = machine.states
    .filter((s) => neighbors.get(s.id).size <= 1)
    .sort((a, b) => (incoming.get(a.id) > 0) - (incoming.get(b.id) > 0));
  const order = [];
  let id = ends[0]?.id,
    previous = null;
  while (id) {
    order.push(id);
    const next = [...neighbors.get(id)].find((next) => next !== previous);
    previous = id;
    id = next;
  }
  if (order.length !== machine.states.length) return false;
  const gap = Math.max(
    190,
    220 * spacing,
    Math.min(
      340,
      Math.max(0, ...machine.edges.map((edge) => simpleTransitionLabel(edge).length * 7 + 90)),
    ),
  );
  const nodes = new Map(machine.states.map((s) => [s.id, s]));
  order.forEach((id, index) => Object.assign(nodes.get(id), { x: index * gap, y: 0 }));
  return true;
}
