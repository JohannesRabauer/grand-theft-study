# Post-prototype backlog

Everything from the full Schulweg vision that the prototype deliberately skips. Source: the project prompt. Not a plan; a record so nothing is lost.

## Game frame
- One in-game day = one school year, Klasse 3–9; move to weiterführende Schule after Klasse 4 with a new building and district. Deliverable 1 of the full game: Klasse 3–5 loop.
- Day: 06:30–22:00 compressed to 20–30 min. Morning (breakfast, bag packing), commute by 08:00 (routes: main road, park, old town, tram), school 08:00–13:15 (4–6 lessons of 30–90 s), afternoon (chores, side missions), evening and Zeugnis.
- Promotion at average ≤ 4.0 and at most two 5s; otherwise repeat with a "Comeback" bonus, never shaming. New district, boss bully, harder content per year.
- German grades 1–6, Kopfnoten (red light before adults lowers conduct). Surprise events: pop quiz, homework check, substitute teacher.

## Characters
- Lena (Streberin: Wissen 9, Tempo 5, Ausdauer 5, Charme 5, Ordnung 8, Zielen 8; bike, precision slingshot; targeted more by bullies), Mehmet (Sportler: 5/9/9/6/3/5; skateboard, bigger multipliers, longest stick throw, forgets homework), Jonas (Kreative: 6/6/5/9/4/6; roller skates, bus grabbing, talks out of trouble, music/art bonus). Attributes grow by doing.

## Movement and vehicles
- Skateboard (ollie, grind rails/benches/curbs, manual, stairs, Style combo → money/XP, fire trail), roller skates (agile; bad on cobble/grass; grab slow bus/tram), bike extras (parking at racks, theft by bullies and rescue mission, bunny hop, wheelie).
- Running extras: vault fences, squeeze hedges/fence gaps, ladders to rooftops.
- Surfaces: snow (slow), ice (slippery). Vehicle unlocks via purchase, races, garage. Comic traffic hits with tumbling, item scatter, time/energy loss.

## Tools
- Throwing stick (long arc, retrievable, knocks balls/frisbees/kites, distractions, dog fetch), close-range stick (whack bushes for coins/stickers/ammo/homework, smash crates, cones, doorbell ding-dong-run, piñata). Slingshot ammo: chestnuts, acorns, pebbles; also bells, signs, switches, apples, Kirmes balloons. Slingshot is stretch CAP-9 in the prototype.

## Chase system
- Levels 3–5: gang splits to cut corners; e-scooters and phone lookouts with a "spotted" radius on the minimap; year's boss bully with unique trait. Triggers also: splashing bullies, beating them in a race, "Streber" after good grades.
- Escapes: phone booths, library, bakery queue, near adults, vehicle-only routes, rooftops, talk-down (Charme, levels 1–2), correct learning question (levels 1–2).
- Other chasers: Hausmeister, ticket inspector (tram), neighbor's dog, angry neighbor. Adaptive chase music.
- Bully friendship arc through side missions (anti-bullying message without lecturing).

## Learning and motivation
- Curriculum Klasse 3–9: Mathe (times table → fractions/percent → equations), Deutsch (articles, spelling, word types, commas), Englisch (vocab → grammar → reading), Sachkunde/Erdkunde (states, capitals, rivers, Europe), Science (water cycle, circuits, plants/animals, healthy food).
- Adaptive per-topic accuracy aiming 75–85% correct, more time/hints when struggling; spaced repetition including in-world bully questions; kind wrong-answer feedback with funny reactions; grades from improvement and effort.
- In-world learning: Pfand machine coin math, bakery ordering DE/EN, English sign scanning, newspaper house-number patterns, geography map quiz to unlock tram fast travel.
- XP, level-ups, Panini-style stickers with fun facts, streaks, funny achievements, cosmetics, Lernbuch screen, Zeugnis confetti with parent reaction scene.
- Lesson mini-games (Mathe, Deutsch, Englisch, Erdkunde, Science, Musik rhythm, Sport obstacle course, Kunst pixel pattern). Min. 6 for the full Klasse 3–5 loop.

## Chores, missions, economy
- Chores (min. 5): instrument practice, reading quiz, clean room (physics), dishes, trash sorting (Gelber Sack, Papier, Bio, Restmüll), cooking with fractions. Familienfrieden affects pocket money.
- Side missions (min. 5): newspaper route, skate challenges/races, Kirmes target range, stolen-bike rescue, grandma's groceries (eggs physics), lost-homework hunt, bully friendship. Started at phone booths or by phone message.
- Economy: pocket money, Pfand, missions, tricks, grades; shops for bikes/skates, cosmetics, slingshot upgrades, monthly tram ticket, snacks.

## Living world
- Particles: footprints in snow/mud, kicked leaf piles, pollen/dandelions, snow, fog, fireflies, butterflies, canal fish, bakery/manhole steam, exhaust, chimney smoke, sprinklers, fountain, laundry, coin sparkle trail, correct-answer stars, confetti, trick fire trail, sweat drops, impact fragments (metal flecks, chestnut shells, splinters, paper).
- Physics: tipping trash cans, basketballs, shopping carts on slopes, domino crates, linked-segment swings/signs/rope bridges/kites/flags, canal flotsam, cartoony rag-doll-lite tumbles.
- Season/weather cycle across the day (autumn → winter → spring → summer), wind on kites/laundry/smoke.
- Crowd: dog walkers, football kids to join, duck-feeding grandparents, pigeons (react only, never hittable), cats, delivery vans, tram bell; NPC reactions ("Pass doch auf!", cheering, filming).

## Systems and platform
- HUD: clock/season, energy/stamina, Ärger meter, money, grade average, year, XP, vehicle/tool/ammo, wind indicator, minimap toggle, phone with messages.
- 3 save slots, auto-save per day phase; parent settings behind a math question (play-time reminder, difficulty, chases on/off); gamepad support; PWA manifest + service worker.
- Audio: Web Audio chiptune themes per phase/season, adaptive chase track, 8-bit SFX set, mobile muted until first tap.
- Data-driven JSON for questions (per grade/topic, DE+EN), missions, items, dialogue, slang. DE/EN covers all text; world signs stay German with optional English tooltips; humor localized, not translated literally.
- Cross-browser/device acceptance: Chrome, Edge, Firefox, Safari on desktop, Android, iOS at 60 FPS Medium.
