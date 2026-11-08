// Language and tone review (story 14.3): a standing review pass over every player-visible text in both languages, on top of the content lint
// (check-content.mjs): placeholders match between German and English, German speaks to kids with "du" (never formal Sie), no shouting
// (long ALL CAPS words, doubled marks), no blame in the texts that react to mistakes, lateness or being caught, no leftover markers, no
// stray whitespace, and no German sentence hiding in the English file or the other way round (a small stop-word test).
// Run: node scripts/check-tone.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const de = load('i18n/de.json');
const en = load('i18n/en.json');
const problems = [];
const flag = (k, why, s) => problems.push(`${k}: ${why} -> ${String(s).slice(0, 70)}`);
const holders = s => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');

const SHOUT_OK = new Set(['XP', 'HUD', 'FPS', 'PWA', 'LB', 'RB', 'LT', 'RT', 'LS', 'RS', 'WASD', 'DE', 'EN', 'TODO', 'ESC', 'UFER', 'MARKT', 'DOJO', 'STOP', 'A', 'B', 'X', 'Y', 'OK', 'ÖPNV', 'KI']);
const BLAME = /\b(dumm|doof|blöd|versager|idiot|stupid|dumb|loser|idiotic|useless|hopeless|pathetic|schäm dich|shame on you|your fault|deine schuld)\b/i;
const FORMAL_DE = /\bIhnen\b/; // "Sie" and "Ihr" are also plain she, they and you-all; only "Ihnen" is the formal you
const DE_WORDS = /\b(und|der|die|das|nicht|ist|ein|eine|mit|für|dich|dein|deine|wir|ich|du|zu|auf|im|den|dem)\b/gi;
const EN_WORDS = /\b(the|and|you|your|is|are|to|of|with|for|not|this|that|we|it|in|on)\b/gi;
const count = (s, re) => (String(s).match(re) ?? []).length;
const REACT_KEYS = /(wrong|fail|late|caught|gentle|refused|lost|inspector|janitor|talk\.|lookout|taunt|bully-|sorry|oops|miss)/i;

for (const k of Object.keys(en)) {
  const a = en[k];
  const b = de[k];
  if (typeof a !== 'string' || typeof b !== 'string') continue;
  if (holders(a) !== holders(b)) flag(k, `placeholders differ (${holders(a)} vs ${holders(b)})`, b);
  for (const [lang, s] of [['en', a], ['de', b]]) {
    const id = `${lang}:${k}`;
    if (s !== s.trim()) flag(id, 'leading or trailing space', s);
    if (/!!|\?\?|!\?\?|\.\.\.\.|\bTODO\b|\bFIXME\b|lorem ipsum|XXX/i.test(s)) flag(id, 'doubled marks or a leftover marker', s);
    if (s.length > 14) for (const w of s.match(/\b[A-ZÄÖÜ]{5,}\b/g) ?? []) if (!SHOUT_OK.has(w)) flag(id, `shouting word ${w}`, s); // a short comic word or title (CAUGHT!, RUMMS!) is fine
    if (REACT_KEYS.test(k) && BLAME.test(s)) flag(id, 'blame in a text that reacts to a mistake', s);
  }
  if (FORMAL_DE.test(b)) flag(`de:${k}`, 'formal address: kids are addressed with du', b);
  // wrong language: only judged for sentences long enough to mean something
  if (a.length > 40 && count(a, DE_WORDS) >= 4 && count(a, EN_WORDS) < 2 && !a.includes('{')) flag(`en:${k}`, 'looks German', a);
  if (b.length > 40 && count(b, EN_WORDS) >= 4 && count(b, DE_WORDS) < 2 && !b.includes('{')) flag(`de:${k}`, 'looks English', b);
}
assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
console.log(`tone ok: ${Object.keys(en).length} texts in both languages, placeholders equal, du-form, no shouting or blame`);
