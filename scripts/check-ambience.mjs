// The particle set (story 12.2): every seasonal effect points at a real emitter and a real season or phase, every surface effect named in
// data/surfaces.json exists (snow footprints, ice chips ...), the ambient map objects (sprinkler, fountain) are in the town, and the numbers
// stay inside the particle budget. The running effects are covered by the smoke scenario `ambience`.
// Run: node scripts/check-ambience.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const part = load('data/particles.json');
const day = load('data/day.json');
const surfaces = load('data/surfaces.json');
const town = load('data/maps/town.json');
const quality = load('data/quality.json');
const boot = ['BootScene', 'HiResArt', 'ToolArt', 'ParkArt', 'ExpansionArt', 'DefenseArt'].map(f => readFileSync(new URL(`../scenes/${f}.js`, import.meta.url), 'utf8')).join(' ');
const seasons = new Set(day.phases.map(p => p.season));
const phases = new Set(day.phases.map(p => p.id));

// ---- emitters: a texture the game makes, a share that fits the budget
let share = 0;
for (const [id, e] of Object.entries(part.emitters)) {
  assert.ok(boot.includes(`'${e.texture}'`), `${id}: texture ${e.texture} is made by the art code`);
  assert.ok(e.share > 0 && e.share <= 0.25, `${id}: share`);
  share += e.share;
}
assert.ok(share <= 1.6, `the shares add up to a sane total (${share.toFixed(2)})`);

// ---- seasonal effects
const ids = new Set();
for (const e of part.seasonal.list) {
  assert.ok(!ids.has(e.id), `${e.id} is unique`); ids.add(e.id);
  assert.ok(part.emitters[e.emitter], `${e.id}: emitter ${e.emitter}`);
  assert.ok(e.rate > 0 && e.rate <= 12, `${e.id}: rate`);
  for (const s of e.when.seasons ?? []) assert.ok(seasons.has(s), `${e.id}: season ${s}`);
  for (const p of e.when.phases ?? []) assert.ok(phases.has(p), `${e.id}: phase ${p}`);
  for (const w of e.when.notWeather ?? []) assert.ok(['rain', 'snow', 'clear'].includes(w), `${e.id}: weather ${w}`);
  if (e.ground) assert.ok(surfaces[e.ground], `${e.id}: ground ${e.ground}`);
  assert.ok(e.when.seasons || e.when.phases, `${e.id}: has a season or a phase`);
}
for (const need of ['pollen', 'butterflies', 'fireflies', 'fog', 'leaf-piles']) assert.ok(ids.has(need), `${need} exists`);
const covered = new Set(part.seasonal.list.flatMap(e => e.when.seasons ?? []));
assert.ok(['autumn', 'spring', 'summer'].every(s => covered.has(s)), 'autumn, spring and summer each have their own life (winter has the snow)');
const perSec = part.seasonal.list.reduce((n, e) => n + e.rate, 0);
assert.ok(perSec < 30, 'the whole seasonal trickle stays small');

// ---- surface effects named by surfaces exist
for (const [id, s] of Object.entries(surfaces)) if (s.particle) assert.ok(part.surfaceFx[s.particle], `surface ${id}: effect ${s.particle} is defined`);
assert.equal(part.surfaceFx['snow-puff'].name, 'dust', 'snow footprints are white puffs');
assert.ok(part.emitters[part.surfaceFx['ice-chips'].name], 'ice chips');
for (const fx of Object.values(part.surfaceFx)) assert.ok(part.emitters[fx.name], `${fx.name} is an emitter`);

// ---- ambient map objects
const kinds = town.objects.filter(o => o.type === 'ambient').map(o => o.kind);
for (const k of ['steam', 'chimney', 'sprinkler', 'fountain']) assert.ok(kinds.includes(k), `the town has a ${k}`);
assert.ok(part.fountain.sprinklerEvery > 0 && part.fountain.fountainEvery > 0 && part.exhaust.interval > 0 && part.exhaust.minSpeed > 0);
for (const t of Object.values(quality.tiers)) assert.ok(t.maxParticles >= 100, 'a tier keeps room for the ambience');
console.log(`ambience ok: ${part.seasonal.list.length} seasonal effects, ${Object.keys(part.surfaceFx).length} surface effects, ambient kinds ${[...new Set(kinds)].join('/')}`);
