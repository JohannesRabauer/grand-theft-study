// Validates every map in data/maps/ (AD-5, AD-28) against data/object-types.json: grid shape, legend,
// object types and fields, nothing inside walls (unless the type allows it), door targets and
// entries, walkable reachability. The town additionally has to offer two clearly different,
// bike-friendly routes from home to school.
// Run: node scripts/check-map.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateWorld } from '../services/worldLogic.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const surfaces = load('surfaces.json');
const tiles = load('tiles.json');

// ---- every map file: listed in the index, valid against the catalog, linked consistently
const index = load('maps/index.json');
const files = readdirSync(new URL('../data/maps/', import.meta.url)).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
assert.deepEqual(index.maps.map(m => m.file).sort(), files, 'data/maps/index.json must list exactly the map files');
assert.equal(new Set(index.maps.map(m => m.id)).size, index.maps.length, 'map ids must be unique');
assert.ok(index.maps.some(m => m.id === index.start && !m.debug), 'the start map exists and is not a debug map');
const world = { maps: Object.fromEntries(index.maps.map(m => [m.id, { data: load(`maps/${m.file}`), debug: !!m.debug }])) };
const i18n = new Set(Object.keys(load('../i18n/de.json')));
const problems = validateWorld(world, { catalog: load('object-types.json'), surfaces, tiles, i18n });
assert.deepEqual(problems, [], `map validation failed:\n${problems.join('\n')}`);
console.log(`maps: ${index.maps.map(m => `${m.id}${m.debug ? ' (debug)' : ''}`).join(', ')} valid against the object catalog`);

// ---- the town (route checks below)
const map = world.maps.town.data;
const { rows, legend, objects } = map;
const H = rows.length;
const W = rows[0].length;

assert.ok(W >= 90 && H >= 60, `map should be about 96x64, is ${W}x${H}`);
for (const [y, r] of rows.entries()) assert.equal(r.length, W, `row ${y} width`);
for (const ch of new Set(rows.join(''))) assert.ok(legend[ch], `char '${ch}' missing in legend`);
for (const [ch, id] of Object.entries(legend)) {
  assert.ok(surfaces[id], `legend '${ch}' -> unknown surface ${id}`);
  assert.ok(tiles[id], `legend '${ch}' -> no tile art for ${id}`);
}

const surf = (x, y) => legend[rows[y]?.[x]];
const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !surfaces[surf(x, y)].solid;
const cells = (o) => {
  const out = [];
  for (let j = 0; j < (o.h || 1); j++) for (let i = 0; i < (o.w || 1); i++) out.push([o.x + i, o.y + j]);
  return out;
};

// objects: required kinds, unique ids, nothing inside a wall
const of = (t) => objects.filter(o => o.type === t);
assert.equal(new Set(objects.map(o => o.id)).size, objects.length, 'object ids must be unique');
assert.equal(of('spawn').filter(o => o.id === 'player').length, 1, 'player spawn');
assert.equal(of('goal').filter(o => o.id === 'school').length, 1, 'school goal');
assert.ok(of('bike').length >= 1, 'bike');
assert.ok(of('hiding').length >= 5, 'at least 5 hiding spots');
assert.ok(new Set(of('hiding').map(o => o.kind)).size >= 3, 'hiding kinds: hedge, dumpster, phone-booth');
assert.deepEqual(of('turf').map(o => o.id).sort(), ['schoolyard-back', 'skatepark'], 'turf zones');
assert.ok(of('ammo').length >= 8, 'at least 8 ammo pickups');
assert.ok(of('bully-spawn').length >= 3, 'at least 3 bully spawns');
assert.ok(of('prop').length >= 15, 'about 15 props');
assert.ok(of('prop').every(o => ['cone', 'can', 'crate', 'ball', 'trashcan'].includes(o.kind)), 'prop kinds');
for (const o of objects) {
  for (const [x, y] of cells(o)) {
    assert.ok(x >= 0 && y >= 0 && x < W && y < H, `${o.id} out of bounds`);
    if (o.type === 'turf') continue; // the skatepark contains ramps (walls) by design
    if (o.perch) { assert.equal(surf(x, y), 'fence', `perched ${o.id} must sit on a fence`); continue; } // cans on a fence
    assert.ok(walkable(x, y), `${o.type} ${o.id} lies in a wall at ${x},${y}`);
  }
}
for (const o of of('turf')) {
  const free = cells(o).filter(([x, y]) => walkable(x, y)).length;
  assert.ok(free >= cells(o).length * 0.6, `turf ${o.id} is mostly blocked`);
}

// Routes: BFS over 2x2-clear positions (a bike fits), leg by leg through waypoints.
const clear = (x, y) => walkable(x, y) && walkable(x + 1, y) && walkable(x, y + 1) && walkable(x + 1, y + 1);
const key = (x, y) => y * W + x;
function bfs(from, to, blocked) {
  const prev = new Map([[key(...from), null]]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q];
    if (x === to[0] && y === to[1]) {
      const path = [];
      for (let k = key(x, y); k !== null; k = prev.get(k)) path.push([k % W, Math.floor(k / W)]);
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k) || !clear(nx, ny) || blocked?.(nx, ny)) continue;
      prev.set(k, key(x, y));
      queue.push([nx, ny]);
    }
  }
  return null;
}
const route = (wps, blocked) => {
  const out = [];
  for (let i = 0; i + 1 < wps.length; i++) {
    const leg = bfs(wps[i], wps[i + 1], blocked);
    if (!leg) return null;
    out.push(...leg);
  }
  return out;
};
const start = of('spawn')[0];
const goal = of('goal')[0];
const from = [start.x, start.y];
const to = [goal.x, goal.y];
// waypoints are 2x2 top-left positions on each route
const A = route([from, [8, 54], [78, 54], [82, 40], [82, 30], to]); // main road
const B = route([from, [14, 44], [14, 30], [14, 14], [60, 14], [64, 14], to]); // park, canal bridge, old town
assert.ok(A && B, 'both routes must exist');

const bikeOk = new Set(['asphalt', 'lane', 'path', 'concrete', 'cobble']);
const report = (name, p) => {
  const frac = p.filter(([x, y]) => bikeOk.has(surf(x, y))).length / p.length;
  assert.ok(frac >= 0.7, `route ${name}: only ${Math.round(frac * 100)}% bike-friendly`);
  return `${name}: ${p.length} tiles, ${Math.round(frac * 100)}% bike-friendly`;
};
const lines = [report('main road', A), report('park/old town', B)];

const setA = new Set(A.map(([x, y]) => key(x, y)));
const shared = B.filter(([x, y]) => setA.has(key(x, y))).length;
const overlap = shared / Math.min(A.length, B.length);
assert.ok(overlap < 0.25, `routes overlap too much (${Math.round(overlap * 100)}%)`);
lines.push(`overlap ${Math.round(overlap * 100)}%`);

// Blocking either route's central stretch must leave the school reachable another way.
const around = (p, radius) => {
  const mid = p.slice(Math.floor(p.length * 0.35), Math.ceil(p.length * 0.65));
  return (x, y) => mid.some(([mx, my]) => Math.abs(mx - x) <= radius && Math.abs(my - y) <= radius);
};
for (const [name, p, other] of [['main road', A, B], ['park/old town', B, A]]) {
  const alt = bfs(from, to, around(p, 3));
  assert.ok(alt, `blocking ${name} leaves no way to school`);
  const otherSet = new Set(other.map(([x, y]) => key(x, y)));
  const common = alt.filter(([x, y]) => otherSet.has(key(x, y))).length / alt.length;
  lines.push(`without ${name}: detour of ${alt.length} tiles exists (${Math.round(common * 100)}% on the other route)`);
}

// Walking time at foot max speed (data/vehicles.json), 1 tile = tileSize px.
const foot = load('vehicles.json').foot.maxSpeed;
for (const [name, p] of [['main road', A], ['park/old town', B]]) {
  const s = Math.round((p.length * map.tileSize) / foot);
  assert.ok(s < 180, `${name} takes ${s}s on foot`);
  lines.push(`${name}: about ${s}s on foot`);
}
// Crowd markers (AD-15): spawns and nodes stand on walkable ground clear of walls, every link is a
// straight corridor a pedestrian (radius 4) can walk, and the graph is one connected piece.
{
  const nodes = of('npc-node');
  const spawns = of('npc-spawn');
  const roles = load('npcs.json').roles;
  assert.ok(nodes.length >= 20 && spawns.length >= 20, `crowd markers: ${nodes.length} nodes, ${spawns.length} spawns`);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const ts = map.tileSize;
  const free = (px, py, r = 4) => [-r, 0, r].every(ox => [-r, 0, r].every(oy => walkable(Math.floor((px + ox) / ts), Math.floor((py + oy) / ts))));
  for (const n of nodes) {
    assert.ok(free((n.x + 0.5) * ts, (n.y + 0.5) * ts), `node ${n.id} is inside or against a wall`);
    for (const l of n.links) {
      const m = byId.get(l);
      assert.ok(m && m.links.includes(n.id), `link ${n.id} -> ${l} is missing or one-way`);
      const steps = Math.ceil((Math.hypot(m.x - n.x, m.y - n.y) * ts) / 2);
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        assert.ok(free((n.x + 0.5 + (m.x - n.x) * u) * ts, (n.y + 0.5 + (m.y - n.y) * u) * ts), `link ${n.id} -> ${l} crosses a wall`);
      }
    }
  }
  for (const s of spawns) {
    assert.ok(roles[s.role], `spawn ${s.id}: unknown role ${s.role}`);
    assert.ok(byId.has(s.node), `spawn ${s.id}: unknown node ${s.node}`);
    assert.ok(free((s.x + 0.5) * ts, (s.y + 0.5) * ts), `spawn ${s.id} is inside or against a wall`);
    if (s.role === 'ballkids') assert.ok(free((s.x + s.gap + 0.5) * ts, (s.y + 0.5) * ts), `spawn ${s.id}: partner position blocked`);
  }
  const seen = new Set([nodes[0].id]);
  for (const queue = [nodes[0]]; queue.length;) for (const l of queue.shift().links) if (!seen.has(l)) { seen.add(l); queue.push(byId.get(l)); }
  assert.equal(seen.size, nodes.length, 'the pedestrian graph must be connected');
  for (const r of Object.keys(roles)) assert.ok(spawns.some(s => s.role === r), `a ${r} spawn exists`);
  lines.push(`crowd: ${nodes.length} nodes, ${spawns.length} spawns, graph connected`);
}
console.log(lines.join('\n'));
console.log('check-map ok');
