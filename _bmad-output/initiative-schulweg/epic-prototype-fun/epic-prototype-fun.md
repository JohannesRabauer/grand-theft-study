---
type: epic
title: "Fun-to-ride prototype with one escapable chase"
parent: initiative-schulweg
covers: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-9, CAP-10, CAP-11, CAP-12]
assignee: ""
risk: medium
---

# Fun-to-ride prototype with one escapable chase

## Description

The player runs and rides a bike through a small German town toward the school, is chased by bullies at Ärger levels 0–2, and escapes by hiding or gets comically caught. The world reacts with particles, wind, weather and props. The spec owns the capabilities; the architecture spine owns the technical invariants.

## Outcome

A tester finds the ride fun and the chase exciting and escapable, and the build holds 60 FPS on Medium on the reference phone: the spec's success signal.

## Done when

1. The README's PowerShell steps start the game on desktop Chrome and on the reference phone.
2. The commute to the school works by at least two routes, with the objective arrow.
3. A chase reaches level 2 and ends by hiding (level drops to 0) or by the caught frame and respawn.
4. Medium holds 60 FPS on the reference phone during a chase; Low and High change particle and prop counts live.
5. DE and EN toggle covers all visible text.

## Boundaries

The whole prototype as one capability slice, following the spec. Not the full game; see the spec's non-goals and the backlog.

## References

- parent — _bmad-output/initiative-schulweg/initiative-schulweg.md
- spec — _bmad-output/initiative-schulweg/spec-schulweg-prototype/spec-schulweg-prototype.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg/architecture-schulweg-prototype/architecture-schulweg-prototype.md, AD-1 to AD-14
- constraint — the spec, section Constraints (kid-safe, language rules, tool-safety)

## Notes

- Open question: which real phone is the 60 FPS reference device; entry 11 waits on it.
- Decision: 2026-11-06 slingshot (CAP-9) stays in as a stretch story, entry 10.
- Decision: 2026-11-06 no closing Refactor sweep story; the prototype is throwaway.
- Decision: 2026-11-06 after first playtest, entries 12-14 added (resolution, smooth zoom, pedestrians); CAP-12 added.
