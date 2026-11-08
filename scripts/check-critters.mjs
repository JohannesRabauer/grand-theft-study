// The small animals (story 12.5): the little state machine of pigeons, cats and ducks (scatter on approach, fly away and come back, feeding),
// the data, the map objects and that nothing about them can be hit (no physics body in the code). The scene wiring runs in the smoke scenario
// `critters`.
// Run: node scripts/check-critters.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C, Critter, validateCritters } from '../services/critterLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/critters.json');
const town = load('data/maps/town.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
assert.deepEqual(validateCritters(cfg), [], validateCritters(cfg).join(', '));
for (const l of ['de', 'en']) for (const k of ['critter.feed', 'critter.fed']) assert.ok(i18n[l][k], `${l}: ${k}`);

// ---- the map
const crit = town.objects.filter(o => o.type === 'critter');
for (const k of ['pigeon', 'cat', 'duck']) assert.ok(crit.filter(o => o.kind === k).length >= 2, `at least two ${k}s`);
for (const o of crit.filter(o => o.kind === 'cat')) assert.equal(town.legend[town.rows[o.y][o.x]], 'fence', `${o.id} sits on a fence`);

// ---- a pigeon scatters when someone comes close and returns later
const p = new Critter('pigeon', cfg.pigeon, 100, 100, 1);
assert.equal(p.update(0.1, 200, 1, 0), null, 'it pecks while nobody is near');
assert.equal(p.update(0.1, cfg.pigeon.scatterRadius - 1, 1, 0), 'scatter', 'it takes off when someone comes within the radius');
assert.equal(p.state, C.FLEE);
let t = 0;
while (p.state === C.FLEE && t < 5) { p.update(0.1, 10, 1, 0); t += 0.1; }
assert.ok(p.lift > 0 && p.x > 100, 'it flew up and away from the threat');
assert.equal(p.state, C.AWAY);
assert.ok(!p.visible, 'out of sight');
for (let i = 0; i < 60; i++) p.update(0.1, 5, 1, 0);
assert.equal(p.state, C.AWAY, 'it stays away while someone is still close');
for (let i = 0; i < 200 && p.state !== C.IDLE; i++) p.update(0.1, 500, 1, 0);
assert.equal(p.state, C.IDLE, 'it lands again when the coast is clear');
assert.ok(p.x === 100 && p.y === 100 && p.lift === 0, 'at its home spot');

// ---- a cat runs along the ground, not into the air
const cat = new Critter('cat', cfg.cat, 50, 50, 2);
assert.equal(cat.update(0.1, cfg.cat.scatterRadius - 1, 0, 1), 'scatter');
for (let i = 0; i < 20; i++) cat.update(0.1, 10, 0, 1);
assert.equal(cat.lift, 0, 'cats do not fly');

// ---- ducks swim, never scatter, and gather when fed
const d = new Critter('duck', cfg.duck, 200, 200, 3);
for (let i = 0; i < 50; i++) assert.equal(d.update(0.1, 0, 1, 0), null, 'ducks ignore people close by');
assert.ok(d.x !== 200 || d.y !== 200, 'they swim about');
assert.ok(Math.hypot(d.x - 200, d.y - 200) <= cfg.duck.swim * 1.2, 'but stay near their spot');
assert.ok(d.feed(230, 200), 'a duck can be fed');
assert.ok(!d.feed(230, 200), 'but not twice at once');
assert.ok(d.x > 200, 'it swims towards the kid');
let ev = null;
for (let i = 0; i < 100 && !ev; i++) ev = d.update(0.1, 0, 1, 0);
assert.equal(ev, 'fed');
assert.ok(!new Critter('pigeon', cfg.pigeon, 0, 0, 4).feed(1, 1), 'only ducks are fed');

// ---- never hittable: the code makes no physics body for them
const src = readFileSync(new URL('../entities/Critters.js', import.meta.url), 'utf8') + readFileSync(new URL('../services/critterLogic.js', import.meta.url), 'utf8');
assert.ok(!/addCircle|matter|bodies\.js|collisionFilter/i.test(src.replace(/\/\/.*$/gm, '')), 'no body, no collision filter: nothing can hit a critter');
console.log(`critters ok: ${crit.length} animals, scatter and return, cats on fences, duck feeding, no bodies`);
