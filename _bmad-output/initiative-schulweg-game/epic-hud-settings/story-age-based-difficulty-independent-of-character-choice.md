---
id: 7
type: story
title: "Age-based difficulty independent of character choice"
parent: epic-hud-settings
covers: [CAP-12, CAP-6, CAP-28, CAP-23]
after: [4, 2.1, 3.1]
refined: false
hitl: false
risk: medium
---

# Age-based difficulty independent of character choice

## Description

Uses character ages as per-player difficulty defaults and lets players explicitly choose a difficulty age/level independently of their character, consistently across relevant learning/minigame surfaces while preserving adaptivity, progress and Klasse 3 scope.

## Requirements

Verify: Character defaults, independent overrides, saved settings, co-op independence and adaptivity behave consistently; the age mapping and relationship to parent settings are explained in DE/EN.

1. Review Helena, Kilian and Lorenz's default challenge settings against their configured ages, including relevant learning/minigame timing.
2. An explicit difficulty age/level choice changes challenge settings without changing character appearance, attributes or earned progress.
3. Character age supplies only an initial default; it must not repeatedly replace the player's adaptive learning progress.
4. Per-player overrides are independent in co-op and survive save/Continue. Migration preserves previous progress and parental settings.
5. Apply the agreed age mapping consistently across relevant learning and minigame surfaces while retaining Klasse 3 content and adaptivity.
6. German and English explain the setting and its relationship to parental difficulty controls.
7. Tests cover all three character defaults, independent overrides, migration, Continue, mixed co-op settings and continued adaptive progression.

## Boundaries

Do not add higher school-year content or make an older character selection overwrite an established learning level. Character perks and earned attributes remain distinct from difficulty.

## Notes

- Source: the initiative's playtest feedback; converted from the accidentally created GitHub duplicate.
- Open question: refine the exact age-to-difficulty mapping before implementation; the user has not supplied numeric thresholds.

## References

- parent — _bmad-output/initiative-schulweg-game/epic-hud-settings/epic-hud-settings.md
- source — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md, Notes
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-19 and AD-27
