import { planarCoordinates, drawingClearance } from './planar-layout.js';
import { radialTree } from './tidy-tree.js';
import { blockLayout } from './block-layout.js';

const compare = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A bounded candidate family. All inputs are solver copies, never editor objects.
export function feasibleRadial(machine, spacing = 0.75, branchSeed) {
  const model = {
    ...machine,
    states: machine.states.map((s) => ({ ...s, x: 0, y: 0 })).sort((a, b) => compare(a.id, b.id)),
    edges: [...machine.edges].sort(
      (a, b) => compare(a.from, b.from) || compare(a.to, b.to) || compare(a.label, b.label),
    ),
  };
  const analysis = planarCoordinates(model),
    candidates = [];
  const valid = (states) => {
    const c = drawingClearance(
      states,
      model.edges.filter((e) => e.portal == null),
    );
    return c.crossings === 0 && c.node >= 200 && c.wire >= 110;
  };
  const offer = (candidate) => {
    const c = drawingClearance(
      candidate.states,
      model.edges.filter((e) => e.portal == null),
    );
    if (!c.crossings && c.node > 1e-6 && c.wire > 1e-6) {
      const scale = Math.max(1, 201 / c.node, 111 / c.wire);
      candidate.states = candidate.states.map((s) => ({ ...s, x: s.x * scale, y: s.y * scale }));
    }
    if (valid(candidate.states)) candidates.push(candidate.states);
  };
  // Root-cut branches are independent planar regions. Draw each with the root
  // on its hull, then use a nonsingular affine wedge transform to assemble them.
  const rootId = model.start,
    remaining = new Set(model.states.map((s) => s.id).filter((id) => id !== rootId));
  const adjacency = new Map(model.states.map((s) => [s.id, new Set()]));
  for (const e of model.edges)
    if (e.portal == null && e.from !== e.to) {
      adjacency.get(e.from)?.add(e.to);
      adjacency.get(e.to)?.add(e.from);
    }
  const branches = [];
  for (const id of remaining) {
    remaining.delete(id);
    const branch = [id];
    for (let k = 0; k < branch.length; k++)
      for (const next of adjacency.get(branch[k]) ?? [])
        if (remaining.delete(next)) branch.push(next);
    branches.push(branch);
  }
  if (
    rootId &&
    branches.length > 1 &&
    branches.every((b) => b.some((id) => adjacency.get(id)?.has(rootId)))
  ) {
    const total = branches.reduce((sum, b) => sum + Math.sqrt(b.length), 0),
      packed = [{ ...model.states.find((s) => s.id === rootId), x: 0, y: 0 }];
    let cursor = -Math.PI;
    for (const branch of branches) {
      const ids = new Set([rootId, ...branch]),
        local = {
          ...model,
          states: model.states.filter((s) => ids.has(s.id)),
          edges: model.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
        };
      const seed = planarCoordinates(local);
      if (!seed.positions) {
        packed.length = 0;
        break;
      }
      const localCandidate = branchSeed?.(branch) ?? feasibleRadial(local, spacing);
      if (localCandidate.states) {
        const root = localCandidate.states.find((s) => s.id === rootId),
          angles = localCandidate.states
            .filter((s) => s.id !== rootId)
            .map((s) => Math.atan2(s.y - root.y, s.x - root.x))
            .sort((a, b) => a - b);
        const gap = Math.max(
          ...angles.map(
            (a, i) => (i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2) - a,
          ),
        );
        if (Math.PI * 2 - gap < Math.PI - 1e-5)
          seed.positions = new Map(localCandidate.states.map((s) => [s.id, s]));
      }
      const origin = seed.positions.get(rootId),
        points = local.states
          .filter((s) => s.id !== rootId)
          .map((s) => ({
            ...s,
            x: seed.positions.get(s.id).x - origin.x,
            y: seed.positions.get(s.id).y - origin.y,
          }));
      const angles = points.map((p) => Math.atan2(p.y, p.x)).sort((a, b) => a - b);
      let gap = -1,
        begin = 0;
      for (let i = 0; i < angles.length; i++) {
        const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
        if (next - angles[i] > gap) {
          gap = next - angles[i];
          begin = next;
        }
      }
      const span = Math.PI * 2 - gap,
        center = begin + span / 2;
      if (span >= Math.PI - 1e-5) {
        packed.length = 0;
        break;
      }
      const sector = (Math.PI * 2 * Math.sqrt(branch.length)) / total,
        width = Math.min(sector - 0.08, Math.PI * 0.85),
        direction = cursor + sector / 2;
      cursor += sector;
      const squeeze = span < 1e-6 ? 1 : Math.min(1, Math.tan(width / 2) / Math.tan(span / 2));
      for (const p of points) {
        const x = p.x * Math.cos(center) + p.y * Math.sin(center),
          y = (-p.x * Math.sin(center) + p.y * Math.cos(center)) * squeeze;
        p.x = x * Math.cos(direction) - y * Math.sin(direction);
        p.y = x * Math.sin(direction) + y * Math.cos(direction);
      }
      // Reserve hub fan-out space without magnifying every internal edge.
      const advance = Math.max(0, 200 / (2 * Math.sin(sector / 2)));
      for (const p of points) {
        p.x += Math.cos(direction) * advance;
        p.y += Math.sin(direction) * advance;
      }
      const c = drawingClearance([{ id: rootId, x: 0, y: 0 }, ...points], local.edges),
        scale = Math.max(1, 180 / c.node, 75 / c.wire);
      if (!Number.isFinite(scale) || c.crossings) {
        packed.length = 0;
        break;
      }
      for (const p of points) {
        p.x *= scale;
        p.y *= scale;
        packed.push(p);
      }
    }
    if (packed.length === model.states.length) {
      const c = drawingClearance(packed, model.edges),
        scale = Math.max(1, 180 / c.node, 75 / c.wire);
      if (Number.isFinite(scale) && !c.crossings) {
        for (const p of packed) {
          p.x *= scale;
          p.y *= scale;
        }
        offer({ ...model, states: packed });
      }
    }
  }
  for (let turn = 0; turn < 4; turn++) {
    const candidate = structuredClone(model);
    if (analysis.positions) {
      const angle = (e) => {
        const a = analysis.positions.get(e.from),
          b = analysis.positions.get(e.to);
        return a && b
          ? (Math.atan2(b.y - a.y, b.x - a.x) + (turn * Math.PI) / 2 + 2 * Math.PI) % (2 * Math.PI)
          : 0;
      };
      candidate.edges.sort(
        (a, b) => compare(a.from, b.from) || angle(a) - angle(b) || compare(a.to, b.to),
      );
    }
    radialTree(candidate, spacing);
    offer(candidate);
  }
  if (model.states.length <= 35) {
    const candidate = structuredClone(model);
    if (blockLayout(candidate, spacing)) offer(candidate);
  }
  if (analysis.positions)
    offer({
      ...model,
      states: model.states.map((s) => ({ ...s, ...analysis.positions.get(s.id) })),
    });
  if (!candidates.length)
    return {
      states: null,
      planar: analysis.planar,
      reason: analysis.planar ? 'no feasible seed' : 'nonplanar topology',
    };
  const nodes = new Map(),
    bundles = new Set(),
    links = [];
  for (const e of model.edges) {
    if (e.portal != null || e.from === e.to) continue;
    const key = JSON.stringify([e.from, e.to].sort(compare));
    if (!bundles.has(key)) {
      bundles.add(key);
      links.push(e);
    }
  }
  const cost = (states) => {
    nodes.clear();
    states.forEach((s) => nodes.set(s.id, s));
    let sum = 0,
      longest = 0;
    for (const e of links) {
      const a = nodes.get(e.from),
        b = nodes.get(e.to);
      if (!a || !b) continue;
      const d = length(a, b);
      sum += d;
      longest = Math.max(longest, d);
    }
    const w = Math.max(...states.map((s) => s.x)) - Math.min(...states.map((s) => s.x));
    const h = Math.max(...states.map((s) => s.y)) - Math.min(...states.map((s) => s.y));
    return sum + longest * 2 + Math.sqrt(w * h) + (w + h) * 0.3;
  };
  candidates.sort((a, b) => cost(a) - cost(b));
  const states = structuredClone(candidates[0]);
  // Preserve exact star/wheel symmetry. General cyclic graphs have no ring constraint.
  const root = states.find((s) => s.id === model.start);
  const neighbors = new Map(states.map((s) => [s.id, new Set()]));
  for (const e of links) {
    neighbors.get(e.from)?.add(e.to);
    neighbors.get(e.to)?.add(e.from);
  }
  const symmetric =
    root &&
    neighbors.get(root.id).size === states.length - 1 &&
    states.filter((s) => s !== root).every((s) => [1, 3].includes(neighbors.get(s.id).size));
  let best = cost(states),
    proposals = 0;
  if (!symmetric)
    for (let sweep = 0; sweep < 8; sweep++) {
      let changed = false;
      const positions = new Map(states.map((s) => [s.id, s]));
      if (root && branches.length > 1)
        for (const branch of branches) {
          const members = branch.map((id) => positions.get(id)),
            cx = members.reduce((sum, s) => sum + s.x, 0) / members.length,
            cy = members.reduce((sum, s) => sum + s.y, 0) / members.length,
            before = members.map((s) => ({ x: s.x, y: s.y }));
          for (const fraction of [0.5, 0.25, 0.125]) {
            proposals++;
            members.forEach((s, i) => {
              s.x = before[i].x + (root.x - cx) * fraction;
              s.y = before[i].y + (root.y - cy) * fraction;
            });
            const next = cost(states);
            if (next < best - 0.01 && valid(states)) {
              best = next;
              changed = true;
              break;
            }
            members.forEach((s, i) => Object.assign(s, before[i]));
          }
        }
      for (const s of states) {
        if (s === root) continue;
        const adjacent = [...neighbors.get(s.id)].map((id) => positions.get(id));
        if (!adjacent.length) continue;
        const target = {
          x: adjacent.reduce((v, p) => v + p.x, 0) / adjacent.length,
          y: adjacent.reduce((v, p) => v + p.y, 0) / adjacent.length,
        };
        const old = { x: s.x, y: s.y };
        for (const fraction of [0.5, 0.25, 0.125]) {
          proposals++;
          s.x = old.x + (target.x - old.x) * fraction;
          s.y = old.y + (target.y - old.y) * fraction;
          const next = cost(states);
          if (next < best - 0.01 && valid(states)) {
            best = next;
            changed = true;
            break;
          }
          Object.assign(s, old);
        }
      }
      for (const axis of ['x', 'y']) {
        const sorted = [...states].sort((a, b) => a[axis] - b[axis]);
        const gaps = sorted
          .slice(1)
          .map((s, i) => ({ i: i + 1, size: s[axis] - sorted[i][axis] }))
          .sort((a, b) => b.size - a.size)
          .slice(0, 4);
        for (const gap of gaps) {
          if (gap.size < 80) continue;
          const strip = sorted.slice(gap.i),
            before = strip.map((s) => s[axis]);
          for (const fraction of [0.5, 0.25]) {
            proposals++;
            strip.forEach((s, i) => (s[axis] = before[i] - gap.size * fraction));
            const next = cost(states);
            if (next < best - 0.01 && valid(states)) {
              best = next;
              changed = true;
              break;
            }
            strip.forEach((s, i) => (s[axis] = before[i]));
          }
        }
      }
      if (!changed) break;
    }
  return {
    states,
    planar: analysis.planar,
    proposals,
    skeleton: drawingClearance(states, model.edges),
  };
}
