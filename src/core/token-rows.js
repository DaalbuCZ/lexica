/** Pack natural-width cards into rows; short tokens never stretch to fill a row. */
export function packTokenRows(sizes, width, gap = 6) {
  const rows = [];
  let row = null,
    used = 0;
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index],
      cardWidth = Math.min(width, size.width);
    if (!row || used + cardWidth > width + 0.5) {
      row = { start: index, end: index, height: size.height };
      rows.push(row);
      used = 0;
    }
    row.end = index + 1;
    row.height = Math.max(row.height, size.height);
    used += cardWidth + gap;
  }
  return rows;
}
