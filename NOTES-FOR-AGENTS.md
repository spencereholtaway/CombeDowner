# Notes for agents

The maintainer and the co-developer each run their own Claude agents on this repo, and the agents can't message each
other. This file is how they say what they're changing so they don't trip over each other.

**Before you start:** read this file and check whether someone is already in the area you're about
to change. **When you start something that will take a while:** add a line under "In flight" with
who it's for, what you're changing and which files. **When it's merged:** delete your line.
Keep each entry to a line or two, and pull `origin/main` right before you push changes here.

## In flight

Updated 2026-10-13.

**Both sides:** if you open the game in a browser to check something (screenshots, a probe), import
`tools/quiet-guard.mjs` and call `silence(page)` (or `silenceContext(context)`) before the first
`goto`, with `MUTED_ARGS` on the launch. It silences the page's audio, media and speech. Passing
`--mute-audio` on its own is not enough to be sure: nobody has measured whether it covers
`speechSynthesis`. Don't write your own copy of the guards — one copy, in that file. See "Running
the game locally, without the sound" in `CLAUDE.md`.

### The co-developer's agents

- **Frame rate re-measured after the November map work (branch `claude/fps-now`):** small fixes
  that change nothing on screen: traffic measures things against each car's lane once
  (`traffic.ts`), a station's tracks are drawn a 250 m square at a time (`railway.ts`), and name
  plates take two draws, not six (`furniture.ts`). Not on the maintainer's `main` yet.
- **Passages through buildings (branch `claude/passages`):** a way the data marks
  `tunnel=building_passage` / `covered=yes`, or that runs on out of a building's far side, keeps
  going and the building gets `ps` (openings: width, headroom, middle line with floor heights) in
  `tools/partition/write_tile.py` (`ways_out_of_buildings`, `passage_floors`); each floor is laid
  as the way's own street face (`passage_faces`, before `street_surfaces`), and the game cuts the
  walls, draws the sides and ceiling and walks them through `web/src/passages.ts` (`map.ts`,
  `world.ts`). The grid under a passage is let down below its floor (`passage_ground`)
  and doors and shopfronts in its mouths go (`clear_passage_mouths`), as do walls and railings
  laid across them (`open_passage_mouths`). Rules 9, 13, 20 and 27a leave passages out. Mapped
  steps are carried over a way only when OSM says so (a bridge, another layer, or the way in a
  tunnel or under cover: `steps_over` in `tools/structures.py`); otherwise a flight crossing a
  street at its height stops either side of it (`flights_across_streets`). Trialled on
  Edinburgh 1,1 and Bath 0,3 only.

- **Tunnel portals and the ground sheet (branch `claude/edge-fixes`):** the sheet stands no retaining
  wall across a way's end at a tunnel's portal (`tools/partition/sheet.py` `in_portals`), and the
  ground at about the floor's level in front of a headwall is no longer hidden (`web/src/tunnels.ts`
  `mouths`, `AT_GRADE`). Proved on Edinburgh's squares 0,1 and 1,1; needs the squares rebuilt.
- **Smooth wall tops and mended terrain pits (branch `claude/edge-fixes`):** small sheer pits and
  spikes in the terrain tiles are filled or cut when a square is built (`tools/prep_map.py`
  `mend_pits`); each wall's top is evened out along it and stands up to 0.6 m taller over a dip
  (`tools/partition/write_tile.py` `smooth_wall_tops`, `wall_feet.py`); the game sets a wall's foot
  0.4 m under the drawn ground (`web/src/world.ts` `barrierRun`); check rule 9's "wall off its
  ground" allows that lift. Every square needs rebuilding.
- **Ways held over tunnel mouths (branch `claude/edge-fixes`):** a mapped way that crosses a
  railway or road tunnel's line within 15 m of its mouth is held on the tunnel's lid (a railway
  face's top, a road bore's crown plus 0.6 m) and the ground laid to it, so it is never stepped
  down into the cutting (`tools/partition/write_tile.py` `tunnel_lids`, `lid_over_tunnels`). Low
  arches are left alone. Every square with a tunnel needs rebuilding.
- **Railway tunnel faces as lids, walled cuttings (branch `claude/edge-fixes`):** mouths side by
  side join into one face whatever order the data lists them (`railway.py` `portal_groups`,
  `railway.ts` `portalGroups`), an arch for each pair of tracks with a pier between, and a parapet
  along the top that you walk into (`map.ts`). `prep_map.py` holds the hill behind each face level
  with its top (not under houses), and where the line runs up to a face in a cutting at least 3 m
  deep, holds the ground beside it level at the cutting's top (not by houses, bridges or mapped
  retaining walls); the sheet stands the cutting's wall at the bed's edge and builds the ground
  behind it level (`partition/sheet.py` `rail_mouths_and_cuttings`), and the bed runs across the
  arches in front of each face (`write_tile.py` `mouth_aprons`), and between tracks out along the
  cutting (`cutting_floors`). A face's wings slope down to 1 m at their ends (`railway.ts` `wingTop`); the sheet
  leaves the lid over the bores as laid; paths on the lid are held at its height and no wall, fence
  or hedge stands on it (`lid_areas`); check rule 6 skips track points behind a face, in its bore.
  Every square with a railway tunnel needs rebuilding. The terrain shader hides ground only under each arch, inside the bore's lining (`world.ts`); the bore is a closed tube with an earth skin over its vault, and no retaining wall is drawn inside it. The face's top is at least `LID_OVER` (1.5 m) over the crown, the sheet holds the lid at least at the face's top right up to the face, the railway's bed stops just in under the face (`rail_beds`), and the ground meets it there at the lid's height (`sheet.py`). `ground_seams.mjs` (rule 38) leaves out cracks inside a bore, which the lining closes.
- **Bus streets and traffic lights (branch `claude/street-fixes`, code only, map not rebuilt):** a street
  only buses may use, or a pedestrian street open to traffic at some hours, is built as a road with
  pavements and shut hours (`streets.street_access`, read by `prep_map.py` and the partition's graph,
  `once.opened_pedestrian`); traffic lights' poles stand on the pavement, and lights mapped on a
  junction go on each approach (`write_tile.crossings`). One open to cars at all hours is a living
  street; a pavement facing another carriageway close beside it narrows (`write_tile.dual_kerbs`,
  as `pw`); shop-front paving reaches further on wide streets and past a pavement mapped on its own
  (`pedestrian_frontage`); the lidar's "something stands along a plot's front" leaves out mapped
  street items (`Standing.without`). Trial on Bath 0,3 1,1 3,3 and Edinburgh 1,0 1,1.

- **Royal Crescent seam (branch `claude/crescent-seam`, waiting for the co-developer):** the Crescent's flags fit
  themselves to the square's kerb (`SetPiece.fit`, `landmarks/royalcrescent.ts` `crescentFit`), grass
  doesn't grow through set pieces' floors (`grass.ts`), and set pieces marked `fills` have the square's
  street faces cut along their outline as it's written (`tools/partition/setpiece_cuts.py`,
  `write_tile.street_surfaces`, keyed in `stage.py`). Proved on square 0,3 only.

- **The maintainer's main merged into the fork (branch `claude/spencer-merge`):** the map rebuilt with
  his running tracks and pitches; `drapeBarriers` (`web/src/map.ts`) now leaves a stretch alone where
  the ground strays no more than the build's own limits (0.1 m below, 0.2 m above), so it no longer
  re-cuts the walls `tools/partition/write_tile.py` already laid on the ground. Removed once on main.

- **Three map branches merged, waiting for the co-developer (branch `claude/map-merge`):** `claude/map-fixes`
  (checks rules 39-45, walls follow the ground, hairline needles off pavements and streets, set
  pieces clear the map's paving), `claude/stable-ids` (edges named from their own geometry,
  `once.edge_id`; blocks joined 250 m at a time in one settled form; `grading.TIE`) and
  `claude/construction-roads` (`graph.as_built`: ways still being built drawn as what they will be).
  Touches `tools/partition/`, `tools/check_map.py`, `check_more.py`, `ground_seams.mjs`, `grading.py`, `osm.py`,
  `web/src/map.ts`, `world.ts`, `landmarks/setpieces.ts` + `shape.ts`, and rebuilds every square.

- **Map rebuilds rewrite only the squares a change reaches (branch `claude/slice-keys`):** each
  square's write and division are keyed on their own slice of the passes' city-wide files
  (`pipeline.Slices`: corridors, road heights, footprints, parent blocks near the square), not the
  whole files. Keying only: touches `tools/partition/pipeline.py`.

- **The ground triangulated round the faces, now the default (branch `claude/ground-cdt`, waiting for the co-developer):**
  the sheet's open ground is one constrained triangulation (`web/src/sheet.ts` `buildSheetCdtGen`,
  built a few milliseconds at a time, Delaunator in a worker: `delaunay.ts`; npm `delaunator`,
  `@kninnug/constrainautor`). `?ground=sheet` is the cell-by-cell sheet as before, `?ground=old` the
  old grid. The checks follow the game: `CD_GROUND` defaults to `cdt` (`tools/check_more.py`, via
  `tools/sheet_cdt.mjs`); `CD_GROUND=sheet` / `old` for the others.

- **Ground plan stage 3, the ground sheet (branch `claude/ground-sheet`):** a new `gs` key in each
  square (`tools/partition/sheet.py`, written by `write_tile.build_tile`), drawn and walked with
  `?ground=sheet` (`web/src/sheet.ts`, `world.ts`, `sfpack.ts`, `map.ts`); `tools/check_more.py`
  measures it with `CD_GROUND=sheet`. Default drawing unchanged.

- **Packed map files (branch `claude/pack-squares`):** the game downloads each square, `-wide` and
  `-ground` as a `.pack.gz` (`web/src/pack.ts`), packed from the JSON in every build by
  `tools/pack_squares.mjs` and checked to read back exactly; `dist` carries no square JSON. Touches
  `tiles.ts`, `parsesquare*.ts`, `sfpack.ts`, `wide.ts`, `groundkinds.ts`, `whatswhat.ts`,
  `vite.config.ts`, `tools/roof_probe.mjs`. The JSON stays the tools' copy.

- **Census house types and conservation areas (branch `claude/census-zones`):** two new wide
  layers (`tools/census.py`, `tools/conservation.py`, packed in `data/<map>/`) that
  `buildings.priors` uses for flats, pairs and rows, and an old core's walls, parapets and roofs.
  Touches `tools/buildings.py`, `tools/prep_map.py`, `tools/epc.py`, `tools/gardens.py` (railings),
  and rebuilds Bath's and Hackney's squares.

- **The partition is now part of the map build (both sides, please read):** `tools/prep_tiles.py`
  runs the partition (`tools/partition/stage.py`) after `prep_map.py`, so the squares in
  `web/public/maps/combe-down/` are the partition's; `prep_map.py`'s own go to
  `data/raw/combe-down/wide/partition/prep/`. New rules for streets, plots, garden boundaries and
  road heights go into `tools/partition/` or `tools/structures.py` (which ports `prep_map.py`'s
  bridge rules: change both).

- **Cape Town (branch `claude/cape-town`):** a new map outside the UK, the City Bowl to the V&A
  Waterfront and the top of Table Mountain, built in squares from worldwide data only. New zones
  `cbd`, `bokaap`, `cape` in `tools/buildings.py`; the ocean held at sea level (`sea` in
  `tools/area.py`, `prep_map.py`, `prep_wide.py`); painted walls ("paint", `world.ts`, `wide.ts`);
  Bo-Kaap pavements up to the door (`prep_map.py`); set pieces in `web/src/landmarks/`; a far
  backdrop so big mountains show past the fog; the Table Mountain cableway (`tools/cableway.py`).
  Bath's own files are unchanged.

- **Bradford-on-Avon by train (the plan in `docs/bradford-on-avon.md`, branch `boa_map` on the
  fork):** a town reached by train from Bath Spa, its own map in the same room. New map in
  `tools/area.py` and `web/src/maps.ts`; railway routes branch at junctions (`tools/railway.py`) so
  a train runs towards Bradford-on-Avon, with doors, boarding and the black-screen travel
  (`web/src/railway.ts`, `game.ts`, `main.ts`), and one match across maps (match host, one
  scoreboard, radio across towns). Bath's own files are unchanged.

- **The prompt left up after a train ride (branch `claude/train-prompt-stuck`, off this `main`):**
  the get-in prompt, the ride chip, the job card, the poster and the flags panel were each written
  only when the game's own note of "what I last showed" changed. Travelling builds a new Game on the
  same page, so that note started empty and the new game's first write was skipped: boarding at Bath
  Spa left "Board the Bradford-on-Avon train" on screen for good. Those five now write through
  `web/src/show.ts`, which asks the element itself whether it has changed, so a new game's first
  write always lands (as `daily.ts`'s panel already did). Checks the prompt: `tools/travel_probe.mjs`.

- **Frame rate, round 2 (steps 1-3, branch `claude/fps-round2` on the fork):** pickups merged into
  one mesh per look, shadows drawn every other frame, and (step 3) landmarks drawn in fewer pieces
  (`web/src/landmarks/kit.ts` `mergeStatic` and `Kit.build()`, called from `landmarks/index.ts`):
  a set piece's stone in several tints is one draw via vertex colours, and the village's plain
  landmarks merge the same way. Town `landmarks-tunnels` draws fall 106 to 81. Steps 4 and 5 (split
  the long building slices; bake squares at build time) are still to do. Nothing merged without
  the co-developer's say-so.

- **Village built as 9 normal squares (done, on main):** the whole map, village included, is now
  built by `tools/prep_tiles.py` in one parallel run: the village is squares 0-2 each way, kept in
  `data/raw/<map>/wide/core/` and stitched into `web/public/maps/combe-down.json` in the same format
  as before, so game code reading `map.d` is unchanged. The squares' grid and base height are set in
  `tools/area.py` (`squares`, `z0`), there's one zone list there for all of Bath, and the one
  landmark pack is `tools/landmarks/bath.py`. Every square was rebuilt with the Environment Agency
  lidar for the whole city. To change the map tools, rebuild with `prep_tiles.py` (README.md has the
  order), not `prep_map.py` on its own.
- **The village loaded as nine ordinary squares (done, on main):** `combe-down.json` is only a
  header (name, centre, spawn ring); the village's nine squares load like the rest of Bath, first,
  round the spawn. The map is called "Bath" for players; its id stays `combe-down` (URLs, saves,
  telemetry), and the header's `vn` names the middle squares "Combe Down".
- **Town walls, street widths, gardens and climbing:** walls traced from lidar everywhere
  (`tools/walls.py`, kept in the measurements as `walls.json`), streets fitted between them
  (`tools/roadwidth.py`, with `osm-roads.geojson`), garden boundaries laid once each as one
  network with gates kept in their walls (`tools/gardens.py`), walls opened only where a path or
  street crosses them, nothing small left standing on a wall (`tools/prep_map.py`), kerb-high
  pavements (`web/src/world.ts`), climbing over walls, and a clash check (rule 9 in
  `tools/check_map.py`). Branch `dan/lidar-walls`, on the fork only for
  testing, not on this `main` yet.
- **Bath cable car:** a cable car from Mulberry Park over Lyncombe Vale and Beechen Cliff to the
  river by Bath Spa.

- **Seagull Attack and the wardrobe:** a new job (`web/src/gulls.ts`, registered in `game.ts`), and
  daft wearables earned from jobs, the deli, cats and tummy time (`web/src/wardrobe.ts`, drawn by
  `avatar.ts`, sent in the hello as `wr`, a Wardrobe button in the pause menu). Jobs can now offer
  things to shoot at (`hit`/`shoot`/`bossBar` on `Job` in `quests.ts`) and hand out wearables
  (`done.wear`). Branch `claude/seagulls`, on the fork for testing first.

- **Ladders:** a ladder you pick up, put up against a building with E and climb onto its roof
  (`web/src/ladders.ts`, climbing in `player.ts`, hooks in `game.ts`, `pickups.ts`, `avatar.ts`, `ldr`/`lds`
  in `net.ts`). On the fork `main` (branch `claude/ladder`), not this `main` yet.
- **Straight, joined-up garden fences, benches and signs:** garden side and back boundaries laid as
  one network, squared to their houses, tidied (no footpath fences, no jogs, no loose bits), and
  corners kept when walls are laid on the ground (`tools/gardens.py`, `tools/prep_map.py`); benches
  face away from buildings and signs run along the kerb (`tools/streets.py`). Branch
  `claude/square-gardens`, going to the fork `main` after a full rebuild, not this `main` yet.

- **Climbing Bath Abbey:** always-on free play at the Abbey (`web/src/climb.ts`), up the real
  ladder of angels on the north turret (`web/src/abbeyclimb.ts`), then the ledge round the tower
  and the stones jutting from it, all in `web/src/landmarks/abbey.ts`, with angel's wings and a
  guitar at the top (`web/src/wings.ts`, `web/src/angelwings.ts`). Small hooks in `player.ts`
  (`wings`/`flapped`/`wingLift`), `game.ts` (bits 4 and 8 of the last number in "st": wings on,
  and glowing; and a new "gtr" message in `net.ts`, a note of the solo), `avatar.ts` (`setWings`,
  with the guitar in their hands), `wardrobe.ts` (a halo) and `audio.ts` (`guitarLead`). Also
  `landmarks/shape.ts`: sloped roofs are smooth to walk on (each surface keeps its slope), and two
  walls on one line with air between them stay two. Branch `claude/abbey-climb`,
  merged into the fork `main` after a pass on his Mac; not on this `main` yet.

### The maintainer's agents

- **Hackney test map:** a second map, 1 km round the Pembury Tavern (`pembury` in `tools/area.py`
  and `web/src/maps.ts`, built with `prep_map.py` into `web/public/maps/pembury.json`), with a
  `london` zone in `tools/buildings.py`, `gardens.py` and `walls.py`. On `main` as a test, on its
  own page (`pembury.html`), kept out of the main menu (`hidden` in `maps.ts`).

- **Ground plan stage 2 (the co-developer's, branch `claude/ground-stage2` on the fork, not merged):** paths
  written level across (`sf.pl`, `world.ts`), steps sunk and landing on faces, digging under short
  spans, no walls on the towpath or paths, churches by OSM/Wikidata form (`tools/worship.py`).
  **The maintainer, the canal:** `tools/canal.py` adds an optional `x` to a run that opens into a river, and
  `canal.ts`/`works.ts` cut the water, banks and verges off past it (`clipMouths`); nothing else of
  the canal or the locks changes.

## Parked

- **V-01 voice chat TURN relay:** planned to use Metered Open Relay; see `TODO.md`.
