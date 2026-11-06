// Asserts the collision category table (AD-3) and that the body factories apply it.
// Run: node scripts/check-collisions.mjs
import assert from 'node:assert/strict';
import { CAT, MASK } from '../physics/categories.js';
import * as bodies from '../physics/bodies.js';

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
assert.equal(MASK.SENSOR, CAT.PLAYER | CAT.BULLY, 'sensor sees only player and bully');

// Collision is symmetric in Matter: A and B collide when each mask contains the other's category.
for (const a of names) for (const b of names) {
  const hit = (MASK[a] & CAT[b]) !== 0 && (MASK[b] & CAT[a]) !== 0;
  const hitOneWay = (MASK[a] & CAT[b]) !== 0 || (MASK[b] & CAT[a]) !== 0;
  assert.equal(hit, hitOneWay, `${a}/${b} masks are not symmetric`);
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
