// Cast shadows (story 16.4, AD-31, CAP-35): the sun keyframes, the baked shadow mask, offsets in whole pixels, the night fade
// and the wiring. Run: node scripts/check-shadows.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShadowMask, shadowOffsets, shadowStrength, TILE, AO_STRONG, AO_WEAK } from '../render/shadowMath.js';
import { ambientFor, darkness } from '../render/lightMath.js';
import { compileDay, parseTime, sunAt, tintAt } from '../services/dayTime.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const day = compileDay(json('data/day.json'));
const lighting = json('data/lighting.json');
const cfg = lighting.shadows;
const quality = json('data/quality.json');
const at = t => sunAt(day, parseTime(t));
const white = { r: 1, g: 1, b: 1 };
const darkAt = m => darkness(ambientFor(tintAt(day, m), lighting.ambient, white));

// ---- the sun: long in the morning and evening, shortest at noon, always shining from the top left
const noon = at('12:00');
for (const t of ['06:30', '07:00', '19:30', '19:45']) assert.ok(at(t).length > noon.length, `${t} casts longer shadows than noon`);
for (let m = day.start; m <= day.end; m += 5) {
  const s = sunAt(day, m);
  assert.ok(s.angle > 0 && s.angle < 90, `minute ${m}: the shadow falls to the bottom right (angle ${s.angle})`);
  assert.ok(s.length > 0 && s.length <= 1, `minute ${m}: length share in (0, 1]`);
}
assert.deepEqual(sunAt(day, 0), sunAt(day, day.sun[0].minute), 'before the first keyframe the first one holds');
assert.deepEqual(sunAt(day, 1439), sunAt(day, day.sun.at(-1).minute), 'after the last keyframe the last one holds');
assert.ok(day.sun.every((k, i) => !i || k.minute > day.sun[i - 1].minute), 'sun keyframes are in order');

// ---- offsets: whole pixels, bottom right, longer in the morning than at noon, low casters shorter than tall ones
const morning = shadowOffsets(at('07:00'), cfg);
const noonO = shadowOffsets(noon, cfg);
const all = [...morning.tall, ...morning.low, ...noonO.tall, ...noonO.low];
for (const v of all) assert.ok(Number.isInteger(v) && v >= 0, 'offsets are whole base pixels towards the bottom right');
assert.ok(Math.hypot(...morning.tall) > Math.hypot(...noonO.tall), 'the morning shadow is longer than the noon shadow');
assert.ok(Math.hypot(...noonO.low) < Math.hypot(...noonO.tall), 'low things cast shorter shadows');
assert.ok(Math.max(...all) < TILE, 'a shadow is shorter than a one-tile caster, so a shifted copy leaves no gap');

// ---- strength follows the light map's darkness: full by day, gone at night, softer when overcast
assert.ok(Math.abs(shadowStrength(cfg, darkAt(parseTime('12:00'))) - cfg.strength) < 1e-9, 'noon: full strength');
assert.ok(shadowStrength(cfg, darkAt(parseTime('19:45'))) > 0.5 * cfg.strength, 'the evening shadow is still there');
assert.equal(shadowStrength(cfg, darkAt(parseTime('21:30'))), 0, 'night: the shadow is gone (the darkness replaces it)');
assert.ok(shadowStrength(cfg, 0, true) < shadowStrength(cfg, 0, false), 'overcast shadows are softer');
let prev = Infinity;
for (let m = 17 * 60; m <= day.end; m += 5) {
  const s = shadowStrength(cfg, darkAt(m));
  assert.ok(s <= prev + 1e-9, `the shadow only fades through the evening (minute ${m})`);
  prev = s;
}

// ---- the mask: a small map with a wall block, a tree, a fence, a hedge, a booth, water and open ground
const legend = { '#': 'wall', G: 'grass', T: 'tree', F: 'fence', H: 'hedge', B: 'booth', W: 'water' };
const rows = ['GGGGGGG', 'G##GGTG', 'G##GGGG', 'GGGGFHB', 'GWGGGGG', 'GGGGGGG'];
const map = { legend, rows };
const mask = buildShadowMask(map, cfg);
assert.equal(mask.w, 7 * TILE);
assert.equal(mask.h, 6 * TILE);
const px = (tx, ty, ox, oy, ch) => mask.data[((ty * TILE + oy) * mask.w + tx * TILE + ox) * 4 + ch];
assert.ok(mask.data.every((v, i) => i % 4 !== 3 || v === 255), 'alpha is 255 everywhere');
assert.equal(px(1, 1, 8, 8, 0), 255, 'a wall is a tall caster');
assert.equal(px(1, 1, 8, 8, 2), 255, 'a wall tile is a footprint (no shadow on its own roof)');
assert.equal(px(0, 0, 8, 8, 0), 0, 'open ground casts nothing');
assert.equal(px(5, 1, 8, 7, 0), 255, 'a tree canopy is a tall caster');
assert.equal(px(5, 1, 0, 0, 0), 0, 'the corner of a tree tile stays open');
assert.equal(px(4, 3, 8, 8, 1), 255, 'a fence is a low caster');
assert.equal(px(5, 3, 8, 8, 1), 255, 'a hedge is a low caster');
assert.equal(px(5, 3, 8, 8, 0), 0, 'a hedge is not a tall caster');
assert.equal(px(6, 3, 8, 8, 0), 255, 'a booth is a tall caster');
// ambient occlusion: strongest right under the south edge of the wall, weaker further out, a faint band behind, none on water
assert.equal(px(1, 3, 8, 0, 2), AO_STRONG, 'a dark band at the foot of the wall');
assert.equal(px(1, 3, 8, 2, 2), AO_WEAK, 'a fainter band below it');
assert.equal(px(1, 3, 8, 6, 2), 0, 'no occlusion further away');
assert.equal(px(3, 1, 0, 8, 2), AO_STRONG, 'occlusion on the east side of the wall');
assert.equal(px(0, 1, 15, 8, 2), AO_STRONG, 'occlusion on the west side of the wall');
assert.equal(px(1, 0, 8, 15, 2), AO_WEAK, 'a faint band behind the wall');
assert.equal(px(1, 4, 8, 0, 2), 0, 'water gets no occlusion');
assert.deepEqual(buildShadowMask(map, cfg).data, mask.data, 'the mask is deterministic');
assert.equal(buildShadowMask({ legend, rows: ['GGG', 'GGG'] }, cfg), null, 'no casters: no layer');
assert.equal(buildShadowMask({ ...map, indoor: true }, cfg), null, 'indoor maps get no cast shadows');

// ---- the real town: built once, quickly, with casters
const t0 = performance.now();
const big = buildShadowMask(json('data/maps/town.json'), cfg);
const ms = performance.now() - t0;
assert.ok(big && big.casters > 1000, 'the town has casters');
assert.ok(big.w <= 4096 && big.h <= 4096, 'the town mask fits a 4096 texture');
assert.ok(ms < 1500, `the town mask bakes in ${ms.toFixed(0)} ms (limit 1500)`);

// ---- wiring: tiers, shader registration, baked once (no redraw in update)
assert.equal(quality.tiers.low.shadows, false, 'Low keeps contact shadows only');
assert.ok(quality.tiers.medium.shadows && quality.tiers.high.shadows, 'Medium and High cast shadows');
assert.match(text('render/pipelines/index.js'), /OBJECT_PIPELINES = \[ShadowFx, /, 'the shadow pipeline is registered');
const sh = text('render/Shadows.js');
assert.equal(sh.match(/putImageData/g).length, 1, 'the mask is uploaded once (at map load)');
const update = sh.slice(sh.indexOf('  update() {'));
assert.ok(!/createCanvas|putImageData|add\.image|buildShadowMask/.test(update), 'update only moves offsets and strength');
assert.ok(cfg.depth < 0 && cfg.depth > -1, 'the layer sits above the ground bake and below every object');

console.log(`shadows ok: sun keyframes, offsets, night fade, mask (${big.casters} casters, ${ms.toFixed(0)} ms for the town), wiring`);
