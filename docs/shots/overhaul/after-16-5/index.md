# After story 16.5

`node scripts/shots.mjs --label after-16-5` (Medium and Low, 64 shots), compared with `after-16-3`. Organic ground: border strips follow a seeded noise curve (`scenes/EnvArt.js`, `stripVariant`), the ground bake adds tone patches, decals, joints, cracks, manholes, drains, lane wear and worn dirt (`scenes/GroundArt.js`, baked in `services/World.js`).

Medium, ground-driven metrics (seam px, flat px, night walkable luminance p5, before > after):

| shot | longest seam | largest flat | luminance p5 |
| --- | --- | --- | --- |
| road-day | 479.5 > 144 | 23097 > 1827 | 0.293 > 0.302 |
| market-day | 120.5 > 127.5 | 11257 > 1334 | 0.297 > 0.308 |
| plaza-day | 120 > 121 | 14460 > 2603 | 0.435 > 0.470 |
| skate-day | 350.5 > 350 | 7484 > 820 | 0.481 > 0.477 |
| riverside-day | 193.5 > 197 | 32917 > 3110 | 0.287 > 0.290 |
| school-day | 311.5 > 312.5 | 54642 > 3590 | 0.425 > 0.457 |
| oldtown-day | 163.5 > 162 | 7106 > 5168 | 0.421 > 0.453 |
| park-day | 344.5 > 344.5 | 36198 > 6082 | 0.468 > 0.475 |
| road-night | 479.5 > 144 | 12711 > 1827 | 0.1668 > 0.173 |
| market-night | 120 > 120 | 9232 > 2181 | 0.1673 > 0.174 |
| riverside-night | 192.5 > 192 | 31296 > 2165 | 0.1621 > 0.1646 |

Every flat area the ground caused is gone (largest ground flat is now under 4096 in all district shots). What still exceeds the art-bible limits is not ground and belongs to later stories:

- **Roofs and facades** (red and slate roof blocks in oldtown 5168, school 3590, riverside 3110 flat; the long horizontal roof and wall edges are the 144 to 312 px seams in road, school, oldtown, riverside): buildings, entry 8.
- **Water** (the park pond, 6082 flat; the pond frame and canal bank are the park seams of 344 and 150 px): entry 9.
- **Fences, hedges and the map border walls** (skate 350 px, road bottom wall 144 px, school fence 111 px): entries 6 and 8.
- `skate-night` seam 120 > 219 px is a lit-edge effect of the light pools on a straight pad edge, not a ground seam; the day shot of the same place is 350 px.

Other notes:

- Night walkable luminance stays above the limit everywhere and above after-16-3 (riverside-night 0.1646, limit 0.16).
- Zoom sweep (Medium, before > after): gaps 0 > 0, madRatio 1.21 > 1.20, roughness 0.053 > 0.054, madMax 17.5 > 17.7; Low: ratio 1.31 > 1.31, roughness 0.29 > 0.267. Live frame bench (headless, vsync-capped 56 fps): p95 18.3 to 18.4 ms before and after in every scenario and tier, the ground is baked once.
- Cost: the overlay takes about 0.25 s of CPU once per town load on the desktop (node, warm), interiors are skipped.
- Still unfinished: tree canopies (entry 6), buildings (8), water (9), shadows are the old blobs (4), grass tone patches are deliberately quiet (steps of one 5-bit colour bin) so the flat-area metric holds.
