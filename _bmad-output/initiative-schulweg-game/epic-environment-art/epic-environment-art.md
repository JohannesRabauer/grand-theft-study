---
type: epic
title: "Environment art: ground transitions, water, buildings, fences"
parent: initiative-schulweg-game
covers: [CAP-34]
assignee: ""
risk: medium
---

# Environment art: ground transitions, water, buildings, fences

## Description

The town keeps its blocky retro style but every surface, building, door, fence and the water must look right and consistent. The spec owns CAP-34; the game architecture spine AD-30 owns the rules.

## Outcome

The town looks like a believable German neighbourhood in the game's blocky pixel style, and the user's visual review accepts it.

## Done when

1. Ground surfaces blend with soft or detailed transitions and curbs; no hard tile seams remain between surface types.
2. Water has banks, depth shading, animated shore and shimmer, and meets bridges and land convincingly.
3. Houses have roofs, walls, windows and clearly usable doors; fences, hedges and walls look like what they are.
4. Screenshots of every district pass review, Low and Medium look consistent, and the update budget holds.

## Boundaries

Visual rendering of existing map data only. Not map layout, collision or gameplay changes (AD-30).

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, CAP-34
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-30
- code — scenes/HiResArt.js, scenes/ParkArt.js, scenes/DojoArt.js, scenes/BootScene.js, data/tiles.json, data/maps/town.json

## Notes

- Decision: 2026-11-07 user playtest: the blocks are fine but houses, doors, fences, water and ground transitions do not look right.
- Decision: 2026-11-07 priority: build this epic before further gameplay epics.
