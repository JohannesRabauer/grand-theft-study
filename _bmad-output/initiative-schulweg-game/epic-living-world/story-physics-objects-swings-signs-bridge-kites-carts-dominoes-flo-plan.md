---
title: "Repeatable bounded physical play objects"
type: feature
ticket: 3
created: 2026-11-07
status: built
baseline_revision: 599f3c1efa3316cd434cbf61f69693cb2bf8693d
risk: high
context:
  - ../plan-open-world-expansion.md
---

## Intent and authority

Implements BMAD 12.3 under [the integration plan](../plan-open-world-expansion.md).
Physical play uses Matter, scaled procedural art and the existing aggregate prop budget, never a second unlimited pool.

## Delivered

- Eight distinct repeatable types: swing, wobbling sign, five-plank linked rope bridge, kite, flag, slope cart,
  six-crate dominoes and tethered canal boat. Old town and both new neighborhoods contain play.
- Fresh interact gives immediate motion, particles and localized device-aware prompts/feedback.
  Repeat use repositions the same bodies; toys cannot break, spawn loot or hurt crowd/animals/bullies.
- `PlayObjects` creates links through the existing Matter factory; linked groups wake atomically within the prop cap.
  Reverse map unload removes constraints before pooled bodies; decorative frames/slope/landmarks add no physics bodies.

## Delivery evidence

`scripts/check-open-world.mjs` validates the eight kinds/catalog/layouts.
`scripts/smoke/open-world.js` repeatedly activates every kind, measures motion, reward/body/constraint stability,
co-op operation and map cleanup. The expanded benchmark wakes all toys with traffic, weather and two riders.
Shared result: **40 pure checks; 927 browser assertions; zero console problems; aggregate prop peak 48/60**.
See [the full verification record](../../../docs/TESTING.md#open-world-expansion).

## Review and remaining risk

Coordinator/BMAD Quick review and browser visual review completed; no work was deferred. Physical-device tests
remain manual. All six final measured desktop Medium maxima satisfy 3 ms; percentiles were not substituted
for worst-case acceptance. Status is **built**, not user-accepted **done**.
