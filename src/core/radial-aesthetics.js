import { polishSubgroup } from './subgroup-aesthetics.js';
import { drawingClearance } from './planar-layout.js';
import { placementCorridorRoutes } from './corridor-routing.js';
import { simpleTransitionLabel } from './editor-settings.js';

// Work in outward-facing branch frames, but certify against the complete
// drawing. Local feasibility alone cannot rule out collisions with a neighbor.
export function polishRadialBranches(machine, { maxRoutes = 32, stats = {} } = {}) {
  Object.assign(stats, {
    regions: 0,
    candidates: 0,
    accepted: 0,
    routeChecks: 0,
    budgetExhausted: false,
  });
  const root = machine.states.find((s) => s.id === machine.start);
  if (
    !root ||
    machine.states.some((s) => s.group) ||
    machine.edges.some((e) => e.portal != null || e.bend)
  )
    return machine.states;
  const adjacency = new Map(machine.states.map((s) => [s.id, new Set()]));
  for (const e of machine.edges)
    if (e.from !== e.to && adjacency.has(e.from) && adjacency.has(e.to)) {
      adjacency.get(e.from).add(e.to);
      adjacency.get(e.to).add(e.from);
    }
  const remaining = new Set(machine.states.filter((s) => s !== root).map((s) => s.id)),
    branches = [];
  while (remaining.size) {
    const ids = [remaining.values().next().value];
    remaining.delete(ids[0]);
    for (let i = 0; i < ids.length; i++)
      for (const id of adjacency.get(ids[i])) if (remaining.delete(id)) ids.push(id);
    if (ids.length > 1 && ids.length <= 24) branches.push(ids);
    else if (ids.length > 24) {
      // A large connected branch can still contain small articulation-side
      // regions. Include the articulation so its boundary can be pinned.
      const whole = new Set(ids),
        seen = new Set();
      for (const cut of ids.slice(0, 64)) {
        const rest = new Set(ids.filter((id) => id !== cut));
        while (rest.size) {
          const part = [rest.values().next().value];
          rest.delete(part[0]);
          for (let i = 0; i < part.length; i++)
            for (const id of adjacency.get(part[i]))
              if (whole.has(id) && rest.delete(id)) part.push(id);
          if (part.length >= ids.length - 1 || part.length > 23) continue;
          const chunk = [...part, cut].sort(),
            key = JSON.stringify(chunk);
          if (!seen.has(key) && branches.length < 64) {
            seen.add(key);
            branches.push(chunk);
          }
        }
      }
    }
  }
  let states = machine.states,
    checked = 0;
  // Favor substantial regions over trivial terminal pairs, with bounded work
  // even on a chart containing thousands of independent branches.
  branches.sort((a, b) => b.length - a.length);
  branches.length = Math.min(branches.length, 64);
  const labels = machine.edges.map(simpleTransitionLabel),
    baseline = drawingClearance(states, machine.edges),
    maximumRadius = Math.max(...states.map((s) => Math.hypot(s.x - root.x, s.y - root.y)));
  if (baseline.crossings) return states;
  for (const branch of branches) {
    if (checked >= maxRoutes) break;
    stats.regions++;
    const ids = new Set(branch),
      nodes = new Map(states.map((s) => [s.id, s])),
      anchors = branch
        .filter((id) => [...adjacency.get(id)].some((next) => !ids.has(next)))
        .sort(
          (a, b) =>
            Math.hypot(nodes.get(a).x - root.x, nodes.get(a).y - root.y) -
              Math.hypot(nodes.get(b).x - root.x, nodes.get(b).y - root.y) || a.localeCompare(b),
        );
    if (!anchors.length) continue;
    const anchor = nodes.get(anchors[0]),
      mean = anchors
        .map((id) => nodes.get(id))
        .reduce((p, s) => ({ x: p.x + s.x - root.x, y: p.y + s.y - root.y }), { x: 0, y: 0 }),
      angle = Math.atan2(mean.y, mean.x),
      cos = Math.cos(angle),
      sin = Math.sin(angle),
      toLocal = (s) => ({
        ...s,
        x: (s.x - anchor.x) * cos + (s.y - anchor.y) * sin,
        y: -(s.x - anchor.x) * sin + (s.y - anchor.y) * cos,
      }),
      fixed = new Set(anchors),
      toWorld = (s) =>
        fixed.has(s.id)
          ? nodes.get(s.id)
          : { ...s, x: anchor.x + s.x * cos - s.y * sin, y: anchor.y + s.x * sin + s.y * cos },
      local = {
        ...machine,
        start: anchor.id,
        comments: [],
        groups: [],
        states: branch.map((id) => toLocal(nodes.get(id))),
        edges: machine.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
      };
    let accepted = states;
    polishSubgroup(local, {
      fixedIds: anchors,
      maxRoutes: 8,
      radialOrigin: toLocal(root),
      acceptCandidate: (candidate) => {
        stats.candidates++;
        if (checked >= maxRoutes) return false;
        const moved = new Map(candidate.map((s) => [s.id, toWorld(s)])),
          next = states.map((s) => moved.get(s.id) ?? s);
        if (next.some((s) => Math.hypot(s.x - root.x, s.y - root.y) > maximumRadius * 1.02 + 1e-6))
          return false;
        const c = drawingClearance(next, machine.edges);
        if (
          c.crossings ||
          c.node < Math.min(175, baseline.node) - 1e-6 ||
          c.wire < Math.min(70, baseline.wire) - 1e-6
        )
          return false;
        checked++;
        if (!placementCorridorRoutes({ ...machine, states: next, comments: [] }, labels))
          return false;
        accepted = next;
        stats.accepted++;
        return true;
      },
    });
    states = accepted;
  }
  stats.routeChecks = checked;
  stats.budgetExhausted = checked >= maxRoutes;
  return states;
}

// Pull small downstream regions toward their sole attachment without changing
// any of their internal geometry. The first ring and shared branches stay pinned.
export function pullOuterBranches(machine, { maxRoutes = 24 } = {}) {
  const root = machine.states.find((state) => state.id === machine.start);
  if (
    !root ||
    machine.states.some((state) => state.group) ||
    machine.edges.some((edge) => edge.portal != null || edge.bend)
  )
    return machine.states;

  const outgoing = new Map(machine.states.map(({ id }) => [id, new Set()]));
  const adjacent = new Map(machine.states.map(({ id }) => [id, new Set()]));
  for (const { from, to } of machine.edges) {
    if (from === to || !outgoing.has(from) || !outgoing.has(to)) continue;
    outgoing.get(from).add(to);
    adjacent.get(from).add(to);
    adjacent.get(to).add(from);
  }
  const depths = new Map([[root.id, 0]]);
  const queue = [root.id];
  for (const id of queue) {
    for (const next of outgoing.get(id)) {
      if (depths.has(next)) continue;
      depths.set(next, depths.get(id) + 1);
      queue.push(next);
    }
  }

  const radius = (state) => Math.hypot(state.x - root.x, state.y - root.y);
  const reachable = machine.states.filter((state) => depths.has(state.id));
  const outerRadius = reachable.reduce((max, state) => Math.max(max, radius(state)), 0);
  const candidates = reachable
    .filter((state) => depths.get(state.id) >= 2 && radius(state) >= outerRadius * 0.5)
    .sort((a, b) => radius(b) - radius(a) || depths.get(b.id) - depths.get(a.id))
    .slice(0, 64);

  const labels = machine.edges.map(simpleTransitionLabel);
  const baseline = drawingClearance(machine.states, machine.edges);
  if (baseline.crossings) return machine.states;
  let states = machine.states;
  let checked = 0,
    attempts = 0;
  for (const { id } of candidates) {
    if (checked >= maxRoutes || attempts >= 160) break;
    const depth = depths.get(id);
    const parents = [...adjacent.get(id)].filter((next) => depths.get(next) === depth - 1);
    if (parents.length !== 1) continue;
    const [parent] = parents;
    const region = new Set([id]);
    let shared = false;
    for (const member of region) {
      for (const next of adjacent.get(member)) {
        if (next === parent || region.has(next)) continue;
        if (!(depths.get(next) >= depth) || region.size >= 24) {
          shared = true;
          break;
        }
        region.add(next);
      }
      if (shared) break;
    }
    if (shared) continue;

    const nodes = new Map(states.map((state) => [state.id, state]));
    const anchor = nodes.get(parent),
      tip = nodes.get(id);
    const dx = anchor.x - tip.x,
      dy = anchor.y - tip.y;
    const length = Math.hypot(dx, dy);
    const minLength = machine.edges.reduce((minimum, edge, i) => {
      const boundary =
        (edge.from === parent && region.has(edge.to)) ||
        (edge.to === parent && region.has(edge.from));
      return boundary ? Math.max(minimum, labels[i].length * 7 + 110) : minimum;
    }, 175);
    if (length <= minLength + 24) continue;
    const maxShift = length - minLength;
    const moves = [0.85, 0.6, 0.35, 0.18].flatMap((fraction) =>
      [0, Math.PI / 12, -Math.PI / 12].map((angle) => ({ fraction, angle })),
    );
    for (const { fraction, angle } of moves) {
      if (checked >= maxRoutes || attempts >= 160) break;
      const factor = (maxShift * fraction) / length;
      const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) * factor,
        y = (dx * Math.sin(angle) + dy * Math.cos(angle)) * factor;
      const next = states.map((state) =>
        region.has(state.id) ? { ...state, x: state.x + x, y: state.y + y } : state,
      );
      if (
        next.some(
          (state) => region.has(state.id) && radius(state) >= radius(nodes.get(state.id)) - 1e-6,
        )
      )
        continue;
      attempts++;
      const clearance = drawingClearance(next, machine.edges);
      if (
        clearance.crossings ||
        clearance.node < Math.min(175, baseline.node) - 1e-6 ||
        clearance.wire < Math.min(70, baseline.wire) - 1e-6
      )
        continue;
      checked++;
      if (!placementCorridorRoutes({ ...machine, states: next, comments: [] }, labels)) continue;
      states = next;
      break;
    }
  }
  return states;
}
