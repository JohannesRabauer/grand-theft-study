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

Areas so far: `prototype-core` (bike ride, slingshot, weather, language, quality, pause), `chase`, `crowd`, `screens`, `players`, `day`, `state`.

## Benchmarks

`node scripts/bench-cdp.mjs --url http://localhost:8080` and `node scripts/zoom-sweep.mjs`; see docs/PERFORMANCE.md.
