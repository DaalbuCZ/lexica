// Conservative cubic clearance: disjoint control hull boxes prove separation.
// Ambiguous pairs remain unverified when the deterministic work budget expires.
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function split(p) {
  const a = midpoint(p[0], p[1]),
    b = midpoint(p[1], p[2]),
    c = midpoint(p[2], p[3]);
  const d = midpoint(a, b),
    e = midpoint(b, c),
    f = midpoint(d, e);
  return [
    [p[0], a, d, f],
    [f, e, c, p[3]],
  ];
}
function bounds(p) {
  return {
    left: Math.min(...p.map((v) => v.x)),
    right: Math.max(...p.map((v) => v.x)),
    top: Math.min(...p.map((v) => v.y)),
    bottom: Math.max(...p.map((v) => v.y)),
  };
}
export function curveClearance(
  first,
  second,
  { clearance = 0, maxDepth = 20, maxPairs = 4096 } = {},
) {
  if (
    !Number.isFinite(clearance) ||
    clearance < 0 ||
    !Number.isInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > 64 ||
    !Number.isInteger(maxPairs) ||
    maxPairs < 0 ||
    maxPairs > 1e6
  )
    return { status: 'unverified', reason: 'invalid checking budget', checks: 0 };
  const points = (r) => [r.p0, r.c1, r.c2, r.p3];
  const a = points(first),
    b = points(second);
  if (![...a, ...b].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)))
    return { status: 'unverified', reason: 'invalid geometry', checks: 0 };
  const pending = [[a, b, 0]];
  let checks = 0;
  while (pending.length) {
    if (checks >= maxPairs) return { status: 'unverified', reason: 'pair budget', checks };
    const [p, q, depth] = pending.pop(),
      x = bounds(p),
      y = bounds(q);
    checks++;
    if (
      x.right + clearance < y.left ||
      y.right + clearance < x.left ||
      x.bottom + clearance < y.top ||
      y.bottom + clearance < x.top
    )
      continue;
    if (depth >= maxDepth) return { status: 'unverified', reason: 'precision budget', checks };
    const size = (v) => Math.max(v.right - v.left, v.bottom - v.top);
    if (size(x) >= size(y)) for (const half of split(p)) pending.push([half, q, depth + 1]);
    else for (const half of split(q)) pending.push([p, half, depth + 1]);
  }
  return { status: 'clear', checks };
}
