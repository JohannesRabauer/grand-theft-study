// Smooth motion (story 16.13): the pure maths, the data file and the reducedMotion state action.
// Run: node scripts/check-motion.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepLookAhead, cycleStep, bobAt, squashAt, shakeAt, fadeAlpha, smooth } from '../camera/motionMath.js';
import { Motion } from '../camera/Motion.js';
import { ACTIONS } from '../state/actions.js';

const cfg = JSON.parse(readFileSync(new URL('../data/motion.json', import.meta.url), 'utf8'));

// ---- data
assert.equal(typeof cfg.reducedMotion, 'boolean');
for (const id of ['land', 'rideJump', 'rideLand', 'hop']) assert.ok(cfg.squash[id].time > 0 && cfg.squash[id].sx > 0, `squash ${id}`);
for (const [ev, rule] of Object.entries(cfg.events)) {
  if (rule.shake) assert.ok(cfg.shake[rule.shake], `${ev}: shake preset`);
  if (rule.hitStop) assert.ok(cfg.hitStop[rule.hitStop], `${ev}: hit-stop preset`);
}
for (const [id, p] of Object.entries(cfg.shake)) assert.ok(Number.isInteger(p.amp) && p.time <= 0.4, `shake ${id}: whole pixels, short`);
for (const [id, p] of Object.entries(cfg.hitStop)) assert.ok(p.time <= 0.1 && p.scale >= 0, `hit-stop ${id}: at most 100 ms`);
assert.ok(cfg.transition.out > 0 && cfg.transition.in > 0 && cfg.transition.reduced > 0);

// ---- look-ahead: eases towards a point ahead, never jumps, fades out with the gate, still kid stays at 0
const st = { x: 0, y: 0 };
let worst = 0;
for (let i = 0; i < 300; i++) { const before = st.x; stepLookAhead(st, 150, 0, 1 / 60, cfg.lookAhead); worst = Math.max(worst, Math.abs(st.x - before)); }
assert.ok(Math.abs(st.x - cfg.lookAhead.distance) < 0.05 && st.y === 0, `look-ahead settles at ${st.x}`);
assert.ok(worst < 0.8, `look-ahead moves by ${worst.toFixed(3)} px per frame at most`);
for (let i = 0; i < 600; i++) stepLookAhead(st, 0, 0, 1 / 60, cfg.lookAhead);
assert.ok(Math.abs(st.x) < 0.01, 'eases back to the kid when standing');
for (let i = 0; i < 300; i++) stepLookAhead(st, 150, 0, 1 / 60, cfg.lookAhead, 0);
assert.ok(Math.abs(st.x) < 0.01, 'gate 0 (co-op, reducedMotion): no look-ahead');

// ---- stride cycle: A, standing, B, standing; bob stays within its amplitude
assert.deepEqual([0, 0.9, 1, 2.5, 3.99, 4, -0.5].map(cycleStep), [0, 0, 1, 2, 3, 0, 3]);
for (let p = 0; p < 8; p += 0.05) { const b = bobAt(p, cfg.cycle.bob); assert.ok(b >= 0 && b <= cfg.cycle.bob + 1e-9); }

// ---- squash: starts at the preset, ends at exactly 1
const out = { sx: 1, sy: 1 };
const land = cfg.squash.land;
assert.deepEqual(squashAt(land, 0, out), { sx: land.sx, sy: land.sy });
assert.deepEqual(squashAt(land, land.time, out), { sx: 1, sy: 1 });
assert.ok(squashAt(land, land.time / 2, out).sx < land.sx && out.sx > 1, 'eases back');

// ---- shake: whole pixels, decays, ends at 0, deterministic
for (const [id, p] of Object.entries(cfg.shake)) {
  let peak = 0;
  for (let t = 0; t < p.time; t += 1 / 60) {
    const a = { ...shakeAt(p, t, { x: 0, y: 0 }) };
    assert.ok(Number.isInteger(a.x) && Number.isInteger(a.y) && Math.abs(a.x) <= p.amp && Math.abs(a.y) <= p.amp, `${id} at ${t}`);
    assert.deepEqual(a, shakeAt(p, t, { x: 0, y: 0 }), 'deterministic');
    peak = Math.max(peak, Math.abs(a.x), Math.abs(a.y));
  }
  assert.ok(peak >= 1 || p.amp < 2, `${id} shows`);
  assert.deepEqual(shakeAt(p, p.time, { x: 9, y: 9 }), { x: 0, y: 0 });
}

// ---- fade: 0 -> 1 -> hold -> 0, monotone out and in, no black before the fade starts
const tr = cfg.transition;
assert.equal(fadeAlpha(tr, 0, false), 0);
assert.equal(fadeAlpha(tr, tr.out, false), 1);
assert.equal(fadeAlpha(tr, tr.out + tr.hold / 2, false), 1);
assert.ok(fadeAlpha(tr, tr.out + tr.hold + tr.in, false) < 1e-9);
let prev = 0;
for (let t = 0; t <= tr.out; t += 0.004) { const a = fadeAlpha(tr, t, false); assert.ok(a >= prev - 1e-9 && a - prev < 0.12, 'no jump to black'); prev = a; }
prev = 1;
for (let t = tr.out + tr.hold; t <= tr.out + tr.hold + tr.in; t += 0.004) { const a = fadeAlpha(tr, t, false); assert.ok(a <= prev + 1e-9 && prev - a < 0.12, 'no jump back'); prev = a; }
assert.equal(fadeAlpha(tr, tr.reduced, true), 1, 'reduced fades are short');
assert.equal(smooth(2), 1);

// ---- reducedMotion: data default plus the state action; shake and hit-stop respect it
const flags = {};
const events = { on() {} };
const ctx = { events, state: { shared: { flags } } };
const motion = new Motion(ctx, cfg, { motionFxOff: false });
assert.equal(motion.reduced, cfg.reducedMotion, 'data default');
motion.shake('bump');
motion.update(0.02);
assert.ok(motion.shakeId, 'shake starts');
motion.hitStop('bump');
assert.ok(motion.timeScale(0.01) < 1, 'hit-stop slows the world');
const draft = { shared: { flags } };
const r = ACTIONS['settings.reducedMotion'](draft, { value: true });
assert.equal(r.path, 'shared.flags.reducedMotion');
assert.equal(motion.reduced, true, 'the flag wins over the default');
motion.shakeId = null; motion.stopT = 0;
motion.shake('hit');
motion.hitStop('hit');
assert.ok(!motion.shakeId && motion.timeScale(0.01) === 1, 'reducedMotion: no shake, no hit-stop');
assert.ok(ACTIONS['settings.reducedMotion'](draft, { value: 'yes' }).reject, 'bad payload rejected');
ACTIONS['settings.reducedMotion'](draft, { value: false });
assert.equal(motion.reduced, false);

console.log('check-motion: ok');
