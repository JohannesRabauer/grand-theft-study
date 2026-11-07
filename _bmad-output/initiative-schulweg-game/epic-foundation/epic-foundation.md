---
type: epic
title: "Game foundation: state, day clock, players, screens, maps"
parent: initiative-schulweg-game
covers: [CAP-2, CAP-26, CAP-27, CAP-32, CAP-4, CAP-1]
assignee: ""
risk: medium
---

# Game foundation: state, day clock, players, screens, maps

## Description

Every later system has one place to save data, one clock, a player array, a screen stack and a map switcher to build on. The spec owns the capabilities; the game architecture spine owns the technical rules.

## Outcome

Every later system has one place to save data, one clock, a player array, a screen stack and a map switcher to build on.

## Done when

1. Progress survives a page reload in any of three save slots, with a corrupt slot handled gracefully.
2. The day clock runs the five phases and emits phase events that trigger autosave.
3. The player list, per-player intents, HUD modules, screen stack and map switching work without changing single-player behaviour.
4. check-all and the smoke test pass and the Medium update cost is within budget.

## Boundaries

One capability area of the game, following the spec. Not other epics' areas; see the spec's non-goals.

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, the ADs cited on each story
- constraint — the prototype spine AD-1 to AD-15 and the prototype code as base
