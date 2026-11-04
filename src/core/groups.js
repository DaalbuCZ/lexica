// Groups are a view of the same states and transitions, never a second lexer model.
import { destination } from './portals.js';
import { boundaryContext } from './boundary-layout.js';
export function groupFor(machine, stateId) {
  return (machine.groups ?? []).find((group) => group.stateIds.includes(stateId));
}
export function createGroup(machine, ids, name, makeId = () => crypto.randomUUID()) {
  const members = [...new Set(ids)].filter((id) => machine.states.some((state) => state.id === id));
  if (!members.length) throw Error('Select at least one state to make a group.');
  if (members.some((id) => groupFor(machine, id))) throw Error('A state can belong to one group.');
  const used = new Set((machine.groups ?? []).map((group) => group.id));
  for (const state of machine.states) used.add(state.id);
  let id = makeId();
  while (used.has(id)) id = makeId();
  const group = {
    id,
    name: name.trim() || 'New group',
    stateIds: members,
    x:
      machine.states.filter((s) => members.includes(s.id)).reduce((sum, s) => sum + s.x, 0) /
      members.length,
    y:
      machine.states.filter((s) => members.includes(s.id)).reduce((sum, s) => sum + s.y, 0) /
      members.length,
  };
  (machine.groups ??= []).push(group);
  return group;
}
export function dissolveGroup(machine, id) {
  machine.groups = (machine.groups ?? []).filter((group) => group.id !== id);
}
export function initializeGroupPositions(machine) {
  for (const group of machine.groups ?? []) {
    const members = machine.states.filter((s) => group.stateIds.includes(s.id));
    if (!members.length) continue;
    group.x ??= members.reduce((sum, s) => sum + s.x, 0) / members.length;
    group.y ??= members.reduce((sum, s) => sum + s.y, 0) / members.length;
  }
}
export function graphView(machine, focus = null, includeOutside = true) {
  const groups = machine.groups ?? [],
    membership = new Map(groups.flatMap((group) => group.stateIds.map((id) => [id, group.id])));
  if (!groups.length && !focus) return machine;
  if (focus && !groups.some((group) => group.id === focus)) focus = null;
  if (focus) {
    const focusedGroup = groups.find((group) => group.id === focus);
    const ids = new Set(focusedGroup.stateIds);
    const states = machine.states.filter((state) => ids.has(state.id));
    const edges = machine.edges.flatMap((edge, originalIndex) => {
      let to;
      try {
        to = destination(machine, edge)?.id;
      } catch {
        return [];
      }
      if (!ids.has(to) && !ids.has(edge.from)) return [];
      if (ids.has(edge.from) && ids.has(to))
        return [
          {
            ...edge,
            to,
            originalIndex,
          },
        ];
      if (!includeOutside) return [];
      return [
        {
          ...edge,
          to,
          portal: undefined,
          portalOffset: undefined,
          bend: undefined,
          originalIndex,
          outside: true,
        },
      ];
    });
    const context = includeOutside
      ? boundaryContext(machine, states, edges, focusedGroup.contextPositions)
      : {
          states,
          edges,
        };
    return {
      start: ids.has(machine.start) ? machine.start : null,
      ...context,
      comments: (machine.comments ?? []).filter((comment) =>
        (comment.nodeIds ?? (comment.nodeId ? [comment.nodeId] : [])).some((id) =>
          context.states.some((state) => state.id === id),
        ),
      ),
      labelBoxes: machine.labelBoxes,
    };
  }
  const states = machine.states.filter((state) => !membership.has(state.id));
  for (const group of groups) {
    const members = machine.states.filter((state) => group.stateIds.includes(state.id));
    if (!members.length) continue;
    states.push({
      id: group.id,
      name: group.name,
      token: '',
      x: group.x ?? members.reduce((sum, s) => sum + s.x, 0) / members.length,
      y: group.y ?? members.reduce((sum, s) => sum + s.y, 0) / members.length,
      group: true,
      count: members.length,
    });
  }
  const edges = [],
    groupRoutes = new Map();
  for (const [originalIndex, edge] of machine.edges.entries()) {
    let target;
    try {
      target = destination(machine, edge)?.id;
    } catch {
      continue;
    }
    const from = membership.get(edge.from) ?? edge.from,
      to = membership.get(target) ?? target;
    if (
      (from === to && membership.has(edge.from)) ||
      !states.some((s) => s.id === from) ||
      !states.some((s) => s.id === to)
    )
      continue;
    if (!membership.has(edge.from) && !membership.has(target)) {
      edges.push({
        ...edge,
        originalIndex,
      });
      continue;
    }
    const key = JSON.stringify([from, to]),
      existing = groupRoutes.get(key);
    if (existing) {
      existing.originalIndices.push(originalIndex);
      existing.labels.push(edge.label);
      continue;
    }
    const route = {
      ...edge,
      from,
      to,
      originalIndex,
      originalIndices: [originalIndex],
      labels: [edge.label],
      groupEdge: true,
      portal: undefined,
      portalOffset: undefined,
      bend: undefined,
    };
    groupRoutes.set(key, route);
    edges.push(route);
  }
  return {
    start: membership.get(machine.start) ?? machine.start,
    states,
    edges,
    comments: (machine.comments ?? []).filter(
      (comment) =>
        !(comment.nodeIds ?? (comment.nodeId ? [comment.nodeId] : [])).some((id) =>
          membership.has(id),
        ),
    ),
    labelBoxes: machine.labelBoxes,
  };
}
export function validateGroups(machine) {
  if (machine.groups === undefined) return;
  if (!Array.isArray(machine.groups)) throw Error('Invalid groups.');
  const ids = new Set(machine.states.map((state) => state.id)),
    groups = new Set(),
    members = new Set();
  for (const group of machine.groups) {
    if (
      !group ||
      typeof group.id !== 'string' ||
      groups.has(group.id) ||
      ids.has(group.id) ||
      typeof group.name !== 'string' ||
      !group.name.trim() ||
      !Array.isArray(group.stateIds) ||
      !group.stateIds.length
    )
      throw Error('Invalid group.');
    groups.add(group.id);
    if (
      (group.x !== undefined && !Number.isFinite(group.x)) ||
      (group.y !== undefined && !Number.isFinite(group.y))
    )
      throw Error('Invalid group position.');
    if (group.contextPositions !== undefined) {
      if (
        !group.contextPositions ||
        typeof group.contextPositions !== 'object' ||
        Array.isArray(group.contextPositions)
      )
        throw Error('Invalid group context positions.');
      for (const point of Object.values(group.contextPositions))
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
          throw Error('Invalid group context position.');
    }
    for (const id of group.stateIds) {
      if (!ids.has(id) || members.has(id)) throw Error('Invalid group membership.');
      members.add(id);
    }
  }
}
