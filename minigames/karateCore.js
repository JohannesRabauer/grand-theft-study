// Pure core of the karate training minigame (story 6.4, AD-20), no Phaser. The sensei calls a kata (data/kata.json): a row of
// moves on five lanes (dodge left, block high, Kiai, block low, dodge right), one per step of the tempo. The judging reuses the
// Musik rhythm core (rhythmCore.js: NoteTrack, Scorer), with gentle windows and a calm "Fokus" meter. A session plays the three
// kata of the player's belt in a row; the last one is the belt exam. KarateGame.js and ui/KarateStage.js bind it to a scene;
// defense/beltCore.js turns the summary into points and a promotion; scripts/check-karate.mjs drives all of it in node.
//
//   buildSession(cfg, belt)              { n, t[], lane[], stage[], stages[{ from, to, count, startMs, endMs }], totalMs }
//   new KarateSession(cfg, belt)         press(lane, now), sweep(now), summary(); track, scorer, fokus, done
//   lanesFromNav(nav, cfg, out)          dodge left/right = left/right, block high/low = up/down, Kiai = confirm, 1-5 = lanes
//   defendLane(session)                  the block lane the `defend` intent plays: the one with the earlier pending note
import { NoteTrack, Scorer } from './rhythmCore.js';

const REST = -1;

export const laneOf = (cfg, name) => cfg.lanes.indexOf(name);

export const kataSet = (cfg, belt) => cfg.belts[belt] ?? cfg.belts.white;

// 'H . D K' -> [lane, -1, lane, lane] (-1 = a quiet step)
export function parseKata(steps, cfg) {
  return steps.trim().split(/\s+/).map(tok => (tok === '.' ? REST : laneOf(cfg, cfg.moves[tok])));
}

export const stepMsOf = (set, kata) => 60000 / (set.stepsPerMinute * kata.speed);

// All notes of a session of `belt`: the kata one after the other from leadInMs, gapSteps quiet steps between them.
export function buildSession(cfg, belt) {
  const set = kataSet(cfg, belt);
  const { leadInMs, gapSteps, tailMs } = cfg.play;
  const t = [];
  const lane = [];
  const stage = [];
  const stages = [];
  let cursor = leadInMs;
  set.kata.forEach((kata, s) => {
    const step = stepMsOf(set, kata);
    const row = parseKata(kata.steps, cfg);
    const from = t.length;
    row.forEach((l, i) => {
      if (l === REST) return;
      t.push(Math.round(cursor + i * step));
      lane.push(l);
      stage.push(s);
    });
    stages.push({ from, to: t.length, count: t.length - from, startMs: cursor, endMs: cursor + row.length * step, stepMs: step });
    cursor += (row.length + gapSteps) * step;
  });
  return { n: t.length, t, lane, stage, stages, totalMs: Math.round(t[t.length - 1] + tailMs) };
}

// The calm meter: a steady hit fills it, a miss drains a little. At the full level the hit windows widen.
export class Fokus {
  constructor(cfg) {
    this.cfg = cfg;
    this.value = 0;
  }

  get calm() { return this.value >= this.cfg.full; }

  hit(absDtMs) {
    if (absDtMs <= this.cfg.steadyMs) this.value = Math.min(1, this.value + this.cfg.gain);
  }

  miss() { this.value = Math.max(0, this.value - this.cfg.missLoss); }
}

// Fills `win` (the track's reused window object) for the belt and the current Fokus.
export function setWindows(win, cfg, belt, fokus) {
  const k = (kataSet(cfg, belt).windowScale ?? 1) * (fokus.calm ? 1 + cfg.fokus.widen : 1);
  win.perfect = cfg.windows.perfectMs * k;
  win.good = cfg.windows.goodMs * k;
  win.linger = cfg.windows.lingerMs;
  return win;
}

// One player's whole session: the notes against the clock, points with a combo, the Fokus meter and the accuracy per kata.
export class KarateSession {
  constructor(cfg, belt) {
    this.cfg = cfg;
    this.belt = belt;
    this.schedule = buildSession(cfg, belt);
    this.fokus = new Fokus(cfg.fokus);
    this.win = setWindows({}, cfg, belt, this.fokus);
    this.track = new NoteTrack(this.schedule, cfg.lanes.length, this.win);
    this.scorer = new Scorer(cfg.scoring);
    this.weight = new Float64Array(this.schedule.stages.length); // summed grade weights per kata
    this.fokusSum = 0;
    this.fokusN = 0;
  }

  get done() { return this.track.judged >= this.schedule.n; }

  grade(index, grade) {
    this.weight[this.schedule.stage[index]] += grade === 'perfect' ? 1 : this.cfg.scoring.goodWeight;
  }

  // A lane was played at `now` ms. Returns the track's result (grade 'perfect' | 'good' | null, reused object).
  press(lane, now) {
    const r = this.track.press(lane, now);
    if (!r.grade) return r;
    this.scorer.hit(r.grade);
    this.grade(r.index, r.grade);
    this.fokus.hit(Math.abs(r.dt));
    this.fokusSum += this.fokus.value;
    this.fokusN++;
    setWindows(this.win, this.cfg, this.belt, this.fokus);
    return r;
  }

  // Notes that slid past the good window become misses (their indexes are in track.missed). Returns how many.
  sweep(now) {
    const n = this.track.sweep(now);
    for (let i = 0; i < n; i++) {
      this.scorer.miss();
      this.fokus.miss();
    }
    if (n) setWindows(this.win, this.cfg, this.belt, this.fokus);
    return n;
  }

  // Weighted accuracy 0-1 of one kata (perfect 1, good goodWeight, miss 0).
  accuracy(stage) {
    const { count } = this.schedule.stages[stage];
    return count ? this.weight[stage] / count : 0;
  }

  // What the belt logic needs: `score` over the whole session, `exam` = the last kata, the mean Fokus of the hits.
  summary() {
    const { stages, n } = this.schedule;
    let sum = 0;
    for (let s = 0; s < stages.length; s++) sum += this.weight[s];
    return {
      score: n ? sum / n : 0,
      exam: this.accuracy(stages.length - 1),
      fokus: this.fokusN ? this.fokusSum / this.fokusN : 0,
      points: this.scorer.points,
      bestCombo: this.scorer.best,
      counts: { ...this.track.counts }
    };
  }
}

// The lanes a player's cursor input plays this frame, written into `out` (a reused array); returns how many.
export function lanesFromNav(nav, cfg, out) {
  let n = 0;
  if (nav.pick >= 1 && nav.pick <= cfg.lanes.length) out[n++] = nav.pick - 1;
  if (nav.dx < 0) out[n++] = laneOf(cfg, 'dodgeLeft');
  if (nav.dx > 0) out[n++] = laneOf(cfg, 'dodgeRight');
  if (nav.dy < 0) out[n++] = laneOf(cfg, 'blockHigh');
  if (nav.dy > 0) out[n++] = laneOf(cfg, 'blockLow');
  if (nav.confirm) out[n++] = laneOf(cfg, 'kiai');
  return n;
}

// The `defend` intent blocks whatever block the sensei called next: the block lane whose oldest pending note comes first.
export function defendLane(session, cfg) {
  const { track } = session;
  let best = -1;
  let bestT = Infinity;
  for (const name of ['blockHigh', 'blockLow']) {
    const lane = laneOf(cfg, name);
    const h = track.head[lane];
    const q = track.queue[lane];
    if (h < q.length && track.t[q[h]] < bestT) { bestT = track.t[q[h]]; best = lane; }
  }
  return best < 0 ? laneOf(cfg, 'blockHigh') : best;
}

// Index of the note the sensei calls next (oldest pending over all lanes), or -1.
export function nextCall(session) {
  const { track } = session;
  let best = -1;
  for (let lane = 0; lane < track.queue.length; lane++) {
    const h = track.head[lane];
    const q = track.queue[lane];
    if (h < q.length && (best < 0 || track.t[q[h]] < track.t[best])) best = q[h];
  }
  return best;
}

// Problems of the kata data for the check script: tokens, lengths, belt order, that every session fits the round.
export function kataProblems(cfg, beltOrder, durationMs, maxVisible) {
  const out = [];
  for (const belt of beltOrder) {
    const set = cfg.belts[belt];
    if (!set) { out.push(`${belt}: no kata set`); continue; }
    if (set.kata.length !== 3) out.push(`${belt}: three kata`);
    set.kata.forEach(k => {
      for (const tok of k.steps.trim().split(/\s+/)) if (tok !== '.' && !cfg.moves[tok]) out.push(`${k.id}: bad token ${tok}`);
    });
    const lens = set.kata.map(k => k.steps.trim().split(/\s+/).length);
    if (!(lens[0] < lens[1] && lens[1] < lens[2])) out.push(`${belt}: kata get longer`);
    if (!(set.kata[0].speed < set.kata[1].speed && set.kata[1].speed < set.kata[2].speed)) out.push(`${belt}: kata get faster`);
    const s = buildSession(cfg, belt);
    if (s.totalMs > durationMs) out.push(`${belt}: session ${s.totalMs} ms is longer than the round`);
    for (let i = 1; i < s.n; i++) if (s.t[i] - s.t[i - 1] < 300) out.push(`${belt}: notes ${i - 1}/${i} closer than 300 ms`);
    for (let i = 0; i < s.n; i++) if (s.t.filter(x => x >= s.t[i] && x < s.t[i] + cfg.play.fallMs + cfg.windows.lingerMs).length > maxVisible) { out.push(`${belt}: too many notes on screen at ${s.t[i]}`); break; }
  }
  return out;
}
