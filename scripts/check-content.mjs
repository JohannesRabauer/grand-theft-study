// Content safety check (AD-29, CAP-32): every player-visible string must stay kid-safe.
// Lints i18n/de.json, i18n/en.json, every string in data/learning/**/*.json and the text fields
// (keys listed in "textFields" of data/content-blocklist.json) of data/*.json for swearing, slurs, insults,
// sexual terms and glorified violence in German and English; also fails on empty text and on de/en key
// mismatches (via check-i18n.mjs). Run: node scripts/check-content.mjs
//   --text "some string"            lint one extra string (exit 1 when flagged), e.g. to try a word
//   --encode word                   print the stored form of a word
//   --add <de|en> <words|stems> w   add a word to data/content-blocklist.json (stored obfuscated)
//   --allow word                    add a harmless word that a stem wrongly catches
// The blocklist stores entries as base64 of the reversed, umlaut-folded lowercase word, so the repo
// contains no plain offensive words. "words" match a whole token, "stems" match the start of a token,
// "allow" lists whole tokens that are exempt. Self-test: the matcher runs on samples built from the list.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'data', 'content-blocklist.json');

const fold = s => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const encode = w => Buffer.from([...fold(w)].reverse().join('')).toString('base64');
const decode = e => [...Buffer.from(e, 'base64').toString()].reverse().join('');
const leet = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const deleet = t => t.replace(/[013457@$]/g, c => leet[c] ?? c);

function buildMatcher(list) {
  const words = new Set();
  const stems = [];
  for (const lang of Object.values(list.lists)) {
    for (const e of lang.words ?? []) words.add(decode(e));
    for (const e of lang.stems ?? []) stems.push(decode(e));
  }
  const allow = new Set((list.allow ?? []).map(decode));
  const hit = t => words.has(t) || stems.some(s => t.startsWith(s));
  // returns the offending tokens of a string (empty array = clean)
  return text => {
    const found = [];
    for (const raw of fold(text).split(/[^a-z0-9@$]+/)) {
      if (!raw || allow.has(raw)) continue;
      const alt = deleet(raw);
      if (hit(raw) || (alt !== raw && !allow.has(alt) && hit(alt))) found.push(raw);
    }
    return found;
  };
}

const loadList = () => JSON.parse(readFileSync(listPath, 'utf8'));
const saveList = list => {
  const text = JSON.stringify(list, null, 2).replace(/\[\s+([^\]]*?)\s+\]/g, (_, body) => `[${body.replace(/\s*\n\s*/g, ' ')}]`);
  writeFileSync(listPath, text + '\n');
};
const arg = n => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv.slice(i + 1); };

if (arg('encode')) { console.log(encode(arg('encode')[0])); process.exit(0); }
if (arg('add')) {
  const [lang, kind, word] = arg('add');
  const list = loadList();
  if (!list.lists[lang] || !['words', 'stems'].includes(kind) || !word) { console.error('usage: --add <de|en> <words|stems> <word>'); process.exit(2); }
  (list.lists[lang][kind] ??= []).push(encode(word));
  saveList(list);
  console.log(`added to ${lang}.${kind}`);
  process.exit(0);
}
if (arg('allow')) {
  const list = loadList();
  (list.allow ??= []).push(encode(arg('allow')[0]));
  saveList(list);
  console.log('added to allow');
  process.exit(0);
}

const list = loadList();
const match = buildMatcher(list);
const errors = [];

// ---- self-test: the matcher must flag samples built from the list and leave clean text alone ----
{
  const entries = kind => Object.values(list.lists).flatMap(l => (l[kind] ?? []).slice(0, 2).map(decode));
  const firstWords = entries('words');
  const firstStems = entries('stems');
  const bad = [];
  for (const w of [...firstWords, ...firstStems]) bad.push(w, w.toUpperCase(), `Hey ${w}, du!`, `Satz mit ${w}.`, `${w}`.replace(/e/g, '3'));
  for (const s of firstStems) bad.push(`${s}xyz`);
  const clean = ["Los geht's!", 'Schule: {m} m', 'Du bist in der Schule!', 'Class assistant on a bike', 'Digga, das war knapp', 'Hello Skills Marshall'];
  if (!firstWords.length || !firstStems.length) errors.push('self-test: blocklist has no entries');
  for (const s of bad) if (!match(s).length) errors.push(`self-test: matcher missed a known-bad sample (starts with "${s.slice(0, 2)}")`);
  for (const s of clean) if (match(s).length) errors.push(`self-test: matcher flagged clean text "${s}"`);
  for (const a of (list.allow ?? []).map(decode)) if (match(a).length) errors.push('self-test: an allowlisted word is still flagged');
}

if (arg('text')) {
  const f = match(arg('text')[0]);
  console.log(f.length ? `flagged: ${f.length} token(s)` : 'clean');
  process.exit(errors.length || f.length ? 1 : 0);
}

const lint = (where, text) => {
  if (typeof text !== 'string' || text.trim() === '') { errors.push(`${where}: empty or non-string text`); return; }
  const f = match(text);
  if (f.length) errors.push(`${where}: disallowed content (${f.length} token(s), first starts with "${f[0].slice(0, 2)}"): "${text}"`);
};
// strings under keys named in textFields (any depth below such a key) are lint targets; with all=true every string is
const textFields = new Set(list.textFields);
const walk = (node, where, inText, all) => {
  if (typeof node === 'string') { if (inText || all) lint(where, node); }
  else if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${where}[${i}]`, inText, all));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`, inText || textFields.has(k), all);
};
const jsonFiles = dir => !existsSync(dir) ? [] : readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? jsonFiles(p) : n.endsWith('.json') ? [p] : [];
});
const rel = p => p.slice(root.length + 1).replace(/\\/g, '/');

let strings = 0;
for (const lang of ['de', 'en']) {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(root, 'i18n', `${lang}.json`), 'utf8')))) { strings++; lint(`i18n/${lang}.json "${k}"`, v); }
}
const learning = jsonFiles(join(root, 'data', 'learning'));
for (const f of learning) walk(JSON.parse(readFileSync(f, 'utf8')), rel(f), false, true);
const dataFiles = readdirSync(join(root, 'data')).filter(n => n.endsWith('.json') && n !== 'content-blocklist.json').map(n => join(root, 'data', n));
for (const f of dataFiles) walk(JSON.parse(readFileSync(f, 'utf8')), rel(f), false, false);

const parity = spawnSync(process.execPath, [join(root, 'scripts', 'check-i18n.mjs')], { encoding: 'utf8' });
if (parity.status !== 0) errors.push('check-i18n.mjs failed (de/en key parity or missing keys):\n' + (parity.stdout + parity.stderr).trim());

if (errors.length) { console.error(errors.join('\n')); console.error(`\ncheck-content: ${errors.length} problem(s)`); process.exit(1); }
console.log(`check-content: ok (${strings} i18n strings, ${learning.length} learning files, ${dataFiles.length} data files, self-test passed)`);
