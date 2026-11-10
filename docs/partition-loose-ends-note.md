# Loose ends inside the square: a bug in the metric, and a real regression to fix

Status: **in progress on `claude/partition-stage-1-fix`**, off `claude/partition-stage-1`. Nothing
pushed to the stage 1 PR yet. Written up for a second opinion on the fix direction.

## 1. The "loose ends inside = 0" claim was a bug in the metric

`tools/partition/render.py`'s `loose_ends()` classified a free boundary end as "on the square's
edge" with `square.distance(p) <= 1.0`, where `square` is a **Polygon**. The distance from any
point *inside* a polygon to the polygon is zero, so every free end inside counted as on the edge
and the "inside" figure could never be anything but zero. A check that cannot fail.

Fixed to measure against `square.boundary` (the outline), which is what was meant. With the fix,
the stage 1 branch's real interior loose-end counts reproduce the co-developer's:

| square | proof of concept | stage 1 (as committed) |
|---|---|---|
| 1,1 | 1 | **50** (I measure 46) |
| 0,0 | 2 | **27** |
| 0,3 | 28 | **70** |

So stage 1 was worse everywhere — the one thing the rule forbade. Stage 1's *total* free-end figure
(76/73/86) was fine; it was the split that hid the problem.

## 2. What a loose end actually is

A "loose end" here is an end of a drawn plot edge that touches no other drawn plot edge and no
building, **more than 1 m inside** the worked area (the square plus its 40 m margin). Ends on the
worked area's outline are expected — the partition is cut off there.

Measured on a full run (not the 20 000-face `partition.json` cap), on 0,3:

- 70 interior loose ends.
- 55 of them within 5 m of a building; 10 within 5 m of a corridor; 12 neither.
- Their edges are mostly 6–15 m long (not tiny stubs).
- The nearest *other* drawn edge is 1–6 m away for most of them.

Zooming in (buildings grey, corridors buff, plot edges brown, free ends red) shows the pattern:
a plot edge stops a metre or two short of the edge it should meet, leaving a gap.

## 3. Root cause

`plots.classify_edges()` builds each drawn edge from **one pair of plot polygons**:

```python
shared = p.boundary.intersection(q.boundary)   # per pair, in a loop
```

The plots don't tile exactly. The region growing assigns whole *faces* to a building, the
`GARDEN` reach is a mitred square cut through the faces, and `tidy_plots` simplifies each shared
boundary as one line set but re-polygonises afterwards. Where two neighbours' versions of their
shared boundary don't coincide, each one's fragment ends in mid-air. Every interior free end sits
at one of these near-misses.

This is exactly the class of problem the current build already handles, in `tools/gardens.py`
(one network of boundaries, each laid once) and `tools/prep_map.py` (`_close_gaps`: "a boundary
that stops just short of another, or of a house, runs on to meet it", then "a loose bit that meets
nothing goes"). The proof of concept sidestepped it because its Voronoi divisions tiled exactly.

## 4. What I have tried

| attempt | result (1,1 / 0,0 / 0,3 interior loose ends) |
|---|---|
| stage 1 as committed | 46 / 27 / 70 |
| `drop_loose` (drop short free edges) | marginal, 43 / 24 / 72 |
| `merge_collinear` (join collinear fragments) | worse (129 total), and buggy — reverted |
| **whole-network classification** (node the union of *all* plot boundaries once; classify each piece by what lies either side) | **4 / 9 / 23** — the best yet, but it changed the edge *semantics*: `open`–`open` edges exploded to 15 885 and `front` disappeared, so support% fell (1,1: 10.7% → 8.2%). This is the most promising direction but the classification needs redoing carefully. |
| **`close_and_drop`** (current: run each dangling end to the nearest boundary/building within 2.5 m, then drop short stubs) | **16 / 16 / 19** — current committed WIP. Better, but still worse than the POC on 1,1 and 0,0. |

Current head of the fix branch: interior loose ends **16 / 16 / 19**; support 9.9% / 9.4% / 7.4%;
uncovered 0.7 / 0.3 / 2.9; overlap 0; pavement steps 0; held-out widths unchanged.

## 5. The question for a larger model

Which way should the fix go?

**Option A — whole-network classification (do it properly).** Derive the drawn edges from the
*partition's own faces* rather than from pairs of plot polygons: node all plot + corridor +
building boundaries once, and for every resulting segment decide what is on each side (by testing
a point just either side against the plot polygons and the corridor union). This matches the design
("Boundaries are the shared edges of that partition") and gave the best numbers (4/9/23). The work
is getting the side-classification right so the `front` / `open-open` / `inferred` / `evidence`
kinds come out as they do now, and so support% doesn't drop.

**Option B — faithful port of the current build's clean-up.** Keep the pairwise `classify_edges`
and add `prep_map._close_gaps` + "loose bit goes" as a proper pass: a boundary end that stops just
short (within 2.5 m) of another boundary *within 15–20° of its own direction* runs straight on to
meet it; anything still loose and short goes. This is closest to existing, proven code. The risk is
it is a clean-up pass on top, which `CLAUDE.md` explicitly warns against ("A new kind of thing, or
a fix for things clashing, goes into this order as a rule, not as a clean-up step on top") — which
argues for A.

**Option C — make the plots tile exactly.** Do the region growing so neighbouring plots share
their boundary by construction (e.g. compute the shared edge once and give each plot the same
line), so `classify_edges` has nothing to mend. The most correct, and the largest change.

A larger model's view on A vs B vs C would help before I sink more time.

## 6. Reproducing

```sh
python3 -I tools/mapdata.py unpack combe-down
for sq in "1 1" "0 0" "0 3"; do set -- $sq
  python3 -I tools/partition_poc.py $1 $2 out/$1_$2 \
    --raw data/raw/combe-down/wide --terrain data/raw/combe-down/wide/terrain15
done
# the two loose-end figures are in out/<ti>_<tj>/metrics.json:
#   plot_edges_ends_on_square_edge   (expected)
#   plot_edges_loose_ends_inside     (must be zero; currently 16/16/19)
```
