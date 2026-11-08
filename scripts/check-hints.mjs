// Contextual explanations (story 11.5): the hint data, the per-device control labels and the hint service
// (once per player, only after confirmation, quiet around screens and cooldowns). No Phaser; the screen itself is
// covered by the smoke scenario `hints`.
// Run: node scripts/check-hints.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Hints, flagKey, matches } from '../services/Hints.js';
import { controlLabel, controlParams, HINT_ACTIONS, keyName } from '../ui/controlLabels.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/hints.json');
const input = load('data/input.json');
const lang = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const screens = load('data/screens.json');
assert.equal(screens.hint?.freezesWorld, true, 'the hint screen freezes the world while it is read');

// ---- data: every hint has a title and body in both languages, placeholders are real controls, ids are unique
assert.equal(new Set(cfg.hints.map(h => h.id)).size, cfg.hints.length, 'hint ids are unique');
for (const h of cfg.hints) {
  assert.ok(h.event && ['event', 'all'].includes(h.who), `${h.id}: event and who`);
  for (const l of ['de', 'en']) {
    for (const part of ['title', 'body']) assert.ok(lang[l][`hint.${h.id}.${part}`], `${h.id}: ${l} ${part}`);
    for (const m of lang[l][`hint.${h.id}.body`].matchAll(/\{(\w+)\}/g)) assert.ok(HINT_ACTIONS.includes(m[1]), `${h.id}: ${l} uses unknown placeholder {${m[1]}}`);
    assert.ok(lang[l][`hint.${h.id}.body`].length < 330, `${h.id}: ${l} body fits the screen`);
  }
}
for (const l of ['de', 'en']) {
  for (const a of ['sprint', 'jump', 'interact', 'defend', 'kiai', 'manual', 'toolUse', 'toolNext', 'pause']) assert.ok(lang[l][`hint.ctl.touch.${a}`], `${l}: touch name for ${a}`);
  for (const k of ['pause.help', 'hint.tip', 'hint.for', 'hint.forAll', 'hint.continue', 'hint.revisit', 'hint.browse.heading', 'hint.browse.nav', 'hint.browse.counter', 'hint.ctl.arrows', 'hint.ctl.stick', 'hint.ctl.joystick']) assert.ok(lang[l][k], `${l}: ${k}`);
}

// ---- labels follow the real bindings of the player and the active device
const t = k => lang.en[k] ?? k;
assert.equal(keyName('KeyF'), 'F');
assert.equal(keyName('ArrowUp'), 'Up');
assert.equal(controlLabel(input, 0, 'keyboard', 'interact', t), 'F');
assert.equal(controlLabel(input, 0, 'keyboard', 'jump', t), 'Space');
assert.equal(controlLabel(input, 0, 'keyboard', 'move', t), 'W A S D');
assert.equal(controlLabel(input, 1, 'keyboard', 'move', t), 'arrow keys');
assert.equal(controlLabel(input, 1, 'keyboard', 'interact', t), 'Enter');
assert.equal(controlLabel(input, 1, 'keyboard', 'map', t), 'M', 'the second player falls back to the first player\'s global keys');
assert.equal(controlLabel(input, 0, 'gamepad', 'interact', t), 'Y');
assert.equal(controlLabel(input, 0, 'gamepad', 'jump', t), 'A');
assert.equal(controlLabel(input, 0, 'gamepad', 'move', t), 'left stick');
assert.equal(controlLabel(input, 0, 'touch', 'jump', t), 'the jump button');
assert.equal(controlLabel(input, 0, 'touch', 'move', t), 'the joystick');
const both = controlParams(input, [0, 1], 'keyboard', t);
assert.equal(both.interact, 'F / Enter', 'two readers see both players\' keys in one sentence');
assert.equal(both.map, 'M', 'identical labels are not repeated');
assert.deepEqual(Object.keys(both), HINT_ACTIONS);

// ---- matching
assert.ok(matches(undefined, {}));
assert.ok(matches({ id: 'bike' }, { id: 'bike', player: 0 }) && !matches({ id: 'bike' }, { id: 'skates' }));
assert.ok(matches({ id: ['scooter', 'rollerblades'] }, { id: 'scooter' }) && !matches({ id: ['scooter', 'rollerblades'] }, { id: 'bike' }));
assert.ok(matches({ $: true }, true) && !matches({ $: true }, false), 'chase:seen carries a bare boolean');

// ---- the service, with a fake context
function setup({ players = 1 } = {}) {
  const handlers = {};
  const flags = {};
  const opened = [];
  let clock = 1000;
  const ctx = {
    players: Array.from({ length: players }, (_, index) => ({ index })),
    events: { on: (e, f) => { (handlers[e] ??= []).push(f); }, off: (e, f) => { handlers[e] = handlers[e].filter(x => x !== f); } },
    state: { shared: { flags }, dispatch: (a, p) => { assert.equal(a, 'flags.set'); flags[p.key] = true; return true; } },
    screens: { size: 0 },
    minigames: { active: false }
  };
  globalThis.window = { SCHULWEG_GAME: { hintsOff: false } };
  const hints = new Hints(ctx, cfg, (def, audience, done) => opened.push({ def, audience, done }), () => clock);
  const emit = (e, p) => (handlers[e] ?? []).forEach(f => f(p));
  return { ctx, hints, opened, flags, emit, advance: s => { clock += s * 1000; } };
}

let s = setup();
s.emit('player:vehicle', { player: 0, id: 'foot' });
assert.equal(s.opened.length, 0, 'getting off a bike opens nothing');
s.emit('player:vehicle', { player: 0, id: 'bike' });
assert.equal(s.opened.length, 1, 'the first bike ride opens the bike hint');
assert.deepEqual([s.opened[0].def.id, s.opened[0].audience], ['bike', [0]]);
assert.equal(Object.keys(s.flags).length, 0, 'nothing is marked seen before the player confirmed');
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 1, 'a second hint cannot open on top of the one being read');
s.opened[0].done();
assert.ok(s.flags[flagKey('bike', 0)], 'confirming marks it seen for that player');
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 1, 'the cooldown keeps the next hint away right after one');
s.advance(cfg.cooldownSeconds + 1);
s.emit('player:vehicle', { player: 0, id: 'bike' });
assert.equal(s.opened.length, 1, 'a seen hint never comes back');
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 2, 'after the cooldown the next one opens');
s.hints.abandon();
assert.ok(!s.flags[flagKey('skateboard', 0)], 'a hint that was abandoned (shutdown) is not marked seen');
s.advance(1);
s.ctx.screens.size = 1;
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 2, 'no hint while another screen is open');
s.ctx.screens.size = 0;
s.ctx.minigames.active = true;
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 2, 'no hint during a lesson or minigame');
s.ctx.minigames.active = false;
globalThis.window.SCHULWEG_GAME.hintsOff = true;
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 2, 'the test switch silences hints');
globalThis.window.SCHULWEG_GAME.hintsOff = false;
s.emit('player:vehicle', { player: 0, id: 'skateboard' });
assert.equal(s.opened.length, 3, 'a hint blocked earlier comes back at its next trigger');

// the welcome hint waits for a quiet moment on the clock tick and is shown once
s = setup();
s.ctx.screens.size = 1;
s.emit('clock:tick', {});
assert.equal(s.opened.length, 0, 'not while the morning screens are open');
s.ctx.screens.size = 0;
s.emit('clock:tick', {});
assert.equal(s.opened[0].def.id, 'welcome');
s.opened[0].done();
s.advance(cfg.cooldownSeconds + 1);
s.emit('clock:tick', {});
assert.equal(s.opened.length, 1, 'the welcome hint is not repeated');

// co-op: a player-specific hint is for that player only, a shared one for both, and each player keeps their own record
s = setup({ players: 2 });
s.emit('player:vehicle', { player: 1, id: 'bike' });
assert.deepEqual(s.opened[0].audience, [1]);
s.opened[0].done();
assert.ok(s.flags[flagKey('bike', 1)] && !s.flags[flagKey('bike', 0)]);
s.advance(cfg.cooldownSeconds + 1);
s.emit('player:vehicle', { player: 0, id: 'bike' });
assert.equal(s.opened.length, 2, 'the other player still gets their own bike hint');
s.opened[1].done();
s.advance(cfg.cooldownSeconds + 1);
s.emit('chase:seen', true);
assert.deepEqual(s.opened[2].audience, [0, 1], 'a situation that concerns everybody is explained to both');
s.opened[2].done();
s.advance(cfg.cooldownSeconds + 1);
s.emit('chase:seen', false);
assert.equal(s.opened.length, 3, 'a chase that ends explains nothing');

// teardown removes the listeners
s.hints.destroy();
s.advance(cfg.cooldownSeconds + 1);
s.emit('weather:changed', { state: 'rain' });
assert.equal(s.opened.length, 3, 'a destroyed service no longer listens');

console.log(`hints ok: ${cfg.hints.length} hints in two languages, labels for keyboard, pad and touch, once per player, quiet around screens, co-op`);
