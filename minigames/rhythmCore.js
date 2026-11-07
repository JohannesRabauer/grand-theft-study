// Reusable rhythm core (story 4.6), no Phaser: chart parsing and scheduling from the data-defined songs
// (data/songs.json), hit judging with gentle windows, the note track of one player, scoring with combo, the beat
// phase for the visual metronome and the mapping of a player's cursor input to lanes. MusikGame.js and
// ui/RhythmStage.js bind it to a scene; scripts/check-musik.mjs drives it in node. The instrument-practice chore
// (a later story) reuses it as is: buildSchedule() -> NoteTrack -> press()/sweep() -> Scorer, all driven by one clock in ms.
//
//   songFor(songs, rng)                   a random song
//   tierFor(difficulty, level, rule)      'easy' | 'medium' | 'hard' for a player
//   buildSchedule(song, tier, opts)       { n, t[], lane[] } sorted by time, deterministic
//   windowsFor(cfg, tier, bonus)          { perfect, good, linger } in ms, widened by the musicArtBonus perk
//   judgeOffset(dt, windows)              'perfect' | 'good' | null for a press dt ms off the note
//   new NoteTrack(schedule, lanes, win)   press(lane, now), sweep(now) (misses in .missed), range(now, ahead, behind)
//   new Scorer(scoring, bonus)            hit(grade) -> points, miss(); combo, best, points
//   beatPhase(now, bpm), noteY(...), lanesFromNav(nav, lanes, out), accuracyOf(counts)

export const TIERS = ['easy', 'medium', 'hard'];
// What a note state means in NoteTrack.state.
export const PENDING = 0;
export const PERFECT = 1;
export const GOOD = 2;
export const MISSED = 3;

const REST = -1;

export const songFor = (songs, rng = Math.random) => songs[Math.floor(rng() * songs.length)];

// Chart tier from the session difficulty (1-5) and the player's level: a higher level nudges the difficulty up.
export function tierFor(difficulty, level, rule) {
  const d = difficulty + rule.levelStep * Math.max(0, level - 1);
  return d >= rule.hardFrom ? 'hard' : d >= rule.mediumFrom ? 'medium' : 'easy';
}

export const stepMs = (bpm, stepsPerBar) => 240000 / (bpm * stepsPerBar);

// '0.1.' -> [0, -1, 1, -1] (-1 = rest)
export const parseBar = bar => Array.from(bar, ch => (ch === '.' ? REST : Number(ch)));

// Problems of a song for the data check: every tier has the same bar count, bars have stepsPerBar chars, lanes exist,
// charts are single notes, nearly every bar plays something.
export function songProblems(song, { lanes, stepsPerBar }) {
  const out = [];
  const bars = song.charts.easy?.length;
  if (!(song.bpm >= 60 && song.bpm <= 160)) out.push('bpm 60-160');
  if (song.scale.length !== lanes) out.push('one pitch per lane');
  for (const tier of TIERS) {
    const chart = song.charts[tier];
    if (!chart || chart.length !== bars || bars < 4) { out.push(`${tier}: bar count`); continue; }
    chart.forEach((bar, i) => {
      if (bar.length !== stepsPerBar) out.push(`${tier} bar ${i}: ${bar.length} steps`);
      if (![...bar].every(ch => ch === '.' || (ch >= '0' && ch < String(lanes)))) out.push(`${tier} bar ${i}: bad char`);
    });
    if (chart.filter(b => /\d/.test(b)).length < bars - 1) out.push(`${tier}: too many empty bars`);
  }
  return out;
}

// All notes of a round of `song` at `tier`: the loop repeats from leadInMs on, every second pass mirrored, until
// durationMs - tailMs. Times are ms of the round clock, ascending.
export function buildSchedule(song, tier, { durationMs, leadInMs, tailMs, lanes, stepsPerBar }) {
  const chart = song.charts[tier].map(parseBar);
  const step = stepMs(song.bpm, stepsPerBar);
  const loopMs = chart.length * stepsPerBar * step;
  const end = durationMs - tailMs;
  const t = [];
  const lane = [];
  for (let pass = 0; leadInMs + pass * loopMs < end; pass++) {
    const base = leadInMs + pass * loopMs;
    for (let b = 0; b < chart.length; b++) {
      for (let s = 0; s < stepsPerBar; s++) {
        const l = chart[b][s];
        const time = base + (b * stepsPerBar + s) * step;
        if (l === REST || time > end) continue;
        t.push(Math.round(time));
        lane.push(pass % 2 ? lanes - 1 - l : l);
      }
    }
  }
  return { n: t.length, t, lane };
}

// Hit windows in ms: the tier scales the base windows, the musicArtBonus perk (0.3 = 30 %) widens them further.
export function windowsFor(cfg, tier, bonus = 0) {
  const k = cfg.tiers[tier].windowScale * (1 + Math.max(0, bonus));
  return { perfect: cfg.windows.perfectMs * k, good: cfg.windows.goodMs * k, linger: cfg.windows.lingerMs };
}

export function judgeOffset(dt, win) {
  const a = Math.abs(dt);
  return a <= win.perfect ? 'perfect' : a <= win.good ? 'good' : null;
}

// One player's notes against the clock. state[i] is PENDING/PERFECT/GOOD/MISSED. A press hits the oldest pending note
// of its lane when it is inside the good window; a press that is too early or finds nothing is ignored (no
// penalty). sweep() turns notes that slid past the good window into misses.
export class NoteTrack {
  constructor(schedule, lanes, win) {
    this.t = schedule.t;
    this.lane = schedule.lane;
    this.n = schedule.n;
    this.win = win;
    this.state = new Uint8Array(this.n);
    this.queue = Array.from({ length: lanes }, () => []);
    for (let i = 0; i < this.n; i++) this.queue[this.lane[i]].push(i);
    this.head = new Int32Array(lanes);
    this.missed = [];
    this.out = { grade: null, index: -1, dt: 0 };
    this.lo = 0;
    this.hi = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
  }

  get judged() { return this.counts.perfect + this.counts.good + this.counts.miss; }

  // out.grade: 'perfect' | 'good' | null (ignored); the returned object is reused.
  press(lane, now) {
    const { out } = this;
    out.grade = null;
    out.index = -1;
    const q = this.queue[lane];
    const h = this.head[lane];
    if (!q || h >= q.length) return out;
    const i = q[h];
    const dt = now - this.t[i];
    const grade = judgeOffset(dt, this.win);
    if (!grade) return out;
    this.head[lane] = h + 1;
    this.state[i] = grade === 'perfect' ? PERFECT : GOOD;
    this.counts[grade]++;
    out.grade = grade;
    out.index = i;
    out.dt = dt;
    return out;
  }

  // Notes past the good window become misses; their indexes are in `missed` (cleared each call). Returns the count.
  sweep(now) {
    this.missed.length = 0;
    for (let lane = 0; lane < this.queue.length; lane++) {
      const q = this.queue[lane];
      let h = this.head[lane];
      while (h < q.length && now - this.t[q[h]] > this.win.good) {
        this.state[q[h]] = MISSED;
        this.counts.miss++;
        this.missed.push(q[h]);
        h++;
      }
      this.head[lane] = h;
    }
    return this.missed.length;
  }

  // The notes to draw at `now`: indexes lo..hi-1 (spawned `ahead` ms before their time, kept `behind` ms after it).
  // Moves forward only, so the clock must not run backwards.
  range(now, ahead, behind) {
    while (this.lo < this.n && this.t[this.lo] + behind < now) this.lo++;
    if (this.hi < this.lo) this.hi = this.lo;
    while (this.hi < this.n && this.t[this.hi] - ahead <= now) this.hi++;
  }
}

// Points with a combo multiplier. A miss breaks the combo and costs nothing else.
export class Scorer {
  constructor(scoring, bonus = 0) {
    this.cfg = scoring;
    this.bonus = Math.max(0, bonus);
    this.combo = 0;
    this.best = 0;
    this.points = 0;
  }

  multiplier(combo = this.combo) {
    return Math.min(this.cfg.maxMult, 1 + this.cfg.multStep * Math.floor(combo / this.cfg.comboStep));
  }

  hit(grade) {
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    const gained = Math.round(this.cfg[grade] * this.multiplier() * (1 + this.bonus));
    this.points += gained;
    return gained;
  }

  miss() { this.combo = 0; }
}

// 0..1 within the current beat (0 = on the beat), for the metronome ring.
export const beatPhase = (now, bpm) => (now * bpm / 60000) % 1;

// Where a note is: topY when it spawns (time - now = fallMs), lineY on its time, further down after it.
export const noteY = (time, now, fallMs, topY, lineY) => lineY - ((time - now) / fallMs) * (lineY - topY);

// Left, down, up, right and the number keys 1-4 are lanes 0-3. Writes this frame's pressed lanes into `out` (a reused
// array) and returns how many.
export function lanesFromNav(nav, lanes, out) {
  let n = 0;
  if (nav.pick >= 1 && nav.pick <= lanes) out[n++] = nav.pick - 1;
  if (nav.dx < 0) out[n++] = 0;
  if (nav.dy > 0) out[n++] = 1;
  if (nav.dy < 0) out[n++] = 2;
  if (nav.dx > 0) out[n++] = lanes - 1;
  return n;
}

export const accuracyOf = counts => {
  const total = counts.perfect + counts.good + counts.miss;
  return total ? (counts.perfect + counts.good) / total : 0;
};
