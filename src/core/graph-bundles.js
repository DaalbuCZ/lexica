const compare = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
// Analysis-only bundles retain original transition indices and FSM rule order.
export function transitionBundles(machine, eligible = () => true) {
  const bundles = new Map();
  machine.edges.forEach((e, i) => {
    if (!eligible(e, i)) return;
    const [a, b] = [e.from, e.to].sort(compare),
      key = JSON.stringify([a, b]);
    if (!bundles.has(key)) bundles.set(key, { a, b, indices: [], forward: [], reverse: [] });
    const bundle = bundles.get(key);
    bundle.indices.push(i);
    bundle[e.from === a ? 'forward' : 'reverse'].push(i);
  });
  return [...bundles.values()];
}
export function bundleLanes(machine, members, scale = 1) {
  const a = [machine.edges[members[0]].from, machine.edges[members[0]].to].sort(compare)[0],
    forward = members.filter((i) => machine.edges[i].from === a),
    reverse = members.filter((i) => machine.edges[i].from !== a),
    result = new Map();
  if (forward.length && reverse.length) {
    for (const [indices, side] of [
      [forward, -1],
      [reverse, 1],
    ])
      indices.forEach((i, rank) =>
        result.set(i, {
          offset: side * (rank + 1) * 14 * scale,
          port: side * (rank + 1) * Math.min(7 * scale, 28 / indices.length),
        }),
      );
  } else
    members.forEach((i, rank) =>
      result.set(i, {
        offset: (rank - (members.length - 1) / 2) * 14 * scale,
        port:
          (rank - (members.length - 1) / 2) *
          Math.min(7 * scale, 56 / Math.max(1, members.length - 1)),
      }),
    );
  return result;
}
