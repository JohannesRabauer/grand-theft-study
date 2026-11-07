// Skateboard logic without Phaser (AD-23, story 5.1): the ollie ground/air state machine, the manual balance meter, the
// skateboard profile and its surface multipliers against the bike and walking, and the input mapping of the manual intent.
// Run: node scripts/check-skate.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAND, MANUAL, MANUAL_END, OLLIE, createSkate, resetSkate, stepSkate } from '../vehicles/skateLogic.js';
import { MovementController } from '../vehicles/MovementController.js';
import { NO_TOUCH, PAD, bindingFor, createIntent, createSlot, mapIntent } from '../ui/inputBindings.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const vehicles = read('vehicles');
const surfaces = read('surfaces');
const input = read('input');
const sk = vehicles.skateboard;
const cfg = sk.trick;
const DT = 1 / 60;

// ---- profile data
assert.ok(sk.trick && sk.fx && sk.poses && sk.faceHeading, 'skateboard profile has trick, fx and poses blocks');
assert.ok(sk.maxSpeed < vehicles.bike.maxSpeed && sk.maxSpeed > vehicles.foot.maxSpeed * 1.4, 'medium-high top speed, a bit below the bike');
assert.ok(sk.turnRate > vehicles.bike.turnRate, 'snappier turning than the bike');
assert.ok(sk.drift > 0 && sk.drift < vehicles.bike.drift, 'light drift');
for (const [id, s] of Object.entries(surfaces)) assert.equal(typeof s.speed.skateboard, 'number', `${id} has a skateboard multiplier`);
const top = (profile, surface) => vehicles[profile].maxSpeed * surfaces[surface].speed[profile];
assert.ok(top('skateboard', 'cobble') < top('foot', 'cobble') && top('skateboard', 'grass') < top('foot', 'grass'), 'cobble and grass are a strong penalty (slower than walking)');
assert.ok(top('skateboard', 'grass') < top('bike', 'grass') && top('skateboard', 'cobble') < top('bike', 'cobble'), 'and worse than for the bike');
assert.ok(top('skateboard', 'asphalt') < top('bike', 'asphalt'), 'below the bike on asphalt');
assert.ok(top('skateboard', 'puddle') < top('skateboard', 'asphalt') && surfaces.puddle.grip < 1, 'puddles slow and slide');
assert.ok(surfaces.cobble.rattle > 0, 'cobble rattles');

// ---- the same MovementController, measured top speed per surface (no id branching)
function rig(profileId, surface) {
  const body = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
  const matter = { body: { setVelocity(b, v) { b.velocity.x = v.x; b.velocity.y = v.y; } } };
  return new MovementController(matter, body, profileId, vehicles[profileId], { at: () => surface, props: id => surfaces[id] });
}
function measured(profileId, surface) {
  const mc = rig(profileId, surface);
  for (let i = 0; i < 600; i++) mc.update(DT, 1, 0, false);
  return mc.velSpeed;
}
for (const s of ['asphalt', 'cobble', 'grass', 'puddle', 'concrete']) {
  const v = measured('skateboard', s);
  assert.ok(Math.abs(v - top('skateboard', s)) < 1.5, `${s}: skateboard reaches its designed ${top('skateboard', s).toFixed(1)} (got ${v.toFixed(1)})`);
  assert.ok(Math.abs(v - measured('bike', s)) > 5 && Math.abs(v - measured('foot', s)) > 5, `${s}: differs from bike and foot`);
}
{
  const mc = rig('skateboard', 'asphalt');
  mc.boostMult = 1.1;
  for (let i = 0; i < 600; i++) mc.update(DT, 1, 0, false);
  assert.ok(mc.velSpeed > sk.maxSpeed * 1.09, 'boostMult raises the target speed');
}

// ---- ollie
const run = (s, seconds, inp) => {
  const seen = [];
  for (let t = 0; t < seconds; t += DT) {
    const f = stepSkate(s, cfg, DT, inp);
    if (f) seen.push(f);
  }
  return seen;
};
{
  const s = createSkate();
  assert.equal(stepSkate(s, cfg, DT, { jump: false, manual: false, speed: 100 }), 0);
  const f = stepSkate(s, cfg, DT, { jump: true, manual: false, speed: 100 });
  assert.equal(f & OLLIE, OLLIE, 'a jump press starts an ollie');
  assert.ok(s.air > 0 && s.airTime >= cfg.ollie.airtime, 'airtime set');
  let peak = 0;
  let airFrames = 0;
  let landed = false;
  for (let i = 0; i < 120 && !landed; i++) {
    const fl = stepSkate(s, cfg, DT, { jump: true, manual: false, speed: 100 });
    peak = Math.max(peak, s.height);
    if (s.air > 0) airFrames++;
    if (fl & LAND) landed = true;
    assert.ok(!(fl & OLLIE), 'a held jump does not retrigger in the air');
  }
  assert.ok(landed && s.height === 0, 'lands and the height returns to 0');
  assert.ok(peak > cfg.ollie.height * 0.95 && peak <= cfg.ollie.height + 1e-9, `peak ${peak.toFixed(2)} reaches the configured height`);
  assert.ok(Math.abs(airFrames * DT - s.airTime) < 0.05, 'airtime matches');
  stepSkate(s, cfg, DT, { jump: true, manual: false, speed: 100 });
  assert.equal(s.air, 0, 'holding jump through the landing does not hop again (needs a fresh press)');
  const slow = createSkate();
  stepSkate(slow, cfg, DT, { jump: true, manual: false, speed: 0 });
  const fast = createSkate();
  stepSkate(fast, cfg, DT, { jump: true, manual: false, speed: 200 });
  assert.ok(fast.airTime > slow.airTime && fast.airTime <= cfg.ollie.airtime * (1 + cfg.ollie.speedGain) + 1e-9, 'speed lengthens the hop a bit, capped');
  assert.ok(slow.airTime > 0.25, 'even standing, the ollie hangs long enough to clear a cone');
  s.ollieCool = 0;
  stepSkate(s, cfg, DT, { jump: false, manual: false, speed: 100 });
  assert.equal(stepSkate(s, cfg, DT, { jump: true, manual: false, speed: 100 }) & OLLIE, OLLIE, 'a second press after landing hops again');
}

// ---- manual
{
  const idle = { jump: false, manual: false, speed: 100 };
  const hold = { jump: false, manual: true, speed: 100 };
  let s = createSkate();
  assert.equal(stepSkate(s, cfg, DT, { jump: false, manual: true, speed: 10 }) & MANUAL, 0, 'too slow to start a manual');
  s = createSkate();
  assert.equal(stepSkate(s, cfg, DT, hold) & MANUAL, MANUAL, 'a fresh press at speed starts it');
  assert.ok(s.manual && s.meter > cfg.manual.startAt && s.sweetNow && s.boost === cfg.manual.boost, 'the needle starts in the sweet window with the speed boost on');
  // held too long: drifts up past the window and the player drops to rolling, never harsh
  const over = run(s, 2, hold);
  assert.ok(over.includes(MANUAL_END) && !s.manual && s.endReason === 'over' && s.boost === 1, 'held too long ends the manual (over)');
  assert.ok(s.sweet > 0.3 && s.sweet < s.manualTime, 'part of the time was in the sweet window');
  assert.equal(stepSkate(s, cfg, DT, hold) & MANUAL, 0, 'a held button does not restart it at once (fresh press and cooldown)');
  run(s, cfg.manual.cooldown + 0.1, idle);
  assert.equal(stepSkate(s, cfg, DT, hold) & MANUAL, MANUAL, 'after the cooldown a new press starts again');
  // pulsing keeps it alive: hold while below the middle, release above
  s = createSkate();
  let alive = true;
  for (let t = 0; t < 5 && alive; t += DT) {
    stepSkate(s, cfg, DT, { jump: false, manual: s.meter < 0.55 || !s.manual, speed: 100 });
    if (!s.manual && t > 0.1) alive = false;
  }
  assert.ok(alive && s.sweet > 4, `pulsing the button holds the balance (sweet ${s.sweet.toFixed(2)} s)`);
  // let go and it sinks out gently
  const under = run(s, 3, idle);
  assert.ok(under.includes(MANUAL_END) && s.endReason === 'under', 'released: the needle sinks and the manual ends (under)');
  // speed loss ends it softly
  s = createSkate();
  stepSkate(s, cfg, DT, hold);
  run(s, 0.1, { jump: false, manual: true, speed: 5 });
  assert.ok(!s.manual && s.endReason === 'slow', 'standing still ends the manual');
  // ollie out of a manual
  s = createSkate();
  stepSkate(s, cfg, DT, hold);
  const f = stepSkate(s, cfg, DT, { jump: true, manual: true, speed: 100 });
  assert.ok((f & OLLIE) && (f & MANUAL_END) && !s.manual && s.endReason === 'ollie', 'an ollie ends the manual');
  run(s, 0.05, { jump: false, manual: false, speed: 100 });
  run(s, 0.05, hold);
  assert.ok(!s.manual, 'a manual cannot start in the air');
  resetSkate(s);
  assert.deepEqual(s, createSkate(), 'reset returns to the ground state');
}

// ---- manual intent: keys, pad, touch, both players
{
  const mk = (count, i) => ({ intent: createIntent(), slot: createSlot(), bind: bindingFor(input, i, count) });
  const frame = (p, down, pad = null, touch = NO_TOUCH) => mapIntent(p.intent, p.slot, p.bind, { down, pad, touch, mouseDown: false }, input.deadzone);
  const [a, b] = [mk(2, 0), mk(2, 1)];
  frame(a, new Set(['KeyC']));
  assert.ok(a.intent.manual && !a.intent.jump, 'C is the manual for P1');
  frame(a, new Set(['ControlLeft']));
  assert.ok(a.intent.manual, 'Left Ctrl too');
  frame(b, new Set(['Slash']));
  assert.ok(b.intent.manual, '/ is the manual for P2');
  frame(a, new Set(['Slash']));
  assert.ok(!a.intent.manual, 'P2 keys do not reach P1');
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  buttons[PAD.LT].pressed = true;
  frame(a, new Set(), { leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, buttons });
  assert.ok(a.intent.manual, 'LT on a pad');
  frame(a, new Set(), null, { ...NO_TOUCH, btn: { ...NO_TOUCH.btn, manual: true } });
  assert.ok(a.intent.manual, 'the touch button');
  frame(a, new Set());
  assert.ok(!a.intent.manual, 'released');
  const btn = input.buttons.find(x => x.id === 'manual');
  assert.ok(btn && btn.when === 'trick', 'the touch manual button exists and only shows with trick vehicles');
  assert.ok(sk[btn.when], 'the profile key it waits for exists');
}

console.log('check-skate ok');
