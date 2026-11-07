// Pure logic of the Science minigame (AD-20), no Phaser: the two modes, which Science items play as a sorting task, a circuit
// puzzle or a Quick-Quiz question, the sorting model (category bins, item order, judging by the engine, which items went
// wrong) and the layout of each kind in a player's area. The circuit solver is circuitCore.js; ScienceGame.js and the views
// bind it to the scene; scripts/check-science.mjs drives it in node.
import { puzzleFix } from './circuitCore.js';

export { makePlan, modeAt, comboSparkles, winnerOf, shuffle } from './matheCore.js';
export { puzzleFix };

export const MODES = ['sort', 'circuit'];

// ---- which items play as what ----

export const MAX_BINS = 4;
export const MAX_SORT_ITEMS = 6;

// Sort items with 2-4 categories, and match items (their right sides become the bins).
export function sortable(q) {
  if (q.type === 'sort') return q.categories.length >= 2 && q.categories.length <= MAX_BINS && q.sortItems.length <= MAX_SORT_ITEMS;
  return q.type === 'match' && q.pairs.length >= 2 && q.pairs.length <= MAX_BINS;
}

// A circuit item the player can repair (see puzzleFix).
export const circuitable = q => puzzleFix(q) !== null;

// A choice item the answer panel can show; circuit puzzles keep to their own mode.
export const quizzable = q => q.type === 'choice' && q.answers.length >= 2 && q.answers.length <= 4 && !circuitable(q);

// Which kind of task comes next: a Quick-Quiz question after `every` puzzles in a row, else the current mode.
export const kindFor = (mode, sincePuzzle, every) => (sincePuzzle >= every ? 'quiz' : mode);

// ---- the sorting model ----

// A localized sort or match item (ctx.learning.localize) as bins and items. `cat` is what the engine's isCorrect expects as
// the response for that item: the category id (sort) or the index of the right side (match).
export function sortSet(q, view) {
  if (q.type === 'sort') {
    return { cats: view.categories.map(c => ({ id: c.id, label: c.label })), items: view.sortItems.map(s => ({ text: s.text, cat: s.category })) };
  }
  return { cats: view.pairs.map((p, i) => ({ id: i, label: p.right })), items: view.pairs.map((p, i) => ({ text: p.left, cat: i })) };
}

// The bin index an item belongs to.
export const binOf = (set, item) => set.cats.findIndex(c => c.id === set.items[item].cat);

// Indexes of the items that were put into a wrong bin; `resp` holds the chosen category id per item.
export const misplaced = (set, resp) => set.items.flatMap((it, i) => (resp[i] === it.cat ? [] : [i]));

// The bin whose rectangle holds the point, or -1.
export const binAt = (rects, x, y) => rects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

// A bin focus step with wrap-around.
export const stepBin = (focus, dx, count) => (focus + dx + count) % count;

// ---- layout of the kinds inside a player's area (rect from layoutRects: 468 wide for one player, about 230 for two) ----

const GAP = 6;

// Where the parts go: sort = question, card (the item to place), the bins as test tubes, note below; circuit = question,
// the board and the note; quiz = the answer panel over the whole area.
export function layoutFor(rect, kind, bins = 3) {
  const question = { x: rect.x + 6, y: rect.y + 4, w: rect.w - 12 };
  if (kind === 'quiz') return { panel: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } };
  const note = y => ({ x: rect.x + 6, y: rect.y + y, w: rect.w - 12 });
  if (kind === 'circuit') return { question, board: { x: rect.x + 4, y: rect.y + 34, w: rect.w - 8, h: 124 }, note: note(164) };
  const cardW = Math.min(rect.w - 24, 170);
  const binW = (rect.w - 8 - GAP * (bins - 1)) / bins;
  return {
    question,
    card: { x: rect.x + (rect.w - cardW) / 2, y: rect.y + 36, w: cardW, h: 32 },
    bins: Array.from({ length: bins }, (_, i) => ({ x: rect.x + 4 + i * (binW + GAP), y: rect.y + 76, w: binW, h: 72 })),
    note: note(154)
  };
}
