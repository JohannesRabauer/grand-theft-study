// Trick system without Phaser (AD-23, story 5.2): the Style combo maths (points, variety, repeat, multiplier, timer,
// banking, bail, payout, perk), rail / bench / stairs / ramp geometry, the grind state of the skate logic, and the whole
// TrickSystem driven in node with fake scene pieces: ollie -> grind -> ollie off -> stairs chain, banking through state
// actions, bail, ramp, rattle, co-op.
// Run: node scripts/check-tricks.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAND, MANUAL_END, OLLIE, createSkate, endGrind, startAir, startGrind, stepSkate } from '../vehicles/skateLogic.js';
import {
  addTrick, bankedValue, benchPath, buildPath, canBankAt, captureRail, comboValue, createCombo, facing, hitWall, inRect, isActive, payout, pointAt,
  projectPath, rampAirtime, resetCombo, tickCombo, trickPoints
} from '../vehicles/trickCore.js';
import { TrickSystem } from '../vehicles/TrickSystem.js';

const read = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cfg = read('data/tricks.json');
const vehicles = read('data/vehicles.json');
const tcfg = vehicles.skateboard.trick;
const characters = read('data/characters.json');
const growth = read('data/attr-growth.json');
const de = read('i18n/de.json');
const en = read('i18n/en.json');
const hud = read('data/hud.json');
const particles = read('data/particles.json');
const DT = 1 / 60;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// ---- data
for (const [id, t] of Object.entries(cfg.tricks)) {
  assert.ok(de[t.name] && en[t.name], `${id} has a name in both languages`);
  assert.ok(t.points > 0, `${id} scores points`);
}
for (const k of ['hud.style', 'style.banked', 'style.saved', 'trick.rattle']) assert.ok(de[k] && en[k], k);
assert.ok(cfg.combo.window > 0 && cfg.combo.fireMult > 1 && cfg.combo.multMax > cfg.combo.fireMult, 'combo numbers');
assert.ok(cfg.combo.repeatPoints < 1 && cfg.combo.varietyPoints > 0 && cfg.bank.bailShare > 0 && cfg.bank.bailShare < 1, 'repeat punishes, variety pays, a bail never loses everything');
assert.ok(characters.characters.find(c => c.id === 'mehmet').perks.trickMultiplier > 1, 'Mehmet has the trick perk');
assert.ok(growth.rules.some(r => r.event === 'style:banked' && r.attr === 'tempo'), 'style:banked raises Tempo');
assert.ok(hud.modes.play.some(e => e.id === 'style' && e.scope === 'player'), 'a style HUD module per player');
assert.ok(particles.emitters.fire && particles.emitters.spark, 'fire and spark emitters exist');

// ---- scoring
{
  assert.equal(trickPoints(cfg, 'ollie', {}), cfg.tricks.ollie.points);
  assert.ok(trickPoints(cfg, 'ollie', { air: 0.6 }) > trickPoints(cfg, 'ollie', { air: 0.3 }), 'airtime pays');
  assert.ok(trickPoints(cfg, 'stairs', { steps: 8 }) - trickPoints(cfg, 'stairs', { steps: 4 }) === 4 * cfg.tricks.stairs.perStep, 'stairs points grow with every step');
  assert.ok(trickPoints(cfg, 'ramp', { air: 1 }) > trickPoints(cfg, 'ramp', { air: 0.5 }), 'ramp airtime pays');
  assert.ok(trickPoints(cfg, 'grind', { meters: 20 }) > trickPoints(cfg, 'grind', { meters: 4 }), 'a longer grind pays more');
  assert.equal(trickPoints(cfg, 'grind', { meters: 4, bonus: 40 }) - trickPoints(cfg, 'grind', { meters: 4 }), 40, 'the jump-off bonus adds');
  assert.ok(trickPoints(cfg, 'manual', { sweet: 2 }) > trickPoints(cfg, 'manual', { sweet: 0.5 }), 'balanced manual time pays');
}

// ---- combo: variety, repeat, multiplier, timer
{
  const c = createCombo();
  assert.ok(!isActive(c) && comboValue(c) === 0 && c.mult === 1);
  const first = addTrick(c, cfg, 'ollie', 100);
  assert.equal(first, 100, 'the first trick scores as is');
  near(c.mult, 1 + cfg.combo.growth, 1e-9, 'it grows the multiplier');
  const varied = addTrick(c, cfg, 'grind', 100);
  near(varied, 100 * (1 + cfg.combo.varietyPoints), 1e-9, 'a different trick scores the variety bonus');
  near(c.mult, 1 + cfg.combo.growth * (2 + cfg.combo.varietyGrowth), 1e-9, 'and grows the multiplier faster');
  const m = c.mult;
  const repeat = addTrick(c, cfg, 'grind', 100);
  near(repeat, 100 * cfg.combo.repeatPoints, 1e-9, 'the same trick twice scores the repeat penalty');
  near(c.mult - m, cfg.combo.growth * cfg.combo.repeatGrowth, 1e-9, 'and barely grows the multiplier');
  assert.equal(addTrick(c, cfg, 'ollie', 100), 100 * (1 + cfg.combo.varietyPoints), 'a trick not among the last two is variety again');
  assert.deepEqual(c.tricks, ['ollie', 'grind', 'grind', 'ollie']);
  const aba = createCombo();
  addTrick(aba, cfg, 'ollie', 100);
  addTrick(aba, cfg, 'grind', 100);
  assert.equal(addTrick(aba, cfg, 'ollie', 100), 100, 'A B A: neither a repeat nor new, plain points (alternating two tricks is no exploit)');
  assert.equal(c.timer, cfg.combo.window, 'every trick refills the window');

  const perk = createCombo();
  const plain = createCombo();
  addTrick(perk, cfg, 'ollie', 100, 1.35);
  addTrick(plain, cfg, 'ollie', 100, 1);
  near(perk.mult - 1, (plain.mult - 1) * 1.35, 1e-9, 'the Mehmet perk multiplies the growth, not the points');
  assert.equal(perk.base, plain.base);

  const cap = createCombo();
  const ids = Object.keys(cfg.tricks);
  for (let i = 0; i < 80; i++) addTrick(cap, cfg, ids[i % ids.length], 50);
  assert.equal(cap.mult, cfg.combo.multMax, 'the multiplier stops at its maximum');
  assert.ok(cap.tricks.length <= cfg.combo.history, 'the trick list stays short');

  const t = createCombo();
  addTrick(t, cfg, 'ollie', 100);
  assert.ok(!tickCombo(t, cfg, cfg.combo.window - 0.1, false), 'inside the window the chain lives');
  tickCombo(t, cfg, 5, true);
  assert.equal(t.timer, cfg.combo.window, 'airborne / grinding / manual holds the timer');
  assert.ok(!tickCombo(t, cfg, cfg.combo.window - 0.1, false) && tickCombo(t, cfg, 0.2, false), 'rolling without a trick runs it out');
  assert.ok(!tickCombo(createCombo(), cfg, 10, false), 'no chain, no timeout');
  resetCombo(t);
  assert.ok(!isActive(t) && t.mult === 1 && t.base === 0 && t.last === '');
}

// ---- banking, bail, payout
{
  const c = createCombo();
  for (const id of ['ollie', 'grind', 'ollie', 'stairs']) addTrick(c, cfg, id, 100);
  const v = comboValue(c);
  assert.equal(bankedValue(c, cfg, false), v, 'a clean bank is the whole chain');
  assert.equal(bankedValue(c, cfg, true), Math.floor(v * cfg.bank.bailShare), 'a bail of a big chain banks a share');
  const small = createCombo();
  addTrick(small, cfg, 'ollie', 100);
  assert.ok(small.mult < cfg.bank.bailMinMult);
  assert.equal(bankedValue(small, cfg, true), comboValue(small), 'a bail of a small chain loses nothing');
  const pay = payout(cfg, v);
  assert.equal(pay.cents, Math.floor(v * cfg.bank.centsPerPoint));
  assert.equal(pay.xp, Math.floor(v * cfg.bank.xpPerPoint));
  assert.deepEqual(payout(cfg, cfg.bank.minValue - 1), { cents: 0, xp: 0 }, 'a lone small trick pays nothing');
  assert.ok(payout(cfg, cfg.bank.minValue).cents >= 1, 'the smallest paid chain pays a cent');
  assert.ok(hitWall(cfg, 100, 20) && !hitWall(cfg, 100, 80) && !hitWall(cfg, 30, 0), 'a wall hit is a big sudden drop at speed');
}

// ---- geometry
{
  const ts = 16;
  const path = buildPath([[0, 0], [4, 0], [4, 3]], ts);
  assert.equal(path.total, 4 * ts + 3 * ts);
  const o = { s: 0, dist: 0, x: 0, y: 0, ux: 0, uy: 0 };
  projectPath(path, 2 * ts, -5, o);
  near(o.s, 2 * ts, 1e-9, 'projection along the first leg');
  near(o.dist, 5, 1e-9, 'perpendicular distance');
  assert.ok(o.ux === 1 && o.uy === 0);
  projectPath(path, 4 * ts + 6, 2 * ts, o);
  near(o.s, 4 * ts + 2 * ts, 1e-9, 'second leg after the bend');
  assert.ok(o.uy === 1 && o.ux === 0, 'tangent of the second leg');
  near(o.dist, 6, 1e-9, 'distance to the second leg');
  projectPath(path, -20, 0, o);
  assert.equal(o.s, 0, 'before the start it clamps to the end point');
  const p = pointAt(path, 5 * ts, { x: 0, y: 0, ux: 0, uy: 0 });
  near(p.x, 4 * ts, 1e-9, 'point on the bend leg');
  near(p.y, ts, 1e-9, 'point on the bend leg');
  assert.ok(p.uy === 1);
  assert.equal(pointAt(path, 999, p).y, 3 * ts, 'clamped to the end');

  const half = 12;
  const hit = { dir: 0 };
  assert.ok(captureRail(path, half, 50, 2 * ts, 6, 0, hit) && hit.dir === 1, 'right over the rail, along it: caught going forward');
  assert.ok(captureRail(path, half, 50, 2 * ts, 6, Math.PI, hit) && hit.dir === -1, 'against its direction: caught going backward');
  assert.ok(!captureRail(path, half, 50, 2 * ts, 30, 0, hit), 'too far away');
  assert.ok(!captureRail(path, half, 50, 2 * ts, 3, Math.PI / 2, hit), 'across the rail is no grind');
  assert.ok(captureRail(path, half, 50, 2 * ts, 3, (40 * Math.PI) / 180, hit), 'within the angle tolerance');
  assert.ok(!captureRail(path, half, 50, 2 * ts, 3, (60 * Math.PI) / 180, hit), 'beyond the angle tolerance');
  const bench = benchPath({ x: 5, y: 5, w: 3, h: 1 }, ts, 2);
  near(bench.total, 3 * ts - 4, 1e-9, 'a bench edge is its long side minus the insets');
  near(bench.y[0], 5.5 * ts, 1e-9, 'through the middle');
  const tall = benchPath({ x: 5, y: 5, w: 1, h: 3 }, ts, 2);
  assert.ok(tall.x[0] === tall.x[1] && tall.total === bench.total, 'a vertical bench');
  assert.ok(inRect({ x0: 0, y0: 0, x1: 10, y1: 10 }, 9.9, 0) && !inRect({ x0: 0, y0: 0, x1: 10, y1: 10 }, 10, 5));
  assert.ok(facing('right', 0.5, 55) && !facing('right', 2, 55) && facing('up', -Math.PI / 2, 10));
  assert.ok(rampAirtime(cfg, 14, 120) > rampAirtime(cfg, 6, 120) && rampAirtime(cfg, 10, 120) > rampAirtime(cfg, 10, 0), 'ramp airtime grows with height and speed');
  assert.ok(rampAirtime(cfg, 12, 120) > tcfg.ollie.airtime * (1 + tcfg.ollie.speedGain), 'a ramp hangs longer than the longest ollie');
}

// ---- grind state of the skate logic
{
  const s = createSkate();
  startAir(s, 0.6, 20);
  assert.ok(s.air === 0.6 && s.peak === 20);
  let peak = 0;
  for (let i = 0; i < 30; i++) { stepSkate(s, tcfg, DT, { jump: false, manual: false, speed: 100 }); peak = Math.max(peak, s.height); }
  assert.ok(peak > 19, 'a launch peaks at its own height');
  const g = createSkate();
  startAir(g, 0.5, 9);
  stepSkate(g, tcfg, DT, { jump: false, manual: false, speed: 100 });
  startGrind(g);
  assert.ok(g.grind && g.air === 0);
  assert.equal(stepSkate(g, tcfg, DT, { jump: false, manual: true, speed: 100 }), 0, 'a grind ignores the manual');
  assert.equal(g.height, tcfg.grind.lift, 'the rider is lifted onto the rail');
  const f = stepSkate(g, tcfg, DT, { jump: true, manual: false, speed: 100 });
  assert.ok((f & OLLIE) && !g.grind && g.air > 0, 'a jump press ollies off the rail');
  const e = createSkate();
  startGrind(e);
  endGrind(e, tcfg);
  assert.ok(!e.grind && e.height === 0, 'the end of the rail drops the rider');
  assert.equal(LAND & MANUAL_END, 0);
}

// ---- the whole service in node
const noop = new Proxy(function noop() {}, { get: () => noop, apply: () => noop, set: () => true });

function bus() {
  const map = new Map();
  return {
    on(n, f) { (map.get(n) ?? map.set(n, []).get(n)).push(f); },
    emit(n, e) { for (const f of map.get(n) ?? []) f(e); }
  };
}

// A town strip (tile = 16 px): a rail y 5.5 from x 10 to 16, a ramp, stairs, one rider on a straight road at y 88.
function world(objects, riders = 1, perks = [1]) {
  const events = bus();
  const log = [];
  const seen = [];
  for (const n of ['style:banked', 'style:changed', 'style:trick', 'trick:grind', 'trick:ramp', 'trick:ollie', 'trick:manual']) events.on(n, e => seen.push([n, e]));
  const state = { dispatch(name, payload) { log.push([name, payload]); return true; } };
  const players = [];
  const ctx = {
    events, state, maxPlayers: 2, players, res: { scale: 1, inv: 1 }, world: { id: 'check', register() {} },
    map: { tileSize: 16, metersPerTile: 2, objects },
    particles: { emit(n, x, y, o) { ctx.fx.push(n); }, surfaceBurst() {} }, fx: []
  };
  const scene = {
    textures: { exists: () => false, createCanvas: () => ({ getContext: () => noop, refresh() {} }), remove() {} },
    add: { image: () => noop },
    matter: { body: { setPosition(b, p) { b.position.x = p.x; b.position.y = p.y; }, setVelocity(b, v) { b.velocity.x = v.x; b.velocity.y = v.y; } } }
  };
  const boards = { id: 'skateboard', riders: [], isMounted: () => true };
  for (let i = 0; i < riders; i++) {
    const skate = createSkate();
    boards.riders.push({ skate });
    players.push({
      index: i, pinned: false, perks: { trickMultiplier: perks[i] ?? 1 }, sprite: { y: 0, setPosition() {} },
      body: { position: { x: 100, y: 88 + i * 40 }, velocity: { x: 0, y: 0 } },
      move: { heading: 0, velSpeed: 110, speed: 110, vel: { x: 110, y: 0 }, matterVel: { x: 0, y: 0 }, boostMult: 1, surface: 'asphalt' },
      get x() { return this.body.position.x; },
      get y() { return this.body.position.y; }
    });
  }
  boards.launch = (p, air, peak) => startAir(boards.riders[p.index].skate, air, peak);
  boards.beginGrind = p => startGrind(boards.riders[p.index].skate);
  boards.finishGrind = p => endGrind(boards.riders[p.index].skate, tcfg);
  const sys = new TrickSystem(scene, ctx, cfg, [boards]);
  // one frame as entities/Skateboards.js + GameScene do it: intents -> skate logic -> events -> trick system -> kinematics
  const frame = (i, input = {}) => {
    const p = players[i];
    const s = boards.riders[i].skate;
    const m = p.move;
    const flags = stepSkate(s, tcfg, DT, { jump: !!input.jump, manual: !!input.manual, speed: m.velSpeed });
    const info = { player: i, phase: 'start', x: p.x, y: p.y, speed: m.velSpeed };
    if (flags & OLLIE) { info.airtime = s.airTime; events.emit('trick:ollie', info); }
    if (flags & LAND) { events.emit('trick:ollie', { ...info, phase: 'end', airtime: s.airTime }); }
    if (flags & MANUAL_END) events.emit('trick:manual', { ...info, phase: 'end', time: s.manualTime, sweet: s.sweet, reason: s.endReason });
    sys.update(DT);
    if (!s.grind) { // free movement along the heading; the system moves a grinding rider itself
      const v = input.speed ?? m.speed;
      m.velSpeed = m.speed = v;
      p.body.position.x += Math.cos(m.heading) * v * DT;
      p.body.position.y += Math.sin(m.heading) * v * DT;
    }
  };
  return { sys, ctx, events, log, seen, players, boards, frame, kinds: n => seen.filter(e => e[0] === n).map(e => e[1]) };
}

const objects = [
  { type: 'rail', id: 'r1', points: [[10, 5.5], [16, 5.5]], width: 0.5 },
  { type: 'stairs', id: 's1', x: 20, y: 5, w: 3, h: 2, dir: 'right', steps: 4 },
  { type: 'ramp', id: 'p1', x: 25, y: 5, w: 2, h: 2, dir: 'right', height: 12 }
];

// scripted chain: ollie onto the rail, ollie off, stairs jump
{
  const w = world(objects);
  const p = w.players[0];
  const s = w.boards.riders[0].skate;
  const states = new Set();
  let pressed = 0;
  for (let i = 0; i < 400; i++) {
    const jump = (p.x >= 118 && pressed === 0 && (pressed = 1)) || (w.sys.forPlayer(0).rail && w.sys.forPlayer(0).travel > 30 && pressed === 1 && (pressed = 2)) || (p.x >= 322 && s.air === 0 && pressed === 2 && (pressed = 3));
    w.frame(0, { jump: !!jump && s.air === 0 });
    states.add(w.sys.forPlayer(0).state);
    if (pressed === 3 && s.air === 0 && w.sys.forPlayer(0).combo.tricks.length >= 4) break;
  }
  const slot = w.sys.forPlayer(0);
  assert.deepEqual(slot.combo.tricks, ['ollie', 'grind', 'ollie', 'stairs'], `ollie, grind, ollie off, stairs jump (got ${slot.combo.tricks})`);
  for (const st of ['roll', 'ollie', 'grind', 'stairs-jump']) assert.ok(states.has(st), `state ${st} was visited (${[...states]})`);
  assert.ok(slot.combo.mult > cfg.combo.fireMult, `the chain reaches the fire trail (x${slot.combo.mult.toFixed(2)})`);
  assert.ok(w.ctx.fx.includes('spark') && w.ctx.fx.includes('fire'), 'sparks while grinding and the fire trail at high multiplier');
  const grindEnd = w.kinds('trick:grind').find(e => e.phase === 'end');
  assert.equal(grindEnd.reason, 'ollie', 'the grind ended by the jump');
  assert.ok(grindEnd.meters > 0.5, 'and had a length');
  const multBefore = slot.combo.mult;
  const valueBefore = comboValue(slot.combo);
  assert.equal(w.log.length, 0, 'nothing is paid while the chain runs');
  p.move.heading = Math.PI / 2; // turn off the road: nothing else to hit
  for (let i = 0; i < 60 * 3; i++) w.frame(0, {});
  const banked = w.kinds('style:banked');
  assert.equal(banked.length, 1, 'rolling on without a trick banks the chain once');
  assert.deepEqual(banked[0].tricks, ['ollie', 'grind', 'ollie', 'stairs']);
  assert.equal(banked[0].player, 0);
  assert.ok(!banked[0].bailed && banked[0].reason === 'timeout');
  near(banked[0].multiplier, multBefore, 1e-9, 'banked multiplier');
  assert.equal(banked[0].points, valueBefore, 'banked points');
  const earn = w.log.find(e => e[0] === 'wallet.earn');
  const xp = w.log.find(e => e[0] === 'xp.add');
  assert.deepEqual(earn[1], { cents: Math.floor(valueBefore * cfg.bank.centsPerPoint), reason: 'trick' }, 'money through wallet.earn');
  assert.deepEqual(xp[1], { player: 0, amount: Math.floor(valueBefore * cfg.bank.xpPerPoint) }, 'XP through xp.add');
  assert.ok(!isActive(slot.combo), 'the chain is empty after banking');
  const last = w.kinds('style:changed').at(-1);
  assert.deepEqual([last.points, last.multiplier], [0, 1], 'style:changed resets the meter');
  const trickEvents = w.kinds('style:trick').filter(e => e.points > 0).map(e => e.id);
  assert.deepEqual(trickEvents, ['ollie', 'grind', 'ollie', 'stairs'], 'style:trick names every trick');
}

// the chain survives long airtime / grind (the timer holds) but a long idle roll banks
{
  const w = world([]);
  w.frame(0, { jump: true });
  for (let i = 0; i < 40; i++) w.frame(0, {});
  assert.ok(isActive(w.sys.forPlayer(0).combo), 'a single hop lands and starts a chain');
  for (let i = 0; i < 120; i++) w.frame(0, {});
  assert.ok(isActive(w.sys.forPlayer(0).combo), 'a chain inside the window is alive');
  for (let i = 0; i < 60; i++) w.frame(0, {});
  assert.ok(!isActive(w.sys.forPlayer(0).combo), 'after the window it is gone');
  assert.equal(w.kinds('style:banked').length, 0, 'a lone ollie fades without a payout');
  assert.equal(w.log.length, 0);
}

// bail: a wall hit banks a reduced share
{
  const w = world(objects);
  const slot = w.sys.forPlayer(0);
  for (const id of ['ollie', 'grind', 'ollie', 'stairs']) w.sys.score(slot, id, { air: 0.4, meters: 6, steps: 4 });
  const full = comboValue(slot.combo);
  const mult = slot.combo.mult;
  assert.ok(mult >= cfg.bank.bailMinMult);
  w.players[0].move.velSpeed = 110;
  w.frame(0, {});
  w.players[0].move.velSpeed = 12; // the wall
  w.sys.update(DT);
  const banked = w.kinds('style:banked');
  assert.equal(banked.length, 1);
  assert.ok(banked[0].bailed && banked[0].reason === 'wall', 'a wall hit bails');
  assert.equal(banked[0].points, Math.floor(full * cfg.bank.bailShare), 'and banks the reduced share');
  assert.ok(banked[0].points > 0 && banked[0].points < full, 'gently: never zero, never all');
  assert.equal(w.log.find(e => e[0] === 'wallet.earn')[1].cents, Math.floor(banked[0].points * cfg.bank.centsPerPoint));
  // caught
  for (const id of ['ollie', 'grind', 'ollie']) w.sys.score(slot, id, { air: 0.4, meters: 6 });
  w.events.emit('player:caught', { player: 0 });
  assert.equal(w.kinds('style:banked').length, 2, 'being caught banks a share too');
  // a manual that falls over while the multiplier is big
  for (const id of ['ollie', 'grind', 'ollie']) w.sys.score(slot, id, { air: 0.4, meters: 6 });
  w.events.emit('trick:manual', { player: 0, phase: 'end', sweet: 0.1, reason: 'over' });
  assert.equal(w.kinds('style:banked').length, 3, 'a failed manual at a big multiplier bails');
  assert.ok(w.kinds('style:banked')[2].bailed);
  // ... but not at a small one
  w.sys.score(slot, 'ollie', { air: 0.4 });
  w.events.emit('trick:manual', { player: 0, phase: 'end', sweet: 0.1, reason: 'over' });
  assert.equal(w.kinds('style:banked').length, 3, 'a small chain just carries on');
  assert.ok(isActive(slot.combo));
  // a good manual scores
  w.events.emit('trick:manual', { player: 0, phase: 'end', sweet: 1.2, reason: 'slow' });
  assert.equal(slot.combo.last, 'manual', 'a balanced manual is a trick');
  // getting off the board banks in full
  w.events.emit('player:vehicle', { player: 0, id: 'foot' });
  const off = w.kinds('style:banked').at(-1);
  assert.ok(!off.bailed && off.reason === 'off', 'getting off banks the chain cleanly');
  assert.ok(!isActive(slot.combo));
}

// the perk and co-op: independent combos per player
{
  const w = world(objects, 2, [1.35, 1]);
  const a = w.sys.forPlayer(0);
  const b = w.sys.forPlayer(1);
  for (const id of ['ollie', 'grind']) { w.sys.score(a, id, { air: 0.4, meters: 6 }); w.sys.score(b, id, { air: 0.4, meters: 6 }); }
  assert.ok(a.combo.mult > b.combo.mult, 'Mehmet’s multiplier grows faster');
  near(a.combo.mult - 1, (b.combo.mult - 1) * 1.35, 1e-9, 'by the perk');
  w.sys.score(a, 'stairs', { steps: 4 });
  assert.equal(b.combo.tricks.length, 2, 'the other player’s chain is untouched');
  w.events.emit('player:caught', { player: 0 });
  assert.ok(isActive(b.combo) && !isActive(a.combo), 'P1 bails, P2 keeps going');
  assert.deepEqual(w.kinds('style:banked').map(e => e.player), [0]);
  assert.equal(w.players[1].move.heading, 0);
  for (const e of w.kinds('style:changed')) assert.ok(e.player === 0 || e.player === 1);
}

// ramp: a launch with extra airtime, scored as a ramp
{
  const w = world(objects);
  const p = w.players[0];
  p.body.position.x = 25 * 16 - 8;
  p.body.position.y = 5.5 * 16;
  const s = w.boards.riders[0].skate;
  let peak = 0;
  for (let i = 0; i < 90 && !(s.air === 0 && peak > 0); i++) { w.frame(0, {}); peak = Math.max(peak, s.height); }
  assert.ok(peak > 12, `the ramp throws the rider higher than an ollie (${peak.toFixed(1)} px)`);
  const slot = w.sys.forPlayer(0);
  assert.deepEqual(slot.combo.tricks, ['ramp'], 'landing scores the ramp');
  const air = w.kinds('trick:ramp').find(e => e.phase === 'end').airtime;
  assert.ok(air > tcfg.ollie.airtime * 1.5, `with a long airtime (${air.toFixed(2)} s)`);
  assert.ok(w.kinds('trick:ramp').some(e => e.phase === 'start'));
  // slow or sideways: nothing
  const w2 = world(objects);
  w2.players[0].body.position.x = 25 * 16 - 8;
  w2.players[0].body.position.y = 5.5 * 16;
  w2.players[0].move.heading = Math.PI / 2;
  for (let i = 0; i < 5; i++) w2.frame(0, {});
  assert.equal(w2.boards.riders[0].skate.air, 0, 'sideways it is just a plank');
}

// stairs: rolling down rattles and slows, no points; going up does not
{
  const w = world(objects);
  const p = w.players[0];
  p.body.position.x = 19 * 16;
  p.body.position.y = 5.5 * 16;
  let minSpeed = 999;
  let boost = 1;
  for (let i = 0; i < 20; i++) {
    p.move.boostMult = 1;
    w.frame(0, {});
    boost = Math.min(boost, p.move.boostMult);
    minSpeed = Math.min(minSpeed, p.move.speed);
  }
  assert.ok(boost === cfg.stairs.rattleMult, 'the target speed halves on the stairs');
  assert.ok(p.move.speed < 110, 'rolling down stairs slows the board');
  assert.ok(w.kinds('style:trick').some(e => e.id === 'rattle' && e.points === 0), 'a comic rattle, no points');
  assert.ok(!isActive(w.sys.forPlayer(0).combo), 'and no trick');
  const up = world(objects);
  const q = up.players[0];
  q.body.position.x = 22.5 * 16;
  q.body.position.y = 5.5 * 16;
  q.move.heading = Math.PI;
  up.frame(0, {});
  assert.equal(q.move.boostMult, 1, 'the other way is not a rattle');
  assert.ok(up.kinds('style:trick').length === 0);
}

// the stairs jump scales with steps; the ollie off the stairs at slow speed is a plain ollie
{
  const run = (steps, speed) => {
    const w = world([{ type: 'stairs', id: 's', x: 20, y: 5, w: 3, h: 2, dir: 'right', steps }]);
    const p = w.players[0];
    p.body.position.x = 21 * 16;
    p.body.position.y = 5.5 * 16;
    p.move.velSpeed = speed;
    const s = w.boards.riders[0].skate;
    w.frame(0, { jump: true, speed });
    for (let i = 0; i < 80 && (s.air > 0 || i < 2); i++) w.frame(0, { speed });
    return w.sys.forPlayer(0).combo;
  };
  const four = run(4, 110);
  const eight = run(8, 110);
  assert.deepEqual(four.tricks, ['stairs']);
  assert.ok(eight.base - four.base === 4 * cfg.tricks.stairs.perStep, 'twice the steps, more points');
  assert.deepEqual(run(4, 20).tricks, ['ollie'], 'too slow for a stairs jump');
}

// a bench grinds like a rail
{
  const w = world([{ type: 'bench', id: 'b', x: 10, y: 5, w: 4, h: 1 }]);
  const p = w.players[0];
  p.body.position.x = 120;
  p.body.position.y = 5.5 * 16;
  const s = w.boards.riders[0].skate;
  w.frame(0, { jump: true });
  for (let i = 0; i < 80 && !w.sys.forPlayer(0).rail; i++) w.frame(0, {});
  assert.ok(w.sys.forPlayer(0).rail?.id === 'b', 'the bench edge catches an ollie');
  for (let i = 0; i < 90 && w.sys.forPlayer(0).rail; i++) w.frame(0, {});
  assert.ok(!s.grind && w.kinds('trick:grind').some(e => e.phase === 'end' && e.reason === 'end'), 'it rolls off the far end');
  assert.ok(w.sys.forPlayer(0).combo.tricks.includes('grind'));
}

// an ollie that misses the rail or crosses it sideways is just an ollie
{
  const w = world(objects);
  const p = w.players[0];
  p.body.position.x = 130;
  p.body.position.y = 5.5 * 16 + 30;
  w.frame(0, { jump: true });
  for (let i = 0; i < 80; i++) w.frame(0, {});
  assert.equal(w.kinds('trick:grind').length, 0, 'too far from the rail');
  const side = world(objects);
  const q = side.players[0];
  q.body.position.x = 13 * 16;
  q.body.position.y = 5.5 * 16 - 40;
  q.move.heading = Math.PI / 2;
  side.frame(0, { jump: true });
  for (let i = 0; i < 80; i++) side.frame(0, {});
  assert.equal(side.kinds('trick:grind').length, 0, 'across the rail at right angles');
}

// bank spot: rolling through its ring slowly banks a chain cleanly with a bonus; fast, outside or a small chain does not
{
  assert.ok(cfg.bankSpot.maxSpeed > 0 && cfg.bankSpot.bonus > 0, 'bank spot numbers');
  const c = createCombo();
  for (const id of ['ollie', 'grind', 'stairs']) addTrick(c, cfg, id, trickPoints(cfg, id, { air: 0.4, meters: 6, steps: 4 }));
  const spot = { x: 100, y: 100, r: 24 };
  assert.ok(canBankAt(cfg, spot, 110, 100, cfg.bankSpot.maxSpeed, c), 'slow inside the ring');
  assert.ok(!canBankAt(cfg, spot, 110, 100, cfg.bankSpot.maxSpeed + 1, c), 'too fast');
  assert.ok(!canBankAt(cfg, spot, 130, 100, 30, c), 'outside the ring');
  const small = createCombo();
  addTrick(small, cfg, 'ollie', 10);
  assert.ok(!canBankAt(cfg, spot, 100, 100, 30, small), 'a chain below the payout minimum is left to grow');
  assert.equal(bankedValue(c, cfg, false, 0.3), Math.round(comboValue(c) * 1.3), 'the bonus adds to a clean bank');
  assert.equal(bankedValue(c, cfg, true, 0.3), Math.floor(comboValue(c) * cfg.bank.bailShare), 'a bail never gets the bonus');

  const spotObjects = [{ type: 'bank-spot', id: 'bs', x: 6, y: 5, r: 1.5 }]; // centre (104, 88), radius 24 px
  const run = (speed, tricks = ['ollie', 'grind', 'stairs']) => {
    const w = world(spotObjects);
    const slot = w.sys.forPlayer(0);
    for (const id of tricks) w.sys.score(slot, id, { air: 0.4, meters: 6, steps: 4 });
    const value = comboValue(slot.combo);
    w.players[0].body.position.x = 60;
    w.players[0].move.heading = 0;
    w.players[0].move.velSpeed = w.players[0].move.speed = speed;
    for (let i = 0; i < 90; i++) w.frame(0, { speed });
    return { w, slot, value };
  };
  const slow = run(40);
  const banked = slow.w.kinds('style:banked');
  assert.equal(banked.length, 1, 'rolling through slowly banks once');
  assert.ok(!banked[0].bailed && banked[0].reason === 'bank-spot' && banked[0].spot === 'bs' && banked[0].bonus === cfg.bankSpot.bonus, `clean, with the spot and the bonus in the event: ${JSON.stringify(banked[0])}`);
  assert.equal(banked[0].points, Math.round(slow.value * (1 + cfg.bankSpot.bonus)), 'points include the bonus');
  assert.equal(slow.w.log.find(e => e[0] === 'wallet.earn')[1].cents, Math.floor(banked[0].points * cfg.bank.centsPerPoint), 'money by the data rate through wallet.earn');
  assert.ok(slow.w.log.some(e => e[0] === 'xp.add') && !isActive(slow.slot.combo), 'XP too, the chain is empty');
  assert.equal(run(110).w.kinds('style:banked').filter(e => e.reason === 'bank-spot').length, 0, 'at speed the spot does not bank');
  assert.equal(run(40, ['ollie']).w.kinds('style:banked').length, 0, 'a lone ollie is not banked');
}

console.log('check-tricks ok');
