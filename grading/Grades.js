// ctx.grades (AD-20): the grade ledger and the Kopfnoten conduct tracker bound to the state store. Every score-to-grade
// decision is made by gradeCore.js; this wrapper adds the day, the improvement history, the event table and the texts.
// The Zeugnis screen itself comes later (epic 8) and builds on reportCard().
import {
  gradeDetail, improvementFor, average, countOf, trend, zeugnisGrades, evaluatePromotion,
  kopfnotenSummary, eventMatches, selectTeacherComment, selectParentReaction
} from './gradeCore.js';

export class Grades {
  // cfgs: parsed data/grading.json, data/kopfnoten.json, data/teacher-comments.json, data/parent-reactions.json.
  // dicts: { de, en } i18n dictionaries, for text in a language other than the active one.
  constructor(ctx, { grading, kopfnoten, comments, parents }, dicts) {
    this.ctx = ctx;
    this.cfg = grading;
    this.kopfCfg = kopfnoten;
    this.comments = comments;
    this.parents = parents;
    this.dicts = dicts;
    for (const event of new Set(kopfnoten.events.map(r => r.event))) {
      const rows = kopfnoten.events.filter(r => r.event === event);
      ctx.events.on(event, payload => { for (const r of rows) this.#onEvent(r, payload ?? {}); });
    }
  }

  #ledger(player) { return this.ctx.state.players[player]?.grades; }

  // Grades a result and writes it to the ledger. score 0-1; effort 0-1 (share of questions tried, hints count);
  // difficulty 1-5. Returns { grade, base, bonus, why, score } or null when the ledger rejects it. Emits grades:recorded.
  grade(player, subject, { score, effort = 0, difficulty = 3, lessonId }) {
    const improvement = improvementFor(this.#ledger(player), subject, score);
    const detail = gradeDetail(score, { effort, improvement, difficulty }, this.cfg);
    return this.record(player, { subject, score, grade: detail.grade, lessonId }) ? { ...detail, score } : null;
  }

  // The raw ledger write (grades.record). Without a day the current game day is used.
  record(player, { subject, score, grade, lessonId = '', day = this.ctx.state.shared.clock.day }) {
    const ok = this.ctx.state.dispatch('grades.record', { player, subject, score, grade, lessonId, day });
    if (ok) this.ctx.events.emit('grades:recorded', { player, subject, score, grade, lessonId, day });
    return ok;
  }

  // { overall, bySubject } averages with one decimal; overall is null until something is graded.
  average(player = 0) { return average(this.#ledger(player)); }

  countOf(player, grade) { return countOf(this.#ledger(player), grade); }

  trend(subject, player = 0) { return trend(this.#ledger(player), subject); }

  // The Zeugnis grade of each graded subject (rounded subject average).
  zeugnis(player = 0) { return zeugnisGrades(this.#ledger(player)); }

  promotion(player = 0) {
    return evaluatePromotion(this.zeugnis(player), this.kopfnotenSummary(player).values, this.cfg);
  }

  kopfnotenAdd(player, category, delta, reason) {
    return this.ctx.state.dispatch('kopfnoten.add', { player, category, delta, reason });
  }

  kopfnotenSummary(player = 0) { return kopfnotenSummary(this.ctx.state.players[player]?.kopfnoten, this.kopfCfg); }

  text(key, lang = this.ctx.i18n.lang) { return (this.dicts[lang] ?? this.dicts.de)[key] ?? key; }

  // Funny warm comment for a report card (grades = a player's grade ledger, kopfnoten = the player's conduct values).
  teacherComment(grades, kopfnoten, lang) {
    return this.text(selectTeacherComment(grades, kopfnoten, this.comments, this.kopfCfg), lang);
  }

  // Everything the Zeugnis shows for one kid.
  reportCard(player = 0, lang) {
    const p = this.ctx.state.players[player];
    const promotion = this.promotion(player);
    return {
      average: this.average(player),
      zeugnis: this.zeugnis(player),
      kopfnoten: this.kopfnotenSummary(player),
      promotion,
      teacherComment: this.teacherComment(p.grades, p.kopfnoten, lang),
      parentLine: this.text(selectParentReaction(promotion.promoted, p.grades, this.parents), lang)
    };
  }

  #onEvent(row, payload) {
    const player = payload.player ?? 0;
    if (!this.ctx.state.players[player] || !eventMatches(row, payload)) return;
    this.kopfnotenAdd(player, row.category, row.delta, row.reason);
  }
}
