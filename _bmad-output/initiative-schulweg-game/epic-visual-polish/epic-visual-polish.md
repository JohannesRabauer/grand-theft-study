---
type: epic
title: "Visual polish: follow-ups from the epic 16 review"
parent: initiative-schulweg-game
covers: [CAP-35, CAP-33]
assignee: ""
risk: medium
---

# Visual polish: follow-ups from the epic 16 review

## Description

Epic 16 is built. Its last story, 16.17, is the user's own visual review and stays open in epic 16. This epic collects the work that the build left open or that the review is expected to find: art-bible limits that are still exceeded (the longest straight seam in 77 of 88 shots, the largest flat area in 4 Low shots), the frame-time limit that was never shown reliably on the shared dev machine, sprites that were only shaded and not redrawn, and a place for the user's own fix list. Nothing here changes map layout, collision, gameplay or texture keys, sizes and anchors.

Every art story loads the project skill `schulweg-pixel-art` first and follows AD-31 and docs/ART-BIBLE.md. Measure with `node scripts/shots.mjs` and the look metrics against `docs/art-limits.json`; compare to the `after-16-16` set.

## Outcome

The after screenshot set meets the art-bible seam and flat-area limits (or each remaining offender is named and accepted by the user), the epic frame-time limit is confirmed on a quiet machine, and the user's review remarks are fixed.

## Requirements

- E17-R1 (CAP-35): Longest straight seam at most 96 base px in every shot, or an offender named and accepted by the user.
- E17-R2 (CAP-35, CAP-33): Largest flat area at most 4096 base px2 in every shot, Low included, without the WebGL pipeline.
- E17-R3 (CAP-35, CAP-33): Frame time on Medium and High confirmed at p95 <= 16.7 ms and <= +25 percent over the 16.1 baseline on a quiet machine, with the numbers in docs/PERFORMANCE.md.
- E17-R4 (CAP-35): Weak sprites left after the visual review are triaged and fixed.

## Done when

1. `node scripts/shots.mjs` gives seam and flat-area metrics within `docs/art-limits.json` for all 88 shots, or the user accepts each named exception.
2. docs/PERFORMANCE.md holds quiet-machine numbers that show the +25 percent limit (or the tuning that made it hold), and the real-phone measurement is done or explicitly left to the user.
3. The user's review list and the sprite triage are closed.
4. `node scripts/check-all.mjs` and the seeded smoke test pass; collision, pathfinding and map data are unchanged.

## Boundaries

Rendering only, as in epic 16. Do not touch the entries of epic 16 (16.17 stays the user's visual review). Seeded generators that differ per module stay separate unless a story accepts the pixel change on purpose.

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- epic 16 — _bmad-output/initiative-schulweg-game/epic-visual-overhaul/epic-visual-overhaul.md and story-refactor-sweep-plan.md (section "Art-bible limits still exceeded")
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-31, AD-30, AD-29
- code — scenes/EnvArt.js, scenes/HiResArt.js, scenes/GroundArt.js, scenes/NpcArt.js, scenes/VehicleArt.js, render/, docs/art-limits.json, docs/ART-BIBLE.md, docs/PERFORMANCE.md, scripts/shots.mjs, scripts/bench-cdp.mjs

## Notes

- Decision: 2026-11-14 the user asked for these follow-ups to be recorded as tickets (a new epic), so epic 16 can be closed off for now; only planned, none built.
- Decision: 2026-11-14 epic 16 entries stay untouched; 16.17 remains the user's visual review (hitl).
- Assumption: the seam work is split by area (interiors; building exteriors and roofs; kerbs, fences and water edge) because one session cannot safely rework all of EnvArt at once; build in table order, never two writers at once (shared files EnvArt.js, Interiors, quality.json).
- Assumption: seams are broken by seeded jogs, steps, notches or overlap that keep the design recognisable, not by shortening the objects.
- Observation 2026-11-14 (after-16-16): seam exceeded in 77 of 88 shots: interiors school day 471, dojo day 368, home morning 347, school night 262, home night 230, dojo night 179; school exterior 297, riverside 193 to 197, skate 121 to 190, oldtown 160 to 174, road 116 to 146, plaza and market 120 to 124, park summer Low 192, lamp-dusk 165. Park by day (87 to 89) is the only clean area.
- Observation 2026-11-14 (after-16-16): flat area exceeded in 4 Low shots only: oldtown-rain-night 7623, market-evening 6938, riverside-night 6063, riverside-evening 5119 vs 4096. Every Medium shot is within the limit.
- Observation 2026-11-14: UI shots (`ui-shots.mjs`) are not byte-reproducible because Phaser tweens use wall-clock time (36 of 44 images differ between two runs); see entry 9.
- Observation 2026-11-14 (leftover notes in epic 16 plans): the seeded generators differ per module (VegArt, ParkArt, GroundArt.hash2, buildingMath.mix, waterMath.hash01, atmosphereMath.hash01, interiorMath.hash2, StreetLights.hash) and camera/motionMath.js keeps its own clamp and smooth; both were left on purpose because merging changes baked art. The comic caught frame and the minigame stages keep their own looks on purpose and are not in the UI refresh. The street-dressing plan noted oldtown Medium flat area 5089 against 1783 at that time; entry 4 re-checks it.
- Unknown: the frame rate on a real phone was never measured; entry 6 covers it.
