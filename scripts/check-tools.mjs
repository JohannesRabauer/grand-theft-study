// Pure logic of the throwing stick and the dog fetch (story 6.1, AD-24): range with power, perk and wind, which contacts count,
// where a stick comes to rest, who may pick it up, the fetch decision FSM, and the data they read.
// Run: node scripts/check-tools.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAT } from '../physics/categories.js';
import { flightPoint } from '../tools/Slingshot.js';
import { throwRange, throwParams, heightAt, contactCounts, settle, canPickup, stickStatus } from '../tools/stickLogic.js';
import { DogFetch, F } from '../ai/DogFetch.js';

const load = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const tool = load('tool.json');
const props = load('props.json');
const dogs = load('dogs.json');
const characters = load('characters.json');
const cfg = tool.throwingStick;

// ---- data
assert.deepEqual(tool.belt, ['slingshot', 'throwing-stick', 'stick'], 'the belt lists slingshot, throwing stick, then the close-range stick');
for (const k of ['frisbee', 'kite-stuck']) {
  const kind = props.kinds[k];
  assert.ok(kind && kind.texture && kind.knock > 0 && kind.perchFly > 0, `${k} is a prop kind that falls off its perch`);
}
assert.ok(cfg.maxRange > cfg.minRange && cfg.lifeMax > cfg.lifeMin && cfg.mass > 0 && cfg.drag >= 0 && cfg.drag < 1 && cfg.arcHeight > cfg.clearHeight, 'throw numbers are sane');
const mehmet = characters.characters.find(c => c.id === 'mehmet');
assert.ok(mehmet.perks.stickThrowRange > characters.perkDefaults.stickThrowRange, 'Mehmet throws further');
const dogKind = dogs.kinds['neighbor-dog'];
assert.ok(dogs.pool >= 1 && dogKind.fetch.range > dogKind.fetch.pickup && dogKind.fetch.dropDistance > cfg.pickupRadius, 'dog data: the drop spot lies just outside the thrower\'s pickup reach');

// ---- range: power, perk
const calm = { x: 0, y: 0 };
assert.equal(throwRange(cfg, 0, 1), cfg.minRange);
assert.equal(throwRange(cfg, 1, 1), cfg.maxRange);
assert.ok(throwRange(cfg, 0.5, 1) > throwRange(cfg, 0.3, 1), 'more power, more distance');
assert.equal(throwRange(cfg, 1, mehmet.perks.stickThrowRange), cfg.maxRange * mehmet.perks.stickThrowRange, 'the perk multiplies the distance');

// ---- flight lands where the range says in calm air, and wind pushes it
const land = (power, perk, wind) => {
  const par = throwParams({}, cfg, power, perk, wind);
  return flightPoint({}, 0, 0, 1, 0, par.speed, par.wx, par.wy, par.life);
};
assert.ok(Math.abs(land(1, 1, calm).x - cfg.maxRange) < 1e-6 && Math.abs(land(1, 1, calm).y) < 1e-6, 'calm air: the stick lands at the range');
assert.ok(land(1, 1.4, calm).x > land(1, 1, calm).x * 1.39, 'perk 1.4 flies 40 % further');
const side = land(1, 1, { x: 0, y: 1 });
assert.ok(side.y > 20 && Math.abs(side.x - cfg.maxRange) < 1e-6, `a crosswind drifts it sideways (${side.y.toFixed(1)} px)`);
assert.ok(land(1, 1, { x: 1, y: 0 }).x > cfg.maxRange && land(1, 1, { x: -1, y: 0 }).x < cfg.maxRange, 'a tail wind adds, a head wind takes away');
const heavy = throwParams({}, { ...cfg, mass: cfg.mass * 2 }, 1, 1, { x: 0, y: 1 });
assert.ok(Math.abs(heavy.wy) < Math.abs(throwParams({}, cfg, 1, 1, { x: 0, y: 1 }).wy), 'a heavier stick feels less wind');
assert.ok(Math.abs(heightAt(cfg, 0) - cfg.startHeight) < 1e-9 && heightAt(cfg, 0.5) > cfg.arcHeight * 0.9 && heightAt(cfg, 1) < 1e-9, 'long arc: up, then down to the ground');

// ---- contacts: only PROP and STATIC, a high arc passes over what lies on the ground
const high = cfg.arcHeight;
for (const name of ['PLAYER', 'BULLY', 'NPC', 'ANIMAL', 'SENSOR', 'PROJECTILE']) {
  for (const h of [0, high]) for (const perched of [false, true]) assert.equal(contactCounts(cfg, h, CAT[name], perched), false, `a stick never touches ${name}`);
}
assert.equal(contactCounts(cfg, 0, CAT.PROP, false), true, 'low: knocks a ball or cone on the ground');
assert.equal(contactCounts(cfg, high, CAT.PROP, false), false, 'high: flies over props on the ground');
assert.equal(contactCounts(cfg, high, CAT.PROP, true), true, 'high: still hits a frisbee stuck up in a tree');
assert.equal(contactCounts(cfg, 0, CAT.STATIC, false), true, 'low: stops at a wall');
assert.equal(contactCounts(cfg, high, CAT.STATIC, false), false, 'high: flies over walls');

// ---- settling: a stick that ends in a wall rests on the last free point of its path
const path = { sx: 0, sy: 0, dx: 1, dy: 0, speed: 100, wx: 0, wy: 0 };
const wallFrom = 60;
const rest = settle({}, path, 1, x => x < wallFrom);
assert.ok(rest.x < wallFrom && rest.x > wallFrom - 100 / 24 - 1e-9, `rests just before the wall (${rest.x.toFixed(1)})`);
assert.deepEqual(settle({}, path, 1, () => false), { x: 0, y: 0 }, 'nowhere free: back at the thrower');
assert.equal(settle({}, path, 1, () => true).x, 100, 'free ground: where the throw ended');

// ---- pickup: only the owner, only a landed stick, only close, never while caught
const stick = { owner: 0, state: 'landed', x: 100, y: 100, dog: null };
const me = { index: 0, x: 100 + cfg.pickupRadius - 1, y: 100, pinned: false };
assert.equal(canPickup(stick, me, cfg), true);
assert.equal(canPickup(stick, { ...me, x: 100 + cfg.pickupRadius + 1 }, cfg), false, 'too far');
assert.equal(canPickup(stick, { ...me, index: 1 }, cfg), false, 'somebody else\'s stick stays');
assert.equal(canPickup(stick, { ...me, pinned: true }, cfg), false, 'a caught player cannot');
for (const state of ['held', 'flying', 'carried']) assert.equal(canPickup({ ...stick, state }, me, cfg), false, `not while ${state}`);
assert.deepEqual(['held', 'flying', 'landed', 'carried'].map(state => stickStatus({ state })), ['ready', 'flying', 'ground', 'dog']);

// ---- dog fetch FSM
const log = [];
const owner = { x: 0, y: 0 };
const sticks = [];
const hooks = {
  sticks: () => sticks,
  owner: () => owner,
  take: s => { s.state = 'carried'; log.push('take'); },
  drop: (s, x, y) => { s.state = 'landed'; s.x = x; s.y = y; log.push('drop'); },
  emit: name => log.push(name)
};
const fcfg = dogKind.fetch;
const run = (fetch, dog, seconds, chasing = true) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    const w = fetch.update(dog, 1 / 60, chasing);
    dog.x += (w.dx * w.speed) / 60;
    dog.y += (w.dy * w.speed) / 60;
    if (fetch.stick?.state === 'carried') { fetch.stick.x = dog.x; fetch.stick.y = dog.y; }
  }
};

let dog = { x: 120, y: 0 };
let f = new DogFetch(fcfg, hooks);
const s1 = { owner: 0, state: 'landed', x: 40, y: 0, dog: null };
sticks.push(s1);
run(f, dog, 0.1, false);
assert.equal(f.phase, F.IDLE, 'a calm dog ignores sticks');
run(f, dog, 0.1, true);
assert.equal(f.phase, F.GO, 'a chasing dog goes for a landed stick in range');
assert.equal(s1.dog, dog, 'and claims it');
for (let i = 0; i < 600 && f.phase !== F.HAPPY; i++) run(f, dog, 1 / 60);
assert.deepEqual(log.slice(0, 3), ['start', 'take', 'pickup'], 'start, grab, pickup');
const dropped = Math.hypot(s1.x - owner.x, s1.y - owner.y);
assert.ok(log.includes('done') && s1.state === 'landed' && dropped <= fcfg.dropDistance + 1e-6 && dropped > cfg.pickupRadius * 0.5, `the stick is dropped near the thrower (${dropped.toFixed(1)} px)`);
assert.equal(f.phase, F.HAPPY, 'the dog celebrates');
run(f, dog, fcfg.happy + 0.2, false); // the dog glue turns CALM at the end, so it no longer chases
assert.equal(f.phase, F.IDLE, 'then calms down');
assert.equal(log.at(-1), 'end');
assert.equal(s1.dog, null, 'the claim is gone');

// out of range, claimed, or already in a hand: nothing to fetch
dog = { x: 0, y: 0 };
f = new DogFetch(fcfg, hooks);
sticks[0] = { owner: 0, state: 'landed', x: fcfg.range + 20, y: 0, dog: null };
run(f, dog, 0.2);
assert.equal(f.phase, F.IDLE, 'a stick out of range is left alone');
sticks[0] = { owner: 0, state: 'landed', x: 30, y: 0, dog: {} };
run(f, dog, 0.2);
assert.equal(f.phase, F.IDLE, 'a stick another dog is after is left alone');
sticks[0] = { owner: 0, state: 'held', x: 30, y: 0, dog: null };
run(f, dog, 0.2);
assert.equal(f.phase, F.IDLE, 'a stick in the owner\'s hand is no target');

// the owner picks the stick up first: the dog drops out of it
log.length = 0;
dog = { x: 100, y: 0 };
f = new DogFetch(fcfg, hooks);
const s2 = { owner: 0, state: 'landed', x: 20, y: 0, dog: null };
sticks[0] = s2;
run(f, dog, 0.3);
assert.equal(f.phase, F.GO);
s2.state = 'held';
run(f, dog, 0.1);
assert.equal(f.phase, F.IDLE, 'owner was faster');
assert.deepEqual(log, ['start', 'end'], 'no pickup, no celebration');
assert.equal(s2.dog, null);

// two dogs, one stick: the first to look claims it, the other stays idle
const d1 = { x: 50, y: 0 };
const d2 = { x: 60, y: 0 };
const f1 = new DogFetch(fcfg, hooks);
const f2 = new DogFetch(fcfg, hooks);
const s3 = { owner: 0, state: 'landed', x: 30, y: 0, dog: null };
sticks[0] = s3;
f1.update(d1, 1 / 60, true);
f2.update(d2, 1 / 60, true);
assert.ok(f1.active && !f2.active && s3.dog === d1, 'only one dog fetches a stick');

// a fetch that takes too long (a blocked dog) is given up and releases everything
const f4 = new DogFetch(fcfg, hooks);
const blocked = { x: 100, y: 0 };
sticks[0] = { owner: 0, state: 'landed', x: 20, y: 0, dog: null };
let frames = 0;
for (f4.update(blocked, 1 / 60, true); f4.active && frames < 60 * 30; frames++) f4.update(blocked, 1 / 60, true); // never moves
assert.ok(frames > 60 * (fcfg.giveUp - 1) && frames < 60 * (fcfg.giveUp + 1), `gives up after about ${fcfg.giveUp} s (${frames} frames)`);
assert.equal(sticks[0].dog, null);

console.log('tool checks passed (stick range/wind/perk, contacts, settling, pickup, dog fetch FSM)');
