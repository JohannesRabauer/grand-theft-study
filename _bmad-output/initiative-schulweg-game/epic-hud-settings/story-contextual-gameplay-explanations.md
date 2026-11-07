---
id: 5
type: story
title: "Contextual gameplay explanations"
parent: epic-hud-settings
covers: [CAP-26, CAP-20, CAP-23, CAP-32]
after: [1.4, 6]
hitl: false
risk: medium
---

# Contextual gameplay explanations

## Description

Adds plentiful first-use and situational explanations for bullies and spotting, defense, hiding, tools, skating, vehicle ownership and tricks, with active-device controls, co-op guidance and revisitable help.

## Requirements

Verify: A new player receives relevant localized explanations, can acknowledge and revisit them, and repeat hints do not spam or obscure play.

1. When spotting, trouble or a chase first becomes relevant, the player learns what caused it, how safe hiding works and how to leave hiding.
2. First-use defense guidance explains blocking, dodging, Kiai, tools and relevant unlocks in non-graphic, child-friendly language.
3. Vehicle guidance explains ownership, mounting, skating, ollies, manuals, grinds, combos and bus/tram grabs when usable.
4. Each explanation shows the active keyboard, touch or gamepad controls. Co-op guidance identifies the player it addresses.
5. Important explanations remain until fresh explicit confirmation, with relevant clocks paused as required by 11.6.
6. Players can revisit explanations. Short repeat reminders do not spam, hide hazards or obscure the other co-op player.
7. German and English text has the same meaning and child-safe tone.
8. Browser coverage triggers each mechanic's guidance and exercises acknowledgement, revisiting, repeat suppression and device switching.

## Boundaries

Preserve existing controls, unlocks, earned progress, defense rules and shared-camera two-player co-op. Incidental reminders may remain non-blocking.

## Notes

- Source: the initiative's playtest feedback; converted from the accidentally created GitHub issue, without treating closure of that duplicate as implementation.
- Assumption: use the existing screen and control-prompt visual patterns; no separate UI redesign is required by this ticket.

## References

- parent — _bmad-output/initiative-schulweg-game/epic-hud-settings/epic-hud-settings.md
- source — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md, Notes
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-27
