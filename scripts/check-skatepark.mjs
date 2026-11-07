// The skatepark of the town map (story 5.4, AD-28, CAP-15) without Phaser: the park objects validate against the
// catalog, nothing stands in a wall or on another obstacle, every trick type has an obstacle and a line, the main
// trick line chains ramp -> rail -> stairs -> manual pad -> bank spot in order over walkable, connected ground,
// the park is open to bikes through its gates, the entrance offers boards, skates and a bike rack, and the art data
// (funbox and bowl with launching ramps, gates in the fence, kid-safe decals) fits the map.
// Run: node scripts/check-skatepark.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMap, validateObject } from '../services/worldLogic.js';
import { projectPath, buildPath } from '../vehicles/trickCore.js';

const read = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const map = read('data/maps/town.json');
const catalog = read('data/object-types.json');
const surfaces = read('data/surfaces.json');
const tiles = read('data/tiles.json');
const tricks = read('data/tricks.json');
const park = read('data/park.json');
const de = read('i18n/de.json');
const en = read('i18n/en.json');
const env = { catalog, surfaces, tiles, i18n: new Set(Object.keys(de)) };
const ts = map.tileSize;
const objects = map.objects;
const of = t => objects.filter(o => o.type === t);
const byId = id => objects.find(o => o.id === id);
const surf = (x, y) => map.legend[map.rows[y]?.[x]];
const walkable = (x, y) => !!surf(x, y) && !surfaces[surf(x, y)].solid;
const rects = o => { const out = []; for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) out.push([o.x + i, o.y + j]); return out; };
const cellsOf = o => (o.points ? o.points.map(([x, y]) => [Math.floor(x), Math.floor(y)]) : o.w ? rects(o) : [[o.x, o.y]]);

// ---- the map and every object validate against the catalog; the old practice strip is gone
assert.deepEqual(validateMap('town', map, env), [], 'the town validates');
for (const o of objects) assert.deepEqual(validateObject(o, catalog, env, 'town'), [], `object ${o.id}`);
assert.ok(!objects.some(o => o.id.startsWith('practice-')), 'the practice strip moved into the park');
const turf = byId('skatepark');
assert.ok(turf && turf.type === 'turf', 'the skatepark turf zone stays');
assert.ok(of('bully-spawn').some(o => o.x >= turf.x && o.x < turf.x + turf.w && o.y >= turf.y && o.y < turf.y + turf.h && walkable(o.x, o.y)), 'a bully spawn still lies in the park turf');
for (const k of [turf.toast, turf.toastLeave]) assert.ok(de[k] && en[k], `zone toast ${k} in both languages`);
assert.equal(de[turf.toast], 'Skatepark: Hier wird gerollt!');
const inTurf = (x, y) => x >= turf.x && x < turf.x + turf.w && y >= turf.y && y < turf.y + turf.h;

// ---- no object in a wall, trick objects inside the turf and not on one another
const trickTypes = ['ramp', 'rail', 'stairs', 'bench', 'manual-pad', 'bank-spot', 'lamp', 'sign'];
const parkObjects = objects.filter(o => o.id.startsWith('park-'));
for (const o of parkObjects) for (const [x, y] of cellsOf(o)) assert.ok(walkable(x, y), `${o.id} lies in a wall at ${x},${y}`);
for (const o of parkObjects.filter(p => trickTypes.includes(p.type))) {
  for (const [x, y] of cellsOf(o)) assert.ok(inTurf(x, y), `${o.id} is inside the park turf`);
}
const footprints = parkObjects.filter(o => ['ramp', 'stairs', 'bench', 'manual-pad'].includes(o.type));
const owner = new Map();
for (const o of footprints) for (const c of rects(o)) { const k = c.join(); assert.ok(!owner.has(k), `${o.id} overlaps ${owner.get(k)} at ${k}`); owner.set(k, o.id); }
for (const p of park.maps.town.pieces) for (const c of rects(p)) { const k = c.join(); assert.ok(!owner.has(k) || p.kind === 'bowl' && owner.get(k).startsWith('park-bowl'), `piece ${p.kind} overlaps ${owner.get(k)} at ${k}`); }
for (const r of of('rail').filter(o => o.id.startsWith('park-'))) { // rails clear of rectangular obstacles
  const path = buildPath(r.points, ts);
  for (const o of footprints.filter(f => f.type !== 'manual-pad')) {
    for (let s = 0; s <= path.total; s += 2) {
      const t = Math.min(s, path.total);
      const i = path.cum.findIndex((v, k) => k < path.n - 1 && path.cum[k + 1] >= t);
      const f = (t - path.cum[i]) / (path.cum[i + 1] - path.cum[i] || 1);
      const px = path.x[i] + (path.x[i + 1] - path.x[i]) * f;
      const py = path.y[i] + (path.y[i + 1] - path.y[i]) * f;
      assert.ok(!(px > o.x * ts && px < (o.x + o.w) * ts && py > o.y * ts && py < (o.y + o.h) * ts), `rail ${r.id} runs through ${o.id}`);
    }
  }
}

// ---- every trick type has something to do it on
const parkOf = t => of(t).filter(o => o.id.startsWith('park-'));
const ramps = parkOf('ramp');
const stairs = parkOf('stairs');
const rails = parkOf('rail');
const benches = parkOf('bench');
const pads = parkOf('manual-pad');
const spots = parkOf('bank-spot');
const railLength = r => buildPath(r.points, ts).total / ts;
assert.ok(ramps.length >= 6, `a quarter-pipe pair, funbox ramps and bowl ramps (${ramps.length} ramps)`);
assert.ok(stairs.some(s => s.steps >= 3 && s.steps <= 5), 'a stair set of 3 to 5 steps');
const stair = stairs.find(s => s.steps >= 3);
assert.ok(rails.some(r => r.points[0][0] >= stair.x - 1 && r.points[0][0] <= stair.x + stair.w && r.points.every(p => p[1] >= stair.y - 2 && p[1] <= stair.y + stair.h + 2)), 'a handrail beside the stairs');
assert.ok(rails.some(r => r.points.length === 2 && railLength(r) >= 5), 'a long flat rail (grind, and the ollie onto it)');
assert.ok(rails.some(r => r.points.length >= 3), 'a kinked rail');
assert.ok(benches.length >= 3 && benches.every(b => Math.max(b.w, b.h) >= 3), 'ledge and bench lines');
assert.ok(pads.some(p => Math.max(p.w, p.h) * ts / 110 >= tricks.tricks.manual.minSweet * 1.5), 'a manual pad long enough for a balanced manual at 110 px/s');
assert.ok(spots.length >= 1 && spots.every(s => s.r >= 1 && s.r <= 3), 'a bank spot with a sensible ring');
const placed = { ollie: rails.length + benches.length + stairs.length, manual: pads.length, grind: rails.length + benches.length, stairs: stairs.length, ramp: ramps.length };
for (const t of Object.keys(tricks.tricks).filter(t => t !== 'grab')) assert.ok(placed[t] > 0, `trick ${t} has an obstacle in the park`); // grab belongs to the buses
const art = park.maps.town;
const near = (o, p) => rects(o).some(([x, y]) => x >= p.x - 1 && x <= p.x + p.w && y >= p.y - 1 && y <= p.y + p.h);
const funbox = art.pieces.find(p => p.kind === 'funbox');
assert.ok(ramps.some(r => r.dir === 'right' && near(r, funbox) && r.x < funbox.x) && ramps.some(r => r.dir === 'left' && near(r, funbox) && r.x >= funbox.x + funbox.w), 'a funbox with a ramp up each side');
const bowl = art.pieces.find(p => p.kind === 'bowl');
assert.ok(ramps.filter(r => near(r, bowl)).length >= 2, 'a bowl suggested by ramps around a pit');
assert.ok(spots.some(s => s.x >= bowl.x && s.x < bowl.x + bowl.w && s.y >= bowl.y && s.y < bowl.y + bowl.h), 'the bank spot sits in the bowl');
assert.ok(ramps.some(r => r.dir === 'right' && r.h >= 2) && ramps.some(r => r.dir === 'left' && r.h >= 2 && r.x > 60), 'the quarter-pipe pair faces each other');

// ---- the lines: ordered, walkable, connected, with a flat run-up
const lines = parkOf('trick-line');
const main = byId('park-line-main');
assert.ok(lines.length >= 2 && main, 'a main line and a second line');
for (const line of lines) {
  assert.ok(line.steps.every(id => byId(id)), `${line.id}: every step exists`);
  const path = buildPath(line.points, ts);
  let onConcrete = 0;
  let samples = 0;
  for (let s = 0; s <= path.total; s += 4) {
    const i = Math.max(0, path.cum.findIndex(v => v >= s) - 1);
    const f = (s - path.cum[i]) / (path.cum[i + 1] - path.cum[i] || 1);
    const x = Math.floor((path.x[i] + (path.x[i + 1] - path.x[i]) * Math.min(1, f)) / ts);
    const y = Math.floor((path.y[i] + (path.y[i + 1] - path.y[i]) * Math.min(1, f)) / ts);
    assert.ok(walkable(x, y), `${line.id} stays on walkable ground (${x},${y})`);
    samples++;
    if (surf(x, y) === 'concrete') onConcrete++;
  }
  assert.ok(onConcrete / samples >= 0.9, `${line.id} runs on concrete (only the gate threshold is grass)`);
  const out = {};
  const along = line.steps.map(id => {
    const o = byId(id);
    const cx = o.points ? o.points.reduce((a, p) => a + p[0], 0) / o.points.length : o.w ? o.x + o.w / 2 : o.x + 0.5;
    const cy = o.points ? o.points.reduce((a, p) => a + p[1], 0) / o.points.length : o.h ? o.y + o.h / 2 : o.y + 0.5;
    projectPath(path, cx * ts, cy * ts, out);
    assert.ok(out.dist <= 1.6 * ts, `${line.id}: ${id} lies on the line (${(out.dist / ts).toFixed(1)} tiles off)`);
    return out.s;
  });
  assert.ok(along.every((s, i) => i === 0 || s > along[i - 1]), `${line.id}: its steps follow one another along the line (${along.map(s => Math.round(s)).join(' ')})`);
}
const kinds = main.steps.map(id => byId(id).type);
assert.deepEqual(kinds, ['ramp', 'rail', 'stairs', 'manual-pad', 'bank-spot'], 'the main line: ramp, rail grind, stair jump, manual pad, bank');
assert.ok(byId(main.steps[2]).steps >= 3, 'the main line jumps at least 3 steps');
// a flat run-up before the first ramp and between the ramp landing and the rail
const ramp1 = byId(main.steps[0]);
const rail1 = byId(main.steps[1]);
for (let x = ramp1.x - 2; x < ramp1.x; x++) assert.equal(surf(x, ramp1.y), 'concrete', `run-up before ${ramp1.id} at ${x}`);
assert.ok(rail1.points[0][0] * ts - (ramp1.x + ramp1.w) * ts >= 4 * ts, 'room to land the ramp and ollie onto the rail');

// ---- connected: a bike (2x2) rolls from the start to the park through a gate and to every line step; fence gaps are gates
const W = map.rows[0].length;
const clear = (x, y) => walkable(x, y) && walkable(x + 1, y) && walkable(x, y + 1) && walkable(x + 1, y + 1);
const seen = new Set();
const spawn = byId('player');
for (const q = [[spawn.x, spawn.y]], k = (x, y) => y * W + x; q.length;) {
  const [x, y] = q.shift();
  if (seen.has(k(x, y)) || !clear(x, y)) continue;
  seen.add(k(x, y));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push([x + dx, y + dy]);
}
const reach = (tx, ty) => [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => seen.has((ty + dy) * W + tx + dx));
for (const id of main.steps) { const o = byId(id); assert.ok(cellsOf(o).some(([x, y]) => reach(x, y)), `${id} is reachable by bike from the start`); }
for (const g of art.gates) {
  assert.ok(g.axis === 'x' ? g.w >= 3 : g.h >= 3, `gate at ${g.x},${g.y} is wide enough for a bike`);
  for (const [x, y] of rects(g)) assert.ok(walkable(x, y), `gate cell ${x},${y} is open`);
  const [a, b] = g.axis === 'x' ? [[g.x - 1, g.y], [g.x + g.w, g.y]] : [[g.x, g.y - 1], [g.x, g.y + g.h]];
  for (const [x, y] of [a, b]) assert.equal(surf(x, y), 'fence', `the gate at ${g.x},${g.y} sits in a fence (${x},${y})`);
}
const gate = art.gates[0];
const gc = [gate.x + (gate.axis === 'x' ? gate.w / 2 : 0), gate.y + (gate.axis === 'y' ? gate.h / 2 : 0)];
const dist = o => Math.hypot(o.x - gc[0], o.y - gc[1]);

// ---- the entrance: boards, skates, bike rack, the Lines sign
const entranceBoards = of('skateboard').filter(o => dist(o) <= 4);
assert.ok(entranceBoards.length >= 2, `two skateboards at the entrance (${entranceBoards.length})`);
assert.ok(of('skates').filter(o => dist(o) <= 4).length >= 1, 'a pair of skates at the entrance');
const rack = parkOf('bike-rack')[0];
assert.ok(rack && dist(rack) <= 8, 'a bike rack stub near the entrance');
const sign = parkOf('sign')[0];
assert.ok(sign && de[sign.text] && en[sign.text] && /Lines/.test(de[sign.text]), 'the Lines hint sign');
for (const o of [...entranceBoards, ...of('skates').filter(o => dist(o) <= 4), rack]) assert.ok(clear(o.x, o.y) || walkable(o.x, o.y), `${o.id} stands on open ground`);
assert.ok(parkOf('lamp').length >= 3, 'lamp posts');

// ---- art data
const f = art.floor;
for (const d of art.decals) {
  assert.ok(d.x >= f.x && d.x < f.x + f.w && d.y >= f.y && d.y < f.y + f.h, `decal ${d.kind} lies on the floor canvas`);
  if (d.kind === 'word') assert.ok(['SKATE', 'LOS'].includes(d.text), `decal word ${d.text} is kid-safe and on the list`);
  else assert.ok(['star', 'bolt', 'circle', 'triangle', 'blob'].includes(d.kind), `decal kind ${d.kind}`);
}
assert.ok(art.decals.some(d => d.text === 'SKATE') && art.decals.some(d => d.text === 'LOS'), 'SKATE and LOS graffiti');
for (const p of art.pieces) for (const [x, y] of rects(p)) assert.ok(surf(x, y) === 'concrete', `${p.kind} stands on concrete`);
assert.ok(park.signRadius > 0 && park.signLeave > park.signRadius, 'sign radii');
assert.equal(map.legend[map.rows[turf.y + 5][turf.x + 5]], 'concrete', 'the plaza is concrete');

console.log(`check-skatepark ok: ${ramps.length} ramps, ${rails.length} rails, ${stairs.length} stairs, ${benches.length} benches, ${lines.length} lines, ${spots.length} bank spot`);
