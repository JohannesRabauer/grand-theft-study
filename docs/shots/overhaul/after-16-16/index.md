# after-16-16 (refactor sweep)

The 88 shots (Medium and Low) were captured with `node scripts/shots.mjs --label after-16-16` and are byte-identical to `../after-16-15/` (checked with `cmp`, all 88 images). The images here are copies of those (identical bytes). `metrics.json` is identical to the one of after-16-15 except for the label, and the per-shot `hash` fields prove the images. The sweep changed no pixel.

Limits still exceeded (docs/art-limits.json) are listed in the plan of story 16.16 (`_bmad-output/initiative-schulweg-game/epic-visual-overhaul/story-refactor-sweep-plan.md`).
