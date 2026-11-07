---
id: SPEC-schulweg-game
companions:
  - beyond-klasse-3-backlog.md
  - family-characters.md
  - ../architecture-schulweg-game/architecture-schulweg-game.md
  - ../../initiative-schulweg/architecture-schulweg-prototype/architecture-schulweg-prototype.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Schulweg — Klasse 3 Game

## Why

A vision to realize, now proven. The Schulweg prototype showed that riding a bike through a retro German town, being chased by bullies and shooting a slingshot is fun. This spec turns it into a complete game for kids 8–14 that secretly teaches real school knowledge: one polished school year (Klasse 3) played as one in-game day, with learning woven into free roaming, a warm anti-bullying arc, skating, karate, and local two-player co-op. Systems are built generically so Klassen 4–9 are later content additions. The prototype code and its architecture spine are the base to extend.

## Capabilities

- **CAP-1**
  - **intent:** Everything the prototype does keeps working inside the game: on-foot and bike movement, surfaces, chase levels 0–2, hiding, the caught frame, slingshot, pedestrians, wind/weather/props, quality tiers, DE/EN menu and all input types.
  - **success:** The prototype's check scripts and smoke test pass on the game build, and a prototype-style commute and chase still play unchanged.
- **CAP-2**
  - **intent:** The player lives one Klasse 3 school year as one day (06:30–22:00 compressed to 20–30 minutes) through the phases morning, commute, school, afternoon and evening.
  - **success:** A full day runs from waking to Zeugnis in 20–30 minutes, phase changes are visible on the clock and HUD, and the game auto-saves at each phase end.
- **CAP-3**
  - **intent:** In the morning the player has breakfast and packs the schoolbag by dragging items to match the timetable; forgotten items cause trouble later.
  - **success:** Packing checks against that day's timetable, and a missing item triggers a visible consequence in a lesson or the homework check.
- **CAP-4**
  - **intent:** The player commutes to school in timed free roam, arriving by 08:00, choosing among routes with their own risk (road traffic, park bully turf, old-town cobbles, tram with ticket inspector) and optional pickups.
  - **success:** At least three routes reach the school; lateness is penalised gently; each route's risk is demonstrable; pickups (Brezel, Pfand, ammo, stickers) work.
- **CAP-5**
  - **intent:** The player explores the schoolyard and building between lessons and attends 4–6 lessons per day, with surprise events (pop quiz, homework check, substitute teacher).
  - **success:** A day contains 4–6 lessons from the timetable, free roam between them, and at least one surprise event type per day.
- **CAP-6**
  - **intent:** A learning engine serves Klasse 3 curriculum questions in German and English from data files, tracks accuracy per topic, adapts difficulty toward 75–85% correct, repeats wrong answers later (also in the world), and always responds kindly to mistakes.
  - **success:** Per-topic accuracy is visible in data; simulated struggling and strong players converge toward the target band; a wrong answer shows the correct one with a friendly explanation and returns later.
- **CAP-7**
  - **intent:** Lessons are 30–90 second mini-games: Mathe (mental math or falling blocks), Deutsch (der/die/das, spelling), Englisch (vocabulary matching), Sachkunde/Erdkunde (map quiz), Science (sorting, circuits), Musik (rhythm), Sport (obstacle course using movement), Kunst (pixel pattern from memory).
  - **success:** All eight types are playable, finish in 30–90 seconds, draw from the learning engine where applicable, and produce a grade-relevant score.
- **CAP-8**
  - **intent:** Grades follow the German 1–6 scale with Kopfnoten, culminating in a Zeugnis with funny warm teacher comments, confetti and a parent reaction; promotion needs an average of 4.0 or better with at most two 5s, otherwise the year repeats with an encouraging Comeback bonus; promotion ends on a warm "Klasse 4 coming soon" screen.
  - **success:** The rule is enforced by test cases for both outcomes; grades reward improvement and effort; the repeat path is never shaming.
- **CAP-9**
  - **intent:** Learning appears in free roam: Pfand machine coin counting, bakery ordering and paying in German or English, English sign scanning for bonus points, newspaper-route number patterns, and a tram map quiz that unlocks fast travel.
  - **success:** Each of the five activities is reachable in the town, awards rewards, and feeds the learning engine's tracking.
- **CAP-10**
  - **intent:** The player does at least five afternoon chores as short mini-games; unfinished chores lower Familienfrieden, which reduces pocket money.
  - **success:** At least five chores (instrument practice, reading quiz, clean room with physics, dishes, trash sorting, cooking with fractions) exist, and the next day's pocket money reflects Familienfrieden.
- **CAP-11**
  - **intent:** The player starts side missions at phone booths or by phone message: newspaper route, skate challenges and races, Kirmes slingshot range, stolen-bike rescue, grandma's groceries, lost-homework hunt, and bully friendship missions.
  - **success:** At least five missions are playable start to finish with rewards, and friendship missions measurably change a bully's behaviour.
- **CAP-12**
  - **intent:** The player picks one of three family characters — Helena (12), Kilian (10) and Lorenz (8) — each with a distinct look, six attributes (Wissen, Tempo, Ausdauer, Charme, Ordnung, Zielen), a start vehicle and perks; attributes grow through play.
  - **success:** Attribute differences are felt in play (speed, stamina, aim, talk-downs, trick multipliers, karate), the three characters look as described in the character companion, and doing the matching activity raises the matching attribute.
- **CAP-13**
  - **intent:** The skateboard offers ollie, grinding rails/benches/curbs, manual and stair jumps, with a trick-combo Style multiplier that converts to money and XP and a fire trail.
  - **success:** A combo chain raises the multiplier, banking it pays out money and XP, and each trick type is triggerable.
- **CAP-14**
  - **intent:** Roller skates are the most agile vehicle, strong on sidewalks and weak on cobblestone and grass, and can grab the back of a slow bus or tram for a risky boost.
  - **success:** Handling differs measurably from the other vehicles per surface, and a bus or tram grab gives speed with a failure risk.
- **CAP-15**
  - **intent:** A real skatepark with ramps, rails, benches, stairs and trick lines replaces the empty skatepark zone; it is also bully turf.
  - **success:** Every trick type has a line in the skatepark, and entering it still raises Ärger.
- **CAP-16**
  - **intent:** Vehicles are owned and unlocked by buying, winning races or finding them in the garage; bikes must be parked at racks, and an unlocked bike can be borrowed by a bully, starting a rescue mission.
  - **success:** Each vehicle starts locked unless it is the character's start vehicle, has a working unlock path, and the rack/theft/rescue loop runs.
- **CAP-17**
  - **intent:** The throwing stick (long arc, retrievable, topples balls and kites, triggers distractions, distracts the neighbor's dog by fetch) and the close-range stick (whack bushes for coins/stickers/ammo/homework, smash crates, knock cones, doorbell ding-dong-run, piñata) join the slingshot's extra uses (Kirmes balloons, bells, switches, apples); all tools affect objects only.
  - **success:** Each tool use works on its targets, and automated collision tests confirm no tool affects people or animals.
- **CAP-18**
  - **intent:** A dojo lets the player train karate belts (Gürtel) in a timing-based training mini-game; belts raise Ordnung and confidence and unlock stronger defenses.
  - **success:** Training sessions award belt progress, belts persist in saves, and each new belt unlocks a visible defensive option.
- **CAP-19**
  - **intent:** In chases the player can block, dodge and use a Kiai stance that makes bullies stumble back comically and lowers Ärger at levels 1–2, with no hitting and no injury visuals.
  - **success:** A timed Kiai near a bully makes it stumble and back off and lowers Ärger; blocks and dodges avoid the caught frame; stronger belts widen the effect; nothing shows violence.
- **CAP-20**
  - **intent:** The chase escalates through levels 3–5: the gang splits to cut corners, older kids on e-scooters, lookouts with phones create a "spotted" radius on the minimap, and the year's boss bully with a unique trait joins at level 5.
  - **success:** Each level's behaviour is demonstrable, the minimap shows the spotted radius, and the boss's trait changes how the chase plays.
- **CAP-21**
  - **intent:** Other chasers exist: the Hausmeister for skating on school grounds, the ticket inspector for riding the tram without a ticket, the neighbor's dog solved with the throwing stick, and an angry neighbor after doorbell pranks.
  - **success:** Each chaser triggers from its cause, has a way out, and returns to calm.
- **CAP-22**
  - **intent:** At levels 1–2 the player can talk a bully down with Charme or answer a bully's learning question correctly to make him back off; bullies can become friends through missions.
  - **success:** Correct answers or a successful Charme check end the chase at levels 1–2, wrong ones are gentle, and a befriended bully stops chasing.
- **CAP-23**
  - **intent:** Up to three players share one PC in local co-op with a shared camera that zooms out to keep everyone in view and a tether that limits distance; P1 uses WASD + Space, P2 the arrow keys, P3 a third keyboard block or a gamepad, and gamepads can take any free slot; each picks a character; single-player is unaffected.
  - **success:** Two and three players complete the commute and a chase together, bullies and zones react to everyone, the camera keeps all players on screen, and the single-player path passes all prior checks.
- **CAP-24**
  - **intent:** Money is earned from pocket money, Pfand, missions, tricks and grades and spent in bike/skate shops, on cosmetics, slingshot upgrades, a monthly tram ticket and snacks.
  - **success:** All earn and spend paths work, prices are data-driven, and purchases persist.
- **CAP-25**
  - **intent:** XP and level-ups, Panini-style collectible stickers with fun facts, daily streaks, funny achievements, cosmetic unlocks and a Lernbuch screen show progress per subject.
  - **success:** Each system awards and persists, the Lernbuch shows per-subject bars and badges from real accuracy data, and every sticker shows a fun fact in both languages.
- **CAP-26**
  - **intent:** The HUD shows clock and season, energy and stamina, Ärger, money, grade average, year, XP, vehicle, tool, ammo and wind; an objective arrow, a toggleable minimap and a phone with messages (mom, friends, bully taunts) complete it.
  - **success:** Every listed element is visible and correct in single-player and co-op.
- **CAP-27**
  - **intent:** The game keeps three save slots and auto-saves after each phase of the day.
  - **success:** Closing and reloading the page restores the slot at the last phase; a corrupt slot is handled without crashing.
- **CAP-28**
  - **intent:** Parent settings, protected by a simple math question, control a play-time reminder, learning difficulty and bully chases on/off.
  - **success:** Each setting changes behaviour as stated and persists; wrong answers do not open the settings.
- **CAP-29**
  - **intent:** Chiptune music via the Web Audio API changes by phase and season, the chase track intensifies with Ärger, and 8-bit sound effects cover bells, skating, slingshot, hits, weather, birds, tram and car alarm; audio is muted on mobile until the first tap.
  - **success:** Music changes at phase and season changes, the chase layer rises with level, the SFX list is covered, and mobile starts silent.
- **CAP-30**
  - **intent:** The seasons and weather cycle through the day (autumn morning, winter school, spring afternoon, summer evening) and change surfaces: snow slows, ice slides, rain makes puddles.
  - **success:** Each season visibly and mechanically differs, and transitions are smooth.
- **CAP-31**
  - **intent:** The living world gains the remaining particles and physics from the vision (snow footprints, leaf piles, fireflies, butterflies, canal fish, steam, exhaust, sprinklers, fountain, laundry, swings, signs, rope bridge, kites, shopping carts, crate dominoes), plus tram, delivery vans, cats and pigeons that scatter and are never hittable.
  - **success:** Each listed element exists and reacts to the player, weather or wind, within the particle and prop caps.
- **CAP-32**
  - **intent:** All text exists in German and English with an instant toggle, in a cheeky kid-safe tone with localized (not literally translated) jokes; world signs stay German with optional English tooltips.
  - **success:** The i18n key check passes, no visible string bypasses it, and a language review finds no disallowed content.
- **CAP-33**
  - **intent:** The game supports gamepads, optionally installs as an offline PWA, and runs in current Chrome, Edge, Firefox and Safari on desktop, Android and iOS at 60 FPS on Medium.
  - **success:** The cross-browser checklist passes; the 60 FPS result is measured on the reference phone (still to be named).

## Constraints

- Base stack and architecture from the adopted spine (AD-1 to AD-15): Phaser 3.90.0 with Matter via CDN, no build step, static files, `ctx` plus events, pooled objects, collision categories, quality tiers; new systems add decisions through an architecture update, not around the spine.
- Run instructions stay Windows PowerShell; no bash-only scripts.
- Single-player must keep working, and every system that reads the player must support more than one player.
- Kid-safe: no ads, purchases, chat, external links or data collection; no swearing, slurs, or insults about appearance, origin, gender, religion or disability; nothing sexual; no injury visuals.
- Karate is non-violent (stumble and back off, never hitting); the rule that tools never affect people or animals stays for slingshot, throwing stick and stick.
- Learning content is data-driven JSON per grade and topic in German and English; English lessons always use both languages.
- All game data (maps, prices, missions, items, dialogue, slang) is JSON; all visible text goes through i18n.
- Parent settings and save data stay in the browser (`localStorage`); no backend.

## Non-goals

- Klassen 4–9 content, the secondary-school move with its new district and building, and other grades' curricula.
- Online multiplayer, accounts, any backend.
- Ads, purchases, chat, analytics.
- Split-screen co-op.

Deferred items are recorded in `beyond-klasse-3-backlog.md`.

## Success signal

A child plays one complete Klasse 3 day from waking to Zeugnis, alone or in co-op with up to three players, learns real curriculum content, sees their progress in the Lernbuch, and wants to play "one more day"; the game holds 60 FPS on Medium on a mid-range phone in Chrome.

## Assumptions

- Co-op default: players share the world, day, chase and money; each keeps their own character, XP, grades and learning profile; lessons run side by side on one screen.
- Klasse 3 uses Sachkunde for the geography and nature topics; science topics stay simple (water cycle, plants and animals, healthy food).
- The prototype's Medium budget (≤300 particles, ≤60 awake props, ≤12 pedestrians, ≤3 bullies) stays the starting point and grows only with measurement.

## Open Questions

- Should co-op share money and grades, or keep them separate per player?
- Which real phone is the 60 FPS reference device?
- What are the Klasse 3 boss bully's name and unique trait?
