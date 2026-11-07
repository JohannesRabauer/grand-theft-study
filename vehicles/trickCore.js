// Phaser-free maths of the trick system (AD-23): the Style combo (scoring, multiplier, banking, bailing) and the
// geometry of rails, stairs and ramps. vehicles/TrickSystem.js feeds it with what the skateboard does; numbers come
// from data/tricks.json. No allocation per frame: the geometry functions fill an `out` object.
const DEG = Math.PI / 180;

// ---- Style combo
export function createCombo() {
  return { base: 0, mult: 1, tricks: [], last: '', prev: '', timer: 0 };
}

export function resetCombo(c) {
  c.base = 0;
  c.mult = 1;
  c.tricks.length = 0;
  c.last = c.prev = '';
  c.timer = 0;
}

export const isActive = c => c.tricks.length > 0;

// What the chain is worth right now.
export const comboValue = c => Math.round(c.base * c.mult);

// Base points of one trick before the combo: `info` is { air, sweet, steps, meters, bonus } (what applies).
export function trickPoints(cfg, id, info = {}) {
  const t = cfg.tricks[id];
  return t.points + (t.perAir ?? 0) * (info.air ?? 0) + (t.perSweet ?? 0) * (info.sweet ?? 0) + (t.perStep ?? 0) * (info.steps ?? 0)
    + (t.perMeter ?? 0) * (info.meters ?? 0) + (t.perSecond ?? 0) * (info.seconds ?? 0) + (info.bonus ?? 0);
}

// Adds a trick to the chain: variety (not one of the last two tricks) scores more and grows the multiplier faster, the same
// trick twice in a row scores less and grows it slower. `perk` is the character's trickMultiplier (growth only). Returns the
// base points the trick added.
export function addTrick(c, cfg, id, points, perk = 1) {
  const k = cfg.combo;
  let pts = points;
  let growth = k.growth;
  if (isActive(c)) {
    if (id === c.last) { pts *= k.repeatPoints; growth *= k.repeatGrowth; } else if (id !== c.prev) { pts *= 1 + k.varietyPoints; growth *= 1 + k.varietyGrowth; }
  }
  c.base += pts;
  c.mult = Math.min(k.multMax, c.mult + growth * perk);
  if (c.tricks.length >= k.history) c.tricks.shift();
  c.tricks.push(id);
  c.prev = c.last;
  c.last = id;
  c.timer = k.window;
  return pts;
}

// Runs the combo timer; `hold` (airborne, grinding, in a manual) keeps it full. True when the chain ran out.
export function tickCombo(c, cfg, dt, hold) {
  if (!isActive(c)) return false;
  if (hold) { c.timer = cfg.combo.window; return false; }
  c.timer -= dt;
  return c.timer <= 0;
}

// The points a chain banks: all of it, or `bailShare` of it for a bail while the multiplier is large.
export function bankedValue(c, cfg, bailed) {
  const v = comboValue(c);
  return bailed && c.mult >= cfg.bank.bailMinMult ? Math.floor(v * cfg.bank.bailShare) : v;
}

// Money (cents) and XP of banked points. Below `minValue` nothing is paid.
export function payout(cfg, value) {
  if (value < cfg.bank.minValue) return { cents: 0, xp: 0 };
  return { cents: Math.floor(value * cfg.bank.centsPerPoint), xp: Math.floor(value * cfg.bank.xpPerPoint) };
}

// Airtime (s) of a ramp launch: longer for a taller ramp and, like the ollie, a bit longer when fast.
export const rampAirtime = (cfg, height, speed) => (cfg.ramp.airtime + cfg.ramp.perHeight * height) * (1 + cfg.ramp.speedGain * Math.min(1, speed / cfg.ramp.refSpeed));

// A sudden drop in speed with the board still pushed forward: the rider hit a wall.
export const hitWall = (cfg, before, now) => before >= cfg.bank.wallMinSpeed && now < before * (1 - cfg.bank.wallDrop);

// ---- geometry (px)
export const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function inRect(r, x, y) {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

// Is `heading` (rad) within `tolDeg` of the direction `dir` (a DIR key)?
export function facing(dir, heading, tolDeg) {
  const d = DIR[dir];
  return Math.cos(heading) * d[0] + Math.sin(heading) * d[1] >= Math.cos(tolDeg * DEG);
}

// A polyline in px with cumulative lengths. `points` are tile coordinates (continuous: [x.5, y.5] is a tile's centre).
export function buildPath(points, ts) {
  const n = points.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = points[i][0] * ts;
    y[i] = points[i][1] * ts;
    if (i) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  }
  return { x, y, cum, n, total: cum[n - 1] };
}

// The grindable edge of a bench rect (tile coordinates): its centre line along the long side, `inset` px short at both ends.
export function benchPath(o, ts, inset) {
  const horizontal = o.w >= o.h;
  const cx = (o.x + o.w / 2) * ts;
  const cy = (o.y + o.h / 2) * ts;
  const half = Math.max(0, ((horizontal ? o.w : o.h) * ts) / 2 - inset);
  const pts = horizontal ? [[(cx - half) / ts, cy / ts], [(cx + half) / ts, cy / ts]] : [[cx / ts, (cy - half) / ts], [cx / ts, (cy + half) / ts]];
  return buildPath(pts, ts);
}

// Closest point of a path to (px, py): out = { s (arc length), dist, x, y, ux, uy (unit tangent there) }.
export function projectPath(path, px, py, out) {
  let best = Infinity;
  for (let i = 0; i < path.n - 1; i++) {
    const ax = path.x[i];
    const ay = path.y[i];
    const dx = path.x[i + 1] - ax;
    const dy = path.y[i + 1] - ay;
    const len = path.cum[i + 1] - path.cum[i];
    const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len))) : 0;
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) {
      best = d;
      out.s = path.cum[i] + t * len;
      out.dist = d;
      out.x = cx;
      out.y = cy;
      out.ux = len > 0 ? dx / len : 1;
      out.uy = len > 0 ? dy / len : 0;
    }
  }
  return out;
}

// The point at arc length s (clamped to the path) with its tangent: out = { x, y, ux, uy }.
export function pointAt(path, s, out) {
  const t = Math.max(0, Math.min(path.total, s));
  let i = 0;
  while (i < path.n - 2 && path.cum[i + 1] < t) i++;
  const len = path.cum[i + 1] - path.cum[i];
  const f = len > 0 ? (t - path.cum[i]) / len : 0;
  out.x = path.x[i] + (path.x[i + 1] - path.x[i]) * f;
  out.y = path.y[i] + (path.y[i + 1] - path.y[i]) * f;
  out.ux = len > 0 ? (path.x[i + 1] - path.x[i]) / len : 1;
  out.uy = len > 0 ? (path.y[i + 1] - path.y[i]) / len : 0;
  return out;
}

// Does a skater at (px, py) heading `heading` catch this rail? Within `half` px of it and within `tolDeg` of its direction
// (either way along it). On success out also gets `dir`: +1 when the skater goes with the path, -1 against it.
export function captureRail(path, half, tolDeg, px, py, heading, out) {
  projectPath(path, px, py, out);
  if (out.dist > half) return false;
  const along = Math.cos(heading) * out.ux + Math.sin(heading) * out.uy;
  if (Math.abs(along) < Math.cos(tolDeg * DEG)) return false;
  out.dir = along >= 0 ? 1 : -1;
  return true;
}
