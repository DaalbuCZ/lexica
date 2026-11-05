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
