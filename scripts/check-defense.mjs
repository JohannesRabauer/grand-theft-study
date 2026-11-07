// Karate defense without Phaser (story 6.3, AD-24): the state machine with costs and cooldowns, how contacts are answered (parry, block,
// dodge), whom a Kiai reaches (bullies only; pedestrians and animals can only gasp), the Ärger drop with its level gating, the stumble
// displacement integration, the bully STUMBLE state, and that nothing in the stumble applies a Matter force.
// Run: node scripts/check-defense.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ST, EV, beltStats, canKiai, contactResult, createSlot, kiaiReach, stumbleDelta, stumbleOffset, stumbleWobble, tickSlot, walkMult } from '../defense/defenseCore.js';
import { ChaseLevel } from '../ai/ChaseLevel.js';
import { BullyFSM, S } from '../ai/BullyFSM.js';
import { ACTIONS } from '../ui/inputBindings.js';

const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const load = p => JSON.parse(text(p));
const cfg = load('data/karate.json');
const chaseCfg = load('data/chase.json');
const input = load('data/input.json');
const hud = load('data/hud.json');
const de = load('i18n/de.json');
const en = load('i18n/en.json');
const DT = 1 / 60;

// ---- data
const white = beltStats(cfg, 'white');
for (const k of ['kiaiRadius', 'kiaiCooldown', 'blockWindow', 'dodgeDistance', 'dodgeCooldown', 'stumbleDuration', 'aergerReduction']) assert.ok(white[k] > 0, `white belt has ${k}`);
assert.equal(beltStats(cfg, 'nonsense'), white, 'an unknown belt falls back to the default belt');
assert.ok(white.stumbleDuration > cfg.stumble.step, 'a stumble outlasts its step back');
assert.ok(cfg.timing.parryWindow > 0.1 && cfg.timing.parryWindow <= 0.2, 'a parry is the first ~150 ms of a block');
assert.ok(white.kiaiRadius > chaseCfg.bully.catchRadius * 4 && white.kiaiRadius < chaseCfg.perception.viewDistance, 'the Kiai reaches near bullies, not the whole street');
for (const s of Object.values(ST)) assert.ok(cfg.moveMult[s] >= 0 && cfg.moveMult[s] <= 1, `moveMult for ${s}`);
assert.equal(chaseCfg.level.defendMaxLevel, 2, 'the Kiai works on levels 1-2 until epic 7 raises it');
assert.ok(hud.modes.play.some(e => e.id === 'defense' && e.scope === 'player'), 'the Mut bar is a per-player HUD module');
for (const [i, p] of input.players.entries()) {
  assert.ok(ACTIONS.includes('defend') && ACTIONS.includes('kiai'), 'defend and kiai are actions');
  assert.equal(p.keys.defend.length, 1, `P${i + 1} has a defend key`);
  assert.equal(p.keys.kiai.length, 1, `P${i + 1} has a kiai key`);
}
assert.deepEqual(input.buttons.filter(b => b.id === 'defend' || b.id === 'kiai').map(b => b.id).sort(), ['defend', 'kiai'], 'touch has a shield and a Kiai button');
for (const k of ['hud.courage', 'defense.kiaiShout', 'defense.gasp', 'defense.block', 'defense.parry', 'defense.bully.block', 'defense.bullyKiai.1', 'defense.bullyKiai.2', 'defense.bullyKiai.3', 'toast.defenseHint', 'toast.defenseHintTouch', 'toast.defenseHintPad']) {
  assert.ok(de[k] && en[k], `i18n ${k}`);
}
assert.ok(de['defense.gasp'] === 'Oha!' && de['toast.defenseHint'].includes('R') && de['toast.defenseHint'].includes('V'), 'the hint names the keys');

// ---- state machine
const inp = (o = {}) => ({ defend: false, kiai: false, mx: 0, my: 0, ...o });
const run = (slot, seconds, i) => { let last = null; for (let n = 0; n < Math.round(seconds / DT); n++) last = tickSlot(slot, white, cfg, i, DT) ?? last; return last; };
{
  const s = createSlot();
  assert.equal(tickSlot(s, white, cfg, inp(), DT), null);
  assert.equal(s.state, ST.IDLE);
  assert.equal(tickSlot(s, white, cfg, inp({ defend: true }), DT), EV.BLOCK, 'holding defend standing still blocks');
  assert.equal(s.state, ST.BLOCK);
  run(s, 0.3, inp({ defend: true }));
  assert.equal(s.state, ST.BLOCK, 'the block holds while held');
  assert.ok(s.mut < 1 && s.mut > 0.9, 'holding costs a little Mut');
  tickSlot(s, white, cfg, inp(), DT);
  assert.equal(s.state, ST.RECOVER, 'letting go drops the guard');
  run(s, cfg.timing.recoverTime + 0.05, inp());
  assert.equal(s.state, ST.IDLE, 'and recovers');

  // a held button does not re-block: the next press is needed
  tickSlot(s, white, cfg, inp({ defend: true }), DT);
  run(s, white.blockWindow + 0.2, inp({ defend: true }));
  assert.ok([ST.RECOVER, ST.IDLE].includes(s.state), 'the guard drops after the block window');
  const down = createSlot();
  tickSlot(down, white, cfg, inp({ defend: true }), DT);
  let ev = null;
  for (let n = 0; n < 200 && !ev; n++) ev = tickSlot(down, white, cfg, inp({ defend: true }), DT);
  assert.equal(ev, EV.GUARD_DOWN, 'the guard-down event fires');
  assert.equal(down.state, ST.RECOVER);
  assert.ok(down.recoverFor > cfg.timing.recoverTime, 'a dropped guard recovers slower');
}
{
  const s = createSlot();
  const ev = tickSlot(s, white, cfg, inp({ defend: true, mx: 1, my: 0 }), DT);
  assert.equal(ev, EV.DODGE, 'defend while walking is a dodge roll');
  assert.equal(s.state, ST.DODGE);
  assert.ok(s.dirX === 1 && s.dirY === 0, 'the roll goes the way the kid walks');
  assert.ok(s.invuln >= cfg.timing.dodgeTime, 'invulnerable for the roll');
  assert.ok(s.dodgeCd > 0, 'cooldown started');
  assert.ok(Math.abs(s.mut - (1 - cfg.mut.dodgeCost)) < 1e-9, 'the roll costs Mut');
  run(s, cfg.timing.dodgeTime + cfg.timing.recoverTime + 0.05, inp({ mx: 1 }));
  assert.equal(s.state, ST.IDLE);
  assert.ok(s.dodgeCd > 0 && s.dodgeCd <= white.dodgeCooldown, 'the cooldown is still running');
  tickSlot(s, white, cfg, inp({ defend: true, mx: 1 }), DT);
  assert.equal(s.state, ST.BLOCK, 'while the roll cools down a press just blocks (holding is always a block)');
  const t = createSlot();
  tickSlot(t, white, cfg, inp({ defend: true, mx: 0.1 }), DT);
  assert.equal(t.state, ST.BLOCK, 'a tiny stick wiggle is not a dodge');
  const tired = createSlot();
  tired.mut = cfg.mut.dodgeCost - 0.01;
  tickSlot(tired, white, cfg, inp({ defend: true, mx: 1 }), DT);
  assert.equal(tired.state, ST.BLOCK, 'a dodge needs the Mut for it');
}
{
  const s = createSlot();
  const ev = tickSlot(s, white, cfg, inp({ kiai: true }), DT);
  assert.equal(ev, EV.KIAI);
  assert.equal(s.state, ST.KIAI);
  assert.ok(s.kiaiCd === white.kiaiCooldown, 'the Kiai cooldown starts');
  assert.ok(Math.abs(s.mut - (1 - cfg.mut.kiaiCost)) < 1e-9, 'the Kiai costs Mut');
  run(s, cfg.timing.kiaiTime + cfg.timing.recoverTime + 0.1, inp());
  assert.equal(s.state, ST.IDLE);
  tickSlot(s, white, cfg, inp({ kiai: true }), DT); // still held from before? a fresh press is needed
  tickSlot(s, white, cfg, inp(), DT);
  assert.equal(tickSlot(s, white, cfg, inp({ kiai: true }), DT), null, 'the cooldown holds: no second Kiai');
  assert.ok(!canKiai(s, white, cfg));
  run(s, white.kiaiCooldown, inp());
  assert.ok(canKiai(s, white, cfg), 'ready again after the cooldown (Mut refilled)');
  assert.equal(tickSlot(s, white, cfg, inp({ kiai: true }), DT), EV.KIAI);
  const poor = createSlot();
  poor.mut = cfg.mut.kiaiCost - 0.01;
  assert.equal(tickSlot(poor, white, cfg, inp({ kiai: true }), DT), null, 'no Kiai without the Mut');
  // Mut refills after its delay
  const m = createSlot();
  m.mut = 0.2;
  m.regenIn = cfg.mut.regenDelay;
  run(m, cfg.mut.regenDelay - 0.1, inp());
  assert.ok(Math.abs(m.mut - 0.2) < 1e-9, 'no refill during the delay');
  run(m, 2, inp());
  assert.ok(m.mut > 0.4, 'Mut refills afterwards');
  assert.equal(walkMult({ state: ST.BLOCK }, cfg), cfg.moveMult.BLOCK);
}
{ // two slots are independent (co-op)
  const a = createSlot();
  const b = createSlot();
  tickSlot(a, white, cfg, inp({ kiai: true }), DT);
  tickSlot(b, white, cfg, inp(), DT);
  assert.ok(a.state === ST.KIAI && b.state === ST.IDLE && b.mut === 1 && b.kiaiCd === 0, 'one kid shouting leaves the other untouched');
}

// ---- contacts
{
  const idle = createSlot();
  assert.equal(contactResult(idle, cfg), null, 'no defense: the bully catches');
  const s = createSlot();
  tickSlot(s, white, cfg, inp({ defend: true }), DT);
  run(s, cfg.timing.parryWindow - 0.05, inp({ defend: true }));
  const mut = s.mut;
  assert.equal(contactResult(s, cfg), 'parry', 'a contact in the first 150 ms is a parry');
  assert.equal(s.mut, mut, 'a parry is free');
  run(s, 0.3, inp({ defend: true }));
  const before = s.mut;
  assert.equal(contactResult(s, cfg), 'block', 'later in the block it is a plain block');
  assert.ok(Math.abs(before - s.mut - cfg.mut.blockCost) < 1e-9, 'a block costs Mut');
  s.mut = cfg.mut.blockCost - 0.01;
  assert.equal(contactResult(s, cfg), null, 'a worn-out guard does not hold');
  const d = createSlot();
  tickSlot(d, white, cfg, inp({ defend: true, mx: 1 }), DT);
  assert.equal(contactResult(d, cfg), 'dodge', 'during the roll the bully passes');
  run(d, cfg.timing.dodgeTime + cfg.timing.dodgeGrace + 0.02, inp());
  assert.equal(contactResult(d, cfg), null, 'after the roll (and its grace) it is over');
  const k = createSlot();
  tickSlot(k, white, cfg, inp({ kiai: true }), DT);
  assert.equal(contactResult(k, cfg), 'kiai', 'a bully arriving during the shout stance is sent back');
}

// ---- who a Kiai reaches
{
  const mk = (id, x, y, state = 'CHASE', active = true) => ({ id, x, y, state, active });
  const bullies = [mk(0, 30, 0), mk(1, 71, 0, 'SEARCH'), mk(2, 73, 0), mk(3, 10, 0, 'CAUGHT'), mk(4, 10, 5, 'GIVE_UP'), mk(5, 5, 5, 'CHASE', false), mk(6, 0, 20, 'IDLE'), mk(7, 0, 30, 'STUMBLE')];
  const npcs = [{ id: 'npc-1', x: 10, y: 0, active: true }, { id: 'npc-2', x: 400, y: 0, active: true }];
  const animals = [{ id: 'dog-1', x: 0, y: 10, active: true }, { id: 'dog-2', x: 0, y: 12, active: false }];
  const out = { affected: [], gasp: [] };
  kiaiReach(0, 0, 72, bullies, [npcs, animals], out);
  assert.deepEqual(out.affected.map(b => b.id).sort(), [0, 1, 6], 'bullies that are after the player and in range stumble (not CAUGHT, GIVE_UP, STUMBLE, inactive, out of range)');
  assert.deepEqual(out.gasp.map(o => o.id).sort(), ['dog-1', 'npc-1'], 'pedestrians and animals in range only gasp');
  assert.ok(out.affected.every(b => bullies.includes(b)) && !out.affected.some(b => typeof b.id === 'string'), 'a Kiai never stumbles a pedestrian or an animal (by construction)');
  kiaiReach(0, 0, 72, [], [npcs, animals], out);
  assert.equal(out.affected.length, 0, 'with no bullies nothing stumbles, the gasps still happen');
  assert.equal(out.gasp.length, 2);
  kiaiReach(500, 500, 72, bullies, [npcs, animals], out);
  assert.equal(out.affected.length + out.gasp.length, 0, 'out of everyone\'s reach nothing happens');
}

// ---- Ärger gating
{
  const lc = chaseCfg.level;
  const make = (level, turfTime = 0, enabled = true) => {
    const events = [];
    const l = new ChaseLevel(lc, enabled, (lv, reason) => events.push([lv, reason]));
    l.level = level;
    l.turfTime = turfTime;
    return { l, events };
  };
  let { l, events } = make(2, 12);
  assert.ok(l.defend(1, lc.defendMaxLevel) && l.level === 1 && events[0][1] === 'defend', 'level 2 falls to 1');
  assert.ok(l.turfTime <= 0 + 1e-9 || l.turfTime < lc.turfSecondsPerLevel, 'the turf timer is pulled back so turf does not lift it again at once');
  l.update(0.1);
  assert.equal(l.level, 1, 'the drop sticks');
  ({ l, events } = make(1));
  assert.ok(l.defend(1, lc.defendMaxLevel) && l.level === 0, 'level 1 falls to 0 (the chase ends)');
  assert.ok(l.lockout > 0, 'like any clear it has a lockout');
  ({ l, events } = make(0));
  assert.ok(!l.defend(1, lc.defendMaxLevel) && l.level === 0 && events.length === 0, 'level 0 stays 0');
  ({ l, events } = make(3));
  assert.ok(!l.defend(1, 2) && l.level === 3, 'above defendMaxLevel nothing changes');
  assert.ok(l.defend(1, 5) && l.level === 2, 'the interface works for more levels once data allows them');
  ({ l, events } = make(2));
  assert.ok(!l.defend(0, 2) && l.level === 2, 'no reduction, no change');
  ({ l, events } = make(2, 0, false));
  assert.ok(!l.defend(1, 2) && l.level === 2, 'a disabled chase is left alone');
}

// ---- stumble displacement integration
{
  const { step } = cfg.stumble;
  const dist = cfg.stumble.kiaiDistance;
  let t = 0;
  let sum = 0;
  let prev = 0;
  for (let n = 0; n < Math.round(white.stumbleDuration / DT); n++) {
    const d = stumbleDelta(t, DT, step, dist);
    assert.ok(d >= -1e-12, 'never steps forward');
    assert.ok(d <= prev + 1e-12 || n === 0, 'slows down (ease out)');
    prev = d;
    sum += d;
    t += DT;
  }
  assert.ok(Math.abs(sum - dist) < 1e-6, 'the frames add up to the whole distance');
  assert.equal(stumbleDelta(step + 0.01, DT, step, dist), 0, 'afterwards the bully stands dizzy');
  assert.equal(stumbleOffset(0, step, dist), 0);
  assert.ok(Math.abs(stumbleOffset(10, step, dist) - dist) < 1e-9);
  assert.ok(Math.abs(stumbleWobble(0.01, white.stumbleDuration, cfg.stumble.wobbleHz, cfg.stumble.wobbleRad)) <= cfg.stumble.wobbleRad);
  assert.ok(stumbleWobble(white.stumbleDuration + 0.1, white.stumbleDuration, cfg.stumble.wobbleHz, cfg.stumble.wobbleRad) === 0, 'the sway dies down');
}

// ---- the bully STUMBLE state
{
  const ctx = { maxPlayers: 2, alivePlayers: () => [], nearestPlayer: () => ({ x: 0, y: 0 }), players: [] };
  const fsm = new BullyFSM({ cfg: chaseCfg, ctx, farSpawn: () => ({ x: 0, y: 0 }), onScreen: () => true, despawn() {}, perception: { sees: () => false } });
  const bully = (state) => {
    const calls = { step: 0, begin: null };
    const o = { calls, state, t: 0, seenMask: 0, target: null, sees: false, alerted: false, lost: 0, resume: S.CHASE, stumbleDuration: 0, x: 0, y: 0, lastX: 0, lastY: 0,
      stop() {}, goTo() { return 0; }, stumbleStep() { calls.step++; }, beginStumble(x, y, opts) { calls.begin = [x, y, opts]; o.stumbleDuration = opts.duration; } };
    return o;
  };
  let b = bully(S.CHASE);
  assert.ok(fsm.stumble(b, 5, 6, { duration: 1, step: 0.5, distance: 20 }) && b.state === S.STUMBLE && b.resume === S.CHASE && b.calls.begin[0] === 5, 'a chasing bully stumbles and resumes the chase');
  for (let n = 0; n < 50; n++) fsm.update(b, DT);
  assert.ok(b.state === S.STUMBLE && b.calls.step === 50, 'it stays stumbling for its duration, stepping every frame');
  for (let n = 0; n < 20; n++) fsm.update(b, DT);
  assert.ok(b.state === S.CHASE || b.state === S.SEARCH, 'then it goes on (the chase, or a search when it lost sight meanwhile)');
  b = bully(S.IDLE);
  fsm.stumble(b, 0, 0, { duration: 1, step: 0.5, distance: 20 });
  assert.equal(b.resume, S.CHASE, 'a bully just spawned starts chasing afterwards');
  b = bully(S.SEARCH);
  fsm.stumble(b, 0, 0, { duration: 1, step: 0.5, distance: 20 });
  b.resume = S.GIVE_UP; // the level fell to 0 meanwhile (ChaseDirector.onLevel)
  fsm.stumble(b, 0, 0, { duration: 1, step: 0.5, distance: 20 });
  assert.equal(b.resume, S.GIVE_UP, 'a second stumble keeps what comes after the first');
  for (let n = 0; n < 61; n++) fsm.update(b, DT);
  assert.equal(b.state, S.GIVE_UP, 'a bully whose Ärger vanished walks off after the step');
  for (const state of [S.CAUGHT, S.GIVE_UP]) {
    b = bully(state);
    assert.ok(!fsm.stumble(b, 0, 0, { duration: 1, step: 0.5, distance: 20 }) && b.state === state, `${state} bullies are left alone`);
  }
  b = bully(S.STUMBLE);
  assert.ok(!fsm.distract(b, 0, 0, 100), 'a stumbling bully is not lured away');
}

// ---- no force, no damage, no hurt
{
  const files = ['ai/BullyFSM.js', 'entities/Bully.js', ...readdirSync(new URL('../defense/', import.meta.url)).map(f => `defense/${f}`)];
  for (const f of files) {
    const src = text(f);
    assert.ok(!/applyForce|applyImpulse|\.force\b|\.torque\b|Body\.scale/.test(src), `${f} applies no Matter force`);
    assert.ok(!/\bdamage\b|\.hp\b|knock/i.test(src.replace(/\/\/.*$/gm, '')), `${f} has no damage or knockout`);
  }
  const bully = text('entities/Bully.js');
  const step = bully.slice(bully.indexOf('stumbleStep(dt)'), bully.indexOf('// Steer toward'));
  assert.ok(step.includes('setPosition') && !step.includes('setVelocity'), 'a stumble moves the bully by a scripted position change only');
}
console.log('check-defense: all assertions passed');
