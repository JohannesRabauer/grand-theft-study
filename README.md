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

`data/maps/town.json` is a 96x64 tile town (16 px tiles): a main road with a bike lane, a park with a canal, pond and bridge, an old town with cobbled alleys, a skatepark, and the school with a fenced yard. Walking from home to the school takes about 30 seconds by either of two routes: along the main road, or through the park and over the canal bridge into the old town. The yellow arrow around the player points to the school and shows the distance in meters (`metersPerTile` in the map); arriving emits `goal:reached` and shows a short message. Legend chars map to surface ids; surfaces with `"solid": true` in `data/surfaces.json` (walls, water, trees, fences, hedges, dumpsters, phone booths) become static bodies. Map objects: `spawn`, `goal`, `bike`, `hiding` (hedge, dumpster, phone-booth sensor zones), `turf` (skatepark, schoolyard-back sensor zones), `bully-spawn`, and `prop` markers (cone, can, crate, ball; loaded but unused so far). The player entering or leaving zones emits `hide:enter|leave` and `turf:enter|leave` on `ctx.events`. With `?debug`, hiding zones are outlined green, turf zones red and the goal yellow.

`node scripts/check-map.mjs` validates the map: grid shape, legend, objects (none inside walls), and that the school is reachable by two different, bike-friendly routes, even when the middle of either one is blocked.

## Menu, language and quality

The main menu has Start, a language toggle (Deutsch / English) and a quality selector (Low / Medium / High); use the mouse, touch, or arrow keys + Enter. Esc (or the pause button, or Start on a gamepad) opens the pause overlay in the game with Resume, the same two toggles, and Back to menu.

- Language: switches instantly (all HUD and menu text re-resolves on the `lang:changed` event) and is saved in `localStorage` key `schulweg.lang`. All visible text lives in `i18n/de.json` and `i18n/en.json` and is read with `ctx.t('key')`.
- Quality: tiers are in `data/quality.json` (particle and prop caps, bullies, NPCs, rain density, pool sizes, shadows; Medium is the AD-14 budget). The choice is saved in `schulweg.quality`; desktop starts on High, phones (coarse pointer or small screen) on Medium. `?q=low|medium|high` overrides it for one load. Changing it emits `quality:changed`; pooled effects (skid marks, smoke, bell rings) change their active cap without allocating.
- `?debug` also shows the current tier and live/cap counts of every pool under the HUD.
- `node scripts/check-i18n.mjs` checks that both language files have identical keys and no empty values, and that every `t('...')` key used in the source exists.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `main.js` | Entry point, Phaser config (480x270, pixel art, Matter with zero gravity) |
| `scenes/` | Boot (load + procedural textures), Menu, Game (owns `ctx`), UI (overlay HUD) |
| `entities/` | Player, bikes (+ skid, smoke, bell effects), `pools.js` (pool registry, fade pool) and later bully, NPC, props, pools |
| `vehicles/` | `MovementController.js`: drives any actor from a profile in `data/vehicles.json` |
| `tools/` | Slingshot and other tools |
| `ai/` | Chase director, bully state machine, pathfinding |
| `physics/` | `categories.js`, `bodies.js` (only place that creates bodies), surfaces service |
| `particles/` | Emitter registry |
| `learning/`, `minigames/`, `missions/` | Empty in the prototype |
| `services/` | `quality.js`: active quality tier, persistence, `quality:changed` |
| `i18n/` | `de.json`, `en.json`, `i18n.js` (`ctx.t`) |
| `data/` | Tuning JSON, `maps/town.json` (ASCII grid, objects in tile coordinates) |
| `ui/` | `input.js` (intent snapshot), HUD |
| `scripts/` | Dev scripts |

Design rules live in `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/`.
