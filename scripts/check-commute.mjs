// The commute (story 8.2): deadline and lateness, fares and the inspector, the tram lines and the routes, against the real
// data. Pure logic; the whole thing in the running game is covered by the smoke scenario `commute`.
// Run: node scripts/check-commute.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrival, fares, inspected, otherStop, rideTarget, validateCommute } from '../services/commuteLogic.js';
import { compileDay, parseTime } from '../services/dayTime.js';

const load = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = load('commute.json');
const town = load('maps/town.json');
const day = compileDay(load('day.json'));
const surfaces = load('surfaces.json');
const kopfnoten = load('kopfnoten.json');
const i18n = { de: JSON.parse(readFileSync(new URL('../i18n/de.json', import.meta.url), 'utf8')), en: JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8')) };

// ---- deadline: on time, early, late
const bell = parseTime('08:00');
assert.deepEqual(arrival('08:00', bell - 12), { late: 0, early: 12 });
assert.deepEqual(arrival('08:00', bell), { late: 0, early: 0 }, 'exactly at the bell is on time');
assert.deepEqual(arrival('08:00', bell + 7), { late: 7, early: 0 });

// ---- fares: tickets while the shared wallet can pay, then black riders
assert.deepEqual(fares(cfg.tram, 1000, 2), [true, true]);
assert.deepEqual(fares(cfg.tram, 150, 2), [true, false], 'one ticket, the second rider has no money left');
assert.deepEqual(fares(cfg.tram, 0, 1), [false]);
assert.ok(!inspected(cfg.tram, [true, true], 0), 'nobody is inspected when every rider has a ticket');
assert.ok(inspected(cfg.tram, [true, false], 0) && !inspected(cfg.tram, [false], 0.99), 'only black riders, and only by chance');
assert.equal(rideTarget(475, 480, 8), 479, 'the ride never crosses the end of the phase');
assert.equal(rideTarget(450, 480, 8), 458);

// ---- tram lines join real stops in both directions
assert.equal(otherStop(cfg.tram, 'home-tram-stop'), 'school-tram-stop');
assert.equal(otherStop(cfg.tram, 'school-tram-stop'), 'home-tram-stop');
assert.equal(otherStop(cfg.tram, 'riverside-tram-stop'), 'market-tram-stop');
assert.equal(otherStop(cfg.tram, 'nowhere'), null);

// ---- the data against the town and the day
const problems = validateCommute(cfg, town, day.phases.map(p => ({ id: p.id, start: `${Math.floor(p.start / 60)}:${String(p.start % 60).padStart(2, '0')}`, end: `${Math.floor(p.end / 60)}:${String(p.end % 60).padStart(2, '0')}` })), id => surfaces[id]?.solid === true);
assert.deepEqual(problems, [], problems.join('\n'));

// ---- every route is walkable from end to end (BFS over non-solid tiles, leg by leg)
const rows = town.rows;
const cols = rows[0].length;
const walkable = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows.length && surfaces[town.legend[rows[y][x]]]?.solid !== true;
function connected(a, b) {
  const seen = new Uint8Array(cols * rows.length);
  const q = [[a[0], a[1]]];
  seen[a[1] * cols + a[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (x === b[0] && y === b[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (walkable(nx, ny) && !seen[ny * cols + nx]) { seen[ny * cols + nx] = 1; q.push([nx, ny]); }
    }
  }
  return false;
}
for (const r of cfg.routes) {
  for (let i = 1; i < r.waypoints.length; i++) assert.ok(connected(r.waypoints[i - 1], r.waypoints[i]), `route ${r.id}: leg ${i} is not connected`);
  assert.deepEqual(r.waypoints.at(-1), cfg.routes[0].waypoints.at(-1), `route ${r.id} ends at the school`);
}
const home = town.objects.find(o => o.type === 'spawn');
const nearHome = tile => Math.hypot(tile[0] - home.x, tile[1] - home.y);
for (const r of cfg.routes) assert.ok(nearHome(r.waypoints[0]) < 22, `route ${r.id} starts near home`);
const tramStops = Object.fromEntries(town.objects.filter(o => o.type === 'tram-stop').map(o => [o.id, o]));
assert.ok(connected([home.x, home.y], [tramStops['home-tram-stop'].x, tramStops['home-tram-stop'].y]), 'the home stop is reachable from home');
const goal = town.objects.find(o => o.type === 'goal');
assert.ok(connected([tramStops['school-tram-stop'].x, tramStops['school-tram-stop'].y], [goal.x + 1, goal.y + 1]), 'the school stop leads to the school gate');
assert.ok(parseTime(cfg.warnings.at(-1)) < bell, 'warnings come before the bell');

// ---- consequences and texts
const kn = kopfnoten.events;
assert.ok(kn.some(e => e.event === 'school:late' && e.delta < 0 && e.delta >= -0.3), 'lateness costs a little Ordnung');
assert.ok(kn.some(e => e.event === 'commute:ontime' && e.delta > 0), 'being on time earns a little');
for (const l of ['de', 'en']) for (const k of ['commute.warn', 'commute.late', 'commute.ontime', 'tram.board', 'tram.arrived', 'tram.freeRide', 'tram.inspector', 'hint.commute.title', 'hint.commute.body', 'hint.tram.title', 'hint.tram.body']) assert.ok(i18n[l][k], `${l}: ${k}`);

console.log(`commute ok: bell ${cfg.deadline}, ${cfg.routes.length} walkable routes, ${cfg.tram.lines.length} tram lines, fares and inspector, ${cfg.pickups.length} pickups`);
