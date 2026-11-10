# Handoff: Schulweg game

For the next session (human or Claude). Read this first, then `README.md`. Last updated 2026-11-09.

## What this is

**Schulweg** is a retro top-down browser game for kids 8–14 (Phaser 3.90.0 + Matter.js, static files, no build step). The player rides, skates and runs through a German town, is chased by comic bullies, learns real Klasse 3 school content through minigames, trains karate and plays alone or in two-player co-op on one PC. One in-game day is one school year; the target is a complete Klasse 3 day from waking to the Zeugnis.

The game started as a throwaway prototype (finished, folded into the game) and was then planned and built with the BMad method: spec, architecture spine, epics and stories, built by Sonnet sub-agents one story at a time.

## Run it

```powershell
npx serve .
# or
python -m http.server 8080
```

Open the printed URL (or `http://localhost:8080`). URL options: `?renderer=canvas` (force Canvas, no light map or post passes), `?debug` (FPS, overlays, `window.SCHULWEG_GAME` debug API), `?q=low|medium|high` (quality tier; Medium/High render 960x540, Low 480x270; changing between those classes reloads).

Controls (P1): WASD move, Space jump/ollie/bell, Shift sprint, F mount/dismount/interact (hold near a bus rear on skates to grab), C or Left Ctrl manual, Q/E switch tool (slingshot, throwing stick, stick), mouse aim + left click, R block, V Kiai, T weather, Esc pause. P2: arrow keys, Right Shift/Right Ctrl/Enter, `;` and `'` for defend/kiai. Full table in `README.md`.

Checks: `node scripts/check-all.mjs` (52 checks, must stay green). Headless smoke test: see `docs/TESTING.md` (`scripts/bench-cdp.mjs --smoke`, ~1120 checks). Performance notes: `docs/PERFORMANCE.md`.

## Where the plan lives

Everything is in `_bmad-output/`:

| What | Path |
| --- | --- |
| Active initiative (the game) | `_bmad-output/initiative-schulweg-game/` |
| Spec (33 + 1 capabilities, CAP-1..34) | `.../spec-schulweg-game/spec-schulweg-game.md` (+ `family-characters.md`, `beyond-klasse-3-backlog.md`) |
| Architecture (AD-16..AD-30, inherits AD-1..15) | `.../architecture-schulweg-game/` and `_bmad-output/initiative-schulweg/architecture-schulweg-prototype/` |
| Epics and stories | `.../epic-*/` each with `tickets.toml` (the stories) and an epic file |
| Prototype history | `_bmad-output/initiative-schulweg/` |
| Brief every story builder reads | `_bmad-output/initiative-schulweg-game/build-brief.md` |

Ticket board: `uv run ~/.claude/skills/bmad-ticket/scripts/tickets.py --project-root . status initiative-schulweg-game` (counts, per-story state) and `... next initiative-schulweg-game` (what can start). Refs are `<epic id>.<entry id>`, e.g. `8.3`. Status is changed with `... mark initiative-schulweg-game 8.3 in-progress|built|draft|...`. After a build the stories show as `review`.

## State at handoff

Branch `main` holds everything and is pushed. **84 of 85 stories are built** (only 2.6 three-player co-op is left, parked by the user); 66 node checks pass and the headless smoke test passes with 1287 checks, repeatably (see "Deterministic smoke test" below). `.github/workflows/pages.yml` runs the node checks on every push and publishes the game to GitHub Pages from `main`: https://johannesrabauer.github.io/grand-theft-study/

Built: epic 1 foundation, epic 2 characters and two-player co-op (2.1-2.5), epic 3 learning engine and ~900 Klasse 3 questions plus grades, epic 4 all lesson minigames (4.8 open), epic 5 skating, epic 6 tools and karate (6.1-6.4), **epic 8 the whole school day** (home and morning, commute with the 08:00 bell and tram, school interior and lessons, surprise events, afternoon/evening/bedtime, Zeugnis with promotion and the class 4 end screen), **epic 9 quest runner and missions** (9.1, 9.7, 9.8: parcel, grandma's eggs, stolen bike, lost homework, skate and bike races, Kirmes range, friendship arc), **epic 10 economy and motivation** (10.1 shops with vehicles, slingshot upgrade, hats and rings, snacks and a day ticket; 10.2 XP for activities, level-up celebration and attribute growth hooks; 10.3 29 stickers with fun facts and the album; 10.4 20 achievements and three daily streaks; 10.5 the Lernbuch), **11.1 full HUD** (level, XP bar, grade average), **11.4 parent settings** (math gate, learning difficulty, chases on/off, play-time reminder), **11.5 contextual explanations**, **epic 15 environment art** (ground transitions, water, kerbs, fences, hedges, buildings, doors, indoor rooms, rain puddles).

Since the last handoff: epic 9 is complete (9.1-9.8: missions, Pfand machine, bakery counter, English sign scanning, newspaper route, tram map quiz with fast travel, six chores at the home chore board and the Familienfrieden pocket money) and epic 11 is nearly done (HUD, minimap on M, phone on P with ten scripted messages, important-text audit, difficulty by age with a per-kid override in the parent settings). Activities share one engine: `data/activities.json` + `services/activityLogic.js` + `entities/Activities.js` + `ui/screens/ActivityScreen.js`.

Also done outside the board: rain puddles that sit on the surface under them, a co-op fix (a caught kid rejoins next to the sibling when home is far, so the shared camera and tether cannot get stuck), the autosave bug fix (see Gotchas).

Playable characters: **Helena** (12), **Kilian** (10), **Lorenz** (8); looks and traits in `family-characters.md`.

## What to build next

Open stories: none except the parked 2.6. **Still open for the user:** the Klasse 3 boss (Rocco the Rowdy Boss, trait `unshakable`) is an assumption in `data/chase.json` `boss` and the i18n texts `boss.*`; the real-phone frame rate has never been measured (`docs/CROSS-BROWSER.md` and `docs/PERFORMANCE.md` hold the protocol and the by-hand browser checklist); a few Sachkunde facts were written from memory (see Gotchas).

Suggested next: play it, run the by-hand checklist in `docs/CROSS-BROWSER.md`, measure on a phone, then decide about 2.6. New HUD modules or systems that create a Phaser Text at run time must do it with `Math.random` swapped out (see `ui/hud/PhoneModule.js`), and new always-on random effects need a test hook flag like the other `...Off` flags in `scripts/smoke/env.js`, or the seeded smoke scenarios shift. The browser caches ES modules: hard-reload (Ctrl+F5) after pulling, or use the published page.

**Parked by the user:** story **2.6 three-player co-op** (status `draft`). Do not build until asked.

## How to build a story (the workflow that worked)

The last stretch was built directly in one session, one story at a time, committing and pushing each to `main`:

1. Read the story (`_bmad-output/initiative-schulweg-game/<epic>/tickets.toml` and its plan file) and the code it touches; follow the existing pattern (a data file in `data/`, a Phaser-free logic module in `services/` or `<area>/`, a thin scene class in `entities/`, a screen in `ui/screens/` declared in `data/screens.json`, texts in both `i18n` files).
2. Put saved changes in state actions (`state/actions.js`), game behaviour behind a data file, and write `scripts/check-<area>.mjs` (registered in `scripts/check-all.mjs`) plus a `scripts/smoke/<area>.js` scenario (registered in `scripts/smoke/index.js`).
3. `node scripts/check-all.mjs`, then the smoke test (below), then look at headless screenshots for anything visual.
4. `tickets.py ... mark initiative-schulweg-game <ref> built`, commit, push.

Earlier sessions used one Sonnet sub-agent per story (prompt shape in the git history); that still works, but stories share files like `GameScene.js`, so never run two writers at once.

## Hard rules (from the spec and the user)

- Kid-safe: no ads, purchases, chat, external links, data collection; no swearing, slurs or insults about appearance/origin/gender/religion/disability; nothing sexual; no injury visuals. `scripts/check-content.mjs` lints all text.
- Tools (slingshot, throwing stick, stick) and karate never affect people or animals; karate is stumble-only. Enforced with collision categories (AD-3) and tests.
- All text via `ctx.t` with identical keys in `i18n/de.json` and `i18n/en.json`; world signs stay German.
- Saved data only through state actions (`ctx.state.dispatch`, AD-16); input only through intents (AD-10/AD-18); no per-frame allocation in hot paths; respect the quality-tier caps.
- Windows/PowerShell instructions; no bash-only tooling for users.

## Gotchas learned

- The built-in browser pane runs the game at about 2 FPS (hidden pane). Verify by stepping through `window.SCHULWEG_GAME` (`?debug`) and with the headless-Edge scripts (`scripts/bench-cdp.mjs`, `scripts/zoom-sweep.mjs`). Rendering FPS on a real phone has **never been measured** and the reference phone is still unnamed.
- The browser can cache stale ES modules: hard-reload after edits.
- Never kill processes by name/pattern. One early agent killed unrelated `cards-profile-*` Edge instances. The bench scripts now clean up their own headless browsers by PID; stray ones live under `%TEMP%\bench-*` / `sweep-*`.
- **Deterministic smoke test.** `scripts/smoke.js` seeds `Math.random` per scenario, so a run is repeatable (the earlier "flaky" `worldDoors` check was luck with the unseeded traffic). If a check fails, it fails every time: debug it, do not rerun. `scripts/check-chase.mjs`'s A* timing limit is deliberately loose (5 ms).
- Smoke scenarios share one running game. Scenarios after `quitAndSecondRun` must take the live scene (`game.scene.getScene('Game').ctx`), not `env.ctx`, which points at the first run. Put the world, clock, state and vehicle back at the end of a scenario (see `scripts/smoke/shop.js` for the pattern), and switch off what freezes the world while other scenarios run: `game.hintsOff`, `game.schoolEventsOff` and `game.trafficOff` are set in `scripts/smoke/env.js`.
- A scenario that emits a real game event (`bike:bell`, `player:caught`, `bully:bump`) is heard by the whole game (pedestrians and buses react), so scenarios feed the service under test directly (`svc.onEvent`, `q.onEvent`). After `state.replace(...)` call `ctx.characters.refresh(player)` for each kid: the speed modifiers do not follow a replace.
- Particle overhaul (16.11): the hub caps the live total per tier in `put`; new always-on effects are switched off in the scripted runs by `footstepsOff dripsOff petalsOff leavesFallOff embersOff motesOff glowOff` (`scripts/smoke/env.js`; the `particles` scenario turns them on). Glowing particles hold ctx.lights handles (`particleLights` per tier); call `hub.celebrate(...)`, not the real `level:up` event, when a script needs the burst (the event opens the level-up screen and pauses the world).
- Older scenarios pin exact numbers; new XP, growth or achievement rewards change them. `scripts/smoke/env.js` zeroes the achievement xp reward for that reason, and a few tests compare against the data (`ctx.progress.rules`).
- `giveBike()` adds a new parked bike each time; a scenario that calls it leaks a bike object. Do not remount bikes in the middle of a scenario (the street-ride bookkeeping then differs after a map round trip).
- **A screen that waits for confirmation eats the next key press.** Anything started automatically in the middle of play (a theft, a bus hit) must only toast; only things the player asked for (a phone call, a shop, bedtime) may open a screen. Fresh-press screens need one frame with the key released before a second press counts (`ChoiceCursor`).
- The event emitter is shared and `GameScene` removes every listener when a run ends; anything created once at boot must re-subscribe per run (`SaveSlots.attach()` does; before that fix, autosave on phase end died after the first return to the menu).
- Windows bash quirk in this tool: heredocs containing apostrophes sometimes fail; write such files with the editor tool instead. Never reformat `data/maps/town.json` or `kopfnoten.json` with a JSON dump (one object per line, thousands of diff lines); insert lines instead.
- Content to verify by a human: a few Sachkunde fun facts were written from memory (Madrid as a high capital, Lisbon's seven hills, Hamburg bridges vs Venice, first traffic light 1868); the cycling-age rule (children up to 8 on the pavement, up to 10 may) needs checking; a few Deutsch items (e.g. de-129, de-178, de-179) and perimeter items ma-198..200 may be Klasse 4 level.
- `ButtonMenu` reads keys directly (menu focus only), a known deviation from AD-10.
- Erdkunde, Musik, Kunst, Sport and Karate lessons are graded under their own subject ids (display names exist; `data/grading.json` `subjects` stays the five that have teacher comments, a check requires strong and weak comments for each).
- Co-op defaults (assumption, unconfirmed): money shared, grades/XP/learning per player, lessons side by side.
- Save format is version 7 (`STATE_VERSION`); migrations exist from v0 (`state/migrations.js`). Mission, hint, shop, ticket, Zeugnis, achievement, streak and parent-setting progress live in `shared.flags` and `shared.quests`, stickers in `players[i].stickers` (already in the shape), so none of it needed a migration.

## Open questions for the user

- Which real phone is the 60 FPS reference device?
- Should co-op share money and keep grades per player (current default)?
- Klasse 3 boss bully name and trait (needed for story 7.3).
- Weekly usage: ask what limit applies now.
- Do the report card promotion and comeback numbers (average 4.0, at most two fives, 150 XP and 5 euro) feel right once played? They are in `data/grading.json`.

## Environment notes

- Remote: `origin` = `https://github.com/JohannesRabauer/grand-theft-study.git`. The branch `prototype` is the old working branch; `main` is the integrated line.
- A git worktree `../grand-theft-study-preview` (branch `preview-epic5`) holds a frozen epic-5 snapshot served on port 8090 for playtesting; safe to delete (`git worktree remove ../grand-theft-study-preview`).
- BMad is set up in `_bmad/` (config in `_bmad/config.toml`; `_bmad/custom/config.user.toml` is personal and git-ignored and names the active initiative `initiative-schulweg-game`).
