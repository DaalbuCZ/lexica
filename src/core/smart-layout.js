import { simpleTransitionLabel } from './editor-settings.js';
import { autoLayout, crossingPairs as findCrossings, routeEdges } from './layout.js';
import { graphView, createGroup, groupFor } from './groups.js';
import { destination } from './portals.js';
import { commentAnchors, positionComments, placeCommentsAfterLayout } from './comments.js';
import { planarCoordinates, drawingClearance } from './planar-layout.js';
import { tidyTree, radialTree } from './tidy-tree.js';
import { blockLayout } from './block-layout.js';
import { compactPlanar } from './compact-planar.js';
import { linearLayout } from './linear-layout.js';
import dagre from '@dagrejs/dagre';
import { layeredLayout } from './layered-layout.js';
import { regularizeAngles } from './angular-layout.js';
import { applyLayout, layoutTopology } from './layout-topology.js';
import { feasibleRadial } from './feasible-layout.js';
import { placementCorridorRoutes } from './corridor-routing.js';
import { compactAesthetics } from './aesthetic-layout.js';
import { circularStartRing, orientGroupsUp } from './radial-ring.js';
import { solveComponents } from './layout-components.js';
import { alignHorizontal } from './horizontal-layout.js';
import { cycleAnalysis } from './cycle-aesthetics.js';
import { validateRouteSeparation } from './layout-validation.js';
import { polishSubgroup } from './subgroup-aesthetics.js';
import {
  polishRadialBranches,
  pullOuterBranches,
  compactRadialSpokes,
} from './radial-aesthetics.js';
const crossingPairs = (machine, routed, label) => findCrossings(machine, routed, label, true);

export function simpleBranch(machine) {
  if (!machine.start || machine.states.length > 12) return false;
  const children = new Map(machine.states.map((s) => [s.id, new Set()])),
    parents = new Map();
  for (const edge of machine.edges) {
    if (edge.from === edge.to) continue;
    if (!children.has(edge.from) || !children.has(edge.to)) return false;
    children.get(edge.from).add(edge.to);
    if (parents.has(edge.to) && parents.get(edge.to) !== edge.from) return false;
    parents.set(edge.to, edge.from);
  }
  if (parents.has(machine.start)) return false;
  const seen = new Set(),
    queue = [machine.start];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (seen.has(id)) return false;
    seen.add(id);
    queue.push(...children.get(id));
  }
  return seen.size === machine.states.length;
}
function place(machine, focus, options) {
  if (focus) {
    const group = machine.groups?.find((group) => group.id === focus);
    if (group) delete group.contextPositions;
  }
  const shown = graphView(machine, focus, false),
    copy = structuredClone(shown),
    anchors = commentAnchors(machine);
  copy.comments = [];
  if (focus) {
    const whole = structuredClone(graphView(machine, focus));
    if (linearLayout(whole, options.spacing ?? 0.75)) {
      const oldCenter =
          shown.states.reduce((sum, s) => sum + s.x, 0) / Math.max(1, shown.states.length),
        oldY = shown.states.reduce((sum, s) => sum + s.y, 0) / Math.max(1, shown.states.length),
        members = new Set(shown.states.map((s) => s.id)),
        inner = whole.states.filter((s) => members.has(s.id)),
        dx = oldCenter - inner.reduce((sum, s) => sum + s.x, 0) / inner.length;
      for (const state of whole.states) {
        state.x += dx;
        state.y += oldY;
        if (members.has(state.id))
          Object.assign(
            machine.states.find((s) => s.id === state.id),
            { x: state.x, y: state.y },
          );
      }
      const group = machine.groups.find((g) => g.id === focus);
      group.contextPositions = Object.fromEntries(
        whole.states.filter((s) => s.outside).map((s) => [s.id, { x: s.x, y: s.y }]),
      );
      for (const edge of machine.edges) if (members.has(edge.from)) delete edge.bend;
      positionComments(anchors);
      return;
    }
  }
  if (focus && !copy.start) {
    const members = new Set(copy.states.map((s) => s.id)),
      inbound = new Map();
    for (const edge of machine.edges) {
      let to;
      try {
        to = destination(machine, edge)?.id;
      } catch {
        continue;
      }
      if (!members.has(edge.from) && members.has(to)) inbound.set(to, (inbound.get(to) ?? 0) + 1);
    }
    copy.start = [...inbound].sort((a, b) => b[1] - a[1])[0]?.[0] ?? copy.states[0]?.id;
  }
  for (const edge of copy.edges) delete edge.bend;
  const analytical = planarCoordinates(copy);
  // Small directed branches read as a flow even when the surrounding graph uses a radial layout.
  const compactBranch = focus && simpleBranch(copy);
  const mode = compactBranch ? 'tree' : (options.mode ?? 'circle'),
    spacing = options.spacing ?? 0.75;
  const arrange = (candidate) => {
    if (mode === 'tree') {
      if (simpleBranch(candidate)) tidyTree(candidate, spacing);
      else layeredLayout(candidate, spacing);
    } else if (mode === 'circle') radialTree(candidate, spacing);
    else autoLayout(candidate, mode, spacing, false, options.forces ?? {}, false);
  };
  const extent = (states) =>
    states.length
      ? Math.max(
          Math.max(...states.map((s) => s.x)) - Math.min(...states.map((s) => s.x)),
          Math.max(...states.map((s) => s.y)) - Math.min(...states.map((s) => s.y)),
        )
      : 0;
  const preferFlow = focus && copy.states.length >= 11 && mode === 'tree';
  const directions = new Set(copy.edges.map((e) => JSON.stringify([e.from, e.to])));
  const forwardEdges = copy.edges.filter(
    (e) => e.from !== e.to && !directions.has(JSON.stringify([e.to, e.from])),
  );
  const cost = (candidate) => {
    const c = drawingClearance(candidate.states, candidate.edges),
      xs = candidate.states.map((s) => s.x),
      ys = candidate.states.map((s) => s.y),
      width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
      nodes = new Map(candidate.states.map((s) => [s.id, s]));
    let wire = 0,
      longest = 0;
    for (const e of candidate.edges) {
      const a = nodes.get(e.from),
        b = nodes.get(e.to);
      if (a && b) {
        const length = Math.hypot(a.x - b.x, a.y - b.y);
        wire += length;
        longest = Math.max(longest, length);
      }
    }
    let flow = 0;
    if (focus)
      for (const e of forwardEdges) {
        const a = nodes.get(e.from),
          b = nodes.get(e.to);
        if (a && b)
          flow += preferFlow
            ? Math.max(0, 170 - b.x + a.x) + Math.abs(b.y - a.y) * 0.22
            : Math.max(0, a.x - b.x) * 0.5;
      }
    let routedCrossings = 0,
      boundaryObstruction = 0,
      outsidePenalty = 0;
    if (focus) {
      const positioned = {
        ...machine,
        states: machine.states.map((state) => nodes.get(state.id) ?? state),
        groups: machine.groups?.map((group) =>
          group.id === focus
            ? {
                ...group,
                contextPositions: Object.fromEntries(
                  candidate.states.filter((s) => s.outside).map((s) => [s.id, { x: s.x, y: s.y }]),
                ),
              }
            : group,
        ),
      };
      const projected = graphView(positioned, focus);
      projected.comments = [];
      const clearance = drawingClearance(projected.states, projected.edges);
      const left = Math.min(...projected.states.filter((s) => !s.outside).map((s) => s.x));
      for (const outside of projected.states.filter((s) => s.outside))
        if (outside.x > left - 140) outsidePenalty += 10000 + outside.x - left + 140;
      if (clearance.wire < 64.99 || clearance.node < 159.99) boundaryObstruction = 100000000;
      routedCrossings += crossingPairs(projected, true, simpleTransitionLabel).length * 1000000;
    }
    return (
      (focus ? longest / 5 + wire / 60 : 0) +
      flow / 70 +
      routedCrossings +
      boundaryObstruction +
      outsidePenalty +
      c.crossings * 10000 +
      (c.wire < 64.99 || c.node < 159.99 ? 100000000 : 0) +
      Math.sqrt(width * height) / 35 +
      extent(candidate.states) / 70 +
      wire / 800
    );
  };
  const feasible =
    !focus && (options.mode ?? 'circle') === 'circle'
      ? feasibleRadial(copy, spacing, (branch) => {
          if (copy.states.length <= 32 || copy.states.some((s) => s.group)) return null;
          const trial = structuredClone(copy);
          trial.groups = [];
          const group = createGroup(trial, branch, 'Branch', () => 'layout-branch');
          place(trial, group.id, options);
          const view = graphView(trial, group.id),
            outside = view.states.filter((s) => s.outside);
          if (outside.length !== 1 || outside[0].outsideSource !== copy.start) return null;
          const refined = polishSubgroup(view);
          return {
            states: [
              ...refined.filter((s) => !s.outside),
              { ...refined.find((s) => s.outside), id: copy.start },
            ],
          };
        })
      : null;
  if (feasible?.states) {
    // Placement is accepted only with its decorations routed as well. Expansion
    // preserves the embedding and is bounded; never call global repair here.
    if (copy.states.length > 12 && !copy.edges.some((e) => e.portal != null)) {
      const original = structuredClone(feasible.states);
      let routed = false;
      for (const scale of [1, 1.4, 2]) {
        feasible.states = original.map((s) => ({ ...s, x: s.x * scale, y: s.y * scale }));
        if (
          placementCorridorRoutes(
            { ...copy, states: feasible.states, comments: [] },
            copy.edges.map(simpleTransitionLabel),
          )
        ) {
          routed = true;
          break;
        }
      }
      if (!routed) feasible.states = original;
    }
    const positions = new Map(feasible.states.map((s) => [s.id, s]));
    for (const state of shown.states) {
      const point = positions.get(state.id);
      if (state.group) {
        const group = machine.groups.find((g) => g.id === state.id),
          dx = point.x - state.x,
          dy = point.y - state.y;
        group.x = point.x;
        group.y = point.y;
        for (const member of machine.states)
          if (group.stateIds.includes(member.id)) {
            member.x += dx;
            member.y += dy;
          }
        for (const p of Object.values(group.contextPositions ?? {})) {
          p.x += dx;
          p.y += dy;
        }
      } else {
        state.x = point.x;
        state.y = point.y;
      }
    }
    for (const edge of shown.edges)
      if (!edge.groupEdge)
        delete machine.edges[edge.originalIndex ?? machine.edges.indexOf(edge)]?.bend;
    positionComments(anchors);
    return;
  }
  arrange(copy);
  let best = cost(copy),
    chosen = copy.states,
    limit = Math.max(2200, extent(copy.states) * (focus ? 2.5 : 1.5));
  if (focus) {
    const original = structuredClone(shown),
      clearance = drawingClearance(original.states, original.edges);
    if (clearance.node >= 160 && clearance.wire >= 65 && cost(original) < best) {
      chosen = original.states;
      best = cost(original);
    }
  }
  if (analytical.positions) {
    // Use the planar embedding to order branches, then assign coordinates in the
    // requested style. A grid drawing must not silently replace Radial or Tree.
    for (const offset of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const candidate = structuredClone(shown);
      candidate.start = copy.start;
      candidate.edges.sort((a, b) => {
        if (a.from !== b.from)
          return (
            candidate.states.findIndex((s) => s.id === a.from) -
            candidate.states.findIndex((s) => s.id === b.from)
          );
        const origin = analytical.positions.get(a.from),
          pa = analytical.positions.get(a.to),
          pb = analytical.positions.get(b.to);
        if (!origin || !pa || !pb) return 0;
        const angle = (p) =>
          (Math.atan2(p.y - origin.y, p.x - origin.x) + offset + Math.PI * 2) % (Math.PI * 2);
        return angle(pa) - angle(pb);
      });
      arrange(candidate);
      const next = cost(candidate);
      if (extent(candidate.states) <= limit && next < best) {
        best = next;
        chosen = candidate.states;
      }
    }
    if (mode === 'spring') {
      const candidate = structuredClone(copy);
      for (const state of candidate.states)
        Object.assign(state, analytical.positions.get(state.id));
      const next = cost(candidate);
      if (extent(candidate.states) <= limit && next < best) chosen = candidate.states;
    }
  }
  if (focus && !compactBranch) {
    const candidate = structuredClone(shown);
    candidate.start = copy.start;
    if (blockLayout(candidate, spacing)) {
      const next = cost(candidate);
      if (extent(candidate.states) <= limit && next < best) {
        best = next;
        chosen = candidate.states;
      }
    }
  }
  if (focus && copy.states.length <= 60) {
    for (const rankdir of ['LR', 'TB'])
      for (const reverse of [false, true]) {
        const candidate = structuredClone(copy),
          graph = new dagre.graphlib.Graph({ multigraph: true });
        graph.setGraph({
          rankdir,
          nodesep: Math.max(80, 120 * spacing),
          ranksep: Math.max(80, 140 * spacing),
          marginx: 0,
          marginy: 0,
          ranker: 'network-simplex',
        });
        graph.setDefaultEdgeLabel(() => ({}));
        for (const state of candidate.states) graph.setNode(state.id, { width: 100, height: 100 });
        const edges = reverse ? [...candidate.edges].reverse() : candidate.edges;
        edges.forEach((edge, index) => {
          if (edge.from !== edge.to)
            graph.setEdge(edge.from, edge.to, { weight: 1 }, String(index));
        });
        dagre.layout(graph);
        for (const state of candidate.states)
          Object.assign(state, { x: graph.node(state.id).x, y: graph.node(state.id).y });
        const next = cost(candidate);
        if (next < best) {
          best = next;
          chosen = candidate.states;
        }
      }
  }
  if (focus && !compactBranch && analytical.positions) {
    const clearance = drawingClearance(chosen, copy.edges);
    if (preferFlow || clearance.crossings || clearance.wire < 65 || clearance.node < 170) {
      const candidate = structuredClone(shown);
      candidate.start = copy.start;
      const rotations = focus
        ? [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
          ]
        : [[1, 0]];
      for (const [cos, sin] of rotations) {
        const seed = new Map(
          [...analytical.positions].map(([id, p]) => [
            id,
            {
              x: p.x * cos - p.y * sin,
              y: p.x * sin + p.y * cos,
            },
          ]),
        );
        candidate.states = compactPlanar(candidate, seed, preferFlow);
        const variants = preferFlow
          ? [
              candidate.states,
              candidate.states.map((state) => ({
                ...state,
                x: -state.x,
              })),
            ]
          : [candidate.states];
        for (const states of variants) {
          const next = cost({
            ...candidate,
            states,
          });
          if (extent(states) <= limit && next < best) {
            best = next;
            chosen = states;
          }
        }
      }
    }
  }
  if (focus && !compactBranch) {
    const whole = structuredClone(graphView(machine, focus));
    whole.start =
      whole.states.find(
        (state) => state.outside && whole.edges.some((edge) => edge.from === state.id),
      )?.id ?? copy.start;
    const planar = planarCoordinates(whole);
    if (planar.positions)
      for (const forward of [false, true])
        for (const [cos, sin] of [
          [1, 0],
          [0, 1],
        ]) {
          const seed = new Map(
            [...planar.positions].map(([id, p]) => [
              id,
              { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos },
            ]),
          );
          const candidate = { ...whole, states: compactPlanar(whole, seed, forward) },
            next = cost(candidate);
          if (next < best) {
            best = next;
            chosen = candidate.states;
          }
        }
  }
  if (focus) {
    const candidate = { ...structuredClone(copy), states: structuredClone(chosen) };
    if (candidate.states.length <= 40 && crossingPairs(candidate).length) {
      untangle(candidate);
      const next = cost(candidate);
      if (next < best) {
        best = next;
        chosen = structuredClone(candidate.states);
      }
    }
    const members = new Set(copy.states.map((state) => state.id)),
      entries = new Set(),
      outputs = new Set(
        copy.states
          .filter(
            (state) =>
              (state.token && state.accepting !== false) ||
              !copy.edges.some((edge) => edge.from === state.id && edge.to !== state.id),
          )
          .map((state) => state.id),
      );
    for (const edge of machine.edges) {
      let to;
      try {
        to = destination(machine, edge)?.id;
      } catch {
        continue;
      }
      if (!members.has(edge.from) && members.has(to)) entries.add(to);
    }
    const orientation = (states) => {
      const xs = states.map((s) => s.x),
        ys = states.map((s) => s.y),
        left = Math.min(...xs),
        right = Math.max(...xs),
        top = Math.min(...ys);
      return states.reduce(
        (sum, state) =>
          sum +
          (state.outside ? (state.x - left) * 3 : 0) +
          (entries.has(state.id) ? state.x - left + (state.y - top) * 0.25 : 0) +
          (outputs.has(state.id) ? right - state.x : 0),
        0,
      );
    };
    let preferred = orientation(chosen);
    const baseline = cost({ ...copy, states: chosen });
    for (const [cos, sin] of [
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const states = chosen.map((state) => ({
          ...state,
          x: state.x * cos - state.y * sin,
          y: state.x * sin + state.y * cos,
        })),
        candidate = { ...copy, states },
        next = cost(candidate),
        direction = orientation(states);
      if (next <= baseline + 0.001 && direction < preferred) {
        chosen = states;
        preferred = direction;
      }
    }
  }
  if (focus && !compactBranch) {
    const candidate = {
        ...structuredClone(copy),
        states: compactPlanar(copy, new Map(chosen.map((s) => [s.id, s])), false),
      },
      next = cost(candidate);
    if (next < best) {
      best = next;
      chosen = candidate.states;
    }
  }
  if (focus && chosen.length) {
    const center = (states) => ({
        x: states.reduce((sum, s) => sum + s.x, 0) / states.length,
        y: states.reduce((sum, s) => sum + s.y, 0) / states.length,
      }),
      old = center(shown.states),
      next = center(chosen.filter((state) => !state.outside));
    chosen = chosen.map((state) => ({
      ...state,
      x: state.x + old.x - next.x,
      y: state.y + old.y - next.y,
    }));
  }
  const selected = new Map(chosen.map((s) => [s.id, s]));
  for (const state of copy.states) {
    state.x = selected.get(state.id).x;
    state.y = selected.get(state.id).y;
  }
  for (const edge of shown.edges)
    if (!edge.groupEdge)
      delete machine.edges[edge.originalIndex ?? machine.edges.indexOf(edge)]?.bend;
  const positions = new Map(copy.states.map((s) => [s.id, s]));
  for (const state of shown.states) {
    const next = positions.get(state.id);
    if (!next) continue;
    if (state.group) {
      const group = machine.groups.find((g) => g.id === state.id),
        dx = next.x - state.x,
        dy = next.y - state.y;
      group.x = next.x;
      group.y = next.y;
      for (const member of machine.states)
        if (group.stateIds.includes(member.id)) {
          member.x += dx;
          member.y += dy;
        }
      for (const point of Object.values(group.contextPositions ?? {})) {
        point.x += dx;
        point.y += dy;
      }
    } else {
      state.x = next.x;
      state.y = next.y;
    }
  }
  delete machine.startViews;
  positionComments(anchors);
  if (focus) {
    const group = machine.groups?.find((group) => group.id === focus);
    if (group && chosen.some((state) => state.outside))
      group.contextPositions = Object.fromEntries(
        chosen
          .filter((state) => state.outside)
          .map((state) => [state.id, { x: state.x, y: state.y }]),
      );
    if (group)
      group.contextPositions = Object.fromEntries(
        graphView(machine, focus)
          .states.filter((state) => state.outside)
          .map((state) => [state.id, { x: state.x, y: state.y }]),
      );
  }
}

// Swapping occupied positions preserves node clearance while reducing wire crossings and detours.
export function untangle(machine) {
  if (machine.states.length > 120) return;
  const byId = new Map(machine.states.map((s) => [s.id, s]));
  const links = machine.edges
    .filter((e) => e.from !== e.to && byId.has(e.from) && byId.has(e.to))
    .map((e) => [byId.get(e.from), byId.get(e.to)]);
  const score = () => {
    let value = crossingPairs(machine).length * 10000;
    for (const [a, b] of links) {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = dx * dx + dy * dy;
      value += Math.sqrt(length) * 0.1;
      for (const s of machine.states) {
        if (s === a || s === b || !length) continue;
        const t = ((s.x - a.x) * dx + (s.y - a.y) * dy) / length;
        if (t > 0 && t < 1 && (s.x - a.x - t * dx) ** 2 + (s.y - a.y - t * dy) ** 2 < 65 ** 2)
          value += 20000;
      }
    }
    return value;
  };
  let best = score(),
    evaluations = 0;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    const pairs = crossingPairs(machine),
      involved = new Set(
        pairs.flatMap((pair) => pair.flatMap((i) => [machine.edges[i].from, machine.edges[i].to])),
      );
    if (!involved.size && pass > 0) break;
    for (let i = 0; i < machine.states.length; i++)
      for (let j = i + 1; j < machine.states.length; j++) {
        const a = machine.states[i],
          b = machine.states[j];
        if (
          a.id === machine.start ||
          b.id === machine.start ||
          (!involved.has(a.id) && !involved.has(b.id))
        )
          continue;
        if (++evaluations > 1200) return;
        [a.x, b.x] = [b.x, a.x];
        [a.y, b.y] = [b.y, a.y];
        const next = score();
        if (next < best - 0.01) {
          best = next;
          changed = true;
        } else {
          [a.x, b.x] = [b.x, a.x];
          [a.y, b.y] = [b.y, a.y];
        }
      }
    if (!changed) break;
  }
}
export function layoutQuality(machine) {
  const shown = graphView(machine),
    xs = shown.states.map((s) => s.x),
    ys = shown.states.map((s) => s.y);
  const extent = xs.length
    ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    : 0;
  const crossings = crossingPairs(shown).length;
  return {
    nodes: shown.states.length,
    crossings,
    extent,
    score: shown.states.length + crossings * 4 + extent / 500,
  };
}

// Remove the shared start hub, then find actual connected branches. Never combine unrelated islands.
export function groupingCandidates(machine) {
  const ids = new Set(
    machine.states
      .filter((s) => s.id !== machine.start && !groupFor(machine, s.id))
      .map((s) => s.id),
  );
  const neighbors = new Map([...ids].map((id) => [id, new Set()]));
  for (const edge of machine.edges) {
    let to;
    try {
      to = destination(machine, edge)?.id;
    } catch {
      continue;
    }
    if (ids.has(edge.from) && ids.has(to)) {
      neighbors.get(edge.from).add(to);
      neighbors.get(to).add(edge.from);
    }
  }
  const result = [];
  for (const first of [...ids]) {
    if (!ids.delete(first)) continue;
    const component = [first];
    for (let i = 0; i < component.length; i++)
      for (const next of neighbors.get(component[i])) if (ids.delete(next)) component.push(next);
    if (component.length >= 3 && component.length <= 30) result.push(component);
  }
  return result.sort((a, b) => b.length - a.length);
}
function arrangeTopology(machine, focus = null, options = {}) {
  if (
    !focus &&
    (options.mode ?? 'circle') === 'circle' &&
    options.smartGroups !== false &&
    !machine.groups?.length &&
    machine.states.length > 32
  ) {
    let count = 0;
    for (const ids of groupingCandidates(machine).slice(0, 8)) {
      const state = machine.states.find((s) => s.id === ids[0]);
      const group = createGroup(
        machine,
        ids,
        state?.token || state?.name || 'Branch',
        () => `auto-group-${++count}`,
      );
      group.automatic = true;
    }
    for (const group of machine.groups ?? []) place(machine, group.id, options);
    place(machine, null, options);
    return count;
  }
  if (!focus) for (const group of machine.groups ?? []) place(machine, group.id, options);
  place(machine, focus, options);
  if (
    !focus &&
    options.smartGroups === false &&
    !machine.groups?.length &&
    machine.states.length > 12 &&
    machine.states.length <= 120 &&
    crossingPairs(machine).length
  ) {
    const anchors = commentAnchors(machine);
    untangle(machine);
    positionComments(anchors);
  }
  if (focus || options.smartGroups === false) return 0;
  const quality = layoutQuality(machine);
  if (
    quality.nodes <= 32 &&
    quality.crossings <= Math.max(4, machine.edges.length * 0.12) &&
    quality.extent <= 6500
  )
    return 0;
  let count = 0;
  let nextGroupId = 0;
  for (const ids of groupingCandidates(machine)) {
    const trial = structuredClone(machine),
      entry = machine.edges.find((e) => !ids.includes(e.from) && ids.includes(e.to));
    const state = machine.states.find((s) => s.id === (entry?.to ?? ids[0]));
    const tokens = [
      ...new Set(machine.states.filter((s) => ids.includes(s.id) && s.token).map((s) => s.token)),
    ];
    let name = tokens.length === 1 ? tokens[0] : state.name || 'Branch',
      suffix = 2,
      base = name;
    while ((trial.groups ?? []).some((g) => g.name === name)) name = base + ' ' + suffix++;
    const group = createGroup(trial, ids, name, () => `auto-group-${++nextGroupId}`);
    group.automatic = true;
    place(trial, group.id, options);
    place(trial, null, options);
    if (layoutQuality(trial).score >= layoutQuality(machine).score) continue;
    machine.states = trial.states;
    machine.groups = trial.groups;
    machine.comments = trial.comments;
    count++;
  }
  return count;
}
function repairRadialCrossings(machine) {
  let crossings = crossingPairs(machine, true, simpleTransitionLabel);
  if (!crossings.length) return;
  const nodes = new Map(machine.states.map((state) => [state.id, state]));
  for (let pass = 0; crossings.length && pass < 6; pass++) {
    const affected = new Set(
      crossings.flatMap((pair) =>
        pair.flatMap((index) => [machine.edges[index].from, machine.edges[index].to]),
      ),
    );
    affected.delete(machine.start);
    let improved = false;
    for (const id of affected) {
      const state = nodes.get(id);
      const original = { x: state.x, y: state.y };
      for (const distance of [80, 160, 280, 420, 600]) {
        for (let i = 0; i < 12; i++) {
          const angle = (i * Math.PI) / 6;
          state.x = original.x + Math.cos(angle) * distance;
          state.y = original.y + Math.sin(angle) * distance;
          if (
            machine.states.some(
              (other) => other !== state && Math.hypot(state.x - other.x, state.y - other.y) < 145,
            )
          )
            continue;
          const next = crossingPairs(machine, true, simpleTransitionLabel);
          if (next.length >= crossings.length) continue;
          crossings = next;
          improved = true;
          break;
        }
        if (improved) break;
      }
      if (improved) break;
      Object.assign(state, original);
    }
    if (!improved) break;
  }
}

function shortenLocalBranches(view) {
  const nodes = new Map(view.states.map((state) => [state.id, state]));
  for (const state of view.states) {
    if (state.outside || state.group || state.id === view.start) continue;
    const neighbors = [
      ...new Set(
        view.edges.flatMap((edge) => {
          if (edge.portal != null || edge.from === edge.to) return [];
          return edge.from === state.id ? [edge.to] : edge.to === state.id ? [edge.from] : [];
        }),
      ),
    ]
      .map((id) => nodes.get(id))
      .filter(Boolean);
    const local = neighbors.filter((node) => !node.outside && node.id !== view.start);
    if (!local.length || neighbors.length > 3) continue;
    const length = () =>
      neighbors.reduce((sum, node) => sum + Math.hypot(node.x - state.x, node.y - state.y), 0);
    if (Math.max(...local.map((node) => Math.hypot(node.x - state.x, node.y - state.y))) < 350)
      continue;
    const origin = { x: state.x, y: state.y };
    const center = {
      x: local.reduce((sum, node) => sum + node.x, 0) / local.length,
      y: local.reduce((sum, node) => sum + node.y, 0) / local.length,
    };
    const baseline = drawingClearance(view.states, view.edges);
    const crossings = crossingPairs(view, true, simpleTransitionLabel).length;
    let best = { ...origin, length: length() };
    for (const fraction of [0.25, 0.5, 0.75]) {
      state.x = origin.x + (center.x - origin.x) * fraction;
      state.y = origin.y + (center.y - origin.y) * fraction;
      const candidateLength = length();
      if (candidateLength > best.length - 15) continue;
      const clearance = drawingClearance(view.states, view.edges);
      if (
        clearance.node < Math.min(160, baseline.node) ||
        clearance.wire < Math.min(65, baseline.wire) ||
        clearance.crossings > baseline.crossings ||
        crossingPairs(view, true, simpleTransitionLabel).length > crossings
      )
        continue;
      best = { x: state.x, y: state.y, length: candidateLength };
    }
    state.x = best.x;
    state.y = best.y;
  }
}
export function smartArrange(machine, focus = null, options = {}) {
  if (options.disregardGroups) focus = null;
  const result = solveLayout(layoutTopology(machine, options.disregardGroups), focus, options);
  applyLayout(machine, result.machine, focus);
  return result.groups;
}

export function solveLayout(topology, focus = null, options = {}, progress = () => {}) {
  if (!focus) {
    const components = solveComponents(topology, options, solveLayout, progress);
    if (components) return components;
  }
  const started = performance.now(),
    metrics = {};
  const atOrigin = (item) => ({ ...item, x: 0, y: 0 });
  const machine = {
    ...topology,
    states: topology.states.map(atOrigin),
    groups: topology.groups.map(atOrigin),
    comments: topology.comments.map(atOrigin),
    edges: topology.edges.map((edge) => ({ ...edge })),
    routingPolicy: (options.mode ?? 'circle') === 'circle' ? 'corridor' : undefined,
  };
  progress(0.08, 'Placing states');
  const count = arrangeTopology(machine, focus, options);
  progress(0.38, 'Refining the layout');
  metrics.placementMs = performance.now() - started;
  const refineStarted = performance.now();
  if (
    !focus &&
    !machine.groups?.length &&
    options.mode !== 'tree' &&
    options.mode !== 'circle' &&
    !machine.startViews?.length
  )
    repairRadialCrossings(machine);
  const improve = (id) => {
    const original = graphView(machine, id),
      next = structuredClone(original);
    next.comments = [];
    if (id) {
      const left = Math.min(
        ...next.states.filter((state) => !state.outside).map((state) => state.x),
      );
      const outside = next.states.filter((state) => state.outside && state.x >= left);
      for (const state of outside) {
        const oldX = state.x;
        const baseline = crossingPairs(next, true, simpleTransitionLabel).length;
        state.x = left - 175;
        const clearance = drawingClearance(next.states, next.edges);
        if (
          clearance.node < 160 ||
          clearance.wire < 65 ||
          crossingPairs(next, true, simpleTransitionLabel).length > baseline
        )
          state.x = oldX;
      }
    }
    if (options.mode !== 'tree') regularizeAngles(next);
    if (options.mode !== 'tree' && next.states.length > 5) {
      shortenLocalBranches(next);
    }
    if (id && options.mode !== 'tree' && next.states.length > 4) {
      const clearance = drawingClearance(next.states, next.edges);
      const crossings = crossingPairs(next, true, simpleTransitionLabel).length;
      for (const axis of ['x', 'y']) {
        const values = next.states.map((state) => state[axis]);
        const span = Math.max(...values) - Math.min(...values);
        if (span < 800) continue;
        const sorted = [...new Set(values)].sort((a, b) => a - b);
        const gaps = sorted
          .slice(1)
          .map((end, i) => ({ end, width: end - sorted[i] }))
          .sort((a, b) => b.width - a.width);
        for (const { end, width } of gaps.slice(0, 3)) {
          if (width < 260) continue;
          const shift = Math.min(width / 2, width - 180);
          next.states.forEach((state, i) => {
            state[axis] = values[i] - (values[i] >= end ? shift : 0);
          });
          const compact = drawingClearance(next.states, next.edges);
          if (
            compact.node >= Math.min(160, clearance.node) &&
            compact.wire >= Math.min(65, clearance.wire) &&
            compact.crossings <= clearance.crossings &&
            crossingPairs(next, true, simpleTransitionLabel).length <= crossings
          )
            break;
          next.states.forEach((state, i) => {
            state[axis] = values[i];
          });
        }
        if (next.states.some((state, i) => state[axis] !== values[i])) continue;
        const anchor = Math.min(...values);
        for (const factor of [0.65, 0.8, 0.9]) {
          next.states.forEach((state, i) => {
            state[axis] = anchor + (values[i] - anchor) * factor;
          });
          const compact = drawingClearance(next.states, next.edges);
          if (
            compact.node >= Math.min(160, clearance.node) &&
            compact.wire >= Math.min(65, clearance.wire) &&
            compact.crossings <= clearance.crossings &&
            crossingPairs(next, true, simpleTransitionLabel).length <= crossings
          )
            break;
          next.states.forEach((state, i) => {
            state[axis] = values[i];
          });
        }
      }
    }
    const baseline = crossingPairs(
      { ...original, comments: [] },
      true,
      simpleTransitionLabel,
    ).length;
    if (crossingPairs(next, true, simpleTransitionLabel).length > baseline) return;
    const positions = new Map(next.states.map((s) => [s.id, s]));
    for (const state of original.states) {
      const point = positions.get(state.id);
      if (state.group) {
        const group = machine.groups.find((g) => g.id === state.id),
          dx = point.x - state.x,
          dy = point.y - state.y;
        group.x = point.x;
        group.y = point.y;
        for (const member of machine.states)
          if (group.stateIds.includes(member.id)) {
            member.x += dx;
            member.y += dy;
          }
        for (const p of Object.values(group.contextPositions ?? {})) {
          p.x += dx;
          p.y += dy;
        }
      } else if (!state.outside) {
        state.x = point.x;
        state.y = point.y;
      }
    }
    if (id)
      machine.groups.find((g) => g.id === id).contextPositions = Object.fromEntries(
        next.states.filter((s) => s.outside).map((s) => [s.id, { x: s.x, y: s.y }]),
      );
  };
  if (focus) improve(focus);
  else {
    for (const group of machine.groups ?? []) improve(group.id);
    if (options.mode !== 'circle') improve(null);
  }
  metrics.refinementMs = performance.now() - refineStarted;
  const routingStarted = performance.now();
  progress(0.58, 'Checking transition routes');
  if ((options.mode ?? 'circle') === 'circle') {
    const certify = (id) => {
      const view = graphView(machine, id),
        baseline = drawingClearance(view.states, view.edges);
      if (baseline.crossings || view.edges.some((e) => e.portal != null || e.bend)) return;
      const original = view.states.map((s) => ({ ...s }));
      let accepted;
      for (const scale of [1, 1.25, 1.6, 2, 3]) {
        const states = original.map((s) => ({ ...s, x: s.x * scale, y: s.y * scale }));
        if (placementCorridorRoutes({ ...view, states }, view.edges.map(simpleTransitionLabel))) {
          accepted = states;
          break;
        }
      }
      if (!accepted) return;
      let preserveStartRing = false;
      if (!id) {
        const ring = circularStartRing({ ...view, states: accepted });
        preserveStartRing = ring !== accepted;
        accepted = ring;
      }
      accepted = compactAesthetics(
        { ...view, states: accepted },
        { preserveStartRing, radial: !id },
      );
      if (!id && !machine.groups?.length)
        accepted = polishRadialBranches(
          { ...view, states: accepted },
          { stats: (metrics.radialAesthetics = {}) },
        );
      if (!id && !machine.groups?.length && options.smartGroups === false) {
        accepted = pullOuterBranches({ ...view, states: accepted });
        const compacted = compactRadialSpokes({ ...view, states: accepted });
        // Moving a spoke can open a pocket for a head that was blocked earlier.
        if (compacted !== accepted) {
          accepted = pullOuterBranches({ ...view, states: compacted }, { maxRoutes: 6 });
        }
      }
      if (!id && machine.groups?.length) accepted = orientGroupsUp({ ...view, states: accepted });
      const positions = new Map(accepted.map((s) => [s.id, s]));
      for (const s of view.states) {
        const p = positions.get(s.id);
        if (s.group) {
          const g = machine.groups.find((g) => g.id === s.id),
            dx = p.x - s.x,
            dy = p.y - s.y;
          g.x = p.x;
          g.y = p.y;
          for (const member of machine.states)
            if (g.stateIds.includes(member.id)) {
              member.x += dx;
              member.y += dy;
            }
          for (const outside of Object.values(g.contextPositions ?? {})) {
            outside.x += dx;
            outside.y += dy;
          }
        } else if (!s.outside) {
          s.x = p.x;
          s.y = p.y;
        }
      }
      if (id)
        machine.groups.find((g) => g.id === id).contextPositions = Object.fromEntries(
          accepted.filter((s) => s.outside).map((s) => [s.id, { x: s.x, y: s.y }]),
        );
    };
    if (focus) certify(focus);
    else {
      for (const g of machine.groups ?? []) certify(g.id);
      certify(null);
    }
  }
  metrics.routingVerificationMs = performance.now() - routingStarted;
  if (options.mode === 'tree' || machine.groups?.length || focus) {
    const align = (id) => {
      const view = graphView(machine, id),
        candidate = { ...view };
      if (options.mode === 'tree' && cycleAnalysis(view).cycles.length) {
        const seed = id ? view : { ...view, states: polishSubgroup(view) };
        const states = compactAesthetics(seed, {
          fixedIds: view.states.filter((s) => s.outside || s.group).map((s) => s.id),
        });
        if (
          validateRouteSeparation(routeEdges({ ...view, states }, simpleTransitionLabel, true), {
            maxDepth: 24,
            maxPairs: 512,
          }).status === 'clear'
        )
          candidate.states = states;
      }
      if (id) candidate.states = polishSubgroup(candidate);
      const states = alignHorizontal(candidate),
        positions = new Map(states.map((s) => [s.id, s]));
      if (id)
        machine.groups.find((g) => g.id === id).contextPositions = Object.fromEntries(
          states.filter((s) => s.outside).map((s) => [s.id, { x: s.x, y: s.y }]),
        );
      for (const state of view.states)
        if (!state.outside && !state.group) {
          state.x = positions.get(state.id).x;
          state.y = positions.get(state.id).y;
        }
    };
    if (focus) align(focus);
    else {
      for (const g of machine.groups ?? []) align(g.id);
      if (options.mode === 'tree') align(null);
    }
  }
  const commentsStarted = performance.now();
  progress(0.9, 'Placing comments');
  placeCommentsAfterLayout(graphView(machine));
  for (const group of (machine.groups ?? []).filter((g) => !focus || g.id === focus)) {
    const shown = graphView(machine, group.id);
    shown.comments = shown.comments.filter((c) =>
      (c.nodeIds ?? (c.nodeId ? [c.nodeId] : [])).some((id) => group.stateIds.includes(id)),
    );
    placeCommentsAfterLayout(shown);
  }
  metrics.commentsMs = performance.now() - commentsStarted;
  metrics.totalMs = performance.now() - started;
  return { machine, groups: count, metrics };
}
