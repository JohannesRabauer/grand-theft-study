---
type: epic
title: "The school day: morning to Zeugnis"
parent: initiative-schulweg-game
covers: [CAP-2, CAP-3, CAP-4, CAP-5, CAP-8]
assignee: ""
risk: medium
---

# The school day: morning to Zeugnis

## Description

A child plays one complete Klasse 3 day from waking to the Zeugnis. The spec owns the capabilities; the game architecture spine owns the technical rules.

## Outcome

A child plays one complete Klasse 3 day from waking to the Zeugnis.

## Done when

1. Morning, commute, school, afternoon and evening run in order from the clock.
2. Lessons use the minigames and grades are computed from results.
3. The Zeugnis applies the promotion rule and ends warmly in both outcomes.

## Boundaries

One capability area of the game, following the spec. Not other epics' areas; see the spec's non-goals.

## References

- Entry 8.3 implemented: `data/maps/school.json`, `data/timetable.json`, `services/SchoolDay.js`, `entities/School.js` and `ui/screens/TimetableScreen.js`. At the school entrance, interact to enter; inside, interact at the golden classroom circle to read the timetable and attend the next lesson. Attendance skips waiting through the day clock; completing the last lesson starts the afternoon. Grades are recorded per child with day-specific lesson IDs, saved after lessons and restored by Continue. Quitting a lesson allows a retry without a recorded grade.

- parent — _bmad-output/initiative-schulweg-game/initiative-schulweg-game.md
- spec — _bmad-output/initiative-schulweg-game/spec-schulweg-game/spec-schulweg-game.md, section Capabilities
- constraint — _bmad-output/initiative-schulweg-game/architecture-schulweg-game/architecture-schulweg-game.md, the ADs cited on each story
- constraint — the prototype spine AD-1 to AD-15 and the prototype code as base
