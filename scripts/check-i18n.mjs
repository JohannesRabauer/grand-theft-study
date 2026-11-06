// Checks i18n/de.json and i18n/en.json: identical flat key sets, no empty values, and every
// t('key') used in the source exists. Dynamic keys like t(`surface.${id}`) need at least one
// key with that prefix. Run: node scripts/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = l => JSON.parse(readFileSync(join(root, 'i18n', `${l}.json`), 'utf8'));
const de = load('de');
const en = load('en');
const errors = [];

for (const [name, d] of [['de', de], ['en', en]]) {
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== 'string' || v.trim() === '') errors.push(`${name}.json: empty or non-string value for "${k}"`);
  }
}
const deKeys = new Set(Object.keys(de));
const enKeys = new Set(Object.keys(en));
for (const k of deKeys) if (!enKeys.has(k)) errors.push(`key "${k}" missing in en.json`);
for (const k of enKeys) if (!deKeys.has(k)) errors.push(`key "${k}" missing in de.json`);

const SKIP = new Set(['node_modules', '_bmad', '_bmad-output', '.git', 'scripts']);
function* sources(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!SKIP.has(f)) yield* sources(p); } else if (f.endsWith('.js')) yield p;
  }
}

let used = 0;
const call = /\bt\(\s*(['"`])([^'"`]+)\1/g;
for (const file of sources(root)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(call)) {
    used++;
    const key = m[2];
    const where = `${file.slice(root.length + 1)}`;
    if (key.includes('${')) {
      const prefix = key.slice(0, key.indexOf('${'));
      if (![...deKeys].some(k => k.startsWith(prefix))) errors.push(`${where}: no key with prefix "${prefix}"`);
    } else if (!deKeys.has(key)) {
      errors.push(`${where}: key "${key}" not in de.json`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`i18n ok: ${deKeys.size} keys in both languages, ${used} t() calls checked`);
