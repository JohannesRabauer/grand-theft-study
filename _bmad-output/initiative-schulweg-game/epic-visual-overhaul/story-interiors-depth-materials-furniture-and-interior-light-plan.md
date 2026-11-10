---
title: 'Interiors: depth, materials, furniture and interior light'
type: 'feature'
ticket: 10
created: '2026-11-10'
status: built
baseline_revision: '8069481'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: interiors (16.10, CAP-35)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Home, school and dojo are bare boxes: one plank texture, checker hall tiles, flat wall strips, a few rectangles drawn by entities, and no light of their own (the light map is off indoors). The interior shots exceed the flat-area limit (home 12960, dojo 37440 base px2 against 4096).

**Approach:** Wall faces get height (crown moulding, wallpaper or panelling, wainscot that continues 8 px into the first floor row, skirting, window frames, per-room wall furniture). Floors get materials per room type (plank boards with per-board tone and joints, hall tiles, school linoleum, polished dojo boards, tatami) with wear along the walked paths. Furniture and clutter come from `data/interiors.json` per map and are sprites from an interior atlas placed once at map load. Corner ambient occlusion is baked. A world system `render/Interiors.js` owns interior light: the light map runs indoors on Medium/High with an interior ambient, ceiling lamps switch on when it gets dark, window light shafts fall on the floor by day, all through `ctx.lights`; Low and Canvas show the same shafts and lamp glow as additive sprites.

## Boundaries & Constraints

**Always:** light from the top left, hard edges, whole base pixels; everything seeded and built once at map load; no display-list growth while playing; furniture is decoration only (against walls or low, flat things).

**Never:** change collision, pathfinding, map data, interaction spots or gameplay; add external assets; use `Math.random`; draw interiors for maps other than home, school, dojo.

</frozen-after-approval>

## Code Map

- `scenes/EnvArt.js` interior block (lines ~316-610: THEMES, faceTile, hallFloor, rugs, `indoorKeys`, `indoorInfo`) moves to new `scenes/InteriorArt.js`; EnvArt keeps calling `makeInteriorArt` and `indoorKeys`, outdoor code keeps using `indoorInfo` (door floors).
- `render/interiorMath.js` (new, pure): wear path tiles, window/lamp/furniture lists from `data/interiors.json`, light levels.
- `render/Interiors.js` (new world system), wired in `scenes/GameScene.js`, atlas built in `scenes/BootScene.js`.
- `render/LightMap.js`: enable indoors with interior ambient (`lighting.json` `interior`).
- `entities/School.js`: desks and bags move to the atlas (same spot, no interaction change); `entities/Home.js`, `entities/Dojo.js` untouched.
- `data/interiors.json` (new), `scripts/check-interiors.mjs`, `scripts/smoke/interiors.js`.

## Tasks & Acceptance

- [x] pure maths, data, node check
- [x] wall, floor, rug, wear art in `InteriorArt.js`
- [x] furniture atlas and `Interiors` system with lights
- [x] smoke scenario, shots `after-16-10`, metrics, bench, docs

**Acceptance Criteria:**
- Given each interior shot, then the flat area is at most 4096 base px2 on Medium and Low.
- Given day shots then window light shows, given night shots then lamp light shows (Medium/High through `ctx.lights`).
- Given doors, bag packing, lessons, chore board and dojo smoke scenarios, then they pass unchanged; check-map and check-collisions pass.

## Implementation Notes

Implemented directly in this session. Outcome: 74 node checks (new `check-interiors`, `check-envart` updated) and the seeded smoke test (1343 checks, +39 with the new `interiors` scenario, which runs last because a map round trip remounts bikes that earlier scenarios count) pass; shots and metrics in docs/shots/overhaul/after-16-10/. Interior flat area (limit 4096): Medium home 2265, school 1625, dojo 1278, Low at most 2493; the 60 other shots are byte-identical to after-16-8. Paired outdoor bench: worst p95 +6 percent; inside the rooms p95 at most 1.9 ms.

Deviations: the largest flat areas were the black margin round the small rooms and one-tone rugs and tatami, so a tinted brick backdrop (four strips above the light map, so the room's lamps do not light it) and quilted rugs were added; two night shots (school, dojo) were appended to the shot list; the dojo wall stays painted by `entities/Dojo.js` (a shoji window sprite and the explicit window list carry its daylight); `entities/School.js` lost its desk and board rectangles (decoration only; spot and label unchanged). No review lenses beyond the self-checks.

## Plan Change Log

## Review Triage Log

## Design Notes

The wall continues into the floor row (a 3/4 view without changing a map): the wall foot is part of the floor tile, so a kid walking along the wall stands in front of the wainscot. Wall furniture is depth-sorted just above the ground (never in front of a kid), floor furniture by its base line. Lamps float 20 px above the light's floor position and sort below the labels (depth 7900). Interior ambient blends with the outdoor darkness (`dark` stays the outdoor value for vehicles and windows). Smoke note for 16.11: indoor night colour grading is scaled by `ambient.grade` (0.45).

## Verification

- `node scripts/check-all.mjs`; seeded smoke test; `node scripts/shots.mjs --label after-16-10`; paired `bench-cdp.mjs --live --uncapped`.
