import { groupWidth, nodePort } from './labels.js';
import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from 'd3-force';
import { springSettings } from './spring-settings.js';
import { transitionLabel } from './labels.js';
import { visualMachine, startGroups } from './start-views.js';
import { simpleTransitionLabel } from './editor-settings.js';
import {
  commentLayout,
  commentAnchors,
  positionComments,
  placeCommentsAfterLayout,
} from './comments.js';
import { destination, statePortalBox, enablePortal, portalBoxAtTip } from './portals.js';
import { loopSlots } from './angular-space.js';
import { corridorRoutes } from './corridor-routing.js';
import { drawingRouteKey, savedRoutes } from './drawing-routes.js';
import { clearNodeLabels } from './label-clearance.js';
import { transitionBundles } from './graph-bundles.js';
// Each branch owns a vertical band so deeper subtrees never interleave.
export function autoLayout(
  machine,
  mode = 'tree',
  spacing = 1,
  portals = false,
  forces = {},
  groupStarts = true,
) {
  spacing = Number.isFinite(spacing) ? Math.max(0.35, Math.min(2, spacing)) : 1;
  if (!machine.states.length) return machine;
  const anchors = commentAnchors(machine);
  if (
    groupStarts &&
    mode === 'circle' &&
    machine.edges.filter((e) => e.from === machine.start && e.to !== machine.start).length >= 8
  ) {
    groupedLayout(machine, spacing);
    if (portals) portalizeCrossings(machine);
    positionComments(anchors);
    placeCommentsAfterLayout(machine);
    return machine;
  }
  delete machine.startViews;
  if (mode === 'spring') {
    springLayout(machine, spacing, forces);
    if (portals) portalizeCrossings(machine);
    positionComments(anchors);
    placeCommentsAfterLayout(machine);
    return machine;
  }
  const states = new Map(machine.states.map((s) => [s.id, s])),
    children = new Map(machine.states.map((s) => [s.id, []])),
    seen = new Set(),
    order = [],
    roots = [],
    parents = new Map();
  const outgoing = new Map(machine.states.map((s) => [s.id, []]));
  for (const e of machine.edges) {
    let target;
    try {
      target = destination(machine, e)?.id;
    } catch {
      continue;
    }
    if (target && e.from !== target) outgoing.get(e.from)?.push(target);
  }
  for (const root of [machine.start, ...states.keys()]) {
    if (!states.has(root) || seen.has(root)) continue;
    roots.push(root);
    const stack = [
      {
        id: root,
        parent: null,
      },
    ];
    while (stack.length) {
      const { id, parent } = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      parents.set(id, parent);
      if (parent !== null) children.get(parent).push(id);
      for (const next of [...outgoing.get(id)].reverse())
        if (!seen.has(next))
          stack.push({
            id: next,
            parent: id,
          });
    }
  }
  // Cross-branch transitions should not span unrelated sibling subtrees.
  const paths = new Map(),
    related = new Map();
  const pathTo = (id) => {
    if (!paths.has(id)) {
      const path = [];
      for (let p = id; p != null; p = parents.get(p)) path.push(p);
      paths.set(id, path.reverse());
    }
    return paths.get(id);
  };
  for (const [from, targets] of outgoing)
    for (const to of targets) {
      const a = pathTo(from),
        b = pathTo(to);
      let i = 0;
      while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
      if (!i || i === a.length || i === b.length) continue;
      for (const [left, right] of [
        [a[i], b[i]],
        [b[i], a[i]],
      ]) {
        if (!related.has(left)) related.set(left, new Map());
        const links = related.get(left);
        links.set(right, (links.get(right) ?? 0) + 1);
      }
    }
  for (const [parent, branches] of children) {
    const positions = new Map(branches.map((id, i) => [id, i])),
      placed = new Set(),
      ordered = [];
    for (const first of branches) {
      const stack = [first];
      while (stack.length) {
        const id = stack.pop();
        if (placed.has(id)) continue;
        placed.add(id);
        ordered.push(id);
        const neighbors = [...(related.get(id) ?? [])]
          .filter(([next]) => positions.has(next) && !placed.has(next))
          .sort((a, b) => b[1] - a[1] || positions.get(a[0]) - positions.get(b[0]));
        for (const [next] of neighbors.reverse()) stack.push(next);
      }
    }
    children.set(parent, ordered);
  }
  const heights = new Map(),
    gap = 60 * spacing;
  for (const id of [...order].reverse()) {
    const loops = machine.edges.filter(
      (e) => e.from === id && e.to === id && e.portal == null,
    ).length;
    const own = Math.max(100, (220 + Math.max(0, loops - 1) * 55) * spacing);
    const branches = children.get(id);
    heights.set(
      id,
      Math.max(
        own,
        branches.reduce((sum, c) => sum + heights.get(c), 0) +
          Math.max(0, branches.length - 1) * gap,
      ),
    );
  }
  const step = Math.max(
    120,
    Math.max(
      320,
      ...machine.edges.map(
        (e) => Math.max(transitionLabel(e).length, simpleTransitionLabel(e).length) * 7 + 180,
      ),
      ...machine.states.map((s) =>
        Math.max((s.token?.length ?? 0) * 7 + 140, (s.portal?.length ?? 0) * 7 + 280),
      ),
    ) * spacing,
  );
  const sizes = new Map();
  for (const id of [...order].reverse())
    sizes.set(id, 1 + children.get(id).reduce((sum, child) => sum + sizes.get(child), 0));
  const distantBranches = new Set();
  if (mode === 'circle' && portals && states.has(machine.start))
    for (const id of children.get(machine.start)) if (sizes.get(id) >= 4) distantBranches.add(id);
  function place() {
    if (mode === 'circle') {
      let left = 160;
      for (const root of roots) {
        const queue = [
          {
            id: root,
            depth: 0,
            start: -Math.PI / 2,
            span: 2 * Math.PI,
          },
        ];
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i],
            branches = children.get(item.id);
          item.angle = item.start + item.span / 2;
          const weight = branches.reduce((sum, id) => sum + heights.get(id) + gap, 0);
          let angle = item.start;
          for (const id of branches) {
            const span = (item.span * (heights.get(id) + gap)) / weight;
            queue.push({
              id,
              depth: item.depth + 1,
              start: angle,
              span,
            });
            angle += span;
          }
        }
        const placed = [],
          radii = new Map(),
          rootRadius = Math.max(step, (children.get(root).length * step) / 6);
        let extent = 0;
        for (const item of queue) {
          const ux = Math.cos(item.angle),
            uy = Math.sin(item.angle);
          let r = item.depth
            ? item.depth === 1
              ? rootRadius + (distantBranches.has(item.id) ? step * 3 : 0)
              : radii.get(parents.get(item.id)) + step
            : 0;
          const intervals = [];
          for (const other of placed) {
            const projection = other.x * ux + other.y * uy,
              perpendicular = other.x * uy - other.y * ux;
            if (Math.abs(perpendicular) >= step) continue;
            const offset = Math.sqrt(step * step - perpendicular * perpendicular);
            intervals.push([projection - offset, projection + offset]);
          }
          intervals.sort((a, b) => a[0] - b[0]);
          for (const [start, end] of intervals) if (r > start - 1e-8 && r < end) r = end;
          const point = {
            x: r * ux,
            y: r * uy,
          };
          placed.push(point);
          radii.set(item.id, r);
          extent = Math.max(extent, r);
        }
        const center = {
          x: left + extent,
          y: 160 + extent,
        };
        queue.forEach((item, i) => {
          const s = states.get(item.id);
          s.x = center.x + placed[i].x;
          s.y = center.y + placed[i].y;
        });
        left += extent * 2 + step;
      }
      return;
    }
    let forestTop = 100;
    for (const root of roots) {
      const queue = [
        {
          id: root,
          depth: 0,
          top: forestTop,
        },
      ];
      for (let i = 0; i < queue.length; i++) {
        const { id, depth, top } = queue[i],
          s = states.get(id),
          branches = children.get(id);
        s.x = 160 + depth * step;
        s.y = top + heights.get(id) / 2;
        const childHeight =
          branches.reduce((sum, c) => sum + heights.get(c), 0) +
          Math.max(0, branches.length - 1) * gap;
        let childTop = top + (heights.get(id) - childHeight) / 2;
        for (const child of branches) {
          queue.push({
            id: child,
            depth: depth + 1,
            top: childTop,
          });
          childTop += heights.get(child) + gap;
        }
      }
      forestTop += heights.get(root) + 120 * spacing;
    }
  }
  place();
  if (portals) {
    if (mode === 'circle' && states.has(machine.start)) {
      for (const id of children.get(machine.start))
        if (sizes.get(id) >= 4) {
          const edge = machine.edges.find(
            (e) => e.from === machine.start && e.portal == null && e.to === id,
          );
          if (edge) enablePortal(machine, edge);
        }
    }
    portalizeCrossings(machine);
  }
  positionComments(anchors);
  placeCommentsAfterLayout(machine);
  return machine;
}
function groupedLayout(machine, spacing) {
  const root = machine.states.find((s) => s.id === machine.start);
  if (!root) return;
  const groups = startGroups(machine),
    islands = [],
    retired = new Set();
  for (const ids of groups) {
    const members = new Set(ids),
      states = [
        {
          ...root,
        },
        ...machine.states
          .filter((s) => members.has(s.id))
          .map((s) => ({
            ...s,
          })),
      ];
    const edges = machine.edges
      .filter((e) => members.has(e.from) || (e.from === root.id && members.has(e.to)))
      .map((original) => {
        const edge = {
          ...original,
        };
        if (edge.from === root.id || portalBranchSize(machine, edge) <= 2) {
          if (edge.portal != null) {
            try {
              edge.to = destination(machine, edge).id;
              original.to = edge.to;
            } catch {}
            retired.add(original.portal);
            delete edge.portal;
            delete original.portal;
          }
        }
        return edge;
      });
    const local = {
      ...machine,
      startViews: undefined,
      states,
      edges,
      comments: [],
    };
    autoLayout(local, 'circle', spacing, false, {}, false);
    const routes = routeEdges(local, simpleTransitionLabel),
      boxes = [
        ...states.map((s) => ({
          x: s.x - 100,
          y: s.y - 100,
          w: 200,
          h: 200,
        })),
        ...routes.flatMap((r) => [
          {
            x: r.label.x - r.label.w / 2,
            y: r.label.y - 25,
            w: r.label.w,
            h: 50,
          },
          ...[r.p0, r.c1, r.c2, r.p3].map((p) => ({
            x: p.x - 10,
            y: p.y - 10,
            w: 20,
            h: 20,
          })),
          ...(r.portalBox
            ? [
                {
                  x: r.portalBox.x - r.portalBox.w / 2,
                  y: r.portalBox.y - 11,
                  w: r.portalBox.w,
                  h: 22,
                },
              ]
            : []),
        ]),
        ...states
          .filter((s) => s.portal)
          .map((s) => {
            const b = statePortalBox(s);
            return {
              x: b.x - b.w / 2,
              y: b.y - 11,
              w: b.w,
              h: 22,
            };
          }),
      ];
    const x = Math.min(...boxes.map((b) => b.x)),
      y = Math.min(...boxes.map((b) => b.y)),
      w = Math.max(...boxes.map((b) => b.x + b.w)) - x,
      h = Math.max(...boxes.map((b) => b.y + b.h)) - y;
    islands.push({
      ids,
      states,
      x,
      y,
      w,
      h,
    });
  }
  for (const state of machine.states)
    if (retired.has(state.portal) && !machine.edges.some((e) => e.portal === state.portal))
      delete state.portal;
  const width = Math.sqrt(islands.reduce((sum, i) => sum + (i.w + 220) * (i.h + 220), 0));
  let left = 100,
    top = 100,
    row = 0;
  machine.startViews = [];
  islands.forEach((island, index) => {
    if (left > 100 && left + island.w > width) {
      left = 100;
      top += row + 220;
      row = 0;
    }
    const dx = left - island.x,
      dy = top - island.y;
    for (const state of island.states) {
      const original = machine.states.find((s) => s.id === state.id);
      if (state.id !== root.id || index === 0) {
        original.x = state.x + dx;
        original.y = state.y + dy;
      }
    }
    if (index)
      machine.startViews.push({
        x: island.states[0].x + dx,
        y: island.states[0].y + dy,
        targets: island.ids,
      });
    left += island.w + 220;
    row = Math.max(row, island.h);
  });
}
export function springLayout(machine, spacing = 1, options = {}) {
  if (!machine.states.length) return machine;
  const settings = springSettings(options),
    anchors = commentAnchors(machine),
    ideal = Math.max(80, settings.distance * spacing);
  const cx = machine.states.reduce((sum, s) => sum + s.x, 0) / machine.states.length,
    cy = machine.states.reduce((sum, s) => sum + s.y, 0) / machine.states.length;
  const spread = machine.states.some((s) => Math.hypot(s.x - cx, s.y - cy) > 1),
    looped = new Set(
      machine.edges.filter((e) => e.portal == null && e.from === e.to).map((e) => e.from),
    );
  const nodes = machine.states.map((s) => ({
    id: s.id,
    x: spread ? s.x : NaN,
    y: spread ? s.y : NaN,
    radius: Math.max(
      Math.max(88, 160 * spacing) / 2,
      looped.has(s.id) ? 100 : 0,
      s.portal ? 80 : 0,
      s.token ? Math.max(65, s.token.length * 3.5) : 0,
    ),
  }));
  const ids = new Set(nodes.map((s) => s.id)),
    links = new Map();
  for (const e of machine.edges) {
    let to;
    try {
      to = destination(machine, e)?.id;
    } catch {
      continue;
    }
    if (!to || !ids.has(e.from) || e.from === to) continue;
    const key = JSON.stringify([e.from, to].sort()),
      length = Math.max(ideal, transitionLabel(e).length * 7 + 90),
      existing = links.get(key);
    if (existing) existing.length = Math.max(existing.length, length);
    else
      links.set(key, {
        source: e.from,
        target: to,
        length,
      });
  }
  let random = 1;
  const simulation = forceSimulation(nodes)
    .stop()
    .randomSource(() => (random = (Math.imul(1664525, random) + 1013904223) >>> 0) / 4294967296)
    .force('charge', forceManyBody().strength(-settings.repel * 1200 * spacing * spacing))
    .force(
      'link',
      forceLink([...links.values()])
        .id((s) => s.id)
        .distance((e) => e.length)
        .strength(settings.link),
    )
    .force('x', forceX(cx).strength(settings.center * settings.center * 0.1))
    .force('y', forceY(cy).strength(settings.center * settings.center * 0.1))
    .force('collide', forceCollide((s) => s.radius + 1).iterations(4))
    .velocityDecay(0.4);
  simulation.tick(400);
  // Enforce final collision clearance without attaching simulation fields to the saved model.
  for (let pass = 0; pass < 200; pass++) {
    let overlap = false;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        let dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const minimum = a.radius + b.radius + 1;
        if (d >= minimum) continue;
        overlap = true;
        const shift = (minimum - d) / 2 + 0.01;
        a.x -= (dx / d) * shift;
        a.y -= (dy / d) * shift;
        b.x += (dx / d) * shift;
        b.y += (dy / d) * shift;
      }
    if (!overlap) break;
  }
  const ox = cx - nodes.reduce((sum, s) => sum + s.x, 0) / nodes.length,
    oy = cy - nodes.reduce((sum, s) => sum + s.y, 0) / nodes.length;
  machine.states.forEach((s, i) => {
    s.x = nodes[i].x + ox;
    s.y = nodes[i].y + oy;
  });
  positionComments(anchors);
  placeCommentsAfterLayout(machine);
  return machine;
}
function portalBranchSize(machine, edge) {
  const visited = new Set();
  let target;
  try {
    target = destination(machine, edge)?.id;
  } catch {
    return 0;
  }
  const queue = [target];
  while (queue.length && visited.size < 3) {
    const id = queue.pop();
    if (!id || id === machine.start || visited.has(id)) continue;
    visited.add(id);
    for (const e of machine.edges)
      if (e.from === id) {
        try {
          const next = destination(machine, e);
          if (next) queue.push(next.id);
        } catch {}
      }
  }
  return visited.size;
}
function portalizeCrossings(machine) {
  for (let attempts = 0; attempts < machine.edges.length; attempts++) {
    const pairs = crossingPairs(machine, true, simpleTransitionLabel);
    if (!pairs.length) break;
    const counts = new Map();
    for (const pair of pairs)
      for (const i of pair)
        if (portalBranchSize(machine, machine.edges[i]) > 2)
          counts.set(i, (counts.get(i) ?? 0) + 1);
    if (!counts.size) break;
    const index = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    enablePortal(machine, machine.edges[index]);
  }
}
function visibleSegments(machine) {
  const states = new Map(machine.states.map((s) => [s.id, s]));
  return machine.edges.flatMap((e, i) =>
    e.portal == null && e.from !== e.to && states.has(e.from) && states.has(e.to)
      ? [
          {
            i,
            a: states.get(e.from),
            b: states.get(e.to),
          },
        ]
      : [],
  );
}
function intersects(a, b, c, d) {
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return turn(a, b, c) * turn(a, b, d) < -1e-8 && turn(c, d, a) * turn(c, d, b) < -1e-8;
}
export function crossingPairs(machine, routed = false, labelFor = transitionLabel) {
  machine = visualMachine(machine);
  const segments = visibleSegments(machine),
    pairs = [],
    routes = routed ? routeEdges(machine, labelFor) : null,
    paths = routed
      ? new Map(
          segments.map((e) => [
            e.i,
            Array.from(
              {
                length: 17,
              },
              (_, i) => sample(routes[e.i], i / 16),
            ),
          ]),
        )
      : null;
  const boxes =
    routes &&
    routes.map((route) => {
      const points = [route.p0, route.c1, route.c2, route.p3];
      const xs = points.map((point) => point.x),
        ys = points.map((point) => point.y);
      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      };
    });
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i],
        b = segments[j];
      if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
      let crossing = false;
      if (paths) {
        const first = boxes[a.i],
          second = boxes[b.i];
        if (
          first.right < second.left ||
          second.right < first.left ||
          first.bottom < second.top ||
          second.bottom < first.top
        )
          continue;
        const p = paths.get(a.i),
          q = paths.get(b.i);
        for (let u = 1; u < p.length && !crossing; u++)
          for (let v = 1; v < q.length; v++)
            if (intersects(p[u - 1], p[u], q[v - 1], q[v])) {
              crossing = true;
              break;
            }
      } else crossing = intersects(a.a, a.b, b.a, b.b);
      if (crossing) pairs.push([a.i, b.i]);
    }
  return pairs;
}
const at = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function sample(c, t) {
  const a = at(c.p0, c.c1, t),
    b = at(c.c1, c.c2, t),
    d = at(c.c2, c.p3, t);
  return at(at(a, b, t), at(b, d, t), t);
}
function overlaps(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 8;
}
function segmentHitsBox(a, b, box) {
  let lo = 0,
    hi = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x - box.w / 2 - 4, box.x + box.w / 2 + 4],
    [a.y, b.y - a.y, box.y - box.h / 2 - 4, box.y + box.h / 2 + 4],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false;
      continue;
    }
    const t1 = (min - start) / delta,
      t2 = (max - start) / delta;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return false;
  }
  return true;
}
export function loopAngles(machine, state, index) {
  const slots = loopSlots(machine, state);
  if (index !== undefined && slots.has(index)) {
    const main = slots.get(index);
    return [
      main,
      ...Array.from(
        { length: 15 },
        (_, i) => main + ((i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) * Math.PI) / 8,
      ),
    ];
  }
  const directions = machine.edges
    .flatMap((edge) => {
      if (edge.portal != null || edge.from === edge.to) return [];
      const other =
        edge.from === state.id
          ? machine.states.find((s) => s.id === edge.to)
          : edge.to === state.id
            ? machine.states.find((s) => s.id === edge.from)
            : null;
      return other ? [Math.atan2(other.y - state.y, other.x - state.x)] : [];
    })
    .sort((a, b) => a - b);
  if (!directions.length)
    return Array.from(
      {
        length: 16,
      },
      (_, i) => -Math.PI / 2 + (i * Math.PI) / 8,
    );
  const gaps = directions
    .map((angle, i) => {
      const next = i === directions.length - 1 ? directions[0] + Math.PI * 2 : directions[i + 1],
        size = next - angle;
      return {
        angle: angle + size / 2,
        size,
      };
    })
    .sort((a, b) => b.size - a.size);
  const main = gaps[0].angle;
  return [
    main,
    ...Array.from(
      {
        length: 15,
      },
      (_, i) => main + ((i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) * Math.PI) / 8,
    ),
  ];
}
const routeCache = new Map();
export function routeEdges(machine, labelFor = transitionLabel) {
  machine = visualMachine(machine);
  const labels = machine.edges.map(labelFor);
  const key = drawingRouteKey(machine, labels);
  const saved = savedRoutes(machine, key);
  if (saved) return saved;
  if (routeCache.has(key)) return routeCache.get(key);
  const routes =
    (machine.states.length > 12 ||
    machine.routingPolicy === 'corridor' ||
    transitionBundles(machine, (e) => e.portal == null && e.from !== e.to).some(
      (b) => b.indices.length > 1,
    )
      ? corridorRoutes(machine, labels)
      : null) ?? computeRoutes(machine, labels);
  clearNodeLabels(machine, routes);
  routeCache.set(key, routes);
  if (routeCache.size > 4) routeCache.delete(routeCache.keys().next().value);
  return routes;
}
export function loopDragBend(center, apex, initial, current, bend) {
  const a = {
      x: initial.x - center.x,
      y: initial.y - center.y,
    },
    b = {
      x: current.x - center.x,
      y: current.y - center.y,
    },
    angle = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x),
    v = {
      x: apex.x - center.x,
      y: apex.y - center.y,
    },
    radius = Math.max(0, Math.hypot(v.x, v.y) + Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y)),
    startAngle = Math.atan2(v.y, v.x);
  return {
    x: bend.x + Math.cos(startAngle + angle) * radius - v.x,
    y: bend.y + Math.sin(startAngle + angle) * radius - v.y,
  };
}
export function applyBend(route, edge, start, end) {
  if (!edge.bend) return;
  if (start === end) {
    const apex = sample(route, 0.5),
      x = apex.x - start.x,
      y = apex.y - start.y,
      base = Math.hypot(x, y),
      tx = x + edge.bend.x,
      ty = y + edge.bend.y,
      target = Math.hypot(tx, ty),
      angle = Math.atan2(target > 1e-6 ? ty : y, target > 1e-6 ? tx : x) - Math.atan2(y, x),
      cos = Math.cos(angle),
      sin = Math.sin(angle),
      scale = Math.max(55, target) / base;
    for (const [point, factor] of [
      [route.p0, 1],
      [route.p3, 1],
      [route.c1, scale],
      [route.c2, scale],
    ]) {
      const dx = point.x - start.x,
        dy = point.y - start.y;
      point.x = start.x + (dx * cos - dy * sin) * factor;
      point.y = start.y + (dx * sin + dy * cos) * factor;
    }
    const center = sample(route, 0.5);
    route.label.x = center.x;
    route.label.y = center.y - 13;
    return;
  }
  for (const p of [route.c1, route.c2]) {
    p.x += (edge.bend.x * 4) / 3;
    p.y += (edge.bend.y * 4) / 3;
  }
  const attach = (point, control, state) => {
    if (state.group) {
      Object.assign(point, nodePort(state, Math.atan2(control.y - state.y, control.x - state.x)));
      return;
    }
    const radius = Math.hypot(point.x - state.x, point.y - state.y),
      dx = control.x - state.x,
      dy = control.y - state.y,
      len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      point.x = state.x + (radius * dx) / len;
      point.y = state.y + (radius * dy) / len;
    }
  };
  attach(route.p0, route.c1, start);
  if (end) attach(route.p3, route.c2, end);
  const center = sample(route, 0.5);
  route.label.x = center.x;
  route.label.y = center.y - 13;
}
function computeRoutes(machine, labels) {
  const captions = machine.states.flatMap((s) =>
    s.group
      ? [
          {
            x: s.x,
            y: s.y + 50,
            w: (String(s.count).length + 15) * 5.5,
            h: 14,
          },
        ]
      : s.token && s.accepting !== false
        ? [
            {
              x: s.x,
              y: s.y + 53,
              w: (s.token.length + (s.skip ? 7 : 0)) * 5.5 + 8,
              h: 14,
            },
          ]
        : [],
  );
  const reserved = machine.states.flatMap((s) => [
    {
      x: s.x,
      y: s.y,
      w: s.group ? groupWidth(s) + 18 : 90,
      h: 90,
    },
    ...(s.portal ? [statePortalBox(s)] : []),
  ]);
  reserved.push(...captions);
  const routes = [];
  for (const c of machine.comments ?? []) {
    const size = commentLayout(c);
    reserved.push({
      x: c.x + size.w / 2,
      y: c.y + size.h / 2,
      w: size.w,
      h: size.h,
    });
  }
  const obstacles = [...reserved];
  const segments = machine.edges
    .filter((e) => e.from !== e.to && e.portal == null)
    .map((e) => {
      const from = machine.states.find((s) => s.id === e.from),
        to = machine.states.find((s) => s.id === e.to),
        dx = to.x - from.x,
        dy = to.y - from.y;
      return {
        edge: e,
        from,
        to,
        dx,
        dy,
        length: dx * dx + dy * dy,
      };
    });
  const wires = new Map();
  for (const [i, edge] of machine.edges.entries())
    if (edge.groupEdge) {
      const key = JSON.stringify([edge.from, edge.to]);
      if (!wires.has(key)) wires.set(key, []);
      wires.get(key).push(i);
    }
  const parallel = new Map();
  for (const indices of wires.values())
    if (indices.length > 1) {
      const spacing = Math.min(11, 54 / (indices.length - 1));
      indices.forEach((i, lane) =>
        parallel.set(i, {
          first: indices[0],
          offset: (lane - (indices.length - 1) / 2) * spacing,
        }),
      );
    }
  const radialHub =
    new Set(
      machine.edges
        .filter((edge) => edge.from === machine.start && edge.to !== edge.from)
        .map((edge) => edge.to),
    ).size >= 8;
  const ordered = machine.edges
    .map((e, i) => ({
      e,
      i,
    }))
    .sort((a, b) => (a.e.from === a.e.to) - (b.e.from === b.e.to));
  for (const { e, i } of ordered) {
    const a = machine.states.find((s) => s.id === e.from),
      b = machine.states.find((s) => s.id === e.to);
    if (e.portal != null) {
      let best,
        bestScore = Infinity;
      for (const [dx, dy] of e.portalOffset
        ? [[e.portalOffset.x, e.portalOffset.y]]
        : [140, 220, 300, 420, 560, 720].flatMap((radius) =>
            Array.from(
              {
                length: 16,
              },
              (_, i) => [
                Math.cos((i * Math.PI) / 8) * radius,
                Math.sin((i * Math.PI) / 8) * radius,
              ],
            ),
          )) {
        const len = Math.hypot(dx, dy) || 1,
          p0 = {
            x: a.x + (dx / len) * 37,
            y: a.y + (dy / len) * 37,
          },
          p3 = {
            x: a.x + dx,
            y: a.y + dy,
          },
          c = {
            p0,
            p3,
            c1: at(p0, p3, 1 / 3),
            c2: at(p0, p3, 2 / 3),
          };
        const center = sample(c, 0.5);
        c.label = {
          x: center.x,
          y: center.y - 13,
          w: labels[i].length * 7 + 14,
          h: 22,
        };
        c.portalBox = portalBoxAtTip(e.portal, p3, dx < 0 ? 'right' : 'left');
        applyBend(c, e, a, null);
        let score = len * 0.01 + (overlaps(c.label, c.portalBox) ? 1000 : 0);
        for (const box of reserved) {
          if (overlaps(c.label, box)) score += 1000;
          if (overlaps(c.portalBox, box)) score += 1000;
        }
        for (const segment of segments)
          if (segment.edge !== e) {
            if (segmentHitsBox(segment.from, segment.to, c.label)) score += 100;
            if (segmentHitsBox(segment.from, segment.to, c.portalBox)) score += 100;
          }
        if (score < bestScore) {
          best = c;
          bestScore = score;
        }
      }
      best.d = `M ${best.p0.x} ${best.p0.y} C ${best.c1.x} ${best.c1.y}, ${best.c2.x} ${best.c2.y}, ${best.p3.x} ${best.p3.y}`;
      routes[i] = best;
      reserved.push(best.label, best.portalBox);
      continue;
    }
    const lane = parallel.get(i);
    if (lane && lane.first !== i) continue;
    let best,
      bestScore = Infinity;
    const loop = a === b,
      angles = loop ? loopAngles(machine, a, i) : null;
    const nearbyRoutes = loop
      ? machine.edges.flatMap((edge, index) => {
          if (edge.from === edge.to || (edge.from !== a.id && edge.to !== a.id) || !routes[index])
            return [];
          return [Array.from({ length: 17 }, (_, step) => sample(routes[index], step / 16))];
        })
      : [];
    for (let attempt = 0; attempt < (loop ? 64 : 61); attempt++) {
      let c;
      if (a === b) {
        const size = 80 + Math.floor(attempt / angles.length) * 25,
          angle = angles[attempt % angles.length] + Math.PI / 2;
        const rotate = (x, y) => ({
          x: a.x + x * Math.cos(angle) - y * Math.sin(angle),
          y: a.y + x * Math.sin(angle) + y * Math.cos(angle),
        });
        c = {
          p0: rotate(-22, -29),
          c1: rotate(-size, -size * 1.45),
          c2: rotate(size, -size * 1.45),
          p3: rotate(22, -29),
        };
      } else {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          len = Math.hypot(dx, dy) || 1,
          ux = dx / len,
          uy = dy / len;
        const reverse = machine.edges.some(
          (x) => x.portal == null && x.from === e.to && x.to === e.from,
        );
        // Reversing the endpoints reverses the normal: keep the same signed bend
        // for both directions so reciprocal arrows occupy opposite physical sides.
        const bend = reverse
          ? -(90 + Math.ceil(attempt / 2) * 22)
          : attempt === 0
            ? 0
            : Math.ceil(attempt / 2) * 42 * (attempt % 2 ? 1 : -1);
        const mid = {
          x: (a.x + b.x) / 2 - uy * bend,
          y: (a.y + b.y) / 2 + ux * bend,
        };
        const startAngle = Math.atan2(mid.y - a.y, mid.x - a.x),
          endAngle = Math.atan2(mid.y - b.y, mid.x - b.x);
        const p0 = nodePort(a, startAngle),
          p3 = nodePort(b, endAngle);
        c = {
          p0,
          p3,
          c1: at(p0, mid, 2 / 3),
          c2: at(p3, mid, 2 / 3),
        };
      }
      const center = sample(c, 0.5);
      c.label = {
        x: center.x,
        y: center.y - 13,
        w: labels[i].length * 7 + 14,
        h: 22,
      };
      let labelScore = Infinity,
        bestLabel = c.label;
      for (const t of loop ? [0.5] : [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
        const point = sample(c, t),
          label = {
            ...c.label,
            x: point.x,
            y: point.y - 13,
          };
        let collisions = 0;
        for (const box of reserved) if (overlaps(label, box)) collisions += 100;
        for (const segment of segments)
          if (segment.edge !== e && segmentHitsBox(segment.from, segment.to, label)) collisions++;
        if (collisions < labelScore) {
          labelScore = collisions;
          bestLabel = label;
        }
        if (!collisions) break;
      }
      c.label = bestLabel;
      let score =
        (loop ? Math.floor(attempt / 4) * 0.1 : attempt === 0 ? 0 : 2500 + attempt * 15) +
        labelScore * 10;
      // A Bezier curve stays inside its control-point bounds; outside obstacles cannot collide.
      const left = Math.min(c.p0.x, c.c1.x, c.c2.x, c.p3.x),
        right = Math.max(c.p0.x, c.c1.x, c.c2.x, c.p3.x),
        top = Math.min(c.p0.y, c.c1.y, c.c2.y, c.p3.y),
        bottom = Math.max(c.p0.y, c.c1.y, c.c2.y, c.p3.y);
      const nearby =
        score < bestScore
          ? machine.states.filter(
              (s) =>
                s !== a &&
                s !== b &&
                s.x >= left - (s.group ? groupWidth(s) / 2 + 9 : 65) &&
                s.x <= right + (s.group ? groupWidth(s) / 2 + 9 : 65) &&
                s.y >= top - 65 &&
                s.y <= bottom + 65,
            )
          : [];
      const nearbySegments =
        loop && score < bestScore
          ? segments.filter(
              (s) =>
                Math.max(s.from.x, s.from.x + s.dx) >= left - 14 &&
                Math.min(s.from.x, s.from.x + s.dx) <= right + 14 &&
                Math.max(s.from.y, s.from.y + s.dy) >= top - 14 &&
                Math.min(s.from.y, s.from.y + s.dy) <= bottom + 14,
            )
          : [];
      for (let t = 0.04; t < 0.98 && score < bestScore; t += 0.03) {
        const p = sample(c, t);
        for (const s of nearby)
          if (
            s.group
              ? Math.abs(p.x - s.x) < groupWidth(s) / 2 + 9 && Math.abs(p.y - s.y) < 45
              : (p.x - s.x) ** 2 + (p.y - s.y) ** 2 < 65 ** 2
          )
            score += 10000;
      }
      const nearbyCaptions = captions.filter(
        (box) =>
          box.x + box.w / 2 + 4 >= left &&
          box.x - box.w / 2 - 4 <= right &&
          box.y + box.h / 2 + 4 >= top &&
          box.y - box.h / 2 - 4 <= bottom,
      );
      let previous = c.p0;
      for (let k = 1; k <= 24 && score < bestScore && nearbyCaptions.length; k++) {
        const point = sample(c, k / 24);
        if (nearbyCaptions.some((box) => segmentHitsBox(previous, point, box))) {
          score += radialHub && e.from === machine.start ? 1800 : 12000;
          break;
        }
        previous = point;
      }
      if (loop)
        for (let t = 0.1; t < 0.95 && score < bestScore; t += 0.05) {
          const p = sample(c, t);
          if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 < 48 ** 2) continue;
          for (const points of nearbyRoutes) {
            if (points.some((point) => (point.x - p.x) ** 2 + (point.y - p.y) ** 2 < 20 ** 2))
              score += 700;
          }
          for (const { from, dx, dy, length } of nearbySegments) {
            if (!length) continue;
            const u = Math.max(
              0,
              Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / length),
            );
            if ((p.x - from.x - u * dx) ** 2 + (p.y - from.y - u * dy) ** 2 < 14 ** 2) score += 200;
          }
        }
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
      if (
        (!loop && score < 1) ||
        (loop &&
          attempt % angles.length === angles.length - 1 &&
          bestScore <= (Math.floor(attempt / angles.length) + 1) * 0.1)
      )
        break;
    }
    if (e.bend) best.unbent = structuredClone(best);
    applyBend(best, e, a, b);
    best.d = `M ${best.p0.x} ${best.p0.y} C ${best.c1.x} ${best.c1.y}, ${best.c2.x} ${best.c2.y}, ${best.p3.x} ${best.p3.y}`;
    routes[i] = best;
    reserved.push(best.label);
  }
  for (const [i, { first, offset }] of [...parallel].reverse()) {
    const edge = machine.edges[i],
      base = routes[first];
    const a = machine.states.find((state) => state.id === edge.from),
      b = machine.states.find((state) => state.id === edge.to);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const shift = (p) => ({
      x: p.x - ((b.y - a.y) / length) * offset,
      y: p.y + ((b.x - a.x) / length) * offset,
    });
    const attach = (point, state) => {
      const p = shift(point),
        radius = Math.hypot(point.x - state.x, point.y - state.y),
        distance = Math.hypot(p.x - state.x, p.y - state.y) || 1;
      return {
        x: state.x + ((p.x - state.x) * radius) / distance,
        y: state.y + ((p.y - state.y) * radius) / distance,
      };
    };
    const p0 = attach(base.p0, a),
      p3 = attach(base.p3, b),
      c1 = shift(base.c1),
      c2 = shift(base.c2);
    const route = {
      p0,
      p3,
      c1,
      c2,
      d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`,
    };
    const center = sample(route, 0.5);
    route.label = {
      x: center.x,
      y: center.y - 13,
      w: labels[i].length * 7 + 14,
      h: 22,
    };
    routes[i] = route;
  }
  const paths = routes.map((route) => {
    const points = Array.from(
        {
          length: 25,
        },
        (_, i) => sample(route, i / 24),
      ),
      xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    return {
      points,
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  });
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < routes.length; i++) {
      const edge = machine.edges[i],
        route = routes[i];
      if (edge.portal != null || (edge.from === edge.to && edge.bend)) continue;
      const collisionScore = (label) => {
        let score = 0;
        for (const box of obstacles) if (overlaps(label, box)) score += 1000;
        for (let j = 0; j < routes.length; j++)
          if (j !== i) {
            if (
              overlaps(label, routes[j].label) ||
              (routes[j].portalBox && overlaps(label, routes[j].portalBox))
            )
              score += 1000;
            const path = paths[j];
            if (
              path.right < label.x - label.w / 2 - 4 ||
              path.left > label.x + label.w / 2 + 4 ||
              path.bottom < label.y - label.h / 2 - 4 ||
              path.top > label.y + label.h / 2 + 4
            )
              continue;
            for (let k = 1; k < path.points.length; k++)
              if (segmentHitsBox(path.points[k - 1], path.points[k], label)) {
                score++;
                break;
              }
          }
        return score;
      };
      let best = route.label,
        bestScore = collisionScore(best);
      for (const t of [
        0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9,
      ]) {
        if (!bestScore) break;
        const point = sample(route, t),
          candidate = {
            ...route.label,
            x: point.x,
            y: point.y - 13,
          },
          score = collisionScore(candidate);
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (bestScore >= 1000)
        for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const point = sample(route, t);
          for (const [dx, dy] of [
            [0, -26],
            [0, 24],
            [-route.label.w / 2 - 12, 0],
            [route.label.w / 2 + 12, 0],
            [0, -48],
            [0, 46],
          ]) {
            const candidate = {
                ...route.label,
                x: point.x + dx,
                y: point.y - 13 + dy,
              },
              score = collisionScore(candidate) + Math.hypot(dx, dy) / 100;
            if (score < bestScore) {
              best = candidate;
              bestScore = score;
            }
          }
        }
      route.label = best;
    }
  return routes;
}
