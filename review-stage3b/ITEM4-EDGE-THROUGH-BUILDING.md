# Item 4: `edge_through_building` 22 → 96, explained

The co-developer's item 4: bucket the 87 new findings by which evidence line they lie on and whether stage 3 had
that line at all. A bug gets fixed; real findings on ground stage 3 never cut get three examples in
the PR.

## Not evidence lines

77 of the 94 new findings have **no evidence line within 2 m** and **none has a lidar ridge within
2 m**. So it is neither "the ridges now read over the worked area" nor "the evidence a parent is cut
with, extended `EXTEND` past each end". `hedge_low` pointed at evidence, but `hedge_low` is not
evidence: it is the **zone's default front material** (`FRONT` in `plots.py`, used at
`FRONT.get(zone_at(...), "hedge_low")` when there is no evidence along the boundary). These are
fronts, and a front is what a plot edge facing a street is.

## Not a boundary through a building

All 94 were tested two ways:

- **building on both sides of the edge** (a boundary crossing a footprint's interior - the defect the
  check is for): **0 of 94**. Every one has a building on *one* side and a plot on the other, which
  is a plot edge against its own house - the boundary the partition is supposed to draw.
- **how deep inside the footprint the edge goes**: **all 94 are at 0.000 m from the footprint's own
  boundary.** Not one is even a centimetre inside. The "inside" the check sees is float noise on a
  line the edge and the footprint share.

So `edges_through_buildings` tests the edge's **midpoint** with `bpolys[k].contains(m)`, and a
boundary that *is* the footprint's outline has its points at distance 0.00 m from that outline:
`contains` is then a coin toss on the last bit of a float. The same class is in stage 3 - **21 of its
own 23 findings are at 0.0 m too** (its other two are 0.33 m and 0.91 m) - so this is not a defect
3b introduced.

## Why 3b reports more of them

Because 3b draws **longer merged edges**, so more of their midpoints land on a footprint.

`classify_edges` merges the pieces of one label pair into one line, and 3b names more pairs (it reads
the faces of the worked area, so it sees plot/building and plot/plot where pass 2 only guessed). Of
the 73 new findings whose square stage 3 also built, 3b's edge is longer than the stage-3 edges it
covers in **31** cases, the same in 18, shorter in 24 - and the long ones are long: 503.4 m against
stage 3's 131.3 m, 326.8 against 36.5, 319.3 against 135.3. A boundary stage 3 split into a 3 m piece
and a 20 m piece can be one 24 m line in 3b, and the midpoint of the merged line falls somewhere
neither of stage 3's pieces had one.

Worked example, square 3,3 at (1225.7, 1888.9): a 24.5 m `hedge_low` front, its midpoint 3.5 m
inside a 1,798 m² footprint, building on one side and plot on the other, and **0.000 m from that
footprint's boundary** along the whole stretch.

## What this is, then

Not a bug in 3b and not a defect the player sees: a **false-positive class in the check**, which
stage 3 already had and 3b exercises more often because it merges more. The check's own rule is
sound - an edge through a building is a defect - but its test is a single point with `contains`,
which cannot tell a boundary running *along* a footprint from one crossing it.

The honest fix is in the check, not the build: report a finding only where the edge is inside the
footprint by more than a tolerance (the measured 0.0 m against the real 0.33 and 0.91 m suggests a
few centimetres is enough), or sample along the edge rather than at its midpoint. That is a change to
a check, which the plan's rules say not to weaken to improve a number - so it is the co-developer's call, and it
is written here with the measurement rather than made quietly. Stage 3's own 23 findings have the
same 21-of-23 false positives, so the check has been reporting them all along.
