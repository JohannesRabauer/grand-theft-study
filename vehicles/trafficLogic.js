// Phaser-free traffic hit logic (story 5.6, AD-23, CAP-31): where a moving vehicle hurts, the comic launch and its fake-height
// arc, the tumble phases with the stun and invulnerability timers, the coins a hit spills and the path pedestrians step out of.
// `cfg` is data/traffic.json. Geometry is local to the vehicle: `along` its heading (0 = centre, + = front), `lat` across it.
// The hit is a plain geometric query (never a Matter force, AD-3); the grab zone behind the rear is safe (data/grab.json).

// Where does a vehicle at (x, y) heading `h`, `length` x `width` px, with the rear grab `zone`, touch the circle (px, py, pr)?
// 'rear' (inside the safe grab zone), '' (no contact), 'front' or 'side'. `hit` is the kind's entry of cfg.kinds.
export function classifyHit(x, y, h, length, width, zone, hit, px, py, pr) {
  const c = Math.cos(h);
  const s = Math.sin(h);
  const dx = px - x;
  const dy = py - y;
  const along = dx * c + dy * s;
  const lat = -dx * s + dy * c;
  const rear = -length / 2;
  if (along >= rear - zone.length && along <= rear + zone.reach && Math.abs(lat) <= zone.width / 2) return 'rear';
  const front = length / 2 + hit.frontReach;
  const half = width / 2 + hit.sideReach;
  const nx = Math.max(rear + zone.reach, Math.min(front, along)); // nearest point of the hit box
  const ny = Math.max(-half, Math.min(half, lat));
  if (Math.hypot(along - nx, lat - ny) > pr) return '';
  return nx >= front - hit.frontDepth ? 'front' : 'side';
}

export function relativeSpeed(vx, vy, wx, wy) {
  return Math.hypot(vx - wx, vy - wy);
}

// Is a pedestrian at (px, py) in the path of a vehicle (so it should step aside early)?
export function inPath(x, y, h, length, width, react, px, py) {
  const dx = px - x;
  const dy = py - y;
  const along = dx * Math.cos(h) + dy * Math.sin(h);
  const lat = -dx * Math.sin(h) + dy * Math.cos(h);
  return along >= -length / 2 - react.behind && along <= length / 2 + react.ahead && Math.abs(lat) <= width / 2 + react.lane;
}

// Fraction (0..1) of the straight way (dx, dy) from (x, y) that is free of `solid(x, y)` ground, sampled every `step` px
// with `pad` px of body margin on every side.
export function clearFraction(x, y, dx, dy, step, pad, solid) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
  for (let i = 1; i <= n; i++) {
    const cx = x + (dx * i) / n;
    const cy = y + (dy * i) / n;
    if (solid(cx, cy) || solid(cx + pad, cy) || solid(cx - pad, cy) || solid(cx, cy + pad) || solid(cx, cy - pad)) return (i - 1) / n;
  }
  return 1;
}

// The launch of a hit at (x, y) by a vehicle heading `h`; `lat` is the side of its centre line the player was on. Writes the
// displacement into out { dx, dy, side } (side = +1 / -1, the turn direction): along the heading and off to the player's side, to
// the other side when a wall is there, shortened before a wall.
export function planLaunch(cfg, h, lat, x, y, solid, out) {
  const l = cfg.launch;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const first = lat >= 0 ? 1 : -1;
  let best = -1;
  for (const sign of [first, -first]) {
    const dx = c * l.forward - s * l.side * sign;
    const dy = s * l.forward + c * l.side * sign;
    const f = clearFraction(x, y, dx, dy, l.probe, l.pad, solid);
    if (f > best) { best = f; out.dx = dx * f; out.dy = dy * f; out.side = sign; }
    if (f >= 1) break;
  }
  return out;
}

// The player at progress u (0..1) of the launch: out { x, y, lift, spin } (spin in radians, turning the way it is thrown).
export function flightAt(u, x, y, plan, l, out) {
  const e = 1 - (1 - u) * (1 - u); // fast off the bumper, slowing down
  out.x = x + plan.dx * e;
  out.y = y + plan.dy * e;
  out.lift = 4 * l.peak * u * (1 - u);
  out.spin = plan.side * l.spins * 2 * Math.PI * u;
  return out;
}

// Share (0..1) of the way a flung vehicle has slid after progress u: starts fast, stops softly.
export function slideFraction(u) {
  return 1 - (1 - u) * (1 - u);
}

// ---- the tumble: fly (the launch), lie (sprawled), get up, then the slow stun; the invulnerability follows the get-up
export const IDLE = 0;
export const FLY = 1;
export const LIE = 2;
export const GETUP = 3;
export const LANDED = 1;
export const UP = 2;
export const DONE = 4;

export function createHit() {
  return { phase: IDLE, t: 0, stun: 0, safe: 0 };
}

export function canBeHit(h) {
  return h.phase === IDLE && h.safe <= 0;
}

export function startHit(h) {
  h.phase = FLY;
  h.t = 0;
  h.stun = 0;
  h.safe = 0;
}

// One frame; returns LANDED / UP / DONE bits for the phase changes it passed.
export function stepHit(h, cfg, dt) {
  if (h.stun > 0) h.stun = Math.max(0, h.stun - dt);
  if (h.safe > 0) h.safe = Math.max(0, h.safe - dt);
  if (h.phase === IDLE) return 0;
  let flags = 0;
  h.t += dt;
  if (h.phase === FLY && h.t >= cfg.launch.seconds) { h.phase = LIE; h.t -= cfg.launch.seconds; flags |= LANDED; }
  if (h.phase === LIE && h.t >= cfg.lie) { h.phase = GETUP; h.t -= cfg.lie; h.stun = cfg.stun.seconds; flags |= UP; }
  if (h.phase === GETUP && h.t >= cfg.getUp) { h.phase = IDLE; h.t = 0; h.safe = cfg.invulnerable; flags |= DONE; }
  return flags;
}

// What a hit spills out of a pocket holding `money` cents: { total, parts } (cents per coin), never more than the pocket
// holds. `rand` returns [0, 1).
export function spillCoins(cfg, money, rand) {
  const c = cfg.coins;
  const total = Math.min(money, c.cents[0] + Math.floor(rand() * (c.cents[1] - c.cents[0] + 1)));
  if (total <= 0) return { total: 0, parts: [] };
  const n = Math.min(total, c.count[0] + Math.floor(rand() * (c.count[1] - c.count[0] + 1)));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(Math.floor(total / n) + (i < total % n ? 1 : 0));
  return { total, parts };
}
