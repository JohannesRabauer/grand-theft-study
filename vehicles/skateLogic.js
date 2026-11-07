// Phaser-free skateboard trick logic (AD-23): the ollie ground/air state machine and the manual balance meter.
// One `createSkate()` state per player, stepped once a frame with `stepSkate`; `cfg` is the `trick` block of the
// skateboard profile in data/vehicles.json. Nothing here knows about sprites or physics: entities/Skateboards.js
// turns the flags it returns into events, collision changes, poses and particles.
//
// Ollie: a fresh jump press on the ground starts a short hop. The airtime grows a little with speed, `height` is a
// half sine (px) the sprite is lifted by, and `air > 0` is the span in which low obstacles are skipped.
// Manual: a fresh press of the manual intent at speed starts it with the balance needle at `startAt`. Holding
// raises the needle, letting go lowers it; inside the sweet window [sweetLo, sweetHi] the board is balanced (speed
// boost, `sweet` time counts), held too long it tips over 1 and the player simply drops back to rolling. No penalty
// beyond a short cooldown. An ollie ends a manual.
//
// Grind (vehicles/TrickSystem.js starts and ends it with startGrind / endGrind): the rider is held on a rail at a fixed
// lift; a fresh jump press leaves it with an ollie. A ramp launch (startAir) is a hop with its own airtime and peak.
export const OLLIE = 1;
export const LAND = 2;
export const MANUAL = 4;
export const MANUAL_END = 8;

export function createSkate() {
  return {
    air: 0, airTime: 0, peak: 0, height: 0, grind: false, ollieCool: 0, jumpPrev: false,
    manual: false, meter: 0, sweetNow: false, manualTime: 0, sweet: 0, manualCool: 0, manualPrev: false,
    boost: 1, flags: 0, endReason: ''
  };
}

export function resetSkate(s) {
  Object.assign(s, createSkate());
}

// inp: { jump, manual, speed } (level intents and the real speed in px/s). Returns the flag bits of this frame.
export function stepSkate(s, cfg, dt, inp) {
  s.flags = 0;
  s.ollieCool -= dt;
  s.manualCool -= dt;
  const jumpEdge = inp.jump && !s.jumpPrev;
  const manualEdge = inp.manual && !s.manualPrev;
  s.jumpPrev = inp.jump;
  s.manualPrev = inp.manual;
  const o = cfg.ollie;
  const m = cfg.manual;

  if (s.air > 0) {
    s.air -= dt;
    if (s.air <= 0) {
      s.air = 0;
      s.height = 0;
      s.ollieCool = o.cooldown;
      s.flags |= LAND;
    } else s.height = s.peak * Math.sin(Math.PI * (1 - s.air / s.airTime));
    s.boost = 1;
    return s.flags;
  }

  if (jumpEdge && (s.ollieCool <= 0 || s.grind)) {
    if (s.manual) endManual(s, m, 'ollie');
    s.grind = false;
    startAir(s, o.airtime * (1 + o.speedGain * Math.min(1, inp.speed / o.refSpeed)), o.height);
    s.flags |= OLLIE;
    return s.flags;
  }
  if (s.grind) {
    s.height = cfg.grind.lift;
    s.boost = 1;
    return s.flags;
  }

  if (!s.manual && manualEdge && s.manualCool <= 0 && inp.speed >= m.minSpeed) {
    s.manual = true;
    s.meter = m.startAt;
    s.manualTime = s.sweet = 0;
    s.flags |= MANUAL;
  }
  if (s.manual) {
    s.meter = Math.max(0, Math.min(1, s.meter + (inp.manual ? m.rise : -m.fall) * dt));
    s.manualTime += dt;
    s.sweetNow = s.meter >= m.sweetLo && s.meter <= m.sweetHi;
    if (s.sweetNow) s.sweet += dt;
    if (s.meter >= 1) endManual(s, m, 'over');
    else if (s.meter <= 0) endManual(s, m, 'under');
    else if (inp.speed < m.minSpeed * m.slowFrac) endManual(s, m, 'slow');
  }
  s.boost = s.manual && s.sweetNow ? m.boost : 1;
  return s.flags;
}

// A hop of `airtime` seconds peaking `peak` px high (an ollie or a ramp launch).
export function startAir(s, airtime, peak) {
  s.airTime = s.air = airtime;
  s.peak = peak;
  s.height = 0;
  s.boost = 1;
}

// Lands on a rail from the air without a landing.
export function startGrind(s) {
  s.air = 0;
  s.grind = true;
  s.ollieCool = 0;
}

// Rolls off the end of a rail (a jump off the rail is the ollie in stepSkate).
export function endGrind(s, cfg) {
  s.grind = false;
  s.height = 0;
  s.ollieCool = cfg.ollie.cooldown;
}

// A manual ends without a fall: the needle resets, a short cooldown stops instant re-entry.
function endManual(s, m, reason) {
  s.manual = false;
  s.sweetNow = false;
  s.boost = 1;
  s.endReason = reason;
  s.flags |= MANUAL_END;
  s.manualCool = m.cooldown;
}
