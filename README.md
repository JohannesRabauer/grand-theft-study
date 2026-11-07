# Schulweg (prototype)

Retro top-down browser game prototype: a kid walks, rides and sneaks to school through a small town.
Phaser 3.90.0 (from jsDelivr, includes Matter.js), native ES modules, no build step.

**Status: the full prototype (stories 1.1 to 1.11) is built.** Not yet verified: the 60 FPS target on a real phone (only desktop CPU cost was measured, see [docs/PERFORMANCE.md](docs/PERFORMANCE.md) for numbers and the manual phone test).

## Run (Windows PowerShell)

The game must be served over HTTP; `file://` breaks ES modules.

```powershell
cd C:\docs\projekte\grand-theft-study
npx serve .
# or
python -m http.server 8080
```

Open the printed URL (`http://localhost:3000` or `http://localhost:8080`). URL flags: `?debug` (FPS, physics outlines, pool counters, bully paths), `?q=low|medium|high` (quality for this load), `?bench` (stepping benchmark and smoke test, see below). For a phone on the same network see the protocol in docs/PERFORMANCE.md.

## Features

- Walk (sprint with stamina), ride a bike (slides, skid marks, bell), surfaces that change speed and grip (asphalt, cobble, grass, puddles).
- A 96x64 tile town with two routes from home to the school, an objective arrow with distance, zoom that follows speed.
- Living world: wind, rain with puddles (T), particles, pushable props, flags.
- Chase: the skatepark and the back of the schoolyard are bully turf; bullies see, chase, search and give up (levels 0 to 2, A* pathfinding). Hide in hedges, dumpsters and phone booths to escape; if you are caught a comic frame shows, you lose a euro and respawn at home.
- Slingshot with wind-bent aim; pebbles only affect objects (cans, crates, trash cans), never people or animals. Hits lure bullies.
- Menu and pause overlay with language (Deutsch / English) and quality (Low / Medium / High); touch controls, gamepad and keyboard.

## Controls

All devices produce the same intent snapshot (`ctx.input.intent`); `ctx.input.type` is `keyboard`, `touch` or `gamepad` (whichever was used last) so prompts can adapt.

| Action | Keyboard / mouse | Touch | Gamepad |
| --- | --- | --- | --- |
| Walk | WASD / arrows | joystick (left half) | left stick or d-pad |
| Jump (rings the bell on the bike) | Space | big button | A |
| Sprint | Shift | double-chevron button | B |
| Interact (mount / dismount bike) | F | circle button | Y |
| Tool use / aim (hold to charge, release to fire) | left click, aim at the cursor | tool button, drag from it to aim | X or RT, right stick aims |
| Next / previous tool | E / Q | small triangle button | RB / LB |
| Map | M | - | Back |
| Weather (clear / rain) | T | - | - |
| Pause | Esc | pause button (top right) | Start |

Touch controls appear on touch devices and hide as soon as a key or mouse is used. In portrait on a touch device a rotate hint covers the game and input is ignored.
Resolution (AD-14): Medium and High render at 960x540, Low at 480x270. The picture is scaled by a whole number of device pixels (letterboxed, pixelated, so a 1920x1080 window shows 960x540 at 2x); only windows smaller than the render size get a fractional fit.
An FPS counter shows at the top left.

## Known limitations

- Placeholder procedural art, no audio, no saves (only language and quality are remembered), no school scene: arriving only shows a banner.
- Phone performance is unmeasured on real hardware (desktop proxy only); the reference phone is not chosen.
- Touch has no weather or map button; the map key does nothing yet.
- Bullies, props and the slingshot are tuned by feel, not playtested with children.
- Physics is fixed at 60 Hz steps; on screens above 60 Hz the picture is not interpolated.

## Check scripts and benchmark

```powershell
node scripts/check-all.mjs        # runs the four checks below, exits non-zero on failure
node scripts/check-collisions.mjs # collision category table
node scripts/check-i18n.mjs       # DE/EN keys identical, every t('...') key exists
node scripts/check-map.mjs        # town map shape, objects, two routes to school
node scripts/check-chase.mjs      # pathfinding, level rules, escape rules
node scripts/bench-cdp.mjs --url http://localhost:8080          # CPU cost per update, all scenarios and tiers (headless Edge/Chrome)
node scripts/bench-cdp.mjs --url http://localhost:8080 --smoke  # scripted whole-game smoke test
```

`index.html?bench` loads `scripts/bench.js` and `window.SCHULWEG_BENCH` (`runAll()`, `live()`, `smoke()`); details in docs/PERFORMANCE.md.

## Movement and surfaces

Walking is the movement profile `foot` (`data/vehicles.json`). Hold Sprint to run faster; stamina (bar at the top left) drains while sprinting and refills when you stop. When it hits zero you move slower until it recovers to 25%. Stopping and turning slide a little, more on slippery ground. The label under the bar shows the ground you stand on; asphalt, cobblestone, grass and puddles change speed and grip (`data/surfaces.json`, which also defines unused snow and ice).
`node scripts/check-collisions.mjs` checks the collision category table.

## Bicycle

A bike is parked near the start. Walk up to it and press F to mount; press F again to get off (the bike stays where you left it). The `bike` profile in `data/vehicles.json` is much faster than walking on asphalt, slower on grass and cobblestones, has less grip, slides in hard turns and on puddles, and leaves fading skid marks and smoke when it skids or brakes hard. Space rings the bell (a ring appears and `bike:bell` is emitted on `ctx.events`). The camera zooms out smoothly with speed (1.0 standing to 0.6 at top speed, `data/camera.json`); the HUD shows the current vehicle. More bikes can be placed with `{ "type": "bike", "x", "y" }` objects in the map.

## The town

`data/maps/town.json` is a 96x64 tile town (16 px tiles): a main road with a bike lane, a park with a canal, pond and bridge, an old town with cobbled alleys, a skatepark, and the school with a fenced yard. Walking from home to the school takes about 30 seconds by either of two routes: along the main road, or through the park and over the canal bridge into the old town. The yellow arrow around the player points to the school and shows the distance in meters (`metersPerTile` in the map); arriving emits `goal:reached` and shows a short message. Legend chars map to surface ids; surfaces with `"solid": true` in `data/surfaces.json` (walls, water, trees, fences, hedges, dumpsters, phone booths) become static bodies. Map objects: `spawn`, `goal`, `bike`, `hiding` (hedge, dumpster, phone-booth sensor zones), `turf` (skatepark, schoolyard-back sensor zones), `bully-spawn`, and `prop` markers (cone, can, crate, ball), `flag` and `ambient` (steam, chimney) spots. The player entering or leaving zones emits `hide:enter|leave` and `turf:enter|leave` on `ctx.events`. With `?debug`, hiding zones are outlined green, turf zones red and the goal yellow.

`node scripts/check-map.mjs` validates the map: grid shape, legend, objects (none inside walls), and that the school is reachable by two different, bike-friendly routes, even when the middle of either one is blocked.

## Menu, language and quality

The main menu has Start, a language toggle (Deutsch / English) and a quality selector (Low / Medium / High); use the mouse, touch, or arrow keys + Enter. Esc (or the pause button, or Start on a gamepad) opens the pause overlay in the game with Resume, the same two toggles, and Back to menu.

- Language: switches instantly (all HUD and menu text re-resolves on the `lang:changed` event) and is saved in `localStorage` key `schulweg.lang`. All visible text lives in `i18n/de.json` and `i18n/en.json` and is read with `ctx.t('key')`.
- Quality: tiers are in `data/quality.json` (particle and prop caps, bullies, NPCs, rain density, pool sizes, shadows; Medium is the AD-14 budget). The choice is saved in `schulweg.quality`; desktop starts on High, phones (coarse pointer or small screen) on Medium. `?q=low|medium|high` overrides it for one load. Switching between Medium and High applies live; switching to or from Low changes the render resolution (480x270 vs 960x540), which is fixed when the page loads, so the game shows "Neustart nötig ..." / "Restart needed ..." and reloads itself with the new tier saved. Changing it emits `quality:changed`; pooled effects (skid marks, smoke, bell rings) change their active cap without allocating.
- `?debug` also shows the current tier, render size, texture scale and zoom, and live/cap counts of every pool under the HUD.
- Render resolution: world units, physics and tuning data are the same on every tier. On Medium and High the canvas is 960x540, the world camera runs at base zoom 2 (the speed zoom 0.6-1.0 in `data/camera.json` multiplies it), all procedural textures are drawn on a 2x grid (`scenes/HiResArt.js`, shown at scale 0.5, with tile variants, facades with windows, outlined sprites) and the UI keeps its 480x270 layout through a zoomed UI camera with text rendered at 2x. Low keeps the 1x art from `BootScene` and zoom 1.
- `node scripts/check-i18n.mjs` checks that both language files have identical keys and no empty values, and that every `t('...')` key used in the source exists.

## Living world

- **Wind** (`physics/Wind.js`, tuned in `data/weather.json`): `ctx.wind.vector` is the single wind state, a gust pattern that changes slowly. Each consumer applies it itself: leaves, rain and steam through emitter gravity, light props (`windAccel` in `data/props.json`, scaled by mass) through a small force, and the flags near the school and in the park, which droop in a breeze and stream and ripple in a gust. With `?debug` a wind arrow shows at the lower left and the wind vector and weather state in the debug text.
- **Weather** (`physics/Weather.js`): press **T** to toggle clear / rain (the `weather` intent; no touch button yet). Rain fades in a darker tint, drops fall across the view slanted by the wind with small splash rings, and dry roads turn into puddles (via the surfaces override API, only used by weather); they dry out again when it stops. Emits `weather:changed`.
- **Particles** (`particles/ParticleHub.js`, `data/particles.json`): a few shared emitters created once, fired with `ctx.particles.emit(name, x, y, opts)`: `dust` (sprinting, bike drifting), `splash` + `ripple` (moving through puddles), `leaves` (kicked up on grass, plus an ambient swirl), `rain`, `steam` (bakery, manhole and a chimney) and `debris`. The effect under you comes from the surface's `particle` name in `data/surfaces.json`. Each emitter gets a share of the tier's `maxParticles`; burst sizes follow `particleMul` and rain follows `rainDensity`, re-read on `quality:changed`. Fish occasionally ripple the pond.
- **Props** (`entities/Prop.js`, `data/props.json`): cones, cans, crates and balls from the map markers are Matter bodies in the `PROP` category. Walk or ride into them to push them; cones tip over on a hard hit, cans roll, the ball bounces far, a crate breaks into debris when hit fast (about sprint speed or more). Strong hits emit `prop:hit` with `{ prop, speed }`. Props away from the camera sleep and are not drawn; at most the tier's `maxProps` are awake.

## Chase (Ärger, bullies)

- **Ärger level 0-2** (`ai/ChaseDirector.js`, rules in `ai/ChaseLevel.js`, tuning in `data/chase.json`): the director is the only writer of the level and the only spawner of bullies. Entering bully turf (skatepark, back of the schoolyard) raises it to 1 and spawns a foot bully at the nearest `bully-spawn` point outside the camera view; staying in turf (`turfSecondsPerLevel`) or a bump (`bully:bump`, also a near-miss with a bully that is not chasing) raises it to 2, which adds a bike bully and a second foot bully (never more than the tier's `maxBullies`). Emits `chase:level` `{ level, reason }` and `chase:seen`. `chaseEnabled: false` in `data/chase.json` keeps the level at 0 (hook for a parent setting).
- **Service for later stories** (`ctx.chase`): `level`, `seen` (some bully sees the player), `cool(seconds)` (level falls to 0 after that long and the bullies give up), `reset()` (level 0, bullies removed at once). Contact with a bully emits `bully:caught-contact` `{ bully }` and freezes it in `CAUGHT`. The caught flow is below.
- **Bully states** (`ai/BullyFSM.js`): `IDLE` (short beat after spawn), `CHASE`, `SEARCH` (walk to the last seen spot, look around), `DISTRACTED` (a `prop:hit` within `distractRadius` makes a bully that is not watching the player walk to the hit point), `GIVE_UP` (walks to the farthest spawn point and vanishes out of view; when the last bully is gone the level drops to 0), `CAUGHT`. Bullies use the movement profiles `bully-foot` (a bit slower than sprinting) and `bully-bike` in `data/vehicles.json`, and are pooled (`entities/Bully.js`, pool `bullies`). Their bodies do not collide with the player; contact is a proximity check.
- **Seeing** (`ai/Perception.js`): view distance and field of view from `data/chase.json`, grid raycast against solid tiles. Standing almost still (below `hideSpeed`) inside a hiding spot makes you invisible, and a hidden player is not caught or bumped.
- **Pathfinding** (`ai/Pathfinding.js`): grid A* over the map (walls blocked, surface speed and wall proximity as cost), requests queued with a shared budget of 2 per frame, per-bully cached path re-requested about every 0.5 s or when the target tile changes, straight-line steering when the way is clear. A full-map search takes about 0.25 ms in node.
- **HUD and debug**: top right an Ärger meter (two bars) and "Entdeckt!" / "Spotted!" while seen; angry steam puffs over chasing bullies (`anger` emitter). `?debug` shows each bully's state, path, line-of-sight ray and bump radius plus the level in the debug text.
- **Escaping** (`ai/Escape.js`, `escape` in `data/chase.json`): stand still in a hiding spot, unseen and with no bully within `stumbleRadius`, for `hideSeconds` and the level drops to 0 (bullies walk off and return to the pool). Being seen, moving, leaving the spot or a bully stumbling close resets the timer and the level stays. Staying farther than `farDistance` from every bully and out of sight for `farSeconds` also cools the level down. While hidden the player sprite turns translucent and green, leaves rustle, the HUD shows "Versteckt!" / "Hidden!" and, during a chase, a bar under the Ärger meter fills until the level drops. Still only the director writes the level.
- **Caught** (`entities/Caught.js`, `ui/CaughtFrame.js`, `caught` in `data/chase.json`): `bully:caught-contact` freezes the world (`ctx.frozen`; UIScene keeps running), takes `loss` (1.00) from `ctx.state.money` (starts at 5.00, shown top left as "€ 5,00"), resets the chase and shows a comic frame (halftone panel, locker with the player inside, the bully with the lunchbox, a random one of three speech-bubble lines per language). After 2.5 s, or Space/F (A/Y on a gamepad, jump button on touch) once 0.8 s have passed, the player is dismounted (the bike stays where it was), put back at home with a dust puff, and the chase can start again at the next turf entry. Emits `player:caught` `{ lost, money }`, `money:changed` and `player:respawn` `{ x, y }`.
- Reaching the school (`goal:reached`) shows the arrival banner for a few seconds; the game keeps running (prototype, no school scene).
- `node scripts/check-chase.mjs` checks pathfinding on the real map (home to school, walls, request budget, timing), the level thresholds and the hide / distance escape rules.

## Slingshot

Hold the left mouse button (touch: hold the tool button and drag from it to aim; gamepad: X or RT, right stick aims) to charge for about 0.8 s, release to shoot. Aim at the cursor; without a pointer the shot goes the way you last walked. While charging, a rubber band and power ring show at the player, a dotted line shows the flight, and a wind arrow with strength shows at the bottom of the screen; the dots bend with the wind exactly like the pebble (`flightPoint` in `tools/Slingshot.js`). **Q / E** cycle tools (`ToolBelt`, only the slingshot exists so far). The HUD shows the tool and its ammo.

- Pebbles are pooled sensor bodies in the `PROJECTILE` category (they collide only with `PROP` and `STATIC`): they pass through people, bullies and animals, and through fences. A hit pushes the prop (`knock` in `data/props.json`), crates take 3 hits, a spark puff shows, and `prop:hit` is emitted with the hit position (trash cans use `hitRadius` 260, cans 100, others the bully default), so bullies that are not watching you go to look (`DISTRACTED`).
- Targets: 3 tin cans on the skatepark fence (map props with `"perch": true`, static until hit) and a trash can nearby.
- Ammo: start with 5, magazine cap 12 (`data/tool.json`). Pebbles, chestnuts and acorns lie around (`ammo` map objects); walk over one to pick it up, it reappears after 40 s. The aim-dot count scales with the quality tier (`aimDots`).
- `node scripts/check-collisions.mjs` asserts that projectiles never collide with player, bully, NPC or animal masks.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `main.js` | Entry point, Phaser config (960x540, or 480x270 on Low; pixel art, Matter with zero gravity) |
| `scenes/` | Boot (load + 1x procedural textures), `HiResArt.js` (2x textures), Menu, Game (owns `ctx`), UI (overlay HUD) |
| `entities/` | Player, caught/respawn flow (`Caught.js`), bikes (+ skid, smoke, bell effects), `pools.js` (pool registry, fade pool), `Prop.js`, `Flag.js` and later bully, NPC |
| `vehicles/` | `MovementController.js`: drives any actor from a profile in `data/vehicles.json` |
| `tools/` | Slingshot and other tools |
| `ai/` | Chase director and level rules, bully state machine, perception, pathfinding |
| `physics/` | `categories.js`, `bodies.js` (only place that creates bodies), surfaces service (with weather overrides), `Wind.js`, `Weather.js`, `WallStreamer.js` (keeps only walls near moving things in the Matter world) |
| `particles/` | `ParticleHub.js`: pooled emitters, surface effects, rain, ambient life |
| `learning/`, `minigames/`, `missions/` | Empty in the prototype |
| `services/` | `quality.js`: active quality tier, render resolution class, persistence, `quality:changed`, `quality:restart` |
| `i18n/` | `de.json`, `en.json`, `i18n.js` (`ctx.t`) |
| `data/` | Tuning JSON, `maps/town.json` (ASCII grid, objects in tile coordinates) |
| `ui/` | `input.js` (intent snapshot), HUD, `scaling.js` (integer scaling), `uiKit.js` (UI camera, crisp text) |
| `scripts/` | `check-*.mjs` and `check-all.mjs`, `bench.js` / `smoke.js` (loaded by `?bench`), `bench-cdp.mjs` (headless runner) |
| `docs/` | `PERFORMANCE.md`: benchmark results, optimizations, manual phone test |

Design rules live in `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/`.
