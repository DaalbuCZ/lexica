import {commentAnchors, positionComments} from './comments.js';
import {graphView} from './groups.js';

// Connected branches own separate bands; related branches sit together.
export function arrangeGraph(machine, focus = null) {
  const view = graphView(machine, focus, false);
  if (!view.states.length) return machine;
  const anchors = commentAnchors(machine);
  const states = new Map(view.states.map(state => [state.id, state]));
  const outgoing = new Map(view.states.map(state => [state.id, []]));
  for (const edge of view.edges) if (edge.from !== edge.to && outgoing.has(edge.from) && states.has(edge.to)) outgoing.get(edge.from).push(edge.to);
  const children = new Map(view.states.map(state => [state.id, []]));
  const parents = new Map(), seen = new Set(), order = [], roots = [];
  for (const root of [view.start, ...states.keys()]) {
    if (!states.has(root) || seen.has(root)) continue;
    roots.push(root);
    const stack = [{id: root, parent: null}];
    while (stack.length) {
      const {id, parent} = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id); order.push(id); parents.set(id, parent);
      if (parent !== null) children.get(parent).push(id);
      for (const next of [...outgoing.get(id)].reverse()) if (!seen.has(next)) stack.push({id: next, parent: id});
    }
  }
  const pathCache = new Map(), related = new Map();
  const path = id => {
    if (!pathCache.has(id)) {
      const result = [];
      for (let cursor = id; cursor != null; cursor = parents.get(cursor)) result.push(cursor);
      pathCache.set(id, result.reverse());
    }
    return pathCache.get(id);
  };
  for (const [from, targets] of outgoing) for (const to of targets) {
    const a = path(from), b = path(to);
    let shared = 0;
    while (shared < Math.min(a.length, b.length) && a[shared] === b[shared]) shared++;
    if (!shared || shared === a.length || shared === b.length) continue;
    for (const [left, right] of [[a[shared], b[shared]], [b[shared], a[shared]]]) {
      if (!related.has(left)) related.set(left, new Map());
      const weights = related.get(left);
      weights.set(right, (weights.get(right) ?? 0) + 1);
    }
  }
  for (const [parent, branches] of children) {
    const original = new Map(branches.map((id, index) => [id, index]));
    const placed = new Set(), ordered = [];
    for (const first of branches) {
      const stack = [first];
      while (stack.length) {
        const id = stack.pop();
        if (placed.has(id)) continue;
        placed.add(id); ordered.push(id);
        const neighbors = [...(related.get(id) ?? [])].filter(([next]) => original.has(next) && !placed.has(next))
          .sort((a, b) => b[1] - a[1] || original.get(a[0]) - original.get(b[0]));
        for (const [next] of neighbors.reverse()) stack.push(next);
      }
    }
    children.set(parent, ordered);
  }
  const heights = new Map(), gap = 60;
  for (const id of [...order].reverse()) {
    const loops = view.edges.filter(edge => edge.from === id && edge.to === id).length;
    const own = 220 + Math.max(0, loops - 1) * 55;
    const branches = children.get(id);
    heights.set(id, Math.max(own, branches.reduce((sum, child) => sum + heights.get(child), 0) + Math.max(0, branches.length - 1) * gap));
  }
  const step = Math.max(300, ...view.edges.map(edge => (edge.label?.length ?? 0) * 7 + 180));
  const positions = new Map();
  let forestTop = 100;
  for (const root of roots) {
    const queue = [{id: root, depth: 0, top: forestTop}];
    for (let i = 0; i < queue.length; i++) {
      const {id, depth, top} = queue[i], branches = children.get(id);
      positions.set(id, {x: 160 + depth * step, y: top + heights.get(id) / 2});
      const childHeight = branches.reduce((sum, child) => sum + heights.get(child), 0) + Math.max(0, branches.length - 1) * gap;
      let childTop = top + (heights.get(id) - childHeight) / 2;
      for (const child of branches) {queue.push({id: child, depth: depth + 1, top: childTop}); childTop += heights.get(child) + gap;}
    }
    forestTop += heights.get(root) + 120;
  }
  for (const state of machine.states) {
    const next = positions.get(state.id);
    if (next) {state.x = next.x; state.y = next.y;}
  }
  if (!focus) for (const group of machine.groups ?? []) {
    const before = states.get(group.id), after = positions.get(group.id);
    if (!before || !after) continue;
    const dx = after.x - before.x, dy = after.y - before.y;
    for (const state of machine.states) if (group.stateIds.includes(state.id)) {state.x += dx; state.y += dy;}
  }
  delete machine.startViews;
  positionComments(anchors);
  return machine;
}
