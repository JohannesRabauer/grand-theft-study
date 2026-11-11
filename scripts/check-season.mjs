// Seasonal atmosphere (story 16.19, AD-31, CAP-35/30): the layer targets (snow cover, frost, heat, rays) and their easing, which tiles of the
// real town take snow, the thresholds that make the cover build up tile by tile, the frost border, the picks of beams and wisps, the data and the
// per-tier switches, the test flag. The running layers are covered by the smoke scenario `season` and scripts/season-frames.mjs.
// Run: node scripts/check-season.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  approach, coverTarget, coverStep, frostTarget, heatTarget, raysTarget, snowTiles, snowThreshold, snowAlpha, collectSnow, frostPixels,
  frostDepth, pickRays, pickWisps, KIND_ROOF, KIND_KERB
} from '../render/seasonMath.js';
import { buildingInfo } from '../render/buildingMath.js';

const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = p => JSON.parse(text(p));
const cfg = json('data/season.json');
const quality = json('data/quality.json');
const day = json('data/day.json');

// ---- the snow cover: snow lifts it to 1, a winter day holds it, spring melts it, indoors it waits
assert.equal(coverTarget(cfg, { season: 'autumn', snowing: true }), 1);
assert.equal(coverTarget(cfg, { season: 'winter', snowing: false }), cfg.cover.hold);
assert.equal(coverTarget(cfg, { season: 'spring', snowing: false }), 0);
let c = 0;
for (let i = 0; i < 60 * cfg.cover.rise; i++) c = coverStep(c, 1, 1 / 60, cfg, false);
assert.ok(c > 0.99, `full cover after the rise time (${c})`);
let worst = 0;
for (let i = 0; i < 60 * cfg.cover.melt * 1.1; i++) { const n = coverStep(c, 0, 1 / 60, cfg, false); worst = Math.max(worst, c - n); c = n; }
assert.equal(c, 0, 'melts away');
assert.ok(worst < 0.001, `melts in tiny steps (${worst})`);
assert.equal(coverStep(0.7, 0, 100, cfg, true), 0.7, 'indoors the cover only waits');
assert.ok(cfg.cover.melt > cfg.cover.rise, 'it melts slower than it builds');

// ---- tiles turn white one after the other
const ths = [];
for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) ths.push(snowThreshold(x, y));
assert.ok(Math.min(...ths) > 0 && Math.max(...ths) < 1);
const share = cv => ths.filter(t => snowAlpha(cv, t, cfg.cover.soft) > 0).length / ths.length;
assert.equal(share(0), 0);
assert.ok(share(0.3) > 0.1 && share(0.3) < share(0.6) && share(0.6) < share(1), 'more tiles with more cover');
assert.ok(ths.every(t => snowAlpha(1, t, cfg.cover.soft) >= 0.99), 'every tile is white at full cover');
let step = 0;
for (let k = 1; k <= 200; k++) for (const t of ths.slice(0, 50)) step = Math.max(step, Math.abs(snowAlpha(k / 200, t, cfg.cover.soft) - snowAlpha((k - 1) / 200, t, cfg.cover.soft)));
assert.ok(step < 0.03, `a tile never jumps by more than a few percent per 0.5 percent of cover (${step})`);

// ---- frost, heat and rays
assert.equal(frostTarget(cfg, { season: 'winter', snowing: false }), cfg.frost.winter);
assert.equal(frostTarget(cfg, { season: 'winter', snowing: true }), cfg.frost.snowing);
assert.equal(frostTarget(cfg, { season: 'spring', snowing: false }), 0);
assert.equal(frostTarget(cfg, { season: 'winter', snowing: true, indoor: true }), 0);
const heat = (season, state, minute, indoor = false) => heatTarget(cfg, { season, state, minute, indoor });
assert.equal(heat('summer', 'clear', 960), 1);
assert.equal(heat('spring', 'clear', 960), cfg.heat.seasons.spring);
assert.equal(heat('summer', 'rain', 960), 0, 'no shimmer in rain');
assert.equal(heat('winter', 'clear', 960), 0);
assert.equal(heat('spring', 'clear', 420), 0, 'no shimmer in the morning');
assert.equal(heat('summer', 'clear', 960, true), 0);
assert.ok(heat('spring', 'clear', 830) > 0 && heat('spring', 'clear', 830) < heat('spring', 'clear', 960), 'the heat builds up over the early afternoon');
const rays = (state, dark, indoor = false) => raysTarget(cfg, { state, dark, indoor });
assert.equal(rays('clear', 0), 1);
assert.equal(rays('rain', 0), 0, 'no beams under a rain sky');
assert.equal(rays('clear', 0.5), 0, 'none at night');
assert.ok(rays('clear', 0.08) > 0 && rays('clear', 0.08) < 1, 'beams fade out at dusk');
assert.ok(rays('fog', 0) < rays('clear', 0));
assert.equal(rays('clear', 0, true), 0);
assert.ok(Math.abs(approach(0, 1, 1, cfg.fade.rays) - 1 / cfg.fade.rays) < 1e-9, 'layers ease by dt / fade');

// ---- the real town: which tiles take snow
const town = json('data/maps/town.json');
const info = buildingInfo(town, 1, 4);
const V = cfg.cover.variants;
const tiles = snowTiles(town, info, V);
let roofs = 0, kerbs = 0;
for (let i = 0; i < tiles.kind.length; i++) {
  if (tiles.kind[i] === KIND_ROOF) { roofs++; assert.ok(tiles.frame[i] < V); }
  if (tiles.kind[i] === KIND_KERB) { kerbs++; assert.ok(tiles.frame[i] > V && tiles.frame[i] < V + 16); }
}
assert.ok(roofs > 800 && kerbs > 100, `roofs ${roofs}, kerbs ${kerbs}`);
const cols = town.rows[0].length;
for (let y = 0; y < town.rows.length; y++) for (let x = 0; x < cols; x++) {
  const name = town.legend[town.rows[y][x]];
  if (tiles.kind[y * cols + x] === KIND_ROOF) assert.equal(name, 'wall', 'roof snow lies on wall tiles only');
  if (tiles.kind[y * cols + x] === KIND_KERB) assert.ok(name === 'concrete' || name === 'path', 'kerb snow lies on pavement only');
}
const out = new Int32Array(3 * 800);
const view = { x: 800, y: 600, right: 1280, bottom: 870 };
const n = collectSnow(out, 800, view, 16, cols, town.rows.length, tiles);
assert.ok(n > 0 && n <= 31 * 18, `${n} snow tiles in one view`);
assert.equal(collectSnow(out, 5, view, 16, cols, town.rows.length, tiles), 5, 'the cap holds');

// ---- the frost border (Low and Canvas)
assert.ok(frostDepth(2, 2, 480, 270) < frostDepth(2, 100, 480, 270), 'corners freeze deeper than edges');
const fp = frostPixels(480, 270, cfg);
const alphaAt = (x, y) => fp[(y * 480 + x) * 4 + 3];
assert.ok(alphaAt(0, 135) > 0 && alphaAt(240, 135) === 0, 'frost at the edge, clear in the middle');
let max = 0;
for (let i = 3; i < fp.length; i += 4) max = Math.max(max, fp[i]);
assert.ok(max <= Math.round(cfg.frost.alpha * 255), 'the frost never gets opaque');

// ---- picks
const trees = Array.from({ length: 60 }, (_, i) => ({ tx: i, ty: (i * 3) % 7, cx: i * 20, cy: 300 }));
const picked = new Array(20);
const k = pickRays(trees, { x: 0, right: 480, y: 200, bottom: 400 }, 10, picked, 0.55);
assert.ok(k > 0 && k <= 10 && picked.slice(0, k).every(t => t.cx <= 504));
assert.equal(pickRays(trees, { x: 5000, right: 5480, y: 0, bottom: 270 }, 10, picked, 1), 0);
const xy = new Int32Array(64);
const w = pickWisps(xy, 20, { x: 0, y: 0, right: 480, bottom: 270 }, 16, 60, 40, () => true, 0.1);
assert.ok(w > 5 && w <= 20, `wisps ${w}`);
assert.equal(pickWisps(xy, 20, { x: 0, y: 0, right: 480, bottom: 270 }, 16, 60, 40, () => false, 0.1), 0);

// ---- data and per-tier switches
assert.ok(day.phases.some(p => p.season === 'winter') && day.phases.some(p => p.season === 'summer'));
for (const [id, t] of Object.entries(quality.tiers)) {
  const a = t.atmosphere;
  for (const key of ['snow', 'crowns', 'hedges', 'sparkle', 'shimmer', 'rays']) assert.ok(Number.isInteger(a[key]) && a[key] >= 0, `${id}.${key}`);
  assert.equal(typeof a.frost, 'boolean', `${id}.frost`);
  assert.ok(a.snow <= 800 && a.sparkle <= 64 && a.rays <= 128 && a.shimmer <= 64, `${id} pool caps`);
}
const sn = id => quality.tiers[id].atmosphere.snow;
assert.ok(sn('low') <= sn('medium') && sn('medium') <= sn('high'), 'tiers grow');
assert.ok(cfg.frost.alpha <= 0.7 && cfg.rays.alpha <= 0.4, 'effects stay gentle');
assert.match(text('scripts/smoke/env.js'), /game\.sparkleOff = true/, 'the scripted runs switch the glints off');
assert.ok(!/Math\.random\(/.test(text('render/Season.js')) && !/Math\.random\(/.test(text('render/seasonMath.js')), 'no Math.random in the seasonal layers');
console.log('check-season: ok');
