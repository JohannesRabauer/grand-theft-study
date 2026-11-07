// Pure minigame logic (AD-20), no Phaser: the round clock, per-player tallies, result aggregation, rewards,
// result bands and stars, answer-cursor input handling and the side-by-side layout. Minigame.js, Minigames.js and
// the result screen bind it to scenes; scripts/check-minigames.mjs drives it in node.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = v => Math.round(v * 100) / 100;

// ---- registry helpers ----

export const sceneKey = id => `MG_${id}`;

export const clampDifficulty = (def, d) => clamp(Math.round(Number.isFinite(d) ? d : 3), def.difficultyRange[0], def.difficultyRange[1]);

// Why `players` cannot start `def`, or null: 1..maxPlayers distinct, existing player indexes.
export function playersProblem(def, players, available) {
  if (!Array.isArray(players) || players.length < 1 || players.length > def.maxPlayers) return `needs 1-${def.maxPlayers} players`;
  if (new Set(players).size !== players.length) return 'duplicate player';
  if (players.some(p => !Number.isInteger(p) || p < 0 || p >= available)) return 'unknown player';
  return null;
}

// ---- round clock ----

// countdown (the visible 3-2-1) -> play (the shared timer runs) -> done. Time only advances through tick(), so a
// pause that stops calling tick() never costs the players time.
export class RoundClock {
  constructor(durationMs, countdownMs) {
    this.durationMs = durationMs;
    this.countdownMs = countdownMs;
    this.countdownLeft = countdownMs;
    this.elapsedMs = 0;
    this.phase = countdownMs > 0 ? 'countdown' : 'play';
  }

  get remainingMs() { return this.durationMs - this.elapsedMs; }

  // Returns the new phase when it changed ('play' or 'done'), else null.
  tick(dtMs) {
    if (this.phase === 'countdown') {
      this.countdownLeft -= dtMs;
      if (this.countdownLeft > 0) return null;
      dtMs = -this.countdownLeft;
      this.countdownLeft = 0;
      this.phase = 'play';
      return this.tickPlay(dtMs) ?? 'play';
    }
    return this.phase === 'play' ? this.tickPlay(dtMs) : null;
  }

  tickPlay(dtMs) {
    this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + dtMs);
    if (this.elapsedMs < this.durationMs) return null;
    this.phase = 'done';
    return 'done';
  }

  finish() { this.phase = 'done'; }
}

// ---- tallies and results ----

export class Tally {
  constructor() {
    this.correct = 0;
    this.total = 0;
    this.hints = 0;
    this.msSum = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.byTopic = {};
  }

  record(ok, ms, hints, topic) {
    this.total++;
    this.hints += hints;
    this.msSum += ms;
    this.streak = ok ? this.streak + 1 : 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (ok) this.correct++;
    const t = (this.byTopic[topic] ??= { correct: 0, total: 0 });
    t.total++;
    if (ok) t.correct++;
  }
}

// One player's score (0-1) and effort (0-1). The score counts against at least `expected` questions, so a few lucky
// answers in a timed round are not a full score; quitting early keeps that rule and caps the effort (never a shaming 6).
export function playerResult(tally, { expected, quit, quitEffortCap }) {
  const score = tally.total ? clamp(tally.correct / Math.max(tally.total, expected), 0, 1) : 0;
  const tried = clamp(tally.total / expected, 0, 1);
  return {
    score: round2(score),
    effort: round2(quit ? Math.min(tried, quitEffortCap) : tried),
    correct: tally.correct,
    total: tally.total,
    hintsUsed: tally.hints,
    stats: { bestStreak: tally.bestStreak, avgMs: tally.total ? Math.round(tally.msSum / tally.total) : 0, byTopic: tally.byTopic }
  };
}

// XP and money for a score: a share from `minShare` (tried) to 1 (perfect) of the registry's rewards; nothing when quitting.
export function rewardFor(rewards, score, quit, minShare) {
  if (quit) return { xp: 0, moneyCents: 0 };
  const share = minShare + (1 - minShare) * clamp(score, 0, 1);
  return { xp: Math.round(rewards.xp * share), moneyCents: Math.round(rewards.moneyCents * share) };
}

// A mean of grades rounds to the worse grade on .5, like the Zeugnis rule.
export const meanGrade = grades => Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);

// The result handed to ctx.minigames.start()'s promise. gradeFn(playerIndex, { score, effort, difficulty }) is the
// grade mapper (Grades.preview): this module never decides a grade itself.
export function buildResult({ def, cfg, players, tallies, ms, quit, difficulty, gradeFn }) {
  const expected = def.expectedQuestions;
  const perPlayer = players.map((index, i) => {
    const r = playerResult(tallies[i], { expected, quit, quitEffortCap: cfg.quitEffortCap });
    const g = gradeFn(index, { score: r.score, effort: r.effort, difficulty });
    return { player: index, ...r, grade: g.grade, ...rewardFor(def.rewards, r.score, quit, cfg.minRewardShare) };
  });
  const sum = key => perPlayer.reduce((a, p) => a + p[key], 0);
  const mean = key => round2(sum(key) / perPlayer.length);
  const n = perPlayer.length;
  return {
    id: def.id,
    subject: def.subject,
    quit,
    difficulty,
    score: mean('score'),
    effort: mean('effort'),
    correct: sum('correct'),
    total: sum('total'),
    hintsUsed: sum('hintsUsed'),
    xp: sum('xp'),
    moneyCents: sum('moneyCents'),
    grade: meanGrade(perPlayer.map(p => p.grade)),
    ms: Math.round(ms),
    stats: {
      bestStreak: Math.max(...perPlayer.map(p => p.stats.bestStreak)),
      avgMs: Math.round(perPlayer.reduce((a, p) => a + p.stats.avgMs, 0) / n)
    },
    perPlayer
  };
}

// ---- result screen helpers ----

// 0-3 stars; thresholds ascending, e.g. [0.5, 0.75, 0.92].
export const starsFor = (score, thresholds) => thresholds.filter(t => score >= t).length;

// The first band (descending `min`) the score reaches: { key, lines: [i18n keys] }.
export const bandFor = (score, bands) => bands.find(b => score >= b.min) ?? bands[bands.length - 1];

// A funny line of the band, picked deterministically from the result so it does not flicker on a language switch.
export const lineFor = (result, bands) => {
  const { lines } = bandFor(result.score, bands);
  return lines[(result.correct * 7 + result.total * 3 + result.grade) % lines.length];
};

// ---- input ----

const STICK = 0.5;

// Turns one player's level intent into discrete menu-like steps: dx/dy -1|0|1 on a fresh press of a direction,
// confirm on a fresh press of jump or interact, pick = the number key pressed this frame (1-4, 0 none). It starts
// as if everything were held, so a key still down when a round begins does not count. The returned object is reused.
export class ChoiceCursor {
  constructor() {
    this.held = { up: true, down: true, left: true, right: true, confirm: true };
    this.out = { dx: 0, dy: 0, confirm: false, pick: 0 };
  }

  read(intent) {
    const { held, out } = this;
    const m = intent.move;
    const up = m.y < -STICK;
    const down = m.y > STICK;
    const left = m.x < -STICK;
    const right = m.x > STICK;
    const confirm = intent.jump || intent.interact;
    out.dy = (down && !held.down ? 1 : 0) - (up && !held.up ? 1 : 0);
    out.dx = (right && !held.right ? 1 : 0) - (left && !held.left ? 1 : 0);
    out.confirm = confirm && !held.confirm;
    out.pick = intent.answer ?? 0;
    held.up = up;
    held.down = down;
    held.left = left;
    held.right = right;
    held.confirm = confirm;
    return out;
  }
}

// ---- layout ----

// Playing areas (480x270 layout space) below the header: the whole width for one player, two halves side by side for two.
export function layoutRects(count, w, h, { top, margin, gap }) {
  const rects = [];
  const cw = (w - 2 * margin - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) rects.push({ x: margin + i * (cw + gap), y: top, w: cw, h: h - top - margin });
  return rects;
}
