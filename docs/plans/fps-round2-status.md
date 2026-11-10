# Frame rate, round 2: where it has got to

For checking over. The plan itself is `docs/plans/fps-round2.md`; this says what has been done
against it, what the numbers were, and what is left.

All figures are from the build Mac, route 1 of `tools/fpsprobe.mjs` (Combe Down → town → back, 2.7 km
at 20 m/s) unless it says otherwise.

## Shipped, live on the maintainer's `main`

| step | what it does | evidence |
|---|---|---|
| **1. Merge the pickups** (`2ab30e5`, fix `0d81f1b`) | each kind of thing to pick up is one mesh per look, not dozens of parts | southgate 804 → 579 draws; every spot faster. Sniper fixed so paintball and real-gun parts stay apart |
| **2. Shadows every other frame** (`ab583d5`) | `shadowMap.autoUpdate = false`, updated on alternate frames | shadow time halved (≈0.55 → 0.30 ms); fps level within noise |
| **3. Landmarks in fewer pieces** (`89d194f`) | a set piece's stone in several tints is one draw (vertex colours); the village's plain landmarks merge the same way | `landmarks-tunnels` draws **106 → 81**, **91 → 70**, **67 → 51**; A/B/A/B: faster in **8 of 8** runs, **+3 to +12 fps** |
| **4. Split the long build slices** (`1a36e42`, PR #16) | a square's scenery is built in shorter slices, so it doesn't stutter going up | longest build slice, way back: **17.7/23.4/35.7 → 12.9/10.9/11.0 ms**; frames over 16.7 ms **19.0 → 12.3** |

Steps 3 and 4 were measured with the Mac reasonably quiet. Step 3's checks: climb probe 11/11,
day and night screenshots of the Abbey, Baths, Grand Parade and Prior Park effectively identical
(≤107 pixels of 2.77M differing).

## Done, checked, but NOT shipped

**Item 3: slice the per-square map setup** — branch `claude/fps-spikes`, 9 commits.

The spike probe (`tools/spikeprobe.mjs`, also on that branch) found that the frames that stutter
while driving are **not** shaders. They are a square's map setup — collision, walls, streets —
landing 28–33 ms in a single frame, because `map.ts`'s setup only yielded every 200 buildings / 400
barriers / 6000 cells.

The change makes setup yield on **the clock** (about 4 ms a slice) rather than on counts, which is
what the dense squares in town needed. It also puts the set piece's own shape grid
(`landmarks/shape.ts`) and the football ground's stands on the same clock.

- `npm run build` passes.
- **Climb probe: 11/11 on both the old and new trees**, run on A first as a control, so a drop on B
  could not be blamed on the probe. Both through the project's own sound guard.
- **Frames were NOT measured.** Three attempts were wrecked by other work on the machine (300–736%
  CPU from other agents and Docker): the same unchanged code gave worst frames of 70, 148 and
  409 ms, which is noise, not a baseline. Saying "frames no worse" would be making it up.

What *is* known about the remaining slice: a set piece's **model** is built in one synchronous call
(16–26 ms for Prior Park and its wings) before its shape is worked out. That is outside the setup
generator, so the clock cannot reach it — it would need each builder turned into a generator. Left
alone deliberately; it happens only in those squares, once per visit.

**Recommendation: ship it.** It only adds pauses, so it cannot make the steady frame rate worse in
any way that matters, and step 4 already showed that adding pauses leaves fps level.

## Found while doing the above, and deferred

A non-finite number reaching a sound's `setTargetAtTime` throws, and because `frame()` commits the
next frame on its last line, that **stops the render loop and freezes the game**. Real, seen once.
The cause was not found: four traps, including a wrapper on `setTargetAtTime` itself, all failed to
fire in 140 s of driving and map-crossing. Written up in `docs/plans/nan-audio-bug.md`, on branch
`claude/vehicle-nan`, with the one untried experiment recorded. **Not** fixed, and not part of this
work.

## Left to do

| item | what | state |
|---|---|---|
| **Prior Park's shape** | it takes **1109 ms** to work out, every time the square loads. The model is fixed in code, so its shape is always the same: work it out once at build time and ship it as a small file, or at least once per page. Check whether any other set piece is close to that figure | not started |
| **Item 2** | read the square files in a Web Worker, taking the 5–9 ms parse off the frame each time a square loads | not started |
| step 5 | bake squares at build time — the biggest win, but it changes the map build and needs a full rebuild on the Mac, so it needs a go-ahead | not started |

## One lesson for future frame checks

The wait for a clear Mac must check **CPU under about 100%**, not just that no other probe is
running. Two of the wasted runs above looked "quiet" by the probe test and were not by any other
measure.
