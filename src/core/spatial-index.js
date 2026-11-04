// Uniform spatial hash with a bounded-cell fallback for very long geometry.
export class SpatialIndex {
  constructor(cellSize = 256) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.items = new Map();
    this.large = new Set();
  }
  keys(box) {
    const x0 = Math.floor(box.left / this.cellSize),
      x1 = Math.floor(box.right / this.cellSize);
    const y0 = Math.floor(box.top / this.cellSize),
      y1 = Math.floor(box.bottom / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) return null;
    const result = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) result.push(`${x}:${y}`);
    return result;
  }
  set(id, box) {
    this.delete(id);
    const keys = this.keys(box);
    this.items.set(id, { box, keys });
    if (!keys) this.large.add(id);
    else
      for (const key of keys) {
        if (!this.cells.has(key)) this.cells.set(key, new Set());
        this.cells.get(key).add(id);
      }
  }
  delete(id) {
    const item = this.items.get(id);
    if (!item) return;
    for (const key of item.keys ?? []) {
      const cell = this.cells.get(key);
      cell.delete(id);
      if (!cell.size) this.cells.delete(key);
    }
    this.large.delete(id);
    this.items.delete(id);
  }
  query(box) {
    const keys = this.keys(box),
      candidates = new Set(this.large);
    if (!keys) for (const id of this.items.keys()) candidates.add(id);
    else for (const key of keys) for (const id of this.cells.get(key) ?? []) candidates.add(id);
    return [...candidates].filter((id) => {
      const b = this.items.get(id).box;
      return (
        b.left <= box.right && b.right >= box.left && b.top <= box.bottom && b.bottom >= box.top
      );
    });
  }
}
