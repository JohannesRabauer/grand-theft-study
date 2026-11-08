// The phone (story 11.3): the message rules (events, equal and minimum payload fields, once per game or per day, the cap), reading, the data
// against the texts in both languages and the kindness of the bully taunts. The screen, the badge and the key are covered by the smoke
// scenario `phone`.
// Run: node scripts/check-phone.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrive, markRead, matches, unread, validatePhone } from '../services/phoneLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/phone.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

assert.deepEqual(validatePhone(cfg), [], validatePhone(cfg).join('\n'));
for (const l of ['de', 'en']) {
  for (const k of ['phone.title', 'phone.empty', 'phone.day', 'phone.badge', 'phone.new', 'phone.nav']) assert.ok(i18n[l][k], `${l}: ${k}`);
  for (const s of cfg.senders) assert.ok(i18n[l][`phone.from.${s}`], `${l}: sender ${s}`);
  for (const m of cfg.messages) assert.ok(i18n[l][`phone.msg.${m.id}`], `${l}: ${m.id}`);
  for (const m of cfg.messages.filter(m => m.from === 'bully')) assert.ok(!/dumm|doof|hässlich|stupid|ugly|hate|hasse|hit you|schlag/i.test(i18n[l][`phone.msg.${m.id}`]), `${l}: the taunt ${m.id} only teases`);
}
for (const s of ['mom', 'friend', 'bully']) assert.ok(cfg.messages.some(m => m.from === s), `${s} writes`);

// ---- matching
const pfand = cfg.messages.find(m => m.id === 'friend-pfand');
assert.ok(matches(pfand, { id: 'pfand' }) && !matches(pfand, { id: 'bakery' }) && !matches(pfand, undefined));
const seen = cfg.messages.find(m => m.id === 'bully-seen');
assert.ok(matches(seen, { level: 1 }) && matches(seen, { level: 2 }) && !matches(seen, { level: 0 }) && !matches(seen, {}));
assert.ok(matches(cfg.messages.find(m => m.id === 'mom-morning'), { day: 3 }), 'no rules: any payload');

// ---- arriving: once per game, once per day, capped
const once = { id: 'a', from: 'mom' };
const daily = { id: 'b', from: 'mom', perDay: true };
let box = arrive([], once, 1, 10);
assert.deepEqual(box, [{ id: 'a', day: 1, from: 'mom', read: false }]);
assert.equal(arrive(box, once, 5, 10), null, 'a once-only message never comes twice');
box = arrive(box, daily, 1, 10);
assert.equal(arrive(box, daily, 1, 10), null, 'a daily message waits for the next day');
assert.ok(arrive(box, daily, 2, 10), 'and comes again then');
let many = [];
for (let d = 1; d <= 20; d++) many = arrive(many, daily, d, 6);
assert.equal(many.length, 6);
assert.equal(many.at(-1).day, 20, 'the newest are kept');

// ---- reading
assert.equal(unread(box), 2);
const read = markRead(box);
assert.equal(unread(read), 0);
assert.equal(markRead(read), read, 'nothing to read: the same list');
assert.equal(unread(box), 2, 'the original is untouched');

console.log(`phone ok: ${cfg.messages.length} messages from ${cfg.senders.length} senders, rules, once/daily, cap, reading, texts`);
