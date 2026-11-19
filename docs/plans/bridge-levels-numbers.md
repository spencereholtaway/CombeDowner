# Bridge levels: stage 0 and stage 1 numbers

The trial squares for `bridge-levels.md`, built partition-only with `tools/prep_tiles.py --only` (4 jobs)
on a laptop that was also running a whole-map build, so build times are only rough. "Base" is the branch
before stage 1 (with the clearance fix for trees off the edge of a square's ground, without which 0,2,
1,2, 2,4 and 2,5 failed to build). "After" is stage 1 as committed. 1,0 has no bridges, which makes it
the byte-identical check.

## Per square

| square | write s base / after | gz JSON base / after | pack.gz base / after | sf triangles base / after (level 0 + level 1) |
|---|---|---|---|---|
| 1,2 | 215 / 196 | 961,398 / 966,038 | 633,826 / 638,584 (+0.75%) | 37,524 / 37,535 + 430 |
| 0,2 | 832 / 761 | 1,355,309 / 1,361,015 | 886,223 / 890,840 (+0.52%) | 58,087 / 58,071 + 575 |
| 1,3 (Pulteney) | 314 / 296 | 1,128,759 / 1,138,952 | 768,070 / 777,003 (+1.16%) | 48,311 / 48,325 + 1,048 |
| 0,3 | 716 / 648 | 1,361,658 / 1,370,534 | 950,115 / 957,997 (+0.83%) | 68,302 / 68,329 + 856 |
| 4,2 | 9.6 / 10 | 306,789 / 308,040 | 191,912 / 193,058 (+0.60%) | 8,010 / 8,009 + 123 |
| 2,0 | 15.3 / 15.8 | 356,459 / 357,486 | 219,548 / 220,436 (+0.40%) | 7,774 / 7,778 + 119 |
| 2,4 (crosses into 2,5) | 96 / 98 | 618,249 / 624,687 | 402,599 / 409,934 (+1.82%) | 23,217 / 23,202 + 663 |
| 2,5 | 177 / 178 | 734,838 / 739,706 | 475,195 / 479,370 (+0.88%) | 26,820 / 26,828 + 502 |
| 1,0 (no bridges) | 52 / 52 | 518,623 / 518,623, same sha1 | same | 14,158 / 14,158 |

Game meshes were not counted: in stage 1 the game unpacks `lv` but doesn't draw it yet.

## Checks over the eight bridged squares

| measure | base | after |
|---|---|---|
| bridge-end probe (`tools/bridge_ends.mjs`): ends / lip over 0.15 m / mean worst lip | 92 / 11 / 0.111 m | 92 / 11 / 0.113 m |
| `tools/road_bumps.mjs`: bumpy streets | 293 of 3131 | 293 of 3131 |
| watertight, level 0 (street missing / extra / path not drawn, m²) | 25,587 / 32,060 / 22,999 | unchanged (within 0.1) |
| watertight deck uncovered, m² | – | 1,1 1.1; 0,2 2.1; 0,3 1.6; 1,3 684 (Argyle Street and Pulteney set-piece cuts); 2,4 1.5; 2,5 0.5; 4,2 0.1 |
| watertight cap unshared, m | – | 0,3 1.5; 1,3 0.3; 2,4 0.6; 4,2 0.9 |

Rules that changed (check_map --tiles over the eight squares; the rest stayed the same):

| rule | base | after |
|---|---|---|
| 9 path strip along a pavement | 2 | 3 |
| 9 sliver or spike where road and paving meet | 31 | 30 |
| 20 no road drawn: ground | 31 | 30 |
| 23 path not drawn | 171 | 173 |
| 23 step between two pieces of path | 8 | 6 |
| 28 deck end not joined to the street (new) | – | 6 |
| 28 deck end off the street | 4 | 8 |
| 30 ground up through a deck | 3 | 2 |
| 41 step in the carriageway | 72 | 73 |
| 42 faces don't meet the next square's | 42 | 46 |
| 53 bare ground inside a street | 45 | 35 |
| 54 deck footprint not drawn (new) | – | 3 |
| 54 deck point off its line (new) | – | 16 |

## Lists

- Decks over decks: none in the trial squares. The nearest is Rossiter Road over the steps beside it in
  1,2 (-592,1616), 2.0 m apart, right on the threshold.
- Culverts (under 0.5 m of air): none in the trial squares. The lowest is the steps at Ferry Lane in
  4,2 (3149,1635) at 1.6 m.
- Caps whose record cross-section and partition cross-section differ by more than 0.3 m: 29. The worst
  is Argyle Street in 1,3 (record 8.8 m carriageway with no pavement, against a partition of 5.0 to 7.4 m
  with 2 to 4 m of paving). Most of the rest are trunk roads and links in 2,4 and 2,5, where the
  partition gives 0.4 to 0.8 m of pavement and the record gives none, and carriageways 0.2 to 0.6 m
  wider than the record.

## Stage 1 follow-up (the maintainer's four points)

Rebuilt the same squares with the follow-up changes. This is "after5" in the scratch notes. 1,2 first
failed on a GEOS overlay error in the deck's kerbs; that is now retried at millimetre precision.
What changed:
- Level 0 gives way to the deck near its caps, and the deck fills the slivers left between them.
- A way passing under a deck's end keeps its own height and doesn't join the cap.
- The decks' level runs on past a deck cut at a square's side.
- Rule 54 excuses steps riding a deck, by kind.
- Watertight leaves out set-piece cuts.

| measure | base | after (first commit) | after5 |
|---|---|---|---|
| pack.gz change, worst square | – | +1.82% (2,4) | +1.79% (2,4); 1,3 +1.17%; 1,2 +0.82%; the rest under 0.9% |
| end probe: lips over 0.15 m / mean worst lip | 11 / 0.111 | 11 / 0.113 | 11 / 0.113 |
| road_bumps | 293 | 293 | 293 |
| 28 deck end not joined to the street | – | 6 | 10 |
| 28 deck end off the street | 4 | 8 | 8 |
| 41 step in the carriageway | 72 | 73 | 73 |
| 42 faces don't meet the next square's | 42 | 46 | 45 |
| 53 bare ground inside a street | 45 | 35 | 35 |
| 54 deck footprint not drawn | – | 3 | 0 |
| 54 deck point off its line | – | 16 | 15 |
| watertight deck uncovered, 1,3 | – | 684 m² | 1.4 m² |

On 4,2, 2,4 and 2,5 alone, "not joined" went from 4 to 0 and rule 42 went back to base (7). The
spots that remain are kerbs rounding round a cap in 0,2, 0,3 and 1,2 (for example 1,2 at
-517,1620). Moving the corners on to the cap line instead (projection) did worse on 1,2.

## Stage 2 (`?decks=1`) and the last stage 1 changes (after7)

What changed since after5:
- Each side of a deck is cut to its own width (`dk` [left, right]), on both levels, where it used to
  be cut to the wider side's width on both. That was what made the stone stick out past Ferry
  Lane's parapet.
- The decks' level runs on past a deck only where its record is cut at the square's side, not where
  a deck stops in the air.

| measure | base | after7 |
|---|---|---|
| pack.gz change, worst square | – | +1.79% (2,4), +1.39% (1,3), the rest under 0.9% |
| bridge-free square 1,0 | – | byte-identical |
| end probe: lips over 0.15 m / mean worst lip | 11 / 0.111 | 11 / 0.113 |
| road_bumps | 293 | 293 |
| 28 not joined / off the street | – / 4 | 6 / 8 |
| 41 / 42 / 53 | 72 / 42 / 45 | 73 / 46 / 35 |
| 54 not drawn / off its line | – | 0 / 16 |

The game with `?decks=1` against strips, for the square in view in each trial shot:

| view | square | draw calls | triangles |
|---|---|---|---|
| Ferry Lane | 4_2 | 81 → 81 | 156,705 → 156,787 |
| Rossiter Road | 1_2 | 131 → 131 | 357,285 → 357,393 |
| steps footbridge | 4_2 | 75 → 75 | 137,065 → 137,147 |
| canal bridge | 1_2 | 151 → 151 | 409,188 → 409,296 |
| Sydney Wharf | 1_3 | 167 → 167 | 503,389 → 503,514 |

Height you stand at on the deck (`map.deck`), strips → faces: Ferry Lane 9.24 → 9.31, Ferry Lane's
other bridge 23.97 → 24.05, Rossiter Road 7.18 → 7.25, the canal footbridge in 1_2 11.92 → 11.89,
Sydney Wharf 17.84 → 17.92, North Parade 3.33 → 3.37, the steps footbridge 5.87 → 6.11. The faces
include the street's lift above its line, which is why most come out a few centimetres higher.
