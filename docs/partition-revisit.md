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
