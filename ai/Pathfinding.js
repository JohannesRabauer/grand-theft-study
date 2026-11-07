// Grid A* over the AD-5 map (no Phaser, so scripts/check-chase.mjs can run it in node).
// Walkability and cost come from the map legend + data/surfaces.json (solid = blocked, cost =
// 1 / foot speed, tiles beside walls cost extra so paths keep clear of corners). Everything is
// preallocated: searches reuse typed arrays and an indexed binary heap, no allocation per request.
// Requests share completion and expanded-node budgets; long searches resume next frame.
const DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const SQRT2 = Math.SQRT2;

export class Pathfinder {
  constructor(map, surfaceData, cfg) {
    this.cfg = cfg;
    this.queue = new Array(cfg.queueSize).fill(null);
    this.n = 0;
    this.gen = 0;
    this.setMap(map, surfaceData);
  }

  // Rebuilds the grid for another map (AD-28); the buffers are only reallocated when the size changes.
  setMap(map, surfaceData) {
    const { cfg } = this;
    this.ts = map.tileSize;
    this.cols = map.rows[0].length;
    this.rowCount = map.rows.length;
    const n = this.cols * this.rowCount;
    if (this.activeSearch) this.activeSearch.pathPending = false;
    for (const owner of this.queue) if (owner) owner.pathPending = false;
    this.qHead = 0;
    this.qCount = 0;
    this.activeSearch = null;
    this.queue.fill(null);
    this.size = 0;
    this.solvedLastUpdate = 0;
    if (n !== this.n) this.allocate(n);
    for (let ty = 0; ty < this.rowCount; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const s = surfaceData[map.legend[map.rows[ty][tx]]];
        this.solid[ty * this.cols + tx] = s?.solid ? 1 : 0;
        this.cost[ty * this.cols + tx] = 1 / (s?.speed?.foot ?? 1);
      }
    }
    const worker = this.worker ??= Object.create(Pathfinder.prototype);
    if (worker.n !== n) worker.allocate(n);
    Object.assign(worker, { cfg, ts: this.ts, cols: this.cols, rowCount: this.rowCount, solid: this.solid, cost: this.cost });
    for (let ty = 0; ty < this.rowCount; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        if (this.isSolid(tx, ty)) continue;
        for (let d = 0; d < 8; d++) {
          if (this.isSolid(tx + DX[d], ty + DY[d])) { this.cost[ty * this.cols + tx] += cfg.wallPenalty; break; }
        }
      }
    }
  }

  allocate(n) {
    this.n = n;
    this.solid = new Uint8Array(n);
    this.cost = new Float32Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.openGen = new Uint32Array(n);
    this.closedGen = new Uint32Array(n);
    this.hpos = new Int32Array(n);
    this.heap = new Int32Array(n);
    this.gen = 0;
  }

  isSolid(tx, ty) {
    return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rowCount || this.solid[ty * this.cols + tx] === 1;
  }

  tileOf(x, y) {
    return Math.floor(y / this.ts) * this.cols + Math.floor(x / this.ts);
  }

  // Nearest walkable tile index to (tx, ty) within snapRadius, or -1.
  snap(tx, ty) {
    if (!this.isSolid(tx, ty)) return ty * this.cols + tx;
    let best = -1;
    let bestD = Infinity;
    const r = this.cfg.snapRadius;
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (this.isSolid(x, y)) continue;
        const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (d < bestD) { bestD = d; best = y * this.cols + x; }
      }
    }
    return best;
  }

  // Grid raycast (Amanatides-Woo) in world pixels: true when no solid tile lies on the segment.
  lineClear(x0, y0, x1, y1) {
    const ts = this.ts;
    let cx = Math.floor(x0 / ts);
    let cy = Math.floor(y0 / ts);
    const ex = Math.floor(x1 / ts);
    const ey = Math.floor(y1 / ts);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? ts / Math.abs(dx) : Infinity;
    const tdy = dy !== 0 ? ts / Math.abs(dy) : Infinity;
    let tmx = dx > 0 ? ((cx + 1) * ts - x0) / dx : dx < 0 ? (cx * ts - x0) / dx : Infinity;
    let tmy = dy > 0 ? ((cy + 1) * ts - y0) / dy : dy < 0 ? (cy * ts - y0) / dy : Infinity;
    for (let steps = Math.abs(ex - cx) + Math.abs(ey - cy) + 1; steps > 0; steps--) {
      if (this.isSolid(cx, cy)) return false;
      if (cx === ex && cy === ey) return true;
      if (tmx < tmy) { cx += sx; tmx += tdx; } else { cy += sy; tmy += tdy; }
    }
    return true;
  }

  // lineClear for a body of radius r: the centre ray plus one ray along each side.
  clearFor(x0, y0, x1, y1, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return !this.isSolid(Math.floor(x0 / this.ts), Math.floor(y0 / this.ts));
    const nx = (-dy / len) * r;
    const ny = (dx / len) * r;
    return this.lineClear(x0, y0, x1, y1) && this.lineClear(x0 + nx, y0 + ny, x1 + nx, y1 + ny) &&
      this.lineClear(x0 - nx, y0 - ny, x1 - nx, y1 - ny);
  }

  // Writes tile indices start..goal into `out` (Int32Array); returns the count, 0 when unreachable
  // or longer than `out`.
  findPath(sx, sy, gx, gy, out) {
    this.beginPath(sx, sy, gx, gy, out);
    this.advancePath(out, Infinity);
    return this.searchResult;
  }

  beginPath(sx, sy, gx, gy, out) {
    const cols = this.cols;
    const s = this.snap(Math.floor(sx / this.ts), Math.floor(sy / this.ts));
    const goal = this.snap(Math.floor(gx / this.ts), Math.floor(gy / this.ts));
    this.searchResult = 0;
    this.searchDone = true;
    this.expanded = 0;
    if (s < 0 || goal < 0) return;
    if (s === goal) { out[0] = s; this.searchResult = 1; return; }
    const { g, f, from, openGen } = this;
    const gen = ++this.gen;
    const goalX = goal % cols;
    const goalY = (goal / cols) | 0;
    this.searchDone = false;
    this.searchGoal = goal;
    this.goalX = goalX;
    this.goalY = goalY;
    this.size = 0;
    g[s] = 0;
    f[s] = this.h(s % cols, (s / cols) | 0, goalX, goalY);
    from[s] = -1;
    openGen[s] = gen;
    this.push(s);
  }

  advancePath(out, limit) {
    const { g, f, from, openGen, closedGen, cost, solid, cols, goalX, goalY, gen } = this;
    this.expanded = 0;
    if (this.searchDone) return;
    while (this.size > 0 && this.expanded < limit) {
      this.expanded++;
      const cur = this.pop();
      if (cur === this.searchGoal) {
        this.searchResult = this.trace(cur, out);
        this.searchDone = true;
        return;
      }
      closedGen[cur] = gen;
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= this.rowCount) continue;
        const ni = ny * cols + nx;
        if (solid[ni] === 1 || closedGen[ni] === gen) continue;
        const diag = d >= 4;
        if (diag && (solid[cy * cols + nx] === 1 || solid[ny * cols + cx] === 1)) continue; // no corner cutting
        const ng = g[cur] + (diag ? SQRT2 : 1) * cost[ni];
        if (openGen[ni] !== gen) {
          openGen[ni] = gen;
          g[ni] = ng;
          f[ni] = ng + this.h(nx, ny, goalX, goalY);
          from[ni] = cur;
          this.push(ni);
        } else if (ng < g[ni]) {
          f[ni] -= g[ni] - ng;
          g[ni] = ng;
          from[ni] = cur;
          this.up(this.hpos[ni]);
        }
      }
    }
    if (!this.size) this.searchDone = true;
  }

  h(x, y, gx, gy) { // octile distance; every tile costs >= 1
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  trace(goal, out) {
    let n = 0;
    for (let i = goal; i >= 0; i = this.from[i]) n++;
    if (n > out.length) return 0;
    let k = n;
    for (let i = goal; i >= 0; i = this.from[i]) out[--k] = i;
    return n;
  }

  push(i) {
    const k = this.size++;
    this.heap[k] = i;
    this.hpos[i] = k;
    this.up(k);
  }

  pop() {
    const h = this.heap;
    const top = h[0];
    const last = h[--this.size];
    if (this.size > 0) { h[0] = last; this.hpos[last] = 0; this.down(0); }
    return top;
  }

  up(k) {
    const { heap: h, f, hpos } = this;
    const i = h[k];
    while (k > 0) {
      const p = (k - 1) >> 1;
      const pi = h[p];
      if (f[pi] <= f[i]) break;
      h[k] = pi; hpos[pi] = k; k = p;
    }
    h[k] = i; hpos[i] = k;
  }

  down(k) {
    const { heap: h, f, hpos, size: n } = this;
    const i = h[k];
    for (;;) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && f[h[c + 1]] < f[h[c]]) c++;
      const ci = h[c];
      if (f[ci] >= f[i]) break;
      h[k] = ci; hpos[ci] = k; k = c;
    }
    h[k] = i; hpos[i] = k;
  }

  // Owners (bullies) call request(); each is later served by owner.solvePath(this) within the
  // per-frame budget. An owner is queued at most once (pathPending).
  request(owner) {
    if (owner.pathPending || this.qCount >= this.queue.length) return;
    owner.pathPending = true;
    this.queue[(this.qHead + this.qCount++) % this.queue.length] = owner;
  }

  cancel(owner) {
    if (this.activeSearch === owner) this.activeSearch = null;
    for (let i = 0; i < this.queue.length; i++) if (this.queue[i] === owner) this.queue[i] = null;
    owner.pathPending = false;
  }

  update() {
    let done = 0;
    let nodes = this.cfg.nodesPerFrame ?? 256;
    this.expandedLastUpdate = 0;
    while (done < this.cfg.budget && (this.qCount > 0 || this.activeSearch)) {
      if (this.activeSearch) {
        const o = this.activeSearch;
        if (o.active) {
          this.worker.advancePath(o.path, nodes);
          nodes -= this.worker.expanded;
          this.expandedLastUpdate += this.worker.expanded;
          if (!this.worker.searchDone) break;
          o.receivePath(this.worker.searchResult);
        }
        o.pathPending = false;
        this.activeSearch = null;
        done++;
        if (nodes <= 0) break;
        continue;
      }
      const o = this.queue[this.qHead];
      this.queue[this.qHead] = null;
      this.qHead = (this.qHead + 1) % this.queue.length;
      this.qCount--;
      if (!o) continue;
      if (typeof o.receivePath === 'function') {
        this.activeSearch = o;
        this.worker.beginPath(o.x, o.y, o.goalX, o.goalY, o.path);
      } else {
        o.pathPending = false;
        o.solvePath(this);
        done++;
      }
    }
    this.solvedLastUpdate = done;
  }
}
