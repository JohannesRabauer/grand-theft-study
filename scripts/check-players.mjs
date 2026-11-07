// AD-18 guard: the players array helpers (entities/players.js) behave, and no code outside the alias
// definition still uses the deprecated `ctx.player` (nor `scene.player` / `this.player` on the scene, nor a
// `{ player } = ctx` destructuring). The allowlist is empty: everything is migrated to ctx.players.
// Run: node scripts/check-players.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPlayers } from '../entities/players.js';

// ---- helpers
const ctx = {};
installPlayers(ctx, 2);
assert.equal(ctx.player, undefined, 'alias is undefined without players');
assert.equal(ctx.maxPlayers, 2);
const mk = (index, x, y, alive = true) => ({ index, x, y, alive });
ctx.players.push(mk(0, 0, 0), mk(1, 100, 0));
assert.equal(ctx.player, ctx.players[0], 'ctx.player aliases players[0]');
assert.equal(ctx.nearestPlayer(10, 5).index, 0);
assert.equal(ctx.nearestPlayer(80, -5).index, 1);
assert.equal(ctx.nearestPlayer(50, 0).index, 0, 'ties go to the first player');
const seen = [];
ctx.forEachPlayer((p, i) => seen.push([p.index, i]));
assert.deepEqual(seen, [[0, 0], [1, 1]]);
assert.equal(ctx.alivePlayers().length, 2);
ctx.players[1].alive = false;
assert.deepEqual(ctx.alivePlayers().map(p => p.index), [0]);
assert.equal(ctx.alivePlayers(), ctx.alivePlayers(), 'the alive list is reused, not reallocated');
assert.equal(ctx.nearestPlayer(0, 0).index, 0);
const empty = {};
installPlayers(empty, 2);
assert.equal(empty.nearestPlayer(1, 1), null, 'no players: no nearest');

// ---- source scan
const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', '_bmad', '_bmad-output', 'docs']);
const ALIAS_FILE = 'entities/players.js'; // the one place that defines the alias
const ALLOWLIST = []; // { file, reason } entries that may still use ctx.player: must stay empty
const PATTERNS = [
  [/\b(?:ctx|scene|gs\d?|game)\.player\b/, 'ctx.player / scene.player'],
  [/\bthis\.player\b/, 'this.player on a scene', /^scenes\//], // elsewhere `this.player` is the owner of a belt or HUD module
  [/\{[^}]*\bplayer\b[^}]*\}\s*=\s*(?:this\.)?ctx\b/, 'destructuring player from ctx']
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) yield* walk(full); } else if (/\.(m?js)$/.test(name)) yield full;
  }
}

const self = 'scripts/check-players.mjs';
const hits = [];
for (const file of walk(root)) {
  const rel = relative(root, file).split(sep).join('/');
  if (rel === ALIAS_FILE || rel === self || ALLOWLIST.some(a => a.file === rel)) continue;
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, n) => {
    const code = line.replace(/\/\/.*$/, ''); // comments may still talk about the alias
    for (const [re, what, only] of PATTERNS) if ((!only || only.test(rel)) && re.test(code)) hits.push(`${rel}:${n + 1}  ${what}: ${line.trim()}`);
  });
}
assert.equal(ALLOWLIST.length, 0, 'the allowlist must stay empty');
assert.deepEqual(hits, [], `deprecated ctx.player is still used:\n${hits.join('\n')}`);
console.log('check-players: ok (helpers, no ctx.player uses outside the alias definition)');
