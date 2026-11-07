// Checks the pure logic of the Deutsch minigame (minigames/deutschCore.js) and its data: the registry entry, the mode mix,
// which learning items fit the belt and the spelling mode (every Artikel item must yield its noun and the right bin),
// the belt model (movement, routing, missing, speed from difficulty and timeFactor), text matching with umlaut and case
// rules per item, the letter pad model and the i18n of the minigame.
// Run: node scripts/check-deutsch.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BINS, Belt, LETTER_LAYOUT, LetterPadModel, MODES, beltMsFor, beltable, binOf, crateX, foldUmlauts, makePlan, matchTyped, modeAt, nounOf, spellable, typable
} from '../minigames/deutschCore.js';
import { EngineCore, mulberry32 } from '../learning/engineCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = json('data/minigames.json');
const def = data.minigames.find(m => m.id === 'deutsch');
const o = def.options;
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const file = json('data/learning/grade3/deutsch.json');
const items = file.items;
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---- registry entry ----
assert.equal(def.subject, 'deutsch');
assert.ok(def.durationSeconds >= 60 && def.durationSeconds <= 75, '60-75 s');
assert.deepEqual(def.topics, ['deutsch']);
assert.equal(def.maxPlayers, 2);
assert.ok(!def.debug, 'a real minigame');
assert.ok(MODES.includes(o.mix.first) || o.mix.first === 'random');
assert.ok(['alternate', 'random', ...MODES].includes(o.mix.strategy));
assert.ok(o.belt.minMs < o.belt.baseMs && o.belt.baseMs < o.belt.maxMs && o.belt.perLevel > 0 && o.belt.perLevel < 0.2);
assert.deepEqual(o.beltTags, ['artikel']);
assert.deepEqual(o.spellTags, ['rechtschreibung', 'wortarten', 'mehrzahl', 'gegenteile', 'satzzeichen']);
for (const k of ['title', 'mode.belt', 'mode.spell', 'help.belt', 'help.spell', 'beltPrompt', 'beltHint', 'timeout', 'combo', 'winner', 'tie']) {
  assert.ok(de[`minigame.deutsch.${k}`] && en[`minigame.deutsch.${k}`], `minigame.deutsch.${k} in both languages`);
}
assert.ok(de['minigame.deutsch.winner'].includes('{name}') && en['minigame.deutsch.winner'].includes('{name}'));
assert.ok(de['minigame.deutsch.combo'].includes('{n}') && de['minigame.deutsch.beltHint'].includes('{n}'));

// ---- mode mix (the shared plan with this minigame's mode names) ----
{
  const rng = seeded(7);
  const ms = 70000;
  const alt = makePlan({ strategy: 'alternate', first: 'belt', switchAt: 0.5 }, rng, ms, MODES);
  assert.deepEqual([alt.first, alt.second, alt.switchMs], ['belt', 'spell', 35000], 'two halves');
  assert.equal(modeAt(alt, 34999), 'belt');
  assert.equal(modeAt(alt, 35000), 'spell');
  assert.equal(makePlan({ strategy: 'alternate', first: 'spell' }, rng, ms, MODES).second, 'belt', 'both modes appear');
  const firsts = new Set();
  for (let i = 0; i < 40; i++) {
    const p = makePlan({ strategy: 'alternate', first: 'random' }, rng, ms, MODES);
    assert.notEqual(p.first, p.second);
    assert.ok(MODES.includes(p.first) && MODES.includes(p.second));
    firsts.add(p.first);
  }
  assert.equal(firsts.size, 2, 'random first mode varies per run');
  assert.equal(makePlan({ strategy: 'spell' }, rng, ms, MODES).first, 'spell');
  const own = makePlan(o.mix, seeded(3), def.durationSeconds * 1000, MODES);
  assert.ok(MODES.includes(own.first) && own.switchMs > 0 && own.switchMs < def.durationSeconds * 1000, 'the configured mix is valid');
}

// ---- Artikel items on the belt (real content) ----
{
  const art = items.filter(q => q.tags[0] === 'artikel');
  assert.ok(art.length >= 70);
  assert.deepEqual(BINS.map(b => b.article), ['der', 'die', 'das']);
  assert.equal(new Set(BINS.map(b => b.color)).size, 3, 'three colours');
  assert.equal(new Set(BINS.map(b => b.shape)).size, 3, 'and three shapes for colour-blind players');
  const bins = [0, 0, 0];
  for (const q of art) {
    assert.ok(beltable(q), `${q.id}: fits the belt`);
    const noun = nounOf(q);
    const bin = binOf(q);
    assert.ok(/^[A-ZÄÖÜ]/.test(noun), `${q.id}: the noun "${noun}" is capitalised`);
    assert.ok(q.explain.de.includes(`${BINS[bin].article} ${noun}`), `${q.id}: the right bin ${BINS[bin].article} agrees with the explanation`);
    bins[bin]++;
  }
  assert.ok(bins.every(n => n >= 15), `every bin is used (${bins})`);
  for (let d = 1; d <= 5; d++) assert.ok(art.some(q => q.difficulty === d), `belt items at difficulty ${d}`);
  assert.equal(nounOf({ q: 'Wie heißt die Mehrzahl?' }), null);
  assert.equal(nounOf({ q: { de: 'Welcher Artikel passt? ___ Hund', en: 'x' } }), 'Hund');
  assert.ok(!beltable(items.find(q => q.tags[0] === 'wortarten')), 'other items do not fit the belt');
  assert.equal(binOf({ type: 'choice', answers: [{ text: 'der' }, { text: 'die', correct: true }, { text: 'das' }] }), 1);
  assert.equal(binOf({ type: 'choice', answers: [{ text: 'die', correct: true }, { text: 'der' }, { text: 'das' }] }), -1, 'bins follow the order der, die, das');
}

// ---- belt model ----
{
  const belt = new Belt();
  assert.equal(belt.state, 'idle');
  assert.equal(belt.route(0), null, 'nothing to sort while idle');
  belt.start(8000, 2);
  assert.equal(belt.state, 'falling', 'the noun is on the belt');
  assert.equal(belt.progress, 0);
  assert.equal(belt.tick(2000), null);
  assert.equal(belt.progress, 0.25, 'progress follows the elapsed time');
  assert.equal(belt.route(3), null, 'there are only three bins');
  assert.equal(belt.route(-1), null);
  assert.deepEqual(belt.route(1), { lane: 1, ok: false }, 'a wrong bin is reported, not punished');
  assert.equal(belt.state, 'sorted');
  assert.equal(belt.route(2), null, 'a noun is sorted only once');
  assert.equal(belt.tick(99999), null, 'a sorted noun no longer moves');
  belt.start(1000, 0);
  assert.deepEqual(belt.route(0), { lane: 0, ok: true });
  belt.start(1000, 1);
  assert.equal(belt.tick(999), null);
  assert.equal(belt.tick(1), 'missed', 'the noun reaches the end of the belt');
  assert.equal(belt.state, 'missed');
  assert.equal(belt.tick(10), null, 'missed is reported once');
  assert.equal(belt.route(1), null, 'too late');
  assert.equal(crateX(0, 10, 110), 10);
  assert.equal(crateX(0.5, 10, 110), 60);
  assert.equal(crateX(2, 10, 110), 110, 'the crate stays on the belt');
}

// ---- belt speed follows difficulty and timeFactor ----
{
  const at = (target, timeFactor) => beltMsFor(o.belt, { target, timeFactor });
  assert.equal(at(1, 1), o.belt.baseMs);
  assert.ok(at(5, 1) < at(3, 1) && at(3, 1) < at(1, 1), 'harder words ride faster');
  assert.ok(at(3, 1.5) > at(3, 1) && at(3, 1) > at(3, 0.85), 'a struggling child gets a slower belt, a strong one a faster one');
  for (let t = 1; t <= 5; t += 0.5) for (const tf of [0.5, 0.85, 1, 1.5, 2.5]) assert.ok(at(t, tf) >= o.belt.minMs && at(t, tf) <= o.belt.maxMs, 'within the limits');
}

// ---- spelling items ----
{
  const spell = items.filter(q => o.spellTags.includes(q.tags[0]));
  const fit = spell.filter(q => spellable(q, { maxChars: o.padMaxChars }));
  assert.equal(fit.length, spell.length, 'every spelling item fits the answer buttons or the letter pad');
  for (let d = 1; d <= 5; d++) assert.ok(spell.some(q => q.difficulty === d && q.type === 'choice'), `choice spelling items at difficulty ${d}`);
  const typed = items.filter(q => q.type === 'typed');
  assert.ok(typed.length >= 20, `typed spelling items (${typed.length})`);
  for (let d = 1; d <= 5; d++) assert.ok(typed.some(q => q.difficulty === d), `typed items at difficulty ${d}`);
  assert.ok(typed.every(q => typable(q, o.padMaxChars) && o.spellTags.includes(q.tags[0])), 'typed items are letter-pad words of the spelling tags');
  assert.ok(typed.some(q => q.caseSensitive) && typed.some(q => q.strictUmlaut) && typed.some(q => /[äöüÄÖÜß]/.test(q.answers[0].text) && !q.strictUmlaut), 'case and umlaut rules are used');
  assert.ok(!typable({ type: 'typed', answers: [{ text: 'a-b' }] }) && !typable({ type: 'typed', answers: [{ text: 'Donaudampfschiff' }] }), 'only short words of letters');
  assert.ok(!spellable({ type: 'choice', answers: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }] }), 'the panel shows at most four answers');
  const core = new EngineCore({ pools: { deutsch: { items } }, cfg: json('data/learning.json'), reactions: json('data/learning/reactions.json'), store: { get() {}, record() {} }, rng: mulberry32(2) });
  for (const q of typed) {
    for (const a of q.answers) {
      assert.equal(matchTyped(q, a.text), a.text, `${q.id}: the printed answer matches`);
      assert.ok(core.isCorrect(q, matchTyped(q, a.text)), `${q.id}: the engine accepts the matched answer`);
    }
    assert.equal(matchTyped(q, `${q.answers[0].text}x`), null, `${q.id}: a wrong word does not match`);
  }
}

// ---- typed answers: case and umlauts per item ----
{
  assert.equal(foldUmlauts('Mäuse Öl Übel Fuß'), 'Maeuse Oel Uebel Fuss');
  const noun = { caseSensitive: true, answers: [{ text: 'Sonne' }] };
  assert.equal(matchTyped(noun, 'Sonne'), 'Sonne');
  assert.equal(matchTyped(noun, '  Sonne  '), 'Sonne', 'spaces are trimmed');
  assert.equal(matchTyped(noun, 'sonne'), null, 'a noun needs its capital');
  assert.equal(matchTyped(noun, 'SONNE'), null, 'and no extra capitals');
  assert.equal(matchTyped(noun, ''), null);
  assert.equal(matchTyped(noun, '   '), null);
  const lower = { answers: [{ text: 'kalt' }] };
  assert.equal(matchTyped(lower, 'KALT'), 'kalt', 'without caseSensitive the case does not matter');
  assert.equal(matchTyped(lower, 'Kalt'), 'kalt');
  const um = { answers: [{ text: 'Häuser' }] };
  assert.equal(matchTyped(um, 'Häuser'), 'Häuser');
  assert.equal(matchTyped(um, 'Haeuser'), 'Häuser', 'ae stands for ä on a keyboard without umlauts');
  assert.equal(matchTyped(um, 'haeuser'), 'Häuser');
  assert.equal(matchTyped(um, 'Hauser'), null, 'a plain a is a spelling mistake');
  assert.equal(matchTyped({ answers: [{ text: 'groß' }] }, 'gross'), 'groß', 'ss stands for ß');
  const strict = { strictUmlaut: true, answers: [{ text: 'groß' }] };
  assert.equal(matchTyped(strict, 'groß'), 'groß');
  assert.equal(matchTyped(strict, 'gross'), null, 'a ß item wants the ß');
  const both = { caseSensitive: true, answers: [{ text: 'Äpfel' }] };
  assert.equal(matchTyped(both, 'Äpfel'), 'Äpfel');
  assert.equal(matchTyped(both, 'Aepfel'), 'Äpfel');
  assert.equal(matchTyped(both, 'äpfel'), null);
  assert.equal(matchTyped({ answers: [{ text: 'Bär' }, { text: 'Bären' }] }, 'baeren'), 'Bären', 'any accepted form');
  assert.equal(matchTyped({ answers: [{ text: { de: 'Ball', en: 'ball' } }] }, 'Ball'), 'Ball', 'localized answers use the German text');
}

// ---- letter pad ----
{
  const keys = LETTER_LAYOUT.flat();
  for (const k of ['ä', 'ö', 'ü', 'ß', 'shift', 'back', 'hint', 'ok']) assert.ok(keys.includes(k), `the pad has ${k}`);
  for (const c of 'abcdefghijklmnopqrstuvwxyz') assert.ok(keys.includes(c), `the pad has ${c}`);
  const pad = new LetterPadModel(6);
  assert.equal(pad.key, 'a');
  pad.press('h'); pad.press('a'); pad.press('u'); pad.press('s');
  assert.equal(pad.text, 'haus');
  pad.press('shift');
  assert.equal(pad.shift, true);
  pad.press('e');
  assert.equal(pad.text, 'hausE', 'shift capitalises one letter');
  assert.equal(pad.shift, false);
  pad.press('shift'); pad.press('shift');
  assert.equal(pad.shift, false, 'shift toggles');
  pad.press('x'); pad.press('y');
  assert.equal(pad.text, 'hausEx', 'at most maxChars letters');
  pad.press('back');
  assert.equal(pad.text, 'hausE');
  pad.type('ä'); pad.type('Ö'); pad.type('7'); pad.type('-'); pad.type(' ');
  assert.equal(pad.text, 'hausEä', 'only letters, incl. ä, are typed from a keyboard');
  assert.equal(pad.press('hint'), 'hint');
  assert.equal(pad.press('ok'), 'submit');
  pad.reset();
  assert.equal(pad.text, '');
  assert.equal(pad.press('ok'), null, 'nothing to submit');
  // focus grid: moving through rows of different length
  pad.focusKey(0, 9);
  pad.move(0, 3);
  assert.equal(pad.row, 3);
  assert.ok(pad.col <= 3 && pad.key, 'the column follows into the shorter control row');
  pad.move(1, 0);
  assert.ok(pad.key);
  pad.focusKey(2, 8);
  assert.equal(pad.key, 'ü');
  assert.equal(pad.press(), null);
  assert.equal(pad.text, 'ü');
}

console.log('check-deutsch: ok');
