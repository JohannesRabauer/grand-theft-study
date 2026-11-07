// Checks the crowd rules that need no Phaser (ai/CrowdLogic.js, data/npcs.json, quality caps):
// spawn selection (cap, off-screen ring, occupied markers, player clearance), the step-aside
// geometry and the approach reaction levels. Run: node scripts/check-crowd.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outsideView, pickSpawn, canSpawn, sideStep, approach, weightedIndex } from '../ai/CrowdLogic.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = load('npcs.json');
const map = load('maps/town.json');
const quality = load('quality.json');
const ts = map.tileSize;

// data sanity
assert.ok(cfg.despawnDistance > cfg.spawn.margin + cfg.spawn.ring, 'despawn distance must exceed the spawn ring, or spawns vanish at once');
assert.deepEqual(['low', 'medium', 'high'].map(t => quality.tiers[t].maxNPCs), [6, 12, 20], 'NPC caps per tier');
for (const kind of ['adult', 'kid', 'elder']) assert.ok(cfg.outfits.filter(o => o.kind === kind).length >= (kind === 'adult' ? 5 : 2), `enough ${kind} outfits`);
assert.ok(cfg.outfits.length >= 8 && new Set(cfg.outfits.map(o => o.jacket)).size >= 8, 'outfit variety');

const spawnObjs = map.objects.filter(o => o.type === 'npc-spawn');
const sp = {
  count: spawnObjs.length,
  xs: Float32Array.from(spawnObjs, o => (o.x + 0.5) * ts),
  ys: Float32Array.from(spawnObjs, o => (o.y + 0.5) * ts),
  weight: Float32Array.from(spawnObjs, o => cfg.districts[o.district] * cfg.roles[o.role].weight)
};
const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// spawn selection: only markers in the ring outside the view, never occupied ones, never next to the player
const view = { cx: 700, cy: 400, hw: 240, hh: 135, px: 700, py: 400 };
const taken = new Uint8Array(sp.count);
const rand = rng(7);
const picked = new Set();
for (let i = 0; i < 400; i++) {
  const idx = pickSpawn(sp, taken, view, cfg.spawn, rand, false);
  if (idx < 0) continue;
  const d = outsideView(sp.xs[idx], sp.ys[idx], view);
  assert.ok(d >= cfg.spawn.margin && d <= cfg.spawn.margin + cfg.spawn.ring, `marker ${idx} is ${d.toFixed(0)} px outside the view`);
  picked.add(idx);
}
assert.ok(picked.size >= 3, `spawns vary (${picked.size} markers used)`);
const some = [...picked][0];
taken[some] = 1;
for (let i = 0; i < 200; i++) assert.notEqual(pickSpawn(sp, taken, view, cfg.spawn, rand, false), some, 'an occupied marker is never picked');
taken.fill(1);
assert.equal(pickSpawn(sp, taken, view, cfg.spawn, rand, false), -1, 'no free marker -> no spawn');
taken.fill(0);
const near = { ...view, px: sp.xs[some], py: sp.ys[some] };

for (let i = 0; i < 200; i++) {
  const idx = pickSpawn(sp, taken, near, cfg.spawn, rand, true);
  if (idx >= 0) assert.ok(Math.hypot(sp.xs[idx] - near.px, sp.ys[idx] - near.py) >= cfg.spawn.playerClear, 'never spawn on top of the player');
}
// prefill may use markers inside the view, normal spawning never does
let inside = false;
for (let i = 0; i < 400; i++) { const idx = pickSpawn(sp, taken, view, cfg.spawn, rand, true); if (idx >= 0 && outsideView(sp.xs[idx], sp.ys[idx], view) < 0) inside = true; }
assert.ok(inside, 'prefill places pedestrians inside the view');

// the cap: a director that spawns whenever canSpawn() allows never exceeds any tier cap
for (const tier of ['low', 'medium', 'high']) {
  const cap = quality.tiers[tier].maxNPCs;
  let live = 0;
  const r = rng(3);
  for (let i = 0; i < 500; i++) {
    const slots = r() < 0.2 ? 2 : 1;
    if (canSpawn(live, cap, slots)) live += slots;
    assert.ok(live <= cap, `${tier}: ${live} > cap ${cap}`);
  }
  assert.equal(live >= cap - 1, true, `${tier} fills up to the cap`);
}
assert.ok(!canSpawn(11, 12, 2) && canSpawn(10, 12, 2), 'a two-kid group needs two free slots');

// weighted choice follows the weights
assert.equal(weightedIndex([1, 0, 0], 0.9), 0);
assert.equal(weightedIndex([0, 1, 1], 0.1), 1);
assert.equal(weightedIndex([0, 1, 1], 0.9), 2);

// step aside: perpendicular to the player's heading, on the pedestrian's own side, unit length
const out = { x: 0, y: 0 };
sideStep(out, 100, 0, 20, -8); // player rides east, pedestrian ahead and slightly north
assert.ok(Math.abs(out.x) < 1e-9 && out.y === -1, 'north of an eastbound rider steps north');
sideStep(out, 100, 0, 20, 8);
assert.ok(Math.abs(out.x) < 1e-9 && out.y === 1, 'south steps south');
sideStep(out, 0, -70, -6, -30); // northbound, pedestrian ahead-left
assert.ok(out.x === -1 && Math.abs(out.y) < 1e-9, 'perpendicular for a northbound rider');
sideStep(out, 0, 0, 3, 4); // standing still: directly away
assert.ok(Math.abs(out.x - 0.6) < 1e-9 && Math.abs(out.y - 0.8) < 1e-9, 'standing player: step away');
for (const [vx, vy, dx, dy] of [[50, 50, 10, -3], [-80, 20, -4, 9], [0, 120, 2, 2]]) {
  sideStep(out, vx, vy, dx, dy);
  assert.ok(Math.abs(Math.hypot(out.x, out.y) - 1) < 1e-9, 'unit length');
  assert.ok(Math.abs(out.x * vx + out.y * vy) < 1e-6, 'perpendicular to the heading');
  assert.ok(out.x * dx + out.y * dy >= 0, 'on the pedestrian side');
}

// approach: fast and from the front only, flee when very fast and very close
const r = cfg.react;
assert.equal(approach(110, 0, 30, 0, r), 1, 'fast rider ahead at 30 px: step aside');
assert.equal(approach(150, 0, r.fleeRadius - 4, 0, r), 2, 'very fast and very close: flee');
assert.equal(approach(r.closeSpeed - 5, 0, 10, 0, r), 0, 'walking pace is no reaction');
assert.equal(approach(150, 0, -20, 0, r), 0, 'someone behind the player is left alone');
assert.equal(approach(150, 0, r.closeRadius + 5, 0, r), 0, 'too far to react');
assert.equal(approach(r.fleeSpeed - 5, 0, 10, 0, r), 1, 'below flee speed only steps aside');

console.log(`crowd checks passed (${sp.count} spawn markers, caps ${quality.tiers.low.maxNPCs}/${quality.tiers.medium.maxNPCs}/${quality.tiers.high.maxNPCs})`);
