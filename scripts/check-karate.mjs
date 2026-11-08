// Checks the dojo and belt training (story 6.4, AD-24) without Phaser: the belt table of data/karate.json, the kata of data/kata.json
// and the training logic of minigames/karateCore.js (schedules, gentle windows, combo, Fokus, kata accuracy, input mapping), the belt
// rules of defense/beltCore.js (points, exam thresholds, one promotion a day, the daily session limit), the state actions and the
// v3 -> v4 migration, the ctx.karate service with its events (Ordnung grows through the growth hook) and the dojo maps.
// Run: node scripts/check-karate.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState, STATE_VERSION, createDefaultState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';
import { AttrGrowth } from '../characters/AttrGrowth.js';
import { beltStats, kiaiReach, parryRefund } from '../defense/defenseCore.js';
import { beltProgress, evaluateSession, nextBelt, sessionPoints, sessionsLeft, sessionsToday } from '../defense/beltCore.js';
import { Karate } from '../defense/Karate.js';
import { KarateSession, buildSession, defendLane, kataProblems, kataSet, lanesFromNav, laneOf, nextCall, parseKata, setWindows } from '../minigames/karateCore.js';
import { validateWorld } from '../services/worldLogic.js';

const text = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const load = f => JSON.parse(text(f));
const cfg = load('data/karate.json');
const kata = load('data/kata.json');
const def = load('data/minigames.json').minigames.find(m => m.id === 'karate');
const de = load('i18n/de.json');
const en = load('i18n/en.json');
const stateData = load('data/state.json');
const stateCfg = { ...stateData, karateBelts: cfg.belts.map(b => b.id) };
const growth = load('data/attr-growth.json');
const NOTE_POOL = Number(/NOTE_POOL = (\d+)/.exec(text('minigames/ui/KarateStage.js'))[1]);
const BELTS = ['white', 'yellow', 'orange', 'green', 'blue'];

// ---- the belt table
assert.deepEqual(cfg.belts.map(b => b.id), BELTS, 'five belts for Klasse 3, in order');
assert.equal(cfg.defaultBelt, 'white');
assert.equal(stateData.startBelt, 'white');
cfg.belts.forEach((b, i) => {
  assert.match(b.color, /^#[0-9a-f]{6}$/, `${b.id}: colour`);
  for (const k of ['kiaiRadius', 'kiaiCooldown', 'blockWindow', 'dodgeDistance', 'dodgeCooldown', 'stumbleDuration', 'aergerReduction']) assert.ok(b[k] > 0, `${b.id}.${k}`);
  assert.ok(b.parryMut >= 0 && b.auraStumble >= 0, `${b.id}: parryMut and auraStumble`);
  assert.ok(de[b.unlock] && en[b.unlock], `${b.id}: unlock text ${b.unlock}`);
  assert.ok(de[`karate.belt.${b.id}`] && en[`karate.belt.${b.id}`] && de[`karate.kata.${b.id}`] && en[`karate.kata.${b.id}`], `${b.id}: names`);
  if (i === 0) { assert.equal(b.trainingPoints, 0); return; }
  const p = cfg.belts[i - 1];
  assert.ok(b.trainingPoints > p.trainingPoints, `${b.id}: needs more points than ${p.id}`);
  assert.ok(b.examThreshold > 0 && b.examThreshold < 1 && b.examThreshold >= p.examThreshold, `${b.id}: exam threshold rises, stays fair`);
  assert.ok(b.kiaiRadius >= p.kiaiRadius && b.kiaiCooldown <= p.kiaiCooldown && b.blockWindow >= p.blockWindow && b.dodgeDistance >= p.dodgeDistance && b.dodgeCooldown <= p.dodgeCooldown, `${b.id}: never weaker than ${p.id}`);
  assert.ok(b.stumbleDuration + b.auraStumble >= p.stumbleDuration + p.auraStumble && b.aergerReduction >= p.aergerReduction && b.parryMut >= p.parryMut, `${b.id}: bullies never recover sooner`);
  assert.ok(b.examThreshold < 0.9, `${b.id}: the exam is gentle`);
  assert.ok(de[`karate.belt.${b.id}.line`] && en[`karate.belt.${b.id}.line`], `${b.id}: promotion line`);
});
const by = Object.fromEntries(cfg.belts.map(b => [b.id, b]));
assert.ok(by.yellow.dodgeDistance > by.white.dodgeDistance, 'yellow: a longer dodge roll');
assert.ok(by.orange.kiaiRadius > by.yellow.kiaiRadius, 'orange: a wider Kiai');
assert.ok(by.green.parryMut > 0 && by.orange.parryMut === 0, 'green: perfect parries give Mut back');
assert.ok(by.blue.auraStumble > 0 && by.green.auraStumble === 0, 'blue: the calming aura keeps bullies stumbling longer');
assert.ok(de['karate.belt.yellow.line'].includes('Banane') && de['karate.belt.yellow.line'].startsWith('Neuer Gürtel! Du bist jetzt gelb'), 'the yellow belt line');
assert.equal(beltStats(cfg, 'blue'), by.blue);
assert.equal(nextBelt(cfg, 'white').id, 'yellow');
assert.equal(nextBelt(cfg, 'blue'), null);
assert.ok(cfg.training.maxSessionsPerDay >= 2 && cfg.training.maxSessionsPerDay <= 4, 'a few sessions a day, not grindable');
assert.ok(cfg.training.pointsBase + cfg.training.pointsMax + cfg.training.fokusPoints >= by.yellow.trainingPoints, 'one good session opens the first exam');
assert.ok(cfg.training.pointsBase + cfg.training.pointsMax * 0.4 < by.yellow.trainingPoints, 'a poor session alone does not');
assert.ok(cfg.celebrate.confetti > 0 && cfg.celebrate.stagger > 2.5, 'the cheers of two kids do not replace each other');
assert.ok(de['karate.belt.yellow.line'] && de['dojo.sensei.greet.1'] === 'Ein echter Kämpfer ist der, der gar nicht kämpfen muss.');
assert.ok(cfg.sensei.lines >= 5 && cfg.sensei.interactReach >= cfg.sensei.radius + 10);
for (let i = 1; i <= cfg.sensei.lines; i++) assert.ok(de[`dojo.sensei.greet.${i}`] && en[`dojo.sensei.greet.${i}`], `greeting ${i}`);
for (const k of ['dojo.sensei.start', 'dojo.sensei.after.1', 'dojo.sensei.after.2', 'dojo.sensei.after.3', 'dojo.sensei.closed.1', 'dojo.sensei.closed.2', 'dojo.signboard', 'dojo.sign', 'dojo.hint', 'world.door.dojo', 'pause.belts']) assert.ok(de[k] && en[k], k);
assert.equal(de['dojo.signboard'], 'Dojo Kleiner Drache');

// ---- the minigame registry entry and its texts
assert.equal(def.subject, 'karate');
assert.equal(def.scene, 'MG_karate');
assert.ok(def.durationSeconds >= 55 && def.durationSeconds <= 65, 'about a minute');
assert.equal(def.maxPlayers, 2);
assert.equal(def.learning, false);
assert.deepEqual(def.topics, []);
assert.ok(!def.debug && def.rewards.xp > 0 && def.rewards.moneyCents > 0 && def.rewards.moneyCents <= 60, 'small rewards');
assert.match(text('minigames/index.js'), /'karate': KarateGame/, 'the scene class is registered');
for (const k of ['title', 'help', 'perfect', 'good', 'miss', 'combo', 'points', 'fokus']) assert.ok(de[`minigame.karate.${k}`] && en[`minigame.karate.${k}`], `minigame.karate.${k}`);
for (const k of ['stage.1', 'stage.2', 'stage.3', ...kata.lanes.map(l => `move.${l}`), ...['promoted', 'exam-failed', 'need-points', 'exam-done', 'top', 'points'].map(r => `exam.${r}`)]) assert.ok(de[`karate.${k}`] && en[`karate.${k}`], `karate.${k}`);
assert.ok(de['karate.exam.promoted'].includes('{belt}') && en['karate.exam.promoted'].includes('{belt}') && de['karate.exam.points'].includes('{n}'));
for (const k of ['unlock', 'belt']) assert.ok(cfg.belts.every(b => de[`karate.${k}.${b.id}`]), `karate.${k}.<belt>`);

// ---- the kata
assert.deepEqual(kata.lanes, ['dodgeLeft', 'blockHigh', 'kiai', 'blockLow', 'dodgeRight']);
assert.deepEqual(Object.keys(kata.belts), BELTS, 'a kata set per belt');
assert.deepEqual(kataProblems(kata, BELTS, def.durationSeconds * 1000, NOTE_POOL), [], 'kata data problems');
assert.ok(kata.windows.perfectMs >= 80 && kata.windows.goodMs >= 180, 'gentle windows');
for (const b of BELTS) {
  const s = buildSession(kata, b);
  assert.ok(s.n >= def.expectedQuestions, `${b}: at least expectedQuestions notes, so a perfect round scores 1`);
  assert.deepEqual(s, buildSession(kata, b), `${b}: deterministic`);
  assert.deepEqual(s.t, [...s.t].sort((x, y) => x - y), `${b}: ordered`);
  assert.equal(s.stages.length, 3);
  assert.ok(s.stages[0].count < s.stages[2].count, `${b}: the exam is the longest kata`);
  assert.ok(s.stages[0].stepMs > s.stages[2].stepMs, `${b}: the exam is the fastest kata`);
  assert.ok(s.lane.every(l => l >= 0 && l < 5) && s.stage.length === s.n);
  assert.ok(s.t[0] >= kata.play.leadInMs && s.totalMs <= def.durationSeconds * 1000, `${b}: lead-in and the round fits`);
  assert.ok([0, 1, 2, 3, 4].every(l => s.lane.includes(l)) || b === 'white', `${b}: every move is called`);
}
assert.deepEqual(parseKata('H . D K L R', kata), [1, -1, 3, 2, 0, 4]);
assert.equal(kataSet(kata, 'nonsense'), kata.belts.white, 'an unknown belt trains like white');
for (let i = 1; i < BELTS.length; i++) assert.ok(buildSession(kata, BELTS[i]).stages[0].stepMs < buildSession(kata, BELTS[i - 1]).stages[0].stepMs, 'higher belts are faster');
for (let i = 1; i < BELTS.length; i++) assert.ok(kata.belts[BELTS[i]].windowScale <= kata.belts[BELTS[i - 1]].windowScale && kata.belts[BELTS[i]].windowScale >= 0.8, 'windows tighten a little, never below 80 %');

// ---- a session: perfect, late, partial, nothing
const play = (belt, { offset = 0, every = 1, skip = null } = {}) => {
  const s = new KarateSession(kata, belt);
  const { t, lane } = s.schedule;
  for (let i = 0; i < s.schedule.n; i++) {
    if (i % every === 0 && !(skip && skip(i))) s.press(lane[i], t[i] + offset);
    s.sweep(t[i] + s.win.good + 1);
  }
  s.sweep(1e9);
  return s;
};
{
  const s = play('white');
  const sum = s.summary();
  assert.ok(s.done && sum.score === 1 && sum.exam === 1 && sum.counts.miss === 0 && sum.counts.perfect === s.schedule.n, 'perfect play: everything perfect');
  assert.ok(sum.fokus > 0.7 && sum.bestCombo === s.schedule.n && sum.points > s.schedule.n * kata.scoring.perfect, 'a steady rhythm fills the Fokus; the combo multiplies the points');
  const late = play('white', { offset: 150 }).summary();
  assert.ok(late.counts.good === s.schedule.n && Math.abs(late.score - kata.scoring.goodWeight) < 1e-9 && late.fokus === 0, 'late but in the window: all good, weighted 0.75, no Fokus');
  const third = play('white', { every: 3 }).summary();
  assert.ok(third.score > 0.25 && third.score < 0.45 && third.exam < 0.6, 'every third note: a low score');
  const none = play('white', { every: 1e9, skip: () => true }).summary();
  assert.ok(none.score === 0 && none.counts.miss > 0 && none.points === 0 && none.fokus === 0, 'no press at all: all misses, nothing negative');
}
{ // too early or on an empty lane is ignored, a miss only breaks the combo
  const s = new KarateSession(kata, 'white');
  const { t, lane } = s.schedule;
  assert.equal(s.press(lane[0], t[0] - 1000).grade, null, 'far too early: ignored');
  assert.equal(s.press((lane[0] + 1) % 5, t[0]).grade, null, 'the wrong lane: ignored');
  assert.equal(s.press(lane[0], t[0] + 10).grade, 'perfect');
  s.press(lane[1], t[1]);
  assert.equal(s.scorer.combo, 2);
  s.sweep(t[2] + s.win.good + 1);
  assert.equal(s.scorer.combo, 0, 'a miss breaks the combo');
  assert.equal(s.track.counts.miss, 1);
  assert.ok(s.scorer.points > 0, 'and takes nothing away');
}
{ // Fokus: steady hits fill it, a miss drains a little, the full meter widens the windows
  const s = new KarateSession(kata, 'white');
  const base = s.win.perfect;
  assert.equal(base, kata.windows.perfectMs * kataSet(kata, 'white').windowScale);
  assert.equal(s.fokus.value, 0);
  let i = 0;
  while (!s.fokus.calm) { s.press(s.schedule.lane[i], s.schedule.t[i]); i++; }
  assert.ok(Math.abs(s.win.perfect - base * (1 + kata.fokus.widen)) < 1e-9 && s.win.good > kata.windows.goodMs, 'a calm kid gets wider windows');
  assert.ok(i <= Math.ceil(kata.fokus.full / kata.fokus.gain) + 1, 'it fills in a few hits');
  const v = s.fokus.value;
  s.sweep(s.schedule.t[i] + s.win.good + 1);
  assert.ok(s.fokus.value < v && s.fokus.value >= v - kata.fokus.missLoss - 1e-9, 'a miss only drains a little');
  assert.ok(!s.fokus.calm || s.win.perfect > base);
  const w = setWindows({}, kata, 'blue', { calm: false });
  assert.equal(w.perfect, kata.windows.perfectMs * kata.belts.blue.windowScale);
}
{ // input mapping
  const out = [];
  const nav = (o = {}) => ({ dx: 0, dy: 0, confirm: false, pick: 0, ...o });
  assert.deepEqual(lanesFromNav(nav({ dx: -1 }), kata, out) && out.slice(0, 1), [laneOf(kata, 'dodgeLeft')]);
  assert.equal(lanesFromNav(nav({ dx: 1 }), kata, out), 1);
  assert.equal(out[0], 4);
  lanesFromNav(nav({ dy: -1 }), kata, out);
  assert.equal(out[0], 1, 'up blocks high');
  lanesFromNav(nav({ dy: 1 }), kata, out);
  assert.equal(out[0], 3, 'down blocks low');
  lanesFromNav(nav({ confirm: true }), kata, out);
  assert.equal(out[0], 2, 'confirm is the Kiai');
  lanesFromNav(nav({ pick: 5 }), kata, out);
  assert.equal(out[0], 4, 'number keys are the lanes');
  assert.equal(lanesFromNav(nav(), kata, out), 0);
  assert.equal(lanesFromNav(nav({ pick: 6 }), kata, out), 0);
  // defend blocks whichever block is next
  const s = new KarateSession(kata, 'orange');
  const firstBlock = s.schedule.lane.findIndex(l => l === 1 || l === 3);
  assert.equal(defendLane(s, kata), s.schedule.lane[firstBlock], 'defend plays the next block lane');
  const call = nextCall(s);
  assert.equal(call, 0, 'the sensei calls the first note first');
  for (let i = 0; i < s.schedule.n; i++) s.press(s.schedule.lane[i], s.schedule.t[i]);
  assert.equal(nextCall(s), -1);
  assert.equal(defendLane(s, kata), 1, 'no block pending: defaults to block high');
}

// ---- belt rules
const K = (o = {}) => ({ belt: 'white', points: 0, sessions: 0, lastExamDay: 0, trainDay: 0, trainedToday: 0, ...o });
const t = cfg.training;
assert.equal(sessionPoints(t, { score: 1, fokus: 1 }), t.pointsBase + t.pointsMax + t.fokusPoints);
assert.equal(sessionPoints(t, { score: 0, fokus: 0 }), t.pointsBase, 'finishing always counts');
assert.equal(sessionPoints(t, { score: 5, fokus: -1 }), t.pointsBase + t.pointsMax, 'out of range values are clamped');
{
  const perfect = { score: 1, exam: 1, fokus: 1 };
  assert.deepEqual(evaluateSession(cfg, K(), 1, perfect), { points: 110, promote: 'yellow', reason: 'promoted' }, 'perfect play promotes white to yellow');
  const poor = evaluateSession(cfg, K(), 1, { score: 0.33, exam: 0.3, fokus: 0 });
  assert.equal(poor.promote, null);
  assert.ok(poor.points > t.pointsBase && poor.reason === 'need-points', 'poor play gives points, no promotion');
  assert.equal(evaluateSession(cfg, K({ points: 100 }), 1, { score: 0.33, exam: 0.3, fokus: 0 }).reason, 'exam-failed', 'enough points but a failed exam');
  assert.equal(evaluateSession(cfg, K({ points: 100 }), 1, { score: 0.7, exam: by.yellow.examThreshold, fokus: 0 }).promote, 'yellow', 'the threshold itself passes');
  assert.equal(evaluateSession(cfg, K({ points: 100 }), 1, { score: 0.7, exam: by.yellow.examThreshold - 0.01, fokus: 0 }).promote, null);
  assert.equal(evaluateSession(cfg, K({ points: 500, lastExamDay: 1 }), 1, perfect).reason, 'exam-done', 'one promotion a day');
  assert.equal(evaluateSession(cfg, K({ points: 500, lastExamDay: 1 }), 2, perfect).reason, 'promoted', 'the next day another');
  assert.equal(evaluateSession(cfg, K({ belt: 'blue', points: 900 }), 3, perfect).reason, 'top');
  assert.equal(evaluateSession(cfg, K({ belt: 'yellow', points: 0 }), 3, perfect).reason, 'need-points', 'orange needs its own points');
  assert.equal(beltProgress(cfg, K()), 0);
  assert.equal(beltProgress(cfg, K({ points: 30 })), 0.5);
  assert.equal(beltProgress(cfg, K({ belt: 'blue' })), 1);
  assert.equal(sessionsToday(K({ trainDay: 4, trainedToday: 2 }), 4), 2);
  assert.equal(sessionsToday(K({ trainDay: 4, trainedToday: 2 }), 5), 0, 'a new day starts from zero');
  assert.equal(sessionsLeft(cfg, K({ trainDay: 4, trainedToday: t.maxSessionsPerDay }), 4), 0, 'the dojo closes for the day');
  assert.equal(sessionsLeft(cfg, K({ trainDay: 4, trainedToday: 99 }), 4), 0);
}

// ---- state actions, migration, saves
{
  const events = new EventEmitter();
  const rejected = [];
  events.on('state:rejected', r => rejected.push(r.reason));
  const state = new GameState(events, stateCfg);
  assert.ok(STATE_VERSION >= 4, 'belt progress is included in the current save schema');
  assert.deepEqual(state.players[0].karate, { belt: 'white', points: 0, sessions: 0, lastExamDay: 0, trainDay: 0, trainedToday: 0 });
  assert.ok(state.dispatch('karate.addPoints', { player: 0, amount: 40, day: 2 }));
  assert.ok(state.dispatch('karate.addPoints', { player: 0, amount: 30, day: 2 }));
  assert.deepEqual([state.players[0].karate.points, state.players[0].karate.sessions, state.players[0].karate.trainDay, state.players[0].karate.trainedToday], [70, 2, 2, 2]);
  assert.ok(state.dispatch('karate.addPoints', { player: 0, amount: 5, day: 3 }));
  assert.equal(state.players[0].karate.trainedToday, 1, 'the day counter restarts on a new day');
  for (const bad of [{ player: 5, amount: 1, day: 1 }, { player: 0, amount: -1, day: 1 }, { player: 0, amount: 1.5, day: 1 }, { player: 0, amount: 1, day: 0 }]) assert.equal(state.dispatch('karate.addPoints', bad), false);
  assert.equal(state.dispatch('karate.promote', { player: 0, belt: 'orange', day: 3 }), false, 'belts cannot be skipped');
  assert.equal(state.dispatch('karate.promote', { player: 0, belt: 'white', day: 3 }), false);
  assert.ok(state.dispatch('karate.promote', { player: 0, belt: 'yellow', day: 3 }));
  assert.deepEqual([state.players[0].karate.belt, state.players[0].karate.lastExamDay], ['yellow', 3]);
  assert.equal(state.dispatch('karate.promote', { player: 0, belt: 'orange', day: 3 }), false, 'one belt a day');
  assert.ok(rejected.includes('not-next-belt') && rejected.includes('exam-done-today') && rejected.includes('bad-payload'));
  assert.equal(new GameState(new EventEmitter(), stateData).dispatch('karate.promote', { player: 0, belt: 'yellow', day: 1 }), false, 'without the belt order nothing is promoted');
  // saves keep belt and points; an old v3 save gains the fields
  const saves = new SaveSlots(state, events, (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })());
  assert.ok(saves.save(1));
  state.dispatch('karate.addPoints', { player: 0, amount: 99, day: 3 });
  assert.ok(saves.load(1));
  assert.deepEqual([state.players[0].karate.belt, state.players[0].karate.points], ['yellow', 75], 'the belt and its points come back from a save');
  const old = createDefaultState(stateCfg);
  old.v = 3;
  old.players[0].karate = { belt: 'green' };
  const m = migrate(JSON.parse(JSON.stringify(old)), stateCfg, STATE_VERSION);
  assert.deepEqual(m.players[0].karate, { belt: 'green', points: 0, sessions: 0, lastExamDay: 0, trainDay: 0, trainedToday: 0 }, 'v3 -> v4 keeps the belt');
  const cur = JSON.parse(JSON.stringify(createDefaultState(stateCfg)));
  assert.deepEqual(migrate(cur, stateCfg, STATE_VERSION), cur, 'a current save is untouched');
}

// ---- the ctx.karate service with events, the growth hook, the daily limit and the cheer
{
  const events = new EventEmitter();
  const state = new GameState(events, stateCfg);
  state.dispatch('coop.set', { on: true });
  new AttrGrowth(events, state, growth, stateCfg.attrMax);
  const toasts = [];
  const bursts = [];
  events.on('ui:toast', e => toasts.push(e.key));
  const log = [];
  for (const n of ['karate:trained', 'karate:belt', 'karate:celebrate']) events.on(n, e => log.push([n, e]));
  const day = { mode: 'freeplay', day: 1, cfg: { phases: [{ id: 'morning' }, { id: 'school' }] } };
  const ctx = { events, state, day, minigames: { active: null }, frozen: false, world: { pending: null }, players: [{ index: 0, x: 10, y: 20 }, { index: 1, x: 30, y: 40 }], particles: { emit: (n, x, y, o) => bursts.push([n, x, y, o.count]) } };
  const karate = new Karate(ctx, cfg);
  assert.equal(ctx.karate, karate);
  assert.deepEqual([karate.beltOf(0), karate.beltOf(ctx.players[1]), karate.trainingPoints(0), karate.canTrain(0), karate.sessionsLeft(0)], ['white', 'white', 0, true, t.maxSessionsPerDay]);
  assert.equal(karate.beltOf(7), 'white', 'an unknown player falls back to the default belt');
  assert.equal(karate.statsOf(0), by.white);
  const ordnung = state.players[0].attributes.ordnung;
  const other = state.players[1].attributes.ordnung;
  const perfect = { score: 1, exam: 1, fokus: 1, points: 1234 };
  const r = karate.submit(0, perfect);
  assert.deepEqual([r.promote, r.belt, r.points, r.left], ['yellow', 'yellow', 110, t.maxSessionsPerDay - 1], 'a perfect session promotes');
  assert.deepEqual(log.map(l => l[0]), ['karate:trained', 'karate:belt']);
  assert.deepEqual(log[0][1], { player: 0, score: 1, points: 110 });
  assert.deepEqual(log[1][1], { player: 0, belt: 'yellow' });
  assert.equal(state.players[0].attributes.ordnung, ordnung + 1, 'the Ordnung growth hook fires on the belt');
  assert.equal(state.players[1].attributes.ordnung, other, 'the other kid is untouched');
  assert.equal(karate.beltOf(1), 'white');
  assert.ok(!toasts.length, 'no cheer while nothing was shown yet');
  // the cheer waits for the minigame to close
  ctx.minigames.active = {};
  karate.update(0.1);
  assert.deepEqual(toasts, [], 'not while a minigame is open');
  ctx.minigames.active = null;
  ctx.frozen = true;
  karate.update(0.1);
  assert.deepEqual(toasts, [], 'not while the world is frozen');
  ctx.frozen = false;
  karate.update(0.1);
  assert.deepEqual(toasts, ['karate.belt.yellow.line'], 'the toast with the belt line');
  assert.deepEqual(bursts, [['confetti', 10, 10, cfg.celebrate.confetti]], 'a confetti burst over the kid');
  assert.equal(log.at(-1)[0], 'karate:celebrate');
  // two promotions: the second cheer comes later
  state.dispatch('karate.addPoints', { player: 1, amount: 100, day: 1 });
  karate.submit(1, perfect);
  karate.submit(0, { score: 0.1, exam: 0.1, fokus: 0 });
  assert.equal(karate.beltOf(1), 'yellow');
  assert.equal(karate.beltOf(0), 'yellow', 'poor play does not promote');
  karate.update(0.1);
  assert.equal(toasts.length, 1, 'the second cheer waits for the first toast to be seen');
  karate.update(cfg.celebrate.stagger);
  assert.equal(toasts.length, 2);
  // the daily limit, then the next day through the freeplay counter
  assert.equal(karate.sessionsLeft(0), t.maxSessionsPerDay - 2);
  karate.submit(0, { score: 0.5, exam: 0.5, fokus: 0 });
  assert.equal(karate.canTrain(0), false, 'no session left: the dojo is closed for today');
  assert.equal(karate.canTrain(1), true, 'the other kid counts on their own');
  events.emit('phase:started', { phase: 'school', reason: 'time', day: 1 });
  assert.equal(karate.canTrain(0), false, 'a phase that is not a morning is not a new day');
  events.emit('phase:started', { phase: 'morning', reason: 'freeplay', day: 1 });
  assert.equal(karate.canTrain(0), false, 'neither is the freeplay start');
  events.emit('phase:started', { phase: 'morning', reason: 'time', day: 2 });
  assert.equal(karate.canTrain(0), true, 'a new morning opens the dojo again');
  assert.equal(karate.sessionsLeft(0), t.maxSessionsPerDay);
  const r2 = karate.submit(0, { score: 1, exam: 1, fokus: 1 });
  assert.ok(['promoted', 'need-points'].includes(r2.reason), 'the exam is open again on a new day');
  // story mode follows the clock's day
  day.mode = 'story';
  day.day = 7;
  assert.equal(karate.sessionsLeft(0), t.maxSessionsPerDay, 'a story day the kid has not trained on');
  karate.submit(0, { score: 0.2, exam: 0.2, fokus: 0 });
  assert.equal(state.players[0].karate.trainDay, 7);
  assert.equal(karate.sessionsLeft(0), t.maxSessionsPerDay - 1);
  state.dispatch('karate.addPoints', { player: 0, amount: 0, day: 7 });
  assert.equal(karate.trainingPoints(0), state.players[0].karate.points);
  // the Phaser-free module has no Phaser in it
  for (const f of ['defense/Karate.js', 'defense/beltCore.js', 'minigames/karateCore.js']) assert.ok(!/new Phaser|Phaser\.(Scene|Math|Events|GameObjects)|^import .*\/(ui|scenes|entities)\//m.test(text(f)), `${f} stays Phaser-free`);
}

// ---- the maps: a dojo building and door in the town, an interior with sensei, mats and rack
{
  const index = load('data/maps/index.json');
  assert.ok(index.maps.some(m => m.id === 'dojo' && !m.debug), 'the dojo map is a normal map');
  const world = { maps: Object.fromEntries(index.maps.map(m => [m.id, { data: load(`data/maps/${m.file}`), debug: !!m.debug }])) };
  assert.deepEqual(validateWorld(world, { catalog: load('data/object-types.json'), surfaces: load('data/surfaces.json'), tiles: load('data/tiles.json'), i18n: new Set(Object.keys(de)) }), []);
  const town = world.maps.town.data;
  const dojo = world.maps.dojo.data;
  const of = (map, type, id) => map.objects.find(o => o.type === type && o.id === id);
  const door = of(town, 'door', 'door-dojo');
  assert.ok(door && door.to === 'dojo' && !door.debug, 'a town door to the dojo');
  const back = of(dojo, 'door', 'door-exit');
  assert.ok(back && back.to === 'town' && of(town, 'entry', back.entry), 'the dojo door leads back to a town entry');
  assert.ok(of(dojo, 'entry', door.entry), 'and the town door to a dojo entry');
  const building = town.objects.find(o => o.type === 'dojo' && o.role === 'building');
  assert.ok(building, 'the dojo building');
  const solid = (map, x, y) => map.legend[map.rows[y][x]] === 'wall';
  for (let y = building.y; y < building.y + building.h; y++) for (let x = building.x; x < building.x + building.w; x++) assert.ok(solid(town, x, y), `the building stands on wall tiles (${x},${y})`);
  assert.ok(!solid(town, door.x, door.y) && !solid(town, door.x + door.w - 1, door.y), 'the door tiles are walkable');
  assert.ok(door.x >= building.x && door.x + door.w <= building.x + building.w && door.y === building.y + building.h, 'the door is in front of the building');
  const sign = of(town, 'sign', 'dojo-sign');
  assert.ok(sign && de[sign.text] && Math.abs(sign.x - door.x) <= 3, 'a sign by the door');
  assert.deepEqual(['sensei', 'mats', 'rack'].map(r => dojo.objects.filter(o => o.type === 'dojo' && o.role === r).length), [1, 1, 1], 'sensei spot, mats and rack inside');
  assert.ok(dojo.indoor && dojo.legend['w'] === 'wood' && dojo.legend['m'] === 'tatami');
  const sensei = dojo.objects.find(o => o.role === 'sensei');
  assert.ok(!solid(dojo, sensei.x, sensei.y) && sensei.w === 1 && sensei.h === 1);
}
console.log('karate: belts, kata, training logic, belt rules, state, service and maps ok');

// ---- story 6.5: belt effects measurably grow with the belt
{
  const cfgK = load('data/karate.json');
  const rows = cfgK.belts;
  const up = ['kiaiRadius', 'blockWindow', 'dodgeDistance', 'stumbleDuration', 'aergerReduction', 'parryMut', 'auraStumble'];
  const down = ['kiaiCooldown', 'dodgeCooldown'];
  for (let i = 1; i < rows.length; i++) {
    for (const k of up) assert.ok(rows[i][k] >= rows[i - 1][k], `${rows[i].id}.${k} is not below ${rows[i - 1].id}`);
    for (const k of down) assert.ok(rows[i][k] <= rows[i - 1][k], `${rows[i].id}.${k} is not above ${rows[i - 1].id}`);
  }
  const first = rows[0];
  const last = rows.at(-1);
  assert.ok(last.kiaiRadius > first.kiaiRadius && last.blockWindow > first.blockWindow && last.dodgeDistance > first.dodgeDistance && last.kiaiCooldown < first.kiaiCooldown && last.dodgeCooldown < first.dodgeCooldown && last.stumbleDuration > first.stumbleDuration && last.parryMut > first.parryMut && last.auraStumble > first.auraStumble, 'the top belt beats the white belt in every effect');
  // reach: a bully at 80 px is outside the white Kiai and inside the blue one
  const out = { affected: [], gasp: [] };
  const bully = [{ x: 80, y: 0, active: true, state: 'CHASE', id: 1 }];
  assert.equal(kiaiReachCheck(first.kiaiRadius).affected.length, 0, 'the white Kiai does not reach 80 px');
  assert.equal(kiaiReachCheck(last.kiaiRadius).affected.length, 1, 'the blue Kiai does');
  function kiaiReachCheck(r) { return kiaiReach(0, 0, r, bully, [], out); }
  // parry refund: only belts with parryMut give Mut back, never above 1
  const slot = { mut: 0.5 };
  assert.equal(parryRefund(slot, first), 0.5, 'white: nothing back');
  assert.equal(parryRefund(slot, last), 0.5 + last.parryMut, 'blue: gives Mut back');
  slot.mut = 0.95;
  assert.equal(parryRefund(slot, last), 1, 'Mut is capped at 1');
  // the aura belongs to the top belts only and has sane numbers
  assert.ok(rows.filter(b => b.auraStumble > 0).length >= 1 && rows[0].auraStumble === 0, 'only the high belts have an aura');
  assert.ok(cfgK.aura.radius > 10 && cfgK.aura.radius < cfgK.belts[0].kiaiRadius && cfgK.aura.cooldown > 0, 'the aura is a small close-range effect');
  assert.ok(true, 'Ordnung grows on a promotion (attr-growth data, checked above)');
}
