// Asserts the collision category table (AD-3) and that the body factories apply it.
// Run: node scripts/check-collisions.mjs
import assert from 'node:assert/strict';
import { CAT, MASK } from '../physics/categories.js';
import * as bodies from '../physics/bodies.js';
import { contactCounts } from '../tools/stickLogic.js';
import { swingZone, swingHits, makeHits, OBJECT_KINDS } from '../tools/swingLogic.js';
import { readFileSync } from 'node:fs';

const names = Object.keys(CAT);
const bits = Object.values(CAT);
assert.equal(new Set(bits).size, bits.length, 'categories must be unique bits');
for (const b of bits) assert.equal(b & (b - 1), 0, 'category must be a single bit');
assert.deepEqual(Object.keys(MASK), names, 'every category needs a mask');

assert.equal(MASK.PROJECTILE, CAT.PROP | CAT.STATIC, 'PROJECTILE masks only PROP | STATIC');
for (const n of ['PLAYER', 'BULLY', 'NPC', 'ANIMAL', 'SENSOR']) {
  assert.equal(MASK.PROJECTILE & CAT[n], 0, `projectile must not hit ${n}`);
  assert.equal(MASK[n] & CAT.PROJECTILE, 0, `${n} must not collide with projectiles`);
}
// Projectiles never collide with people or animals, whichever side is asked (Matter tests both masks).
for (const n of ['PLAYER', 'BULLY', 'NPC', 'ANIMAL']) {
  const hit = (MASK.PROJECTILE & CAT[n]) !== 0 || (MASK[n] & CAT.PROJECTILE) !== 0;
  assert.equal(hit, false, `a projectile must pass through ${n}`);
}
for (const n of ['PROP', 'STATIC']) {
  assert.ok((MASK.PROJECTILE & CAT[n]) !== 0 && (MASK[n] & CAT.PROJECTILE) !== 0, `projectile must hit ${n}`);
}
assert.equal(MASK.SENSOR, CAT.PLAYER | CAT.BULLY, 'sensor sees only player and bully');

// Collision is symmetric in Matter: A and B collide when each mask contains the other's category.
for (const a of names) for (const b of names) {
  const hit = (MASK[a] & CAT[b]) !== 0 && (MASK[b] & CAT[a]) !== 0;
  const hitOneWay = (MASK[a] & CAT[b]) !== 0 || (MASK[b] & CAT[a]) !== 0;
  assert.equal(hit, hitOneWay, `${a}/${b} masks are not symmetric`);
}

// The throwing stick (story 6.1) flies as a PROJECTILE body; of everything it overlaps, only PROP and STATIC contacts count,
// at any height, and its sensor mask never contains a person or animal category.
const stick = JSON.parse(readFileSync(new URL('../data/tool.json', import.meta.url), 'utf8')).throwingStick;
for (const n of names) {
  for (const h of [0, stick.arcHeight]) {
    for (const perched of [false, true]) {
      if (contactCounts(stick, h, CAT[n], perched)) assert.ok(['PROP', 'STATIC'].includes(n), `the stick must not touch ${n}`);
    }
  }
}
for (const n of ['PLAYER', 'BULLY', 'NPC', 'ANIMAL']) assert.equal(contactCounts(stick, 0, CAT[n], true), false, `the stick passes ${n}`);

// The swung stick (story 6.2) queries objects only: a body of any category but PROP and STATIC, standing right in its zone,
// is never a candidate (the locator is not even asked), and the kinds it can target contain no person or animal.
{
  const zone = swingZone({}, JSON.parse(readFileSync(new URL('../data/tool.json', import.meta.url), 'utf8')).stick, 0, 0, 1, 0);
  for (const n of names) {
    let asked = 0;
    const out = makeHits(3);
    swingHits(out, zone, 'prop', [{ id: n, body: { collisionFilter: { category: CAT[n] } } }], (it, p) => { asked++; p.x = 8; p.y = 0; p.r = 4; return true; });
    const object = n === 'PROP' || n === 'STATIC';
    assert.equal(out.n, object ? 1 : 0, `the stick query ${object ? 'sees' : 'never sees'} ${n}`);
    assert.equal(asked, object ? 1 : 0, `${n}: the locator is ${object ? '' : 'never '}asked`);
  }
  for (const k of ['npc', 'bully', 'player', 'animal', 'dog']) assert.ok(!OBJECT_KINDS.includes(k) && (() => { try { swingHits(makeHits(1), zone, k, [], () => true); return false; } catch { return true; } })(), `a swing cannot target '${k}'`);
}

// Factories, against a fake scene that records what Matter would create.
const made = [];
const make = (opts) => { const body = { collisionFilter: {}, opts }; made.push(body); return body; };
const scene = { matter: { add: {
  circle: (x, y, r, o) => make(o),
  rectangle: (x, y, w, h, o) => make(o)
} } };
const expect = (body, name) => {
  assert.equal(body.collisionFilter.category, CAT[name]);
  assert.equal(body.collisionFilter.mask, MASK[name]);
};
expect(bodies.addCircle(scene, 0, 0, 5, 'PLAYER'), 'PLAYER');
expect(bodies.addRect(scene, 0, 0, 4, 4, 'NPC'), 'NPC');
expect(bodies.addStaticWall(scene, 0, 0, 4, 4), 'STATIC');
expect(bodies.addProp(scene, 0, 0, 4, 4), 'PROP');
expect(bodies.addProjectile(scene, 0, 0, 2), 'PROJECTILE');
const sensor = bodies.addSensor(scene, 0, 0, 4, 4);
expect(sensor, 'SENSOR');
assert.equal(sensor.opts.isSensor, true);

console.log(`collision checks passed (${names.length} categories, ${made.length} bodies)`);
