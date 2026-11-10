// Environment art (AD-30, CAP-34): the neighbour logic that decides which edge, shore, bank, curb, fence and
// hedge textures each ground tile gets. Pure logic; the drawing itself is covered by the headless screenshots
// and the smoke test. Also proves the art changes no map data and that every real map yields only known keys.
// Run: node scripts/check-envart.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { groundKeys, prepareEnvArtForTest, puddleKey, PUDDLE_SURFACES } from '../scenes/EnvArt.js';

prepareEnvArtForTest({ grass: 4, asphalt: 4, cobble: 3, path: 3, concrete: 4, water: 3 });
const mk = (...rows) => ({ legend: { A: 'asphalt', L: 'lane', C: 'cobble', G: 'grass', p: 'path', S: 'concrete', W: 'water', T: 'tree', F: 'fence', H: 'hedge', '#': 'wall', w: 'wood' }, rows });
const rawAt = (map, x, y) => groundKeys(map, x, y, `base-${map.legend[map.rows[y][x]]}`);
const at = (map, x, y) => rawAt(map, x, y).filter(k => !k.startsWith('env-tuft')); // tufts are random dressing; the edge tests look past them
const has = (keys, re) => keys.some(k => re.test(k));

// grass bleeds onto asphalt, never the other way round
let m = mk('GGG', 'GAA', 'GAA');
assert.equal(at(m, 1, 1)[0], 'base-asphalt', 'the base texture comes first and is unchanged');
assert.ok(has(at(m, 1, 1), /^env-edge-grass-n-/) && has(at(m, 1, 1), /^env-edge-grass-w-/), 'asphalt gets grass edges on its grass sides');
assert.deepEqual(at(m, 0, 1), ['base-grass'], 'grass is the higher surface and gets no edge from asphalt');
m = mk('AAA', 'AAA', 'AAG');
assert.ok(has(at(m, 1, 1), /^env-edgec-grass-se-/), 'an outer corner with grass only on the diagonal gets a corner piece');

// story 16.5: border strips are named by the noise level at both ends and a shape, e.g. env-edge-grass-n-012
assert.ok(has(at(mk('GGG', 'AAA', 'AAA'), 1, 1), /^env-edge-grass-n-[0-2][0-2][01]$/), 'edge strips carry their noise levels and shape');
assert.deepEqual(at(m, 1, 1), at(m, 1, 1), 'the strip choice is stable');
const run = mk('GGGGGGGGGGGG', 'AAAAAAAAAAAA');
const names = Array.from({ length: 12 }, (_, x) => at(run, x, 1).find(k => /^env-edge-grass-n-/.test(k)));
assert.ok(new Set(names).size > 4, 'a long border is made of many different strips, not one repeated tile');

// kerb: concrete over asphalt and lane, grass over concrete
m = mk('SSA', 'SSL', 'SSG');
assert.ok(has(at(m, 2, 0), /^env-edge-concrete-w-/), 'asphalt gets a kerb along the pavement');
assert.ok(has(at(m, 2, 1), /^env-edge-concrete-w-/), 'the cycle lane gets a kerb too');
assert.ok(has(at(m, 1, 2), /^env-edge-grass-e-/), 'pavement gets grass fringe from the lawn beside it');

// ranks: cobble over concrete, path over cobble
m = mk('CCS', 'ppC');
assert.ok(has(at(m, 2, 0), /^env-edge-cobble-w-/), 'concrete gets cobble edges');
assert.ok(has(at(m, 0, 0), /^env-edge-path-s-/), 'cobble gets path edges');

// water (story 16.8): the tile ground of water is a mud bed; shores, banks and the water come from render/Water.js (check-water.mjs)
m = mk('SSSSS', 'SWWWS', 'SWWWS', 'SWWWS', 'SSSSS');
assert.ok(has(at(m, 2, 1), /^env-wbed-\d$/) && !has(at(m, 2, 1), /^tile-water/), 'a water tile is drawn as a mud bed, the water comes over it');
assert.ok(!has(at(m, 2, 1), /^env-(shore|deep|round)/), 'water tiles carry no framed shore strips any more');
assert.ok(!has(at(m, 2, 0), /^env-bank/) && !has(at(mk('GGG', 'GWG', 'GGG'), 1, 0), /^env-bank/), 'land beside water carries no framed bank strips any more');

// fences: orientation follows the neighbours, the ground under them blends
m = mk('GGG', 'SFS', 'SFS', 'SFS');
assert.ok(has(at(m, 1, 2), /^env-fence-v-\d$/), 'a fence run along a column is drawn vertically');
m = mk('GGGG', 'SFFF', 'SSSS');
assert.ok(has(at(m, 2, 1), /^env-fence-h-\d$/), 'a fence run along a row is drawn horizontally');
assert.ok(has(at(m, 2, 1), /^env-edge-grass-n-/), 'the pavement under a fence still blends with the lawn behind it');
m = mk('SFS', 'FFF', 'SFS');
assert.ok(has(at(m, 1, 1), /^env-fence-x-\d$/), 'a fence junction draws both directions');
assert.ok(has(at(mk('SSS', 'SFS', 'SSS'), 1, 1), /^env-fence-h-\d$/), 'a lone fence section defaults to horizontal');
assert.ok(!has(at(mk('HHH', 'SSS'), 1, 1), /^env-shadow/), 'hedge shadows come from the shadow layer (render/Shadows.js), not from tile keys');

// hedges (story 16.6): the ground under a hedge is lawn, the lumpy mass is a sprite; the lawn behind a hedge gets a flower bed or tall grass
m = mk('SSS', 'SHS', 'SHS', 'SGS', 'SSS');
assert.match(at(m, 1, 2)[0], /^tile-grass/, 'a hedge tile stands on lawn');
assert.ok(has(at(mk('GGG', 'GHG', 'GGG'), 1, 1), /^tile-grass/) && !has(at(m, 1, 2), /^env-hedge/), 'no hedge ground tiles any more');
const row = (id) => { const mm = mk(id.repeat(40), 'G'.repeat(40)); return Array.from({ length: 40 }, (_, x) => rawAt(mm, x, 1)); };
assert.ok(row('H').some(k => has(k, /^env-bed-/)), 'lawn south of a hedge gets flower beds');
assert.ok(row('T').some(k => has(k, /^env-tuft-/)), 'tall grass tufts grow where lawn meets trees');

// trees (story 16.6): the tile keeps lawn, trunk and root flare; the crown is a sprite
m = mk('GGG', 'GTG', 'GGG');
assert.equal(at(m, 1, 1)[0], 'base-tree', 'the base comes first');
assert.match(at(m, 1, 1)[1], /^env-trunk-(oak|pine|birch)$/, 'a tree tile shows its trunk');

// surfaces without blending rules stay untouched (indoor floors, walls, trees, bounds)
m = mk('#ww#', '#ww#', '#TT#');
assert.deepEqual(at(m, 1, 0), ['base-wood'], 'floors are unchanged');
assert.deepEqual(at(m, 0, 0), ['base-wall'], 'walls are unchanged');
assert.equal(at(m, 1, 2)[0], 'base-tree', 'tree tiles keep their base');
assert.deepEqual(at(mk('G'), 0, 0), ['base-grass'], 'a one tile map has no neighbours and no edges');


// interiors: plaster walls with a cap, a tiled hall, shading, rugs and a bright exit doorway; outdoor rules do not apply
const room = {
  indoor: true,
  legend: { '#': 'wall', w: 'wood', s: 'concrete' },
  rows: ['######', '#wwww#', '#wwww#', '##ss##', '#ssss#', '######'],
  objects: [{ type: 'door', id: 'exit', x: 2, y: 4, w: 2, h: 1 }]
};
const inAt = (x, y, mapId = 'home') => groundKeys(room, x, y, `base-${room.legend[room.rows[y][x]]}`, mapId);
assert.match(inAt(2, 0)[0], /^env-iface-home-/, 'a wall with floor to its south shows its plaster face');
assert.match(inAt(0, 2)[0], /^env-icap-home$/, 'a boundary wall seen from the side is a plain cap');
assert.match(inAt(2, 5)[0], /^env-idoor-home-l$/, 'the wall under the left door tile is the left jamb of the doorway');
assert.match(inAt(3, 5)[0], /^env-idoor-home-r$/, 'and the right jamb under the right door tile');
assert.ok(has(inAt(2, 4), /^env-imat-l$/) && has(inAt(3, 4), /^env-imat-r$/), 'a door mat lies in front of the doorway');
assert.match(inAt(2, 3)[0], /^env-ihall-home-/, 'concrete indoors is a tiled hall floor, not cracked asphalt grey');
assert.match(inAt(1, 1)[0], /^env-iplank-home-/, 'home wooden floors are plank boards (story 16.10)');
assert.equal(groundKeys(room, 1, 1, 'base-wood', 'unknown-room')[0], 'base-wood', 'other rooms keep the plain texture');
assert.ok(has(inAt(1, 1), /^env-iwall-home-/) && has(inAt(1, 1), /^env-ishade-w$/), 'floor beside a wall carries the wall foot and is shaded where the wall stands');
assert.ok(has(inAt(3, 2), /^env-rug-home-nw$/), 'the home has its rug, with a corner where it starts');
assert.ok(!has(groundKeys(room, 3, 2, 'b', 'school'), /^env-rug-/), 'other rooms have none');
assert.ok(!has(inAt(1, 1), /^env-(edge|shore|bank)/), 'no outdoor edges indoors');
assert.match(groundKeys(room, 2, 0, 'b', 'unknown-room')[0], /^env-iface-default-/, 'an unknown room still gets the default theme');

// rain puddles: only on surfaces that can hold water, four shapes, same tile -> same shape
assert.deepEqual(PUDDLE_SURFACES.sort(), ['asphalt', 'concrete', 'lane', 'path']);
assert.equal(puddleKey('grass', 3, 4), null, 'grass takes no puddle overlay');
assert.equal(puddleKey('cobble', 3, 4), null, 'neither does cobble');
assert.equal(puddleKey('asphalt', 3, 4), puddleKey('asphalt', 3, 4));
assert.ok(new Set(Array.from({ length: 64 }, (_, i) => puddleKey('asphalt', i, i * 3))).size === 4, 'four shapes are in use');


// outdoor buildings: a palette per building, roof / facade with windows, and doors with a step and a mat
const town = {
  legend: { '#': 'wall', G: 'grass', S: 'concrete' },
  rows: ['########', '#GGGGGG#', '#G####G#', '#G####G#', '#GGGGGG#', '#GSSGGG#', '########'],
  objects: [{ type: 'door', id: 'd', x: 2, y: 4, w: 1, h: 1, to: 'home' }]
};
const outAt = (x, y) => groundKeys(town, x, y, 'base-x', 'town');
const pal = k => k.match(/^env-(?:roof|facade|odoor)-(\w+?)-/)?.[1];
assert.match(outAt(2, 2)[0], /^env-roof-\w+-(tile|slate|flat)-[1-7]$/, 'the top row of a building is a roof with its edge lip');
assert.match(outAt(3, 3)[0], /^env-facade-\w+-(plain|window-\d|shutter-\d|flowers-\d|balcony-\d|shop-\d)$/, 'the south row of a building is its facade');
assert.equal(outAt(0, 0)[0], 'base-x', 'the map border keeps its plain brick');
assert.match(outAt(2, 3)[0], /^env-odoor-\w+-home-c$/, 'the wall above a door tile is a door in the style of where it leads');
assert.ok(has(outAt(2, 4), /^env-ostep$/) && has(outAt(2, 4), /^env-imat-m$/), 'a step and a mat lie in front of the door');
assert.equal(new Set([2, 3, 4, 5].flatMap(x => [2, 3].map(y => pal(outAt(x, y)[0])))).size, 1, 'one building keeps one palette');
const twin = { ...town, rows: ['##########', '#GGGGGGGG#', '#G##G##GG#', '#G##G##GG#', '#GGGGGGGG#', '##########'], objects: [] };
assert.ok(pal(groundKeys(twin, 2, 2, 'b', 'town')[0]) && pal(groundKeys(twin, 5, 2, 'b', 'town')[0]), 'two buildings are both styled');

// every real map: only known key families, the base stays first, and nothing here touched the grid
const known = /^(base-|tile-|env-(edge|edgec|wbed|fence|trunk|tuft|iface|iwall|icap|ihall|iplank|ilino|itatami|iwear|iaoc|idoor|ishade|ilight|imat|rug|roof|facade|odoor|ostep|bed|pot|tramstop|pipe|age|vent|bin|rdress|poster|chalk|play|kweed|gleaf))/;
let tiles = 0;
let extra = 0;
for (const f of readdirSync(new URL('../data/maps/', import.meta.url)).filter(n => n.endsWith('.json') && n !== 'index.json')) {
  const map = JSON.parse(readFileSync(new URL(`../data/maps/${f}`, import.meta.url), 'utf8'));
  const before = JSON.stringify(map.rows);
  for (let y = 0; y < map.rows.length; y++) for (let x = 0; x < map.rows[0].length; x++) {
    const keys = groundKeys(map, x, y, 'base-x', f.replace('.json', ''));
    tiles++;
    extra += keys.length - 1;
    for (const k of keys) assert.match(k, known, `${f} ${x},${y}: unexpected key ${k}`);
    assert.ok(keys.length <= 14, `${f} ${x},${y}: ${keys.length} layers is more than a tile should ever need`);
  }
  assert.equal(JSON.stringify(map.rows), before, `${f}: art must not modify map data`);
}
console.log(`envart ok: transitions, kerbs, water beds, oriented fences and hedges; ${tiles} map tiles give ${extra} extra layers`);
