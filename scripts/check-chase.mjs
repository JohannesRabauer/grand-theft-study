// Checks the chase AI that does not need Phaser: grid A* on the real town map, the per-frame
// request budget, line of sight, and the Ärger level thresholds.
// Run: node scripts/check-chase.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pathfinder } from '../ai/Pathfinding.js';
import { ChaseLevel } from '../ai/ChaseLevel.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const map = load('maps/town.json');
const surfaces = load('surfaces.json');
const chase = load('chase.json');
const ts = map.tileSize;
const nav = new Pathfinder(map, surfaces, chase.nav);
const px = (t) => (t + 0.5) * ts;
const obj = (type, id) => map.objects.find(o => o.type === type && o.id === id);

// Path home -> school: exists, every tile walkable, steps adjacent, no diagonal corner cutting.
const home = obj('spawn', 'player');
const school = obj('goal', 'school');
const out = new Int32Array(chase.nav.maxPath);
const n = nav.findPath(px(home.x), px(home.y), px(school.x + 1), px(school.y + 1), out);
assert.ok(n > 10, 'a path from home to school exists');
for (let i = 0; i < n; i++) {
  const x = out[i] % nav.cols;
  const y = Math.floor(out[i] / nav.cols);
  assert.ok(!nav.isSolid(x, y), `path tile ${x},${y} is walkable`);
  if (i === 0) continue;
  const px0 = out[i - 1] % nav.cols;
  const py0 = Math.floor(out[i - 1] / nav.cols);
  assert.ok(Math.abs(x - px0) <= 1 && Math.abs(y - py0) <= 1, 'consecutive tiles are neighbours');
  if (x !== px0 && y !== py0) assert.ok(!nav.isSolid(x, py0) && !nav.isSolid(px0, y), 'no corner cutting');
}

// The path really goes around walls: a straight line home -> school is blocked, the path is longer.
const straight = Math.hypot(school.x - home.x, school.y - home.y);
assert.ok(!nav.lineClear(px(home.x), px(home.y), px(school.x), px(school.y)), 'straight line to school is blocked');
assert.ok(n > straight, `path (${n} tiles) detours around walls (straight ${straight.toFixed(0)})`);

// Goals inside walls snap to the nearest walkable tile; the outside of the map has no path.
assert.ok(nav.findPath(px(home.x), px(home.y), px(0), px(0), out) > 0, 'wall goal snaps to a walkable neighbour');
assert.equal(nav.findPath(px(home.x), px(home.y), -500, -500, out), 0, 'unreachable goal gives no path');
for (const h of map.objects.filter(o => o.type === 'hiding')) {
  assert.ok(nav.snap(h.x, h.y) >= 0, `hiding spot ${h.id} is reachable by bullies`);
}
for (const s of map.objects.filter(o => o.type === 'bully-spawn')) {
  assert.ok(nav.findPath(px(s.x), px(s.y), px(home.x), px(home.y), out) > 0, `spawn ${s.id} can reach the player area`);
}

// Line of sight: wall blocks, open ground does not, a ray inside one tile is clear.
assert.ok(nav.lineClear(px(home.x), px(home.y), px(home.x) + 20, px(home.y)), 'open ground is clear');
assert.ok(!nav.lineClear(px(1), px(1), px(0), px(0)), 'ray into the border wall is blocked');

// Budget: more requests than the budget are spread over frames, each owner queued once.
const owners = Array.from({ length: 5 }, () => ({ pathPending: false, solved: 0, solvePath() { this.solved++; } }));
owners.forEach(o => { nav.request(o); nav.request(o); });
assert.equal(nav.qCount, 5, 'each owner is queued once');
nav.update();
assert.equal(nav.solvedLastUpdate, chase.nav.budget, 'budget limits solves per frame');
assert.equal(owners.filter(o => o.solved).length, chase.nav.budget);
nav.update(); nav.update();
assert.ok(owners.every(o => o.solved === 1) && nav.qCount === 0, 'all requests served within a few frames');

// Performance: full-map search home -> school.
const runs = 300;
for (let i = 0; i < 30; i++) nav.findPath(px(home.x), px(home.y), px(school.x + 1), px(school.y + 1), out); // JIT warm-up
const times = [];
const t0 = performance.now();
for (let i = 0; i < runs; i++) {
  const a = performance.now();
  nav.findPath(px(home.x), px(home.y), px(school.x + 1), px(school.y + 1), out);
  times.push(performance.now() - a);
}
const avg = (performance.now() - t0) / runs;
times.sort((x, y) => x - y);
const worst = times[Math.floor(runs * 0.99)]; // p99: single OS/GC spikes do not count
assert.ok(worst < 2, `A* p99 ${worst.toFixed(2)} ms must stay under 2 ms`);

// Ärger level thresholds.
const log = [];
const mk = (enabled = true) => new ChaseLevel(chase.level, enabled, (level, reason) => log.push(`${level}:${reason}`));
let lv = mk();
lv.turf(true);
assert.equal(lv.level, 1, 'entering turf -> level 1');
lv.update(chase.level.turfSecondsPerLevel - 0.1);
assert.equal(lv.level, 1, 'not yet');
lv.update(0.2);
assert.equal(lv.level, 2, 'staying in turf -> level 2');
lv.update(100);
assert.equal(lv.level, 2, 'level is capped at 2');

lv = mk();
lv.bump();
assert.equal(lv.level, 1, 'bump raises by one');
lv.bump();
assert.equal(lv.level, 1, 'bump cooldown');
lv.update(chase.level.bumpCooldown + 0.1);
lv.bump();
assert.equal(lv.level, 2, 'second bump -> level 2');

lv = mk();
lv.bump();
lv.cool(2);
lv.update(1);
assert.equal(lv.level, 1, 'cool-down pending');
lv.update(1.1);
assert.equal(lv.level, 0, 'cool-down drops the level to 0');
lv.turf(true);
assert.equal(lv.level, 0, 'turf cannot raise it during the lockout');
lv.update(chase.level.lockoutAfterClear + 0.1);
assert.equal(lv.level, 1, 'after the lockout turf raises it again');

lv = mk(false);
lv.turf(true); lv.bump();
assert.equal(lv.level, 0, 'chaseEnabled=false keeps level 0');

console.log(`chase checks passed: path ${n} tiles, A* avg ${avg.toFixed(3)} ms, p99 ${worst.toFixed(3)} ms; level events ${log.length}`);
