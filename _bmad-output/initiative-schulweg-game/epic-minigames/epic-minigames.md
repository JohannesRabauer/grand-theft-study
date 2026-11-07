---
type: epic
title: "Lesson minigames"
parent: initiative-schulweg-game
covers: [CAP-7, CAP-5, CAP-12, CAP-23, CAP-33]
assignee: ""
risk: medium
---

# Lesson minigames

## Description

Each school subject is a short, fun minigame that feeds grades and the learning engine. The spec owns the capabilities; the game architecture spine owns the technical rules.

## Outcome

Each school subject is a short, fun minigame that feeds grades and the learning engine.

## Done when

1. The framework launches any minigame with one or two players and returns a result.
2. Mathe, Deutsch, Englisch, Erdkunde, Science, Musik, Sport and Kunst are playable in 30–90 seconds.
3. Minigames draw questions from the learning engine and record results through actions.
4. Deutsch's letter pad follows the task/device lifecycle and controller spelling does not penalize equivalent subject knowledge for input traversal speed.

## Boundaries

One capability area of the game, following the spec. Not other epics' areas; see the spec's non-goals.

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, the ADs cited on each story
- constraint — the prototype spine AD-1 to AD-15 and the prototype code as base

## Notes

- Source: the initiative's playtest feedback; bug 4.8 owns Deutsch pad cleanup and controller parity, not a replacement of the built Deutsch minigame.
- Decision: 2026-11-07 retain story 4.3's identity and built state; reproduce and fix the regression in separate bug 4.8.
