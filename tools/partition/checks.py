"""The checks that point at the data rather than at the code.

The partition is fitted to whatever the data says, so when the data is wrong the partition comes out
wrong in a way no rule can fix: a centre line drawn through a building, a footprint that is really a
shed and a garage as one, a plot with no way in from any street. Those are the build's way of
finding bad data, and each is written as a line with its square and its position, as
`tools/check_map.py` does, so the co-developer can go and look at it in the game.

Four checks, all of them computed from what the square's build already has:
- **corridor narrower than its class**: a fitted carriageway narrower than the class's own minimum,
  which usually means a centre line or a footprint beside it is wrong;
- **building the corridor cuts**: a footprint the carriageway and its pavements run through, which
  usually means the centre line is wrong;
- **plot with no front on any street**: a building whose plot reaches no street at all, which
  usually means a missing path or drive;
- **plot edge through a building**: a drawn plot edge crossing a footprint, which means the block
  was cut with a line the footprint should have stopped.

The fifth, `edges_agree`, is about the code rather than the data: neighbouring squares each work
their own 40 m margin, so along the edge they share their partitions must meet exactly. If they do
not, the margin or the noding is wrong and every shared edge in the city is suspect.

Nothing here changes the partition; the checks only report.
"""
import collections
import math

import numpy as np
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

# metres: the narrowest carriageway each class can sensibly be. Below it the centre line or the
# footprints beside it are wrong, not the fit. (check_map.py's MINW holds the same floors.)
CLASS_MIN = {
    "trunk": 5.5, "primary": 5.0, "secondary": 5.0, "tertiary": 4.5, "residential": 3.5,
    "unclassified": 3.0, "living_street": 3.0, "service": 2.0, "pedestrian": 2.5,
}
AGREE_TOL = 0.01        # metres: how close neighbouring squares' edges must meet, from the plan
ON_EDGE = 0.02          # metres: how close a face must come to a square's edge to run along it
ETB_SHRINK = 0.05       # metres: a footprint is shrunk by this before an edge is tested against it,
                        # so an edge lying *along* a wall is not through it
ETB_MIN = 0.10          # metres: how much of the edge must be inside the shrunk footprint to count
SPAN_MIN = 0.05         # metres: the shortest stretch of an edge worth calling a span of it
FRAG_RUN = 0.5          # metres: the run a plot fragment must share with its square's own edge to be
                        # reachable from the rest of its plot, which continues into the neighbour


def narrow_corridors(ti, tj, streets):
    """Street edges whose fitted carriageway is narrower than their class allows, with the narrowest
    sample's position. A street squeezed below its minimum means something beside it is wrong."""
    out = []
    for e in streets:
        f = CLASS_MIN.get(e["cls"])
        if f is None or not len(e.get("sections", [])):
            continue
        w = np.array([sec[0] for t0, t1, sec in e["sections"]])
        k = int(np.argmin(w))
        if w[k] < f:
            t0, t1, _ = e["sections"][k]
            p = e["line"].interpolate((t0 + t1) / 2)
            out.append(dict(square=[ti, tj], x=round(p.x, 1), y=round(p.y, 1), rule="narrow_corridor",
                            what=f"{e['cls']} {e.get('name') or ''} fitted {w[k]:.1f} m, "
                                 f"class minimum {f} m".strip()))
    return out


def buildings_cut(ti, tj, bpolys, corridors):
    """Footprints a carriageway or pavement runs through. A centre line through a building, or a
    footprint that really is two buildings, comes out this way."""
    if not bpolys:
        return []
    carved = [g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    if not carved:
        return []
    tree = STRtree(carved)
    out = []
    for b in bpolys:
        c = b.representative_point()
        for k in np.atleast_1d(tree.query(c.buffer(max(2.0, math.sqrt(b.area) / 2)))):
            inter = b.intersection(carved[int(k)])
            if inter.area > 0.5 * b.area:
                out.append(dict(square=[ti, tj], x=round(c.x, 1), y=round(c.y, 1),
                                rule="building_cut", what=f"corridor covers {inter.area / b.area:.0%} "
                                                          f"of a footprint of {b.area:.0f} m2"))
                break
    return out


REACH = 0.5             # metres: how close a plot or a house must be to the street network to be
                        # reached from it. The plan's own figure.
MIN_PLOT = 5.0          # m2 a plot must be before "nobody can get to it" is worth saying: below it
                        # it is sliver noise, not a garden the build got wrong


def unreachable_plots(ti, tj, plots, houses, corridors, pedges, openings, square):
    """Plots nobody can get to: a data finding, and usually a path or a drive missing from the source.

    A house is reached when a walk from its footprint over the faces gets to a corridor. The walk may
    cross:
    - footprint to plot, and plot or footprint to open ground, freely: they are the same private
      ground, and whether it is called a plot or open land is the build's own labelling;
    - open ground to open ground only across an edge that is not drawn, or that carries an opening;
    - anything to a corridor within REACH.

    So open ground *is* a way in, and a hedge drawn between a front garden and a verge is not - unless
    it has a gate, which is what `front_edges` gives it by counting an edge whose far side is open
    ground reaching a corridor as a front.

    Two simpler tests were tried and both are wrong. "Does the plot's boundary reach a corridor" flags
    a mid-terrace house, whose plot is its back garden and never touches the street, which is the
    ordinary case (measured: 398 of them on the village square, all fine). "Does the house or its plot
    reach a corridor" flags an ordinary house whose front garden is open land in another title,
    because the title stops at the back of the verge (measured: 193, of which the co-developer traced 119 to
    exactly this). Only the walk gets both right.

    This extends stage 1's opening check rather than adding a separate idea: that check says a
    building whose plot faces a street must have a gate or drive, and this says a building the walk
    cannot get out of has no way in at all. Reported with the *house's* position, since the missing
    path or drive is what to go and find. Only houses whose plot is inside the square are reported:
    the 40 m margin is worked so the square's own edges come out right."""
    ways = [g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    if not ways:
        return []
    tree = STRtree(ways)
    inside = box(*square)
    # a gate counts as a way through, as do a drive and a path: the walk may cross an edge that
    # carries any of them. Leaving "gate" out made every gated garden hedge a solid wall, which is
    # the largest single group of the village square's findings (measured: house 833's 54.7 m hedge
    # 0.53 m from the corridor carries a gate, and was still read as holding the walk shut).
    opened = {o["edge"] for o in openings if o["kind"] in ("gate", "drive", "path", "open")}

    def reached(g):
        # the query is padded by REACH: STRtree.query takes the geometries whose *envelope* meets the
        # one asked for, so a corridor that lies within REACH of g but does not overlap its envelope
        # is missed and g reads as further from the street than it is (measured: two houses on the
        # village square at 0.73 m and 1.10 m by the plain query, 0.39 m and 0.36 m in truth - both
        # well inside REACH, and both wrongly reported as having no way in).
        idx = np.atleast_1d(tree.query(g.buffer(REACH)))
        return bool(len(idx)) and min(ways[int(k)].distance(g) for k in idx) <= REACH

    faces = [p for p, _, _ in plots]
    ftree = STRtree(faces) if faces else None
    drawn = [(pe[0], eid in opened) for eid, pe in enumerate(pedges)
             if pe[1] != "none"]
    dtree = STRtree([l for l, _ in drawn]) if drawn else None

    def may_cross(i, j):
        """Whether the walk may pass between two touching faces: unless a drawn boundary without an
        opening lies along their shared edge. A hedge between a front garden and a verge stops the
        walk; the same hedge with a gate in it does not.

        A boundary blocks only where it *runs along* the shared edge, not merely where it touches it:
        two faces' shared edge is met at its corners by all the boundaries of the edges either side of
        it, so a piece that overlaps the shared edge by a metre out of its 20 m is a neighbour's
        boundary meeting this one at a corner, and the crossing is open. Matching on distance alone
        (measured: 3123 of 3137 pairs blocked) or on any overlap (a 21 m piece overlapping by 1.3 m
        still blocked) leaves the walk unable to move, and almost every house reads as unreachable."""
        if dtree is None:
            return True
        shared = faces[i].boundary.intersection(faces[j].boundary.buffer(REACH))
        if shared.is_empty or shared.length < 0.1:
            return True
        for k in np.atleast_1d(dtree.query(shared.buffer(REACH))):
            line, has_opening = drawn[int(k)]
            if has_opening:
                continue
            along = line.intersection(shared.buffer(0.05))
            # a boundary blocks only where it holds the crossing shut: it runs along most of the
            # shared edge. A half-metre sliver at one end of a 23 m crossing is the junction where the
            # two faces' other boundaries meet, not a wall across the gap, and treating it as one
            # leaves the walk unable to move (measured: 192 houses read as unreachable on the village
            # square, of which the co-developer traced 168 to open ground that is really reachable this way).
            if along.length >= 0.5 * shared.length:
                return False
        return True

    def reaches_corridor(bi):
        # the walk starts from the house's *footprint*, which is what joins its front garden to its
        # back garden: the two are separate faces of the block with the house between them, so a walk
        # that began at the plots alone would have to get out of its front garden as its only way,
        # and an ordinary house whose front garden is open land in another title would read as sealed
        # in. The footprint is a node of the walk and the crossing to any plot is free ("footprint to
        # plot, any edge").
        start = {i for i, (p, k, b) in enumerate(plots)
                 if b == bi and k in ("plot", "open") and p.area >= MIN_PLOT}
        if not start:
            start = {i for i, (p, k, b) in enumerate(plots) if b == bi}
        foot = houses[bi]
        if foot.area >= MIN_PLOT:
            for i in np.atleast_1d(ftree.query(foot.buffer(REACH))):
                i = int(i)
                # only the house's own ground or open ground may join the start: a face belonging to
                # another house is next door's plot, and a terrace house's footprint touches its
                # neighbour's garden along the party wall, so adding it let a sealed plot read as
                # reachable through next door. Open ground (owner None) is nobody's and is a way out.
                if plots[i][2] is not None and plots[i][2] != bi:
                    continue
                if foot.boundary.distance(faces[i].boundary) <= REACH or foot.intersects(faces[i]):
                    start.add(i)
        if reached(houses[bi]) or any(reached(faces[i]) for i in start):
            return True
        # a drive or a path recorded on one of the plot's own edges is a way in in its own right: the
        # opening is what stage 4 cuts through the boundary, so the boundary is not a wall there
        mine_boundary = unary_union([faces[i].boundary for i in start])
        if any(eid in opened for eid, pe in enumerate(pedges)
               if pe[1] != "none" and pe[0].distance(mine_boundary) <= REACH):
            return True
        seen = set(start)
        stack = list(start)
        while stack:
            i = stack.pop()
            for j in np.atleast_1d(ftree.query(faces[i].buffer(REACH))):
                j = int(j)
                if j in seen or faces[i].boundary.distance(faces[j].boundary) > REACH:
                    continue
                if not may_cross(i, j):
                    continue
                if reached(faces[j]):
                    return True
                seen.add(j)
                stack.append(j)
        return False

    out = []
    for bi in sorted({b for _, _, b in plots if b is not None}):
        house = houses.get(bi)
        if house is None:
            continue
        mine = [p for p, k, b in plots if b == bi and p.area >= MIN_PLOT]
        if not mine:
            continue
        c = max(mine, key=lambda p: p.area).representative_point()
        if not inside.contains(c) or reaches_corridor(bi):
            continue
        h = house.representative_point()
        out.append(dict(square=[ti, tj], x=round(h.x, 1), y=round(h.y, 1), rule="plot_unreachable",
                        what=f"house of {house.area:.0f} m2 in a plot of {sum(p.area for p in mine):.0f}"
                             f" m2 cannot be reached from any street"))
    return out


def edges_through_buildings(ti, tj, edges, bpolys):
    """Drawn plot edges that run through a footprint: the block was cut by a line the building
    should have stopped, so the two neighbours' gardens are joined through a house.

    The test is how much of the edge lies inside the footprint **shrunk by `ETB_SHRINK`**, and it is
    a length rather than a point, because a point cannot tell the two cases apart. A plot edge against
    its own house runs *along* the wall: every point of it is on the footprint's boundary, so a
    `contains` test on the edge's midpoint is a coin toss on the last bit of a float, and it reported
    thousands of walls as crossings (measured: all 94 of 3b's new findings were at 0.000 m from the
    boundary, and 21 of stage 3's 23 were too). Shrinking the footprint first moves its boundary
    5 cm inwards, so a line along the wall now falls outside it, while a line genuinely crossing the
    interior still has `ETB_MIN` of its length inside. An edge crossing a footprint by less than
    10 cm is not one the player sees, and is not reported."""
    if not bpolys or not edges:
        return []
    inner = [b.buffer(-ETB_SHRINK) for b in bpolys]
    tree = STRtree(inner)
    out = []
    for e in edges:
        s, kind = e[0], e[1]
        if kind == "none" or s.length < 2:
            continue
        # in index order: the loop reports the first face the edge crosses, and which one that is
        # must not depend on the index's build order
        for k in sorted(int(k) for k in np.atleast_1d(tree.query(s.buffer(0.5)))):
            k = int(k)
            if inner[k].is_empty:
                continue                    # the footprint is thinner than the shrink: nothing to cross
            try:
                through = s.intersection(inner[k])
            except Exception:
                continue
            if through.length <= ETB_MIN:
                continue
            m = through.interpolate(0.5, normalized=True)
            out.append(dict(square=[ti, tj], x=round(m.x, 1), y=round(m.y, 1),
                            rule="edge_through_building",
                            what=f"a {kind} boundary runs through a footprint "
                                 f"({through.length:.1f} m of it inside)"))
            break
    return out


def in_square(plots, square):
    """The plot ground of a square's gathered set that lies **inside the square**, and the ground it
    does not.

    A square gathers its neighbours' worked pieces, so the plots it holds are clipped to the *worked
    area* - the square plus its 40 m margin - and part of that ground is outside the square. The
    square does not ship the margin ground: it clips every face to the square before writing its
    partition (`faces = partition([(g.intersection(SQ), ...)])`), and the neighbouring square that
    owns it ships it, with the ground joined to its house.

    So the margin ground is not this square's to judge, and judging it is what produced the opening
    failures: a plot strip at the far edge of the margin, whose house and gate are in the square next
    door, cannot have an opening recorded here - `find_openings` skips a building it has no polygon
    for - and the check then reports it as having no way in (measured: 257 of 257 failing fragments
    have *no* ground inside the square at all).

    Returns (mine, theirs): the plot faces clipped to the square, and the plot faces entirely outside
    it. A face that straddles the edge appears in `mine`, clipped, because the square does ship that
    part of it."""
    SQ = box(*square)
    mine, theirs = [], []
    for g, k, bi in plots:
        if k != "plot":
            continue
        inside = g.intersection(SQ)
        if inside.is_empty or inside.area <= 0:
            theirs.append((g, k, bi))
        else:
            mine.append((inside, k, bi))
    return mine, theirs


def square_index(square):
    """Which (ti, tj) a square's coordinate box is, from its south-west corner.

    The box's own coordinates are what every caller has, and the index is what `shared_edge` needs;
    deriving it here means a caller cannot pass the box where an index was wanted, which silently
    disabled the walkability test on every fragment (measured: one square kept a finding it should
    have deferred)."""
    from . import Q
    side = Q.dx * Q.cells
    return int(round((square[0] - Q.x0) / side)), int(round((square[1] - Q.y0) / side))


def deferred_fragments(square, plots, houses, fronts_without, holder_of=None):
    """The failing plots this square must judge, and the in-square fragments it defers.

    **Scope first.** A square judges only the plot ground it ships - the ground inside its own square
    (`in_square`). A plot, or plot part, that lies entirely in the margin is not judged here: the
    square does not ship that ground, the neighbouring square that owns it does, and that square has
    the house and its gate. Judging it here is what produced the opening failures - a strip at the far
    edge of the margin, 40 m outside the square, whose house is in the square next door, cannot have
    an opening recorded here (`find_openings` skips a building it has no polygon for) and so reads as
    having no way in (measured: 257 of 257 failing fragments have no ground inside the square).

    This is not a weakening: every piece of shipped ground is still judged exactly once, by the
    square that ships it, and `city.py` proves it by comparing the shipped plot area against the plot
    area the checks judged.

    **Then the in-square fragments.** A plot can straddle the shared edge, so this square holds the
    near part of it while the house is next door. Such a fragment is not this square's to judge
    either, because no opening could have been recorded for a building it has no house for. It is
    *deferred* to the square that holds the house and resolved city-wide (`resolve_fragments`).

    Two things this does decide, because they are about ground the square does ship:

    - **a fragment no square holds.** If the building index is in no square's houses at all, there is
      nobody to defer to and the finding stands here;
    - **a fragment that cannot be walked to.** The plot continues across the shared edge between this
      square and the house's, so the two must meet along a run of that edge - `FRAG_RUN` (0.5 m) at
      least. A fragment touching the shared edge at a single point, or along less than that, is
      ground the player cannot walk onto from the rest of its plot, and is a finding here.

    Returns (to_judge, deferred, in_margin): the building indices this square must judge, the
    fragments to hand to the square that holds their house as (building index, holder square), and
    the building indices not judged here because their ground is in the margin. `holder_of` is how
    the holder is found for an index - `once.square_of_point` over the house's representative point -
    and where it is not given the holder is None, which `resolve_fragments` then reports.

    The walkability run is measured on the line this square shares with the holder's, which is a
    question about *square indices*; `square_index` derives this square's from its box."""
    SQ = box(*square)
    out_judge, deferred, in_margin = [], [], []
    for bidx in fronts_without:
        poly = next((p for p, _k, b in plots if b == bidx), None)
        if poly is None:
            out_judge.append(bidx)
            continue
        if poly.intersection(SQ).area <= 0:
            in_margin.append(bidx)          # entirely in the margin: its owner square judges it
            continue
        if bidx in houses:
            out_judge.append(bidx)          # the house is here: this square judges it
            continue
        holder = None if holder_of is None else holder_of(bidx)
        if holder is None:
            out_judge.append(bidx)          # nobody holds the house: the finding stands here
            continue
        # the fragment must meet the shared boundary with the holder's square along a walkable run.
        # The boundary is one line for an edge neighbour and a corner plus two edges for a diagonal
        # one - and there the *longest* piece is the run, not their total: a garden reaching 1 m
        # along each of the two edges has two 1 m runs, not one 2 m run, and the corner point itself
        # contributes no length.
        shared = shared_edge(square_index(square), holder, square)
        run = 0.0
        if shared is not None:
            meet = poly.intersection(shared)
            parts = list(meet.geoms) if hasattr(meet, "geoms") else [meet]
            run = max((p.length for p in parts), default=0.0)
        if run < FRAG_RUN:
            # A corner clipped by the square's edge, under FRAG_RUN both along and into the square,
            # is no ground anyone can stand on, so it needs no way in of its own. Measured: a
            # garden's corner 0.09 m over the edge, 0.009 m2, was failed for a front without a gate.
            frag = poly.intersection(SQ)
            pts = [Point(c) for g in getattr(frag, "geoms", [frag]) if g.geom_type == "Polygon"
                   for c in g.exterior.coords]
            if pts and max(SQ.exterior.distance(p) for p in pts) < FRAG_RUN:
                in_margin.append(bidx)
                continue
            out_judge.append(bidx)          # a point touch or a stub: not walkable from its plot
            continue
        deferred.append((bidx, holder))
    return out_judge, deferred, in_margin


def shared_edge(index, holder, square=None):
    """The ground two neighbouring squares share, as a geometry a walkability run is measured against.

    This is the boundary a plot crosses when it continues from one square into the square holding its
    house, so it is what the fragment must meet along `FRAG_RUN` to be walkable from the rest of its
    plot. Three cases:

    - **edge neighbour** (one step in x or in y): the shared edge, a full side of the square;
    - **diagonal neighbour** (one step in each): they share only a **corner point**, and a garden
      whose house is in the diagonal square gets through at that corner - so the geometry is the
      corner point together with the two edges of this square that meet there. Without this the
      diagonal case returns nothing and every corner house is reported as having no way in, which is
      wrong: the player walks out of the plot across the corner;
    - **not a neighbour**: `None`, and the fragment is judged here.

    `index` and `holder` are **square indices** - (ti, tj). `square` is that index's coordinate box
    where the caller already has it; it is derived from the index otherwise. An index is what the
    arithmetic needs, and the box cannot answer it (a box compares coordinates in metres against
    indices, and returned None for every pair, which silently disabled the walkability test)."""
    dx, dy = holder[0] - index[0], holder[1] - index[1]
    if max(abs(dx), abs(dy)) != 1 or (dx, dy) == (0, 0):
        return None                     # the same square, or one that does not touch this one
    if square is not None:
        x0, y0, x1, y1 = square
    else:
        from . import Q
        side = Q.dx * Q.cells
        x0, y0 = Q.x0 + index[0] * side, Q.y0 + index[1] * side
        x1, y1 = x0 + side, y0 + side
    if dx and dy:
        # diagonal: the corner they share, and the two edges of this square meeting there. A garden
        # getting through at a corner has ground either side of that corner, so the run that matters
        # is how far it reaches along each of those two edges.
        cx, cy = (x1 if dx > 0 else x0), (y1 if dy > 0 else y0)
        corner = Point(cx, cy)
        along_x = LineString([(cx, cy), (x0 if dx > 0 else x1, cy)])
        along_y = LineString([(cx, cy), (cx, y0 if dy > 0 else y1)])
        return unary_union([corner, along_x, along_y])
    if dx:
        return LineString([(x1, y0), (x1, y1)]) if dx > 0 else LineString([(x0, y0), (x0, y1)])
    return LineString([(x0, y1), (x1, y1)]) if dy > 0 else LineString([(x0, y0), (x1, y0)])


def resolve_fragments(deferred, gated_by):
    """The city-wide resolution of every deferred fragment, after the squares have all been built.

    A fragment was handed to the square that holds its house, and **that square specifically** must
    have recorded an opening for it: the house is there, so its plot's way in is that square's to
    record. Accepting an opening from any square would be satisfied by a different square that
    happened to gate a plot with the same building index - and a building index is global, so every
    square holding a fragment of that plot names the same one. That would report the plot gateable
    when the ground the house stands on has no opening.

    If the holder recorded nothing, or no square holds the house at all, the plot has no way in
    anywhere and that is a finding, on the fragment's square, under the same rule name.

    `deferred` is [(fragment's square, building index, holder square)]; `gated_by` is
    {building index: the set of squares that recorded an opening for it}. Returns the findings."""
    out = []
    for square, bidx, holder in deferred:
        if holder is not None and holder in gated_by.get(bidx, set()):
            continue                        # the square holding the house gates the plot
        where = (f" (house in {holder[0]},{holder[1]})" if holder is not None
                 else " (no square holds the house)")
        out.append(dict(square=list(square), rule="front_without_opening",
                        building=bidx,
                        what=f"the square holding the house recorded no opening: the plot of "
                             f"building {bidx} has no way in{where}"))
    return out


def edge_profile(square, faces, offsets=(0.0,)):
    """What the ground looks like along the square's own four edges, as spans of each edge.

    A profile is {side: [[start, end, class], ...]}, each span being the stretch of that edge where
    the named kind of ground runs, in metres from the edge's low end.

    The faces must be the square's faces *before* they are clipped to the square. Clipped faces
    cannot be compared between two squares at all: `g.intersection(SQ)` makes the clipping line a
    boundary of every face along it, so a face describes only the ground on its own side, and the
    two squares' profiles then describe two different strips of ground and can never match. Two
    squares whose faces are identical to the centimetre gave 49 unmatched positions at 1 cm and a
    reported 112 m mismatch that way, and every one of those was the clip, not the partition.

    Unclipped, a face straddles the shared line and the line runs through its interior, so both
    squares describe the same ground along it and the profiles are directly comparable. `offsets`
    moves the line outwards or inwards to sample beside the edge as well: agreement should hold on
    lines parallel to the shared edge too, and the profile at an offset shows where it stops holding
    (the square's own margin ends 40 m in)."""
    x0, y0, x1, y1 = square
    sides = {"south": ((x0, y0), (x1, y0), 0.0, 1.0),
             "east": ((x1, y0), (x1, y1), 1.0, 0.0),
             "north": ((x0, y1), (x1, y1), 0.0, 1.0),
             "west": ((x0, y0), (x0, y1), 1.0, 0.0)}
    out = {}
    for side, (a, b, nx, ny) in sides.items():
        for off in offsets:
            line = LineString([(a[0] + nx * off, a[1] + ny * off), (b[0] + nx * off, b[1] + ny * off)])
            spans = []
            for f, cls in faces:
                if not f.intersects(line):
                    continue
                hit = f.intersection(line)
                for s in ([hit] if hit.geom_type == "LineString"
                          else [g for g in getattr(hit, "geoms", []) if g.geom_type == "LineString"]):
                    if s.length < SPAN_MIN:
                        continue                # a corner touch is not a span of the edge
                    p, q = Point(s.coords[0]), Point(s.coords[-1])
                    ta = (p.x - x0) if nx == 0 else (p.y - y0)
                    tb = (q.x - x0) if nx == 0 else (q.y - y0)
                    spans.append([round(min(ta, tb), 3), round(max(ta, tb), 3), cls])
            out[f"{side}@{off:g}"] = sorted(spans)
    return out


def _transitions(spans):
    """Where the ground along an edge changes: the start of each run of one class, and the edge's end.

    The spans are merged into runs first, because the two squares may subdivide the edge differently
    without disagreeing: one square's `plot` from 84.45 to 95.55 as one span, the other's as three
    plot spans in a row, is the same ground. What must match is where the ground *changes*: a
    boundary the neighbour does not have is a boundary the two squares cut differently, which is
    what the plan's 1 cm test is about."""
    runs = []
    for start, end, cls in sorted(spans):
        if runs and runs[-1][2] == cls and abs(runs[-1][1] - start) <= 0.02:
            runs[-1][1] = end
        else:
            runs.append([start, end, cls])
    out = []
    for k, (start, _end, cls) in enumerate(runs):
        out.append((round(start, 3), cls, runs[k - 1][2] if k else None))
    if runs:
        out.append((round(runs[-1][1], 3), None, runs[-1][2]))
    return out


def edges_agree(mine, theirs, tol=AGREE_TOL):
    """How well two squares' partitions meet along the edge they share, from the two span profiles
    (`edge_profile`). Both run from the same end of the same line - one square's `east` against the
    one to its right's `west`, say - so their ends line up.

    The plan's test is that the *boundaries* match: every place one square's ground changes along the
    edge must be a place the other's changes too, within tol. A boundary with no partner is one the
    two cut differently. Returns (worst mismatch in metres, how many boundaries had no partner, and
    those boundaries)."""
    a, b = _transitions(mine), _transitions(theirs)
    worst, missing, lonely = 0.0, 0, []
    for ts, others in ((a, b), (b, a)):
        for t, _cls, _before in ts:
            d = min((abs(t - o) for o, _c, _bb in others), default=None)
            if d is None or d > tol:
                missing += 1
                lonely.append(round(t, 3))
                if d is not None:
                    worst = max(worst, d)
    return round(worst, 4), missing, sorted(lonely)
