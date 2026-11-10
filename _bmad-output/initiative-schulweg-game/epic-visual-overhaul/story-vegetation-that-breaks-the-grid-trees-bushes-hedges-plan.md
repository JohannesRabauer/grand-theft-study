---
title: 'Vegetation that breaks the grid: trees, bushes, hedges'
type: 'feature'
ticket: 6
created: '2026-11-10'
status: built
baseline_revision: '8aac0f8'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: vegetation (16.6, CAP-35, CAP-34)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trees are one square canopy inside their tile, hedges are green blocks, bushes are three ellipses, and nothing moves in the wind.

**Approach:** Tree tiles keep only trunk and root flare on the ground; the crown is a separate sprite (3 species x 3 shapes x 4 seasons) that overlaps the neighbouring tiles, is drawn in a layer above all objects and fades when a kid walks under it. Hedges are lumpy leaf masses drawn per connected run and sliced per tile, so they overshoot the tile border. Bushes get a lumpier look, grass gets tufts and flower beds beside hedges. A wind object pipeline sways crowns and hedges from `ctx.wind`; Low and Canvas nudge visible crowns by whole pixels instead.

## Boundaries & Constraints

**Always:** light from the top left; hard edges, whole base pixels; seeded, built once at map load, no per-frame allocation; Medium/High use the shader, Low and Canvas the pixel nudge.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; use `Math.random` at run time.

</frozen-after-approval>

## Code Map

- `render/vegetationMath.js` (new, pure): species and shape per tree tile, crown boxes, hedge runs, `underCrown`, `stepFade`, `swayShift`.
- `data/vegetation.json` (new): species boxes, fade, sway, seasons; `data/quality.json` `windFx`.
- `scenes/VegArt.js` (new): crown textures per species/shape/season, hedge run sheets; `scenes/HiResArt.js` / `BootScene.js`: tree tile = grass + trunk + roots; `scenes/StickArt.js` bush; `scenes/EnvArt.js` hedge ground = grass, tufts, beds.
- `render/pipelines/WindFx.js` (new) in `index.js`; `render/Vegetation.js` (new world system) wired in `GameScene.js`.
- `scripts/check-vegetation.mjs` (new), `scripts/smoke/vegetation.js` (new), `scripts/veg-frames.mjs` (frame sequence), `check-envart.mjs` updated.
- Not changed: `data/maps/*`, collision, shadow mask, hiding zones.

## Tasks & Acceptance

- [x] pure maths, data and check
- [x] art: crowns, trunks, hedges, bush, tufts
- [x] Vegetation system, wind pipeline, fade, Low fallback
- [x] smoke scenario, shots after-16-6, frame sequence, bench, docs

**Acceptance Criteria:**
- Given a tree, then its crown reaches past the tile border on every side and is drawn above the objects.
- Given a kid under a crown, then the crown fades to see-through and returns when the kid leaves.
- Given wind, then Medium/High crowns and hedges sway by whole base pixels; Low and Canvas nudge by one pixel.
- Given the shots, then the flat-area metric no longer flags trees or hedges and no metric worsens.

## Implementation Notes

Implemented directly in this session (one connected render change). Outcome: 71 checks and the seeded smoke test (1295, +8) pass; shots and frame sequence in docs/shots/overhaul/after-16-6/; bench p95 +6 percent (Medium worst case). Deviations: crowns are one layer above the objects (a per-depth pipeline sprite broke batching: +100 percent); hedges lean on the CPU on every tier (their slices overlap, so they must shift alike); bushes do not sway; bullies fade a crown like kids. No review lenses beyond the self-checks.

## Plan Change Log

## Review Triage Log

## Design Notes

One crown layer above all objects keeps the wind pipeline in one draw call (crowns sorted among the objects measured +100 percent frame time); the fade restores readability for kids and bullies behind a trunk. Hedges stay y-sorted slices and lean as one piece.

## Verification

- `node scripts/check-all.mjs`; seeded smoke test; `node scripts/shots.mjs --label after-16-6`; bench.
