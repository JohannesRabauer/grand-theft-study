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

WASD or arrow keys: walk. An FPS counter shows at the top left.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `main.js` | Entry point, Phaser config (480x270, pixel art, Matter with zero gravity) |
| `scenes/` | Boot (load + procedural textures), Menu, Game (owns `ctx`), UI (overlay HUD) |
| `entities/` | Player and later bully, NPC, props, pools |
| `vehicles/` | Movement profile loaders (profiles live in `data/vehicles.json`) |
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
