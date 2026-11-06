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
| Jump | Space | big button | A |
| Sprint | Shift | double-chevron button | B |
| Interact | F | circle button | Y |
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

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `main.js` | Entry point, Phaser config (480x270, pixel art, Matter with zero gravity) |
| `scenes/` | Boot (load + procedural textures), Menu, Game (owns `ctx`), UI (overlay HUD) |
| `entities/` | Player and later bully, NPC, props, pools |
| `vehicles/` | `MovementController.js`: drives any actor from a profile in `data/vehicles.json` |
| `tools/` | Slingshot and other tools |
| `ai/` | Chase director, bully state machine, pathfinding |
| `physics/` | `categories.js`, `bodies.js` (only place that creates bodies), surfaces service |
| `particles/` | Emitter registry |
| `learning/`, `minigames/`, `missions/` | Empty in the prototype |
| `i18n/` | `de.json`, `en.json`, `i18n.js` (`ctx.t`) |
| `data/` | Tuning JSON, `maps/town.json` (ASCII grid, objects in tile coordinates) |
| `ui/` | `input.js` (intent snapshot), HUD |
| `scripts/` | Dev scripts |

Design rules live in `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/`.
