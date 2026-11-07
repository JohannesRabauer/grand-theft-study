// Checks the Musik minigame logic (minigames/rhythmCore.js, data/songs.json): every song and chart is valid, schedules are
// deterministic, ordered and fill the round, hit windows (perfect/good/miss, the musicArtBonus widening, tiers), the note
// track (hits, early presses, misses, no double hits), scoring bounds and combos, beat phase, lane input mapping, the
// tier choice, at most NOTE_POOL notes on screen, plus the registry entry and i18n keys.
// Run: node scripts/check-musik.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GOOD, MISSED, NoteTrack, PERFECT, PENDING, Scorer, TIERS, accuracyOf, beatPhase, buildSchedule, judgeOffset, lanesFromNav,
  noteY, parseBar, songFor, songProblems, stepMs, tierFor, windowsFor
} from '../minigames/rhythmCore.js';
import { NOTE_POOL } from '../minigames/ui/RhythmStage.js';
import { mulberry32 } from '../learning/engineCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = json('data/songs.json');
const def = json('data/minigames.json').minigames.find(m => m.id === 'musik');
const characters = json('data/characters.json');
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const roundMs = def.durationSeconds * 1000;
const opts = { ...cfg.play, durationMs: roundMs, lanes: cfg.lanes, stepsPerBar: cfg.stepsPerBar };

// ---- registry and texts ----
assert.equal(def.subject, 'musik');
assert.ok(def.durationSeconds >= 30 && def.durationSeconds <= 90);
assert.equal(def.maxPlayers, 2);
assert.equal(def.learning, false);
assert.deepEqual(def.topics, []);
assert.ok(!def.debug && def.options.celebrateMs > 0 && def.options.combo.from >= 2);
for (const k of ['title', 'help', 'perfect', 'good', 'miss', 'combo', 'points', 'winner', 'tie']) assert.ok(de[`minigame.musik.${k}`] && en[`minigame.musik.${k}`], `minigame.musik.${k} in both languages`);
assert.ok(de['minigame.musicart.bonus'].includes('{n}') && en['minigame.musicart.bonus'].includes('{n}'));
assert.ok(de['minigame.musik.winner'].includes('{name}') && en['minigame.musik.winner'].includes('{name}'));
for (const s of cfg.songs) assert.ok(de[`minigame.musik.song.${s.id}`] && en[`minigame.musik.song.${s.id}`], `song title ${s.id}`);

// ---- songs and charts ----
assert.ok(cfg.songs.length >= 3 && cfg.songs.length <= 4);
assert.equal(new Set(cfg.songs.map(s => s.id)).size, cfg.songs.length, 'unique song ids');
assert.equal(cfg.lanes, 4);
assert.deepEqual(TIERS, ['easy', 'medium', 'hard']);
for (const song of cfg.songs) {
  assert.deepEqual(songProblems(song, cfg), [], `${song.id}: chart problems`);
  const count = t => song.charts[t].join('').replace(/\./g, '').length;
  assert.ok(count('easy') < count('medium') && count('medium') < count('hard'), `${song.id}: more notes per tier`);
  assert.ok(song.scale.every(p => Number.isInteger(song.root + p) && song.root + p >= 40 && song.root + p <= 90), `${song.id}: MIDI pitches`);
  for (const tier of TIERS) {
    for (const bar of song.charts[tier]) assert.equal(parseBar(bar).length, cfg.stepsPerBar);
  }
}
assert.deepEqual(parseBar('0.3.'), [0, -1, 3, -1]);
assert.ok(songProblems({ bpm: 100, scale: [0, 1, 2, 3], charts: { easy: ['0.......', '9.......', '0.......', '0.......'], medium: ['0.......', '0.......', '0.......', '0.......'], hard: ['0.......', '0.......', '0.......', '0.......'] } }, cfg).length > 0, 'a bad lane char is reported');
assert.ok(songProblems({ bpm: 100, scale: [0, 1, 2, 3], charts: { easy: ['0...', '0.......', '0.......', '0.......'], medium: ['0.......', '0.......', '0.......', '0.......'], hard: ['0.......', '0.......', '0.......', '0.......'] } }, cfg).length > 0, 'a short bar is reported');

// ---- chart generation: deterministic, ordered, fills the round, lanes in range ----
for (const song of cfg.songs) {
  for (const tier of TIERS) {
    const a = buildSchedule(song, tier, opts);
    const b = buildSchedule(song, tier, opts);
    assert.deepEqual(a, b, `${song.id}/${tier}: same input, same schedule`);
    assert.equal(a.n, a.t.length);
    assert.equal(a.n, a.lane.length);
    assert.ok(a.t[0] >= cfg.play.leadInMs, 'nothing before the lead-in');
    assert.ok(a.t.every((t, i) => i === 0 || t >= a.t[i - 1]), `${song.id}/${tier}: ascending times`);
    assert.ok(a.t.at(-1) <= roundMs - cfg.play.tailMs, 'nothing in the tail');
    assert.ok(roundMs - cfg.play.tailMs - a.t.at(-1) < 4 * (240000 / song.bpm), `${song.id}/${tier}: the song fills the round`);
    assert.ok(a.lane.every(l => Number.isInteger(l) && l >= 0 && l < cfg.lanes));
    assert.ok(a.n >= (tier === 'easy' ? 40 : tier === "medium" ? 80 : 95), `${song.id}/${tier}: ${a.n} notes`);
    assert.ok(a.n >= def.expectedQuestions, 'a round has at least the expected notes');
    // the second pass is the mirror of the first
    const loop = song.charts[tier].join('').replace(/\./g, '').length;
    assert.deepEqual(a.lane.slice(loop, loop + 8).map(l => 3 - l), a.lane.slice(0, 8), `${song.id}/${tier}: odd passes are mirrored`);
    // at most NOTE_POOL notes on screen at any time
    const fall = cfg.tiers[tier].fallMs;
    let most = 0;
    for (let now = 0; now < roundMs; now += 50) most = Math.max(most, a.t.filter(t => t - fall <= now && t + cfg.windows.lingerMs >= now).length);
    assert.ok(most <= NOTE_POOL, `${song.id}/${tier}: ${most} notes visible, pool ${NOTE_POOL}`);
    // gentle spacing: never faster than a step
    const gaps = a.t.slice(1).map((t, i) => t - a.t[i]);
    assert.ok(Math.min(...gaps) >= stepMs(song.bpm, cfg.stepsPerBar) - 1, 'notes are at least one step apart');
  }
}
assert.notDeepEqual(buildSchedule(cfg.songs[0], 'easy', opts), buildSchedule(cfg.songs[1], 'easy', opts), 'songs differ');
assert.ok(buildSchedule(cfg.songs[0], 'easy', { ...opts, durationMs: 20000 }).n < buildSchedule(cfg.songs[0], 'easy', opts).n, 'a shorter round has fewer notes');
assert.equal(songFor(cfg.songs, () => 0), cfg.songs[0]);
assert.equal(songFor(cfg.songs, () => 0.999), cfg.songs.at(-1));
{
  const rng = mulberry32(3);
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(songFor(cfg.songs, rng).id);
  assert.equal(seen.size, cfg.songs.length, 'every song gets played');
}

// ---- tiers from difficulty, level and the perk ----
assert.equal(tierFor(1, 1, cfg.tierRule), 'easy');
assert.equal(tierFor(2, 1, cfg.tierRule), 'easy');
assert.equal(tierFor(3, 1, cfg.tierRule), 'medium');
assert.equal(tierFor(4, 1, cfg.tierRule), 'hard');
assert.equal(tierFor(5, 1, cfg.tierRule), 'hard');
assert.equal(tierFor(2, 5, cfg.tierRule), 'medium', 'a higher level nudges the tier up');
assert.equal(tierFor(1, 1, cfg.tierRule) === 'easy' && tierFor(1, 0, cfg.tierRule) === 'easy', true, 'level 0 is like level 1');
assert.ok(TIERS.every(t => cfg.tiers[t].fallMs > 1000 && cfg.tiers[t].windowScale >= 1));
assert.ok(cfg.tiers.easy.fallMs > cfg.tiers.medium.fallMs && cfg.tiers.medium.fallMs > cfg.tiers.hard.fallMs, 'easier tiers fall slower');

// ---- hit windows ----
{
  const base = windowsFor(cfg, 'hard', 0);
  assert.deepEqual([base.perfect, base.good], [cfg.windows.perfectMs, cfg.windows.goodMs]);
  assert.ok(base.good >= 120, 'gentle: the good window is generous');
  assert.equal(judgeOffset(0, base), 'perfect');
  assert.equal(judgeOffset(-base.perfect, base), 'perfect');
  assert.equal(judgeOffset(base.perfect + 1, base), 'good');
  assert.equal(judgeOffset(-base.good, base), 'good');
  assert.equal(judgeOffset(base.good + 1, base), null);
  assert.equal(judgeOffset(-base.good - 1, base), null);
  const easy = windowsFor(cfg, 'easy', 0);
  assert.ok(easy.good > base.good && easy.perfect > base.perfect, 'easy tiers are more forgiving');
  const lorenz = characters.characters.find(c => c.id === 'lorenz').perks.musicArtBonus;
  assert.ok(lorenz > 0 && characters.perkDefaults.musicArtBonus === 0, 'Lorenz has the perk, others none');
  const wide = windowsFor(cfg, 'hard', lorenz);
  assert.ok(Math.abs(wide.good - base.good * (1 + lorenz)) < 1e-9 && wide.perfect > base.perfect, 'the perk widens the windows by its share');
  assert.equal(judgeOffset(base.good + 20, wide), 'good', 'a press that misses for others still counts for Lorenz');
  assert.deepEqual(windowsFor(cfg, 'hard', -1), base, 'a negative bonus is ignored');
  assert.equal(wide.linger, cfg.windows.lingerMs);
}

// ---- the note track ----
const small = { n: 6, t: [1000, 1500, 2000, 2500, 3000, 3500], lane: [0, 1, 0, 2, 3, 1] };
{
  const win = windowsFor(cfg, 'hard', 0);
  const tr = new NoteTrack(small, 4, win);
  assert.equal(tr.judged, 0);
  assert.ok(tr.state.every(s => s === PENDING));
  assert.equal(tr.press(0, 400).grade, null, 'too early is ignored');
  assert.equal(tr.press(2, 1000).grade, null, 'a press in a lane without a note is ignored');
  const hit = tr.press(0, 1030);
  assert.deepEqual([hit.grade, hit.index, hit.dt], ['perfect', 0, 30]);
  assert.equal(tr.state[0], PERFECT);
  assert.equal(tr.press(0, 1030).grade, null, 'a note is hit only once; the next note of the lane is far away');
  assert.equal(tr.press(1, 1500 - 100).grade, 'good');
  assert.equal(tr.state[1], GOOD);
  assert.equal(tr.sweep(2000), 0, 'the note at 2000 is still hittable at 2000');
  assert.equal(tr.sweep(2000 + win.good + 1), 1, 'one note slid past the window');
  assert.deepEqual(tr.missed, [2]);
  assert.equal(tr.state[2], MISSED);
  assert.equal(tr.sweep(2000 + win.good + 2), 0, 'a miss is counted once and `missed` is cleared');
  assert.deepEqual(tr.missed, []);
  assert.equal(tr.sweep(99999), 3, 'the rest misses at once');
  assert.deepEqual(tr.counts, { perfect: 1, good: 1, miss: 4 });
  assert.equal(tr.judged, 6);
  assert.equal(accuracyOf(tr.counts), 2 / 6);
  assert.equal(tr.press(3, 3000).grade, null, 'nothing left to hit');
  assert.equal(accuracyOf({ perfect: 0, good: 0, miss: 0 }), 0, 'no notes, no accuracy');
}
{
  // a perfect player hits everything; a player who never presses misses everything; a late press hits the oldest note
  const win = windowsFor(cfg, 'hard', 0);
  const song = cfg.songs[0];
  const sched = buildSchedule(song, 'medium', opts);
  const ace = new NoteTrack(sched, 4, win);
  for (let i = 0; i < sched.n; i++) { ace.sweep(sched.t[i]); assert.equal(ace.press(sched.lane[i], sched.t[i]).grade, 'perfect'); }
  assert.deepEqual(ace.counts, { perfect: sched.n, good: 0, miss: 0 });
  const idle = new NoteTrack(sched, 4, win);
  idle.sweep(roundMs);
  assert.deepEqual(idle.counts, { perfect: 0, good: 0, miss: sched.n });
  const late = new NoteTrack(sched, 4, win);
  late.sweep(sched.t[0] + win.good);
  assert.equal(late.press(sched.lane[0], sched.t[0] + win.good).grade, 'good', 'the edge of the window still counts');
  // the same sloppy play (every press 110 ms late) misses with the plain windows and hits with Lorenz' windows
  const lorenz = characters.characters.find(c => c.id === 'lorenz').perks.musicArtBonus;
  const play = bonus => {
    const t = new NoteTrack(sched, 4, windowsFor(cfg, 'hard', bonus));
    for (let i = 0; i < sched.n; i++) { t.sweep(sched.t[i] + 160); t.press(sched.lane[i], sched.t[i] + 160); }
    return accuracyOf(t.counts);
  };
  assert.ok(play(lorenz) > play(0), 'wider windows hit more of the same timing');
}
{
  // range(): spawn ahead, keep behind, moves forward only
  const tr = new NoteTrack(small, 4, windowsFor(cfg, 'hard', 0));
  tr.range(0, 500, 300);
  assert.deepEqual([tr.lo, tr.hi], [0, 0]);
  tr.range(500, 500, 300);
  assert.deepEqual([tr.lo, tr.hi], [0, 1], 'a note spawns `ahead` ms before its time');
  tr.range(1299, 500, 300);
  assert.deepEqual([tr.lo, tr.hi], [0, 2]);
  tr.range(1301, 500, 300);
  assert.deepEqual([tr.lo, tr.hi], [1, 2], 'a note leaves `behind` ms after its time');
  tr.range(99999, 500, 300);
  assert.deepEqual([tr.lo, tr.hi], [6, 6]);
}

// ---- scoring and combo ----
{
  const sc = new Scorer(cfg.scoring, 0);
  assert.equal(sc.hit('perfect'), cfg.scoring.perfect);
  assert.equal(sc.hit('good'), cfg.scoring.good);
  assert.equal(sc.combo, 2);
  sc.miss();
  assert.equal(sc.combo, 0, 'a miss breaks the combo');
  assert.equal(sc.best, 2);
  assert.equal(sc.points, cfg.scoring.perfect + cfg.scoring.good, 'a miss costs no points');
  assert.equal(sc.multiplier(0), 1);
  assert.equal(sc.multiplier(cfg.scoring.comboStep - 1), 1);
  assert.equal(sc.multiplier(cfg.scoring.comboStep), 1 + cfg.scoring.multStep);
  assert.equal(sc.multiplier(10000), cfg.scoring.maxMult, 'the multiplier is capped');
  const run = new Scorer(cfg.scoring, 0);
  for (let i = 0; i < 100; i++) run.hit('perfect');
  assert.equal(run.best, 100);
  assert.ok(run.points <= 100 * cfg.scoring.perfect * cfg.scoring.maxMult && run.points > 100 * cfg.scoring.perfect, 'points are bounded and the combo pays');
  const lorenz = characters.characters.find(c => c.id === 'lorenz').perks.musicArtBonus;
  const rich = new Scorer(cfg.scoring, lorenz);
  assert.equal(rich.hit('perfect'), Math.round(cfg.scoring.perfect * (1 + lorenz)), 'the perk multiplies the points');
  assert.equal(new Scorer(cfg.scoring, -5).hit('perfect'), cfg.scoring.perfect, 'a negative bonus is ignored');
  // a whole ideal round stays within bounds
  const sched = buildSchedule(cfg.songs[2], 'hard', opts);
  const top = new Scorer(cfg.scoring, lorenz);
  for (let i = 0; i < sched.n; i++) top.hit('perfect');
  assert.ok(top.points > 0 && top.points <= sched.n * cfg.scoring.perfect * cfg.scoring.maxMult * (1 + lorenz));
}

// ---- beat cue, positions, input ----
assert.equal(beatPhase(0, 120), 0);
assert.ok(Math.abs(beatPhase(250, 120) - 0.5) < 1e-9, 'half a beat at 120 bpm after 250 ms');
assert.ok(Math.abs(beatPhase(500, 120)) < 1e-9, 'a full beat wraps to 0');
assert.ok([0, 123, 4567, 59999].every(t => beatPhase(t, 100) >= 0 && beatPhase(t, 100) < 1));
assert.equal(noteY(1000, 1000, 2000, 10, 110), 110, 'on the line at its time');
assert.equal(noteY(3000, 1000, 2000, 10, 110), 10, 'at the top when it spawns');
assert.ok(noteY(900, 1000, 2000, 10, 110) > 110, 'below the line afterwards');
{
  const out = [];
  assert.equal(lanesFromNav({ dx: 0, dy: 0, confirm: false, pick: 0 }, 4, out), 0);
  assert.equal(lanesFromNav({ dx: -1, dy: 0, pick: 0 }, 4, out), 1);
  assert.deepEqual(out.slice(0, 1), [0], 'left = lane 0');
  assert.equal(lanesFromNav({ dx: 0, dy: 1, pick: 0 }, 4, out), 1);
  assert.deepEqual(out.slice(0, 1), [1], 'down = lane 1');
  assert.equal(lanesFromNav({ dx: 0, dy: -1, pick: 0 }, 4, out), 1);
  assert.deepEqual(out.slice(0, 1), [2], 'up = lane 2');
  assert.equal(lanesFromNav({ dx: 1, dy: 0, pick: 0 }, 4, out), 1);
  assert.deepEqual(out.slice(0, 1), [3], 'right = lane 3');
  assert.equal(lanesFromNav({ dx: 0, dy: 0, pick: 3 }, 4, out), 1);
  assert.deepEqual(out.slice(0, 1), [2], 'key 3 = lane 2');
  assert.equal(lanesFromNav({ dx: 1, dy: 1, pick: 1 }, 4, out), 3, 'two keys and a number in one frame are three presses');
  assert.equal(lanesFromNav({ dx: 0, dy: 0, pick: 5 }, 4, out), 0, 'a number outside the lanes is ignored');
}

console.log('check-musik ok');
