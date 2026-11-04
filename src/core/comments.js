import { emptyAngles, loopSlots } from './angular-space.js';
export function commentLayout(comment) {
  const lines = [];
  for (const paragraph of comment.text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let rest = paragraph;
    while (rest.length > 40) {
      let cut = rest.lastIndexOf(' ', 40);
      if (cut < 1) cut = 40;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
  }
  return {
    lines,
    w: Math.max(110, Math.max(...lines.map((x) => x.length)) * 6.7 + 24),
    h: Math.max(42, lines.length * 17 + 20),
  };
}
export function nearestState(machine, point) {
  return machine.states.reduce(
    (best, s) =>
      !best ||
      Math.hypot(s.x - point.x, s.y - point.y) < Math.hypot(best.x - point.x, best.y - point.y)
        ? s
        : best,
    null,
  );
}
export function commentNodeIds(comment) {
  return comment.nodeIds ?? (comment.nodeId ? [comment.nodeId] : []);
}
export function makeComment(machine, position, id = crypto.randomUUID()) {
  const node = nearestState(machine, position);
  return {
    id,
    text: 'Comment',
    x: position.x,
    y: position.y,
    nodeIds: node ? [node.id] : [],
  };
}
export function toggleCommentNode(machine, commentId, nodeId) {
  const comment = machine.comments?.find((c) => c.id === commentId);
  if (!comment || !machine.states.some((s) => s.id === nodeId))
    throw Error('Invalid comment attachment.');
  const ids = commentNodeIds(comment);
  comment.nodeIds = ids.includes(nodeId) ? ids.filter((id) => id !== nodeId) : [...ids, nodeId];
  delete comment.nodeId;
}
export function commentAnchors(machine) {
  return (machine.comments ?? []).flatMap((comment) => {
    if (comment.nodeIds === undefined) {
      const nearest = nearestState(machine, comment);
      comment.nodeIds =
        comment.nodeId === undefined ? (nearest ? [nearest.id] : []) : commentNodeIds(comment);
      delete comment.nodeId;
    }
    const nodes = machine.states.filter((s) => comment.nodeIds.includes(s.id));
    return nodes.length
      ? [
          {
            comment,
            nodes,
            dx: comment.x - nodes.reduce((sum, s) => sum + s.x, 0) / nodes.length,
            dy: comment.y - nodes.reduce((sum, s) => sum + s.y, 0) / nodes.length,
          },
        ]
      : [];
  });
}
export function positionComments(anchors) {
  for (const { comment, nodes, dx, dy } of anchors) {
    comment.x = nodes.reduce((sum, s) => sum + s.x, 0) / nodes.length + dx;
    comment.y = nodes.reduce((sum, s) => sum + s.y, 0) / nodes.length + dy;
  }
}
export function placeCommentsAfterLayout(machine) {
  const states = new Map(machine.states.map((state) => [state.id, state])),
    placed = [];
  const segments = (machine.edges ?? []).flatMap((edge) => {
    const from = states.get(edge.from),
      to = states.get(edge.to);
    return from && to && from !== to && edge.portal == null ? [[from, to]] : [];
  });
  const hits = (a, b, box) => {
    let lo = 0,
      hi = 1;
    for (const [start, delta, min, max] of [
      [a.x, b.x - a.x, box.x, box.x + box.w],
      [a.y, b.y - a.y, box.y, box.y + box.h],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (start < min || start > max) return false;
        continue;
      }
      const first = (min - start) / delta,
        last = (max - start) / delta;
      lo = Math.max(lo, Math.min(first, last));
      hi = Math.min(hi, Math.max(first, last));
      if (lo > hi) return false;
    }
    return true;
  };
  for (const comment of machine.comments ?? []) {
    const attached = commentNodeIds(comment)
      .map((id) => states.get(id))
      .filter(Boolean);
    if (!attached.length) continue;
    const { w, h } = commentLayout(comment),
      center = {
        x: attached.reduce((sum, s) => sum + s.x, 0) / attached.length,
        y: attached.reduce((sum, s) => sum + s.y, 0) / attached.length,
      };
    const ids = new Set(attached.map((state) => state.id));
    const directions = machine.edges.flatMap((edge) => {
      const other =
        ids.has(edge.from) && !ids.has(edge.to)
          ? states.get(edge.to)
          : ids.has(edge.to) && !ids.has(edge.from)
            ? states.get(edge.from)
            : null;
      return other ? [Math.atan2(other.y - center.y, other.x - center.x)] : [];
    });
    const loopBoxes = [];
    for (const state of attached)
      for (const angle of loopSlots(machine, state).values()) {
        const x = state.x + Math.cos(angle) * 105,
          y = state.y + Math.sin(angle) * 105;
        directions.push(Math.atan2(y - center.y, x - center.x));
        loopBoxes.push({ x: x - 70, y: y - 65, w: 140, h: 130 });
      }
    directions.push(
      ...placed.map((box) =>
        Math.atan2(box.y + box.h / 2 - center.y, box.x + box.w / 2 - center.x),
      ),
    );
    const angles = emptyAngles(directions),
      base = Math.max(95, w / 2 + 65, h / 2 + 65);
    const candidates = [
      ...Array.from(
        {
          length: 3 * 24,
        },
        (_, i) => {
          const radius = base + Math.floor(i / 24) * 70,
            angle =
              angles[i % angles.length] +
              (i % 24 >= angles.length
                ? ((Math.floor((i % 24) / angles.length) % 2 ? 1 : -1) *
                    Math.ceil(Math.floor((i % 24) / angles.length) / 2) *
                    Math.PI) /
                  12
                : 0);
          return {
            x: center.x + Math.cos(angle) * radius - w / 2,
            y: center.y + Math.sin(angle) * radius - h / 2,
            rank: i % 24,
          };
        },
      ),
    ];
    let best = null;
    for (const candidate of candidates) {
      const box = {
          ...candidate,
          w,
          h,
        },
        mid = {
          x: box.x + w / 2,
          y: box.y + h / 2,
        };
      let score = Math.hypot(mid.x - center.x, mid.y - center.y) * 0.15 + candidate.rank * 12;
      for (const state of machine.states) {
        const dx = Math.max(box.x - state.x, 0, state.x - box.x - w),
          dy = Math.max(box.y - state.y, 0, state.y - box.y - h);
        if (Math.hypot(dx, dy) < 52) score += 5000;
      }
      for (const [a, b] of segments)
        if (
          hits(a, b, {
            x: box.x - 8,
            y: box.y - 8,
            w: w + 16,
            h: h + 16,
          })
        )
          score += 1200;
      for (const other of [...placed, ...loopBoxes])
        if (
          box.x < other.x + other.w + 12 &&
          box.x + w + 12 > other.x &&
          box.y < other.y + other.h + 12 &&
          box.y + h + 12 > other.y
        )
          score += 5000;
      for (const state of attached)
        for (const [a, b] of segments)
          if (
            a !== state &&
            b !== state &&
            hits(state, mid, {
              x: Math.min(a.x, b.x) - 6,
              y: Math.min(a.y, b.y) - 6,
              w: Math.abs(a.x - b.x) + 12,
              h: Math.abs(a.y - b.y) + 12,
            })
          )
            score += 250;
      if (!best || score < best.score)
        best = {
          ...box,
          score,
        };
    }
    comment.x = best.x;
    comment.y = best.y;
    placed.push(best);
  }
}
export function commentLinks(machine) {
  return (machine.comments ?? []).flatMap((comment) => {
    const { w, h } = commentLayout(comment),
      center = {
        x: comment.x + w / 2,
        y: comment.y + h / 2,
      };
    return machine.states
      .filter((s) => commentNodeIds(comment).includes(s.id))
      .flatMap((s) => {
        const dx = s.x - center.x,
          dy = s.y - center.y,
          length = Math.hypot(dx, dy),
          t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
        if (!length || t >= 1 - 36 / length) return [];
        return [
          {
            commentId: comment.id,
            nodeId: s.id,
            from: {
              x: center.x + dx * t,
              y: center.y + dy * t,
            },
            to: {
              x: s.x - (dx * 36) / length,
              y: s.y - (dy * 36) / length,
            },
          },
        ];
      });
  });
}
export const commentLinkKey = (commentId, nodeId) => JSON.stringify([commentId, nodeId]);
export function connectCommentNode(machine, commentId, nodeId) {
  const comment = machine.comments?.find((c) => c.id === commentId);
  if (!comment || !machine.states.some((s) => s.id === nodeId))
    throw Error('Invalid comment attachment.');
  comment.nodeIds = [...new Set([...commentNodeIds(comment), nodeId])];
  delete comment.nodeId;
}
export function removeCommentLinks(machine, keys) {
  for (const comment of machine.comments ?? []) {
    comment.nodeIds = commentNodeIds(comment).filter(
      (id) => !keys.has(commentLinkKey(comment.id, id)),
    );
    delete comment.nodeId;
  }
}
