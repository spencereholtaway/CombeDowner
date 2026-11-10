# Item 2, part 5: do the other rules judge margin ground?

Measured over the nine squares, each finding's position tested against the square it was reported by.

| rule | findings | entirely outside the square |
|---|---|---|
| `narrow_corridors` | 16 | **2** |
| `buildings_cut` | 24 | 0 |
| `unreachable_plots` | 36 | 0 |
| `edges_through_buildings` | 26 | **3** |

So **two of the four rules do judge margin ground**, on 5 of 102 findings:

- **`narrow_corridors`**, 2 of 16, both on square (−1,2): at (−1956.8, 1287.8) and (−1971.6, 1003.1).
  A corridor is fitted from a window sized to the street edge, and clipped for assembly to the worked
  area, so a corridor whose fitted width dips below its class minimum inside the margin is reported
  by this square. The same street is *owned* by whichever square holds its midpoint, so the finding is
  about ground this square does not ship, and the owning square may report it too.
- **`edges_through_buildings`**, 3 of 26, on squares (0,3) and (1,4): at (−1996.4, 2084.4),
  (−916.7, 2170.6) and (−936.3, 3060.6). The rule is given `pedges`, the drawn network clipped to B,
  and the map-wide footprints, so an edge in the margin is judged here.
- **`buildings_cut`** and **`unreachable_plots`**: 0 of 24 and 0 of 36 outside the square. Both are
  given ground already bounded by the square's own faces (`bpolys` from the square's window, and
  `plots` for the reachability walk), so they are in scope already - although `unreachable_plots` is
  given the same B-clipped `plots` the openings check was, and comes out in scope only because a
  plot's reachability is decided from the house, which is in the square.

No rule was changed for this. The co-developer decides whether `narrow_corridors` and `edges_through_buildings`
should be scoped the same way as the openings check; the argument for is the same one (a square should
not report ground its owner ships, and the owner may report it too), and against is that these two
rules report a *place on the ground* rather than a per-building fact, so a duplicate is less confusing
- the same defect seen twice is the same defect.
