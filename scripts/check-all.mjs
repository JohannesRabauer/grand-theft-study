// Runs every node check script in sequence; exits non-zero when any of them fails.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const checks = ['check-collisions.mjs', 'check-i18n.mjs', 'check-map.mjs', 'check-chase.mjs', 'check-crowd.mjs', 'check-state.mjs', 'check-day.mjs', 'check-ui.mjs', 'check-players.mjs', 'check-input.mjs', 'check-content.mjs', 'check-world.mjs', 'check-characters.mjs', 'check-coop.mjs', 'check-menu.mjs', 'check-learning.mjs', 'check-learning-content.mjs', 'check-grades.mjs', 'check-minigames.mjs', 'check-mathe.mjs', 'check-deutsch.mjs', 'check-englisch.mjs', 'check-erdkunde.mjs', 'check-science.mjs', 'check-musik.mjs', 'check-kunst.mjs', 'check-sport.mjs', 'check-skate.mjs', 'check-tricks.mjs', 'check-skates.mjs', 'check-skatepark.mjs', 'check-vehicles.mjs', 'check-tools.mjs', 'check-stick.mjs', 'check-defense.mjs'];
let failed = 0;
for (const c of checks) {
  console.log(`\n== ${c}`);
  const r = spawnSync(process.execPath, [join(dir, c)], { stdio: 'inherit', cwd: join(dir, '..') });
  if (r.status !== 0) { failed++; console.error(`FAILED: ${c} (exit ${r.status})`); }
}
console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
