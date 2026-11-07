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

Every player has an intent snapshot, `ctx.input.intents[i]`; all devices produce the same one (`ctx.input.intent` aliases `intents[0]`); `ctx.input.type` is `keyboard`, `touch` or `gamepad` (whichever was used last) so prompts can adapt.

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

**Two players** (AD-18; the number of active players is `ctx.players.length`; the game starts with one, or with two in co-op, see below; `SCHULWEG_GAME.addPlayer()` with `?debug` adds a second to a running one-player game). Bindings live in `data/input.json` (KeyboardEvent codes); with a single player the arrow keys and Right Shift also steer P1, so one-player controls are unchanged.

| Action | P1 | P2 |
| --- | --- | --- |
| Walk | WASD | arrow keys |
| Jump / bell | Space | Right Ctrl |
| Sprint | Left Shift | Right Shift |
| Interact | F | Enter |
| Previous / next tool | Q / E | `,` / `.` |
| Tool use / aim | left click at the cursor | Numpad0, aims the way P2 last moved (or with a gamepad right stick) |
| Map, weather, pause | M, T, Esc / Start | - (global intents come from P1 only) |

Gamepads bind to the next free player: with one player the first pad is P1; with two players the first pad drives P2 and the second drives P1. Touch controls always drive P1.

### Co-op (local, two players on one screen)

**Menu flow** (`ui/menuFlow.js`, Phaser-free): Play, slot, New game, then the mode screen "Allein / Solo" or "Zu zweit / Co-op" (with the control hint: P1 WASD + Space, P2 arrow keys or gamepad), then the character select for P1 and, in co-op, a second one for P2 (the same kid twice is fine). In co-op P1 steers the select with A/D + Space (or mouse/touch) and P2 with the arrow keys + Enter or its gamepad; alone, every key and any pad works. The picks are stored through the actions `coop.set` and `player.setCharacter` per player and saved at once, so Continue restores the mode and both characters; the pause menu shows them ("Zu zweit: Lena + Jonas"). On a touch-only device (finger primary, no gamepad) co-op is not offered and the mode screen says why.

**Gamepads**: a pad connected on the mode screen shows "press A to join", and A picks co-op. In game the pads follow `data/input.json`: with two players the first pad drives P2, a second pad drives P1. If a pad that drives a player disconnects, a toast ("Controller getrennt" / "Controller disconnected", `ui:toast` event, `ui/hud/ToastModule.js`) shows for three seconds; the player stays in the game and steers with its keyboard bindings (P2: arrow keys). Joining a running one-player game with a pad is not offered (with one player the pad drives P1); start a co-op game instead.

**Start vehicles**: every player starts on its character's `startVehicle` (Lena the bike); the skateboard and the skates fall back to walking until skating exists (`characters/Characters.js`). There are no start items yet.

The `coop` flag in `state.shared.flags` (action `coop.set { on }`) decides at game start: on, `GameScene` creates two players from `state.players[0..1]`, each with its own character look, attributes, tool belt and start vehicle, bound to `intents[0]` / `intents[1]`, standing 24 px apart at the spawn (`data/camera.json` `coop.spawnOffsets`). Switching it on creates player 2 as another character than P1. The menu sets it (see below); with `?debug`, `SCHULWEG_GAME.setCoop(true)` also restarts the run with two players (`setCoop(false)` back to one). `GameScene` also accepts a start config `{ players: [{ character, vehicle }] }` for tests.

- **Camera** (`camera/CameraRig.js`, maths in `camera/rigMath.js`): follows the midpoint (a pinned player, see below, counts 60 %) and zooms out to keep both players 48 / 40 UI px inside the view. The existing speed zoom still applies; the smaller of speed zoom and fit zoom wins, and the same critically damped spring and sub-pixel handling smooth it. One player: identical to before.
- **Tether** (`camera/tetherMath.js`, `data/camera.json` `tether`): max distance 480 world px (vertical counts times the 16:9 aspect), well inside the view at the smallest zoom (0.6). From half of it the player walking away is slowed smoothly down to a stop at the limit, the one walking towards the other gets up to 12 % extra speed, and past the limit a gentle pull (capped) brings both back. A player held by a caught frame or screen (`player.pinned`) never blocks the other: the free one keeps at least 25 % speed and is pulled gently. `ctx.coop` is `{ active, distance, tetherRatio }`.
- **HUD**: P1's status (stamina, ground, vehicle) and tool/ammo at the left, P2's mirrored at the right (below the shared Ärger meter), money, clock and Ärger once, no touch layout for P2. One shared objective arrow orbits the camera centre. Each player has a coloured ring under the feet (P1 cyan, P2 orange; `?debug` adds a P1/P2 tag) and a small edge chevron appears when one is far from the screen centre.

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
node scripts/check-all.mjs        # runs the checks below, exits non-zero on failure
node scripts/check-collisions.mjs # collision category table
node scripts/check-i18n.mjs       # DE/EN keys identical, every t('...') key exists
node scripts/check-content.mjs    # kid-safe text: blocklist lint of i18n and learning text, de/en parity (see docs/TESTING.md)
node scripts/check-map.mjs        # every map in data/maps/ against the object catalog (types, fields, walls, doors, reachability), plus the town's two routes to school
node scripts/check-world.mjs      # map logic without Phaser: catalog validation, door and entry resolution, reachability
node scripts/check-chase.mjs      # pathfinding, level rules, escape rules
node scripts/check-crowd.mjs      # crowd spawn rules, caps, reaction geometry
node scripts/check-state.mjs      # state store, actions, save slots, migrations
node scripts/check-day.mjs        # day clock: phases, events, autosave, restore, weather schedule, tint
node scripts/check-ui.mjs         # screen stack (top-only input, counted world freeze), HUD module list
node scripts/check-players.mjs    # players array helpers; fails on any remaining use of the deprecated ctx.player
node scripts/check-characters.mjs # characters data, attribute modifiers, growth hooks, bully weights, start vehicle fallback
node scripts/check-input.mjs      # P1/P2 key and gamepad bindings -> intents, edge and global intents
node scripts/check-coop.mjs       # co-op camera rig maths, tether, start players, coop.set, HUD slices
node scripts/check-menu.mjs       # new-game flow (modes, who picks what), menu keys and pads, start actions
node scripts/bench-cdp.mjs --url http://localhost:8080          # CPU cost per update, all scenarios and tiers (headless Edge/Chrome)
node scripts/bench-cdp.mjs --url http://localhost:8080 --smoke  # scripted whole-game smoke test
```

`index.html?bench` loads `scripts/bench.js` and `window.SCHULWEG_BENCH` (`runAll()`, `live()`, `smoke()`); details in docs/PERFORMANCE.md. How to run and extend the checks and smoke scenarios: docs/TESTING.md.

## Movement and surfaces

Walking is the movement profile `foot` (`data/vehicles.json`). Hold Sprint to run faster; stamina (bar at the top left) drains while sprinting and refills when you stop. When it hits zero you move slower until it recovers to 25%. Stopping and turning slide a little, more on slippery ground. The label under the bar shows the ground you stand on; asphalt, cobblestone, grass and puddles change speed and grip (`data/surfaces.json`, which also defines unused snow and ice).
`node scripts/check-collisions.mjs` checks the collision category table.

## Bicycle

A bike is parked near the start. Walk up to it and press F to mount; press F again to get off (the bike stays where you left it). The `bike` profile in `data/vehicles.json` is much faster than walking on asphalt, slower on grass and cobblestones, has less grip, slides in hard turns and on puddles, and leaves fading skid marks and smoke when it skids or brakes hard. Space rings the bell (a ring appears and `bike:bell` is emitted on `ctx.events`). The camera zooms out smoothly with speed (1.0 standing to 0.6 at top speed, `data/camera.json`); the HUD shows the current vehicle. More bikes can be placed with `{ "type": "bike", "x", "y" }` objects in the map.

## The town

`data/maps/town.json` is a 96x64 tile town (16 px tiles): a main road with a bike lane, a park with a canal, pond and bridge, an old town with cobbled alleys, a skatepark, and the school with a fenced yard. Walking from home to the school takes about 30 seconds by either of two routes: along the main road, or through the park and over the canal bridge into the old town. The yellow arrow around the player points to the school and shows the distance in meters (`metersPerTile` in the map); arriving emits `goal:reached` and shows a short message. Legend chars map to surface ids; surfaces with `"solid": true` in `data/surfaces.json` (walls, water, trees, fences, hedges, dumpsters, phone booths) become static bodies. Map objects: `spawn`, `goal`, `bike`, `hiding` (hedge, dumpster, phone-booth sensor zones), `turf` (skatepark, schoolyard-back sensor zones), `bully-spawn`, and `prop` markers (cone, can, crate, ball), `flag` and `ambient` (steam, chimney) spots. Each player entering or leaving zones emits `hide:enter|leave` and `turf:enter|leave` (`{ id, kind, player }`) on `ctx.events`; `goal:reached` is `{ id, player }`. Player events carry the player index: `player:surface` `{ player, id }`, `player:stamina` `{ player, value }`, `player:vehicle` `{ player, id }`, `tool:*` and `ammo:pickup` `{ player, ... }`. With `?debug`, hiding zones are outlined green, turf zones red and the goal yellow.

**Maps and interiors (AD-28).** Every map, interiors included, is one file in `data/maps/` (listed in `data/maps/index.json`; the town is map id `town`). `ctx.world.load(mapId, entryId)` is the only way to switch maps: it unloads everything map-specific (ground texture, wall bodies, zones, doors, props, pickups, bikes, flags, ambient emitters, pedestrians, bullies, puddles), builds the new map, moves every player to the entry (an `entry` or `spawn` object) with a quick fade-in and updates camera bounds, objective arrow, path grid and surfaces. Pools and players persist; a ridden bike travels along. It emits `world:leave` `{ map }` and `world:enter` `{ map, entry }`. A `door` object (`to`, `entry`, `label`, optional `auto`) emits `world:enter-request` when a player stands in it and presses interact (or, with `auto: true`, just touches it); the switch happens at the start of the next frame. Maps may set `"indoor": true` (no rain, no daylight tint). Systems that depend on the map register with `ctx.world.register(system)` and implement `loadMap()` / `unloadMap()`. `data/object-types.json` lists every object type with fields, required flags and wall rules (door, entry, rail, ramp, stairs, bench, dojo, shop, bakery, pfand-machine, bike-rack, tram-stop, sign, mission-trigger, grab-target, home-spot, school-spot are defined for later stories). `test-room` and the town's `door-test` are flagged `debug` and exist only with `?debug` or `?bench`: stand on the doormat next to the house at the start and press F.

`node scripts/check-map.mjs` validates the maps: grid shape, legend, objects (none inside walls), and that the school is reachable by two different, bike-friendly routes, even when the middle of either one is blocked.

## Menu, language and quality

The main menu has Play (opens the save slot screen), a language toggle (Deutsch / English) and a quality selector (Low / Medium / High); use the mouse, touch, or arrow keys + Enter. Esc (or the pause button, or Start on a gamepad) opens the pause overlay in the game with Resume, the same two toggles, and Back to menu; it shows the active slot and the mode with the characters. A new game asks Solo or Co-op first (see Co-op).

Save slot screen: three slots with a summary line (player(s), level, day, money). Per slot: New game (asks before overwriting an occupied slot), Continue, Delete (asks too); Esc or Back goes one screen up. Starting or continuing a slot binds it as the active slot, so autosave on `phase:ended` writes to it. An unreadable save is copied to `.bak` when the screen opens and shown as empty with a note. New game continues to the character select (below); day phase/playtime in the summary come with later stories.

- Language: switches instantly (all HUD and menu text re-resolves on the `lang:changed` event) and is saved in `localStorage` key `schulweg.lang`. All visible text lives in `i18n/de.json` and `i18n/en.json` and is read with `ctx.t('key')`.
- Quality: tiers are in `data/quality.json` (particle and prop caps, bullies, NPCs, rain density, pool sizes, shadows; Medium is the AD-14 budget). The choice is saved in `schulweg.quality`; desktop starts on High, phones (coarse pointer or small screen) on Medium. `?q=low|medium|high` overrides it for one load. Switching between Medium and High applies live; switching to or from Low changes the render resolution (480x270 vs 960x540), which is fixed when the page loads, so the game shows "Neustart nötig ..." / "Restart needed ..." and reloads itself with the new tier saved. Changing it emits `quality:changed`; pooled effects (skid marks, smoke, bell rings) change their active cap without allocating.
- `?debug` also shows the current tier, render size, texture scale and zoom, and live/cap counts of every pool under the HUD.
- Smooth zoom (story 1.13): world textures are bilinear filtered, the zoom is a damped spring (`data/camera.json`: `smooth`, `maxRate`, `deadband`) and the camera only snaps to whole pixels at an integer zoom. `node scripts/zoom-sweep.mjs --tier medium` (serve the game first) sweeps the zoom range and reports smoothness numbers (see `docs/PERFORMANCE.md`).
- Render resolution: world units, physics and tuning data are the same on every tier. On Medium and High the canvas is 960x540, the world camera runs at base zoom 2 (the speed zoom 0.6-1.0 in `data/camera.json` multiplies it), all procedural textures are drawn on a 2x grid (`scenes/HiResArt.js`, shown at scale 0.5, with tile variants, facades with windows, outlined sprites) and the UI keeps its 480x270 layout through a zoomed UI camera with text rendered at 2x. Low keeps the 1x art from `BootScene` and zoom 1.
- `node scripts/check-i18n.mjs` checks that both language files have identical keys and no empty values, and that every `t('...')` key used in the source exists.

## Living world

- **Wind** (`physics/Wind.js`, tuned in `data/weather.json`): `ctx.wind.vector` is the single wind state, a gust pattern that changes slowly. Each consumer applies it itself: leaves, rain and steam through emitter gravity, light props (`windAccel` in `data/props.json`, scaled by mass) through a small force, and the flags near the school and in the park, which droop in a breeze and stream and ripple in a gust. With `?debug` a wind arrow shows at the lower left and the wind vector and weather state in the debug text.
- **Weather** (`physics/Weather.js`): press **T** to toggle clear / rain (the `weather` intent; no touch button yet). Rain fades in a darker tint, drops fall across the view slanted by the wind with small splash rings, and dry roads turn into puddles (via the surfaces override API, only used by weather); they dry out again when it stops. Emits `weather:changed`.
- **Particles** (`particles/ParticleHub.js`, `data/particles.json`): a few shared emitters created once, fired with `ctx.particles.emit(name, x, y, opts)`: `dust` (sprinting, bike drifting), `splash` + `ripple` (moving through puddles), `leaves` (kicked up on grass, plus an ambient swirl), `rain`, `steam` (bakery, manhole and a chimney) and `debris`. The effect under you comes from the surface's `particle` name in `data/surfaces.json`. Each emitter gets a share of the tier's `maxParticles`; burst sizes follow `particleMul` and rain follows `rainDensity`, re-read on `quality:changed`. Fish occasionally ripple the pond.
- **Props** (`entities/Prop.js`, `data/props.json`): cones, cans, crates and balls from the map markers are Matter bodies in the `PROP` category. Walk or ride into them to push them; cones tip over on a hard hit, cans roll, the ball bounces far, a crate breaks into debris when hit fast (about sprint speed or more). Strong hits emit `prop:hit` with `{ prop, speed }`. Props away from the camera sleep and are not drawn; at most the tier's `maxProps` are awake.

## Chase (Ärger, bullies)

- **Ärger level 0-2** (`ai/ChaseDirector.js`, rules in `ai/ChaseLevel.js`, tuning in `data/chase.json`): the director is the only writer of the level and the only spawner of bullies. Entering bully turf (skatepark, back of the schoolyard) raises it to 1 and spawns a foot bully at the nearest `bully-spawn` point outside the camera view; staying in turf (`turfSecondsPerLevel`) or a bump (`bully:bump`, also a near-miss with a bully that is not chasing) raises it to 2, which adds a bike bully and a second foot bully (never more than the tier's `maxBullies`). Emits `chase:level` `{ level, reason }` and `chase:seen`. `chaseEnabled: false` in `data/chase.json` keeps the level at 0 (hook for a parent setting).
- **Service for later stories** (`ctx.chase`): `level`, `seen` (some bully sees the player), `cool(seconds)` (level falls to 0 after that long and the bullies give up), `reset()` (level 0, bullies removed at once), `playerCaught()` (used by the caught flow). Contact with a bully emits `bully:caught-contact` `{ bully, player }` and freezes it in `CAUGHT`. The caught flow is below.
- **Two players** (`ai/chaseLogic.js`, `coop` in `data/chase.json`, AD-18): one shared Ärger level that rises from the turf or bumps of either player. A bully chases the nearest visible player (distance over `bullyTargetWeight`) and keeps that target until another visible player scores below `switchRatio` (0.6) of its score, so it does not flip-flop; spawns are picked outside the camera view that holds both players, and `level.coopExtraByLevel` adds at most one bully (never past the tier's `maxBullies`). Cooling is judged per player (one `Escape` each): the level only drops when EVERY player in play is safe, hidden for `hideSeconds` or far and unseen for `farSeconds`. A hider whose partner is still seen or near a bully keeps the chase on. The HUD hide bar shows the slowest player.
- **Bully states** (`ai/BullyFSM.js`): `IDLE` (short beat after spawn), `CHASE`, `SEARCH` (walk to the last seen spot, look around), `DISTRACTED` (a `prop:hit` within `distractRadius` makes a bully that is not watching the player walk to the hit point), `GIVE_UP` (walks to the farthest spawn point and vanishes out of view; when the last bully is gone the level drops to 0), `CAUGHT`. Bullies use the movement profiles `bully-foot` (a bit slower than sprinting) and `bully-bike` in `data/vehicles.json`, and are pooled (`entities/Bully.js`, pool `bullies`). Their bodies do not collide with the player; contact is a proximity check.
- **Seeing** (`ai/Perception.js`): view distance and field of view from `data/chase.json`, grid raycast against solid tiles. Standing almost still (below `hideSpeed`) inside a hiding spot makes you invisible, and a hidden player is not caught or bumped.
- **Pathfinding** (`ai/Pathfinding.js`): grid A* over the map (walls blocked, surface speed and wall proximity as cost), requests queued with a shared budget of 2 per frame, per-bully cached path re-requested about every 0.5 s or when the target tile changes, straight-line steering when the way is clear. A full-map search takes about 0.25 ms in node.
- **HUD and debug**: top right an Ärger meter (two bars) and "Entdeckt!" / "Spotted!" while seen; angry steam puffs over chasing bullies (`anger` emitter). `?debug` shows each bully's state, path, line-of-sight ray and bump radius plus the level in the debug text.
- **Escaping** (`ai/Escape.js`, `escape` in `data/chase.json`): stand still in a hiding spot, unseen and with no bully within `stumbleRadius`, for `hideSeconds` and the level drops to 0 (bullies walk off and return to the pool). Being seen, moving, leaving the spot or a bully stumbling close resets the timer and the level stays. Staying farther than `farDistance` from every bully and out of sight for `farSeconds` also cools the level down. While hidden the player sprite turns translucent and green, leaves rustle, the HUD shows "Versteckt!" / "Hidden!" and, during a chase, a bar under the Ärger meter fills until the level drops. Still only the director writes the level.
- **Caught** (`entities/Caught.js`, `ui/CaughtFrame.js`, `caught` in `data/chase.json`): `bully:caught-contact` freezes the world (`ctx.frozen`; UIScene keeps running; with two players only while both are caught, see below), spends `lossCents` (100) from `ctx.state.shared.money` (starts at 500 cents, shown top left as "€ 5,00"), resets the chase and shows a comic frame (halftone panel, locker with the player inside, the bully with the lunchbox, a random one of three speech-bubble lines per language). After 2.5 s, or Space/F (A/Y on a gamepad, jump button on touch) once 0.8 s have passed, the player is dismounted (the bike stays where it was), put back at home with a dust puff, and the chase can start again at the next turf entry. Caught is per player: the caught player is pinned (`Player.pinned`: stands still, no input, tools drop their charge, no bike or ammo or door use) and out of play (`Player.alive = false`: bullies and the crowd ignore it), loses one fine from the shared wallet, and respawns beside the spawn point on its own timer or press. The other player keeps playing; the world freezes only while everyone is caught, and the first respawn unfreezes it. In co-op the catching bully gives up, other bullies carry on, and the level resets once no bully is chasing any more. The comic frame is scaled to `caught.coopScale` (0.5) and shown on the caught player's HUD half (P1 left, P2 right), so the other player keeps a clear view. Emits `player:caught` `{ player, lost, money }` (cents) and `player:respawn` `{ player, x, y }`.
- Reaching the school (`goal:reached`) shows the arrival banner for a few seconds; the game keeps running (prototype, no school scene).
- `node scripts/check-chase.mjs` checks pathfinding on the real map (home to school, walls, request budget, timing), the level thresholds, the hide / distance escape rules and the two-player rules (target hysteresis, escape across players, spawn counts, off-view spawns).

## Slingshot

Hold the left mouse button (touch: hold the tool button and drag from it to aim; gamepad: X or RT, right stick aims) to charge for about 0.8 s, release to shoot. Aim at the cursor; without a pointer the shot goes the way you last walked. While charging, a rubber band and power ring show at the player, a dotted line shows the flight, and a wind arrow with strength shows at the bottom of the screen; the dots bend with the wind exactly like the pebble (`flightPoint` in `tools/Slingshot.js`). **Q / E** cycle tools (`ToolBelt`, only the slingshot exists so far). The HUD shows the tool and its ammo.

- Pebbles are pooled sensor bodies in the `PROJECTILE` category (they collide only with `PROP` and `STATIC`): they pass through people, bullies and animals, and through fences. A hit pushes the prop (`knock` in `data/props.json`), crates take 3 hits, a spark puff shows, and `prop:hit` is emitted with the hit position (trash cans use `hitRadius` 260, cans 100, others the bully default), so bullies that are not watching you go to look (`DISTRACTED`).
- Targets: 3 tin cans on the skatepark fence (map props with `"perch": true`, static until hit) and a trash can nearby.
- Ammo: start with 5, magazine cap 12 (`data/tool.json`). Pebbles, chestnuts and acorns lie around (`ammo` map objects); walk over one to pick it up, it reappears after 40 s. The aim-dot count scales with the quality tier (`aimDots`).
- `node scripts/check-collisions.mjs` asserts that projectiles never collide with player, bully, NPC or animal masks.

## Pedestrians and crowd

The town is full of people so it looks lively wherever you are (`ai/CrowdDirector.js`, `entities/Npc.js`, tuning in `data/npcs.json`, art in `scenes/NpcArt.js`).

- **Population**: up to `maxNPCs` of the quality tier (Low 6, Medium 12, High 20) from the pool `npcs`, re-applied live on a tier switch. They appear on `npc-spawn` map markers (about 125, with district and role) in a ring just outside the camera view and are removed again once they are far outside it, so the crowd follows you through the districts; the density per district (`districts` in `data/npcs.json`) steers where they gather (plaza and park busiest, skatepark quietest). The level is filled on start.
- **Walking**: `npc-node` markers form a graph of sidewalk, park path, alley and schoolyard waypoints; walkers go node to node along straight corridors (checked by `scripts/check-map.mjs`), sometimes stopping to chat. No pathfinding is used, bullies ignore pedestrians.
- **Roles**: walkers (adults, kids, slower grandparents with canes), standers (bus stop, plaza, school gate), a grandparent on a bench, someone feeding the ducks, dog walkers (the dog is a pooled `ANIMAL` body on a leash) and two kids kicking a ball back and forth in the park. 12 outfits, three frames each, drawn procedurally at the render scale.
- **Reactions**: ringing the bell (`bike:bell`) within 85 px, or riding at them quickly from the front, makes them hop, step aside perpendicular to your heading and shout a kid-safe line (`npc.react.N`, six per language, at most 3 speech bubbles at once); very fast and very close they dash away. Event `npc:react` `{ x, y, state }`; `bike:bell` carries `{ x, y, player }`.
- **Physics**: pedestrians are `NPC` bodies (feather-light, so you push them aside instead of getting stuck), they collide with walls, props and the player, never with bullies, each other or tools; dogs only with walls and props. The slingshot passes through all of them (AD-3).
- `?debug` shows the crowd state counts, a label per pedestrian and the pools `npcs`, `dogs`, `bubbles`. `node scripts/check-crowd.mjs` checks the spawn rules, caps and reaction geometry.

## Characters and attributes

Three playable kids in `data/characters.json` (CAP-12), picked on the character select after New game (three cards: portrait, name, title, six attribute bars, start vehicle, perks; arrows + Enter, mouse or touch; the focused kid says an intro quip). The choice is dispatched as `player.setCharacter` (which also resets the attributes to the character's base values), saved at once, and Continue brings the same kid back. A game started without a character (debug, smoke) is a neutral kid with all attributes 5 and the original look.

| | Wissen | Tempo | Ausdauer | Charme | Ordnung | Zielen | Start vehicle | Perks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lena, Die Streberin | 9 | 5 | 5 | 5 | 8 | 8 | bike | precision slingshot, bullies target her more |
| Mehmet, Der Sportler | 5 | 9 | 9 | 6 | 3 | 5 | skateboard | bigger trick multipliers, throws the stick furthest, often forgets homework |
| Jonas, Der Kreative | 6 | 6 | 5 | 9 | 4 | 6 | roller skates | pro at grabbing buses, talks his way out, music/art bonus |

- **Attributes in play** (`characters/attributes.js`, numbers in `data/characters.json` `modifiers`, per point around 5): Tempo scales foot and bike top speed and acceleration (+-6%), Ausdauer the stamina tank (+-8%) and refill (+-6%), Zielen the slingshot scatter and aim-assist cone (`spreadDeg`, `assistDeg` in `data/tool.json`; the aim dots show the intended line, not the scatter). Wissen, Charme and Ordnung are stored for later systems. `ctx.players[i].attrs` is the live (fractional) attribute object, `.mods` the derived multipliers, `.perks` the perk strengths (`aimPrecision`, `bullyTargetWeight`, `trickMultiplier`, `stickThrowRange`, `forgetHomeworkChance`, `busGrabBonus`, `talkDownBonus`, `musicArtBonus`); `ctx.characters.display(player)` gives whole points for the UI. Bullies pick their target by distance divided by `bullyTargetWeight`, so Lena draws them more often. Perks without a consumer yet (tricks, stick, bus, talk-down, homework, music/art) are read by the stories that add those systems.
- **Start vehicle**: only `foot` and `bike` exist; Mehmet's skateboard and Jonas' skates fall back to running until epic 5 adds their profiles (then add the ids to `playerVehicles` in `data/characters.json`).
- **Growth**: the `attr.grow { player, attr, amount, reason }` action stores fractional points (max 10, shown rounded; `attr:up` fires when the shown value rises). `data/attr-growth.json` lists the hooks `{ event, attr, amount, cap, filter?, minDist? }`: `style:banked` raises Tempo, slingshot `prop:hit` from at least 60 px raises Zielen, `quiz:correct` and `lesson:done` raise Wissen, `karate:belt` raises Ordnung. Events nobody emits yet simply never fire.
- **Art**: `scenes/CharacterArt.js` reuses the default kid's figure and bike drawers with a palette per character (outfit, hair style, glasses / headband / headphones, bike frame colour), producing `player-<id>`, `player-<id>-bike` and `portrait-<id>` on every quality tier. Save format v2 has the six attributes (v1 saves are migrated).

## Save data

ctx.state (`state/GameState.js`) owns everything that gets saved: a versioned tree (`v`) with `shared` (money in integer cents, familienfrieden, vehicles, quests, clock, flags) and `players[i]` (character, attributes, xp/level, grades, learning, karate belt, cosmetics, stickers, bag). It is deep-frozen; the only way to change it is `ctx.state.dispatch('wallet.earn', { cents, reason })` and the other actions in `state/actions.js`, which emit `state:changed` with the changed path. Tuning defaults live in `data/state.json`.

- Three slots in `localStorage` (`schulweg.save.1` to `3`) via `ctx.saves`: `save(n)`, `load(n)`, `delete(n)`, `list()` (summaries for the menu). Saves happen on `phase:ended` into the active slot and on explicit `save(n)`; world positions are not saved. Without a chosen slot the game runs in memory only.
- Older saves are upgraded by the `state/migrations.js` chain. An unreadable slot is copied to `schulweg.save.<n>.bak`, removed, and reported with `state:slot-corrupt`.
- With `?debug`, `SCHULWEG_GAME.state` is the store and `SCHULWEG_GAME.registry.get('app').saves` the slots.

## Day clock

`ctx.day` (`services/DayClock.js`, pure time math in `services/dayTime.js`, all tuning in `data/day.json`) owns game time 06:30 to 22:00 and the phase machine morning, commute, school (from the 08:00 deadline), afternoon, evening, then the next day. One game minute takes `secondsPerGameMinute` real seconds (1.6, so a day is about 25 minutes). The time is `ctx.state.shared.clock` (`{ day, minute, phase }`), changed only by the `clock.set` action and restored with a loaded slot.

- Phases change only through `ctx.day.advance(reason)` (`'time'` when the clock runs out). Events: `clock:tick` (per game minute), `phase:ended` / `phase:started` (`{ phase, reason, day }`). When `phase:ended` fires the state already holds the next phase, so the autosave stores where to continue.
- Each phase has a season (autumn morning and commute, winter school, spring afternoon, summer evening) and weather hints (rain chance per time window, rolled once per day). `Weather` follows them; **T** is only a debug override until the schedule changes. A soft time-of-day tint (dawn warm, day neutral, evening orange, bedtime dark) sits in the weather overlay.
- Without a save slot (for example a quick start from the debug console) the clock is in freeplay: it shows the `freeplay` time from the data and never ends a phase. `ctx.frozen` stops the clock unless `runWhileFrozen` is set.
- The HUD shows a season icon, `HH:MM` and the phase at the top centre.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `main.js` | Entry point, Phaser config (960x540, or 480x270 on Low; pixel art, Matter with zero gravity) |
| `scenes/` | Boot (load + 1x procedural textures), `HiResArt.js` (2x textures), Menu, Game (owns `ctx`), UI (overlay HUD) |
| `entities/` | Player, `players.js` (`ctx.players`, `ctx.forEachPlayer`, `ctx.nearestPlayer(x, y)`, `ctx.alivePlayers()`, the deprecated `ctx.player` alias for `players[0]`), caught/respawn flow (`Caught.js`), bikes (+ skid, smoke, bell effects), `pools.js` (pool registry, fade pool), `Prop.js`, `Flag.js`, `Bully.js`, `Npc.js` (pedestrians and dogs), `SpeechBubbles.js` |
| `vehicles/` | `MovementController.js`: drives any actor from a profile in `data/vehicles.json` |
| `tools/` | Slingshot and other tools |
| `ai/` | Chase director and level rules, bully state machine, perception, pathfinding |
| `physics/` | `categories.js`, `bodies.js` (only place that creates bodies), surfaces service (with weather overrides), `Wind.js`, `Weather.js`, `WallStreamer.js` (keeps only walls near moving things in the Matter world) |
| `particles/` | `ParticleHub.js`: pooled emitters, surface effects, rain, ambient life |
| `state/` | `GameState.js` (store), `actions.js`, `migrations.js`, `SaveSlots.js` (AD-16) |
| `characters/` | `attributes.js` (pure attribute maths), `AttrGrowth.js` (growth hooks), `Characters.js` (`ctx.characters`: dresses each player with its character) |
| `learning/`, `minigames/`, `missions/` | Empty in the prototype |
| `services/` | `World.js` (`ctx.world`, map switching, AD-28) + `worldLogic.js` (pure catalog validation, door resolution); `DayClock.js` + `dayTime.js` (day clock, AD-17); `quality.js`: active quality tier, render resolution class, persistence, `quality:changed`, `quality:restart` |
| `i18n/` | `de.json`, `en.json`, `i18n.js` (`ctx.t`) |
| `data/` | Tuning JSON, `maps/` (`index.json` lists the map files; `town.json`, `test-room.json`: ASCII grid, objects in tile coordinates), `object-types.json` (catalog of every allowed map object type) |
| `ui/` | `input.js` (device reading, per-player intents) + `inputBindings.js` (pure bindings -> intent), `hud/` (HUD modules, listed per mode in `data/hud.json`, registered in `hud/index.js`), `ScreenStack.js` + `screens/` (overlays; `data/screens.json` says which freeze the world), `scaling.js` (integer scaling), `uiKit.js` (UI camera, crisp text) |
| `scripts/` | `check-*.mjs` and `check-all.mjs`, `bench.js` / `smoke.js` (loaded by `?bench`), `bench-cdp.mjs` (headless runner) |
| `docs/` | `PERFORMANCE.md`: benchmark results, optimizations, manual phone test |

Design rules live in `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/`.
