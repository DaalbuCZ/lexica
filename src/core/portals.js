export function destination(machine, edge) {
  if (edge.portal == null) return machine.states.find((s) => s.id === edge.to);
  const matches = machine.states.filter((s) => s.portal && s.portal === edge.portal);
  if (!matches.length) throw Error(`Portal "${edge.portal}" has no destination.`);
  if (matches.length > 1) throw Error(`Portal "${edge.portal}" has multiple destinations.`);
  return matches[0];
}
export function enablePortal(machine, edge) {
  const target = machine.states.find((s) => s.id === edge.to);
  if (!target.portal) {
    const base = target.name.trim().toUpperCase() || 'STATE';
    let name = base,
      suffix = 2;
    while (machine.states.some((s) => s.portal === name)) name = base + '_' + suffix++;
    target.portal = name;
  }
  edge.portal = target.portal;
}
export function renamePortal(machine, state, name) {
  const old = state.portal;
  if (old && name && machine.states.filter((s) => s.portal === old).length === 1)
    for (const edge of machine.edges) if (edge.portal === old) edge.portal = name;
  state.portal = name;
}
export function portalBoxAtTip(name, tip, side) {
  const w = Math.max(60, (name?.length ?? 0) * 7 + 20);
  return {
    x: tip.x + (side === 'left' ? w / 2 : -w / 2),
    y: tip.y,
    w,
    h: 22,
    side,
  };
}
export function portalTip(box) {
  return {
    x: box.x + (box.side === 'right' ? box.w / 2 : -box.w / 2),
    y: box.y,
  };
}
export function statePortalBox(s) {
  const offset = s.portalOffset ?? {
      x: -90,
      y: 0,
    },
    tip = {
      x: s.x + offset.x,
      y: s.y + offset.y,
    };
  return portalBoxAtTip(s.portal, tip, offset.x < 0 ? 'right' : 'left');
}
