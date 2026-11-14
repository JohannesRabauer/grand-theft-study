// Driving, solid hulls, car paint and the zoom stops (story 17.x): the Phaser-free maths of vehicles/trafficLogic.js and
// vehicles/routeLogic.js, the data of grab.json / routes.json / camera.json, and a small simulation of vehicles that follow each other.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approachSpeed, arcAhead, followSpeed, gapAhead, solidPush, stopSpeed, classifyHit } from '../vehicles/trafficLogic.js';
import { buildRoute, buildSpeedProfile, profileAt } from '../vehicles/routeLogic.js';
import { fitZoom } from '../camera/rigMath.js';

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const grab = read('data/grab.json');
const routes = read('data/routes.json').routes;
const traffic = read('data/traffic.json');
const camera = read('data/camera.json');
const y = grab.yield;

// ---- data
for (const k of ['look', 'reaction', 'band', 'stopGap', 'minGap', 'comfort', 'accel', 'brake', 'profileStep', 'spawnGap', 'shoveAfter', 'shoveSeconds', 'hideDistance', 'recoverAfter', 'retryEvery', 'recoveryProbes']) {
  assert.ok(y[k] > 0, `yield.${k} is set`);
}
assert.ok(y.brake > y.comfort && y.comfort > y.accel, 'braking is stronger than the comfortable stop, which is stronger than pulling away');
assert.ok(y.curve.floor > 0 && y.curve.lateral > 0 && y.curve.window > 0);
assert.ok(y.hideDistance >= Math.hypot(480, 270) + 40, 'vehicles appear beyond the half diagonal of the zoomed-out view');
assert.ok(y.recoverAfter >= 10, 'a queue waits a long time before anything is moved');
assert.ok(y.shoveAfter < y.recoverAfter && y.shoveSeconds > 0.2, 'a prop in the lane is shoved aside long before the recovery would move the vehicle');
for (const kind of ['car', 'van']) {
  const colors = grab.targets[kind].colors;
  assert.ok(colors.length >= 5 && new Set(colors).size === colors.length, `${kind}: several different paint colours`);
  assert.ok(colors.every(c => /^#[0-9a-f]{6}$/i.test(c)));
}
assert.ok(grab.targets.car.colors.length >= 8, 'cars come in at least eight colours');

// ---- the speed profile slows for bends and brakes in good time
const main = routes.find(r => r.id === 'main-road');
const route = buildRoute(main.points, 16);
const profile = buildSpeedProfile(route, y.profileStep, y.curve, y.comfort, main.speed);
let lo = Infinity, hi = 0;
for (const v of profile.limit) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
assert.equal(hi, main.speed, 'the straights allow the cruise speed');
assert.ok(lo >= y.curve.floor - 1e-3 && lo < main.speed * 0.5, `the U-turn is taken slowly (${lo.toFixed(0)} px/s)`);
const n = profile.limit.length;
for (let i = 0; i < n; i++) {
  const a = profile.limit[i], b = profile.limit[(i + 1) % n];
  assert.ok(a * a <= b * b + 2 * y.comfort * profile.step + 1e-2, 'a vehicle never has to brake harder than `comfort` for a bend');
}
assert.ok(Math.abs(profileAt(profile, route, 0) - profile.limit[0]) < 1e-3 && Math.abs(profileAt(profile, route, route.total) - profile.limit[0]) < 1e-3, 'the profile wraps');

// ---- stopping
assert.equal(stopSpeed(0, 100), 0);
assert.ok(Math.abs(stopSpeed(50, 100) - 100) < 1e-9, 'v2 = 2 a d');
assert.equal(approachSpeed(100, 0, 50, 200, 0.1), 80, 'braking is gradual');
assert.equal(approachSpeed(0, 100, 50, 200, 0.1), 5, 'pulling away is gradual');
assert.equal(approachSpeed(98, 100, 50, 200, 0.1), 100);
assert.equal(followSpeed(14, 80, 14, 150), 80, 'at the safe gap a follower matches its leader');
assert.ok(followSpeed(200, 80, 14, 150) > 80 && followSpeed(0, 0, 14, 150) === 0);
assert.equal(arcAhead(90, 10, 100), 20);
assert.equal(arcAhead(10, 90, 100), 80);

// ---- what is in the way
const look = y.look;
assert.ok(gapAhead(100, 100, 0, 34, 18, 160, 100, 5, y.band, look) < Infinity, 'a player in the lane ahead is in the way');
assert.equal(gapAhead(100, 100, 0, 34, 18, 160, 130, 5, y.band, look), Infinity, 'a player on the other lane is not');
assert.equal(gapAhead(100, 100, 0, 34, 18, 60, 100, 5, y.band, look), Infinity, 'nor one behind the nose');
assert.equal(gapAhead(100, 100, 0, 34, 18, 100 + 34 / 2 + 5 + 12, 100, 5, y.band, look), 12, 'the gap is nose to edge');
assert.equal(gapAhead(100, 100, Math.PI, 34, 18, 40, 100, 5, y.band, look) > 0, true, 'heading west: ahead is to the left');
assert.equal(gapAhead(100, 100, 0, 34, 18, 100 + look + 80, 100, 5, y.band, look), Infinity, 'too far to matter');

// ---- a queue: three vehicles on one lane, the first one is held up and later released; nobody touches anybody, nobody jumps
{
  const total = route.total;
  const dt = 1 / 60;
  const cars = [0, 1, 2].map(i => ({ s: 300 + i * 120, speed: main.speed, len: 34, cruise: main.speed, hold: i === 2 }));
  let minGap = Infinity, maxStep = 0, maxDecel = 0;
  for (let step = 0; step < 60 * 40; step++) {
    const blocked = step < 60 * 8; // the leader waits for 8 s (a pedestrian in the lane)
    cars.forEach((c, i) => {
      let want = Math.min(c.cruise, profileAt(profile, route, c.s + c.len / 2));
      const lead = cars[(i + 1) % cars.length];
      if (i < 2) want = Math.min(want, followSpeed(arcAhead(c.s, lead.s, total) - c.len, lead.speed, y.minGap, y.comfort));
      else if (blocked) want = 0;
      const next = approachSpeed(c.speed, want, y.accel, y.brake, dt);
      maxDecel = Math.max(maxDecel, (c.speed - next) / dt);
      c.speed = next;
    });
    const before = cars.map(c => c.s);
    cars.forEach(c => { c.s += c.speed * dt; });
    cars.forEach((c, i) => { maxStep = Math.max(maxStep, c.s - before[i]); });
    for (let i = 0; i < 2; i++) minGap = Math.min(minGap, arcAhead(cars[i].s, cars[i + 1].s, total) - 34);
  }
  assert.ok(minGap > 0, `a queue never touches (smallest gap ${minGap.toFixed(1)} px)`);
  assert.ok(maxStep <= main.speed * dt + 1e-9, 'no vehicle ever moves faster than cruise');
  assert.ok(maxDecel <= y.brake + 1e-6, 'braking stays within the limit');
}

// ---- the hull is solid
const out = { x: 0, y: 0 };
const car = grab.targets.car;
assert.ok(solidPush(100, 100, 0, car.length, car.width, null, 100, 100, 5, out), 'a player inside a car is pushed out');
assert.ok(Math.hypot(out.x, out.y) >= 5 && Math.hypot(out.x, out.y) <= car.width / 2 + 5 + 1e-9, 'out through the nearest face');
assert.ok(!solidPush(100, 100, 0, car.length, car.width, null, 100 + car.length / 2 + 6, 100, 5, out), 'beside the nose: free');
assert.ok(solidPush(100, 100, 0, car.length, car.width, null, 100 + car.length / 2 + 2, 100, 5, out) && out.x > 0 && Math.abs(out.y) < 1e-9, 'at the nose: pushed forward');
assert.ok(solidPush(100, 100, 0, car.length, car.width, null, 100, 100 + car.width / 2 + 2, 5, out) && out.y > 0 && Math.abs(out.x) < 1e-9, 'at the side: pushed sideways');
// rotated: heading north (-y)
assert.ok(solidPush(100, 100, -Math.PI / 2, car.length, car.width, null, 100, 100 - car.length / 2 - 2, 5, out) && out.y < 0 && Math.abs(out.x) < 1e-9, 'rotated hull pushes along its own axes');
const bus = grab.targets.bus;
assert.ok(!solidPush(100, 100, 0, bus.length, bus.width, bus.zone, 100 - bus.length / 2 - 3, 100, 5, out), 'the rear grab zone of a bus stays open');
assert.equal(classifyHit(100, 100, 0, bus.length, bus.width, bus.zone, traffic.kinds.bus, 100 - bus.length / 2 - 10, 100, 0), 'rear');
// a pushed player ends up outside: no overlap is left
for (let a = 0; a < 6.3; a += 0.3) {
  const px = 100 + Math.cos(a) * 12, py = 100 + Math.sin(a) * 6;
  if (solidPush(100, 100, 0.4, car.length, car.width, null, px, py, 5, out)) {
    assert.ok(!solidPush(100, 100, 0.4, car.length, car.width, null, px + out.x * 1.001, py + out.y * 1.001, 5 - 1e-3, out), 'after the push the player is clear');
  }
}

// ---- lanes
for (const def of routes) {
  const mates = routes.filter(r => (r.lane ?? r.id) === (def.lane ?? def.id));
  for (const m of mates) assert.deepEqual(m.points, mates[0].points, `${m.id} shares the points of its lane`);
}
assert.equal(routes.find(r => r.id === 'main-road-cars').lane, 'main-road', 'cars queue behind and ahead of the buses of the main road');

// ---- the zoom ladder
const ladder = camera.ladder;
assert.ok(ladder && ladder.steps.length >= 2, 'there are zoom stops');
assert.equal(ladder.steps[0], camera.max, 'the first stop is the resting zoom');
for (const step of ladder.steps) assert.ok(Number.isInteger(step * 2), `zoom stop ${step} maps the 2x textures 1:1 or as an exact 2x2 box (an integer at render scale 2)`);
assert.deepEqual([...ladder.steps].sort((a, b) => b - a), ladder.steps, 'the stops go from standing to fast');
assert.ok(ladder.outAbove > ladder.inBelow && ladder.inBelow > 70, 'hysteresis, and walking (70 px/s) never zooms out');
assert.ok(ladder.holdOut > 0 && ladder.holdIn > ladder.holdOut, 'out quickly, back slowly');
const view = { w: 480, h: 270 }, margin = { x: 48, y: 40 };
assert.ok(fitZoom([{ x: 0, y: 0 }, { x: 500, y: 0 }], 250, 0, view, margin, ladder.steps.at(-1), camera.max) < 1, 'two far apart players need the wider stop');
console.log('driving ok: bends, queue, solid hulls, paint colours, zoom stops');
