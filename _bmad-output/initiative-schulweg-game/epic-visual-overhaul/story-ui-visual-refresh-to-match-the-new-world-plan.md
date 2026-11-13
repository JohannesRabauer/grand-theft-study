---
title: "UI visual refresh to match the new world"
type: 'feature'
ticket: 14
created: '2026-11-13'
status: built
baseline_revision: '8119176574f7b3857dd29d089357ba73cd906306'
route: 'full'
route_source: 'auto'
risk: medium
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - '{project-root}/docs/ART-BIBLE.md'
  - '{project-root}/_bmad-output/initiative-schulweg-game/build-brief.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The world now looks like a finished pixel town, but the HUD, menus and screens are flat rectangles with outlined strokes, five unrelated button colours, blurred stroke text and hand-drawn shapes (circles, triangles) in a dozen private styles.

**Approach:** One pixel UI kit (`ui/uiKit.js`, pure maths in `ui/uiTheme.js`, icons in `ui/uiIcons.js`, colours and timings in `data/ui.json`) that every HUD module, menu, screen, speech bubble, toast and the minimap use: bevelled panels with notched corners and a drop shadow, bevelled bars, pixel buttons with a 2 px focus ring, a 20-icon set, eased open and close, art-bible colours with checked text contrast. Visual skin only.

## Boundaries & Constraints

**Always:** AD-27 layering (HUD modules and a screen stack in the UI scene, the UI scene has its own camera, so the light map and the post passes never reach it); every text through `ctx.t`, identical keys in de and en; every interaction stays (keyboard, gamepad, touch, mouse, Esc, fresh-press rules); text contrast at least 4.5:1 (3:1 for the focus ring) checked in node; no pure black or white; no external assets; the seeded smoke runs stay deterministic (no extra draws from the game's `Math.random`, a HUD text made at run time swaps it out); reducedMotion and `game.uiAnimOff` switch the easing off; Medium frame time within the epic limit.

**Never:** change gameplay, state, input mapping or map data; add a new top-level folder; use a web font or an image file; restyle the comic caught frame or the minigame stages (their own styles); animate with a timer that closes a screen (check-important-text).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Night and rain | UI shots over a bright day and a rainy night | the same opaque panel pixels, the UI camera has no pass | script fails when a pixel differs |
| Long text | "Inline-Rollerblades" on the vehicle line, a long toast | the plate or panel grows with the text | n/a |
| Co-op | two players | plates mirror at the right edge, below the Ärger meter | n/a |
| Reduced motion | `settings.reducedMotion` | screens open settled, close without a fade, no ring pulse | n/a |
| Low and Canvas | `q=low`, `renderer=canvas` | same plates and screens (Graphics and images only) | n/a |

</frozen-after-approval>

## Code Map

- `data/ui.json` -- palette (ink, paper, sheet, well, plate tones), text colours and roles, button faces, bar colours, anim times
- `ui/uiTheme.js` (new, pure) -- contrast, `panelRects`, `barRects`, `notched`, `faceTone`, easing frames, pulse
- `ui/uiIcons.js` (new, pure) -- 20 icons of 9x9 base px, atlas layout
- `ui/uiKit.js` -- `uiLabel`, `uiPanel`, `uiScreenFrame`, `drawBar`, `HudPlate`, `uiIcon`, buttons (`paintButton`, `uiFace`), `uiOpen`/`uiLeave`, `withSeededRandom`, `uiRng`
- `ui/ButtonMenu.js`, `ui/CharacterSelect.js`, `scenes/MenuScene.js`, `ui/menuBackdrop.js` (new) -- menus and the dusk backdrop
- `ui/hud/*.js`, `ui/ObjectiveArrow.js`, `entities/SpeechBubbles.js` -- plates, bars, icons, toast panel, minimap frame
- `ui/screens/*.js` -- one frame (`uiScreenFrame`), kit text and buttons; Lernbuch and Zeugnis on paper
- `ui/ScreenStack.js` (`onOpen` hook), `scenes/UIScene.js` -- eased open; `scenes/BootScene.js` loads `ui`
- `scripts/check-uikit.mjs`, `scripts/smoke/uikit.js`, `scripts/ui-shots.mjs` -- node check, smoke scenario, UI screenshot set
- Not changed: `ui/CaughtFrame.js` (comic style), minigame stages, `ui/touch.js`, `ui/input.js`

## Tasks & Acceptance

**Execution:**
- [x] `data/ui.json`, `ui/uiTheme.js`, `ui/uiIcons.js`, `ui/uiKit.js` -- the kit
- [x] HUD modules, minimap, toast, objective arrow, speech bubbles -- plates, bars, icons
- [x] menu, character select, pause, shop, phone, Lernbuch, Zeugnis and the other screens -- kit frame, text, buttons
- [x] `scripts/check-uikit.mjs` (+ `check-all`), `scripts/smoke/uikit.js` (+ index, env flag), `scripts/ui-shots.mjs`
- [x] docs: art bible section 9, TESTING, README, HANDOFF, PERFORMANCE; shots `after-16-14`

**Acceptance Criteria:**
- Given the UI shots, when the HUD, main menu, pause, shop, phone, Lernbuch and Zeugnis are compared, then they share one style (panels, bars, buttons, icons, text).
- Given `data/ui.json`, when `check-uikit` runs, then every text colour pair reads at 4.5:1 on its tone and the HUD plate at 4.5:1 over a bright world pixel.
- Given a bright day and a rainy night, when the shop panel is read, then the pixels are identical.
- Given `check-ui`, `check-menu`, `check-gamepad`, `check-important-text` and `check-all`, then they pass; the seeded smoke test passes.

## Implementation Notes

- Fonts: no pixel font file is allowed (AD-30), and a hand-built glyph font would replace Phaser Text's wrapping and `ctx.t` use everywhere, so text stays the system monospace at whole base-pixel sizes (8, 10, 14, 24), drawn at the render scale, with a hard 1 px shadow in `OUT` on dark panels and no shadow on paper. Revisit if a bitmap font becomes worth its weight.
- 9-slice: panels are drawn from the size (corner, edge and body rectangles of one frame, `panelRects`) into a Graphics once; a Phaser NineSlice has no Canvas renderer.
- `uiText` stays a plain `scene.add.text`, so the random sequence of the seeded smoke runs is the one it was; only the lazily made phone badge swaps `Math.random` (persistent sequence: Phaser's texture keys must stay unique).
- Tweens in Phaser count wall-clock time, so the easing is not driven by the stepped clock: the smoke scenario waits real time, the screenshot script switches the easing off.
- The comic caught frame and the minigame stages keep their own looks on purpose.

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `node scripts/check-all.mjs` -- expected: all green
- `node scripts/ui-shots.mjs --label after-16-14` and `node scripts/shots.mjs --label after-16-14` -- expected: panel pixels identical day vs rainy night, metrics inside `docs/art-limits.json`
- smoke test (docs/TESTING.md) -- expected: pass
