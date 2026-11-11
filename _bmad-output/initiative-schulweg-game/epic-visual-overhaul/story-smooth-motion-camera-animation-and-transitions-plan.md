---
title: 'Smooth motion: camera, animation and transitions'
type: 'feature'
ticket: 13
created: '2026-11-11'
status: built
baseline_revision: '27d9d41fff33f55d2bb354819d2562ec053d1dbf'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The camera follows with no look-ahead, light-map pools wobble against the world while the view is sub-pixel, the player figure and bike are single static frames (no stride, pedal or push in-betweens), jumps and landings do not squash, doors cut away instantly and fade in from black (a pop), and there is no shake or hit-stop.

**Approach:** One data file (`data/motion.json`) and a Phaser-free `camera/motionMath.js` drive a `ctx.motion` service (reducedMotion flag with data default and a state action, shake and hit-stop presets), a `PlayerMotion` system (cycle frames, breathing, squash and stretch), eased look-ahead and a base-pixel-snapped light map, and door transitions that fade out, load, then fade in with easing.

## Boundaries & Constraints

**Always:** pixel-crisp (whole base-pixel shake and snapping), no per-frame allocation, characters unchanged in design (frames only move legs, arms, pedals), collision/pathfinding/map data untouched, tuning in data, `reducedMotion` disables shake, squash, hit-stop and look-ahead bob.

**Never:** a new full-screen pass, external assets, gameplay changes, wiring the Effekte setting (entry 15 does that).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|----------|--------------|----------|----------------|
| Shake | preset id, reducedMotion off | whole-pixel offsets that decay to 0 | unknown id ignored |
| Shake reduced | reducedMotion on | no offset, no hit-stop | — |
| Squash | jump then land | stretch up, squash on landing, back to 1 | reduced: scale 1 |
| Door | request while playing | fade out, load, fade in, never a black frame before the fade | transitions off in scripted runs |

</frozen-after-approval>

## Code Map

- `camera/motionMath.js` -- pure maths: look-ahead, cycle frame, squash curve, shake offset, easing.
- `camera/Motion.js` -- ctx.motion: reducedMotion, shake, hit-stop, transition timing.
- `scenes/GameScene.js` -- followCamera (look-ahead, shake after snap), update (hit-stop dt scale), world update dt.
- `services/World.js` -- fade out, load, fade in.
- `render/LightMap.js` -- origin snapped to the light-map pixel grid.
- `entities/PlayerMotion.js` -- frames, breathing, squash.
- `scenes/HiResArt.js`, `scenes/CharacterArt.js` -- stride, pedal and push frames.
- `state/actions.js` -- settings.reducedMotion.
- `scripts/zoom-sweep.mjs`, `scripts/camera-jitter.mjs` -- jitter measure.

## Tasks & Acceptance

**Execution:**
- [ ] motion data, math, service, state action, check script
- [ ] camera look-ahead, shake, hit-stop, light-map snap
- [ ] extra frames and PlayerMotion
- [ ] eased door transitions
- [ ] jitter measure, shots, bench, docs

**Acceptance Criteria:**
- Given the zoom-sweep and camera-jitter measures, then no jitter and smoothness at least as before.
- Given a door, then a fade out precedes the load and no black pop occurs.
- Given reducedMotion, then shake and squash are zero.

## Implementation Notes

## Plan Change Log

## Review Triage Log
