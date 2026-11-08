// Charme talk-down and question back-off (story 7.5): the chance from Charme (bounded, never sure, rising), the levels it applies to, the data
// against the real characters and the texts; the screens and the real catch run in the smoke scenario `talk`.
// Run: node scripts/check-talk.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { charmChance, talksAt, validateTalk } from '../services/talkLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const chase = load('data/chase.json');
const talk = chase.talk;
const chars = load('data/characters.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const charme = Object.values(chars.characters ? Object.fromEntries(chars.characters.map(c => [c.id, c.attributes.charme])) : {});

assert.deepEqual(validateTalk(talk, [Math.min(...charme), Math.max(...charme)]), [], validateTalk(talk, [Math.min(...charme), Math.max(...charme)]).join(', '));
for (const l of ['de', 'en']) for (const k of ['activity.talk.title', 'activity.stage.talk', 'talk.charm.ok', 'talk.question.ok', 'talk.gentle']) assert.ok(i18n[l][k], `${l}: ${k}`);
assert.ok(!/muss|dumm|doof|stupid|idiot/i.test(i18n.de['talk.gentle'] + i18n.en['talk.gentle']), 'the wrong-answer text is gentle');

// ---- levels
assert.ok(!talksAt(talk, 0) && talksAt(talk, 1) && talksAt(talk, 2) && !talksAt(talk, 3) && !talksAt(talk, 5), 'only levels 1 and 2');

// ---- chance: rises with Charme, bounded, never sure, never hopeless
let last = -1;
for (let c = 0; c <= 12; c++) { const p = charmChance(talk, c); assert.ok(p >= last && p >= 0 && p <= talk.charm.max && p < 1, `Charme ${c}: ${p}`); last = p; }
const by = Object.fromEntries(chars.characters.map(c => [c.id, c.attributes.charme]));
assert.ok(charmChance(talk, by.lorenz) > charmChance(talk, by.helena), `Lorenz (Charme ${by.lorenz}) talks better than Helena (${by.helena})`);
assert.ok(charmChance(talk, by.lorenz) < 1 && charmChance(talk, by.helena) > 0.2, 'nobody is always or hardly ever successful');
assert.equal(charmChance(talk, undefined), charmChance(talk, talk.charm.pivot), 'no value: the pivot');

// ---- the question: a real activity with real choice questions in the learning context bully
const act = load('data/activities.json').talk;
assert.ok(act.stages[0].context === 'bully' && act.stages[0].n === 1 && act.xpPerCorrect > 0 && act.perCorrectCents === 0, 'one question, only xp');
assert.ok(load('data/learning.json').contexts.bully, 'the bully context exists in the learning engine');
console.log('talk ok: levels 1-2, Charme chance bounded and rising, gentle texts, one-question activity');
