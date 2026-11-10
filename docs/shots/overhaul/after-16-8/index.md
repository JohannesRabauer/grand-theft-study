# after-16-8: water shader, shores, reflections and life

Shots from `node scripts/shots.mjs --label after-16-8`, frame sequences from `node scripts/water-frames.mjs --label after-16-8` (Medium, plus `--tier low` and `--renderer canvas` for the fallback; files end in `-medium`, `-low`, `-medium-canvas`).

- `frames/pond-day-0..3-medium.png`: the pond at four moments 0.4 s apart (animated ripples, shimmer, foam); the shore wanders, reeds and stones sit on the bank.
- `frames/canal-bridge-day-medium.png`, `canal-bridge-night-medium.png`: the canal with bridge piers.
- `frames/river-lamp-night-medium.png`: the lamp beside the east canal glitters on the water.
- `frames/pond-rain-0..2-medium.png`, `frames/duck-0..2-medium.png`: rings from rain and from a duck.
- Look metrics against HEAD before the story (a1cf3f3): `park-day` medium seam 344 > 102 px, flat 6048 > 998 px2 (the pond); everything else is within noise (`oldtown-night` low seam 159 > 161, flat 422 > 477; `oldtown-snow` low seam 162 > 177). The 46 changed shots away from the water differ only in pedestrians and traffic: the swimming ducks draw from the shared random stream when they leave a ring while the camera passes the pond, so the crowd lands elsewhere (bisected: the same hashes with only the duck change).
