// Co-op core (AD-18) without Phaser: camera rig maths (centre, fit zoom, effective zoom), the tether (rubber band,
// trailing bonus, pinned partner, pull), the rig with fake players, start players from the state, the coop.set
// action, HUD slice layout and edge indicators, data sanity. Run: node scripts/check-coop.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { weightedCenter, fitZoom, effectiveZoom } from '../camera/rigMath.js';
import { Tether, boxDistance, penalty } from '../camera/tetherMath.js';
import { CameraRig } from '../camera/CameraRig.js';
import { startPlayers } from '../entities/players.js';
import { GameState } from '../state/GameState.js';
import { sliceOf, edgeSpot } from '../ui/hud/layout.js';

const load = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const cam = load('data/camera.json');
const characters = load('data/characters.json');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const view = { w: 480, h: 270 };

// ---- data
assert.ok(cam.tether.soft > 0 && cam.tether.soft < 1 && cam.tether.minLead >= 0 && cam.tether.frozenFloor > 0 && cam.tether.frozenFloor < 1);
assert.equal(cam.coop.spawnOffsets.length, 2);
assert.equal(cam.coop.ringColors.length, 2);
// the tether limit stays inside the view at the smallest zoom, with room for overshoot (pull range)
const aspect = view.w / view.h;
const limitX = (view.w / 2 - cam.coop.fitMargin.x) / cam.min * 2;
const limitY = (view.h / 2 - cam.coop.fitMargin.y) / cam.min * 2 * aspect;
assert.ok(cam.tether.maxDistance < Math.min(limitX, limitY), `maxDistance ${cam.tether.maxDistance} is inside the view limit ${Math.min(limitX, limitY).toFixed(0)}`);
assert.ok(fitZoom([{ x: 0, y: 0 }, { x: cam.tether.maxDistance, y: 0 }], cam.tether.maxDistance / 2, 0, view, cam.coop.fitMargin, 0, 9) >= cam.min, 'at the limit the fit zoom is still within the zoom range');

// ---- centre
const c = { x: 0, y: 0 };
weightedCenter(c, [{ x: 10, y: 20 }]);
assert.deepEqual(c, { x: 10, y: 20 }, 'one player: exactly that player');
weightedCenter(c, [{ x: 0, y: 0 }, { x: 100, y: 40 }]);
assert.deepEqual(c, { x: 50, y: 20 }, 'two players: midpoint');
weightedCenter(c, [{ x: 0, y: 0 }, { x: 100, y: 0, pinned: true }], 0.5);
near(c.x, 100 * 0.5 / 1.5);

// ---- fit zoom
const margin = cam.coop.fitMargin;
assert.equal(fitZoom([{ x: 5, y: 5 }], 5, 5, view, margin, cam.min, cam.max), cam.max, 'one player: no constraint');
assert.equal(fitZoom([{ x: 0, y: 0 }, { x: 100, y: 0 }], 50, 0, view, margin, cam.min, cam.max), cam.max, 'close together: base zoom');
const far = fitZoom([{ x: 0, y: 0 }, { x: 400, y: 0 }], 200, 0, view, margin, cam.min, cam.max);
near(far, (240 - margin.x) / 200);
assert.ok(far < cam.max && far > cam.min);
assert.equal(fitZoom([{ x: 0, y: 0 }, { x: 5000, y: 0 }], 2500, 0, view, margin, cam.min, cam.max), cam.min, 'clamped to the minimum');
const vert = fitZoom([{ x: 0, y: 0 }, { x: 0, y: 260 }], 0, 130, view, margin, cam.min, cam.max);
near(vert, (135 - margin.y) / 130);
// every player really is inside the view (minus margin) at the fit zoom
for (const sep of [200, 300, 400, 480]) {
  const list = [{ x: 0, y: 0 }, { x: sep, y: sep * 0.3 }];
  const z = fitZoom(list, sep / 2, sep * 0.15, view, margin, cam.min, cam.max);
  for (const p of list) {
    assert.ok(Math.abs(p.x - sep / 2) * z <= view.w / 2 - margin.x + 1e-9 && Math.abs(p.y - sep * 0.15) * z <= view.h / 2 - margin.y + 1e-9, `inside view at separation ${sep}`);
  }
}
assert.equal(effectiveZoom(0.8, 1), 0.8, 'speed zoom wins when it is smaller');
assert.equal(effectiveZoom(1, 0.7), 0.7, 'fit zoom wins when it is smaller');

// ---- tether
assert.equal(boxDistance(100, 0, aspect), 100);
near(boxDistance(0, 100, aspect), 100 * aspect);
near(penalty(0.4, 0.5), 0);
near(penalty(0.5, 0.5), 0);
near(penalty(1, 0.5), 1);
near(penalty(1.5, 0.5), 1);
let prev = 0;
for (let r = 0.5; r <= 1; r += 0.01) { const p = penalty(r, 0.5); assert.ok(p >= prev - 1e-12, 'penalty is monotonic'); prev = p; }
const T = cam.tether;
const settle = (th, a, b, ma, mb, seconds = 3) => { for (let t = 0; t < seconds * 60; t++) th.update(1 / 60, a, b, ma, mb); };
{
  // close together: nobody is slowed
  const th = new Tether(T, aspect);
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };
  settle(th, a, b, { x: -1, y: 0 }, { x: 1, y: 0 });
  assert.deepEqual(th.speed, [1, 1]);
  assert.ok(th.ratio < T.soft);
}
{
  // far apart: the leader (moving away) is slowed to minLead, the trailing player moving towards gets the bonus
  const th = new Tether(T, aspect);
  const a = { x: 0, y: 0 };
  const b = { x: T.maxDistance, y: 0 };
  settle(th, a, b, { x: -1, y: 0 }, { x: -1, y: 0 }); // a runs away from b, b follows a
  near(th.ratio, 1);
  near(th.speed[0], T.minLead, 1e-3);
  near(th.speed[1], 1 + T.trailBonus, 1e-3);
  // moving sideways costs nothing
  const th2 = new Tether(T, aspect);
  settle(th2, a, b, { x: 0, y: 1 }, { x: 0, y: 1 });
  near(th2.speed[0], 1, 1e-6);
  near(th2.speed[1], 1, 1e-6);
  // a standing player is never slowed
  const th3 = new Tether(T, aspect);
  settle(th3, a, b, { x: 0, y: 0 }, { x: 0, y: 0 });
  assert.deepEqual(th3.speed, [1, 1]);
}
{
  // box-norm corner: the other player is diagonal, the view's vertical limit dominates. Moving at right angles to the
  // Euclidean direction still stretches the box distance, so the leader must be slowed (it was not before the fix).
  const th = new Tether(T, aspect);
  const dy = T.maxDistance / aspect;
  const a = { x: 0, y: 0 };
  const b = { x: T.maxDistance * 0.6, y: dy * 0.95 }; // vertical box distance dominates
  const len = Math.hypot(b.x, b.y);
  const perp = { x: b.y / len, y: -b.x / len }; // perpendicular to the Euclidean direction, away in y
  assert.ok(perp.y < 0 && boxDistance(b.x - a.x, b.y - (a.y + perp.y), aspect) > boxDistance(b.x, b.y, aspect), 'this move really stretches the box distance');
  settle(th, a, { x: b.x, y: dy * 1.0 }, perp, { x: 0, y: 0 });
  assert.ok(th.speed[0] < 0.6, `the leader is slowed at the corner (${th.speed[0].toFixed(2)})`);
}
{
  // smooth: while one walks away the factor never jumps by more than a few percent per frame
  const th = new Tether(T, aspect);
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  let last = 1;
  let worst = 0;
  for (let step = 0; step < 600; step++) {
    b.x = Math.min(T.maxDistance, step * 1.2); // b walks away at 72 px/s
    th.update(1 / 60, a, b, { x: 0, y: 0 }, { x: 1, y: 0 });
    worst = Math.max(worst, Math.abs(th.speed[1] - last));
    last = th.speed[1];
  }
  assert.ok(worst < 0.02, `the leader's factor changes by at most ${worst.toFixed(4)} per frame`);
  assert.ok(last < 0.05, 'and is almost stopped at the limit');
}
{
  // a pinned partner never blocks: the free player keeps frozenFloor, no trailing bonus, and a gentle pull grows past the limit
  const th = new Tether(T, aspect);
  const a = { x: 0, y: 0 };
  const b = { x: T.maxDistance * 1.2, y: 0, pinned: true };
  settle(th, a, b, { x: -1, y: 0 }, { x: 0, y: 0 }); // b is the frozen one, a walks away from it
  near(th.speed[0], T.frozenFloor, 1e-3);
  assert.ok(th.speed[0] > 0, 'never fully blocked');
  assert.equal(th.speed[1], 1, 'the pinned player itself is untouched');
  near(th.pullX[1], 0);
  assert.ok(th.pullX[0] > 0 && th.pullX[0] <= T.pullMax, 'free player is pulled towards the pinned one');
  near(th.pullX[0], T.pullGain * 0.2);
  const th2 = new Tether(T, aspect);
  settle(th2, a, { x: 100, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 });
  near(th2.pullX[0], 0);
}
{
  // the pull is capped
  const th = new Tether(T, aspect);
  th.update(1, { x: 0, y: 0 }, { x: T.maxDistance * 3, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 });
  assert.equal(th.pullX[0], T.pullMax);
  assert.equal(th.pullX[1], -T.pullMax);
}

// ---- rig with fake players
const mkPlayer = (index, x, y, speed = 0) => ({ index, x, y, pinned: false, move: { velSpeed: speed, tetherMult: 1, nudgeX: 0, nudgeY: 0 } });
const ctx = { res: { w: 480, h: 270 }, players: [mkPlayer(0, 100, 100, 30)], input: { intents: [{ move: { x: 0, y: 0 } }, { move: { x: 0, y: 0 } }] } };
const rig = new CameraRig(ctx, cam);
assert.deepEqual(ctx.coop, { active: false, distance: 0, tetherRatio: 0 });
rig.update(1 / 60);
assert.deepEqual({ x: rig.focus.x, y: rig.focus.y, speed: rig.focus.speed, cap: rig.focus.zoomCap }, { x: 100, y: 100, speed: 30, cap: Infinity }, 'one player: focus is the player, no zoom cap');
assert.equal(ctx.coop.active, false);
assert.equal(ctx.players[0].move.tetherMult, 1);
ctx.players.push(mkPlayer(1, 220, 100, 80));
rig.update(1 / 60);
assert.equal(ctx.coop.active, true);
assert.deepEqual({ x: rig.focus.x, y: rig.focus.y, speed: rig.focus.speed, cap: rig.focus.zoomCap }, { x: 160, y: 100, speed: 80, cap: cam.max }, 'two players: midpoint, fastest speed, no cap while close');
near(ctx.coop.distance, 120);
near(ctx.coop.tetherRatio, 120 / T.maxDistance);
ctx.players[1].x = 100 + 440;
rig.update(1 / 60);
assert.ok(rig.focus.zoomCap < cam.max && rig.focus.zoomCap >= cam.min, 'zoomed out to fit');
near(ctx.coop.distance, 440);
ctx.input.intents[0].move.x = -1;
for (let i = 0; i < 200; i++) rig.update(1 / 60);
assert.ok(ctx.players[0].move.tetherMult < 0.5, 'player 1 runs away: slowed');

// ---- start players from the state
const players2 = [{ character: 'lena' }, { character: 'mehmet' }];
const shared = (coop) => ({ flags: coop ? { coop: true } : {} });
assert.deepEqual(startPlayers(shared(false), players2, 2).map(p => p.character), ['lena'], 'one player without the coop flag');
assert.deepEqual(startPlayers(shared(true), players2, 2).map(p => p.character), ['lena', 'mehmet']);
assert.equal(startPlayers(shared(true), [{ character: 'lena' }], 2).length, 1, 'never more than the state has');
assert.equal(startPlayers(shared(true), [{}, {}, {}], 2).length, 2, 'never more than maxPlayers');
const over = startPlayers(shared(false), players2, 2, [{ character: 'jonas', vehicle: 'foot' }, { character: 'lena' }]);
assert.deepEqual(over, [{ index: 0, character: 'jonas', vehicle: 'foot' }, { index: 1, character: 'lena', vehicle: null }], 'an explicit config wins');

// ---- coop.set action
const stateCfg = { ...load('data/state.json'), characters: Object.fromEntries(characters.characters.map(ch => [ch.id, ch.attributes])) };
const st = new GameState(new EventEmitter(), stateCfg);
assert.equal(st.players.length, 1);
st.dispatch('player.setCharacter', { player: 0, character: 'lena' });
assert.equal(st.dispatch('coop.set', { on: true }), true);
assert.equal(st.shared.flags.coop, true);
assert.equal(st.players.length, 2);
assert.notEqual(st.players[1].character, 'lena');
assert.ok(st.players[1].character, 'the second player is a different, real character');
assert.deepEqual(st.players[1].attributes, stateCfg.characters[st.players[1].character]);
st.dispatch('coop.set', { on: false });
assert.equal(st.shared.flags.coop, false);
assert.equal(st.players.length, 2, 'player 2 keeps its progress');
assert.equal(st.dispatch('coop.set', { on: 'yes' }), false);
st.dispatch('coop.set', { on: true });
assert.equal(st.players.length, 2, 'no third player');

// ---- HUD layout
assert.deepEqual(sliceOf(0, 1, 480), { right: false, x: 4, dy: 0 }, 'one player: the familiar layout');
assert.deepEqual(sliceOf(0, 2, 480), { right: false, x: 4, dy: 0 });
const s2 = sliceOf(1, 2, 480);
assert.equal(s2.right, true);
assert.equal(s2.x, 476);
assert.ok(s2.dy >= 36, 'player 2 sits below the shared anger meter');
const spot = { x: 0, y: 0, angle: 0 };
assert.equal(edgeSpot(0.2, -0.3, 0.7, 480, 270, 8, spot), null, 'near the centre: no indicator');
const e = edgeSpot(1.4, 0, 0.7, 480, 270, 8, spot);
assert.deepEqual({ x: e.x, y: e.y, angle: e.angle }, { x: 472, y: 135, angle: 0 }, 'off the right edge: indicator at the right border');
const e2 = edgeSpot(-0.9, 1.5, 0.7, 480, 270, 8, spot);
near(e2.y, 262);
assert.ok(e2.x > 0 && e2.x < 240);

console.log('check-coop: ok');
