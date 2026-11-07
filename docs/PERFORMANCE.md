# Performance (story 1.11, CAP-10, AD-8, AD-14)

Goal: 60 FPS on Medium during a level-2 chase on a mid-range phone. No phone was available for this pass,
so the work was done on a desktop and measures **CPU cost per frame**, not frames per second. A mid-range
phone is roughly 4 to 6 times slower than this desktop; the target for the logic + physics part was therefore
"Medium worst case at most 3 ms on the desktop" (about 16 ms on the phone).

**Result: Medium worst case (scenario e) costs about 0.2 ms per update on the desktop (before: 0.25 to 0.4 ms), 15 times
below the budget.** The remaining risk is rendering on the phone GPU, which was not measured (see Limitations).

## How it was measured

`index.html?bench` loads `scripts/bench.js` (see the README for the flag list). The game loop is put to sleep and
`game.scene.update` is called by hand 1200 times at a fixed 60 Hz delta (120 untimed warm-up steps first). That runs every
scene's update, the Matter step, particles and tweens, but no drawing. Intents are written into `ctx.input.intent`
and the real gameplay code does the rest. Tiers are switched through `ctx.quality.set`. Inside `?bench` a tier switch changes the caps only and never reloads the page, so the render size stays that of the tier the page was loaded with (use `?q=low` to measure Low at 480x270).

| Scenario | What runs |
| --- | --- |
| a idle walking | on foot along the school route |
| b bike top speed | sprinting bike along the route |
| c level-2 chase | 3 bullies (Low: 2) chasing a bike through skatepark and old town, pathfinding, catching disabled so the chase never ends |
| d rain + wind + props + slingshot | rain, strong wind, all 20 props awake and being knocked about, a pebble every 0.6 s |
| e everything | b + c + d together |

Run it (server must be running, e.g. `python -m http.server 8080`; uses an installed headless Edge or Chrome, no npm packages):

```powershell
node scripts/bench-cdp.mjs --url http://localhost:8080 --steps 1200 --json bench.json   # table: avg / p95 / max ms, alloc per step, retained heap
node scripts/bench-cdp.mjs --url http://localhost:8080 --live --uncapped               # real render loop, unthrottled (CPU side only)
node scripts/bench-cdp.mjs --url http://localhost:8080 --cpu all --tier medium         # CPU profile per function
node scripts/bench-cdp.mjs --url http://localhost:8080 --alloc all --tier medium       # allocation profile per function
node scripts/bench-cdp.mjs --url http://localhost:8080 --smoke                         # whole-game smoke test (46 checks)
```

Or open `http://localhost:8080/index.html?bench` in any browser and call `await SCHULWEG_BENCH.runAll()` in the console;
the table also shows on the page. (Numbers from a hidden or throttled tab are fine for this CPU measure but noisy; the
built-in preview pane of the tooling runs the game at about 2 FPS, which is why real FPS could not be read there.)

## Results (desktop, headless Edge, median of 3 runs, ms per update: avg / p95 / max)

| Scenario | Tier | Before | After | Alloc KB/step before -> after |
| --- | --- | --- | --- | --- |
| a idle walking | Low | 0.29 / 0.50 / 4.2 | 0.08 / 0.20 / 1.7 | 28 -> 16 |
| b bike top speed | Low | 0.21 / 0.40 / 6.3 | 0.08 / 0.20 / 1.1 | 23 -> 12 |
| c level-2 chase | Low | 0.20 / 0.40 / 2.4 | 0.08 / 0.20 / 1.5 | 25 -> 13 |
| d rain+wind+props+sling | Low | 0.26 / 0.50 / 6.7 | 0.18 / 0.40 / 5.6 | 28 -> 16 |
| e everything | Low | 0.36 / 0.90 / 3.3 | 0.16 / 0.30 / 1.4 | 27 -> 16 |
| a idle walking | Medium | 0.24 / 0.40 / 1.8 | 0.04 / 0.10 / 1.2 | 21 -> 7 |
| b bike top speed | Medium | 0.20 / 0.40 / 4.8 | 0.05 / 0.10 / 0.7 | 20 -> 7 |
| c level-2 chase | Medium | 0.22 / 0.40 / 2.4 | 0.09 / 0.20 / 5.1 | 23 -> 10 |
| d rain+wind+props+sling | Medium | 0.30 / 0.60 / 2.5 | 0.24 / 0.50 / 27.7 | 27 -> 15 |
| **e everything** | **Medium** | **0.24 / 0.50 / 6.5** | **0.21 / 0.50 / 1.7** | 28 -> 16 |
| a idle walking | High | 0.16 / 0.30 / 1.1 | 0.04 / 0.10 / 0.5 | 20 -> 6 |
| b bike top speed | High | 0.14 / 0.20 / 1.2 | 0.06 / 0.20 / 0.7 | 20 -> 6 |
| c level-2 chase | High | 0.16 / 0.30 / 2.2 | 0.08 / 0.20 / 1.0 | 24 -> 10 |
| d rain+wind+props+sling | High | 0.19 / 0.30 / 1.0 | 0.17 / 0.30 / 2.4 | 30 -> 17 |
| e everything | High | 0.19 / 0.30 / 0.9 | 0.20 / 0.40 / 1.9 | 32 -> 19 |

Notes on reading this:

- The timer has 0.1 ms resolution and the desktop is shared, so run-to-run noise is about +-50% on the small values and
  single `max` outliers (one GC or scheduler hiccup) are not meaningful. The scenarios with many awake props and
  pebbles (d, e) improved least (probably because the wall streamer re-evaluates often while pebbles and props keep moving; not isolated); on High (d, e) the change is within noise.
- Peak load actually reached: Medium e had 124 live particles (cap 300), 3 bullies, 18 awake props (all props on the map).
  The AD-14 budget (300 particles, 60 props, 3 bullies, 12 NPCs) is therefore not fully exercised by this map: there are only 20 props and no NPCs yet.
- Heap: over 3000 steps in every scenario and tier the heap retained after a forced GC changed by less than 0.6 MB (mostly
  slightly negative), so there is no leak and no steady growth. Garbage is still produced at about 7 to 20 KB per update
  (0.4 to 1.2 MB/s at 60 FPS), almost all inside Phaser and Matter (boxed numbers, collision pairs, particle updates); a minor
  GC every several seconds is not visible in the p95/max columns.

Real render loop in headless Edge, vsync capped: 56 FPS in every combination (the headless compositor rate; the game never
dropped below it, p95 frame 18.6 ms). Uncapped (`--disable-frame-rate-limit`), the CPU side of a whole frame (update + building
the draw calls) took 0.34 to 0.61 ms after the changes (before: 0.44 to 1.17 ms), i.e. 1600 to 2900 frames per second possible.
GPU fill and rasterization are not part of that number (software GL in headless mode).

## Story 1.12: 960x540 rendering (4x the pixels)

Medium and High now render at 960x540 (Low stays at 480x270). World units, physics and all tuning data are unchanged: the
world camera runs at base zoom 2, textures are drawn on a 2x grid and shown at scale 0.5, the UI keeps its 480x270 layout
on a zoom-2 camera. The static ground is one 3072x2048 RenderTexture (25 MB; under the 4096 limit of every WebGL device).
The speed zoom (0.6 to 1.0) still multiplies the base zoom; one camera follow (`GameScene.followCamera`) replaces
Phaser's `startFollow` so the view snaps to whole screen pixels instead of whole world pixels (which would be 2-pixel jumps).

Update cost (logic + physics, no drawing; headless Edge, 1200 steps, quiet machine, ms avg per update; before = story 1.11 build):

| Scenario | Tier | Before | After |
| --- | --- | --- | --- |
| a idle walking | Medium | 0.054 | 0.038 |
| b bike top speed | Medium | 0.070 | 0.053 |
| c level-2 chase | Medium | 0.086 | 0.066 |
| d rain+wind+props+sling | Medium | 0.169 | 0.144 |
| **e everything** | **Medium** | **0.157** | **0.177** |
| e everything | Low / High | 0.177 / 0.340 | 0.136 / 0.178 |

No regression (differences are inside the +-50% noise of the 0.1 ms timer). Note: a first "after" run taken while leftover headless
Edge processes were still running showed 0.5 ms for Medium e; always check for stray browsers before measuring.

Real render loop in headless Edge (software GL, so the fill cost of the 4x pixels is part of the number but a real GPU is not):

| Measure | Medium before (480x270) | Medium after (960x540) |
| --- | --- | --- |
| vsync-capped FPS, all scenarios | 56 (headless compositor rate) | 60, p95 frame 19 to 21 ms |
| uncapped frames per second, a idle / c chase / e everything | 4136 / 3092 / 2391 | 2337 / 2680 / 1639 |
| uncapped CPU time per frame (e) | 0.42 ms | 0.61 ms |

So a whole frame costs about 45% more CPU time to build (more draw calls for the finer textures and 2x text canvases, not more
logic); nothing near the 16.7 ms budget on the desktop. GPU fill rate on a phone for 4x the pixels is **not measured**; if the phone
protocol (below) shows a problem, Low is the fallback and `q=low` boots at 480x270.

## Story 1.13: smooth zoom

Playtest: the GTA-style speed zoom made pixels "jump around". Causes found: (1) between the integer zooms the nearest-neighbour
textures (one texel = 0.6 to 1.0 screen pixels) map to uneven pixels, so tile edges and speckle swim; (2) the camera was snapped to
whole screen pixels at every zoom while sprites were not, so ground and sprites shifted against each other by up to half a pixel;
(3) the exponential zoom ease never reached the integer base zoom, so sprite pixel rounding (`renderRoundPixels`) stayed off after
stopping. Seams were not an issue (the ground is one RenderTexture; the magenta-background gap check found 0 pixels at every zoom).

Fix: all world textures and the ground are bilinear (BootScene; texel-to-pixel 1:1 at the integer zoom keeps it crisp, UI and the
comic frame keep NEAREST); the camera is sub-pixel between integers and blends to pixel-snapped within 0.03 of an integer zoom;
the zoom is a critically damped spring on a low-passed target (dead band, max rate, exact landing: 2.0 / 1.0 when standing; see
`data/camera.json`). Not done: mipmaps (WebGL1 and non power of two textures), so Low (1x textures at zoom 0.6 to 1.0) still has some
speckle beating.

`node scripts/zoom-sweep.mjs --tier medium|low|high` (headless Edge) sweeps the zoom range with the world frozen and compares frames:

| Tier | Metric | Before | After |
| --- | --- | --- | --- |
| Medium | frame-diff roughness (lower = smoother) | 0.33 | 0.055 |
| Medium | fixed point off the ideal projection | 0.40 px | 0 px |
| High | roughness / offset | not run | 0.055 / 0 px |
| Low | roughness / offset | 0.53 / 0.40 px | 0.43 / 0.07 px |
| all | gap pixels, zoom 2.0 to 1.2 step 0.05 | 0 | 0 |

Update cost: the extra work is a few flops per frame; the benchmark was too noisy to resolve it (other processes were running,
Medium "e everything" varied 0.28 to 0.55 ms between identical runs; before 0.18 in the 1.12 table), no regression visible.

## What was optimized

Profiling (`--cpu`) showed two thirds of the update time inside Matter, not in game code:

1. **Wall streaming** (`physics/WallStreamer.js`). The town has about 530 static wall bodies; Matter sorts and walks every body in
   the world on every step (broadphase sort, `preSolveAll`, `postSolveAll`). Now only walls within 160 px (`wallRadius` in
   `data/quality.json`) of something that moves (player, active bullies, awake props, flying pebbles) are in the world, typically
   40 to 100 instead of 519. The set is re-evaluated only when an actor crosses a 48 px cell, using a chunk index. Nothing is created or
   destroyed after startup; the pool shows as `walls` in the `?debug` overlay. This alone halved the update cost.
2. **Own fixed Matter step** (`GameScene.stepPhysics`, `autoUpdate: false` in `main.js`). Phaser 3.90's Matter runner ignores the old
   `runner: { isFixed }` option and smooths the frame delta by slicing and sorting a 100-entry history on every frame (about 7 KB of garbage per frame). Now one fixed 1/60 s step runs per 1/60 s of real time
   with the same catch-up limit (3 steps) and the same tolerance for slightly early frames. Allocation per step dropped by about 55%, and physics no longer depends on display refresh rate (120 Hz screens step every other frame).
3. `MovementController` reuses one velocity object instead of creating one per mover per frame.
4. HUD: the FPS text is rewritten only when the number changes; the hide-progress bar and the slingshot wind arrow/label are redrawn only
   when their quantized value changes (they were cleared and redrawn every frame).
5. Already fine (checked, unchanged): pathfinding is allocation free with a shared budget of 2 searches per frame; props, flags,
   steam and ambient effects only work near the camera; skid, smoke and bell sprites are fixed pools; the static map is one RenderTexture.

Caps in `data/quality.json` were left as they are (Medium is exactly the AD-14 budget); the measurements gave no reason to lower them.

## Render-side review (code review, no GPU profiler)

- Static ground is drawn once into one RenderTexture (`GameScene.renderGrid`). OK.
- `pixelArt: true`, `roundPixels: true` (read by Phaser 3.90 from the top level of the config), integer scaling in device pixels, `image-rendering: pixelated`. OK.
- Graphics objects are redrawn per frame only while charging the slingshot (rubber band, needed) and in `?debug`. The HUD graphics now follow value changes.
- Text objects are updated on events or value changes (distance text in 5 m steps, ammo, money, language). OK after the fixes above.
- No shadows or filters anywhere except the pebble's blob shadow, which is off when the tier has `shadows: false` (Low). No FX pipelines are used.
- Phaser culls images against the camera automatically; props, pebbles, puddles and flags are additionally hidden when off screen or unused, and emitters only spawn inside the view. The weather overlay is one rectangle sized to the camera.

## Story 1.14: pedestrians and crowd

The crowd (`ai/CrowdDirector.js`, pools `npcs`, `dogs`, `bubbles`) runs with the full Medium cap of 12 (Low 6, High 20)
in every scenario, spawning and despawning around the player as it moves; scenario e therefore now includes the whole crowd.
Costs: one pass over at most 12 to 20 pedestrians per frame (steering toward the next graph node, no pathfinding), a spawn
attempt (3 weighted marker picks over about 125 markers) every 0.12 s, Matter bodies only for active pedestrians, sprite and
animation work only for those within 24 px of the view (the rest are hidden), no per-frame allocation in the crowd code.

| Scenario | Tier | Before (1.13) | With crowd | Alloc KB/step |
| --- | --- | --- | --- | --- |
| a idle walking | Medium | 0.04 / 0.10 / 1.2 | 0.11 / 0.2 / 3.7 | 17 |
| e everything | Low (6 NPCs) | 0.16 / 0.30 / 1.4 | 0.37 / 0.9 / 6.5 | 25 |
| **e everything** | **Medium (12 NPCs)** | 0.21 / 0.50 / 1.7 | **0.47 / 1.0 / 7.0** | 30 |
| e everything | High (20 NPCs) | 0.20 / 0.40 / 1.9 | 0.65 / 1.6 / 6.5 | 33 |

avg / p95 / max ms per update, desktop headless Edge, 1200 steps (single run; noise about +-50%). The crowd roughly doubles the
logic cost but Medium worst case stays at about 0.5 ms, six times below the 3 ms budget (about 3 ms on a mid-range phone at the
assumed 6x). Heap retained after GC did not grow. The scenario drives a bike through skatepark and old town, so the crowd
there is the one around a moving player (despawn and respawn included).

## Manual phone test protocol (for the user)

Needs: the PC and the phone on the same Wi-Fi.

1. On the PC, in PowerShell: `cd C:\docs\projekte\grand-theft-study`, then `npx serve .` (or `python -m http.server 8080`). Allow the firewall prompt for private networks.
2. Find the PC's address: `ipconfig`, line "IPv4 Address" of the Wi-Fi adapter, e.g. `192.168.1.23`.
3. On the phone open `http://192.168.1.23:3000/index.html?debug&q=medium` (use 8080 for the Python server). Rotate to landscape. `?debug` shows the FPS counter, quality tier and the pool counters (particles, props, bullies, walls) under it. Physics outlines are drawn too; they cost some FPS, so for the final number also run once without `debug` and read the FPS counter that always shows at the top left.
4. Play through the commute for 2 minutes: bike from home to school (sprint along the road), then walk into the skatepark, let the bullies chase you for a minute (level 2 brings a bike bully), hide, get caught once. Turn rain on with T if a keyboard is attached (or use the quality menu without rain; rain is the heavy case), and shoot a few pebbles.
5. Reading the FPS counter: 60 = target met. 50 to 59 = occasional drops, note where. Below 45 for more than a few seconds = failed; switch to `q=low` and repeat. The counter updates 4 times a second and shows Phaser's smoothed value; also note any visible stutter even when the number looks fine.
6. Switch quality in the pause menu (Esc / pause button): Low, Medium, High; or reload with `?q=low|medium|high`. Report back, per tier: phone model and browser, the lowest and typical FPS in (a) walking, (b) bike at top speed, (c) the level-2 chase and (d) chase in rain, plus the live counts from the debug overlay at the worst moment.

## Limitations (honest list)

- **Rendering FPS on a real phone was not measured.** All numbers are desktop CPU cost of logic, physics and draw-call building. GPU fill rate, texture upload, thermal throttling, touch-input latency and mobile browser compositing are unknown. The "4 to 6 times slower" phone factor is an assumption, not a measurement.
- The reference phone has not been chosen (open question in the ticket), so the story's verify step ("holds 60 FPS on the reference phone") is still open and needs the manual protocol above.
- The measuring browser is headless Edge with software GL; the built-in preview pane runs at about 2 FPS and could not be used for FPS.
- Worst cases are scripted, not played: bullies are never allowed to catch the player in the benchmark, and the map has only 20 props, so the 60-prop budget is not exercised (the 12-NPC budget is, since story 1.14).
- Timer resolution (0.1 ms) and a shared machine make small differences (below about 0.05 ms) unreliable; `max` values are single samples.
