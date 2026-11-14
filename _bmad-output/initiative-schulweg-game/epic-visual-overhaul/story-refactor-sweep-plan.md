---
title: "Refactor sweep"
ticket: 16
status: built
---

# Story 16.16: Refactor sweep

## Goal

Clean up what epic 16 left behind (duplicated helpers, dead data keys, stale docs) without changing a pixel or any behaviour. Verify: check-all, the seeded smoke test and the shots and metrics are identical before and after.

## Approach

Started from the earlier plans' change logs and an audit of the code: an export scan (no unused export left), a scan of every key of the data files epic 16 added, and a search for redefined helpers.

## Done

- **One copy of the small helpers.** New `render/baseMath.js` (`clamp01`, `lerp`, `smoothT`, `hex`, `rgb01`, `rgba`) replaces 7 copies of the `'#rrggbb'` parser (Buildings, Interiors, Season, StreetLights, waterMath, DojoArt, StickerAlbumScreen), the `Atmosphere` array parser, 3 `lerp` (PostFx, Water, atmosphereMath), 3 `smooth` (EnvArt, waterMath, interiorMath), 3 `clamp01` (Buildings, Interiors, interiorMath), 2 `rgb01`-style splitters, and the four inline `[n >> 16, ...]` splits in waterMath. `atmosphereMath` re-exports `clamp01` and `lerp` for its importers.
- **HiResArt and EnvDraw shared one colour maths twice:** `HiResArt` had its own `rgb`, `mix`, `rng` that were line for line `EnvDraw.rgbOf`, `shade` and `rng`. `mix` now lives in `EnvDraw` (`shade` is mix towards white or black), `HiResArt` imports `mix`, `rgbOf`, `rng` and `Pen.lit` uses `rgbOf`.
- **Data:** removed `season.json` `cover.hedgeDrop` and `cover.crownDrop` (read by nothing). The `interiors.json` `daylight.weather.cloudy` key looked unused but is read through `weather[state]`, so it stays. No dead tint path found: the old tint overlay of `physics/Weather.js` is the live Low and Canvas fallback.
- **Guard:** `scripts/check-basemath.mjs` (in check-all, now 83) pins the helper values, that `shade` is `mix` towards white or black, and fails when a file of `render/`, `scenes/` or `ui/screens/` defines its own `hex`, `lerp`, `clamp01`, `rgb01` or smoothstep.
- **Docs:** README (render/ and camera/ in the folder map, EnvDraw, shots script, art bible, skill, `.claude/skills`, Pages note, limitations), HANDOFF (epic 16 summary), docs/TESTING.md, ART-BIBLE (helper names, limit status), the skill (shared helpers).

## Left as is (on purpose)

- The seeded generators differ per module (`VegArt`, `ParkArt`, `GroundArt.hash2`, `buildingMath.mix`, `waterMath.hash01`, `atmosphereMath.hash01`, `interiorMath.hash2`, `StreetLights.hash`): each one's output is baked into the art, so unifying them would change pixels. Only the pairs with identical streams were merged.
- `camera/motionMath.js` keeps its own clamping `smooth` and `clamp01` (the camera does not import from `render/`).
- Pages workflow: no new top-level folder was added by the epic (`render/` and `camera/` were already in the copy list), so `.github/workflows/pages.yml` is unchanged.

## Verification

- `node scripts/check-all.mjs`: 83 of 83 pass.
- Seeded smoke test (`scripts/bench-cdp.mjs --smoke`, own port): 1445 checks, 0 failed, 0 console problems (same as 16.15).
- `node scripts/shots.mjs --label after-16-16`: 88 shots (Medium and Low), all byte-identical to after-16-15 (`cmp`), `metrics.json` identical except the label. UI shots (`ui-shots.mjs`) are not reproducible byte for byte (Phaser tweens use wall-clock time: two runs of the same code differ in 36 of 44 images), so they are not part of the identity claim; the UI code paths touched are the Sticker album's `hex` only.

## Art-bible limits still exceeded (for the visual review, 16.17)

Measured on `after-16-16` (identical to after-16-15), limits from `docs/art-limits.json`:

- **Night luminance (min 0.16):** met in all night shots (lowest walkable p5 0.30).
- **Largest flat area (max 4096 base px2):** exceeded in 4 Low shots only: oldtown-rain-night 7623, market-evening 6938, riverside-night 6063, riverside-evening 5119 (large dark or one-tone ground and water at Low's 1x, no dither pass). Every Medium shot is within the limit.
- **Longest straight seam (max 96 px):** exceeded in 77 of 88 shots (both tiers), i.e. almost everywhere:
  - interiors: school day 471 (Low 479), dojo day 368 (Low 384), home morning 347 (Low 384), school night 262, home night 230, dojo night 179: the long straight wall base and wall-cap rows across a whole room;
  - school exterior 297 (day), riverside 193 to 197, skate 190 (day) to 121, oldtown 160 to 174, road 116 to 146, plaza and market 120 to 124, park summer Low 192, lamp-dusk 165: long straight roof ridges, building facades, kerb and fence lines, the school block and the river edge.
  Only the park by day (87 to 89) and a few Low shots stay under 96.

## Tasks

- [x] Audit duplicated helpers, unused exports, data keys, stale docs
- [x] `render/baseMath.js`, merge helper copies, HiResArt on EnvDraw
- [x] Data cleanup, guard check
- [x] Shots identical, metrics identical, smoke, check-all
- [x] README, HANDOFF, TESTING, ART-BIBLE, skill; mark built, commit, push
