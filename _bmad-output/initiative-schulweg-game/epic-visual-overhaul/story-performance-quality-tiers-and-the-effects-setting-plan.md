---
title: "Performance, quality tiers and the effects setting"
ticket: 15
status: built
---

# Performance, quality tiers and the effects setting (16.15)

## Intent

Prove the epic frame limit with all effects on (Medium and High p95 at most 16.7 ms and at most +25 percent over the 16.1 baseline `8330e10`), make Low and Canvas look intentional, add the parent-facing Effekte setting (full, reduced, off) that drives the passes and the 16.13 reducedMotion flag, and record the numbers in `docs/PERFORMANCE.md`. No gameplay change.

## Code Map

- `services/qualityLogic.js` (new, pure): modes, `effectiveTier` (min of numbers, false switches off, unnamed keys stay), `motionReducedFor`.
- `data/quality.json`: new `effects` block (`reduced`, `off`); gameplay caps are never named.
- `services/quality.js`: `tier` is the derived tier (cached), `effects`, `setEffects(mode)` (live, emits `quality:changed`, device copy in `schulweg.effects`).
- `state/actions.js`: `settings.effects` sets flags `effects` and `reducedMotion`.
- `scenes/GameScene.js`: applies the slot's saved mode at run start.
- `ui/settingsRows.js`, `ui/screens/PauseScreen.js`, `ui/screens/ParentSettingsScreen.js`, `i18n/de.json`, `i18n/en.json`: the Effekte row.
- `scripts/check-effects.mjs` (in check-all), `scripts/smoke/effects.js`, `scripts/bench.js` (`&effects=`), `docs/PERFORMANCE.md`.

## Design Notes

- Why a derived tier and not per-system switches: every system already reads `ctx.quality.tier` and re-reads on `quality:changed` (AD-9), so one place changes the whole look instantly, and Medium/High/Low keep working as they are.
- `off` is the Low look at any render scale (no light map, no WebGL pass, tint overlay carries the mood); `reduced` removes bloom, cloud-free extras (veil, reflections, shimmer, god rays, glints) and trims particles and lights but keeps light, grade and shadows.
- Persistence: slot flag through the state action (AD-16) plus a device copy so the choice also holds before a slot is loaded.

## Tasks

- [x] qualityLogic, data, quality service, action, GameScene hook
- [x] Effekte row in pause overlay and parent settings, texts in both languages
- [x] check-effects, smoke scenario, bench `&effects=`
- [x] bench against baseline, tune (off-screen culling), shots, look metrics, docs
- [x] check-all (82), smoke (1445), commit, push

## Plan Change Log

- Profile of the render loop: ~410 of ~580 visible images were off screen and still batched; added `render/Culling.js` (opt-in per camera, shots byte-identical). No single pass was the cost.
- Parent settings layout: rows moved down (top 104, step 24 or 20) and hint wrap widened so the Effekte row and the age hint do not overlap; the explain line was dropped.
- Result: absolute limit met (p95 <= 2.1 ms quiet), the +25 percent relative limit is +9 percent against interleaved medians and +30 to +45 percent against best runs on this shared machine; left to the user (epic Done when 3).
- Port 8080 on this machine serves another app; benches run against copies of the commits served from the scratchpad.
