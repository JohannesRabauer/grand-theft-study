// Street dressing (story 16.9, CAP-35, CAP-34): the props and decals worked out from the tile neighbours and objects are seeded,
// stay off object tiles and doors, sit on open ground beside the right neighbours, stay within the tier caps, and never touch the
// grid. Also: the park lamp's lantern is where its light is, every key a decal or prop names has art, the wiring. Run: node scripts/check-street.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildingInfo } from '../render/buildingMath.js';
import { streetInfo, decalKeys, inSchoolyard, PROP_VARIANTS, POSTERS, CHALKS, PLAYS, WEED_VARIANTS, LEAF_VARIANTS, PARK_LAMP, SIDES } from '../render/streetMath.js';
import { mapSeed } from '../scenes/GroundArt.js';
import { groundKeys, prepareEnvArtForTest } from '../scenes/EnvArt.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cfg = json('data/street.json');
const quality = json('data/quality.json');
const lighting = json('data/lighting.json');
const town = json('data/maps/town.json');
const seed = mapSeed(town, 'town');
const bInfo = buildingInfo(town, seed, 4);
const before = JSON.stringify(town.rows) + JSON.stringify(town.objects);
const info = streetInfo(town, seed, bInfo, cfg);
const idAt = info.idAt;

// ---- props
const kinds = new Map();
for (const p of info.props) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
for (const k of ['planter', 'bollard', 'hydrant', 'letterbox', 'recycle', 'bike', 'sign', 'kiosk', 'pfand']) assert.ok(kinds.get(k) > 0, `the town has ${k} dressing (${kinds.get(k)})`);
assert.ok(info.props.length >= 80, `the streets are dressed (${info.props.length} props)`);
assert.ok(info.props.length <= 700, `dressing stays modest (${info.props.length})`);
for (const p of info.props) {
  assert.ok(p.v >= 0 && p.v < PROP_VARIANTS[p.kind], `${p.kind} variant ${p.v}`);
  assert.equal(p.depth, p.y, 'a prop sorts by its feet');
  if (p.object) continue;
  assert.ok(!info.used.has(`${p.tx},${p.ty}`), `${p.kind} at ${p.tx},${p.ty} stands on an object or door tile`);
  assert.ok(['concrete', 'cobble', 'grass', 'path'].includes(idAt(p.tx, p.ty)), `${p.kind} at ${p.tx},${p.ty} stands on open ground (${idAt(p.tx, p.ty)})`);
}
const near = kinds.get('hydrant') > 1 ? info.props.filter(p => p.kind === 'hydrant') : [];
for (const a of near) for (const b of near) if (a !== b) assert.ok(Math.abs(a.tx - b.tx) > 9 || Math.abs(a.ty - b.ty) > 9, 'hydrants keep their distance');
const roadNext = p => ['n', 's'].some(s => ['asphalt', 'lane', 'puddle'].includes(idAt(p.tx, p.ty + (s === 'n' ? -1 : 1))));
for (const p of info.props.filter(q => ['bollard', 'hydrant', 'sign'].includes(q.kind))) assert.ok(roadNext(p), `${p.kind} at ${p.tx},${p.ty} stands at a kerb`);
for (const p of info.props.filter(q => ['planter', 'recycle'].includes(q.kind))) assert.equal(idAt(p.tx, p.ty - 1), 'wall', `${p.kind} at ${p.tx},${p.ty} stands against a wall`);
for (const p of info.props.filter(q => q.kind === 'letterbox')) assert.ok(['fence', 'hedge'].some(k => idAt(p.tx - 1, p.ty) === k || idAt(p.tx + 1, p.ty) === k) || idAt(p.tx, p.ty - 1) === 'wall', 'a letterbox stands at a fence, hedge or house');
const kiosk = info.props.find(p => p.kind === 'kiosk');
const stand = town.objects.find(o => o.type === 'newsstand');
assert.ok(kiosk.tx === stand.x && kiosk.ty === stand.y, 'the kiosk is at the newsstand');

// ---- seeded: the same map gives the same street
const again = streetInfo({ ...town }, seed, buildingInfo({ ...town }, seed, 4), cfg);
assert.equal(JSON.stringify(again.props.map(p => [p.kind, p.v, p.x, p.y])), JSON.stringify(info.props.map(p => [p.kind, p.v, p.x, p.y])), 'the same map always gets the same props');

// ---- the caps of the tiers: pools never exceed them and the Low pool is the smallest
const t = quality.tiers;
assert.ok(t.low.streetProps > 0 && t.low.streetProps <= t.medium.streetProps && t.medium.streetProps <= t.high.streetProps, 'street prop pools grow with the tier');
assert.ok(t.high.streetProps <= 200, 'the street prop pool stays small enough to draw in one batch');
let maxView = 0;
for (let vx = 0; vx < info.cols * 16 - 480; vx += 40) for (let vy = 0; vy < info.rows * 16 - 270; vy += 40) {
  const n = info.props.filter(p => p.x > vx - cfg.margin && p.x < vx + 480 + cfg.margin && p.y > vy - cfg.margin && p.y < vy + 270 + cfg.margin + 20).length;
  if (n > maxView) maxView = n;
}
assert.ok(maxView <= t.medium.streetProps, `a screen holds ${maxView} props at most, Medium's pool is ${t.medium.streetProps}`);
assert.ok(maxView <= t.low.streetProps * 1.5, `Low's pool covers most of a screen (${maxView})`);

// ---- decals
const counts = {};
for (let y = 0; y < info.rows; y++) for (let x = 0; x < info.cols; x++) {
  const keys = decalKeys(info, x, y);
  for (const k of keys) {
    const fam = k.replace(/-\d+$/, '').replace(/-[nesw]$/, '');
    counts[fam] = (counts[fam] ?? 0) + 1;
    const n = +k.match(/-(\d+)$/)[1];
    const lim = k.startsWith('env-poster') ? POSTERS : k.startsWith('env-chalk') ? CHALKS : k.startsWith('env-play') ? PLAYS : k.startsWith('env-kweed') ? WEED_VARIANTS : LEAF_VARIANTS;
    assert.ok(n < lim, `${k} has art`);
  }
  if (keys.some(k => k.startsWith('env-play') || k.startsWith('env-chalk-'))) assert.ok(!info.used.has(`${x},${y}`), `markings at ${x},${y} are on a free tile`);
  if (keys.some(k => k.startsWith('env-poster'))) assert.equal(idAt(x, y), 'wall', 'posters hang on walls');
}
for (const fam of ['env-poster', 'env-chalk', 'env-play', 'env-kweed', 'env-gleaf']) assert.ok(counts[fam] > 10, `${fam} decals are placed (${counts[fam]})`);
let yard = 0;
for (let y = 0; y < info.rows; y++) for (let x = 0; x < info.cols; x++) if (inSchoolyard(info, x, y)) yard++;
assert.ok(yard > 30, `the schoolyard has ground (${yard} tiles)`);

// ---- groundKeys carries them, within the layer limit; the grid and the objects stay untouched
prepareEnvArtForTest({ grass: 4, asphalt: 4, cobble: 3, path: 3, concrete: 4, water: 3 }, cfg);
let layers = 0;
let max = 0;
for (let y = 0; y < info.rows; y++) for (let x = 0; x < info.cols; x++) {
  const keys = groundKeys(town, x, y, 'base-x', 'town');
  layers += keys.filter(k => /^env-(poster|chalk|play|kweed|gleaf)/.test(k)).length;
  max = Math.max(max, keys.length);
}
assert.ok(layers > 100, `groundKeys draws the decals (${layers})`);
assert.ok(max <= 14, `no tile needs more than 14 layers (${max})`);
assert.equal(JSON.stringify(town.rows) + JSON.stringify(town.objects), before, 'dressing must not modify map data');

// ---- the lamp heads: the park lamp's lantern is where its light is, and the same as the street lamp head of variant 0
const sources = lighting.sources.filter(s => s.id.startsWith('park-lamp'));
assert.ok(sources.length >= 3, 'the park lamps have lights');
for (const s of sources) assert.deepEqual(s.offset, PARK_LAMP.head, `${s.id}: the light is at the lantern`);
assert.deepEqual(lighting.street.head[0], PARK_LAMP.head, 'the park lantern matches the street lamp head of variant 0');

// ---- wiring
assert.match(text('scenes/GameScene.js'), /new StreetProps\(/, 'the world system is created');
assert.match(text('scenes/GameScene.js'), /streetProps\.update/, 'and updated');
assert.match(text('scenes/BootScene.js'), /makeStreetAtlas/, 'the atlas is drawn at boot');
assert.match(text('.github/workflows/pages.yml'), /data/, 'the data folder is published');
console.log(`street ok: ${info.props.length} props (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}), most in one view ${maxView}, decals ${Object.entries(counts).map(([k, n]) => `${k.replace('env-', '')} ${n}`).join(', ')}`);
