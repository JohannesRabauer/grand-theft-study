---
type: epic
title: "Skateboard, roller skates and the skatepark"
parent: initiative-schulweg-game
covers: [CAP-13, CAP-14, CAP-15, CAP-16]
assignee: ""
risk: medium
---

# Skateboard, roller skates and the skatepark

## Description

Kids can skate, trick and grind through a real skatepark and unlock all vehicles. The spec owns the capabilities; the game architecture spine owns the technical rules.

## Outcome

Kids can skate, trick and grind through a real skatepark and unlock all vehicles.

## Done when

1. Skateboard tricks build a Style combo that pays money and XP.
2. Roller skates handle differently per surface and can grab a bus or tram.
3. The skatepark has lines for every trick and is still bully turf.
4. Vehicle ownership, racks, theft and rescue work.
5. Scooters and inline rollerblades are rideable and persistent; all four requested street-vehicle types can be taken during free roaming without duplication.

## Boundaries

One capability area of the game, following the spec. Not other epics' areas; see the spec's non-goals.

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, the ADs cited on each story
- constraint — the prototype spine AD-1 to AD-15 and the prototype code as base
- Decision: 2026-11-07 playtest: buses must hit the player with a comic tumble; pulled forward as entry 5.6 (user feedback). School scene and lessons remain epic 8.

## Notes

- Source: the initiative's open-world feedback adds player theft of bikes, skateboards, inline rollerblades and scooters. Story 5.5 remains the built ownership and bully-borrows-bike flow; it does not satisfy player street-vehicle theft.
- Decision: 2026-11-07 5.7 provides rideable profiles; 5.8 owns street spawns, claim/return persistence and comic witnessed consequences; 12.6 consumes those interactions in the expanded world.
- Assumption: 5.8's consequence and persistence rules require refinement before implementation; existing bought or earned vehicles must retain their ownership.
