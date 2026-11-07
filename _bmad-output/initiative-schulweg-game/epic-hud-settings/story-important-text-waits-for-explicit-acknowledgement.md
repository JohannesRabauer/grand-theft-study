---
id: 6
type: story
title: "Important text waits for explicit acknowledgement"
parent: epic-hud-settings
covers: [CAP-26, CAP-7, CAP-23, CAP-32]
after: [1.4, 4.1]
hitl: false
risk: medium
---

# Important text waits for explicit acknowledgement

## Description

Audits instructions, learning explanations, lesson introductions/results, dialogue and major messages so players can read indefinitely before explicitly continuing; relevant timers pause, held input cannot dismiss text, and slower co-op readers are not rushed.

## Requirements

Verify: Important screens remain visible beyond their former timeout, accept explicit keyboard/touch/gamepad confirmation, then restore clocks and gameplay correctly; incidental toasts stay non-blocking.

1. Audit gameplay instructions, learning explanations, lesson introductions/results, dialogue and important first-use help; record which surfaces require acknowledgement.
2. Important text remains visible indefinitely until the player explicitly chooses Continue or confirms. No countdown starts while the text is being read.
3. Relevant world, lesson and challenge timers pause without changing scoring or learning difficulty, and resume only after acknowledgement.
4. A key or button held before a screen opens cannot immediately dismiss it.
5. Keyboard, touch and gamepad have localized confirmation controls. Every participating co-op reader can take their own time.
6. Genuinely incidental HUD status toasts remain non-blocking; they must not carry instructions needed to progress safely.
7. For every audited important surface, tests leave it open beyond its former timeout, confirm explicitly and verify correct clock, screen and input restoration.
8. Cancel, quit and scene shutdown restore the world without starting a lesson, awarding rewards or retaining UI/listeners.

## Boundaries

Do not pause purely incidental status updates or change the learning and grade rules. Reuse the counted screen stack.

## Notes

- Source: the initiative's playtest feedback; converted from the accidentally created GitHub duplicate.
- Progress: morning's forgotten-supplies lesson introduction now waits for every participant before the lesson scene or countdown starts. The remaining audit is still outstanding; this story is not marked built.

## References

- parent — _bmad-output/initiative-schulweg-game/epic-hud-settings/epic-hud-settings.md
- source — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md, Notes
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-27 and AD-20
