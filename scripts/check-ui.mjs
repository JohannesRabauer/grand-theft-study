// Checks the UI plumbing without Phaser (AD-27): ScreenStack (top-only input, stack-counted world freeze,
// nested restore, teardown order) and the data-driven HUD module list (data/hud.json, ui/hud/hudList.js).
// Run: node scripts/check-ui.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ScreenStack } from '../ui/ScreenStack.js';
import { resolveHud } from '../ui/hud/hudList.js';
import { HUD_REGISTRY } from '../ui/hud/index.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const defs = read('screens.json');
const hud = read('hud.json');

const log = [];
const mk = (id) => ({
  id, received: 0, created: 0, destroyed: 0,
  create() { this.created++; log.push(`+${id}`); },
  destroy() { this.destroyed++; log.push(`-${id}`); },
  handleIntent() { this.received++; }
});
const freezeCalls = [];
const stack = new ScreenStack(defs, (on) => freezeCalls.push(on));

// data: the real screens declare their freeze flag
assert.equal(defs.pause.freezesWorld, true, 'pause freezes the world');
assert.equal(defs.testHint.freezesWorld, false);

// empty stack
assert.equal(stack.top(), null);
assert.equal(stack.route({}), false, 'no screen, nothing consumed');
assert.equal(stack.pop(), null);
assert.throws(() => stack.push(mk('nope')), /not declared/);

// nested freezing screens: frozen from the first push to the last pop, reported once each way
const a = stack.push(mk('test'));
assert.equal(a.freezesWorld, true, 'flag comes from data');
assert.deepEqual(freezeCalls, [true]);
const hint = stack.push(mk('testHint'));
assert.equal(hint.freezesWorld, false);
const b = stack.push(mk('pause'));
assert.equal(stack.size, 3);
assert.equal(stack.top(), b);
assert.equal(stack.frozen, true);
assert.deepEqual(freezeCalls, [true], 'nesting does not re-announce the freeze');

// only the top screen gets intents
assert.equal(stack.route({ pause: true }), true);
assert.deepEqual([a.received, hint.received, b.received], [0, 0, 1]);

// popping restores the freeze only when the last freezing screen is gone
assert.equal(stack.pop(), b);
assert.equal(stack.frozen, true, 'one freezing screen is still open');
assert.deepEqual(freezeCalls, [true]);
stack.route({});
assert.deepEqual([a.received, hint.received, b.received], [0, 1, 1], 'the non-freezing screen below is now the top');
assert.equal(stack.pop(), hint);
assert.equal(stack.frozen, true);
assert.equal(stack.pop(), a);
assert.equal(stack.frozen, false);
assert.deepEqual(freezeCalls, [true, false]);
assert.equal(stack.freezes, 0);
assert.deepEqual(log, ['+test', '+testHint', '+pause', '-pause', '-testHint', '-test'], 'create on push, destroy on pop, last in first out');

// a non-freezing screen alone never freezes
freezeCalls.length = 0;
stack.push(mk('testHint'));
stack.pop();
assert.deepEqual(freezeCalls, [], 'non-freezing screens leave the world running');

// clear pops everything and restores the freeze once
stack.push(mk('test'));
stack.push(mk('test'));
stack.clear();
assert.equal(stack.size, 0);
assert.deepEqual(freezeCalls, [true, false]);

// retext reaches screens that implement it
let retexts = 0;
const r = mk('testHint');
r.retext = () => { retexts++; };
stack.push(r);
stack.push(mk('testHint'));
stack.retext();
assert.equal(retexts, 1);
stack.clear();

// HUD module list: every id is registered, scopes expand, debug entries are optional
const ids = (list) => list.map(m => m.id);
const play = resolveHud(hud, 'play', HUD_REGISTRY, { players: 1, debug: false });
assert.ok(play.length > 8, 'the play mode has the existing HUD');
for (const m of play) assert.equal(typeof m.Cls, 'function');
assert.ok(!ids(play).includes('debug'), 'debug module only with ?debug');
assert.ok(ids(resolveHud(hud, 'play', HUD_REGISTRY, { debug: true })).includes('debug'));
for (const id of ['fps', 'status', 'anger', 'money', 'clock', 'tool', 'caught', 'objective', 'touch', 'rotateHint', 'restartNote']) {
  assert.ok(ids(play).includes(id), `${id} is in the play HUD`);
}
assert.deepEqual(play.find(m => m.id === 'status').opts, { playerIndex: 0 });
assert.deepEqual(play.find(m => m.id === 'money').opts, { shared: true });
const two = resolveHud(hud, 'play', HUD_REGISTRY, { players: 2 });
assert.deepEqual(ids(two).filter(i => i.startsWith('status')), ['status.0', 'status.1'], 'player modules repeat per player');
assert.equal(ids(two).filter(i => i === 'money').length, 1, 'shared modules exist once');
assert.throws(() => resolveHud(hud, 'nope', HUD_REGISTRY), /unknown mode/);
assert.throws(() => resolveHud({ modes: { x: [{ id: 'ghost', scope: 'shared' }] } }, 'x', HUD_REGISTRY), /not registered/);
assert.throws(() => resolveHud({ modes: { x: [{ id: 'fps', scope: 'both' }] } }, 'x', HUD_REGISTRY), /scope/);
for (const id of Object.keys(HUD_REGISTRY)) {
  assert.ok(hud.modes.play.some(e => e.id === id), `registered module ${id} is used by a mode`);
}

console.log('check-ui: all assertions passed');
