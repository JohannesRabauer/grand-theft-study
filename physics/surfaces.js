// Surface service (AD-6): ctx.surfaces.at(x, y) -> surface id, O(1) grid lookup.
export class Surfaces {
  constructor(map, data) {
    this.tileSize = map.tileSize;
    this.cols = map.rows[0].length;
    this.rowCount = map.rows.length;
    this.rows = map.rows;
    this.legend = map.legend;
    this.data = data;
  }

  at(x, y) {
    const tx = Math.floor(x / this.tileSize);
    const ty = Math.floor(y / this.tileSize);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rowCount) return 'wall';
    return this.legend[this.rows[ty][tx]];
  }

  props(id) {
    return this.data[id] || this.data.grass;
  }
}
