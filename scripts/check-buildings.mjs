// Buildings (story 16.7, AD-31, CAP-35, CAP-34): seeds and looks per building, the dressing of facades and roofs, the window
// schedule, the footprints (nothing here may change the grid) and the wiring. Run: node scripts/check-buildings.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ROOFS, STYLES, NEAR, buildingInfo, buildingAt, isFacade, facadeLook, roofEdges, roofExtra, chimneyTiles, binAt, windowList, windowLit } from '../render/buildingMath.js';
import { mapSeed } from '../scenes/GroundArt.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cfg = json('data/buildings.json');
const quality = json('data/quality.json');
const lighting = json('data/lighting.json');
const town = json('data/maps/town.json');
const PALS = 4;
const info = buildingInfo(town, mapSeed(town, 'town'), PALS);

// ---- seeds and looks: every building has its own seed, and no two buildings close together look alike
assert.ok(info.list.length >= 30, `the town has many buildings (${info.list.length})`);
assert.equal(new Set(info.list.map(b => b.seed)).size, info.list.length, 'every building has its own seed');
assert.ok(new Set(info.list.map(b => b.pal * 3 + b.roof)).size >= 8, 'the town uses many palette and roof combinations');
assert.ok(new Set(info.list.map(b => b.roof)).size === ROOFS.length, 'all three roof materials are in use');
assert.ok(info.list.filter(b => b.roof === 2).length < info.list.length / 3, 'flat roofs are the rarest');
assert.ok(new Set(info.list.map(b => b.pref)).size === 4, 'buildings prefer different window styles');
let near = 0;
for (const b of info.list) {
  const others = new Set();
  for (const [cx, cy] of b.cells) for (let dy = -NEAR; dy <= NEAR; dy++) for (let dx = -NEAR; dx <= NEAR; dx++) {
    const o = buildingAt(info, cx + dx, cy + dy);
    if (o && o !== b) others.add(o);
  }
  for (const o of others) {
    near++;
    assert.ok(o.pal !== b.pal || o.roof !== b.roof, `neighbouring buildings ${b.index} and ${o.index} differ in palette or roof`);
  }
}
assert.ok(near >= 8, `neighbour pairs were compared (${near})`);
assert.deepEqual(buildingInfo(JSON.parse(JSON.stringify(town)), mapSeed(town, 'town'), PALS).list.map(b => [b.seed, b.pal, b.roof, b.pref]), info.list.map(b => [b.seed, b.pal, b.roof, b.pref]), 'the same map always gets the same buildings');
assert.notDeepEqual(buildingInfo(JSON.parse(JSON.stringify(town)), mapSeed(town, 'other'), PALS).list.map(b => b.seed), info.list.map(b => b.seed), 'another map seed gives other buildings');

// ---- footprints: every non-border wall tile is in exactly one building; nothing writes to the grid
const rows = town.rows.length;
const cols = town.rows[0].length;
let walls = 0;
for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) if (town.legend[town.rows[y][x]] === 'wall') { walls++; assert.ok(buildingAt(info, x, y), `wall ${x},${y} belongs to a building`); }
assert.equal(info.list.reduce((n, b) => n + b.cells.length, 0), walls, 'the buildings cover exactly the wall tiles');
assert.equal(JSON.stringify(town.rows).length, JSON.stringify(json('data/maps/town.json').rows).length, 'the map rows are untouched');

// ---- dressing: facades, doors, roofs, chimneys, extras
const styles = new Set();
let facades = 0, shops = 0, aged = 0, pipes = 0, awnings = 0;
for (const b of info.list) for (const [tx, ty] of b.cells) {
  const look = facadeLook(info, tx, ty);
  if (!isFacade(info, tx, ty)) { assert.equal(look, null, 'only the front row has a facade'); continue; }
  if (info.doors.has(`${tx},${ty}`)) { assert.equal(look, null, 'a door tile keeps its door art'); continue; }
  facades++;
  styles.add(look.style);
  if (look.style === 4) shops++;
  if (look.age >= 0) aged++;
  if (look.pipe) pipes++;
  if (look.awning >= 0) awnings++;
  assert.ok(look.style >= -1 && look.style < STYLES.length && look.curtain >= 0 && look.curtain < 4);
  assert.equal(look.style === 4, look.awning >= 0, 'a shopfront has an awning');
}
assert.equal(styles.size, STYLES.length + 1, 'plain walls and every window style occur');
assert.ok(shops > 0 && aged > facades * 0.05 && pipes > 20 && awnings > 0, `shopfronts ${shops}, aged ${aged}, drainpipes ${pipes}, awnings ${awnings}`);
let chimneys = 0, extras = 0, edges = 0;
for (const b of info.list) {
  const c = chimneyTiles(info, b);
  assert.ok(b.roof !== 2 ? c.length >= 1 || b.cells.length < 4 : c.length === 0, 'chimneys sit on tile and slate roofs');
  assert.ok(c.length <= b.chimneys && c.every(([x, y]) => !isFacade(info, x, y)), 'a chimney stands on the roof, not the facade');
  chimneys += c.length;
  for (const [tx, ty] of b.cells) { if (roofExtra(info, tx, ty) >= 0) { extras++; assert.equal(b.roof, 2, 'vents and skylights are for flat roofs'); } if (roofEdges(info, tx, ty)) edges++; }
}
assert.ok(chimneys > 20 && extras > 3 && edges > 300, `chimneys ${chimneys}, roof extras ${extras}, edge tiles ${edges}`);
let bins = 0;
for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) if (binAt(info, x, y) >= 0) bins++;
assert.ok(bins > 10, `bins stand along walls (${bins})`);

// ---- windows: only on facade tiles, never on doors, each with its own switching time
const wins = windowList(info);
assert.ok(wins.length > 150, `the town has windows (${wins.length})`);
assert.ok(wins.every(w => isFacade(info, w.tx, w.ty) && !info.doors.has(`${w.tx},${w.ty}`) && w.jitter >= 0 && w.jitter < 1), 'windows are in facades');
const at = m => wins.filter(w => windowLit(m, w, cfg.windows)).length;
assert.equal(at(12 * 60), 0, 'no window is lit at noon');
assert.equal(at(7 * 60), 0, 'none is lit at seven in the morning');
assert.ok(at(17 * 60 + 45) > 0 && at(17 * 60 + 45) < at(19 * 60 + 30), 'the street fills with light over the evening');
assert.ok(at(20 * 60) > wins.length * 0.45 && at(20 * 60) < wins.length * 0.8, 'at eight about half to three quarters of the windows are lit (some households are out)');
assert.ok(at(5 * 60) > 0 && at(6 * 60 + 45) === 0, 'the lights go out in the early morning');

// ---- data and tiers: the spill budget fits the pool next to lamps and vehicles
assert.ok(cfg.overhang.side > 0 && cfg.overhang.top > 0 && cfg.awningDepth > 5000 && cfg.windows.fade > 0 && cfg.windows.tick > 0, 'data values are sane');
assert.ok(cfg.windows.light.radius <= 32 && cfg.windows.light.intensity <= 1, 'a window light is small');
for (const [id, t] of Object.entries(quality.tiers)) {
  assert.ok(Number.isInteger(t.windowLights) && t.windowLights >= 0, `${id} has windowLights`);
  assert.ok(t.maxLights - lighting.vehicles.reserve - t.windowLights >= (t.maxLights ? 8 : -999), `${id}: the lamps keep at least eight slots next to the windows and vehicles`);
  assert.ok(t.maxLights <= lighting.poolCap, `${id} fits the pool`);
}
assert.equal(quality.tiers.low.windowLights, 0, 'Low draws the panes without the spill');
assert.ok(quality.tiers.high.windowLights >= quality.tiers.medium.windowLights && quality.tiers.medium.windowLights > 0);

// ---- wiring: every map keeps working, no randomness at run time, no allocation per tick
for (const f of readdirSync(new URL('../data/maps/', import.meta.url)).filter(n => n.endsWith('.json') && n !== 'index.json')) {
  const m = json(`data/maps/${f}`);
  if (m.indoor) continue;
  const i = buildingInfo(m, mapSeed(m, f.replace('.json', '')), PALS);
  assert.ok(i.list.every(b => b.pal < PALS && b.roof < ROOFS.length), `${f}: looks are in range`);
}
const src = text('render/Buildings.js');
assert.ok(!/Math\.random/.test(src), 'buildings use no Math.random');
const loop = src.slice(src.indexOf('  update(dt)'), src.indexOf('  // Every frame'));
assert.ok(!/\bnew |\.map\(|\.filter\(|\[\.\.\.|\{ \.\.\./.test(loop), 'Buildings.update allocates nothing per tick');
assert.ok(/new Buildings\(/.test(text('scenes/GameScene.js')) && /buildings\.update\(dt\)/.test(text('scenes/GameScene.js')), 'GameScene creates and updates the buildings');
assert.ok(/makeBuildingAtlas/.test(text('scenes/BootScene.js')) && /'buildings'/.test(text('scenes/BootScene.js')), 'BootScene draws the atlas and loads the data');

console.log(`buildings ok: ${info.list.length} buildings, ${wins.length} windows, ${chimneys} chimneys, ${edges} eave pieces, ${bins} bins, neighbours differ (${near} pairs)`);
