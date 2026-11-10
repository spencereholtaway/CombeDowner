# Building the map as one partition: implementation plan

This is the plan for replacing the record-by-record map build with a build that fits one
partition of the ground to all the data (the design is summarised below, and in full on the
"Parcels and corridors" page in the project). It is written for an agent to work through stage
by stage. Each stage ends in something that can be run, looked at and measured on its own, and
nothing in stages 1 to 4 changes the game or the existing build. Read `CLAUDE.md` and
`NOTES-FOR-AGENTS.md` first; the rules there (the fork first, builds on the Mac through the
queue, `tools/check_map.py` before and after) all apply.

## Stage status

Measured with `python3 -I tools/partition/compare.py` on the three reference squares. Run it
before every push; the numbers must not get worse.

Two loose-end figures are kept, because they mean different things. **edge** is every plot edge
with an end touching nothing, all of them on the worked area's own boundary (the square plus its
40 m margin): the partition is deliberately cut off there, so these are expected. **loose** is the
ones *inside* the worked area — a boundary stopping in mid-air — and must be zero. The proof of
concept left 1, 2 and 28 loose ends inside on the three squares; the target is 0.

| stage | branch | status | square 1,1 (village) | square 0,0 (estate) | square 0,3 (city centre) |
|---|---|---|---|---|---|
| poc | `claude/partition-poc` | done | edge 61 / loose 1, unc 0.7, ev 8.1% | edge 81 / loose 2, unc 0.3, ev 8.1% | edge 73 / loose 28, unc 2.8, ev 6.4% |
| 1 | `claude/partition-stage-1` | **not ready** | edge 76 / **loose 46**, unc 0.7, ev 10.7% | edge 73 / **loose 27**, unc 0.3, ev 9.6% | edge 86 / **loose 70**, unc 2.9, ev 9.5% |
| 1 (fix) | `claude/partition-stage-1-fix` | done, merged | edge 46 / **loose 0**, unc 0.7, ev 11.4% | edge 58 / **loose 0**, unc 0.3, ev 10.7% | edge 37 / **loose 0**, unc 2.8, ev 7.0% |
| 2 | `claude/partition-stage-2` | **green, for review** | edge 43 / **loose 0**, unc 0.7, ev 74.7% (parcel 70.5%) | edge 45 / **loose 0**, unc 0.3, ev 81.3% (parcel 76.2%) | edge 39 / **loose 0**, unc 2.7, ev 59.0% (parcel 52.3%) |
| 3 | `claude/partition-stage-3-wt` | **green, for review** | edge 52 / **loose 0**, unc 0.7, ev 79.3% (parcel 73.4%) | edge 55 / **loose 0**, unc 0.3, ev 83.9% (parcel 78.2%) | edge 44 / **loose 0**, unc 2.7, ev 70.8% (parcel 59.4%) |
| 3b | `claude/partition-build-once` | **for review** | edge 60 / **loose 0**, unc 0.7, ev 78.8% (parcel 72.0%) | edge 69 / **loose 0**, unc 0.3, ev 83.6% (parcel 77.1%) | edge 49 / **loose 0**, unc 2.7, ev 70.2% (parcel 58.7%) |

(unc = m² of the square uncovered by the one surface; ev = share of plot edge length lying on
lidar or mapped evidence. Mid-street pavement steps stay 0 at every stage. The held-out width test
on 0,3 is 47 of 70 within 1 m, median 0.90 m; the "53 of 78" the table carried through stages 1 to
3 was a stale figure — stage 3's own code at the merge commit gives 47/70 today, and 3b gives the
same, so it is a like-for-like result rather than a worse one. See the stage 3b section.)

Stage 3b's row is the first measured *after* the margin is no longer relied on for agreement.

**The city run** (`out/city3b2`, 131 squares, `--jobs 12`, passes re-run with it): the neighbour
check is met in full — **0 positions without a partner at 1 cm and worst mismatch 0.0 m across all
944 sample lines (236 shared edges)**, which is what this stage was for. Built 131/131, **loose ends
inside 0**, overlap 0, **436 s** against the 896 s ceiling (pass 1 17 s, pass 2 250 s, pass 3 167 s),
evidence **62.7%** against stage 3's 57.6%. Two figures miss and are diagnosed in the stage 3b
section rather than tuned: uncovered 21.0 → **22.3 m²**, and the data findings 265 → **377**; the
opening failures' stage 3 baseline of 0 is **stale** (stage 3's own code reports 19 on square 1,1
today), so the like-for-like figures are the reference squares, where 3b is +9 on 0,3 and equal on
the other two.

The stage 1 "loose 0" first reported was **a bug in the metric**, not a result: `loose_ends()`
measured the free end against the square as a *polygon*, whose distance is zero for every point
inside it, so the inside count could never be anything but zero. Fixed to measure the square's
outline. Stage 1 is therefore worse than the proof of concept on loose ends everywhere (46/27/70
against 1/2/28), which is the one thing the rule forbade, and it is not ready to merge until that
is fixed. See `docs/partition-loose-ends-note.md` and `review-stage1/METRICS.md`.

The fix branch is rewritten so that every cut goes into one polygonize and a plot is a union of
faces of that one partition (so the plots tile a block exactly — measured gap 0.00 m², overlap
0.00 m² on every block), and so that the drawn boundaries come from the faces' ring topology
rather than from pairs of plot polygons or probe points. Slivers are absorbed by their neighbour
before the plots are formed. Loose ends inside are **0 on all three squares** and the uncovered
area is 0.7 / 0.3 / 2.8 m².

Evidence share is 9.5 to 10.7% after stage 1. The plan expected "towards 20% on the village
square"; lidar alone does not reach it, and stage 2's cadastral parcels are the lever that does.

## How stage 2 uses the registered parcels

The INSPIRE Index Polygons are read as evidence of the highest trust, not as the answer:

- **They join the one polygonize as lines**, so the same partition is cut once and a plot is still
  a union of faces of it. A registered boundary that runs out of a block runs into the block's own
  boundary, so it adds no loose ends (inside loose ends stay 0 on all three squares).
- **The growing never crosses one** (`PARCEL_CROSS` = 100 m, against 15 m for a lidar ridge), so a
  face's nearest house is always within the same title; and **a plot is capped at the parcel its
  house stands in** (grown by `PARCEL_PAD` = 1 m first, because the polygons are indicative and a
  house can straddle its own registered edge). That is what makes the long thin strips behind a
  terrace and the wedges on a bend: they are the titles' own shapes.
- **The inferred divisions stand down where the parcels cover the ground**: a side-wall line, a
  gap bisector, a shared back line and a garden cap are all skipped for a house whose title the
  download has, and skipped *between* two houses registered as separate parcels. So the rules only
  divide what the parcels do not cover — unregistered land, and anywhere the download is missing.
- **A boundary's material does not come from the parcels.** Kind is still read off the pair of
  labels (plot against plot a fence, plot against open land a hedge) and the lidar and the zone,
  so the cadastre decides *where* a boundary is, never what it is made of.
- **A title is not a fence.** A registered edge is drawn only where something really stands along
  it: the lidar or a mapped barrier, or a garden edge (a piece that borders a garden for most of
  its length — a *share*, not "a house somewhere near", or a 300 m title line that grazes one
  garden at its end would count). A title runs across two fields of one farm, or across a lawn,
  with nothing along it, and a hedge drawn there would be invented. It still **divides** the block
  — the faces are cut either way, so the plots and the open land are the same — it is simply not
  drawn.
- **The undrawn pieces are made coherent with the drawn ones.** A parcel boundary is one closed
  ring cut into pieces, so dropping a piece leaves the pieces that met it ending in mid-air: this
  alone took the village square's inside loose ends from 0 to 5. So dropping is repeated until no
  drawn boundary ends inside the worked area (the plan's own rule, applied to the drawing as well
  as the partition). What stays dropped is a title line whose neighbours are dropped too — the
  field case — so nothing leans on it.
- **Nothing is derived from the extents but boundaries.** The licence forbids deriving building
  footprints from them, so the buildings stay Overture's; the parcels are read only to divide plots.

Numbers: evidence share is 74.7 / 81.3 / 59.0% on the three squares, against 11.4 / 10.7 / 7.0%
after stage 1, and 70.5 / 76.2 / 52.3% of plot edge length lies on a registered boundary. The city
centre's is the lowest of the three because its titles are few and large (a whole terrace or a
block of flats under one title), so there is less boundary to find: 96.8% of its buildings stand in
a parcel, but those parcels are big. The 60% the plan expected is met on two squares and only just
missed on this one, for that reason rather than for a bug. Nothing else got worse: uncovered
0.7 / 0.3 / 2.7 m², overlap 0, pavement steps unchanged, and the held-out width test on square 0,3
still 53 of 78 within 1 m, median 0.80 m.

## How a block is divided (worked out in stage 1)

The plan said a block is cut by "division lines instead of Voronoi edges" but not exactly how, and
stage 1 had to settle it. Written down here so the next reader does not have to work it out again:

- **The block is the land, and its holes are the union of the buildings.** A party wall between two
  neighbours is therefore an interior wall of that union, not part of the block boundary, so a
  division line drawn "back from the wall" would otherwise start in mid-air. A division line's
  start is put on the *footprint's own* boundary (the minimum rotated rectangle's midpoint can sit
  a little off a rotated wall).
- **A side-wall line** runs from a shared wall (once, not once per house) or a free side wall, in
  the wall's own front-to-back direction, to the block's far side. It is clipped to the block, so
  its far end lands on a building or a corridor.
- **A bisector between two houses that do not share a wall** starts at the midpoint of the gap and
  runs both ways, dropped where it meets a building. Its direction is the nearer house's
  front-to-back axis where the two houses stand side by side, and across the gap where they stand
  end to end.
- **One polygonize cuts the block, and a plot is a union of faces and nothing else.** The division
  lines, the bisectors, the evidence lines, the shared back lines and each garden cap (the back
  edge of the house's mitred GARDEN reach only) are all lines of the same network; the region
  growing then assigns whole faces and never cuts them. So two neighbours share their boundary by
  construction and a plot edge cannot end in mid-air. (Stages 1 and the first fix cut plots in two
  places — cuts in the polygonize, then a per-house cap afterwards — so neighbours were cut
  independently and their versions of a shared boundary did not coincide.)
- **The drawn boundaries come from that noded network by its ring topology, never by probing.**
  After the polygonize, each piece of the noded linework is looked up by every consecutive pair of
  its coordinates in a map from a ring edge's two points to the face it belongs to. A probe point
  just either side of a piece would miss on a thin face or a short piece (a point on a face's
  boundary is not contained by it), which left loose ends; the ring map cannot miss, because every
  ring edge of a face *is* an edge of the linework. A lookup can still name a third face the piece
  only touches at a junction, so the candidate faces are kept only if their boundary runs along
  more than half the piece. Two faces is an interior boundary, one is the block's outside, none is
  a dangle and is ignored. Each piece is labelled from what lies each side; segments along a
  building or the worked area's edge are dropped, the rest are grouped by their pair of labels and
  merged, so a boundary between two neighbours is one line. `classify_edges` then classes each
  merged line (a front, a division, a back, on evidence or inferred) as before.
- **A face too small to be a plot of its own is absorbed** by the neighbour it shares its longest
  edge with (a face under 2 m², or thinner than 0.25 m), before the plots are formed and repeat
  until steady. This is a rule of the partition — no hedge is drawn round a square metre of
  nothing — and it is what keeps a plot from leaving part of itself to open land.

**Still open:** 8 / 8 / 12 loose ends inside remain on the fix branch. Each is a spur where one
boundary's two pieces stop a few metres apart, a gap in the cut set rather than a labelling miss;
they are listed in `review-stage1/METRICS.md`.

## Where things stand

- `tools/partition_poc.py` (branch `claude/partition-poc` on the fork) is the proof
  of concept: one square in, a partition of the ground out. It runs on the packed data in
  `data/combe-down/` plus the terrain tiles, takes 35 to 90 s a square on one core, and writes
  `partition.json`, `render.svg`, `evidence.svg`, `current.svg` and `metrics.json` into its
  output folder. Run it like this (the `--raw` folder holds the unpacked `.geojson` layers,
  `python3 -I tools/mapdata.py unpack combe-down` puts them in `data/raw/combe-down/wide/`, and
  `--terrain` the terrarium PNGs `mapdata.unpack_terrain` writes):

      python3 -I tools/partition_poc.py 1 1 out/1_1 --raw data/raw/combe-down/wide --terrain data/raw/combe-down/wide/terrain15

- Measured on squares 1,1 (the village), 0,0 (the estate west of it) and 0,3 (the city centre):

  | | current build | partition |
  |---|---|---|
  | barrier ends touching nothing, per square | 2,390 to 3,636 | 62 to 80 (nearly all on the square's edge) |
  | joins where a street's width or pavement steps mid-street | 78 to 390 | 0 (18 to 65 cross-section changes, at junctions or where the corridor changes, tapered) |
  | one surface with no overlaps or holes | no | yes (0.3 to 2.8 m² uncovered of 1.09 km²) |
  | carriageway width fitted with the OSM width tag hidden, within 1 m of the tag (centre square, 78 tagged streets) | n/a | 53 of 78, median error 0.8 m |
  | plot edge length lying on lidar or mapped evidence | n/a | about 8% |

- Known shortcomings of the proof of concept, all addressed below: plot divisions are straight
  but not square to their houses; most boundaries are inferred rather than seen; there are no
  gates, drives or openings; nothing is decorated; the output is not the game's format.

## The design in one paragraph

Every point of the ground is exactly one of: building, plot, street corridor (carriageway,
pavement, verge, parking), path, open land, water, railway. Boundaries are the shared edges of
that partition; a fence is only ever drawn along a plot edge, and a pavement is only ever a strip
of a corridor, so nothing can stand alone and nothing can stop for no reason. The data (footprints,
centre lines and their tags, lidar ridges, mapped barriers, land use, address points, and later
cadastral parcels and imagery) is evidence the partition is fitted to, in order of trust:
buildings first, then the street graph, then corridors fitted between what stands either side,
then plots dividing the blocks, then one triangulated surface with heights assigned per class.

## Conventions for all stages

- Work on the fork, branch `claude/partition-<stage>` off `claude/partition-poc`
  (rebase onto the fork's `main` first). Merge each stage into the fork's `main` only after
  the co-developer has looked at it. Nothing goes to the maintainer's `main` until the switch in stage 6.
- The new code lives in `tools/partition/` as a package (split `partition_poc.py` into modules in
  stage 1: `buildings.py`, `graph.py`, `corridors.py`, `plots.py`, `surface.py`, `render.py`,
  `metrics.py`, `__main__.py`), keeping `partition_poc.py` as a thin wrapper until stage 4
  removes it. Each module opens with a docstring saying what it decides, in the voice of the
  existing tools.
- Nothing in `tools/prep_map.py`, `tools/prep_tiles.py`, `tools/walls.py`, `tools/roadwidth.py`
  or `tools/gardens.py` is changed before stage 4. The two builds run side by side.
- Every stage keeps `metrics.json` working and adds to it; the numbers in the table above are
  the baseline and must not get worse. Add a `tools/partition/compare.py` that runs the three
  reference squares and prints the table, and run it before every push.
- The tests are `python3 -m unittest discover -s tools/partition/tests` from the repo root, or
  `cd tools && python3 -m unittest partition.tests.test_partition_metrics` for one file (plain
  `python3`: `-I` drops the folder from the path). Run them before every push.
- Full-city runs go through the Mac queue (`macq-<name>.req.md`, see the project instructions),
  `alone: yes`. Single squares can run in a cloud container.
- Pictures: `render.svg` and the three-panel comparison (current, partition, evidence) are the
  review artefact for every stage. Keep the SVG classes in `render.py` stable so pictures from
  different stages compare.
- Nothing place-specific: no coordinates, street names or Bath rules in the code. Area priors
  come from `area.py`'s zones as they do now; everything else is a general rule with a named
  constant at the top of its module.

## Stage 1: plots that look like gardens, and openings

Goal: the garden geometry is as good as the metrics. About 2 to 3 days.

1. **Split `partition_poc.py` into the package** above, no behaviour change, `compare.py`
   reproducing the baseline table exactly.
2. **House axes.** For every building, its axis: the long side of its minimum rotated rectangle,
   or for a terrace house (sharing walls on two sides) the direction of its shared walls. Keep it
   on the building record.
3. **Division lines instead of Voronoi edges.** In `plots.py`, replace the dense-point Voronoi with
   candidate division lines: from each shared wall between two houses, and from each free side
   wall of a detached or end house, a line square to the house's front running back from the wall
   to the block's far side. Between houses that do not share a wall, the perpendicular bisector of
   the gap, turned to the nearer house's axis. Keep the evidence lines (lidar ridges, mapped
   barriers, extended 3 m past each end as now). Polygonize all of them with the block boundary
   and keep the region growing exactly as it is: faces go to the building they are nearest by
   path, crossing an evidence line costing 15 m. The Voronoi stays only as the fallback for a
   block with buildings and no usable walls.
4. **Backs.** Where two rows of houses back on to each other, the back boundary is one line for
   the whole yard: the evidence line if one runs along it, else the line midway between the two
   rows, parallel to the longer row. Replace the per-house `GARDEN` cap (`buffer(GARDEN,
   join_style="mitre")`) with that line where it exists, and keep the cap only for plots that
   back on to open land.
5. **Evidence along its line.** Before cutting faces, join lidar runs that are collinear within
   10° and 8 m into one line (the current `walls.py` does this with 5 m; the partition can afford
   more because a joined line only ever becomes a plot edge if it closes a face). Report the share
   of plot edge length on evidence in `metrics.json`; expect it to rise from 8% towards 20% on the
   village square.
6. **Openings.** In a new `openings.py`: a gate in a plot front where the building's door faces it
   (doors come from the current build's rule in `prep_map.py`, `doors` around line 1600; reuse it
   or port it), centred on the door, 1 m wide; a drive where a service way or a track crosses the
   front, or where the lidar shows a car-sized lump inside the plot within 8 m of the front, 2.8 m
   wide; an opening wherever a path edge crosses a plot edge, the path's width. Record each as
   (edge id, position along it, width, kind). Gates get the game's `gt` form in stage 4.
   Stage 1 leaves the gate **not yet centred on the door**: it is centred on the house's front for
   now, and the door rule (which needs `buildings.classify`, in the game's own terms) moves to
   stage 4, where the door rule already lives and the game's `dr` records are written. The gate
   check ("no building without a gate or drive on a front that faces a street") moves with it, so
   it is not lost — the check stays in `metrics.py` and runs at every stage.
7. **Checks** added to `metrics.py`: every gate lies on a plot edge with the edge continuing both
   sides; no opening wider than its edge; no building without a gate or drive on a front that
   faces a street.

Acceptance: on the three reference squares, plot edges run square to their houses (check by eye
on the render), the back of each yard is one line, the evidence share has risen, and the baseline
metrics are unchanged or better.

## Stage 2: real plot boundaries where the data allows

Goal: fences where they really are, not where a rule puts them. About 2 days, half of it waiting
on a download and a licence read.

1. **Licence.** Read HM Land Registry's current INSPIRE Index Polygons conditions of use and the
   Ordnance Survey attribution condition that comes with them, and write what they allow and
   require into `data/combe-down/README.md`'s table (a row for the parcels, with the attribution
   text). If the terms do not allow use in a game shared under ODbL, stop this stage here and say
   so in the thread; the build does not depend on it.
2. **Download** the Bath and North East Somerset polygons (the download needs a sign-in, so this is
   a job for the Mac queue: `kind: build`, the download URL and the unzip in `run:`, the GML file
   returned to `/mnt/project-files`). Convert to the wide-area `.geojson` form the other layers
   use, pack it with `tools/mapdata.py` (add a `parcels.geojson.xz` entry) and keep it in
   `data/combe-down/`.
3. **Use it as evidence, not as the answer.** In `plots.py`, parcel boundaries join the evidence
   lines with a weight above the lidar's: a face boundary on a parcel edge is never crossed by the
   region growing (cost 100 m rather than 15 m), and a parcel edge with no building on either side
   still cuts open land into fields. Keep the inferred division for plots the parcels do not cover
   (unregistered land, and anywhere the data is missing). The lidar then only says what each
   boundary is made of and how tall it is. (Review changed the middle of this: such an edge still
   cuts the block, but is drawn only where something really stands along it — see "Done" below.)
4. **Metrics:** evidence share again (expect it above 60% where parcels exist), and a new one:
   the share of plot edges that lie on a parcel edge.

**Done, on `claude/partition-stage-2`:**

1. The licence allows it, so the stage did not stop. Read `data/combe-down/README.md` for the row
   and the two attributions it requires; the Ordnance Survey reference that goes in the second is
   `AC0000851063` (the OS Land Registry Polygon Contract was withdrawn in 2020, so no royalty is
   owed and nothing has to be ordered from OS).
2. The download **does not in fact need the sign-in** the plan expected: the file link on
   `use-land-property-data.service.gov.uk/datasets/inspire/download` answers a plain request with a
   presigned S3 URL, so it is fetched directly and the Mac queue is not needed. `tools/parcels.py`
   converts the 105 MB GML (81,795 polygons, EPSG:27700) to the wide `.geojson`, reprojecting with
   pyproj and its OSTN15 grid — the 1 m transformation, not PROJ's 2 m fallback, which would put
   every boundary 0.4 m out — and `tools/mapdata.py pack` keeps it as `parcels.geojson.xz`
   (4.4 MB, 42,199 of the county's polygons touch Bath). No other packed layer changed.
3. `tools/partition/plots.py` has the `Parcels` class and the rules in "How stage 2 uses the
   registered parcels" above. The synthetic tests in `tools/partition/tests/` hold the plot to its
   parcel, and the metrics in the table.

One thing the plan got wrong, found in review: item 3's "a parcel edge with no building on either
side still cuts open land into fields" was first built as written, drawing a hedge along such an
edge. The co-developer's review pointed out that a title line across two fields of one farm, or across a lawn,
is not a hedge, so the boundary was being invented. It is now drawn only where something really
stands along it (see the two bullets above), and is nothing otherwise. The parcel edge still
divides the block — the faces are cut either way — so nothing else moved: on the three squares
13, 64 and 0 pieces are left undrawn, loose ends inside stay 0, and the uncovered area, the
overlap, the pavement steps and the held-out widths are all unchanged.

Two traps found while fixing it, worth knowing before stage 3 touches this again:

- **"A house is near it somewhere" is not good enough.** A title line can graze one garden at one
  end and run off across open land for 300 m; an any-point test calls that a garden edge and draws
  the invented boundary. It has to be a share of the piece's length.
- **Dropping a piece strands its neighbours, near one for one.** The village square's inside loose
  ends went 0 → 5 from dropping 6 pieces, at exactly the junctions where a dropped piece had been
  supporting a kept one. The drop therefore has to be repeated until no drawn boundary ends inside
  the worked area, or the fix silently breaks the one rule that must not break.

Acceptance: fences follow parcel edges wherever parcels exist; the three squares' pictures show
gardens of the right shapes (long thin strips behind terraces, wedges on bends).

## Stage 3: the whole city, and the checks

Goal: every square built the new way, and the bad data found. About 2 days.

1. **Driver.** `tools/partition/__main__.py` takes `--only ti,tj ...`, `--jobs n` and `--all` like
   `prep_tiles.py`, runs squares in parallel with a process pool (the proof of concept is pure
   Python plus shapely, so processes, not threads), and writes one `metrics.json` per square plus
   a city summary. A square takes its margin (40 m) from the neighbouring squares' data as now,
   so edges agree; add a check that each square's partition boundary matches its neighbours'
   along the shared edge within 1 cm, and fix the margin or the noding if it does not. (Done:
   the check showed the margin cannot make edges agree, whatever its size. Stage 3b is the fix.)
2. **Mac run.** A `macq-partition-city.req.md` request building all 132 squares with
   `--jobs 12`, returning the city summary and the renders of the ten squares with the worst
   metrics. Expect about 10 minutes.
3. **Bad data.** The checks that point at data rather than code: a corridor narrower than its
   class minimum (a footprint or a centre line is wrong), a plot with no front on any street (a
   missing path or drive), a building the corridor cuts (a centre line through a building). Write
   each as a line in the summary with its square and position, as `check_map.py` does, so the co-developer can
   look at them in the game. Fix the ones that are code; list the ones that are data.
4. **Held-out widths** across the whole city (every tagged street, fitted with its tag hidden).
   Report the distribution. Below 60% within a metre, look at the worst ones before going on;
   the usual causes are a parked-car row read as a wall and a front garden read as corridor.

Acceptance: the city builds in one run with no square failing, the summary lists the data
problems, and the held-out width test holds across the city.

## Stage 3b: build each thing once, so squares agree

Goal: two neighbouring squares describe the ground along their shared edge identically, because
each street and each block was built exactly once. About 3 days. Branch `claude/partition-build-once`.

Why: stage 3's neighbour check showed that the 40 m margin cannot make squares agree. A block that
crosses a square's edge is cut at edge+40 m in one square and at edge-40 m in the other, and
everything that looks across the whole block (the region growing, the back lines, the garden caps,
the sliver absorption) then runs on two different blocks. Measured on the village square and its
eastern neighbour: 36 unmatched boundaries at 40 m, 7 at 80 m, 10 at 160 m; the floor that does
not move with the margin is tie-breaking by order, which also depends on the window. No margin
fixes this. Agreement has to come from how the map is built, not from a check: a thing built once
has no second version to disagree with.

The rule: **every street edge and every block is owned by exactly one square and built once, with a
data window sized to the thing, not to the square.** Squares then assemble from the shared results
and clip. Three passes, each a process pool over the squares, with small JSON files between them
in `<out>/<ti>_<tj>/`:

1. **Streets, once.** The street graph is built once for the whole map (one call over all the
   ways, not one per window, so no way is split at a square's edge). Each street or path edge
   belongs to the square holding its midpoint. That square fits the edge on its full length,
   loading buildings and evidence for the edge's bounding box grown by the side reach and the
   filter span, and writes `corridors.json`: for each edge its id, class, name, tags, line,
   sections and the three polygons (carriageway, left pavement, right pavement). Nothing about
   an edge depends on which square built it.
2. **Blocks, once.** Blocks are the complement of all corridors and all buildings. A block in open
   country can be kilometres across, so the thing that is built once is the *worked block*: a
   connected piece of `block ∩ buffer(all buildings, REACH_GROW)`, the only ground where a plot
   can exist. Open land beyond it is open, cut only by evidence lines, which is local and needs
   no block. Each worked block belongs to the square holding its representative point; that
   square divides it with `make_plots` as now, loading the corridors (from pass 1), buildings,
   evidence, parcels and land use for the worked block's bounding box grown by the margin, and
   writes `blocks.json`: the worked block's outline, its plots with their building indices, and
   its edges with their labels. The worked block's outline is computed from the city-wide
   corridor and building sets, so it is the same whichever square computes it; the test for that
   is below. A worked block larger than `BLOCK_CAP` (2 km across) is reported and still built.
3. **Assemble.** Each square gathers the corridors and worked blocks that overlap it from its own
   folder and its eight neighbours', takes the rest of the square as open land cut by evidence,
   clips everything to the square, and runs the surface, the openings, the metrics and the
   checks exactly as now. The partition a square writes is then made of pieces its neighbours
   also hold, and the shared edge agrees by identity.

What stays the same: `make_plots`, the cross-section fitting, the surface, the openings, the
checks, the renders, `compare.py` and the metrics all keep their meaning; this stage changes who
calls them with what, not what they do. `__main__.build` becomes the assemble pass; the stage 3
driver (`city.py`) runs the three passes in order.

Rules:
- Ownership is by geometry only (midpoint, representative point), never by order of discovery,
  and every list the passes write is sorted by a geometric key, so the result does not depend on
  how many processes ran or in what order.
- A pass reads only the files of the pass before it and the raw data. No pass reads another
  square's output of the same pass.
- Memory per process stays what it is: a window is the thing's bounding box plus a margin, so a
  long street or a big worked block loads more, but never the city.
- The 40 m `MARGIN` stays for the open land and the evidence in the assemble pass; it is no
  longer relied on for agreement.

Tests to add: a worked block whose outline is the same when computed from two different windows
that both contain it; a street edge whose fit is the same from two windows; and the neighbour check
on two squares built this way reporting zero positions without a partner.

Acceptance, measured with `city.py --all` on the Mac:
- the neighbour check reports **0 positions without a partner** at 1 cm across every shared edge
  and every parallel sample line (the only remaining differences are float noise from clipping
  identical geometry to the same line, which 1 cm covers);
- loose ends inside 0, overlap 0, uncovered and pavement steps no worse than stage 3's city
  figures (21 m² and 0);
- the three reference squares' evidence share within one point of stage 3's (79.3 / 83.9 / 70.8%),
  and `compare.py` run before every push;
- the city run not more than twice stage 3's 448 s;
- the data findings' count within a few percent of stage 3's 265, and the differences explained
  (a block no longer truncated may gain or lose a finding).

**Status: built, for review.** The whole city has been run (`out/city3b`, `--jobs 12`): 131 of 131
squares, 443 s. The neighbour check is met across all of it — **0 positions without a partner at
1 cm, worst mismatch 0.0 m, over 944 sample lines on 236 shared edges**. The three reference squares
are within a point of stage 3 on every figure (78.8 / 83.6 / 70.2% evidence, loose 0/0/0, overlap 0,
uncovered 0.7 / 0.3 / 2.7 m²). Two city figures miss and are diagnosed below rather than tuned.

| | stage 3 (`out/city`) | 3b | plan's acceptance |
|---|---|---|---|
| squares built | 131/131 | **131/131** | met |
| neighbour: without a partner | 5,041 | **0** | met |
| neighbour: worst mismatch | 349.877 m | **0.0 m** | met |
| overlap | 0.0 m² | 0.0 m² | met |
| total time | 448 s | **443 s** (p1 16 + p2 258 + p3 168) | met (ceiling 896 s) |
| evidence share | 57.6% | 62.6% | met (better) |
| loose ends inside | 0 | **0** | met |
| uncovered | 21.0 m² | 22.3 m² | missed (+6%) |
| opening failures | 0 (stale) | 722 | missed, explained |
| data findings | 265 | 377 | missed, explained |

The misses, each measured rather than guessed:

- **The loose end** was on square 5,5, at (3890.0, 4652.6), and is **fixed**. It was *not* `gather`
  reaching only the eight neighbours: the face beside the segments is owned by 5,5 itself and is
  gathered, and nothing in any square's written rows covered the far side (measured city-wide). The
  cause was that `relabel` overwrote pass 2's `("edge",)` label, and `("edge",)` is the one label
  `classify_edges` drops. Pass 2 labelled those segments `("open",)` against `("edge",)` — not a
  boundary. `relabel` found two faces for 14 of 5,5's 19 `("edge",)` segments and turned them into
  drawn boundaries, so a drawn edge met a dropped one and the drawn one had an end in mid-air. 1,079
  segments city-wide carry `("edge",)` on a side, and only 5,5 has any; the three reference squares
  have **none**, which is why they never caught it. A segment whose pass-2 label is `("edge",)` now
  keeps it. Separately, the ground is clipped to the map's own box (`once.map_bbox`): an outermost
  square's margin reaches past the ground the map has at all (5,5's B reaches 435 m past it) and pass
  2 never worked out there. Measured apart, the clip is *not* what fixed the loose end — the edge
  guard is — but nothing is written beyond where pass 2 cut.
- **Uncovered 21.0 → 22.3 m²** over 131 squares (+6%), with the same square (0,3) worst in both.
  Small but real, and not tuned.
- **The opening failures' baseline is stale.** Stage 3's city run writes `openings: {failing: 0}`,
  while stage 3's own code at the merge commit reports 19 on square 1,1 and 25 on 0,0 today, so there
  is no like-for-like zero. The reference squares are the honest comparison (stage 3 §"the three
  reference squares" keeps that run), and there 3b is **+9 on 0,3 and equal on 1,1 and 0,0**.

  **What they are, measured** (`review-stage3b/ITEM2-FAILING-PLOTS.md`), and this corrects an earlier
  note here that blamed the absorb step: **every one of the failing buildings has its house outside
  the square's worked area** — 258 of 258 across the three reference squares and the six next-worst
  city squares, 0 with the house inside B. A house just outside B (11 m for one on 1,1) has a large
  plot reaching across B's edge, so `blocks_for` clips it into B and the square gets a *fragment*
  (293.4 m² written, 0.066 m² in B). `front_edges` names the building index, which is correct — the
  fragment is real ground of that house's garden — but `find_openings` looks the house up in
  `houses`, which is built from the footprints that *intersect B*, and its first line is
  `if house is None: continue`. No opening can ever be recorded, so the check reports the building.
  The square holding the house gates it correctly.

  So it is not a plot, an absorb or a doorstep problem: the failing plots are ordinary gardens (2.4
  to 3,128 m² written), and the tiny ones in the check are **fragments clipped at B's edge** — 255 of
  258 are fragments of a larger plot. The absorb step is not implicated in any of them: with the
  denominator taken on the plot pass 2 *wrote* rather than the clipped fragment, only **2 of 258**
  have a written plot under an absorb threshold, and those two are cross-square too. (The earlier
  "24% genuine slivers" came from measuring the clipped fragment, which is tiny because it is a
  fragment.) The `D_same_label` exit is also a **no-op**: `make_plots` ends by grouping faces by
  label and unioning each group, so a small face whose neighbour carries its label is merged by that
  step regardless — measured, 0 of 729 small plot faces on 0,0 have every neighbour carrying their
  own label. The fix is in the check's *inputs*, and it is the co-developer's call which way:
  give `find_openings` the houses map-wide, or stop `front_edges` crediting a fragment to a building
  the square has no house for.
- **Data findings 265 → 377** (distinct places 257 → 360: 156 new, 53 gone). The movers are
  `edge_through_building` 22 → 96 and `plot_unreachable` 159 → 195; `building_cut` 47 → 43 and
  `narrow_corridor` 29 → 26.

  `edge_through_building` was bucketed finding by finding
  (`review-stage3b/ITEM4-EDGE-THROUGH-BUILDING.md`), and the 94 new ones are **not** a bug in the
  build and **not** a defect the player sees. They are not evidence lines: 77 of the 94 have no
  evidence line within 2 m and *none* has a lidar ridge within 2 m — `hedge_low` pointed at
  evidence, but it is the zone's default front material, used precisely when there is none. They
  are not boundaries through buildings: building on *both* sides of the edge (the defect the check
  is for) is **0 of 94** — every one is a plot edge against its own house — and **all 94 are at
  0.000 m from the footprint's own boundary**, not one even a centimetre inside. The same class is
  in stage 3: **21 of its own 23 findings are at 0.0 m too**. So the check's test — the edge's
  *midpoint* with `contains` — cannot tell a boundary running along a footprint's outline from one
  crossing it, and 3b simply gives it more chances: `classify_edges` merges one label pair into one
  line and 3b names more pairs, so its edges are longer (503.4 m against stage 3's 131.3 m, 326.8
  against 36.5) and more midpoints land on a footprint. The fix belongs in the check — a tolerance,
  or sampling along the edge rather than at its midpoint — and that is a change to a check, so it is
  written up rather than made quietly.

  `plot_unreachable` 159 → 195 is the same shape: the rule reads the drawn network, and 3b draws
  more boundaries (more fronts — 0,0: 621 against 556), so a plot that was reachable across an
  undrawn boundary is not. Not yet bucketed finding by finding.

Three things were found by running the check rather than the three squares, and each is a rule the
stage now keeps:

- **Classification reads the faces of the worked area, not of the square** (`cd7f286`). Pass 2's
  provisional labels are overwritten from the two assembled faces either side of each segment, the
  project's own rule, which pass 2 could not apply: it divided a worked piece knowing only that
  piece's buildings, evidence and parcels and never saw a corridor, so the ground beyond a piece
  was a probe's guess. The inferred edges lying on a corridor fall from 146 to 1. The faces decide
  the *kind* only: the source of a division — parcel, evidence or inferred — stays geometric, from
  the line it lies on, so a division between two plots keeps its parcel source. A segment that
  cannot find two faces keeps pass 2's label and is counted: 3 of 17,307 on the village square, two
  exactly on B's edge and one a 0.5 m stub 0.95 m inside it between two open faces, which is float
  noise at the edge of the worked area rather than a gap in `gather`.

  **The correction to the first report of this**, because the two failures look alike and are not.
  It was reported here — and in the commit message — that the parcel count fell 3,230 → 1,450
  *because* the classification read the square's own faces, and that reading B's restored it. That
  was wrong, and separating the two changes shows it. The stashed half 1 built its face list as
  `faces.append((g.intersection(SQ), kind, None))`: every plot face carried `data=None`, so
  `face_label` returned `("plot", None)` for *both* sides of a division, the two labels were equal,
  and the pair could not be named from the faces at all. On the village square, with the rule then
  in the stash: plot data `None` gives parcel 1,008 over B and 1,450 over SQ — the stashed figure —
  while a real building index gives 3,173 over B and 3,180 over SQ. So the missing index did almost
  all of the damage, and the face set moves the source of 13 edges. Reading B is still right, for
  the reason the plan gives — a division inside B has the neighbour's plot on both sides whichever
  square owns its piece — but it was not what the 1,450 was. The test for both is
  `tools/partition/tests/test_assemble.py`, and it fails on the stashed code.
- **A worked piece's open face can reach far past the piece** (`5bd0567`). A piece writes the whole
  parent-block open face whose representative point lies inside it, and that face is not bounded by
  the piece: measured, a 36 m piece carrying a 1,901 m² open face, and 160 rows city-wide whose
  plots reach a square's B while their own outline does not. Gating the gathered row on the piece
  dropped those faces from one square and not its neighbour — which is exactly what the check is
  for. What is kept is decided by the clip alone.
- **The held-out width test reads pass 1's fit** (`5bd0567`). It was the last live piece of the old
  stage-3 path in `build`: the square built its own windowed street graph, fitted it, and measured
  the tag against that fit, none of which the build used. It now lives in pass 1, where the fit
  happens, and pass 3 reads it from the files of the pass before it. The set is the plan's — a
  street crossing an edge is reported once, by the square holding the tagged stretch's middle — and
  the owning square is always one of the eight a square gathers (measured: 0 of 712 tagged
  stretches city-wide had their owner outside the mid-square's gather).

## The standing rule for measuring a line against a polygon

**Anything that measures a line against a polygon uses the polygon's interior, shrunk by 5 cm.**
`line.intersection(poly).length` counts a shared *boundary* as interior length, so a line lying exactly
along a polygon's edge comes back as fully inside it. Every boundary in this build runs along another
one: a front garden wall stands on the line where the carriageway meets the plot, a plot edge runs
along a pavement, a wall follows a kerb. Measured without the shrink, nothing is safe to conclude.

What it cost, twice:

- The writer clipped barriers against the road surface grown by a metre. A wall on the boundary was
  therefore inside the clipped area, and **7.4 km of front garden wall** on square 0,3 alone was
  deleted - every wall that stood exactly where it belonged. Growing the surface made it worse, but a
  clip against the un-shrunk surface would have deleted them too.
- The `br` crossing-a-carriageway check measured `run.intersection(carriageway_face).length`, so it
  reported **292 runs on square 0,3** where the truth was 22, and the writer was changed to satisfy
  the false number.

Use `check_tile.interior_length`, which does the shrink in one place. Where a polygon is used for its
area rather than its edge (a footprint's area, a face's area), the shrink does not apply; the rule is
about lines along edges.

## Stage 4: the game's map file

Goal: the game loads a partition-built city with no engine changes. About a week.

The game reads `MapData` (`web/src/map.ts`, the interface near the top): `t` the terrain grid
(262 x 262 vertices a square, `area.py` `CELLS`), `bl` buildings, `rd` roads with `w` and `pv`,
`br` barrier lines with `h`, `gt` gates, `fp` front paths, `dv` drives, `dr` doors, `tr` trees,
`sb` shrubs, `fx` street items, `mk` markings, `sh` signs, `wp` ponds, `wl` streams, and the
rest. `world.ts` draws roads as strips offset from the centre line with kerb faces (`strips`,
around line 519) and sinks the terrain under them (`sinkUnder`), and `map.ts` answers ground
height and collision from terrain plus roads plus walls. At this stage the partition writes that
same file, so the game draws it the old way and the gain is in what the file says, not how it is
drawn.

1. **Writer.** `tools/partition/write_map.py` producing one square's JSON from the partition:
   - `rd`: one record per corridor stretch (not per OSM piece), with `w` the carriageway width and
     `pv` the pavement widths of that stretch, and the taper handled by splitting the stretch at
     the taper's ends with the intermediate widths. Points every 4 m along the centre line with
     the road profile's heights as `z`. Bridges, spans and tunnels: take the current build's
     records for these unchanged (`prep_map.py` keeps them with their flags); do not rebuild them.
     Paths (footway, path, cycleway, bridleway, track) are `rd` records too, with no `pv` and no
     kerbs, at the path widths (a cycleway such as a converted railway line is a 3 m tarmac strip,
     not a street; the current build draws cycleways at street width with kerbs, which is wrong).
   - `br`: every plot edge that is a wall, fence, hedge or railing, as a line with the class the
     game knows (`walls.py`'s STYLE names) and `h`, cut at every opening. No line anywhere else.

     **Draw these from merged runs, not from raw segments.** `classify_edges` merges each label pair
     with `linemerge`, and how many pieces a boundary comes out in depends on which junctions fall
     where - so the same ground can be one 60 m line or three lines of 20 m, without any of it
     changing. Measured while doing stage 3b: two runs with different windows, the same total drawn
     length (13,418.17 m) and the same plots to the millimetre, differed in edge count (1,115 against
     1,112). That is harmless for the partition, because each piece is written once by its owner, but
     a writer that took the segments as they come would emit a different number of wall records for
     the same wall - so `br` is built from the merged run a boundary belongs to, and the merge is made
     once rather than per square.
   - `gt`, `fp`, `dv`: from stage 1's openings.
   - `bl`, `dr`, `by`, roofs, chimneys: from the current build's building pass. The cleaned
     footprints (sliver gaps closed) replace its footprints, so port `clean_buildings` into
     `prep_map.py`'s building step or call it from there; everything after that step is unchanged.
   - `t`: the terrain grid as now, but with the road profile's heights written under the
     carriageway and pavements (replacing `prep_map.py`'s flattening), so `sinkUnder` has nothing
     to do.
   - `tr`, `sb`, `fx`, `mk`, `sh`, landmarks, pitches, water, railway, canal, cable car: from the
     current build's passes, run after the partition, placed relative to the new cross-sections
     (lamps and signs on the kerb line, bins and benches on the pavement's back edge, trees inside
     plots and verges). The simplest route is to run `prep_map.py --tile` with a flag that takes
     `rd`, `br`, `gt`, `fp`, `dv` and the footprints from the partition instead of computing them,
     then lets its decoration passes run as they are.
2. **Stitching and streaming** stay as they are (`prep_tiles.py` `stitch`, `tiles.ts`).
3. **Clash check.** `tools/check_map.py` on the new city. Rule 9's counts (lone gates, doubled
   fences, walls on pavements, buildings in the road) should fall to near zero; rules 1 to 8 must
   not get worse. Fix what fails in the writer, not in a clean-up pass.
4. **Mac run and screenshots** through the queue: the full build, the clash check, and the shots
   in `tools/shoot.mjs`'s views file, plus views of the three reference squares at street level.
   Compare against the same views of the current build.

Acceptance: the game runs on the new city with the old engine; the pictures show continuous
pavements, no loose fences, gates in walls; the clash check is better on every rule; the co-developer has
walked it.

## Stage 5: one surface in the game

Goal: the ground the player stands on is the partition's mesh. About a week, and the one stage
that touches player movement, so it is decided on separately after stage 4.

1. **Format.** Add to `MapData` an optional `sf`: the surface as a triangle mesh per square,
   vertices `[x, y, z]` and triangles `[a, b, c, class]`, with kerbs and retaining walls as
   vertical faces (duplicate vertices at different heights), and `t` kept for the wide map and for
   anything that still reads it. Size it: the proof of concept gives 90k to 260k triangles a
   square before simplification; simplify flat plots to under a tenth of that (merge coplanar
   triangles within 2 cm) and quantise to centimetres, so a square's surface is a few hundred
   kilobytes compressed.
2. **Drawing.** In `world.ts`, when `sf` exists, draw it instead of the terrain, road strips,
   pavement strips and path strips, coloured by class with the existing materials; the kerb faces
   come with it. Bridges keep their own meshes.
3. **Walking.** In `map.ts`, `ground(x, z)` reads the mesh (a grid index over triangles per
   square); `floor` and `deck` as now for bridges and roofs; `collide` unchanged for buildings and
   walls. A kerb is a 12 cm step the player walks up as they do now with the strips. Traffic
   (`traffic.ts`, `vehicles.ts`) reads the road's `z` from `rd`, which matches the mesh by
   construction.
4. **Tests on the Mac,** muted headless, before and after: the FPS probe, the collision probe
   (`tools/collision_probe.mjs`), the climb probe, and a walk along a scripted route through the
   three reference squares logging the player's height every frame (no step larger than a kerb
   except on stairs, no fall through). Nothing left running.

Acceptance: the probes pass, frame rate within 10% of before on the Mac and on an iPad, and the
walk log shows no jumps.

## Stage 6: tuning and the switch

1. **Drive openings, and `dv` from them.** `find_openings` never produces one - `DRIVE` is defined in
   `openings.py` and never used - so a square's tile has no drives to write and `dv` comes out empty.
   The 47 drives in the current build's 0,3 tile are its own, and copying them would point at gates the
   partition no longer has, so the first partition tile leaves `dv` empty. The work is a rule: a drive
   is where a service way or track crosses a plot front, which `find_openings` already looks for and
   does not yet record.
2. The co-developer's eye: a list of places from his walks, each fixed as a rule in the right pass, never as a
   case.
3. **The majority-label wrinkle in `assemble.relabel`.** Pass 3 reads the two sides of a segment
   from the faces of the worked area, but a segment written by pass 2 is not itself noded against
   them, so it can run along a junction where one side changes face (a plot against two corridors in
   turn), or a third face can touch it at a corner. The rule that stands in is the two *labels*
   carrying the most of the segment's length, so a minority stretch is read from the wrong side.
   The clean answer is to node pass 2's network against the assembled faces and read each piece's
   own two faces, which is what the block's internal network already does (`ring_adjacency`).
   Measured, it is not where the remaining inferred edges come from — 3 of 17,307 segments on the
   village square find fewer than two faces at all, and 1 of the 288 inferred edges lies on a
   corridor (2 m) — so it is left as it is for now rather than re-cut mid-stage.
4. **Fragility of the block division to tiny line shifts.** `house_divisions` and the polygonize
   remain sensitive to input shifts on the scale of a centimetre: sorting inputs removed the index
   reorder that triggered it, but the underlying geometry can still turn 45 plots into 47 when a
   cut line shifts by 1 cm. Not an issue for stage 3b (the sort ensures identical inputs give
   identical cuts), but worth knowing when tuning the plot rules here.
5. `README.md` ("Rebuild a map") and `docs/new-area.md` rewritten for the new build;
   `CLAUDE.md`'s "Everything on the ground is laid out in one order" section replaced with the
   partition's order; `NOTES-FOR-AGENTS.md` updated.
6. Remove `walls.py`, `roadwidth.py`, `gardens.py` and the parts of `prep_map.py` the partition
   replaced, once nothing reads them.
7. Merge to the fork's `main`, full build and check on the Mac, then a pull request to the maintainer's
   `main` with the co-developer's approval quoted, as the project rules require.

## Risks and what to do about them

- **A bad footprint pinches a street.** Stage 3's checks name it; the fix is the footprint, and
  until then the corridor's class minimum holds (the plot gives way, not the road).
- **Lidar rows of parked cars read as walls.** The corridor fit treats a ridge inside a class
  minimum of the centre line as cars, not a wall; if that is not enough, drop ridges whose height
  is 1.3 to 1.8 m and whose length is under 6 m when they lie within 4 m of a carriageway.
- **Footways that are really pavements** are snapped onto their street in the street graph; a
  path left standing beside a pavement is rule 9's last item and should be zero after stage 4.
- **Performance** is in the plot pass; the proof of concept is linear in the number of faces, and
  stage 3's process pool covers the city in minutes. If it does not, cap the seeds per block.
- **Bridges, tunnels, water and the railway** are deliberately left to the current code through
  stage 4; they already work and are not what the brief is about.
