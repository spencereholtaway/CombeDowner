# Frame rate, round 2: handover plan

Written for an agent picking this up cold. Do the steps in order. Each step says which files to
touch, what to do, how to check it, and when it is done. Don't skip the checks, and don't do two
steps in one commit: each one is measured on its own.

## What you need to know first

- The game is CPU-bound, not GPU-bound. Each frame's time goes on the browser handing draws to the
  graphics card (about 5 µs each). Triangles and resolution hardly matter. **Fewer draw calls is
  the lever**, so every step here cuts the number of separate meshes drawn.
- The maintainer's main (`3808bf4` and `3d8a3f2`) already did the following. Don't redo any of it:
  scenery in a square of Bath no longer recomputes its positions every frame (`stayPut` in
  `world.ts`), far squares are drawn simpler, ponds are merged, tree patches are bigger, far trees
  are flat pictures, and antialiasing is off on the screen.
- Work happens on `claude/fps-round2` in the fork, which branches from
  the maintainer's main. **Nothing goes to the maintainer's main until the co-developer says so.**
- **Never measure frame rate or take screenshots in a cloud container.** All of that runs on the build
  Mac through the Mac queue (the project instructions explain how: a `macq-<name>.req.md` file in
  `/mnt/project-files`, then tell the coordinator). Frame-rate runs must be `alone: yes`.
- The Mac's numbers are noisy: the same commit can vary by ±20 fps between runs. Compare
  before and after in the **same** request, alternating them (A, B, A, B), and trust draw-call
  counts more than fps.

## The tools (already on the branch)

- `tools/fpsprobe.mjs`: stands at 7 spots and measures fps, the JS time per frame (update, shadow
  and draw) and the draw calls, with a count of **what the draws are of** (`draws by kind`).
  `--route 1` also drives from Combe Down into town and back, and reports frame-time spikes and
  how long each square took to build, including its longest single slice. Typical run:
  `cd web && npx vite build && node ../tools/fpsprobe.mjs --out ../probe --secs 5 --variants base`
- `tools/pickupshots.mjs`: close-ups of all 14 kinds of pickup, held still, for before and after
  checks.
- `world.ts` names each part of a square (`mark("buildings")` and so on), and that's where the
  probe's kind names come from. Draws listed as a bare material type (`MeshLambertMaterial`) are
  things outside the squares: vehicles, players, pickups and naughty boys.
- `tiles.ts` records each square's setup and build time when `globalThis.__tileStats` is set
  (only the probe sets it).

## Baseline (the maintainer's main, the build Mac, 1280x720)

| spot | fps | draws | biggest kinds |
|---|---|---|---|
| southgate | 115–147 | 804–835 | pickups ~350, landmarks 106, buildings 99 |
| roman-baths | 143–162 | 739 | pickups ~250, landmarks 106, buildings 100 |
| abbey-yard | 158–179 | 648–675 | pickups ~180, landmarks 91, buildings 78 |
| combe-down | 184–233 | 535–632 | furniture 75, trees 64, buildings 61 |

Driving at 20 m/s: about 30 frames over 16.7 ms in 2.7 km, the worst 98 ms. A square takes
100–220 ms of building in total, and its longest single slice is 11–31 ms.

---

## Step 1: merge the pickups (DONE on the branch, `2ab30e5`)

`web/src/pickups.ts`, `merged()`: each pickup model (trolley, bike, bottle and the rest) is
flattened into one mesh per look when it's made. Result on the Mac: southgate went from 804 to
579 draws and from 147 to 193 fps, and every spot was faster.

Fixed in `0d81f1b`: the first version merged the sniper's paintball and real-gun parts together,
so both showed at once. `merged()` now keeps anything tagged with gore.ts `look()` in a group of its
own. **Any later merge (step 3) must do the same.**

**Still to check:** compare the close-ups from `tools/pickupshots.mjs` (request `macq-fps4-31013d7`)
by eye, old (A) against new (B). Every kind must look the same, with the same colours, labels and
wheels. If one looks wrong, its parts probably had different vertex attributes: look at what
`merged()` deletes.

## Step 2: shadows every other frame (on the branch, `ab583d5`; kept)

`web/src/main.ts`, in `frame()`: `renderer.shadowMap.autoUpdate = false`, and `needsUpdate` is
set on every other frame. This halves the shadow draws and the shadow time (about 1 ms down to
0.45 ms in town).

The first measurement overlapped another browser on the Mac, so it's unreliable (`macq-fps4`
re-runs it B, C, B, C).

Re-measured in `macq-fps4`, alternating B, C, B, C: the shadow time halves every time (about
0.55 ms down to 0.3 ms), and fps averaged about +4%, within the noise. It's kept as a small,
safe win.

**(Original rule:)** keep it only if C beats B in both runs at most town spots. Otherwise revert
`ab583d5` with `git revert` and move on. Players can't see the difference at desktop frame rates.
On a phone at 30 fps, a fast car's shadow trails by about half a metre.

## Step 3: merge the landmarks and set pieces

They make 60–106 draws in town (Abbey, Roman Baths, Grand Parade, the Empire and so on), because
each model is built from many separate meshes.

1. In `web/src/landmarks/index.ts`, `buildLandmarks()`: after `obj` is built and placed, and
   before `scene.add(obj)`, call a new `mergeStatic(obj)` (put it in `landmarks/kit.ts`).
2. `mergeStatic(root)`:
   - `root.updateMatrixWorld(true)`, then walk the tree and collect the meshes that are **safe to
     merge**. That means a plain `THREE.Mesh` (not Instanced, Skinned, Points, Line or Sprite) with
     one material, an empty `userData` (the Abbey's angels carry `userData.ghost`, and anything with
     `userData.moves` moves), no `name`, and no animated ancestor.
   - Group them by **material instance** (not by colour): `glow()` in `kit.ts` sets an
     `onBeforeRender` that changes that material's `emissiveIntensity` at night, so the merged mesh
     must keep the same material and copy over the `onBeforeRender` of any member that had one.
   - For each group with 2 or more meshes, take each geometry (`toNonIndexed()` if it's indexed, keep
     only the `position`, `normal`, `uv` and, if the material uses vertex colours, `color`
     attributes, and add a zero `uv` if one is missing), apply that mesh's matrix *relative to
     root* (`root.matrixWorld` inverted, times `mesh.matrixWorld`), and `mergeGeometries`. If the
     merge returns null, leave that group alone.
   - Remove the originals and add one mesh per group to `root`, with `castShadow` and
     `receiveShadow` true. Copy `pickups.ts` `merged()` as the starting point.
3. Set pieces (`landmarks/setpieces.ts`) go through the same `buildLandmarks`, so they're
   covered. If any of them is added somewhere else, call `mergeStatic` there too.

**Check:** `npm run build` passes. Mac request: fpsprobe A (before) against B (after), alternated
twice, plus `npm run shoot` views of the Abbey west front, Roman Baths, Grand Parade, Pulteney
Bridge, the Empire and Prior Park, before and after. They must look the same: night glow too, so
shoot one view with `time=22:00`. Climbing the Abbey must still work, and so must the angels:
check with `tools/climb_probe.mjs`, which only needs collision and so should be unaffected.

**Done when:** "landmarks-tunnels" draws in town fall from about 100 to about 30 or fewer, the
shots match, and the climb probe still passes.

## Step 4: split the long building slices (cuts stutter while moving)

A square is built a few milliseconds a frame (`BUDGET = 6` in `tiles.ts`), but the budget is only
checked *between* slices. Some single slices take 15–31 ms on the M4 Max, which is several times
that on a phone, and those are the stutters.

1. Find them: temporarily record, in `worldGen` (`world.ts`), the time between each `yield` and
   the line number or name of the step (use the `mark()` names). Run `fpsprobe --route 1 --spots none`
   on the Mac. List every slice over 4 ms.
2. Split each long one with more `yield`s inside its loop (for example every N buildings, every N
   barrier pieces, or per wall chunk). Likely suspects are `buildFurniture`, `buildShops`,
   `buildGrass`, `buildVegetation` (it builds everything without yielding), the road strips and the
   buildings' `geo.build()`. Do the same for `GameMap.build()` in `map.ts` (setup) if its slices are
   long.
3. Remove the temporary timing before committing.

**Check:** the route's "longest slice" for every square is under about 5 ms, the frames over 16.7 ms
during the drive go down, and the total build time doesn't go up much.

## Step 5 (big, optional; ask the co-developer first): bake squares at build time

Each square's scenery (terrain sunk under the streets, road and pavement strips, buildings with
their roofs, walls, fences, canopies) and its collision setup are worked out in the browser from
the square's JSON, which takes 100–220 ms per square on the Mac. It's all deterministic, so it
could be done once in the map build and loaded ready to draw. This removes the stutter and the
loading work, but **not** the steady frame rate. Don't start this without the co-developer's go-ahead: it
touches the map build, and the project rule is that map build changes go to the fork and are
checked by the co-developer before anything else.

Outline, if the co-developer says go:
- Add a Node step after `prep_tiles.py` (`tools/bake_squares.mjs`) that imports `world.ts`'s
  builders with the canvas textures stubbed out, runs `worldGen` for each square, and writes each
  mesh's typed arrays (position quantised to 16 bits, normal, uv, colour, index) and a material
  key to `public/maps/combe-down/<ti>_<tj>.bin`.
- In the game, `tiles.ts` fetches the `.bin` alongside the JSON and builds `BufferGeometry` straight
  from it with the shared materials, falling back to `worldGen` if it's missing.
- Measure the download size before and after. Geometry is bigger than the JSON it comes from, so
  this is a trade.

## Not worth doing (measured, no gain)

Lower resolution, antialiasing, the night lights, splitting roads into blocks (fewer triangles, but
more draws), and a smaller shadow map.
