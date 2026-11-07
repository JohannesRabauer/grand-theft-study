---
title: "Rideable scooters and inline rollerblades"
type: feature
ticket: 7
created: 2026-11-07
status: built
baseline_revision: 9d953f95984f0dd46b85488749474d4beb65f57f
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
---

<frozen-after-approval reason="Implementation authorized by the user's autonomous completion request">

## Intent

**Problem:** The requested open-world vehicle variety cannot work while scooters and separately named inline rollerblades have no ride profiles, art, ownership or mount services.

**Approach:** Add both through the existing data-driven movement, ownership and mount lifecycle. Reuse the parameterized Skateboards service instead of introducing a second movement engine. Register ordinary town items so the new rides are reachable; street theft is the following story.

## Boundaries & Constraints

**Always:** Keep bike, skateboard and skates tuning unchanged. Preserve character appearance, earned attributes, ownership, save/Continue and independent co-op riders. Use existing input intents for keyboard, controller and touch. New textures must work at every render scale, including posture suffixes actually requested by the mount service. Add explicit surface multipliers rather than silently falling back to another vehicle.

**Never:** Do not bypass ownership, globally unlock all rides, implement player theft or expand the world in this story. Do not add a second physics engine, duplicate the mount lifecycle or alter existing lesson grades and morning preparation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Obtain ride | Valid scooter or rollerblades unlock | Ownership persists and normal interaction mounts the nearby item | Existing state rejection for invalid IDs/reasons |
| Locked display | Unowned new ride | Same clear locked feedback as existing displays; no hidden mounted sprite | Existing ownership refusal |
| Ride/dismount | Mounted new ride, movement then fresh interact | Its own speed/turn/surface profile applies; item remains available after dismount | No error expected |
| Co-op contention | Both players interact near one item | Only one rider can mount it; the other remains independently controllable | No duplication |
| Map lifecycle | Rider changes map or is caught | Mounted object travels or dismounts using existing lifecycle; no stale pose/collision mask | Existing map and caught handling |
| Continue | Saved unlocks with v6 morning state | Both new unlocks remain; old progress and starting rides are unchanged | Existing save validation |

</frozen-after-approval>

## Code Map

- `data/vehicles.json` owns profiles, texture slots, poses, tricks and FX.
- `data/surfaces.json` supplies per-profile speed/acceleration and ground reactions; some consumers index directly.
- `data/state.json`, `data/shop.json`, `state/actions.js` validate purchasable/unlockable IDs through configuration.
- `entities/Skateboards.js` already accepts `{ id, object, texture }` and owns parked items, independent riders, nearest-item arbitration, tricks and map cleanup.
- `entities/Skates.js` adds skating push poses; reuse it only where its exact profile assumptions hold.
- `scenes/GameScene.js` wires mount rivals, Parking, Traffic, TrickSystem and Caught; all must see both new services, including the frame-update path.
- `scenes/BootScene.js`, `scenes/CharacterArt.js`, `scenes/SkatesArt.js`, `scenes/VehicleArt.js` create scaled textures and character looks.
- `data/object-types.json` and `data/maps/town.json` register ordinary map items, checked by the map validator.
- `i18n/de.json`, `i18n/en.json` own vehicle labels and child-friendly feedback.
- `scripts/check-vehicles.mjs`, `scripts/check-skates.mjs` and browser `scripts/smoke/vehicles.js` cover the established contracts.

## Tasks & Acceptance

**Execution:**
- [x] `data/vehicles.json`, `data/surfaces.json` -- add distinguishable scooter/inline profiles and complete surface behaviour.
- [x] `data/state.json`, `data/shop.json`, `data/object-types.json` -- register validated IDs, prices and mountable map types without changing starting ownership.
- [x] `entities` and `scenes/GameScene.js` -- reuse the mount service and wire every rival, update, caught, traffic, parking and trick surface.
- [x] `scenes` art and boot -- draw recognizable parked/rider textures with each character's appearance and all used poses at supported scales.
- [x] `data/maps/town.json`, `i18n` -- place reachable ordinary displays and localize their names.
- [x] `scripts` -- extend targeted node checks and browser coverage for movement, ownership, contention, map travel and Continue.
- [x] `README.md`, `docs/TESTING.md` -- document the actual new rides and checks.

**Acceptance Criteria:**
- Given either unlocked new ride, when a player interacts normally, then they mount, move, turn and dismount with the existing device intents.
- Given equal neutral attributes, when the new rides cross paved and rough surfaces, then their speed/handling differs measurably and no multiplier is missing.
- Given two co-op players, when both attempt one item, then only one owns its active rider reference and both players retain independent controls.
- Given a save with earlier progress, when new ownership is saved and continued, then new IDs and all old progress survive.
- Given the original bikes, boards and skates, when their existing tests run, then their tuning and lifecycle assertions still pass.

## Implementation Notes

- No frontmatter `context:` entries were present. Implementation followed the plan's Code Map.
- Added `scooter` (138 px/s, acceleration 190, turn rate 220) and `rollerblades` (122 px/s, acceleration 245, turn rate 310). Scooter rough-ground tolerance and inline acceleration/turning differ; every surface has explicit speed entries and both IDs appear in every special grip table.
- Added €50/€65 purchases and reachable, non-debug town displays at (14,52)/(16,52). Starting ownership and character start vehicles remain unchanged.
- Reused `Skateboards` for scooters and parameterized `Skates` for inline push poses. Central scene lists feed rivals, per-frame updates, Parking, Traffic, Caught and TrickSystem. Both support hop/grind; neither acquires skateboard manuals or the original skates' bus grab.
- Existing BootScene calls now generate both rides through CharacterArt/VehicleArt/SkatesArt, including default and character-specific poses at scales 1 and 2. No second mount or physics engine.
- Existing configuration-driven actions accept the new IDs without changes to state actions or save format. Browser Continue verifies v6 breakfast, bags and prior player progress.

## Plan Change Log

## Review Triage Log

Quick review returned no findings. No work was deferred.

## Verification

- `node scripts/check-all.mjs` -- all existing and added checks pass.
- `node scripts/bench-cdp.mjs --url http://127.0.0.1:8087 --smoke --json <session-report>` -- inspect `smoke.pass`, not just process exit; no failed assertions or console errors.

Completed 2026-11-07:
- `node scripts/check-all.mjs`: all 39 checks passed.
- Focused browser `SCHULWEG_BENCH.smoke(['newRides'])`: 39 assertions passed, no problems.
- Whole-game browser smoke: `smoke.pass: true`, 854 assertions, no failed assertions, no console problems. Includes new-rider contention, movement, map travel, caught cleanup, scale/pose coverage, real menu Continue and traffic flinging/remounting all five rides.
- `git diff --check`: passed. Direct JSON comparison with `baseline_revision` verified every original vehicle profile and surface value is identical.
- This Windows host's default headless launch did not expose CDP. Verification used the existing bench runner with a project-local, verification-only Node preload adding `--disable-gpu` and `--no-sandbox`; browser profiles were kept in the project directory and cleaned up. No runtime or permanent test-tool change was needed.
- No known incomplete in-scope work. Existing purchase/race UI remains future work as documented; this story registers the established purchase/unlock services and ordinary displays. Visual recognition/device feel has automated coverage, not a human playtest.
