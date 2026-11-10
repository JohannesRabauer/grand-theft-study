// Interiors (story 16.10, AD-31, CAP-35): the room data (furniture, lamps, windows), the walked paths, the interior light maths,
// the floor and wall keys, and the wiring. Nothing may change the maps. Run: node scripts/check-interiors.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTERIOR_MAPS, daylight, faceVariant, interiorAmbient, interiorNight, itemsOf, lampSchedule, lampTarget, shaftSkew, wearTiles, windowList } from '../render/interiorMath.js';
import { PROPS, LAMPS, SHAFT } from '../scenes/InteriorProps.js';
import { indoorKeys, setInteriorRooms } from '../scenes/InteriorArt.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cfg = json('data/interiors.json');
const quality = json('data/quality.json');
const maps = Object.fromEntries(INTERIOR_MAPS.map(id => [id, json(`data/maps/${id}.json`)]));
const rowsBefore = JSON.stringify(Object.values(maps).map(m => m.rows));
const idAt = (m, x, y) => m.legend[m.rows[y]?.[x]] ?? null;
setInteriorRooms(cfg.rooms);

// ---- data: every piece is known, stands on floor and keeps off the interaction spots and doors
assert.deepEqual(Object.keys(cfg.rooms).sort(), [...INTERIOR_MAPS].sort(), 'rooms for home, school and dojo and nothing else');
let pieces = 0;
for (const id of INTERIOR_MAPS) {
  const m = maps[id];
  const room = cfg.rooms[id];
  const spots = (m.objects ?? []).filter(o => o.type !== 'door' && o.type !== 'spawn' && o.type !== 'entry' && !(o.type === 'dojo' && o.role === 'mats'));
  const doorTiles = new Set();
  for (const o of m.objects ?? []) if (o.type === 'door') for (let i = 0; i < o.w; i++) for (let j = 0; j < o.h; j++) doorTiles.add(`${o.x + i},${o.y + j}`);
  const items = itemsOf(room);
  assert.ok(items.length >= 15, `${id} has furniture and clutter (${items.length})`);
  assert.ok(new Set(items.map(i => i.t)).size >= 8, `${id} has variety (${new Set(items.map(i => i.t)).size} types)`);
  for (const it of items) {
    pieces++;
    const p = PROPS[it.t];
    assert.ok(p, `${id}: known piece ${it.t}`);
    assert.ok(Number.isInteger(it.v) && it.v >= 0 && it.v < p.n, `${id}: ${it.t} variant ${it.v} exists`);
    const w = Math.max(1, Math.ceil(p.w / 16));
    for (let i = 0; i < w; i++) {
      const tx = Math.floor(it.x + i);
      assert.notEqual(idAt(m, tx, it.y), 'wall', `${id}: ${it.t} at ${tx},${it.y} stands on floor`);
      assert.ok(!doorTiles.has(`${tx},${it.y}`), `${id}: ${it.t} does not block a door`);
      if (p.kind !== 'wall') {
        for (const s of spots) {
          const inside = tx >= s.x && tx < s.x + (s.w ?? 1) && it.y >= s.y && it.y < s.y + (s.h ?? 1);
          assert.ok(!inside, `${id}: ${it.t} at ${tx},${it.y} keeps off the spot ${s.id}`);
        }
      }
    }
  }
  for (const l of room.lamps) {
    assert.ok(LAMPS[l.t], `${id}: known lamp ${l.t}`);
    assert.notEqual(idAt(m, Math.floor(l.x), Math.floor(l.y)), 'wall', `${id}: lamp ${l.t} hangs over floor`);
    assert.ok(l.jitter >= 0 && l.jitter <= 1, `${id}: lamp jitter 0..1`);
  }
}
assert.deepEqual(cfg.rooms.school.desks, { rows: [6, 9], cols: [5, 10, 20, 25] }, 'the school desks stand where they always did');
assert.equal(itemsOf(cfg.rooms.school).filter(i => i.t === 'desk').length, 8, 'eight desks');
assert.ok(pieces >= 60, `${pieces} pieces in all`);

// ---- windows and walls
const wins = Object.fromEntries(INTERIOR_MAPS.map(id => [id, windowList(maps[id], id, cfg.rooms[id])]));
assert.ok(wins.home.length >= 3 && wins.school.length >= 8 && wins.dojo.length >= 1, `windows: home ${wins.home.length}, school ${wins.school.length}, dojo ${wins.dojo.length}`);
for (const id of INTERIOR_MAPS) {
  for (const w of wins[id]) assert.notEqual(idAt(maps[id], w.tx, w.ty), 'wall', `${id}: a window's light falls on floor`);
  assert.deepEqual(windowList(JSON.parse(JSON.stringify(maps[id])), id, cfg.rooms[id]).map(w => w.x), wins[id].map(w => w.x), `${id}: windows are deterministic`);
}
assert.equal(faceVariant('home', 2, 'wood'), 'window');
assert.equal(faceVariant('school', 15, 'wood'), 'board-m');
assert.equal(faceVariant('school', 0, 'concrete'), 'locker');

// ---- wear: walked tiles only, never walls
for (const id of INTERIOR_MAPS) {
  const w = wearTiles(maps[id], cfg.rooms[id]);
  assert.ok(w.size >= 10, `${id}: worn tiles along the paths (${w.size})`);
  for (const [k, lv] of w) {
    const [x, y] = k.split(',').map(Number);
    assert.notEqual(idAt(maps[id], x, y), 'wall', `${id}: no wear on a wall`);
    assert.ok(lv === 1 || lv === 2);
  }
}

// ---- light: lamps follow the evening and the dark, daylight follows the sun and the weather, the ambient is brighter by day
const sched = lampSchedule(cfg);
assert.equal(lampTarget(cfg, sched, 12 * 60, 0, 'clear', 0.5), 0, 'lamps are off at noon');
assert.equal(lampTarget(cfg, sched, 21 * 60, 0.5, 'clear', 0.5), 1, 'lamps are on at 21:00');
assert.equal(lampTarget(cfg, sched, 8 * 60, 0.1, 'rain', 0.5), 1, 'and on at 08:00 in the rain when it is gloomy');
assert.equal(lampTarget(cfg, sched, 6 * 60, 0.6, 'clear', 0.5), 1, 'and still on before dawn');
assert.ok(lampTarget(cfg, sched, 17 * 60 + 40, 0, 'clear', 0) === 1 && lampTarget(cfg, sched, 17 * 60 + 40, 0, 'clear', 1) === 0, 'each lamp has its own minute');
assert.equal(daylight(cfg, 0, 'clear'), 1);
assert.ok(daylight(cfg, 0, 'rain') < daylight(cfg, 0, 'clear') && daylight(cfg, 0.5, 'clear') === 0, 'rain dims the window light, night takes it');
const day = interiorAmbient(cfg, 0, {});
const night = interiorAmbient(cfg, 0.7, {});
const luma = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
assert.ok(luma(day) > luma(night) + 0.2 && luma(night) > 0.3, `ambient ${luma(day).toFixed(2)} by day, ${luma(night).toFixed(2)} at night (never black)`);
assert.ok(interiorNight(cfg, 0) === 0 && interiorNight(cfg, 1) === 1, 'the mood runs from 0 to 1');
assert.deepEqual([390, 700, 1100].map(m => shaftSkew(cfg, m)), [0, 1, 2], 'the shaft crosses the floor from morning to evening');
assert.equal(SHAFT.skew.length, 3);
for (const id of INTERIOR_MAPS) assert.ok(cfg.rooms[id].lamps.length + wins[id].length <= quality.tiers.medium.maxLights, `${id}: lamps and windows fit the Medium light budget`);

// ---- keys: planks, linoleum, tatami, the wall foot and corner shading; the grid is untouched
const keysAt = (id, x, y) => indoorKeys(maps[id], x, y, 'base-x', id);
assert.match(keysAt('home', 6, 6)[0], /^env-iplank-home-\d$/, 'the home bedroom has plank boards');
assert.match(keysAt('school', 6, 3)[0], /^env-ilino-school-\d$/, 'the classroom has linoleum');
assert.match(keysAt('school', 6, 14)[0], /^env-ihall-school-\d$/, 'the school hall has tiles');
assert.match(keysAt('dojo', 6, 5)[0], /^env-itatami-[LR]-\d$/, 'the dojo mats are tatami');
assert.match(keysAt('dojo', 2, 6)[0], /^env-iplank-dojo-\d$/, 'beside them are polished boards');
assert.ok(keysAt('home', 6, 1).some(k => /^env-iwall-home-/.test(k)), 'floor in front of a wall carries the wall foot');
assert.ok(keysAt('school', 1, 12).some(k => k === 'env-iwall-school-locker'), 'lockers reach the floor');
assert.ok(keysAt('home', 5, 3).some(k => /^env-rug-home-/.test(k)), 'the home rug is there');
assert.ok(keysAt('school', 2, 7).some(k => /^env-rug-kids-/.test(k)), 'the school has a reading rug');
let worn = 0;
for (let y = 0; y < maps.home.rows.length; y++) for (let x = 0; x < maps.home.rows[0].length; x++) if (keysAt('home', x, y).some(k => k.startsWith('env-iwear'))) worn++;
assert.ok(worn >= 10, `worn tiles in the home (${worn})`);
const reps = new Set();
for (let y = 1; y < 9; y++) for (let x = 1; x < 22; x++) reps.add(keysAt('home', x, y)[0]);
assert.ok(reps.size >= 3, 'plank floors vary from tile to tile');

// ---- wiring
const boot = text('scenes/BootScene.js');
assert.ok(boot.includes("'data/interiors.json'") && boot.includes('makeInteriorAtlas') && boot.includes('setInteriorRooms'), 'boot loads the data and draws the atlas');
const game = text('scenes/GameScene.js');
assert.ok(game.includes('new Interiors(') && game.includes('this.interiors.update(dt)'), 'GameScene owns the Interiors system');
assert.ok(text('render/LightMap.js').includes('interiorAmbient'), 'the light map runs indoors with the interior ambient');
assert.ok(text('render/Interiors.js').includes('ctx.world.register(this)') && text('render/Interiors.js').includes('pool.add('), 'interior light goes through ctx.lights');
assert.ok(!/Math\.random/.test(text('render/Interiors.js') + text('render/interiorMath.js') + text('scenes/InteriorArt.js') + text('scenes/InteriorProps.js')), 'nothing here is random');
assert.equal(JSON.stringify(Object.values(maps).map(m => m.rows)), rowsBefore, 'the interiors never touch the map grid');
console.log(`interiors ok: ${pieces} pieces, windows ${wins.home.length}/${wins.school.length}/${wins.dojo.length}, lamps ${INTERIOR_MAPS.map(i => cfg.rooms[i].lamps.length).join('/')}, light and keys`);
