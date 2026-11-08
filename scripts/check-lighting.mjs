// Lighting pipeline (story 16.2, AD-31, CAP-35): light falloff, the light pool, the ambient colour, the data files and the
// per-tier switches. Run: node scripts/check-lighting.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ambientFor, ambientRgb, darkness, fixedBudget, lampLit, lightLevel, lightPixels, LightPool, WARMUP_CELL, warmupLevel } from '../render/lightMath.js';
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
assert.ok(darkness(dusk) > 0.3 && darkness(dusk) < darkness(night), 'dusk is dark, 22:00 darker');
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

// ---- data: the wired lamps and signs exist in the map, the tiers carry the switches, Low has no passes
const town = json('data/maps/town.json');
assert.ok(lighting.sources.length >= 4, 'the park lamps are wired');
for (const s of lighting.sources) {
  assert.ok(town.objects.some(o => o.id === s.id && o.type === 'lamp'), `source ${s.id} is a lamp of the town map`);
  assert.match(s.color, /^#[0-9a-f]{6}$/i);
  assert.ok(s.radius > 0 && s.radius <= radius, 'a source radius fits the light texture');
  assert.ok(lighting.schedules[s.schedule], `${s.id} has a schedule`);
}
for (const s of lighting.signs) {
  assert.ok(town.objects.some(o => o.id === s.id && /shop|bakery|newsstand|tram-stop|sign/.test(o.type)), `sign ${s.id} is a shop or stop of the town map`);
  assert.ok(s.radius > 0 && s.radius <= radius && lighting.schedules[s.schedule]);
}
assert.ok(lighting.signs.filter(s => /tram-stop/.test(s.id)).length === 4 && lighting.signs.some(s => /bakery/.test(s.id)) && lighting.signs.some(s => /workshop/.test(s.id)), 'tram stops and shops have signs');
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

// ---- time-of-day keyframes (story 16.3): sorted, blended linearly between stops, cool dawn, golden evening, readable blue night
const stops = day.tint;
for (let i = 1; i < stops.length; i++) assert.ok(stops[i].minute > stops[i - 1].minute, 'keyframes are in time order');
assert.ok(stops.length >= 8, 'graded keyframes: dawn, day, golden hour, dusk, night');
for (const k of stops) assert.ok(k.alpha >= 0 && k.alpha <= 0.5, 'the ambient never passes 0.5 alpha (art bible)');
for (let i = 1; i < stops.length; i++) {
  const t = tintAt(day, (stops[i - 1].minute + stops[i].minute) / 2);
  const lo = Math.min(stops[i - 1].alpha, stops[i].alpha), hi = Math.max(stops[i - 1].alpha, stops[i].alpha);
  assert.ok(t.alpha >= lo - 1e-9 && t.alpha <= hi + 1e-9, 'a blend stays between its stops');
  assert.ok(Math.abs(t.alpha - (stops[i - 1].alpha + stops[i].alpha) / 2) < 1e-9, 'alpha blends linearly at the midpoint');
  for (const shift of [16, 8, 0]) {
    const ca = (stops[i - 1].rgb >> shift) & 255, cb = (stops[i].rgb >> shift) & 255, cm = (t.rgb >> shift) & 255;
    assert.ok(Math.abs(cm - (ca + cb) / 2) <= 1, 'colour blends linearly at the midpoint');
  }
}
assert.deepEqual(tintAt(day, stops[3].minute), { rgb: stops[3].rgb, alpha: stops[3].alpha }, 'a keyframe time gives the keyframe');
assert.deepEqual(tintAt(day, 0), { rgb: stops[0].rgb, alpha: stops[0].alpha }, 'before the first stop it holds the first');
assert.deepEqual(tintAt(day, 24 * 60), { rgb: stops.at(-1).rgb, alpha: stops.at(-1).alpha }, 'after the last stop it holds the last');
const bluish = c => c.b > c.r;
assert.ok(bluish(at(6, 30)) && darkness(at(6, 30)) > 0.02, 'cool dawn: blue over red');
assert.ok(at(8, 0).r === 1 && at(8, 0).b === 1 && at(17, 0).b === 1, 'neutral day');
const golden = at(19, 0);
assert.ok(golden.r > golden.b && golden.r === 1, 'golden evening: red over blue');
assert.ok(darkness(at(18, 30)) < darkness(at(19, 30)) && darkness(at(19, 30)) < darkness(at(20, 30)) && darkness(at(20, 30)) < darkness(at(21, 30)), 'the evening darkens step by step');
for (let m = day.start; m < day.end; m++) {
  const c = ambientFor(tintAt(day, m), lighting.ambient);
  assert.ok(0.299 * c.r + 0.587 * c.g + 0.114 * c.b >= lighting.ambient.floor, 'the ambient luminance never drops below the floor (readable night)');
}
assert.ok(bluish(at(21, 30)) && bluish(at(22, 0)) && at(21, 30).b > 0.5, 'night is blue, not black');

// ---- lamp schedule and warm-up flicker
const clock = t => +t.slice(0, 2) * 60 + +t.slice(3);
const sched = Object.fromEntries(Object.entries(lighting.schedules).map(([id, s]) => [id, { on: clock(s.on), onSpread: s.onSpread, off: clock(s.off), offSpread: s.offSpread, warm: s.warm }]));
for (const [id, s] of Object.entries(sched)) {
  assert.ok(!lampLit(12 * 60, s, 0) && !lampLit(12 * 60, s, 0.99), `${id}: off at noon`);
  assert.ok(lampLit(day.end - 1, s, 0) && lampLit(day.end - 1, s, 0.99), `${id}: lit at bedtime`);
  assert.ok(lampLit(s.on + s.onSpread, s, 0.99) && lampLit(s.on, s, 0) && !lampLit(s.on - 1, s, 0), `${id}: switches on from its time, staggered by the lamp's own offset`);
  assert.ok(!lampLit(s.on + 1, s, 0.99), `${id}: a late lamp is still off when an early one is on`);
  assert.ok(lampLit(day.start, s, 0.5) && !lampLit(s.off + s.offSpread, s, 0.99), `${id}: still lit at dawn, off a little later`);
  assert.ok(s.warm > 0 && s.warm <= 2, `${id}: the warm-up is short`);
  assert.ok(s.on + s.onSpread < 20 * 60 + 30 && s.on >= 18 * 60, `${id}: lit well before the night shots`);
}
assert.equal(warmupLevel(5, 1.2, 3), 1, 'settled after the warm-up');
assert.equal(warmupLevel(1.2, 1.2, 3), 1);
assert.equal(warmupLevel(-1, 1.2, 3), 0, 'not switched on yet');
let lowest = 1;
for (let seed = 0; seed < 50; seed++) {
  let flips = 0, was = null;
  for (let t = 0; t < 1.2; t += 0.01) {
    const v = warmupLevel(t, 1.2, seed);
    lowest = Math.min(lowest, v);
    assert.ok(v > 0 && v <= 1, 'a warming lamp is never fully dark');
    const hi = v > 0.4;
    if (was !== null && hi !== was) flips++;
    was = hi;
  }
  assert.ok(flips / 1.2 <= 1 / WARMUP_CELL + 1e-9, `no more than ${1 / WARMUP_CELL} flips per second (3 Hz limit), seed ${seed}`);
}
assert.ok(1 / WARMUP_CELL <= 3, 'the flicker stays under 3 Hz');
assert.ok(lowest < 0.2, 'the warm-up does flicker');

// ---- street lamps and the light budget
const lamps = lighting.street.lamps.town;
assert.ok(lamps.length >= 60, `the town has street lamps (${lamps.length})`);
for (const [x, y] of lamps) {
  assert.ok('GSCp'.includes(town.rows[y][x]), `lamp ${x},${y} stands on open ground, not in a wall or the water`);
  assert.ok(!town.objects.some(o => o.x === x && o.y === y && !/npc|spawn|ambient/.test(o.type)), `lamp ${x},${y} does not sit on an object`);
}
for (let i = 0; i < lamps.length; i++) for (let j = i + 1; j < lamps.length; j++) assert.ok(Math.hypot(lamps[i][0] - lamps[j][0], lamps[i][1] - lamps[j][1]) >= 8, 'lamps are spread out');
assert.equal(lighting.street.head.length, lighting.street.variants, 'a head position per lamp variant');
assert.ok(lighting.street.variants >= 3, 'at least three lamp shapes');
for (const id of ['medium', 'high']) {
  const limit = quality.tiers[id].maxLights;
  const budget = fixedBudget(limit, lighting.vehicles.reserve);
  assert.ok(budget >= 8 && budget + lighting.vehicles.reserve === limit, `${id}: the fixed lights and the reserve add up to the cap`);
  const p = new LightPool(lighting.poolCap);
  p.setLimit(limit);
  for (let i = 0; i < limit * 2; i++) p.add({ x: i, y: 0 }); // far more lamps and vehicles than fit
  assert.ok(p.count <= limit, `${id}: the active light count never passes ${limit}`);
}
assert.equal(fixedBudget(0, lighting.vehicles.reserve), 0, 'Low has no fixed lights');
const sl = text('render/StreetLights.js');
assert.ok(!/Math\.random/.test(sl), 'street lights use no Math.random');
const slLoop = sl.slice(sl.indexOf('  update(dt)'));
assert.ok(!/\bnew |\.map\(|\.filter\(|\[\.\.\.|\bMap\b/.test(slLoop.replace(/\/\/.*$/gm, '')), 'StreetLights.update allocates nothing per frame');

console.log(`lighting ok: ${seen.size} falloff bands, pool of ${lighting.poolCap}, ${lighting.sources.length} lamps, ${lighting.signs.length} signs, ${lamps.length} street lamps, tiers low/medium/high`);
