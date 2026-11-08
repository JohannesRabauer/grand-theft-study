// Audio (story 13.1): the data (every event is really emitted, every sound valid), the voice pool with its cap and priorities, mute-until-tap and
// the mute flag through a fake Web Audio, and that `sfx:play` names used in the source have a sound. The real AudioContext runs in the smoke
// scenario `audio`.
// Run: node scripts/check-audio.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { VoicePool, soundFor, validateAudio } from '../services/audioLogic.js';
import { Audio } from '../services/Audio.js';

const root = new URL('../', import.meta.url);
const load = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const cfg = load('data/audio.json');

// ---- every mapped event is emitted somewhere in the game
const files = [];
const walk = dir => { for (const f of readdirSync(new URL(dir, root))) { if (['node_modules', '.git', '_bmad', '_bmad-output', 'scripts'].includes(f)) continue; const rel = `${dir}${f}`; if (statSync(new URL(rel, root)).isDirectory()) walk(`${rel}/`); else if (f.endsWith('.js')) files.push(rel); } };
walk('');
const source = files.map(f => readFileSync(new URL(f, root), 'utf8')).join('\n');
const emitted = [...new Set([...source.matchAll(/emit\('([a-z]+:[a-zA-Z-]+)'/g)].map(m => m[1]))];
assert.deepEqual(validateAudio(cfg, emitted), [], validateAudio(cfg, emitted).join('\n'));

// ---- every literal sfx:play name has a sound (dynamic ones are listed with a prefix)
const literal = [...source.matchAll(/sfx:play', \{ name: '([a-z.-]+)'/g)].map(m => m[1]);
for (const n of literal) assert.ok(soundFor(cfg, n), `sfx:play '${n}' has a sound`);
for (const n of ['karate.perfect', 'karate.good', 'karate.miss', 'karate.combo', 'musik.perfect', 'musik.good', 'musik.miss', 'musik.combo', 'kunst.paint', 'kunst.reveal', 'kunst.perfect', 'kunst.done', 'bus-horn', 'traffic-hit']) assert.ok(cfg.sfx[n], `${n} is defined`);
assert.equal(soundFor(cfg, 'loot:collected'), 'coin');
assert.equal(soundFor(cfg, 'coin'), 'coin');
assert.equal(soundFor(cfg, 'nothing:here'), null);

// ---- the voice pool
const pool = new VoicePool(3);
assert.ok(pool.take(0, 1, 1) && pool.take(0, 1, 1) && pool.take(0, 1, 1));
assert.equal(pool.active(0.5), 3);
assert.ok(!pool.take(0.5, 1, 1), 'full: an equal sound is dropped');
assert.equal(pool.dropped, 1);
assert.ok(pool.take(0.5, 1, 3), 'a more important sound cuts a quieter one');
assert.equal(pool.active(0.5), 3, 'the cap holds');
assert.equal(pool.active(1.2), 1, 'voices free themselves when they end');
for (let i = 0; i < 100; i++) pool.take(2, 1, 0);
assert.ok(pool.active(2) <= 3, 'a hundred sounds at once never exceed the cap');

// ---- mute-until-tap and the mute flag through a fake Web Audio
const calls = { osc: 0, noise: 0 };
const node = () => ({ connect() {}, start() {}, stop() {}, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
class FakeAC {
  constructor() { this.currentTime = 0; this.sampleRate = 100; this.destination = {}; this.state = 'suspended'; }
  createGain() { return node(); }
  createOscillator() { calls.osc++; return node(); }
  createBufferSource() { calls.noise++; return node(); }
  createBiquadFilter() { return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { this.state = 'running'; }
}
const listeners = new Map();
const win = { addEventListener: (e, f) => listeners.set(e, f), removeEventListener: e => listeners.delete(e) };
const events = new EventEmitter();
const flags = {};
const ctx = { events: { on: (e, f) => events.on(e, f), emit: (e, p) => events.emit(e, p) }, state: { shared: { flags } } };
const audio = new Audio(ctx, cfg, { window: win, AudioContext: FakeAC });
const heard = [];
events.on('audio:played', e => heard.push(e.name));
assert.ok(!audio.unlocked && listeners.size === cfg.unlockOn.length, 'asleep until a gesture, waiting for one');
events.emit('loot:collected', {});
assert.equal(heard.length, 0, 'nothing plays before the first tap');
assert.ok(audio.refused > 0, 'and it noticed');
listeners.get('pointerdown')();
assert.ok(audio.unlocked && listeners.size === 0, 'the first gesture creates the context and removes the listeners');
events.emit('loot:collected', {});
events.emit('sfx:play', { name: 'karate.perfect' });
events.emit('sfx:play', { name: 'no.such.sound' });
events.emit('tool:throw', {});
assert.deepEqual(heard, ['coin', 'karate.perfect', 'whoosh'], 'events and the sfx hook play their sounds, unknown names do nothing');
assert.ok(calls.osc >= 2 && calls.noise === 1, 'oscillators for tones, a noise source for the whoosh');
flags.audioMuted = true;
events.emit('loot:collected', {});
assert.equal(heard.length, 3, 'muted: silence');
flags.audioMuted = false;
const win2 = { addEventListener() {}, removeEventListener() {}, SCHULWEG_AUDIO: win.SCHULWEG_AUDIO };
const second = new Audio({ ...ctx }, cfg, { window: win2, AudioContext: FakeAC });
assert.ok(second.unlocked, 'a later run shares the unlocked context');
for (let i = 0; i < 40; i++) events.emit('loot:collected', {});
assert.ok(audio.pool.active(audio.shared.ac.currentTime) <= cfg.voiceCap, 'the voice cap holds under a flood of events');
console.log(`audio ok: ${Object.keys(cfg.sfx).length} sounds, ${Object.keys(cfg.events).length} mapped events, voice cap ${cfg.voiceCap}, mute-until-tap`);
