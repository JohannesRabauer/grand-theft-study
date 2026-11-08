---
title: "Organic ground: noise-shaped edges, variation and decals"
ticket: 5
status: built
route: full
risk: medium
date: 2026-11-09
---

# Plan: organic ground (16.5, CAP-35, CAP-34)

<frozen-after-approval>
Rework the ground bake in EnvArt/World so surface borders follow a seeded noise curve instead of the tile grid (irregular grass edges, worn dirt at path corners, curved kerbs at corners), add macro variation (grass colour patches, clover, flowers, dry spots, mowed stripes in open lawns; asphalt patches, cracks, manhole covers, drains, faded and fresh road markings; cobble wear; concrete slabs with joints and stains) and scatter decals from tile neighbours and a per-map seed, all baked once at map load. Verify: the seam and flat-area metrics of every district shot meet the art-bible limits, the zoom-sweep gap and shimmer numbers do not get worse, check-envart.mjs gains cases for the noise edge and decal placement, and check-map, check-world and check-collisions pass unchanged. Rendering only.
</frozen-after-approval>

## Code Map

- `scenes/GroundArt.js` (new, pure, no Phaser/DOM): seeded value noise, per-map seed, `paintGround(map, tx0, ty0, w, h, seed)` fills an RGBA buffer at base-pixel resolution (16 per tile) with tone patches (dithered contour boundaries, so regions never connect across a boundary), decals (flowers, clover, dry spots, mow stripes, worn dirt next to paths, cracks, manholes, drains, faded or fresh lane dashes, slab joints, stains, cobble wear) and the node-level helper `edgeLevel` for the borders. Never touches tiles that are not open ground.
- `scenes/EnvArt.js`: edge strips become pair variants: the depth of a border strip runs from the noise level of its start lattice vertex to that of its end vertex (3 levels per style, 2 variants per pair), so a border wanders by several base pixels across tiles and joins seamlessly; kerbs jog by one unit every 5 to 9 units with chips; kerb and grass corners use larger noisy radii. `groundKeys` keeps its contract (base key first, key names still `env-edge-<cls>-<side>-<variant>`).
- `services/World.js`: `renderGround` draws three passes per chunk: base tiles, the overlay canvas (nearest-filtered, scaled by the tier), then edges, shores and dressing (`groundKeys` rest).
- `scripts/check-groundart.mjs` (new, registered), `scripts/check-envart.mjs`: edge level continuity and decal placement rules.
- `docs/shots/overhaul/after-16-5/` via `scripts/shots.mjs`; `docs/ART-BIBLE.md` unchanged limits.
- Not changed: map data, collision, pathfinding, props, indoor maps.

## Tasks

1. GroundArt.js pure module + check.
2. EnvArt pair-variant strips, kerb jogs, corner radii; check-envart cases.
3. World three-pass bake.
4. Shots (after-16-5), compare metrics and zoom-sweep; tune.
5. check-all, smoke test, commit.

## Acceptance

- Given the district day shots, when measured, then longest seam <= 96 and largest flat area <= 4096 base px wherever the ground (not a building roof, hedge or fence) causes them; remaining offenders are named in `index.md`.
- Given the zoom sweep, gap and shimmer numbers do not get worse; frame time p95 stays <= 16.7 ms.
- Given the same map and seed, the overlay is byte-identical; no decal lands on water, wall, hedge or an entrance.

## Outcome

- Built as planned. Deviation: the overlay is two buffers (before and after the edge strips) and the lane/asphalt border fray was added (their tile border is the longest ground seam). Tone steps are one 5-bit colour bin so every level is its own flat colour; luminance is biased light to keep night walkable luminance (limits and numbers in docs/shots/overhaul/after-16-5/index.md).
- For 16.4 (soft shadows): ground shadows should read nv-shadow-* strips and the tone patches; the ground is one RenderTexture per chunk with an overlay drawn between base tiles and edges, so a shadow layer must sit above the ground container (depth -1), not inside the bake.
