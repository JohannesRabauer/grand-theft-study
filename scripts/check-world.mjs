// Checks the Phaser-free map logic (services/worldLogic.js, AD-28): catalog validation, door and entry
// resolution, reachability. Uses small in-memory maps so every rule is exercised on purpose.
// Run: node scripts/check-world.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cellsOf, reachable, resolveEntry, resolveDoor, validateObject, validateMap, validateWorld } from '../services/worldLogic.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const catalog = load('object-types.json');
const env = { catalog, surfaces: load('surfaces.json'), tiles: load('tiles.json'), i18n: new Set(Object.keys(load('../i18n/en.json'))) };

// ---- the catalog covers everything the game uses and everything later stories need
const town = load('maps/town.json');
for (const t of new Set(town.objects.map(o => o.type))) assert.ok(catalog.types[t], `town uses '${t}', missing in the catalog`);
const later = ['door', 'entry', 'rail', 'ramp', 'stairs', 'bench', 'dojo', 'shop', 'bakery', 'pfand-machine', 'bike-rack', 'tram-stop', 'sign', 'mission-trigger', 'grab-target', 'home-spot', 'school-spot'];
for (const t of [...later, 'spawn', 'goal', 'bike', 'hiding', 'turf', 'bully-spawn', 'prop', 'ammo', 'flag', 'ambient', 'npc-node', 'npc-spawn']) assert.ok(catalog.types[t], `catalog lacks '${t}'`);
for (const [t, def] of Object.entries(catalog.types)) {
  assert.ok(['point', 'rect', 'path'].includes(def.shape), `${t}: shape`);
  assert.ok(def.inWall === true || def.inWall === false || def.inWall === 'perch', `${t}: inWall`);
  for (const [f, spec] of Object.entries(def.fields)) assert.ok(spec.type, `${t}.${f}: type`);
}

// ---- single objects
const errs = (o) => validateObject(o, catalog, env, 'm');
assert.deepEqual(errs({ type: 'bench', id: 'b', x: 1, y: 1, w: 2, h: 1 }), [], 'a valid bench');
assert.match(errs({ type: 'teleporter', id: 't', x: 1, y: 1 })[0], /unknown object type/, 'unknown type fails');
assert.match(errs({ type: 'bench', id: 'b', x: 1, y: 1, w: 2 }).join(), /missing required field 'h'/, 'missing rect size fails');
assert.match(errs({ type: 'door', id: 'd', x: 1, y: 1, w: 1, h: 1, to: 'town', entry: 'x' }).join(), /missing required field 'label'/, 'missing door label fails');
assert.match(errs({ type: 'bench', id: 'b', x: 1, y: 1, w: 2, h: 1, colour: 'red' }).join(), /unknown field 'colour'/, 'unknown field fails');
assert.match(errs({ type: 'pfand-machine', id: 'p', x: 1.5, y: 1 }).join(), /'x' must be an integer/, 'non-integer position fails');
assert.match(errs({ type: 'flag', id: 'f', x: 1, y: 1, color: 'red' }).join(), /#rrggbb/, 'bad colour fails');
assert.match(errs({ type: 'entry', id: 'e', x: 1, y: 1, facing: 'sideways' }).join(), /one of up, down, left, right/, 'bad enum fails');
assert.match(errs({ type: 'rail', id: 'r', points: [[1, 1]], width: 2 }).join(), /at least two/, 'a rail needs two points');
assert.match(errs({ type: 'stairs', id: 's', x: 1, y: 1, w: 2, h: 2, dir: 'up', steps: 0 }).join(), /at least 1/, 'min applies');
assert.match(errs({ type: 'sign', id: 's', x: 1, y: 1, text: 'no.such.key' }).join(), /i18n key 'no.such.key' is missing/, 'unknown i18n key fails');
assert.deepEqual(errs({ type: 'rail', id: 'r', points: [[1, 1], [4, 1]], width: 1.5 }), [], 'a valid rail');
assert.deepEqual(cellsOf({ x: 2, y: 3, w: 2, h: 2 }, 'rect'), [[2, 3], [3, 3], [2, 4], [3, 4]]);

// ---- maps
const mk = (rows, objects, extra = {}) => ({ tileSize: 16, legend: { '#': 'wall', '.': 'concrete', F: 'fence' }, rows, objects, ...extra });
const room = (objects, extra) => mk(['#######', '#.....#', '#.....#', '#.....#', '#######'], objects, extra);
const entry = { type: 'entry', id: 'in', x: 2, y: 2, facing: 'up' };
const check = (map) => validateMap('room', map, env);
assert.deepEqual(check(room([entry])), [], 'a minimal room is valid');
assert.match(check(room([entry, { type: 'bench', id: 'b', x: 0, y: 0, w: 1, h: 1 }])).join(), /lies in a wall/, 'objects inside walls fail');
assert.deepEqual(check(room([entry, { type: 'sign', id: 's', x: 3, y: 0, text: 'world.sign.test' }])), [], 'signs may sit in a wall');
assert.match(check(room([entry, { type: 'bench', id: 'b', x: 6, y: 1, w: 2, h: 1 }])).join(), /out of bounds|lies in a wall/, 'out of bounds fails');
assert.match(check(room([entry, { type: 'bench', id: 'in', x: 3, y: 2, w: 1, h: 1 }])).join(), /duplicate object id 'in'/, 'duplicate ids fail');
assert.match(check(room([])).join(), /no spawn or entry/, 'a map needs an entry');
assert.match(check(room([entry], { colour: 1 })).join(), /unknown map key/, 'unknown map keys fail');
assert.match(check({ ...room([entry]), legend: { '#': 'wall' } }).join(), /missing in legend/, 'legend must cover the grid');
assert.match(check({ ...room([entry]), rows: ['#####', '####', '#####'] }).join(), /row 1 width/, 'rows must be rectangular');
const perch = (extra) => mk(['#####', '#...#', '#.F.#', '#...#', '#####'], [{ ...entry, x: 1, y: 1 }, { type: 'prop', id: 'c', kind: 'can', x: 2, y: 2, ...extra }]);
assert.deepEqual(check(perch({ perch: true })), [], 'a perched prop may sit on a fence');
assert.match(check(perch({})).join(), /lies in a wall/, 'an unperched prop may not');
const walled = mk(['#######', '#..#..#', '#..#..#', '#######'], [entry, { type: 'home-spot', id: 'h', x: 4, y: 1 }]);
assert.match(check(walled).join(), /cannot be reached/, 'spots behind walls are unreachable');
assert.match(check(mk(['#####', '#.#.#', '#####'], [{ type: 'entry', id: 'in', x: 2, y: 1, facing: 'up' }])).join(), /blocked ground/, 'an entry in a wall fails');

// ---- entries and doors
const a = room([entry, { type: 'door', id: 'to-b', x: 4, y: 3, w: 2, h: 1, to: 'b', entry: 'from-a', label: 'world.door.exit' }]);
const b = room([{ type: 'entry', id: 'from-a', x: 3, y: 2, facing: 'down' }, { type: 'spawn', id: 'home', x: 4, y: 2 },
  { type: 'door', id: 'to-a', x: 1, y: 3, w: 1, h: 1, to: 'a', entry: 'in', label: 'world.door.exit', auto: true }]);
const world = (extra = {}) => ({ maps: { a: { data: a }, b: { data: b, ...extra } } });
assert.deepEqual(validateWorld(world(), env), [], 'two maps with a door each way are valid');
assert.deepEqual(resolveEntry(a, 'in'), { id: 'in', x: 2, y: 2, facing: 'up' });
assert.deepEqual(resolveEntry(b, 'home'), { id: 'home', x: 4, y: 2, facing: 'down' }, 'a spawn works as an entry');
assert.equal(resolveEntry(a, 'nowhere'), null);
assert.equal(resolveEntry(b, null).id, 'home', 'without an id the first spawn wins over entries');
assert.deepEqual(resolveDoor(world(), 'a', 'to-b'), { map: 'b', entry: { id: 'from-a', x: 3, y: 2, facing: 'down' } });
assert.match(resolveDoor(world(), 'a', 'nope').error, /no door/);
const dead = { maps: { a: { data: { ...a, objects: [entry, { ...a.objects[1], to: 'c' }] } }, b: { data: b } } };
assert.match(validateWorld(dead, env).join(), /unknown map 'c'/, 'a door to a missing map fails');
const wrongEntry = { maps: { a: { data: { ...a, objects: [entry, { ...a.objects[1], entry: 'zzz' }] } }, b: { data: b } } };
assert.match(validateWorld(wrongEntry, env).join(), /no entry 'zzz'/, 'a door to a missing entry fails');
assert.match(validateWorld(world({ debug: true }), env).join(), /leads from gameplay into debug map/, 'a gameplay door must not enter a debug map');
assert.deepEqual(validateWorld({ maps: { a: { data: a, debug: true }, b: { data: b, debug: true } } }, env), [], 'debug maps may link to each other');

// ---- reachability
const seen = reachable(walled, env.surfaces, 1, 1);
assert.equal(seen[1 * 7 + 2], 1);
assert.equal(seen[1 * 7 + 4], 0, 'the far room is cut off');
assert.equal(reachable(walled, env.surfaces, 0, 0).reduce((s, v) => s + v, 0), 0, 'a start inside a wall reaches nothing');

console.log(`world checks passed (${Object.keys(catalog.types).length} object types)`);
