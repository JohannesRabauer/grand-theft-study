# Cross-browser and device checklist (story 14.4)

What runs automatically and what a person has to look at. The automatic part is `node scripts/check-all.mjs` (every push, GitHub Actions) and
`node scripts/bench-cdp.mjs --url http://localhost:8123 --smoke` (headless Edge/Chrome, run by hand; includes the full-day scenario solo and co-op).

## Automatic (already covered)
- Data, logic, texts, content safety, tone, balance, audio, music, PWA, gamepad mapping: the node checks.
- A whole game day (morning, commute, school, afternoon, evening, bedtime, Zeugnis, next morning) with one and with two kids, through the real day flow: smoke scenario `fullDay`.
- Chrome-family browsers (Edge headless): the whole smoke test, 1287 checks at the time of writing.

## By hand, once per release (tick in the pull request or the handoff)
Use the published page (https://johannesrabauer.github.io/grand-theft-study/) after a hard reload (Ctrl+F5), or the local server with "Disable cache" on.

| Check | Chrome / Edge | Firefox | Safari (Mac / iPad) | Android Chrome | iOS Safari |
|---|---|---|---|---|---|
| Menu opens, Start, character select with keyboard / touch | [ ] | [ ] | [ ] | [ ] | [ ] |
| Walk out of the house, ride to school, the 8:00 bell | [ ] | [ ] | [ ] | [ ] | [ ] |
| First tap or key starts sound; music changes at the next phase | [ ] | [ ] | [ ] | [ ] | [ ] |
| Sound off in the parent settings is silent | [ ] | [ ] | [ ] | [ ] | [ ] |
| Gamepad: move, jump, interact (Y), pause (Start), phone (left stick click) | [ ] | [ ] | [ ] | - | - |
| Touch: joystick and buttons, phone badge tap, rotate hint in portrait | - | - | [ ] | [ ] | [ ] |
| Rain and snow look right, no flicker of puddles or snow tiles | [ ] | [ ] | [ ] | [ ] | [ ] |
| Install as an app (Chrome: install icon; Safari: Add to Home Screen) | [ ] | - | [ ] | [ ] | [ ] |
| Offline: load once, then switch Wi-Fi off and reload: the game still starts | [ ] | [ ] | [ ] | [ ] | [ ] |
| Save, close the tab, open it again, Continue | [ ] | [ ] | [ ] | [ ] | [ ] |
| German and English both fully translated (switch in the menu) | [ ] | [ ] | [ ] | [ ] | [ ] |

Known browser differences to watch: Safari starts audio only after a touch (the first tap does it), iOS Safari has no gamepad API for some
controllers, Firefox renders canvas text a little differently (the HUD may look half a pixel off).

## Performance
Medium must hold the update budget (`docs/PERFORMANCE.md`, "Results"), measured with the stepping benchmark. The frame rate on a real phone is
measured with the protocol in `docs/PERFORMANCE.md` ("Manual phone test protocol"): about two minutes of the commute, then the pause menu tier
switch; write down phone model, browser, tier, lowest and typical FPS.

### Real-phone protocol, short form
1. Open the published page on the phone, add `?debug&q=medium` to the address, rotate to landscape.
2. Play: bike to school, skatepark chase until level 3 (several bullies, gang), a lookout, rain or snow in view, the minimap open (M on a keyboard).
3. Read the FPS counter: 60 target, below 45 for more than a few seconds is a fail; then repeat on `q=low`.
4. Report: model, browser, tier, lowest and typical FPS in walking, riding, chase, weather.
