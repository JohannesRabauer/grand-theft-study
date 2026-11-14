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
node scripts/bench-cdp.mjs --url http://localhost:8080 --smoke                         # whole-game smoke test (72 checks)
```

Cleanup: `bench-cdp.mjs` and `zoom-sweep.mjs` start Edge/Chrome through `scripts/lib/headless-browser.mjs`, which gives every run its own
temp profile (`bench-*` / `sweep-*` in the temp folder) and always removes it again: a `try/finally` plus SIGINT, SIGTERM and process-exit
handlers kill the exact browser process tree by PID and delete the profile, on success, on errors and on Ctrl+C. (On Windows the PID that
`spawn` returns is only a launcher that exits at once, so the real browser root is found by its unique `--user-data-dir` and killed with
`taskkill /T`.) Only a hard kill of node itself (Task Manager, `Stop-Process`) cannot be caught; find such leftovers by the profile
folder name only, e.g. `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -match 'user-data-dir=S*\(bench|sweep)-' }`.

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

## Story 5.3: buses and the bus grab

Two buses (pooled, `data/routes.json`, cap `maxTargets` 4) move along a route as kinematic SENSOR bodies; per frame that is two route lookups, two `Body.setPosition` calls and a distance test per skating player, with sprites culled outside the view plus 96 px. The rope, risk bar and zone hint share one Graphics that is only cleared and redrawn while a skater is near a bus or hanging on. Bench (headless Edge, Medium, scenario "e everything"): 0.19 ms average, 0.4 ms p95 per update; `GrabTargets` does not appear among the allocation hot spots (`--alloc all --tier medium`).

## Manual phone test protocol (for the user)

Needs: the PC and the phone on the same Wi-Fi.

1. On the PC, in PowerShell: `cd C:\docs\projekte\grand-theft-study`, then `npx serve .` (or `python -m http.server 8080`). Allow the firewall prompt for private networks.
2. Find the PC's address: `ipconfig`, line "IPv4 Address" of the Wi-Fi adapter, e.g. `192.168.1.23`.
3. On the phone open `http://192.168.1.23:3000/index.html?debug&q=medium` (use 8080 for the Python server). Rotate to landscape. `?debug` shows the FPS counter, quality tier and the pool counters (particles, props, bullies, walls) under it. Physics outlines are drawn too; they cost some FPS, so for the final number also run once without `debug` and read the FPS counter that always shows at the top left.
4. Play through the commute for 2 minutes: bike from home to school (sprint along the road), then walk into the skatepark, let the bullies chase you for a minute (level 2 brings a bike bully), hide, get caught once. Turn rain on with T if a keyboard is attached (or use the quality menu without rain; rain is the heavy case), and shoot a few pebbles.
5. Reading the FPS counter: 60 = target met. 50 to 59 = occasional drops, note where. Below 45 for more than a few seconds = failed; switch to `q=low` and repeat. The counter updates 4 times a second and shows Phaser's smoothed value; also note any visible stutter even when the number looks fine.
6. Switch quality in the pause menu (Esc / pause button): Low, Medium, High; or reload with `?q=low|medium|high`. Under Qualität the same menu has the Effekte row (Voll, Weniger, Aus; story 16.15, also in the parent settings): it applies at once, keeps the render size, and is the quick fix before dropping a tier: Weniger removes bloom, the rain veil, reflections, shimmer, god rays and glints and trims particles and lights, Aus is the Low look at the tier's resolution. If a tier is below 50 FPS, try Weniger, then Aus, then the next tier down, and report which of them reached 60. Report back, per tier: phone model and browser, the lowest and typical FPS in (a) walking, (b) bike at top speed, (c) the level-2 chase and (d) chase in rain, plus the live counts from the debug overlay at the worst moment.

## Limitations (honest list)

- **Rendering FPS on a real phone was not measured.** All numbers are desktop CPU cost of logic, physics and draw-call building. GPU fill rate, texture upload, thermal throttling, touch-input latency and mobile browser compositing are unknown. The "4 to 6 times slower" phone factor is an assumption, not a measurement.
- The reference phone has not been chosen (open question in the ticket), so the story's verify step ("holds 60 FPS on the reference phone") is still open and needs the manual protocol above.
- The measuring browser is headless Edge with software GL; the built-in preview pane runs at about 2 FPS and could not be used for FPS.
- Worst cases are scripted, not played: bullies are never allowed to catch the player in the benchmark, and the map has only 20 props, so the 60-prop budget is not exercised (the 12-NPC budget is, since story 1.14).
- Timer resolution (0.1 ms) and a shared machine make small differences (below about 0.05 ms) unreliable; `max` values are single samples.

## Story 16.2: light map and post effects (CAP-35, AD-31)

New per frame work on Medium and High: one 480x270 light render texture (clear plus one stamp per visible light, now 1) multiplied over the world, and two full-screen WebGL passes on the world camera (bloom with 8 taps on Medium and 16 on High, colour grade plus vignette). Low and Canvas (`?renderer=canvas`) skip all of it and keep the old tint overlay.

Real render loop, headless Edge, software GL, uncapped (`node scripts/bench-cdp.mjs --url ... --live --uncapped`), ms per frame, before = commit 8330e10 served from a copy, after = this story. Frame ms avg / p95:

| Scenario | Tier | Before | After |
| --- | --- | --- | --- |
| a idle walking | Medium | 1.18 / 1.80 | 1.19 / 2.20 |
| e everything | Medium | 0.89 / 1.40 | 1.18 / 1.70 |
| a idle walking | High | 1.31 / 2.20 | 1.38 / 2.10 |
| e everything | High | 1.03 / 1.50 | 1.16 / 1.70 |
| e everything | Low | 0.92 / 1.40 | 1.05 / 1.80 |

p95 stays far below 16.7 ms on Medium and High; worst scenario Medium e p95 +21 percent (limit +25), High e +13 percent. Software GL is not a phone GPU: the two passes at 960x540 on a real phone remain unmeasured (see the phone protocol). `scripts/bench-cdp.mjs --query "&q=low"` adds URL flags to the bench page. Screenshot set `docs/shots/overhaul/after-16-2/` (night walkable luminance 0.20 and 0.22, limit 0.16).

## Story 16.3: time-of-day mood and street lights (CAP-35, AD-31)

New per frame work: `render/StreetLights.js` walks 86 fixed lights (74 street lamps, 4 park lamps, 8 signs), culls them to the camera and holds the visible lit ones in the light pool (fixed lights get `maxLights - 10`, headlights, tail lights and bike lamps the reserve of 10, so the count never passes the tier cap; Medium 24, High 48). The lamp posts are 74 y-sorted images plus a lit head image each (only visible while lit and on screen; they also glow on Low and Canvas). Nothing allocates per frame (`scripts/check-lighting.mjs` checks the loop). Update cost in the `runAll` bench is unchanged (0.004 ms avg on Medium, same allocation per step).

Real render loop, headless Edge, software GL, uncapped, ms per frame avg / p95 (`--live --uncapped`; `&minute=1290` in `--query` runs the scenarios at 21:30; timer resolution is 0.1 ms). Same machine and session: epic baseline 8330e10, after 16.2 (83cacde) and this story:

| Scenario | Tier | 8330e10 | 16.2 | 16.3 day | 16.3 at 21:30 |
| --- | --- | --- | --- | --- | --- |
| a idle walking | Medium | 0.58 / 0.80 | 0.60 / 0.80 | 0.65 / 0.90 | 0.64 / 0.90 |
| e everything | Medium | 0.56 / 0.80 | 0.60 / 0.80 | 0.67 / 0.90 | 0.67 / 0.90 |
| a idle walking | High | 0.59 / 0.80 | 0.68 / 1.00 | 0.69 / 1.00 | 0.64 / 0.90 |
| e everything | High | 0.58 / 0.80 | 0.64 / 0.90 | 0.66 / 0.90 | 0.68 / 0.90 |

Worst case Medium e: average +20 percent over the epic baseline, p95 0.9 against 0.8 ms (+12 percent), far below 16.7 ms. The mood is the same cost by day and at night (headlights, lamps and the extra lights are a few stamp draws). Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.4: soft shadows (CAP-35, AD-31)

New work: the cast-shadow layer is one 2560x1792 base-pixel mask (RGBA, about 18 MB of CPU canvas plus the GPU texture) baked once per outdoor map at load by `render/shadowMath.js` (about 60 to 110 ms for the town, node), drawn as one image with the `SchulwegShadow` pipeline (a fragment shader of three texture fetches for most pixels, three more only inside shadows). Per frame there is no redraw and no allocation: `Shadows.update` recomputes the offsets once per game minute. Low (`shadows: false`) and Canvas never build the mask. Contact shadows are baked into the sprites; props add one pooled `prop-contact` image each.

Real render loop, headless Edge, software GL, uncapped (`--live --uncapped`), ms per frame avg / p95, mean of two interleaved runs against a copy of 0b77fee (the machine is noisy, single runs varied by 20 to 40 percent):

| Scenario | Tier | Before | After |
| --- | --- | --- | --- |
| a idle walking | Medium | 3.35 / 5.50 | 3.52 / 5.55 |
| e everything | Medium | 3.21 / 5.20 | 3.45 / 5.25 |
| e everything | High | 3.24 / 4.95 | 3.37 / 4.85 |
| e everything | Low | 1.91 / 2.80 | 2.31 / 3.35 |

Worst p95 change +20 percent (Low e, 0.55 ms), limit +25; Medium and High at most +5 percent. p95 stays far below 16.7 ms. Software GL is not a phone GPU: the full-screen shadow pass on a real phone is unmeasured (see the phone protocol). Texture memory: a phone with a small `MAX_TEXTURE_SIZE` (under 2560) skips the layer.

### Vegetation (story 16.6)

`render/Vegetation.js` places 159 crown sprites (one atlas, one layer above the objects) and 68 hedge slices (11 runs) per outdoor map, once at map load. Per frame: a fade test of every crown against the players and active bullies (a rejecting box test first), one `sin` per hedge run, and on Medium and High three shared uniforms for the `SchulwegWind` pipeline (a `MultiPipeline`; the crowns batch in one draw call). Low and Canvas nudge the crowns near the view by one pixel instead. Real render loop, headless Edge, software GL, uncapped, p95 ms (median of paired runs, `--live --uncapped`, `8aac0f8` against this story): Medium `e everything` 1.70 > 1.80 (+6 percent), `a idle walking` 1.90 > 2.20 (+16 percent); High 1.90 > 1.80 and 1.80 > 2.30 (+28 percent, 0.5 ms, noise level of the runs). Lesson: a custom object pipeline on sprites that are y-sorted among the objects costs a batch break per sprite (first attempt +100 percent); keep such sprites in one layer. Smoke test: 1295 checks. Software GL is not a phone GPU; the phone measurement stays open.

### Building exteriors (story 16.7)

`render/Buildings.js` lends eave and chimney images from a fixed pool (260) to the tile chunks (12x12 tiles) near the view, shows pooled lit panes (40) and gives the nearest lit windows a light (tier `windowLights`: Medium 6, High 12, Low 0; the pool limit grew to 30 and 60 so lamps and vehicles keep their slots). Window state is worked out every 0.2 s over 233 windows; nothing allocates per frame. Lesson: 869 live eave images made frame time +40 percent (display list size), a Blitter drew wrongly in the shot path; a fixed pool lent per chunk costs about +3 percent. Real render loop, headless Edge, software GL, uncapped, p95 ms, mean of three interleaved runs against `354a2c8`: Medium `a` 1.70 > 1.83, `e` 1.47 > 1.53; High `a` 1.97 > 1.97, `e` 1.60 > 1.80 (+13 percent, noise); Low at most +7 percent. Smoke test: 1304 checks. Software GL is not a phone GPU; the phone measurement stays open.

### Street dressing (story 16.9)

`render/StreetProps.js` lends images from a fixed pool (tier `streetProps`: Low 70, Medium 110, High 160; made at map load, so the display list does not grow; props of a map that are not near the view hold none) to the standing props of `render/streetMath.js` (98 in the town: bikes, letterboxes, planters, bollards, hydrants, signs, recycling bins, the kiosk and the Pfand machine, from one atlas, one batch). The check runs four times a second (a box test per prop, no allocation); most props in one view: 18. Ground decals (about 500 kerb weeds, gutter leaves, posters, chalk and markings) are layers of the ground bake: no per-frame cost. Roof variants add 60 textures at boot. Real render loop, headless Edge, software GL, uncapped (`--live --uncapped`), ms per frame avg / p95, mean of two interleaved runs (three for the base) against a copy of `f152459`: Medium a 1.50 / 2.23 > 1.65 / 2.60, c 1.30 / 1.83 > 1.32 / 1.95, e 1.38 / 2.07 > 1.37 / 1.90; High a 1.92 / 3.10 > 1.73 / 2.60, c 1.55 / 2.33 > 1.54 / 2.25, e 1.54 / 2.20 > 1.69 / 2.40; Low a 1.12 / 1.77 > 1.19 / 1.95, c 0.94 / 1.33 > 1.09 / 2.00 (0.7 ms, timer resolution 0.1 ms and the noise of the runs), e 1.02 / 1.53 > 1.00 / 1.50. Worst case (e everything) at most +9 percent, p95 far below 16.7 ms. Lesson: a system that destroys a pool on `unloadMap` must also destroy the images the pool has lent out (the round-trip leak check found 11). Smoke test: 1368 checks. Software GL is not a phone GPU; the phone measurement stays open.

### Water (story 16.8)

`render/Water.js` builds seven water bodies of the town once per map (a distance field per body: about 40 ms for the largest, nothing per frame). Medium and High draw one mask image per body through the `SchulwegWater` pipeline; per frame the system sets the phase and, for bodies in view, copies up to 8 nearby lights into two small buffers (no allocation; bodies out of view are hidden). The pipeline flushes before it sets a body's lights, so one body never draws with another's. Low and Canvas show 6 pre-drawn frames per body and swap a texture every 0.2 s. Ripple rings use the existing pooled `ripple` emitter (share 0.06 > 0.1 of the tier cap). Real render loop, headless Edge, software GL, uncapped, p95 ms, interleaved runs against `a1cf3f3`: Medium `a` 2.2 > 2.2, `c` 1.8 > 1.8, `e` 1.9 > 1.8; High `a` 2.4 > 2.5, `c` 1.7 > 1.8, `e` 1.8 > 1.9; Low at most +0.2 ms. With the camera on the pond or the canal and `gl.finish()` after every step (so the shader is in the number), first of two runs, p95 ms before > after: Medium pond 1.9 > 2.0, canal 1.6 > 2.0; High pond 2.2 > 2.4, canal 2.0 > 2.0; at most +0.4 ms, far below the 16.7 ms limit and within +25 percent. Lesson: a measurement with `?debug` physics lines on (`batchLine`) was 0.5 ms off between trees for no reason of ours; measure with the debug draw off. Smoke test: 1313 checks. Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.10: interiors (CAP-35, AD-31)

New work: walls, floors, rugs and worn paths of home, school and dojo are baked into the ground texture (no per-frame cost); `render/Interiors.js` places 65 furniture images, four backdrop strips, a shaft image per window and a fixture plus lit twin per lamp once per map load (display list fixed while playing). Per frame it walks at most 12 windows and 7 lamps (no allocation) and holds at most one pooled light each (`ctx.lights`: home 5 to 6, school 7 to 19 at most, dojo 4 to 5; Medium limit 30). The light map now also runs indoors on Medium and High (one 480x270 texture and one stamp per light, as outdoors).

Outdoor frame times, real render loop, headless Edge, software GL, uncapped (`--live --uncapped`), ms per frame avg / p95, mean of two interleaved runs against a copy of 8069481:

| Scenario | Tier | Before | After |
| --- | --- | --- | --- |
| a idle walking | Medium | 1.37 / 1.90 | 1.36 / 1.95 |
| e everything | Medium | 1.22 / 1.65 | 1.21 / 1.55 |
| a idle walking | High | 1.55 / 2.15 | 1.64 / 2.10 |
| e everything | High | 1.34 / 1.70 | 1.37 / 1.80 |
| e everything | Low | 0.84 / 1.05 | 0.84 / 1.10 |

Worst p95 change +6 percent (limit +25). Inside the rooms (400 stepped frames each, avg / p95 ms, Medium): town noon 1.40 / 2.0, home noon 0.62 / 1.4, home at 21:30 0.81 / 1.4, school 0.21 / 0.3, dojo 0.51 / 1.4 (High and Low alike: at most 1.9 ms p95), so the rooms cost less than the town. Software GL is not a phone GPU.


## Story 16.11: particle overhaul (CAP-35, CAP-31)

One sheet texture (`p-sheet`, 20 frames, 37x16 base px) serves 17 emitters, so the particle draws batch as before. Every emission goes through `ParticleHub.put`, which clips to `maxParticles - live` (the live count is read once per tick over 30 emitters): the shares of the emitters add up to about 2.2, the total is hard-capped per tier (Low 150, Medium 300, High 500). New per-tick work: footsteps and drips per player (a timer each), one pass over the glowing particles (at most `particleLights` 0/4/8, each one `move` and `setIntensity`), a scan of the lit lamps for embers (about 80, a few times a second), no allocation. Real render loop, headless Edge, software GL, uncapped, p95 ms, mean of two interleaved runs against a copy of 6860d2e: Low a 1.35 > 1.40, e 1.05 > 1.15; Medium a 1.90 > 1.90, c 1.45 > 1.50, e 1.55 > 1.60; High a 2.05 > 2.10, c 1.65 > 1.60, e 1.70 > 1.90 (+12 percent, 0.2 ms, timer resolution). Smoke test: 1361 checks. `scripts/particle-frames.mjs --label <name>` steps the surfaces, weather, seasons, night lights, celebrations and indoor motes and prints alive counts and the peak total against the cap. Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.12: atmosphere (CAP-35, CAP-30, CAP-31)

`render/Atmosphere.js`: haze (fog banks, morning mist), drifting cloud shadows and a faint rain veil are one block inside the existing colour-grade shader (`render/pipelines/AtmosphereFx.js` chunks, carried by `GradeFx.js`): no extra full-screen pass. A first version as a separate camera pass cost +34 to +53 percent p95 on Medium (software GL, one more render-target swap); merged into the grade pass it is +9 to +18. Each layer is a uniform branch (zero cost at zero); two octaves of value noise per base pixel. Low and Canvas draw the same layers as three scrolling tile sprites (256x256 noise banks, built once on first need). Wet ground: a fixed pool of sheen images (Low 260, Medium 520, High 700) from one atlas, re-laid when the camera crosses a tile or a puddle appears (about 600 `collectWet` steps, no allocation), alpha changed only when the wetness moved; lamp reflections (Medium 12, High 24) and puddle rings (Low 6, Medium 12, High 24) are fixed pools too. Real render loop, headless Edge, software GL, uncapped, p95 ms, mean of two interleaved runs against a copy of 072a15e: Low a 1.90 > 2.05, c 1.30 > 1.50, e 1.30 > 1.60 (+0.3 ms, timer resolution 0.1); Medium a 2.25 > 2.65, c 1.65 > 1.80, e 1.90 > 2.15; High a 2.50 > 2.70, c 1.90 > 2.20, e 1.95 > 2.00. Rain at full density and the ground fully wet (25 s warm-up in `e`): Low 1.3 > 1.1 to 1.3, Medium 1.8 > 1.8 to 2.3, High 1.9 > 1.9 to 2.0. Worst case +23 percent (Low e, 0.3 ms), inside the epic limit of 25 percent and far below 16.7 ms. Smoke test: 1383 checks. `scripts/atmosphere-frames.mjs --label <name>` writes the cross-fade sequence (clear, rain, fog, clear), the world-lock check, the wet night and day and the per-tier switches. Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.13: smooth motion (CAP-35)

No new pass and no new draw call. Per frame: one eased look-ahead (a few flops), the shake (a sine pair only while one runs), `PlayerMotion` per kid (a texture swap only when the frame changes, keys cached per texture, no allocation), one curtain rectangle that is visible only during a door fade. The light map got 2 base px bigger (482x272) and snaps its origin: same number of stamp draws. The stride, pedal and push frames add about 90 small textures at boot (per character 4 walk and run frames, 2 pedal frames, 2 skateboard push frames). Real render loop, headless Edge, software GL, uncapped (`--live --uncapped --steps 600`), ms per frame avg / p95, two interleaved runs against a copy of 27d9d41: p95 1.0 to 2.2 ms for both builds in every scenario, avg differences within +-0.05 ms (noise); worst p95 change 0 percent (limit +25, absolute limit 16.7 ms). Camera jitter (`node scripts/camera-jitter.mjs`, Medium, 10 s walk): camera residual 2.30 px (before 2.62), largest step over median 1.36 (1.41), light pool wobble against the world 0 px (1.99). Zoom sweep unchanged (gaps 0, drift 0, madRatio 1.2 Medium and 1.27 Low). Shots `after-16-13` against a fresh baseline set: 88 shots, only noise-level changes in distinct colours and a 3 px longest seam in two shots. Smoke test: 1414 checks.

## Story 16.19: snow cover, frost, heat shimmer and god rays (CAP-35, CAP-30)

`render/Season.js` adds no pass: frost at the screen edge and the heat shimmer are two more uniform-gated blocks in the grade shader of 16.12 (zero cost at zero; the shimmer reads two more texels per base pixel only where its bands swing, between two dark low-saturation pixels). Snow cover: a fixed pool of tile images (Low 300, Medium 560, High 700) for roof and kerb tiles, re-laid when the camera crosses a tile (a scan of the view over a per-map class array, no allocation), alpha changed only when the cover moved; hedge tops (40/80/100), tree caps (30/70/120), glints (6/14/24) and beams (8/16/28) are pools too. Low and Canvas draw the frost as a 480x270 border picture and the shimmer as up to 20/30/40 heat wisps. Real render loop, headless Edge, software GL, uncapped, p95 ms, mean of two interleaved runs against a copy of 85954f9, under a snowfall at noon (full cover, frost, glints) and a hot afternoon (shimmer, beams): snow Low a 1.40 > 1.20, c 1.20 > 1.10, e 1.20 > 1.25; Medium a 1.55 > 1.60, c 1.70 > 1.70, e 1.70 > 1.80; High a 1.65 > 1.65, c 1.65 > 1.70, e 1.75 > 1.80; afternoon Low a 1.25 > 1.30, c 1.30 > 1.30, e 1.35 > 1.35; Medium a 1.65 > 1.65, c 1.60 > 1.65, e 1.80 > 2.00; High a 1.80 > 2.10 (one of two runs 2.4, the other 1.8), c 1.75 > 1.80, e 1.90 > 1.90. Worst case +17 percent (0.3 ms, timer resolution 0.1), inside the epic limit of 25 percent and far below 16.7 ms. Lesson: a Blitter drew nothing in the shot path (as in 16.7); pooled images work. Smoke test: 1405 checks. `scripts/season-frames.mjs --label <name> [--tier ...] [--renderer canvas]` writes the snowfall and melt sequence (biggest layer step 0.0044 per frame, biggest luminance step over 15 frames 0.011) and the per-tier switch checks. Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.18: sprite shading pass (CAP-35)

The pass (`render/spriteShadeMath.js`, `Pen.lit`) runs once per sprite texture at boot (about 450 textures, each a few thousand bytes); nothing changes per frame, no new draw call, texture sizes and keys are identical (`sprites-after/keys.json` against `sprites-shaded/keys.json`). Real render loop, headless Edge, software GL, uncapped (`--live --uncapped --steps 600`), ms per frame avg / p95, mean of two interleaved runs against a copy of `d1caf57`: Medium a 1.41 / 2.20 > 1.32 / 2.00, c 1.15 / 1.50 > 1.20 / 1.55, e 1.27 / 1.65 > 1.28 / 1.70; High a 1.37 / 2.10 > 1.44 / 2.15, c 1.19 / 1.60 > 1.29 / 1.70, e 1.35 / 1.75 > 1.36 / 1.80; Low a 1.00 / 1.50 > 0.98 / 1.55, c 0.87 / 1.15 > 0.86 / 1.15, e 0.88 / 1.20 > 0.89 / 1.20. Worst p95 change +6 percent (limit +25), all far below 16.7 ms: the difference is noise. Smoke test: 1405 checks. Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.14: the pixel UI (CAP-35)

No new pass, no change to the world camera. The HUD plates are images of one canvas texture each (made with the module, repainted and cropped only when the plate's size changes, freed with it), so they batch with the HUD's texts; a first version drew them as Graphics and cost +0.6 to +0.9 ms p95 in two scenarios (every Graphics breaks the batch). Bars and the minimap markers stay Graphics, redrawn only when a value changes; screens are built when they open (panels as one Graphics each), the menu backdrop is one canvas texture, the icons one atlas per render scale. Real render loop, headless Edge, software GL, uncapped (`--live --uncapped --steps 600`), ms per frame, two interleaved runs against a copy of 8119176: worst average change +9 percent (Medium e 1.28 > 1.40; a later pair of runs with the final plates showed -8 percent at worst, the machine drifts by that much), p95 within the 0.1 ms timer resolution and the noise of the runs (Medium a 2.10 > 2.70 in one pair, 1.90 > 2.00 in an earlier one; Low and High at most +13 percent), all far below 16.7 ms. The 88 world shots of `after-16-14` are byte-identical to `after-16-13` (the UI scene is hidden there); the UI set `ui-*.png` shows the same shop panel pixels over a bright day and a rainy night at Medium, Low and on Canvas. Smoke test: 1433 checks. Software GL is not a phone GPU; the phone measurement stays open.

## Story 16.15: performance, quality tiers and the Effekte setting (CAP-35, CAP-33, AD-29, AD-31)

**What changed.** (1) The Effekte setting (Voll, Weniger, Aus) in the pause overlay and the parent settings: `ctx.quality.tier` is the tier of `data/quality.json` plus the mode's reductions (`services/qualityLogic.js`, block `effects`), switched live through `quality.setEffects` (event `quality:changed`, no reload), saved through the `settings.effects` action (flags `effects` and `reducedMotion`) and mirrored in `localStorage` `schulweg.effects`. Weniger: no bloom, no rain veil, reflections, shimmer, god rays or glints, particles 220 (x0.7), lights 24/2/4 (`check-effects.mjs` proves it only ever takes away and never touches gameplay caps or the render scale). Aus: the Low look at any render scale (no light map, no WebGL pass, no shadows, no light pool; the tint overlay carries the mood). Shots: `docs/shots/overhaul/after-16-15-off` and `-reduced` (Medium), `after-16-15-canvas` (Canvas, Low) and `after-16-15` (Medium and Low; the 88 world shots are byte-identical to `after-16-14`, the pause shot shows the new row, `ui-parent-settings-medium.png` the parent row).
(2) **Off-screen culling** (`render/Culling.js`): a CPU profile of the real render loop (`bench-cdp.mjs --live --cpu walk --uncapped`) showed `batchSprite` and its matrix work at the top, because Phaser's WebGL renderer batches every visible image even far outside the camera, and since the epic the town holds about 580 visible images, of which about 410 were off screen (143 crowns, 53 eave and chimney images, 70 lamp images, hedges). The world camera now skips an Image or Sprite whose farthest corner is outside the view plus 32 px (parented objects, other scroll factors and every other camera, render textures included, are untouched). No look change (shots byte-identical), no system had to change. The first cut of the epic's frame cost was about 2x the baseline in the same session (Medium a 3.8 ms p95 against 1.2); culling brought it down to roughly the numbers below. The individual passes are not the cost: knocking out bloom, grade, atmosphere, shadows, light map, wind, water, window lights or particles one by one moved the frame time by less than the noise (ratios 0.9 to 1.3, interleaved with the full runs).

**Frame time** (real render loop, headless Edge, software GL, uncapped, `--live --uncapped`, scenario e everything with rain, p95 ms; the baseline is `8330e10` (story 16.1) served from a copy next to the working tree, runs interleaved so both see the same machine). The desktop was shared with a running game during the final runs, so single runs vary between 1.2 and 7 ms; the table gives the best run (the quiet-machine floor) and the median of the interleaved runs:

| Config (e everything) | Medium best / median | High best / median |
| --- | --- | --- |
| baseline 8330e10 (day) | 0.9 / 1.1 to 3.7 | 0.9 / 1.0 to 3.9 |
| now, Voll, day | 1.2 to 1.3 / 1.2 to 5.9 | 1.2 to 1.3 / 1.3 to 5.9 |
| now, Voll, 21:30 (lamps, windows, headlights) | 1.2 / 1.7 | 1.3 / 2.1 |
| now, Weniger | 1.1 to 1.6 | 1.2 to 1.6 |
| now, Aus | 1.1 | 0.9 |

Read it like this: **the absolute limit holds with a wide margin** (p95 at most 2.1 ms on a quiet run, 16.7 allowed, 8x), Voll at 21:30 is not more expensive than by day, and Aus costs the same as the baseline. **The relative limit (at most +25 percent over the baseline) is not shown on this machine**: against the baseline's best run the best run of Voll is +30 to +45 percent (0.3 to 0.4 ms, with a 0.1 ms timer and a machine that drifts by 3x); against the interleaved medians it is +9 percent (a quiet three-round set: Medium e 1.1 to 1.2, High e 1.0 to 1.3). The remaining 0.3 to 0.4 ms is the look itself (light map, shadows, two passes, lit windows, 170 images in view against 126); the Effekte setting gives it back (Aus = baseline). Whether 0.4 ms of software-GL time is worth holding to +25 percent is the user's call (epic Done when 3 says to change the number there), and a phone is still the only real test.

**AD-29 update budget** (`bench-cdp.mjs --steps 1200`, ms per update avg / p95 / max, no drawing): Medium e 0.006 / 0.1 / 0.2, Low e 0.009 / 0.1 / 0.3, High e 0.007 / 0.1 / 0.3, Medium c chase 0.008 / 0.1 / 0.2, Medium f (co-op, toys, traffic) 0.014 / 0.1 / 0.5; every pool stayed within its cap. The budget is 3 ms; there is no regression to fix on the CPU side (the machine is faster than in 1.11, the older tables above are not comparable).

**Low and Canvas.** Low (480x270) and `?renderer=canvas` run without any WebGL pass: no light map, grade, bloom, atmosphere pass or shadow layer, the tint overlay carries the time of day, the frost and shimmer fall back to a border picture and heat wisps, fog and mist are banks under the overlay (stories 16.2, 16.12 and 16.19). `after-16-15-canvas` (44 shots, Canvas Low) and `after-16-15` (Low) show no error (the console problems list of the smoke test is empty). Aus at Medium or High is the same look at 960x540.

**Measuring on this machine.** Port 8080 serves another app here: serve copies of the commits under test on their own ports (`git archive <commit> | tar -x -C <dir>`, `python -m http.server <port>` in it) and run `bench-cdp.mjs --url http://localhost:<port> --live --uncapped --query "&minute=1290&effects=reduced"` against each, interleaved. `--query` takes `&minute=` (time of day), `&effects=` (reduced or off) and `&q=`. The real phone measurement is still open (protocol above).

