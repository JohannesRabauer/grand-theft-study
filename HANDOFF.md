# Handoff: Schulweg game

For the next session (human or Claude). Read this first, then `README.md`. Last updated 2026-11-07.

## What this is

**Schulweg** is a retro top-down browser game for kids 8–14 (Phaser 3.90.0 + Matter.js, static files, no build step). The player rides, skates and runs through a German town, is chased by comic bullies, learns real Klasse 3 school content through minigames, trains karate and plays alone or in two-player co-op on one PC. One in-game day is one school year; the target is a complete Klasse 3 day from waking to the Zeugnis.

The game started as a throwaway prototype (finished, folded into the game) and was then planned and built with the BMad method: spec, architecture spine, epics and stories, built by Sonnet sub-agents one story at a time.

## Run it

```powershell
npx serve .
# or
python -m http.server 8080
```

Open the printed URL (or `http://localhost:8080`). URL options: `?debug` (FPS, overlays, `window.SCHULWEG_GAME` debug API), `?q=low|medium|high` (quality tier; Medium/High render 960x540, Low 480x270; changing between those classes reloads).

Controls (P1): WASD move, Space jump/ollie/bell, Shift sprint, F mount/dismount/interact (hold near a bus rear on skates to grab), C or Left Ctrl manual, Q/E switch tool (slingshot, throwing stick, stick), mouse aim + left click, R block, V Kiai, T weather, Esc pause. P2: arrow keys, Right Shift/Right Ctrl/Enter, `;` and `'` for defend/kiai. Full table in `README.md`.

Checks: `node scripts/check-all.mjs` (37 checks, must stay green). Headless smoke test: see `docs/TESTING.md` (`scripts/bench-cdp.mjs --smoke`, ~770 checks). Performance notes: `docs/PERFORMANCE.md`.

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

Branch `main` holds everything. **33 of 79 stories are built**; all committed, 37 checks pass.

Built: epic 1 foundation (state/saves, day clock, players array, screen stack/HUD modules, map framework, content lint), epic 2 characters and two-player co-op (stories 2.1–2.5), epic 3 learning engine and ~900 Klasse 3 questions (Mathe, Deutsch, Englisch, Sachkunde, Science) plus grades module, epic 4 all eight lesson minigames (Mathe, Deutsch, Englisch, Erdkunde, Science, Musik, Kunst, Sport), epic 5 skating (skateboard, roller skates with bus grab, tricks and Style combo, real skatepark, vehicle ownership/racks/theft, buses hit the player comically), epic 6 stories 6.1–6.4 (throwing stick, stick, karate defense/Kiai, dojo with belts).

Playable characters: **Helena** (12), **Kilian** (10), **Lorenz** (8); looks and traits in `family-characters.md`.

## What to build next (user-decided order)

The user's feedback: the minigames and skating exist but are **not reachable** from play. Make existing content reachable first:

1. **8.3** School interior, timetable and lessons: lessons launch the minigames and record grades. (Biggest gap.)
2. **8.1** Home and morning (breakfast, bag packing).
3. **8.2** Commute with the 08:00 deadline, routes and tram.
4. **10.1** Shops: buy skateboard and skates (vehicles are locked until owned, unlock paths exist as actions only).
5. **9.1** Quest runner and phone booth triggers.
6. **9.8, 9.7** Missions (skate races/challenges, Kirmes range, friendship arc, stolen bike, grandma, lost homework).
7. **8.4–8.6** Surprise events, afternoon/evening, Zeugnis with promotion rule.
8. Then **epic 15 environment art** (user said houses, doors, fences, water and ground transitions look wrong; CAP-34, AD-30, 4 stories) and the rest (6.5 belt effects, epic 7 chase levels 3–5 and other chasers, 9.x activities, 10.x motivation, 11 HUD/settings, 12 living world, 13 audio, 14 polish).

**Parked by the user:** story **2.6 three-player co-op** (status `draft`). Do not build until asked.

## How to build a story (the workflow that worked)

1. `tickets.py ... mark initiative-schulweg-game <ref> in-progress`.
2. Spawn one Sonnet sub-agent per story (one at a time; stories share files like `GameScene.js`, so no parallel writers). Prompt shape:
   > Implement story `<ref>` "`<title>`" (entry id N in `_bmad-output/initiative-schulweg-game/<epic-slug>/tickets.toml`). First read `_bmad-output/initiative-schulweg-game/build-brief.md` and follow it exactly. Use free port `<unique>`. `<ADs that apply>`. Study `<existing modules to follow>`. Deliver `<concrete list>`, node checks registered in `scripts/check-all.mjs`, a smoke scenario in `scripts/smoke/`, README notes. Verify headless smoke and screenshots.
   The earlier stories' agent prompts are good templates (read the code and commit messages: `git log --oneline`).
3. Check the agent's report, run `node scripts/check-all.mjs`, then `scripts/finish-story.sh <ref> "Game <ref>: <title>" [<next-ref>]` (syntax check, mark built, commit).
4. If content or art is involved, take headless-Edge screenshots and actually look at them.

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
- Known flaky check: the headless smoke check "after the round trip bodies, display objects, textures, pools and map content are as before" (`worldDoors`) fails now and then, also on older commits. Unfixed. `scripts/check-chase.mjs`'s A* timing limit is deliberately loose (5 ms).
- Content to verify by a human: a few Sachkunde fun facts were written from memory (Madrid as a high capital, Lisbon's seven hills, Hamburg bridges vs Venice, first traffic light 1868); the cycling-age rule (children up to 8 on the pavement, up to 10 may) needs checking; a few Deutsch items (e.g. de-129, de-178, de-179) and perimeter items ma-198..200 may be Klasse 4 level.
- `ButtonMenu` reads keys directly (menu focus only), a known deviation from AD-10.
- Grading subjects in `data/grading.json` are `sachkunde` etc.; the Erdkunde/Musik/Kunst/Sport/Karate minigames use their own subject ids. Map them when story 8.3 builds the timetable and records grades.
- Co-op defaults (assumption, unconfirmed): money shared, grades/XP/learning per player, lessons side by side.
- Save format is version 5; migrations exist from v0 (`state/migrations.js`).

## Open questions for the user

- Which real phone is the 60 FPS reference device?
- Should co-op share money and keep grades per player (current default)?
- Klasse 3 boss bully name and trait (needed for story 7.3).
- Weekly usage: the previous session stopped at the user's 40% limit; ask what limit applies now.

## Environment notes

- Remote: `origin` = `https://github.com/JohannesRabauer/grand-theft-study.git`. The branch `prototype` is the old working branch; `main` is the integrated line.
- A git worktree `../grand-theft-study-preview` (branch `preview-epic5`) holds a frozen epic-5 snapshot served on port 8090 for playtesting; safe to delete (`git worktree remove ../grand-theft-study-preview`).
- BMad is set up in `_bmad/` (config in `_bmad/config.toml`; `_bmad/custom/config.user.toml` is personal and git-ignored and names the active initiative `initiative-schulweg-game`).
