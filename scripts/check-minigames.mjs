// Checks the minigame framework without Phaser (minigames/minigameCore.js, data/minigames.json, Grades.preview):
// registry data, the round clock (countdown, pause, carry-over), tallies, score/effort/reward rules, result aggregation
// for one and two players, stars and result bands, the answer cursor and the side-by-side layout.
// Run: node scripts/check-minigames.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import {
  ChoiceCursor, RoundClock, Tally, bandFor, buildResult, clampDifficulty, layoutRects, lineFor, meanGrade,
  playerResult, playersProblem, rewardFor, sceneKey, starsFor
} from '../minigames/minigameCore.js';
import { gradeDetail } from '../grading/gradeCore.js';
import { Grades } from '../grading/Grades.js';
import { GameState } from '../state/GameState.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = json('data/minigames.json');
const { settings: cfg, minigames } = data;
const grading = json('data/grading.json');
const kopf = json('data/kopfnoten.json');
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const topics = json('data/learning/index.json').topics.map(t => t.topic);
const classes = readFileSync(new URL('../minigames/index.js', import.meta.url), 'utf8');

// ---- registry ----
assert.equal(new Set(minigames.map(m => m.id)).size, minigames.length, 'unique ids');
for (const m of minigames) {
  assert.equal(m.scene, sceneKey(m.id), `${m.id}: scene key is MG_<id>`);
  assert.ok(classes.includes(`'${m.id}':`), `${m.id}: a scene class is registered in minigames/index.js`);
  assert.ok(m.durationSeconds >= 30 && m.durationSeconds <= 90, `${m.id}: duration 30-90 s`);
  assert.ok(Number.isInteger(m.rewards.xp) && m.rewards.xp > 0 && Number.isInteger(m.rewards.moneyCents) && m.rewards.moneyCents >= 0, `${m.id}: integer rewards`);
  assert.ok(m.topics.length > 0 && m.topics.every(t => topics.includes(t)), `${m.id}: known topics`);
  assert.ok(m.maxPlayers === 1 || m.maxPlayers === 2, `${m.id}: one or two players`);
  assert.ok(m.difficultyRange[0] >= 1 && m.difficultyRange[1] <= 5 && m.difficultyRange[0] <= m.difficultyRange[1], `${m.id}: difficulty range`);
  assert.ok(m.expectedQuestions > 0 && typeof m.subject === 'string', `${m.id}: expected questions and subject`);
  assert.ok(de[`minigame.${m.id}.title`] && en[`minigame.${m.id}.title`], `${m.id}: title in both languages`);
}
assert.deepEqual(minigames.filter(m => m.debug).map(m => m.id).sort(), ['quiz-demo', 'sprint-demo'], 'both demos are debug-only');
assert.equal(minigames.find(m => m.id === 'quiz-demo').questionCount, 10);
for (let g = 1; g <= 6; g++) assert.ok(de[`minigame.headline.${g}`] && en[`minigame.headline.${g}`], `headline for grade ${g}`);
for (const b of cfg.bands) for (const k of b.lines) assert.ok(de[k] && en[k], `${k} in both languages`);
assert.ok(cfg.bands.every((b, i) => i === 0 || b.min < cfg.bands[i - 1].min) && cfg.bands.at(-1).min === 0, 'bands descend and cover 0');
assert.ok(cfg.stars.every((s, i) => i === 0 || s > cfg.stars[i - 1]) && cfg.stars.length === 3, 'three ascending star thresholds');

// ---- players and difficulty ----
const duo = minigames[0];
assert.equal(playersProblem(duo, [0], 2), null);
assert.equal(playersProblem(duo, [0, 1], 2), null);
assert.ok(playersProblem(duo, [], 2));
assert.ok(playersProblem(duo, [0, 0], 2), 'duplicate');
assert.ok(playersProblem(duo, [0, 2], 2), 'unknown player');
assert.ok(playersProblem(duo, [0, 1, 2], 3), 'too many');
assert.ok(playersProblem({ ...duo, maxPlayers: 1 }, [0, 1], 2), 'a solo minigame refuses two');
assert.equal(clampDifficulty(duo, undefined), 3);
assert.equal(clampDifficulty({ difficultyRange: [2, 4] }, 9), 4);
assert.equal(clampDifficulty({ difficultyRange: [2, 4] }, 0), 2);

// ---- round clock ----
{
  const c = new RoundClock(10000, 2000);
  assert.equal(c.phase, 'countdown');
  assert.equal(c.tick(1000), null);
  assert.equal(c.remainingMs, 10000, 'the timer does not run during the countdown');
  assert.equal(c.tick(1500), 'play', 'the countdown ends');
  assert.equal(c.elapsedMs, 500, 'the overshoot counts as play time');
  assert.equal(c.tick(0), null);
  for (let i = 0; i < 9; i++) assert.equal(c.tick(1000), null);
  assert.equal(c.tick(1000), 'done');
  assert.equal(c.elapsedMs, 10000);
  assert.equal(c.remainingMs, 0);
  assert.equal(c.tick(1000), null, 'nothing after the end');
  const skip = new RoundClock(5000, 0);
  assert.equal(skip.phase, 'play', 'no countdown starts playing at once');
  const quitEarly = new RoundClock(5000, 0);
  quitEarly.tick(1200);
  quitEarly.finish();
  assert.equal(quitEarly.phase, 'done');
  assert.equal(quitEarly.elapsedMs, 1200, 'time stands still when nobody ticks (pause)');
}

// ---- tallies, scores, effort ----
const tally = (answers, hints = 0) => {
  const t = new Tally();
  answers.forEach((ok, i) => t.record(ok, 1000 * (i + 1), i < hints ? 1 : 0, 'mathe'));
  return t;
};
const opts = { expected: 10, quit: false, quitEffortCap: cfg.quitEffortCap };
{
  const t = tally([true, true, false, true, true]);
  assert.equal(t.bestStreak, 2);
  assert.equal(t.streak, 2);
  assert.deepEqual(t.byTopic.mathe, { correct: 4, total: 5 });
  const r = playerResult(t, opts);
  assert.equal(r.score, 0.4, 'a short round counts against the expected number of questions');
  assert.equal(r.effort, 0.5);
  assert.equal(r.stats.avgMs, 3000);
  const full = playerResult(tally(Array(10).fill(true)), opts);
  assert.equal(full.score, 1);
  assert.equal(full.effort, 1);
  const long = playerResult(tally([...Array(12).fill(true), false, false, false, false]), opts);
  assert.equal(long.score, 0.75, 'more questions than expected: plain accuracy');
  assert.equal(long.effort, 1);
  assert.equal(playerResult(new Tally(), opts).score, 0);
  const quit = playerResult(tally([true, true, true, true, true, true, true, true]), { ...opts, quit: true });
  assert.equal(quit.effort, cfg.quitEffortCap, 'quitting caps the effort');
  assert.equal(quit.score, 0.8, 'but what was answered right still counts');
  assert.equal(playerResult(tally([true], 1), opts).hintsUsed, 1);
}

// ---- rewards ----
{
  const rw = { xp: 30, moneyCents: 50 };
  assert.deepEqual(rewardFor(rw, 1, false, cfg.minRewardShare), { xp: 30, moneyCents: 50 });
  assert.deepEqual(rewardFor(rw, 0, false, cfg.minRewardShare), { xp: 6, moneyCents: 10 }, 'a tried round earns the minimum share');
  assert.deepEqual(rewardFor(rw, 1, true, cfg.minRewardShare), { xp: 0, moneyCents: 0 }, 'no rewards for quitting, and no penalty either');
  const half = rewardFor(rw, 0.5, false, cfg.minRewardShare);
  assert.ok(Number.isInteger(half.xp) && Number.isInteger(half.moneyCents) && half.xp > 6 && half.xp < 30);
}

// ---- result aggregation (the grade mapper is injected: this module never maps a grade itself) ----
const calls = [];
const gradeFn = (player, r) => { calls.push([player, r]); return gradeDetail(r.score, { effort: r.effort, difficulty: r.difficulty }, grading); };
{
  const result = buildResult({ def: duo, cfg, players: [0], tallies: [tally(Array(10).fill(true))], ms: 41234.6, quit: false, difficulty: 3, gradeFn });
  assert.equal(result.score, 1);
  assert.equal(result.grade, 1);
  assert.equal(result.correct, 10);
  assert.equal(result.total, 10);
  assert.equal(result.xp, 30);
  assert.equal(result.moneyCents, 50);
  assert.equal(result.ms, 41235);
  assert.equal(result.perPlayer.length, 1);
  assert.deepEqual(calls.at(-1)[1], { score: 1, effort: 1, difficulty: 3 });
  assert.equal(result.id, 'quiz-demo');
  assert.equal(result.quit, false);
}
{
  const a = tally(Array(10).fill(true));
  const b = tally([true, true, true, true, true, false, false, false, false, false], 2);
  const result = buildResult({ def: duo, cfg, players: [1, 0], tallies: [a, b], ms: 30000, quit: false, difficulty: 4, gradeFn });
  assert.deepEqual(result.perPlayer.map(p => p.player), [1, 0], 'results follow the order of the players');
  assert.equal(result.score, 0.75, 'two players: the mean score');
  assert.equal(result.correct, 15);
  assert.equal(result.total, 20);
  assert.equal(result.hintsUsed, 2);
  assert.equal(result.xp, result.perPlayer[0].xp + result.perPlayer[1].xp);
  assert.equal(result.moneyCents, result.perPlayer[0].moneyCents + result.perPlayer[1].moneyCents);
  assert.equal(result.perPlayer[1].grade, gradeDetail(0.5, { effort: 1, difficulty: 4 }, grading).grade);
  assert.equal(result.stats.bestStreak, 10);
  assert.equal(result.grade, meanGrade(result.perPlayer.map(p => p.grade)));
}
{
  const result = buildResult({ def: duo, cfg, players: [0], tallies: [tally([true, false])], ms: 5000, quit: true, difficulty: 3, gradeFn });
  assert.equal(result.quit, true);
  assert.equal(result.xp, 0);
  assert.equal(result.moneyCents, 0);
  assert.ok(result.effort <= cfg.quitEffortCap);
  assert.ok(result.grade >= 1 && result.grade <= 6 && result.grade < 6, 'quitting is never graded a 6');
  assert.equal(meanGrade([2, 3]), 3, 'a mean of .5 goes to the worse grade');
}

// ---- stars, bands, funny lines ----
assert.deepEqual([0, 0.49, 0.5, 0.74, 0.75, 0.91, 0.92, 1].map(s => starsFor(s, cfg.stars)), [0, 0, 1, 1, 2, 2, 3, 3]);
assert.deepEqual([1, 0.9, 0.89, 0.7, 0.5, 0.25, 0.2499, 0].map(s => bandFor(s, cfg.bands).key), ['great', 'great', 'good', 'good', 'ok', 'low', 'zero', 'zero']);
{
  const r = { score: 0.8, correct: 8, total: 10, grade: 2 };
  assert.equal(lineFor(r, cfg.bands), lineFor({ ...r }, cfg.bands), 'the line is deterministic');
  assert.ok(bandFor(r.score, cfg.bands).lines.includes(lineFor(r, cfg.bands)));
  const seen = new Set();
  for (let c = 0; c < 10; c++) seen.add(lineFor({ score: 0.95, correct: c, total: 10, grade: 1 }, cfg.bands));
  assert.equal(seen.size, 2, 'both variants of a band appear');
}

// ---- answer cursor ----
{
  const intent = { move: { x: 0, y: 0 }, jump: false, interact: false, answer: 0 };
  const cur = new ChoiceCursor();
  intent.jump = true; // still held when the round starts
  assert.equal(cur.read(intent).confirm, false, 'a key held from before does not count');
  intent.jump = false;
  cur.read(intent);
  intent.move.y = 1;
  assert.equal(cur.read(intent).dy, 1, 'a fresh press steps once');
  assert.equal(cur.read(intent).dy, 0, 'holding does not repeat');
  intent.move.y = 0;
  cur.read(intent);
  intent.move.y = -1;
  assert.equal(cur.read(intent).dy, -1);
  intent.move.y = 0;
  intent.move.x = 1;
  cur.read(intent);
  intent.move.x = 0.3;
  assert.equal(cur.read(intent).dx, 0, 'a small stick tilt is no step');
  intent.interact = true;
  assert.equal(cur.read(intent).confirm, true);
  assert.equal(cur.read(intent).confirm, false);
  intent.interact = false;
  intent.answer = 3;
  assert.equal(cur.read(intent).pick, 3);
  intent.answer = 0;
  assert.equal(cur.read(intent).pick, 0);
}

// ---- layout ----
{
  const L = { top: 26, margin: 6, gap: 8 };
  const [solo] = layoutRects(1, 480, 270, L);
  assert.deepEqual(solo, { x: 6, y: 26, w: 468, h: 238 });
  const [a, b] = layoutRects(2, 480, 270, L);
  assert.equal(a.w, b.w);
  assert.ok(a.x + a.w + L.gap <= b.x + 1e-9, 'side by side without overlap');
  assert.equal(a.x, L.margin);
  assert.ok(Math.abs(b.x + b.w - (480 - L.margin)) < 1e-9, 'the second area ends at the right margin');
  assert.ok(a.w > 220, 'a half is wide enough for the question panel');
  for (const r of [a, b]) assert.ok(r.y >= L.top && r.y + r.h <= 270 - L.margin + 1e-9);
}

// ---- Grades.preview: the grade a result would get, without a ledger write ----
{
  const events = new EventEmitter();
  const state = new GameState(events, { ...json('data/state.json'), startMoneyCents: 0, kopfnoten: kopf });
  const grades = new Grades({ events, state, i18n: { lang: 'de' } }, { grading, kopfnoten: kopf, comments: json('data/teacher-comments.json'), parents: json('data/parent-reactions.json') }, { de, en });
  const recorded = [];
  events.on('grades:recorded', e => recorded.push(e));
  const p = grades.preview(0, 'mathe', { score: 0.95, effort: 0.5, difficulty: 3 });
  assert.equal(p.grade, 1);
  assert.equal(state.players[0].grades.entries.length, 0, 'preview writes nothing');
  assert.equal(recorded.length, 0);
  const g = grades.grade(0, 'mathe', { score: 0.95, effort: 0.5, lessonId: 'x' });
  assert.equal(g.grade, p.grade, 'grade() and preview() agree');
  assert.equal(state.players[0].grades.entries.length, 1);
}

console.log('check-minigames: ok');
