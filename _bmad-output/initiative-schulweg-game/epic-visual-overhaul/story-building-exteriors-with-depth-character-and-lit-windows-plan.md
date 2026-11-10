---
title: 'Building exteriors with depth, character and lit windows'
type: 'feature'
ticket: 7
created: '2026-11-10'
status: built
baseline_revision: '354a2c8'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: building exteriors (16.7, CAP-35, CAP-34)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Buildings are rectangles of one roof texture and one of four facades, with a baked chimney and a flat shadow line; nothing reaches past the tile border and no window ever lights up.

**Approach:** Per-building seed and look (palette x roof material: clay tile, slate, flat; no look within two tiles repeats). Roof edges get a ragged lip and an eave that hangs over the ground beside the building; facades get gutters, sills, curtains, balconies, flower boxes, drainpipes, ageing (stains, moss, plaster patch, damp), stone plinths, shop fronts with awnings and pictogram signs; chimneys are sprites that rise over the roof; flat roofs get vents, units and skylights; bins stand along walls. From the evening on households switch their windows on (each at its own minute, some stay dark); a lit pane is a pooled image and Medium/High add a warm light on the ground below it through `ctx.lights`.

## Boundaries & Constraints

**Always:** light from the top left, hard edges, whole base pixels; everything seeded and built once at map load; the display list does not grow while playing; tile art in the ground bake, overhanging parts as sprites.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; use `Math.random`.

</frozen-after-approval>

## Code Map

- `render/buildingMath.js` (new, pure): buildings (flood fill), seeds, look assignment, facade look per tile, roof edges, chimneys, bins, window list and schedule.
- `scenes/EnvDraw.js` (new): canvas helpers moved out of `EnvArt.js`. `scenes/BuildingArt.js` (new): roofs, facades, doors, overlays, `wallKeys`, the overlay atlas (`bld-atlas`: eaves per palette/roof/mask, chimneys, awnings, lit panes). `EnvArt.js`: calls them, adds bins.
- `render/Buildings.js` (new world system): eave and chimney images lent from a fixed pool to chunks near the view, awnings, lit panes, window lights; wired in `GameScene.js`, atlas drawn in `BootScene.js`.
- `data/buildings.json` (new), `data/quality.json` `windowLights` (+6 Medium, +12 High; `maxLights` 30 / 60), `StreetLights` budget minus `windowLights`.
- `scripts/check-buildings.mjs` (new), `scripts/smoke/buildings.js` (new), `check-envart.mjs` updated.
- Not changed: `data/maps/*`, collision, shadow mask.

## Tasks & Acceptance

- [x] pure maths, data and node check
- [x] tile art: roofs, facades, doors, overlays; per-building looks
- [x] overlay atlas, Buildings system, lit windows and ground spill
- [x] smoke scenario, shots after-16-7, metrics, bench, docs

**Acceptance Criteria:**
- Given the evening, then windows near the kid show lit panes and Medium/High put a warm light on the ground below them.
- Given neighbouring buildings, then their palette or roof differs and every building has its own seed.
- Given the map, then footprints, doors, collision and depth sorting are unchanged (check-map, check-collisions, smoke).

## Implementation Notes

Implemented directly in this session. Outcome: 72 checks and the seeded smoke test (1304, +9) pass; shots and metrics in docs/shots/overhaul/after-16-7/; paired bench p95 at most +8 percent typical (Medium e +4, High e +13 in the noise). Deviations: eaves are images lent from a fixed pool per chunk because 869 live images cost +40 percent frame time and a Blitter drew wrongly in the shot path; lit panes and eaves are fixed pools so the leak check holds. No review lenses beyond the self-checks.

## Plan Change Log

## Review Triage Log

## Design Notes

Tile art stays in the ground bake (one draw); only what overhangs or glows is a sprite. Slate and flat roofs were first too crisp: long straight colour rows gave 300 px seams, so shingle rows are low contrast and every roof edge lip is ragged. Shops are excluded from buildings with a door to school, home or dojo.

## Verification

- `node scripts/check-all.mjs`; seeded smoke test; `node scripts/shots.mjs --label after-16-7`; paired `bench-cdp.mjs --live --uncapped`.
