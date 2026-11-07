// Pure rules of bike parking and borrowing (CAP-16), numbers from data/theft.json. Phaser-free.

// The rack (any {x, y} in px) within `radius` of the point, nearest first; null when none.
export function rackNear(racks, x, y, radius) {
  let best = null;
  let bestD = radius;
  for (const r of racks) {
    const d = Math.hypot(r.x - x, r.y - y);
    if (d <= bestD) { best = r; bestD = d; }
  }
  return best;
}

// Seconds a parked bike has been left alone: it counts while every player is further than `awayDistance`, a nearby player resets it.
export function awayTime(awayT, dt, nearestPlayerDist, cfg) {
  return nearestPlayerDist > cfg.awayDistance ? awayT + dt : 0;
}

// The bully spawn that sends a thief: nearest to the bike within `originRadius` and out of every player's view (`visible(x, y)`).
export function pickOrigin(spawns, x, y, cfg, visible) {
  let best = null;
  let bestD = cfg.originRadius;
  for (const s of spawns) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD && !visible(s.x, s.y)) { best = s; bestD = d; }
  }
  return best;
}

// Why a bully would want the bike: trouble is already on (Aerger >= 1 or a bully about), or a spawn point is close.
export function hasMotive(anger, bullyActive, origin, x, y, cfg) {
  return anger >= 1 || bullyActive || (origin !== null && Math.hypot(origin.x - x, origin.y - y) <= cfg.motiveRadius);
}

// Everything that has to hold for a borrow attempt on one bike (the dice come last, in the caller).
export function borrowable(b, cfg) {
  return !b.locked && !b.busy && b.awayT >= cfg.awaySeconds && !b.inView && b.motive;
}

// The hideout ({ x, y }) nearest to the bike; null without hideouts.
export function pickHideout(hideouts, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const h of hideouts) {
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best;
}
