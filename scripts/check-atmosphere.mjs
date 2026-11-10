// Atmosphere (story 16.12, AD-31, CAP-35/30/31): the layer targets and their easing, the haze blend, the wet ground (thresholds, alpha, the tiles that
// shine), the seeded noise banks of the Low and Canvas fallback, ripples and reflection picks, the data and the per-tier switches, the test flags.
// The running passes are covered by the smoke scenario `atmosphere` and scripts/atmosphere-frames.mjs.
// Run: node scripts/check-atmosphere.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  approach, windowShare, layerTargets, hazeBlend, wetStep, wetThreshold, wetAlpha, collectWet, noiseTile, bandLevel, hazePixels, shadowPixels,
  rippleFrame, pickReflections, drift, smooth
} from '../render/atmosphereMath.js';

const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = p => JSON.parse(text(p));
const cfg = json('data/atmosphere.json');
const quality = json('data/quality.json');
const day = json('data/day.json');

// ---- easing: from nothing to full in `secs`, never overshooting, no jump
let v = 0;
for (let i = 0; i < 60; i++) { const n = approach(v, 1, 1 / 60, 2); assert.ok(n - v <= 1 / 120 + 1e-9, 'a layer moves at most dt / secs'); v = n; }
assert.ok(v > 0.45 && v < 0.55, 'half way after one of two seconds');
assert.equal(approach(0.99, 1, 1, 2), 1);
assert.equal(approach(0.2, 0, 10, 2), 0);

// ---- windows and targets
assert.equal(windowShare(100, 390, 475, 25), 0);
assert.equal(windowShare(390, 390, 475, 25), 0);
assert.equal(windowShare(420, 390, 475, 25), 1);
assert.ok(windowShare(400, 390, 475, 25) > 0 && windowShare(400, 390, 475, 25) < 1);
assert.ok(windowShare(470, 390, 475, 25) < 0.3);
const at = (state, minute, dark = 0, rain = 0, indoor = false) => layerTargets(cfg, { state, minute, dark, indoor, rain });
assert.equal(at('fog', 720).fog, 1);
assert.equal(at('clear', 720).fog, 0);
assert.equal(at('clear', 720).clouds, 1, 'a sunny noon: full cloud shadows');
assert.equal(at('rain', 720).clouds, 0, 'no cloud shadows under a grey sky');
assert.equal(at('fog', 720).clouds, 0);
assert.equal(at('clear', 720, 0.4).clouds, 0, 'no cloud shadows at night');
assert.ok(at('clear', 720, 0.13).clouds > 0 && at('clear', 720, 0.13).clouds < 1, 'they fade out at dusk');
assert.ok(at('clear', 420).mist > at('rain', 420).mist && at('rain', 420).mist > 0, 'morning mist in every weather, thinner in rain');
assert.equal(at('clear', 720).mist, 0);
assert.equal(at('rain', 720, 0, 0.7).curtain, 0.7);
assert.deepEqual(at('fog', 420, 0, 0.8, true), { fog: 0, mist: 0, clouds: 0, curtain: 0 }, 'nothing indoors');

// ---- the haze: never dense enough to hide the player
assert.ok(cfg.fog.density <= 0.5 && cfg.mist.density < cfg.fog.density, 'haze stays thin');
assert.equal(hazeBlend(cfg, 0, 0).density, 0);
const hf = hazeBlend(cfg, 1, 0);
assert.equal(hf.density, cfg.fog.density);
assert.equal(hf.lo, cfg.fog.lo);
assert.equal(hazeBlend(cfg, 0, 1).density, cfg.mist.density);
const hx = hazeBlend(cfg, 0.5, 1);
assert.ok(hx.lo < cfg.mist.lo && hx.lo > cfg.fog.lo, 'a mix of fog and mist sits between them');
assert.ok(hazeBlend(cfg, 1, 1).density <= 0.5);

// ---- the wet ground: gets wet in rain, dries slowly; tiles shine one after the other
let w = 0;
for (let i = 0; i < 60 * 8; i++) w = wetStep(w, 1, 1 / 60, cfg);
assert.ok(w > 0.4 && w < 0.7, `about half wet after 8 s of rain (${w})`);
for (let i = 0; i < 60 * 12; i++) w = wetStep(w, 1, 1 / 60, cfg);
assert.equal(w, 1);
const dry = wetStep(1, 0, 1, cfg);
assert.ok(dry < 1 && dry > 0.9, 'dries slowly');
assert.ok(Math.abs(wetStep(0.5, 0.02, 1, cfg) - (0.5 - 1 / cfg.wet.dry)) < 1e-9, 'a drizzle below the threshold dries');
const th = [];
for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) th.push(wetThreshold(x, y));
assert.ok(th.every(t => t > 0 && t < 1), 'thresholds inside 0..1');
assert.ok(new Set(th.map(t => t.toFixed(2))).size > 60, 'thresholds are spread');
assert.equal(wetThreshold(5, 9), wetThreshold(5, 9), 'fixed per tile');
const shining = wv => th.filter(t => wetAlpha(wv, t) > 0).length;
assert.equal(shining(0), 0);
assert.ok(shining(0.3) > 100 && shining(0.3) < shining(0.7) && shining(0.7) < shining(1), 'more tiles shine as it gets wetter');
assert.equal(shining(1), th.length);
// a view over a small map: only paved tiles that still show their own surface get a sheen, capped
const map = ['aaaa', 'acga', 'aapa', 'aaaa'].map(r => [...r].map(c => ({ a: 'asphalt', c: 'concrete', g: 'grass', p: 'path' }[c])));
const out = new Int32Array(4 * 64);
const base = (x, y) => map[y][x];
const view = { x: 0, y: 0, right: 63, bottom: 63 };
const n1 = collectWet(out, 64, view, 16, 4, 4, base, base, cfg.wet.classes, 4);
assert.equal(n1, 15, 'every paved tile of the map (the grass tile has no sheen)');
assert.equal(collectWet(out, 64, view, 16, 4, 4, base, (x, y) => (x === 1 && y === 1 ? 'puddle' : base(x, y)), cfg.wet.classes, 4), 14, 'a puddle keeps its own look');
assert.equal(collectWet(out, 5, view, 16, 4, 4, base, base, cfg.wet.classes, 4), 5, 'capped');
collectWet(out, 64, view, 16, 4, 4, base, base, cfg.wet.classes, 4);
assert.ok([...Array(n1).keys()].every(i => out[i * 4 + 3] >= 0 && out[i * 4 + 3] < 4 && (out[i * 4 + 2] === 0 || out[i * 4 + 2] === 1)));

// ---- noise banks: deterministic, tileable, posterised with dither
const a = noiseTile(64, 5, 3, 3);
assert.deepEqual(a, noiseTile(64, 5, 3, 3), 'seeded');
assert.ok(a.every(x => x >= 0 && x <= 1));
const mean = a.reduce((s, x) => s + x, 0) / a.length;
assert.ok(mean > 0.35 && mean < 0.65, `balanced (${mean})`);
let seam = 0;
for (let i = 0; i < 64; i++) seam = Math.max(seam, Math.abs(a[i * 64] - a[i * 64 + 63]), Math.abs(a[i] - a[63 * 64 + i]));
assert.ok(seam < 0.15, `tiles without a seam (${seam})`);
assert.notDeepEqual(a, noiseTile(64, 6, 3, 3), 'another seed, another field');
for (const d of [0, 0.3, 0.7, 1]) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) assert.ok(bandLevel(d, 4, x, y) >= 0 && bandLevel(d, 4, x, y) <= 4);
assert.equal(bandLevel(1, 4, 3, 3), 4);
assert.equal(bandLevel(0, 4, 3, 3), 0);
const hz = hazePixels(a, 64, cfg.fog.lo, cfg.fog.hi, cfg.steps, [255, 255, 255]);
const alphas = new Set();
for (let i = 3; i < hz.length; i += 4) alphas.add(hz[i]);
assert.ok(alphas.size <= cfg.steps + 1 && alphas.size >= 3, `the haze has ${alphas.size} flat levels`);
const sp = shadowPixels(a, 64, cfg.clouds.lo, cfg.clouds.hi, [40, 52, 92]);
let on = 0;
for (let i = 3; i < sp.length; i += 4) { assert.ok(sp[i] === 0 || sp[i] === 255, 'cloud shadow pixels are on or off'); if (sp[i]) on++; }
const cover = on / (sp.length / 4);
assert.ok(cover > 0.05 && cover < 0.7, `clouds cover part of the ground (${cover.toFixed(2)})`);

// ---- ripples, reflections, drift
assert.equal(rippleFrame(0, 0.8, 3), 0);
assert.equal(rippleFrame(0.5, 0.8, 3), 1);
assert.equal(rippleFrame(0.79, 0.8, 3), 2);
assert.equal(rippleFrame(0.8, 0.8, 3), -1);
const lamps = [{ id: 0, on: true }, { id: 1, on: false }, { id: 2, on: true }, { id: 3, on: true }];
const picked = [];
assert.equal(pickReflections(lamps, 2, picked, l => l.on), 2);
assert.deepEqual(picked.slice(0, 2).map(l => l.id), [0, 2]);
assert.equal(pickReflections(lamps, 9, picked, l => l.on), 3);
const dr = drift({ x: 0, y: 0 }, cfg);
assert.ok(dr.x > 0, 'a calm day still moves');
assert.ok(drift({ x: 1, y: 0 }, cfg).x > dr.x, 'the wind carries it');
assert.equal(smooth(0, 1, 0.5), 0.5);

// ---- data: the tier switches, the fog in the morning, the pass in the registry, the test flags
for (const k of ['fog', 'mist', 'clouds', 'curtain']) assert.ok(cfg.fade[k] >= 2, `${k} fades over seconds`);
for (const [id, t] of Object.entries(quality.tiers)) {
  const sw = t.atmosphere;
  assert.ok(sw, `${id} has atmosphere switches`);
  for (const k of ['pass', 'fog', 'mist', 'clouds', 'curtain']) assert.equal(typeof sw[k], 'boolean', `${id}.${k}`);
  for (const k of ['wet', 'reflections', 'ripples']) assert.ok(Number.isInteger(sw[k]) && sw[k] >= 0, `${id}.${k}`);
}
const T = quality.tiers;
assert.equal(T.low.atmosphere.pass, false, 'Low draws the haze as banks, not as a camera pass');
assert.equal(T.low.atmosphere.reflections, 0);
assert.ok(T.low.atmosphere.wet > 0 && T.low.atmosphere.wet < T.medium.atmosphere.wet && T.medium.atmosphere.wet < T.high.atmosphere.wet);
assert.ok(T.medium.atmosphere.pass && T.high.atmosphere.pass);
assert.ok(T.high.atmosphere.wet <= 800, 'inside the tile pool of render/Atmosphere.js');
assert.ok(T.high.atmosphere.ripples <= 64);
assert.ok(cfg.wet.depth < -0.8 && cfg.wet.depth > -0.9, 'the sheen lies over puddles and under the cast shadows');
const hints = day.phases.find(p => p.id === 'morning').weather;
assert.ok(hints.some(x => x.state === 'fog' && x.chance > 0 && x.chance <= 0.5), 'some mornings are foggy');
assert.ok(text('render/pipelines/GradeFx.js').includes('atmosphere(c.rgb'), 'the grade pass carries the atmosphere');
assert.ok(text('physics/Weather.js').includes('fogOff') && text('render/Atmosphere.js').includes('ripplesOff'), 'the hooks exist');
const env = text('scripts/smoke/env.js');
assert.ok(env.includes('game.fogOff = true') && env.includes('game.ripplesOff = true'), 'the scripted runs switch the new random effects off');
assert.ok(!/Math\.random/.test(text('render/Atmosphere.js').replace(/\/\/.*$/gm, '')), 'the atmosphere never reads Math.random (seeded runs stay repeatable)');
console.log(`atmosphere ok: ${Object.keys(cfg.fade).length} eased layers, haze up to ${cfg.fog.density}, wet ground in ${cfg.wet.rise}+ s, noise banks tile, tier switches for ${Object.keys(T).length} tiers`);
