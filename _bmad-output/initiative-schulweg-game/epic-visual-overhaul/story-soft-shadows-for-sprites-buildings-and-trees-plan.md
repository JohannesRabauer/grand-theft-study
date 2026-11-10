---
title: 'Soft shadows for sprites, buildings and trees'
type: 'feature'
ticket: 4
created: '2026-11-09'
status: built
baseline_revision: '0b77fee'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: soft shadows (16.4, CAP-35, CAP-34)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Shadows are inconsistent baked blobs: smooth black ellipses under some sprites, a fixed strip under hedges and fences, none for buildings or props, and they ignore the time of day.

**Approach:** Dithered cool-tinted contact shadows under every figure, vehicle, animal and prop. Cast shadows of buildings, trees, booths, fences, hedges and dumpsters come from one shadow layer baked once per map (caster mask plus ambient-occlusion bands at wall feet); a small WebGL object shader offsets the mask along the sun direction, so length follows the time keyframes without any redraw. Shadows fade under night light.

## Boundaries & Constraints

**Always:** sun top left, shadows fall to the bottom right in every shot; offsets snap to whole base pixels; the layer sits under all objects and never on the HUD; Medium and High (WebGL, outdoors) get cast shadows, Low and Canvas keep contact shadows only; no per-frame allocation or redraw.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; use `Math.random` at run time (seeded dither only).

</frozen-after-approval>

## Code Map

- `render/shadowMath.js` (new, pure): `sunAt` (keyframes of `data/lighting.json` `shadows.sun`: length and angle, blended), `buildShadowMask` (RGB bytes at base pixels: R tall casters, G low casters, B footprint 255 / ambient occlusion levels), `shadowAlpha` night fade.
- `render/pipelines/ShadowFx.js` (new): object pipeline (SinglePipeline) sampling the mask at `uv - offset`, cutting the casters' own footprint; registered in `render/pipelines/index.js` `OBJECT_PIPELINES`.
- `render/Shadows.js` (new): per-map layer image (world system: `unloadMap`/`loadMap`), updates offset and strength on `clock:tick`.
- `scenes/HiResArt.js` `Pen.shadow`: dithered tinted contact ellipse (all figures, vehicles, animals use it); `makeProps`/tree/fence/booth/dumpster baked blobs; `scenes/EnvArt.js` `castShadow` and `env-shadow-*` keys removed (replaced by the layer).
- `entities/Prop.js`: contact shadow image per prop. `scenes/BootScene.js` 1x player and bully shadows dithered.
- `data/lighting.json` `shadows`; `scripts/check-shadows.mjs` (new) in `check-all.mjs`; `scripts/check-envart.mjs` if it names `env-shadow-*`.
- Not changed: `data/maps/*`, collision, pathfinding, ParkArt/DojoArt lamp, bench and sign sprites (own baked pole shadows).

## Tasks & Acceptance

**Execution:**
- [ ] `render/shadowMath.js`, `data/lighting.json`, `scripts/check-shadows.mjs` -- pure maths and mask, tested
- [ ] `render/pipelines/ShadowFx.js`, `render/Shadows.js`, `scenes/GameScene.js`, `data/quality.json` -- layer and shader, wired
- [ ] `scenes/HiResArt.js`, `scenes/EnvArt.js`, `scenes/BootScene.js`, `entities/Prop.js` -- contact shadows
- [ ] `scripts/shots.mjs` run `after-16-4`, bench, docs (`ART-BIBLE`, `PERFORMANCE`, AD-31 note, README), skill note

**Acceptance Criteria:**
- Given a day shot, when a building, tree, fence, figure, vehicle or prop is on screen, then a shadow lies to its bottom right.
- Given 07:00, 12:00 and 19:45, when the same place is shot, then the shadow length is longest in the morning and evening and shortest at noon, direction always bottom right.
- Given night, then cast shadows are gone; given the HUD, no shadow is drawn over it.
- Given the bench, then the shadow mask is built once per map and the per-frame cost is one draw call.

## Implementation Notes

Implemented directly in this session (no coding subagent): the work is one connected render change.

Outcome: all checks (70) and the seeded smoke test (1287) pass; shots `after-16-4`; bench worst p95 +20 percent (Low), Medium and High at most +5 percent. Deviations: the shadow shader skips pixels the full shift does not reach (3 fetches instead of 9); the mask is built only when the tier casts shadows; no review lenses were run beyond the self-checks above.

## Plan Change Log

## Review Triage Log

## Design Notes

A shifted copy of a caster mask covers the swept area as long as the shift is smaller than the caster, so lengths are capped (tall 12 base px, low 4); the mask is cut where the caster itself stands (footprint), so shadows never darken roofs or hedges.

## Verification

**Commands:**
- `node scripts/check-all.mjs` -- all green
- `node scripts/shots.mjs --label after-16-4` -- shots and metrics
- seeded smoke test (docs/TESTING.md) -- passes
