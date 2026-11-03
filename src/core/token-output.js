export function tokensAtSelection(tokens, start, end, inputLength) {
  let low = 0,
    high = tokens.length;
  while (low < high) {
    const middle = (low + high) >>> 1,
      token = tokens[middle];
    if (token.offset + token.value.length <= start) low = middle + 1;
    else high = middle;
  }
  if (
    start === end &&
    start === inputLength &&
    low === tokens.length &&
    low > 0 &&
    tokens[low - 1].offset + tokens[low - 1].value.length === start
  )
    low--;
  const matches = [];
  for (let i = low; i < tokens.length; i++) {
    const t = tokens[i];
    if (start === end) {
      if (
        (start >= t.offset && start < t.offset + t.value.length) ||
        (start === inputLength && start === t.offset + t.value.length)
      )
        matches.push({
          t,
          i,
        });
      break;
    }
    if (t.offset >= end) break;
    if (t.offset + t.value.length > start)
      matches.push({
        t,
        i,
      });
  }
  return matches;
}
