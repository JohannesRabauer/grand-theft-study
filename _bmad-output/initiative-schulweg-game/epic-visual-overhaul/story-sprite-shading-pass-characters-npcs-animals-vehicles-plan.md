---
title: "Sprite shading pass: characters, NPCs, animals, vehicles"
ticket: 18
status: built
---

## Built

`render/spriteShadeMath.js` (pure bytes) and `Pen.lit(out, hi, turn)` in `scenes/HiResArt.js` replace the plain `outline` in CharacterArt, NpcArt (outfits, dog, bench), DefenseArt, ExpansionArt (car, van, tram), SkatesArt (bus), HiResArt (default kid, bully, bikes), CosmeticArt (hats) and `entities/Critters.js` (animals). Ramp, rim, selective outline and emissive halos as in `docs/ART-BIBLE.md`; sprites that rotate (`turn`) get only the rotation-proof part. Not shaded: portraits, glow rings, locks, chain, garage, the 1x Low prototype textures. Check: `scripts/check-spriteshade.mjs`. Evidence: `docs/shots/overhaul/sprites-shaded/` against `sprites-after/`, shots `after-16-18/`, `docs/PERFORMANCE.md`.
