// Pure logic of the Sport minigame (AD-20), no Phaser: the obstacle course of a difficulty level, its floor surfaces, the
// Runner (the real MovementController with the foot profile on a kinematic body, plus jumping, knocking cones and
// hurdles, the balance beam, checkpoints and the finish), the scoring and a deterministic bot that runs the course in
// simulation. The par and slow reference times of a course come from that bot, so they follow the movement code.
// SportGame.js and minigames/ui/SportTrack.js bind it to the scene; scripts/check-sport.mjs drives it in node.
import { MovementController } from '../vehicles/MovementController.js';
import { computeMods } from '../characters/attributes.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = v => Math.round(v * 100) / 100;

// ---- the course ----

// Distances (d) run from the start line (0) to the finish line (length); x is across the lane (0..laneW).
// sections: { type: sprint|slalom|hurdles|beam, d0, d1, cp }; checkpoints: { d, type } at the end of each section with
// cp = true (the last one is the finish line).
export function buildCourse(opts, level) {
  const lv = opts.levels[clamp(Math.round(level), 1, opts.levels.length) - 1];
  const L = opts.layout;
  const cx = opts.laneW / 2;
  const sections = [];
  const cones = [];
  const hurdles = [];
  let d = 0;
  const section = (type, len, cp = true) => {
    sections.push({ type, d0: d, d1: d + len, cp });
    d += len;
    return sections.at(-1);
  };
  section('sprint', L.startRun);
  const sl = section('slalom', L.slalomLead + lv.cones * L.coneSpacing);
  for (let i = 0; i < lv.cones; i++) cones.push({ x: cx, d: sl.d0 + L.slalomLead + i * L.coneSpacing, r: L.coneRadius, side: i % 2 ? -1 : 1 });
  section('sprint', L.midRun, false);
  const hu = section('hurdles', L.hurdleLead + lv.hurdles * L.hurdleSpacing);
  for (let i = 0; i < lv.hurdles; i++) hurdles.push({ d: hu.d0 + L.hurdleLead + i * L.hurdleSpacing });
  section('sprint', L.preBeamRun, false);
  const be = section('beam', lv.beam);
  section('sprint', L.finalRun);
  return {
    level,
    laneW: opts.laneW,
    cx,
    length: d,
    runOut: L.runOut,
    sections,
    cones,
    hurdles,
    beam: { d0: be.d0, d1: be.d1, x: cx, w: L.beamWidth },
    checkpoints: sections.filter(s => s.cp).map(s => ({ d: s.d1, type: s.type }))
  };
}

// ctx.surfaces replacement for the MovementController: the beam is fast-ish, the mats around it slow, the rest is track.
export class CourseSurfaces {
  constructor(course, table) {
    this.course = course;
    this.table = table;
  }

  // The body's y is -d (up on screen is forward).
  at(x, y) {
    const { beam } = this.course;
    const d = -y;
    if (d < beam.d0 || d > beam.d1) return 'track';
    return Math.abs(x - beam.x) <= beam.w / 2 ? 'beam' : 'mat';
  }

  props(id) { return this.table[id] ?? this.table.track; }
}

// ---- the runner ----

// Events of the last step() as [type, index] pairs: jump, cone, clear (hurdle jumped), hurdle, beam, section, checkpoint,
// finish. index = cone / hurdle / section / checkpoint number.
export class Runner {
  // profile: the foot profile of data/vehicles.json; attrs: the character's attributes (Tempo, Ausdauer ...);
  // charCfg: data/characters.json (the attribute modifiers); opts: the sport options.
  constructor(course, { opts, profile, attrs, charCfg }) {
    this.course = course;
    this.opts = opts;
    this.body = { position: { x: course.cx, y: 0 }, velocity: { x: 0, y: 0 } };
    const matter = { body: { setVelocity: (b, v) => { b.velocity.x = v.x; b.velocity.y = v.y; } } };
    this.ctrl = new MovementController(matter, this.body, 'foot', profile, new CourseSurfaces(course, opts.surfaces));
    this.ctrl.heading = -Math.PI / 2;
    const m = computeMods({}, attrs, {}, charCfg);
    this.ctrl.speedMult = m.speed;
    this.ctrl.accelMult = m.accel;
    this.ctrl.staminaSize = m.staminaSize;
    this.ctrl.staminaRegen = m.staminaRegen;
    this.radius = profile.radius;
    this.coneState = new Uint8Array(course.cones.length); // 0 standing, 1 knocked
    this.hurdleState = new Uint8Array(course.hurdles.length); // 0 untouched, 1 jumped, 2 knocked
    this.events = [];
    this.timeMs = 0;
    this.penaltyMs = 0;
    this.cleared = 0;
    this.knocks = { cone: 0, hurdle: 0, beam: 0 };
    this.airSec = 0;
    this.coolSec = 0;
    this.stumbleSec = 0;
    this.checkpoint = 0;
    this.section = -1;
    this.beamFell = false;
    this.tired = false;
    this.finished = false;
    this.finishMs = 0;
  }

  get x() { return this.body.position.x; }

  get d() { return -this.body.position.y; }

  get airborne() { return this.airSec > 0; }

  // 0..1 through the jump (for the arc), 0 on the ground.
  get airPhase() { return this.airSec > 0 ? 1 - this.airSec / this.opts.jump.sec : 0; }

  get faults() { return this.knocks.cone + this.knocks.hurdle + this.knocks.beam; }

  get stumbling() { return this.stumbleSec > 0; }

  // One frame. moveX/moveY: the move intent, sprint/jump: held / just pressed. Returns this.events.
  step(dt, moveX, moveY, sprint, jump) {
    const { course, opts, ctrl, events } = this;
    events.length = 0;
    const live = !this.finished;
    if (!live) { moveX = 0; moveY = 0; sprint = false; jump = false; }
    this.airSec = Math.max(0, this.airSec - dt);
    this.coolSec -= dt;
    this.stumbleSec = Math.max(0, this.stumbleSec - dt);
    if (jump && this.airSec === 0 && this.coolSec <= 0) {
      this.airSec = opts.jump.sec;
      this.coolSec = opts.jump.sec + opts.jump.cooldownSec;
      ctrl.stamina = Math.max(0, ctrl.stamina - opts.jump.stamina);
      events.push(['jump', 0]);
    }
    const prevD = this.d;
    ctrl.update(dt, moveX, moveY, sprint);
    const pos = this.body.position;
    pos.x += ctrl.vel.x * dt;
    pos.y += ctrl.vel.y * dt;
    const lo = this.radius;
    const hi = course.laneW - this.radius;
    if (pos.x < lo || pos.x > hi) { pos.x = clamp(pos.x, lo, hi); ctrl.vel.x = 0; this.body.velocity.x = 0; }
    const end = course.length + course.runOut;
    if (pos.y > 0 || pos.y < -end) { pos.y = clamp(pos.y, -end, 0); ctrl.vel.y = 0; this.body.velocity.y = 0; }
    if (live) this.timeMs += dt * 1000;
    const tired = ctrl.exhausted;
    if (tired && !this.tired) events.push(['tired', 0]);
    this.tired = tired;
    this.collide(prevD);
    this.progress(live);
    return events;
  }

  collide(prevD) {
    const { course } = this;
    const d = this.d;
    const x = this.x;
    const grounded = this.airSec === 0;
    for (let i = 0; i < course.cones.length; i++) {
      const c = course.cones[i];
      if (this.coneState[i] || !grounded) continue;
      const reach = c.r + this.radius;
      if ((x - c.x) ** 2 + (d - c.d) ** 2 < reach * reach) { this.coneState[i] = 1; this.knock('cone', i); }
    }
    for (let i = 0; i < course.hurdles.length; i++) {
      const h = course.hurdles[i];
      if (this.hurdleState[i] || !(prevD < h.d && d >= h.d)) continue;
      if (grounded) { this.hurdleState[i] = 2; this.knock('hurdle', i); } else { this.hurdleState[i] = 1; this.cleared++; this.events.push(['clear', i]); }
    }
    const { beam } = course;
    if (!this.beamFell && d >= beam.d0 && d <= beam.d1 && Math.abs(x - beam.x) > beam.w / 2) { this.beamFell = true; this.knock('beam', 0); }
  }

  knock(kind, i) {
    const k = this.opts.knock[kind];
    this.knocks[kind]++;
    this.penaltyMs += k.sec * 1000;
    this.ctrl.speed *= k.speed;
    this.stumbleSec = 0.5;
    this.events.push([kind, i]);
  }

  progress(live) {
    const { course } = this;
    const d = this.d;
    while (this.section + 1 < course.sections.length && d >= course.sections[this.section + 1].d0) this.events.push(['section', ++this.section]);
    while (this.checkpoint < course.checkpoints.length && d >= course.checkpoints[this.checkpoint].d) {
      this.checkpoint++;
      if (this.checkpoint === course.checkpoints.length && live) {
        this.finished = true;
        this.finishMs = this.timeMs;
        this.events.push(['finish', 0]);
      } else this.events.push(['checkpoint', this.checkpoint - 1]);
    }
  }

  // Seconds counted for the finish: running time plus the seconds of every knock.
  get effectiveSec() { return (this.finished ? this.finishMs : this.timeMs) / 1000 + this.penaltyMs / 1000; }
}

// ---- scoring ----

// How far along: 1 when finished, else the share of the course covered.
export const progressOf = (runner, course) => (runner.finished ? 1 : clamp(runner.d / course.length, 0, 1));

// Score 0-1 of one run. Finishing at all is worth something (progress + finish bonus), time counts between the slow
// reference (nothing) and the par (everything), cleanliness counts down to the fault cap but never below zero, and a
// run that is not finished earns what it covered. Knocks already cost seconds in the time, this is the second, gentler cut.
export function scoreRun(runner, course, par, scoring) {
  const progress = progressOf(runner, course);
  const speed = runner.finished ? clamp((par.slowSec - runner.effectiveSec) / (par.slowSec - par.parSec), 0, 1) : 0;
  const clean = 1 - clamp(runner.faults / scoring.faultCap, 0, 1);
  const score = scoring.progress * progress + scoring.time * speed + scoring.clean * clean * progress + (runner.finished ? scoring.finish : 0);
  return { score: round2(clamp(score, 0, 1)), progress, speed, clean };
}

// The tally units of a run (the round result counts correct/total over `expected` units): `correct` = score in
// points, `total` = the share of the course covered in points (never below the correct ones), so effort = progress.
export function tallyUnits(score, progress, expected) {
  const correct = Math.round(score * expected);
  return { correct, total: Math.max(correct, Math.round(progress * expected)) };
}

export const bandOf = (score, bands) => bands.find(b => score >= b.min) ?? bands.at(-1);

export const formatSec = sec => sec.toFixed(1);

// ---- bots ----

// Styles of the simulated runners: sprint = clean runner that sprints in bursts, walk = clean walker, sloppy = sprints
// straight through everything.
export const BOT_STYLES = {
  sprint: { sprint: true, dodge: true, jump: true },
  walk: { sprint: false, dodge: true, jump: true },
  sloppy: { sprint: true, dodge: false, jump: false }
};

// The input of a bot for this frame, written into `out` ({ mx, my, sprint, jump }); `state` keeps its sprint hysteresis.
export function botInput(runner, style, bot, state, out) {
  const { course } = runner;
  const d = runner.d;
  let tx = course.cx;
  if (style.dodge) {
    for (const c of course.cones) {
      if (c.d + c.r + runner.radius < d) continue;
      if (c.d - d < bot.coneLook) tx = clamp(c.x + c.side * (c.r + runner.radius + 5), runner.radius, course.laneW - runner.radius);
      break;
    }
    if (d > course.beam.d0 - 40 && d < course.beam.d1) tx = course.beam.x;
  }
  out.mx = clamp((tx - runner.x) / bot.steer, -1, 1);
  out.my = -1;
  out.jump = false;
  if (style.jump) {
    const next = course.hurdles.find((h, i) => !runner.hurdleState[i] && h.d > d);
    if (next && next.d - d < Math.max(8, runner.ctrl.velSpeed * bot.jumpLeadSec)) out.jump = true;
  }
  const { stamina } = runner.ctrl;
  if (state.sprinting ? stamina < bot.sprintUntil : stamina >= bot.sprintFrom) state.sprinting = !state.sprinting;
  const inBeam = d > course.beam.d0 - 40 && d < course.beam.d1;
  out.sprint = style.sprint && state.sprinting && !(style.dodge && inBeam);
}

// Runs the course in simulation (fixed 60 Hz) and returns the finished Runner (finished stays false after limitSec).
export function simulateRun(course, { opts, profile, charCfg, attrs, style = 'sprint', limitSec = 150 }) {
  const runner = new Runner(course, { opts, profile, attrs, charCfg });
  const st = BOT_STYLES[style];
  const state = { sprinting: true };
  const input = { mx: 0, my: 0, sprint: false, jump: false };
  const dt = 1 / 60;
  for (let t = 0; t < limitSec && !runner.finished; t += dt) {
    botInput(runner, st, opts.bot, state, input);
    runner.step(dt, input.mx, input.my, input.sprint, input.jump);
  }
  return runner;
}

// The reference times of a course: the par (a clean sprint-bot with the `par` attributes) and the slow reference (a clean
// walker with neutral attributes, times the slow factor). From these a run's time maps to 0-1.
export function parTimes(course, { opts, profile, charCfg }) {
  const par = simulateRun(course, { opts, profile, charCfg, attrs: opts.par.attrs, style: 'sprint' });
  const slow = simulateRun(course, { opts, profile, charCfg, attrs: opts.par.slow.attrs, style: 'walk' });
  return { parSec: par.effectiveSec, slowSec: slow.effectiveSec * opts.par.slow.factor };
}
