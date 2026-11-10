# Stage 4 questions, aimed at the co-developer walking square 0,0

The goal for the first cut is narrow: **one reference square, loaded in the game, walked around**. So
the target is one tile file, `web/public/maps/combe-down/0_0.json`, written from the partition, which
the game loads with no engine change.

What I found reading the section and the game's own types (`web/src/map.ts`):

- a tile is the whole `MapData` object (`web/public/maps/combe-down/0_3.json` has all 31 keys), not a
  fragment: `t` terrain, `bl` buildings, `rd` roads, `br` barriers, plus `gt fp dv dr tr sb fx mk sh lm
  pi wp wl tn cn wr by sp spawn pl b bk centre field fc name id release tile v`;
- **square 0,0 has no tile built today** — `web/public/maps/combe-down/` holds 123 of the 131 squares
  and 0,0 is not one of them. 0,3 and many others are there to compare against;
- the partition already has, per square: the faces (plot/open/building/carriageway/pavement/path), the
  drawn edges with their class and source, the openings (gate/drive/open/path with a position and
  width), and the corridor stretches with widths and road-profile heights.

## The questions

**1. Which fields must the first tile carry, and which can be empty for a first walk?**
The partition can fill `t`, `rd`, `br`, `gt`, `fp`, `dv` and the footprints for `bl` honestly. It
cannot produce `tr` trees, `sb` shrubs, `fx` street items, `mk` markings, `sh` signs, `lm` landmarks,
`pi` pitches, `dr` doors, `by` bays, `wr` wires, `cn` canopy, `sp` set pieces, `tn` tunnels, `wp`
ponds, `wl` streams — those are the current build's decoration passes. **Is an empty decoration set
acceptable for the first walk** (bare but walkable), or does the game need any of them not to crash or
to look like a place?

**2. `bl` from the current build, or from the partition?**
The plan says "from the current build's building pass", with the cleaned footprints replacing its
footprints, and the partition's own plot data is not the building geometry. My reading is that the
right first move is **copy `bl` from the existing 0,3-style tile for the same square** and leave it
alone — the footprints are not what stage 4 is testing. Is that right, or does the co-developer want the cleaned
footprints written so the sliver-gap joins show?

**3. `rd`: one record per corridor stretch, or per street?**
The plan says one record per *corridor stretch* with `w` and `pv`, split at the taper's ends. The
existing tiles hold one record per OSM piece (`rd[0]` is a 1,412-record list for 0,3). Splitting into
stretches multiplies the records; the game reads `w` and `pv` per record. **Is a stretch-per-record
list what the game should get, or should stretches be merged back into one record per street with the
width at its widest?** The plan's reason for per-stretch is that the taper has to be handled, and a
per-street record cannot express a changing width.

**4. `br`: what is a barrier, and at what height?**
The plan: every plot edge that is a wall, fence, hedge or railing, with the class the game knows
(`walls.py`'s STYLE names) and `h`, cut at every opening. Two questions:
   - the partition's edge classes are `garden_wall`, `hedge`, `hedge_low`, `fence`, `railing`,
     `brick_wall_low`, `stone_wall`, `brick_wall` and the inferred ones — **is that the full set the game
     wants, and is `BARRIER_HEIGHT` in `map.ts` the right height for each, or does the writer supply
     `h` per line?**
   - an `open` front (a boundary that is a break rather than a wall) must **not** be written as a
     barrier, and a `front` is a wall. My reading is that `br` takes every drawn edge whose kind is a
     barrier class, cut at the openings, and that `open` fronts are simply absent from `br`. Correct?

**5. `gt`: gates from openings — which openings, and in what form?**
`gt` in the game is `[x0, y0, x1, y1, ground, boundary style]` — a *gap*, two points either side. The
partition's openings are `(edge id, t along the edge, width, kind)` with kind `gate`, `drive`, `open`
or `path`. So a gate is the pair of points on its edge at `t ± width/2`, at the ground height, with the
edge's material. **Is that the mapping — and should `drive`, `open` and `path` openings go into `gt` as
well, or only `gate`?**

**6. `fp` and `dv`: front paths and drives.**
The game wants `[x0, y0, x1, y1]` lines, gate to door and gap to house. The partition knows where the
gate is and where the house is, but not a door position (that is the game's own door pass). **Should
the first tile write `fp`/`dv` as a straight line from the opening to the house's nearest point**, or
leave them empty until the door pass can be reused?

**7. `t`: the terrain grid, with or without the road profile written in?**
The plan says "the terrain grid as now, but with the road profile's heights written under the
carriageway and pavements (replacing `prep_map.py`'s flattening), so `sinkUnder` has nothing to do".
The partition has the profile (`road_profile`) and the corridor polygons, so it can write `t` with the
carriageway flattened to the profile. **For a first walk, is that the thing to do — or copy `t` from
the existing build unchanged and leave `sinkUnder` to flatten the strips as it does now?** The second is
much less work and would look the same, since the game is still drawing roads as strips at this stage.

**8. How does the co-developer load it?**
Is the way to walk a single new tile `prep_tiles.py`'s stitch plus the game's own map list, or is there
a quicker path (a dev server pointed at one square)? And is 0,0 the square he wants, or would 0,3
(the city centre, which has a tile already to compare against) be a better first one?

## What I would do without answers, if any of these are obvious to him

- `bl`: copy from the existing build (question 2)
- `t`: copy from the existing build (question 7)
- everything the partition cannot honestly produce: empty (question 1)
- `rd`, `br`, `gt`: from the partition, per the plan (questions 3, 4, 5)
- `fp`, `dv`: empty for the first tile (question 6)
