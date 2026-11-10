# After story 16.6

`node scripts/shots.mjs --label after-16-6` (Medium and Low, 64 shots), compared with `after-16-4`. Vegetation: trunks with root flares in the ground, tree crowns as sprites of their own (3 species x 3 shapes x seasons, `scenes/VegArt.js`, `render/Vegetation.js`) that overlap the neighbouring tiles, lumpy hedge runs, a lumpier bush, tall grass tufts and flower beds under hedges, wind sway (`render/pipelines/WindFx.js`) and a see-through fade under a crown. Frame sequence: `node scripts/veg-frames.mjs --label after-16-6` writes `frames/` (calm and gusty crops, the same crown with and without a kid behind it, a hedge calm and gusty).

What to look at:

- `park-day` (winter, snow on the crowns), `park-evening` (spring, light oaks and birches), `oldtown-morning` frames in `frames/` (autumn): crowns reach over the tile borders, pines are tiered, birches are pale, nothing is a square.
- `frames/fade-under-*` against `fade-clear-*`: the kid is visible through the crown at alpha 0.38; `frames/sway-gust-*` against `sway-calm-*`: the crown shears by whole pixels, more at the top; `frames/hedge-*`: the lumpy run with a flower bed in front.
- The look metrics on the grove and hedge crops alone (`veg-frames.mjs` output): largest flat area 90 and 158 px2 (limit 4096), longest seam 16 px (limit 96).

Metrics (Medium, `after-16-4` > this set): longest seam and largest flat area do not get worse anywhere (park-day flat 6081 > 6048, park-night 6491 > 6294, skate-night low 2516 > 1446; the remaining park flat area is the pond, entry 9). Walkable luminance p5 drops by 0.003 to 0.014 in park, skate and lamp shots where crowns and trunk shadows now lie on the lawn (park-day 0.4747 > 0.4664); night walkable luminance p5 stays at or above 0.1646 (limit 0.16).

Frame bench (headless, software GL, uncapped, medians of paired runs against `8aac0f8`): p95 on Medium `e everything` 1.70 > 1.80 ms (+6 percent), `a idle walking` 1.90 > 2.20 (+16 percent); High 1.90 > 1.80 and 1.80 > 2.30 (+28 percent, 0.5 ms, inside the run-to-run noise). A first version that sorted every crown by depth and used a per-sprite pipeline cost +100 percent (the pipeline switch breaks the batch around every neighbour), so the crowns are one layer above the objects.

Still unfinished: the pond is still a framed rectangle (entry 9), roofs are flat colour fields (entry 8), bushes do not sway (they shake when whacked), bullies and pedestrians behind a crown are hidden by it (bullies fade the crown like kids do, pedestrians do not).
