---
name: schulweg-pixel-art
description: Pixel-art rules and procedural drawing recipes for the Schulweg game. Load before drawing or changing any art, lighting, shader or particle in this repo (scenes/EnvArt.js, HiResArt.js, ParkArt.js, DojoArt.js, NpcArt.js, VehicleArt.js, render/, particles/), and before reviewing a visual change. Not for gameplay or UI logic.
---

# schulweg-pixel-art

Binding rules for every art change in epic 16 and after. The full text is `docs/ART-BIBLE.md` (read it for palette ramps and
the numeric limits); the architecture is AD-31 in `_bmad-output/initiative-schulweg-game/architecture-schulweg-game/`.
UI work also loads `ui-ux-pro-max`.

## When to load

Before drawing a tile, sprite, prop, building, interior, light, shader or particle, and before judging screenshots.

## The rules

1. **Procedural only** (AD-30): canvas/Phaser code, seeded, built once at map load. No image files, no network.
2. **Base pixels:** think in the 480x270 grid. Medium/High draw at 2x and display at 0.5; Low is 1x. Same keys for both sets.
3. **Palette:** 5-step ramp per material (shadow, dark, base, light, highlight) from `docs/ART-BIBLE.md`; hue-shift shadows
   cool and highlights warm; outline colour `OUT` `#16161e`; no pure black or white.
4. **Light from the top left:** lit top and left, shaded bottom and right, shadows to the bottom right, tinted blue-purple. Contact shadows are `Pen.shadow` (dithered); things a map tile casts (walls, trees, fences, hedges) get their cast shadow from `render/Shadows.js`, so do not bake one into the art.
5. **Hard edges, no anti-aliasing;** transitions by ordered dither or speckle, light falloff posterised in whole base pixels.
6. **No tile-aligned rectangles:** silhouettes break the tile grid (irregular canopies, notched roofs, rounded ponds),
   tall things overlap the tile behind them, repeated objects have 3+ shape variants and seeded jitter.
7. **No big flat fields and no long bare seams:** respect `docs/art-limits.json` (longest straight seam, largest flat area,
   minimum walkable luminance at night).
8. **Kid-safe night:** dark blue not black, readable paths, no strobing (3 Hz max), nothing scary.
9. **Pooled and capped:** no per-frame allocation, effects behind the quality-tier switches in `data/quality.json`, a
   Canvas/Low fallback for every shader. New always-on random visuals get an `...Off` test flag in `scripts/smoke/env.js`.
10. Rendering only: never change map layout, collision, gameplay or balance.

## Recipes on the existing helpers

- **Sprite or prop:** `new Pen(scene, key, w, h)` (`scenes/HiResArt.js`): `ell` for round masses, `px` for detail, `line`,
  then `.shadow(cx, cy, rx, ry)` and `.outline(OUT)` last, `.done()`. Draw lit shapes first, then the shade on the
  bottom-right half, then highlight pixels on the top-left.
- **Organic blob (canopy, bush, pond, cloud):** union of 3 to 6 overlapping `ell` calls with seeded radii and offsets
  (`rng(seed)`), then shade by shifting the lower-right rows one ramp step down and dither the boundary row.
- **Ground tile variants:** seeded `speckle` from the ramp plus 2 to 4 features (tuft, flower, pebble, crack, leaf); the
  edge pieces of `scenes/EnvArt.js` (`maskStrip`, `scatter`) blend neighbours, add overlays instead of new base tiles.
- **Break a straight line:** move the line by 1 pixel every 5 to 9 pixels, add a joint, post, crack or moss patch, vary the
  length of kerbs and walls; never let a visible edge run longer than the seam limit.
- **Dither:** `(x + y) % 2` checker for 50 percent, a 4x4 Bayer matrix for 4 to 16 levels; alpha tints are drawn as dither,
  not as semi-transparent fills, except for the global light multiply.
- **Interior:** wall with cap and base trim (EnvArt `THEMES`), floor with two alternating tones, furniture with a drop
  shadow and overlap, clutter (rugs, plants, papers) in seeded positions.
- **Light and glow:** request lights through `ctx.lights` (AD-31), never create sprites by hand; core pixel, 3 to 5 posterised
  rings, warm `#ffd9a0` to `#ffb347`.
- **Particle:** add an entry in `data/particles.json`, 1 to 3 base-pixel squares from a ramp, pooled via `ParticleHub`.

## Review checklist

- [ ] Palette from the ramps; outline in place; light from the top left; shadow tinted.
- [ ] No silhouette equals its tile rectangle; overlaps and variants present; no repeated identical tile in a row of 4+.
- [ ] `node scripts/shots.mjs --label <name>` run; metrics within `docs/art-limits.json` (or the story says why not).
- [ ] Looked at the Medium and Low images of the affected shots (no debug overlay), day and night.
- [ ] Night readable and friendly; no flicker above 3 Hz.
- [ ] Low and Canvas still render; quality switch present; no per-frame allocation; `node scripts/check-all.mjs` green.
- [ ] Collision, pathfinding and map data unchanged.
