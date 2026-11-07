// Pure logic of the Mathe minigame (AD-20), no Phaser: the mode mix of a run, which learning items fit which mode, the
// falling-block model (fall time from the engine's difficulty and timeFactor, lane catching, answer blocks incl.
// distractors for typed items), the numeric keypad model, the combo sparkle size and the gentle winner of two players.
// MatheGame.js and the views bind it to the scene; scripts/check-mathe.mjs drives it in node.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const MODES = ['sprint', 'blocks'];

export function shuffle(list, rng = Math.random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---- mode mix ----

// mix: { strategy, first, switchAt }. 'alternate' = two halves (first half mode `first`, 'random' picks it per run),
// 'random' = one random mode for the whole run, a mode name = always that mode. `modes` = the two mode names of the
// minigame (other minigames pass their own).
export function makePlan(mix, rng, durationMs, modes = MODES) {
  const other = m => (m === modes[0] ? modes[1] : modes[0]);
  const pick = () => modes[rng() < 0.5 ? 0 : 1];
  let first;
  let second;
  if (modes.includes(mix.strategy)) first = second = mix.strategy;
  else if (mix.strategy === 'random') first = second = pick();
  else {
    first = modes.includes(mix.first) ? mix.first : pick();
    second = other(first);
  }
  return { first, second, switchMs: Math.round(durationMs * clamp(mix.switchAt ?? 0.5, 0.1, 0.9)) };
}

export const modeAt = (plan, elapsedMs) => (elapsedMs < plan.switchMs ? plan.first : plan.second);

// ---- which items fit which mode ----

const textOf = (t, lang = 'de') => (typeof t === 'string' ? t : t[lang] ?? t.de);
const DIGITS = /^\d+$/;

// A typed item the keypad can answer: every accepted answer is a plain number of at most maxDigits digits.
export const keypadable = (q, maxDigits = 5) => q.type === 'typed' && q.answers.every(a => DIGITS.test(textOf(a.text)) && textOf(a.text).length <= maxDigits);

// Sprint mode: choice items (answer buttons) and keypad items.
export const sprintable = (q, maxDigits) => q.type === 'choice' || keypadable(q, maxDigits);

// Block mode: choice items whose answers are short enough for a block (2-4 of them), and keypad items.
export function blockable(q, { maxChars = 8, maxDigits = 5 } = {}) {
  if (q.type === 'typed') return keypadable(q, maxDigits);
  return q.type === 'choice' && q.answers.length >= 2 && q.answers.length <= 4 && q.answers.every(a => textOf(a.text).length <= maxChars);
}

// ---- answer blocks ----

// Wrong numbers near the right one (off by one, ten, a swapped or forgotten digit ...), unique, never negative.
export function distractors(n, count, rng = Math.random) {
  const s = String(n);
  const near = [n + 1, n - 1, n + 2, n - 2, n + 10, n - 10, n + 5, n - 5, n * 10, Math.floor(n / 10)];
  if (s.length > 1) near.push(Number(s.split('').reverse().join('')), Number(s[1] + s[0] + s.slice(2)));
  shuffle(near, rng);
  const out = [];
  for (const v of near) if (v >= 0 && v !== n && !out.includes(v)) out.push(v);
  for (let step = 3; out.length < count; step++) for (const v of [n + step, n - step]) if (v >= 0 && v !== n && !out.includes(v) && out.length < count) out.push(v);
  return out.slice(0, count);
}

// The blocks of one question: { texts, correct } with the right block in a random lane. Choice items keep their
// localized answer texts (`texts`, same order) and the lane of their correct flag; typed items get 3 distractors.
export function blockSet(q, texts, rng = Math.random) {
  if (q.type === 'choice') return { texts: [...texts], correct: q.answers.findIndex(a => a.correct) };
  const right = textOf(q.answers[0].text);
  const all = shuffle([right, ...distractors(Number(right), 3, rng).map(String)], rng);
  return { texts: all, correct: all.indexOf(right) };
}

// ---- falling blocks ----

// Fall time in ms from the top to the ground line. A higher engine difficulty (meta.target) falls faster, the
// support tier's timeFactor (a struggling child gets > 1) slows it down.
export function fallMsFor(fall, meta) {
  const target = clamp(meta?.target ?? meta?.level ?? 3, 1, 5);
  const ms = fall.baseMs * (1 - fall.perLevel * (target - 1)) * (meta?.timeFactor ?? 1);
  return clamp(Math.round(ms), fall.minMs, fall.maxMs);
}

// One question's blocks falling together. state: idle -> falling -> caught | landed (nobody caught the right one in time).
export class FallingBlocks {
  constructor() {
    this.state = 'idle';
    this.elapsed = 0;
    this.fallMs = 1;
    this.count = 0;
    this.correct = 0;
  }

  start(fallMs, count, correct) {
    this.state = 'falling';
    this.elapsed = 0;
    this.fallMs = fallMs;
    this.count = count;
    this.correct = correct;
  }

  // 0 (top) .. 1 (on the ground)
  get progress() { return Math.min(1, this.elapsed / this.fallMs); }

  // Returns 'landed' once, when the blocks reach the ground.
  tick(dtMs) {
    if (this.state !== 'falling') return null;
    this.elapsed += dtMs;
    if (this.elapsed < this.fallMs) return null;
    this.state = 'landed';
    return 'landed';
  }

  // The player takes the block in `lane`: { lane, ok } or null when nothing can be caught right now.
  catchLane(lane) {
    if (this.state !== 'falling' || !Number.isInteger(lane) || lane < 0 || lane >= this.count) return null;
    this.state = 'caught';
    return { lane, ok: lane === this.correct };
  }
}

export const moveLane = (lane, dx, count) => clamp(lane + dx, 0, count - 1);

// Centre x of a lane when `count` lanes share the width [x, x + w].
export const laneX = (x, w, lane, count) => x + ((lane + 0.5) * w) / count;

export const blockY = (progress, top, ground) => top + clamp(progress, 0, 1) * (ground - top);

// ---- numeric keypad ----

export const KEYPAD_LAYOUT = [['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '0'], ['back', 'hint', 'ok']];

// Focus grid and the typed digits. press() returns 'submit' (ok with at least one digit), 'hint', or null.
export class KeypadModel {
  constructor(maxDigits = 5, layout = KEYPAD_LAYOUT) {
    this.layout = layout;
    this.maxDigits = maxDigits;
    this.reset();
  }

  reset() {
    this.text = '';
    this.row = 0;
    this.col = 0;
  }

  get key() { return this.layout[this.row][this.col]; }

  // The column follows the key's horizontal position when the rows have different lengths.
  move(dx, dy) {
    if (dy) {
      const x = (this.col + 0.5) / this.layout[this.row].length;
      this.row = (this.row + dy + this.layout.length) % this.layout.length;
      this.col = Math.min(this.layout[this.row].length - 1, Math.floor(x * this.layout[this.row].length));
    }
    if (dx) this.col = (this.col + dx + this.layout[this.row].length) % this.layout[this.row].length;
  }

  focusKey(row, col) {
    this.row = row;
    this.col = col;
  }

  press(key = this.key) {
    if (key === 'back') this.text = this.text.slice(0, -1);
    else if (key === 'hint') return 'hint';
    else if (key === 'ok') return this.text ? 'submit' : null;
    else if (this.text.length < this.maxDigits) this.text = this.text === '0' ? key : this.text + key;
    return null;
  }
}

// ---- cosmetics ----

// Sparkle burst size of a right answer: grows with the streak up to a cap.
export const comboSparkles = (streak, combo) => Math.min(combo.sparkleMax, combo.sparkleBase + combo.sparklePerStreak * Math.max(0, streak - 1));

// Index of the player with more right answers, or -1 for a tie (including nothing right at all). Only cosmetic.
export function winnerOf(tallies) {
  const best = Math.max(...tallies.map(t => t.correct));
  const leaders = tallies.flatMap((t, i) => (t.correct === best ? [i] : []));
  return best > 0 && leaders.length === 1 ? leaders[0] : -1;
}
