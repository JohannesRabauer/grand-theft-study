// Lighting pipeline (story 16.2, AD-31, CAP-35): light falloff, the light pool, the ambient colour, the data files and the
// per-tier switches. Run: node scripts/check-lighting.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ambientFor, ambientRgb, darkness, lightLevel, lightPixels, LightPool } from '../render/lightMath.js';
import { compileDay, tintAt } from '../services/dayTime.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lighting = json('data/lighting.json');
const postfx = json('data/postfx.json');
const quality = json('data/quality.json');

// ---- falloff: 0 outside the radius, never rises with distance, flat bands (exactly `steps` distinct levels), core is full
const { steps, radius } = lighting.texture;
let prev = 1;
const seen = new Set();
for (let d = 0; d <= radius + 5; d += 0.25) {
  const v = lightLevel(d, radius, steps);
  assert.ok(v <= prev + 1e-9, `falloff never rises (d=${d})`);
  prev = v;
  if (v > 0) seen.add(v);
}
assert.equal(lightLevel(0, radius, steps), 1, 'the core is full light');
assert.equal(lightLevel(radius, radius, steps), 0, 'nothing at the radius');
assert.equal(lightLevel(radius + 10, radius, steps), 0, 'nothing outside');
assert.equal(seen.size, steps, `exactly ${steps} light bands`);
for (const v of seen) assert.ok(Math.abs(v * steps - Math.round(v * steps)) < 1e-9, 'bands are whole steps');

// ---- the texture pixels: symmetric, band levels only without dither; dithering only mixes neighbouring band levels
const flat = lightPixels(16, steps, 0);
const levels = new Set(flat);
assert.ok(levels.size <= steps + 1 && levels.has(0) && levels.has(255), 'hard-banded texture has the band levels only');
assert.equal(flat[16 * 32 + 16], flat[15 * 32 + 15], 'the texture is symmetric around its centre');
assert.equal(flat[0], 0, 'corner is dark');
const dith = lightPixels(16, steps, 1);
assert.ok([...new Set(dith)].every(v => levels.has(v)), 'dithering only moves pixels between band levels (stays pixel art)');
assert.notDeepEqual([...dith], [...flat], 'dithering changes edge pixels');

// ---- ambient colour: white by day (the world is untouched), darker and bluer at night, never below the floor
const day = compileDay(json('data/day.json'));
const at = (h, m) => ambientFor(tintAt(day, h * 60 + m), lighting.ambient);
const noon = at(12, 0);
assert.deepEqual([noon.r, noon.g, noon.b], [1, 1, 1], 'noon ambient is white');
const dusk = at(21, 0);
const night = at(22, 0);
assert.ok(darkness(dusk) > 0.4 && darkness(dusk) < darkness(night), 'dusk is dark, 22:00 darker');
assert.ok(dusk.b > dusk.r, 'night light is bluish');
for (const c of [dusk, night]) assert.ok(c.r >= lighting.ambient.floor && c.g >= lighting.ambient.floor && c.b >= lighting.ambient.floor, 'ambient stays at or above the floor (friendly night)');
assert.equal(ambientRgb({ r: 1, g: 0.5, b: 0 }), 0xff8000, 'ambient packs to rgb');
assert.ok(darkness(noon) < 1e-9, 'no darkness at noon');

// ---- the pool: add / move / release handles, a limit, reuse, swap-remove keeps indexes right
const pool = new LightPool(4);
const hs = [1, 2, 3, 4].map(i => pool.add({ x: i, y: i, radius: 10 + i }));
assert.ok(hs.every(h => h && h.alive) && pool.count === 4, 'four lights added');
assert.equal(pool.add({ x: 9, y: 9 }), null, 'a full pool returns null');
hs[1].move(50, 60);
assert.deepEqual([pool.active[1].x, pool.active[1].y], [50, 60], 'move changes the position');
hs[1].set({ radius: 33, intensity: 0.5 });
assert.equal(pool.active[1].radius, 33);
hs[0].release();
assert.equal(pool.count, 3);
assert.ok(!hs[0].alive, 'a released handle is dead');
hs[0].release(); // releasing twice is harmless
assert.equal(pool.count, 3);
assert.deepEqual(pool.active.map(s => s.x).sort((a, b) => a - b), [3, 4, 50], 'the right lights stay after a release');
assert.ok(pool.active.every((s, i) => s.at === i), 'slot indexes follow the dense list');
assert.ok(pool.add({ x: 7, y: 7 }) && pool.count === 4, 'a released slot is reused');
pool.setLimit(2);
assert.equal(pool.add({ x: 1, y: 1 }), null, 'the tier limit blocks new lights');
pool.releaseAll();
assert.equal(pool.count, 0);
pool.setLimit(4);
assert.ok(pool.add({ x: 1, y: 1 }), 'the pool works again after releaseAll');
pool.setLimit(0);
assert.equal(pool.add({ x: 1, y: 1 }), null, 'limit 0 (Low) adds nothing');

// ---- data: the wired lamps exist in the map, the tiers carry the switches, Low has no passes
const town = json('data/maps/town.json');
assert.ok(lighting.sources.length >= 1, 'at least one real light is wired (the first street lamp)');
for (const s of lighting.sources) {
  assert.ok(town.objects.some(o => o.id === s.id && o.type === 'lamp'), `source ${s.id} is a lamp of the town map`);
  assert.match(s.color, /^#[0-9a-f]{6}$/i);
  assert.ok(s.radius > 0 && s.radius <= radius, 'a source radius fits the light texture');
}
assert.ok(lighting.sources.length <= lighting.poolCap);
for (const [id, t] of Object.entries(quality.tiers)) {
  assert.equal(typeof t.lightMap, 'boolean', `${id} has lightMap`);
  assert.ok(Number.isInteger(t.maxLights) && t.maxLights >= 0 && t.maxLights <= lighting.poolCap, `${id} maxLights fits the pool`);
  assert.ok(t.postFx && typeof t.postFx.grade === 'boolean' && typeof t.postFx.vignette === 'boolean' && t.postFx.bloomTaps >= 0 && t.postFx.bloomTaps <= 16, `${id} postFx switches`);
}
const low = quality.tiers.low;
assert.ok(!low.lightMap && low.maxLights === 0 && !low.postFx.grade && !low.postFx.vignette && low.postFx.bloomTaps === 0, 'Low keeps the old tint overlay (no light map, no passes)');
for (const id of ['medium', 'high']) assert.ok(quality.tiers[id].lightMap && quality.tiers[id].postFx.bloomTaps > 0, `${id} has the full pipeline`);
assert.ok(quality.tiers.high.maxLights >= quality.tiers.medium.maxLights);
assert.ok(postfx.bloom.threshold > 0 && postfx.bloom.threshold < 1 && postfx.bloom.intensity >= 0 && postfx.vignette.strength >= 0 && postfx.vignette.inner < postfx.vignette.outer, 'postfx values are sane');

// ---- the passes stay off the UI, the draw loop allocates nothing, nothing is random
const lm = text('render/LightMap.js');
const px = text('render/PostFx.js');
assert.ok(!/UIScene|get\('UI'\)/.test(px + lm), 'post effects and light map never touch UIScene');
assert.ok(/cameras\.main/.test(px), 'passes go on the world camera');
const loop = lm.slice(lm.indexOf('  update(dt)'));
assert.ok(!/\bnew |\.map\(|\.filter\(|\[\.\.\./.test(loop), 'LightMap.update allocates nothing per frame');
assert.ok(!/Math\.random/.test(lm + px), 'lights use no Math.random (the seeded smoke test stays deterministic)');

console.log(`lighting ok: ${seen.size} falloff bands, pool of ${lighting.poolCap}, ${lighting.sources.length} wired light(s), tiers low/medium/high`);
