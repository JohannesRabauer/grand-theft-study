// Input bindings -> intent mapping without Phaser (AD-10, AD-18): data/input.json is well formed, WASD / arrows /
// Ctrl / Enter / pads each move only their own player, edge intents fire for exactly one frame, global
// intents (map, weather, pause) come from P1 only, and gamepads bind to the next free player.
// Run: node scripts/check-input.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIONS, NO_TOUCH, PAD, bindingFor, clearIntent, createIntent, createSlot, mapIntent, padFor } from '../ui/inputBindings.js';

const cfg = JSON.parse(readFileSync(new URL('../data/input.json', import.meta.url), 'utf8'));
const DZ = cfg.deadzone;

// ---- data
assert.equal(cfg.players.length, cfg.maxPlayers, 'one binding per possible player');
for (const [i, p] of cfg.players.entries()) {
  for (const a of ACTIONS) assert.ok(Array.isArray(p.keys[a]), `P${i + 1} binds ${a}`);
  assert.equal(p.global, i === 0, 'only P1 is global');
  assert.equal(p.touch, i === 0, 'touch drives P1 only');
}
const owner = new Map();
for (const [i, p] of cfg.players.entries()) {
  for (const a of ACTIONS) for (const code of p.keys[a]) {
    assert.ok(!owner.has(code), `${code} is bound twice (${owner.get(code)} and P${i + 1} ${a})`);
    owner.set(code, `P${i + 1} ${a}`);
  }
}
for (const a of cfg.soloShare) assert.ok(ACTIONS.includes(a), `soloShare ${a} is an action`);

// ---- rig
function rig(count) {
  const players = Array.from({ length: count }, (_, i) => ({ intent: createIntent(), slot: createSlot(), bind: bindingFor(cfg, i, count) }));
  const down = new Set();
  const pads = [];
  const frame = () => players.forEach((p, i) => {
    const k = padFor(i, count);
    mapIntent(p.intent, p.slot, p.bind, { down, pad: k >= 0 ? pads[k] ?? null : null, touch: NO_TOUCH, mouseDown: false }, DZ);
  });
  return { players, down, pads, frame };
}
const pad = (over = {}) => ({ leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), ...over });
const moving = i => Math.hypot(i.move.x, i.move.y) > 0;

// ---- two players: keyboards
{
  const r = rig(2);
  const [a, b] = r.players.map(p => p.intent);
  r.down.add('KeyD');
  r.frame();
  assert.equal(a.move.x, 1); assert.ok(!moving(b), 'WASD moves P1 only');
  r.down.clear(); r.down.add('ArrowLeft'); r.down.add('ArrowUp');
  r.frame();
  assert.ok(!moving(a), 'arrow keys do not move P1 with two players');
  assert.ok(Math.abs(b.move.x + Math.SQRT1_2) < 1e-9 && Math.abs(b.move.y + Math.SQRT1_2) < 1e-9, 'arrows move P2, diagonals are normalised');
  r.down.clear(); r.down.add('ControlRight'); r.down.add('ShiftRight'); r.down.add('Numpad0');
  r.frame();
  assert.ok(b.jump && b.sprint && b.toolUse && !a.jump && !a.sprint && !a.toolUse, 'Right Ctrl / Right Shift / Numpad0 are P2 jump / sprint / use');
  r.down.clear(); r.down.add('Space'); r.down.add('ShiftLeft');
  r.frame();
  assert.ok(a.jump && a.sprint && !b.jump && !b.sprint, 'Space / Left Shift are P1');
  r.down.clear(); r.down.add('KeyF'); r.down.add('Enter');
  r.frame();
  assert.ok(a.interact && b.interact, 'F and Enter interact for their own player');
  r.frame();
  assert.ok(!a.interact && !b.interact, 'interact is an edge: one frame only');
  r.down.clear(); r.down.add('KeyE'); r.down.add('Comma'); r.down.add('KeyQ');
  r.frame();
  assert.ok(a.toolNext && a.toolPrev && b.toolPrev && !b.toolNext, 'E / Q are P1 tools, comma is P2 previous');
  r.down.clear(); r.down.add('Period');
  r.frame();
  assert.ok(b.toolNext && !a.toolNext);
  // global intents: P1 only
  r.down.clear(); r.down.add('Escape'); r.down.add('KeyM'); r.down.add('KeyT');
  r.frame();
  assert.ok(a.pause && a.map && a.weather && !b.pause && !b.map && !b.weather);
  r.pads[0] = pad(); r.pads[1] = pad();
  r.down.clear(); r.frame();
  r.pads[0].buttons[PAD.START].pressed = true; // pad 0 drives P2: its Start must not pause
  r.frame();
  assert.ok(!a.pause && !b.pause, 'Start on P2\'s pad is not a global intent');
  r.pads[0].buttons[PAD.START].pressed = false;
  r.pads[1].buttons[PAD.START].pressed = true; // pad 1 drives P1
  r.frame();
  assert.ok(a.pause && !b.pause, 'Start on P1\'s pad pauses');
}

// ---- one player keeps the old controls: WASD and arrows, either Shift
{
  const r = rig(1);
  const a = r.players[0].intent;
  for (const [code, x, y] of [['KeyW', 0, -1], ['ArrowUp', 0, -1], ['KeyA', -1, 0], ['ArrowLeft', -1, 0], ['KeyS', 0, 1], ['ArrowDown', 0, 1], ['KeyD', 1, 0], ['ArrowRight', 1, 0]]) {
    r.down.clear(); r.down.add(code);
    r.frame();
    assert.deepEqual([a.move.x, a.move.y], [x, y], `${code} steers the only player`);
  }
  for (const code of ['ShiftLeft', 'ShiftRight']) { r.down.clear(); r.down.add(code); r.frame(); assert.ok(a.sprint, `${code} sprints`); }
  r.down.clear(); r.down.add('ControlRight'); r.down.add('Enter');
  r.frame();
  assert.ok(!a.jump && !a.interact, 'only movement and sprint are shared, not the P2 action keys');
  assert.ok(r.players[0].bind.keys.left.includes('KeyA') && r.players[0].bind.keys.left.includes('ArrowLeft'));
  // opposite keys cancel; edge intents survive the merge
  r.down.clear(); r.down.add('KeyA'); r.down.add('ArrowRight');
  r.frame();
  assert.equal(a.move.x, 0);
}

// ---- gamepads bind to the next free player
assert.deepEqual([padFor(0, 1), padFor(1, 1)], [0, -1], 'one player: the first pad is P1');
assert.deepEqual([padFor(0, 2), padFor(1, 2)], [1, 0], 'two players: the first pad is P2, the second P1');
{
  const r = rig(2);
  const [a, b] = r.players.map(p => p.intent);
  r.pads[0] = pad({ leftStick: { x: 1, y: 0 } });
  r.frame();
  assert.ok(b.move.x > 0.9 && !moving(a), 'with two players the first pad moves P2 only');
  r.pads[1] = pad({ leftStick: { x: 0, y: -1 }, rightStick: { x: 0.9, y: 0 } });
  r.pads[1].buttons[PAD.A].pressed = true;
  r.frame();
  assert.ok(a.move.y < -0.9 && a.jump && !b.jump, 'the second pad moves P1 only');
  assert.ok(r.players[1].slot.stickX === 0 && r.players[0].slot.stickX > 0.5, 'right stick aim lands in the owner\'s slot');
  const solo = rig(1);
  solo.pads[0] = pad({ leftStick: { x: -1, y: 0 } });
  solo.frame();
  assert.ok(solo.players[0].intent.move.x < -0.9, 'one player: the first pad is P1');
  // deadzone
  solo.pads[0] = pad({ leftStick: { x: 0.1, y: 0.1 } });
  solo.frame();
  assert.ok(!moving(solo.players[0].intent), 'stick inside the deadzone does nothing');
}

// ---- clear: a button held through a pause does not fire on resume
{
  const r = rig(1);
  const p = r.players[0];
  r.down.add('KeyF');
  r.frame();
  assert.ok(p.intent.interact);
  clearIntent(p.intent, p.slot);
  r.frame();
  assert.ok(!p.intent.interact, 'held F stays quiet after a clear');
  r.down.clear(); r.frame();
  r.down.add('KeyF'); r.frame();
  assert.ok(p.intent.interact, 'released and pressed again fires');
}
console.log('check-input: ok');
