// Phaser-free bus/tram grab logic (AD-23, CAP-14): where the grab zone behind a vehicle is, how long a grab can last and
// how likely it is to fail. `cfg` is data/grab.json. One `createGrab()` state per player; entities/GrabTargets.js feeds
// `stepGrab` once a frame while the player hangs on and turns the returned end reason into events and a comic stumble.
//
// Failure is a hazard: the rate per second grows with the towing speed, the bumpiness of the ground (a surface's `rattle`,
// so cobble is nasty), how wildly the rider swings sideways and how long the grab has lasted; the character perk
// `busGrabBonus` cuts the rate and stretches the time. The accumulated hazard H gives the shown risk 1 - exp(-H), which is
// exactly the chance the grab has failed by now. There is a short grace period at the start without any failure.
export function createGrab() {
  return { active: false, armed: true, time: 0, hazard: 0, risk: 0, jumpPrev: false };
}

// Is (px, py) inside the rear zone of a vehicle at (x, y) heading `h` (radians), `length` px long? The zone is `zone.length`
// px behind the rear edge and `zone.reach` px under the vehicle's back, `zone.width` px wide.
export function inRearZone(x, y, h, length, zone, px, py) {
  const c = Math.cos(h);
  const s = Math.sin(h);
  const dx = px - x;
  const dy = py - y;
  const along = dx * c + dy * s;
  const lat = -dx * s + dy * c;
  const rear = -length / 2;
  return along >= rear - zone.length && along <= rear + zone.reach && Math.abs(lat) <= zone.width / 2;
}

export function maxDuration(cfg, perk) {
  return cfg.duration * (1 + perk * cfg.perkDuration);
}

// Failure rate per second; `swing` is the sideways rope angle share 0..1.
export function failureRate(cfg, speed, bump, swing, time, perk) {
  const f = cfg.failure;
  const age = 1 + f.ageGain * (time / maxDuration(cfg, perk));
  const perkFactor = Math.max(f.perkFloor, 1 - perk * f.perkCut);
  return f.base * (1 + f.speedGain * (speed / f.refSpeed)) * (1 + f.bumpGain * bump) * (1 + f.swingGain * swing) * age * perkFactor;
}

// Whether a held interact press may start a grab: only after the button was let go since the last grab, so a failed or
// ended grab is not instantly followed by another one.
export function mayStart(g, hold) {
  if (!hold) g.armed = true;
  return hold && g.armed && !g.active;
}

export function startGrab(g, jumpHeld) {
  g.active = true;
  g.armed = false;
  g.time = g.hazard = g.risk = 0;
  g.jumpPrev = jumpHeld; // a jump held while grabbing does not let go at once
}

// One frame of hanging on. inp: { hold, jump, speed, bump, swing, slack, perk, rand } (`slack` = px the rope is stretched
// beyond its length, `rand` = random() in [0, 1)). Returns '' while it goes on, else why it ended:
// 'jump' (ollie off), 'release' (let go of the button), 'tired' (out of time), 'lost' (the rope snagged on a wall: slack
// above `snapSlack`), 'fail' (the hazard struck).
export function stepGrab(g, cfg, dt, inp) {
  g.time += dt;
  const jumpEdge = inp.jump && !g.jumpPrev;
  g.jumpPrev = inp.jump;
  let reason = '';
  if (jumpEdge) reason = 'jump';
  else if (!inp.hold) reason = 'release';
  else if (inp.slack > cfg.snapSlack) reason = 'lost';
  else if (g.time >= maxDuration(cfg, inp.perk)) reason = 'tired';
  else if (g.time > cfg.failure.grace) {
    const rate = failureRate(cfg, inp.speed, inp.bump, inp.swing, g.time, inp.perk);
    g.hazard += rate * dt;
    g.risk = 1 - Math.exp(-g.hazard);
    if (inp.rand < 1 - Math.exp(-rate * dt)) reason = 'fail';
  }
  if (reason) g.active = false;
  return reason;
}
