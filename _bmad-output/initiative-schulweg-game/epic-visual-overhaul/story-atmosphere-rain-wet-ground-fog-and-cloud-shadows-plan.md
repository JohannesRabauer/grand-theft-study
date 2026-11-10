---
title: 'Atmosphere: rain, wet ground, fog and cloud shadows'
type: 'feature'
ticket: 12
created: '2026-11-10'
status: built
baseline_revision: '072a15ebc5048ea404b2dd193205c47b4655daaf'
route: 'full'
route_source: 'auto'
risk: 'high'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: atmosphere (16.12, CAP-35, CAP-30, CAP-31)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rain only dims the screen and drops streaks on a dry ground; there is no fog, no morning mist, no sheen on wet streets, no reflection of lamps, no rings on puddles and sunny days have flat, unmoving light.

**Approach:** An atmosphere system driven by the weather state and the hour: fog banks and morning mist, drifting cloud shadows on clear days and a faint rain veil computed per base pixel inside the grade shader on Medium and High; scrolling pre-drawn noise banks on Low and Canvas. In rain, paved tiles near the camera shine one after the other (pooled sheen images), lit lamps mirror a streak on wet ground and puddles show rings. Every layer eases over seconds and every pass has a per-tier switch.

## Boundaries & Constraints

**Always:** layers ease (`fade` in `data/atmosphere.json`), never pop; per-tier switches in `data/quality.json` `atmosphere`; Low and Canvas fall back to banks and sprites; new random effects have test flags (`fogOff`, `ripplesOff`) in `scripts/smoke/env.js`; haze never denser than 0.5; the new code never reads `Math.random`; no extra full-screen pass.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; touch the UI scene.

</frozen-after-approval>

## Code Map

- `render/atmosphereMath.js` (pure: targets, easing, haze blend, wet thresholds and tiles, noise banks, ripples, reflection picks), `render/Atmosphere.js` (the system: layers, sheen pool, reflections, ripples, Low/Canvas banks), `render/pipelines/AtmosphereFx.js` (GLSL chunk + uniforms) carried by `render/pipelines/GradeFx.js`, `render/PostFx.js` (`atmosphereAllowed`).
- `data/atmosphere.json`, `data/quality.json` (`atmosphere` per tier), `data/day.json` (morning fog hint), `data/interiors.json` (fog window light), `physics/Weather.js` (state `fog`, `fogOff`), `render/Shadows.js` (fog is overcast), `scenes/GameScene.js`, `scenes/BootScene.js`.
- `scripts/check-atmosphere.mjs`, `scripts/smoke/atmosphere.js` (+ env flags), `scripts/atmosphere-frames.mjs`, `scripts/shots.mjs` (settled layers, two new shots).
- Not changed: map data, collision, surfaces, light map, street lights.

## Tasks & Acceptance

- [x] pure maths, data and tier switches
- [x] haze, clouds and rain veil in the grade shader; Low and Canvas banks
- [x] wet ground sheen pool, lamp reflections, puddle rings
- [x] fog weather state with morning hint and test hooks
- [x] node check, smoke scenario, frame script, shots after-16-12, bench, docs

**Acceptance Criteria:**
- Given rain, fog and a sunny day, then each shows its effect (shots oldtown-rain, oldtown-fog, every -day shot).
- Given a change of weather, then the layers cross-fade without a pop (frame sequence: biggest mean-luminance step in 15 frames 0.011 to 0.024 against a whole fade of about 0.2).
- Given any tier, then each pass switches off (frame script and smoke: fog, clouds, mist, veil, sheen, reflections, rings all reach zero) and Low and Canvas still show haze, clouds and sheen.
- Given rain at full density and fully wet ground, then p95 stays far below 16.7 ms and within 25 percent of the baseline.

## Implementation Notes

Built directly in this session. 77 node checks and the seeded smoke test (1383 checks) pass. Shots after-16-12 (72 shots): in the sunny shots the longest seam and the largest flat area mostly fall (cloud shadows break big fields), the walkable luminance p5 falls by 0.02 to 0.05 in sunny shots (the shadow is meant to darken); largest flat area rose in a few shots but stays under 4096 (park-day 998 to 2467, skate-day 425 to 831). New Low shot oldtown-rain-night has a flat area of 7623 px2 (the old tint overlays at night in rain on Low collapse the colours; the old Low night shots are 477). Bench: worst p95 +23 percent (Low e, 0.3 ms), Medium at most +18 percent. Deviation: the first version of the pass was a separate camera pass (+34 to +53 percent on Medium); it was merged into the grade pass.

## Plan Change Log

- Atmosphere moved from its own PostFX pass into the GradeFx shader (frame time).

## Review Triage Log

## Design Notes

Phaser's post pipeline texcoord has y up: the cell is `view.y + (1 - v) * height` (checked by the world-lock test of `atmosphere-frames.mjs`: the fog shifts with the ground when the camera moves). Fallback tile sprites use one texel per world unit, so no render-scale handling is needed. The sheen is a pool re-laid when the camera crosses a tile boundary or the puddle count changes; wetness spreads by a per-tile threshold so no tile pops alone. Reflections for the park lamps (map objects without a picture) use the lamp head 33 px above the foot.

## Verification

- `node scripts/check-all.mjs`; seeded smoke test (`bench-cdp.mjs --smoke`); `node scripts/shots.mjs --label after-16-12`; `node scripts/atmosphere-frames.mjs --label after-16-12` (medium, low, high, canvas); interleaved `bench-cdp.mjs --live --uncapped` against a copy of 072a15e.
