# Testing (AD-29)

Two layers: node checks for pure logic and data, and one browser smoke test for the running game.

## Checks (node, no browser)

```powershell
node scripts/check-all.mjs          # every check in sequence; non-zero exit when one fails
node scripts/check-content.mjs      # one check on its own
```

Add a check: put the logic in a module without Phaser, write `scripts/check-<area>.mjs` (plain asserts, exit 1 on failure,
print what was checked), then append its file name to the `checks` list in `scripts/check-all.mjs`.

### Content safety (`check-content.mjs`)

Lints every string in `i18n/de.json`, `i18n/en.json`, all of `data/learning/**/*.json` and the text fields of `data/*.json`
(keys named in `textFields` of `data/content-blocklist.json`) for swearing, slurs, insults, sexual terms and glorified violence, in
German and English. It also fails on empty text and runs `check-i18n.mjs` for de/en key parity. A self-test runs the matcher on
samples built from the list (plain, upper case, in a sentence, with a stem suffix, leet spelling) and on known-clean text before every run.

The list stores each entry as base64 of the reversed, umlaut-folded lowercase word, so the repo has no plain offensive words.
`words` match a whole token, `stems` match the start of a token, `allow` exempts harmless whole words a stem catches.

```powershell
node scripts/check-content.mjs --add de words <word>    # or: en stems <word>; the word is stored encoded
node scripts/check-content.mjs --allow <harmless-word>  # e.g. a stem collision
node scripts/check-content.mjs --text "string to try"   # exit 1 when flagged
node scripts/check-content.mjs --encode <word>          # print the stored form
```

When a legitimate string is flagged, reword it; use `--allow` only for a real collision (a different, harmless word).

### Standing reviews (stories 14.3 and 14.4)

- `check-tone.mjs`: every text in both languages (placeholders match, German speaks to kids with du, no shouting, no blame in texts that react to mistakes).
- `check-balance.mjs`: economy (first ride in about a week of ordinary play), progress and chase speeds stay inside chosen ranges.
- Smoke scenario `fullDay` (last): a whole game day solo and in co-op through the real day flow. Cross-browser list: `docs/CROSS-BROWSER.md`.

## Smoke test (whole game, headless browser)

Serve the project (`python -m http.server 8080` or `npx serve .`), then:

```powershell
node scripts/bench-cdp.mjs --url http://localhost:8080 --smoke   # JSON with pass, total, failed, checks
```

or open `index.html?bench` and `await SCHULWEG_BENCH.smoke()` in the console. The run plays one scripted session; every step
asserts game state, and any console error, warning or exception fails it. The headless browser is cleaned up automatically
(see docs/PERFORMANCE.md).

Add a scenario for new player-visible behavior:

1. Create `scripts/smoke/<area>.js` (or add to the area's file) exporting `{ name, run(game, assert, env) }`.
   `assert(name, ok, detail)` records one check. `env` (see `scripts/smoke/env.js`) has the helpers: `step(n)`, `until(cond, max, tick)`,
   `press(intent)`, `count(event)`, `live(pool)`, `hud(id)`, `ctx`, `gs`, `ui`, `player`, `intent`, `h` (teleport, route runners).
2. Append the export to `scenarios` in `scripts/smoke/index.js`. Scenarios share one running game and run in list order, so start
   from what the previous one left (teleport via `env.h.teleport` when you need a place) and leave it quiet.
3. Run the smoke test; the total check count must not drop.

Areas so far: `prototype-core` (bike ride, slingshot, weather, language, quality, pause), `chase`, `crowd`, `screens`, `players`, `characters`, `world`, `day`, `state`, `coop`, `learning`, `grades`, `minigames`.

### Scooters and inline rollerblades

`node scripts/check-vehicles.mjs` checks both new IDs, prices, locked feedback, invalid unlock reasons, reachable ordinary
town displays and a full v6 save round-trip with old progress intact. `node scripts/check-skates.mjs` measures their speed
on every surface, rough-ground acceleration and turning through the real neutral-attribute `MovementController`,
checks explicit speed/grip entries, and retains the original bike/board/skates tuning assertions.

The `newRides` scenario in `scripts/smoke/vehicles.js` checks purchase and normal interact mounts, simultaneous co-op
contention, independent movement, character looks, turning, jump poses, map travel, dismount/remount, caught cleanup,
every requested pose at render scales 1 and 2, and real menu Continue with v6 breakfast/bags and earlier progress.
The `traffic` scenario exercises flinging and remounting all five ride types.

```powershell
node scripts/check-all.mjs
node scripts/bench-cdp.mjs --url http://127.0.0.1:8087 --smoke --json ride-smoke.json
```

Inspect `smoke.pass`, `smoke.failed` and `consoleProblems` in the JSON; process exit alone is not proof of success.
For a focused browser run: `await SCHULWEG_BENCH.smoke(['newRides'])`.

The `school` scenario enters the school through its normal interact door, opens the classroom timetable, checks
freezing and language changes, and runs the scheduled day through the existing minigame scenes and result screens.
It checks stored lesson IDs and grades, the afternoon transition, and UI/map cleanup. Individual minigame controls
remain covered by `minigames`. `node scripts/check-school.mjs` checks all five timetable days (4-6 lessons), solo
and co-op grades, save/Continue attendance, quit/retry, failed starts, shutdown, and clock boundaries.

The `home` scenario starts saved solo and co-op mornings, uses the breakfast table and bag, exercises drag/drop,
tap and per-player confirmation, saves and continues preparation, and leaves through Ready and the ordinary door.
It verifies forgotten supplies, indefinitely readable lesson reminders and the next morning's reset.
`node scripts/check-morning.mjs` checks supply selection, state validation, breakfast, bags, saves, phase transitions
and the v5-to-v6 migration. Synthetic drag/drop projects coordinates through the UI camera after `preRender`,
because manual smoke steps do not run the renderer.

The `minigames` scenario runs the quiz demo through `ctx.minigames.start`: one player with a pause, number-key answers and the result screen, two players side by side, a quit-early round and a timed sprint round. It asserts the graded result, rewards, learning stats, that the world unfreezes and that display objects, scenes, textures and listeners are back to their counts before. Because it scripts the intents, it stubs `ctx.input.update` like the other scenarios; a new minigame can be exercised the same way (`env.until` to step past the countdown, set `ctx.input.intents[i].answer = 1..4` for one frame to answer).

The same scenario also plays the Mathe minigame (`mathe`): one player through a whole 70 s run with both modes (the scene's `plan` is set so the sprint and the block half both happen; answers via number keys, the keypad model and block lanes), two players side by side with the gentle winner cheer, an uncaught block landing as a gentle miss and quitting. It asserts the fall time from the engine meta, learning stats per answer, rewards, grade, a restored world and no leaks. Its pure logic is `node scripts/check-mathe.mjs`.

The same scenario also plays the Deutsch minigame (`deutsch`): one player through a whole 70 s run with both modes (belt bins via number keys, answer buttons, the letter pad and the physical-keyboard handler `scene.onKey` for typed items, umlaut and case rules), two players side by side with the winner cheer, a noun riding off the belt, a tap on a bin and quitting. It asserts the belt time from the engine meta, learning stats per answer, rewards, grade, a restored world and no leaks. Its pure logic is `node scripts/check-deutsch.mjs`.

It then plays Englisch and Erdkunde the same way, for one and two players: memory boards through `slot.grid.tap` (and the card cursor via intents), a deliberately mistaken board (three flips of two known cards), sign questions (plate, number keys, letter pad), and for Erdkunde taps on the map through `slot.map.onTap(slot.map.pick(x, y))`, the map cursor via intents, the capital buttons and the plain-choice fallback (`nextQuestion` with `Math.random` stubbed). Then Science: the sorting cards through cursor, number key, tap and a synthetic drag (`slot.lab.card.emit('drag' ...)`), the circuit through `slot.board.onPick` and the cursor (a two-repair puzzle, the lit bulb, a wrong pick), a Quick-Quiz with a fun fact, a whole 70 s run and a two-player run (`nextQuestion` is overridden per scene instance and deleted afterwards, because the scene instance is reused). Last come Musik and Kunst, which have no learning questions: Musik is played through the intents (`playMusik` presses the number key of the next due note, with notes left out and a fixed lateness) with the song clock, the beat ring, the `music:note` / `music:beat` / `sfx:play` hooks, a pause, a lane tap (`slot.stage.onTap`), a whole 60 s run, and a two-player run where only the second kid has the Lorenz perk (the same late timing hits more for her, she is cheered); Kunst through the mouse path (`slot.easel.onSwatch` / `onCell` / `onDone`) and the cursor via intents (colour key, stroke by holding confirm, palette row, Fertig), partial credit, a perfect copy, the level adapting, the timer ending mid-painting, and two players with the longer memorize time of the perk. Both patch `ctx.players[i].perks` (restored afterwards). Pure logic: `node scripts/check-musik.mjs`, `node scripts/check-kunst.mjs`.

The `coop` scenario (last, it restarts the game) starts a real two-player run through the `coop` flag, sends both players along the commute route (`h.makeRouteRunner(ctx, reach, clearance, playerIndex)` drives any player) and asserts that the tether keeps the distance within the limit, the camera keeps both in view on every frame and zooms out, and that a pinned partner never blocks the other. `h.teleport` moves every player, so a second player is never left behind at the tether.

### Co-op scenarios

`coop.js` holds three scenarios that run last: `coopMenu`, `coopCommute` and `coopChase`. They start every game through the real menu path
with the `SCHULWEG_GAME.menuNav` debug API (`play()`, `newGame(slot)`, `mode('solo'|'coop')`, `pick(id)` per player, `continueSlot(slot)`,
`state()`), the same handlers the buttons call. The save slots are swapped for an in-memory store during the run, so no real save is touched.

```powershell
node scripts/bench-cdp.mjs --url http://localhost:8080 --smoke   # whole run; look for the coop* checks in the JSON
```

- `coopMenu`: mode screen, one select per player, the same kid twice, per-player start vehicles, the pause menu line, save and Continue with both characters, pad disconnect (toast, keyboard fallback), A to join on the mode screen, and the solo path unchanged.
- `coopCommute`: both players ride the commute route to school; tether and camera hold.
- `coopChase`: shared Ärger level, caught per player.

The menu logic itself (modes, picks, validation, keys and pads) is `node scripts/check-menu.mjs`. In a browser with `?debug`, drive the same API from the console to try a flow by hand.

## Benchmarks

`node scripts/bench-cdp.mjs --url http://localhost:8080` and `node scripts/zoom-sweep.mjs`; see docs/PERFORMANCE.md.

### Open-world expansion

Delivery follows [the integration plan](../_bmad-output/initiative-schulweg-game/plan-open-world-expansion.md).
Regenerate the town with `node scripts\build-town-expansion.mjs`. It reads the immutable original-town fixture at
revision `599f3c1efa3316cd434cbf61f69693cb2bf8693d`, preserves old coordinates/content apart from the documented boundary
openings, and writes deterministic map, route, catalog and translation data. Two consecutive runs produced identical hashes.

`node scripts\check-open-world.mjs` covers all four object-scoped street identities, atomic contention, invalid transitions,
cross-map drop/return, v6 migration, v7 save restoration and corruption backups; actual flood fill (4,204 → 14,571 tiles),
bike-sized neighborhood paths/canal crossings, original content, eased traffic hulls over two circuits, yielding,
non-grabbable classification, and eight reusable play layouts. Queued A* resumes within a shared 256-node frame budget;
its test uses 16 nodes and compares the complete result with synchronous A*, including map cancellation.

The registered `openWorld` browser scenario exercises actual mounts/abandon/return, contention and independent co-op rides,
both neighborhood routes, witness feedback, locked displays, traffic/caught dismounts, skates-only rear grabs,
bounded traffic recovery, repeated use of all eight toy types, constraint/body/reward leak checks, and real menu Continue.
It runs alongside all old scenarios, rather than replacing them. Verification: **all 40 pure checks passed;
the full browser smoke passed 927 assertions with zero console problems**.
The additional assertions cover bounded ground-texture chunks and the actual cents-to-euros catch loss display.

```powershell
node scripts\check-all.mjs
node scripts\bench-cdp.mjs --url http://127.0.0.1:8087 --smoke --json open-world-smoke.json
# Or, in the ?bench browser console:
# await SCHULWEG_BENCH.runAll({tiers:["medium"],steps:1200})
```

Inspect `smoke.pass`, every `smoke.checks` entry whose `ok` is false, and `consoleProblems`; exit status alone is insufficient.
Do not run pure checks while project-local browser profiles are active: the existing translation checker recursively
walks the repository and can race changing profile files. This host needed an isolated project-local browser profile and
a temporary `--no-sandbox` flag. Final verification retained GPU acceleration and normal certificate checks; the earlier
GPU/certificate workarounds proved unnecessary. No permanent launch settings were changed.
Verification reports/preloads are not shipped game content.

Medium measurement after traffic broad-phase rejection, resumable navigation and pre-baked catch-frame UI
(600 measured steps per scenario, existing default warm-up):

| Scenario | Average ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| Idle walking | 0.19 | 0.40 | 1.10 |
| Bike top speed | 0.18 | 0.40 | 1.60 |
| Level-2 chase | 0.21 | 0.40 | 1.20 |
| Rain/wind/props/slingshot | 0.35 | 0.70 | **4.70** |
| Everything | 0.36 | 0.60 | 2.70 |
| Co-op expansion/linked toys/traffic | 0.36 | 0.70 | **13.60** |

Every reported pool stayed within its cap; traffic peaked at **12/12**, aggregate awake props at **47/60**.
These values **do not satisfy the strict 3 ms worst-case requirement**; p95 is not a substitute. Earlier runs also
exceeded the limit. These are pre-fix measurements, not the final delivery result below.
Real-phone frame rate and physical touch/gamepad usability remain manual checks.

A later full Medium repeat recorded maxima **1.1/0.8/0.9/3.7/1.3/2.2 ms**, again with every pool capped; this also fails
the maximum requirement and does not erase earlier spikes. Final full smoke again passed 924 checks. Random crowd
contacts had interfered with two scripted input/grab assertions, so those specific assertions temporarily exclude NPC
collisions (restored immediately afterward); separate crowd/traffic scenarios still test normal collision behavior.
Expansion traversal uses body-sized clearance in the real route driver and retains the no-wall-crossing assertion.
The final traversal driver also steers around live pedestrian clusters when stalled, without disabling collisions
or teleporting across the tested routes.

Profiling then isolated a first-catch text rasterization stall. Prewarming the configured loss, correcting its
cents-to-euros display, and removing repeated prop-sleep transitions/per-frame prompt allocations resolved the measured
spikes. Ground rendering now uses tile-aligned chunks bounded by the GPU limit (at most 4096 pixels), instead of a
5120-pixel-wide town texture.

Final GPU-enabled Medium measurement, **1,200 measured steps per scenario** with the existing warm-up:

| Scenario | Average ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| Idle walking | 0.16 | 0.30 | 1.70 |
| Bike top speed | 0.15 | 0.30 | 0.70 |
| Level-2 chase | 0.17 | 0.30 | 1.00 |
| Rain/wind/props/slingshot | 0.29 | 0.50 | 1.70 |
| Everything | 0.40 | 0.70 | 1.20 |
| Co-op expansion/linked toys/traffic | 0.30 | 0.50 | 1.30 |

All six measured maxima meet **3 ms**, and all pools remain capped (traffic 12/12, awake props at most 60/60).
This is a desktop proxy result, not a guarantee on untested phone hardware.

BMAD Quick review found one wall-adjacent traffic-fling persistence defect. Unmounted street snapshots now reuse safe
placement and synchronize the visible sprite with the validated saved location; pure reclaim/save and browser fling
regressions pass. No review work was deferred. After that correction, all 40 pure checks and 927 browser assertions passed,
with zero console problems. A fresh 1,200-step Medium repeat recorded maxima **1.2/1.1/1.1/2.2/1.2/1.3 ms**;
every pool remained capped (aggregate prop peak 48/60). Isolated ride-input checks start in a clear road lane, and the
traffic remount check presses interact before unrelated pedestrians can displace its scripted placement.
