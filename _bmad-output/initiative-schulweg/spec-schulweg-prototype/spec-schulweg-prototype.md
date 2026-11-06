---
id: SPEC-schulweg-prototype
companions:
  - post-prototype-backlog.md
  - ../architecture-schulweg-prototype/architecture-schulweg-prototype.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Schulweg — Prototype

## Why

A vision to realize, de-risked first. Schulweg is a retro top-down, GTA-1997-style browser game for kids 8–14 in which bullies replace cops and surviving school replaces crime. The full game (school-year loop, learning, economy, four vehicles) is large; if moving around and being chased are not fun, or the game cannot hold 60 FPS on a mid-range phone, the rest is wasted. This throwaway prototype answers exactly those two questions before anything else is built.

## Capabilities

- **CAP-1**
  - **intent:** Player runs on foot with sprint and stamina, with arcade momentum.
  - **success:** Sprint drains stamina and slows when empty; stopping and turning visibly carry momentum.
- **CAP-2**
  - **intent:** Player mounts and dismounts a bicycle (F) and rides it with momentum, drift and skids; the bell clears pedestrians; the camera zooms out as speed rises.
  - **success:** On asphalt the bike is clearly faster than running; a hard turn produces drift plus skid marks/smoke; zoom changes continuously with speed.
- **CAP-3**
  - **intent:** Ground surface changes handling and feedback: asphalt (fast), cobblestone (slower wheels, screen rattle), grass (slow wheels), puddle (splash, slide).
  - **success:** The same bike run over each surface gives measurably different top speed/grip, and cobble rattle and puddle splash are visible.
- **CAP-4**
  - **intent:** Player free-roams a small German-town map (street, park, old-town cobbles, school, bully turf) guided by a GTA-style objective arrow to the school.
  - **success:** The player can reach the school from the start by at least two different routes, following the arrow, in under three minutes.
- **CAP-5**
  - **intent:** Bullies chase the player at Ärger levels 0–2: level 1 is one bully on foot, level 2 two bullies with one on a bike; the level rises on bumping a bully or entering bully turf, and chasers emit angry steam.
  - **success:** Entering bully turf triggers level 1; a second bump or staying in turf reaches level 2; bullies pursue around obstacles and the on-bike bully is faster than running.
- **CAP-6**
  - **intent:** Player escapes by breaking line of sight and hiding in a hiding spot (hedge, dumpster) until the meter cools down.
  - **success:** Hidden and unseen for a short cooldown, the level drops to 0 and bullies give up; being seen again resets the cooldown.
- **CAP-7**
  - **intent:** Being caught is comic and gentle: the bullies grab lunch or coins with a funny frame, the meter resets, and the player respawns.
  - **success:** Contact with a bully at any level shows the frame, takes a small item/coin amount, resets level to 0, with no injury visuals.
- **CAP-8**
  - **intent:** The world visibly reacts: pooled particles (dust, puddle splash, leaves, rain), a wind system, one weather toggle, and Matter objects (cones, cans, crates, a ball) that react to the player and the wind.
  - **success:** Riding through a puddle splashes, sprinting kicks dust, wind visibly moves leaves/rain and a flag, and the player can knock cones/crates over, all with pooled objects.
- **CAP-9** (stretch, build only if cheap)
  - **intent:** Slingshot with mouse/drag aiming, wind-affected trajectory dots, and hits only on objects (cans, trash can as distraction).
  - **success:** Shots knock a can off a fence and lure a bully to a hit trash can; shots pass through people/animals without effect.
- **CAP-10**
  - **intent:** Quality setting Low/Medium/High scales particle counts and physics objects; mobile auto-starts on Medium; an FPS counter is visible.
  - **success:** Switching setting changes particle/object counts live; Medium holds 60 FPS on the reference phone (see Open Questions).
- **CAP-11**
  - **intent:** Desktop and mobile controls work with auto-detected prompts, and portrait mode shows a rotate hint.
  - **success:** Desktop WASD/Space/Shift/F/Q-E/mouse and mobile joystick + buttons both complete CAP-4; portrait shows the hint instead of the game.

- **CAP-12**
  - **intent:** The town is populated by pedestrians who walk the streets and park, and who react to the player.
  - **success:** Up to 12 pedestrians (Medium cap) walk in view in the town; ringing the bike bell or riding close makes them step aside and shout a kid-safe line; at least dog walkers, kids with a ball and grandparents appear; the cap and frame budget hold.

## Constraints

- Phaser 3.90.0 (exact pin; Phaser 4 upgrade deferred) with its built-in Matter.js from a CDN, no backend, runs from `index.html` plus assets; all run instructions are Windows PowerShell (`npx serve .` or `python -m http.server`), no bash-only scripts.
- The town is a single ASCII-grid JSON map that drives rendering, surfaces, pathfinding and walls; binding architecture decisions (AD-1 to AD-14) are in the adopted architecture companion.
- Folder structure exists from the start: `scenes/ entities/ vehicles/ tools/ ai/ physics/ particles/ learning/ minigames/ missions/ i18n/ data/ ui/` (unused folders may stay empty).
- Tools never affect people or animals, enforced through separate Matter collision categories, not per-case checks.
- Every visible string comes from `i18n/de.json` / `i18n/en.json` with an instant DE/EN toggle, even in the prototype; text stays kid-safe (no swearing, slurs, appearance/origin/gender/religion/disability insults, sexual content).
- Particles, projectiles, pedestrians and bullies are pooled and culled off-screen; no per-frame allocation in hot paths.
- Kid-safe by construction: no ads, purchases, chat, external links, or data collection.
- Internal resolution follows the quality tier (960×540 on Medium/High, 480×270 on Low) with integer, crisp scaling; responsive, landscape preferred. The speed-based camera zoom must not make pixels jump or swim (user feedback after first play).

## Non-goals

- Full day structure, clock, report card, grades, Kopfnoten.
- Economy, shops, upgrades, cosmetics, saves, auto-save.
- Chores, side missions, mini-games, learning content and adaptive difficulty.
- Other characters and vehicles (skateboard, roller skates), chase levels 3–5, other chasers, season cycle.
- PWA, audio and music polish, final art.

All cut content is recorded in `post-prototype-backlog.md`.

## Success signal

Within one short demo session a tester says moving around is fun and a chase is exciting, escapes by hiding feel clever, and the build holds 60 FPS on Medium on the reference mid-range phone in Chrome. The user then decides: throw the prototype away or keep it as the base, with lessons fed back into this spec.

## Assumptions

- Lena with the bicycle is the single prototype character/vehicle: the bike is the cheapest way to test speed, zoom-out camera, drift and surfaces.
- Placeholder art is procedurally drawn or simple pixel shapes; art quality is not judged.
- No audio and no saves: the prototype starts fresh on reload.

## Open Questions

- Which real phone is the 60 FPS reference device?
- Swap to Mehmet with the skateboard if a trick-based feel test is preferred?
- Include one learning hook (a bully asks 7×8 to back off at levels 1–2)? Default: no.
