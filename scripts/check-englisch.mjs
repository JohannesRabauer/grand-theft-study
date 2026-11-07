// Checks the pure logic of the Englisch minigame (minigames/englischCore.js) and its data: the registry entry, which learning
// items become memory pairs (every vocabulary and sign item must yield its pair, match items their pairs), board dealing
// from the real engine, the memory board (flipping, matching, which mistakes count), the card cursor, sign plates and
// the i18n of the minigame.
// Run: node scripts/check-englisch.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODES, MemoryBoard, clashes, dealBoard, gridFor, makePlan, memoryable, modeAt, pairsOf, plateStyle, spellable, stepCard } from '../minigames/englischCore.js';
import { EngineCore, mulberry32 } from '../learning/engineCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = json('data/minigames.json');
const def = data.minigames.find(m => m.id === 'englisch');
const o = def.options;
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const file = json('data/learning/grade3/englisch.json');
const items = file.items;
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const text = (t, lang) => (typeof t === 'string' ? t : t[lang]);

// ---- registry entry ----
assert.equal(def.subject, 'englisch');
assert.ok(def.durationSeconds >= 60 && def.durationSeconds <= 75, '60-75 s');
assert.deepEqual(def.topics, ['englisch']);
assert.equal(def.maxPlayers, 2);
assert.ok(!def.debug, 'a real minigame');
assert.deepEqual(MODES, ['memory', 'signs']);
assert.ok(['alternate', 'random', ...MODES].includes(o.mix.strategy));
assert.ok(o.memory.pairs >= 3 && o.memory.pairs <= 4 && o.memory.peekMs >= 500 && o.memory.maxFaults >= 0 && o.memory.matchFaults >= o.memory.maxFaults);
assert.ok(o.cardMaxChars >= 10 && o.padMaxChars >= 6);
for (const t of [...o.memoryTags, ...o.signTags]) assert.ok(items.some(q => q.tags.includes(t)), `tag ${t} exists in englisch.json`);
for (const k of ['title', 'mode.memory', 'mode.signs', 'help.memory', 'help.signs', 'signAsk', 'combo', 'winner', 'tie']) {
  assert.ok(de[`minigame.englisch.${k}`] && en[`minigame.englisch.${k}`], `minigame.englisch.${k} in both languages`);
}
assert.ok(de['minigame.englisch.winner'].includes('{name}') && en['minigame.englisch.winner'].includes('{name}'));
{
  const plan = makePlan(o.mix, seeded(5), def.durationSeconds * 1000, MODES);
  assert.ok(MODES.includes(plan.first) && plan.first !== plan.second && modeAt(plan, 0) === plan.first && modeAt(plan, plan.switchMs) === plan.second, 'both modes in a run');
}

// ---- memory pairs from the real content ----
{
  const vocab = items.filter(q => q.tags[0] === 'vokabeln' && q.type === 'choice');
  assert.equal(vocab.length, 80);
  for (const q of vocab) {
    const p = pairsOf(q, o.cardMaxChars);
    assert.ok(p && p.length === 1, `${q.id}: a vocabulary item gives one pair`);
    const { en: w, de: g } = p[0];
    const explain = text(q.explain, 'de').toLowerCase();
    assert.ok(explain.includes(w.toLowerCase()) && explain.includes(g.toLowerCase()), `${q.id}: "${w}" = "${g}" agrees with the explanation "${explain}"`);
  }
  const signs = items.filter(q => q.tags.includes('signs') && q.type === 'choice');
  assert.ok(signs.length >= 25 && signs.every(q => q.sign), 'sign items carry their sign text');
  const signPairs = signs.map(q => pairsOf(q, o.cardMaxChars)).filter(Boolean);
  assert.ok(signPairs.length >= 20, `sign words on the cards (${signPairs.length})`);
  for (const q of signs) {
    const p = pairsOf(q, o.cardMaxChars);
    if (p) assert.equal(p[0].en, q.sign);
  }
  const matches = items.filter(q => q.type === 'match');
  const usable = matches.filter(q => memoryable(q, o.cardMaxChars));
  assert.ok(usable.length >= 4 && usable.length < matches.length, `match items on boards (${usable.length} of ${matches.length}; clue items are too long)`);
  for (const q of usable) {
    const p = pairsOf(q, o.cardMaxChars);
    assert.ok(p.length >= 3 && p.length <= 4);
    assert.equal(new Set(p.map(x => x.en)).size, p.length);
  }
  const pool = items.filter(q => q.tags.some(t => o.memoryTags.includes(t)) && memoryable(q, o.cardMaxChars));
  assert.ok(pool.length >= 100, `memory pool (${pool.length})`);
  for (let d = 1; d <= 4; d++) assert.ok(pool.some(q => q.difficulty === d), `memory items at difficulty ${d}`);
  // rules of pairsOf
  const choice = (q, a) => ({ type: 'choice', tags: ['vokabeln'], q: { de: q }, answers: [{ text: a, correct: true }, { text: 'x' }] });
  assert.deepEqual(pairsOf(choice('Was heißt "Hund" auf Englisch?', 'dog')), [{ en: 'dog', de: 'Hund' }]);
  assert.deepEqual(pairsOf(choice('Was heißt "dog" auf Deutsch?', 'Hund')), [{ en: 'dog', de: 'Hund' }]);
  assert.equal(pairsOf(choice('Wie geht es dir?', 'fine')), null, 'other questions are no pairs');
  assert.equal(pairsOf(choice('Was heißt "Straßenbahnhaltestelle" auf Englisch?', 'tram stop'), 14), null, 'cards must fit');
  assert.equal(pairsOf({ type: 'match', pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }] }), null, 'a match item needs 3-4 pairs');
  assert.equal(pairsOf({ type: 'match', pairs: [{ left: 'a', right: 'b' }, { left: 'a', right: 'd' }, { left: 'c', right: 'e' }] }), null, 'no repeated card text');
  assert.ok(clashes([{ en: 'Park', de: 'Park' }], { en: 'park', de: 'x' }) && !clashes([{ en: 'cat', de: 'Katze' }], { en: 'dog', de: 'Hund' }));
}

// ---- dealing boards with the real engine ----
{
  const core = new EngineCore({ pools: { englisch: file }, cfg: json('data/learning.json'), reactions: json('data/learning/reactions.json'), store: { get() {}, record() {} }, rng: mulberry32(11) });
  const draw = filter => core.next('englisch', { player: 0, context: 'lesson', filter });
  let wholes = 0;
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const d = dealBoard(draw, { tags: o.memoryTags, maxChars: o.cardMaxChars, pairs: o.memory.pairs });
    if (d.whole) {
      wholes++;
      assert.equal(d.qs.length, 1);
      assert.equal(d.qs[0].type, 'match');
      assert.ok(d.entries.length >= 3 && d.entries.length <= 4);
    } else {
      assert.equal(d.qs.length, o.memory.pairs, 'single items fill the board');
      assert.equal(new Set(d.qs.map(q => q.id)).size, d.qs.length, 'distinct items');
      d.qs.forEach((q, k) => assert.deepEqual(d.entries[k], pairsOf(q, o.cardMaxChars)[0], 'entry k belongs to question k'));
      assert.equal(new Set(d.entries.map(e => e.en.toLowerCase())).size, d.entries.length);
      assert.equal(new Set(d.entries.map(e => e.de.toLowerCase())).size, d.entries.length);
    }
    for (const q of d.qs) seen.add(q.id);
    assert.ok(d.qs.every(q => q.meta?.topic === 'englisch' && q.meta.bothLangs), 'engine questions');
  }
  assert.ok(wholes > 0, `match items are dealt as boards (${wholes}/300)`);
  assert.ok(seen.size >= 40, `variety (${seen.size} items)`);
  assert.throws(() => dealBoard(() => null, { tags: ['x'], maxChars: 14, pairs: 4 }), /no memory item/);
}

// ---- the memory board ----
{
  const entries = [{ en: 'cat', de: 'Katze' }, { en: 'dog', de: 'Hund' }, { en: 'red', de: 'rot' }, { en: 'blue', de: 'blau' }];
  const b = new MemoryBoard(entries, seeded(3));
  assert.equal(b.cards.length, 8);
  for (let e = 0; e < 4; e++) {
    const mine = b.cards.filter(c => c.entry === e);
    assert.deepEqual(mine.map(c => c.side).sort(), ['de', 'en'], 'one English and one German card per entry');
    assert.deepEqual(mine.map(c => c.text).sort(), [entries[e].de, entries[e].en].sort());
  }
  assert.notDeepEqual(b.cards.map(c => c.entry), [0, 0, 1, 1, 2, 2, 3, 3], 'cards are shuffled');
  const idx = (entry, side) => b.cards.findIndex(c => c.entry === entry && c.side === side);
  assert.deepEqual(b.flip(idx(0, 'en')), { kind: 'first' });
  assert.equal(b.flip(idx(0, 'en')).kind, 'ignored', 'a face-up card is ignored');
  assert.equal(b.flip(99).kind, 'ignored');
  // first look: a miss with new cards is no mistake
  const miss1 = b.flip(idx(1, 'de'));
  assert.deepEqual(miss1, { kind: 'miss', a: idx(0, 'en'), b: idx(1, 'de'), fault: false });
  assert.ok(b.locked && b.flip(idx(2, 'en')).kind === 'ignored', 'a miss is locked until settle');
  assert.ok(b.up[idx(0, 'en')] && b.up[idx(1, 'de')]);
  b.settle();
  assert.ok(!b.locked && !b.up[idx(0, 'en')] && !b.up[idx(1, 'de')], 'settle turns both cards down');
  assert.equal(b.totalFaults(), 0);
  // both cards known and still mismatched: a mistake for both entries
  b.flip(idx(0, 'en'));
  const miss2 = b.flip(idx(1, 'de'));
  assert.equal(miss2.fault, true);
  assert.deepEqual(b.faults, [1, 1, 0, 0]);
  b.settle();
  // a known card with a new one is exploring, not a mistake
  b.flip(idx(0, 'en'));
  assert.equal(b.flip(idx(2, 'de')).fault, false);
  b.settle();
  assert.deepEqual(b.faults, [1, 1, 0, 0]);
  assert.equal(b.misses, 3);
  // a match
  b.flip(idx(0, 'en'));
  assert.deepEqual(b.flip(idx(0, 'de')), { kind: 'match', entry: 0, complete: false });
  assert.ok(b.done[idx(0, 'en')] && b.done[idx(0, 'de')] && b.matched[0]);
  assert.equal(b.flip(idx(0, 'en')).kind, 'ignored', 'matched cards stay');
  assert.ok(!b.locked, 'a match does not lock');
  for (const e of [1, 2]) { b.flip(idx(e, 'en')); assert.equal(b.flip(idx(e, 'de')).kind, 'match'); }
  assert.equal(b.complete, false);
  b.flip(idx(3, 'de'));
  assert.deepEqual(b.flip(idx(3, 'en')), { kind: 'match', entry: 3, complete: true });
  assert.equal(b.complete, true);
  assert.equal(b.totalFaults(), 2);
  // three pairs: a smaller board
  assert.equal(new MemoryBoard(entries.slice(0, 3), seeded(1)).cards.length, 6);
  assert.deepEqual([gridFor(3), gridFor(4)], [{ cols: 3, rows: 2 }, { cols: 4, rows: 2 }]);
}

// ---- the card cursor ----
{
  const done = [false, false, true, false, false, false, false, false];
  assert.equal(stepCard(0, 1, 0, 4, 2, done), 1);
  assert.equal(stepCard(1, 1, 0, 4, 2, done), 3, 'finished cards are skipped');
  assert.equal(stepCard(3, 1, 0, 4, 2, done), 0, 'wraps around a row');
  assert.equal(stepCard(0, -1, 0, 4, 2, done), 3);
  assert.equal(stepCard(1, 0, 1, 4, 2, done), 5, 'down');
  assert.equal(stepCard(5, 0, 1, 4, 2, done), 1, 'wraps vertically');
  assert.equal(stepCard(2, 0, 1, 4, 2, done), 6);
  assert.equal(stepCard(4, 1, 0, 4, 2, new Array(8).fill(true)), 4, 'nothing left: stay');
}

// ---- Schilder-Check items and plates ----
{
  const signs = items.filter(q => o.signTags.some(t => q.tags.includes(t)));
  assert.ok(signs.length >= 30);
  for (const q of signs) assert.ok(spellable(q, { maxChars: o.padMaxChars, maxAnswers: 4 }), `${q.id}: fits the answer buttons or the letter pad`);
  assert.ok(signs.some(q => q.type === 'typed') && signs.some(q => q.type === 'choice' && q.sign), 'both input kinds');
  for (const q of signs.filter(q => q.type === 'choice')) assert.ok(q.sign && /^[A-Z0-9 ]+$/.test(q.sign), `${q.id}: a plate word in capitals`);
  assert.deepEqual(['STOP', 'EXIT', 'BAKERY', 'PUSH'].map(plateStyle), [0, 1, 2, 3], 'warning red, exit green, shop blue, rest dark');
  assert.equal(plateStyle('NO PARKING'), 0);
  assert.equal(plateStyle('open'), 1, 'case does not matter');
  const styles = new Set(items.filter(q => q.sign).map(q => plateStyle(q.sign)));
  assert.equal(styles.size, 4, 'all four plate styles occur in the content');
}

console.log('check-englisch: ok');
