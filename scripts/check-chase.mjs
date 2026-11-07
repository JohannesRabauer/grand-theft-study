// Checks the chase AI that does not need Phaser: grid A* on the real town map, the per-frame
// request budget, line of sight, and the Ärger level thresholds.
// Run: node scripts/check-chase.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pathfinder } from '../ai/Pathfinding.js';
import { ChaseLevel } from '../ai/ChaseLevel.js';
import { Escape } from '../ai/Escape.js';
import { pickTarget, escapeVerdict, wantedKinds, offView } from '../ai/chaseLogic.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const map = load('maps/town.json');
const surfaces = load('surfaces.json');
const chase = load('chase.json');
const ts = map.tileSize;
const nav = new Pathfinder(map, surfaces, chase.nav);
const px = (t) => (t + 0.5) * ts;
const obj = (type, id) => map.objects.find(o => o.type === type && o.id === id);

// Path home -> school: exists, every tile walkable, steps adjacent, no diagonal corner cutting.
const home = obj('spawn', 'player');
const school = obj('goal', 'school');
const out = new Int32Array(chase.nav.maxPath);
const n = nav.findPath(px(home.x), px(home.y), px(school.x + 1), px(school.y + 1), out);
assert.ok(n > 10, 'a path from home to school exists');
for (let i = 0; i < n; i++) {
  const x = out[i] % nav.cols;
  const y = Math.floor(out[i] / nav.cols);
  assert.ok(!nav.isSolid(x, y), `path tile ${x},${y} is walkable`);
  if (i === 0) continue;
  const px0 = out[i - 1] % nav.cols;
  const py0 = Math.floor(out[i - 1] / nav.cols);
  assert.ok(Math.abs(x - px0) <= 1 && Math.abs(y - py0) <= 1, 'consecutive tiles are neighbours');
  if (x !== px0 && y !== py0) assert.ok(!nav.isSolid(x, py0) && !nav.isSolid(px0, y), 'no corner cutting');
}

// The path really goes around walls: a straight line home -> school is blocked, the path is longer.
const straight = Math.hypot(school.x - home.x, school.y - home.y);
assert.ok(!nav.lineClear(px(home.x), px(home.y), px(school.x), px(school.y)), 'straight line to school is blocked');
assert.ok(n > straight, `path (${n} tiles) detours around walls (straight ${straight.toFixed(0)})`);

// Goals inside walls snap to the nearest walkable tile; the outside of the map has no path.
assert.ok(nav.findPath(px(home.x), px(home.y), px(0), px(0), out) > 0, 'wall goal snaps to a walkable neighbour');
assert.equal(nav.findPath(px(home.x), px(home.y), -500, -500, out), 0, 'unreachable goal gives no path');
for (const h of map.objects.filter(o => o.type === 'hiding')) {
  assert.ok(nav.snap(h.x, h.y) >= 0, `hiding spot ${h.id} is reachable by bullies`);
}
for (const s of map.objects.filter(o => o.type === 'bully-spawn')) {
  assert.ok(nav.findPath(px(s.x), px(s.y), px(home.x), px(home.y), out) > 0, `spawn ${s.id} can reach the player area`);
}

// Line of sight: wall blocks, open ground does not, a ray inside one tile is clear.
assert.ok(nav.lineClear(px(home.x), px(home.y), px(home.x) + 20, px(home.y)), 'open ground is clear');
assert.ok(!nav.lineClear(px(1), px(1), px(0), px(0)), 'ray into the border wall is blocked');

// Budget: more requests than the budget are spread over frames, each owner queued once.
const owners = Array.from({ length: 5 }, () => ({ pathPending: false, solved: 0, solvePath() { this.solved++; } }));
owners.forEach(o => { nav.request(o); nav.request(o); });
assert.equal(nav.qCount, 5, 'each owner is queued once');
nav.update();
assert.equal(nav.solvedLastUpdate, chase.nav.budget, 'budget limits solves per frame');
assert.equal(owners.filter(o => o.solved).length, chase.nav.budget);
nav.update(); nav.update();
assert.ok(owners.every(o => o.solved === 1) && nav.qCount === 0, 'all requests served within a few frames');

// Performance: full-map search home -> school.
const runs = 300;
for (let i = 0; i < 30; i++) nav.findPath(px(home.x), px(home.y), px(school.x + 1), px(school.y + 1), out); // JIT warm-up
const times = [];
const t0 = performance.now();
for (let i = 0; i < runs; i++) {
  const a = performance.now();
  nav.findPath(px(home.x), px(home.y), px(school.x + 1), px(school.y + 1), out);
  times.push(performance.now() - a);
}
const avg = (performance.now() - t0) / runs;
times.sort((x, y) => x - y);
const worst = times[Math.floor(runs * 0.99)]; // p99: single OS/GC spikes do not count
// Wall-clock limit with headroom for a busy machine (check-all runs other scripts and browsers alongside);
// the real budget on a phone is covered by docs/PERFORMANCE.md.
assert.ok(worst < 5, `A* p99 ${worst.toFixed(2)} ms must stay under 5 ms`);

// Ärger level thresholds.
const log = [];
const mk = (enabled = true) => new ChaseLevel(chase.level, enabled, (level, reason) => log.push(`${level}:${reason}`));
let lv = mk();
lv.turf(true);
assert.equal(lv.level, 1, 'entering turf -> level 1');
lv.update(chase.level.turfSecondsPerLevel - 0.1);
assert.equal(lv.level, 1, 'not yet');
lv.update(0.2);
assert.equal(lv.level, 2, 'staying in turf -> level 2');
lv.update(100);
assert.equal(lv.level, 2, 'level is capped at 2');

lv = mk();
lv.bump();
assert.equal(lv.level, 1, 'bump raises by one');
lv.bump();
assert.equal(lv.level, 1, 'bump cooldown');
lv.update(chase.level.bumpCooldown + 0.1);
lv.bump();
assert.equal(lv.level, 2, 'second bump -> level 2');

lv = mk();
lv.bump();
lv.cool(2);
lv.update(1);
assert.equal(lv.level, 1, 'cool-down pending');
lv.update(1.1);
assert.equal(lv.level, 0, 'cool-down drops the level to 0');
lv.turf(true);
assert.equal(lv.level, 0, 'turf cannot raise it during the lockout');
lv.update(chase.level.lockoutAfterClear + 0.1);
assert.equal(lv.level, 1, 'after the lockout turf raises it again');

lv = mk(false);
lv.turf(true); lv.bump();
assert.equal(lv.level, 0, 'chaseEnabled=false keeps level 0');

// Escape rules: hide cooldown, resets on sighting / stumbling, slow cool-down at distance.
const e = chase.escape;
let es = new Escape(e);
const step = (n, dt, active, hidden, seen, nearest) => { let r = null; for (let i = 0; i < n; i++) r = es.update(dt, active, hidden, seen, nearest) ?? r; return r; };
assert.equal(step(1, e.hideSeconds - 0.1, true, true, false, 100), null, 'hiding: not yet');
assert.ok(es.progress > 0.9 && es.progress < 1, 'progress fills towards 1');
assert.equal(step(1, 0.2, true, true, false, 100), 'hidden', 'hidden and unseen for the cooldown -> level drops');
es = new Escape(e);
step(1, e.hideSeconds - 0.1, true, true, false, 100);
step(1, 0.1, true, true, true, 100);
assert.equal(es.progress, 0, 'being seen resets the hide timer');
step(1, e.hideSeconds - 0.1, true, true, false, 100);
step(1, 0.1, true, false, false, 100);
assert.equal(es.progress, 0, 'leaving the spot (moving) resets the hide timer');
step(1, e.hideSeconds - 0.1, true, true, false, 100);
step(1, 0.1, true, true, false, e.stumbleRadius - 1);
assert.equal(es.progress, 0, 'a bully stumbling close resets the hide timer');
assert.equal(step(1, 100, false, true, false, 100), null, 'nothing to escape from at level 0');
es = new Escape(e);
assert.equal(step(1, e.farSeconds - 0.1, true, false, false, e.farDistance + 1), null, 'far: not yet');
assert.equal(step(1, 0.2, true, false, false, e.farDistance + 1), 'escaped', 'far from every bully and unseen -> cools down');
es = new Escape(e);
step(1, e.farSeconds - 0.1, true, false, false, e.farDistance + 1);
step(1, 0.1, true, false, false, e.farDistance - 1);
assert.equal(es.farT, 0, 'a bully coming close resets the distance timer');
assert.equal(step(1, 100, true, false, true, e.farDistance + 1), null, 'being seen blocks the distance cool-down');

// ---- two players (AD-18): target choice with hysteresis, escape rule across players, spawn counts, off-screen spawns
{
  const sw = chase.coop.switchRatio;
  assert.ok(sw > 0 && sw < 1, 'switchRatio is a share below 1');
  const INF = Infinity;
  assert.equal(pickTarget([INF, INF], 2, -1, sw), -1, 'nobody visible: no target');
  assert.equal(pickTarget([400, INF], 2, -1, sw), 0, 'the only visible player is chosen');
  assert.equal(pickTarget([900, 400], 2, -1, sw), 1, 'no current target: the nearest visible wins');
  assert.equal(pickTarget([900, 400], 2, 0, sw), 1, 'a clearly nearer player takes over');
  assert.equal(pickTarget([400, 380], 2, 0, sw), 0, 'hysteresis: a barely nearer player does not flip the target');
  assert.equal(pickTarget([380, 400], 2, 1, sw), 1, 'and the other way round');
  assert.equal(pickTarget([INF, 400], 2, 0, sw), 1, 'the current target out of sight: the visible one is taken');
  // no flip-flopping while two players trade places by a few percent every frame
  let cur = 0;
  let flips = 0;
  for (let f = 0; f < 600; f++) {
    const wob = 1 + 0.15 * Math.sin(f / 7);
    const next = pickTarget([400 * wob, 400 / wob], 2, cur, sw);
    if (next !== cur) flips++;
    cur = next;
  }
  assert.equal(flips, 0, 'similar distances never make the bully flip');
  assert.equal(pickTarget([500], 1, 0, sw), 0, 'one player: unchanged');

  // level cooling across players: every player in play has to be safe on its own timers
  const eCfg = chase.escape;
  const mkEsc = () => [new Escape(eCfg), new Escape(eCfg)];
  const tick = (es, i, secs, hidden, seen, nearest) => es[i].update(secs, true, hidden, seen, nearest);
  let es = mkEsc();
  tick(es, 0, eCfg.hideSeconds + 0.1, true, false, 100);
  tick(es, 1, eCfg.hideSeconds + 0.1, false, true, 100);
  assert.equal(escapeVerdict(es, [1, 1], 2), null, 'one hides, the other is seen: the chase goes on');
  tick(es, 1, eCfg.hideSeconds + 0.1, true, false, 100);
  assert.equal(escapeVerdict(es, [1, 1], 2), 'hidden', 'both hidden long enough: the level may drop');
  es = mkEsc();
  tick(es, 0, eCfg.hideSeconds + 0.1, true, false, 100);
  tick(es, 1, eCfg.farSeconds + 0.1, false, false, eCfg.farDistance + 1);
  assert.equal(escapeVerdict(es, [1, 1], 2), 'escaped', 'one hidden, one far and unseen: both are safe');
  assert.equal(escapeVerdict(es, [1, 0], 2), 'hidden', 'a caught player (not in play) does not count');
  assert.equal(escapeVerdict(es, [0, 0], 2), null, 'nobody in play: no verdict');
  tick(es, 0, 0.1, true, true, 100); // sighted again
  assert.equal(escapeVerdict(es, [1, 1], 2), null, 'being seen again resets that player and keeps the chase');
  assert.equal(escapeVerdict([new Escape(eCfg)], [1], 1), null, 'one player: nothing done yet');

  // spawn counts: at most +1 bully in co-op, never past the tier cap, single player untouched
  const L = chase.level;
  assert.deepEqual(wantedKinds(L, 1, false, 3), ['foot'], 'one player level 1: as before');
  assert.deepEqual(wantedKinds(L, 2, false, 3), ['foot', 'bike', 'foot'], 'one player level 2: as before');
  assert.equal(wantedKinds(L, 1, true, 3).length, 2, 'co-op level 1: one extra bully');
  for (const lv of [0, 1, 2]) {
    const plus = (L.coopExtraByLevel[lv] ?? []).length;
    assert.ok(plus <= 1, `level ${lv} adds at most one bully`);
    for (const cap of [2, 3, 4]) {
      assert.ok(wantedKinds(L, lv, true, cap).length <= cap, `co-op level ${lv} respects cap ${cap}`);
      assert.ok(wantedKinds(L, lv, true, cap).length - wantedKinds(L, lv, false, cap).length <= 1, 'at most +1 over the single-player count');
    }
  }
  assert.equal(wantedKinds(L, 2, true, 3).length, 3, 'capped at the Medium tier');
  assert.equal(wantedKinds(L, 0, true, 3).length, 0, 'level 0 wants nobody');

  // off-screen spawns are judged on the view that holds both players
  assert.equal(offView(0, 0, 0, 0, 240, 135, 40), false, 'in the middle of the view');
  assert.equal(offView(270, 0, 0, 0, 240, 135, 40), false, 'inside the margin');
  assert.equal(offView(281, 0, 0, 0, 240, 135, 40), true, 'beyond the margin on x');
  assert.equal(offView(0, 200, 0, 0, 240, 135, 40), true, 'beyond the margin on y');
}

console.log(`chase checks passed: path ${n} tiles, A* avg ${avg.toFixed(3)} ms, p99 ${worst.toFixed(3)} ms; level events ${log.length}`);
