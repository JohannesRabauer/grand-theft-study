// Checks grading without Phaser (grading/gradeCore.js, grading/Grades.js, data/grading.json, data/kopfnoten.json,
// data/teacher-comments.json, data/parent-reactions.json): grade boundaries, gentle improvement/effort bonus, ledger
// averages, the promotion rule (table driven), Kopfnoten events and clamping, teacher comment determinism and coverage,
// i18n of every grading text, state migration. Run: node scripts/check-grades.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import {
  scoreToGrade, gradeDetail, emptyGrades, applyRecord, average, countOf, trend, evaluatePromotion, zeugnisGrades,
  moveKopfnote, kopfnotenSummary, eventMatches, reportFacts, selectTeacherComment, selectParentReaction
} from '../grading/gradeCore.js';
import { Grades } from '../grading/Grades.js';
import { GameState, createDefaultState, STATE_VERSION } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = json('data/grading.json');
const kopf = json('data/kopfnoten.json');
const comments = json('data/teacher-comments.json');
const parents = json('data/parent-reactions.json');
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const stateCfg = { ...json('data/state.json'), startMoneyCents: 0, kopfnoten: kopf };
const grade = (score, opts) => scoreToGrade(score, opts, cfg);

// ---- grade boundaries, including the edges (no bonus inputs) ----
{
  const table = [
    [1, 1], [0.92, 1], [0.9199, 2], [0.81, 2], [0.8099, 3], [0.67, 3], [0.6699, 4], [0.5, 4], [0.4999, 5], [0.3, 5], [0.2999, 5], [0.05, 5], [0.0499, 5]
  ];
  for (const [score, expected] of table) assert.equal(grade(score, { effort: 0.5 }), expected, `score ${score} -> ${expected}`);
  assert.equal(grade(0, { effort: 0 }), 6, 'a 6 only when basically nothing was done');
  assert.equal(grade(0.04, { effort: 0.1 }), 6);
  assert.equal(grade(0.04, { effort: 0.5 }), 5, 'trying at all means never a 6');
  assert.equal(grade(0, { effort: 0.25 }), 5, 'effort at the limit already protects from a 6');
  assert.equal(grade(0.2, { effort: 0 }), 5, 'a low score with some result is a 5, not a 6');
  assert.equal(grade(1.7), 1, 'scores clamp to 1');
  assert.equal(grade(-3), 6, 'scores clamp to 0');
  assert.equal(grade(NaN), 6, 'garbage counts as nothing done');
  assert.equal(grade(0.5), 4, 'options are optional');
  for (const g of cfg.thresholds.map(t => t.grade)) assert.ok(Number.isInteger(g) && g >= 1 && g <= 6);
}

// ---- gentle bonus: improvement and effort, never worse, never below 1, at most maxBonus ----
{
  assert.equal(grade(0.6, { improvement: 0.1 }), 3, 'improving by the minimum lifts one grade');
  assert.equal(grade(0.6, { improvement: 0.0999 }), 4, 'just below the improvement threshold: no bonus');
  assert.equal(grade(0.6, { effort: 0.8 }), 3, 'high effort lifts one grade');
  assert.equal(grade(0.6, { effort: 0.79 }), 4);
  assert.equal(grade(0.6, { effort: 1, improvement: 0.5 }), 3, 'both together still lift only maxBonus steps');
  assert.equal(grade(0.99, { effort: 1, improvement: 1 }), 1, 'never better than 1');
  assert.equal(grade(0.1, { effort: 0.9 }), 4, 'a weak score with full effort is a 4');
  assert.equal(grade(0, { effort: 0, improvement: 0.2 }), 5, 'improvement rescues a nothing-done 6 to a 5');
  assert.equal(grade(0.6, { improvement: -0.4, effort: 0.1 }), 4, 'a worse result than last time is not punished extra');
  assert.equal(grade(0.89, { difficulty: 3 }), 2);
  assert.equal(grade(0.89, { difficulty: 5 }), 1, 'harder questions lift a near miss');
  assert.equal(grade(0.89, { difficulty: 1 }), 2, 'easy questions do not lower the grade');
  // property: across the whole grid the bonus never makes a grade worse, never leaves 1..6, and is at most maxBonus
  for (let s = 0; s <= 100; s++) {
    for (const effort of [0, 0.3, 0.8, 1]) {
      for (const improvement of [-1, 0, 0.1, 0.5]) {
        for (const difficulty of [1, 3, 5]) {
          const d = gradeDetail(s / 100, { effort, improvement, difficulty }, cfg);
          assert.ok(d.grade >= 1 && d.grade <= 6 && Number.isInteger(d.grade));
          assert.ok(d.grade <= d.base, `bonus never worse (${s}% e${effort} i${improvement})`);
          assert.ok(d.base - d.grade <= cfg.maxBonus);
          if (d.bonus === 0) assert.equal(d.grade, d.base);
          if (d.grade === 6) assert.ok(s / 100 < cfg.sixBelow && effort < cfg.sixEffortBelow && improvement < cfg.improvementMin, 'a 6 needs basically nothing done');
        }
      }
    }
  }
  const ds = gradeDetail(0.6, { improvement: 0.2 }, cfg);
  assert.deepEqual([ds.base, ds.bonus, ds.why], [4, 1, 'improvement']);
  assert.equal(gradeDetail(0.6, { effort: 1 }, cfg).why, 'effort');
  assert.equal(gradeDetail(0.6, {}, cfg).why, null);
}

// ---- ledger: averages, counts, trend ----
{
  const ledger = emptyGrades();
  assert.deepEqual(average(ledger), { overall: null, bySubject: {} }, 'empty ledger has no average');
  assert.equal(countOf(ledger, 1), 0);
  assert.deepEqual(trend(ledger, 'mathe'), { n: 0, lastScore: null, prevScore: null, delta: null, improving: false });
  const add = (subject, score, g, day = 1) => applyRecord(ledger, { subject, score, grade: g, lessonId: 'l', day }, 300);
  add('mathe', 0.5, 4); add('mathe', 0.9, 2); add('mathe', 0.7, 3);
  add('deutsch', 0.3, 5);
  assert.deepEqual(average(ledger), { overall: 4, bySubject: { mathe: 3, deutsch: 5 } }, 'mean of subject means, one decimal');
  add('englisch', 0.95, 1); add('englisch', 0.8, 3);
  assert.equal(average(ledger).bySubject.englisch, 2);
  assert.equal(average(ledger).overall, 3.3, 'overall is the mean of subject averages (3, 5, 2), rounded to one decimal');
  add('deutsch', 0.45, 4);
  assert.equal(average(ledger).bySubject.deutsch, 4.5);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(g => countOf(ledger, g)), [1, 1, 2, 2, 1, 0]);
  assert.deepEqual(trend(ledger, 'mathe'), { n: 3, lastScore: 0.7, prevScore: 0.9, delta: -0.2, improving: false });
  assert.equal(trend(ledger, 'deutsch').improving, true);
  assert.equal(trend(ledger, 'sachkunde').n, 0, 'unknown subject');
  // entries are capped, tallies are not
  const capped = emptyGrades();
  for (let i = 0; i < 12; i++) applyRecord(capped, { subject: 'mathe', score: 0.5, grade: 4, lessonId: 'x', day: i + 1 }, 10);
  assert.equal(capped.entries.length, 10);
  assert.equal(capped.entries[0].day, 3, 'the oldest entries drop');
  assert.equal(capped.bySubject.mathe.n, 12);
  assert.deepEqual(zeugnisGrades(ledger), { mathe: 3, deutsch: 5, englisch: 2 }, 'Zeugnis grade is the rounded subject average (4.5 goes to the worse grade)');
}

// ---- promotion rule, table driven ----
{
  const cases = [
    // [name, grades, promoted, average, fives]
    ['all good', [1, 2, 2, 3, 2], true, 2, 0],
    ['average exactly 4.0', [4, 4, 4, 4, 4], true, 4, 0],
    ['average just above 4.0', [4, 4, 4, 4, 5], false, 4.2, 1],
    ['mixed average exactly 4.0', [3, 5, 4, 4, 4], true, 4, 1],
    ['exactly two 5s', [5, 5, 2, 3, 3], true, 3.6, 2],
    ['three 5s even with a fine average', [5, 5, 5, 1, 1], false, 3.4, 3],
    ['a 6 counts as a 5', [6, 5, 1, 1, 1], true, 2.8, 2],
    ['a 6 and two 5s are three bad grades', [6, 5, 5, 1, 1], false, 3.6, 3],
    ['one 6 alone', [6, 1, 1, 1, 1], true, 2, 1],
    ['rounded average counts (4.04 is 4.0)', [...Array(24).fill(4), 5], true, 4, 1],
    ['everything poor', [5, 5, 6, 6, 5], false, 5.4, 5],
    ['empty ledger', [], false, null, 0],
    ['one subject only', [3], true, 3, 0]
  ];
  cases.push(['bad average with two 5s', [3, 4, 4, 5, 5], false, 4.2, 2]);
  for (const [name, grades, promoted, avg, fives] of cases) {
    const r = evaluatePromotion(grades, null, cfg);
    assert.equal(r.promoted, promoted, `${name}: promoted`);
    assert.equal(r.average, avg, `${name}: average`);
    assert.equal(r.fives, fives, `${name}: fives`);
    assert.ok(r.reasons.length >= 1 && r.reasons.every(k => de[k] && en[k]), `${name}: reason keys exist in both languages`);
    if (promoted) assert.equal(r.comebackBonus, null, `${name}: no comeback bonus when promoted`);
    else if (grades.length) assert.deepEqual(r.comebackBonus, cfg.promotion.comebackBonus, `${name}: repeating gets the comeback bonus`);
  }
  const bad = evaluatePromotion([5, 5, 5, 1, 1], null, cfg);
  assert.deepEqual(bad.reasons, ['grades.reason.fives']);
  assert.deepEqual(evaluatePromotion([5, 5, 6, 6, 5], null, cfg).reasons, ['grades.reason.average', 'grades.reason.fives']);
  assert.deepEqual(evaluatePromotion([2, 2], null, cfg).reasons, ['grades.reason.promoted']);
  assert.deepEqual(evaluatePromotion([], null, cfg).reasons, ['grades.reason.noGrades']);
  assert.deepEqual(evaluatePromotion({ mathe: 2, deutsch: 3 }, null, cfg).average, 2.5, 'a { subject: grade } map works too');
  assert.equal(evaluatePromotion([2, 2], { verhalten: 1, mitarbeit: 1 }, cfg).promoted, true, 'conduct never blocks promotion');
  assert.equal(evaluatePromotion([2, 2], { verhalten: 4, mitarbeit: 3 }, cfg).conduct, 3.5);
  const mutated = evaluatePromotion([5, 5, 5, 5], null, cfg);
  mutated.comebackBonus.xp = 0;
  assert.equal(cfg.promotion.comebackBonus.xp, 150, 'the bonus is a copy of the data');
  const bonus = cfg.promotion.comebackBonus;
  assert.ok(bonus.xp > 0 && bonus.moneyCents > 0 && bonus.perk && de[`grades.perk.${bonus.perk}`] && en[`grades.perk.${bonus.perk}`]);
}

// ---- Kopfnoten: clamping, summary, event table ----
{
  assert.equal(moveKopfnote(3, 0.25, kopf), 3.25);
  assert.equal(moveKopfnote(3.9, 0.5, kopf), 4, 'clamped at the top');
  assert.equal(moveKopfnote(1.1, -0.5, kopf), 1, 'clamped at the bottom');
  assert.equal(moveKopfnote(2.1, 0.2, kopf), 2.3, 'no float noise');
  assert.deepEqual(kopfnotenSummary({ verhalten: 3.6, mitarbeit: 1.2, ordnung: 2.5, hilfsbereitschaft: 4 }, kopf), { values: { verhalten: 4, mitarbeit: 1, ordnung: 3, hilfsbereitschaft: 4 }, average: 3 });
  assert.deepEqual(kopfnotenSummary(undefined, kopf).values, { verhalten: 3, mitarbeit: 3, ordnung: 3, hilfsbereitschaft: 3 }, 'missing values read as the start value');
  for (const row of kopf.events) {
    assert.ok(kopf.categories.includes(row.category) && row.delta !== 0 && row.reason, `row ${row.event}`);
    assert.ok(de[`kopfnoten.${row.category}`] && en[`kopfnoten.${row.category}`]);
  }
  for (const c of kopf.categories) assert.ok(kopf.start >= kopf.min && kopf.start <= kopf.max && de[`kopfnoten.${c}`]);
  for (let i = 1; i <= 4; i++) assert.ok(de[`kopfnoten.level.${i}`] && en[`kopfnoten.level.${i}`]);
  const red = kopf.events.find(r => r.event === 'traffic:red-light');
  assert.equal(eventMatches(red, { adultsNearby: 2 }), true);
  assert.equal(eventMatches(red, { adultsNearby: 0 }), false);
  assert.equal(eventMatches(red, {}), false);
}

// ---- Grades with the real state store, events and save slots ----
const memoryStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const makeGrades = () => {
  const events = new EventEmitter();
  const state = new GameState(events, stateCfg);
  const ctx = { events, state, i18n: { lang: 'de' } };
  const grades = new Grades(ctx, { grading: cfg, kopfnoten: kopf, comments, parents }, { de, en });
  return { events, state, ctx, grades };
};
{
  const { events, state, grades } = makeGrades();
  const recorded = [];
  events.on('grades:recorded', e => recorded.push(e));
  assert.equal(state.data.v, STATE_VERSION);
  assert.deepEqual(state.players[0].grades, { entries: [], bySubject: {} });
  assert.deepEqual(state.players[0].kopfnoten, { verhalten: 3, mitarbeit: 3, ordnung: 3, hilfsbereitschaft: 3 });
  assert.equal(grades.average(0).overall, null);
  // improvement is read from the ledger: second maths result better by 0.2 gets the bonus
  const r1 = grades.grade(0, 'mathe', { score: 0.55, lessonId: 'a' });
  assert.deepEqual([r1.grade, r1.bonus], [4, 0]);
  const r2 = grades.grade(0, 'mathe', { score: 0.75, lessonId: 'b' });
  assert.deepEqual([r2.base, r2.grade, r2.why], [3, 2, 'improvement']);
  assert.equal(state.players[0].grades.entries.length, 2);
  assert.equal(state.players[0].grades.entries[1].day, state.shared.clock.day);
  assert.equal(recorded.length, 2);
  assert.equal(grades.average(0).bySubject.mathe, 3);
  assert.equal(grades.countOf(0, 2), 1);
  assert.equal(grades.trend('mathe').improving, true);
  assert.equal(grades.trend('mathe', 0).delta, 0.2);
  // bad payloads are rejected and leave the ledger alone
  const rejected = [];
  events.on('state:rejected', e => rejected.push(e.reason));
  assert.equal(grades.record(0, { subject: 'mathe', score: 2, grade: 3 }), false);
  assert.equal(grades.record(0, { subject: 'mathe', score: 0.5, grade: 7 }), false);
  assert.equal(grades.record(0, { subject: '', score: 0.5, grade: 3 }), false);
  assert.equal(grades.record(3, { subject: 'mathe', score: 0.5, grade: 3 }), false);
  assert.equal(grades.record(0, { subject: 'mathe', score: 0.5, grade: 2.5 }), false);
  assert.equal(rejected.length, 5);
  assert.equal(state.players[0].grades.entries.length, 2);
  assert.equal(recorded.length, 2, 'a rejected record emits nothing');
  assert.throws(() => { state.players[0].grades.entries.push(1); }, TypeError, 'the ledger is frozen: actions only');

  // Kopfnoten events, including ones that never fire yet and ones that don't match
  const k = () => state.players[0].kopfnoten;
  events.emit('traffic:red-light', { player: 0, adultsNearby: 0 });
  assert.equal(k().verhalten, 3, 'no adults nearby: no deduction');
  events.emit('traffic:red-light', { player: 0, adultsNearby: 2 });
  assert.equal(k().verhalten, 2.75);
  events.emit('homework:forgotten', {});
  assert.equal(k().ordnung, 2.7, 'payload without a player means player 0');
  events.emit('lesson:done', { player: 0, effort: 0.9 });
  assert.equal(k().mitarbeit, 3.15);
  events.emit('lesson:done', { player: 0, effort: 0.3 });
  assert.equal(k().mitarbeit, 3.15, 'little effort neither helps nor hurts');
  events.emit('lesson:done', { player: 0, effort: 0 });
  assert.equal(k().mitarbeit, 3.05);
  events.emit('npc:helped');
  events.emit('mission:done', { kind: 'chore' });
  assert.equal(k().hilfsbereitschaft, 3.25, 'only help missions count');
  events.emit('mission:done', { kind: 'help' });
  assert.equal(k().hilfsbereitschaft, 3.45);
  events.emit('traffic:red-light', { player: 5, adultsNearby: 3 }); // unknown player: ignored
  events.emit('traffic:red-light', undefined);
  for (let i = 0; i < 40; i++) events.emit('npc:helped', { player: 0 });
  assert.equal(k().hilfsbereitschaft, 4, 'clamped at 4');
  for (let i = 0; i < 40; i++) events.emit('homework:forgotten', { player: 0 });
  assert.equal(k().ordnung, 1, 'clamped at 1');
  assert.equal(grades.kopfnotenAdd(0, 'nope', 0.1, 'x'), false);
  assert.equal(grades.kopfnotenAdd(0, 'ordnung', 0, 'x'), false);
  assert.equal(grades.kopfnotenAdd(0, 'ordnung', NaN, 'x'), false);
  assert.equal(grades.kopfnotenAdd(0, 'ordnung', 0.5, ''), false);
  assert.equal(grades.kopfnotenSummary(0).values.ordnung, 1);
  assert.equal(grades.kopfnotenSummary(0).values.hilfsbereitschaft, 4);

  // report card and persistence
  for (const [s, sc] of [['deutsch', 0.95], ['englisch', 0.85], ['sachkunde', 0.7], ['science', 0.9]]) grades.grade(0, s, { score: sc, lessonId: s });
  const card = grades.reportCard(0, 'de');
  assert.equal(card.promotion.promoted, true);
  assert.ok(typeof card.teacherComment === 'string' && card.teacherComment.length > 10 && typeof card.parentLine === 'string');
  assert.equal(grades.reportCard(0, 'en').teacherComment === card.teacherComment, false, 'language switches the text');
  const storage = memoryStorage();
  const saves = new SaveSlots(state, events, storage);
  assert.equal(saves.save(1), true);
  const other = makeGrades();
  const loader = new SaveSlots(other.state, other.events, storage);
  assert.equal(loader.load(1), true);
  assert.deepEqual(other.grades.average(0), grades.average(0));
  assert.deepEqual(other.state.players[0].kopfnoten, state.players[0].kopfnoten);
  assert.deepEqual(other.grades.reportCard(0, 'de'), card);
}

// ---- migration of saves from before the ledger (v2) ----
{
  const old = { v: 2, shared: createDefaultState(stateCfg).shared, players: [{ character: null, attributes: {}, xp: 0, level: 1, grades: {}, learning: {}, karate: { belt: 'white' }, cosmetics: { owned: [], equipped: {} }, stickers: [], bag: [] }] };
  const m = migrate(old, stateCfg, 3);
  assert.equal(m.v, 3);
  assert.deepEqual(m.players[0].grades, { entries: [], bySubject: {} });
  assert.deepEqual(m.players[0].kopfnoten, { verhalten: 3, mitarbeit: 3, ordnung: 3, hilfsbereitschaft: 3 });
  const kept = migrate({ ...old, players: [{ ...old.players[0], grades: { entries: [{ subject: 'mathe', score: 1, grade: 1, lessonId: 'a', day: 1 }], bySubject: {} } }] }, stateCfg, 3);
  assert.equal(kept.players[0].grades.entries.length, 1, 'an existing ledger is kept');
  const stored = JSON.parse(JSON.stringify(createDefaultState(stateCfg)));
  assert.deepEqual(migrate(stored, stateCfg, STATE_VERSION), stored, 'a current save is untouched');
}

// ---- teacher comments and parent lines: data, determinism, coverage ----
{
  assert.ok(comments.comments.length >= 36 && comments.comments.length <= 44, 'about 40 comments');
  const keys = comments.comments.map(c => c.key);
  assert.equal(new Set(keys).size, keys.length, 'comment keys are unique');
  for (const c of comments.comments) {
    assert.ok(de[c.key] && en[c.key], `${c.key} exists in both languages`);
    assert.notEqual(de[c.key], en[c.key], `${c.key} is really translated`);
    assert.ok(Array.isArray(c.needs));
    for (const n of c.needs) assert.match(n, /^(strong:|weak:)(mathe|deutsch|englisch|sachkunde|science)$|^(improving|conduct:high|conduct:low|band:top|band:mid|band:low)$/, `${c.key} need ${n}`);
    assert.ok(de[c.key].length <= 170 && en[c.key].length <= 170, `${c.key} fits the Zeugnis`);
  }
  assert.ok(comments.comments.some(c => c.needs.length === 0), 'there are fallback comments');
  for (const s of cfg.subjects) {
    assert.ok(de[`grades.subject.${s}`] && en[`grades.subject.${s}`]);
    assert.ok(comments.comments.some(c => c.needs.includes(`strong:${s}`)) && comments.comments.some(c => c.needs.includes(`weak:${s}`)), `${s} has strong and weak comments`);
  }
  for (const need of ['improving', 'conduct:high', 'conduct:low', 'band:top', 'band:mid', 'band:low']) assert.ok(comments.comments.some(c => c.needs.includes(need)), `${need} has comments`);
  assert.ok(parents.promoted.length >= 12 && parents.repeat.length >= 12);
  for (const k of [...parents.promoted, ...parents.repeat]) assert.ok(de[k] && en[k], `${k} in both languages`);

  const ledgerOf = rows => { const l = emptyGrades(); rows.forEach(([s, sc, g], i) => applyRecord(l, { subject: s, score: sc, grade: g, lessonId: 'l', day: i + 1 }, 300)); return l; };
  const k = (v, o, h, m) => ({ verhalten: v, mitarbeit: m, ordnung: o, hilfsbereitschaft: h });
  const star = ledgerOf([['mathe', 0.95, 1], ['mathe', 0.97, 1], ['deutsch', 0.7, 3], ['deutsch', 0.8, 3], ['englisch', 0.9, 2]]);
  const weak = ledgerOf([['mathe', 0.3, 5], ['deutsch', 0.35, 5], ['englisch', 0.5, 4], ['sachkunde', 0.4, 5]]);
  const good = k(4, 4, 4, 4), poor = k(1, 1, 2, 2);
  for (const [name, ledger, kop, expected] of [
    ['top and kind', star, good, 'teacher.comment.12'],
    ['weak all round', weak, poor, null]
  ]) {
    const key = selectTeacherComment(ledger, kop, comments, kopf);
    assert.ok(de[key], `${name}: a real key`);
    if (expected) assert.equal(key, expected, name);
  }
  // determinism: the same report card always gets the same comment
  for (let i = 0; i < 20; i++) assert.equal(selectTeacherComment(star, good, comments, kopf), selectTeacherComment(JSON.parse(JSON.stringify(star)), { ...good }, comments, kopf));
  // specificity: facts of the report card steer the pick
  const f = reportFacts(star, good, comments, kopf);
  assert.ok(f.has('band:top') && f.has('strong:mathe') && f.has('weak:deutsch') === false && f.has('conduct:high') && f.has('improving'), [...f].join());
  const fw = reportFacts(weak, poor, comments, kopf);
  assert.ok(fw.has('band:low') && fw.has('conduct:low') && [...fw].some(x => x.startsWith('weak:')), [...fw].join());
  const mixed = ledgerOf([['mathe', 0.3, 5], ['deutsch', 0.9, 2], ['englisch', 0.9, 2]]);
  const pick = comments.comments.find(c => c.key === selectTeacherComment(mixed, null, comments, kopf));
  assert.ok(pick.needs.length >= 1 && pick.needs.every(n => reportFacts(mixed, null, comments, kopf).has(n)), 'a specific comment beats the fallbacks');
  assert.equal(selectTeacherComment(emptyGrades(), null, comments, kopf).startsWith('teacher.comment.'), true, 'an empty report card still gets a fallback');
  // coverage: random report cards reach at least 90% of the comments, and every pick is valid and fits its facts
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const rows = [];
    const base = rnd();
    for (const s of cfg.subjects) for (let n = 0, count = 1 + Math.floor(rnd() * 3); n < count; n++) {
      const sc = Math.min(1, Math.max(0, base * 0.5 + rnd() * 0.5 + (s === cfg.subjects[i % 5] ? 0.3 : 0) - (s === cfg.subjects[(i + 2) % 5] ? 0.3 : 0)));
      rows.push([s, sc, scoreToGrade(sc, { effort: 0.5 }, cfg)]);
    }
    const ledger = ledgerOf(rows);
    const kop = k(1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 4));
    const key = selectTeacherComment(ledger, kop, comments, kopf);
    const facts = reportFacts(ledger, kop, comments, kopf);
    assert.ok(comments.comments.find(c => c.key === key).needs.every(n => facts.has(n)));
    seen.add(key);
  }
  assert.ok(seen.size >= Math.floor(comments.comments.length * 0.7), `random report cards reach most comments (${seen.size}/${comments.comments.length})`);
  // parent lines
  assert.ok(parents.promoted.includes(selectParentReaction(true, star, parents)));
  assert.ok(parents.repeat.includes(selectParentReaction(false, star, parents)));
  assert.equal(selectParentReaction(true, star, parents), selectParentReaction(true, star, parents));
  const seenParent = new Set();
  for (let i = 0; i < 60; i++) seenParent.add(selectParentReaction(false, ledgerOf(Array.from({ length: 1 + (i % 9) }, (_, n) => ['mathe', 0.5, 1 + ((i * 3 + n) % 6)])), parents));
  assert.ok(seenParent.size >= 4, 'parent lines vary between report cards');
}

console.log('check-grades: ok');
