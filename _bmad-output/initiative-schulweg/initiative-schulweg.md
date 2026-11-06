---
type: initiative
title: "Schulweg prototype that proves the fun"
parent: none
covers: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-9, CAP-10, CAP-11, CAP-12]
assignee: ""
risk: medium
---

# Schulweg prototype that proves the fun

## Description

A throwaway browser prototype of Schulweg, a retro top-down school action game for kids 8–14 where bullies replace cops. It answers two questions before the full game is built: is moving around and being chased fun, and does it hold 60 FPS on a mid-range phone. The spec owns capabilities, constraints and non-goals; the architecture spine owns the binding technical decisions.

## Outcome

A tester finds riding the bike through the town fun and a bully chase exciting and escapable, and the build holds 60 FPS on Medium on the reference phone: the spec's success signal.

## Done when

1. The prototype runs from a static server with the README's PowerShell steps on desktop Chrome and on the reference phone.
2. A tester completes the commute to the school and is chased and either escapes by hiding or is caught and respawns.
3. The Medium setting holds 60 FPS on the reference phone during a chase.
4. The user has decided to throw the prototype away or keep it as the base, and the lessons are folded back into the spec.

## Boundaries

Follows the capability boundary of the spec; one epic delivers it. Not the full game: see the spec's non-goals and `post-prototype-backlog.md`. Tracer path: the player walks on the loaded town map in the browser.

## References

- spec — _bmad-output/initiative-schulweg/spec-schulweg-prototype/spec-schulweg-prototype.md, section Capabilities
- constraint — the same spec, section Constraints, and the architecture spine _bmad-output/initiative-schulweg/architecture-schulweg-prototype/architecture-schulweg-prototype.md (AD-1 to AD-14)
- backlog — _bmad-output/initiative-schulweg/spec-schulweg-prototype/post-prototype-backlog.md

## Notes

- Open question: which real phone is the 60 FPS reference device; story 11 waits on it.
- Decision: 2026-11-06 one epic for the whole prototype (user confirmed).
