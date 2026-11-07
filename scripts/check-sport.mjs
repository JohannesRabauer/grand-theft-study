// Checks the pure logic of the Sport minigame (minigames/sportCore.js) and its data: the obstacle course of every level, the
// floor surfaces, the Runner on the real MovementController (sprint stamina, Tempo and Ausdauer), jumping hurdles, knocking
// cones, the balance beam, checkpoints and the finish, the penalty rules, the score bounds, the simulation bots and par
// times, the tally units of the standard result and the i18n of the minigame. Everything is deterministic.
// Run: node scripts/check-sport.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOT_STYLES, CourseSurfaces, Runner, bandOf, botInput, buildCourse, formatSec, parTimes, progressOf, scoreRun, simulateRun, tallyUnits
} from '../minigames/sportCore.js';
import { Tally, buildResult } from '../minigames/minigameCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = json('data/minigames.json');
const def = data.minigames.find(m => m.id === 'sport');
const o = def.options;
const profile = json('data/vehicles.json').foot;
const charCfg = json('data/characters.json');
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const attrsOf = id => charCfg.characters.find(c => c.id === id).attributes;
const base = { opts: o, profile, charCfg };
const classes = readFileSync(new URL('../minigames/index.js', import.meta.url), 'utf8');

// ---- registry entry ----
assert.equal(def.subject, 'sport');
assert.equal(def.scene, 'MG_sport');
assert.ok(def.durationSeconds >= 45 && def.durationSeconds <= 75, 'about a minute');
assert.equal(def.maxPlayers, 2);
assert.equal(def.learning, false);
assert.deepEqual(def.topics, []);
assert.ok(!def.debug, 'a real minigame');
assert.ok(classes.includes("'sport':"), 'the scene class is registered');
assert.equal(def.expectedQuestions, 100, 'the tally counts points of 100');
assert.ok(o.levels.length === 5 && o.levels.every((l, i) => i === 0 || (l.cones >= o.levels[i - 1].cones && l.hurdles >= o.levels[i - 1].hurdles && l.beam >= o.levels[i - 1].beam)), 'levels grow with the difficulty');
const sc = o.scoring;
assert.ok(Math.abs(sc.progress + sc.time + sc.clean + sc.finish - 1) < 1e-9, 'the score weights add up to 1');
assert.ok(o.bands.every((b, i) => i === 0 || b.min < o.bands[i - 1].min) && o.bands.at(-1).min === 0, 'bands descend and cover 0');
assert.ok(o.layout.beamWidth > 2 * profile.radius && o.layout.beamWidth < o.laneW / 2, 'the beam is narrow but wide enough for the runner');
assert.ok(o.layout.coneRadius + profile.radius > 0 && o.layout.coneSwing > 0);
for (const k of ['cone', 'hurdle', 'beam']) assert.ok(o.knock[k].sec > 0 && o.knock[k].sec <= 1 && o.knock[k].speed > 0 && o.knock[k].speed < 1, `${k}: a few seconds at most and a stumble, never a stop`);
const keys = ['title', 'help', 'start', 'finishLine', 'stamina', 'station', 'finishTime', 'section.sprint', 'section.slalom', 'section.hurdles', 'section.beam', 'section.final',
  'knock.cone', 'knock.hurdle', 'knock.beam', 'clear', 'tired', 'finish', 'finishClean', 'timeout', 'winner', 'tie', ...o.bands.map(b => `result.${b.key}`)];
for (const k of keys) assert.ok(de[`minigame.sport.${k}`] && en[`minigame.sport.${k}`], `minigame.sport.${k} in both languages`);
assert.ok(de['minigame.sport.winner'].includes('{name}') && en['minigame.sport.winner'].includes('{name}'));
for (const k of ['knock.cone', 'knock.hurdle', 'knock.beam', 'finish', 'finishClean']) assert.ok(de[`minigame.sport.${k}`].includes('{t}') && en[`minigame.sport.${k}`].includes('{t}'), `${k} shows the seconds`);

// ---- the course ----
for (let level = 1; level <= 5; level++) {
  const c = buildCourse(o, level);
  const lv = o.levels[level - 1];
  assert.deepEqual(buildCourse(o, level), c, `level ${level}: deterministic`);
  assert.equal(c.cones.length, lv.cones);
  assert.equal(c.hurdles.length, lv.hurdles);
  assert.deepEqual(c.sections.map(s => s.type), ['sprint', 'slalom', 'sprint', 'hurdles', 'sprint', 'beam', 'sprint'], 'sprint lanes, slalom, hurdles, beam, final sprint');
  assert.equal(c.sections[0].d0, 0);
  c.sections.forEach((s, i) => { assert.ok(s.d1 > s.d0); if (i) assert.equal(s.d0, c.sections[i - 1].d1, 'sections are contiguous'); });
  assert.equal(c.length, c.sections.at(-1).d1);
  assert.equal(c.checkpoints.length, 5, 'five stations, the last is the finish line');
  assert.equal(c.checkpoints.at(-1).d, c.length);
  assert.ok(c.checkpoints.every((cp, i) => i === 0 || cp.d > c.checkpoints[i - 1].d));
  const [, slalom, , hurdles] = c.sections;
  for (const [i, cone] of c.cones.entries()) {
    assert.ok(cone.d > slalom.d0 && cone.d < slalom.d1 && cone.x === c.cx, 'cones stand on the centre line inside the slalom');
    assert.equal(cone.side, i % 2 ? -1 : 1, 'the pass side alternates');
    if (i) assert.equal(cone.d - c.cones[i - 1].d, o.layout.coneSpacing);
  }
  assert.ok(c.hurdles.every(h => h.d > hurdles.d0 && h.d < hurdles.d1), 'hurdles stand in the hurdle section');
  assert.ok(c.beam.x - c.beam.w / 2 > 0 && c.beam.x + c.beam.w / 2 < c.laneW && c.beam.d1 - c.beam.d0 === lv.beam);
  if (level > 1) assert.ok(c.length > buildCourse(o, level - 1).length, 'a higher level is a longer course');
}
assert.equal(buildCourse(o, 99).level, 99, 'the level is only used to pick the (clamped) entry');
assert.deepEqual(buildCourse(o, 99).cones.length, o.levels.at(-1).cones);
assert.deepEqual(buildCourse(o, 0).cones.length, o.levels[0].cones);

const course = buildCourse(o, 3);
{
  const s = new CourseSurfaces(course, o.surfaces);
  const mid = (course.beam.d0 + course.beam.d1) / 2;
  assert.equal(s.at(course.cx, -10), 'track');
  assert.equal(s.at(course.cx, -mid), 'beam');
  assert.equal(s.at(course.cx + course.beam.w, -mid), 'mat', 'off the beam: the mat');
  assert.equal(s.at(course.cx + course.beam.w, -(course.beam.d1 + 5)), 'track');
  assert.equal(s.props('beam').speed.foot, 0.75);
  assert.equal(s.props('nonsense'), o.surfaces.track);
}

// ---- the runner: real movement ----
const run = (attrs, frames, input, opts = {}) => {
  const r = new Runner(opts.course ?? course, { opts: o, profile, attrs, charCfg });
  for (let f = 0; f < frames; f++) r.step(1 / 60, ...(typeof input === 'function' ? input(f, r) : input));
  return r;
};
const neutral = { tempo: 5, ausdauer: 5 };
{
  assert.equal(new Runner(course, { ...base, attrs: neutral }).ctrl.profile, profile, 'the foot profile of data/vehicles.json drives it');
  const walk = run(neutral, 120, [0, -1, false, false]);
  assert.ok(walk.d > 100 && walk.d < 2 * profile.maxSpeed + 5, `walking covers about 2 s x ${profile.maxSpeed} px/s, got ${walk.d.toFixed(1)}`);
  assert.ok(walk.ctrl.velSpeed <= profile.maxSpeed + 1e-6, 'never faster than the profile');
  const sprint = run(neutral, 120, [0, -1, true, false]);
  assert.ok(sprint.d > walk.d * 1.3, 'sprinting is clearly faster');
  assert.ok(sprint.ctrl.stamina < 0.6, 'and drains the stamina');
  const rest = run(neutral, 360, f => [0, -1, f < 120, false]);
  assert.ok(rest.ctrl.stamina > sprint.ctrl.stamina, 'the stamina refills when walking');
  const tank = run(neutral, 60 * 8, [0, -1, true, false]);
  assert.ok(tank.ctrl.exhausted, 'a long sprint runs dry');
  let slowed = false;
  const r = new Runner(course, { ...base, attrs: neutral });
  let sawTired = false;
  for (let f = 0; f < 60 * 8; f++) { for (const [t] of r.step(1 / 60, 0, -1, true, false)) if (t === 'tired') sawTired = true; if (r.ctrl.exhausted && r.ctrl.speed < profile.maxSpeed * 0.7) slowed = true; }
  assert.ok(sawTired && slowed, 'exhausted: a tired event and a slower pace');
  const sideways = run(neutral, 120, [1, 0, false, false]);
  assert.ok(sideways.x <= course.laneW - profile.radius + 1e-9 && sideways.d < 1, 'the lane walls hold the runner in');
  const back = run(neutral, 120, [0, 1, false, false]);
  assert.ok(back.d >= -1e-9, 'no running behind the start line');
  assert.deepEqual(run(neutral, 300, [0.2, -1, true, false]).body.position, run(neutral, 300, [0.2, -1, true, false]).body.position, 'deterministic');
}

// ---- Tempo and Ausdauer decide ----
{
  const t = (attrs, style) => simulateRun(course, { ...base, attrs, style }).effectiveSec;
  for (const style of ['walk', 'sprint']) {
    const times = ['lena', 'jonas', 'mehmet'].map(id => t(attrsOf(id), style));
    assert.ok(times[2] < times[1] && times[1] < times[0], `${style}: Mehmet (Tempo 9) < Jonas (6) < Lena (5): ${times.map(x => x.toFixed(1))}`);
    assert.ok(times[0] - times[2] > 4, `${style}: the difference is measurable, ${(times[0] - times[2]).toFixed(1)} s`);
  }
  assert.ok(t({ tempo: 9, ausdauer: 5 }, 'walk') < t({ tempo: 5, ausdauer: 5 }, 'walk') - 3, 'Tempo alone speeds up the walk');
  assert.ok(t({ tempo: 5, ausdauer: 9 }, 'sprint') < t({ tempo: 5, ausdauer: 5 }, 'sprint') - 1, 'Ausdauer alone helps the sprinter');
  assert.ok(Math.abs(t({ tempo: 5, ausdauer: 9 }, 'walk') - t({ tempo: 5, ausdauer: 5 }, 'walk')) < 0.2, 'but not the walker, who never sprints');
  const tank = a => { const r = new Runner(course, { ...base, attrs: a }); let n = 0; while (!r.ctrl.exhausted && n < 6000) { r.step(1 / 60, 0, -1, true, false); n++; } return n / 60; };
  assert.ok(tank({ tempo: 5, ausdauer: 9 }) > tank({ tempo: 5, ausdauer: 5 }) * 1.2, 'a higher Ausdauer sprints longer');
  assert.ok(tank({ tempo: 5, ausdauer: 1 }) < tank({ tempo: 5, ausdauer: 5 }), 'a lower one runs out sooner');
  // the scores follow
  const par = parTimes(course, base);
  const score = id => scoreRun(simulateRun(course, { ...base, attrs: attrsOf(id), style: 'sprint' }), course, par, sc).score;
  assert.ok(score('mehmet') > score('jonas') + 0.05 && score('jonas') > score('lena'), `scores: ${score('mehmet')} > ${score('jonas')} > ${score('lena')}`);
  assert.ok(score('mehmet') - score('lena') >= 0.1, 'a measurably better score for the higher Tempo');
}

// ---- hurdles and jumping ----
{
  const h = course.hurdles[0];
  const goTo = (r, d) => { r.body.position.y = -(d - 60); for (let f = 0; f < 30; f++) r.step(1 / 60, 0, -1, false, false); };
  const attempt = leadFrames => {
    const r = new Runner(course, { ...base, attrs: neutral });
    goTo(r, h.d);
    let jumped = leadFrames < 0;
    for (let f = 0; f < 240 && r.d < h.d + 40; f++) {
      const dist = h.d - r.d;
      const jump = !jumped && dist <= r.ctrl.velSpeed * leadFrames / 60;
      if (jump) jumped = true;
      r.step(1 / 60, 0, -1, false, jump);
    }
    return r;
  };
  const clean = attempt(12);
  assert.equal(clean.hurdleState[0], 1, 'a jump in time clears the hurdle');
  assert.equal(clean.faults, 0);
  assert.equal(clean.cleared, 1);
  const missed = attempt(-1);
  assert.equal(missed.hurdleState[0], 2, 'running into it knocks it down');
  assert.equal(missed.knocks.hurdle, 1);
  assert.equal(missed.penaltyMs, o.knock.hurdle.sec * 1000, 'the penalty is exactly the data value');
  assert.ok(missed.d > h.d, 'it never blocks: the runner goes on');
  const early = attempt(60);
  assert.equal(early.hurdleState[0], 2, 'jumping far too early is not a clear: you land before it');
  // one jump at a time, a cooldown, and it costs a little stamina
  const r = new Runner(course, { ...base, attrs: neutral });
  const jumps = [];
  for (let f = 0; f < 120; f++) for (const [t] of r.step(1 / 60, 0, -1, false, true)) if (t === 'jump') jumps.push(f);
  assert.ok(jumps.length >= 2 && jumps[1] - jumps[0] >= (o.jump.sec + o.jump.cooldownSec) * 60 - 1, 'pressing jump all the time does not float: cooldown between jumps');
  assert.ok(r.ctrl.stamina < 1, 'jumping costs stamina');
  assert.ok(r.airPhase >= 0 && r.airPhase <= 1);
  // a knocked hurdle is not counted again
  const again = attempt(-1);
  again.body.position.y = -(h.d - 20);
  again.step(1 / 60, 0, -1, false, false);
  again.body.position.y = -(h.d - 1);
  for (let f = 0; f < 30; f++) again.step(1 / 60, 0, -1, false, false);
  assert.equal(again.knocks.hurdle, 1, 'one fault per hurdle');
}

// ---- cones ----
{
  const straight = simulateRun(course, { ...base, attrs: neutral, style: 'sloppy' });
  assert.equal(straight.knocks.cone, course.cones.length, 'running straight through the slalom topples every cone');
  assert.ok(straight.coneState.every(s => s === 1));
  const weave = simulateRun(course, { ...base, attrs: neutral, style: 'sprint' });
  assert.equal(weave.knocks.cone, 0, 'weaving around them is clean');
  assert.equal(weave.faults, 0);
  // a cone falls only once and a jump goes over it
  const c = course.cones[0];
  const r = new Runner(course, { ...base, attrs: neutral });
  r.body.position.y = -c.d;
  for (let f = 0; f < 90; f++) r.step(1 / 60, 0, 0, false, false);
  assert.equal(r.knocks.cone, 1, 'a runner standing in a cone topples it once, not every frame');
  assert.equal(r.coneState[0], 1);
  const j = new Runner(course, { ...base, attrs: neutral });
  j.body.position.y = -(c.d - 12);
  j.step(1 / 60, 0, -1, false, true);
  for (let f = 0; f < 20; f++) j.step(1 / 60, 0, -1, false, false);
  assert.equal(j.coneState[0], 0, 'jumping over a cone leaves it standing');
}

// ---- the balance beam ----
{
  const { beam } = course;
  const at = (x, frames = 40) => {
    const r = new Runner(course, { ...base, attrs: neutral });
    r.body.position.y = -(beam.d0 + 5);
    r.body.position.x = x;
    for (let f = 0; f < frames; f++) r.step(1 / 60, 0, -1, false, false);
    return r;
  };
  const on = at(beam.x);
  assert.equal(on.faults, 0, 'on the beam: no fault');
  assert.ok(on.ctrl.surface === 'beam' && on.ctrl.velSpeed < profile.maxSpeed, 'the beam is a bit slower');
  const off = at(beam.x + beam.w);
  assert.equal(off.knocks.beam, 1, 'slipping off is one wobble');
  assert.equal(off.penaltyMs, o.knock.beam.sec * 1000);
  assert.ok(off.ctrl.surface === 'mat' && off.ctrl.velSpeed < on.ctrl.velSpeed, 'the mat slows you more');
  assert.equal(at(beam.x + beam.w, 200).knocks.beam, 1, 'and it is counted only once per beam');
}

// ---- checkpoints, the finish and the events ----
{
  const r = new Runner(course, { ...base, attrs: neutral });
  const seen = [];
  const st = { sprinting: true };
  const input = { mx: 0, my: 0, sprint: false, jump: false };
  for (let f = 0; f < 60 * 100 && !r.finished; f++) {
    botInput(r, BOT_STYLES.sprint, o.bot, st, input);
    for (const [t, i] of r.step(1 / 60, input.mx, input.my, input.sprint, input.jump)) seen.push(`${t}${t === 'checkpoint' || t === 'section' ? i : ''}`);
  }
  assert.ok(r.finished && r.checkpoint === course.checkpoints.length);
  assert.deepEqual(seen.filter(e => e.startsWith('checkpoint')), ['checkpoint0', 'checkpoint1', 'checkpoint2', 'checkpoint3'], 'four stations on the way ...');
  assert.equal(seen.filter(e => e === 'finish').length, 1, '... and one finish');
  assert.ok(seen.indexOf('finish') > seen.indexOf('checkpoint3'));
  assert.deepEqual(seen.filter(e => e.startsWith('section')), course.sections.map((_, i) => `section${i}`), 'every section is announced once, in order');
  assert.equal(seen.filter(e => e === 'clear').length, course.hurdles.length, 'every hurdle jumped is a clear');
  const time = r.finishMs;
  for (let f = 0; f < 60; f++) r.step(1 / 60, 0, -1, true, true);
  assert.equal(r.finishMs, time, 'the time stops at the finish');
  assert.ok(r.ctrl.velSpeed < 1 || r.d <= course.length + course.runOut, 'the runner coasts out and stands');
  assert.ok(r.d <= course.length + course.runOut + 1e-9);
}

// ---- penalties and the score ----
{
  const par = parTimes(course, base);
  assert.ok(par.parSec > 15 && par.slowSec > par.parSec + 8, `par ${par.parSec.toFixed(1)} s, slow ${par.slowSec.toFixed(1)} s`);
  const sim = (attrs, style) => simulateRun(course, { ...base, attrs, style });
  const clean = sim(neutral, 'sprint');
  const sloppy = sim(neutral, 'sloppy');
  assert.ok(sloppy.finished, 'a sloppy run still finishes');
  assert.ok(sloppy.penaltyMs > 0 && sloppy.penaltyMs === (course.cones.length * o.knock.cone.sec + course.hurdles.length * o.knock.hurdle.sec) * 1000 + sloppy.knocks.beam * o.knock.beam.sec * 1000, 'knocks cost exactly their data seconds');
  assert.ok(sloppy.penaltyMs < 10000, `all knocks together stay below ten seconds (${(sloppy.penaltyMs / 1000).toFixed(1)})`);
  const sClean = scoreRun(clean, course, par, sc);
  const sSloppy = scoreRun(sloppy, course, par, sc);
  assert.ok(sClean.score > sSloppy.score, 'clean beats sloppy');
  assert.ok(sSloppy.score >= 0.4, `never harsh: a sloppy finish still scores ${sSloppy.score}`);
  const walker = scoreRun(sim(neutral, 'walk'), course, par, sc);
  assert.ok(walker.score > sSloppy.score - 0.2 && walker.score < sClean.score, 'a clean walker is below the clean sprinter');
  // faults: more faults, a lower score, never below the progress share
  const fake = (faults, sec, finished = true, d = course.length) => ({ finished, faults, d, effectiveSec: sec });
  let last = 2;
  for (let f = 0; f <= 12; f++) { const s = scoreRun(fake(f, par.parSec), course, par, sc).score; assert.ok(s <= last && s >= sc.progress + sc.time + sc.finish - 1e-9, `faults ${f}: cleanliness only costs its own share`); last = s; }
  assert.equal(scoreRun(fake(0, par.parSec), course, par, sc).score, 1, 'a perfect run on par is 1');
  assert.equal(scoreRun(fake(0, par.parSec - 5), course, par, sc).score, 1, 'faster than par is capped');
  const slowScore = scoreRun(fake(0, par.slowSec + 20), course, par, sc).score;
  assert.equal(slowScore, round(sc.progress + sc.clean + sc.finish), 'a very slow clean finish keeps progress, cleanliness and the finish bonus');
  assert.ok(scoreRun(fake(0, par.slowSec * 0.5), course, par, sc).score > slowScore, 'faster is better');
  assert.ok(scoreRun(fake(20, par.slowSec * 3), course, par, sc).score >= sc.progress + sc.finish - 1e-9, 'the floor of a finished run');
  // unfinished runs earn what they covered
  for (const share of [0, 0.2, 0.5, 0.9]) {
    const u = scoreRun(fake(0, 30, false, course.length * share), course, par, sc);
    assert.ok(u.score <= share * (sc.progress + sc.clean) + 0.01 && u.score >= share * sc.progress - 0.01 && Math.abs(u.progress - share) < 1e-9, `unfinished at ${share}: ${u.score}`);
  }
  assert.ok(scoreRun(fake(0, 30, false, course.length * 0.99), course, par, sc).score < scoreRun(fake(6, par.parSec), course, par, sc).score, 'a fast finish beats almost finishing');
  assert.equal(progressOf({ finished: true, d: 1 }, course), 1);
  assert.equal(progressOf({ finished: false, d: -5 }, course), 0);
  // bounds over many different (seeded random) runs
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 40; n++) {
    const r = new Runner(buildCourse(o, 1 + (n % 5)), { ...base, attrs: { tempo: Math.floor(rnd() * 11), ausdauer: Math.floor(rnd() * 11) } });
    const frames = Math.floor(rnd() * 3600);
    let mx = 0;
    for (let f = 0; f < frames; f++) {
      if (f % 20 === 0) mx = rnd() * 2 - 1;
      r.step(1 / 60, mx, -0.4 - rnd() * 0.6, rnd() < 0.7, rnd() < 0.1);
    }
    const s = scoreRun(r, r.course, parTimes(r.course, base), sc);
    assert.ok(s.score >= 0 && s.score <= 1 && s.progress >= 0 && s.progress <= 1 && s.speed >= 0 && s.speed <= 1 && s.clean >= 0 && s.clean <= 1, `bounds, run ${n}`);
  }
}

// ---- every level is playable in the round time ----
for (let level = 1; level <= 5; level++) {
  const c = buildCourse(o, level);
  const par = parTimes(c, base);
  const walk = simulateRun(c, { ...base, attrs: neutral, style: 'walk' });
  const sprint = simulateRun(c, { ...base, attrs: neutral, style: 'sprint' });
  assert.ok(sprint.effectiveSec >= 24 && walk.effectiveSec <= def.durationSeconds - 4, `level ${level}: sprinter ${sprint.effectiveSec.toFixed(1)} s, walker ${walk.effectiveSec.toFixed(1)} s in a ${def.durationSeconds} s round`);
  assert.ok(par.parSec < sprint.effectiveSec && par.parSec > 15 && par.slowSec <= def.durationSeconds + 5, `level ${level}: par ${par.parSec.toFixed(1)}, slow ${par.slowSec.toFixed(1)}`);
}

// ---- tally units and the standard result ----
{
  assert.deepEqual(tallyUnits(0.8, 1, 100), { correct: 80, total: 100 });
  assert.deepEqual(tallyUnits(0.25, 0.5, 100), { correct: 25, total: 50 });
  assert.deepEqual(tallyUnits(0.4, 0.2, 100), { correct: 40, total: 40 }, 'total never below the points');
  const par = parTimes(course, base);
  const mk = (attrs, style, stopAt) => {
    const r = simulateRun(course, { ...base, attrs, style, limitSec: stopAt });
    const s = scoreRun(r, course, par, sc);
    const t = new Tally();
    const u = tallyUnits(s.score, s.progress, def.expectedQuestions);
    for (let i = 0; i < u.total; i++) t.record(i < u.correct, 1, 0, 'sport');
    return { tally: t, s };
  };
  const full = mk(attrsOf('mehmet'), 'sprint', 150);
  const half = mk(neutral, 'sprint', 15);
  const result = buildResult({ def, cfg: data.settings, players: [0, 1], tallies: [full.tally, half.tally], ms: 40000, quit: false, difficulty: 3, gradeFn: () => ({ grade: 2 }) });
  assert.equal(result.perPlayer[0].score, full.s.score, 'the result score is the run score');
  assert.equal(result.perPlayer[0].effort, 1, 'a finished run is full effort');
  assert.ok(result.perPlayer[1].effort > 0.3 && result.perPlayer[1].effort < 0.9 && result.perPlayer[1].score < result.perPlayer[0].score, 'an unfinished run shows the covered share as effort');
  assert.equal(result.id, 'sport');
  assert.ok(result.perPlayer.every(p => p.xp > 0 && p.moneyCents > 0), 'both get a reward');
}
assert.equal(bandOf(0.9, o.bands).key, 'great');
assert.equal(bandOf(0.5, o.bands).key, 'ok');
assert.equal(bandOf(0, o.bands).key, 'low');
assert.equal(formatSec(12.349), '12.3');

function round(v) { return Math.round(v * 100) / 100; }

console.log('check-sport: ok');
