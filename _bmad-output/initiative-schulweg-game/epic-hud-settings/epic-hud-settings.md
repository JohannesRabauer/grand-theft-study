---
type: epic
title: "HUD, minimap, phone and parent settings"
parent: initiative-schulweg-game
covers: [CAP-26, CAP-28, CAP-20, CAP-7, CAP-23, CAP-32, CAP-12, CAP-6]
assignee: ""
risk: medium
---

# HUD, minimap, phone and parent settings

## Description

Everything the kid needs is visible, and parents control the important settings. The spec owns the capabilities; the game architecture spine owns the technical rules.

## Outcome

Everything the kid needs is visible, and parents control the important settings.

## Done when

1. The full HUD shows every listed element in single-player and co-op.
2. The minimap toggles and shows the spotted radius.
3. The phone shows messages and parent settings change behaviour behind a math gate.
4. Contextual explanations cover existing mechanics, important text waits for acknowledgement, and character-age difficulty can be overridden independently.

## Boundaries

One capability area of the game, following the spec. Not other epics' areas; see the spec's non-goals.

## References

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, the ADs cited on each story
- constraint — the prototype spine AD-1 to AD-15 and the prototype code as base

## Notes

- Source: the initiative's playtest feedback. Stories 11.5-11.7 cover contextual guidance, indefinite reading and independent age-based difficulty.
- Decision: 2026-11-07 11.6 supplies the acknowledgement contract before 11.5 adds important explanations. Existing device input is sufficient; these stories do not wait for the unrelated platform-polish epic.
- Open question: 11.7's exact age mapping is refined before implementation, without rewriting established learning progress.
