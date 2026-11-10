# One pass: what the map build does, what it repeats, and how to make it one pipeline

A cold build of Bath takes 12.5 minutes and 2.3 CPU-hours on the M4 Max. Cape Town takes 19.4
minutes and 3.4 CPU-hours. The co-developer's target is under 5 minutes.

This note:
- maps every step of both phases, from the code;
- measures each step's CPU on one dense Bath square (-1_2), Cape Town's heaviest square (2_2), a
  sparse Bath square (3_-2), and both whole maps;
- sorts every repeat or waste into three kinds: (a) it can go with the squares byte-identical;
  (b) part of it can go byte-identically; (c) removing it changes the output;
- sets out the one-pass pipeline and the order to build it in.

The main track is the co-developer's: stay byte-identical and get the speed by reordering, recombining and
refactoring, so that shared work is done once. The (c) items are listed separately, as an option.

Everything here was measured at `937402f5` (the combined branch with build-speed merged), in the
worktree `cd-onepass` on branch `claude/one-pass-plan`. The prototypes (A1, A2, G2) are now
merged; "As landed" below has their timings on the rebuilt maps.

## The short answer

| | Bath | Cape Town |
|---|---|---|
| cold build now | 747 s wall, 8,312 CPU-s | 1,165 s wall, 12,361 CPU-s |
| byte-identical route, measured so far (A1 + A2 + G2) | 592 s wall, 7,685 CPU-s; 131/131 squares identical | 923 s wall, 10,459 CPU-s; 120/120 squares identical |
| byte-identical route, everything in (a) and (b) | about 8–10 min | about 11–13 min |
| with the (c) items too | about 5–6 min | about 6–8 min |

The byte-identical route does not reach 5 minutes for Bath. Under that constraint most of
prep_map's work is live:
- its guessed gardens decide where the lidar walls, trees, shrubs, street items and doors that
  survive end up;
- its road solve shapes the ground every final street is held to.

So the partition can only skip a thin slice of prep_map, and the gain has to come from three
places:
- overlapping the phases;
- removing repeats inside the partition;
- making the hot loops cheaper with exactly the same answers.

All of that together takes Bath from 8,312 to roughly 6,000–6,500 CPU-s, which on 14 cores is about 9
minutes. Getting under 5 minutes needs about 3,600 CPU-s. That means replacing prep_map's
guesses with the partition's own answers, which is (c).

Cape Town is a different case. Its partition is dominated by one bug-shaped cost (the "giant
block", below), and fixing that is the biggest single saving on any map.

## As landed (on `7c215cc9`, every map rebuilt)

A1, A2 and G2 were brought onto `7c215cc9`, the commit with every map rebuilt. With the A1 change
below, every file under `web/public/maps` and `data/<map>` comes out byte-identical to that
commit's, on all four maps. Each map was built cold (fresh unpack, empty store) with the README's
full command, under `slot.sh --both`. Times are wall seconds / CPU seconds (user + sys):

| map | `7c215cc9` | A1 + A2 + G2 | A1 with the squares niced, + A2 + G2 |
|---|---|---|---|
| Bradford-on-Avon | 116 / 741 | 98 / 713 | 114 / 801 |
| Hackney | 218 / 1,717 | 210 / 1,835 | 224 / 1,865 |
| Cape Town | 1,271 / 12,983 | 1,361 / 11,652 | 1,063 / 11,304 |
| Bath | 729 / 8,235 | 785 / 8,109 | 779 / 8,324 |

On this commit, A1 as prototyped slowed the big maps. Both phases use every core, so the passes
(the longer road) lost the CPU they needed to prep_map's squares. On Cape Town, `pieces` went from
91 s to 309 s and `structures` from 406 s to 687 s. prep_map's squares now run at `nice 10` while
the passes run beside them. That makes Cape Town 16% faster than before. Bath is no faster: its
divide is better balanced than it was on `937402f5`, so there are few idle cores for the squares to
fill. The small maps are within run-to-run noise. Other agents share the machine outside the slots,
so take a single run's time to within about 5–10%.

## How it was measured

Everything runs through `scratchpad/slot.sh`. The measuring scripts named below (`loop.py`, `secttime.py`, `pertime.py`, `kerbs_alt.py`) are in this session's scratchpad (`onepass/` in it), not in the repo. Timed runs use `--both`, with no other build on the
machine.

**Whole maps.** `prep_tiles.py` cold, with an empty `CD_PARTITION_CACHE` store, under
`/usr/bin/time -l`. `pool_use` also prints each pool's 8 slowest tasks, and a divide task is named
by its piece count and first piece (`PROFILE` lines; that is the only change to `once.py`).

**One square.** `scratchpad/onepass/loop.py <worktree> <map> ti tj <run dir> [--base <dir>] [--skip ...]`
runs one square through both phases in fresh processes, each under cProfile:
- `prep_map.py --tile`, under `secttime.py`, which times every top-level line of the script and
  adds them up into its `# ----` sections;
- divide (`_fit_square_blocks`);
- assemble (`assemble_one`);
- write (`build_tile`, with the loop's own prep square as its base).

It then byte-compares `prep.json`, `blocks.json`, `partition.json` and the final square against a
baseline run. The city-wide outputs (graph, corridors, pieces, structures, every other square's
blocks) are copied from the full build into the run folder, so a per-square stage only
overwrites the loop's copy.

A run on -1_2 takes about 6 minutes; with `--skip prep,divide,assemble` it takes about 2.5.

**Per piece.** `scratchpad/onepass/pertime.py <map> <once dir> ti tj` times each `make_plots`
call of a square's division, with its region's size, to tell honest density from one blown-up
block.

All task times below are task wall time inside a pool. With 14 workers on 10 performance and 4
efficiency cores they run 10–50% slower than the same task alone; the one-square loop gives the
uncontended figures.

## Measured CPU

### Whole maps, by stage (cold, empty store)

| stage | Bath task-s | Bath wall | Cape Town task-s | Cape Town wall | reaches the map? |
|---|---|---|---|---|---|
| split the layers | – | 2 s | – | 2 s | yes |
| prep_map, every square | 2,584 (131 squares) | 186 s | 2,124 (120) | 157 s | partly (see dataflow) |
| graph | 2.5 | 2.5 s | 4 | 4 s | yes |
| corridors | 86 | 8 s | 110 | 9.5 s | yes (plus held-out widths: reports only) |
| pieces | ~33 (own pool) | 33 s | ~87 | 87 s | yes |
| divide | 3,154 | 234 s | 8,030 | 658 s | yes |
| structures (beside divide) | 56 | (hidden) | 130 | (hidden) | yes |
| assemble | 651 | 52 s | 517 | 39 s | yes (report.pkl: reports only) |
| write, plus post-passes | 2,570 | 199 s | 2,487 | 189 s | yes |
| reports | 175 | 18 s | ~110 | 11 s | **no** |
| **total** | **8,312 CPU-s** (user+sys) | **747 s** | **12,361 CPU-s** | **1,165 s** | |

The slowest tasks (the tails each stage waits on):

- **Bath**
  - prep: -1_2 98 s, -2_2 90, 1_4 89
  - divide: -1_2 121 s (170 pieces), -2_2 98, -1_1 88, 1_4 87, -2_3 81, -6_5 78
  - assemble: -1_2 28 s
  - write: -1_2 170 s, 1_4 157, -2_2 149, -2_3 122
- **Cape Town**
  - prep: 5_0 59 s
  - divide: -1_3 484 s, -2_1 477, -2_2 473, 2_2 468, 4_2 421, 1_3 371, 4_0 369, 6_3 350
  - assemble: 13 s
  - write: 2_2 108 s, 4_0 104, 1_2 104

### One square, uncontended (the loop)

| square | prep | divide | assemble | write | all |
|---|---|---|---|---|---|
| Bath -1_2 (densest) | 64 CPU-s | 139 | 34 | 144 | 381 |
| Cape Town 2_2 (heaviest) | 26 | 272 | 12 | 89 | 399 |
| Bath 3_-2 (sparse) | 8.2 | 17 | 5.1 | 12 | 43 |

Where the time goes inside each stage on Bath -1_2:

- **prep_map, 64 s**
  - the garden chain, 33 s (52%):
    - `gardens.plots` 12.6
    - `_tidy_gardens` 5.5
    - `_straighten` 4.0
    - `_undouble` 3.3 + 2.6 (the second at the corridor step)
    - `_join_runs` 2.6
    - `_close_gaps` 1.1
    - gaps 1.2
    - `_unoverlap` 0.5
  - roads and bridges (the road solve), 9.3 s (15%)
  - shop-front pavements 3.9
  - corridors kept clear 5.3
  - buildings 3.0
  - lidar walls 1.7
  - road widths 1.4
  - the terrain detail figure 1.7
- **divide, 139 s**
  - `make_plots` 138 over 170 pieces, of which:
    - `_cut_region` 81
    - `house_divisions` 37
    - `_uncovered` 32
    - `ring_adjacency` 20
    - `_one_boundary` 17
    - `_recut` 10
  - reading city-wide files 12
- **assemble, 34 s**
  - `classify_edges` 8.7
  - `blocks_for`/`relabel` 6.2
  - `_drop_dangling` 3.9
  - `loose_ends` 3.8
  - `find_openings` 3.7
  - layers 2.6
  - pickling report.pkl 2.4
- **write, 144 s**
  - `street_surfaces` 71 (`neat_kerbs` 38.5 of it)
  - `walls_and_gates` 22.6
  - `roads_from_corridors` 9.0
  - `path_barriers` 6.7
  - `tidy_walls` 6.7
  - `settle` 5.3
  - `paths_from_openings` 5.0
  - `drop_clashes` 4.0
  - `gates_for_doors` 3.5
  - reading city-wide files 4.7

Cape Town 2_2:
- prep 26 s: bridges 8.2, roads 4.3, shop fronts 4.2, lidar walls 2.3. There are no garden
  guesses to speak of.
- divide 272 s: 187 s of it is `_street_edge` (below), and the giant block's cut is 59 s.
- write 89 s: `street_surfaces` 42, `neat_kerbs` 15.

On Bath 3_-2 (sparse), the fixed costs show:
- divide spends 5.4 of its 17 s reading the city-wide files (`once._read_once`: corridors, parents,
  pieces);
- write spends 4.4 of its 12 s doing the same.

In a pool these are paid once per worker, not once per square.

## Outlier tasks: honest density or a bug?

**Bath, divide: -1_2 121 s (combined baseline: 263 s).** This is honest density. Its 170 pieces
each cut their own parent, and the slowest piece takes 5.5 s (a 3.1 ha block with 280 plots).
Nothing dominates. The baseline's 263 s was before build-speed. The same square is the slowest in
prep, assemble and write, which fits it being the city centre.

**Bath, write: -1_2 170 s (combined baseline: 358 s).** This is honest density, made worse by a
loop that grows with it. `neat_kerbs` takes each small sliver's ring and intersects it with a
5 cm buffer of the whole square's road surface. The cost of one intersection grows with the size
of the road polygon, and the number of slivers grows with it too, so the work grows about
quadratically. It costs 38.5 s on -1_2, but only a few seconds on an ordinary square. A local
rewrite runs it in 4 s (see prototype F2), but its answers are not yet bit-for-bit the same.

**Bath, divide: -6_5 78 s.** This is a big rural parent block: 153 ha, 9,728 points, 96 pieces.
Its cut takes 15.5 s, and each further piece of it costs up to 6 s more, because of the
per-piece region-wide work described under Cape Town. It is mild here.

**Cape Town, divide: the giant block, a bug.** One parent block is 2,978 ha with 42,358 points,
centred at (-431, 1864). It is cut once by every square that owns a piece of it (at least -1_3,
-2_1, 2_2 and 4_2), for 52–62 s each. Every further piece of it in the same square then costs
another 14–15 s, even reusing the cut: `make_plots` grows, labels, re-cuts and re-adjoins the
whole parent once per piece. -1_3 spends 52 + 3×14.5 s on it, and 4_2 spends 62 + 5×14.5.

This is the block cd-fix-gardens shattered from 19,133 faces to 832. That fix cuts the size of
each pass, but not the number of passes (one per square, then once more per piece).

**Cape Town, divide: the window-wide street edge and a cache that empties itself, a second bug.** Every square whose window takes
in the giant block pays for it on every parent, not just the giant one. A square's divide window
is the union of its parents' boxes, so taking in the giant block makes the window about 3,000 ha.
`plots._street_edge` then takes each small region's outline away from a 1 cm buffer of the union
of every building in that window.

On 2_2, 551 parents spend 187 of the square's 272 s in it, and parents of 27–130 points take 8 s
each. The cost per parent grows with the window, and the number of parents grows with it too.

The deeper cause is the cache that is meant to stop this. `plots._buffered` keeps `g.buffer(d)`
while `g` is the same object, so the window's building union should be buffered once per task.
But the cache was emptied whenever it held more than 8 entries, and the per-block buffers (each
block at 1.0 m and 0.5 m) fill it within a few blocks. So the window's union, the costliest
buffer of all, was thrown away and buffered again every few blocks: 1,326 calls cost 164 s on
2_2.

- **Fix (prototype G2):** evict the least recently used entry instead of clearing the cache, and
  take the region's outline away from only the buffered buildings whose boxes meet it.
  Both are exact: the same buffers, the same differences.
- **Measured on the loop:**
  - Cape Town 2_2 divide went from 272 to 96 s;
  - Bath -1_2 from 139 to 101 s (the thrash hits Bath's dense squares too: shapely's buffer time
    fell from 38.8 to 24.6 s, and `_cut_region` from 81 to 52 s);
  - Bath 3_-2 is unchanged at 17 s.
  `blocks.json` and `partition.json` were identical on all three.
- **Measured on whole maps** (with A1 and A2), every square was identical:
  - Cape Town went from 1,030 to 923 s wall and from 12,242 to 10,459 CPU-s; divide fell from
    8,030 to 5,642 task-s.
  - Bath moved only within noise (597 → 592 s, −35 CPU-s). In the pool each worker divides
    several squares and its cache lives across them, so the thrash on a lone -1_2 was worse than
    in the build. The Bath win is real only for a square built on its own.

**Pembury and Bradford-on-Avon** (from cd-combined's logs; not rebuilt here):
- Pembury's divide is 866 task-s, but its longest task, 1_2, takes 161 of the stage's 162 s wall
  (2_2 140 s, 2_0 122 s). For a map of 23 squares that looks like the same giant-block pattern:
  one huge rural parent shared by several squares.
- Bradford-on-Avon's longest are 2_1 44 s, 1_1 32 s and 1_2 24 s, which looks like honest density.

Worth a `pertime.py` run on Pembury's 1_2.

## Dataflow (summary; the full step tables are in the appendices)

The partition's city-wide passes (graph, corridors, pieces, divide, structures, assemble) read
the map's layers, the terrain, the lidar runs and kept lidar. **They never read prep_map's
squares.** Only the writer (`build_tile`) does. It starts from the prep square, edits it in place
and writes it out, so any key it doesn't touch is prep_map's output.

What happens to each of prep_map's outputs in the final square:

| what | fate | so prep_map's work on it is |
|---|---|---|
| `bl`, `wp`, `lx`, `rk`, `cn`, `pl`, `pi`, `wf`, header | kept as is | live |
| `t.h` terrain | kept, edited only near bridges, approaches, dips and tunnel mouths (`fill_dug_ground`, `lay_ground`) | **live**: the ground flattened under prep's own roads is the ground every final street is held to (`follow_ground`, 0.4 m) |
| `t.k` ground kinds | kept, read | live |
| `tr`, `sb`, non-car `fx`, `dr`, `by`, `sh`, `lm`, `mk`, `wl`, `wr`, `tn` | kept, then filtered, moved, given new heights or restrung | live, including where prep placed them against its guessed fences, gates, paths and drives |
| `rd` | replaced | partly live: old spans (`fill_dug_ground`), paths far from any new way (carried verbatim), `ow`, pedestrian class, `bu`, `pr` |
| `br` | replaced | partly live: the runs with `h` (lidar walls) are re-read as `measured`, after prep's tidy chain has filtered, extended, restyled, trimmed and gapped them against its guesses; every prep run, guessed or not, is read as a 1.5 m test in `drop_walls_on_paving` |
| `gt`, `fp`, `dv`, parked cars in `fx`, `drn` | replaced, never read | dead at the end, but their placement shaped kept things (trees and shrubs stepped out of gateways, front paths and drives; lidar walls gapped for moved gates) |

So the work that is dead end to end is small: placing and levelling parked cars, and a few
style-only steps on runs that are thrown away. Everything else in prep_map reaches the final
square through some kept output.

The repeats run the other way. The partition builds each of these again from the raw data:
- the street network (a second graph from the same layers);
- road widths (corridors, against prep's `roadwidth`);
- bridges and road heights (`structures.solve`, a port of prep's bridge section, without
  `grading.py`), then a third time locally in the writer;
- buildings, cleaned four times: prep, each corridor window, `pass_pieces`, and each assemble
  window, where the result is thrown away;
- barriers and lidar runs, read and joined five times;
- gardens, gates, front paths, drives, parked cars and wires.

## The repeats and wastes, classified, with their cost

Costs are Bath CPU-s over the whole map unless marked. "Measured" means a prototype ran and was
byte-compared; "estimated" means worked out from the profiles above.

### (a) Removable with every square byte-identical

| # | what | cost | how | status |
|---|---|---|---|---|
| A1 | The partition's passes wait for prep_map, though they never read its squares | 81 s **wall** on Bath (747 → 666 s); CPU unchanged | start `stage.py --passes-only` as prep_tiles starts building, then `--passes-done` for the writer | **measured, 131/131 squares identical**; with A2, Bath 597 s and Cape Town 1,030 s, all squares identical |
| A2 | prep_map works out the terrain detail figure from every terrain tile, in every square; it is one number for the map | 1.74 s/square: 228 CPU-s Bath; 0.9 s/square: ~108 CPU-s Cape Town | kept once per set of terrain tiles (`_detail()` in prep_map) | **measured identical** (Bath 3_-2, Cape Town 2_2, and both whole maps with A1) |
| A3 | Reports on the build's path: `pipeline.py report`, the held-out width fits in pass 1, pickling `report.pkl`, and assemble's loads that only count (`osm-roads`, `land_use`) and its thrown-away building clean | report 175 CPU-s, 18 s wall; plus about 3–5 s per dense square in assemble, about 150 CPU-s | run the reports after the map is written, in the background or on request, and drop the counting loads and the second clean from assemble (`land_use` also leaves assemble's key) | estimated; never reaches the map by construction |
| A4 | Parked cars placed, cleared and levelled in prep_map; the writer drops every one | ~0.5 s per dense square, ~40 CPU-s | leave them out of prep_map's `street_furniture` call and `car_clear`/`car_level` (they are placed last, and nothing after reads them) | estimated; check with the loop |
| A5 | `_buffered`'s cache emptied every few blocks, so the window's building union was buffered again and again, and `_street_edge` took each region off the whole union | Cape Town 2_2: 176 of 272 s; Bath -1_2: 38 of 139 s. Whole maps with A1 + A2: Cape Town −1,783 CPU-s (divide 8,030 → 5,642 task-s), Bath within noise (−35 CPU-s) | evict least recently used; only the buffered buildings near the region (`_parts_near`) | **measured identical** (prototype G2), on the loop and on both whole maps |
| A6 | Each pool worker parses the whole map's corridors, parents and pieces, and the writer parses `structures.json` and 8 neighbours' whole prep squares (for `bl`) per square | ~5 s per worker per pool (divide, assemble, write; 3 × 14), ~0.6 s per dense square for the neighbours: ~250 CPU-s | load once in the parent and fork the workers (macOS spawns by default; use a fork context for these pure-Python pools), and hand the writer its neighbours' `bl` from the passes | estimated |
| A7 | A parent block whose pieces belong to several squares is cut once per square | 1.48× the parent points cut (1.85× weighted by points^1.5); `_cut_region` is ~60% of divide: ~550–900 CPU-s Bath, much more on Cape Town's giant block | one task per parent block (or per group of parents), its pieces written back to their squares' `blocks.json` | byte-identical only if `make_plots` really gives a parent's faces independently of the window (stage 3b's design). It must be proven with the loop before it counts |
| A8 | Within a square, divide parts each load the square's whole window again | measured +643 CPU-s when the parts were made four times finer | work the window inputs out once per square and share them between its parts | measured: finer parts are identical (160/160 `blocks.json`) and cut the tail from 121 to 76 s, but cost more CPU until the window is shared |
| A9 | Hot loops that do whole-square geometry per small piece: `neat_kerbs` (38.5 of write's 144 s on -1_2), `walls_and_gates`, `pave_to_walls`, the `make_plots` per-piece seeding (`f.buffer(SEED_REACH)` for every face of the parent, `reach` for every house of the parent) | `neat_kerbs` alone ~400 CPU-s Bath and the -1_2 tail; the rest estimated at 300–600 | local versions that give the same decisions. Caching the per-parent `reach` buffers in `shared` is exact by construction | F1 (cache the opening): identical, 1 s. F2 (local edges): 38 → 4 s but **not yet identical**; lengths differ by up to 7e-9 m and no threshold flips in round 1, so the difference is in a later step and needs finding |

### (b) Partly removable byte-identically (keep only the slice a kept output reads)

| # | what | slice that is live | removable | cost |
|---|---|---|---|---|
| B1 | prep_map's garden chain (33 s of 64 on -1_2; ~1,000–1,300 CPU-s Bath) | almost all of it: the guessed boundaries and gates decide which lidar walls survive and how they are cut, and where trees, shrubs, street items, doors, benches and boulders go | canopy-hedge retyping of guessed runs (style only); the gate-opening and lone-stub passes on runs without `h` at the corridor step, only where no tree, shrub or item test reads them afterwards | ~1–2 s per dense square, ~100 CPU-s; each needs a loop proof |
| B2 | prep_map's `br` as read by `drop_walls_on_paving` | only a 1.5 m buffer of every run | nothing, unless the test moves into prep_map's tail and passes on only the buffer | negligible |
| B3 | prep_map's road solve (9.3 s on -1_2, 12.5 of 26 on Cape Town 2_2) | all of it: its flattened ground is kept everywhere at grade, and its span flags drive `fill_dug_ground` | the span/ramp regrowth that only feeds the discarded `rd` heights (P:2089-2160) | small; most of that section also feeds the ground |

### (c) Needs an output change (the co-developer's option)

| # | what | cost | replacement |
|---|---|---|---|
| C1 | prep_map's guessed gardens, tidy chain, gates, front paths and drives, run only to place lidar walls, trees, shrubs and items that the partition then re-fits | ~1,000–1,300 CPU-s Bath (about half of prep in dense squares); little in Cape Town | the partition's own boundaries (divide/assemble edges, openings, front paths) are what lidar walls, trees and shrubs are fitted against (see the pipeline) |
| C2 | the road solve done twice: prep_map per square over a 500 m halo (about 4.4× the square's area) with `grading.py`, and `structures.solve` city-wide without it; then a third, local pass in the writer | prep road sections ~400–600 CPU-s Bath, ~800–1,000 Cape Town; writer re-solving ~10 s on -1_2 | one city-wide street graph and one height solve (with `grading.py`'s grade), from which the ground is flattened once |
| C3 | the per-piece region-wide work in `make_plots` (grow, label, re-cut, re-adjoin the whole parent for each piece) | Cape Town ~14 s × pieces of the giant block per square; Bath -6_5 ~6 s per piece | divide each parent once with every piece's seeds at once. Pieces are at least 2 × REACH_GROW apart, so the growths can't meet, but the shared re-cut changes faces |
| C4 | buildings cleaned four times, barriers and lidar runs joined five times, wires strung four times | estimated 200–400 CPU-s | one cleaned building set and one evidence set, city-wide, read by every stage |
| C5 | shatter fix for giant blocks (cd-fix-gardens, already accepted) | Cape Town: 355 s → 17 s on that block in the fix's own measurement; with C3 and A7, the giant block costs one cut | – |

### Halo work, in one place

- **prep_map**:
  - every square solves its roads 500 m beyond a 60 m margin (`ROAD_BOX`), so each street is
    solved by up to about 4 squares;
  - every square reads terrain 1,250 m round itself and works water over its 8 neighbours;
  - every square classes buildings 150 m beyond its margin.
  - None of this can be shared byte-identically, because the answers depend on the window
    (that's why the window is there). It is (c), and it goes away with C2.
- **partition**:
  - corridor windows overlap by REACH + FILTER_SPAN (26 m);
  - divide windows reach to the whole parent blocks, up to ~1.7 km, and the window-wide work in
    A5 grows with them;
  - every assembly reads its 8 neighbours' outputs over a 40 m margin, so the strips along each
    seam are noded and classified twice, and the corners four times. That is about 2 × 80 m / 1,043 m
    ≈ 15% of assemble, ~100 CPU-s, and is (c): a seam assembled once would be a different noding.

## Prototypes run on the loop

| # | change | square / map | saved | byte-identical? |
|---|---|---|---|---|
| A1 | passes beside prep_map (`prep_tiles.py`, `stage.py --passes-only/--passes-done`) | Bath, whole map | 81 s wall (747 → 666) | yes, 131/131 squares |
| A1 + A2 | both together | Bath, whole map | 747 → 597 s wall; 8,312 → 7,721 CPU-s | yes, 131/131 squares |
| A1 + A2 | both together | Cape Town, whole map | 1,165 → 1,030 s wall; 12,361 → 12,242 CPU-s | yes, 120/120 squares |
| A2 | terrain detail kept once (`prep_map._detail`) | Bath 3_-2 (prep 8.1 → 6.2 s), Cape Town 2_2 (0.9 s) | 1.74 s and 0.9 s per square | yes (prep.json identical, both runs) |
| A8 | divide parts four times finer (`jobs * 16`) | Bath, divide | longest task 121 → 76 s; +643 CPU-s | yes, 160/160 blocks.json; reverted |
| F1 | `neat_kerbs` keeps each surface's opening | Bath -1_2 write | 1 s (144 → 141) | yes; reverted (too small) |
| F2 | `neat_kerbs` against local edges | Bath -1_2, `neat_kerbs` alone | 36 → 4 s | **no**, not yet; kept as `scratchpad/onepass/kerbs_alt.py` |
| G | `_street_edge` against nearby buildings only | Cape Town 2_2 divide | 272 → 254 s | yes |
| G2 | G, plus `_buffered` evicting least recently used instead of clearing | Cape Town 2_2 / Bath -1_2 / Bath 3_-2 divide | 272 → 96 s / 139 → 101 s / 17 → 17 s | yes, `blocks.json` and `partition.json` on all three |
| G2 | same, with A1 and A2 | both whole maps | Bath 597 → 592 s wall, 7,720 → 7,685 CPU-s; Cape Town 1,030 → 923 s wall, 12,242 → 10,459 CPU-s (divide's longest task 484 → 353 s, 4_0) | yes, 131/131 and 120/120 squares |

## The one-pass pipeline

The CLAUDE.md order: measured things first and never moved (terrain, buildings, real walls,
trees, water); then streets; then gardens and boundaries; then small things. Each is computed
once, at its own scope, and every later stage reads it rather than working it out again. The
stages, with their scope:

1. **Layers, once (city-wide).** Each layer is parsed once into an indexed store (`partition.data`
   already does this per process). It is written as one file the workers fork over, not re-parsed
   per worker. prep_tiles' per-square cut goes, since nothing then re-reads a square's 650 m cut.
2. **Measured things (per square, no halo beyond what each needs):**
   - terrain grid, from the survey (and the city's own survey where there is one);
   - buildings: footprints cleaned once city-wide (`pass_pieces`' clean becomes the only one),
     heights and roofs from the kept measurements;
   - water, with levels worked over the square and its neighbours as now;
   - lidar wall runs, raw from the measurements;
   - tree crowns from the canopy, unfitted.
   These are prep_map's building, water and lidar steps lifted out, with the same code.
3. **Streets (city-wide graph, per-edge fit).**
   - One street graph (`build_graph`).
   - Corridors fitted between the buildings and the real walls (`_fit_square_edges`).
   - One height solve (`structures.solve` with `grading.grade` folded in, so the gradients are
     prep_map's).
   - The ground is flattened under these streets once: prep_map's `flatten`/blend, run on the
     corridors' carriageways and the solved heights, per square on the square's grid plus the
     blend reach. The writer's `fill_dug_ground` and `lay_ground` then have nothing to undo, and
     `follow_ground`'s 0.4 m hold can go.
4. **Gardens and boundaries (per parent block, then per square).**
   - Pieces and parents city-wide.
   - Each parent divided once, with all its pieces' seeds (A7, C3).
   - Assembly per square.
   - Then the boundaries are settled (`settle`, `walls_and_gates`).
   - The lidar walls are filtered and cut against these edges, not prep_map's guesses:
     - a run along a drawn boundary is that boundary (`measured_not_drawn`'s 1.5 m rule already does
       this);
     - a run along nothing stands;
     - runs are gapped at the partition's openings.
     This replaces `garden_sides`, `_close_gaps`, the restyling and the gate gaps in prep_map.
   - Gates, front paths and drives come from the openings (`gates_for_doors`, `paths_from_openings`,
     `drives_from_openings`), once.
5. **Small things (per square), against the final layout.**
   - Trees: the canopy tops of step 2, fitted against the final boundaries, gates, paths, drives and
     the carriageway and pavement faces. This is prep_map's tree-fitting code (P:3116-3222, 3876-3943),
     fed the partition's outputs. `drop_clashes` then has nothing to move.
   - Shrubs, street furniture, signs, poles and benches the same way.
   - Doors are placed against the final boundaries.
   - Parked cars and crossings once, as the writer places them now.
   - Wires strung once, city-wide, after every square is written.
6. **Reports (off the path).** Metrics and checks run after the map is written, and on request.
   `check_map.py` stays the gate.

**Replacing the dependencies on the discarded guesses (the (c) part):**

- **Lidar-wall filtering.** Today prep_map drops a run along a guessed side fence and
  `measured_not_drawn` keeps what the partition didn't draw. In one pass, the runs are matched once
  against the partition's drawn edges (the 1.5 m rule), cut at its openings and off its pavements,
  and joined. `garden_sides`, the 2.5 m extension, the restyle to the guessed fence and the guessed
  gate gaps go.
  - On a map without parcels (the fallback), the partition's plots follow the blocks and the house
    fronts, and the same rule applies to those edges.
  - On a map without lidar runs, there is nothing to filter.
- **Tree and shrub fitting.** Prep_map's fitting code stays, but it is fed the final boundaries,
  openings, front paths, drives and street faces instead of its guesses and its own road widths.
  It runs after the writer's layout, as step 5.
- **Ground flattening.** It runs once, from the single road solve (step 3), under the corridors'
  carriageways. The writer's re-fill and re-lay of the ground under spans and approaches become
  the only lay, not a correction. Bridges' and tunnels' ground handling (the cut under decks, the
  bores) moves with it.

**Checks.**
- Bath must measure as good as or better than now on `tools/check_map.py` (rule 9's clash counts
  among them), and the counts must not be gamed.
- Maps without parcels (Cape Town) and without lidar runs (outside England) must still build: the
  partition already does without both, and nothing above adds a dependency on either.
- No per-place special cases.
- Every map packs the same abstract layers.

## Estimated cold-build times

The machine gives about 14 × 0.87 ≈ 12 CPU-s of task work per second of wall time when the pools
are kept full; that is the packing measured with the passes beside prep_map. Wall time is the
larger of CPU / 12 and the longest chain of tasks that must run in order.

**Bath, byte-identical (a + b).**
- A1–A6, A8 and B1 as measured or estimated: 8,312 − 228 − 325 − 40 − 2 − 250 − 100 ≈ 7,370 CPU-s.
  That is about 615 s if the pools are kept full.
- With A7 proven (−550 to −900) and A9 made exact (−400 to −700): about 5,800–6,400 CPU-s, or
  480–530 s.
- The chain through -1_2 is about 340 s (pieces 33 → divide 121, or 76 with A8 → assemble 28 →
  write 145, or about 110 with F2). It is not the limit once the pools overlap.
- So the byte-identical route gets Bath to **about 8–10 minutes**.

**Bath, with (c).**
- C1 −1,100, C2 −500, C3 −200, C4 −300: about 3,700–4,300 CPU-s, or **about 5–6 minutes**.
- Below 5 minutes also needs the writer's and divide's hot loops cut by half (A9 on a wider
  scale), or more cores.

**Cape Town.** Measured byte-identical so far: 923 s wall, 10,459 CPU-s (A1 + A2 + G2).
- Divide is still most of it: 5,642 task-s, and its tail is one square, 4_0 at 353 s, that the
  pools wait on. The giant block is the cause: it is cut once per owning square, then again per
  piece (C3, C5).
- With the rest of (a) and (b) (A3, A6, A8 sharing the window and making the parts finer so the
  tail splits, A9): about 8,500–9,500 CPU-s, with the chain through 4_0 near 300 s. That is
  **about 11–13 minutes**, set by CPU rather than the tail.
- A7 (one division per parent) would help Cape Town most, because the giant block's cut is
  repeated in at least four squares, but it only counts once it is proven exact.
- With (c): the shatter fix (C5: the block's cut from 355 s to 17 s in its own measurement) and
  C3 remove most of the giant block's cost, about 2,000–3,000 task-s of divide; C2 removes the
  double road solve, which weighs more here (bridges are 8 of prep's 26 s on 2_2). That is about
  5,000–6,000 CPU-s, or **about 6–8 minutes**. Cape Town has no garden guesses, so C1 saves little
  there.

## Order of work

Each stage is proven on the loop first (-1_2, then Cape Town 2_2 and Bath 3_-2), then on both
whole maps with every square byte-compared. Then `check_map.py` counts and a few shots are taken
as a sanity check.

Byte-identical, first:

1. **A1:** run the passes beside prep_map. Prototype on the branch; identical on both
   whole maps (with A2).
2. **A2:** keep the terrain detail once. Prototype on the branch.
3. **A5 (G2):** the `_buffered` cache evicts least recently used, and the street edge works
   against nearby buildings only. Prototype on the branch, identical on both maps; the biggest
   win so far on Cape Town (−1,783 CPU-s, −107 s wall), and likely Pembury's too.
4. **A3:** reports off the path. Assemble drops its counting loads and its second clean. The checks
   still run on request (`pipeline.py report`) and in `mac_build.sh --check`.
5. **A6:** load the city-wide files once and fork the pools, and hand the writer its neighbours'
   buildings.
6. **A8:** share a square's window between its parts, then make the parts finer. That shortens
   divide's tail.
7. **A4 and B1:** the dead car and style slices in prep_map, each proven on the loop.
8. **A9:** exact local versions of `neat_kerbs` (finish F2), `walls_and_gates`, `pave_to_walls`, and
   the per-piece seeding and `reach` caching in `make_plots`. One function at a time, each proven on
   -1_2 and Cape Town 2_2.
9. **A7:** one division per parent block. First prove that a parent's faces don't depend on which
   square's window divides it: divide every multi-square parent from two windows and compare. Only
   if that holds does it count as byte-identical.

Then, if the co-developer takes the (c) option, these change the output. Each is checked against
`check_map.py`, which must stay as good or better on Bath, with shots of the village, the city
centre and a Cape Town street:

10. **C5 + C3:** land the shatter fix, then divide each parent once with all its pieces' seeds.
11. **C2:** one road solve with `grading.py`, one ground flatten from it. Retire prep_map's road
    section and the writer's re-lay.
12. **C1:** move tree, shrub, door and street-item fitting after the partition's layout, and fit
    lidar walls against its edges. Retire prep_map's garden chain.
13. **C4:** one cleaned building set and one evidence set.

## One thing to clean up outside the worktree

The first Bath build here read the EPC folder through a symlink into the main checkout. `epc.py`
then wrote its address cache, `data/raw/combe-down/wide/epc/.addresses-cdeb17f3.pickle`, into
`~/src/CombeDowner`. It is an ignored cache file, so nothing is committed. It was left
there rather than deleted, because this work doesn't delete outside its worktree. The worktree's
`epc` folder now holds links to the CSVs only.

## Appendix A: prep_map's steps


Worktree `~/src/cd-onepass` at `937402f5`. `P:` = `tools/prep_map.py`, `W:` = `tools/partition/write_tile.py`.
All line numbers are from that commit. "WT" = `build_tile` (W:6221-6470), which `write_one` (W:6473) calls.

### How the two phases connect

- `prep_tiles.py` runs `prep_map.py --tile` for every square into `<dir>/partition/prep/`, then (staged maps)
  `tools/partition/stage.py`, which hands each prep square to `write_one` as `base` (stage.py:233). A square
  outside the partition, or whose write fails, is **copied verbatim from prep** (stage.py:214-219, 250).
- Before the stage, `prep_tiles.clear_seams` edits the prep squares' `sb` and `fp` across seams (prep_tiles.py:286-290);
  `clear_doorsteps_unpartitioned` runs only when not staged.
- WT starts from `tile = json.load(base)` (W:6226) and replaces/edits fields in place, writing the same dict out (W:6442).
  So **every key not touched below survives exactly as prep wrote it**.
- The partition itself (`read_partition`, `once.*`, `structures.solve`) does **not** read prep squares: it reads raw
  layers, the raw Mapzen terrain (`Terrain`, partition/__init__.py:138; `pass_structures` once.py:425-445) and the lidar
  ridges from `data/<map>/measured/<ti>_<tj>.zip` (partition/__main__.py `load_ridges`). Only WT reads prep output.

### Step table

| # | step | lines | reads | produces | consumed by (later in prep) | final JSON fate (prep key -> WT) |
|---|---|---|---|---|---|---|
| 0 | args, tile box | P:46-114 | `--tile`, `--measured/--measure` (STORE), `--buildings-from` (KEEP), `GRIDSUB`, `area.squares` | `TX0..TY1` (own square), `MARGIN`=15 cells, `X0..Y1`/`BM` (square+margin, the WORK grid), `ROAD_BOX` = BM+500 m, `FLOOR_BOX` = square+1200 m, `TBOX`, `own()` | everything | `b`,`tile` set at P:4126; WT keeps (reads `b` in clear_portals W:2454) |
| 1 | terrain | P:116-198 | Mapzen terrarium PNGs (cache `<src>/terrain15`), for square **+1250 m** (P:126-129); `A.sea` | `DEM`, `elev()`, `low()`, `grid` (nx=ny=CELLS+2*MARGIN+1, raw survey), `GX,GY` | `elev` everywhere in the road solve, water levels, tunnels; `grid` mutated by every later ground step | `t.h` (after all edits below, cropped to the square P:4127-4129) -> WT **modifies in place** (fill_dug_ground W:1652-1800, lay_ground W:1816-2026), otherwise kept |
| 2 | helpers | P:200-323 | layer files via `L()` | `L`, `densify_runs`, `level_structures`, `polys`, `whole_polys`, `cover_xy` | all | - |
| 3 | road constants, `flatten()` def, flat_* arrays | P:325-379 | `grid` | `RW`, `PATHS`, `flat_w/flat_z/flat_in/flat_f`, `SURVEY` (= raw grid copy), `flatten` | flatten loop (#19), blend (#20), water/canal steps use `flat_in/flat_w/flat_f` | (indirect via `t.h`) |
| 4 | canal towpath setup | P:381-529 | `web/public/maps/<id>-canal.json` | `CANAL`, `canal_open`, `canal_bore`, `towpath()`, lock helpers | road read (#5), corridors (#30) | - |
| 5 | roads read | P:531-590 | `L("segment")` (road subtype, access restrictions, road_flags), `L("water")` for quayside, densified 4 m inside **ROAD_BOX** (BM+500 m); tunnel floors over **FLOOR_BOX** | `pending` [{c,n,run,z=elev,span,bored,tunnel_ranges,ow,tow,bu}] via `level_structures`, `towpath`, `TN.bores`, `TN.rebore` | every road step to #23 | (via `rd`,`tn`,`t.h`) |
| 6 | chains / smooth_network / regrade | P:591-714 | `pending`, `elev`, **all cached terrain tiles** (`DETAIL`, P:656-658), `grading.grade`, `profiles.ease_kinks` | `pending[*].z` graded as one network | all later road steps | prep `rd` z (discarded by WT, see #23) and `t.h` via flatten (kept) |
| 7 | underpasses | P:716-754 | `pending`, `elev` | `underpasses`, `span`/`overpass` marks on roads over them | #10, #13 | via span flags |
| 8 | bridges 1: paths ride decks | P:755-848 | `<id>-rail.json` (tracks, canopies), `L("water")` polys | `rail_tracks`, `water_polys`, `road_lines/tree`, `decks`, `deck`/`ride` marks | #10-#13, #21 | via flags |
| 9 | bridges 2..2c: which spans are real, pavements beside streets, crossings at grade, wrong-way rail | P:850-958 | `pending`, water, rail, `elev` | `span` pruned, `solid` | #10-#18 | via flags |
| 10 | 2d canal crossings | P:960-1063 | canal file runs/locks | `canal_runs`, `canal_x`, `ease_roads` raises approaches, `beside`, `least` | #12, water/canal dig (#25), corridors (#30) | via flags/z |
| 11 | 2e/2f carry_spans, inferred crossings | P:1065-1160 | `pending` | spans carried straight (`profiles.carry_profile`) | #13 | via z |
| 12 | 3/3b dips under road and rail bridges | P:1162-1238 | `pending`, rail | `dips`, lowered z (`ease_roads`) | #14, #17 | via z, and ground dug by flatten |
| 13 | limit_grades (regrade again) | P:1241-1261 | `pending`, `dips` | z | - | via z |
| 14 | 3c level crossings | P:1263-1313 | `L("osm-rail")`, rail | `level_crossings`, z eased to rail | out | `lx` (own only) -> WT **kept**, read by `drop_paths_on_the_railway` (W:6307) |
| 15 | 4 footbridges over water | P:1315-1335 | water polys (`BM.buffer(200)`) | span marks | - | via flags |
| 16 | stacked roads | P:1337-1362 | `pending` | span marks | - | via flags |
| 17 | PROTECT, cut ground under spans | P:1364-1417 | `pending` spans, rail spans | `PROTECT`; **`grid` cut to deck-0.6 under spans** (P:1383) | flatten (#18), banks/rims/canal (#25) | `t.h` (kept; WT's fill_dug_ground partly undoes it) |
| 18 | flatten loop + rail flatten | P:1419-1462 | `pending`, rail tracks (BM+60 m) | `flat_*` filled (carriageway `RW/2+2.5`, paths only at ramps/dips, tunnel cuttings) | blend | `t.h` |
| 19 | blend + tunnel ground restore | P:1466-1488 | `grid`, `flat_*`, `SURVEY` | **`grid` flattened under prep's roads**, eased up to 12 m; restored over bores | everything that reads `gelev` | `t.h` kept |
| 20 | spans grown to ground, RIDE_ON | P:1491-1521 | `gelev0` | span/deck marks | #22 | via flags |
| 21 | piers | P:1523-1534 | `L("infrastructure")` pier, BM+600 m | `piers` | #22 | `rd.pr` |
| 22 | roads/tunnels written | P:1536-1559 | `pending` | `roads` (`rd` records c,n,p[x,y,z,(1/2)],ow,bu,pr), `tunnel_list` (TN.faces), `on_tow`, `z0` | everything below | `rd` -> WT **overwritten** (W:6394/6408) but read first (see Couplings 1); `tn` -> WT **kept, modified** (`TN.widen` via `bore_widths` W:3304-3363, called W:6292/6323), read by fill_dug_ground, roads_from_corridors, lay_ground, end_at_portals, clear_portals |
| 23 | gelev | P:1562-1570 | `grid` (as it stands when called) | ground as the game splits it | every placement below | - |
| 24 | water | P:1582-1846 | `L("water")`, `L("infrastructure")` weirs, `L("land")` beaches, canal file, **near_boxes = own square + 8 neighbours** (water polygons must touch BM) | `wp` (own), `water_all` (9 squares), `banks`, `OTHER_WET`, `weir_faces`; **grid dug** under water (never under `flat_in`) | landmarks ctx (P:3869), boulders, corridors | `wp` -> WT **kept**, read (W:6279, 6297, 6317, 5888); `wf` -> **kept, never read** |
| 25 | basins, banks, canal banks/locks/bridges, rims | P:1847-2088 | `cbasins`, `L("building")` (BUILT), `flat_*`, `PROTECT`, roads (towpath detection P:1966), `canal_x` | `grid` edited; `wp[*].z` lowered for ponds held by a road/building (P:2066-2081) | - | `t.h`, `wp.z` kept |
| 26 | span regrow, ramp_down, paths to ground, roads filter | P:2089-2164 | `roads`, `gelev` | `roads` flags/z, paths z = `gelev`; roads cut to BM+100 m | - | `rd` |
| 27 | ground kinds | P:2167-2197 | `L("land")`, `L("land_use")`, `L("infrastructure")` parking, `L("land_cover")`, `L("building")`, prep `roads` | `GT`, `woods`, `cover` | `t.k`; woods -> trees/canopy grid/shrubs; GT -> boulders, `_wild` gardens filter | `t.k` -> WT **kept**, read (`drop_walls_on_paving` W:6201-6218 '5'; `green_ground` via GREEN_KINDS) |
| 28 | buildings | P:2199-2675 | `L("building")` over **WORK = BM+150 m** (classing), census/conservation/EPC over every footprint in the split (650 m pad), rail tracks/canopies/portals, lidar (or STORE roofs/buildings), canopy, `heights`, towers, landmarks pack (`replaced`), roof faces `roofs/mesh`, `gelev` | `cand`, `info`, `keys`, `blds`, `footprints`, `bld_props(_own)`, `bld_fresh`, `as_built`, `_mapped`, `canopy`, `bored_low`, `_line_segs`, `ctx` | everything below (footprints are obstacles for roads, walls, trees...) | `bl` -> WT **kept** as is (read W:6259, 6336-6339, 5545, `buildings_next_door` reads neighbours' prep `bl` W:3941) |
| 29 | pedestrian widths | P:2677-2757 | `roads`, `footprints` | `roads` (pedestrian pieces with `w`), `ped_src` | #31 | `rd` (discarded) |
| 30 | lidar walls found | P:2759-2778 | lidar (or STORE walls), `footprints`, `roads`, zones | `found_walls` [{p,c,h}] over BM | roadwidth (#31), lidar_br (#40) | indirectly via `br` entries with `h` |
| 31 | roadwidth + pedestrian re-measure | P:2780-2809 | `found_walls`, footprints, `osm-roads.geojson` | `roads` with `w`, `pv` | everything that measures a street | `rd.w/pv` (discarded); shapes kept placements |
| 32 | pavements to door (DOOR_ZONES only) | P:2811-2854 | zones | `roads.pv` | - | not Bath |
| 33 | pavements to shop fronts | P:2856-2948 | `shops.businesses` (osm/fsa/overture, `L("place")`), `cand`, `info` | `found`, `shopfront`, `roads` split with `pv`,`_whole` | signs, furniture, telegraph via `_whole_streets` | `rd` (discarded) |
| 34 | no street through a house | P:2950-2973 | footprints | `roads` | - | `rd` |
| 35 | footpaths not along carriageways | P:2975-3008 | roads | `roads` | - | `rd` |
| 36 | gardens | P:3010-3064 | `gardens.plots(cand, info, corridor, BM.bounds, rnd, open_land+squares, keys, fronts, names)`, `L("land_use")`, wild land | `corridor`, `front`, `side`, `gates`, `drives`, `side_style`, `garden_sides`, `garden_br`, `gate_list` | lidar filter (#40), close_gaps, tidy, gaps, retype, straighten, gate move, approaches, `street_furniture(gate_list)`, `_close_gaps/_tidy/_straighten` hard sets | `br`/`gt`/`dv` -> WT **overwritten** (see #49-#59) |
| 37 | pitches | P:3066-3068 | `L("land_use")` whole | `pitch_list` | landmarks ctx | `pi` -> WT **kept, unread** |
| 38 | places | P:3070-3095 | `L("land_use")`,`L("water")` cut to TBOX | `places` | - | `pl` -> **kept, unread** |
| 39 | streams | P:3097-3104 | `L("water")` lines, densified in BM, z=`gelev` | `wl` | out | `wl` -> WT **kept**, read (W:6280); z **edited** by `follow_laid_ground` (W:2128-2132) |
| 40 | mapped barriers | P:3106-3114 | `L("infrastructure")` barrier wall/fence/hedge/retaining_wall | `br` (no `h`) | `_once`, lidar dedupe, garden give-way, close_gaps, gaps | in `br` -> WT overwritten; WT takes mapped barriers **from the raw layer** instead (`load_evidence`, W:6378) |
| 41 | trees | P:3116-3222 | canopy tops (min 3.5 m), prep `roads` (w, pv) to push trunks to verge, `footprints`, zones, `woods` | `trees`, `canopy_grid` (tile: cells of TBOX) | fitting (#55), corridors | `tr` -> WT **kept/filtered/moved** (`follow_laid_ground` z, `drop_clashes` W:5650-5669, `clear_under_decks`, `clear_portals`); `cn` -> **kept, unread** |
| 42 | street furniture | P:3224-3227 | `_whole_streets(roads)`, `L("infrastructure")`, `L("osm")` phones, **`gate_list` (guessed gates, before relocation)** | `fx` (lamps, signs, bins, benches... and **parked cars**), `marks` | _straighten hard, fitting, telegraph | `fx` non-car -> WT **kept/filtered/moved** (drop_clashes W:5671-5698); **cars dropped** (W:6420) and regenerated; `mk` -> **filtered** to new carriageways (W:6419, 5849-5859) |
| 43 | shop signs | P:3229-3242 | `found`, `cand`, roads | `signs`, pub material edits on `blds` | out | `sh` -> **kept** (read by `settle` W:6337, z followed) |
| 44 | lidar walls into map, dedupe | P:3244-3274 | `found_walls`, mapped `br` | `lidar_br` (with `h`), `br=_once(br)` | #45 | lidar `br` entries with `h` survive into prep `br` |
| 45 | lidar walls along guessed side fences dropped | P:3281-3297 | `garden_sides`, `corridor` | `lidar_br` reduced | - | **removes lidar walls from what WT later re-reads** (Coupling 3) |
| 46 | guessed boundary gives way to real wall | P:3298-3327 | `br + lidar_br`, `garden_br` | `garden_br` cut/extended | - | discarded |
| 47 | `_close_gaps` | P:3329-3383 | `br + lidar_br + garden_br`, `blds`, `corridor`, `gate_list` | **edits all three lists in place**: an end of a *lidar* wall can be extended up to 2.5 m onto a guessed fence | - | lidar entries' extended points reach WT `measured` |
| 48 | `_tidy_gardens` | P:3385-3494 | `garden_br`, `br + lidar_br` (fixed), blds, corridor, gate_list | `garden_br` | - | discarded |
| 49 | gaps at streets/paths | P:3497-3516 | `corridor`, `roads` | `barriers` (all three kinds, `h` kept) | everything below | `br` |
| 50 | lidar walls between gardens retyped | P:3518-3538 | `side_style` (guessed), `corridor`, `cand` | lidar `barriers[*].c` -> garden's fence/hedge, `h` capped at 1.9 for fence | - | **reaches WT `measured`** with the guessed style (Coupling 3) |
| 51 | canopy hedges | P:3540-3554 | canopy | `c` of non-`h` runs -> hedge | - | only non-`h` runs: discarded |
| 52 | `_join_runs` | P:3556-3589 | barriers | joined runs (same c and h) | - | lidar joins reach WT |
| 53 | `_straighten` | P:3591-3689 | guessed BETWEEN runs without `h`, corridor, blds, gate_list, **fx** | moves guessed runs and guessed ends meeting them | - | discarded |
| 54 | `_trim_ends` | P:3693-3715 | all barriers | trims any run (incl. lidar) up to 1 m past a crossing run (incl. guessed) | corridors step reuses it | lidar trims reach WT |
| 55 | `_unoverlap` | P:3717-3758 | all barriers | cuts ends of **any** non-retaining run (incl. lidar) lying along another (incl. guessed); drops short ones | - | lidar cuts reach WT |
| 56 | `_undouble` | P:3760-3818 | barriers | cuts only guessed (no `h`) runs | corridors reuses it | discarded |
| 57 | gates relocated into walls | P:3820-3860 | `gate_list`, barriers | `gate_list` moved/opened, **cuts a 1.1 m gap in the wall it moves into (lidar or mapped)** | doors, approaches, fitting | `gt` overwritten; lidar gaps reach WT `measured` |
| 58 | doors, shrubs, landmarks, approaches | P:3862-3875 | `as_built`, `info`, roads, **walls = barriers incl. guessed**, `_mapped`, canopy, footprints, woods, `water_all`, `pitch_list`, `gate_list`, `drives` | `doors`, `bays`, `shrub_list`, `marks_lm`, `ctx.clear`, `paths`, `drive_strips`, `extra_fx` (wheelie bins + drive cars) | fitting, telegraph, corridors | `dr` **kept** (read W:6363, 6388, 6413; z followed); `by` kept (z followed); `sb` kept/filtered; `lm` kept (z followed); `fp`,`dv` **overwritten** (never read); drive cars dropped; bins kept |
| 59 | fitting: paths through walls, shrubs/trees off boundaries, ways clear | P:3876-3943 | barriers (incl. guessed), `gate_list`, `paths`, `drive_strips`, blds | `paths` filtered, `shrub_list` filtered, `trees` nudged 0.5 m / dropped (`squeezed`) / stepped out of ways | - | **kept trees/shrubs carry these moves and losses** |
| 60 | boulders | P:3944-3951 | GT, footprints, roads, `wp`, barriers, ways | `boulder_list` | corridors | `rk` -> **kept as is** (not z-followed, not clash-checked by WT) |
| 61 | telegraph, fx off walls | P:3952-3975 | `_whole_streets(roads)`, doors, barriers, blds, fx | `tpoles` into fx, `twires`, fx minus items on any barrier/indoors | - | poles kept via fx; `wr` -> WT **re-strung** to kept poles (W:5699-5702), then city `string_city_wires` |
| 62 | benches turned | P:3976-4010 | blds, **blines (incl. guessed)** | bench angle `fx[4]` | - | kept |
| 63 | cars clear/level | P:4011-4034 | barriers, blds, gelev | fx minus bad cars | - | **dead**: WT drops every car |
| 64 | spawn | P:4036-4041 | `L("land_use")` | `spawn` | - | kept |
| 65 | KEEP carry-over (`--buildings-from` only) | P:4043-4063 | KEEP | `blds` heights | - | `bl` |
| 66 | out dict, tile clip | P:4065-4147 | all | `out`; per-key own/mid/cut_lines; boats in canal removed; `drn` doors within 6 m outside | - | see Key fate table |
| 67 | landmarks.clear | P:4148 | `ctx.clear` | clears tr/sb/rk/dr/by/fx/sh, gt/fp/dv, br inside landmark areas | - | WT regenerates br/gt/fp/dv/cars **without re-clearing** (no landmark code in W; unverified whether partition avoids those areas some other way) |
| 68 | corridors kept clear | P:4149-4262 | `out["rd"]` widths+pv, rail, canal, `out["wp"]`, `bored_low` | paths cut out of tunnel mouths; tr/sb/rk/fx off corridors; br cut off carriageways and **prep's pavements**, `_trim_ends`, `_undouble`, lone stubs dropped; gates opened | - | tr/sb/rk/fx kept; br/gt overwritten except `h` runs re-read |

### Key fate table (every key prep writes in tile mode)

| key | prep source | WT (build_tile) | citation |
|---|---|---|---|
| id, name, release, centre, field, fc, bk, v(None), tile, b | P:4065-4068, 4126 | kept (b read) | W:2454, 4871 |
| t (nx,ny,x0,y0,dx,dy,z0,h,k) | P:4127-4129 | **modified in place** (`h`): fill_dug_ground, lay_ground; `k` read | W:6253, 6294, 6325, 6228 |
| bl | P:4106, 2616-2672 | kept, read | W:6259, 6336-6339 |
| rd | P:4130 cut_lines | **overwritten** after reading old for spans/paths/flags | W:6294, 6304, 6308-6312, 6394, 6408 |
| wp | P:1769 | kept, read | W:6279, 6297, 6317 |
| wl | P:4130 | kept, read, z followed | W:6280, 2128 |
| br | P:4250 | **overwritten**; old read for `drop_walls_on_paving` (all runs) and `measured` (runs with `h`) | W:6228, 6382, 6414 |
| gt | P:4132, 4257-4259 | **overwritten**, old never read | W:6416 |
| tr | P:4134, 4205 | kept, z followed, clash-filtered/moved | W:2112, 5650-5669, 2495, 2428 |
| sb | P:4135, 4206 | as tr (also edited by prep_tiles.clear_seams before WT) | same |
| rk | P:4136, 4207 | **kept untouched** | - |
| fx | P:4134, 4209 | non-car kept/filtered/moved/z-followed; **all cars dropped** and rebuilt | W:6420, 5671-5698, 6436-6438 |
| mk | P:4132 | **filtered** to the new carriageways, z followed | W:6419, 2121 |
| sh | P:4134 | kept, read, z followed | W:6337, 2112 |
| lm | P:4135 | kept, z followed | W:2113 |
| dr | P:4135 | kept, read (gates, paths, doorsteps), z followed | W:6363, 6388, 6413 |
| drn | P:4139 | read then **dropped** | W:6362 |
| by | P:4140 | kept, z followed | W:2113 |
| pi | P:4140 | kept, unread | - |
| cn | P:4141 | kept, unread | - |
| pl | P:4141 | kept, unread | - |
| fp | P:4133 | **overwritten**, never read | W:6417 |
| dv | P:4133 | **overwritten**, never read | W:6418 |
| wr | P:4132 | **re-strung** to the kept poles | W:5701 |
| tn | P:4130 | kept, read, **widened** (`TN.widen`) | W:6292, 6323, 3352-3363 |
| lx | P:4131 | kept, read | W:6307 |
| wf | P:4131 | kept, unread | - |
| spawn | P:4126 | kept | - |
| (new in WT) sf, pb, cx, _gone/_moved/_counts | - | added | W:6402, 6415, 6439, 6467 |

### Couplings

### 1. Road / bridge / flattened ground solve (P:325-2164)

What leaves prep:
- **`t.h`**: the raw survey, cut to `deck-0.6` under every prep span (P:1383), flattened under prep's roads
  (Overture segments, `RW/2+2.5` m for vehicle roads, paths only at bridge ramps and dips, P:1419-1444, rail at
  `RAIL_HALF`), blended out over up to 12 m (P:1469-1473), bores restored (P:1476-1488), then water/canal/rim
  digging (P:1582-2088). Heights are prep's *graded* z (smooth_network + grade + carry_spans + dips + limit_grades).
- **`rd`** z profiles and span/deck flags (P:1551, 2089-2160).
- **`tn`** with prep's z (P:1555-1557), **`lx`**, `wp.z`.

What WT does:
- `T = tile["t"]` is the base grid (W:6253). WT **does not recompute the terrain**. It (a) `fill_dug_ground`
  (W:1652-1800): only where the *old* rd had span flags (`q[3]==1`) or paths dipped >2 m below the lidar DTM, and only
  along new ways running the same direction, raises the grid back to the lidar survey; (b) `lay_ground`
  (W:1816-2026): lays ground only to new spans (cut under decks, survey under span), new approaches (`_lay`), dipped
  paths and tunnel-mouth paths; "the ground under a street at grade ... stays as it was" (`hold`, W:1943-1981). The
  outer ring and building vertices are never changed (W:2012-2019).
- So **the prep grid, flattened under prep's own road lines and heights, survives into the final square everywhere
  except round bridges/approaches/tunnel mouths.**
- New road heights: the partition's `structures.solve` profile (raw terrain, OSM graph; once.py:425-445) is read by
  `_profiled` (W:778-876), but every at-grade point is then clamped to **within 0.4 m of the prep grid**
  (`follow_ground`, structures.py:1169-1174, called W:866) and eased (`ease_bends`). Spans keep the profile but may
  not go below ground-0.25 (W:868-870). So final at-grade road heights are effectively prep's graded profile
  re-sampled through prep's flattened grid where the new street lies on a prep road; where the partition's street
  does not coincide with a prep road (different geometry or a street prep didn't have) it sits on the survey or on
  prep's easing slope of a neighbouring road. Prep's `grade`/`limit_grades` therefore still decide final street
  gradients, while the partition's own structure solve only matters for bridges, decks, approaches, dips.
- Prep `rd` is read before being overwritten: `fill_dug_ground` (old span flags and dipped paths, W:1718-1786);
  `carry_missing_paths` copies old paths more than 4 m from any new way **verbatim with prep z** (W:4086-4114);
  `carry_one_way` (`ow`), `carry_pedestrian`/`demote_pedestrian` (class `pedestrian`), `carry_flags` (`bu`, `pr`)
  (W:4000-4130). Nothing else of prep's span/deck/ramp logic survives in `rd`.
- `tn` survives with prep's z and is widened by WT; `lx` survives.
- Buildings' `g/h/dz` (P:2623-2645) are measured on the prep grid; consistent with the kept grid since WT never
  edits vertices inside buildings.
- Other things placed on `gelev` (trees, fx, dr, sh, lm, by, mk, wl, wr) are moved by `follow_laid_ground`
  (W:2108-2133) by WT's own grid change; **`rk` is not** (minor, only near bridges).

### 2. Gardens and the boundary tidy chain - what WT throws away

Thrown away (outputs overwritten without being read):
- `gt` (gates, P:3064, relocated P:3820-3860, opened P:4256-4259) -> WT `gates_for_doors` + `walls_and_gates` (W:6363-6385).
- `fp` front paths and `dv` drives (`approaches` P:3872-3874, `path_clear` P:3884-3893) -> WT `paths_from_openings`,
  `drives_from_openings` (W:6367, 6388).
- every guessed/mapped `br` run without `h` (garden_br, `_tidy_gardens`, `_close_gaps`, gaps, canopy hedges,
  `_join_runs`, `_straighten`, `_trim_ends`, `_unoverlap`, `_undouble`, gate cuts, corridor cut) -> WT builds `br`
  from the partition's edges (W:6380). Their only remaining effect on `br`: `drop_walls_on_paving` keeps a partition
  wall on paving only if *any* prep run is within 1.5 m (W:6201-6218).
- **All parked cars** (`street_furniture` P:3227, drive cars from `approaches`, `car_clear`/`car_level`
  P:4011-4034, corridor `on_line` P:4209) -> dropped W:6420, rebuilt by `parked_car_rows` + `drive_cars`.

Kept, but shaped by those discarded guesses (see 3).

### 3. Kept outputs that depend on discarded guesses

- **Lidar walls (`br` entries with `h`) -> WT `measured_not_drawn`** (W:6382, 4720-4768): these stand wherever the
  partition drew nothing within 1.5 m. What WT gets is prep's post-processed set, not the raw lidar:
  - dropped where they lay along a **guessed side/back fence** (P:3281-3297, `garden_sides`) - so a lidar wall prep
    removed for a guess WT then discards can vanish entirely unless the partition happens to draw that edge (the
    partition sees raw ridges only as evidence, partition/__main__.py `load_ridges`);
  - ends **extended up to 2.5 m to meet guessed fences** (`_close_gaps`, P:3382);
  - **restyled to the guessed garden's fence/hedge, `h` capped at 1.9** (P:3518-3538) - WT writes `c=BARRIER[c]`
    and that `h` (W:4766);
  - trimmed at crossings with guessed runs (`_trim_ends` P:3693-3715), ends cut back where they run along a guessed
    run (`_unoverlap` P:3720-3757), gapped where a guessed gate was moved into them (P:3846-3858);
  - cut off prep's carriageways *and prep's pavements* (`out["rd"]` w/pv, P:4212-4229), stubs dropped (P:4238-4249).
- **Doors `dr` and bays `by`**: `front_doors(..., walls=barriers)` (P:3865-3866) puts a door in another bay so it
  does not open onto a wall - including guessed fences. Doors are kept untouched by WT and drive WT's own gates
  (`gates_for_doors`), front paths and `clear_doorsteps` (W:6363, 6388, 6413).
- **Trees `tr`**: pushed off prep street widths onto the verge (P:3144-3157); nudged 0.5 m off any barrier incl.
  guessed, or **dropped when squeezed between two** (P:3897-3916); stepped out of guessed gateways/front
  paths/drives or dropped (P:3920-3941); corridor-cleared on prep road widths (P:4205). WT only moves/drops further.
- **Shrubs `sb`**: dropped within 0.3 m of any barrier incl. guessed (P:3895) and in guessed gateways/paths/drives
  (P:3926). Losses are permanent.
- **Street items `fx` (non-car)**: dropped within 0.2 m of any barrier incl. guessed (P:3965); telegraph poles placed
  clear of guessed barriers (P:3956-3960); benches turned to face the nearest guessed or real boundary (P:3988-4009);
  wheelie bins placed beside doors from `approaches` against guessed walls/gates (P:3872-3875); everything laid along
  prep's road widths/pavements (`_whole_streets(roads)`).
- **Boulders `rk`**: kept clear of guessed barriers and ways (P:3949-3950); untouched by WT.
- **`wr`**: telegraph wires from poles placed as above; WT re-strings to surviving poles.
- **Terrain `t.h`** flattened under prep's roads (Overture lines, prep widths) while the final streets are the
  partition's corridors (OSM graph, fitted widths): a moved or newly-added street sits on unflattened or
  half-eased ground (follow_ground then holds it within 0.4 m of that). `t.k` (wild ground) is also cut round prep
  roads (`wild.fill`, P:2194-2196). `wp.z` of ponds was lowered to a prep road or building rim (P:2062-2081).
- **`mk`** markings were laid along prep's streets; WT only keeps those still inside a new carriageway strip.

### 4. Dead output and work that only feeds discarded output

Dead in the final square (prep writes, WT overwrites without reading): `gt`, `fp`, `dv`, every `fx` car, `drn`
(consumed then removed), and the non-`h` part of `br` except its 1.5 m proximity test in `drop_walls_on_paving`.

Kept but never read by WT (still used by the game, so not dead): `pi`, `cn`, `pl`, `wf`, `spawn`, `lm`/`by`
(z-followed only), `rk`.

Prep work that exists only to feed discarded output:
- `gardens.plots` front/gates/drives as such (P:3034), `_tidy_gardens` (P:3396-3494), `_straighten`
  (P:3592-3689), `_undouble` (P:3763-3818), canopy hedges (P:3540-3554, only non-`h` runs), gate relocation
  (except the gaps it cuts in lidar walls), `approaches`' paths/drives and `path_clear`, `car_clear`/`car_level`,
  parked cars in `street_furniture`, the corridor-step gate opening and lone-stub loop (except for lidar runs).
- In the road solve: span regrow, `ramp_down`, path heights to ground (P:2089-2160), `pr`/piers beyond the flag,
  pedestrian wall-to-wall widths, `roadwidth.measure`, shop-front pavements, `_through_buildings`, `_along_streets`
  feed `rd` (discarded) **but also** `corridor` (gardens - discarded), street furniture, trees, shrubs, signs,
  doors, telegraph (all kept), so they are not dead, only re-purposed.
- Of the whole span/bridge classification (P:755-1362), what survives is its effect on the grid (cut under spans,
  PROTECT, flatten skipped under spans), the old span flags WT reads in `fill_dug_ground` to undo that cut, and `tn`.
- `landmarks.clear` on br/gt/fp/dv (P:4148) is lost, since WT rebuilds those keys (and cars, cx, pb) with no
  landmark clearing (no landmark code in write_tile.py). Unverified whether the partition keeps out of those
  areas by other means.

### Margins and halos

| margin | where | used for |
|---|---|---|
| terrain DEM square **+1250 m** | P:126-129 | water levels of neighbours' rivers (`elev` round each water piece's bank in the 9-square water cut); `elev` for roads in ROAD_BOX; `level_structures` over FLOOR_BOX |
| `DETAIL` from **every PNG in the terrain cache** | P:656-658 | grading bump width the same in every square |
| WORK grid: square + **15 cells** (`MARGIN`, ~60 m at 4 m cells) = `BM` | P:81-89, 194-198 | the grid every ground step edits; cropped to the square's 262x262 vertices at output (P:4128); also the area for lidar walls, gardens (`BM.bounds`), trees `inside`, streams, mapped barriers |
| `ROAD_BOX` = BM **+500 m** | P:93, 573 | roads densified and solved whole (grading, bridges, dips) so a street's heights/lamps/cars agree across squares; roads cut to BM+100 m after the ground is laid (P:2161-2164) |
| `FLOOR_BOX` = square **+1200 m** | P:94, 570-572 | levelling a long tunnel's floor between its far ends |
| quayside ROAD_BOX+30 m; piers BM+600 m; water polys for footbridges BM+200 m | P:539, 1526, 1324 | sea roads, pier flag, wz |
| water: **own square + 8 neighbours** (near_boxes), weirs within their union +50 m | P:1588-1593, 1646 | each piece's level and bed worked identically from both sides; `wp` keeps only own; `water_all` (all 9) goes to landmarks ctx and weir faces |
| buildings WORK = BM **+150 m**; census/EPC priors over every footprint in the split | P:2207, 2236-2253 | classing terraces the same from both sides; output areas seen whole; then cut to BM (P:2470) and to the owning square (`keeper`, P:2212-2221, 4106) |
| rail/canal near BM+60 m, portals BM+30 m, corridors BM+20/30/50 m | P:1457, 1919, 2281, 4160-4166, 4116 | flatten under track, canal banks, bored_low, corridor clearing, boats |
| `drn`: doors within **6 m** outside the square | P:4139 | WT opens boundaries in front of them across the edge (W:6362-6363, 6413), then drops the key |
| prep_tiles split: **650 m** for layers, **1300 m** for water | prep_tiles.py:16, 65, 213 | bounds what `L()` can see; the 1250 m water/terrain reach and 500+60 m road reach fit inside it |
| WT side reads | W:3941 (neighbours' prep `bl` within 40 m), W:6234 (parents +200 m) | ways out of buildings across the edge |

Output clipping (P:4076-4147): terrain to own vertices; buildings whole by `keeper`; roads/walls/streams/tunnels/weirs
`cut_lines` at the edge; short pieces (gates, marks, paths, drives) by midpoint; points by `own`; water/places cut.

## Appendix B: the partition's steps


Worktree: `~/src/cd-onepass` @ `937402f5`. All paths below are relative to `tools/`.
"J" = `--jobs` (process-pool size). "prep square" = `<raw>/partition/prep/<ti>_<tj>.json`
(prep_map's output after prep_tiles' `clear_seams` + `string_city_wires`). `[?]` marks something
inferred rather than read end to end.

Process layout (`partition/stage.py`):

1. `stage.py` (process S) -> subprocess `pipeline.py build` (process P), which spawns:
   corridors pool (J procs), a 1-proc side pool for structures, divide pool (J procs),
   worked_pieces inner pool (J procs, inside `pass_pieces`), assemble pool (J procs).
2. Back in S: `data_keys` (layer digests), write pool (J procs, `ProcessPoolExecutor`, spawn),
   then `drop_edge_stubs` / `drop_edge_way_stubs` / `string_city_wires` (each a fork `pmap` over squares).
3. subprocess `pipeline.py report` (process R): report pool (J procs) + `city.summarise` in R.

Every pool worker is a fresh spawned process, so the module-level parse caches
(`data._FEATURES`, `partition._LAYERS`, `once._READ`) are per worker, per pool.

---

### 1. Stage table

### 1a. `pipeline.py build` (city-wide passes and per-square assembly)

| step | file:lines | reads | produces | consumed by | final fate | duplicates prep step? |
|---|---|---|---|---|---|---|
| graph key | pipeline.py:136-138 | sha1 of whole `osm-roads`, `segment`, `osm-detail` layer files | cache key | store lookup | cache only | no (but hashes whole layer files) |
| **graph** `once.build_graph` | once.py:329-379 | `Data(raw, map_bbox)`: whole-map parse of `osm-detail` (DETAIL_KEYS), `osm-roads` (all lines, clipped to map box), `segment` (road_flags); `maxspeed.resolve`; `graph.street_graph` noding; `structures.match_structures` + `osm_structures` | `once/graph.json` (edges: id, cls, name, line, obs tags, struct = bridge/tunnel marks, `_ms` speed) | corridors, structures, pieces (indirectly), every key downstream | indirectly -> `rd` (geometry, class, names, `ms`, bridge marks) | **Yes.** prep_map builds its roads from `segment` (prep_map.py:542) + `osm-roads` (`shops.load_osm`, :2782), resolves structures/flags, speed limits. The partition re-reads the same layers and builds a second, independent network. |
| corridors key | pipeline.py:149-153 | `Layers.digest("building"/"infrastructure", win, PAD=100)`, `Layers.ridges(win,100)` (sha of measured/<t>.zip for every square the window touches) | keys | store | cache only | - |
| **corridors** `once._fit_square_edges` (pool, one task per square owning >=1 edge midpoint) | once.py:573-599 (+ `obstacles_for` :469-486, `hard_obstacles` :489-496, `fit_edge` :503-542, `corridors.side_reach`/`fit_cross_section`) | `graph.json` (whole, every task); `Data` window = bbox(owned edges) + REACH 14 + FILTER_SPAN 12 m: `building` polys -> **`clean_buildings`** on the window; `infrastructure` barriers (fence/wall/hedge/retaining_wall); lidar wall runs `data/<map>/measured/<t>.zip` (`ridges_near`, +REACH); `join_evidence`; two STRtrees (soft, hard) | `once/<t>/corridors.json` (per edge: sections [t0,t1,[w,pl,pr,shift]], car/pl/pr polygons); `once/<t>/held-out.json` | pieces, divide (`read_corridors` = **all** corridors files), assemble (9 squares), write (all), report | `rd` widths/pv/shift (via write), partition faces (carriageway/pavement/path) | **Yes.** Re-does prep_map's road-width fitting between walls/buildings (`roadwidth.measure`, prep_map.py:2780-2810, and `walls.py` lidar walls :2759). Re-cleans buildings (prep has its own building pass :2199-2675). Reads the same lidar wall zips prep_map gets via `--measured`. |
| held-out widths | once.py:545-570, 594-599 | same windows; re-runs `fit_cross_section(hold_out=True)` per width-tagged edge | `held-out.json` | report only (`read_held_out`) | **never reaches the map** | n/a (pure test work on the build path) |
| structures key | pipeline.py:165-167 | graph digest; whole `water` file sha; `data/<map>/terrain15.zip` sha; `web/public/maps/<map>-rail.json`, `-canal.json` sha | key | store | cache only | - |
| **structures** `once.pass_structures` (side process) | once.py:420-451; `structures.chain_edges`/`make_run`/`solve`/`split_back` (structures.py:209-1146) | `graph.json`; `Data(map_bbox)` `water` polys (whole map parse); `Terrain(raw/terrain15)` Mapzen PNG tiles (fetched if missing); rail + canal side files | `once/structures.json`: per edge id {z profile every 4 m, span, deck, bored, ...} | write only (`read_structures`, no cache: parsed once per written square) | `rd` z / span `s` / deck marks, `bt`, `uo`, `dk`, and via lay_ground `t.h` | **Yes, explicitly.** `structures.solve` is prep_map's bridge section "ported rule for rule" (span_line, carry_spans, ease_roads, own_road, underpasses, canal bridges, dips, limit_grades, towpath). Re-solved city-wide on the new graph. Note: the network smoothing is the pre-`grading.py` variant (`structures.smooth_network`, Gaussian + hill limit); **`grading.py` is not used anywhere in the partition** - prep_map's `regrade` -> `grading.grade` (prep_map.py:697-750) is the only caller. So road heights are computed twice by two different methods. |
| pieces key | pipeline.py:178 | corridors digest; whole `building` file sha | key | store | - | - |
| **pieces** `once.pass_pieces` | once.py:764-790; `worked_pieces` :699-746; `write_cleaned` :268-281 | `read_corridors` (all); `Data(map_bbox)` whole-map `building` parse; `clean_buildings` on **all** buildings; union of all corridors and all buildings; per-block buffer REACH_GROW (60 m) in a J-proc pool | `once/cleaned-buildings.json` (global building index), `once/parents.json` (parent blocks), `once/blocks.json` (worked pieces) | divide, assemble (`read_cleaned`), write (`owners_near`, `reroll_back_styles`), report (`read_cleaned` whole map) | indirectly: plot faces / edges / openings | **Yes.** Third building clean (after corridor windows and prep_map). |
| block_tasks / windows | pipeline.py:182-191, 345-371; once.py:793-813 | `blocks.json`, `parents.json`; STRtree of parents (built in `block_tasks`, again in `_block_windows`, again in `divide_split`) | tasks, windows | divide keys | - | rebuilds the same parent STRtree 3x in P |
| divide key | pipeline.py:192-195 | `Layers.digest("infrastructure"/"parcels", w, 100)`, ridges | key | - | - | - |
| **divide** `once.divide_split` -> `_divide_rows` (pool, parts grouped by parent) | once.py:996-1055, 932-989, `window_inputs` :868-905, `plots.make_plots` (plots.py:1415-1655) | `blocks.json`, `parents.json`, `read_corridors` (all), `cleaned-buildings.json` (window); `Data` window = union(pieces + REACH_GROW 60 + MARGIN 40, parents + MARGIN 40) (parents reach up to ~1.7 km): `infrastructure` barriers, lidar wall runs, `parcels` (`Parcels`); `building_axes`, `front_normals` | `once/<t>/blocks.json` (per piece: plots [kind, bi, xy], edges [xy, la, lb]) | assemble (9 squares) | partition faces/edges -> `br`, `gt`, `fp`, `dv` | **Yes.** Re-does prep_map's gardens step (`gardens.plots` + `_network`, prep_map.py:3010-3065, 3265) - the garden/plot division and boundary classes - from the same barrier layer, the same lidar runs and (new) parcels. |
| assemble key | pipeline.py:220-230 | 9 neighbours' corridors/divide digests; `cleaned-buildings` digest; `Layers.digest` of `building`, `osm-roads`, `infrastructure`, `land_use`, `parcels` over sq+MARGIN 40 (+PAD 100); ridges | key | - | - | - |
| **assemble** `__main__.assemble_square` (pool, wanted squares only) | __main__.py:59-224; `assemble.gather`/`corridors_for`/`blocks_for`/`relabel` (assemble.py:44-235); `surface.partition`; `plots.classify_edges`; `openings.find_openings` | `load_layer` over B = sq + MARGIN 40: `building` (**cleaned with `clean_buildings` then thrown away**, :102-104 vs :136-138), `osm-roads` (only counted for metrics), `infrastructure` barriers, `land_use` (only counted), `parcels`; `Data.ridges_near(B)`; `Terrain` (min elev of every building ring, :149-151 - only used by `surface()`, skipped in QUICK); own + 8 neighbours' `corridors.json` and `blocks.json`; `held-out.json` x9; `read_cleaned(once)` (whole map, then filtered to B) | `city/<t>/partition.json` {faces[:20000] (cls, xy, holes), edges (kind, support, source, sides, xy), openings}; `city/<t>/report.pkl` (pickled ctx incl. faces, whole, plots, corridors, ridges, barriers, roads ...) | write (`partition.json`), report (`report.pkl`) | faces -> `sf` / `rd` fit / `br` etc. | Partly: classify_edges/openings re-do prep's barrier-class choice, gates and openings (prep_map.py:3497-3860). Also: the second building clean on each window is pure waste; `road_profile` is skipped (QUICK). |

### 1b. `stage.py` around the writer

| step | file:lines | reads | produces | consumed by | final fate | duplicates prep step? |
|---|---|---|---|---|---|---|
| prep digests | stage.py:180-181 | sha of every prep square | `stages.json` | `verify.py` | report only | - |
| `data_keys` | stage.py:84-104 | sha of every file under `data/<map>/` except `measured/partition.zip` and `*.geojson.xz`; rail/canal side files; `cache.Layers(src_dir)` digest of **every** `*.geojson` in src_dir over the square + WRITER_REACH 1000 m (parses each layer once in S unless `cache/layers/<name>-<sha>.npz` exists; hashes every layer file regardless) | per-square write key | write skip/store | cache only | - |
| write key / store | stage.py:198-233 | key = prep square sha + partition.json digest + upstream (corridors+structures+pieces) + data key + writer code key + kept-lidar sha | store entries `write/<key>` | next run | cache | - |
| copy prep | stage.py:214-219 | prep square | game square = prep square verbatim | game | squares outside `city.squares()` or failed | - |
| **write_one** (pool) | write_tile.py:6473-6489 -> `build_tile` 6221-6470 | see section 1c | `<out>/<t>.json` | post-passes, game | game square | see 1c |
| `drop_edge_stubs` | write_tile.py:4846-4892 | written squares + 8 neighbours (full JSON parse each, fork pmap) | `br` short edge runs removed | - | `br` | analogue of prep's `_without_lone_stubs`/stub loop (prep_map.py:4227-4250), across squares |
| `drop_edge_way_stubs` | write_tile.py:4899-4943 | written squares + neighbours (full parse again) | `rd` short edge paths removed | - | `rd` | - |
| `string_city_wires` | write_tile.py:4946-5002 | every square within 2 rings of each written square (5x5, full parse again); writes any `changed`, **including squares not in this run's written set** | `fx` duplicate poles removed, `wr` restrung | - | `fx`, `wr` | **Yes**: the same function prep_tiles already ran over the prep squares (prep_tiles.py:296-297), and prep_map's own `string_wires` (prep_map.py:3953), and `drop_clashes` restrings once more (write_tile.py:5701). Wires are strung 4 times. |

### 1c. Inside `write_one` / `build_tile` (write_tile.py:6221-6470), in order

Reads available to every step: `tile` = the prep square (parsed whole), `part` = `city/<t>/partition.json`.

| # | step | lines | reads | produces / changes | final fate | duplicates prep step? |
|---|---|---|---|---|---|---|
| 1 | load prep square + partition | 6223-6227 | prep JSON (whole); `partition.json` | `tile`, `part` | - | - |
| 2 | `drop_walls_on_paving` | 6228, def 6201-6218 | `tile.t` (`k` = "5" paved cells), prep `br` (buffer 1.5 m) | `part.edges[].kind = "none"` | via `br` | uses prep `br` only as evidence |
| 3 | owners, back styles | 6233-6234; `settle.owners_near` 584; `reroll_back_styles` 6166-6198 | `cleaned-buildings.json` (sq ±150 m; whole file parsed once per worker), `parents.json` (sq ±200 m) | `owners`; `part.edges[].kind` re-rolled | `br` styles | **Yes**: prep rolls back-garden styles per block (`gardens.STYLE`, prep_map.py:3518-3540) |
| 4 | corridors + rows | 6235-6237 | `read_corridors(once)`: **every** `corridors.json` in the city (cached per worker) | `rows`, `row_at` (street rows within FRONT_REACH 40 m) | `rd`, settle | - |
| 5 | `load_evidence(sq)` | 6238; settle.py:167-190 | `Data(ROOT/data/raw/<map>/wide)` window sq ± 50 m: `infrastructure` barriers (+ make tags), `osm-detail` guard rails, `listed` points, lidar wall runs (`measured/<t>.zip`, +REACH 14) | `Evidence` (lines, mapped, styled, listed) | settle, drop_unstood, mapped walls in `br` | **Yes**: same barrier layer + lidar runs prep_map reads for its walls (prep_map.py:3106-3115, 3244-3265), and the 4th/5th time the partition reads them (corridors, divide, assemble, here). Note hard-coded raw dir, not stage's `src_dir`. |
| 6 | street/corridor faces | 6239-6273 | `part.faces` | `streets`, `car_area`, `fitted` (unions) | - | - |
| 7 | own corridor records | 6244-6251 | corridors intersecting sq | `roads` (sections, obs, tagged) | `rd` | - |
| 8 | houses | 6258-6268 | prep `bl` rings + `c` | `houses`, `kinds` | many steps | uses prep's buildings (not the partition's cleaned set) |
| 9 | side files, water | 6277-6290 | `web/public/maps/<map>-rail.json`, `-canal.json` (parsed per square); prep `wp`, `wl` | rail tracks, water polys/lines, wet tree | - | - |
| 10 | profiles | 6291 | `structures.json` (whole file, **re-parsed every square**, no cache) | `profiles` | `rd` z | - |
| 11 | `bore_widths` (1st) | 6292; 3304-3363 | prep `tn`, pass-1 corridors | `tn[]` widened in place (`TN.widen`) | `tn` | re-does prep's tunnel bore widths (tunnels.py) to the new streets |
| 12 | `fill_dug_ground` | 6293-6294; 1652-1800 | prep `t.h`, prep `rd` (old spans), prep `tn`, `profiles`, houses, rail; kept lidar DTM `measured/partition.zip` (`under-bridges.npz`) | `t.h` refilled; `carried` predicate | `t.h` | **Undoes** part of prep_map's terrain flatten/dig under prep's own spans (prep_map.py:325-406, 1074-1168) |
| 13 | `roads_from_corridors` | 6295-6300; 446-604 (+ `fit_to_faces` 252-339, `_between_houses` 350-398, `_profiled` 778-876, `way_marks` 691-733) | corridors' sections; carriageway/pavement faces; prep `bl`; `profiles`; water/rail/canal; prep `wp` levels; `lidar_tall(sq)` (`standing.ndsm` -> `measured/partition.zip` standing grid); tunnels (`over_roof`, `along_mouths`), canal portals; prep `t` ground | new `rd` (one record per stretch, `w`, `pv`, `ms`, heights, span/deck marks) | `rd` | **Yes, replaces prep `rd`.** Re-does: road widths (roadwidth.py), pavement widths, roads stopped at buildings, heights/bridges (from structures.json, step above). |
| 14 | `hold_steep_streets` | 6301; 632-678 | `t` | `rd` z held, marks for lay_ground | `rd` | re-grades against prep-flattened ground |
| 15 | `carry_missing_paths` | 6302-6304; 4086-4114 | prep `rd` paths; pavement faces | old paths appended to `rd` | `rd` | consumes prep `rd` |
| 16 | `drop_paths_along_streets` (1st) | 6305; 3858-3935 | `rd` | `rd` filtered | `rd` | **Yes**: "same rule, same thresholds as the old build's `_along_streets`" (prep_map.py:2975-3008) |
| 17 | `drop_empty_spans` | 6306; structures.py:1224 | `rd`, ground, water, rails | span flags | `rd` | yes, prep's empty-span rule |
| 18 | `drop_paths_on_the_railway` | 6307; 4148-4202 | `rd`, rail tracks, prep `lx` | `rd` cut | `rd` | - |
| 19 | `carry_one_way`, `verge_out_of_town`, `carry_pedestrian`, `demote_pedestrian`, `carry_flags` | 6308-6312; 4000-4142, 614-629 | prep `rd` (`ow`, pedestrian class, `bu`, `pr`), houses | `rd` attrs; `unpaved` | `rd`, `sf` | consume prep `rd` attributes the graph lacks (Overture access, one-way, piers) |
| 20 | `ways_out_of_buildings` | 6313; 3965-3997; `buildings_next_door` 3941-3962 | houses + **8 neighbour prep squares parsed whole** (only `bl` used) | `rd` cut at walls | `rd` | **Yes**: prep's `_through_buildings` (prep_map.py:2950-2973) |
| 21 | `drop_paths_along_streets` (2nd) | 6314 | `rd` | `rd` | `rd` | same as 16, again |
| 22 | `whole_spans`, `paths_on_the_towpath`, `no_span_over_tunnels`, `even_bridge_pavements`, `deck_reach`, `dip_paths_under_spans`, `ramp_off_decks`, `bore_widths` (2nd) | 6315-6323; 1088-1114, 1006-1045, 1048-1081, 1471-1487, 2174-2200, 1495-1546, 1351-1468, 3304-3363 | `rd`, canal, water, rails, houses, `t` | `rd` z / spans / `dk`; `tn` widths again | `rd`, `tn` | **Yes**: towpath (prep_map.py:471-590), ramp off decks ("`prep_map.py`'s rule"), path dips under spans, span joining. Bridge geometry is solved a third time locally on top of structures.json. |
| 23 | `lay_ground` + `settle_on_laid_ground` | 6325-6326; 1816-2026, 2049-2105 | `t`, `rd`, houses, rails, `tn` | `t.h` re-laid; `rd` z adjusted | `t.h`, `rd` | **Yes**: "by the old build's rules (`prep_map.py`'s flatten ...)" - prep already flattened `t` to its own roads (prep_map.py:325-406); this lays it again for the new roads on top of the old result |
| 24 | `whole_spans(cut)`, `decks_to_loose_ends`, `decks_meet` | 6328-6330 | `rd` | `rd` | `rd` | prep span rules |
| 25 | `bridge_kinds(osm_bridges(sq))` | 6331; 2209-2333 | `load_layer(ROOT/data/raw/<map>/wide, "osm-bridges", sq ± 60 m)` (whole file parsed once per worker), water, rails, canal | `bt`, `uo` on `rd` | `rd` | no: prep_map writes no `bt`/`uo`/`dk` (grepped) |
| 26 | `follow_laid_ground` | 6333-6334; 2108-2133 | old vs new `t.h` | z of prep `fx`, `tr`, `sb`, `dr`, `sh`, `lm`, `by`, `mk`, `wr`, `wl` shifted | those keys | adjusts prep output to the re-laid ground |
| 27 | `settle` + `drop_unstood` | 6336-6341; settle.py:335-455, 513-540; `Standing` standing.py:52-81 | `part`, owners, prep `bl` (`house_kinds`, `town_fronts` heights), evidence, prep `sh` (shops), `row_at`, streets, pedestrian ground; `ndsm(sq)` from `measured/partition.zip` (decoded a 2nd time, after `lidar_tall`) | `part.edges` kinds dropped/changed | `br` | **Yes**: prep's guessed-front/lane/far rules and the lidar "something standing" test (gardens.py + walls; prep_map.py:3385-3555) |
| 28 | road/corridor areas, `blocked_ground`, `deck_gaps` | 6344-6360; 5862-5895, 2340-2379 | `part.faces`, `rd`, prep `wp`, rail, canal | blocked ground, deck gaps, abutments | walls, cars | prep's "corridors are kept clear" (prep_map.py:4149-4205) |
| 29 | `gates_for_doors` | 6362-6365; 5043-5137 | prep `dr`, **`tile.pop("drn")`**, houses, road area | door gates added to openings | `gt` | **Yes**: prep gives each front a gate opposite the door (gardens/landscape, prep_map.py:3820-3870) |
| 30 | `drives_from_openings` | 6367-6368; 5284-5357 | `part` plots/openings, houses, kinds, ground | drive openings, `dv`, drive cars | `dv`, `fx` | **Yes**: prep's `gardens.py` drives (prep `dv` discarded unread) |
| 31 | `walls_and_gates` + `take_mapped_styles` | 6377-6387; 4477-4650, 4686-4709; `tidy.tidy_walls`/`reseat_gates`/`clear_gates_of_junctions` | `part.edges`/openings, ground, road/corridor areas, blocked, **prep `br` rows with `h`** (lidar walls) + mapped barriers from evidence, houses, `rd` paths | new `br`, `gt` | `br`, `gt` | **Yes**: prep's whole barrier chain - gaps (3497), join runs (3556), straighten (3591), trim (3693), unoverlap (3717), undouble (3760), gates (3820), corridor cuts (4149-4250). Prep `gt` is never read. |
| 32 | `paths_from_openings`, `keep_paths_off_walls` | 6388-6389; 5216-5270, 5377-5423 | `part`, houses, prep `dr`, road area, `br`, `gt` | `fp` | `fp` | **Yes**: prep `fp` (gardens/landscape `approaches`, prep_map.py:3872) is discarded unread; prep_tiles' `clear_seams` path filtering of it was wasted |
| 33 | `end_at_portals`, `steep_paths_as_steps` | 6392-6394 | `rd`, `tn` | `rd`; `tile.rd = rd` | `rd` | - |
| 34 | `street_surfaces` -> `pack_surfaces` | 6401-6404; 3530-3855 | `part.faces`, `rd`, ground, `fp`, `dv`, `unpaved`, `t` (incl. `k`), `green_ground(sq)` (`load_layer(ROOT/data/raw, "land_use")` -> falls back to `data/<map>/land_use.geojson.xz`, a different file from the raw one [?]), `br`, `canal_bores`, Standing, `tn` | **new key `sf`**; `filled` paving | `sf` | new (prep has no `sf`); replaces the game's per-road strips |
| 35 | `widen_to_paving` | 6406-6408; 3051-3162 | `rd`, paving, `br`, houses | `rd.pv` widened | `rd` | - |
| 36 | `ends_off_pavements` | 6409; 4805-4843 | `br`, `rd` | `br` | `br` | - |
| 37 | `mapped_points` + `path_barriers` | 6410-6411; 5900-5908, 6013-6075 | `Data(ROOT/data/raw/<map>/wide)` `infrastructure` points (sq ± 5 m; same worker cache as step 5) | **new key `pb`**, `br` opened | `pb`, `br` | new |
| 38 | `rails_off_walls`, `clear_doorsteps` | 6412-6413; 5984-6010, 5140-5213 | `rd`, `br`, `gt`, prep `dr` + `drn` | `rd.hr`, `br`, `gt` | `rd`, `br`, `gt` | **Yes**: prep_tiles' `clear_doorsteps_unpartitioned` (only when not staged) and prep_map door clearing |
| 39 | assign `br`, `pb`, `gt`, `fp`, `dv` | 6414-6418 | - | tile keys | final | - |
| 40 | `marks_on_carriageways` | 6419; 5849-5859 | prep `mk`, `rd` | `mk` filtered | `mk` | filters prep markings |
| 41 | remove prep cars | 6420 | prep `fx` | `fx` without `car` | `fx` | discards prep's parked cars (streets.street_furniture, prep_map.py:3227) |
| 42 | `drop_clashes` | 6421-6424; 5474-5703 | `tile.tr/sb/fx/bl/wr`, `part`, `br`, `gt`, `fp`, `rd`, blocked, `dv`, `sf` (`drawn_carriageway`, `face_heights`), paving | `tr`, `sb`, `fx` moved/dropped/re-levelled; `wr` restrung (`landscape.string_wires`) | `tr`, `sb`, `fx`, `wr` | **Yes**: prep's corridor clearing of `tr`/`sb`/`fx` and `path_clear` (prep_map.py:3876-3967, 4199-4210) and its wire stringing |
| 43 | `clear_under_decks`, `clear_portals` | 6425-6426; 2495-2509, 2428-2492 | `tr`, `sb`, `fx`, `tn`, `b`, `br`, `gt` | those filtered | `tr`, `sb`, `fx`, `br`, `gt` | prep clears portals too (railway bored_low, prep_map.py:4172-4187) [?] |
| 44 | `parked_car_rows` | 6428-6438; 5819-5846, `place_cars` 5767-5796 | `rd`, `fx`, `br`, `gt`, houses, `sf` heights, `dv`, no-parking (blocked + gaps) | car rows appended to `fx` (+ drive cars) | `fx` | **Yes**: prep places parked cars too; they were deleted in step 41 |
| 45 | `crossings` | 6439; 5930-5968 | `rd`, `mapped_points` (reused) | **new key `cx`** | `cx` | new |
| 46 | write file | 6440-6442 | - | `<out>/<t>.json` | game | - |
| 47 | `_gone`, `_moved`, `_counts` | 6465-6468 | - | set on the dict **after** the file is written | log/return only | never reaches the map |

---

### a. Prep square keys: what `write_one` does with each

Prep keys come from prep_map.py:4065-4146 (TILE mode `out.update`), plus `drn`.
Grep of write_tile.py for `tile[...]`, `tile.get(...)`, `tile.pop(...)`, `T[...]` and the field loops
in `follow_laid_ground`, `drop_clashes`, `clear_under_decks`, `clear_portals`.

| key | what it is | write_one | notes |
|---|---|---|---|
| `id`, `name`, `release`, `centre`, `field`, `fc`, `bk`, `v`, `tile`, `spawn` | header fields | untouched | |
| `b` | square box | untouched (read by `clear_portals`, post-passes) | |
| `t` | terrain grid {nx, ny, x0, y0, dx, dy, z0, h, k} | **modified**: `h` re-filled (`fill_dug_ground`) and re-laid (`lay_ground`); `k` read only (`drop_walls_on_paving`, `unpaved_ground`) | prep already flattened `h` to prep's own roads |
| `bl` | buildings | untouched (read: houses, kinds, Standing, town_fronts, drop_clashes; neighbours' `bl` read by `buildings_next_door`) | partition's own cleaned footprints are a different set |
| `rd` | roads/paths | **replaced** (prep `rd` read by fill_dug_ground, carry_missing_paths, carry_one_way, carry_pedestrian, demote_pedestrian, carry_flags); then modified by `drop_edge_way_stubs` | |
| `wp` | ponds/rivers polys | untouched (read) | |
| `wl` | streams | **modified** (z by `follow_laid_ground`) | |
| `br` | walls/fences/hedges | **replaced** (prep rows with `h` and all prep rows as "near" are read); then `clear_portals`, `drop_edge_stubs` | |
| `gt` | gates | **replaced** (prep never read); `clear_portals` filters | |
| `tr` | trees | **modified** (z, moved, dropped: follow_laid_ground, drop_clashes, clear_under_decks, clear_portals) | |
| `sb` | shrubs | **modified** (same as `tr`) | prep_tiles `clear_seams` already filtered it |
| `fx` | street items + cars | **modified**: z shifted, prep cars deleted, items reseated/dropped, new cars added; `string_city_wires` drops duplicate poles | |
| `mk` | road markings | **modified** (z, filtered to carriageways) | |
| `sh` | shop signs | **modified** (z only); read by `settle` | |
| `lm` | landmark marks | **modified** (z only) | |
| `dr` | doors | **modified** (z only); read by gates_for_doors, paths_from_openings, clear_doorsteps | |
| `by` | bays | **modified** (z only) | |
| `wr` | wires | **modified** (ends' z, restrung in drop_clashes, again in `string_city_wires`) | |
| `tn` | tunnels | **modified** (`bore_widths` -> `TN.widen` in place, twice) | |
| `lx` | level crossings | untouched (read) | |
| `fp` | front paths | **replaced** (prep never read) | prep_tiles' `clear_seams` fp filtering wasted |
| `dv` | drives | **replaced** (prep never read) | |
| `rk` | boulders | untouched | |
| `cn` | canopy grid | untouched | |
| `pl` | places | untouched | |
| `pi` | pitches | untouched | |
| `wf` | weir faces | untouched | optional key |
| `drn` | doors just over the edge | **deleted** (`tile.pop`, 6362) after use | |
| `sf` | - | **added** | |
| `pb` | - | **added** | |
| `cx` | - | **added** | |

### b. What runs over every square regardless of `--only`, and the halos

Regardless of `--only` (pipeline.py build; skipped only on a store hit):
- **graph**: whole map box (`map_bbox` = field circle + MARGIN 40 m). One process.
- **corridors**: every square that owns an edge; window = owned edges' bbox + REACH 14 + FILTER_SPAN 12 m (key pad 100 m).
- **structures**: whole map, one process, all edges.
- **pieces**: whole map: all corridors, all buildings cleaned, all parent blocks and worked pieces.
- `_clear_unowned` scans every square folder.

Limited by `--only`:
- **divide**: only squares in the 3x3 neighbourhoods of the wanted squares, but each task's window is
  pieces + REACH_GROW 60 + MARGIN 40 unioned with whole parent blocks + MARGIN 40 (parents measured
  up to ~1,700 m beyond a piece).
- **assemble**: wanted squares; reads own + 8 neighbours' corridors/blocks/held-out; layers over
  sq + MARGIN 40 (key pad 100).
- **write**: wanted squares; reads all corridors city-wide, parents sq ± 200 m, cleaned buildings
  sq ± 150 m, evidence sq ± 50 m (+ ridges REACH 14), osm-bridges ± 60 m, land_use ± 20 m,
  infrastructure points ± 5 m, lidar standing grid sq + 20 m, neighbours' prep `bl` within 40 m;
  write key digests every layer over sq + WRITER_REACH 1000 m.
- **post-passes**: written squares + 1 ring (`drop_edge_stubs`, `drop_edge_way_stubs`), + 2 rings read
  and possibly written (`string_city_wires`).
- **prep side** (for comparison): prep_tiles cuts each layer to tile + 650 m (`water` 1300 m) and
  prep_map works the square plus its own margin.

Ground worked more than once:
- Every building outline is cleaned in: prep_map (per square, with its margin), each corridor window
  touching it (windows of neighbouring owner squares overlap), the whole-map `pass_pieces`, and each
  assemble window (sq + 40 m, so 1-4 squares) where the result is thrown away.
- Every barrier / lidar wall run is read and joined (`join_evidence`) in: prep_map, corridor windows,
  divide windows (large, overlapping), assemble B, write evidence window.
- Parent blocks: a parent whose pieces are owned by several squares is cut (`make_plots` region
  growing on the whole parent) once per owning square; the memo (`shared`) is per task/part only.
- Assemble: the 80 m-wide strips along each shared edge are noded, relabelled and classified by
  both squares (and corners by four); each `blocks.json` is parsed by up to 9 assemblers.
- Roads: widths fitted twice (prep roadwidth; corridors), heights solved twice city/square-wide
  (prep bridge section + grading; `structures.solve` port) and a third time locally in write
  (whole_spans, ramps, dips, decks, hold_steep_streets).
- Terrain: flattened to prep's roads in prep_map, then refilled and re-laid to the partition's
  roads in write.
- Wires strung 4x (prep_map, prep_tiles post-pass, drop_clashes, stage post-pass); parked cars
  placed twice; garden boundaries, gates, front paths and drives built twice (prep's are discarded).
- Each prep square JSON (including its full terrain grid) is parsed by its own writer and by up to
  8 neighbours' writers (`buildings_next_door`, which uses only `bl`). Each written square is then
  parsed again by each post-pass (its own and neighbours' runs).

### c. Work that never reaches the map

- `held-out.json` in pass 1 (an extra `fit_cross_section(hold_out=True)` per width-tagged edge) - in
  the map's build path but read only by reports.
- In `assemble_square`: the raw-window `clean_buildings` + `bunion` (overwritten by `read_cleaned`);
  `osm-roads` load (only `road_pieces` metric); `land_use` load (only a printed count, yet it is in
  the assemble key, so a land_use change anywhere in B rebuilds the assembly); per-building
  `Terrain.elev` sampling (only `surface()`, skipped under QUICK); `whole` layer list; pickling the
  whole context into `report.pkl`; `read_held_out`.
- `pipeline.py report` -> `report_square` (__main__.py:227-390): surface triangulation (skipped
  QUICK), coverage/overlap unions, free/loose ends, front edges, deferred fragments (parses whole
  `cleaned-buildings.json` per worker), openings checks, metrics, data checks (`narrow_corridors`,
  `buildings_cut`, `unreachable_plots`, `edges_through_buildings`), `edge_profile` at 7 offsets;
  `fragments.json`, `metrics.json`, `checks.json`, `boundary.json`, `row.json`.
- `city.summarise`: held-out table, `neighbour_check`, `resolve_fragments` - which **runs a full
  `build()` (assemble + report, all layers) for any holder square outside the run's set**, in the
  report process, writing nothing to the map.
- `pass_pieces` over-cap flagging (log only); `cache.txt`, `stages.json`, store pruning.
- In write: `_gone`/`_moved`/`_counts` (set after the file is written), verbose prints,
  `measured.missed` counter.
- Not run under QUICK (the stage sets it): `road_profile`, `render`/`evidence`/`current.svg`,
  `current_build`.
- Prep-side work discarded by write (reaches prep square, not the game square): prep `rd` geometry
  and heights, `br`, `gt`, `fp`, `dv`, parked cars in `fx`, `wr` stringing, prep_tiles'
  `clear_seams` fp filtering.

### d. Same raw layer parsed separately (whole-file JSON parse, per process)

Counted for one full build with no store hits; J = jobs. "Layers" = `cache.Layers._load`, which
parses + sha1s every feature unless `cache/layers/<name>-<sha>.npz` exists (then it only hashes the
file). Every pool worker is spawned, so its caches start empty.

| layer | parses | where |
|---|---|---|
| `building` | 1 (prep_tiles split) + 1 (Layers, P) + 1 (Layers, S data_keys) + **J** (corridors) + 1 (pass_pieces) + **J** (assemble, `load_layer`) | ~2J + 4; plus the 9-ish split copies prep_map parses per square |
| `infrastructure` | 1 (split) + 1 (Layers P) + 1 (Layers S) + J (corridors) + J (divide) + J (assemble) + J (write: `load_evidence`, `mapped_points` share one `Data` cache) | ~4J + 3 |
| `osm-roads` | 1 (split) + 1 (Layers P) + 1 (Layers S) + 1 (graph) + J (assemble, count only) | J + 4 (+ sha in graph key) |
| `osm-detail` | 1 (graph) + J (write, guard rails) + 1 (Layers S) | J + 2 (+ sha in graph key) |
| `segment` | 1 (split) + 1 (graph) + 1 (Layers S) | 3 (+ sha) |
| `parcels` | 1 (Layers P) + 1 (Layers S) + J (divide) + J (assemble) | 2J + 2 |
| `land_use` | 1 (split) + 1 (Layers P) + 1 (Layers S) + J (assemble, count only) + J (write `green_ground`, from `data/<map>/land_use.geojson.xz` via lzma, a different file [?]) | 2J + 3 |
| `water` | 1 (split) + 1 (structures side process) + 1 (Layers S) (+ sha in structures key) | 3 |
| `listed` | J (write) + 1 (Layers S) | J + 1 |
| `osm-bridges` | J (write, `load_layer`) + 1 (Layers S) | J + 1 |
| lidar wall runs `measured/<t>.zip` | prep_map (own square) + corridors + divide + assemble + write, each per window touching it, cached per `Data` object only | many; plus sha in every corridors/divide/assemble key |
| `measured/partition.zip` standing grid | `lidar_tall` + `Standing` per square (2 decodes of the same npy) | 2 per square |
| `once/graph.json` | P (main) + every corridors worker task (`read_graph`, no cache) + structures | 1 + #owning squares + 1 |
| `once/corridors.json` (all) | pieces (1) + each divide worker + each write worker (`read_corridors`, cached per worker); assemble reads 9 per square | |
| `once/structures.json` | once **per written square** (no cache) | #squares |

Other notes from the code:
- The writer reads raw layers from the hard-coded `ROOT/data/raw/<map>/wide` (`load_evidence`,
  `mapped_points`, `osm_bridges`) and `ROOT/data/raw` (`green_ground`), not from the stage's
  `src_dir`, while the write key (`data_keys`) digests `src_dir`'s layers and excludes
  `*.geojson.xz`. If those differ, the key won't see the change. [?: depends on how mac_build
  lays out src_dir]
- `partition.json` keeps only the first 20,000 faces (__main__.py:200).
- `string_city_wires` can rewrite squares two rings out that this run neither wrote nor keyed.
