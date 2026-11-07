---
title: "A bigger, interactive open world with traffic and street rides"
type: feature
ticket: ""
created: 2026-11-07
status: built
baseline_revision: 599f3c1efa3316cd434cbf61f69693cb2bf8693d
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="User explicitly authorized autonomous implementation of the entire open-world request">

## Intent

**Problem:** Free roaming is the main fun loop, but the small town lacks driving cars, enough repeatable interactions and stealable street rides.

**Approach:** Deliver BMAD 5.8, 12.6, 12.4 and 12.3 together: expand the connected town, add identifiable unattended rides, driving traffic and physical play objects. The user explicitly requested keeping all these goals and continuing until implemented.

## Boundaries & Constraints

**Always:** Preserve old destinations, routes, morning/school progress, owned rides, existing bully theft/rescue, device intents and shared-camera co-op. Street use is permission for one identifiable object, never a global vehicle unlock. State changes use validated actions and versioned saves. Measure reachable area against this plan's original town. Reuse Matter, scaled procedural art, map lifecycle, pools and culling. Medium worst-case update remains at most 3 ms.

**Never:** Do not steal/drive cars as a player, hurt pedestrians/animals, add graphic consequences, overwrite user saves, push, create GitHub issues or mark unaccepted work done. Do not implement unrelated feedback tickets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Street ride | Unowned unattended bike, board, rollerblades or scooter; fresh interact | Immediately ride that object; ordinary displays remain locked | Explicit refusal for invalid/locked claims |
| Contention | Both players attempt the same object | One atomic claim; independent riders, no duplication | Clear unavailable feedback |
| Return/abandon | Dismount, carry between maps, return to origin | One object persists at its actual location or origin; reuse/return is explained | Reject invalid state transitions |
| Continue | Saved carried/dropped objects; legacy v6 save | No origin clone; playable restored location, old progress intact | Validate records and surface save corruption |
| Expansion | Walk/ride from old town through both new neighborhoods | At least twice original flood-fill area; loops, shortcuts and all destinations reachable | Map/connectivity checks fail explicitly |
| Traffic | Circuits, crossings, obstacles, map exit | Cars, buses, tram and vans turn/yield/recover within cap; comic hits and valid bus/tram grabs remain safe | Invalid routes/configuration fail checks |
| Interaction | Repeat all play types; co-op and map exit | Immediate feedback, device-aware prompts, no body/constraint/reward leak | Unknown types rejected by catalog |

</frozen-after-approval>

## Code Map

- `entities/Bike.js`, `entities/Skateboards.js`, `entities/Skates.js`, `entities/Player.js`: mount ownership gates and per-player rider references; hidden carried images travel across maps. Bikes use `bikeId`; boards currently lack identity.
- `vehicles/Ownership.js`, `entities/Parking.js`, `entities/BikeTheft.js`: family type ownership, padlocks/racks and saved bully theft flag. Keep street provenance separate; do not let both theft systems own the same object.
- `state/GameState.js`, `state/actions.js`, `state/migrations.js`, `state/SaveSlots.js`: frozen state, explicit rejection, v6 saves; add validated per-object persistence with migration.
- `services/World.js`, `scenes/GameScene.js`: reverse unload/ordered load, player teleport before load; central mountables/rollers, deferred morning start rides, input ordering and traffic/caught cleanup.
- `data/maps/town.json`, `data/object-types.json`, `services/worldLogic.js`, `scripts/check-map.mjs`: original 96x64 town, existing two school routes, connected NPC graph; preserve original coordinates and extend rather than replace.
- `entities/GrabTargets.js`, `vehicles/routeLogic.js`, `vehicles/trafficLogic.js`, `entities/Traffic.js`, `data/routes.json`, `data/grab.json`: pooled kinematic traffic, turning/rear grabs, existing safe cartoon-hit service. Extend this traffic foundation rather than another movement engine. Non-grabbable cars/vans must not claim skaters' input.
- `entities/Prop.js`, `physics/bodies.js`, `entities/Flag.js`, `physics/Wind.js`, `scenes/VehicleArt.js`, `scenes/BootScene.js`: Matter props, sleeping/awake cap and scaled art; linked play objects must share the prop budget, not create an unlimited second pool.
- `ui/input.js`, `ui/inputBindings.js`, `ui/hud`, `i18n/de.json`, `i18n/en.json`: device mappings/localized prompts; fresh interact must do one action.
- `scripts/check-all.mjs`, `scripts/smoke/index.js`, `scripts/smoke/vehicles.js`, `scripts/smoke/traffic.js`, `scripts/bench-cdp.mjs`: register pure checks and browser scenarios, including actual menu Continue.

## Tasks & Acceptance

**Execution:**
- [x] `state`, `vehicles`, `entities` -- implement per-object street claims, return/drop/carry/save lifecycle and comic witnessed consequences, preserving ownership and bully rescue.
- [x] `data/maps/town.json` and map checks -- build two recognizable neighborhoods with connected loops/shortcuts, landmarks, crowd nodes, street rides and destinations; assert the actual doubled flood-fill threshold.
- [x] `entities/GrabTargets.js`, traffic data/art/logic -- add cars in both directions, vans and tram on wall-clear roads, yielding and bounded blocked-traffic recovery; preserve rear grabs and hit cooldowns.
- [x] `entities`, art/data and scene wiring -- add linked swings/signs/rope bridge, kites/flags, slope carts, crate dominoes and canal floaters; at least six distinct repeatable interactions across old/new town, with immediate feedback and prompts.
- [x] `scripts`, `README.md`, `docs/TESTING.md` -- register and run every matrix case, old regression checks and Medium budget; document actual controls, theft/return and new places.
- [x] `_bmad-output` -- create each resolved story's companion plan, linking this integration plan and its own delivery evidence; mark reviewed delivery built, not done.

**Acceptance Criteria:**
- Free roaming alone provides all four requested street rides and at least six repeatable physical interaction types.
- Original destinations and both new neighborhoods are traversable in solo/co-op; old/new vehicle routes do not clip walls.
- Original saves, lessons, character start rides and bully rescue survive; claims cannot duplicate after travel, Continue, traffic fling or caught cleanup.
- Medium update cost, aggregate awake props, traffic and existing pools stay within their documented caps.

## Implementation Notes

- Save v7 and validated per-object actions; street provenance stays separate from family ownership and bully theft.
- Original town retained inside a 160×112 map with 14,571 reachable tiles versus 4,204 (3.47×), two connected districts,
  original routes/destinations, connected NPC nodes, fixed canal crossings and reproducible content generation.
- Twelve pooled traffic targets; cars, vans and tram extend original buses, with yielding, bounded recovery and safe grabs/hits.
- Eight reusable Matter play kinds share aggregate awake-prop culling, with constraint-first unload and no repeat rewards.
- Performance work adds traffic broad-phase rejection, resumable 256-node queued A* with cancellation/independent
  synchronous scratch, and catch-frame art preparation outside the world update.
- Four companion plans are built after coordinator review. Implementation checkboxes indicate reviewed delivery, not user acceptance.
  Final coordinator verification passes every matrix row and the strict measured Medium maximum; no acceptance criterion is weakened.
- Ground rendering uses GPU-bounded tile-aligned chunks; aggregate prop culling and prompt caching avoid per-frame allocations.
- Catch UI prewarms the configured positive loss and formats cents as euros. Browser regressions cover both fixes.

## Plan Change Log

- Implementation detail only: large-map queued pathfinding resumes over frames rather than exhausting A* in one update.
  Existing complete synchronous searches remain available; tests compare identical paths and cancellation behavior.
- First-use catch-frame texture/UI preparation moved to HUD construction after profiling exposed ~23 ms contact spikes.
  Catch/debit/respawn behavior is unchanged and full regressions pass.

## Review Triage Log

| Finding | Verdict | Evidence | Route |
| --- | --- | --- | --- |
| StreetRides snapshot after wall-adjacent traffic fling | medium | Traffic probes four pixels, while street validation requires seven including corners; the reported (163.18, 953.30) position is invalid on the actual town. Unmounted snapshots now reuse safe placement and update the visible sprite to the persisted position. Pure and browser regressions cover reclaim/save restoration. | patch |

- **Pre-fix performance blocker (resolved):** 600-step Medium run recorded maxima 1.1/1.6/1.2/4.7/2.7/13.6 ms for the six scenarios.
  Every pool was capped (traffic 12/12, awake props 47/60), but maxima do not meet 3 ms. Earlier runs also exceeded it.
- Coordinator reviewed the entire diff and matrix coverage; real-phone performance and physical device play remain manual.
- Background blocked-traffic recovery is safe but can be visibly discontinuous.
- Later full Medium repeat maxima were 1.1/0.8/0.9/3.7/1.3/2.2 ms: still not a pass.
  Final full smoke passes 924 checks after isolating random pedestrian contacts in two input-only checks and
  using body-sized clearance for the expansion route driver; normal collision behavior remains covered elsewhere.
- Coordinator profiling/fixes produced passing 1,200-step maxima **1.7/0.7/1.0/1.7/1.2/1.3 ms**, every pool capped.
  Full browser regression before the review patch passed **926 assertions**, with zero console problems. The traversal driver now
  steers around dynamic pedestrian clusters rather than repeatedly following a static-grid path into them.
- Pinned Quick review completed; its one verified persistence finding was patched directly because the implementation
  agent could not be resumed. Final verification: **40 pure checks, 927 browser assertions, zero console problems**,
  Medium maxima **1.2/1.1/1.1/2.2/1.2/1.3 ms**, all pools capped. No work was deferred.
- Browser visual review covered the kite lawn, fixed canal crossing/ground chunk boundary, and workshop courtyard.
  Procedural art and untested physical-device usability remain the documented limitations.

## Design Notes

Refinement decisions: extend east/south while retaining old coordinates; distinguish a riverside recreation neighborhood and a workshop/market neighborhood. Taking a street ride grants temporary object-scoped use. Dismount abandons it at the current safe position; an explicit, prompted return at its origin restores it there. A nearby witness produces localized comic disapproval and existing trouble feedback, never physical harm. Persist carried identity without cloning at its origin; Continue must normalize a carried ride to a safe available location when the saved run starts in a different map. Save restoration must not bypass morning preparation.

Implementation details may change when code evidence demands it, but acceptance criteria and frozen constraints cannot be weakened. Delivery plans: `epic-skating/story-steal-parked-street-vehicles-during-free-roaming-plan.md`, `epic-living-world/story-a-bigger-connected-open-world-with-explorable-neighborhoods-plan.md`, `epic-living-world/story-traffic-cars-buses-tram-and-vans-plan.md`, `epic-living-world/story-physics-objects-swings-signs-bridge-kites-carts-dominoes-flo-plan.md`.

## Verification

Delivery result: **40/40 pure checks pass; full browser smoke passes 927 assertions; zero console problems**.
The generator is hash-stable across two consecutive runs. Detailed matrix, measurements and host notes are preserved in
[docs/TESTING.md](../../docs/TESTING.md#open-world-expansion); controls/places are in [README](../../README.md#open-world-exploration-and-temporary-street-rides).
**All six measured Medium maxima satisfy 3 ms** over 1,200 measured steps each. No pushes, issues or user-save overwrites were performed.

- `node scripts/check-all.mjs`: all registered pure checks pass, including migration/claims, flood-fill measurement, routes/yield recovery and interactions.
- Full `node scripts/bench-cdp.mjs --url http://127.0.0.1:8087 --smoke --json <session-report>`: explicitly inspect `smoke.pass`, failed assertions and console problems; focused scenarios alone are insufficient.
- Existing benchmark runner, all scenarios at Medium: worst-case update at most 3 ms, all live counts within cap. Keep the existing visible game server running.
- Browser host note: temporary project-local profiles and `--no-sandbox` worked with GPU enabled and normal certificate checks. Clean up only named verification artifacts; do not permanently alter tooling.
- `git diff --check`: no whitespace errors. Coordinator completed full diff review and matrix audit before local commit.
