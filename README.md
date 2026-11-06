# Schulweg (prototype)

Retro top-down browser game prototype: a kid walks, rides and sneaks to school through a small town.
Phaser 3.90.0 (from jsDelivr, includes Matter.js), native ES modules, no build step.

## Run (Windows PowerShell)

The game must be served over HTTP; `file://` breaks ES modules.

```powershell
cd C:\docs\projekte\grand-theft-study
npx serve .
# or
python -m http.server 8080
```

Open the printed URL (`http://localhost:3000` or `http://localhost:8080`). Add `?debug` to the URL for physics outlines.
For a phone on the same network, open the LAN URL of the PC (the firewall may prompt).

## Controls

All devices produce the same intent snapshot (`ctx.input.intent`); `ctx.input.type` is `keyboard`, `touch` or `gamepad` (whichever was used last) so prompts can adapt.

| Action | Keyboard / mouse | Touch | Gamepad |
| --- | --- | --- | --- |
| Walk | WASD / arrows | joystick (left half) | left stick or d-pad |
| Jump (rings the bell on the bike) | Space | big button | A |
| Sprint | Shift | double-chevron button | B |
| Interact (mount / dismount bike) | F | circle button | Y |
| Tool use / aim | left click, aim at the cursor | tool button, drag from it to aim | X or RT, right stick aims |
| Next / previous tool | E / Q | small triangle button | RB / LB |
| Map | M | - | Back |
| Weather (clear / rain) | T | - | - |
| Pause | Esc | pause button (top right) | Start |

Touch controls appear on touch devices and hide as soon as a key or mouse is used. In portrait on a touch device a rotate hint covers the game and input is ignored.
The 480x270 picture is scaled by a whole number (letterboxed, pixelated); only windows smaller than 480x270 get a fractional fit.
An FPS counter shows at the top left.

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
- Quality: tiers are in `data/quality.json` (particle and prop caps, bullies, NPCs, rain density, pool sizes, shadows; Medium is the AD-14 budget). The choice is saved in `schulweg.quality`; desktop starts on High, phones (coarse pointer or small screen) on Medium. `?q=low|medium|high` overrides it for one load. Changing it emits `quality:changed`; pooled effects (skid marks, smoke, bell rings) change their active cap without allocating.
- `?debug` also shows the current tier and live/cap counts of every pool under the HUD.
- `node scripts/check-i18n.mjs` checks that both language files have identical keys and no empty values, and that every `t('...')` key used in the source exists.

## Living world

- **Wind** (`physics/Wind.js`, tuned in `data/weather.json`): `ctx.wind.vector` is the single wind state, a gust pattern that changes slowly. Each consumer applies it itself: leaves, rain and steam through emitter gravity, light props (`windAccel` in `data/props.json`, scaled by mass) through a small force, and the flags near the school and in the park, which droop in a breeze and stream and ripple in a gust. With `?debug` a wind arrow shows at the lower left and the wind vector and weather state in the debug text.
- **Weather** (`physics/Weather.js`): press **T** to toggle clear / rain (the `weather` intent; no touch button yet). Rain fades in a darker tint, drops fall across the view slanted by the wind with small splash rings, and dry roads turn into puddles (via the surfaces override API, only used by weather); they dry out again when it stops. Emits `weather:changed`.
- **Particles** (`particles/ParticleHub.js`, `data/particles.json`): a few shared emitters created once, fired with `ctx.particles.emit(name, x, y, opts)`: `dust` (sprinting, bike drifting), `splash` + `ripple` (moving through puddles), `leaves` (kicked up on grass, plus an ambient swirl), `rain`, `steam` (bakery, manhole and a chimney) and `debris`. The effect under you comes from the surface's `particle` name in `data/surfaces.json`. Each emitter gets a share of the tier's `maxParticles`; burst sizes follow `particleMul` and rain follows `rainDensity`, re-read on `quality:changed`. Fish occasionally ripple the pond.
- **Props** (`entities/Prop.js`, `data/props.json`): cones, cans, crates and balls from the map markers are Matter bodies in the `PROP` category. Walk or ride into them to push them; cones tip over on a hard hit, cans roll, the ball bounces far, a crate breaks into debris when hit fast (about sprint speed or more). Strong hits emit `prop:hit` with `{ prop, speed }`. Props away from the camera sleep and are not drawn; at most the tier's `maxProps` are awake.

## Chase (Ärger, bullies)

- **Ärger level 0-2** (`ai/ChaseDirector.js`, rules in `ai/ChaseLevel.js`, tuning in `data/chase.json`): the director is the only writer of the level and the only spawner of bullies. Entering bully turf (skatepark, back of the schoolyard) raises it to 1 and spawns a foot bully at the nearest `bully-spawn` point outside the camera view; staying in turf (`turfSecondsPerLevel`) or a bump (`bully:bump`, also a near-miss with a bully that is not chasing) raises it to 2, which adds a bike bully and a second foot bully (never more than the tier's `maxBullies`). Emits `chase:level` `{ level, reason }` and `chase:seen`. `chaseEnabled: false` in `data/chase.json` keeps the level at 0 (hook for a parent setting).
- **Service for later stories** (`ctx.chase`): `level`, `seen` (some bully sees the player), `cool(seconds)` (level falls to 0 after that long and the bullies give up), `reset()` (level 0, bullies removed at once). Contact with a bully emits `bully:caught-contact` `{ bully }` and freezes it in `CAUGHT`; the caught frame itself is story 1.9.
- **Bully states** (`ai/BullyFSM.js`): `IDLE` (short beat after spawn), `CHASE`, `SEARCH` (walk to the last seen spot, look around), `DISTRACTED` (a `prop:hit` within `distractRadius` makes a bully that is not watching the player walk to the hit point), `GIVE_UP` (walks to the farthest spawn point and vanishes out of view; when the last bully is gone the level drops to 0), `CAUGHT`. Bullies use the movement profiles `bully-foot` (a bit slower than sprinting) and `bully-bike` in `data/vehicles.json`, and are pooled (`entities/Bully.js`, pool `bullies`). Their bodies do not collide with the player; contact is a proximity check.
- **Seeing** (`ai/Perception.js`): view distance and field of view from `data/chase.json`, grid raycast against solid tiles. Standing almost still (below `hideSpeed`) inside a hiding spot makes you invisible, and a hidden player is not caught or bumped.
- **Pathfinding** (`ai/Pathfinding.js`): grid A* over the map (walls blocked, surface speed and wall proximity as cost), requests queued with a shared budget of 2 per frame, per-bully cached path re-requested about every 0.5 s or when the target tile changes, straight-line steering when the way is clear. A full-map search takes about 0.25 ms in node.
- **HUD and debug**: top right an Ärger meter (two bars) and "Entdeckt!" / "Spotted!" while seen; angry steam puffs over chasing bullies (`anger` emitter). `?debug` shows each bully's state, path, line-of-sight ray and bump radius plus the level in the debug text.
- `node scripts/check-chase.mjs` checks pathfinding on the real map (home to school, walls, request budget, timing) and the level thresholds.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `main.js` | Entry point, Phaser config (480x270, pixel art, Matter with zero gravity) |
| `scenes/` | Boot (load + procedural textures), Menu, Game (owns `ctx`), UI (overlay HUD) |
| `entities/` | Player, bikes (+ skid, smoke, bell effects), `pools.js` (pool registry, fade pool), `Prop.js`, `Flag.js` and later bully, NPC |
| `vehicles/` | `MovementController.js`: drives any actor from a profile in `data/vehicles.json` |
| `tools/` | Slingshot and other tools |
| `ai/` | Chase director and level rules, bully state machine, perception, pathfinding |
| `physics/` | `categories.js`, `bodies.js` (only place that creates bodies), surfaces service (with weather overrides), `Wind.js`, `Weather.js` |
| `particles/` | `ParticleHub.js`: pooled emitters, surface effects, rain, ambient life |
| `learning/`, `minigames/`, `missions/` | Empty in the prototype |
| `services/` | `quality.js`: active quality tier, persistence, `quality:changed` |
| `i18n/` | `de.json`, `en.json`, `i18n.js` (`ctx.t`) |
| `data/` | Tuning JSON, `maps/town.json` (ASCII grid, objects in tile coordinates) |
| `ui/` | `input.js` (intent snapshot), HUD |
| `scripts/` | Dev scripts |

Design rules live in `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/`.
