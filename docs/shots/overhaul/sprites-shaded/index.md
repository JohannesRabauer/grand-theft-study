# Sprite contact sheets after the shading pass (story 16.18)

Made by `node scripts/sprite-sheet.mjs --label sprites-shaded`. Compare each sheet with the same name in `../sprites-after/` (the 16.20 designs, unshaded): the designs are the same, `keys.json` is identical (same texture keys and sizes), `cosmetics.png` is new (the shop hats).

| Group | What to look at |
| --- | --- |
| `helena`, `kilian`, `lorenz` | walking figure, block, kiai and dodge: warm rim on head, hair and shoulders at the top left, cool rim and darker lower right, tinted outline on the lit side; riders and boards: edge shade and tinted outline only (they turn with the heading) |
| `other-riders` | default kid, bully, shared rides |
| `npcs` | all 12 outfits in 3 frames: lit left and top, shaded lower right, no flat blocks |
| `animals` | pigeon, cat, duck: ramp and rim, dog and bench with the outline pass |
| `vehicles` | car, van, tram, bus, bike, skates: edge shade, headlights and tail lights untouched with a coloured halo on the body next to them |
| `cosmetics` | cap, party hat and crown with ramp and rim |

Not shaded on purpose: portraits (UI cards), the glow rings (emissive), locks, chain and garage (props), and the three 1x prototype textures `player`, `bike`, `bully` on Low (they carry a baked shadow).
