const tau = Math.PI * 2;
const normalize = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
export function emptyAngles(directions) {
  const angles = [...new Set(directions.map(normalize))].sort((a, b) => a - b);
  if (!angles.length) return [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  return angles
    .map((angle, index) => {
      const next = index === angles.length - 1 ? angles[0] + tau : angles[index + 1];
      return { size: next - angle, angle: normalize(angle + (next - angle) / 2) };
    })
    .sort((a, b) => b.size - a.size || a.angle - b.angle)
    .map((gap) => gap.angle);
}
export function stateDirections(machine, state) {
  const nodes = new Map(machine.states.map((s) => [s.id, s]));
  return machine.edges.flatMap((edge) => {
    if (edge.from === edge.to) return [];
    const other =
      edge.from === state.id
        ? nodes.get(edge.to)
        : edge.to === state.id
          ? nodes.get(edge.from)
          : null;
    return other ? [Math.atan2(other.y - state.y, other.x - state.x)] : [];
  });
}
export function loopSlots(machine, state) {
  const directions = stateDirections(machine, state),
    slots = new Map();
  for (const [index, edge] of machine.edges.entries())
    if (edge.from === state.id && edge.to === state.id && edge.portal == null) {
      const angle = emptyAngles(directions)[0];
      slots.set(index, angle);
      directions.push(angle);
    }
  return slots;
}
