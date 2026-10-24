# Partition build: decisions to check again

Choices made to get the partition city playable. Each one was the right call for now, but it
needs checking again in the game, or once the bigger rules are settled. Tick one off when it has
been looked at.

## Roads

- [ ] **Streets are narrower.** They are now fitted to the partition's carriageway faces, with a
  0.2 m margin and a 2.5 m floor. Average widths fell: service 2.99 → 2.69 m, residential
  5.58 → 5.21 m, trunk 7.12 → 6.72 m. About a third of service length sits on the floor (it was
  5%). Check that traffic, buses and parked cars still fit.
- [ ] **Vehicle roads stop at a house wall**, as in the old build. Look for dead ends this leaves
  in the traffic network.
- [ ] **Paths under a railway bridge are cut** 5 m either side of the line, because the ground
  isn't dug away under rail bridges. A real underpass loses its link. The fix is to dig the
  ground under spans, as `prep_map.py` does.
- [ ] **Road points are held within 0.4 m of the square's ground.** That ground was cut for the
  old roads. Once the ground is cut for the partition's own roads, the hold can be tightened or
  dropped.
- [ ] **Roads use bilinear ground, walls use the game's triangle ground.** This is because
  `check_map` rule 1 measures roads bilinearly. Make the check consistent, then put roads on the
  triangle ground too.
- [x] **A stream under a road keeps its bridge span.** `check_map` now counts a stream or river
  drawn as a line (`wl`) as something under a bridge: "bridge over nothing" went from 38 to 1 (main's
  own map, checked the same way, from 7 to 3). The one left is Bridge Road over the Claude Avenue
  ramp, whose end touches the bridge, so the check takes them for joined. Look at it in game.
- [ ] **Bored tunnels are left out of `rd`**, and the square's tunnel list builds them. Only 2
  edges are bored. Walk through one.
- [ ] **Bridge decks assume a 1.7 m pavement** (`deckHalf` in `world.ts`), but streets can now be
  written with no pavement (`pv` [0,0]). Check a bridge on a street with no pavement.
- [ ] **Bridge and levelling logic is ported from `prep_map.py` into `tools/structures.py`**, rule
  for rule and in the same order, because `prep_map.py` is a script that cannot be imported; the
  carrying, grade and kink rules are `tools/profiles.py`, copied unchanged from main and shared. The
  two can still drift: when main changes its bridge rules, change `solve` to match. Merge them into
  one once the partition build replaces the old one.
- [ ] **Towpaths keep their place.** `prep_map.py` moves a path that runs along the canal onto the
  middle of the towpath; the street graph has fitted ours already, so only the height is taken
  (level with the coping) and the points are exempt from dips and bridges. A towpath through one of
  the canal's tunnels is not given up to the tunnel's ledge as it is in `prep_map.py`.
- [ ] **Ways that cross at different heights with no bridge get one** (`prep_map.py` rule 2f). On
  the partition's street graph the survey's noise can put two ways a metre and a half apart where
  they cross at grade; look for a bridge standing over a crossing that has none on the ground.
- [ ] **The railway file path was wrong** in the partition writer (`tile_base`), so it never saw
  the railway. Check whether the old build has the same mistake anywhere.
- [ ] **8 roads still cross the railway with no bridge**, on service roads, Lower Stoke and the
  village file (`combe-down.json`). The partition writer doesn't produce that file yet: who writes
  the village in the partition build?

## Paths and gates

- [ ] **Footpaths are dropped wherever they run inside a drawn pavement band plus 1 m.** Check
  that no real path beside a street went with them.
- [ ] **Gates less than 0.3 m apart merge into one**, and a gate on a wall taken off the road is
  dropped. Check that no garden lost its only way in (`plot_unreachable`).
- [ ] **A gate stays only with wall within 0.3 m of both its ends.** A gate at the end of a wall
  is dropped, along with the stub beside it. Gate without a wall each side fell from 82 to 1. Check
  that gardens whose only gate was at a wall's end still have a way in.
- [ ] **A front path that crosses a wall partway along is dropped.** One that hits a side fence in
  its last 1.5 m is cut short instead. Front paths fell from 4,485 to 4,278. Check how many houses
  lost their front path.
- [ ] **Paths that cross a street are left alone**, even though `check_map` counts them as
  "footpath along a pavement" (476 against 470). Cutting them would break pedestrian routes. Teach
  the check to tell a crossing from a path running along the street.

## Gardens and plots

- [ ] **A registered parcel line just inside the street gives way to the street edge.** Gardens
  gained about 30,000 m² across the city, and about 2,200 m² went from gardens to open land on two
  squares. Look at a few by eye.
- [ ] **A plot corner too small to stand on is left to the square holding its house.** That's
  every point within `FRAG_RUN` of the square's edge. Make sure the rule hides no real garden with
  no way in.
- [ ] **Wall poking past another (1,266) is put down to the partition's own shapes** (forks that
  run nearly side by side, and rounding to 0.1 m), not the writer. A per-point guard in the writer
  made no difference. Check again once the garden fixes land.
- [ ] **Walls are cut off the drawn road strip, the railway, the canal and the water**, as the old
  build did, and bits left under 1.5 m on their own go. A hedge or fence lying along a lane's
  carriageway edge, within a few centimetres of the strip, is lost whole (about 100 m in all).
  A wall standing on a pavement, short of its back edge by 0.2 m, is cut too. "Walls doubled" went
  1,681 to 1,765 and "poking past" 1,266 to 1,320, because a cut wall counts once per piece. Look at a lane where a hedge ran beside it.

- [ ] **Walls standing in the road strip are put right after the tidy**, not only cut before it
  (`keep_clear_of`). Rounding to 0.1 m and the tidy's joins put walls back in the strip; a stretch
  inside it by more than 0.15 m and over 1 m long is cut out, and a shallower one is nudged 0.06 m
  clear. A run's two ends are left where they were so they still meet their neighbours. This took
  "wall in a corridor" from 5 to 0, but "poking" went 14 to 15 and "doubled" 36 to 38, from two
  short pairs of stubs the tidy leaves because each is under 2 m.

- [ ] **"Wall along a carriageway" now measures the road as flat-ended strips**, like rule 8 and
  the game's drawing. With round ends, a wall standing at the end of a dead-end street (0.2 to 0.3 m
  beyond it) counted as 7 m in the road (2 places, both cul-de-sacs). Look at one in the game: the
  wall should stand just past the end of the carriageway.

- [ ] **A short run lying wholly along another is dropped as a double** (`WHOLLY` in `tidy.py`),
  however short, unless it is within 0.3 m of a gate's end. Junctions where several boundaries meet
  left pairs of stubs of 0.5 to 2.6 m, each under the 2 m the tidy waited for. "Walls doubled"
  went 36 to 19 and "a metre apart" 83 to 77. What is left is stretches under 2 m alongside a long
  run, and a run folding along itself. Look at a junction of several garden boundaries for a gap.
- [ ] **A wall's height at a square's edge reads the grid clamped to its edge**, since rounding put
  points a few centimetres off the grid and the tidy then copied a neighbour's height ("off its
  ground" 3 to 0).

## Build

- [ ] **Pass 3 takes 269 s against 175 s before the street-front change**, for no known reason.
  The `once` folder is 692 MB.
- [ ] **`audit_doubled2.py`'s breakdown by "between" uses the midpoint of the whole line**, so the
  breakdown is unreliable. The totals are fine.

## Thin arms trade pokes for doubled walls

Giving a thin arm to a neighbour cuts 30% off "walls a metre apart" and "walls doubled" but adds
about 430 "wall poking past another" (1,266 to 1,699): the cut across an arm's mouth makes a short
edge with a junction at each end. Revisit by snapping the mouth's junction onto the nearest existing
node instead of cutting across.

## One boundary per fence, and the writer's tidy

- [ ] **Where two sources trace one fence, the weaker gives way, but only where the ground either
  side stays apart.** About half the doubles are narrow necks between two owners, not one fence
  drawn twice. A given-away stretch whose removal joins more than 2 m of one owner's ground to
  another is put back (`_merged_ground`). The 2 m is a guess. The step alone took doubles from 1,196
  to 846 city-wide.
- [ ] **The rest is the writer's last tidy (`tidy.py`), as the old build did it.** This is a
  clean-up step on top, against the "rule, not a clean-up" principle, and it was kept because the
  old build reached zero the same way. On six squares it took doubled 147 → 53, metre-apart
  124 → 66 and poking 166 → 1, and lost 0.4% of barrier length. Which run stays is set by the
  writer's rank: a real wall, then a front, then the longer.
- [ ] **Thin arms are still given to a neighbour** (`_absorb_thin_arms`), since it helped.
- [ ] **A hairline slit the re-cut leaves takes the owner of the ground it lies in.** Left open, it
  was drawn as a hedge out and back through a house.
- [ ] **A path's gap is slid along its fence to fit**, rather than dropped, when the path crosses
  near the fence's end.
- [ ] **Streets are narrower than the old build's in places, and paths are cut under rail
  bridges.** Both were noted in passing. Look at them in game.

## Gates

- [ ] **A gate goes in a front, never in the fence between neighbours when the house has a front.** A
  registered or lidar line with a garden beyond it touches the house, so as the nearest "front" it took
  the gate: 953 of 2,174 gates in Oldfield Park stood in a party fence, and their paths ran along it
  and were dropped. On three squares front paths went 388 → 2,311. One new "front path through a
  wall" at -1,2 (-2736, 1057) crosses a hedge and a fence together.

## Street furniture

- [ ] **Parked cars are placed afresh along the new streets, by carriageway width**: none under
  4.8 m, one kerb up to 7 m, both above. The city centre (-1,2) has 636 against the old map's 466,
  and suburbs far fewer (4,-2: 58 against 233). Look in game; `TWO_KERBS` is the knob.
- [ ] **Lamps, bins and trees are still copied from the old map and dropped where they clash**,
  not placed afresh.
- [ ] **Street items in the road go back on the nearest pavement; plants and items by a wall are
  nudged up to 1 m off it.** A plant may not be nudged onto a road, pavement, railway, canal or
  water. City-wide: trees 354,948 (old map 358,497), shrubs 560,328 (566,588), street items 29,182
  (32,099).
- [ ] **Front paths go from the gate to its own garden's house**, straight in where they meet it,
  and one hugging a fence or ending on one is left out: 14,054 against the old map's 18,737. Most
  of the rest are houses within a metre of their gate.
- [ ] **A street item anywhere inside the carriageway goes back on the pavement**, not just one
  past the kerb line, and no parked car is placed on a lamp, sign or bin.

## Drives

- [ ] **Drives follow the old build's rule, with a check for room**: about half the detached and
  semi-detached houses with a front over 9 m get one beside the gate, where the garden has at least
  5.5 m from the front to the house and the drive stays inside it. Terraces get none, so Oldfield
  Park has few (56 on -2,2). The old city squares had no drives at all; the old village had 1,233.
  Mapped driveways aren't used yet. `DRIVE_SHARE` is the knob.
- [ ] **A drive is a gap in the front wall with no gate in it**, as before, and about 60% of the
  drives over 6 m have a car on them.

## The village

- [ ] **Spencer's main now builds the village as nine ordinary squares**, so the writer does them
  like any other.
- [ ] **The new village has a few more wall clashes than the old one** (doubled 0 → 5, a metre
  apart 5 → 23, stubs 0 → 10, two walls standing in a road: a service lane at (-1817, 1299) and
  Prior Park Road at (-435, 1339)), about the rate of the rest of the city's partition build. It
  has far fewer buildings in the road (112 → 11 on a carriageway, 262 → 2 on a pavement).

## Spencer's main

- [ ] **One-way streets are carried over from the old build's roads** (`carry_one_way`): a new
  stretch takes the way of the old road it lies along. Check traffic on a one-way street in town.
- [x] **Wall styles follow Spencer's rules.** A lidar wall keeps the style `walls.py` gave it from
  its area and height (stone wall, low brick wall, high brick wall) and a mapped retaining wall
  stays one (`evidence_of`), where before all were flattened to "wall"; a front garden with nothing
  seen along it is rolled from `gardens.STYLE`'s mix for its area, once per 150 m along the street
  it faces (`street_rows`), so a row on both sides shares one style (`front_style`); keyed by 60 m
  squares of map at first, a terrace changed style halfway along. Low brick walls 4 km to 111 (his 103), stone walls 0 to 24
  (his 10), retaining walls 0 to 1.5 (his 1.3), low hedges 402 to 184 (his 142).
- [ ] **There's still about twice his length of front boundary** (garden walls 260 km against his
  90), because the partition draws every edge between a plot and a street, and **half his fences**
  (758 km against 1,578), because its plots are divided differently. Doubled walls went 39 to 45
  with the styles, the rest of the wall clashes down a little.

## Street faces

- [ ] **Carriageways and pavements are drawn from the partition's faces** (`sf`, `street_surfaces`,
  and `surfaceFaces` in `world.ts`), not as strips along each road; `?roads=strips` draws the old
  way. Paths, front paths and drives are faces too; only bridges are still strips.
- [ ] **Every point takes the ground height under the middle of its nearest street**, as the strips
  did. Where two streets of different heights meet, the faces between are stretched to join them.
- [ ] **The outlines are simplified by 5 cm**, together, so a square's file grows about 11% rather
  than 2.5 times.
- [x] **The kerb and stone faces round each piece are drawn once**, facing out: the writer runs every
  outline with its piece on the left (`sf.l`), and a square written before that still draws both ways.
- [x] **Where the ground is pulled down, the height you walk at and where grass grows now follow
  the faces** in a square that has them, not the strips. Trees, shrubs and street items are still
  placed against the strips (`drop_clashes`).
- [ ] **Paths, front paths and drives lie on the ground as it's drawn**, a hair above it, as their
  strips did, with a point every 3 m along their outlines (the ground grid is 4 m) so they can follow it. Where a path
  meets a pavement or carriageway it sits below it, and the kerb face covers the step.
- [ ] **Where a drive and a front path cross, the drive is drawn**, and both stop at the pavement's
  edge, so there is no dropped kerb.
- [ ] **Faces at a square's edge take their height from just inside the terrain grid**, which stops
  short of the edge by up to a cell.
- [ ] **The partition file now keeps each face's holes** (a roundabout's island, the gardens in a
  park). Before, a carriageway with an island was paved right over it, and the faces looked to
  overlap by 116,000 m2 in three squares.
- [ ] **The city's partitions were rebuilt from scratch for this, every pass** (`out/once-fresh`,
  `out/city-fresh`). A rebuild of pass 3 alone reused garden divisions from 18 October against
  streets fitted that day and doubled ten times as many walls (39 to 377); built together, the clash
  check matches the last map but for one more footbridge span sunk in the ground (5 to 6).
- [ ] **The map is 211 MB against 177 MB** before paths had faces (Spencer's is 154 MB): the paths'
  outlines carry a point every 3 m.
- [ ] **`tools/partition/watertight.py` measures what's left**: on three squares, gaps and overlaps
  0, street faces against the partition's 108 m2 either way (the 5 cm simplifying), 7 m2 drawn
  twice, 62 m2 of path left undrawn (slivers), and about 120 trees and 145 shrubs still standing on
  a street. Over the city: gaps and overlaps 0, 1,419 m2 missing and 1,390 extra, 22 drawn twice,
  1,133 of path undrawn, 1,540 trees and 879 shrubs on a street.
- [ ] **A "position is NaN" warning showed on two of four drives into town on the new map**, none on
  Spencer's map, and not on a run with every mesh checked, so it comes and goes: probably something
  that moves (traffic on the carried-over one-way streets?) rather than the scenery. Nothing wrong
  could be seen. `tools/fpsprobe.mjs --route` shows it.

## Plants on the paving

- [ ] **A tree or shrub on a street, pavement or path face is moved back off it**, up to 2.5 m, into
  the garden or verge behind, where that's clear; a plant nudged off a wall may not land on one
  either. Most were placed at the middle of a canopy seen from above, which hangs over the
  pavement from a garden. Trees on pavements 1,540 to 238, on paths 125 to 0; shrubs on either 914
  to 3.
- [ ] **A tree that can't be moved stays on the pavement as a street tree** (the 238). A shrub that
  can't, or a tree on a path, goes: 459 more trees and 371 more shrubs dropped across the city.

## From Dan's walk on 22 October

- [x] **Walls and hedges beside a street hung above the grass**, with daylight under them: the
  ground there is pulled down to tuck it under the street, and a wall's foot went only 0.4 m below
  the true ground. Its foot now reaches the ground as it's drawn (`barrierRun` in `world.ts`).
- [x] **A line of grass could grow along a seam in the road**: the grass mask filled all the street
  triangles as one shape, and two that overlapped a little with opposite windings cancelled out.
  Each is wound the same way now (`grass.ts`).
- [x] **Street faces share every corner along their edges** (`noded`), and a path's corner on a
  pavement's edge is its own point, at the ground, not the pavement's.
- [ ] **Short pieces of full-height hedge between terrace gates read as blocks** (2 m of hedge 1.3 m
  tall and 0.9 m thick, then a gate, then another). They're what the lidar saw, so they're kept; a
  low hedge or a narrower one would look better there.
- [ ] **A hedge with a gate in it sometimes runs back from the front, between two front gardens**
  (Combe Down, about (-1383, 1241)): an edge between a garden and a side passage taken as a front.


## Walls doubled and stubs (22 October, evening)

- [ ] **A run that turns back along itself is cut at the turn** (`tidy._unfolded`) so the tidy can
  undouble its halves: walls doubled 43 to 36, a metre apart 88 to 82. The 36 left are 2 to 3 m
  overlaps; look at a few in game before chasing them.
- [ ] **A short run on a square's edge with nothing next door goes** (`drop_edge_stubs`, once the
  whole city is written): 51 of them. The check now takes a stub on the edge as held when the next
  square's wall carries on from it, so "wall stub on its own" is 0.
- [ ] **A wall's repeated points are dropped as it's drawn** (`world.ts` `barrierRun`): a point on top
  of the one before left the run's end open, which showed as a thin flap of hedge.
- [x] **Doubled walls and pokes tidied further** (walls doubled 19 to 0, poking past another 15 to 0, walls a metre apart 77 to 5):
  - A stretch is measured from both runs' sides (the check counts from whichever comes first), so a
    short run along the middle of a longer one with 1.9 m of one and 2.4 m of the other now goes.
  - A run meeting another at a shallow angle is stopped where it comes within 0.6 m and steps across
    square (`_square_off_wedges`). Sliding its end across instead lay it along the other for 2 m.
    The step is a short kink in the line, which reads as a corner where hedge meets wall.
  - A sliver between two cuts is measured before its ends are joined, so it can no longer grow into
    a hairpin.
  - Trimmed ends are trimmed again after the 0.1 m rounding, up to three times.
  - A gate standing just short of a junction slides along its wall, away from it, until the stub of
    wall past the gate is long enough (`clear_gates_of_junctions`). With no straight wall to slide on,
    the run that meets the wall is brought to the gate's edge instead, which moves its end by up to a
    metre.
  - Trade-off: measuring both ways removes more of the shorter run, so "walls a metre apart" fell
    from 77 to 5 and some short garden walls beside a longer fence are gone where both stood before.
- [x] **Canal footbridges keep their headroom.** The step that brings a footbridge over a stream
  down to its banks now leaves one over the canal alone: "road through the canal" 4 to 0.

## Things on Spencer's main that the partition build lacked (23 October)

Six spots compared square by square against main's tiles.

- [x] **Mapped hedges, fences and walls across open land were never drawn.** The partition draws a
  boundary only between two faces it divided, and a hedge across a field divides nothing. Of the
  mapped barrier length near Newbridge only 54% of hedge and 41% of wall was drawn, against 98% and
  100% on main. `measured_in_open` now carries main's barrier (mapped or lidar) over wherever it lies
  in open land, 1.5 m clear of anything drawn, roads, water and buildings, and joins it to the tidy so
  it is trimmed where it meets other walls. Hedge coverage 54% to 98%, wall 41% to 99%, fence 37% to
  53% (the rest of the fences stand inside gardens, where the partition draws its own boundary).
  - Trade-off: it reads main's `br` from the `--base` tile, so the writer needs one. A stretch under
    5 m is left out: 3 m let one doubled pair back in ("walls a metre apart" 5 to 6).
  - Fixes Newbridge (the hedge across the field) and the hedge at the Lower Weston corner.
- [x] **Streets closed to motor vehicles were ordinary streets.** The street graph comes from OSM
  tags; main reads Overture's access restrictions and makes the street `pedestrian`. Upper Borough
  Walls, Argyle Street and the other 223 or so pedestrian records in Bath centre came out as
  streets with kerbs and tarmac (Pulteney Bridge: tarmac and a kerb where main has cobbles to the
  shopfront). `carry_pedestrian` takes the class from main's pedestrian street the new one lies along
  (70% within 3 m), puts its whole width into `w` with no pavements, and `street_surfaces` paves the
  carriageway under it as pavement so there is no kerb between the two.
  - Trade-off: the width is the partition's (Argyle Street 8.8 m, main's 15 m measured wall to wall),
    so the paving stops at the plot fronts. Footways mapped along the street were already dropped as
    lying along a pavement band and stay dropped.
  - A shopfront on a pedestrian street still gets the partition's guessed front wall and gate (Gaff
    at Pulteney Bridge). The old build kept boundaries out of paved squares and pedestrian streets.
- [ ] **A back lane gets a front boundary the whole way along** (Oldfield, -2540, 1370). Main draws
  a wall there only where the lidar saw one; the partition draws every plot's edge against a
  corridor, so a 1.1 m wall stands along a service lane and hides the tarmac from eye height. Its
  material is also wrong: a registered boundary counts as support, so one 7 m lidar wall in the
  stretch made the whole 55 m `stone_wall` instead of the zone's `garden_wall`. Look at back lanes
  before changing the rule; a front that is only parcel-backed could be drawn low or not at all.
- [ ] **A track edge with a plot beside it gets a fence** (Newbridge). Same rule, same trade-off.
- [ ] **Monkton Combe's stream is there but hidden.** `wl` is identical to main's, and from the air
  the blue ribbon shows. At eye height the road's retaining face (the street surfaces' `e` outlines,
  from a road cut into a slope, 3.6 m above the stream) hides it. This is the street-faces rendering,
  not the map data: main drew the road as a strip with a grass bank.
- [ ] **Argyle Street alley (-844, 2315).** Main has an alley running on to a shopfront; ours has the
  footways along Argyle Street dropped (they ran along the pavement band, and now a pedestrian
  street). The plain stone face at the start of the shot is the next building along; not chased.
- [ ] **A tree at the Lower Weston corner (-3365, 2545) is dropped.** Main has it, ours does not;
  it is one of the 2,037 trees `drop_clashes` removes where the new layout contradicts the old
  decoration. Not traced to a single rule.

## Front paths (23 October)

- [x] **Front paths went to the wrong house, or were clipped away**: a gate stood on the plot edge
  nearest its house, often a side boundary, and the path was clipped to the plot behind it. Paths now
  run from each gate and each open front to the nearest of three doors that can be reached, and a door
  with no gate to reach gets one on the side it faces (`gates_for_doors`): 16.9k paths to 17.6k, main has 18.7k.
- [ ] **Doors within 1.6 m of a second boundary get no gate of their own**, so a fence is not split
  from its double ("walls a metre apart"). This leaves about 1.1k fewer paths than without the rule.

- [ ] **Bridge headroom is 13 against main's 1, on Spencer's latest squares.** The cycleway over the
  trunk link near 2_5 (A4 east of Bath), a trunk over a footway and a service over a footway at -5_6
  have 0.4 to 2.8 m of headroom. The old base had 12, so the merges did not cause it, but main's
  road smoothing has fixed what ours has not. Check whether the partition's road levelling drops
  the upper deck.

## Review fixes to the writer (23 October)

- [ ] **Mapped hedges and walls in open land are no longer kept from the old tile.** `measured_in_open`
  used to be handed the whole old `br`, which includes the old build's guessed garden fences, and
  ranked them as real walls. The old rows do not say where they came from; only the lidar ones carry
  a height `h` (mapped and guessed rows carry none), so only those are passed. Mapped barriers in
  open land that no face drawn now covers are therefore lost until the writer reads the mapped
  barriers from the infrastructure layer as the partition does.
- [ ] **Road markings are filtered, not rebuilt.** The markings are the old build's, laid along its own
  streets, and rebuilding them needs the whole street-furniture pass (the infrastructure layer, the
  gates and the road widths). Instead a marking is kept only if both ends lie on a new carriageway
  (0.2 m of slack), so a street that moved loses its markings and does not get new ones.
- [ ] **A front path whose gate has gone** starts at the nearest final gate within 2 m. With none, it is
  kept (at the old place) only if no wall stands there, and dropped otherwise.
- [ ] **Drives are placed after the doors' gates**, so a drive no longer stands beside a gate that was
  taken out; this can leave a house with a different drive from before.

- [ ] **Bridge headroom is 5 against main's 1** (was 13), road too steep 174 (270; main 199), road
  kinked 15 (29; main 14). `structures.py` now runs main's current rules (see "Bridge and levelling
  logic is ported" above). Left: four paths dipped under a road bridge, 1.9 to 2.8 m of the 2.8 m
  they need, and a footway over a trunk road at 2_5 (3.2 of 4.5 m). A dip under a bridge is held
  to the tile's ground for streets (the base tiles' ground was cut for main's roads, so a dip our
  rules add but main's lack cannot be dug), which is what caps these. Dipping streets below the
  ground raised "road off its ground" to 171 (main 40), so only paths keep their dip.
- [ ] **A bridge's deck is no longer run out over a street the path crosses** (`grow_marks`
  `forbid`). The deck was grown to where the path meets the ground, and the ground is cut for a street
  under it, so a path whose bridge mark stopped a few metres short of the street got a deck a metre or
  two over the street with no headroom. It now crosses at the street's level, as a pedestrian crossing.
  "Path not drawn" in `watertight.py` rose by 23 m2 to 1,157. Look at the cycleway over the A4 slip
  road at 2_5 (630, 3976).
- [ ] **A deck carried over a rise in the ground is raised to 0.25 m under the ground** instead of
  sinking into it (`_profiled`). Without it "span sunk in the ground" went from 2 to 4.

## Speed (23 October)

- [ ] **Per-square setup slices still reach 55 to 65 ms** (squares 1,3 and 0,3, phase "landmarks" in
  `map.ts`), and "landmarks-tunnels" 42 to 47 ms in the build. Spencer's main shows the same
  (59 to 62 ms setup, 41 ms build), so they are not the partition's. The 90 ms "roads" slice from the
  earlier route could not be reproduced in four runs; the first buildings after it now yield by the
  clock (6 ms) instead of every eight buildings, in case a run of big town buildings was the cause.
- [x] **The writer was 21 minutes, mostly in `tidy.py` and the fit of streets to their faces**: every
  wall end looked at every gate with a new point each time, the gate passes rebuilt their index for
  every gate, and each ray across a street was cut against the whole square's street surface. Now
  about 8 minutes on a busy machine (user CPU 6,860 s to 2,320 s), with byte-identical squares.
## From the aerial comparison with main (23 October)

- [x] **A grey slab in the centre, round Orange Grove.** The partition reads OpenStreetMap, where the
  unnamed edges of a plaza are `highway=pedestrian`; Overture, and so main, calls them footways. Each
  became a pedestrian street with a 4 m way and 2 m pavements, paved wall to wall, so a park island
  was ringed and filled with paving. A `pedestrian` record that lies along none of main's now becomes
  a footway (`demote_pedestrian`), and the carriageway and pavement faces its corridor cut are left
  out of the surfaces, so the ground shows. Trade-off: the faces are still in the partition (the
  watertight check is unchanged); only the drawn surface leaves them out. An OSM pedestrian street
  that Overture does not mark as closed to traffic is now a footway everywhere, so a real pedestrian
  street main lacks loses its wall-to-wall paving. The proper fix is to read the class in pass 1.
- [x] **Gardens outlined in hedge.** Every unmapped boundary between a garden and open land was drawn
  as a hedge (`kind = ek or "hedge"` in `classify_edges`), and the registered parcels made most of a
  suburb's boundaries that kind: 33k m of parcel hedge to 47k m of parcel fence on four suburban
  squares. Main rolls a fence (nine in ten) or a hedge once per back yard. The writer now rolls the
  same share per garden (`reroll_back_styles`) for parcel and inferred boundaries; a hedge a map or the
  lidar shows is kept. Trade-off: the roll is per garden, not per back yard, so neighbours can differ.
  Rolling it in `classify_edges` would be cleaner but needs the city passes rebuilt.
- [x] **Field paths and tracks main has.** The partition's streets come from `osm-roads`, and Overture
  maps some paths, tracks and drives OpenStreetMap does not (about 24 km of footway, a few km of
  track). A stretch of main's path, track, bridleway or cycleway further than 4 m from anything
  written is kept as it was (`carry_missing_paths`), before walls are laid so gates open for it, and
  not where a pavement already runs. `check_map` "footpath along a pavement" is 486 against the
  baseline's 482: four paths from this and the plaza change, in squares 0_3 and 3_2, are left.
- [ ] **Overture roads the partition does not read.** About 6 km of main's `unknown`-class roads
  (short service links and drives), 1.4 km of `unclassified` and 0.9 km of `primary` at the map's
  edge are in no OSM way. They are small and were not carried: a vehicle road needs corridor faces,
  or the game draws nothing for it. To keep them, add Overture road segments far from any OSM way to
  `roads` in `__main__.py` and rebuild pass 1 onwards. The estate in square -2,2 has none of them
  missing: its roads match main's.
- [ ] **`join_evidence` takes a turn of up to 170 degrees as straight.** `cos_tol` is
  `cos(180 - ang_tol)`, so the test is `dot > -cos(ang_tol)`; it should be `> cos(ang_tol)`. It bends
  evidence lines round corners. It does not explain -7_2, whose boundaries equal main's within 2%.

- [ ] **A demoted plaza edge stays paved unless the ground there is green.** `demote_pedestrian`
  makes the record a footway; its corridor's carriageway faces become pavement, and only the part on
  a park, garden, grass or flowerbed polygon (`land_use`), or on the ground grid's pitch, wood, field,
  cemetery or playground patches, is left to the ground. A plaza's edge is kept as a pedestrian street
  if main has one within 15 m (main draws a wide street on its middle line). Watertight's `street
  missing` fell from 46,969 to 11,584 m2 (1_3 4,561: the Orange Grove islands and gardens; 0_3 2,058).
  The old figure was 1,427. The Orange Grove island is only found green by the land-use data where a
  polygon covers it; check it is still ground in the game.
- [ ] **Union Street has a 66 m2 grass patch** on its east side: an `open` face in the partition (a
  courtyard between buildings, the street's 8 m against main's 10 to 17 m). It is not a demoted face.
- [x] **A ring of garden wall and a fence in Abbey Churchyard**: the partition made a garden of a
  plaza building. A wall, fence or hedge wholly on paving that main has none beside is left out
  (`drop_walls_on_paving`).
## Layout review fixes (23 October)

- [x] **Evidence runs joined the wrong way round** (`join_evidence`): the angle test used
  `cos(180 - tol)`, so a run was appended whatever its direction short of a reversal, and a truly
  collinear run in front was never joined. Both ends now ask for a bearing within the tolerance.
  Expect more, longer joined lines, and fewer bent ones; a joined line still only matters if it
  closes a face.
- [x] **A pavement that thins to nothing was lost whole.** `buffer(0)` of the offset gives two
  polygons and the writer wrote nothing for anything but one. `_poly_json` now writes a list of
  polygons, which `_poly_from` reads back as a MultiPolygon.
- [x] **The nearer house in a gap** compared two distances that are equal by construction. It is now
  the house whose wall reaches nearer the middle of the gap, and the lower index on a tie.
- [x] **`_drop_dangling`** dropped any piece with an end within a metre of a dangling point. Only the
  piece that owns the dangling end goes now, and a front with nothing to draw (`none`) no longer
  counts as drawn, so it cannot hold a neighbour's end up.
- [x] **A split ring keeps all its parts.** Pieces, parents and plots that repair to several polygons
  are written as several rows (so row numbers, which are the pieces' ids, stay in step with the
  pieces), repaired with `make_valid` since `buffer(0)` also loses a lobe of a bow-tie.
- [x] **Reruns replace their output.** Pass 1 clears `corridors.json` and `held-out.json`, pass 2
  clears `blocks.json`, before writing. The never-shrink guard stays for a lone task called by hand.
- [x] **Parcel choice** is the smallest containing parcel (ties by centroid), not STRtree order.
- [x] **Building cleaning** makes snapped shapes valid, and only kept footprints give way to later
  ones. A footprint dropped for being too small no longer takes ground from its neighbour.
- [x] **A collection's real envelope** is used for the window test (it used to be a stand-in at 0,0).
- [x] **Parcels in the pack.** Already in `OTHER` on this branch (4.4 MB, OGL v3 with the two
  required attributions in `data/combe-down/README.md`); the passes now also run, without parcels,
  if the file is missing.
- [x] **`--raw` after `terrain`**: the terrain folder now follows `--raw`.
- [x] **A bad `lanes` tag** no longer hides a good `width` tag.
- Trade-off: `make_valid` can return a lobe the old `buffer(0)` dropped, so a rare piece now
  produces one more row than before. Row ids are reassigned consistently within a run, but a
  `once` folder from before this change is not interchangeable with one from after it.
- Not unit tested: the front edge with kind `none` no longer counted as drawn (it sits inside the
  whole `classify_edges`); it shows up as the city metrics' loose-end count.
- Rebuild after the layout fixes (131 squares, 0 failed): gap 0, overlap 0, loose ends 0, neighbours
  worst mismatch 0.0 m. Pavements read back 30,214 against 29,239 faces (the ones that thinned to
  nothing partway), plots 47,759 against 47,912 (median 85.1 m2 against 85.2, compactness 0.5134
  against 0.5126). `check_map` against the merge baseline (with that baseline's rail and canal
  files): footpath along a pavement 482 to 486, footpath along a carriageway 5 to 6, walls doubled
  0 to 1 (2_2, 1050,1694), walls a metre apart 5 to 4, too steep 270 to 268, headroom 13 to 12.
- [ ] **Walls doubled at 2_2 (1050, 1694)**: one new brick_wall_low on brick_wall_low, 2 m. Not chased.

## Boundaries against main, side by side (23 October)

- [ ] **Front walls along shop streets and buildings on the pavement.** Every building had a plot and
  every plot a front; a front with nothing seen along it took the zone's style, and the zones without
  a mix of their own (`bath`, `victorian`) were all garden wall, so Stall Street and Union Street had
  low walls down both sides. The writer now settles the guesses (`settle.py`): a front stands only for
  a house (detached, semi or terrace, as `gardens.HOUSES`), not in the `bath` zone, not on a building
  with a shop sign, and not where the house is within 1.5 m of its front line; a front the lidar or a
  map backs over 40% of its length always stands. `victorian` and `riverside` fronts are rolled from
  the suburb's mix, once per row along a street, as main rolls them. Trade-off: Georgian fronts keep
  their railings (the Royal Crescent's are real); a house in the `bath` zone with a real front garden
  loses its guessed wall. These rules belong in `classify_edges` when the plots are next rebuilt.
- [ ] **Fences down country lanes.** A lane's edge against open land was drawn whole wherever the
  evidence covered 40% of it (Tadwick Lane: 840 m of fence on the strength of the lidar's runs). It
  is now drawn only where a mapped barrier or a lidar run lies within 1.5 m, and a fence there is a
  hedge. Trade-off: a field fence the lidar really saw along a lane is drawn as a hedge; one mapped as a fence stays a fence.
- [ ] **Plot boundaries running across fields.** Division lines run to a block's far side, and where a
  hamlet has no streets through it the plots came out as long wedges across each other and the
  fields. A guessed boundary (parcel or inferred) now stands only within 40 m (parcel) or 20 m (a
  line only a rule drew, as deep as main's gardens) of every house it bounds, unless a mapped or lidar
  barrier stands along it; a plot of a building that isn't a house has no guessed boundary of its own.
  A boundary between two plots that runs off a house's garden ends where the garden does, so some
  plots are left open at the back, and a guessed stretch then meeting nothing at either end goes. In
  the centre (`bath` zone) a guessed yard boundary within 3 m of a street goes too (Stall Street's
  fence). The hamlet at -410,-3060 is better but still shows short fence runs between the chalets:
  its plots are wedges, and only re-dividing it fixes that. Trade-off: the cut is made on the drawn line, not on the plots,
  which keep their shapes; capping the plots in `make_plots` (and stopping a plot at farmland) is the
  real fix and needs the plots rebuilt.
- [ ] **Paving in squares and pedestrian streets lies on the ground.** The game stands a pavement face
  a kerb above the ground it pulls down round it, so every strip of pavement face across a plaza
  (Abbey Churchyard, Stall Street) was a ledge. Pavement more than 1.5 m beyond any kerbed street's
  pavement, and a pedestrian street's carriageway, are now written as `drive` faces, which the game
  lays on the ground with no kerb. Trade-off: they take the drive's colour, a shade darker than a
  pavement's; a kind of their own would need the game changed. A `living_street` is now flush too (it was kept
  kerbed at first), and a carriageway face more than 1.5 m beyond every vehicle street's pavement (a
  square the partition laid as road) is paving: on 0,3 and 1,3 flush went 0.910 to 0.938 in areas and
  0.922 to 0.948 along pedestrian streets. Trade-off: cars on a living street drive on drive-coloured
  paving. Where a vehicle street runs through a mapped square (Trinity Street) its kerbs stay.
- [ ] **A bridge's pavements are made equal**, because the game stands both parapets at the wider
  pavement's edge and a narrower one left a slot to the river (Midland Bridge Road). A narrow side is
  drawn up to 0.5 m wider than its face. A side with no pavement, or a bridge with buildings on its
  deck, is left alone (a path often has its own deck there; Pulteney Bridge has its shops).
- [ ] **A street over the canal's tunnel is not a bridge.** Pass 1 marked Sydney Road a span over the
  canal where the canal runs in its tunnel, and the deck cut out of the faces left a gap in the
  pavement, a dark slot down to the ground beside the wall. The writer clears a span whose only
  crossing is the canal's tunnel (nothing else on the ground under it). Fix it in
  `structures.py` when pass 1 is next rebuilt.
- [ ] **Mapped walls and hedges in open land stand again.** The writer took only main's lidar runs
  (those with a height) as the measured barriers to stand in open land, so a mapped field hedge or
  wall that the partition never drew was lost (the fields of -5,6). The mapped ones now come from the
  map itself and stand there too. Trade-off: a mapped fence across a field is drawn as a fence.

## Ideas from the research, tried and scored (23 October)

Each was tried quickly behind a flag on its own branch and judged by shots and by
`tools/scoreboard.py` (branch `claude/scoreboard`), so nobody needs to try them again blind.

- **Wall, hedge or fence from the lidar's shape** (1 m grids, then the 2019 point cloud): no. Only
  the width of the raised strip separates them (hedges about 3 m, walls and fences about 2 m);
  height, roughness, return counts and the survey's vegetation classes look the same for all three,
  because Bath's walls mostly stand beside greenery. Every Bath survey is winter, so there is no
  leaf-on survey to difference against.
- **Is anything standing along a guessed boundary** (the UKCEH hedgerow test, tightened to 3 to 5 m):
  yes for walls and hedges. A third to a half of our guessed walls have nothing near them, against
  a tenth of real ones. Not for fences: a third of real fences show nothing either.
- **Footprints shifted onto the lidar** (the nDSM, then the point cloud's building class with
  neighbours agreeing): no. The best shifts are noise; buildings on the street come from how
  streets are fitted, not from misplaced outlines.
- **The lidar's own position**: `tools/lidar.py` converts with rasterio, whose PROJ data lacks the
  OSTN15 grid, so every lidar sample is read about 0.4 m south of where it should be. Fixed on
  `claude/lidar-ostn15` (off main); clash counts unchanged.
- **Street widths measured from the lidar or the intensity raster**: no. Both are worse than the
  class defaults against tagged widths (the first rise is often a garden wall; intensity finds the
  edge of the paving, drives and forecourts included, not the kerb).
- **Service lanes from Overture against OSM**: no. They are almost the same network, and both builds
  keep 99.8 % of OSM's road length.
- **3D BAG heights** (p70 block, p5 ground): no; worse fit than main's heights, worst on flat roofs.
- **Bridge headroom from the point cloud**: too noisy to replace the builds' numbers; it did find
  bridges with the ground filled up to the deck (9 in ours, 7 in main) and a few big misses (Two
  Tunnels Greenway, Warminster Road, London Road junction, Beckford Road).
- **Retaining walls from steps in the ground**: no; the steps are mostly cuttings, quarries and banks.
- **Fallback plots bounded behind the house** (for the hamlet at -410,-3060): no. The hamlet's houses
  are in field-sized parcels, the branch's own changes already removed most of the wedges, and the
  bounded plots come out bare because `settle.py` drops guessed boundaries over 20 m from a house.
- **Listed railings** (Historic England): correct but hardly visible; 140 listed frontages get
  railings in the centre. Worth it only if railings are drawn more boldly.
- **Trees thinned and filled from the EA vegetation model**: no; two points of coverage, three more
  trees on walls.
- **Microsoft footprints**: no; whole terraces as single shapes, 1 to 3 m off in places.
- **Roofs** (main's tools): a footprint filling under 0.68 of its rectangle got a flat cap, which is
  why St Stephen's had no roof. Dropping that gate gives about 1,700 buildings a pitched roof
  (`claude/roofs`, off main). Oversized and undersized roofs remain.
- **Mapped walls, fences and hedges, and kerbs on pedestrian ground**: the scoreboard first read 22 %
  of mapped barriers drawn, but that was a stale written map; at the branch head it was 89 %. Barriers
  mapped as areas, mapped barriers outside open land, and mapped fences turned to hedges were then
  fixed (below), and ours scores 97 % against main's 93 %, with 94 % of pedestrian streets flush
  against main's 82 %.

- [ ] **Every mapped wall, fence and hedge the partition didn't draw stands**, not just those in
  open land: one along a footpath, round a park, through a garden the plots divided elsewhere, or in a
  square the partition paved. Those mapped as areas (a hedge round a field, a fence round a park) were
  never read at all, and are now read by their outline, as main does. They stand wherever nothing
  drawn is within 1.5 m, off the roads, the railway, the water and the houses, with a gap where a path
  crosses them. On seven squares, held-out mapped length within 2 m went 0.772 to 0.926 (main 0.902).
  Trade-offs: the partition's plots were divided without the area barriers (`once.py` still reads
  lines only), so a guessed fence can stand 1.5 to 5 m beside a mapped one until the plots are
  rebuilt; a mapped barrier running along a path's middle is kept, and the path drawn beside it.

- [ ] **Guessed boundaries take a mapped barrier's kind, and unsupported guessed walls and hedges go**
  (`settle.py`, `standing.py`). Most of the precision lost to main was a guess lying on a mapped
  barrier while keeping its own kind (a back fence rerolled from a hedge on the line of a mapped hedge
  or wall, a front wall on a mapped fence). Now a guess takes the mapped kind wholly where the barrier
  runs over half of it, and on the stretches it runs along (3 m or more) where it doesn't
  (`restyle`, which `walls_and_gates` draws as separate runs). Then a guessed front or rule-drawn wall
  or hedge loses the stretches with nothing standing within 4 m in the lidar (0.5 m and up, less
  buildings and specks), nor a mapped or lidar barrier. 3, 4 and 5 m scored the same within noise
  on 20 squares; 3 m took out 14.7 km there, 4 m 9.8 km, 5 m 6.2 km. Parcel edges are left alone
  (a registered edge is evidence), which also left the scores as they were. Trade-offs: the edge is
  relabelled stretch by stretch, so a stretch shorter than 3 m beside a mapped barrier keeps the guess;
  plot edges drawn on a parcel edge lost 0.004 of recall (front walls on parcel lines with nothing
  standing go); the nDSM is cached under `data/raw/.../lidar/ndsm/`, and a square without the lidar
  keeps every guess.
- [ ] **Listed railings and walls are on** (`tools/listed.py`, `data/combe-down/listed.geojson.xz`,
  650 points). A guessed front whose house is within 4 m of a listed entry naming railings takes
  railings, or a stone wall for one naming walls, and stands even where the centre's rule takes
  fronts away (no garden, on the pavement, a shop): the Georgian areas' railings. A mapped barrier
  along it still wins, except a mapped fence, which stays railings. About 1.2 km more railings in
  0,3 and 1 km in 0,4; st-crescent and the terraces at -1669,2175 show them at the back of the
  pavement. Boundary scores held: the scoreboard counts `railing` as no kind, so a fence front
  turned to railings beside an OSM fence (`fence_type=railings`) reads as a lost fence (0,4 fence
  recall 0.911 to 0.903). Counting railings as fences in the scoreboard would be fairer. The points
  say which house, not where the line runs, so a corner house gets them on both fronts.
- Scores after both, full write against main: wall / fence / hedge recall 0.951 / 0.918 / 0.991
  (before 0.924 / 0.908 / 0.979, main 0.900 / 0.886 / 0.960); precision 0.970 / 0.951 / 0.987
  (before 0.931 / 0.924 / 0.978, main 0.969 / 0.945 / 0.986); presence 0.967 unchanged. No check_map
  count moved.

## Spencer's main merged in (23 October)

- [ ] **Main merged at 6235fe9** (83 commits): the roof gate, OSTN15 for the lidar, and trees and
  lone fence stubs kept off fences. The writer starts from main's tiles (`--base`), so it takes main's
  roofs, trees and measured barriers as they are. Two copies of that logic were brought in line: the
  parcels are reprojected through OSTN15 (`tools/parcels.py`), and the writer's lone stubs go again
  until none is left, as main's do.
- [x] **The parcels were already on OSTN15.** Rebuilding `parcels.geojson` from the INSPIRE download
  with the new `tools/parcels.py` gives the same coordinates as the raw file and the pack, to the
  seventh decimal place, so pass 2 was not rerun. The scoreboard reads the same lon/lat file and
  puts it in map metres as the build does, with no grid step, so its truth needs no change. The fall
  in "plot edges drawn on a parcel edge" (0.74 to 0.704) came with recall falling too (0.469 to
  0.412): fewer plot edges drawn, not edges drawn in the wrong place. Look at what the merge and the
  mapped-barrier change took out.
- [x] **The towpath keeps the canal's level** (`structures.py` writes which points are the towpath,
  `tow`, and the writer holds them there instead of laying them on the ground), and **a path through
  one of the canal's tunnels is left out** there (`gone`), as main leaves it to the tunnel's ledge.
  Towpaths are still not moved onto the towpath's middle, as main moves them. Trade-off: the
  scoreboard's road network counts the two Sydney Gardens tunnel stretches as missing (footway
  missing 0.58 to 0.63 km, cycleway 1.000 to 0.999, main's figure); a towpath point next to a
  bridge's first point is let down to the ground so the deck end meets it. A street whose span
  over a canal tunnel is taken out (`no_span_over_tunnels`) now comes down to the ground instead of
  staying at its deck's height (Beckford Road).
- [x] **A canal bridge clears the towpath by a walker's height** (2.8 m over the towpath, `least`
  out to `TOW_REACH` from the water), not only the boat over the water. Main's rule gives it 2.8 m at
  the water's edge only, which is how main's Mill Lane has 2.6 m over the towpath.
- [x] **Midland Road's deck stops at its bank**: with its approach kept at its profile and the
  ground laid to it (below), the deck no longer runs on over the cycleway joining it, and the one
  "bridge without headroom" left is gone (1 to 0; main has one, at Mill Lane).
- [x] **Bridge decks fit our streets** (`dk`, written by `deck_reach`): the street's own width and
  its wider pavement, or out to a path riding the deck beside it if that reaches further. The game
  takes `dk` where the map gives it and main's rule (at least a default street's width) otherwise, so
  main's tiles build as before.
- [x] **The writer lays the tile's ground to our own streets and paths at their bridges**
  (`lay_ground`, run once the streets are final and before anything is stood on the ground), by
  `prep_map.py`'s rules: its flatten (nearest way wins, a carriageway beats another's easing), its
  protection of the ground under a span (and the hump there cut 0.6 m under the deck) lifted along
  every way at grade, and its blend. It replaces `cut_under_bridges`. What it lays:
  - **A street's approach to its own bridge** keeps its profile instead of being held within 0.4 m
    of the base tile's ground (`_approaches`), out from the deck's end until the profile comes back
    to the ground (at most 9 points), and the ground is laid to it, so the deck's end meets the
    ground rather than running on over ground main dipped for its own approach. An approach is let
    go (held to the ground as before) where it would have to stop short with a step steeper than
    0.15 (a junction whose other ways stay on the ground, a street it crosses at an angle, the
    edge of the grid), or is a single point; and one the ground could not follow (beside another
    street's carriageway: a dual carriageway at 4_5) is brought back within 0.4 m of the ground.
  - **A path dipped under a bridge** (its profile's dip, or a path carried from the base tile that
    passes under a span and lies buried within 40 m of it) has its ground dug to it, as wide as a
    street's verge, so the ground it reads between the 4 m grid's points is the cutting's floor.
  - The ground under a **street at grade** stays as the base tile laid it, its carriageway beating
    any cutting beside it, and the same under the railway on the ground. A street's span runs on
    (by up to 3 points) over ground the cutting took away from under it, as `prep_map.py` runs its
    spans on after its flatten; a street's end shared with another record's span start rides on
    that deck (flag 2) where its ground was dug. The towpath keeps the canal's level and is not
    dug for. The grid's outer ring and the ground inside buildings are left alone.
  - What the base tile stood on the ground (street items, trees, shrubs, doors, signs, landmarks,
    bay windows, road markings, and wires with their poles) moves with it, and a path on the ground
    goes up and down with it.

  Trade-offs: streets at grade are not flattened as main flattens its own (they stay held within
  0.4 m of the base tile's ground, as before): laying every carriageway put two streets a metre
  apart at different heights (Bailbrook Lane's service road) on one ground, and moved the ground
  under everything near every street for no gain. Cuttings are only as wide as the path plus 2.5 m
  each side and stop at a street's carriageway, so at a very short bridge the cutting meets the
  abutment in a steep face. Left (`check_map`'s crossings, and a diagnostic of every path crossing
  under a span: 12 of 34 with no open gap before, 3 of 30 after): the cycleway under Stanier Road
  (2.0 m of headroom: its profile dips it too little) and the footway under Warminster Road (no dip
  in its profile at all, 1.7 m) are `structures.py`'s, not the ground's; the cycleway under Ferry
  Lane still lies 0.7 m in the ground (not looked into).
- After these fixes (full write, `check_map` against a7a5c17): towpath off the canal's level 466 to 2,
  way through a canal tunnel 39 to 0, bridge without headroom 4 to 1 (main 1), span sunk in the
  ground 2 to 1, road too steep 178 to 177, footpath along a pavement 486 to 484; nothing went up.
  The scoreboard is unchanged but for the road network above.
- After laying the ground to our streets and paths (full write, `check_map` against those numbers):
  bridge without headroom 1 to 0, bridge over nothing 1 to 0; nothing went up. (Footpath along a
  pavement 484 to 415 and along a carriageway 6 to 0 came with the merged furniture fix, not this.)
- Scores after the merge, against main rebuilt the same day: barriers drawn 0.967 (main 0.930),
  street width MAE 0.71 m (0.93), pavements 0.933 (0.881), plot edges drawn on a parcel edge within
  1 m 0.704 (0.347; 0.74 before the merge), flush 0.940 (0.816), building on a carriageway 124 (640),
  on a pavement 35 (1,326).

## Street furniture and pedestrian paving (23 October)

- [ ] **Street items are checked against the road the game draws** (`sf`'s road and service
  triangles), not the partition's carriageway faces, which also cover pedestrian streets. On 0,3 59
  of the 60 benches lost stood on a pedestrian street (Stall Street, Union Street); benches within 3 m
  of a mapped one went 0.841 to 0.931 (main 0.935). Trade-off: a tree on a pedestrian street now stays
  as a street tree rather than going.
- [ ] **A pedestrian street is paved to its buildings**: the partition fits its corridor narrower
  than the gap between the buildings and gives the rest to plots and open ground. A plot or open face
  fronting the street, wholly within 9 m of its line and not walled, fenced or hedged off, is paved
  whole; open ground reaching further back is paved to 6 m of the line. Pedestrian street paved went
  0.750 to 0.901 (main 0.932). Trade-offs: walled front gardens on Miles's Buildings and plots reaching
  back more than 9 m (Chandos Buildings) are left as ground, where main's 15 m strips paved them; the
  9 m and 6 m are judged, not measured, and plants on the new paving are not moved off it.
- [ ] **A path lying wholly on a street's carriageway and pavements is that street** (90 % of its
  length within them and a metre beyond): stubs at corners and crossings from one pavement to the
  other. check_map's "footpath along a pavement" went 486 to 417 (main 458), "along a carriageway" 6
  to 0. Most of the rest are crossings longer than the street (a path that crosses and carries on),
  which the check counts because ours draws pavements where main mapped a separate footway and gave
  the street none. Trade-off: a dropped crossing leaves the paths either side ending at the pavement,
  joined by the race routes' loose-end rule rather than a shared point; path-or-road within 3 m of the
  network went 0.990 to 0.989.
- [ ] **Post boxes** stay at 0.722 (main 0.742): none is dropped; the two short of main were set back
  onto our pavements from where our wider carriageways put them, ending over 3 m from the mapped box.

## Plot edges after the merge of main (24 October)

- [ ] **Plot-edge recall fell from 0.469 to 0.412 for two reasons, neither of them the merge's code.**
  Bisected on -1,2 1,3 0,3 -4,-2 0,-2 -6,2 (recall within 1 m, plot edges):
  - The earlier figure was too high. Before the merge, a full write started from the branch's own
    committed maps, which are the partition's own output. The writer marks every run it draws with
    a height, and it takes any base run with a height as a measured (lidar) barrier. So last time's
    guesses came back as evidence and held themselves up. With the same code (6d2ed4d), the score
    is 0.541 on that base and 0.459 on main's tiles. Only main's tiles are a fair base: always pass
    `--base` with main's maps, never the branch's own.
  - The real loss came with main's rebuild 2f5b157. It measured the squares round the edge of Bath
    without their lidar: the raw lidar there had 6 of the 13 OS 5 km squares the map needs
    (ST6555, ST6560, ST7055, ST7070, ST7570, ST8060 and ST8065 are missing). Those squares'
    `data/combe-down/measured/*.zip` were stored with no lidar walls and no building heights
    (-6_2 had 8.9 km of walls, now none). Field parcel edges stand only where a lidar or mapped
    barrier backs them, so they went. The head code on main's tiles scores 0.440, and 0.457 with
    the measurements from before 2f5b157, the rural squares coming back whole (-6,2 0.001 to 0.227).
    The merge's code itself (the lone-stub loop, the tree and stub rules) moved nothing measurable.
  - Fix: `prep_map.py --measure` now stops when the lidar has no tiles under part of the square, and
    says to fetch them (`Lidar.uncovered`). The 42 squares the local lidar doesn't cover whole are
    -7_2 -7_3 -6_-1 -6_0 -6_1 -6_2 -6_3 -5_-2 -5_-1 -5_0 -5_1 -5_2 -5_3 -4_-3 -4_-2 -4_-1 -4_0
    -4_1 -4_2 -4_3 -3_-3 -3_-2 -3_8 -2_-4 -2_-3 -2_-2 -2_8 -1_-4 -1_-3 -1_-2 -1_8 0_-4 0_-3 0_-2
    0_8 1_8 5_0 5_1 5_2 5_3 5_4 5_5. They need the lidar fetched and measuring again on main, and
    then the partition writing again on main's new tiles. Trade-off: a square the survey really
    doesn't reach can no longer be measured, only built from what is already stored.

## Pedestrian streets, paving on the ground and the canal tunnel (24 October)

- [ ] **Nothing guessed or listed stands between a pedestrian street and its shopfronts.** A guessed
  boundary (front, parcel or inferred) lying at least half on a pedestrian street's ground (its
  paving and 1.5 m beyond, `pedestrian_ground`) stands only where a mapped barrier or a lidar run is
  along it, taking the mapped kind; the listed-front rule no longer applies there. Settling which
  boundaries stand now runs once the streets are written, so it knows which are pedestrian. The
  paving then reaches the shops through `pedestrian_frontage`, as nothing is left walling the
  frontage off (Union Street's railing, New Bond Street Place's stone walls). Trade-off: the lidar
  counts as real here, as it does everywhere else in `settle`, so a lidar run along a shopfront still
  stands; main agreed with the lidar on these edges (379 of 819 m on 0,3 matched main against 373 m
  real).
- [ ] **Paving laid on the ground is cut along the ground grid** (`_ground_triangles`): a plaza's or
  a drive's faces get a corner at every grid point inside them and along the diagonal the game splits
  each cell on, so the grass no longer rises through broad paving (Union Street, the square by Stall
  Street, where the game raised the grass beside a pavement up to a kerb's height). Only `drive`
  pieces (drives and plaza paving) are cut; paths are narrow and their outline already has a point
  every 3 m. Trade-off: 0,3's file grew 5.6 % (3.48 to 3.68 MB).
- [ ] **No path is drawn over the canal's tunnels.** The partition's path faces along the towpath ran
  on over the top of the Cleveland House tunnel, drawn as bare earth beside Sydney Road, though the
  path itself is left out there (`gone`). `street_surfaces` leaves them to the ground inside
  `canal_bores`.
- [ ] **Listed railings on a street's edge in front of open ground stand** (`listed_open_fronts`):
  Historic England's point for "plinth, gates, railings and overthrows to Cleveland House" lies on the
  railings, 4 m from Sydney Road's edge and 8 m from the house, so the house-front rule missed it and
  the edge (street against open ground, nothing guessed) drew nothing, where main's guessed garden
  wall read as the bridge's parapet. A listed railings entry within 5 m of such an edge, with a
  building within 15 m of it, stands along the edge within 8 m of the entry. Trade-offs: the 8 m is
  judged, not measured; the plinth is drawn as railings, not stone, so the view shows black railings
  where main showed a low stone wall; listed walls are left out of this rule, as their points lie
  inside estates' walls rather than on a street (with them, wall precision on 0,3 and 1,3 fell 0.979
  to 0.958).
- [ ] **The dark gap beyond the kerb on Sydney Road** (st-canalbridge, bottom right) is not fixed. It
  shows only at a grazing angle, not from above, and goes when main's Sydney Road record replaces ours
  (not when ours loses its `w` and `pv`, nor when its two pieces are joined), so it is something the
  game does with the street's record by the canal tunnel, not a hole in `sf`. Left for a look in the
  game.
- After these fixes (full write, `check_map` against the tidy run): every count is the same. The
  scoreboard against score-final: pedestrian street paved 0.894 to 0.903 (main 0.932); wall
  precision 0.9688 to 0.9726, fence precision 0.9500 to 0.9492, hedge precision 0.9866 to 0.9868;
  wall recall 0.949 to 0.948, fence recall 0.918 to 0.919; plot edges unchanged (0.408 recall, 0.710
  drawn on an edge). The fence precision dip is probably the new listed railings, which count as
  fences. The roof and tree rows moved because this run read more lidar squares (129 against 101),
  not because of these changes. A write needs `data/raw` linked into the worktree: without it the
  lidar's standing grid is missing, `drop_unstood` drops nothing, and wall precision falls to 0.967.
