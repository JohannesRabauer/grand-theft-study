---
type: epic
title: "Visual overhaul: a finished-looking pixel world with lighting, shaders and particles"
parent: initiative-schulweg-game
covers: [CAP-35, CAP-34, CAP-31, CAP-30, CAP-33]
assignee: ""
risk: high
---

# Visual overhaul: a finished-looking pixel world with lighting, shaders and particles

## Description

The game plays well, but the outside world and the interiors look unfinished: trees sit as single squares inside their tile, buildings are flat rectangles, hedges are green blocks, the pond is a framed rectangle and rooms are bare boxes. It looks like what it is: art drawn per tile from a procedural toolbox (`scenes/EnvArt.js`, `scenes/HiResArt.js`). This epic overhauls every visual layer while it stays pixel art and keeps the current character and environment designs recognisable: organic shapes that break the tile grid, layered detail and set dressing, real lighting (time of day, lamps, windows, headlights), soft shadows, shader effects (water, wind, wet ground, colour grade, bloom) and many more polished particles, all smooth at 60 FPS.

Every story loads the project skill `schulweg-pixel-art` (made in entry 1) before it draws anything; UI work also loads `ui-ux-pro-max`. The rules live in AD-31 and the art bible.

## Outcome

Kids and parents see a warm, atmospheric, finished pixel-art town instead of a grid of rectangles; the signal is the user's before/after visual review of the fixed screenshot set (CAP-35 success).

## Requirements

- E16-R1 (CAP-35): An art bible and a project skill define the target look, and a clean, repeatable screenshot set (no debug overlay) records before and after.
- E16-R2 (CAP-35): A lighting and post-effects pipeline (AD-31) drives ambient light by time of day, point lights, emissive pixels, colour grade, bloom and vignette, pixel-crisp, with tier fallbacks.
- E16-R3 (CAP-35): Lamps, windows, vehicles, shops and interiors emit light; sprites and buildings cast soft, consistent shadows.
- E16-R4 (CAP-35, CAP-34): Ground, vegetation, buildings, water and street furniture no longer read as tile-aligned rectangles: organic edges, overlap across tiles, variation and set dressing.
- E16-R5 (CAP-35): Interiors (home, school, dojo, shops) get depth, materials, furniture variety, clutter and interior light.
- E16-R6 (CAP-35, CAP-31): Particles and atmosphere (weather shaders, fog, cloud shadows, wet ground, ambient life) are richer and smoother within the caps.
- E16-R7 (CAP-35): Motion feels smooth: camera, animation, map transitions; the UI matches the new look.
- E16-R8 (CAP-35, CAP-33): Medium stays at 60 FPS and within the AD-29 budget, Low and Canvas fall back gracefully, and an effects setting lets parents tone effects down.

## Done when

1. The after screenshot set (every district, every interior, morning/day/evening/night, rain and snow) shows no area that reads as plain tile-aligned rectangles, and the user's visual review accepts it.
2. At evening and night the town is lit by lamps, windows and vehicles with pixel-crisp light falloff, and night stays readable and friendly.
3. Medium worst-case update stays within the AD-29 budget, the headless bench frame time (p95, all effects on, worst-case scenario) stays at or below 16.7 ms on Medium and High and at most 25 percent above the before baseline, and Low and Canvas render correctly without the WebGL passes.
4. `node scripts/check-all.mjs` and the seeded smoke test pass; collision, pathfinding and map data are unchanged.

## Boundaries

Rendering only: art, lighting, shaders, particles, camera feel and the visual skin of the UI. Not map layout, collision, gameplay, balance or new content. Character designs and the existing environment designs keep their identity (refine, do not replace); the exception is sprites that read as poorly drawn, which entry 20 may redraw as long as role, colours, name and trait stay recognisable and sizes, anchors, hit areas and texture keys do not change. No external assets: everything stays procedural (AD-30, build brief).

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, CAP-35 (also CAP-34, CAP-31)
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-31 and AD-30, AD-29 (budget), AD-27 (UI layers)
- brief — _bmad-output/initiative-schulweg-game/build-brief.md
- code — scenes/EnvArt.js, scenes/HiResArt.js, scenes/ParkArt.js, scenes/DojoArt.js, scenes/NpcArt.js, scenes/VehicleArt.js, services/World.js, services/DayClock.js, services/dayTime.js, particles/ParticleHub.js, data/particles.json, data/quality.json, data/weather.json, data/day.json, camera/CameraRig.js, ui/uiKit.js, ui/hud/
- tools — scripts/zoom-sweep.mjs, scripts/bench-cdp.mjs, scripts/lib/headless-browser.mjs, docs/PERFORMANCE.md
- skills — `.claude/skills/schulweg-pixel-art/` (entry 1), `ui-ux-pro-max` (entry 14)

## Notes

- Decision: 2026-11-08 user request: overhaul the complete visuals; keep pixel art and the general character and environment design; the outside world and interiors look unfinished and too much like a rectangular toolbox; add lighting, shader effects and many particles so it looks smooth and more realistic.
- Decision: 2026-11-08 the user asked only for the tickets, to be built by a Sonnet session one story at a time; one epic, built in table order (entries mostly touch different files, but `GameScene.js`, `EnvArt.js` and `data/quality.json` are shared, so never two writers at once).
- Assumption: one epic of 19 entries rather than two (world art / lighting and effects), because one Sonnet session builds them in sequence; split later if the user wants separate reviews.
- Assumption: the lighting is a base-resolution light map plus Phaser 3.90 WebGL `PostFXPipeline` passes (AD-31), not Phaser's `Light2D` normal-map pipeline (light count limit, needs normal maps for every procedural texture). Entry 2 may revisit this with measurements and record the outcome in AD-31.
- Assumption: the sun comes from the top left; shadows fall to the bottom right, shorter at noon, longer morning and evening.
- Assumption: the epic frame-time limit is p95 16.7 ms headless (60 FPS) and at most +25 percent over the before baseline; AD-29 covers update time only, GPU pass cost needs this frame limit. Change it in Done when 3 if you want another number.
- Assumption: characters, NPCs, animals and vehicles get a shading-only pass (entry 18) so they match the new world; their designs, sizes and anchors stay as they are.
- Decision: 2026-11-08 independent validation applied: lights each owned by one entry (3 street, 7 windows, 10 interiors, 11 glowing particles), EnvArt-touching entries chained, atmosphere split into 12 and 19, look metrics added to entry 1 so visual verifies are measurable, interiors limited to the maps that exist (home, school, dojo).
- Decision: 2026-11-10 user complaint: some characters look horrible and some cars and bikes look awful. Weak sprites may be redrawn (entry 20, before the shading pass 18), not only shaded.
- Unknown: the frame rate on a real phone was never measured (HANDOFF); entry 15 measures headless and leaves the phone measurement to the user.
- Observation 2026-11-08 (headless High, town at 07:45): trees are single squares inside their tile, hedges are blocks, buildings flat rectangles, the pond a framed rectangle, the grass a flat green field.
