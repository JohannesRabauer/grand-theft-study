// The other chasers (story 7.4): the brain of the Hausmeister and the ticket inspector (chase, catch, hide, lose, calm down, walls), the
// fine, the data against the texts, and that every cause is a real event of the game. The scene wiring (spawning, the dog, drawing) is
// covered by the smoke scenario `grownups`.
// Run: node scripts/check-grownups.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Brain, G, lossFor, validateGrownups } from '../services/grownupLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/grownups.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
for (const l of ['de', 'en']) assert.deepEqual(validateGrownups(cfg, Object.keys(i18n[l])), [], `${l}: ${validateGrownups(cfg, Object.keys(i18n[l])).join(', ')}`);

// ---- every cause is something the game emits
const sources = ['entities/Zones.js', 'entities/Commute.js', 'entities/Doorbells.js'].map(f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
for (const id of ['janitor', 'inspector', 'dog']) {
  const ev = cfg[id].cause.event;
  assert.ok(sources.includes(`'${ev}'`) || sources.includes(`\`${ev}\``) || sources.includes(ev.split(':')[0]), `${id}: ${ev} is emitted somewhere`);
}
const town = load('data/maps/town.json');
assert.ok(town.objects.some(o => o.type === 'turf' && o.id === cfg.janitor.cause.match.id), 'the janitor yard exists');

const open = () => false;
const kid = { x: 200, y: 100 };
const run = (c, seconds, target, hidden, solid = open, dt = 0.05) => {
  const b = new Brain(c, 0, 100);
  const events = [];
  for (let t = 0; t < seconds; t += dt) { const e = b.update(dt, typeof target === 'function' ? target(b, t) : target, typeof hidden === 'function' ? hidden(t) : hidden, solid); if (e) events.push(e); }
  return { b, events };
};

for (const id of ['janitor', 'inspector']) {
  const c = cfg[id];
  // chases and catches a kid who stands still
  let r = run(c, 10, kid, false);
  assert.deepEqual(r.events.slice(0, 1), ['caught'], `${id}: catches a kid who stands still`);
  assert.ok(r.b.caught && r.events.includes('calmed') && r.b.state === G.GONE, `${id}: calms down and is gone after the catch`);
  assert.equal(r.events.filter(e => e === 'caught').length, 1, `${id}: catches once`);
  // a hiding kid is escaped
  r = run(c, 20, { x: 1500, y: 100 }, true);
  assert.ok(!r.b.caught && r.events.join() === 'calmed', `${id}: a kid who is far away and hidden is lost, and he calms down`);
  r = run(c, 4 + c.hideSeconds, (b, t) => ({ x: b.x + 60, y: 100 }), t => t > 0.5);
  assert.ok(r.b.state === G.GIVE_UP || r.b.state === G.GONE, `${id}: hiding long enough ends the chase even when close`);
  assert.ok(!r.b.caught, `${id}: and nobody was caught`);
  // distance: a kid who runs away faster than he walks is lost
  r = run(c, 40, (b, t) => ({ x: b.x + c.loseDistance + 40, y: 100 }), false);
  assert.ok(!r.b.caught && r.events.includes('calmed'), `${id}: outrunning him ends it`);
  // he is slower than a sprinting kid and never faster than a bike bully
  const chase = load('data/vehicles.json');
  assert.ok(c.speed < chase.bike.maxSpeed, `${id}: slower than a bike`);
  // walls: he slides along a wall and never walks through it
  const wall = (x, y) => x > 100 && x < 110;
  r = run(c, 3, { x: 300, y: 100 }, false, wall);
  assert.ok(r.b.x <= 100, `${id}: stopped by the wall at x=${r.b.x.toFixed(1)}`);
  const diag = new Brain(c, 90, 60);
  for (let i = 0; i < 40; i++) diag.update(0.05, { x: 300, y: 200 }, false, wall);
  assert.ok(diag.y > 60 && diag.x <= 100, `${id}: slides along the wall`);
  // while giving up he walks away
  const g = new Brain(c, 100, 100);
  g.enter(G.GIVE_UP);
  g.update(0.5, { x: 150, y: 100 }, false, open);
  assert.ok(g.x < 100, `${id}: walks away from the kids`);
}

// ---- the fine
assert.equal(lossFor(cfg.janitor, 1000), 50);
assert.equal(lossFor(cfg.janitor, 20), 20, 'never more than the family has');
assert.equal(lossFor(cfg.inspector, 1000), 0, 'the inspector fine was paid on the tram');
console.log('grownups ok: janitor and inspector chase, catch once, are escaped by hiding or distance, calm down, respect walls');
