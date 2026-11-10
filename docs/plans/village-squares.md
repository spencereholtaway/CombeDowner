# Handover: the village loaded as nine ordinary squares

Written 2026-10-15 for the agent taking this over. Branch `claude/village-squares` on the fork
(the fork), at the commit that adds this file. The original plan and its reasoning are in
`/mnt/project-files/combe-downer/village-squares/plan.md`; this file says what is done, what is left,
and how to finish it. The prompt to start an agent on it is at the bottom.

## The goal

Combe Down's nine squares (0..2 each way) load exactly like every other square of Bath. There are no
special cases apart from the minigames (the mines and the deli). The result has to be **proved the
same** as today's village, using a probe on the build Mac. The minimap also gets the village's 4 m ground
detail everywhere in Bath.

The co-developer's words: "those sound fine if we do it carefully and dont merge anywhere without confirmation".

## Rules for this work (the co-developer's, all still in force)

- **Nothing is merged into any `main`** (the fork's or the maintainer's) **without the co-developer saying so.** This
  overrides the "merge and push main straight away" line in `CLAUDE.md`. Work on
  `claude/village-squares` and push only there, plus `claude/village-squares-data` for rebuilt map
  files. When the co-developer does say merge, the maintainer's `main` is pushed through the project's coordinator.
- **No browser runs in the cloud container**: no screenshots, frame rates or probes there. All of
  that runs on the build Mac (see "Running things on the Mac").
- **Mac runs are muted, headless and never grab focus**, and leave no Chrome, node or server running.
- **Map work goes to the fork first.**
- **Talk to the co-developer simply.** He has asked several times for plain explanations. Lead with the answer.
- Commit trailer, and messages in the repo's style (a plain sentence about what changed for the player).

## What is done (all on the branch, build passes)

| Commit | What it does |
|---|---|
| 6b192b0 C0 | `tools/probe_map.mjs` records what the game makes of each village square: ground, floors, indoors, collision, tunnels, `detailedAt` every 7 m; rays every 25 m; per-square feature counts. `--compare A B` sorts differences into *seam*, *edge* and *elsewhere*. `tools/village-views.json` holds 23 views. `main.ts` exposes `window.__map`. |
| 1e320a7 C1 | `map.ts` `tunnelFloor` asks the square too (fixes the Combe Down tunnel once it's in a square, and the underpass in square -1_-2 today). |
| e5603b6 C2 | A map can have no ground of its own: `MapData.t` and the lists default to empty, and `z0` lives in the header. `world.ts` skips grass, and `minimap.ts` skips the village picture, when there's no grid. `tools/village_squares.py` lays today's village out as nine squares to try it. |
| 393992d C3 | Gameplay reads every area instead of only `map.d`. **Vehicles:** start-up cars, the Firs bus and waiting buses come from `startWith`/`startIn` per square, with ids `TILE_CAR + key*65536 + START(64000) + n`. **Pickups:** 6 roaming pub-pint slots at pubs near players anywhere. **Mine and deli doors** are found in whichever square has them (`find()`, retrying on `tilesVersion`). **Fox Hill** is checked per area. **Signed pubs** come from `areas()`. |
| bc79d8f C4 | Start-up waits: `tiles.ts` `hold(x, z, r)` pins squares and reports when they're in, and `MAX_OTHERS` goes from 6 to 12. `main.ts` `startReady()` keeps the menu busy until the spawn ring's squares are in (`START_REACH = 150`), and also covers the way back up from the mines. `game.ts`: a landing outside loaded detail settles once its square is in, and a return from the mines or deli waits for its door. |
| fac0c41 C5 | Map tools: `prep_tiles.py` writes the nine with the rest and lists them in `tiles.json`. `clear_seams()` runs over every square's seams. `write_header()` writes the small `combe-down.json`. `stitch()` moves to `tools/stitch.py` for `build_single.py` only. `prep_wide.py` takes the village in and reads its heights from the nine. `pubs.py`, `check_map.py`, `square_at.py`, `mac_build.sh` and the docs follow. |
| 7fa920b | 4 m minimap ground everywhere: `tools/ground_kinds.py` writes `web/public/maps/<map>-ground.json` (about 0.2 MB gzipped) from every square. `web/src/groundkinds.ts` paints it over the 12 m wide ground in `minimap.ts` `paintWide` (whole map, the corner patch and the sharp zoomed patch). `map.ts` `loadMap` fetches it. |
| e203d42 | Merged fork `main` d97a3c3. Main's new seam rule (a front path crossing a neighbour's wall, fence or hedge goes) is kept: it's `path_clear()` in `tools/stitch.py`, used both by `stitch()` and by `clear_seams()` for every square. `ground_kinds.py` runs in the rebuild recipes: README, `mac_build.sh`, and the workflow's commit job, after all squares are in. |

**The committed map data is still the old layout** (the village stitched into `combe-down.json`). The
new code runs on both layouts, and the data switches in step 2 below.

## Results so far on the Mac

- **c0 (baseline, on 6b192b0):** `/mnt/project-files/vsq-c0-probe.json`, 23 shots
  (`vsq-c0-*.png`), and the clash check (`vsq-c0-check.txt`). A self-compare says "none".
- **c2 A** (today's data, new code): exact match with the baseline. C1 and C2 change nothing.
- **c2 B** (nine squares rebuilt with today's tools, then loaded as squares):
  - The game starts and there are no page errors.
  - Small ground and floor differences away from the seams (22-113 points), e.g. (-1383.5,-1341.5):
    138.23 → 138.14. There are 20 fewer boundary pieces (`br`). These come from rebuilding the squares
    with newer tools, not from loading them, so c5 compares like with like (below).
  - `spawn 19 → 38` is a **probe artefact**: the header and square 1_1 both carry the spawn ring, and
    the probe counts both. The game reads only `map.d.spawn` (`game.ts` ~848). Fix the probe to count
    `spawn` from the root only.
- **c5** (`/mnt/project-files/macq-vsq-c5.req.md`) **was running when this was written**:
  - A full map build of e203d42 with the clash check and village shots, pushed to
    `claude/village-squares-data`.
  - Then two probes of the same squares: S (loaded as squares) and V (stitched back into one file,
    the old way).
  - `vsq-c5-compare-loading.txt` (V against S) is **the one that matters**: anything in *elsewhere*
    is a loading bug.
  - `vsq-c5-compare-baseline.txt` is for the record only.
  - Read `macq-vsq-c5.done.md` and the `vsq-c5-*` files first.

## What is left, in order

### 1. Read c5 and fix loading differences

- For each *elsewhere* difference in `compare-loading.txt`, find the cause in the game code (not the
  data) and fix it. The probe's JSON has every sampled point, so diff the two files for the exact
  places.
- Expected only at seams and edges: terrain easing at square edges, walls on the outer edge,
  pavement lift at seams, and shrubs or front paths in gateways.
- Check `vsq-c5-check.txt` against `vsq-c0-check.txt`. Rule 9 counts must not go up. If they do, find
  out whether it's the newer tools (compare with fork main's own last clash check) or the C5 changes.
- Look at the c5 shots against the c0 shots of the same names, especially the seam views
  (`seam-x0-*`, `seam-y0-*`, which runs through Church Road).

### 2. Ship the data (the plan's C6)

- Merge `claude/village-squares-data` (the Mac's rebuilt map files) into `claude/village-squares`.
  It brings:
  - the nine as `web/public/maps/combe-down/{0..2}_{0..2}.json`, listed in `tiles.json`;
  - `combe-down.json` down to a few hundred bytes (no `t`);
  - `combe-down-wide.json` with the village in it, and the pubs and ground files.
- Check that `combe-down-ground.json` came from the rebuild. If not, run
  `python3 -I tools/ground_kinds.py combe-down`, which needs only Python.
- Run `cd web && npm run build`.
- Then a Mac run on the merged commit:
  - probe and compare against c5's S (it should match);
  - the 23 village views plus `--play` solo games in the village (`0,0,0,0`), at Church Road
    (`-300,-250,0,0`) and in town (`2400,700,90,0`);
  - a run of the way back up from the mines (`?go=1` in the mines, or `minetour`) to check the
    return lands outside the door.

### 3. Loose ends found in the code

- **Waiting buses out in Bath: done.** The co-developer answered (2026-10-15): buses go all over Bath, doing what
  they do in the village today — a double-decker or minibus parked at the kerb at some stops (the
  same 1-in-3 chance, `startWith`), waiting until someone gets in and drives one. Nothing new drives
  itself; buses are not part of the traffic (`traffic.ts` is cars only).
  - `startIn()` now hands each square its own stops (`stopsIn(m)`) and tags the ones it waits at, so
    a square remembers its waiting buses by number and nothing else about its cars moves.
  - `Vehicles.dropSquare(m)`, hooked up as `map.onTileGone` (new in `map.ts`, called from
    `dropTile`), takes those buses away when their square leaves, so a drive across Bath doesn't
    pile every bus it passed into the list the host sends round every 2 s. A bus someone's in,
    driving, or out of within the last minute is kept (the `usedAt` rule).
  - `busOwn()`: a bus's body box, floor planes and floor material are now built once per kind and
    shared, as `geos`/`busMats`/`paints` already were for everything else, so a bus can be removed
    without leaking what it built.
  - Answering a bus call already worked anywhere in Bath (`stopsNear`, `stopNear`, `callBus`).
  - Follow-ups the co-developer's review of 6db5abf raised, all done: `started` is recorded even when the vehicle
    already exists, so a guest that becomes host still sends `k` for the buses it built from the old
    host's word; `spawnStarted` rejects a kind or paint that isn't real (the field arrives from
    another player); and a guest lets go a start-up vehicle the host has stopped listing, unless
    someone's in it, so the host's cull doesn't leave ghosts standing still on guests.
- **`debug.ts` ~262:** it decides "the village" from `m.d.b`, which is now `[0,0,0,0]`. Name the
  square from `tileIndex` instead (squares 0..2 each way are "Combe Down").
- **The probe's spawn double count** (above).
- **`game.ts` ~886:** the street-name list reads `D.rd` (now empty) then `wide.rd`. That's fine,
  since the wide map now has the village's streets, but check the HUD street name in the village in
  the `--play` shots.
- **Hackney and the single-file build:**
  - `?map=hackney` still has its own `t`.
  - `tools/build_single.py` now stitches the nine into `dist-single/<map>-village.json` when the
    header has no `t`. Build it once (`python3 -I tools/build_single.py`) after step 2 and check it
    loads.
  - Get one Mac shot of each, before and after.
- **The minimap's other two items from the plan**, not done yet:
  - the wide map's tunnels drawn dashed on the minimap (prep_wide would need to write a `tn` list,
    and `wide.ts` and `minimap.ts` draw it);
  - names on short streets on the big map.
- **Network ids changed** for village pitches, cars and buses. A player still on an old page in the
  same room disagrees until they reload. That's accepted; say so in the merge message to the co-developer.
- **`NOTES-FOR-AGENTS.md`:** keep the "in progress" entry up to date. Its older "Village built as 9
  normal squares (done, on main)" entry says game code reading `map.d` is unchanged, which stops
  being true at merge: rewrite it then.
- **`CLAUDE.md` and `README.md`** on the branch already describe the new layout (C5). Check they're
  still true after step 2.

### 4. Report to the co-developer and wait

- Write the co-developer a short, plain summary: what changed for players (nothing visible except the sharper
  minimap and pints at pubs in town), the c5 loading comparison, the clash counts, the waiting-bus
  question, and a link to the shots.
- **Then wait for his "merge".**
- On his word:
  1. Fetch both mains.
  2. Merge `origin/main` (and the maintainer's main) into the branch, keeping both sides.
  3. Build.
  4. Push the branch.
  5. Ask the coordinator to merge it to the maintainer's `main`.

### 5. Later (the plan's C7, not part of this)

- Wide-map heights from every square, not just the village.
- Neighbouring squares' roads at seams.
- The cable car's Mulberry Park station heights from `cableway.py`.
- prep_wide canopy cells wholly inside the village may lack measured tree tops: check the wide trees
  there.

## How things fit (for reading the code)

- **Squares:** square size about 1043 m (261 cells of 3.997 m), origin (-1975, -1345). The village
  is squares 0..2, with seams at x ≈ -932 and 112, and y ≈ -302 and 742.
- **The root map's methods:**
  - `GameMap` (root) `inGrid` covers only the root's own grid, which is empty after the switch.
  - `tileAt`, `tilesNear` and `areas()` reach the loaded squares, and `detailedAt` says if detail is
    there.
  - `addTile` and `tilesVersion` tell you when squares join.
- **Ids:**
  - Square vehicles: `TILE_CAR + tileKey*65536 + k`.
  - Rollers: k ≥ 65000.
  - Start-up vehicles: k ≥ 64000.
  - Pitches: `PITCH_TILE` + square*256 + n.

## Running things on the Mac

1. Write `/mnt/project-files/macq-<name>.req.md` with these fields, in the same shape as
   `macq-vsq-c5.req.md`:
   - `thread:` this thread's id;
   - `kind:`, `commit:`, `run:` (exact shell steps), `return:` (file names prefixed `<name>-`),
     `push:` and `alone:`.
2. Send the project's coordinator session one line: "`macq-<name>.req.md` is waiting". Find the
   session id with `mcp__hearthbot__get_channel_session_id`.
3. The Mac polls every few minutes. Don't ask the co-developer to paste anything.
4. Results come back as `macq-<name>.done.md` plus the returned files, all in `/mnt/project-files/`.
   To cancel a queued request, delete its `.req.md` and tell the coordinator.
5. `tools/mac_build.sh <commit> --map [--only "ti,tj ..."] [--check] [--shots views.json] [--push <branch>]`
   does the full build. `tools/probe_map.mjs` and `tools/shoot.mjs` serve `web/dist` themselves.

---

## Prompt for the next agent

> You're taking over the "village loaded as nine ordinary squares" work on Combe Downer, in the
> fork, branch `claude/village-squares`. Read `CLAUDE.md`,
> `NOTES-FOR-AGENTS.md`, then `docs/plans/village-squares.md` on that branch: it says what's done,
> what the Mac has measured, and what's left, in order.
>
> Start by reading `/mnt/project-files/macq-vsq-c5.done.md` and the `vsq-c5-*` files. If c5 hasn't
> finished, check `macq-vsq-c5.running.md` and carry on with the loose ends in step 3 meanwhile.
> Then work through steps 1 to 4 of the plan.
>
> Hard rules:
> - Never merge into any `main` without the co-developer explicitly saying so in his own words. Push only to
>   `claude/village-squares` (and the Mac pushes rebuilt data to `claude/village-squares-data`).
> - Never run a browser, probe, screenshot or frame-rate test in the cloud container: send those
>   to the build Mac with a `macq-<name>.req.md` request, as the plan describes.
> - `cd web && npm run build` must pass before every push.
> - The waiting-buses question is answered: buses go all over Bath, parked at the kerb at stops
>   until someone gets in, exactly as in the village today (step 3). Don't add self-driving buses.
>
> Keep the co-developer's messages short and plain: lead with the answer, say what was checked, and ask
> questions he can answer in one word. Update the plan file and `NOTES-FOR-AGENTS.md` as things
> change.
