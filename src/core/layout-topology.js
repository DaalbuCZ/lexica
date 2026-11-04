export function layoutTopology(machine, disregardGroups = false) {
  return {
    start: machine.start,
    states: machine.states.map(({ x, y, portalOffset, ...state }) => state),
    edges: machine.edges.map(({ bend, portalOffset, ...edge }) => edge),
    groups: disregardGroups
      ? []
      : (machine.groups ?? []).map(({ x, y, contextPositions, ...group }) => group),
    comments: (machine.comments ?? []).map(({ x, y, ...comment }) => comment),
    labelBoxes: machine.labelBoxes,
  };
}

export function applyLayout(machine, drawing, focus) {
  delete machine.drawingRoutes;
  if(drawing.routingPolicy) machine.routingPolicy=drawing.routingPolicy;
  else delete machine.routingPolicy;
  const members = focus
    ? new Set(machine.groups?.find((group) => group.id === focus)?.stateIds)
    : null;
  const states = new Map(drawing.states.map((state) => [state.id, state]));
  const comments = new Map(drawing.comments.map((comment) => [comment.id, comment]));
  for (const state of machine.states) {
    if (members && !members.has(state.id)) continue;
    const { x, y } = states.get(state.id);
    Object.assign(state, { x, y });
    delete state.portalOffset;
  }
  machine.edges.forEach((edge, index) => {
    if (members && !(members.has(edge.from) && members.has(edge.to))) return;
    delete edge.bend;
    delete edge.portalOffset;
    if (drawing.edges[index].bend) edge.bend = drawing.edges[index].bend;
  });
  if (members) {
    const group = machine.groups.find((item) => item.id === focus);
    group.contextPositions = drawing.groups.find((item) => item.id === focus).contextPositions;
  } else {
    if (machine.groups || drawing.groups.length) machine.groups = drawing.groups;
    delete machine.startViews;
    if (drawing.startViews) machine.startViews = drawing.startViews;
  }
  for (const comment of machine.comments ?? []) {
    const placed = comments.get(comment.id);
    const ids = placed.nodeIds ?? (placed.nodeId ? [placed.nodeId] : []);
    if (!ids.length || (members && !ids.some((id) => members.has(id)))) continue;
    comment.x = placed.x;
    comment.y = placed.y;
  }
}
