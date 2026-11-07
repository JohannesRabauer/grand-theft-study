---
type: epic
title: "Seasons, weather and a living town"
parent: initiative-schulweg-game
covers: [CAP-30, CAP-31, CAP-4]
assignee: ""
risk: medium
---

# Seasons, weather and a living town

## Description

The town changes with the day and is full of reacting things. The spec owns the capabilities; the game architecture spine owns the technical rules.

Free roaming is the user's primary fun loop: a materially bigger connected world, many usable objects and driving traffic must make exploration rewarding without forcing a lesson or mission.

## Outcome

The town changes with the day and is full of reacting things.

## Done when

1. Seasons and weather cycle through the day and change surfaces.
2. The remaining particles, physics objects, traffic and animals exist within the caps.
3. The Medium update cost stays within budget.
4. At least two new neighborhoods double the reachable walkable area, while existing destinations and shared-camera co-op remain reachable.
5. At least six different repeatable interactions work across the old and new world, and cars drive connected routes with safe comic consequences.

## Boundaries

One capability area of the game, following the spec. Not other epics' areas; see the spec's non-goals.

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, the ADs cited on each story
- constraint — the prototype spine AD-1 to AD-15 and the prototype code as base

## Notes

- Source: user request, "the most fun of this game stems from the open world gameplay. make the world bigger, even more interactive and create driving cars and that you can steal bikes, skateboards, rollerblades or scooters."
- Decision: 2026-11-07 preserve and expand existing stories 12.3 (interactions) and 12.4 (traffic); add 12.6 for world size rather than duplicate those outcomes in a new epic.
- Assumption: two connected neighborhoods and at least twice the reachable walkable area make "bigger" measurable; their layout is refined before building 12.6.
- Decision: 2026-11-07 rideable vehicle profiles and player theft belong to 5.7/5.8; 12.6 consumes their street-spawn interaction. Driving cars does not mean stealing or driving cars as the player.
