# Item 2: where the failing plots come from, and what the check is asking of them

No code changes. The co-developer's item 2 was "the absorb step's `D_same_label` exit"; measuring it showed the
premise was wrong, and the report below is what the table says instead.

## The premise that died first

`make_plots` ends by grouping faces **by label** and unioning each group, so a small face whose
longest-shared-edge neighbour already carries its own label is merged by that step regardless of what
the absorb loop decides. Measured on square 0,0: of 729 small plot faces, **0** have every neighbour
carrying their own label, so the `D_same_label` exit is a **no-op**. The exit counts described the
loop, not the written faces. (The plan's note is corrected in the commit after this one.)

## The table: every failing building's house is outside the square

The three reference squares, 55 failing buildings (1,1: 19, 0,0: 25, 0,3: 11). Full tables in
`/tmp/fail-table3-*.json`; the shape of every row is the same, and here is 1,1 in full:

| bldg | plot m² | house in B? | fronts | front len | source | depth | across | reason |
|---|---|---|---|---|---|---|---|---|
| 34199 | 0.066 | **no** | 3 | 0.20 | parcel | 11.01 | plot | house not in the square |
| 36507 | 2.576 | **no** | 3 | 2.43 | parcel | 7.57 | plot | house not in the square |
| 31558 | 6.486 | **no** | 3 | 3.58 | parcel | 1.80 | plot | house not in the square |
| 36225 | 6.765 | **no** | 3 | 2.80 | parcel | 4.54 | plot | house not in the square |
| 31442 | 10.692 | **no** | 3 | 6.94 | parcel | 13.31 | plot | house not in the square |
| 31311 | 16.620 | **no** | 1 | 13.17 | evidence | 24.84 | open | house not in the square |
| 39894 | 17.511 | **no** | 6 | 4.79 | parcel | 20.28 | plot | house not in the square |
| 30569 | 25.047 | **no** | 3 | 4.10 | inferred | 94.69 | open | house not in the square |
| 39823 | 26.358 | **no** | 2 | 6.95 | front | 2.46 | — | house not in the square |
| 31632 | 27.992 | **no** | 1 | 11.70 | parcel | 14.03 | open | house not in the square |
| … | … | **no** | … | … | … | … | … | house not in the square |

**By reason, all three squares, 55 of 55: `house not in the square`.** Not "front too short" (that
branch records an `open`, so it cannot fail), not "no straight run", not "the gate would land on a
building". `find_openings`'s first line is `house = houses.get(bidx); if house is None: continue`, and
`houses` is built from the footprints that intersect B
(`buildings = [(i, g) for i, g in read_cleaned(once) if g.intersects(B)]`). So for these buildings no
opening can ever be recorded, and the check reports them all.

## The mechanism, in the code's own steps

1. **A house sits just outside B**, in a neighbouring square — measured, house 34199 is **11 m**
   outside B, in square 1,0.
2. **Its plot is large and reaches across B's edge**, so `blocks_for` clips it into B and the square
   gets a **fragment**: 293.4 m² written, **0.066 m²** in B; 359.6 m² written, 0.002 m² in B.
3. **`front_edges` names the building index**, correctly — the fragment is real ground of that
   house's garden.
4. **`find_openings` cannot find the house**, so it records nothing.
5. **The check** sees the building in `fronted` and not in `opening_bldgs`, and reports
   `front_without_opening`.

Widened to the three reference squares plus the six next-worst city squares — **258 failing
buildings**:

| | |
|---|---|
| house inside B (the square's own houses) | **0** |
| house in a *different* square | **258** |
| the fragment smaller than the plot pass 2 wrote | **255** |
| a written plot under an absorb threshold | **2** |

And the square that holds the house **does not report the same building** — checked on 0,0's
failures, whose houses are all in (−1,0): the holder gates them.

## What this means

**It is not a plot problem, an absorb problem, or a doorstep.** The failing plots are ordinary
gardens (2.4 to 3,128 m² written, median around 100 m²); the tiny ones in the table are **fragments
clipped at B's edge**, not small gardens — 255 of 258 are fragments of a larger plot. The plot's own
square gates it correctly. The check is failing a building on the square that *cannot see its house*.

So the defect is in the **check's inputs**, not in the build and not in the rule the co-developer proposed. Two
candidate fixes, and they are different in kind:

- **(a) Give the check the houses it needs.** The square already gathers the neighbours' plots, so the
  house is knowable: `houses` could be read map-wide (`read_cleaned(once)` unfiltered) or at least for
  B grown by the largest plot reach. Then `find_openings` finds the house and the gate is placed on
  the fragment's own front — which is a real front, on real ground.
- **(b) Do not credit a fragment to a building the square has no house for.** A plot fragment whose
  house is outside B has no front in this square to gate; the building's front belongs to the square
  holding the house. `front_edges` could skip a plot whose building index is not in `houses`.

(a) is the honest one if the fragment really is a front on this square's ground; (b) if the fragment
is incidental ground that the holder square already handles. The measurement says the holder gates
them, which points at (b) — but which is right is the co-developer's call, and it changes a check or a check's
inputs, so it is not made here.

**The co-developer's prior, tested:** "a plot a couple of metres deep between a terrace house and the pavement is
a doorstep, not a garden". The table does not show that. The fronts' depths run 0.8 to 94.7 m, the
plots are ordinary gardens, and the houses are not on the other side of the front — they are in
another square. No rule in `assemble` about shallow plots would touch any of these 55.

## The genuine slivers: a separate bucket, and they are not the same thing

My earlier "24% genuine slivers" split was computed on the **clipped fragment**, so it was wrong for
the same reason: a 0.066 m² fragment at B's edge is tiny because it is a fragment. Redone on the plot
pass 2 *wrote*, of the 258 failing buildings only **2** have a written plot under an absorb threshold:

| square | building | written plots (m²) | fragment in B (m²) |
|---|---|---|---|
| 1,1 | 30569 | 355.204, **2.960**, **2.922** | 25.047 |
| 0,0 | 23740 | 27.647, **0.485** | 0.499 |

So the genuine-sliver bucket is **2 of 258, not 24%** — and even those two are cross-square
buildings, so they fail for the same reason as the rest. The absorb step is not implicated in any of
the city's 722 failures: with the correct denominator, there is no sliver population left for it to
have failed to merge.
