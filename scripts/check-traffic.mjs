// Traffic hits without Phaser (AD-23, story 5.6): the data, the hit geometry (front and side hit, the rear grab zone is safe),
// the speed threshold, the launch with wall handling and its arc, the tumble timeline with stun and invulnerability (no chain
// hits), the coin spill, the pedestrians' early step-aside path, and that no hit code can push people or animals (AD-3).
// Run: node scripts/check-traffic.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAT, MASK } from '../physics/categories.js';
import { inRearZone } from '../vehicles/grabLogic.js';
import {
  DONE, FLY, GETUP, IDLE, LANDED, LIE, UP, canBeHit, classifyHit, clearFraction, createHit, flightAt, inPath, planLaunch, relativeSpeed,
  slideFraction, spillCoins, startHit, stepHit
} from '../vehicles/trafficLogic.js';

const read = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cfg = read('data/traffic.json');
const grab = read('data/grab.json');
const routes = read('data/routes.json');
const de = read('i18n/de.json');
const en = read('i18n/en.json');
const bus = grab.targets.bus;
const hit = cfg.kinds.bus;
const R = 5; // player radius
const DT = 1 / 60;
const at = (px, py, h = 0) => classifyHit(100, 100, h, bus.length, bus.width, bus.zone, hit, px, py, R);

// ---- data
assert.ok(cfg.minSpeed > 0 && cfg.minSpeed < routes.routes[0].speed, 'buses are faster than the hit threshold');
assert.ok(cfg.kinds.bus && routes.routes.every(r => cfg.kinds[r.kind]), 'every routed vehicle kind has hit data');
assert.equal(cfg.launch.seconds, 0.7, 'the tumble flight lasts 0.7 s');
assert.equal(cfg.invulnerable, 1.5, 'invulnerable for 1.5 s after the hit');
assert.ok(cfg.stun.seconds >= 2 && cfg.stun.speedMult < 1 && cfg.stun.stamina > 0 && cfg.stun.stamina < 1, 'a stun slows down and drains some stamina');
assert.ok(cfg.coins.cents[1] <= 50 && cfg.coins.cents[0] > 0 && cfg.coins.life === 20, 'at most 50 cents, coins stay 20 s');
for (let i = 1; i <= cfg.lines; i++) {
  assert.ok(cfg.lines >= 3, 'three line variants');
  for (const [name, d] of [['de', de], ['en', en]]) assert.ok(d[`traffic.hit.${i}`], `${name} has hit line ${i}`);
}
for (const k of ['traffic.honk', 'traffic.spill']) assert.ok(de[k] && en[k], `${k} in both languages`);
assert.equal(cfg.horn.sfx, 'bus-horn');

// ---- geometry: a bus at (100, 100) heading east is 56 x 22 px; front x = 128, rear x = 72
assert.equal(at(131, 100), 'front', 'standing in front of the bumper');
assert.equal(at(100, 112), 'side', 'beside the bus (south)');
assert.equal(at(100, 88), 'side', 'beside the bus (north)');
assert.equal(at(125, 111), 'front', 'at the front corner');
assert.equal(at(100, 100), 'side', 'inside the body counts as a side contact');
assert.equal(at(180, 100), '', 'far in front: no contact');
assert.equal(at(100, 130), '', 'far beside: no contact');
assert.equal(at(100, 112 + R + 6), '', 'just outside the side reach');
// the rear grab zone is safe, wherever a skater hangs on
for (const [px, py] of [[72, 100], [60, 100], [40, 100], [28, 100], [66, 108], [66, 92], [74, 100]]) {
  assert.equal(at(px, py), 'rear', `(${px}, ${py}) is in the safe grab zone`);
  assert.ok(inRearZone(100, 100, 0, bus.length, bus.zone, px, py), 'the same point is a grab zone point');
}
assert.equal(at(20, 100), '', 'behind the zone: nothing');
assert.equal(at(81, 100), 'side', 'just past the under-the-back reach: touched');
// rotated bus (heading south): same geometry in its own frame
for (const h of [Math.PI / 2, Math.PI, -Math.PI / 3, 2.1]) {
  const f = (a, l) => [100 + a * Math.cos(h) - l * Math.sin(h), 100 + a * Math.sin(h) + l * Math.cos(h)];
  assert.equal(at(...f(31, 0), h), 'front');
  assert.equal(at(...f(0, 12), h), 'side');
  assert.equal(at(...f(-40, 0), h), 'rear');
  assert.equal(at(...f(-40, 8), h), 'rear');
  assert.equal(at(...f(90, 0), h), '');
}
// every rear-zone sample is safe, every sample of the hit box is not
for (let a = -80; a <= 70; a += 2) {
  for (let l = -20; l <= 20; l += 2) {
    const k = at(100 + a, 100 + l);
    assert.equal(k === 'rear', inRearZone(100, 100, 0, bus.length, bus.zone, 100 + a, 100 + l), `rear classification equals the grab zone at ${a},${l}`);
  }
}

// ---- speed: relative to the player
assert.equal(relativeSpeed(145, 0, 0, 0), 145, 'a standing player meets the bus speed');
assert.ok(relativeSpeed(145, 0, 145, 0) < cfg.minSpeed, 'riding along at the bus speed: no hit');
assert.ok(relativeSpeed(145, 0, 0, 120) > cfg.minSpeed, 'riding into the side hits');
assert.ok(relativeSpeed(10, 0, 0, 0) < cfg.minSpeed, 'a slowly touching bus does not hit');

// ---- pedestrians step aside early
const react = cfg.npcReact;
assert.ok(inPath(100, 100, 0, bus.length, bus.width, react, 170, 100), 'a pedestrian 70 px ahead is in the path');
assert.ok(inPath(100, 100, 0, bus.length, bus.width, react, 130, 125), 'a little beside the lane too');
assert.ok(!inPath(100, 100, 0, bus.length, bus.width, react, 100, 150), 'far to the side: not');
assert.ok(!inPath(100, 100, 0, bus.length, bus.width, react, 60, 100), 'behind: not');
assert.ok(!inPath(100, 100, 0, bus.length, bus.width, react, 260, 100), 'far ahead: not yet');

// ---- launch
const free = () => false;
assert.equal(clearFraction(0, 0, 40, 0, 6, 5, free), 1);
assert.equal(clearFraction(0, 0, 40, 0, 6, 5, x => x >= 20), (2) / 7, 'stops before the wall (pad included)');
const plan = { dx: 0, dy: 0, side: 0 };
planLaunch(cfg, 0, 3, 100, 100, free, plan);
assert.ok(Math.abs(plan.dx - cfg.launch.forward) < 1e-9 && Math.abs(plan.dy - cfg.launch.side) < 1e-9 && plan.side === 1, 'thrown ahead and to the south side the player was on');
planLaunch(cfg, 0, -3, 100, 100, free, plan);
assert.ok(plan.dy < 0 && plan.side === -1, 'north side');
assert.ok(Math.abs(plan.dy) > bus.width / 2 + R, 'lands clear of the lane the bus is driving in');
planLaunch(cfg, 0, -3, 100, 100, (x, y) => y < 100 - 8, plan);
assert.ok(plan.dy > 0 && plan.side === 1, 'a wall on that side: thrown to the other side');
planLaunch(cfg, 0, 3, 100, 100, (x, y) => x > 110 || y > 108 || y < 92, plan);
assert.ok(Math.hypot(plan.dx, plan.dy) < Math.hypot(cfg.launch.forward, cfg.launch.side), 'walls everywhere: shortened');
assert.ok(Math.abs(plan.dy) <= 8 && plan.dx <= 10, 'and never through the wall');
planLaunch(cfg, Math.PI / 2, 0, 100, 100, free, plan); // bus heading south, player exactly on the centre line
assert.ok(plan.dy > 0, 'along the bus heading');
const pose = { x: 0, y: 0, lift: 0, spin: 0 };
planLaunch(cfg, 0, 3, 100, 100, free, plan);
flightAt(0, 100, 100, plan, cfg.launch, pose);
assert.deepEqual([pose.x, pose.y, pose.lift, pose.spin], [100, 100, 0, 0], 'starts at the hit');
flightAt(1, 100, 100, plan, cfg.launch, pose);
assert.ok(Math.abs(pose.x - 100 - plan.dx) < 1e-9 && Math.abs(pose.y - 100 - plan.dy) < 1e-9 && Math.abs(pose.lift) < 1e-9, 'ends at the plan with no height');
assert.ok(Math.abs(pose.spin - cfg.launch.spins * 2 * Math.PI) < 1e-9, 'with the full spin');
flightAt(0.5, 100, 100, plan, cfg.launch, pose);
assert.ok(Math.abs(pose.lift - cfg.launch.peak) < 1e-9, 'highest in the middle');
planLaunch(cfg, 0, -3, 100, 100, free, plan);
flightAt(1, 100, 100, plan, cfg.launch, pose);
assert.ok(pose.spin < 0, 'spins the way it is thrown');
let prev = -1;
for (let u = 0; u <= 1.0001; u += 0.05) { const s = slideFraction(Math.min(1, u)); assert.ok(s >= prev, 'the slide only goes forward'); prev = s; }
assert.equal(slideFraction(1), 1);

// ---- tumble timeline, stun, invulnerability: no chain hits
const h = createHit();
assert.ok(canBeHit(h));
startHit(h);
assert.ok(!canBeHit(h) && h.phase === FLY);
let t = 0;
const seen = [];
let landed = 0;
let upAt = 0;
let doneAt = 0;
while (h.phase !== IDLE) {
  const f = stepHit(h, cfg, DT);
  t += DT;
  if (f & LANDED) { landed = t; seen.push('landed'); }
  if (f & UP) { upAt = t; seen.push('up'); }
  if (f & DONE) { doneAt = t; seen.push('done'); }
}
assert.deepEqual(seen, ['landed', 'up', 'done'], 'phases in order, once each');
assert.ok(Math.abs(landed - 0.7) < 0.03 && Math.abs(upAt - (0.7 + cfg.lie)) < 0.03 && Math.abs(doneAt - (0.7 + cfg.lie + cfg.getUp)) < 0.03, 'timeline fly 0.7 s, lie, get up');
assert.ok(Math.abs(h.stun - (cfg.stun.seconds - cfg.getUp)) < 0.03 && h.safe === cfg.invulnerable, 'the slow stun runs after getting up, then the safe window starts');
assert.ok(!canBeHit(h), 'not hit-able while invulnerable');
let safeFrames = 0;
while (!canBeHit(h)) { stepHit(h, cfg, DT); safeFrames++; }
assert.ok(Math.abs(safeFrames * DT - 1.5) < 0.03, 'invulnerable for 1.5 s');
assert.ok(h.stun > 0 && h.stun < cfg.stun.seconds - cfg.getUp - 1.4, 'the stun outlasts the invulnerability a bit');
// a bus overlapping the player all the time hits only when the player can be hit
const chain = createHit();
let hits = 0;
for (let i = 0; i < 60 * 20; i++) {
  stepHit(chain, cfg, DT);
  if (canBeHit(chain)) { hits++; startHit(chain); }
}
const cycle = 0.7 + cfg.lie + cfg.getUp + cfg.invulnerable;
assert.ok(Math.abs(hits - Math.ceil(20 / cycle)) <= 1, `a permanent overlap hits once per ${cycle.toFixed(2)} s, never in between (${hits})`);
// a long frame passes several phases at once
const big = createHit();
startHit(big);
const flags = stepHit(big, cfg, 10);
assert.equal(flags, LANDED | UP | DONE, 'a huge step finishes the whole tumble');
assert.equal(big.phase, IDLE);

// ---- coins
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let i = 0; i < 300; i++) {
  const money = Math.floor(rand() * 120);
  const { total, parts } = spillCoins(cfg, money, rand);
  assert.ok(total <= money && total <= cfg.coins.cents[1], 'never more than the pocket or the maximum');
  assert.equal(parts.reduce((a, b) => a + b, 0), total, 'the coins add up to the loss');
  if (money >= cfg.coins.cents[1]) assert.ok(total >= cfg.coins.cents[0] && parts.length >= cfg.coins.count[0] && parts.length <= cfg.coins.count[1], 'a full pocket loses the usual amount in 3 to 5 coins');
  assert.ok(parts.every(c => c >= 1), 'every coin is worth something');
}
assert.deepEqual(spillCoins(cfg, 0, rand), { total: 0, parts: [] }, 'an empty pocket spills nothing');
assert.equal(spillCoins(cfg, 3, rand).total, 3, 'a nearly empty pocket spills what it has');

// ---- AD-3: traffic never pushes people or animals
assert.equal(MASK.SENSOR & (CAT.NPC | CAT.ANIMAL), 0, 'the vehicle bodies are sensors that do not even see pedestrians or animals');
const code = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '')).join('\n');
for (const f of ['entities/Traffic.js', 'vehicles/trafficLogic.js']) {
  const src = code(f);
  assert.ok(!/applyForce|\.force\b|Body\.apply|setVelocity\(\s*(?!player\.body)\w+\.body/.test(src), `${f}: applies no force`);
  assert.ok(!/ctx\.(crowd|chase|dogs|npcs)|bullies|\.bullies|NeighborDogs/.test(src), `${f}: never looks at pedestrians, animals, bullies or chasers`);
}
const traffic = code('entities/Traffic.js');
assert.ok([...traffic.matchAll(/matter\.body\.\w+\(([^,)]+)/g)].every(m => /player\.body|^\s*player\.body/.test(m[1])), 'Traffic only moves player bodies');
assert.ok(/for \(const player of players\)/.test(traffic), 'hits are tested per player');
const crowd = code('ai/CrowdDirector.js');
assert.ok(/traffic\.threat\([^)]*\);[\s\S]{0,120}this\.react\(n, 1, bus/.test(crowd), 'pedestrians react to a bus through the existing REACT state only');

console.log('traffic ok: geometry, rear safe zone, launch, tumble timers, coins, AD-3');
