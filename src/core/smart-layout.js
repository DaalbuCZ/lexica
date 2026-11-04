import { simpleTransitionLabel } from './editor-settings.js';
import { autoLayout, crossingPairs } from './layout.js';
import { graphView, createGroup, groupFor } from './groups.js';
import { destination } from './portals.js';
import { commentAnchors, positionComments, placeCommentsAfterLayout } from './comments.js';
import { planarCoordinates, drawingClearance } from './planar-layout.js';
import { tidyTree, radialTree } from './tidy-tree.js';
import { blockLayout } from './block-layout.js';
import { compactPlanar } from './compact-planar.js';
import { linearLayout } from './linear-layout.js';
import dagre from '@dagrejs/dagre';
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
      placeCommentsAfterLayout(machine);
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
    if (mode === 'tree') tidyTree(candidate, spacing);
    else if (mode === 'circle') radialTree(candidate, spacing);
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
    if (preferFlow)
      for (const e of forwardEdges) {
        const a = nodes.get(e.from),
          b = nodes.get(e.to);
        if (a && b) flow += Math.max(0, 170 - b.x + a.x) + Math.abs(b.y - a.y) * 0.22;
      }
    let routedCrossings = 0,
      boundaryObstruction = 0;
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
      const clearance = drawingClearance(projected.states, projected.edges);
      if (clearance.wire < 64.99 || clearance.node < 159.99) boundaryObstruction = 100000000;
      routedCrossings += crossingPairs(projected, true, simpleTransitionLabel).length * 1000000;
    }
    return (
      (focus ? longest / 5 + wire / 60 : 0) +
      flow / 70 +
      routedCrossings +
      boundaryObstruction +
      c.crossings * 10000 +
      (c.wire < 64.99 || c.node < 159.99 ? 100000000 : 0) +
      Math.sqrt(width * height) / 35 +
      extent(candidate.states) / 70 +
      wire / 800
    );
  };
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
  placeCommentsAfterLayout(machine);
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
export function smartArrange(machine, focus = null, options = {}) {
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
    placeCommentsAfterLayout(machine);
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
    const group = createGroup(trial, ids, name);
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
