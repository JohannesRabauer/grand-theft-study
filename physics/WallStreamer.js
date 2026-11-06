// Wall streaming (AD-8, AD-14): the town has ~530 static wall bodies and Matter walks every body
// in the world on every step (sort, pair search, solver passes), which was two thirds of the
// per-frame logic cost. Only walls within `radius` px of something that moves (player, active
// bullies, awake props, flying pebbles) are kept in the world; the rest are parked outside it.
// Nothing is created or destroyed after startup. Re-evaluated only when an actor crosses into
// another `cell`, so most frames cost a handful of comparisons.
const CELL = 48; // an actor must cross this much before walls are re-evaluated (radius leaves 3x that as margin)
const CHUNK = 128; // walls are indexed by chunk so a re-evaluation only looks at walls near an actor

export class WallStreamer {
  constructor(scene, ctx, walls, radius) {
    this.world = scene.matter.world;
    this.ctx = ctx;
    this.radius = radius;
    // walls: [{ body, x0, y0, x1, y1 }]; they start outside the world
    this.walls = walls.map(w => ({ ...w, inWorld: false }));
    for (const w of this.walls) this.world.remove(w.body);
    this.want = new Uint8Array(this.walls.length);
    this.chunkCols = Math.ceil(ctx.map.rows[0].length * ctx.map.tileSize / CHUNK);
    this.chunkRows = Math.ceil(ctx.map.rows.length * ctx.map.tileSize / CHUNK);
    this.chunks = Array.from({ length: this.chunkCols * this.chunkRows }, () => []);
    this.walls.forEach((w, i) => {
      for (let cy = Math.floor(w.y0 / CHUNK); cy <= Math.floor((w.y1 - 1) / CHUNK); cy++) {
        for (let cx = Math.floor(w.x0 / CHUNK); cx <= Math.floor((w.x1 - 1) / CHUNK); cx++) this.chunks[cy * this.chunkCols + cx].push(i);
      }
    });
    const maxActors = 1 + ctx.quality.maxOf('maxBullies') + ctx.props.props.length + ctx.toolbelt.tools[0].shots.length;
    this.ax = new Float32Array(maxActors);
    this.ay = new Float32Array(maxActors);
    this.cells = new Int32Array(maxActors * 2).fill(-1e9);
    this.n = 0;
    this.live = 0;
    ctx.pools.register('walls', { live: () => this.live, cap: this.walls.length });
    this.update();
  }

  collect() {
    const { player, chase, props, toolbelt } = this.ctx;
    let n = 0;
    this.ax[n] = player.x;
    this.ay[n++] = player.y;
    for (const b of chase.bullies) if (b.active) { this.ax[n] = b.x; this.ay[n++] = b.y; }
    for (const p of props.props) if (p.awake && p.alive) { this.ax[n] = p.body.position.x; this.ay[n++] = p.body.position.y; }
    for (const s of toolbelt.tools[0].shots) if (s.active) { this.ax[n] = s.body.position.x; this.ay[n++] = s.body.position.y; }
    return n;
  }

  update() {
    const n = this.collect();
    let moved = n !== this.n;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.ax[i] / CELL);
      const cy = Math.floor(this.ay[i] / CELL);
      if (cx !== this.cells[i * 2] || cy !== this.cells[i * 2 + 1]) { moved = true; this.cells[i * 2] = cx; this.cells[i * 2 + 1] = cy; }
    }
    this.n = n;
    if (!moved) return;
    const r = this.radius;
    const want = this.want;
    const walls = this.walls;
    want.fill(0);
    for (let i = 0; i < n; i++) {
      const x0 = this.ax[i] - r;
      const x1 = this.ax[i] + r;
      const y0 = this.ay[i] - r;
      const y1 = this.ay[i] + r;
      const cx1 = Math.min(this.chunkCols - 1, Math.floor(x1 / CHUNK));
      const cy1 = Math.min(this.chunkRows - 1, Math.floor(y1 / CHUNK));
      for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= cy1; cy++) {
        for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= cx1; cx++) {
          const list = this.chunks[cy * this.chunkCols + cx];
          for (let k = 0; k < list.length; k++) {
            const w = walls[list[k]];
            if (w.x1 > x0 && w.x0 < x1 && w.y1 > y0 && w.y0 < y1) want[list[k]] = 1;
          }
        }
      }
    }
    for (let j = 0; j < walls.length; j++) {
      const w = walls[j];
      if ((want[j] === 1) === w.inWorld) continue;
      w.inWorld = want[j] === 1;
      if (w.inWorld) { this.world.add(w.body); this.live++; } else { this.world.remove(w.body); this.live--; }
    }
  }
}
