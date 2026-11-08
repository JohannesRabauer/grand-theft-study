// Phaser-free core of the learning engine (AD-19). Pure functions plus EngineCore, which talks to saved
// stats only through a `store` ({ get(player, topic) -> stats|undefined, record(player, topic, stats) }).
//
// Stats per player and topic (saved in state.players[i].learning[topic]):
//   n       answered questions in this topic (the clock of the repetition queue)
//   acc     rolling accuracy, exponential moving average
//   recent  scores (0..1) of the last cfg.window answers; the controller steers on their mean
//   level   current difficulty, fractional 1..5
//   streak, bestStreak, correct, wrong, last (id of the previous item)
//   items   { id: { s: seen, c: correct, b: Leitner box (0 = not in repetition), d: due when n >= d } }
// Repetition counts answered questions: a wrong item parks until cfg.intervals[box-1] other questions have
// passed, then it is due; a correct answer moves it up a box and after the last box it is learned (b = 0).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

export const emptyStats = (cfg, startOffset = 0) => ({ n: 0, acc: 0.8, recent: [], level: cfg.startLevel + startOffset, streak: 0, bestStreak: 0, correct: 0, wrong: 0, last: null, items: {} });

// Saves may predate fields or come from edited files: fill what is missing, never throw.
// `startOffset` shifts the start level of a topic nobody has answered yet (a younger kid starts a bit easier).
export function normalizeStats(raw, cfg, startOffset = 0) {
  const s = { ...emptyStats(cfg, startOffset), ...(raw ?? {}) };
  s.level = clamp(Number.isFinite(s.level) ? s.level : cfg.startLevel + startOffset, cfg.levelMin, cfg.levelMax);
  if (!Array.isArray(s.recent)) s.recent = [];
  if (!s.items || typeof s.items !== 'object') s.items = {};
  return s;
}

export const recentAccuracy = (stats, cfg) => (stats.recent.length >= cfg.minSamples ? mean(stats.recent) : null);

// 'struggling' | 'normal' | 'strong' from the recent accuracy (normal while there are too few answers).
export function supportTier(stats, cfg) {
  const ra = recentAccuracy(stats, cfg);
  if (ra === null) return 'normal';
  return ra < cfg.band.hardLow ? 'struggling' : ra > cfg.band.hardHigh ? 'strong' : 'normal';
}

export function expectedMs(item, cfg) {
  const e = cfg.expectedMs;
  return item.expectedMs ?? (e[item.type] ?? e.default) * (1 + e.perDifficulty * (item.difficulty - 1));
}

// New stats after one answer; `stats` is not modified. ok = right in the end, hintsUsed lowers the score a little.
export function applyAnswer(stats, item, ok, ms, hintsUsed, cfg) {
  const s = structuredClone(stats);
  const score = ok ? (hintsUsed > 0 ? cfg.hintScore : 1) : 0;
  s.n += 1;
  s.acc += (score - s.acc) * cfg.emaAlpha;
  s.recent.push(score);
  if (s.recent.length > cfg.window) s.recent.shift();
  s.last = item.id;
  if (ok) { s.correct += 1; s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); } else { s.wrong += 1; s.streak = 0; }

  // difficulty controller: no change inside the target band (that is the hysteresis), proportional
  // steps outside it, twice as strong beyond the hard limits; fast correct answers ramp up quicker
  const ra = recentAccuracy(s, cfg);
  if (ra !== null) {
    const { low, high, hardLow, hardHigh } = cfg.band;
    const err = ra < low ? ra - low : ra > high ? ra - high : 0;
    let delta = cfg.gain * err * (ra < hardLow || ra > hardHigh ? 2 : 1);
    if (ok && ms < expectedMs(item, cfg) * cfg.fastRatio && hintsUsed === 0) delta = delta > 0 ? delta * cfg.fastRamp : delta === 0 ? cfg.fastBonus : delta;
    s.level = clamp(s.level + delta, cfg.levelMin, cfg.levelMax);
  }

  const it = s.items[item.id] ??= { s: 0, c: 0, b: 0, d: 0 };
  it.s += 1;
  if (ok) {
    it.c += 1;
    if (it.b > 0) {
      it.b += 1;
      if (it.b > cfg.intervals.length) { it.b = 0; it.d = 0; } else it.d = s.n + cfg.intervals[it.b - 1];
    }
  } else {
    it.b = 1;
    it.d = s.n + cfg.intervals[0];
  }
  return s;
}

// Predicate for next()'s `filter` option: a tag name, an array of tag names (an item needs one of them) or a function
// (item) -> boolean. Returns null when there is no filter.
export function itemFilter(filter) {
  if (filter === undefined || filter === null) return null;
  if (typeof filter === 'function') return filter;
  const tags = Array.isArray(filter) ? filter : [filter];
  return item => (item.tags ?? []).some(t => tags.includes(t));
}

const norm = v => String(v).trim().toLowerCase().replace(',', '.').replace(/\s+/g, ' ');

export class EngineCore {
  // pools: { topic: { bothLangs, items } }; reactions: { correct: [keys], wrong: [...], streak: [...] }
  constructor({ pools, cfg, reactions, store, rng = Math.random, parentDifficulty = () => 1, playerDifficulty = () => 1, startOffset = () => 0 }) {
    this.pools = pools;
    this.cfg = cfg;
    this.reactions = reactions;
    this.store = store;
    this.rng = rng;
    this.parentDifficulty = parentDifficulty;
    this.playerDifficulty = playerDifficulty; // story 11.7: the challenge factor of one kid's age
    this.startOffset = startOffset;
    this.byId = {};
    for (const [topic, p] of Object.entries(pools)) this.byId[topic] = Object.fromEntries(p.items.map(i => [i.id, i]));
    this.lastReaction = {};
  }

  topics() { return Object.keys(this.pools); }

  stats(player, topic) { return normalizeStats(this.store.get(player, topic), this.cfg, this.startOffset(player)); }

  pd(player = 0) { return clamp(this.parentDifficulty() * this.playerDifficulty(player), this.cfg.parentRange[0], this.cfg.parentRange[1]); }

  // The item as shown to the caller plus `meta` (difficulty, target, timeFactor, hintsAllowed, expectedMs, ...).
  present(topic, item, stats, due, player = 0) {
    const cfg = this.cfg;
    const tier = supportTier(stats, cfg);
    const sup = cfg.support[tier];
    const pd = this.pd(player);
    const hintsAllowed = sup.hints === 'all' ? item.hints?.length ?? 0 : Math.min(sup.hints, item.hints?.length ?? 0);
    return {
      ...item,
      meta: {
        topic,
        due,
        tier,
        level: stats.level,
        target: clamp(stats.level * pd, cfg.levelMin, cfg.levelMax),
        timeFactor: clamp(sup.timeFactor / pd, cfg.timeFactorRange[0], cfg.timeFactorRange[1]),
        hintsAllowed,
        expectedMs: expectedMs(item, cfg),
        bothLangs: !!this.pools[topic].bothLangs
      }
    };
  }

  dueEntries(stats, topic) {
    const out = [];
    for (const [id, it] of Object.entries(stats.items)) {
      if (it.b > 0 && it.d <= stats.n && this.byId[topic][id]) out.push({ id, overdue: stats.n - it.d, box: it.b });
    }
    return out.sort((a, b) => b.overdue - a.overdue || (a.id < b.id ? -1 : 1));
  }

  // Items due for repetition as questions, most overdue first. Without a topic: all topics.
  due(player, { topic, maxCount = 5 } = {}) {
    const out = [];
    for (const t of topic ? [topic] : this.topics()) {
      if (!this.pools[t]) continue;
      const stats = this.stats(player, t);
      for (const e of this.dueEntries(stats, t)) out.push({ ...e, topic: t, stats });
    }
    out.sort((a, b) => b.overdue - a.overdue);
    return out.slice(0, maxCount).map(e => this.present(e.topic, this.byId[e.topic][e.id], e.stats, true, player));
  }

  // `filter` (see itemFilter) restricts the pick to matching items, e.g. the sub-tag 'artikel'; null when none match.
  next(topic, { player = 0, context = 'lesson', filter } = {}) {
    const pool = this.pools[topic];
    if (!pool) return null;
    const match = itemFilter(filter);
    const items = match ? pool.items.filter(match) : pool.items;
    if (!items.length) return null;
    const cfg = this.cfg;
    const stats = this.stats(player, topic);
    const ctxCfg = cfg.contexts[context] ?? cfg.defaultContext;
    const due = this.dueEntries(stats, topic).filter(e => e.id !== stats.last && (!match || match(this.byId[topic][e.id])));
    if (due.length && (ctxCfg.dueFirst || due[0].overdue >= cfg.maxOverdue || this.rng() < ctxCfg.dueRate)) {
      return this.present(topic, this.byId[topic][due[0].id], stats, true, player);
    }
    // everything not parked in a repetition interval, except the previous item
    const open = items.filter(i => {
      const it = stats.items[i.id];
      return i.id !== stats.last && !(it && it.b > 0 && it.d > stats.n);
    });
    let cands = open;
    if (!cands.length) cands = items.filter(i => i.id !== stats.last); // everything parked: pull the soonest back
    if (!cands.length) cands = items;
    const target = clamp(stats.level * this.pd(player), cfg.levelMin, cfg.levelMax);
    const { sigma, novelty } = cfg.pick;
    const weights = cands.map(i => Math.exp(-((i.difficulty - target) ** 2) / (2 * sigma * sigma)) * (1 + novelty / (1 + (stats.items[i.id]?.s ?? 0))));
    let r = this.rng() * weights.reduce((s, w) => s + w, 0);
    let pick = cands[cands.length - 1];
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) { pick = cands[i]; break; } }
    return this.present(topic, pick, stats, false, player);
  }

  // Records an answer and returns the new stats; unknown items are ignored.
  answer(question, ok, ms = 0, { player = 0, hintsUsed = 0 } = {}) {
    const topic = question.meta?.topic ?? question.topic;
    const item = this.byId[topic]?.[question.id];
    if (!item) return null;
    const stats = applyAnswer(this.stats(player, topic), item, !!ok, ms, hintsUsed, this.cfg);
    this.store.record(player, topic, stats);
    return stats;
  }

  // Judges a response by item type:
  //   choice  answer index or text
  //   typed   any accepted text
  //   match   one entry per left side, in order: the index of the chosen right side (or its text); all must be right
  //   sort    one category id per sortItem, in order (array, or object keyed by index); all must be right
  isCorrect(question, response) {
    switch (question.type) {
      case 'choice': {
        const a = typeof response === 'number' ? question.answers[response] : question.answers.find(x => norm(this.text(x.text, 'de')) === norm(response));
        return !!a?.correct;
      }
      case 'typed':
        return question.answers.some(a => norm(this.text(a.text, 'de')) === norm(response));
      case 'match':
        return question.pairs.every((p, i) => {
          const r = response?.[i];
          return typeof r === 'number' ? r === i : r !== undefined && r !== null && norm(this.text(p.right, 'de')) === norm(r);
        });
      case 'sort':
        return question.sortItems.every((s, i) => response?.[i] === s.category);
      default:
        return false;
    }
  }

  text(t, lang) { return typeof t === 'string' ? t : t[lang] ?? t.de; }

  // Text in the current language; topics with bothLangs (English lessons) always show both, current language first.
  localize(question, lang) {
    const other = lang === 'de' ? 'en' : 'de';
    const both = !!question.meta?.bothLangs;
    const pick = t => (both && typeof t === 'object' ? `${t[lang]}\n${t[other]}` : this.text(t, lang));
    const out = {
      q: pick(question.q),
      explain: pick(question.explain),
      hints: (question.hints ?? []).map(pick),
      answers: (question.answers ?? []).map(a => ({ ...a, text: a.text === undefined ? undefined : pick(a.text) }))
    };
    if (question.fact) out.fact = pick(question.fact);
    if (question.pairs) out.pairs = question.pairs.map(p => ({ left: pick(p.left), right: pick(p.right) }));
    if (question.sortItems) {
      out.categories = question.categories.map(c => ({ id: c.id, label: pick(c.label) }));
      out.sortItems = question.sortItems.map(s => ({ text: pick(s.text), category: s.category }));
    }
    return out;
  }

  reaction(kind) {
    const list = this.reactions[kind];
    let i = Math.floor(this.rng() * list.length);
    if (list.length > 1 && list[i] === this.lastReaction[kind]) i = (i + 1) % list.length;
    return (this.lastReaction[kind] = list[i]);
  }

  // Shape for the UI, never punishing: a wrong answer gets the kind explanation and a gentle line.
  // `streak` is the streak after this answer.
  feedback(question, ok, streak = 0) {
    const kind = !ok ? 'wrong' : streak >= this.cfg.streakAt && streak % this.cfg.streakAt === 0 ? 'streak' : 'correct';
    return { ok: !!ok, kind, reaction: this.reaction(kind), explain: question.explain, showExplain: !ok, streak };
  }
}
