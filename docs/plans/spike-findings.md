# What the spikes while driving are: findings (round 2, item 1)

Measured on the build Mac with `tools/spikeprobe.mjs` (new), the same route as
`tools/fpsprobe.mjs --route` (Combe Down → town and back, 2.7 km at 20 m/s). The probe drives the
route and, for every frame over the threshold, records:

- the game's own JavaScript for that frame, split into the match update, the shadow pass and the
  rest of drawing;
- how that frame's `Tiles.update` was spent — a square's map **setup** (collision, walls, streets),
  its scenery **build**, and the per-square `world.update`s;
- the parts of `World.update` that run every frame: trees, grass, lamps, the far map, and the
  daylight/lamp placement block;
- any shader program compiled for the first time (three.js compiles one the first time a material
  is drawn, and the compile is a stall), named by its cache key;
- scene objects added or removed, squares first seen, and rubbish collections;
- long tasks the browser itself attributed (`longtask` entries).

Run: `cd web && npx vite build && node ../tools/spikeprobe.mjs --out spikes --over 30`

## What the spikes are

Across two legs (~60,000 frames), 12 frames went over 30 ms. Classified:

| what | count | worst |
|---|---|---|
| a square's map **setup** in one frame | 3 | 33 ms |
| a square's scenery **build** in one frame | 5 | 32 ms |
| a **shader** compiled mid-drive | 2 | 34 ms |
| one frame in `Game.update`, unaccounted | 1 | 43 ms |
| outside the game (almost no game JavaScript) | 1 | — |

## Conclusions

1. **Shaders are not the main cause.** Only 2 of 12 spikes involved a compile, and each was ~30–34 ms.
   The programs that compiled were `lambert` variants (`lambert highp srgb-linear uv`,
   `lambert highp srgb-linear 1`, `16 17 highp srgb-linear`). Worth precompiling at load, but it is
   not what the 50–100 ms spikes are.

2. **The per-square map setup is a real cause, and it is not sliced.** Three spikes were a single
   frame doing 12, 28 and 33 ms of setup, with nothing else in them. This is `GameMap.build()` in
   `map.ts`, which yields every so often — but one slice can still be 30 ms. **This is item 3 on the
   list, and it should be done: it is the same fix step 4 applied to the scenery build.**

3. **The scenery build still has long slices too.** Five spikes were 5–32 ms of build in one frame,
   the worst being 32 ms. Step 4 cut the long slices a lot (17–35 ms → 11–14 ms typical) but did not
   get every one under the budget: the remaining ones are in the parts step 4 did not touch.

4. **The 50–100 ms spikes seen in earlier runs did not appear at all in this run** (worst frame 42.6 ms,
   and only one spike was unexplained by the game). `tools/fpsprobe.mjs` has seen 98 and 143 ms frames
   on the same route. The difference is the machine's load: those runs were while other agents had the
   Mac busy. So the very worst numbers were probably contention, not the game.

5. **Nothing in the spikes was a rubbish collection**, and only one was outside the game's own code.

## What to do next, in order

- **Item 3 (slice the map setup)** is confirmed worth doing, and now has evidence: 3 of 12 spikes.
- **Item 2 (parse the square files in a worker)** — the probe measures parsing separately (4–9 ms a
  square, `reading a square's file` in `fpsprobe`); it did not show up as a spike in its own right,
  because it happens in a `fetch().then()` outside the measured frames. It is still 5–9 ms off a
  frame each time a square loads, so it is worth doing, but it is *not* what the spikes are.
- **Precompiling the shaders at load** is a small, separate win (2 of 12 spikes).

## Caveats

- One run, two legs, ~60,000 frames. The counts are small, so the ranking is clearer than the exact
  numbers.
- The Mac was not idle for all of it (other agents' work); the "outside the game" spike and the
  unaccounted one are both consistent with that.
- `game.update` is only split into update/shadow/draw at the top level, so a spike inside the match
  itself (as opposed to the world) shows as part of `update` without a finer breakdown.
