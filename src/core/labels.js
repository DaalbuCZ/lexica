export function stateLabel(name) {
  const words = name.trim().split(/\s+/),
    lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + word.length + 1 > 10) {
      lines.push(line);
      line = word;
    } else line += (line ? ' ' : '') + word;
  }
  lines.push(line);
  const fontSize = Math.min(12, 44 / lines.length),
    lineHeight = fontSize * 1.1;
  return {
    lines,
    fontSize,
    lineHeight,
    y: fontSize / 3 - ((lines.length - 1) * lineHeight) / 2,
    width: lines.length > 1 ? 52 : 60,
  };
}
export function transitionLabel(edge) {
  return edge.invert ? 'not (' + edge.label + ')' : edge.label;
}

// A conservative width estimate shared by canvas, SVG, and routing workers.
export function groupWidth(state) {
  return Math.max(
    88,
    [...state.name].reduce(
      (width, char) =>
        width +
        (/[ilIjt .,'!|]/u.test(char)
          ? 5
          : /[MWmw@%]/u.test(char) || char.codePointAt(0) > 127
            ? 13
            : 9),
      24,
    ),
  );
}

export function nodePort(state, angle) {
  const x = Math.cos(angle),
    y = Math.sin(angle);
  const distance = state.group
    ? Math.min((groupWidth(state) / 2 + 1) / Math.abs(x), 37 / Math.abs(y))
    : 37;
  return { x: state.x + x * distance, y: state.y + y * distance };
}

export function tokenCaption(state) {
  if (state.group || !state.token || state.accepting === false) return null;
  const half = (state.token.length + (state.skip ? 7 : 0)) * 2.75 + 4;
  return { left: state.x - half, right: state.x + half, top: state.y + 46, bottom: state.y + 60 };
}
