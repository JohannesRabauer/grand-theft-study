// Validates the learning content (data/learning/index.json and every topic file it lists): schema, bilingual text,
// UI-friendly lengths, unique ids, enough items per difficulty, exactly one correct choice, non-empty typed answers,
// well-formed match pairs and sort assignments, circuit puzzles whose data agrees with the stated answer, the bothLangs
// rule for English, fun facts and sign items.
// Arithmetic items may carry an optional `expr` (e.g. "7*8", "47//5", "47%5"); a small evaluator (no eval) must give
// exactly the stated correct answer. Run: node scripts/check-learning-content.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(join(root, p), 'utf8'));

const MAX_Q = 160, MAX_CHOICE = 60, MAX_EXPLAIN = 260, MAX_HINT = 160, MAX_FACT = 200;
// minimum content per topic: total items, items per difficulty level, distinct sub-tags (tags[0])
const MINIMUM = {
  mathe: { items: 140, perLevel: 20, tags: 8 },
  deutsch: { items: 120, perLevel: 15, tags: 7 },
  englisch: { items: 150, perLevel: 15, tags: 5 },
  sachkunde: { items: 120, perLevel: 15, tags: 6 },
  science: { items: 100, perLevel: 15, tags: 8 }
};
const FACT_SHARE = { sachkunde: 0.25, science: 0.25 };
const ITEM_TYPES = ['choice', 'match', 'sort', 'typed'];
const CIRCUIT_KINDS = ['battery', 'bulb', 'wire', 'gap', 'switch', 'bridge'];
const DEFAULT_MINIMUM = { items: 40, perLevel: 5, tags: 1 };

// ---- mini evaluator for `expr`: numbers, + - * / // % ( ) and unary minus ----
export function evalExpr(src) {
  const tokens = src.match(/\d+(?:\.\d+)?|\/\/|[-+*/%()]|\S/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const fail = () => { throw new Error(`bad expression "${src}"`); };
  function primary() {
    const t = tokens[pos++];
    if (t === '(') { const v = sum(); if (tokens[pos++] !== ')') fail(); return v; }
    if (t !== undefined && /^\d/.test(t)) return Number(t);
    return fail();
  }
  function unary() { if (peek() === '-') { pos++; return -unary(); } return primary(); }
  function product() {
    let v = unary();
    while (['*', '/', '//', '%'].includes(peek())) {
      const op = tokens[pos++], r = unary();
      if ((op === '/' || op === '//' || op === '%') && r === 0) fail();
      v = op === '*' ? v * r : op === '/' ? v / r : op === '//' ? Math.floor(v / r) : v % r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') v = tokens[pos++] === '+' ? v + product() : v - product();
    return v;
  }
  const v = sum();
  if (pos !== tokens.length) fail();
  return v;
}
for (const [src, want] of [['7*8', 56], ['47//5', 9], ['47%5', 2], ['(3+4)*2', 14], ['2*(7+4)', 22], ['0.25*4', 1], ['20/2-6', 4], ['-3+10', 7], ['2+3*4', 14]]) {
  assert.equal(evalExpr(src), want, `self-test ${src}`);
}
assert.throws(() => evalExpr('2+'), /bad expression/);
assert.throws(() => evalExpr('1/0'), /bad expression/);

// "1,50 €" -> 1.5, "300" -> 300; null when the text does not start with a number
const parseNum = t => { const m = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(String(t)); return m ? Number(m[1].replace(',', '.')) : null; };
// a number with an optional unit, e.g. "300", "1,50 €", "2 kg"
const NUMBER_UNIT = /^\s*(-?\d+(?:[.,]\d+)?)\s*(€|ct|mm|cm|km|kg|g|m)?\s*$/;
const same = (a, b) => Math.abs(a - b) < 1e-9;

// Series loop: the bulb is on with a battery and a bulb, closed switches, no gap and conducting bridges only.
export function circuitLit(cells) {
  return cells.some(c => c.kind === 'battery') && cells.some(c => c.kind === 'bulb') &&
    cells.every(c => (c.kind === 'switch' ? c.state === 'closed' : c.kind === 'gap' ? false : c.kind === 'bridge' ? c.conducts === true : true));
}
const repaired = (cells, ids) => cells.map(c => (ids.includes(c.id) ? { id: c.id, kind: c.kind === 'switch' ? 'switch' : 'wire', state: 'closed' } : c));

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const text = (v, lang) => (typeof v === 'string' ? v : v?.[lang]);
const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;

const index = json('data/learning/index.json');
const listed = new Set(index.topics.map(t => `${t.grade}/${t.topic}.json`));
const gradeDirs = readdirSync(join(root, 'data', 'learning'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
for (const g of gradeDirs) {
  for (const f of readdirSync(join(root, 'data', 'learning', g)).filter(n => n.endsWith('.json') && n !== 'geo-map.json')) { // geo-map.json is the Erdkunde map table, not a topic
    if (!listed.has(`${g}/${f}`)) err(`data/learning/${g}/${f}`, 'not listed in data/learning/index.json');
  }
}

function checkMatch(w, it) {
  if (!Array.isArray(it.pairs) || it.pairs.length < 3 || it.pairs.length > 4) return err(w, 'a match item needs 3 or 4 pairs');
  if (it.answers !== undefined) err(w, 'match items use `pairs`, not `answers`');
  for (const lang of ['de', 'en']) {
    for (const side of ['left', 'right']) {
      const texts = it.pairs.map(p => text(p[side], lang));
      if (!texts.every(nonEmpty)) { err(w, `a pair has no ${side} ${lang} text`); continue; }
      if (new Set(texts.map(t => t.trim().toLowerCase())).size !== texts.length) err(w, `duplicate ${side} text in pairs (${lang})`);
      if (texts.some(t => t.length > MAX_CHOICE)) err(w, `a pair ${side} is longer than ${MAX_CHOICE} chars (${lang})`);
    }
  }
}
function checkSort(w, it) {
  if (it.answers !== undefined) err(w, 'sort items use `categories` and `sortItems`, not `answers`');
  const cats = it.categories;
  if (!Array.isArray(cats) || cats.length < 2 || cats.length > 3) return err(w, 'a sort item needs 2 or 3 categories');
  const ids = cats.map(c => c.id);
  if (!ids.every(nonEmpty) || new Set(ids).size !== ids.length) err(w, 'category ids must be unique non-empty strings');
  for (const c of cats) for (const lang of ['de', 'en']) if (!nonEmpty(text(c.label, lang))) err(w, `category ${c.id} has no ${lang} label`);
  const items = it.sortItems;
  if (!Array.isArray(items) || items.length < 4 || items.length > 6) return err(w, 'a sort item needs 4 to 6 sortItems');
  for (const s of items) {
    for (const lang of ['de', 'en']) if (!nonEmpty(text(s.text, lang))) err(w, `a sortItem has no ${lang} text`);
    if (!ids.includes(s.category)) err(w, `sortItem "${text(s.text, 'de')}" has unknown category "${s.category}"`);
  }
  for (const id of ids) if (!items.some(s => s.category === id)) err(w, `category ${id} has no sortItem`);
  for (const lang of ['de', 'en']) {
    const texts = items.map(s => String(text(s.text, lang)).trim().toLowerCase());
    if (new Set(texts).size !== texts.length) err(w, `duplicate sortItem text (${lang})`);
  }
}
function checkCircuit(w, it) {
  const c = it.circuit;
  if (it.type !== 'choice') err(w, 'circuit items are choice items');
  if (c.goal !== 'bulb-on') err(w, 'circuit goal must be "bulb-on"');
  if (!Array.isArray(c.cells) || c.cells.length < 2) return err(w, 'circuit needs at least 2 cells');
  const ids = c.cells.map(x => x.id);
  if (new Set(ids).size !== ids.length) err(w, 'circuit cell ids must be unique');
  for (const cell of c.cells) {
    if (!CIRCUIT_KINDS.includes(cell.kind)) err(w, `unknown circuit cell kind "${cell.kind}"`);
    if (cell.kind === 'switch' && !['open', 'closed'].includes(cell.state)) err(w, 'a switch cell needs state open or closed');
    if (cell.kind === 'bridge' && (typeof cell.conducts !== 'boolean' || !nonEmpty(text(cell.item, 'de')))) err(w, 'a bridge cell needs `item` and boolean `conducts`');
  }
  const lit = circuitLit(c.cells);
  if (c.lit !== lit) err(w, `circuit.lit is ${c.lit} but the cells give ${lit}`);
  const correct = (it.answers ?? []).find(a => a.correct === true);
  if (c.ask === 'lit') {
    if (!correct || /^Ja\b/.test(text(correct.text, 'de')) !== lit) err(w, 'the correct answer must start with "Ja" exactly when the bulb is on');
  } else if (c.ask === 'fix') {
    if (lit) err(w, 'a fix puzzle needs a dark bulb');
    if (!Array.isArray(c.fix) || !c.fix.length || !c.fix.every(id => ids.includes(id))) err(w, 'circuit.fix must list cell ids');
    else if (!circuitLit(repaired(c.cells, c.fix))) err(w, 'changing the cells in circuit.fix does not light the bulb');
    else for (const id of c.fix) if (circuitLit(repaired(c.cells, c.fix.filter(x => x !== id)))) err(w, `circuit.fix lists ${id} but it is not needed`);
  } else err(w, 'circuit.ask must be "lit" or "fix"');
}

const seenIds = new Map();
const summary = [];
for (const { grade, topic } of index.topics) {
  const rel = `data/learning/${grade}/${topic}.json`;
  if (!existsSync(join(root, rel))) { err(rel, 'listed in index.json but missing'); continue; }
  const file = json(rel);
  if (file.topic !== topic) err(rel, `topic field "${file.topic}" differs from the file name`);
  if (file.grade !== grade) err(rel, `grade field "${file.grade}" differs from the folder`);
  if (!Array.isArray(file.items) || !file.items.length) { err(rel, 'no items'); continue; }
  const perLevel = [0, 0, 0, 0, 0, 0];
  const tags = new Set();
  let exprChecked = 0, facts = 0, signItems = 0;
  for (const it of file.items) {
    const w = `${rel} ${it.id}`;
    if (!nonEmpty(it.id)) { err(rel, 'item without id'); continue; }
    if (seenIds.has(it.id)) err(w, `duplicate id (also in ${seenIds.get(it.id)})`);
    seenIds.set(it.id, rel);
    if (it.topic !== topic) err(w, `item topic "${it.topic}" differs from file topic`);
    if (!ITEM_TYPES.includes(it.type)) err(w, `unsupported type "${it.type}"`);
    if (!Number.isInteger(it.difficulty) || it.difficulty < 1 || it.difficulty > 5) { err(w, 'difficulty must be an integer 1-5'); continue; }
    perLevel[it.difficulty]++;
    if (!Array.isArray(it.tags) || !it.tags.length || !it.tags.every(nonEmpty)) err(w, 'tags must be a non-empty array of strings');
    else tags.add(it.tags[0]);
    for (const lang of ['de', 'en']) {
      const q = text(it.q, lang);
      if (!nonEmpty(q)) err(w, `q.${lang} missing`);
      else if (q.length > MAX_Q) err(w, `q.${lang} is ${q.length} chars (max ${MAX_Q})`);
      const ex = text(it.explain, lang);
      if (!nonEmpty(ex)) err(w, `explain.${lang} missing`);
      else if (ex.length > MAX_EXPLAIN) err(w, `explain.${lang} is ${ex.length} chars (max ${MAX_EXPLAIN})`);
    }
    const hints = it.hints ?? [];
    if (!Array.isArray(hints) || hints.length > 2) err(w, 'hints must be an array with at most 2 entries');
    else {
      if (it.difficulty >= 3 && hints.length < 1) err(w, 'items from difficulty 3 need at least one hint');
      hints.forEach((h, i) => {
        for (const lang of ['de', 'en']) {
          if (!nonEmpty(text(h, lang))) err(w, `hints[${i}].${lang} missing`);
          else if (text(h, lang).length > MAX_HINT) err(w, `hints[${i}].${lang} is too long`);
        }
      });
    }
    if (it.fact !== undefined) {
      for (const lang of ['de', 'en']) {
        const f = text(it.fact, lang);
        if (!nonEmpty(f)) err(w, `fact.${lang} missing`);
        else if (f.length > MAX_FACT) err(w, `fact.${lang} is too long`);
      }
      facts++;
    }
    if (file.bothLangs) {
      if (text(it.q, 'de') === text(it.q, 'en')) err(w, 'bothLangs: q.de and q.en must differ (German and English text together)');
      if (text(it.explain, 'de') === text(it.explain, 'en')) err(w, 'bothLangs: explain.de and explain.en must differ');
    }
    if (it.sign !== undefined && !/^[A-Z0-9 ]+$/.test(it.sign)) err(w, 'sign must be the printed text in capitals');
    if (it.tags?.[0] === 'signs') { if (it.sign === undefined) err(w, 'signs items need a `sign` field'); else signItems++; }
    if (it.type === 'match') { checkMatch(w, it); continue; }
    if (it.type === 'sort') { checkSort(w, it); continue; }
    if (!Array.isArray(it.answers) || !it.answers.length) { err(w, 'answers missing'); continue; }
    for (const a of it.answers) for (const lang of ['de', 'en']) if (!nonEmpty(text(a.text, lang))) err(w, `an answer has no ${lang} text`);
    let correct = [];
    if (it.type === 'choice') {
      if (it.answers.length < 3 || it.answers.length > 4) err(w, `a choice item needs 3 or 4 answers, has ${it.answers.length}`);
      const right = it.answers.filter(a => a.correct === true);
      if (right.length !== 1) err(w, `needs exactly one correct choice, has ${right.length}`);
      if (it.answers.some(a => typeof a.correct !== 'boolean')) err(w, 'every choice needs a boolean "correct"');
      for (const lang of ['de', 'en']) {
        const texts = it.answers.map(a => String(text(a.text, lang)).trim().toLowerCase());
        if (new Set(texts).size !== texts.length) err(w, `duplicate choice text (${lang})`);
        if (texts.some(t => t.length > MAX_CHOICE)) err(w, `a choice is longer than ${MAX_CHOICE} chars (${lang})`);
      }
      correct = right;
      const keys = it.answers.map(a => { const m = NUMBER_UNIT.exec(String(text(a.text, 'de'))); return m && `${Number(m[1].replace(',', '.'))} ${m[2] ?? ''}`; });
      if (keys.every(k => k !== null) && new Set(keys).size !== keys.length) err(w, 'two choices have the same numeric value');
    } else {
      if (it.answers.some(a => 'correct' in a)) err(w, 'typed answers are accepted forms and carry no "correct" flag');
      correct = it.answers;
    }
    if (it.circuit !== undefined) checkCircuit(w, it);
    else if (it.tags?.[0] === 'circuit') err(w, 'circuit items need circuit data');
    if (it.expr !== undefined) {
      let value;
      try { value = evalExpr(it.expr); } catch (e) { err(w, e.message); continue; }
      exprChecked++;
      for (const a of correct) {
        const n = parseNum(text(a.text, 'de'));
        if (n === null) err(w, `expr item has a non-numeric answer "${text(a.text, 'de')}"`);
        else if (!same(n, value)) err(w, `expr "${it.expr}" = ${value} but the answer says "${text(a.text, 'de')}"`);
      }
    }
  }
  const min = MINIMUM[topic] ?? DEFAULT_MINIMUM;
  if (file.items.length < min.items) err(rel, `${file.items.length} items, need at least ${min.items}`);
  for (let d = 1; d <= 5; d++) if (perLevel[d] < min.perLevel) err(rel, `difficulty ${d} has ${perLevel[d]} items, need at least ${min.perLevel}`);
  if (tags.size < min.tags) err(rel, `${tags.size} sub-tags, need at least ${min.tags}`);
  if (FACT_SHARE[topic] && facts < Math.ceil(file.items.length * FACT_SHARE[topic])) err(rel, `${facts} fun facts, need at least ${Math.ceil(file.items.length * FACT_SHARE[topic])}`);
  if (topic === 'englisch') {
    if (file.bothLangs !== true) err(rel, 'englisch must set bothLangs: true');
    if (signItems < 25) err(rel, `${signItems} signs items, need at least 25`);
  } else if (file.bothLangs) err(rel, 'only englisch uses bothLangs');
  if (topic === 'deutsch') {
    const art = file.items.filter(i => i.tags[0] === 'artikel');
    if (art.length < 70) err(rel, `${art.length} article items, need at least 70`);
    for (const i of art) if (i.answers.map(a => a.text).join() !== 'der,die,das') err(`${rel} ${i.id}`, 'article items offer der, die, das in that order');
  }
  const types = Object.entries(file.items.reduce((m, i) => ({ ...m, [i.type]: (m[i.type] ?? 0) + 1 }), {})).map(([t, n]) => `${t} ${n}`).join(', ');
  summary.push(`${topic}: ${file.items.length} items (${perLevel.slice(1).join('/')} per difficulty), ${tags.size} sub-tags, ${facts} facts, ${exprChecked} expr verified; ${types}`);
}

if (errors.length) { console.error(errors.join('\n')); console.error(`\ncheck-learning-content: ${errors.length} problem(s)`); process.exit(1); }
console.log(summary.join('\n'));
console.log(`check-learning-content: ok (${seenIds.size} items in ${index.topics.length} topic files)`);
