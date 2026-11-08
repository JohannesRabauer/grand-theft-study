// Music (stories 13.2 and 13.3): the themes of every phase in every season, the sequencer maths, the theme change at phase boundaries and the
// chase layers that stack from level 1 to 5 and drop on escape, driven through a fake Web Audio clock. The real browser run is the smoke
// scenario `music`.
// Run: node scripts/check-music.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { degreeToMidi, layerNote, layersAt, midiToHz, stepNotes, stepSeconds, themeFor, validateMusic } from '../services/musicLogic.js';
import { Music } from '../services/Music.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/music.json');
const day = load('data/day.json');
const phases = day.phases.map(p => p.id);
const seasons = [...new Set(day.phases.map(p => p.season))];
assert.deepEqual(validateMusic(cfg, phases, ['autumn', 'winter', 'spring', 'summer']), [], validateMusic(cfg, phases, ['autumn', 'winter', 'spring', 'summer']).join('\n'));

// ---- the maths
assert.equal(degreeToMidi(60, cfg.scales.major, 0), 60);
assert.equal(degreeToMidi(60, cfg.scales.major, 7), 72, 'degree 7 is an octave up');
assert.equal(degreeToMidi(60, cfg.scales.major, 2), 64);
assert.equal(degreeToMidi(60, cfg.scales.major, -1), 59, 'negative degrees go below');
assert.equal(degreeToMidi(60, cfg.scales.minor, 2), 63, 'the minor third');
assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9 && Math.abs(midiToHz(81) - 880) < 1e-9);

// ---- every phase has a theme in every season, and they sound different
const ids = new Set();
for (const ph of phases) for (const s of ['autumn', 'winter', 'spring', 'summer']) {
  const t = themeFor(cfg, ph, s);
  assert.ok(t && t.bass.length === cfg.steps, `${ph} in ${s}`);
  ids.add(`${t.bpm.toFixed(2)}/${t.root}`);
}
assert.ok(ids.size >= phases.length * 2, 'phases and seasons change tempo and key');
assert.ok(themeFor(cfg, 'school', 'winter').bpm < themeFor(cfg, 'commute', 'summer').bpm, 'the quiet school winter is slower than the summer rush');
assert.equal(themeFor(cfg, 'nowhere', 'autumn'), null);
assert.equal(themeFor(cfg, 'school', 'unknown').season, 'autumn', 'an unknown season falls back');
const T = themeFor(cfg, 'commute', 'spring');
const out = { bass: null, melody: null };
assert.equal(stepNotes(T, 0, out).melody, degreeToMidi(T.root, T.scale, 7));
assert.equal(out.bass, degreeToMidi(T.root, T.scale, 0 - 7), 'the bass sits an octave below');
assert.equal(stepNotes(T, 2, out).bass, null, 'a rest');
assert.equal(stepNotes(T, 16, out).melody, stepNotes(T, 0, { }).melody, 'patterns loop');

// ---- chase layers stack with the level and the tempo rises
assert.deepEqual([0, 1, 2, 3, 4, 5].map(l => layersAt(cfg, l)), [0, 1, 2, 3, 4, 5], 'one more layer from each level');
assert.ok(stepSeconds(cfg, T, 5) < stepSeconds(cfg, T, 1) && stepSeconds(cfg, T, 1) < stepSeconds(cfg, T, 0), 'the chase speeds the music up');
const lay = { kind: '', gain: 0, wave: '', midi: null };
const everyStep = cfg.chase.layers.filter(l => layerNote(T, l, 1, lay));
assert.ok(everyStep.some(l => l.id === 'hat') && everyStep.length >= 2, 'hat and arpeggio play on odd steps');
assert.equal(layerNote(T, cfg.chase.layers.find(l => l.id === 'drone'), 3, lay), null, 'a slow layer rests between its beats');

// ---- the service through a fake clock
const made = { osc: 0, noise: 0 };
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 1 }, frequency: { setValueAtTime() {} }, set type(v) {} });
const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator() { made.osc++; return node(); }, createBufferSource() { made.noise++; return node(); }, createBiquadFilter: node };
const events = new EventEmitter();
const state = { phase: 'morning', season: 'autumn' };
const ctx = { events: { on: (e, f) => events.on(e, f), emit: (e, p) => events.emit(e, p) }, day: state, chase: { level: 0 }, screens: { top: () => null } };
const audio = { unlocked: true, muted: false, shared: { ac, noise: {} } };
const themes = [];
events.on('music:theme', e => themes.push(e.id));
const m = new Music(ctx, cfg, audio);
m.start();
assert.ok(m.playing && themes.join() === 'morning.autumn', 'starts with the theme of the phase');
const perSecond = () => { made.osc = made.noise = 0; ac.currentTime += 1; m.nextTime = ac.currentTime; m.tick(); ac.currentTime += 0.4; m.tick(); return made.osc + made.noise; };
const calm = perSecond();
assert.ok(calm > 0, 'it plays');
for (let level = 1; level <= 5; level++) { ctx.chase.level = level; events.emit('chase:level', { level }); }
const busy = perSecond();
assert.ok(busy > calm, `level 5 plays more notes than a calm moment (${busy} > ${calm})`);
const counts = [];
for (let level = 0; level <= 5; level++) { ctx.chase.level = level; events.emit('chase:level', { level }); counts.push(perSecond()); }
assert.ok(counts[5] > counts[3] && counts[3] > counts[1] && counts[1] > counts[0], `layers increase from level 1 to 5: ${counts}`);
ctx.chase.level = 0;
events.emit('chase:level', { level: 0 });
assert.ok(perSecond() <= counts[0] + 2, 'and drop on escape');
state.phase = 'school'; state.season = 'winter';
events.emit('phase:started', { phase: 'school' });
assert.deepEqual(themes, ['morning.autumn', 'school.winter'], 'the theme changes at the phase boundary');
events.emit('phase:started', { phase: 'school' });
assert.equal(themes.length, 2, 'and not without a boundary');
audio.muted = true;
assert.equal(perSecond(), 0, 'muted: no notes');
audio.muted = false;
ctx.screens.top = () => ({ id: 'minigame' });
assert.equal(perSecond(), 0, 'quiet while a minigame is open');
ctx.screens.top = () => null;
assert.ok(perSecond() > 0, 'and back after it');
m.destroy();
assert.ok(!m.playing);
console.log(`music ok: ${phases.length} phases x 4 seasons, layers ${counts.join('/')} notes per second from level 0 to 5, theme change at phase boundaries`);
