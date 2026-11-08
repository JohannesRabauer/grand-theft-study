// Gamepad support and input prompts (story 14.2): every action a kid needs in a school run can be done from a pad (move, sprint, jump, interact,
// tool, defend, kiai, map, phone, pause), edge actions fire once per press, the pad drives only its own player, and the prompts name the control of the
// device in use (F on a keyboard, Y on a pad, a hand on touch), in German and English.
// Run: node scripts/check-gamepad.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_TOUCH, PAD, bindingFor, createIntent, createSlot, mapIntent, padFor } from '../ui/inputBindings.js';
import { HINT_ACTIONS, controlLabel, controlParams } from '../ui/controlLabels.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/input.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const mkpad = (pressed = [], stick = { x: 0, y: 0 }) => ({ leftStick: stick, rightStick: { x: 0, y: 0 }, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) });
const solo = { intent: createIntent(), slot: createSlot(), bind: bindingFor(cfg, 0, 1) };
const frame = pad => { mapIntent(solo.intent, solo.slot, solo.bind, { down: new Set(), pad, touch: NO_TOUCH, mouseDown: false }, cfg.deadzone); return solo.intent; };

// ---- everything a school run needs works from the pad alone
assert.ok(frame(mkpad([], { x: 1, y: 0 })).move.x > 0.9, 'the left stick walks');
assert.ok(frame(mkpad([PAD.DOWN])).move.y === 1, 'the d-pad walks');
assert.ok(frame(mkpad([PAD.B])).sprint, 'B sprints');
assert.ok(frame(mkpad([PAD.A])).jump, 'A jumps and confirms');
assert.ok(frame(mkpad([PAD.X])).defend, 'X blocks');
assert.ok(frame(mkpad([PAD.LT])).manual, 'LT is the manual');
assert.ok(frame(mkpad([PAD.RT])).toolUse, 'RT uses the tool');
for (const [name, button] of [['interact', PAD.Y], ['toolNext', PAD.RB], ['toolPrev', PAD.LB], ['kiai', PAD.RSTICK], ['map', PAD.BACK], ['phone', PAD.LSTICK], ['pause', PAD.START]]) {
  frame(mkpad());
  assert.ok(frame(mkpad([button]))[name], `${name} fires on its button`);
  assert.ok(!frame(mkpad([button]))[name], `${name} fires once per press, not while held`);
  frame(mkpad());
  assert.ok(frame(mkpad([button]))[name], `${name} fires again after a release`);
}
assert.ok(!frame(null).interact && frame(null).move.x === 0, 'no pad, no input');

// ---- two players: the first pad is player 2's, the second player 1's
assert.equal(padFor(0, 2), 1);
assert.equal(padFor(1, 2), 0);
assert.equal(padFor(0, 1), 0, 'alone, the first pad is yours');

// ---- prompts follow the device
const t = (k) => i18n.en[k] ?? k;
assert.equal(controlLabel(cfg, 0, 'keyboard', 'interact', t), 'F');
assert.equal(controlLabel(cfg, 0, 'gamepad', 'interact', t), 'Y');
assert.notEqual(controlLabel(cfg, 0, 'touch', 'interact', t), 'F');
assert.equal(controlLabel(cfg, 0, 'gamepad', 'jump', t), 'A');
assert.equal(controlLabel(cfg, 0, 'gamepad', 'phone', t), 'LS');
assert.equal(controlLabel(cfg, 0, 'keyboard', 'phone', t), 'P');
assert.equal(controlLabel(cfg, 0, 'gamepad', 'map', t), 'Back');
assert.ok(HINT_ACTIONS.includes('phone'));
for (const device of ['keyboard', 'gamepad', 'touch']) for (const a of HINT_ACTIONS) assert.ok(controlLabel(cfg, 0, device, a, t) !== undefined, `${device} ${a}`);
const p = controlParams(cfg, [0], 'gamepad', t);
assert.equal(p.interact, 'Y');
assert.equal(controlParams(cfg, [0], 'keyboard', t).interact, 'F');
assert.equal(controlParams(cfg, [0, 1], 'keyboard', t).interact, 'F / Enter', 'two players: both controls in one sentence');
for (const l of ['de', 'en']) {
  assert.ok(i18n[l]['world.interact.gamepad'].includes('Y') && i18n[l]['world.interact.keyboard'].includes('F') && i18n[l]['world.interact.touch'], `${l}: interact prompts per device`);
  assert.ok(i18n[l]['world.interact.keyboard'] !== i18n[l]['world.interact.gamepad'], `${l}: they differ`);
}
console.log('gamepad ok: every school-run action from the pad, edges once per press, prompts per device');
