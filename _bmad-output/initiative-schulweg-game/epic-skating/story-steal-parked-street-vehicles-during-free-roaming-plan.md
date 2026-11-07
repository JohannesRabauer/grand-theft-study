---
title: "Temporary object-scoped street rides"
type: feature
ticket: 8
created: 2026-11-07
status: built
baseline_revision: 599f3c1efa3316cd434cbf61f69693cb2bf8693d
risk: high
context:
  - ../plan-open-world-expansion.md
---

## Intent and authority

Implements BMAD 5.8 under [the integration plan](../plan-open-world-expansion.md), the sole source of scope and acceptance.
Taking an unattended ride is temporary permission for that identifiable object, never a family type unlock.

## Delivered

- `vehicles/streetLogic.js`, `entities/StreetRides.js`: catalog IDs, atomic claims, clear contention/witness feedback,
  device-aware take/drop/origin-return prompts, cross-map carry and safe current-position abandonment.
- Bike/board mount services share provenance; ordinary displays, family ownership, parking and bully theft remain separate.
- Validated actions and save v7 migration retain per-object location; Continue drops carried records without an origin clone
  or skipping morning preparation. Corrupt street records retain the existing backup/refusal behavior.

## Delivery evidence

`scripts/check-open-world.mjs`: all four kinds, competing claims, one object per rider, invalid transitions,
return/drop/travel, migration/progress and corruption. `scripts/smoke/open-world.js`: real co-op mounts, map carry,
drop/return, witness, locked displays, traffic fling/caught and actual menu Continue.
Full regression evidence: **40 pure checks; 927 browser assertions; zero console problems**.
See [the shared verification record](../../../docs/TESTING.md#open-world-expansion).

## Review and remaining risk

Coordinator/BMAD Quick review completed; the wall-adjacent traffic-fling snapshot defect was fixed and covered by
reclaim/save/browser regressions. No work was deferred. Manual device usability and real-phone performance remain
unverified; all six measured integration Medium maxima satisfy 3 ms. Status is **built**, not user-accepted **done**.
