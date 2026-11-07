// Skates and bus grab without Phaser (AD-23, story 5.3): the skates profile against skateboard, bike and foot on the real
// MovementController, the grab zone, failure/duration model with the busGrabBonus perk and seeded randomness, release
// rules, the looping route on the town's road, the hold intent and the grab score.
// Run: node scripts/check-skates.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MovementController } from '../vehicles/MovementController.js';
import { createGrab, failureRate, inRearZone, maxDuration, mayStart, startGrab, stepGrab } from '../vehicles/grabLogic.js';
import { buildRoute, easeHeading, routeAt } from '../vehicles/routeLogic.js';
import { trickPoints } from '../vehicles/trickCore.js';
import { NO_TOUCH, PAD, bindingFor, createIntent, createSlot, mapIntent } from '../ui/inputBindings.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const vehicles = read('vehicles');
const surfaces = read('surfaces');
const grab = read('grab');
const routes = read('routes');
const tricks = read('tricks');
const chars = read('characters');
const town = read('maps/town');
const input = read('input');
const sk = vehicles.skates;
const board = vehicles.skateboard;
const DT = 1 / 60;

// ---- profile: the most agile ride, bad off the pavement
assert.ok(sk.faceHeading && sk.grab === true && sk.poses.push.length === 2 && sk.poses.grab && sk.poses.crouch && sk.push.interval > 0, 'skates profile has push poses, grab flag and push timing');
assert.ok(sk.trick.ollie && sk.trick.grind && !sk.trick.manual, 'a hop and rail grinds, no manual');
assert.ok(sk.accel > board.accel && sk.accel > vehicles.bike.accel, 'quickest acceleration of the rides');
assert.ok(sk.turnRate > board.turnRate && sk.turnRate > vehicles.bike.turnRate, 'highest turn rate of the rides');
assert.ok(sk.maxSpeed > vehicles.foot.maxSpeed * 1.4 && sk.maxSpeed < vehicles.bike.maxSpeed, 'good top speed on asphalt, below the bike');
for (const [id, s] of Object.entries(surfaces)) assert.equal(typeof s.speed.skates, 'number', `${id} has a skates multiplier`);
const top = (p, s) => vehicles[p].maxSpeed * surfaces[s].speed[p];
for (const s of ['asphalt', 'concrete', 'path', 'lane']) assert.ok(top('skates', s) > top('foot', s) * 1.2, `${s}: clearly faster than walking`);
for (const s of ['cobble', 'grass']) {
  assert.ok(top('skates', s) < top('skateboard', s) && top('skates', s) < top('bike', s) && top('skates', s) < top('foot', s) * 0.7, `${s}: much slower than board, bike and walking`);
  assert.ok(surfaces[s].gripMult.skates < 0.8 && surfaces[s].rattle > 0, `${s}: low grip and rattle`);
}
assert.ok(sk.fx.rattleJitter > board.fx.rattleJitter, 'skates shake harder on rough ground');
assert.ok(surfaces.puddle.gripMult.skates < 1 && top('skates', 'puddle') < top('skates', 'asphalt') * 0.6, 'puddles slow and slide');
assert.ok(surfaces.ice.gripMult.skates < 1 && surfaces.ice.grip < 0.2 && top('skates', 'ice') > top('skates', 'puddle'), 'ice is slippery and defined for the skates');
for (const [id, s] of Object.entries(surfaces)) if (s.gripMult) assert.ok(Object.keys(s.gripMult).every(k => k in vehicles), `${id}: gripMult only names profiles`);

// ---- the same MovementController, measured
function rig(profileId, surface) {
  const body = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
  const matter = { body: { setVelocity(b, v) { b.velocity.x = v.x; b.velocity.y = v.y; } } };
  return new MovementController(matter, body, profileId, vehicles[profileId], { at: () => surface, props: id => surfaces[id] });
}
const topSpeed = (p, s) => { const mc = rig(p, s); for (let i = 0; i < 600; i++) mc.update(DT, 1, 0, false); return mc.velSpeed; };
const timeTo = (p, s, v) => { const mc = rig(p, s); for (let i = 0; i < 600; i++) { mc.update(DT, 1, 0, false); if (mc.velSpeed >= v) return i * DT; } return Infinity; };
for (const s of ['asphalt', 'cobble', 'grass', 'puddle', 'concrete', 'ice']) {
  const v = topSpeed('skates', s);
  assert.ok(Math.abs(v - top('skates', s)) < 1.5, `${s}: skates reach their designed ${top('skates', s).toFixed(1)} (got ${v.toFixed(1)})`);
}
assert.ok(timeTo('skates', 'asphalt', 60) < timeTo('skateboard', 'asphalt', 60) && timeTo('skates', 'asphalt', 60) < timeTo('bike', 'asphalt', 60), 'to 60 px/s quicker than board and bike');
function turnTime(p) { // seconds to swing the heading by 180 degrees at 60 px/s
  const mc = rig(p, 'asphalt');
  for (let i = 0; i < 300; i++) mc.update(DT, 1, 0, false);
  mc.speed = 60;
  for (let i = 0; i < 600; i++) { mc.update(DT, -1, 0, false); if (Math.abs(Math.abs(mc.heading) - Math.PI) < 0.05) return i * DT; }
  return Infinity;
}
assert.ok(turnTime('skates') < turnTime('skateboard') && turnTime('skateboard') < turnTime('bike'), 'turns in less time than board and bike');
assert.ok(topSpeed('skates', 'cobble') < 0.5 * topSpeed('skateboard', 'asphalt') && topSpeed('skates', 'grass') < topSpeed('foot', 'asphalt'), 'cobble and grass cripple the skates');
assert.ok(timeTo('skates', 'cobble', 20) > timeTo('skates', 'asphalt', 20), 'accelerating on cobble takes longer (less grip)');

// ---- bus and route
const bus = grab.targets.bus;
const route = routes.routes[0];
assert.equal(route.kind, 'bus');
assert.ok(grab.targets[route.kind] && route.count <= grab.maxTargets && route.map === 'town', 'route points at a kind, fits the pool and names its map');
assert.ok(route.speed > top('skates', 'asphalt') * 1.2, 'a tow is a clearly noticeable boost over the skates top speed');
assert.ok(route.speed < top('bike', 'asphalt'), 'but a bike still overtakes the bus');
assert.ok(bus.zone.length > 20 && bus.zone.width >= bus.width, 'the grab zone is wide and long enough to hit while it drives by');
{
  const r = buildRoute(route.points, town.tileSize);
  const out = { x: 0, y: 0, tx: 0, ty: 0 };
  assert.ok(r.total > 1000, `a long loop (${r.total.toFixed(0)} px)`);
  const legend = town.legend;
  for (let s = 0; s < r.total * 1.5; s += 6) {
    routeAt(r, s, out);
    assert.ok(Math.abs(Math.hypot(out.tx, out.ty) - 1) < 1e-9, 'unit tangent');
    // the bus body (length x width) must stay on the road: check its four corners on the map
    const h = Math.atan2(out.ty, out.tx);
    for (const [a, l] of [[-bus.length / 2, -bus.width / 2], [-bus.length / 2, bus.width / 2], [bus.length / 2, -bus.width / 2], [bus.length / 2, bus.width / 2]]) {
      const x = out.x + a * Math.cos(h) - l * Math.sin(h);
      const y = out.y + a * Math.sin(h) + l * Math.cos(h);
      const ch = town.rows[Math.floor(y / town.tileSize)][Math.floor(x / town.tileSize)];
      assert.ok(['asphalt', 'lane', 'puddle'].includes(legend[ch]), `route stays on the road at ${x.toFixed(0)},${y.toFixed(0)} (${legend[ch]})`);
    }
  }
  routeAt(r, 0, out);
  const a = { x: out.x, y: out.y };
  routeAt(r, r.total, out);
  assert.ok(Math.hypot(out.x - a.x, out.y - a.y) < 1e-6, 'the loop closes');
  routeAt(r, -5, out);
  assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y), 'negative arc wraps');
  assert.ok(Math.abs(easeHeading(0, Math.PI - 0.1, 0.05) - 0.05) < 1e-9 && Math.abs(easeHeading(3.1, -3.1, 1) + 3.1) < 1e-9 && Math.abs(easeHeading(0, 50, 100)) <= Math.PI, 'heading eases the short way round');
}

// ---- grab zone
{
  const z = bus.zone;
  const x = 300;
  const y = 200;
  const inz = (h, px, py) => inRearZone(x, y, h, bus.length, z, px, py);
  const rear = x - bus.length / 2;
  assert.ok(inz(0, rear - 10, y) && inz(0, rear - z.length + 1, y + 10) && inz(0, rear + z.reach - 1, y), 'behind the rear, within the zone');
  assert.ok(!inz(0, rear - z.length - 2, y) && !inz(0, rear - 10, y + z.width / 2 + 2) && !inz(0, x + 20, y), 'too far behind, beside or in front: out');
  assert.ok(inz(Math.PI, x + bus.length / 2 + 10, y) && !inz(Math.PI, rear - 10, y), 'heading west the zone is on the east side');
  assert.ok(inz(Math.PI / 2, x, y - bus.length / 2 - 10) && !inz(Math.PI / 2, x, y + 40), 'heading south the zone is above');
}

// ---- failure model
const rate = (o = {}) => failureRate(grab, o.speed ?? route.speed, o.bump ?? 0, o.swing ?? 0, o.time ?? 4, o.perk ?? 0);
assert.ok(rate({ speed: 200 }) > rate({ speed: 100 }) && rate({ bump: surfaces.cobble.rattle }) > rate() * 2, 'faster and bumpier raises the rate (cobble a lot)');
assert.ok(rate({ time: 8 }) > rate({ time: 1 }) && rate({ swing: 1 }) > rate({ swing: 0 }), 'longer and more swinging raises it');
assert.ok(rate({ perk: 0.5 }) < rate() && rate({ perk: 0.5 }) > 0 && rate({ perk: 10 }) >= grab.failure.base * grab.failure.perkFloor, 'the perk lowers the rate, never to zero');
assert.ok(maxDuration(grab, 0.5) > maxDuration(grab, 0.1) && maxDuration(grab, 0.1) > maxDuration(grab, 0), 'the perk stretches the duration');
const jonas = chars.characters.find(c => c.id === 'jonas').perks.busGrabBonus;
const mehmet = chars.characters.find(c => c.id === 'mehmet').perks.busGrabBonus;
const lena = chars.perkDefaults.busGrabBonus;
assert.ok(jonas > mehmet && mehmet > lena && lena === 0, 'Jonas is the bus grab pro, Mehmet a little, Lena none');

// seeded Monte Carlo of full grabs (hold all the way, no jump)
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function trial(rand, { perk = 0, bump = 0, swing = 0.3 } = {}) {
  const g = createGrab();
  startGrab(g, false);
  for (let n = 0; n < 5000; n++) {
    const r = stepGrab(g, grab, DT, { hold: true, jump: false, speed: route.speed, bump, swing, slack: 0, perk, rand: rand() });
    if (r) return { reason: r, time: g.time, risk: g.risk };
  }
  throw new Error('grab never ended');
}
function odds(opts, n = 3000, seed = 7) {
  const rand = mulberry(seed);
  let fail = 0;
  let tired = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = trial(rand, opts);
    if (r.reason === 'fail') fail++; else if (r.reason === 'tired') tired++;
    sum += r.time;
  }
  return { fail: fail / n, tired: tired / n, time: sum / n };
}
const normal = odds({});
const rough = odds({ bump: surfaces.cobble.rattle });
const pro = odds({ perk: jonas });
assert.ok(normal.fail > 0.15 && normal.fail < 0.7, `normal ride: sometimes fails (${normal.fail.toFixed(2)})`);
assert.ok(normal.tired > 0.2, `and a good share reaches the time limit (${normal.tired.toFixed(2)})`);
assert.ok(rough.fail > 0.8 && rough.fail > normal.fail + 0.2, `cobble: nearly always fails (${rough.fail.toFixed(2)})`);
assert.ok(pro.fail < normal.fail * 0.85 && pro.time > normal.time, `the perk lowers failure (${pro.fail.toFixed(2)} vs ${normal.fail.toFixed(2)}) and extends the ride`);
assert.deepEqual(odds({}, 200, 3), odds({}, 200, 3), 'seeded runs repeat');
{ // the risk bar of a rider who stays on to the end is moderate: it is the chance that a failure had happened by then
  const rand = mulberry(11);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 2000; i++) {
    const r = trial(rand);
    if (r.reason === 'tired') { sum += r.risk; n++; }
  }
  assert.ok(n > 300 && sum / n > 0.1 && sum / n < 0.6, `risk bar of a survivor ends moderate (${(sum / n).toFixed(2)})`);
}
{ // no failure in the grace period even for an unlucky roll
  const g = createGrab();
  startGrab(g, false);
  let r = '';
  for (let t = 0; t < grab.failure.grace - 0.05; t += DT) r = stepGrab(g, grab, DT, { hold: true, jump: false, speed: 500, bump: 1, swing: 1, slack: 0, perk: 0, rand: 0 });
  assert.equal(r, '', 'grace period');
  assert.equal(g.risk, 0);
}

// ---- release rules
{
  const base = { hold: true, jump: false, speed: 140, bump: 0, swing: 0, slack: 0, perk: 0, rand: 0.999 };
  const fresh = (jumpHeld = false) => { const g = createGrab(); startGrab(g, jumpHeld); return g; };
  let g = fresh();
  assert.equal(stepGrab(g, grab, DT, base), '');
  assert.equal(stepGrab(g, grab, DT, { ...base, hold: false }), 'release', 'letting go of the button releases');
  assert.ok(!g.active);
  g = fresh();
  assert.equal(stepGrab(g, grab, DT, { ...base, jump: true }), 'jump', 'a jump press ollies off');
  g = fresh(true);
  assert.equal(stepGrab(g, grab, DT, { ...base, jump: true }), '', 'a jump already held at the start does not');
  assert.equal(stepGrab(g, grab, DT, { ...base, jump: false }), '');
  assert.equal(stepGrab(g, grab, DT, { ...base, jump: true }), 'jump', 'but a fresh press does');
  g = fresh();
  assert.equal(stepGrab(g, grab, DT, { ...base, slack: grab.snapSlack + 1 }), 'lost', 'a snagged rope is lost');
  g = fresh();
  g.time = maxDuration(grab, 0) - DT / 2;
  assert.equal(stepGrab(g, grab, DT, base), 'tired', 'out of time');
  g = fresh();
  g.time = maxDuration(grab, 0) - DT / 2;
  assert.equal(stepGrab(g, grab, DT, { ...base, perk: 0.5 }), '', 'the perk gives more time');
  g = fresh();
  g.time = 2;
  assert.equal(stepGrab(g, grab, DT, { ...base, rand: 0 }), 'fail', 'an unlucky roll fails');
  // re-arming: a new grab needs the button to be let go first
  g = createGrab();
  assert.ok(mayStart(g, true));
  startGrab(g, false);
  stepGrab(g, grab, DT, { ...base, hold: false });
  assert.ok(!mayStart(g, true), 'still holding after the grab: no regrab');
  assert.ok(!mayStart(g, false) && mayStart(g, true), 'let go, then press: armed again');
}

// ---- the hold intent and the score
{
  const bind = bindingFor(input, 0, 1);
  const slot = createSlot();
  const intent = createIntent();
  const frame = codes => mapIntent(intent, slot, bind, { down: new Set(codes), pad: null, touch: NO_TOUCH, mouseDown: false }, 0.2);
  frame(['KeyF']);
  assert.ok(intent.interact && intent.hold, 'F presses interact and holds');
  frame(['KeyF']);
  assert.ok(!intent.interact && intent.hold, 'held F stays a level');
  frame([]);
  assert.ok(!intent.hold);
  const pad = { buttons: [], leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 } };
  pad.buttons[PAD.Y] = { pressed: true };
  mapIntent(intent, slot, bind, { down: new Set(), pad, touch: NO_TOUCH, mouseDown: false }, 0.2);
  assert.ok(intent.hold, 'pad Y holds');
}
assert.ok(trickPoints(tricks, 'grab', { seconds: 6, bonus: tricks.grab.jumpBonus }) > trickPoints(tricks, 'grab', { seconds: 6 }) && trickPoints(tricks, 'grab', { seconds: 6 }) > trickPoints(tricks, 'grab', { seconds: 1 }), 'a bus ride scores by length, the ollie off adds a bonus');
assert.equal(tricks.tricks.grab.name, 'trick.grab');

console.log(`check-skates ok: skates ${sk.maxSpeed}/${sk.accel}/${sk.turnRate}, bus ${route.speed} px/s, fail normal ${normal.fail.toFixed(2)} cobble ${rough.fail.toFixed(2)} Jonas ${pro.fail.toFixed(2)}`);
