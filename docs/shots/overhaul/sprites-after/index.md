# Sprite contact sheets: before and after (story 16.20)

`sprites-before/` and `sprites-after/` hold one sheet per group, made by `node scripts/sprite-sheet.mjs --label <name>` (Medium textures, seeded). Every cell shows the
texture key, the sprite at game scale (1:1 as drawn on Medium) and zoomed 3x. Groups: `helena`, `kilian`, `lorenz` (every pose and ride), `other-riders`
(default kid, bully, shared rides), `npcs` (all 12 outfits, 3 frames), `animals` (pigeon, cat, duck, dog, bench), `vehicles` (bike, skateboard, skates, scooter,
rollerblades, bus, car, van, tram, garage, locks). `keys.json` lists every texture with its size: the lists are identical before and after.

## Redrawn

| Sprite (keys) | Why it was weak | What changed |
| --- | --- | --- |
| `car`, `van`, `tram` | Plain rectangles with one window and four black blocks as wheels; did not read as vehicles, no front or back. | Rounded body in a lit/shaded ramp, wheels under arches, windscreen and rear window with a glint, bonnet and roof, headlights at the nose, red tail lights, mirrors. The van has a cargo roof with ribs, rear doors and a stripe; the tram has two roof sections with air units, a bellows joint, pantograph, driver cabs at both ends and a white edge stripe. |
| `bike`, `player-bike`, `player-<kid>-bike`, `bully-bike`, `bully-scooter` | Tyres were flat black bars, the rider a shapeless blob over them; bike and rider did not separate. | Rounded tyres with tread and hub, mudguards, frame tube with crank, carrier, rear light, headlamp; rider with shoulders, rucksack, thighs and shoes on the pedals, arms to the grips and a head seen from above (hair and glasses hooks unchanged). |
| `player-*-skates` and `-rollerblades` (all poses) | The skates were hidden under the torso, the rider read as a round blob. | A wide stance puts both skates beside a narrower torso, thighs connect hips and boots; push, crouch and grab poses keep their meaning. |
| `critter-cat` | An orange block with a dark face patch; no ears, tail or legs to read as a cat. | A sitting cat in profile: curled tail, striped back, pale chest and paws, pointed ears, green eyes, nose. |

Sizes, origins, texture keys and hit areas are unchanged (the same texture sizes in `keys.json`); only pixels differ.

## Judged fine and left alone

Walking kids (Helena, Kilian, Lorenz, default kid), block, kiai, portraits, all NPC outfits and the dog, pigeon, duck, skateboard rider, scooter, bus, garage, locks, chain, bench.

## Still weak (not redrawn)

- The dodge roll `player-*-dodge` is a tucked ball; it reads as a roll but not as a person.
- NPC adults are broad and boxy and share one body; only colours, hair and accessory differ.
- Kilian's wild hair is dark against the dark eyes, so his face is small; the roller-skate rider's head is still large next to the torso.
- The tram pantograph is a rough sketch at game scale.
