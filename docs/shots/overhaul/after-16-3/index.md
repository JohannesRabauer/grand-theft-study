# After story 16.3

`node scripts/shots.mjs --label after-16-3` (Medium and Low, 64 shots). New: `<district>-evening` (19:45) and `<district>-night` (21:30) for every district except the old town and the park night, which already existed (appended after the interiors so the earlier shots keep their history). `lights` and `lightLimit` per shot are the active light count and the tier cap (Medium 24).

- Mood: cool dawn (06:30), neutral day, golden (18:30), orange (19:30), violet (20:20), blue night (21:00 to 22:00); ambient strength 1.0 (was 1.15, which exceeded the art bible 0.5 alpha) and the night vignette 0.12 (was 0.22). Street lamps (74, three post shapes, lit head sprite), the four park lamps, shop and tram-stop signs and the vehicles' headlights and tail lights switch on between 18:30 and 19:30 (staggered, 1.2 s warm-up flicker, 2.5 Hz at most).
- Night walkable luminance p5 (limit 0.16): oldtown 0.235, park 0.258, school 0.238, skate 0.270, plaza 0.249, road 0.167, market 0.167, riverside 0.162. Active lights at night: 1 to 13 of 24.
- Moving headlights show in `road-night` and `riverside-night` (a bus and a car in view); the other districts have lamps and signs only because no road vehicle drives through them.
- Metrics against after-16-2 (same shots): day shots unchanged within noise; `oldtown-evening` largest flat area 7644 to 8383 px (the golden hour tint merges more colours); `oldtown-snow` differs only by crowd and camera noise (the flat metric swings with who walks by).
- Still unfinished: grass fields stay flat (16.5), shadows are the old blobs (16.4), the lit heads of the park lamps are the old baked glow.
