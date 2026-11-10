// Particle overhaul (story 16.11, AD-31, CAP-35, CAP-31): the pixel shapes and their sheet, every emitter config (frames that exist, colour ramps, wind),
// the surface footsteps, the glowing particles and the lights they hold (taken, followed, given back), the celebration bursts, the tier budget and
// the test flags of the new always-on effects. The running particles are covered by the smoke scenario `particles` and scripts/particle-frames.mjs.
// Run: node scripts/check-particles.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHAPES, SHADES, SHEET, sheetLayout } from '../scenes/particleShapes.js';
import { FlashLights, GlowTracker, hexInt, holds, roomFor } from '../particles/particleMath.js';
import { LightPool } from '../render/lightMath.js';

const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = p => JSON.parse(text(p));
const part = json('data/particles.json');
const quality = json('data/quality.json');
const lighting = json('data/lighting.json');
const surfaces = json('data/surfaces.json');
const env = text('scripts/smoke/env.js');
const hub = text('particles/ParticleHub.js');

// ---- shapes: rectangular bitmaps from the shade set, packed without overlap
for (const [name, rows] of Object.entries(SHAPES)) {
  assert.ok(rows.every(r => r.length === rows[0].length), `${name}: rows are equally long`);
  assert.ok([...rows.join('')].every(c => c === '.' || c in SHADES), `${name}: only shade letters`);
  assert.ok(rows.join('').replace(/\./g, '').length >= 1 && rows[0].length <= 8 && rows.length <= 8, `${name}: a small shape with pixels`);
}
const lay = sheetLayout();
for (let i = 0; i < lay.frames.length; i++) {
  const a = lay.frames[i];
  assert.ok(a.x + a.w <= lay.w && a.y + a.h <= lay.h, `${a.name} fits the sheet`);
  for (const b of lay.frames.slice(i + 1)) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.name} and ${b.name} do not overlap`);
}
assert.equal(lay.frames.length, Object.keys(SHAPES).length);
assert.ok(lay.w <= 40 && lay.h <= 40, `the sheet stays small (${lay.w}x${lay.h} base px)`);

// ---- emitters: frames exist, ramps and eases are well formed, shares and wind sane
const frames = new Set(Object.keys(SHAPES));
const EASES = /^(Linear|(Quad|Cubic|Sine|Expo)\.ease(In|Out|InOut))$/;
let sheetEmitters = 0;
for (const [id, e] of Object.entries(part.emitters)) {
  const c = e.config;
  if (e.texture === SHEET) {
    sheetEmitters++;
    assert.ok(Array.isArray(c.frame) && c.frame.length >= 1 && c.frame.every(f => frames.has(f)), `${id}: frames exist in the sheet`);
  }
  if (c.color) {
    assert.ok(Array.isArray(c.color) && c.color.length >= 2 && c.color.every(Number.isInteger), `${id}: colour ramp of 2+ colours`);
    assert.equal(c.tint, undefined, `${id}: a colour ramp replaces the tint`);
  }
  for (const k of ['alpha', 'scale', 'rotate']) if (c[k]?.ease) assert.match(c[k].ease, EASES, `${id}.${k}: ease`);
  if (c.colorEase) assert.match(c.colorEase, EASES, `${id}: colorEase`);
  assert.ok(e.share > 0 && e.share <= 0.25 && e.depth > 8000 && e.depth < 9500, `${id}: share and depth`);
}
assert.ok(sheetEmitters >= 15, `the particles use the sheet (${sheetEmitters} emitters)`);
for (const id of ['stepdust', 'crown', 'drip', 'smoke', 'leaffall', 'petal', 'mote', 'ember', 'sparkle']) assert.ok(part.emitters[id], `emitter ${id}`);
for (const id of ['smoke', 'leaffall', 'petal']) assert.ok(part.emitters[id].windGain > 0, `${id} drifts with the wind`);
assert.ok(part.emitters.fire.config.color && part.emitters.spark.config.color && part.emitters.smoke.config.color, 'fire, sparks and smoke change colour over their life');
for (const id of ['stepdust', 'crown', 'drip', 'smoke']) assert.ok(part.emitters[id].config.alpha.ease, `${id}: eased fade`);

// ---- surfaces: footsteps and wheel dust per surface, tints for the puffs, the crown in water
const steps = Object.entries(part.surfaceFx).filter(([, fx]) => fx.step);
assert.ok(steps.length >= 4, 'dust, sand, snow and water have footsteps');
for (const [id, fx] of steps) assert.ok(part.emitters[fx.step.name], `${id}: step emitter ${fx.step.name}`);
assert.equal(part.surfaceFx.splash.step.name, 'crown', 'water makes crowns');
for (const [id, s] of Object.entries(surfaces)) if (s.particle === 'dust-grey' || s.particle === 'dust-sand' || s.particle === 'snow-puff' || s.particle === 'grass-bits') assert.ok(part.footsteps.tints[s.particle] !== undefined, `${id}: puff tint`);
assert.ok(part.surfaceEmit.stepMinSpeed < part.surfaceEmit.wheelMinSpeed && part.surfaceEmit.stepInterval > part.surfaceEmit.wheelInterval, 'walkers step slower than wheels');
assert.ok(part.footsteps.dripSeconds > 0 && part.footsteps.ollie >= 1);

// ---- glow: only emitters that exist, small pools of light, a tier budget inside the light pool
for (const [id, g] of Object.entries(part.glow.emitters)) {
  assert.ok(part.emitters[id], `glow ${id}`);
  assert.ok(g.radius >= 8 && g.radius <= 24 && g.intensity > 0 && g.intensity <= 1 && /^#[0-9a-f]{6}$/i.test(g.color), `glow ${id}: small, warm`);
}
assert.ok(part.glow.emitters.firefly && part.glow.emitters.sparkle && part.glow.emitters.spark, 'fireflies, sparkles and sparks glow');
for (const [id, t] of Object.entries(quality.tiers)) {
  assert.ok(Number.isInteger(t.particleLights) && t.particleLights >= 0, `${id}: particleLights`);
  assert.ok(t.particleLights <= t.maxLights - lighting.vehicles.reserve - t.windowLights || t.maxLights === 0, `${id}: particle lights fit beside lamps, windows and vehicles (${t.particleLights})`);
  if (!t.lightMap) assert.equal(t.particleLights, 0, `${id}: no light map, no particle lights`);
}
assert.ok(quality.tiers.high.particleLights > quality.tiers.medium.particleLights);

// ---- the GlowTracker against the real light pool: take, follow, fade, give back
const mkParticle = (emitter, x = 10, y = 20) => ({ x, y, alpha: 1, emitter, life: true, isAlive() { return this.life; } });
{
  const pool = new LightPool(8);
  pool.setLimit(8);
  const em = {}, other = {};
  const g = new GlowTracker(pool);
  const spec = { radius: 17, color: hexInt('#e4f58a'), intensity: 0.8 };
  const a = mkParticle(em), b = mkParticle(em), c = mkParticle(other);
  assert.ok(g.start(a, spec) && g.start(b, spec) && g.start(c, spec));
  assert.equal(g.count, 3); assert.equal(pool.count, 3, 'each glowing particle holds one light');
  assert.ok(g.start(a, spec) && g.count === 3 && pool.count === 3, 'a particle re-emitted before the sweep keeps its one light');
  a.x = 50; a.alpha = 0.5; g.update();
  assert.equal(a.glowH.alive, true);
  const slot = pool.active.find(s => s.x === 50);
  assert.ok(slot && Math.abs(slot.intensity - 0.4) < 1e-9, 'the light follows the particle and fades with its alpha');
  b.life = false; g.update();
  assert.equal(g.count, 2); assert.equal(pool.count, 2, 'a dead particle gives its light back');
  assert.equal(b.glowH, null);
  g.drop(em);
  assert.equal(g.count, 1); assert.equal(pool.count, 1, 'clearing an emitter gives back its lights, not the others');
  pool.releaseAll(); g.update();
  assert.equal(g.count, 0, 'a cleared pool empties the tracker');
  const full = new LightPool(2); full.setLimit(2);
  const t = new GlowTracker(full);
  assert.ok(t.start(mkParticle(em), spec) && t.start(mkParticle(em), spec));
  const late = mkParticle(em);
  assert.equal(t.start(late, spec), false); assert.equal(late.glowH, undefined, 'a full pool gives no light and no leak');
  t.clear();
  assert.equal(full.count, 0, 'clear gives everything back');
  for (let i = 0; i < 1000; i++) { const p = mkParticle(em); t.start(p, spec); if (i % 3 === 0) p.life = false; t.update(); }
  t.clear();
  assert.equal(full.count, 0); assert.equal(t.count, 0, 'a thousand short lives leave nothing behind');
}
{
  const pool = new LightPool(4); pool.setLimit(4);
  const f = new FlashLights(pool, 2);
  assert.ok(f.add({ x: 0, y: 0, radius: 40, intensity: 1 }, 0.5) && f.add({ x: 0, y: 0, radius: 40, intensity: 1 }, 0.5));
  assert.equal(f.add({ x: 0, y: 0, radius: 40, intensity: 1 }, 0.5), false, 'at most `cap` flashes');
  f.update(0.2); assert.equal(pool.count, 2);
  f.update(0.4); assert.equal(pool.count, 0, 'a flash gives its light back when its time is up');
  f.add({ x: 0, y: 0, radius: 40, intensity: 1 }, 5); f.clear();
  assert.equal(pool.count, 0);
}

// ---- budget and conditions
assert.equal(roomFor(5, 300, 100), 5); assert.equal(roomFor(5, 300, 298), 2); assert.equal(roomFor(5, 300, 300), 0); assert.equal(roomFor(5, 300, 400), 0);
for (const t of Object.values(quality.tiers)) assert.ok(roomFor(1e9, t.maxParticles, 0) === t.maxParticles);
assert.ok(holds({ seasons: ['spring'], day: true }, { season: 'spring', phase: 'afternoon', weather: 'clear', daylight: true }));
assert.ok(!holds({ seasons: ['spring'], day: true }, { season: 'spring', phase: 'afternoon', weather: 'clear', daylight: false }));
assert.ok(!holds({ notWeather: ['rain'] }, { season: 'spring', phase: 'x', weather: 'rain', daylight: true }));
assert.equal((hub.match(/emitParticleAt\(/g) ?? []).length, 2, 'the hub emits in two places only: put (the budget) and createFor (the minigame scene)');

// ---- seasonal effects: the new ones exist, their flags are in the smoke env
const byId = new Map(part.seasonal.list.map(e => [e.id, e]));
for (const need of ['petals', 'falling-leaves', 'lamp-embers', 'dust-motes']) assert.ok(byId.has(need), `${need} exists`);
assert.deepEqual(byId.get('petals').when.seasons, ['spring']); assert.deepEqual(byId.get('falling-leaves').when.seasons, ['autumn']);
assert.equal(byId.get('dust-motes').indoor, true, 'motes drift indoors'); assert.equal(byId.get('dust-motes').at, 'shaft'); assert.equal(byId.get('lamp-embers').at, 'lamp');
for (const e of part.seasonal.list.filter(e => ['petals', 'falling-leaves', 'lamp-embers', 'dust-motes'].includes(e.id))) assert.ok(e.flag && env.includes(`'${e.flag}'`), `${e.id}: test flag ${e.flag} is set by the smoke env`);
for (const f of ['footstepsOff', 'dripsOff', 'glowOff']) { assert.ok(env.includes(`'${f}'`), `${f} in the smoke env`); assert.ok(hub.includes(`flag('${f}')`), `${f} is read by the hub`); }

// ---- celebrations
for (const [name, ev] of [['levelup', 'level:up'], ['achievement', 'achievement:unlocked'], ['sticker', 'sticker:collected']]) {
  const c = part.celebrate[name];
  assert.ok(c.bursts.length >= 2 && c.bursts.every(([id, n]) => part.emitters[id] && n >= 1 && n <= 20), `${name}: bursts`);
  assert.ok(c.light.radius <= 64 && c.light.seconds > 0 && c.light.seconds <= 1.2, `${name}: a short flash`);
  assert.ok(hub.includes(`'${ev}'`) && hub.includes(`'${name}'`), `${name}: wired to ${ev}`);
}

// ---- wiring
assert.ok(text('scenes/BootScene.js').includes('makeParticleSheet(this, res.scale)'), 'the sheet is made at boot');
assert.ok(text('entities/LootDrops.js').includes("'sparkle'"), 'loot pickups sparkle');
assert.ok(text('entities/Bike.js').includes('particles.puffAt('), 'bike skids puff');
console.log(`particles ok: ${lay.frames.length} frames on a ${lay.w}x${lay.h} sheet, ${sheetEmitters} emitters, ${steps.length} step effects, glow tracker and flashes release their lights, budget guard, ${part.seasonal.list.length} seasonal effects`);
