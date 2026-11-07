// Pure logic of the Englisch minigame (AD-20), no Phaser: the two modes (Vokabel-Memory, Schilder-Check), which learning
// items become memory pairs or sign questions, the memory board (dealing, flipping, matching, which mistakes count) and
// the sign-plate colouring. The letter pad for typed sign items is the Deutsch one (deutschCore.js). EnglischGame.js and
// the views bind it to the scene; scripts/check-englisch.mjs drives it in node.
import { shuffle } from './matheCore.js';

export { makePlan, modeAt, comboSparkles, winnerOf } from './matheCore.js';
export { LETTER, LetterPadModel, matchTyped, spellable, typable } from './deutschCore.js';

export const MODES = ['memory', 'signs'];

const textIn = (t, lang) => (typeof t === 'string' ? t : t[lang] ?? t.de);
const ASK = /^Was heißt "([^"]+)" auf (Englisch|Deutsch)\?$/;
const sameWord = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---- memory pairs from learning items ----

// The English/German pairs an item yields for the memory board, or null: a match item gives its 3-4 pairs, a vocabulary
// choice item ("Was heißt "X" auf Englisch/Deutsch?") and a sign item (the sign text and its German meaning) one pair
// each. Every card text must fit a card (maxChars).
export function pairsOf(q, maxChars = 14) {
  let pairs = null;
  if (q.type === 'match') {
    pairs = q.pairs.map(p => ({ en: textIn(p.left, 'en'), de: textIn(p.right, 'de') }));
  } else if (q.type === 'choice') {
    const right = q.answers.find(a => a.correct);
    const asked = ASK.exec(textIn(q.q, 'de'));
    if (right && asked) {
      const answer = textIn(right.text, asked[2] === 'Englisch' ? 'en' : 'de');
      pairs = [asked[2] === 'Englisch' ? { en: answer, de: asked[1] } : { en: asked[1], de: answer }];
    } else if (right && q.sign && q.tags?.includes('signs')) {
      pairs = [{ en: q.sign, de: textIn(right.text, 'de') }];
    }
  }
  if (!pairs || pairs.length < 1 || pairs.length > 4) return null;
  if (pairs.length > 1 && (pairs.length < 3 || new Set(pairs.map(p => p.en.toLowerCase())).size !== pairs.length || new Set(pairs.map(p => p.de.toLowerCase())).size !== pairs.length)) return null;
  return pairs.every(p => p.en && p.de && p.en.length <= maxChars && p.de.length <= maxChars) ? pairs : null;
}

export const memoryable = (q, maxChars) => pairsOf(q, maxChars) !== null;

// Do two cards of different boards clash (the same visible text on one side)? Used when a board is put together from
// several single-pair items.
export const clashes = (list, pair) => list.some(p => sameWord(p.en, pair.en) || sameWord(p.de, pair.de));

// Deals the questions of one board: draw(filter) is the engine's next() for one player. A match item is the whole board; else
// single-pair items are drawn until the board has `pairs` of them (distinct, no two cards with the same visible text on a
// side). Returns { qs, entries, whole }: entries[i] is the pair of qs[i] (a match item: all its pairs, qs = [item]).
export function dealBoard(draw, { tags, maxChars, pairs }) {
  const tagged = q => q.tags.some(t => tags.includes(t)) && memoryable(q, maxChars);
  const first = draw(tagged);
  if (!first) throw new Error('englisch: no memory item found');
  if (first.type === 'match') return { qs: [first], entries: pairsOf(first, maxChars), whole: true };
  const qs = [first];
  const entries = pairsOf(first, maxChars);
  const ids = new Set([first.id]);
  for (let tries = 0; qs.length < pairs && tries < 30; tries++) {
    const q = draw(c => c.type === 'choice' && tagged(c) && !ids.has(c.id) && !clashes(entries, pairsOf(c, maxChars)[0]));
    if (!q) break;
    ids.add(q.id);
    qs.push(q);
    entries.push(...pairsOf(q, maxChars));
  }
  if (qs.length < 3) throw new Error('englisch: could not deal a memory board');
  return { qs, entries, whole: false };
}

// ---- the memory board ----

// The grid of a board: 3 columns for six cards, else 4 (two rows each).
export const gridFor = pairCount => ({ cols: pairCount <= 3 ? 3 : 4, rows: 2 });

// One deal: entries [{ en, de }] become two cards each (one English, one German), shuffled. Flipping two cards that belong
// together matches them; two that do not stay face up until settle() turns them down (the view waits a moment so the
// player can look). A miss only counts as a mistake (`faults` of both entries) when both cards had been seen before, so
// finding cards for the first time is never punished.
export class MemoryBoard {
  constructor(entries, rng = Math.random) {
    this.entries = entries;
    this.cards = [];
    entries.forEach((e, entry) => {
      this.cards.push({ entry, side: 'en', text: e.en });
      this.cards.push({ entry, side: 'de', text: e.de });
    });
    shuffle(this.cards, rng);
    this.up = this.cards.map(() => false);
    this.done = this.cards.map(() => false);
    this.seen = this.cards.map(() => false);
    this.faults = entries.map(() => 0);
    this.matched = entries.map(() => false);
    this.first = -1;
    this.pending = null; // the two face-up cards of a miss
    this.misses = 0;
  }

  get locked() { return this.pending !== null; }

  get complete() { return this.matched.every(Boolean); }

  // Turns card i up. Returns { kind: 'ignored' } (already up, done or waiting), { kind: 'first' }, { kind: 'match', entry,
  // complete } or { kind: 'miss', a, b, fault }.
  flip(i) {
    if (this.pending || !this.cards[i] || this.up[i] || this.done[i]) return { kind: 'ignored' };
    this.up[i] = true;
    if (this.first < 0) { this.first = i; return { kind: 'first' }; }
    const a = this.first;
    this.first = -1;
    if (this.cards[a].entry === this.cards[i].entry) {
      const entry = this.cards[i].entry;
      this.done[a] = this.done[i] = true;
      this.seen[a] = this.seen[i] = true;
      this.matched[entry] = true;
      return { kind: 'match', entry, complete: this.complete };
    }
    const fault = this.seen[a] && this.seen[i];
    if (fault) { this.faults[this.cards[a].entry]++; this.faults[this.cards[i].entry]++; }
    this.seen[a] = this.seen[i] = true;
    this.misses++;
    this.pending = [a, i];
    return { kind: 'miss', a, b: i, fault };
  }

  // Turns the two cards of a miss face down again.
  settle() {
    if (!this.pending) return;
    for (const c of this.pending) this.up[c] = false;
    this.pending = null;
  }

  totalFaults() { return this.faults.reduce((a, b) => a + b, 0); }
}

// Next free card from `from` in the direction (dx, dy) on a cols x rows grid, skipping finished cards; wraps around.
// `from` itself when every other card is finished.
export function stepCard(from, dx, dy, cols, rows, done) {
  let c = from % cols;
  let r = Math.floor(from / cols);
  for (let n = 0; n < cols * rows; n++) {
    c = (c + dx + cols) % cols;
    r = (r + dy + rows) % rows;
    const i = r * cols + c;
    if (!done[i]) return i;
  }
  return from;
}

// ---- sign plates ----

// A plate style (index into the view's palette) from the sign text, stable per sign: safety words red, entrances and exits
// green, shops blue, everything else white-on-dark.
const RED = /^(STOP|DANGER|NO |KEEP|WET|PRIVATE|SLOW)/;
const GREEN = /(EXIT|WAY OUT|ENTRANCE|OPEN|WELCOME|FREE)/;
const BLUE = /(BAKERY|LIBRARY|SHOP|SALE|BUS|TOILET)/;
export function plateStyle(text) {
  const t = text.toUpperCase();
  return RED.test(t) ? 0 : GREEN.test(t) ? 1 : BLUE.test(t) ? 2 : 3;
}
