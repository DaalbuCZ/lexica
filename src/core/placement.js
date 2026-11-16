import { commentLayout, commentLinks, makeComment } from './comments.js';

export function commentPlacement(machine, point, id) {
  const note = makeComment(machine, point, id);
  const { w, h } = commentLayout(note);
  note.x -= w / 2;
  note.y -= h / 2;
  return commentLinks({ ...machine, comments: [note] }).length ? note : null;
}

export function placementPreview(machine, type, point) {
  if (!type || !point) return null;
  const item =
    type === 'comment'
      ? commentPlacement(machine, point, 'placement-preview')
      : {
          id: 'placement-preview',
          name: 'q' + machine.states.length,
          token: '',
          x: point.x,
          y: point.y,
        };
  return item ? { type, item } : null;
}
