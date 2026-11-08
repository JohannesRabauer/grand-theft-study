---
title: "Time-of-day mood and street light sources"
ticket: 3
status: built
route: full
risk: medium
date: 2026-11-09
---

# Plan: time-of-day mood and street light sources (16.3, CAP-35)

<frozen-after-approval>
Replace the flat day tint with graded keyframes (cool dawn, neutral day, golden evening, blue night that stays readable) and add lights from data through `ctx.lights`: street lamps that switch on at dusk with a short warm-up flicker, shop and tram-stop signs, bus/car/van/tram headlights and tail lights that move with the traffic, and the bike lamp; pooled and culled off screen. Verify: evening and night shots of every district show lamps, signs and moving headlights; night walkable luminance meets `docs/art-limits.json`; a node check covers keyframe blending; active lights never exceed the tier cap. Rendering only: collision, pathfinding and map data stay unchanged.
</frozen-after-approval>

## Code Map

- `data/day.json` `tint`: more keyframes (read by `services/dayTime.js tintAt`; Low and Canvas use the same stops through `physics/Weather.js`).
- `render/lightMath.js`: add pure `lampLit` (schedule with per-lamp stagger) and `warmupLevel` (short flicker, at most 2.5 toggles per second); `LightPool` already enforces the cap.
- `render/StreetLights.js` (new, Phaser): lamp posts (3 shape variants, procedural, y-sorted) with a lit head sprite (also on Low), fixed lights from data (`lamps`, `sources`), vehicle and bike lights from `ctx.grabs.pool` and the players. All lights are culled to the camera and limited to `maxLights - reserve`; vehicles use the reserve.
- `render/LightMap.js`: the fixed-source wiring moves out to StreetLights; it exposes `dark` for the vehicle lights.
- `data/lighting.json`: schedules, street lamp positions (generated from road edges, spacing 11 tiles, no map change), signs, vehicle light parameters.
- `scenes/GameScene.js`: create and update StreetLights next to LightMap. Test hook not needed: lights use no `Math.random`.
- `scripts/check-lighting.mjs`, `scripts/check-day.mjs`: keyframe blending, lamp schedule, warm-up, cap. `scripts/shots.mjs`: evening and night shot for every district, light counts in the output.
- Not changed: `data/maps/*`, collision, pathfinding, `ParkArt` lamp sprites.
