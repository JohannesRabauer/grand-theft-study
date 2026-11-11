---
title: "Atmosphere: snow cover, frost, heat shimmer and god rays"
type: 'feature'
ticket: 19
created: '2026-11-11'
status: built
baseline_revision: '85954f9'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: seasonal atmosphere (16.19, CAP-35, CAP-30)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Winter has no snow on roofs, hedges, trees or kerbs (only the ground tiles get covered while it snows), the screen never frosts, hot afternoons do not shimmer above the asphalt and sunny streets have no light shafts under the trees.

**Approach:** A seasonal layer on top of 16.12: a snow cover value (rises while it snows, holds in winter, melts after) that whitens roof tiles and kerbs (one pooled blitter), hedges and tree crowns (pooled images) tile by tile with sparkle glints; frost at the screen edge in winter and heat shimmer over dark paved pixels on hot afternoons, both inside the grade shader of 16.12 (no extra pass); god rays as pooled additive beams under tree crowns in daylight. Low and Canvas draw frost as a pre-drawn border image and the shimmer as pooled heat wisps. Every layer eases and every effect has a per-tier switch.

## Boundaries & Constraints

**Always:** layers ease (`fade` in `data/season.json`), never pop; per-tier switches in `data/quality.json` `atmosphere`; Low and Canvas fall back to sprites; always-on random effects have a test flag (`sparkleOff`) in `scripts/smoke/env.js`; the new code never reads `Math.random`; no extra full-screen pass.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; touch the UI scene.

</frozen-after-approval>

## Code Map

- `render/seasonMath.js` (pure: targets, tile classes of a map, snow thresholds, frost pixels, ray and wisp picks), `render/Season.js` (the system), GLSL for frost and shimmer in `render/pipelines/AtmosphereFx.js` (used by `GradeFx.js`), `data/season.json`, `data/quality.json` (`atmosphere` per tier), `scenes/GameScene.js`, `scenes/BootScene.js`.
- Reads: `render/Vegetation.js` (`trees`, hedge sprites), `render/buildingMath.js` (`isFacade`, roof cells), `ctx.day.season`, `ctx.weather`, `lightMap.dark`.
- `scripts/check-season.mjs`, `scripts/smoke/season.js` (+ `sparkleOff` in env), `scripts/season-frames.mjs`, `scripts/shots.mjs` (new shots), docs.
- Not changed: map data, collision, surfaces, light map, street lights.

## Tasks & Acceptance

- [x] pure maths, data and tier switches
- [x] snow cover on roofs, kerbs, hedges and crowns with sparkle
- [x] frost and heat shimmer in the grade shader, Low and Canvas fallbacks
- [x] god rays under crowns
- [x] node check, smoke scenario, frame script, shots after-16-19, bench, docs

**Acceptance Criteria:**
- Given winter (snow or clear), then roofs, hedges and crowns carry snow, the screen edge is frosted, and kerbs have snow lines.
- Given a hot clear afternoon, then dark paved ground shimmers; given sun in the daytime, then beams fall under the crowns.
- Given a season or weather change, then every layer cross-fades without a pop (frame sequence).
- Given any tier, then each pass switches off and Low and Canvas keep a fallback.
- Given the bench, then p95 is at most 16.7 ms on Medium and High and within 25 percent of the baseline.

## Implementation Notes

Built directly in this session. 78 node checks and the seeded smoke test (1405 checks) pass. Shots after-16-19 (88 shots, new: oldtown/road/park afternoon, road/park summer, park-snow, road-snow, oldtown-snow-night). Against after-16-20 only the snow shots and four Low or winter-day shots worsen: oldtown-snow medium largest flat area 222 > 567 px2 (white roofs), Low oldtown-snow seam 162 > 169 and flat 349 > 925, oldtown-day Low flat 380 > 492, oldtown-rain Low flat 402 > 492; all far under 4096 px2. The roof snow is the target of this story. Bench: worst case +17 percent (see docs/PERFORMANCE.md). Deviations: a Blitter for the tile snow drew nothing, so pooled images are used; the game calendar has summer only as the evening phase (20:00), so the shimmer runs from 13:30 to 21:00 with strength spring 0.7 and summer 1.

## Plan Change Log

- Blitter replaced by a pooled image grid for roofs and kerbs.
- Kerb snow made ragged and broken after a 440 px straight seam showed in road-snow.

## Design Notes

Seasons come from the day phase (`data/day.json`): winter is the school window (08:00-13:15), spring the afternoon, summer the evening. Heat is therefore driven by the season factor (summer 1, spring 0.7) and a daytime window of the clock, with clear weather only.

## Verification

- `node scripts/check-all.mjs`; seeded smoke test; `node scripts/shots.mjs --label after-16-19`; `node scripts/season-frames.mjs`; interleaved bench against 85954f9.
