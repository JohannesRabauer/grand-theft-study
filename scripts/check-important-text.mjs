// Important text waits for explicit acknowledgement (story 11.6): an audit of the screen sources. No screen may close, advance or time out
// on a timer; every screen ends through input (handleIntent / pointer), and the one allowed clock is the toast, which is incidental.
// The behaviour in the running game (a screen stays open for minutes, a held key cannot dismiss it) is covered by the smoke scenario `important`.
// Run: node scripts/check-important-text.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../ui/screens/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.js'));
assert.ok(files.length >= 15, 'the screens are found');
const timers = /delayedCall|setTimeout|setInterval|time\.addEvent/;
for (const f of files) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const hit = code.match(timers);
  // PackingScreen / TestScreen / MinigameScreen host timed gameplay (a lesson clock, a minigame), never the reading of a message: allowed
  const timedGameplay = ['PackingScreen.js', 'TestScreen.js', 'MinigameScreen.js'].includes(f);
  assert.ok(!hit || timedGameplay, `${f}: a screen must not close or advance on a timer (${hit?.[0]})`);
  assert.ok(/handleIntent/.test(code), `${f}: a screen is closed through its handleIntent`);
}

// ---- the incidental/important split: the toast is the only timed text, and it is short and never blocks
const toast = readFileSync(new URL('../ui/hud/ToastModule.js', import.meta.url), 'utf8');
assert.match(toast, /SHOW_MS = \d+/, 'toasts time out');
assert.ok(!/screens\.push|freeze/.test(toast), 'a toast never blocks the game');

// ---- messages that carry rules or a result are screens: the day end, the report card and the mission texts use MessageScreen
for (const f of ['entities/DayFlow.js', 'entities/Quests.js']) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /MessageScreen/, `${f} uses the message screen`);
console.log(`important text ok: ${files.length} screens without timers, toasts incidental only`);
