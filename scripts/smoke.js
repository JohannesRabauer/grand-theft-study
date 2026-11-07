// Whole-game smoke test, run with `index.html?bench` then `await SCHULWEG_BENCH.smoke()`
// (or `node scripts/bench-cdp.mjs --smoke`). Starts from the menu and plays a scripted session by
// stepping the game by hand: bike ride home -> school, skatepark turf, chase, hide and escape,
// getting caught and respawning, slingshot, weather, language, quality, pause, back to menu and a
// second run. Every step asserts game state; console errors and exceptions fail the run.
// The scenarios live in scripts/smoke/<area>.js and are listed in scripts/smoke/index.js (AD-29). `only` (an array of
// scenario names, e.g. SCHULWEG_BENCH.smoke(['skatepark'])) runs just those, for development; scenarios that build on state
// of an earlier one may fail on their own.
import { createEnv } from './smoke/env.js';
import { scenarios } from './smoke/index.js';

export async function runSmoke(game, h, only = null) {
  const checks = [];
  const problems = [];
  const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail: String(detail) }); return ok; };

  const origErr = console.error;
  const origWarn = console.warn;
  const onErr = e => problems.push('window error: ' + (e.message ?? e.reason));
  console.error = (...a) => { problems.push('console.error: ' + a.join(' ')); origErr.apply(console, a); };
  console.warn = (...a) => { problems.push('console.warn: ' + a.join(' ')); origWarn.apply(console, a); };
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const savedLang = game.registry.get('app').i18n.lang;
  const savedTier = game.registry.get('app').quality.id;

  try {
    game.loop.sleep();
    const env = createEnv(game, h, check, savedLang);
    for (const scenario of scenarios.filter(sc => !only || only.includes(sc.name))) {
      try { await scenario.run(game, check, env); } catch (e) { check(`scenario ${scenario.name} finished without throwing`, false, e.stack ?? e); break; }
    }
  } catch (e) {
    check('smoke run finished without throwing', false, e.stack ?? e);
  } finally {
    try { game.registry.get('app').i18n.set(savedLang); game.registry.get('app').quality.set(savedTier); } catch { /* ignore */ }
    console.error = origErr;
    console.warn = origWarn;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
  }
  check('no console errors, warnings or exceptions', problems.length === 0, problems.slice(0, 5).join(' | '));
  const failed = checks.filter(c => !c.ok);
  const result = { pass: failed.length === 0, total: checks.length, failed, checks, problems };
  h.panel.innerHTML = `<pre style="font:11px monospace;color:${result.pass ? '#7dff8a' : '#ff8a7a'};margin:0">${checks.map(c => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail}`).join('\n')}</pre>`;
  return result;
}
