# The non-finite audio value: what is known (guarded, cause not found)

A sound's `setTargetAtTime` throws `The provided float value is non-finite`, and because
`main.ts`'s `frame()` calls `requestAnimationFrame(frame)` on its **last line**, a throw inside
`game.update` stops the render loop: **the game freezes and the tab goes dead**. That is the part
that matters. It is not a console warning.

Seen once, in a frame-rate run on the maintainer's `main` (`tools/fpsprobe.mjs --route`, 282 s over the
full route). Its back leg recorded **1,234,859 "frames" with zero JavaScript** — a dead loop being
counted, not a game at 9,000 fps. So the freeze is real and the throw is what causes it.

## What is in the game now

`audio.ts` wraps the browser's own sound-setting calls (`setValueAtTime`, `setTargetAtTime`, the two
ramps and `.value`). A non-finite value is dropped instead of thrown, so the game keeps running, and it
is reported loudly: `console.error` once per place it came from, with a stack, and up to 100 entries
in `window.__badParam`. That is the "guard that reports loudly" asked for below. The cause is still
unknown: a probe that sees anything in `__badParam` has found it.

## What is certain

- The throw is real, and it stops the frame loop (the one line that commits the next frame).
- A single bad number **latches for ever** in the places it lands:
  - `ambience.ts`: `N.town += (W.town - N.town) * k` — one NaN `k` or NaN target leaves all three
    of town/woods/open NaN, and 100 good frames after do not recover them.
  - `vehicles.ts`: `this.rpm += (Math.min(1, want) - this.rpm) * Math.min(1, dt * 8)` — same latch.
  - `clamp` does not help: in JavaScript `Math.min(1, NaN)` is `NaN` (unlike Python's `min`).
- So the failure is permanent once it starts, and throws every frame after.

## What is NOT known

**Where the bad number comes from.** That is the open question, and it is why this is deferred.

## What was tried, and what it ruled out

Three probe runs (`tools/nanhunt.mjs`), all with sound off and the game's own checks switched on:

| check | where | result |
|---|---|---|
| car physics (52 cars driven hard, 100 s) | `vehicles.ts` | **nothing** — rules out the engine note's `rpm` |
| frame clock (`raw`/`dt`) | `main.ts` | **nothing** |
| ambience values, crossing the map at 24 m/s | `ambience.ts` | **nothing** |
| a wrapper on `AudioParam.setTargetAtTime` itself, printing a stack | `audio.ts` | **nothing** |

The last one is the important negative: it wraps the browser's own method, so **any** call passing a
non-finite value would have reported itself with a stack, whatever its source. It did not fire in
140 s of driving and map-crossing.

So either the trigger needs conditions those runs did not reproduce (the original was 282 s over the
route **twice**), or the exception has a source not yet considered.

## What to do next time

1. Run the hunt at the **exact shape of the failing run**: 282 s, the full route both ways, all four
   traps armed (`__paramHunt`, `__ambHunt`, `__dtHunt`, `__badVehicleHunt`). That is the one thing
   not yet tried, and the most likely reason nothing fires.
2. If it still does not fire, the bug is not reproducible on demand. Then the options are a
   long-running soak (a parked game left playing for hours) or a defensive fix, accepting that the
   cause stays unknown.
3. Do **not** "fix" it by clamping values or skipping the update silently: that would hide the
   freeze, not stop it. Any guard must report loudly.

## What is on the branch

`claude/vehicle-nan`, five commits, nothing shipped. Each trap is off unless its flag is set
(`__badVehicleHunt`, `__dtHunt`, `__ambHunt`, `__paramHunt`), so they cost nothing in a normal build
and are safe to keep as the starting point for the next attempt. `tools/nanhunt.mjs` drives and
crosses the map with all of them armed.
