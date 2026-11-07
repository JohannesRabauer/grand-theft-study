---
title: "Safe pooled cars, buses, tram and delivery vans"
type: feature
ticket: 4
created: 2026-11-07
status: built
baseline_revision: 599f3c1efa3316cd434cbf61f69693cb2bf8693d
risk: high
context:
  - ../plan-open-world-expansion.md
---

## Intent and authority

Implements BMAD 12.4 under [the integration plan](../plan-open-world-expansion.md).
Extend the existing route/traffic system; cars are not player-drivable and consequences remain comic and safe.

## Delivered

- Original two buses plus six cars, one riverside tram and three market vans, within the **12-target cap**.
- Existing route engine handles both main-road directions and rounded new district circuits.
- Yield to players, crowd, props and traffic; blocked recovery waits three seconds and uses at most 16 safe probes per retry.
  Recovery avoids players, obstacles and towing a rider. Map lifecycle retains pooling and cleanup.
- Bus/tram rear grabs remain original-skates-only; cars/vans cannot consume skaters' grab input.
  Existing hit cooldown, cartoon fling and rider cleanup are preserved.
- Cheap spatial rejection reduces traffic geometry work before expensive trigonometry.

## Delivery evidence

`scripts/check-open-world.mjs` samples actual oriented, eased hulls through two complete circuits per route and checks
yielding/non-grabbable hit classification. Browser traffic and expansion scenarios retain original bus contacts,
exercise new hits/grabs, co-op cleanup, yielding/recovery and pool caps.
Shared result: **40 pure checks; 927 browser assertions; zero console problems; traffic peak 12/12**.
See [the performance/verification record](../../../docs/TESTING.md#open-world-expansion).

## Review and remaining risk

Safe recovery deliberately repositions blocked background traffic and may be cosmetically noticeable.
Coordinator/BMAD Quick review completed, including the traffic-fling persistence correction; no work was deferred.
All six measured Medium maxima satisfy the 3 ms criterion. Status is **built**, not user-accepted **done**.
