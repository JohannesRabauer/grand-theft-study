// Pure logic of the swung stick and its world (story 6.2, AD-24): the hit zone and the object-only query (people and animals are
// never candidates), loot tables with a seeded generator, the ding-dong-run timers, pinata hit points, balloon respawn, and the data they read.
// Run: node scripts/check-stick.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAT } from '../physics/categories.js';
import { OBJECT_KINDS, swingZone, zoneDistance, swingHits, makeHits, mulberry32, rollLoot, rollRange, readyToday } from '../tools/swingLogic.js';
import { PHASE, newSequence, startSequence, advanceSequence, doorOpen, stepToward, newPinata, whackPinata, rehangPinata, newBalloon, popBalloon, tickBalloon } from '../entities/stickWorldLogic.js';

const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const load = p => JSON.parse(text(`data/${p}`));
const tool = load('tool.json');
const props = load('props.json');
const world = load('stick-world.json');
const nb = load('neighbors.json');
const catalog = load('object-types.json');
const cfg = tool.stick;

// ---- data
assert.deepEqual(tool.belt, ['slingshot', 'throwing-stick', 'stick'], 'the stick is third on the belt');
assert.ok(cfg.cooldown >= 0.3 && cfg.cooldown <= 0.4 && cfg.reach > 10 && cfg.arcDeg > 60 && cfg.arcDeg < 180 && cfg.maxHits >= 1, 'swing numbers are sane');
assert.ok(props.kinds.box.hp < props.kinds.crate.hp, 'cardboard boxes are weaker than crates');
assert.ok(cfg.damage >= props.kinds.box.hp && cfg.damage < props.kinds.crate.hp, 'one swing smashes a box, two a crate');
for (const k of ['crate', 'box']) assert.ok(props.kinds[k].loot.chance > 0 && props.kinds[k].loot.cents[0] <= props.kinds[k].loot.cents[1], `${k} can hide small coin loot`);
assert.ok(props.kinds.box.debrisFx === 'paper' && !props.kinds.crate.debrisFx, 'boxes shed paper, crates wood');
assert.ok(catalog.types.prop.fields.kind.values.includes('box'), 'the catalog knows box props');
for (const t of ['bush', 'doorbell', 'pinata', 'balloon', 'fair-stall']) assert.ok(catalog.types[t], `catalog type ${t}`);
assert.deepEqual([...catalog.types.balloon.fields.color.values].sort(), Object.keys(world.balloon.colors).sort(), 'catalog and data agree on the balloon colors');
for (const [id, table] of Object.entries(world.bush.tables)) {
  assert.ok(table.every(e => e.weight > 0), `table ${id}: positive weights`);
  assert.deepEqual([...new Set(table.map(e => e.item))].sort(), ['ammo', 'coins', 'homework', 'nothing', 'sticker'], `table ${id} drops coins, ammo, a sticker, the lost homework or nothing`);
  for (const e of table) {
    if (e.item === 'coins') assert.ok(e.cents[0] > 0 && e.cents[0] <= e.cents[1] && e.cents[1] <= 50, `table ${id}: small coin amounts`);
    if (e.item === 'ammo') assert.ok(tool.ammo[e.kind], `table ${id}: ammo kind ${e.kind} exists`);
  }
  assert.equal(table.find(e => e.item === 'homework').once, 'lostHomeworkFound', 'the lost homework drops only until it is found');
}
assert.ok(Object.keys(nb.neighbors).length >= 3 && nb.timing.chaseSeconds >= 5 && nb.timing.chaseSeconds <= 8 && nb.speed < load('vehicles.json').foot.maxSpeed, 'neighbors: about 6 s of chasing at walking speed (slower than a sprint)');

// ---- the hit zone: a sector in front of the player
const zone = swingZone({}, cfg, 100, 100, 1, 0);
assert.ok(zoneDistance(zone, 100 + cfg.reach - 2, 100, 3) >= 0, 'in front, within reach');
assert.equal(zoneDistance(zone, 100 + cfg.reach + 6, 100, 3), -1, 'beyond reach');
assert.equal(zoneDistance(zone, 80, 100, 3), -1, 'behind the player');
assert.equal(zoneDistance(zone, 100, 100 + cfg.reach - 4, 3), -1, 'beside the player, outside the arc');
const ang = (cfg.arcDeg / 2 - 8) * Math.PI / 180;
assert.ok(zoneDistance(zone, 100 + Math.cos(ang) * 16, 100 + Math.sin(ang) * 16, 3) >= 0, 'inside the arc, off the aim line');
assert.ok(zoneDistance(zone, 100, 105, 8) >= 0, 'an object the player stands in always counts');
const up = swingZone({}, cfg, 100, 100, 0, -1);
assert.ok(zoneDistance(up, 100, 90, 3) >= 0 && zoneDistance(up, 110, 100, 3) === -1, 'the zone turns with the aim');

// ---- the query only ever sees objects: people and animals are no candidates
const body = cat => ({ collisionFilter: { category: cat } });
const put = (id, x, y, cat) => ({ id, x, y, body: cat === undefined ? undefined : body(cat) });
let located = [];
const locate = (it, pt) => { located.push(it.id); pt.x = it.x; pt.y = it.y; pt.r = 4; return true; };
const query = (items, kind = 'prop', max = 3) => { const out = makeHits(max); swingHits(out, zone, kind, items, locate); return out; };
assert.deepEqual(OBJECT_KINDS, ['prop', 'bush', 'doorbell', 'pinata'], 'a swing knows four kinds of object');
for (const bad of ['npc', 'bully', 'player', 'animal', 'dog', 'people', 'crowd']) assert.throws(() => query([], bad), /cannot target/, `a swing cannot target '${bad}'`);
for (const name of ['PLAYER', 'BULLY', 'NPC', 'ANIMAL', 'SENSOR', 'PROJECTILE']) {
  located = [];
  const out = query([put(`${name}-1`, 110, 100, CAT[name])]);
  assert.equal(out.n, 0, `a ${name} body right in front of the player is no candidate`);
  assert.deepEqual(located, [], `${name}: the query does not even look at its position`);
}
located = [];
const mixed = query([put('npc', 112, 100, CAT.NPC), put('bully', 108, 100, CAT.BULLY), put('p1', 118, 100, CAT.PLAYER), put('dog', 110, 101, CAT.ANIMAL), put('crate', 116, 100, CAT.PROP), put('wall', 114, 99, CAT.STATIC)]);
assert.deepEqual(mixed.items.slice(0, mixed.n).map(i => i.id), ['wall', 'crate'], 'only the prop and the wall are returned, nearest first');
assert.ok(!located.some(id => ['npc', 'bully', 'p1', 'dog'].includes(id)), 'no person or animal id is ever handed to locate');
assert.equal(query([put('bell', 112, 100)], 'doorbell').n, 1, 'map objects without a body (bushes, doorbells, the pinata) are queried by position');
const many = query([put('a', 120, 100, CAT.PROP), put('b', 106, 100, CAT.PROP), put('c', 112, 101, CAT.PROP), put('d', 109, 99, CAT.PROP)], 'prop', 3);
assert.deepEqual(many.items.slice(0, many.n).map(i => i.id), ['b', 'd', 'c'], 'at most maxHits targets, the nearest ones');
const across = makeHits(3);
swingHits(across, zone, 'bush', [put('bush', 118, 100)], locate);
swingHits(across, zone, 'prop', [put('box', 108, 100, CAT.PROP)], locate);
assert.deepEqual(across.kinds.slice(0, across.n), ['prop', 'bush'], 'kinds are merged by distance');
for (const file of ['tools/Stick.js', 'tools/swingLogic.js']) {
  const src = text(file).replace(/^.*\/\/.*$/gm, ''); // code only, comments may talk about people
  assert.ok(!/crowd|bullies|chase|dogs|\bnpc/i.test(src) && !/ANIMAL|BULLY|NPC|PLAYER/.test(src), `${file} never uses the lists or categories of people and animals`);
}

// ---- loot tables with a seeded generator
const rngA = mulberry32(world.seed);
const rngB = mulberry32(world.seed);
const seqA = Array.from({ length: 8 }, () => rngA());
assert.deepEqual(seqA, Array.from({ length: 8 }, () => rngB()), 'the same seed gives the same numbers');
assert.ok(seqA.every(v => v >= 0 && v < 1) && new Set(seqA).size === 8, 'numbers in [0, 1)');
const table = world.bush.tables.garden;
const count = {};
const rng = mulberry32(7);
for (let i = 0; i < 20000; i++) { const e = rollLoot(table, rng, {}); count[e.item] = (count[e.item] ?? 0) + 1; }
const total = table.reduce((s, e) => s + e.weight, 0);
for (const e of table) assert.ok(Math.abs(count[e.item] / 20000 - e.weight / total) < 0.02, `${e.item} drops about ${Math.round((100 * e.weight) / total)} % of the time (${count[e.item]})`);
const rng2 = mulberry32(9);
for (let i = 0; i < 3000; i++) assert.notEqual(rollLoot(table, rng2, { lostHomeworkFound: true }).item, 'homework', 'a found homework never drops again');
assert.equal(rollLoot(table, () => 0, {}).item, table[0].item, 'rng 0 picks the first entry');
assert.equal(rollLoot(table, () => 0.999999, {}).item, table.at(-1).item, 'rng near 1 picks the last entry');
const lo = Array.from({ length: 500 }, () => rollRange([10, 40], rng));
assert.ok(Math.min(...lo) === 10 && Math.max(...lo) === 40 && lo.every(Number.isInteger), 'coin amounts cover the range, ends included');
assert.equal(readyToday({}, 'bush-b1-day', 3), true);
assert.equal(readyToday({ 'bush-b1-day': 3 }, 'bush-b1-day', 3), false, 'a bush that gave out today is done');
assert.equal(readyToday({ 'bush-b1-day': 3 }, 'bush-b1-day', 4), true, 'the next day it gives again');

// ---- the ding-dong-run
const t = nb.timing;
const seq = newSequence();
assert.equal(seq.phase, PHASE.DONE, 'idle at first');
assert.equal(startSequence(seq), true, 'a ring starts the run');
assert.equal(startSequence(seq), false, 'ringing again while it runs does not start a second one');
assert.equal(advanceSequence(seq, t, t.doorDelay / 2, false), null);
assert.equal(doorOpen(seq), false, 'the door is closed while they wait');
assert.equal(advanceSequence(seq, t, t.doorDelay, false), 'open', 'the door opens and the neighbor steps out');
assert.equal(doorOpen(seq), true);
assert.equal(seq.phase, PHASE.CHASE);
assert.equal(advanceSequence(seq, t, t.chaseSeconds - 0.1, false), null, 'he keeps chasing');
assert.equal(advanceSequence(seq, t, 0.2, false), 'giveup', 'after the chase time he gives up (and laughs)');
assert.equal(seq.phase, PHASE.LAUGH);
assert.equal(advanceSequence(seq, t, t.giveUpSeconds + 0.01, false), 'done');
assert.equal(doorOpen(seq), false, 'the door closes again');
assert.equal(startSequence(seq), false, 'a short cooldown before the next run');
for (let i = 0; i < 100; i++) advanceSequence(seq, t, t.cooldown / 50, false);
assert.equal(startSequence(seq), true, 'ready again afterwards');
advanceSequence(seq, t, t.doorDelay + 0.01, false);
assert.equal(advanceSequence(seq, t, 0.1, true), 'caught', 'reaching a player: just the harmless caught bubble');
assert.equal(seq.phase, PHASE.LAUGH, 'then he laughs instead of chasing on');
assert.equal(advanceSequence(seq, t, 0.1, true), null, 'and does not catch twice');
const mv = { x: 0, y: 0 };
const dist = stepToward(mv, 0, 0, 30, 40, nb.speed, 0.5);
assert.equal(dist, 50);
assert.ok(Math.abs(Math.hypot(mv.x, mv.y) - nb.speed * 0.5) < 1e-9 && Math.abs(mv.x / mv.y - 0.75) < 1e-9, 'a step is speed x dt along the line to the target');
stepToward(mv, 0, 0, 1, 0, nb.speed, 1);
assert.deepEqual({ ...mv }, { x: 1, y: 0 }, 'he stops short of the target instead of overshooting');

// ---- pinata and balloons
const pin = newPinata(4);
assert.deepEqual([whackPinata(pin), whackPinata(pin), whackPinata(pin), whackPinata(pin)], [false, false, false, true], 'it bursts on the fourth whack');
assert.equal(whackPinata(pin), false, 'a burst pinata does nothing more');
assert.equal(pin.burst, true);
rehangPinata(pin);
assert.equal(pin.hp, 4, 'a new one hangs there the next day');
assert.equal(whackPinata(pin), false);
const b = newBalloon();
assert.equal(popBalloon(b, 45), true, 'a hit pops it');
assert.equal(popBalloon(b, 45), false, 'a popped balloon cannot pop again');
assert.equal(tickBalloon(b, 44), false, 'gone for the whole timeout');
assert.equal(tickBalloon(b, 1.5), true, 'then it floats back');
assert.equal(b.popped, false);
assert.equal(tickBalloon(b, 5), false);

console.log('check-stick ok');
