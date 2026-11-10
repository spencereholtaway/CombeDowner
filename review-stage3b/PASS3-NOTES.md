# Stage 3b, pass 3: where it stands

Working notes for the next session. Square 1,1 unless said otherwise.

## Fixed and pushed (at `ca966d7`)

1. **`_poly_json` dropped a polygon's holes** (`1f0746b`).
2. **Everything gathered is clipped to the worked area B**, at full precision (`c77a1ae`).
3. **The ground beyond a worked piece is open land, not a street** (`a3066cb`).
4. **The parent block is cut, not the piece** (`36d625a`).
5. **`_label_outside` tests the parent boundary with distance, and a pass-output guard** (`fcac87a`).
6. **Classification reads the faces of the worked area, not of the square** (`cd7f286`) - the co-developer's half 1.
7. **A worked piece's open face can reach past the piece** (`5bd0567`).
8. **The held-out width test reads pass 1's fit** (`5bd0567`).
9. **The neighbour summary counts edges and lines apart** (`73c3127`).
10. **Tests for both new rules, and a correction to rule 6's report** (`ca966d7`).

## The city run, `out/city3b`, 12 jobs

| | stage 3 (`out/city`) | 3b | plan's acceptance |
|---|---|---|---|
| squares built | 131/131 | **131/131** | met |
| neighbour: positions without a partner | 5,041 | **0** | met |
| neighbour: worst mismatch | 349.877 m | **0.0 m** | met |
| neighbour: shared edges / sample lines | - | 236 / 944 | met |
| overlap | 0.0 | 0.0 | met |
| total time | 448 s | **443 s** (p1 16 + p2 258 + p3 168) | met (ceiling 896) |
| evidence share | 57.6% | 62.6% | met (better) |
| loose ends inside | 0 | **1** | **missed** |
| uncovered | 21.0 m2 | 22.3 m2 | **missed, marginal** |
| opening failures | 0 (stale) | 722 | **missed, explained** |
| data findings | 265 | 377 | **missed, explained** |

The three reference squares are within a point of stage 3 on every figure (`compare.py`).

### The three misses

**Loose ends: 1**, on square 5,5, at (3890.0, 4652.6). Not a `gather`-reach problem - the co-developer's first
hypothesis, and it is not this: the face beside the segments is owned by **5,5 itself** (piece 6876),
it is in 5,5's gather, and nothing in any square's written rows covers the far side (measured
city-wide). The cause is that `relabel` **overwrites pass 2's `("edge",)` label**, and `("edge",)` is
the one label `classify_edges` drops. Pass 2 labelled those segments `("open",)` against `("edge",)`
- not a boundary. `relabel` found two faces for 14 of 5,5's 19 `("edge",)` segments and turned them
into drawn boundaries, so a *drawn* edge now meets a *dropped* one at (3890.0, 4652.6) and the drawn
one has an end in mid-air. 1,079 segments city-wide carry `("edge",)` on a side; only 5,5 has any at
all (14 replaced there, 0 on all three reference squares - which is why they never caught it). The
rule the code should follow is the co-developer's rule 2: a segment whose labels `classify_edges` will drop must
not come back as drawn ground. Not fixed yet.

**Uncovered: 22.3 against 21.0** - +1.3 m2 over 131 squares, and the same square (0,3, 2.7 m2) is
worst in both. This is the plan's "no worse than stage 3's city figures" and it is 6% worse. Small
but real; not tuned.

**Opening failures: 722, and they are a check-input problem, not an absorb one.** Corrected here
because the first note blamed the absorb step's `D_same_label` exit, which measurement killed
(`review-stage3b/ITEM2-FAILING-PLOTS.md`). Every failing building has its house **outside the
square's worked area** - 258 of 258 across the three reference squares and the six next-worst city
squares. A house just outside B (11 m for one on 1,1) has a large plot reaching across B's edge, so
`blocks_for` clips it into B and the square gets a *fragment* (293.4 m2 written, 0.066 m2 in B).
`front_edges` names the building index, correctly, but `find_openings` looks the house up in
`houses`, which is built from the footprints that *intersect B*, and its first line is
`if house is None: continue`. So no opening is ever recorded and the check reports the building. The
square holding the house gates it correctly.

The `D_same_label` exit is a **no-op**: `make_plots` ends by grouping faces by label and unioning
each group, so a small face whose neighbour carries its label is merged by that step regardless -
measured, 0 of 729 small plot faces on 0,0 have every neighbour carrying their own label. The
"24% genuine slivers" figure was also wrong: it was measured on the clipped fragment, which is tiny
because it is a fragment. On the plot pass 2 *wrote*, only 2 of 258 are under an absorb threshold.

The fix is in the check's inputs - give `find_openings` the houses map-wide, or stop `front_edges`
crediting a fragment to a building the square has no house for - and it is the co-developer's call which.

**Data findings: 265 -> 377.** By distinct place: 257 -> 360. New 156, gone 53. The movers are
`edge_through_building` 22 -> 96 distinct (87 new, 75 of them `hedge_low`) and `plot_unreachable`
159 -> 195 (68 new). Both rules read the **drawn** network, and 3b draws more boundaries than stage 3
did - more fronts (0,0: 621 against 556), and the `("edge",)` relabelling above. More boundaries can
only add findings to these two checks, never remove them. `building_cut` 47 -> 43 and
`narrow_corridor` 29 -> 26. Not yet verified finding by finding.

## The three review items after the merge, all done

Branches `claude/partition-etb-check` (PR #18), `claude/partition-fragments` (PR #19, merged as
`7d5f86a`) and `claude/partition-frag-fixes`.

1. **The `edge_through_building` check** (PR #18). It tested an edge's *midpoint* with `contains`, so
   a plot edge against its own house - which runs along the wall, at 0.000 m from the footprint's
   boundary - was a coin toss on the last bit of a float. Refined to a length test against the
   footprint shrunk by 5 cm: city 104 -> 0, and all 104 of the old ones at 0.000 m depth. Stage 3's
   own 23: 21 the same, and the other 2 were degenerate closed loops that 3b no longer draws.
2. **The opening failures** (PR #19, merged). Not the absorb step at all: the absorb loop's
   `D_same_label` exit is a no-op, because `make_plots` unions faces by label at the end. Every one of
   the failing buildings had its house outside the square's worked area, so `find_openings` skipped it
   and the check reported it. Fixed as a **scope rule**: a square judges only the ground it ships.
   Nine squares 258 -> 0, and the shipped and judged plot areas agree to float noise, so every
   piece of shipped garden is still judged exactly once. See `ITEM2-FAILING-PLOTS.md`.
3. **Pass 2's window** (`claude/partition-frag-fixes`). Sized to the pieces while the *parent* is
   what `make_plots` cuts: 233 of 716 pieces had a parent reaching outside the window, median 285 m,
   worst 1,700 m. Now sized to the parents plus MARGIN, with a test that a real piece's parent is the
   same block from its own window and from one grown by 400 m. 155 of 160 squares' written output
   changed; the reference squares keep every figure that matters.

Two follow-ups fixed as item 3's first commit: `resolve_fragments` now requires the square **holding
the house** to have recorded the opening (a building index is global, so any square holding a
fragment of the plot names the same one), and a corner house - whose house is in the diagonal square -
is walkable through the corner, so `shared_edge` returns the corner plus the two edges meeting there
instead of nothing.

## What is left

1. **The findings count**, finding by finding (`plot_unreachable` 159 -> 195 is the remaining one).
2. **Stage 4**, the game's map file.

## Tools

- `python3 -m unittest discover -s tools/partition/tests` - 62 tests.
- `python3 -I out/run_pass1.py out/once-p1 12` then `out/run_pass2.py out/once-p1 12` (p1 ~16 s,
  p2 ~258 s). Each needs the `__main__` guard.
- `python3 -I tools/partition/compare.py` - the three squares.
- `python3 -I out/run_city_all.py 12 out/city3b` - the whole city, each pass timed. Needs the guard.
- A stage-3 worktree at the merge commit is at `~/src/cd-stage3` (`2f656ea`).
- `out/spy_sq.py <tag> <outdir> <ti> <tj> <once>` spies on the loose-end metric inside the build.
- **Do not write a probe that runs `_fit_square_blocks` into `out/once-p1`**: the guard refuses, but
  do not rely on it.
- Diagnostics from this session, all in `out/`: `h1_isolate.py` / `h1_none_attrib.py` (the face-set
  attribution), `h1_loose55.py` / `h1_farside.py` / `h1_relabel_55.py` / `h1_edge_replace.py` (the
  loose end), `h1_absorb_exits.py` / `h1_absorb_tiny.py` / `h1_fail_split.py` (the absorb exits and
  the small-plot split), `h1_findings.py` / `h1_findings2.py` (the findings buckets).
