// Pure mapping from device state to one player's intent snapshot (AD-10, AD-18). No Phaser: ui/input.js reads
// the devices and hands this module plain data, scripts/check-input.mjs drives it with fake devices.
//
// Level intents (held): move, aim, sprint, jump, manual, toolUse, defend (karate: hold to block, press while walking to dodge), hold (the interact button's level: hang on to a bus). `jump` is the ollie on a skateboard (the bell on a bike),
// `manual` holds the skateboard manual balance (vehicles/skateLogic.js).
// Edge intents (true for exactly one frame per press): interact, toolNext, toolPrev, kiai (karate shout), map, weather, pause.
// Of those, map / weather / pause are global: only a player bound with `global: true` (P1) can raise them.
// `answer` (0 = none, 1-4) is the number key pressed this frame, for minigame answer choices.
export const EDGES = ['interact', 'toolNext', 'toolPrev', 'kiai', 'map', 'weather', 'phone', 'pause'];
// Standard gamepad mapping: A, B, X, Y, LB, RB, LT, RT, Back, Start, stick clicks, d-pad.
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LSTICK: 10, RSTICK: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const ANSWER_KEYS = ['answer1', 'answer2', 'answer3', 'answer4'];
export const ACTIONS = ['left', 'right', 'up', 'down', 'sprint', 'jump', 'manual', 'interact', 'toolPrev', 'toolNext', 'toolUse', 'defend', 'kiai', 'map', 'weather', 'phone', 'pause', ...ANSWER_KEYS];

export function createTouchState() {
  return {
    move: { x: 0, y: 0 },
    aimDir: { x: 0, y: 0 },
    aiming: false,
    btn: { jump: false, manual: false, toolUse: false, defend: false, kiai: false, sprint: false, interact: false, toolNext: false, pause: false, map: false, phone: false }
  };
}

export const NO_TOUCH = createTouchState(); // players without touch controls read this (always idle)

export function createIntent() {
  return {
    move: { x: 0, y: 0 },
    aim: null,
    sprint: false,
    jump: false,
    manual: false,
    hold: false,
    interact: false,
    toolUse: false,
    defend: false,
    kiai: false,
    toolNext: false,
    toolPrev: false,
    map: false,
    weather: false,
    phone: false,
    pause: false,
    answer: 0
  };
}

// Per player bookkeeping between frames: previous edge levels and the right stick (for aiming).
export function createSlot() {
  const prev = {};
  for (const e of EDGES) prev[e] = false;
  for (const a of ANSWER_KEYS) prev[a] = false;
  return { prev, stickX: 0, stickY: 0 };
}

// Key codes (KeyboardEvent.code) per action for player `index` when `count` players are active. With a single
// player, the `soloShare` actions of the other players' bindings are merged in, so WASD and the arrow keys
// (and either Shift) all steer the one player.
export function bindingFor(cfg, index, count) {
  const own = cfg.players[index];
  const keys = {};
  for (const a of ACTIONS) keys[a] = [...(own.keys[a] ?? [])];
  if (count === 1 && index === 0) {
    for (const other of cfg.players.slice(1)) for (const a of cfg.soloShare) keys[a].push(...(other.keys[a] ?? []));
  }
  return { keys, global: !!own.global, touch: !!own.touch, aim: own.aim };
}

// Which gamepad (index into the connected pads) drives player `index`: the first pad goes to P2 when two or
// more players are active, otherwise to P1; the second pad then goes to P1. -1 = no pad for that player.
export function padFor(index, count) {
  if (count < 2) return index === 0 ? 0 : -1;
  if (index === 0) return 1;
  if (index === 1) return 0;
  return index;
}

// The player a pad index drives (inverse of padFor), -1 when it drives nobody.
export function padOwner(padIndex, count) {
  for (let i = 0; i < count; i++) if (padFor(i, count) === padIndex) return i;
  return -1;
}

function anyDown(down, codes) {
  for (let i = 0; i < codes.length; i++) if (down.has(codes[i])) return true;
  return false;
}

// Radial deadzone with rescale; axis 0 returns x, axis 1 returns y.
export function deadzone(x, y, dz, axis) {
  const m = Math.hypot(x, y);
  if (m <= dz) return 0;
  const s = (Math.min(m, 1) - dz) / (1 - dz) / m;
  return (axis === 0 ? x : y) * s;
}

function edge(intent, slot, name, level) {
  intent[name] = level && !slot.prev[name];
  slot.prev[name] = level;
}

// src: { down: Set of held key codes, pad: gamepad or null, touch: touch state, mouseDown: bool }.
// Writes everything except `aim` (which needs the camera) into `intent`; the right stick lands in slot.stickX/Y.
export function mapIntent(intent, slot, bind, src, dz) {
  const { down, pad, touch } = src;
  const keys = bind.keys;
  const btn = touch.btn;
  const k = a => anyDown(down, keys[a]);
  const pb = b => pad?.buttons[b]?.pressed === true;

  let x = (k('right') ? 1 : 0) - (k('left') ? 1 : 0);
  let y = (k('down') ? 1 : 0) - (k('up') ? 1 : 0);
  x += touch.move.x;
  y += touch.move.y;
  slot.stickX = slot.stickY = 0;
  if (pad) {
    x += (pb(PAD.RIGHT) ? 1 : 0) - (pb(PAD.LEFT) ? 1 : 0) + deadzone(pad.leftStick.x, pad.leftStick.y, dz, 0);
    y += (pb(PAD.DOWN) ? 1 : 0) - (pb(PAD.UP) ? 1 : 0) + deadzone(pad.leftStick.x, pad.leftStick.y, dz, 1);
    slot.stickX = deadzone(pad.rightStick.x, pad.rightStick.y, dz, 0);
    slot.stickY = deadzone(pad.rightStick.x, pad.rightStick.y, dz, 1);
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  intent.move.x = x;
  intent.move.y = y;

  intent.sprint = k('sprint') || btn.sprint || pb(PAD.B);
  intent.jump = k('jump') || btn.jump || pb(PAD.A);
  intent.manual = k('manual') || btn.manual || pb(PAD.LT);
  intent.toolUse = src.mouseDown || k('toolUse') || btn.toolUse || pb(PAD.RT);
  intent.defend = k('defend') || btn.defend || pb(PAD.X);

  intent.hold = k('interact') || btn.interact || pb(PAD.Y);
  edge(intent, slot, 'interact', intent.hold);
  edge(intent, slot, 'toolNext', k('toolNext') || btn.toolNext || pb(PAD.RB));
  edge(intent, slot, 'toolPrev', k('toolPrev') || pb(PAD.LB));
  edge(intent, slot, 'kiai', k('kiai') || btn.kiai || pb(PAD.RSTICK));
  const g = bind.global;
  edge(intent, slot, 'map', g && (k('map') || btn.map || pb(PAD.BACK)));
  edge(intent, slot, 'weather', g && k('weather'));
  edge(intent, slot, 'phone', g && (k('phone') || btn.phone || pb(PAD.LSTICK))); // the pad opens the phone with a click of the left stick (story 14.2)
  edge(intent, slot, 'pause', g && (k('pause') || btn.pause || pb(PAD.START)));
  intent.answer = 0;
  for (let i = 0; i < ANSWER_KEYS.length; i++) {
    const a = ANSWER_KEYS[i];
    const level = k(a);
    if (level && !slot.prev[a] && !intent.answer) intent.answer = i + 1;
    slot.prev[a] = level;
  }
}

// Idle snapshot. A button held through a pause must not fire on resume, so the edge levels stay "pressed".
export function clearIntent(intent, slot) {
  intent.move.x = 0;
  intent.move.y = 0;
  intent.aim = null;
  intent.sprint = intent.jump = intent.manual = intent.toolUse = intent.defend = intent.hold = false;
  intent.answer = 0;
  for (const e of EDGES) {
    intent[e] = false;
    slot.prev[e] = true;
  }
  for (const a of ANSWER_KEYS) slot.prev[a] = true;
}
