# Before set: what looks unfinished

Captured by `node scripts/shots.mjs --label before` (story 16.1) from the game as it stood after epic 15: no debug overlay, no HUD,
seeded and fixed-step, Medium (960x540) and Low (480x270). Numbers are in `metrics.json` (base pixels: longest straight seam,
largest flat area; limits in `docs/art-limits.json`: seam 96, flat 4096, night walkable luminance 0.16). Judged by eye on the images.

Common to every shot: no light or shadow layer (only a global tint), trees and bushes are small squares inside one tile, roofs and
walls are flat rectangles with a window row, ground is a single flat green, grey or brown field with sparse speckle, no particles at rest.

## Outdoors by day

- `park-day`: pond is a framed rectangle with a hard stone border; trees are lone single squares scattered on one big green field (flat area about 37000 px2); bench and lamp at the right sit on grey concrete slabs with straight 340 px seams; a hedge line is a plain green bar.
- `oldtown-day`: roofs are huge flat blue or red brick blocks (6 to 10 tiles wide, texture only, no ridge, no eaves, no overhang); facades are one cream strip with identical windows; chimneys are single dark pixels; streets between buildings are bare brown cobble corridors with 160 px straight seams.
- `road-day`: asphalt road is a flat grey band with straight lane markings across the whole frame (480 px seam); hedges below houses are rectangular green bars; sidewalks are flat grey strips; house fronts are rectangles; no kerb detail or drains.
- `school-day`: the schoolyard is one 70000 px2 grey field with three lone fence segments and a crate; the school building is a red block with a plain window row; the neighbouring ground is a flat brown rectangle.
- `market-day`: crossing of two roads and a dirt path with no markings or wear; flat green lawns with hard rectangular borders; roofs as blocks; bus stop and stall are tiny props in empty space.
- `riverside-day`: the pond at the top is a framed blue square; tall flat grey promenade with a straight fence line (190 px seam); buildings as flat blocks; very few props for the area.
- `skate-day`: the busiest shot, but every ramp and rail is a straight grey rectangle on a flat concrete slab, graffiti is flat decals, the red brick buildings at the bottom are plain blocks, trees at the right are lone squares.
- `plaza-day`: same old-town block pattern as `oldtown-day`: flat roofs, uniform windows, empty cobble lanes; no plaza furniture, fountain or trees give it a centre.

## Light variants (old town)

- `oldtown-morning`, `oldtown-evening`: only a colour tint over the same flat art; no long shadows, no low sun, no lit windows or lamps.
- `oldtown-night`: the whole frame is darkened evenly (walkable luminance p5 about 0.28); windows and lamps do not glow, nothing pools light, buildings and street read as one dark mass.
- `park-night`: same even darkening; the lamp at the skate park does not light anything, the pond is a dark rectangle.
- `oldtown-rain`: a few thin streaks and a blue overlay; no splashes on roofs, no wet sheen, no puddle reflections, ground colour unchanged.
- `oldtown-snow`: scattered white flakes and a few lumps, but roofs and ground stay bare brick and cobble (no snow cover, no frosted edges, no breath or footprints).

## Interiors

- `interior-home-morning`, `interior-home-night`: two identical images (no interior light, no day or night difference even through the window); a bare box with a red rug, a table and a backpack in a huge empty brown floor (flat area about 13000 px2); the hall below is a flat grey tile grid with one blue rug; no furniture variety, clutter, shadows or depth.
- `interior-school-day`: classroom desks are identical small rectangles in even rows on a flat orange floor; the corridor is a flat chequer floor with a blue strip; walls are a plain window strip; no shadows or clutter; the blue strip and the floor have a 480 px straight seam.
- `interior-dojo-day`: the tatami mat is one framed green rectangle with a red circle; the surrounding wooden floor is a flat brown field (37000 px2); rack, scrolls and banners are small flat decals on the back wall; the frame is a black void around a lone box.
