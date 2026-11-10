---
title: 'Particle overhaul: richer, smoother, lit'
type: 'feature'
ticket: 11
created: '2026-11-10'
status: built
baseline_revision: '6860d2e341a6274873e7fbcd992d02e53e3295d5'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
---

# Plan: particles (16.11, CAP-35, CAP-31)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Particles are single-frame blobs tinted flat: dust, leaves and sparks all look alike, nothing fades by an eased ramp, kids leave no footsteps or wheel dust, water has no crowns or drips, chimney and exhaust smoke is the same white puff, there are no falling leaves or petals, no motes in window light, and glowing things (fireflies, sparks) do not light anything.

**Approach:** One pixel-shaped multi-frame sheet (`p-sheet`, 20 hand-set frames) behind the emitters of `data/particles.json`, with colour-over-life ramps and eased fades; footsteps, wheel dust, ollie and skid puffs per surface, splash crowns and drips; smoke that drifts with the wind; falling leaves and petals by season; lamp embers; dust motes under windows; celebration bursts with a flash light; glowing particles that hold pooled `ctx.lights` handles; all under one hard budget of live particles per tier.

## Boundaries & Constraints

**Always:** the live particles of the hub never pass `maxParticles` (`put`/`roomFor`); each new always-on effect has an `...Off` flag set in `scripts/smoke/env.js`; light handles are released on death, on `killAll`, on map unload and on a tier change; whole base pixels, light from the top left; new placement uses the hub's own seeded generator, never `Math.random`.

**Never:** change collision, pathfinding, map data or gameplay; add external assets; touch the UI scene.

</frozen-after-approval>

## Code Map

- `scenes/particleShapes.js` (pure bitmaps + packing), `scenes/ParticleArt.js` (draws the sheet at the render scale), `scenes/BootScene.js` (calls it).
- `particles/particleMath.js` (pure: `roomFor`, `holds`, `GlowTracker`, `FlashLights`), `particles/ParticleHub.js` (budget `put`, glow, celebrate, footsteps, drips, placement `at: lamp|shaft`, smoke), `data/particles.json` (9 new emitters, ramps, `footsteps`, `glow`, `celebrate`, 4 seasonal effects), `data/quality.json` (`particleLights` 0/4/8).
- `entities/Bike.js` (skid puff), `entities/LootDrops.js` (pickup sparkle).
- `scripts/check-particles.mjs`, `scripts/smoke/particles.js` (+ env flags), `scripts/particle-frames.mjs`, `check-ambience.mjs` adjusted.
- Not changed: `data/maps/*`, collision, light map, street lights.

## Tasks & Acceptance

- [x] shapes, sheet, emitter configs with ramps and eases
- [x] hub: budget, glow lights, celebrations, footsteps and wheel dust, crowns and drips, smoke, season and shaft effects
- [x] node check, smoke scenario, frame script, shots after-16-11, bench, docs

**Acceptance Criteria:**
- Given walking or riding on asphalt, sand, snow or water, then the ground puffs or crowns; given a kid leaving water, then it drips.
- Given a dark evening on Medium or High, then fireflies and sparks light their surroundings from the pool and every handle is released when they die or are cleared.
- Given any flood of bursts on any tier, then live particles never exceed `maxParticles`.
- Given the seeded smoke test, then it passes with the new flags off and the `particles` scenario switching them on.

## Implementation Notes

Built directly in this session. 75 node checks and the seeded smoke test (1361 checks) pass; frames in docs/shots/overhaul/after-16-11/frames/, shots after-16-11 (68 shots; no look metric worse except Low plaza-day flat area 1040 to 1134 px2, a shifted random stream). Interleaved live bench against 6860d2e: worst p95 +12 percent (High e, 1.7 to 1.9 ms), Medium at most +3 percent. Deviations: `particleLights` is 4 and 8 so lamps, windows and vehicles keep their slots; the shares of the emitters now add up to about 2.2, the hub budget (not the shares) guarantees the total.

## Plan Change Log

## Review Triage Log

## Design Notes

Phaser draws a random frame from an emitter `frame` array and takes `color` as a ramp, so tint-less emitters get ramps and tinted ones (dust, steam) keep a per-surface tint. Glowing particles do not use death callbacks: a per-tick sweep gives a light back when its particle is dead, and `killAll` is wrapped for glowing emitters. Lights only follow while it is dark or indoors. The frame script found that the real `level:up` event opens the level-up screen, which holds the world; the script and the smoke scenario call `celebrate` directly.

## Verification

- `node scripts/check-all.mjs`; seeded smoke test (`bench-cdp.mjs --smoke`); `node scripts/shots.mjs --label after-16-11`; `node scripts/particle-frames.mjs --label after-16-11`; interleaved `bench-cdp.mjs --live --uncapped` against a copy of 6860d2e.
