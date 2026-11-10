# Art bible: Schulweg

The target look of the game and the rules every art change follows (epic 16, CAP-35, AD-31). The project skill
`.claude/skills/schulweg-pixel-art/SKILL.md` turns this into a checklist; load it before drawing anything.

**The look in one sentence:** a warm, readable, hand-made pixel town at 480x270 base pixels where nothing
reads as a tile-aligned rectangle, lit from the top left, friendly even at night.

Everything is procedural (AD-30): drawn in canvas code from grid and object data, seeded, no external assets. Static art is
built once at map load; animation lives in shaders, particles or pooled sprites. Medium and High render 960x540
(textures drawn at 2x, displayed at 0.5), Low renders 480x270 at 1x; the rules below are stated in **base pixels** (1 base
pixel = 2 texture pixels on Medium/High).

## 1. Palette ramps per material

Each material has a 5-step ramp: **shadow, dark, base, light, highlight**. Derive steps from the base with the existing
`lighten`/`darken` helpers (`scenes/HiResArt.js`) or `shade` (`scenes/EnvArt.js`) and hue-shift: shadows lean blue/purple,
highlights lean warm yellow. Never use pure black or pure white; the outline colour is `OUT` (`#16161e`).

| Material | Base (data/tiles.json) | Shadow | Dark | Light | Highlight |
| --- | --- | --- | --- | --- | --- |
| Grass | `#4f9d4a` | `#2c5f3a` | `#3f8a3c` | `#6bb85a` | `#a6d66e` |
| Asphalt | `#4a4d55` | `#2c2e38` | `#3c3f48` | `#5a5d66` | `#7c7f88` |
| Cobble / path | `#8a7d6b` / `#b9a77d` | `#4f4538` | `#6e6354` / `#a08f66` | `#a89a84` / `#d3c497` | `#e6d9b0` |
| Concrete | `#9a9ea6` | `#5d6270` | `#85898f` | `#b3b7be` | `#d6d9de` |
| Water | `#2f6fb0` | `#1d4a85` | `#255f9c` | `#5b9bd5` | `#b8e0f5` |
| Brick roof (red) | `#a2553c` | `#5e2e2a` | `#7d3f2c` | `#c06a4a` | `#dd9068` |
| Slate roof (blue) | `#4a5f7f` | `#2b3850` | `#3a4b68` | `#62799a` | `#8da2c0` |
| Wood | `#a9783f` | `#5e3e22` | `#8c5f2e` | `#c4915a` | `#e2b684` |
| Hedge / foliage | `#2e7a34` | `#16452b` | `#256a2b` | `#47a04a` | `#7cc65a` |
| Wall plaster (indoors) | theme `wall` | `cap` | `base` | `trim` | `#ffffff` |

A ramp is a ramp: do not invent a one-off colour for a shaded side, take the next step down.

## 2. Light direction, outline, dithering

- **Light comes from the top left.** Lit edges are the top and left sides, shaded edges the bottom and right. Shadows fall
  to the bottom right; they are shorter at noon and longer in the morning and evening.
- **Outline.** Characters, vehicles, props and set dressing get a 1 base-pixel outline in `OUT` (or in the darkest ramp step for
  soft things like grass tufts and shorelines). Large terrain (grass, asphalt) gets no outline; it is separated by edge pieces.
- **Dithering.** Transitions between two ramp steps or two materials use a 2x2 ordered (Bayer) dither or scattered
  single-pixel speckle, never a smooth blend. Soft light falloff is posterised in 3 to 5 bands, optionally dithered.
- **Anti-banding.** A gradient needs at least one dither row between steps; never stack more than 5 steps of one ramp in a
  gradient; no 1-pixel-wide stripes of alternating colours across more than 4 pixels.
- **Anti-aliasing:** none. Edges are hard; round shapes come from the pixel-ellipse helpers.

## 3. Silhouette rules (no tile-aligned rectangles)

- No object's silhouette may be a rectangle that coincides with its tile bounds. Trees, hedges, bushes, ponds, roofs and
  props break the grid: irregular outlines, canopy overhanging neighbouring tiles, notches and rounded corners.
- **Overlap and depth.** Taller things overlap the tiles north of them (a tree canopy covers the tile behind it, a roof
  overhangs its wall). Depth sorts by the base line (feet) of the object; large objects get 2 or 3 depth slices.
- **Trees** are a trunk with a root flare in the ground and a crown sprite of their own (`scenes/VegArt.js`): 3 species (oak, pine, birch) x 3 shapes x seasons, the crown is built from 6 to 9 lobes (silhouette, lit body, light cap), 
  dithered towards the shadow step on the lower right, leaf dashes, 1-pixel outline in a dark ramp step, and reaches 2 to 3 base pixels past the tile on every side. All crowns are drawn above the objects and turn see-through (alpha 0.38) while a kid or a chasing bully stands behind the trunk.
  Hedges are lumpy leaf masses drawn per connected run and sliced per tile (lumps overshoot the tile border); bushes, tall grass tufts and flower beds follow the same rules.
- Repeated objects (trees, bushes, lamps) come in at least 3 variants differing in shape, not just colour, and are
  placed with seeded jitter off the tile centre.
- Straight edges are allowed only for man-made objects (kerbs, walls, fences) and are broken every few tiles with detail
  (joints, posts, cracks, moss, signs, bins). A kerb or wall longer than the seam limit gets variation.
- Ground never forms large flat fields: scatter tufts, flowers, pebbles, leaves, cracks and dirt patches so no region of
  one colour exceeds the flat-area limit.
- Water has a shore (bank, reeds, stones) and a wavy, not a framed, outline.

## 4. Light and shadow colours

- **Shadows are tinted, not grey:** multiply the ground by `#5a6a9a` at about 35 percent (cool blue-purple), soft
  edge by a 1-pixel dither. At night the shadow is replaced by the darkness itself.
- **Contact shadows:** every figure, vehicle, animal and prop stands on a dithered ellipse (solid core, checker rim, cells of
  one base pixel) in `rgb(26,32,70)`; draw it with `Pen.shadow` (under the sprite) or `Pen.contact` (on a tile), never a smooth black blob.
- **Cast shadows** (Medium and High): buildings, tree canopies, booths, fences, hedges and dumpsters cast a swept, dithered shadow to the
  bottom right, baked once per map (`render/shadowMath.js`) and offset by the sun keyframes `day.json` `sun` (long at 06:30
  and 19:30, shortest at 12:00); it fades out as the night darkens (`lighting.json` `shadows.fadeEnd`) and is softer in rain or snow.
  The foot of a wall gets an ambient-occlusion band (2 base pixels dark, 2 faint). Never draw a shadow into a tile texture
  for something a map tile already casts.
- **Time of day** comes from `data/day.json` tint stops: warm orange at 06:30, neutral by day, orange at 19:30, deep blue
  `#0a1038` to `#050a28` at night.
- **Light sources** (lamps, windows, headlights, shop signs) glow in warm `#ffd9a0` to `#ffb347` with a posterised
  falloff and an emissive core pixel; cold light (screens, snow glow) `#bfe3ff`.
- Light is additive on the dark layer and pixel-crisp: the falloff steps are whole base pixels.

## 5. Particle and shader catalogue

Particles (pooled, within `data/quality.json` caps): rain streaks and splashes, snowflakes with sway, dust puffs, leaves,
pollen and fireflies (evening), steam, sparks, smoke, water ripples, footsteps in snow and puddles, confetti and hearts for
celebrations. Colours come from the ramps; sizes 1 to 3 base pixels, never blurred.

Shaders (WebGL, every one with a Low/Canvas fallback; AD-31): colour grade from the day-clock tint, light bloom on emissive
pixels, vignette, wind sway for foliage, water ripple, wet-ground sheen, fog, cloud shadows. All sample with nearest
filtering and snap to the base pixel grid. UI is never affected.

## 6. Kid-safe night look

Night is dark blue, never black: ambient `#0a1038` at most 0.5 alpha, every path and play area keeps readable contrast,
lamps and windows pool warm light. No flickering faster than 3 Hz, no strobing, no glowing eyes, no fog that hides
the player, no horror shapes, no blood or injury visuals. The player and enemies stay readable by silhouette and outline.

## 7. Numeric limits

Machine-readable in `docs/art-limits.json`, measured by `scripts/shots.mjs` (metrics in
`docs/shots/overhaul/<label>/metrics.json`) and checked for shape by `scripts/check-lookmetrics.mjs`. Base pixels.

| Limit | Value | Meaning |
| --- | --- | --- |
| Longest straight surface seam | 96 | longest unbroken straight colour edge in any shot (6 tiles) |
| Largest uniform flat area | 4096 | largest connected single-colour region in any shot (16 tiles) |
| Minimum walkable luminance at night | 0.16 | 5th percentile of the mean luminance (0 to 1) of visible walkable tiles in the night shots |

The `before` set exceeds the first two limits; the `after` set of story 16.19 must meet all three.

## 8. Screenshots and review

`node scripts/shots.mjs --label <name>` captures the fixed shot list (8 districts by day; the old town in morning, evening,
night, rain and snow; the park at night; home, school and dojo interiors) at Medium and Low without the debug overlay or
HUD into `docs/shots/overhaul/<name>/`, with `metrics.json`. The run is deterministic: running it twice gives identical
images and metrics. `index.md` beside a set names what still looks unfinished in each shot.
