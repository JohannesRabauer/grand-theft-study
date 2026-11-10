---
title: 'Street dressing and props'
type: 'feature'
ticket: 9
created: '2026-11-10'
status: built
baseline_revision: 'f152459'
route: 'full'
route_source: 'auto'
risk: 'low'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: street dressing and props (16.9, CAP-35, CAP-34)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Streets, the park, the schoolyard and the skatepark are bare tiles with a few drawn rectangles; lamps, benches, fences, bike racks and tram stops are in the old style, long fences and slab joints are straight lines, and a big roof is one repeated tile whose joints form a single connected colour (the flat-area metric of the oldtown shot was 5089 px against a limit of 4096).

**Approach:** Non-colliding set dressing generated from the tile neighbours and the object data: standing props (planters, bollards, hydrants, letterboxes, recycling bins, parked bikes, street signs, the kiosk and the Pfand machine) as images of a fixed pool lent to what is near the view, and ground decals in the ground bake (kerb weeds, leaves in the gutter, chalk drawings, playground markings, posters on plain facade stretches). Roofs get variants and now and then a skylight, solar panel, moss or dish. Lamps, benches, fences, bike racks and tram stops are redrawn in the pixel style; the park lantern sits where its light is.

## Boundaries & Constraints

**Always:** light from the top left, hard edges, whole base pixels; everything seeded and built once at map load; the pool is fixed, so the display list does not grow while playing; dressing never stands on an object or door tile.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; use `Math.random`.

</frozen-after-approval>

## Code Map

- `render/streetMath.js` (new, pure): props from neighbours and objects, decal keys per tile, schoolyard, `PARK_LAMP`.
- `scenes/StreetArt.js` (new): `street-atlas` frames (props) and decal tile textures; `render/StreetProps.js` (new world system): pool lent by view; `data/street.json` (densities), `data/quality.json` `streetProps` (70 / 110 / 160).
- `scenes/EnvArt.js`: decals in `groundKeys`, four fence looks per direction, tram stop redrawn. `scenes/BuildingArt.js` + `render/buildingMath.js`: six roof looks, roof dressing. `scenes/ParkArt.js`: lamp, bike rack, jogging slab joints. `vehicles/trickArt.js`: bench. `entities/PlayObjects.js`: the newsstand and Pfand rectangles are gone (sprites replace them). `data/lighting.json`: park lamp light offset to the lantern.
- `scripts/check-street.mjs`, `scripts/smoke/street.js` (runs last), `check-envart.mjs` updated.
- Not changed: `data/maps/*`, collision, pathfinding.

## Tasks & Acceptance

- [x] pure maths, data, node check
- [x] prop atlas, decals, world system, wiring
- [x] roof variants and dressing, fences, tram stop, park lamp, rack, bench
- [x] smoke scenario, shots after-16-9, metrics, bench, docs

**Acceptance Criteria:**
- Given every district shot, then the largest flat area is at most 4096 px (it was 5089 in oldtown).
- Given the map, then check-map, check-collisions and check-traffic pass unchanged.
- Given any view, then the props shown never exceed the tier's `streetProps` and the pool does not grow.

## Implementation Notes

Implemented directly in this session. 77 node checks and the seeded smoke test (1368, +7) pass. Flat area per Medium shot at most 2113 px (oldtown 5089 > 1783; the Low evening and night shots of market and riverside stay at 5189 to 6938 as before, from flat water and asphalt without the light map); seams: park 101.5 > 86.5, skate day 350 > 189.5, skate night 217 > 121.5, plaza 158 > 124; walkable luminance unchanged within 0.01. Remaining long seams are the roof-to-facade lines of buildings (oldtown 168, riverside 197, road 144, from 16.7) and a HUD label. Paired bench: worst case (e everything) at most +9 percent. Deviation: the town has few sidewalks (98 props, 18 per view), so `streetProps` pools are small; the smoke scenario runs last because it moves the kid.

## Plan Change Log

## Review Triage Log

Self-review only (no review lenses): found and fixed a pool leak on map round trip (lent images were not destroyed on unload).

## Design Notes

Why the flat area was high: tile roofs repeat one 32 unit tile and its dark joint lines were one connected 5-bit colour across the whole roof; the fix is variants with three joint colours plus dressing, not more contrast. Props are an image pool per view rather than one image each (869 live images cost +40 percent in 16.7).

## Verification

- `node scripts/check-all.mjs`; seeded smoke test (`bench-cdp.mjs --smoke`); `node scripts/shots.mjs --label after-16-9`; paired `bench-cdp.mjs --live --uncapped`.
