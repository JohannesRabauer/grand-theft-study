// Pure grading logic (AD-20): the ONLY code that maps a score to a German grade 1-6. No Phaser, no state store;
// every function takes its tuning (data/grading.json, data/kopfnoten.json, data/teacher-comments.json) as an argument.
// Grades are integers 1-6 (1 best). A ledger is state.players[i].grades = { entries: [...], bySubject: { id: tally } }.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;

export const emptyGrades = () => ({ entries: [], bySubject: {} });

// ---- score -> grade ----

// { grade, base, bonus, why } for a score 0-1. effort 0-1 (share of questions tried, hints count as trying),
// improvement = score gain over the previous result in the subject, difficulty 1-5 (3 is neutral).
export function gradeDetail(score, { effort = 0, improvement = 0, difficulty = 3 } = {}, cfg) {
  const s = clamp(num(score), 0, 1);
  const e = clamp(num(effort), 0, 1);
  const adjusted = clamp(s + Math.max(0, num(difficulty, 3) - 3) * cfg.difficultyBoost, 0, 1);
  const hit = cfg.thresholds.find(t => adjusted >= t.min);
  // below the last threshold: still a 5, and a 6 only when basically nothing was done
  const five = cfg.thresholds[cfg.thresholds.length - 1].grade;
  const base = hit ? hit.grade : (s < cfg.sixBelow && e < cfg.sixEffortBelow ? five + 1 : five);
  const byImprovement = num(improvement) >= cfg.improvementMin;
  const byEffort = e >= cfg.effortMin;
  const bonus = Math.min(cfg.maxBonus, (byImprovement ? 1 : 0) + (byEffort ? 1 : 0));
  return { grade: Math.max(1, base - bonus), base, bonus, why: bonus === 0 ? null : byImprovement ? 'improvement' : 'effort' };
}

export const scoreToGrade = (score, opts, cfg) => gradeDetail(score, opts, cfg).grade;

// ---- ledger (all read the player's `grades` object) ----

// The grades.record action body, applied to a mutable draft ledger. Entries are capped; the tallies keep everything.
export function applyRecord(ledger, entry, maxEntries) {
  ledger.entries.push(entry);
  if (ledger.entries.length > maxEntries) ledger.entries.splice(0, ledger.entries.length - maxEntries);
  const t = (ledger.bySubject[entry.subject] ??= { n: 0, sum: 0, counts: [0, 0, 0, 0, 0, 0], lastScore: null, prevScore: null });
  t.n++;
  t.sum += entry.grade;
  t.counts[entry.grade - 1]++;
  t.prevScore = t.lastScore;
  t.lastScore = entry.score;
}

export const validEntry = e => !!e && typeof e.subject === 'string' && e.subject !== ''
  && Number.isFinite(e.score) && e.score >= 0 && e.score <= 1
  && Number.isInteger(e.grade) && e.grade >= 1 && e.grade <= 6
  && Number.isInteger(e.day) && e.day >= 1 && typeof e.lessonId === 'string';

// Per-subject averages (one decimal) and the overall mean of the subject averages (each subject counts the same).
export function average(ledger) {
  const bySubject = {};
  const raw = [];
  for (const [s, t] of Object.entries(ledger?.bySubject ?? {})) {
    if (t.n <= 0) continue;
    bySubject[s] = round1(t.sum / t.n);
    raw.push(t.sum / t.n);
  }
  return { overall: raw.length ? round1(mean(raw)) : null, bySubject };
}

export const countOf = (ledger, grade) => Object.values(ledger?.bySubject ?? {}).reduce((n, t) => n + (t.counts[grade - 1] ?? 0), 0);

// Improvement info for one subject: the last two scores and their difference (null while there is no history).
export function trend(ledger, subject) {
  const t = ledger?.bySubject?.[subject];
  if (!t) return { n: 0, lastScore: null, prevScore: null, delta: null, improving: false };
  const delta = t.prevScore === null ? null : round2(t.lastScore - t.prevScore);
  return { n: t.n, lastScore: t.lastScore, prevScore: t.prevScore, delta, improving: delta !== null && delta > 0 };
}

// The improvement a new score would show against the subject's last result (0 for the first result).
export function improvementFor(ledger, subject, score) {
  const last = ledger?.bySubject?.[subject]?.lastScore;
  return last === null || last === undefined ? 0 : round2(score - last);
}

// Zeugnis grade per subject: the rounded subject average (x.5 rounds to the worse grade, like at school).
export function zeugnisGrades(ledger) {
  return Object.fromEntries(Object.entries(ledger?.bySubject ?? {}).filter(([, t]) => t.n > 0).map(([s, t]) => [s, Math.round(t.sum / t.n)]));
}

// ---- promotion ----

// grades: Zeugnis grades, an array or a { subject: grade } map. Promoted when the one-decimal average is at most
// maxAverage and at most maxFives grades are 5 or worse (a 6 counts as a 5, never as two). The kopfnoten (optional) are
// reported as `conduct` for the Zeugnis but never decide. An empty ledger is not promoted yet (reason noGrades).
// Reason keys are i18n keys (encouraging in both languages); a repeated year gets the comebackBonus.
export function evaluatePromotion(grades, kopfnoten, cfg) {
  const list = (Array.isArray(grades) ? grades : Object.values(grades ?? {})).filter(Number.isFinite);
  const rule = cfg.promotion;
  const conduct = kopfnoten && Object.keys(kopfnoten).length ? round1(mean(Object.values(kopfnoten))) : null;
  if (!list.length) return { promoted: false, average: null, fives: 0, conduct, reasons: ['grades.reason.noGrades'], comebackBonus: null };
  const average = round1(mean(list));
  const fives = list.filter(g => g >= 5).length;
  const reasons = [];
  if (average > rule.maxAverage) reasons.push('grades.reason.average');
  if (fives > rule.maxFives) reasons.push('grades.reason.fives');
  const promoted = reasons.length === 0;
  return { promoted, average, fives, conduct, reasons: promoted ? ['grades.reason.promoted'] : reasons, comebackBonus: promoted ? null : { ...rule.comebackBonus } };
}

// ---- Kopfnoten (conduct, values min..max, max is best) ----

export const defaultKopfnoten = cfg => Object.fromEntries(cfg.categories.map(c => [c, cfg.start]));

export const moveKopfnote = (value, delta, cfg) => round2(clamp(value + delta, cfg.min, cfg.max));

// Whether a kopfnoten event row applies to an event payload: exact `filter` fields and per-field `min` values.
export function eventMatches(row, payload) {
  if (row.filter) for (const k in row.filter) if (payload[k] !== row.filter[k]) return false;
  if (row.min) for (const k in row.min) if (!(num(payload[k]) >= row.min[k])) return false;
  return true;
}

// { values: { category: 1-4 rounded }, average } of one kid's kopfnoten.
export function kopfnotenSummary(kopfnoten, cfg) {
  const values = {};
  for (const c of cfg.categories) values[c] = Math.round(clamp(num(kopfnoten?.[c], cfg.start), cfg.min, cfg.max));
  return { values, average: round1(mean(Object.values(values))) };
}

// ---- teacher comment and parent reaction ----

// Facts about a report card that comments ask for: strong:<subject>, weak:<subject>, improving, conduct:high|low,
// band:top|mid|low. A comment is chosen among those whose `needs` all hold, the most specific first.
export function reportFacts(ledger, kopfnoten, table, kopfCfg) {
  const facts = new Set();
  const { overall, bySubject } = average(ledger);
  const avgs = Object.entries(bySubject);
  const f = table.facts;
  if (overall !== null) facts.add(overall <= f.topMax ? 'band:top' : overall <= f.midMax ? 'band:mid' : 'band:low');
  if (avgs.length > 1) {
    avgs.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const best = avgs[0];
    const worst = avgs[avgs.length - 1];
    if (best[1] <= f.strongMax && best[1] < worst[1]) facts.add(`strong:${best[0]}`);
    if (worst[1] >= f.weakMin && worst[1] > best[1]) facts.add(`weak:${worst[0]}`);
  }
  const deltas = Object.keys(ledger?.bySubject ?? {}).map(s => trend(ledger, s).delta).filter(d => d !== null);
  if (deltas.length && mean(deltas) >= f.improvingMin) facts.add('improving');
  if (kopfnoten) {
    const k = kopfnotenSummary(kopfnoten, kopfCfg).average;
    if (k >= f.conductHigh) facts.add('conduct:high');
    else if (k <= f.conductLow) facts.add('conduct:low');
  }
  return facts;
}

// A cheap stable number from the ledger, so the same report card always gets the same pick.
const seedOf = ledger => {
  let h = 17;
  for (const e of ledger?.entries ?? []) h = (h * 31 + e.grade * 7 + e.day) % 1000003;
  return h;
};

// The i18n key of the teacher comment for this report card (deterministic).
export function selectTeacherComment(ledger, kopfnoten, table, kopfCfg) {
  const facts = reportFacts(ledger, kopfnoten, table, kopfCfg);
  const fit = table.comments.filter(c => c.needs.every(n => facts.has(n)));
  const top = Math.max(...fit.map(c => c.needs.length));
  const best = fit.filter(c => c.needs.length === top);
  return best[seedOf(ledger) % best.length].key;
}

// The i18n key of a parent line, promoted or repeat, picked from the ledger seed.
export function selectParentReaction(promoted, ledger, table) {
  const keys = promoted ? table.promoted : table.repeat;
  return keys[seedOf(ledger) % keys.length];
}
