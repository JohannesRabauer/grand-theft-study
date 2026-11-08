// Pure two-player chase rules (AD-18), no Phaser. Used by ChaseDirector and BullyFSM; covered by scripts/check-chase.mjs.
// The Ärger level is shared; everything else (who is seen, who is hidden, who is far away) is judged per player.

// Index of the player a bully should chase. scores[i] is player i's targetScore (smaller = preferred) or Infinity while
// not visible; `current` is the index it chases now (-1 for none). The bully keeps its target unless a challenger scores
// below `switchRatio` times the current score (hysteresis, so two similar distances never flip it every frame). -1 = nobody visible.
export function pickTarget(scores, n, current, switchRatio) {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) if (scores[i] < bestScore) { bestScore = scores[i]; best = i; }
  if (best < 0 || current < 0 || current === best || !(scores[current] < Infinity)) return best;
  return bestScore < scores[current] * switchRatio ? best : current;
}

// Where a gang bully in `slot` heads for (story 7.1): the target (tx, ty) moving with (vx, vy), the bully at (bx, by). Different slots give
// different points (straight, cutting ahead, from the left and right); close to the target everyone goes for it. Returns the shared `out`.
export function interceptPoint(gang, slot, tx, ty, vx, vy, bx, by, out) {
  const away = Math.hypot(bx - tx, by - ty);
  if (away < gang.closeIn) { out.x = tx; out.y = ty; return out; }
  const speed = Math.hypot(vx, vy);
  let fx;
  let fy;
  if (speed > gang.minSpeed) { fx = vx / speed; fy = vy / speed; } else { fx = (bx - tx) / away; fy = (by - ty) / away; } // standing still: the bully's own side
  const s = gang.slots[slot % gang.slots.length];
  out.x = tx + fx * s.ahead * gang.leadPx - fy * s.side * gang.flankPx;
  out.y = ty + fy * s.ahead * gang.leadPx + fx * s.side * gang.flankPx;
  return out;
}

// The chase ends when EVERY player in play is safe, each by its own timer: hidden long enough or far and unseen long enough
// (Escape.done). One player hiding while the other is still seen or close keeps the level. `escapes[i]` is player i's Escape,
// `alive[i]` whether it is in play. Returns 'hidden' (all hid), 'escaped' (at least one got away by distance) or null.
export function escapeVerdict(escapes, alive, n) {
  let reason = null;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const done = escapes[i].done;
    if (!done) return null;
    reason = reason === 'escaped' ? reason : done;
  }
  return reason;
}

// Bully kinds a level wants: the level's list, plus the co-op extras (data `coopExtraByLevel`, at most one bully) when
// two players are in play, less one per friendship level, cut to the quality tier's cap. Returns a fresh array.
export function wantedKinds(levelCfg, level, coop, cap, friends = 0) {
  const kinds = levelCfg.spawnByLevel[level].slice();
  if (coop) kinds.push(...(levelCfg.coopExtraByLevel[level] ?? []).slice(0, 1));
  // Friendship (the missions of story 9.8, saved flag `friendship` 0-3): every friendly level leaves one bully out of the
  // chase; at the highest Aerger at least one still comes, so being chased never disappears altogether.
  const keep = level >= 2 ? Math.max(1, kinds.length - friends) : Math.max(0, kinds.length - friends);
  return kinds.slice(0, Math.min(cap, keep));
}

// Is a spawn point clear of the camera view (centre cx, cy, half size hw, hh, all world px) by `margin`?
// With two players the view is the one around both of them, so "off-screen" is judged on the rectangle, not on one player.
export function offView(x, y, cx, cy, hw, hh, margin) {
  return Math.abs(x - cx) >= hw + margin || Math.abs(y - cy) >= hh + margin;
}
