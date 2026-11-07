---
id: 8
type: bug
title: "Deutsch input cleanup and controller parity"
parent: epic-minigames
covers: [CAP-7, CAP-23, CAP-33]
after: [3]
refined: false
hitl: false
risk: medium
---

# Deutsch input cleanup and controller parity

## Description

Reproduces and fixes the on-screen letter pad remaining after manual typing/submission, question or mode changes and scene exit; provides a fair controller spelling interaction or device-aware timing/scoring without weakening learning objectives.

## Requirements

Verify: Keyboard, touch, gamepad, device switching and mixed-device co-op tests cover pad visibility, repeated rounds and cleanup, and controller spelling throughput/scoring is no longer substantially penalized by letter navigation.

1. Reproduce the reported stuck letter pad and add a regression test for the failing transition; if it cannot be reproduced, record the tested conditions and evidence rather than asserting a speculative fix.
2. The pad hides or clears after submission, question/mode changes, results, quit and shutdown, and is present only when the current task/device needs it.
3. Umlauts, capitalization, corrections and accepted alternative spellings retain their current learning rules.
4. Switching between keyboard, touch and gamepad during a question preserves the answer and updates pad visibility and prompts correctly.
5. Controller spelling uses a fair interaction or device-aware time/scoring allowance; navigating letters alone must not lower the grade for equivalent demonstrated spelling knowledge.
6. Keyboard and controller players retain equivalent learning objectives, independent co-op answers and earned progress; do not substitute easier subject matter as an input workaround.
7. Repeated rounds, all three input devices and mixed-device co-op are covered, including cleanup and the throughput/scoring comparison.

## Reproduction

1. Enter the school and start a Deutsch spelling lesson.
2. Answer a typed spelling task using a physical keyboard and submit.
3. Continue to the next question, mode or result and observe whether the letter pad remains.
4. Compare completing equivalent correct spelling tasks using a gamepad and a physical keyboard.

## Boundaries

Preserve existing article sorting, typed-answer matching, localization, adaptivity and per-player scoring. This ticket does not implement age-based subject difficulty.

## Notes

- Source: user-reported failure, converted from the accidentally created GitHub duplicate. Exact frequency and transition still require reproduction.
- Cause hypothesis: a manual-keyboard path may leave letter-pad state alive through answer or mode transitions. This is not a confirmed root cause or a prescribed fix.
- Open question: refine the controller interaction and fair input-time allowance after measuring equivalent correct spelling tasks.

## References

- parent — _bmad-output/initiative-schulweg-game/epic-minigames/epic-minigames.md
- source — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md, Notes
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, AD-20 and inherited AD-10
