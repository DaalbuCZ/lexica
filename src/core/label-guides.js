import { groupWidth, tokenCaption } from './labels.js';
import { commentLayout } from './comments.js';
import { statePortalBox } from './portals.js';
import { SpatialIndex } from './spatial-index.js';
import { curvePoint } from './route-geometry.js';
const guides = new WeakMap();
// Attach only at a side midpoint, choosing the shortest connection to this curve.
export function labelGuide(route) {
  if (guides.has(route)) return guides.get(route);
  const x = route.label.x,
    y = route.label.y - 4,
    halfWidth = route.label.w / 2,
    halfHeight = 11;
  for (let i = 0; i <= 40; i++) {
    const p = curvePoint(route, i / 40);
    if (Math.abs(p.x - x) <= halfWidth && Math.abs(p.y - y) <= halfHeight) {
      guides.set(route, null);
      return null;
    }
  }
  let guide = null,
    shortest = Infinity;
  for (const from of [
    { x: x - halfWidth, y },
    { x: x + halfWidth, y },
    { x, y: y - halfHeight },
    { x, y: y + halfHeight },
  ]) {
    const distance = (t) => {
      const p = curvePoint(route, t);
      return (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
    };
    let best = 0;
    for (let i = 1; i <= 40; i++) if (distance(i / 40) < distance(best)) best = i / 40;
    let low = Math.max(0, best - 1 / 40),
      high = Math.min(1, best + 1 / 40);
    for (let i = 0; i < 18; i++) {
      const a = low + (high - low) / 3,
        b = high - (high - low) / 3;
      if (distance(a) < distance(b)) high = b;
      else low = a;
    }
    const t = (low + high) / 2,
      length = distance(t);
    if (length < shortest) {
      shortest = length;
      guide = { from, to: curvePoint(route, t) };
    }
  }
  guides.set(route, guide);
  return guide;
}

export function segmentHitsBox(a, b, box) {
  let low = 0,
    high = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, box.left, box.right],
    [a.y, b.y - a.y, box.top, box.bottom],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const t1 = (min - origin) / delta,
      t2 = (max - origin) / delta;
    low = Math.max(low, Math.min(t1, t2));
    high = Math.min(high, Math.max(t1, t2));
    if (low > high) return false;
  }
  return true;
}
const sceneGuides = new WeakMap();
const padded = (box, n = 3) => ({
  left: box.left - n,
  right: box.right + n,
  top: box.top - n,
  bottom: box.bottom + n,
});
const labelBox = (label) => ({
  left: label.x - label.w / 2,
  right: label.x + label.w / 2,
  top: label.y - 15,
  bottom: label.y + 7,
});
const bounds = (points) => ({
  left: Math.min(...points.map((p) => p.x)),
  right: Math.max(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  bottom: Math.max(...points.map((p) => p.y)),
});
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// Use alternate attachment points first, then a short visibility-graph detour.
// If no safe route exists, omit the guide rather than drawing through an obstacle.
export function labelGuidesFor(machine, routes) {
  const cached = sceneGuides.get(routes);
  if (cached?.machine === machine) return cached.guides;
  const obstacles = new SpatialIndex();
  let id = 0;
  const add = (box) => obstacles.set(id++, padded(box));
  for (const state of machine.states) {
    const half = state.group ? groupWidth(state) / 2 + 2 : 37;
    add({ left: state.x - half, right: state.x + half, top: state.y - 37, bottom: state.y + 37 });
    const caption = tokenCaption(state);
    if (caption) add(caption);
    if (state.portal) {
      const box = statePortalBox(state);
      add({
        left: box.x - box.w / 2 - 7,
        right: box.x + box.w / 2 + 7,
        top: box.y - 13,
        bottom: box.y + 13,
      });
    }
  }
  for (const comment of machine.comments ?? []) {
    const { w, h } = commentLayout(comment);
    add({ left: comment.x, right: comment.x + w, top: comment.y, bottom: comment.y + h });
  }
  const labelIds = routes.map((route) => {
    const key = id;
    add(labelBox(route.label));
    return key;
  });
  for (const route of routes)
    if (route.portalBox) {
      const box = route.portalBox;
      add({
        left: box.x - box.w / 2 - 7,
        right: box.x + box.w / 2 + 7,
        top: box.y - 13,
        bottom: box.y + 13,
      });
    }
  const result = routes.map((route, index) => {
    const raw = labelGuide(route);
    if (!raw) return null;
    const box = labelBox(route.label),
      own = padded(box, -0.05),
      x = route.label.x,
      y = route.label.y - 4;
    const sources = [
      { x: box.left, y },
      { x: box.right, y },
      { x, y: box.top },
      { x, y: box.bottom },
    ];
    const clear = (a, b) =>
      !segmentHitsBox(a, b, own) &&
      !obstacles
        .query(bounds([a, b]))
        .some(
          (key) => key !== labelIds[index] && segmentHitsBox(a, b, obstacles.items.get(key).box),
        );
    const targets = [
      raw.to,
      ...Array.from({ length: 39 }, (_, i) => curvePoint(route, (i + 1) / 40)),
    ];
    const candidates = sources
      .flatMap((from) => targets.map((to) => ({ from, to, distance: length(from, to) })))
      .sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates)
      if (clear(candidate.from, candidate.to))
        return { from: candidate.from, to: candidate.to, points: [candidate.from, candidate.to] };
    const goals = [];
    for (const candidate of candidates) {
      if (goals.length >= 12) break;
      if (clear(candidate.to, candidate.to) && !goals.some((p) => length(p, candidate.to) < 1))
        goals.push(candidate.to);
    }
    if (!goals.length) return null;
    const region = padded(bounds([...sources, ...goals]), 80);
    const corners = obstacles
      .query(region)
      .flatMap((key) => {
        const b = obstacles.items.get(key).box;
        return [
          { x: b.left - 1, y: b.top - 1 },
          { x: b.left - 1, y: b.bottom + 1 },
          { x: b.right + 1, y: b.top - 1 },
          { x: b.right + 1, y: b.bottom + 1 },
        ];
      })
      .filter((p) => clear(p, p))
      .sort(
        (a, b) =>
          Math.min(...sources.map((s) => length(s, a))) -
          Math.min(...sources.map((s) => length(s, b))),
      )
      .slice(0, 128);
    const points = [...sources, ...goals, ...corners],
      costs = points.map((_, i) => (i < 4 ? 0 : Infinity)),
      parents = points.map(() => -1),
      visited = new Set();
    for (let step = 0; step < points.length; step++) {
      let current = -1;
      for (let i = 0; i < points.length; i++)
        if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
      if (current < 0 || !Number.isFinite(costs[current])) break;
      if (current >= 4 && current < 4 + goals.length) {
        const path = [];
        for (let i = current; i >= 0; i = parents[i]) path.unshift(points[i]);
        return { from: path[0], to: path.at(-1), points: path };
      }
      visited.add(current);
      for (let i = 4; i < points.length; i++) {
        if (visited.has(i)) continue;
        const cost = costs[current] + length(points[current], points[i]) + 2;
        if (cost < costs[i] && clear(points[current], points[i])) {
          costs[i] = cost;
          parents[i] = current;
        }
      }
    }
    return null;
  });
  sceneGuides.set(routes, { machine, guides: result });
  return result;
}
