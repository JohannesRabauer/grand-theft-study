// Art tooling (story 16.1, CAP-35): the project skill, the art limits file, the look metrics and the recorded screenshot sets.
// Run: node scripts/check-lookmetrics.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { computeLookMetrics, LOOK_METRIC_KEYS } from './lib/look-metrics.mjs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ---- the skill: valid frontmatter with name (= folder) and a description that says when to load it
const skill = read('.claude/skills/schulweg-pixel-art/SKILL.md');
const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skill);
assert.ok(fm, 'SKILL.md starts with frontmatter');
const field = k => new RegExp(`^${k}: (.+)$`, 'm').exec(fm[1])?.[1].trim();
assert.equal(field('name'), 'schulweg-pixel-art', 'skill name matches its folder');
assert.ok(field('description') && field('description').length > 60 && /load/i.test(field('description')), 'skill description says when to load it');
for (const s of ['When to load', 'Review checklist', 'Recipes']) assert.ok(skill.includes(s), `SKILL.md has the section "${s}"`);

// ---- the art bible covers what AD-31 binds and quotes the limits file
const limits = JSON.parse(read('docs/art-limits.json'));
assert.equal(limits.schema, 1);
assert.ok(limits.longestSeamPx.max > 0 && limits.largestFlatAreaPx.max > 0, 'seam and flat-area limits are positive');
assert.ok(limits.minWalkableLuminance.min > 0 && limits.minWalkableLuminance.min < 1, 'the night luminance floor is between 0 and 1');
assert.ok(Array.isArray(limits.nightShots) && limits.nightShots.length > 0);
const bible = read('docs/ART-BIBLE.md');
for (const s of ['Palette ramps', 'Light direction', 'Silhouette rules', 'Light and shadow colours', 'Particle and shader catalogue', 'Kid-safe night look', 'Numeric limits'])
  assert.ok(bible.includes(s), `ART-BIBLE.md has the section "${s}"`);
for (const v of [limits.longestSeamPx.max, limits.largestFlatAreaPx.max, limits.minWalkableLuminance.min])
  assert.ok(bible.includes(`| ${v} |`), `ART-BIBLE.md quotes the limit ${v}`);

// ---- the metric function on synthetic frames (480x270 so one image pixel is one base pixel)
const W = 480, H = 270;
const frame = (fn) => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = fn(x, y); d.set([c[0], c[1], c[2], 255], (y * W + x) * 4); }
  return d;
};
const flat = computeLookMetrics(frame(() => [80, 160, 80]), W, H, []);
assert.equal(flat.largestFlatShare, 1, 'a single colour is one flat area');
assert.equal(flat.longestSeamPx, 0, 'a flat frame has no seam');
assert.equal(flat.distinctColors, 1);
assert.equal(flat.walkableLuminanceMin, null, 'no walkable tiles, no luminance');
const split = computeLookMetrics(frame(x => x < 100 ? [20, 20, 20] : [220, 220, 220]), W, H, [{ x: 0, y: 0, w: 16, h: 16 }, { x: 200, y: 100, w: 16, h: 16 }]);
assert.equal(split.longestSeamPx, H, 'a vertical split is a seam as tall as the frame');
assert.equal(split.longestSeamAxis, 'vertical');
assert.equal(split.largestFlatAreaPx, 380 * H, 'the larger half is the flat area');
assert.ok(split.walkableLuminanceMin < 0.1 && split.walkableLuminanceMin < split.meanLuminance, 'the dark tile sets the luminance minimum');
const noise = computeLookMetrics(frame((x, y) => ((x * 7 + y * 13) % 5) * 40 > 0 ? [(x * 31) % 256, (y * 17) % 256, (x + y) % 256] : [0, 0, 0]), W, H, []);
assert.ok(noise.largestFlatAreaPx < 200 && noise.distinctColors > 100, 'a noisy frame has no big flat area');
const big = computeLookMetrics(new Uint8ClampedArray(960 * 540 * 4).fill(255), 960, 540, []);
assert.equal(big.largestFlatAreaPx, 480 * 270, 'areas are reported in base pixels at 2x render size');
assert.deepEqual(Object.keys(flat), LOOK_METRIC_KEYS, 'the metric keys are the documented ones');

// ---- every recorded screenshot set: metrics.json schema, files present, medium and low cover the same shots
const root = new URL('../docs/shots/overhaul/', import.meta.url);
const sets = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
assert.ok(sets.includes('before'), 'the before set is recorded');
for (const name of sets) {
  const m = JSON.parse(read(`docs/shots/overhaul/${name}/metrics.json`));
  assert.equal(m.schema, 1, `${name}: schema 1`);
  assert.equal(m.label, name, `${name}: label matches the folder`);
  assert.ok(m.shots.length > 0);
  const byTier = {};
  for (const s of m.shots) {
    assert.ok(['medium', 'low'].includes(s.tier), `${name}/${s.id}: tier`);
    assert.ok(existsSync(new URL(`${name}/${s.file}`, root)), `${name}/${s.file} exists`);
    assert.deepEqual(Object.keys(s.metrics), LOOK_METRIC_KEYS, `${name}/${s.id}: metric keys`);
    assert.match(s.hash, /^[0-9a-f]{16}$/, `${name}/${s.id}: image hash`);
    for (const k of ['longestSeamPx', 'largestFlatAreaPx', 'largestFlatShare', 'meanLuminance']) assert.ok(Number.isFinite(s.metrics[k]) && s.metrics[k] >= 0, `${name}/${s.id}: ${k}`);
    assert.ok(s.metrics.largestFlatShare <= 1 && s.metrics.meanLuminance <= 1);
    (byTier[s.tier] ??= []).push(s.id);
  }
  assert.equal(new Set(m.shots.map(s => s.file)).size, m.shots.length, `${name}: unique files`);
  if (byTier.medium && byTier.low) assert.deepEqual(byTier.medium, byTier.low, `${name}: medium and low hold the same shots`);
  if (name === 'before') {
    const index = read('docs/shots/overhaul/before/index.md');
    for (const id of new Set(m.shots.map(s => s.id))) assert.ok(index.includes(`\`${id}\``), `before/index.md names shot ${id}`);
    for (const id of limits.nightShots) assert.ok(m.shots.some(s => s.id === id), `the night shot ${id} exists`);
  }
}
console.log(`look metrics ok: skill, art limits, metric function, ${sets.length} shot set(s)`);
