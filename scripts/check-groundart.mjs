// Organic ground (story 16.5): the seeded overlay and the noise-shaped border levels. Pure logic, no browser.
// Run: node scripts/check-groundart.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE, edgeLevel, hash2, mapSeed, paintGround } from '../scenes/GroundArt.js';
import { stripVariant } from '../scenes/EnvArt.js';

const town = JSON.parse(readFileSync(new URL('../data/maps/town.json', import.meta.url), 'utf8'));
const seed = mapSeed(town, 'town');
const alpha = (buf, W, x, y) => buf[(y * W + x) * 4 + 3];

assert.notEqual(mapSeed(town, 'town'), mapSeed(town, 'other'), 'every map has its own seed');
assert.equal(mapSeed(town, 'town'), seed, 'the seed is stable');

// a 40 x 40 tile window of the real town: deterministic, and only open ground is touched
const [tx0, ty0, w, h] = [30, 40, 40, 40];
const a = paintGround(town, seed, tx0, ty0, w, h);
const b = paintGround(town, seed, tx0, ty0, w, h);
assert.equal(a.width, w * BASE);
assert.ok(Buffer.from(a.under.buffer).equals(Buffer.from(b.under.buffer)) && Buffer.from(a.over.buffer).equals(Buffer.from(b.over.buffer)), 'the same map and seed bake the same ground');
assert.ok(!Buffer.from(a.under.buffer).equals(Buffer.from(paintGround(town, seed + 1, tx0, ty0, w, h).under.buffer)), 'another seed gives another ground');
const OPEN = new Set(['grass', 'tree', 'asphalt', 'lane', 'concrete', 'fence', 'cobble', 'path']);
const reserved = new Set();
for (const o of town.objects) {
  if (o.type === 'door') for (let i = 0; i < o.w; i++) for (let j = 0; j <= o.h; j++) reserved.add(`${o.x + i},${o.y + j}`);
  if (o.type === 'tram-stop') reserved.add(`${o.x},${o.y}`);
}
let painted = 0;
let open = 0;
for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
  const gx = tx0 + tx;
  const gy = ty0 + ty;
  const free = OPEN.has(town.legend[town.rows[gy][gx]]) && !reserved.has(`${gx},${gy}`);
  let any = 0;
  for (let py = 0; py < BASE; py++) for (let px = 0; px < BASE; px++) any += alpha(a.under, a.width, tx * BASE + px, ty * BASE + py) + alpha(a.over, a.width, tx * BASE + px, ty * BASE + py);
  if (!free) assert.equal(any, 0, `tile ${gx},${gy} (${town.legend[town.rows[gy][gx]]}) is not open ground and stays untouched`);
  else { open++; if (any) painted++; }
}
assert.ok(open > 300 && painted / open > 0.9, `the open ground carries the overlay (${painted} of ${open} tiles)`);

// every tile gets variation (no flat tile), and no tile is covered completely (the tile textures stay visible)
let covered = 0;
for (let i = 3; i < a.under.length; i += 4) if (a.under[i]) covered++;
assert.ok(covered / (w * h * BASE * BASE) > 0.15 && covered / (w * h * BASE * BASE) < 0.8, 'tone patches cover part of the ground, not all of it');

// indoor maps and a tile-aligned chunk edge
assert.equal(paintGround({ ...town, indoor: true }, seed, 0, 0, 4, 4), null, 'interiors are not painted');
const left = paintGround(town, seed, tx0, ty0, 20, h);
const right = paintGround(town, seed, tx0 + 20, ty0, 20, h);
for (let y = 0; y < h * BASE; y += 7) for (let x = 0; x < 20 * BASE; x += 5) {
  if ((left.under[(y * left.width + x) * 4 + 3] > 0) !== (a.under[(y * a.width + x) * 4 + 3] > 0)) assert.fail('tone patches do not depend on the chunk split (left half)');
  if ((right.under[(y * right.width + x) * 4 + 3] > 0) !== (a.under[(y * a.width + x + 20 * BASE) * 4 + 3] > 0)) assert.fail('tone patches do not depend on the chunk split (right half)');
}

// noise-shaped borders: strips of neighbouring tiles share the noise level of the vertex they meet at
const cls = 'grass';
const variants = (side, n, f) => Array.from({ length: n }, (_, i) => f(i));
const ends = v => [Number(v[0]), Number(v[1])];
const nRow = variants('n', 60, x => ends(stripVariant(seed, cls, 'n', x, 7)));
const eCol = variants('e', 60, y => ends(stripVariant(seed, cls, 'e', 7, y)));
const sRow = variants('s', 60, x => ends(stripVariant(seed, cls, 's', x, 7)));
const wCol = variants('w', 60, y => ends(stripVariant(seed, cls, 'w', 7, y)));
for (let i = 0; i < 59; i++) {
  assert.equal(nRow[i][1], nRow[i + 1][0], 'north strips join: the end of one is the start of the next');
  assert.equal(eCol[i][1], eCol[i + 1][0], 'east strips join');
  assert.equal(sRow[i + 1][1], sRow[i][0], 'south strips join (they run east to west)');
  assert.equal(wCol[i + 1][1], wCol[i][0], 'west strips join (they run south to north)');
}
assert.ok(new Set(nRow.map(e => e[0])).size === 3, 'a long border visits all three noise levels, so it is not a repeating tile pattern');
assert.ok(nRow.some(([p, q]) => p !== q), 'the border changes depth along its run');
assert.equal(edgeLevel(seed, 'grass', 5, 5), edgeLevel(seed, 'grass', 5, 5), 'levels are stable');
assert.ok(hash2(seed, 3, 4) >= 0 && hash2(seed, 3, 4) < 1, 'hash is a unit value');
console.log('check-groundart: overlay deterministic and confined to open ground, borders join across tiles');
