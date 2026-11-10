---
title: 'Water shader: shores, reflections and life'
type: 'feature'
ticket: 8
created: '2026-11-10'
status: built
baseline_revision: 'a1cf3f3f801273e1a5ee400af8b4a28006f06e74'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: water (16.8, CAP-35, CAP-34, CAP-31)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Water is a framed rectangle: straight tile-edge shore strips, a flat tile texture with two highlight dashes, nothing moves, nothing is reflected, and rain, ducks and splashes ring only as smooth circles.

**Approach:** Every connected body of water tiles gets a shore bent by seeded noise (rounded corners, bays and heads), banks (mud and sand next to soft ground, stone coping next to paving, stones, reeds, bridge piers) and a water surface: a pipeline on Medium and High with depth bands, swell, scrolling ripples, shimmer in the shallows, lapping foam, a tint of the sky and reflections of lamps and lit windows; a short loop of pre-drawn frames on Low and Canvas. Rain, swimming ducks, fish and splashes ring the water through the existing particle hub, as pixel rings.

## Boundaries & Constraints

**Always:** whole base pixels and whole steps of time; light from the top left; everything seeded and built once at map load; the display list does not grow while playing; water tiles stay solid.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; use `Math.random`; touch the UI scene.

</frozen-after-approval>

## Code Map

- `render/waterMath.js` (new, pure): bodies (flood fill), bridge rule, distance field + blur + noise, mask, shore layer, `waterColor` (the one formula), fallback frames, light picking.
- `render/pipelines/WaterFx.js` (new): the shader twin of `waterColor` plus sky tint and reflections; registered in `pipelines/index.js`.
- `render/Water.js` (new world system): shore and water images per body, tier mode switch, phase, sky, lights; wired in `GameScene.js`; `data/water.json` (new), `quality.json` `waterFx`.
- `scenes/EnvArt.js`: water tiles draw a mud bed `env-wbed-n`; the old shore, bank, round-corner and deep strips are removed. `scenes/HiResArt.js`, `BootScene.js`: `p-ring` is a pixel ring.
- `particles/ParticleHub.js` (rain and fountain rings), `entities/Critters.js` + `services/critterLogic.js` + `data/critters.json` (duck rings), `data/particles.json` (ripple share).
- `scripts/check-water.mjs`, `scripts/smoke/water.js`, `scripts/water-frames.mjs` (new); `check-envart.mjs`, `check-all.mjs`, `smoke/index.js` updated.
- Not changed: `data/maps/*`, collision, surfaces, shadow layer.

## Tasks & Acceptance

- [x] pure maths, data and node check
- [x] shore layer, mask, shader pipeline and fallback frames; Water system and wiring; mud bed in the ground bake
- [x] ripple rings: rain, ducks, fountain, pixel ring texture
- [x] smoke scenario, frame script, shots after-16-8, metrics, bench, docs

**Acceptance Criteria:**
- Given the pond or a canal, then the shore is irregular (no straight run beyond the seam limit), with banks, stones, reeds and bridge piers, and the water moves in pixel-crisp steps.
- Given the night, then lamps and lit windows near water glitter on it (Medium and High).
- Given rain, a swimming duck or a fish, then rings spread on the water.
- Given Low or the Canvas renderer, then the water is an animated loop without the pipeline.
- Given the map, then water tiles, collision and map data are unchanged (check-map, check-world, check-collisions, smoke).

## Implementation Notes

Implemented directly in this session. Outcome: 73 node checks and the seeded smoke test (1313, +9) pass; shots and frames in docs/shots/overhaul/after-16-8/; interleaved bench p95 unchanged within noise, pond and canal views at most +0.4 ms. Deviations: reflections reach only as far as the light's own radius (a glint beyond the pool would be multiplied dark by the light map); the pipeline flushes before it sets a body's lights; the 46 shots away from the water changed only through pedestrians and traffic (ducks ringing the pond draw from the shared random stream while the camera passes). No review lenses beyond the self-checks.

## Plan Change Log

## Review Triage Log

## Design Notes

The shore is the signed distance to the tile outline, blurred (rounds convex corners, straight edges stay), plus noise with three scales; the water gives way up to about 8 px but creeps past a tile edge at most about 4 px, so a kid never walks on visible water. The pixel under a receded shore shows the mud bed, which matches the bank colours. One formula (`waterColor`) draws both the fallback frames and, as GLSL, the pipeline, with every phase term a whole multiple of the phase so the loop is seamless. A first measurement with `?debug` physics lines on suggested a 0.5 ms regression between trees; measuring with the debug draw off showed none.

## Verification

- `node scripts/check-all.mjs`; seeded smoke test; `node scripts/shots.mjs --label after-16-8`; `node scripts/water-frames.mjs --label after-16-8` (Medium, Low, `--renderer canvas`); interleaved `bench-cdp.mjs --live --uncapped`.
