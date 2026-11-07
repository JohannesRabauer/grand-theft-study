// Checks the Science minigame logic: the circuit solver (minigames/circuitCore.js) on hand-made circuits (open switch, missing
// wire, no battery, two repairs, bridges), the loop geometry, every circuit item of data/learning/grade3/science.json (lit flag
// recomputed, declared `fix` solves it and is minimal, derived puzzles), the sorting model and its judging through the
// engine for all sort and match items, which items play as what, the layouts and the registry entry.
// Run: node scripts/check-science.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyze, applyFix, buildGraph, conducts, hasCycle, loopPath, pickCell, placeCells, pointAt, puzzleFix, repaired, solveFix, solved, stretch, CELL_HALF
} from '../minigames/circuitCore.js';
import {
  MAX_BINS, MODES, binAt, binOf, circuitable, kindFor, layoutFor, makePlan, misplaced, modeAt, quizzable, sortSet, sortable, stepBin
} from '../minigames/scienceCore.js';
import { layoutRects } from '../minigames/minigameCore.js';
import { EngineCore, mulberry32 } from '../learning/engineCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const science = json('data/learning/grade3/science.json');
const def = json('data/minigames.json').minigames.find(m => m.id === 'science');
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const cfgLearning = json('data/learning.json');
const core = new EngineCore({ pools: { science }, cfg: cfgLearning, reactions: json('data/learning/reactions.json'), store: { get() {}, record() {} }, rng: mulberry32(5) });

const cell = (id, kind, extra = {}) => ({ id, kind, ...extra });
const loop = (...kinds) => kinds.map((k, i) => (typeof k === 'string' ? cell(`c${i}`, k) : { id: `c${i}`, ...k }));

// ---- registry entry ----
assert.equal(def.subject, 'science');
assert.ok(def.durationSeconds >= 60 && def.durationSeconds <= 75, '60-75 s');
assert.deepEqual(def.topics, ['science']);
assert.equal(def.maxPlayers, 2);
assert.ok(!def.debug);
assert.deepEqual(MODES, ['sort', 'circuit']);
assert.ok(def.options.quizEvery >= 1 && def.options.litMs > 0 && def.options.factExtraMs >= 0 && def.options.celebrateMs > 0);
for (const k of ['title', 'mode.sort', 'mode.circuit', 'mode.quiz', 'help.sort', 'help.circuit', 'circuit.ask', 'circuit.partial', 'circuit.lit', 'belongs', 'combo', 'winner', 'tie',
  'why.battery', 'why.bulb', 'why.wire', 'why.switch-closed', 'why.bridge-ok', 'why.extra', 'cell.battery', 'cell.bulb', 'cell.wire', 'cell.gap', 'cell.switch', 'cell.bridge']) {
  assert.ok(de[`minigame.science.${k}`] && en[`minigame.science.${k}`], `minigame.science.${k} in both languages`);
}
assert.ok(de['minigame.fact'].includes('{fact}') && en['minigame.fact'].includes('{fact}'));
assert.ok(de['minigame.science.winner'].includes('{name}') && en['minigame.science.winner'].includes('{name}'));
assert.ok(de['minigame.science.belongs'].includes('{item}') && de['minigame.science.belongs'].includes('{bin}'));

// ---- the solver on hand-made circuits ----
{
  assert.equal(analyze(loop('battery', 'wire', 'bulb', { kind: 'switch', state: 'closed' })).lit, true, 'a closed loop lights');
  const open = analyze(loop('battery', 'bulb', { kind: 'switch', state: 'open' }));
  assert.equal(open.lit, false, 'an open switch stops the current');
  assert.deepEqual(open.blockers, [{ id: 'c2', kind: 'switch', why: 'switch' }]);
  const gap = analyze(loop('battery', 'gap', 'bulb'));
  assert.equal(gap.lit, false, 'a missing wire (gap) stops the current');
  assert.deepEqual(gap.blockers.map(b => b.why), ['gap']);
  const noBattery = analyze(loop('bulb', 'wire', { kind: 'switch', state: 'closed' }));
  assert.equal(noBattery.lit, false, 'no battery, no current');
  assert.deepEqual(noBattery.missing, ['battery']);
  assert.deepEqual(noBattery.blockers, [], 'nothing to repair when a part is missing');
  assert.deepEqual(analyze(loop('battery', 'wire')).missing, ['bulb']);
  assert.equal(analyze(loop('battery', 'wire')).lit, false, 'no bulb, nothing lights');
  assert.equal(analyze(loop('battery', 'battery', 'bulb', { kind: 'switch', state: 'closed' })).lit, true, 'two batteries are fine');
  assert.equal(analyze(loop('battery', 'bulb')).lit, true, 'the smallest loop');
  assert.equal(analyze(loop('battery')).lit, false);
  assert.equal(analyze([]).lit, false);
  assert.equal(analyze(loop('battery', { kind: 'bridge', conducts: true }, 'bulb')).lit, true, 'a paper clip bridge conducts');
  const eraser = analyze(loop('battery', { kind: 'bridge', conducts: false }, 'bulb'));
  assert.equal(eraser.lit, false, 'an eraser bridge does not');
  assert.equal(eraser.blockers[0].why, 'insulator');
  // the graph
  const g = buildGraph(loop('battery', 'gap', 'bulb'));
  assert.equal(g.nodes, 3);
  assert.deepEqual(g.edges.map(e => [e.a, e.b, e.on]), [[0, 1, true], [1, 2, false], [2, 0, true]]);
  assert.equal(hasCycle(g), false, 'a ring with one dead edge has no cycle');
  assert.equal(hasCycle(buildGraph(loop('battery', 'wire', 'bulb'))), true);
  assert.equal(conducts(cell('s', 'switch')), false, 'a switch without state is open');

  // repairs
  assert.equal(repaired(cell('s', 'switch', { state: 'closed' })), null);
  assert.deepEqual(repaired(cell('s', 'switch', { state: 'open' })), { id: 's', kind: 'switch', state: 'closed' });
  assert.deepEqual(repaired(cell('g', 'gap')), { id: 'g', kind: 'wire' });
  assert.deepEqual(repaired(cell('b', 'bridge', { conducts: false, item: { de: 'x', en: 'x' } })), { id: 'b', kind: 'wire' });
  assert.equal(repaired(cell('b', 'bridge', { conducts: true })), null);
  for (const k of ['battery', 'bulb', 'wire']) assert.equal(repaired(cell('x', k)), null, `${k} needs no repair`);
  const cells = loop('battery', { kind: 'switch', state: 'open' }, 'bulb', { kind: 'switch', state: 'open' });
  const orig = JSON.stringify(cells);
  assert.equal(applyFix(cells, 'nope'), null);
  assert.equal(applyFix(cells, 'c0'), null);
  const one = applyFix(cells, 'c1');
  assert.equal(JSON.stringify(cells), orig, 'applyFix never mutates');
  assert.equal(analyze(one).lit, false, 'two repairs needed: one is not enough');

  // two fix cells
  assert.deepEqual(solveFix(cells), ['c1', 'c3']);
  assert.equal(analyze(solved(cells, ['c1', 'c3'])).lit, true);
  const first = pickCell(cells, ['c1', 'c3'], 'c1');
  assert.equal(first.kind, 'fix');
  assert.equal(first.done, false, 'the first of two repairs does not light the bulb yet');
  const second = pickCell(first.cells, ['c1', 'c3'], 'c3');
  assert.equal(second.kind, 'fix');
  assert.equal(second.done, true, 'the second one does');
  assert.equal(analyze(second.cells).lit, true);
  // wrong picks, every reason
  const mixed = loop('battery', { kind: 'switch', state: 'closed' }, 'wire', 'bulb', 'gap', { kind: 'bridge', conducts: true });
  for (const [id, why] of [['c0', 'battery'], ['c1', 'switch-closed'], ['c2', 'wire'], ['c3', 'bulb'], ['c5', 'bridge-ok']]) {
    assert.deepEqual(pickCell(mixed, ['c4'], id), { kind: 'wrong', why }, `${id} -> ${why}`);
  }
  assert.equal(pickCell(mixed, ['c4'], 'c4').done, true);
  assert.equal(pickCell(loop('battery', 'gap', 'gap', 'bulb'), ['c1'], 'c2').why, 'extra', 'a broken part the puzzle does not need');
  assert.equal(solveFix(loop('wire', 'gap', 'wire')), null, 'repairs cannot supply a missing battery or bulb');
  assert.equal(solveFix(loop('battery', 'bulb')), null, 'nothing to repair');
  assert.equal(puzzleFix({ type: 'choice' }), null);
}

// ---- the drawn loop ----
{
  const path = loopPath(10, 20, 200, 80);
  assert.equal(path.total, 560);
  const p = pointAt(path, 0);
  assert.deepEqual([p.x, p.y, p.edge], [10, 20, 0]);
  assert.deepEqual(pointAt(path, 200 + 40), { x: 210, y: 60, edge: 1 });
  assert.deepEqual(pointAt(path, 200 + 80 + 100), { x: 110, y: 100, edge: 2 });
  assert.equal(pointAt(path, 560 + 5).x, 15, 'the loop wraps');
  for (const n of [2, 3, 4, 5, 6]) {
    for (const [w, h] of [[200, 80], [186, 88], [420, 88]]) {
      const pa = loopPath(0, 0, w, h);
      const slots = placeCells(pa, n);
      assert.equal(slots.length, n);
      slots.forEach((s, i) => {
        const pt = pointAt(pa, s.s);
        const along = pt.edge % 2 === 0 ? pt.x : pt.y;
        const len = pt.edge % 2 === 0 ? w : h;
        assert.ok(along >= CELL_HALF && along <= len - CELL_HALF || (along > 0 && along < len), `${n} cells ${w}x${h}: cell ${i} sits on its edge`);
        assert.equal(s.dir, pt.edge % 2 === 0 ? 'h' : 'v');
        if (i > 0) assert.ok(s.s - slots[i - 1].s >= 2 * CELL_HALF - 0.01, `${n} cells ${w}x${h}: symbols ${i - 1} and ${i} do not overlap`);
      });
      if (n >= 2) assert.ok(slots[0].s + pa.total - slots[n - 1].s >= 2 * CELL_HALF - 0.01, `${n} cells ${w}x${h}: the loop closes without overlap`);
    }
  }
  const pa = loopPath(0, 0, 100, 50);
  const piece = stretch(pa, 80, 130); // round the top-right corner
  assert.deepEqual(piece.map(q => [q.x, q.y]), [[80, 0], [100, 0], [100, 30]]);
  const wrap = stretch(pa, 280, 20); // round the top-left corner (distance 300 = start)
  assert.deepEqual(wrap.map(q => [q.x, q.y]), [[0, 20], [0, 0], [20, 0]]);
  assert.equal(stretch(pa, 10, 20).length, 2, 'a straight piece is two points');
}

// ---- every circuit item ----
{
  const circuits = science.items.filter(q => q.circuit);
  assert.equal(circuits.length, 17);
  let fixItems = 0;
  let derived = 0;
  for (const q of circuits) {
    const c = q.circuit;
    const ids = new Set(c.cells.map(x => x.id));
    assert.equal(ids.size, c.cells.length, `${q.id}: unique cell ids`);
    assert.equal(analyze(c.cells).lit, c.lit, `${q.id}: lit matches the solver`);
    const fix = puzzleFix(q);
    if (c.ask === 'fix') {
      fixItems++;
      assert.equal(c.lit, false);
      assert.ok(Array.isArray(c.fix) && c.fix.length >= 1, `${q.id}: has a fix`);
      assert.ok(c.fix.every(id => ids.has(id)), `${q.id}: fix ids exist`);
      assert.deepEqual([...fix].sort(), [...solveFix(c.cells)].sort(), `${q.id}: the declared fix is what the solver finds`);
      assert.equal(analyze(solved(c.cells, c.fix)).lit, true, `${q.id}: the declared fix lights the bulb`);
      for (const id of c.fix) assert.equal(analyze(solved(c.cells, c.fix.filter(x => x !== id))).lit, false, `${q.id}: ${id} is needed`);
      // playing the solution cell by cell through pickCell
      let now = c.cells;
      c.fix.forEach((id, i) => {
        const r = pickCell(now, c.fix, id);
        assert.equal(r.kind, 'fix', `${q.id}: ${id} is a repair`);
        assert.equal(r.done, i === c.fix.length - 1, `${q.id}: the bulb lights with the last repair`);
        now = r.cells;
      });
      for (const x of c.cells) if (!c.fix.includes(x.id)) assert.equal(pickCell(c.cells, c.fix, x.id).kind, 'wrong', `${q.id}: ${x.id} is no repair`);
    } else if (fix) {
      derived++;
      assert.equal(c.lit, false);
      assert.equal(analyze(solved(c.cells, fix)).lit, true, `${q.id}: the solver's repairs light the bulb`);
    } else {
      assert.ok(c.lit || analyze(c.cells).missing.length > 0, `${q.id}: not a puzzle only when lit or a part is missing`);
    }
    assert.equal(circuitable(q), !!fix);
  }
  assert.equal(fixItems, 5);
  assert.ok(derived >= 4, `dark "lit" items double as puzzles (${derived})`);
  assert.equal(puzzleFix(science.items.find(q => q.id === 'sc-056')), null, 'no battery: no puzzle');
  assert.equal(puzzleFix(science.items.find(q => q.id === 'sc-050')), null, 'a lit circuit is no puzzle');
  assert.deepEqual(puzzleFix(science.items.find(q => q.id === 'sc-062')), ['c1', 'c3'], 'the two-repair puzzle');
  // the engine keeps the circuit data on the item it serves
  const served = core.next('science', { filter: circuitable });
  assert.ok(served.circuit.cells.length >= 3 && circuitable(served) && served.meta.hintsAllowed >= 0);
}

// ---- sorting: every sort and match item ----
{
  const sorts = science.items.filter(q => q.type === 'sort');
  const matches = science.items.filter(q => q.type === 'match');
  assert.equal(sorts.length, 16);
  assert.equal(matches.length, 4);
  for (const q of [...sorts, ...matches]) {
    assert.ok(sortable(q), `${q.id}: plays as a sorting task`);
    const view = core.localize(q, 'de');
    const set = sortSet(q, view);
    assert.ok(set.cats.length >= 2 && set.cats.length <= MAX_BINS, `${q.id}: bins`);
    assert.ok(set.items.length >= 4 && set.items.length <= 6, `${q.id}: items`);
    assert.ok(set.cats.every(c => c.label && c.label.length <= 24), `${q.id}: bin labels fit`);
    assert.ok(set.items.every(it => it.text && it.text.length <= 24), `${q.id}: item texts fit a card`);
    // the right bin per item judges right through the engine, in any order of placing
    const resp = new Array(set.items.length);
    for (const i of [...set.items.keys()].reverse()) resp[i] = set.cats[binOf(set, i)].id;
    assert.equal(core.isCorrect(q, resp), true, `${q.id}: all in the right bins`);
    assert.deepEqual(misplaced(set, resp), []);
    // one item in a wrong bin
    const wrong = [...resp];
    const other = set.cats.find(c => c.id !== resp[0]);
    wrong[0] = other.id;
    assert.equal(core.isCorrect(q, wrong), false, `${q.id}: one wrong bin fails the set`);
    assert.deepEqual(misplaced(set, wrong), [0]);
    assert.equal(core.isCorrect(q, new Array(set.items.length)), false, `${q.id}: nothing placed is wrong`);
    // english view
    const setEn = sortSet(q, core.localize(q, 'en'));
    assert.equal(setEn.cats.length, set.cats.length);
    assert.ok(setEn.items.every((it, i) => it.cat === set.items[i].cat && it.text));
  }
  // the match items put the right side into a bin of their own
  const m = sortSet(matches[0], core.localize(matches[0], 'de'));
  assert.deepEqual(m.items.map(it => it.cat), [0, 1, 2, 3]);
  assert.ok(m.cats.every(c => typeof c.label === 'string'));
  assert.deepEqual(m.items.map((it, i) => binOf(m, i)), [0, 1, 2, 3]);
  // bins, steps
  const rects = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }];
  assert.equal(binAt(rects, 25, 5), 1);
  assert.equal(binAt(rects, 15, 5), -1);
  assert.equal(binAt(rects, 5, 11), -1);
  assert.equal(stepBin(0, -1, 3), 2);
  assert.equal(stepBin(2, 1, 3), 0);
}

// ---- which items play as what, and the whole topic is served ----
{
  const items = science.items;
  const kinds = { sort: 0, circuit: 0, quiz: 0, none: [] };
  for (const q of items) {
    const k = [sortable(q) && 'sort', circuitable(q) && 'circuit', quizzable(q) && 'quiz'].filter(Boolean);
    assert.ok(k.length <= 1, `${q.id}: plays as at most one kind`);
    if (k.length) kinds[k[0]]++; else kinds.none.push(q.id);
  }
  assert.ok(kinds.sort === 20 && kinds.circuit >= 9 && kinds.quiz >= 120, JSON.stringify(kinds));
  assert.deepEqual(kinds.none.filter(id => items.find(q => q.id === id).type !== 'typed' && !items.find(q => q.id === id).circuit), [], 'only the typed item and the circuit items without a puzzle stay out of the minigame');
  const topics = new Set();
  for (const q of items.filter(quizzable)) q.tags.forEach(t => topics.add(t));
  for (const t of ['wasser', 'magnet', 'strom', 'pflanzen', 'tiere', 'ernaehrung', 'material', 'licht', 'schall']) assert.ok(topics.has(t), `Quick-Quiz covers ${t}`);
  assert.ok(items.filter(q => q.type === 'choice' && !q.circuit).every(quizzable), 'every plain choice item fits the answer panel');
  // all three sources serve the engine with variety
  const seen = { sort: new Set(), circuit: new Set(), quiz: new Set() };
  for (let i = 0; i < 400; i++) {
    seen.sort.add(core.next('science', { filter: sortable }).id);
    seen.circuit.add(core.next('science', { filter: circuitable }).id);
    seen.quiz.add(core.next('science', { filter: quizzable }).id);
  }
  assert.ok(seen.sort.size >= 12 && seen.circuit.size >= 5 && seen.quiz.size >= 40, `${seen.sort.size} ${seen.circuit.size} ${seen.quiz.size}`);
  // facts are localized
  const withFact = items.find(q => q.fact);
  assert.equal(core.localize(withFact, 'de').fact, withFact.fact.de);
  assert.equal(core.localize(withFact, 'en').fact, withFact.fact.en);
  assert.equal(core.localize(items.find(q => !q.fact), 'de').fact, undefined);
}

// ---- the mode mix and the quiz rhythm ----
{
  const plan = makePlan(def.options.mix, mulberry32(1), def.durationSeconds * 1000, MODES);
  assert.deepEqual([plan.first, plan.second].sort(), ['circuit', 'sort']);
  assert.equal(modeAt(plan, 0), plan.first);
  assert.equal(modeAt(plan, plan.switchMs + 1), plan.second);
  assert.equal(kindFor('sort', 0, 2), 'sort');
  assert.equal(kindFor('sort', 1, 2), 'sort');
  assert.equal(kindFor('circuit', 2, 2), 'quiz');
}

// ---- layouts ----
{
  for (const players of [1, 2]) {
    const rects = layoutRects(players, 480, 270, { top: 26, margin: 6, gap: 8 });
    for (const r of rects) {
      const inside = b => b.x >= r.x - 0.01 && b.x + b.w <= r.x + r.w + 0.01 && b.y >= r.y - 0.01 && b.y + (b.h ?? 0) <= r.y + r.h + 0.01;
      for (const bins of [2, 3, 4]) {
        const l = layoutFor(r, 'sort', bins);
        assert.equal(l.bins.length, bins);
        assert.ok(l.bins.every(inside) && inside(l.card) && inside({ ...l.note, h: 80 }) && inside({ ...l.question, h: 28 }), `${players} player(s), ${bins} bins fit`);
        assert.ok(l.bins.every((b, i) => i === 0 || b.x >= l.bins[i - 1].x + l.bins[i - 1].w), 'bins do not overlap');
        assert.ok(l.card.y + l.card.h <= l.bins[0].y, 'the card sits above the bins');
        assert.ok(l.bins[0].y + l.bins[0].h <= l.note.y, 'the note sits below the bins');
        assert.ok(l.bins.every(b => b.w >= 50), `${players}: a bin is wide enough to tap (${l.bins[0].w})`);
      }
      const c = layoutFor(r, 'circuit');
      assert.ok(inside(c.board) && inside({ ...c.note, h: 70 }) && c.board.y + c.board.h <= c.note.y, `${players}: the circuit parts fit`);
      assert.ok(c.board.h - 40 >= 80, 'the loop is tall enough for symbols on the sides');
      const q = layoutFor(r, 'quiz');
      assert.ok(inside(q.panel));
    }
  }
}

console.log('check-science: ok');
