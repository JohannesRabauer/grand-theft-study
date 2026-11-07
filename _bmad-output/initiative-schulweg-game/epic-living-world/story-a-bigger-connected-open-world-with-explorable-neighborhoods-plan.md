---
title: "Connected riverside and workshop-market neighborhoods"
type: feature
ticket: 6
created: 2026-11-07
status: built
baseline_revision: 599f3c1efa3316cd434cbf61f69693cb2bf8693d
risk: high
context:
  - ../plan-open-world-expansion.md
---

## Intent and authority

Implements BMAD 12.6 under [the integration plan](../plan-open-world-expansion.md), without replacing original coordinates,
destinations or school routes. Actual reachable area, not bounding-box size, is the expansion metric.

## Delivered

- Town expands from 96×64 to 160×112. Flood fill grows from **4,204 to 14,571 tiles (3.47×)** against the pinned baseline.
- Riverside promenade, canal with two fixed crossings, kite lawn and rope-play bridge; southern market road loop,
  courtyard alleys, workshop/bakery landmarks, cart slope and domino lawn. Old/new paths connect both districts.
- Connected NPC graph, localized signposts, procedural landmarks and unattended rides.
- `scripts/build-town-expansion.mjs`, immutable original-town fixture and `data/world-expansion.json`
  make the measurements and permitted boundary openings reproducible.

## Delivery evidence

`scripts/check-open-world.mjs` asserts original tiles/objects, original area, doubled flood fill, district reachability,
bike-sized paths and canal crossings. Two generator runs produced identical output hashes.
`scripts/smoke/open-world.js` drives co-op through both districts; old commute/school/morning regressions still pass.
Shared result: **40 pure checks; 927 browser assertions; zero console problems**.
See [verification and controls](../../../docs/TESTING.md#open-world-expansion) and [README](../../../README.md#open-world-exploration-and-temporary-street-rides).

## Review and remaining risk

Coordinator/BMAD Quick review and browser traversal/art review completed; no work was deferred.
Shop landmarks are visual destinations, not new purchase UI.
Real-phone frame rate is unmeasured; all six measured desktop Medium maxima satisfy 3 ms.
Status is **built**, not user-accepted **done**.
