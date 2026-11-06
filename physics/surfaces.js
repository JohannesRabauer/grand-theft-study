// Surface service (AD-6): ctx.surfaces.at(x, y) -> surface id, O(1) grid lookup.
export class Surfaces {
  constructor(map, data) {
    this.tileSize = map.tileSize;
    this.cols = map.rows[0].length;
    this.rowCount = map.rows.length;
    this.rows = map.rows;
    this.legend = map.legend;
    this.data = data;
    this.over = new Map(); // weather overrides: tile index -> surface id
  }

  at(x, y) {
    const tx = Math.floor(x / this.tileSize);
    const ty = Math.floor(y / this.tileSize);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rowCount) return 'wall';
    return (this.over.size && this.over.get(ty * this.cols + tx)) || this.legend[this.rows[ty][tx]];
  }

  // Surface printed on the map, ignoring overrides.
  base(tx, ty) {
    return this.legend[this.rows[ty][tx]];
  }

  // Overrides are used only by the weather service (AD-6).
  override(tx, ty, id) { this.over.set(ty * this.cols + tx, id); }
  clear(tx, ty) { this.over.delete(ty * this.cols + tx); }

  solid(id) {
    return !!this.data[id]?.solid;
  }

  props(id) {
    return this.data[id] || this.data.grass;
  }
}
