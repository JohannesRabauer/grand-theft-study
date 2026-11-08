# Common brief for every Schulweg GAME story

You are implementing ONE story of the Schulweg full game (retro top-down browser game, Phaser 3.90.0 + Matter.js, no build step) on top of a finished, working prototype. Work autonomously: nobody will answer questions. Make sensible choices, record notable ones briefly in the README or code comments, never stop to ask.

Project root: the repository root (Windows; PowerShell and Git Bash available). DO NOT run git commit/branch/checkout/stash/reset; the orchestrator commits after you finish (scripts/finish-story.sh).

## Read first (binding)
1. `_bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md` — AD-16..AD-30 (state store, day clock, players array, learning engine, minigames, quest runner, economy, skating, karate, chasers, audio, UI layers, maps, testing) plus the inherited prototype rules AD-1..AD-15 in `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/architecture-schulweg-prototype.md`. Follow them exactly: ctx + events, actions-only state, data-driven JSON, pools, collision categories (tools/karate never affect people or animals), i18n via ctx.t, intents for input.
2. `_bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md` — capabilities (CAP-n) with success criteria, constraints (kid-safe language, no violence, no injury visuals).
3. Your story's entry in `_bmad-output/initiative-schulweg-game/<epic-slug>/tickets.toml` (title, description, verify, covers, after, references) and the epic file beside it.
4. The existing code under the project root (index.html, main.js, scenes/, entities/, services/, physics/, vehicles/, tools/, ai/, ui/, particles/, data/, i18n/, scripts/, README.md, docs/PERFORMANCE.md). Earlier stories (prototype and game stories) are built: extend them, do not rewrite or break them, keep their behavior and tests working.

## Rules
- No bundler, no npm runtime deps, ES modules with explicit `.js` paths, Phaser global from jsDelivr (already in index.html).
- Tuning numbers and content in `data/*.json`; every visible string via `ctx.t(key)` with identical keys in `i18n/de.json` and `i18n/en.json` (cheeky, funny, kid-safe German/English youth tone; slang allowed e.g. "Digga", "bro"; NO swearing, slurs, insults about appearance/origin/gender/religion/disability, nothing sexual, no injury visuals). Keep `node scripts/check-i18n.mjs` passing.
- Art is procedural (canvas/Phaser graphics), in the hi-res style of scenes/HiResArt.js (2x textures, 0.5 display scale on Medium/High; Low renders 1x). No external assets or network calls except the Phaser CDN.
- Performance: pool things, no per-frame allocation in hot paths, cull off-screen, respect quality-tier caps. Medium worst-case update cost must stay within budget (docs/PERFORMANCE.md).
- Keep code lean and readable. No dead code, no TODO spam. Comments only where non-obvious.
- Tests (AD-29): put pure logic in modules without Phaser and cover it with a node check script `scripts/check-<area>.mjs` registered in `scripts/check-all.mjs`; extend `scripts/smoke.js` with a short scripted scenario when your story adds player-visible behavior; keep `node scripts/check-all.mjs` fully passing.
- Keep README.md accurate (controls, features, run steps for PowerShell: `npx serve .`, `python -m http.server 8080`).

## Verify (mandatory before reporting done)
- Start a static server on your own free port in the background (given in your task) from the project root and load http://localhost:<port>/index.html?debug in the built-in browser (`mcp__Claude_Browser__*` tools; load via ToolSearch select if deferred). The pane runs the game at only ~2 FPS, so verify by stepping the game manually through `window.SCHULWEG_GAME` (?debug) and checking state numerically, plus at least one screenshot. For rendering/performance numbers use the existing headless-Edge scripts (scripts/bench-cdp.mjs, scripts/zoom-sweep.mjs) only if your story needs them.
- Confirm no console errors and that your story's `verify` sentence holds. Run `node scripts/check-all.mjs`.
- NEVER kill processes broadly (by name/pattern). Only stop the exact server/browser processes you started, by PID (check the command line first). Do not leave headless browsers or servers running.
- Do not claim something works that you did not observe; say exactly what is untested.

## Final report (under 150 words)
What you built (key files), what you verified and how, deviations from the architecture (should be none), known issues.
