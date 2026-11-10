// Vegetation (story 16.6, AD-31, CAP-35): crown placement, species clusters, hedge runs, the fade under a crown, the sway
// formula and the wiring. Run: node scripts/check-vegetation.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { placeTrees, hedgeRuns, crownBox, underCrown, stepFade, swayShift, speciesOf, SPECIES, TILE, MARGIN } from '../render/vegetationMath.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cfg = json('data/vegetation.json');
const town = json('data/maps/town.json');
const quality = json('data/quality.json');

// ---- data: every species has a crown, a trunk colour and a five-step palette per look; the crown fits its tile grid rules
assert.deepEqual(Object.keys(cfg.species).sort(), [...SPECIES].sort(), 'species in the data are the species in the code');
for (const sp of SPECIES) {
  const { crown } = cfg.species[sp];
  assert.ok(crown.rx * 2 > TILE && crown.ry * 2 > TILE, `${sp}: the crown is wider and taller than one tile`);
  assert.ok(crown.cy < 0 && crown.cy + crown.ry < 0, `${sp}: the crown ends above the trunk's base point`);
  assert.ok(cfg.palettes[sp].summer, `${sp}: a summer look`);
  for (const pal of Object.values(cfg.palettes[sp])) assert.equal(pal.length, 5, `${sp}: five ramp steps`);
  const box = crownBox(crown);
  assert.ok(box.w >= 2 * (crown.rx + MARGIN) && box.oy >= -crown.cy + crown.ry && box.h > box.oy, `${sp}: the texture box holds the crown and the sway margin`);
}
assert.equal(cfg.palettes.hedge.length, 5, 'hedge palette');

// ---- placement on the real town: one crown per tree tile, deterministic, crowns overlap the tile borders
const trees = placeTrees(town, cfg);
const tiles = town.rows.reduce((n, row) => n + [...row].filter(c => town.legend[c] === 'tree').length, 0);
assert.equal(trees.length, tiles, 'one crown per tree tile');
assert.deepEqual(placeTrees(town, cfg), trees, 'placement is deterministic');
for (const t of trees) {
  const left = t.cx - t.rx;
  const right = t.cx + t.rx;
  const top = t.cy - t.ry;
  assert.ok(left < t.tx * TILE && right > (t.tx + 1) * TILE && top < t.ty * TILE, `crown at ${t.tx},${t.ty} reaches past its tile on the left, right and top`);
  assert.equal(t.y, (t.ty + 1) * TILE - 1, 'the base point is the tile bottom row');
  assert.ok(t.shape >= 0 && t.shape < cfg.shapes && SPECIES.includes(t.species));
}
assert.ok(new Set(trees.map(t => t.species)).size === SPECIES.length, 'all three species grow in the town');
assert.ok(new Set(trees.map(t => `${t.species}${t.shape}`)).size >= 3 * 3 - 1, 'at least three shapes per species are in use (art bible: 3+ variants)');
assert.ok(new Set(trees.map(t => t.x - t.tx * TILE)).size >= 3, 'crowns are jittered off the tile centre');
// groves: species mostly agree within a 4x4 block
const blocks = new Map();
for (const t of trees) { const k = `${t.tx >> 2},${t.ty >> 2}`; blocks.set(k, [...(blocks.get(k) ?? []), t.species]); }
let same = 0;
let total = 0;
for (const list of blocks.values()) if (list.length > 2) { const c = {}; list.forEach(s => (c[s] = (c[s] ?? 0) + 1)); same += Math.max(...Object.values(c)); total += list.length; }
assert.ok(same / total > 0.6, `a 4x4 block of trees leans to one species (${(same / total).toFixed(2)})`);
assert.equal(speciesOf(7, 9), speciesOf(7, 9));
// no two trees side by side look identical in a row of four
for (let i = 0; i + 3 < trees.length; i++) {
  const run = trees.slice(i, i + 4);
  if (run.every((t, j) => j === 0 || (t.ty === run[0].ty && t.tx === run[j - 1].tx + 1))) assert.ok(new Set(run.map(t => `${t.species}${t.shape}`)).size > 1, `a row of four trees at ${run[0].tx},${run[0].ty} is not one repeated crown`);
}

// ---- hedge runs: connected, cover exactly the hedge tiles, tiles of one run touch
const runs = hedgeRuns(town);
const hedgeTiles = town.rows.reduce((n, row) => n + [...row].filter(c => town.legend[c] === 'hedge').length, 0);
assert.equal(runs.reduce((n, r) => n + r.tiles.length, 0), hedgeTiles, 'runs cover every hedge tile once');
assert.equal(new Set(runs.flatMap(r => r.tiles.map(([x, y]) => `${x},${y}`))).size, hedgeTiles, 'no tile in two runs');
for (const r of runs) {
  const set = new Set(r.tiles.map(([x, y]) => `${x},${y}`));
  assert.ok(r.tiles.length === 1 || r.tiles.every(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => set.has(`${x + a},${y + b}`))), `run ${r.id} is connected`);
  assert.ok(r.tiles.every(([x, y]) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1), 'bounds hold all tiles');
}
assert.deepEqual(hedgeRuns({ legend: { H: 'hedge', G: 'grass' }, rows: ['HGH', 'HGG'] }).map(r => r.tiles.length).sort(), [1, 2], 'a gap splits runs');

// ---- the fade: a kid behind the crown fades it, a kid in front of the trunk does not, and the step is linear
const t = { x: 100, y: 79, cx: 100, cy: 62, rx: 16, ry: 12 };
const torso = cfg.fade.torso;
assert.ok(underCrown(t, 100, 70, torso), 'a kid behind the trunk under the crown');
assert.ok(!underCrown(t, 100, 80, torso), 'a kid south of the base line is in front of the crown');
assert.ok(!underCrown(t, 130, 70, torso), 'a kid beside the crown is not under it');
assert.ok(!underCrown(t, 100, 30, torso), 'a kid far north is not under it');
assert.equal(stepFade(1, cfg.fade.alpha, 0.01, cfg.fade.speed), 1 - cfg.fade.speed * 0.01, 'the fade moves by speed times time');
assert.equal(stepFade(1, cfg.fade.alpha, 10, cfg.fade.speed), cfg.fade.alpha, 'and stops at its target');
assert.equal(stepFade(cfg.fade.alpha, 1, 10, cfg.fade.speed), 1, 'and returns to opaque');
assert.ok(cfg.fade.alpha > 0.2 && cfg.fade.alpha < 0.6, 'see-through but still visible');

// ---- sway: whole base pixels, zero at the base, growing with height, stronger with more wind, bounded by the texture margin
const sw = cfg.sway;
for (let time = 0; time < 60; time += 0.7) {
  for (const strength of [0, 0.5, 1]) {
    assert.equal(swayShift(time, 1, 0, 1, strength, sw.amp, sw), 0, 'the base does not move');
    const top = swayShift(time, 1, 1, 1, strength, sw.amp, sw);
    assert.ok(Number.isInteger(top) && Math.abs(top) <= MARGIN, `shift ${top} is whole and fits the margin`);
    assert.ok(Math.abs(swayShift(time, 1, 0.5, 1, strength, sw.amp, sw)) <= Math.abs(top) + 1, 'lower rows move less');
  }
}
assert.equal(swayShift(3, 2, 1, 0, 0, sw.amp, sw), 0, 'no wind, no sway');
assert.ok(Array.from({ length: 40 }, (_, i) => swayShift(i * 0.5, 0, 1, 0.9, 0.9, sw.amp, sw)).some(v => v !== 0), 'wind moves the top');
assert.ok(sw.hedgeAmp < sw.amp && sw.lowAmp >= 0, 'hedges sway less than crowns');

// ---- tiers: the shader sways only where the post effects run; Low keeps the pixel nudge
assert.equal(quality.tiers.low.windFx, false);
assert.equal(quality.tiers.medium.windFx, true);
assert.equal(quality.tiers.high.windFx, true);

// ---- wiring
assert.match(text('render/pipelines/index.js'), /WindFx/, 'the wind pipeline is registered');
assert.match(text('scenes/GameScene.js'), /new Vegetation\(/, 'the game builds the vegetation system');
assert.match(text('scenes/BootScene.js'), /makeCrowns\(/, 'the boot scene draws the crowns');
assert.match(text('scenes/BootScene.js'), /vegetation\.json/, 'and loads the data');
assert.ok(readdirSync(new URL('../data/maps/', import.meta.url)).length > 0);

console.log(`vegetation ok: ${trees.length} crowns, ${runs.length} hedge runs (${hedgeTiles} tiles), fade, sway, tiers, wiring`);
