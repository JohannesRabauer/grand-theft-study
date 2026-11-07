// Pure crowd rules (AD-15), no Phaser so scripts/check-crowd.mjs can run them in node.
// All functions are allocation-free: results go into caller-owned objects or are plain numbers.

// How far (px) a point lies outside the view rectangle; negative inside it. v = { cx, cy, hw, hh }.
export function outsideView(x, y, v) {
  return Math.max(Math.abs(x - v.cx) - v.hw, Math.abs(y - v.cy) - v.hh);
}

// Spawn candidates are parallel arrays (xs, ys, weight) with `taken[i] = 1` for occupied markers.
// A marker qualifies when it lies outside the view by `margin` .. `margin + ring` (a ring just off
// screen), or, while prefilling the level, anywhere within `ring` of the view edge; and when it is at
// least `playerClear` from every player (v.players, objects with x and y). Picks one at random by weight; -1 if none.
export function pickSpawn(sp, taken, v, c, rand, prefill) {
  const lo = prefill ? -Infinity : c.margin;
  const hi = prefill ? c.ring : c.margin + c.ring;
  let sum = 0;
  let last = -1;
  for (let i = 0; i < sp.count; i++) {
    if (!eligible(sp, taken, v, c, i, lo, hi)) continue;
    sum += sp.weight[i] * near(sp, v, c, i);
    last = i;
  }
  if (last < 0 || sum <= 0) return -1;
  let r = rand() * sum;
  for (let i = 0; i < sp.count; i++) {
    if (!eligible(sp, taken, v, c, i, lo, hi)) continue;
    r -= sp.weight[i] * near(sp, v, c, i);
    if (r <= 0) return i;
  }
  return last;
}

// markers close to the view edge are preferred, so the crowd stays around the player
function near(sp, v, c, i) {
  return 1 / (1 + Math.max(0, outsideView(sp.xs[i], sp.ys[i], v)) / c.falloff);
}

function eligible(sp, taken, v, c, i, lo, hi) {
  if (taken[i] || sp.weight[i] <= 0) return false;
  const d = outsideView(sp.xs[i], sp.ys[i], v);
  if (d < lo || d > hi) return false;
  for (let k = 0; k < v.players.length; k++) {
    if (Math.hypot(sp.xs[i] - v.players[k].x, sp.ys[i] - v.players[k].y) < c.playerClear) return false;
  }
  return true;
}

// A role needing `slots` pool entries may spawn only while that many are free under the cap.
export function canSpawn(live, cap, slots) {
  return live + slots <= cap;
}

// Weighted pick of a key's index from `weights` (array of numbers) with r in [0, 1).
export function weightedIndex(weights, r) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i];
  let t = r * sum;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t <= 0) return i;
  }
  return weights.length - 1;
}

// Unit vector (into out) a pedestrian steps to get out of the player's way: perpendicular to the
// player's velocity (vx, vy), on the side the pedestrian is already on (d = pedestrian - player).
// A player who is standing still just makes people step directly away.
export function sideStep(out, vx, vy, dx, dy) {
  const sp = Math.hypot(vx, vy);
  if (sp < 1) {
    const l = Math.hypot(dx, dy) || 1;
    out.x = dx / l;
    out.y = dy / l;
    return out;
  }
  let px = -vy / sp;
  let py = vx / sp;
  if (px * dx + py * dy < 0) { px = -px; py = -py; }
  out.x = px;
  out.y = py;
  return out;
}

// 0 = no reaction, 1 = step aside (react), 2 = dash away (flee): the player is closing in on the
// pedestrian (d = pedestrian - player) fast enough and from the front.
export function approach(vx, vy, dx, dy, c) {
  const sp = Math.hypot(vx, vy);
  const dist = Math.hypot(dx, dy);
  if (sp < c.closeSpeed || dist > c.closeRadius || dist < 1e-3) return 0;
  if ((vx * dx + vy * dy) / (sp * dist) < 0.5) return 0;
  return sp >= c.fleeSpeed && dist <= c.fleeRadius ? 2 : 1;
}
