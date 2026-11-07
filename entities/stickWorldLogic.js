// Pure timers and counters of the stick's world (story 6.2): the ding-dong-run sequence of the placeholder neighbor, the
// pinata's hit points and the respawn of kirmes balloons. No Phaser; entities/Doorbells.js, Pinata.js and Balloons.js drive
// them and scripts/check-stick.mjs tests them.

export const PHASE = { WAIT: 'wait', CHASE: 'chase', LAUGH: 'laugh', DONE: 'done' };

export function newSequence() {
  return { phase: PHASE.DONE, t: 0, caught: false, cool: 0 };
}

// A ring starts the run (the door opens after `doorDelay`); false while one is still going or cooling down.
export function startSequence(seq) {
  if (seq.phase !== PHASE.DONE || seq.cool > 0) return false;
  seq.phase = PHASE.WAIT;
  seq.t = 0;
  seq.caught = false;
  return true;
}

// Advances the run by dt and returns what happened, if anything: 'open' (the neighbor steps out and the chase starts),
// 'caught' (he reached a player: a harmless bubble, then he laughs), 'giveup' (the chase time is up, he laughs), 'done'.
// `touched` says whether he is at a player right now. `cfg` is data/neighbors.json `timing`.
export function advanceSequence(seq, cfg, dt, touched) {
  if (seq.phase === PHASE.DONE) {
    if (seq.cool > 0) seq.cool -= dt;
    return null;
  }
  seq.t += dt;
  if (seq.phase === PHASE.WAIT) {
    if (seq.t < cfg.doorDelay) return null;
    seq.phase = PHASE.CHASE;
    seq.t = 0;
    return 'open';
  }
  if (seq.phase === PHASE.CHASE) {
    if (touched && !seq.caught) {
      seq.caught = true;
      seq.phase = PHASE.LAUGH;
      seq.t = 0;
      return 'caught';
    }
    if (seq.t < cfg.chaseSeconds) return null;
    seq.phase = PHASE.LAUGH;
    seq.t = 0;
    return 'giveup';
  }
  if (seq.t < cfg.giveUpSeconds) return null;
  seq.phase = PHASE.DONE;
  seq.cool = cfg.cooldown;
  return 'done';
}

// The house door stands open from the moment the neighbor steps out until he is done laughing.
export const doorOpen = (seq) => seq.phase === PHASE.CHASE || seq.phase === PHASE.LAUGH;

// One step of a walker of speed px/s towards (tx, ty): writes the move into out.x / out.y (unit direction times distance),
// stops short of the target; returns the distance to the target before the step.
export function stepToward(out, x, y, tx, ty, speed, dt) {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  const s = Math.min(d, speed * dt);
  out.x = d > 0 ? (dx / d) * s : 0;
  out.y = d > 0 ? (dy / d) * s : 0;
  return d;
}

export function newPinata(hp) {
  return { hp, max: hp, burst: false };
}

// One whack; true when this one bursts it. A burst pinata ignores further whacks until it is hung up again.
export function whackPinata(p) {
  if (p.burst) return false;
  p.hp--;
  if (p.hp > 0) return false;
  p.burst = true;
  return true;
}

export function rehangPinata(p) {
  p.hp = p.max;
  p.burst = false;
}

export function newBalloon() {
  return { popped: false, left: 0 };
}

export function popBalloon(b, respawn) {
  if (b.popped) return false;
  b.popped = true;
  b.left = respawn;
  return true;
}

// Counts the respawn down; true on the frame it is back.
export function tickBalloon(b, dt) {
  if (!b.popped) return false;
  b.left -= dt;
  if (b.left > 0) return false;
  b.popped = false;
  b.left = 0;
  return true;
}
