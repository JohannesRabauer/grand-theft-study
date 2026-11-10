// Water (story 16.8, AD-31, CAP-35): bodies of the town, the noise-bent shore, bridges, the mask, the shore layer, the frames of the
// fallback loop and the wiring. Run: node scripts/check-water.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waterBodies, buildBody, maskLayer, shoreLayer, fallbackFrame, waterColor, flowPhase, isBridge, tileKind, K, TILE, pickLights, glintLevel, hash01 } from '../render/waterMath.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cfg = json('data/water.json');
const town = json('data/maps/town.json');
const quality = json('data/quality.json');
const before = JSON.stringify(town.rows);

// ---- bodies: every water tile belongs to exactly one body, and the town has a pond, canals and bridges
const bodies = waterBodies(town);
const waterTiles = town.rows.reduce((n, row) => n + [...row].filter(c => town.legend[c] === 'water').length, 0);
assert.equal(bodies.reduce((n, b) => n + b.tiles.length, 0), waterTiles, 'every water tile is in one body');
assert.ok(bodies.length >= 5, `the town has a pond, canals and a river (${bodies.length} bodies)`);
assert.deepEqual(waterBodies(town).map(b => b.tiles.length), bodies.map(b => b.tiles.length), 'bodies are found the same way every time');
let bridges = 0;
town.rows.forEach((row, y) => [...row].forEach((_, x) => { if (isBridge(town, x, y)) bridges++; }));
assert.equal(bridges, 4, `the canal crossings are bridges (${bridges} tiles)`);
assert.equal(tileKind(town, 14, 29), K.BRIDGE, 'the first canal bridge');
assert.equal(tileKind(town, 13, 29), K.WATER);
assert.equal(tileKind(town, 12, 27), K.SOFT, 'grass is a soft bank');

// ---- the shore is bent: not a rectangle, deterministic, inside the data limits
const pond = bodies.filter(b => b.tiles.length > 60).sort((a, b) => b.tiles.length - a.tiles.length)[0];
const seed = 12345;
const body = buildBody(town, pond, cfg, seed);
const again = buildBody(town, pond, cfg, seed);
assert.deepEqual(body.t, again.t, 'the same seed bends the shore the same way');
assert.notDeepEqual(body.t, buildBody(town, pond, cfg, seed + 1).t, 'another seed bends it another way');
assert.equal(body.w, (pond.x1 - pond.x0 + 1) * TILE + 2 * cfg.margin);
// the shore line along the top edge of a rectangular pond wanders by several pixels
const top = pond.y0 * TILE - body.oy;
const edgeRow = x => { for (let y = 0; y < body.h; y++) if (body.t[y * body.w + x] > 0) return y; return -1; };
const rowsAlong = [];
for (let x = (pond.x0 + 2) * TILE - body.ox; x < (pond.x1 - 1) * TILE - body.ox; x++) rowsAlong.push(edgeRow(x));
const spread = Math.max(...rowsAlong) - Math.min(...rowsAlong);
assert.ok(spread >= 3, `the top shore wanders (${spread} px between its highest and lowest point)`);
let longest = 0;
let run = 1;
for (let i = 1; i < rowsAlong.length; i++) { run = rowsAlong[i] === rowsAlong[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
assert.ok(longest <= 24, `no straight shore run beyond the seam limit (${longest} px)`);
for (let i = 0; i < body.t.length; i++) assert.ok(Math.abs(body.t[i]) < 400);
// outward leak stays small: water never reaches further than amp + 1 px past the tile outline
let leak = 0;
for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) {
  if (body.t[y * body.w + x] <= 0) continue;
  const tx = Math.floor((body.ox + x) / TILE);
  const ty = Math.floor((body.oy + y) / TILE);
  if (body.mine.has(ty * body.cols + tx)) continue;
  for (let d = 1; d <= cfg.margin; d++) {
    const near = [[x - d, y], [x + d, y], [x, y - d], [x, y + d]].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < body.w && ny < body.h && body.mine.has(Math.floor((body.oy + ny) / TILE) * body.cols + Math.floor((body.ox + nx) / TILE)));
    if (near) { leak = Math.max(leak, d); break; }
  }
}
assert.ok(leak <= Math.ceil(cfg.amp) + 1, `water leaks at most ${Math.ceil(cfg.amp) + 1} px past a tile edge (${leak})`);

// ---- a bridge tile is never water, and its water side gets a pier
const canal = bodies.find(b => b.tiles.some(([x, y]) => x === 13 && y === 29));
const cb = buildBody(town, canal, cfg, seed);
for (let y = 0; y < cb.h; y++) for (let x = 0; x < cb.w; x++) {
  if (cb.kindOf(Math.floor((cb.ox + x) / TILE), Math.floor((cb.oy + y) / TILE)) === K.BRIDGE) assert.ok(cb.t[y * cb.w + x] <= 0, 'no water on a bridge tile');
}
const cs = shoreLayer(cb, cfg, seed);
const pierPx = ((29 * TILE + 8) - cb.oy) * cb.w + (13 * TILE + TILE - 2 - cb.ox);
assert.equal(cs[pierPx * 4 + 3], 255, 'the stone face of the bridge pier stands in the water beside the bridge');

// ---- mask: R is the depth in 1/8 px where the water is, 0 elsewhere; G is noise; opaque
const mask = maskLayer(body);
let wet = 0;
for (let i = 0; i < body.t.length; i++) {
  assert.equal(mask[i * 4 + 3], 255);
  assert.equal(mask[i * 4] > 0, body.t[i] > 0, 'R > 0 exactly in the water');
  if (mask[i * 4] > 0) wet++;
}
assert.ok(wet > pond.tiles.length * TILE * TILE * 0.8, 'most of the tile area is water');

// ---- shore layer: banks of both kinds, stones and reeds exist, nothing in the open water
const layer = shoreLayer(body, cfg, seed);
let painted = 0;
let inWater = 0;
for (let i = 0; i < body.t.length; i++) if (layer[i * 4 + 3] > 0) { painted++; if (body.t[i] > 1) inWater++; }
assert.ok(painted > 400, `the pond has a bank (${painted} px)`);
assert.ok(inWater < painted * 0.2, 'banks and reeds hug the shore, the open water is clear');
const palette = new Set();
for (let i = 0; i < body.t.length; i++) if (layer[i * 4 + 3] === 255) palette.add(layer[i * 4] << 16 | layer[i * 4 + 1] << 8 | layer[i * 4 + 2]);
assert.ok(palette.size >= 8, `the shore layer uses several colours (${palette.size})`);
const reedGreen = parseInt(cfg.reeds.stalk[0].slice(1), 16);
assert.ok(palette.has(reedGreen), 'reeds grow along the bank');
const stoneEdge = parseInt(cfg.bank.stone[0].slice(1), 16);
// paving next to water gets a stone coping (no such bank in the town, so on a small map)
const paved = { legend: { S: 'concrete', W: 'water', G: 'grass' }, rows: ['SSSSS', 'SWWWS', 'SWWWS', 'SWWWS', 'SSSSS'] };
const pb = buildBody(paved, waterBodies(paved)[0], cfg, seed);
const pl = shoreLayer(pb, cfg, seed);
const stoneCols = new Set();
for (let i = 0; i < pb.t.length; i++) if (pl[i * 4 + 3] === 255) stoneCols.add(pl[i * 4] << 16 | pl[i * 4 + 1] << 8 | pl[i * 4 + 2]);
assert.ok(stoneCols.has(stoneEdge), 'paving gets a stone coping');
assert.ok(!stoneCols.has(parseInt(cfg.bank.soft[0].slice(1), 16)), 'and no mud');
assert.deepEqual(shoreLayer(body, cfg, seed), layer, 'the shore layer is deterministic');

// ---- the water surface: periodic frames, pixel-crisp palette, foam at the shore, deeper is darker
const pal = new Set([...cfg.palette.water, ...cfg.palette.foam, cfg.palette.shimmer, cfg.palette.glint].map(c => parseInt(c.slice(1), 16)));
const N = cfg.fallback.frames;
const f0 = fallbackFrame(body, cfg, 0, N);
const fN = fallbackFrame(body, cfg, N, N);
let seam = 0;
for (let i = 0; i < f0.length; i += 4) if (f0[i] !== fN[i] || f0[i + 1] !== fN[i + 1] || f0[i + 2] !== fN[i + 2] || f0[i + 3] !== fN[i + 3]) seam++;
assert.ok(seam < f0.length / 4 / 500, `the loop is seamless: frame N is frame 0 (${seam} pixels differ by float rounding)`);
const f1 = fallbackFrame(body, cfg, 1, N);
let diff = 0;
for (let i = 0; i < f0.length; i++) if (f0[i] !== f1[i]) diff++;
assert.ok(diff > 200, `consecutive frames differ (${diff} bytes)`);
for (let i = 0; i < body.t.length; i++) {
  if (f0[i * 4 + 3] === 0) { assert.ok(body.t[i] <= 0); continue; }
  assert.ok(pal.has(f0[i * 4] << 16 | f0[i * 4 + 1] << 8 | f0[i * 4 + 2]), 'every water pixel is a palette colour');
}
const lum = c => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
const deep = [];
const shallow = [];
for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) {
  const t = body.t[y * body.w + x];
  if (t > 16) deep.push(lum(waterColor(body.ox + x, body.oy + y, t, 0.5, 0.3, cfg)));
  else if (t > 4 && t < 6) shallow.push(lum(waterColor(body.ox + x, body.oy + y, t, 0.5, 0.3, cfg)));
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
assert.ok(mean(deep) < mean(shallow), 'the deep middle is darker than the shallows');
assert.equal(waterColor(10, 10, 0.2, 0.5, 1, cfg), parseInt(cfg.palette.foam[0].slice(1), 16), 'foam sits right at the shore');
assert.equal(flowPhase(0.07, cfg.flow), 0);
assert.ok(flowPhase(1, cfg.flow) > 0 && flowPhase(1.01, cfg.flow) === flowPhase(1, cfg.flow), 'the phase moves in whole time steps');

// ---- reflections: lights near a body, nearest first, capped; brighter closer, stepped
const slots = Array.from({ length: 20 }, (_, i) => ({ x: body.ox + 10 + i * 6, y: body.oy + 20, radius: 30, intensity: 1 }));
slots.push({ x: body.ox - 500, y: body.oy, radius: 30, intensity: 1 }, { x: body.ox + 40, y: body.oy + 20, radius: 30, intensity: 0 });
const picked = pickLights(slots, body, cfg, []);
assert.equal(picked.length, cfg.reflect.max, 'at most `max` reflections per body');
assert.ok(picked.every(s => s.intensity > 0 && s.x > body.ox - 100), 'dark and far lights are left out');
assert.ok(glintLevel(0, 2, 40, 3) > glintLevel(0, 30, 40, 3) && glintLevel(0, 80, 40, 3) === 0);
assert.ok([0, 1 / 3, 2 / 3, 1].includes(glintLevel(5, 5, 40, 3)), 'flat bands');
assert.ok(glintLevel(0, 20, 40, 3) >= glintLevel(0, -20, 40, 3), 'the glitter streaks downwards');

// ---- wiring: tier flags, fallback frames, pipeline registered, textures cleaned up, map untouched
assert.equal(quality.tiers.low.waterFx, false);
assert.equal(quality.tiers.medium.waterFx, true);
assert.equal(quality.tiers.high.waterFx, true);
assert.ok(text('render/pipelines/index.js').includes('WaterFx'), 'the water pipeline is registered');
assert.ok(text('scenes/GameScene.js').includes('new Water(') && text('scenes/GameScene.js').includes('this.water.update'), 'GameScene runs the water system');
assert.ok(text('render/Water.js').includes('unloadMap') && text('render/Water.js').includes('textures.remove'), 'textures are removed with the map');
assert.ok(text('render/Water.js').includes('fallbackFrame'), 'Low and Canvas keep an animated fallback');
assert.ok(text('particles/ParticleHub.js').includes("ground === 'water'"), 'rain rings the water');
assert.ok(text('entities/Critters.js').includes("ctx.particles.emit('ripple'"), 'ducks leave rings');
assert.equal(JSON.stringify(town.rows), before, 'the map data is untouched');
assert.equal(hash01(3, 4, 5), hash01(3, 4, 5));
console.log(`water ok: ${bodies.length} bodies, ${bridges} bridge tiles, shore spread ${spread} px, ${painted} bank px, ${N} loop frames`);
