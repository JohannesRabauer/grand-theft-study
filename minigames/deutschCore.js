// Pure logic of the Deutsch minigame (AD-20), no Phaser: the two modes, which learning items fit which mode, the
// conveyor-belt model (belt speed from the engine's difficulty and timeFactor, routing a noun to a bin), text input
// for spelling items (umlaut and case rules per item, the letter keypad model, accepted-answer matching). DeutschGame.js
// and the views bind it to the scene; scripts/check-deutsch.mjs drives it in node.
import { FallingBlocks, KeypadModel, fallMsFor } from './matheCore.js';

export { fallMsFor as beltMsFor, makePlan, modeAt, moveLane, laneX, comboSparkles, winnerOf } from './matheCore.js';

export const MODES = ['belt', 'spell'];

const textOf = (t, lang = 'de') => (typeof t === 'string' ? t : t[lang] ?? t.de);

// ---- Artikel-Sortierer ----

// The bins in the order of the content's answers (der, die, das): colour AND shape AND the word itself mark a bin, so
// colour-blind players can tell them apart.
export const BINS = [
  { article: 'der', color: '#4dabf7', shape: 'square' },
  { article: 'die', color: '#ff6b6b', shape: 'circle' },
  { article: 'das', color: '#51cf66', shape: 'triangle' }
];

// "Welcher Artikel passt? ___ Hund" -> "Hund"; null when the item has no such gap.
export function nounOf(q) {
  const m = /___\s+(\S.*)$/.exec(textOf(q.q));
  return m ? m[1].trim() : null;
}

// The bin (0-2) holding the item's right article, or -1.
export function binOf(q) {
  const right = q.type === 'choice' ? q.answers.findIndex(a => a.correct) : -1;
  return right >= 0 && BINS[right]?.article === textOf(q.answers[right].text) ? right : -1;
}

// An Artikel item the belt can show: a noun to read and the three article answers in the order of the bins.
export const beltable = q => q.type === 'choice' && q.answers.length === BINS.length && nounOf(q) !== null && binOf(q) >= 0;

// One noun on the belt. state: idle -> moving -> sorted | missed (it reached the end of the belt unsorted). The
// progress runs 0 (start) to 1 (end) over travelMs; sorting into a bin is the same single-use catch as in FallingBlocks.
export class Belt extends FallingBlocks {
  start(travelMs, correct) { super.start(travelMs, BINS.length, correct); }

  tick(dtMs) {
    const ended = super.tick(dtMs);
    if (ended) this.state = 'missed';
    return ended && 'missed';
  }

  // The player sends the noun into `bin`: { lane, ok } or null when nothing is on the belt.
  route(bin) {
    const r = this.catchLane(bin);
    if (r) this.state = 'sorted';
    return r;
  }
}

// Centre x of the noun crate on a belt from x0 to x1 (the crate stays fully on the belt).
export const crateX = (progress, x0, x1) => x0 + Math.min(1, Math.max(0, progress)) * (x1 - x0);

// ---- Rechtschreib-Detektiv ----

export const LETTER = /^[A-Za-zÄÖÜäöüß]$/;
const WORD = /^[A-Za-zÄÖÜäöüß]+$/;

// ASCII spelling of umlauts and ß as typed on keyboards without them.
export const foldUmlauts = s => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');

// A typed item the letter pad can answer: every accepted answer is one word of letters (with ä ö ü ß) that fits.
export const typable = (q, maxChars = 14) => q.type === 'typed' && q.answers.every(a => WORD.test(textOf(a.text)) && textOf(a.text).length <= maxChars);

// Spelling mode: choice items with answer buttons (at most `maxAnswers`) and typed items for the letter pad.
export const spellable = (q, { maxChars = 14, maxAnswers = 4 } = {}) => (q.type === 'choice' ? q.answers.length >= 2 && q.answers.length <= maxAnswers : typable(q, maxChars));

// Which accepted answer the typed text means, or null. Spaces are trimmed. Case follows the item: `caseSensitive`
// demands the exact capitals (nouns), otherwise case is ignored. Umlauts: "ae" for "ä", "ss" for "ß" ... count as the
// word unless the item has `strictUmlaut` (it is about the umlaut or the ß itself). The engine's isCorrect still has the
// last word (DeutschGame passes the matched answer on).
export function matchTyped(item, text) {
  const typed = String(text).trim().replace(/\s+/g, ' ');
  if (!typed) return null;
  const key = s => (item.caseSensitive ? s : s.toLowerCase());
  for (const a of item.answers) {
    const word = textOf(a.text);
    if (key(typed) === key(word) || (!item.strictUmlaut && key(typed) === key(foldUmlauts(word)))) return word;
  }
  return null;
}

export const LETTER_LAYOUT = [
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'],
  ['u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ü', 'ß'],
  ['shift', 'back', 'hint', 'ok']
];

// Letter pad: the KeypadModel focus grid with letters, one-shot shift (the next letter is a capital) and typing from a
// physical keyboard (type / backspace). press() returns 'submit', 'hint' or null like the numeric keypad.
export class LetterPadModel extends KeypadModel {
  constructor(maxChars = 14) {
    super(maxChars, LETTER_LAYOUT);
  }

  reset() {
    super.reset();
    this.shift = false;
  }

  press(key = this.key) {
    if (key === 'shift') { this.shift = !this.shift; return null; }
    if (!LETTER.test(key)) return super.press(key);
    this.type(key);
    return null;
  }

  // A letter from the pad or the keyboard: a held shift (pad) capitalises it once; the keyboard sends its own case.
  type(char) {
    if (!LETTER.test(char) || this.text.length >= this.maxDigits) return;
    this.text += this.shift ? char.toUpperCase() : char;
    this.shift = false;
  }

  backspace() { this.press('back'); }
}
