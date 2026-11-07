---
type: initiative
title: "Schulweg game: school year Klasse 3"
parent: none
covers: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-9, CAP-10, CAP-11, CAP-12, CAP-13, CAP-14, CAP-15, CAP-16, CAP-17, CAP-18, CAP-19, CAP-20, CAP-21, CAP-22, CAP-23, CAP-24, CAP-25, CAP-26, CAP-27, CAP-28, CAP-29, CAP-30, CAP-31, CAP-32, CAP-33, CAP-34]
assignee: ""
risk: high
---

# Schulweg game: school year Klasse 3

## Description

The full game for kids 8–14, built on the finished prototype: one complete school year (Klasse 3) played as one day, with learning woven into free roaming, skating, karate, a warm anti-bullying arc and local two-player co-op. The spec owns the capabilities; the architecture spine owns the technical rules; the prototype code is the base.

## Outcome

A child plays one complete Klasse 3 day from waking to Zeugnis, alone or in co-op, learns real curriculum content, sees progress in the Lernbuch and wants "one more day": the spec's success signal.

## Done when

1. A full day plays from waking to the Zeugnis in solo and in two-player co-op without errors, and progress survives reload.
2. Klasse 3 content for all five subjects and all eight lesson minigames work with adaptive difficulty and spaced repetition.
3. Skating, karate, tools and the five-level chase work as specified and nothing harms people or animals.
4. The Medium setting holds its update budget in the desktop proxy and the real-phone protocol is ready.

## Boundaries

Follows the spec's capability boundary: one school year, DE/EN, desktop and mobile browsers. Not Klassen 4–9, online play, backends or split-screen; see the spec's non-goals and backlog. Tracer path: a new game from the menu through morning, commute and school to the Zeugnis.

## References

- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md (AD-16 to AD-29) and the inherited prototype spine AD-1 to AD-15
- prototype — _bmad-output/initiative-schulweg/ (spec, spine, backlog), code in the repository root

## Notes

- Open question: which real phone is the 60 FPS reference device.
- Open question: co-op shares money and keeps grades per player by default; user to confirm.
- Decision: 2026-11-07 scope is Klasse 3 only; skating, karate and shared-screen co-op are in (user's choices).
- Decision: 2026-11-07 stories are built in sub-agents one at a time, in epic order, with a commit per story.
