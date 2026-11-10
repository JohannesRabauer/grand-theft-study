# After story 16.4

`node scripts/shots.mjs --label after-16-4` (Medium and Low, 64 shots), compared with `after-16-5`. Soft shadows: dithered contact shadows under figures, vehicles, animals and props (`Pen.shadow` / `Pen.contact`, `entities/Prop.js`), and a cast shadow layer baked once per map (`render/shadowMath.js`, `render/Shadows.js`, shader `render/pipelines/ShadowFx.js`) for buildings, tree canopies, booths, fences, hedges and dumpsters, with ambient-occlusion bands at wall feet.

What to look at:

- `oldtown-morning` / `oldtown-day` / `oldtown-evening` (Medium): the building shadow is longest in the morning (07:00), shortest at noon, long again in the evening, always to the bottom right; the tip fades out in a dither.
- `park-day`: tree canopies cast crescent shadows; `market-day` and `plaza-day` show the wall-foot occlusion.
- `*-night`: the cast shadow is gone (the darkness replaces it); only the faint wall-foot occlusion remains.
- Low shots keep contact shadows only (no cast layer): hedge and fence shadow strips of the old tile art are gone there.

Metrics (Medium, before > after): night walkable luminance p5 stays within 0.003 of `after-16-5` everywhere (riverside-night 0.1646 > 0.1646, limit 0.16). Day luminance drops only where buildings cast onto open ground (oldtown-day 0.4527 > 0.4329, plaza-day 0.47 > 0.4431), which is the point of the story. Longest seam: plaza-day 121 > 158 (the straight lower edge of the building shadow; the same wall edge was already a seam in oldtown at 162 > 167), nothing else moves by more than 1 px. Largest flat area is unchanged at Medium; at Low it grows by under 600 px2 where the fence and hedge strips were removed (school-evening 2915 > 3420, still under 4096).

Still unfinished: tree canopies are the old round blobs (entry 6, the shadow follows whatever canopy is drawn through `shadows.tree` in `data/lighting.json`), roofs are flat colour fields (entry 8), the bench, lamp and sign sprites keep their own small baked pole shadows.
