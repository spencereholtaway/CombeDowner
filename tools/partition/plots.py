"""Plots: the blocks between the corridors divided between their buildings.

Every point of a block is one face of one partition. Every cut that shapes a plot is a line of the
one polygonize — the division lines square to the houses, the bisectors between detached houses,
the evidence lines, the shared back lines between two rows and each garden cap — so the block is
cut once, before any face is assigned to a building. A plot is then a union of faces of that one
partition and nothing else: the region growing assigns whole faces and never cuts them, so two
neighbours share their boundary exactly and a plot edge cannot end in mid-air. (The proof of
concept cut plots in two places — cuts in the polygonize, then a per-house `buffer(GARDEN)` clip
afterwards — so two neighbours were cut independently and their versions of a shared boundary did
not coincide.)

Each face goes to the building it is nearest to by path, crossing an evidence line costing CROSS
metres. A face is a plot's if the growing reached it within reach GARDEN of that building; the rest
is open land.

The drawn boundaries come from that same noded network, not from pairs of plot polygons: every
segment of the network has a label either side (a plot, open land, a corridor, a building or the
worked area's edge), and the segments are grouped by the pair of labels and merged, so a boundary
between two neighbours is one line. A building or the worked area's edge is not a boundary and is
not drawn. Whether a boundary is on evidence or inferred is whether it lies on an evidence line.

Stage 1 divides a block by division lines square to its houses instead of a dense-point Voronoi:
a line from each shared wall between two houses (and each free side wall of a detached or end
house) running square to the house's front, back to the block's far side, and between houses that
do not share a wall the perpendicular bisector of the gap turned to the nearer house's axis. The
Voronoi stays only as the fallback for a block with buildings and no usable walls.

Stage 2 divides it where the data already knows: the registered property extents (HM Land
Registry's INSPIRE Index Polygons) are evidence above the lidar's, so the growing never crosses
one (cost PARCEL_CROSS, against CROSS for a lidar ridge), and where they cover the ground the
plot is the parcel the house stands in. That is what makes a terrace's gardens long thin strips
and a boundary on a bend a wedge: they are the parcels' own shapes, not a rule's. Where the
parcels do not reach (unregistered land, and anywhere a title is missing) the stage 1 divisions
still divide the block as they did.

A registered title line is not the same thing as something standing on the ground, though: it runs
across two fields of one farm, or across a lawn, with nothing along it, so a boundary is drawn
there only where the lidar, a mapped barrier or a garden edge says something is really there (see
`classify_edges`). The parcel still *divides* the block either way, so the plots and the open land
are the same whether or not anything is drawn.
"""
import collections
import heapq
import math
import random

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import linemerge, polygonize, substring, unary_union
from shapely.strtree import STRtree

from gardens import STYLE as GARDEN_STYLE, pick
from .render import loose_ends

GARDEN = 30.0           # metres from a building beyond which land is open, not a plot
CROSS = 15.0            # metres an evidence line costs the region growing to cross
PARCEL_CROSS = 100.0    # metres a registered parcel boundary costs it to cross: above the lidar's,
                        # so a plot is the parcel its house stands in and never spills next door
PARCEL_PAD = 1.0        # metres the registered extent is grown by before capping a plot: the
                        # polygons are indicative, so a house straddling its own edge keeps its plot
PARENT_ON = 0.01        # metres: a probe this close to the parent block's boundary is *on* it, so
                        # the ground beyond is a corridor rather than the rest of the block
PARCEL_ON = 0.75        # metres: how far either side of a title line a division stands down, so a
                        # rule's line is not drawn along a survey's own boundary
DIV_MIN = 1.0           # metres: the shortest piece of division line worth keeping
GARDEN_EDGE = GARDEN     # metres: a registered boundary further than this from every house is not a
                         # garden edge but the cadastre's line across open land, and is drawn only
                         # where the lidar or a mapped barrier really shows something along it
SUPPORT = 0.4           # share of a plot edge the evidence must cover to be a boundary on its own
REACH_GROW = 2 * GARDEN  # metres: how far the growing cost may run before a face is open land
FACE_PAD = 0.5          # metres: a plot reaches its building's GARDEN reach grown by this
SEED_REACH = 0.5        # metres: a face this close to a building is one of its seeds
SLIVER_AREA = 2.0       # m^2: a smaller face is too small to be a plot of its own
SLIT = 1e-3         # m2: a face this small is a hairline left by the noding, not ground
SLIVER_THIN = 0.25      # metres: a face whose area/perimeter is under this is a sliver too
CAP_OVERHANG = 6.0      # metres: a garden cap reaches this far past its house's corners
BACK_ROWS = 8.0         # metres: two rows closer than this back on to each other
JOIN_ANGLE = 10.0       # degrees: evidence runs this close to collinear join into one line
JOIN_GAP = 8.0          # metres: and within this of each other
EXTEND = 3.0            # metres an evidence line is carried on past each end so it closes faces
OPEN_KINDS = {"farmland", "meadow", "grass", "grassland", "park", "pitch", "recreation_ground",
              "cemetery", "grave_yard", "allotments", "forest", "wood", "golf_course", "fairway",
              "playground", "orchard", "nature_reserve", "scrub"}
FRONT = {"village": "garden_wall", "bath": "garden_wall", "georgian": "railing", "victorian": "garden_wall",
         "foxhill": "hedge_low", "mulberry": "railing", "suburb": "hedge_low", "riverside": "brick_wall_low"}
FRONT_ROW = 150.0       # metres along a street whose gardens share one front, as a row of houses does
FRONT_REACH = 40.0      # metres: a front further than this from any street is keyed by where it is


def street_rows(streets):
    """(x, y) -> the stretch of street a front garden at that point faces: the nearest street's name
    (or its id, unnamed) and which `FRONT_ROW` along it, so the gardens of one row, on both sides of
    the street, are keyed alike and a terrace doesn't change style halfway along."""
    lines = [LineString(e["line"]) for e in streets]
    if not lines:
        return lambda x, y: None
    tree = STRtree(lines)

    def row_at(x, y):
        p = Point(x, y)
        k = tree.query_nearest(p, max_distance=FRONT_REACH)
        if not len(k):
            return None
        k = int(k[0])
        return f"{streets[k].get('name') or streets[k]['id']}:{math.floor(lines[k].project(p) / FRONT_ROW)}"
    return row_at


def front_style(zone, x, y, row=None):
    """A front garden's boundary where nothing was seen along it: rolled from the zone's mix as the
    old build's gardens are (`gardens.STYLE`), once for each row along a street (`street_rows`), so
    a row shares one style and a street isn't all one thing. A zone without a mix has its one style."""
    mix = GARDEN_STYLE.get(zone)
    if not mix:
        return FRONT.get(zone, "hedge_low")
    key = row or f"{math.floor(x / FRONT_ROW)}:{math.floor(y / FRONT_ROW)}"
    return pick(mix[0], random.Random(f"{zone}:{key}").random())


class Parcels:
    """The registered property extents near a square, for the plot dividing: HM Land Registry's
    INSPIRE Index Polygons (data/<map>/parcels.geojson.xz, tools/parcels.py).

    The polygons' extents are indicative, not the legal boundary, and the licence forbids deriving
    building footprints from them, so they are read only here, as the lines a plot boundary follows.
    A parcel whose title is registered over several houses (a terrace sold as one) still gets cut
    into per-house plots by the stage 1 divisions; a parcel is a *cap* on how far a plot may reach,
    never a rule about where its boundary runs."""

    def __init__(self, polys):
        polys = list(polys or [])
        self.polys = polys
        self.lines = [LineString(r.coords)
                      for p in polys for pg in (p.geoms if p.geom_type == "MultiPolygon" else [p])
                      for r in [pg.exterior] + list(pg.interiors)]
        self.tree = STRtree(polys) if polys else None
        self.ltree = STRtree(self.lines) if self.lines else None

    def near(self, block):
        """The registered boundaries of the parcels touching a block, whole — as the evidence lines
        are, so the polygonize nodes them with the block and the pieces that fall outside it are
        dropped with the rest. A piece that would end in mid-air inside the block does not: a
        parcel's ring is closed, and where one runs out of the block it runs into the block's own
        boundary (a corridor or a building), which is where its end belongs."""
        if self.ltree is None:
            return []
        out = []
        for k in self.ltree.query(block.buffer(EXTEND)):
            l = self.lines[int(k)]
            if l.length > 0.1:
                out.append(l)
        return out

    def index_of(self, house):
        """Which parcel a house stands in: its index in `polys`, or None where the title is not
        registered (unregistered land, or a house newer than the download)."""
        if self.tree is None:
            return None
        p = house.representative_point()
        hits = [int(k) for k in self.tree.query(p) if self.polys[int(k)].contains(p)]
        if not hits:
            return None
        return min(hits, key=lambda k: (self.polys[k].area, self.polys[k].centroid.x,
                                        self.polys[k].centroid.y, k))


def on_line(tree, lines, p, tol):
    """Whether point p lies on one of `lines`, within tol, using their STRtree. This is what makes
    a boundary a parcel's rather than an inferred one, so it is asked of a sample of points along
    each piece, not of the centroid alone."""
    if tree is None:
        return False
    idx = np.atleast_1d(tree.query(p.buffer(tol)))
    return len(idx) > 0 and min(lines[int(k)].distance(p) for k in idx) <= tol


def garden_share(htree, houses, seg, reach=GARDEN_EDGE):
    """The share of a segment that lies within `reach` of a house, sampled along it. `reach` is the
    garden's own reach: a garden boundary sits at the far end of the garden, not against its house.

    A *share*, not an any-point test, because a title line can graze one garden at one end and run
    off across open land for hundreds of metres: asking whether a house is near *anywhere* along it
    keeps the whole line, which is the invented boundary a title across open land draws. A garden
    edge is a piece that borders a garden for most of its length."""
    if htree is None:
        return 0.0
    n = max(2, int(seg.length / 2))
    near = 0
    for k in range(n + 1):
        p = seg.interpolate(k / n, normalized=True)
        idx = np.atleast_1d(htree.query(p.buffer(reach)))
        if len(idx) and min(float(houses[int(i)].distance(p)) for i in idx) <= reach:
            near += 1
    return near / (n + 1)


def _drop_dangling(edges, others, B):
    """Drop the pieces whose ends are left in mid-air once the unsupported ones have gone.

    A registered boundary joins the network as lines and is then cut into pieces, so dropping a
    piece with nothing standing along it leaves the pieces that met it ending in mid-air where it was
    - the loose end the plan forbids. (Measured on square 1,1: dropping the unsupported pieces on
    their own puts the inside count from 0 to 5, so it is roughly one dangling end per drop.)

    A piece whose end is left dangling has nothing of its own at that end: it only reached there
    because the dropped piece was drawn alongside it. So it is dropped too, and the drop repeated
    until no drawn boundary ends inside the worked area - which is the plan's own rule, applied to
    the drawing rather than only to the partition. A boundary that is held at both ends (by a
    building, a corridor, a kept boundary or the worked area's edge) is never touched.

    `edges` is [(line, kind, support, source, parcel share, keep)]; `others` and `B` are the metric's
    own buildings-and-corridors union and the worked area. Returns the list without the flag."""
    keep = [e[5] for e in edges]
    dropped_any = True
    while dropped_any:
        drawn = [i for i, k in enumerate(keep) if k]
        _, inside, pts = loose_ends([edges[i][0] for i in drawn], others, B)
        dangling = [p for p in pts if B.boundary.distance(p) > 1.0]
        if not dangling:
            break
        dropped_any = False
        # the end that dangles is one of the piece's own coordinates, so only the piece that owns
        # it goes: a neighbour merely passing within a metre of it is held elsewhere
        owners = {(p.x, p.y) for p in dangling}
        for i in drawn:
            c = edges[i][0].coords
            if tuple(c[0][:2]) in owners or tuple(c[-1][:2]) in owners:
                keep[i] = False
                dropped_any = True
    # six fields out: the two labels either side go with them, but not the `keep` flag itself
    return [(s, kind, sup, src, pc, sides) if k else (s, "none", sup, "parcel-nothing", pc, sides)
            for (s, kind, sup, src, pc, _keep, sides), k in zip(edges, keep)]


def building_axes(polys):
    """Each building's axis: the unit direction of the long side of its minimum rotated rectangle.
    A terrace house's axis is the same thing (its long side runs along the row)."""
    out = []
    for p in polys:
        rect = p.minimum_rotated_rectangle
        c = list(rect.exterior.coords)
        e1 = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])
        e2 = math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])
        if e1 >= e2:
            a = np.array([c[1][0] - c[0][0], c[1][1] - c[0][1]])
        else:
            a = np.array([c[2][0] - c[1][0], c[2][1] - c[1][1]])
        n = np.hypot(*a)
        out.append(a / n if n else np.array([1.0, 0.0]))
    return out


def front_normals(geoms, axes, roads_tree, roads):
    """The outward direction each house faces: towards the nearest street. Falls back to square to
    the house's axis where no street is near."""
    out = {}
    for i, g in enumerate(geoms):
        f = None
        if roads_tree is not None and roads:
            c = g.centroid
            # the nearest road, ties broken by the road's position in its own list rather than by
            # whichever the index returns first (an STRtree's order depends on how it was built)
            near = [(int(k), roads[int(k)]) for k in roads_tree.query(c.buffer(50))]
            if near:
                road = min(near, key=lambda kl: (kl[1].distance(c), kl[0]))[1]
                p = g.representative_point()
                q = road.interpolate(road.project(p))
                v = np.array([q.x - p.x, q.y - p.y])
                if np.hypot(*v):
                    f = v / np.hypot(*v)
        if f is None:
            a = axes[i]
            f = np.array([-a[1], a[0]])
        out[i] = f
    return out


def join_evidence(lines, ang_tol=JOIN_ANGLE, gap=JOIN_GAP):
    """Join evidence runs that are collinear within ang_tol and within gap of each other into one
    line: a joined line only ever becomes a plot edge if it closes a face, so the partition can
    afford to join more freely than walls.py does."""
    segs = [np.asarray(l.coords, float) for l in lines if l.geom_type == "LineString" and l.length > 1]
    if not segs:
        return []
    cos_tol = math.cos(math.radians(ang_tol))
    used = [False] * len(segs)
    out = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        pts = list(segs[i])
        changed = True
        while changed:
            changed = False
            a, b = pts[0], pts[-1]
            d = b - a; d = d / (np.hypot(*d) or 1)
            for j in range(len(segs)):
                if used[j]:
                    continue
                c, e = segs[j][0], segs[j][-1]
                for (p, q) in ((c, e), (e, c)):
                    if np.hypot(*(p - b)) <= gap and (np.hypot(*(q - p)) and np.dot(q - p, d) / (np.hypot(*(q - p)) or 1) > cos_tol):
                        pts += [q]; used[j] = True; changed = True; break
                    if np.hypot(*(a - p)) <= gap and (np.hypot(*(p - q)) and np.dot(p - q, d) / (np.hypot(*(p - q)) or 1) > cos_tol):
                        pts = [q] + pts; used[j] = True; changed = True; break
                if changed:
                    break
        out.append(LineString(pts))
    return out


def _uncovered(block, line, parcel_lines, par_tree, start):
    """The part of a candidate division line that the registered boundaries do not already run
    along: the line with the buffer of every nearby title line subtracted, and only the pieces at
    least DIV_MIN long that start on the wall, so a division begins on the building it divides.

    This is what lets a division stand down *along the stretch a title covers* instead of being
    dropped whole. A title line down the middle of a terrace covers the whole division and nothing
    is left, as before. A title that stops at the front wall leaves the front uncovered, so the
    front is cut and two houses that would share one front face get one each."""
    if par_tree is None or not parcel_lines or line.is_empty:
        return [line] if not line.is_empty else []
    near = [parcel_lines[int(k)] for k in np.atleast_1d(par_tree.query(line.buffer(PARCEL_ON * 2)))]
    if not near:
        return [line]
    cut = line.difference(unary_union([l.buffer(PARCEL_ON) for l in near]))
    pieces = [cut] if cut.geom_type == "LineString" else \
        [x for x in getattr(cut, "geoms", []) if x.geom_type == "LineString"]
    out = []
    for p in pieces:
        if p.length < DIV_MIN:
            continue
        if min(Point(p.coords[0]).distance(start), Point(p.coords[-1]).distance(start)) > 1.0:
            continue                    # it does not begin on the wall, so it begins in mid-air
        clipped = p.intersection(block.buffer(1.0))
        if not clipped.is_empty and clipped.length > 0.1:
            out.append(clipped)
    return out


def side_wall_lines(geoms, fbt, parcel_of):
    """A division line from each shared wall between two houses, and from each free side wall of a
    detached or end house: the side wall continued square to the house's front, back through the
    block. A party wall between neighbours is emitted once, not once per house. Returns [(point,
    direction, the other house or None)].

    A wall two houses in different registered parcels share is still emitted — a title line does not
    always run the whole way between them, and where it stops the houses' fronts would otherwise be
    one face between two houses. `house_divisions` then trims the line by the title's own coverage,
    so where the title does run the whole way nothing is drawn, and where it stops at the front the
    front is cut."""
    tree = STRtree(geoms)
    walls = []          # (house i, midpoint, back direction along the wall)
    for i, g in enumerate(geoms):
        f = fbt[i]                       # points to the street (the front)
        c = list(g.minimum_rotated_rectangle.exterior.coords)
        for k in range(4):
            a, b = np.array(c[k]), np.array(c[(k + 1) % 4])
            d = b - a
            L = np.hypot(*d)
            if L < 1.0:
                continue
            d = d / L
            if abs(np.dot(d, f)) < 0.3:      # a side wall runs front-to-back, square to the front
                back = d if np.dot(d, f) <= 0 else -d
                walls.append((i, (a + b) / 2, back))
    out = []
    for i, m, back in walls:
        seg = LineString([tuple(m - back * 2), tuple(m + back * 2)])
        # the neighbour whose wall this is: the nearest, not whichever the index returns first. An
        # STRtree's `query` order depends on how the index was built, so taking the first match made
        # the answer depend on the window rather than on the geometry - and a different `shared` is a
        # different pair of side-wall lines, hence a different division.
        cand = [int(j) for j in tree.query(seg.buffer(0.6))
                if int(j) != i and geoms[int(j)].distance(Point(m)) <= 0.6]
        shared = min(cand, key=lambda j: (geoms[j].distance(Point(m)), j)) if cand else None
        # back is already oriented away from the front; the division runs on the way the wall runs
        if shared is None or i < shared:        # free side wall, or one line for the shared wall
            # the min-rectangle midpoint can sit a little off a rotated footprint's wall; put the
            # start on the wall itself so the division begins on the building and not in mid-air
            g = geoms[i]
            m2 = np.array(g.boundary.interpolate(g.boundary.project(Point(m))).coords[0])
            out.append((i, m2, back, shared is not None))
    return out


def house_divisions(block, geoms, fbt, parcel_of, parcel_lines=(), par_tree=None):
    """Candidate division lines for a block. From each shared wall between two houses, and from each
    free side wall of a detached or end house, a line square to the house's front running back from
    the wall to the block's far side. Between houses that do not share a wall, the perpendicular
    bisector of the gap, turned to the nearer house's axis. Returns [LineString].

    Every line is then trimmed by the registered boundaries' own coverage (`_uncovered`): a rule's
    division is not drawn along a line the survey already draws, but where the title stops the rule
    carries on, so a front split by a title line is split by the rule too."""
    tree = STRtree(geoms)
    lines = []
    for i, m, back, shared in side_wall_lines(geoms, fbt, parcel_of):
        line = _back(block, m, back)
        if not line.is_empty:
            lines += _uncovered(block, line, parcel_lines, par_tree, Point(m))
    for i, g in enumerate(geoms):
        c = np.array([g.centroid.x, g.centroid.y])
        # in index order, not the index's order: `near` below breaks a distance tie by which house it
        # is, and that has to be the same whichever window the block was divided from
        for j in sorted(int(j) for j in tree.query(g.buffer(BACK_ROWS))):
            if j <= i:
                continue
            h = geoms[j]
            if g.distance(h) <= 1.0:
                continue                     # shares a wall: the side-wall lines already divide it
            other = np.array([h.centroid.x, h.centroid.y])
            m = (c + other) / 2
            gap = other - c; gap = gap / (np.hypot(*gap) or 1)
            # the centroids are equidistant from m by construction, so compare the walls: the house whose
            # footprint reaches nearer the middle of the gap sets the line's direction
            near = j if h.distance(Point(m)) < g.distance(Point(m)) else i
            f = fbt[near]
            b = f if abs(np.dot(gap, f)) < 0.7 else np.array([-f[1], f[0]])
            line = _through(block, m, b, geoms)
            if not line.is_empty:
                lines += _uncovered(block, line, parcel_lines, par_tree, Point(m))
    return [l for l in lines if not l.is_empty and l.length > 1]


def _half_plane(line, pt, size=4000.0):
    """A large polygon on pt's side of line."""
    if line.geom_type == "MultiLineString":
        line = max(line.geoms, key=lambda g: g.length)
    c = list(line.coords)
    a, b = np.array(c[0]), np.array(c[-1])
    d = b - a; n = np.hypot(*d)
    if n == 0:
        return Polygon()
    nrm = np.array([-d[1], d[0]]) / n
    if np.dot(np.array([pt.x, pt.y]) - a, nrm) < 0:
        nrm = -nrm
    return Polygon([tuple(a - nrm * size), tuple(b - nrm * size),
                    tuple(b + nrm * size), tuple(a + nrm * size)])


def mid_point(p):
    return Point(p[0], p[1])


def _long(block):
    return max(block.bounds[2] - block.bounds[0], block.bounds[3] - block.bounds[1]) * 2 + 10


def _back(block, p, d):
    """The line from p (on a wall) in the wall's front-to-back direction, to the block's far side."""
    ln = LineString([tuple(p), tuple(p + d * _long(block))])
    cut = ln.intersection(block)
    pieces = [cut] if cut.geom_type == "LineString" else \
        [g for g in getattr(cut, "geoms", []) if g.geom_type == "LineString" and len(g.coords) > 1]
    pieces = [g for g in pieces if len(g.coords) > 1]
    return min(pieces, key=lambda g: Point(g.coords[0]).distance(Point(p))) if pieces else LineString()


def _through(block, p, d, geoms):
    """The line through p in direction d, dropped where it meets a building, so a division between
    the houses starts on a wall rather than crossing the gap in mid-air. Both ways are taken."""
    walls = unary_union([g.boundary for g in geoms])
    out = []
    for sgn in (1, -1):
        ln = LineString([tuple(p), tuple(p + d * _long(block) * sgn)])
        cut = ln.intersection(block).difference(walls.buffer(-0.05))
        pieces = [cut] if cut.geom_type == "LineString" else \
            [g for g in getattr(cut, "geoms", []) if g.geom_type == "LineString" and len(g.coords) > 1]
        pieces = [g for g in pieces if len(g.coords) > 1]
        if pieces:
            out.append(min(pieces, key=lambda g: Point(g.coords[0]).distance(Point(p))))
    return unary_union(out) if len(out) > 1 else (out[0] if out else LineString())


def back_lines(block, inside, fbt, evidence_lines, ev_tree, parcel_of=None, reach=2 * GARDEN):
    """One line for the back of a yard where two rows of houses back on to each other: the evidence
    line if one runs along the gap, else the line midway between the two rows, parallel to the
    longer row. A pair of houses back on to each other when each one's front points away from the
    other. `inside` is [(building index, polygon)]; returns {building index: LineString} so either
    house of a pair finds the same back line."""
    geoms = [b for _, b in inside]
    tree = STRtree(geoms)
    out = {}
    for i, g in enumerate(geoms):
        c = np.array([g.centroid.x, g.centroid.y])
        for j in sorted(int(j) for j in tree.query(g.buffer(reach))):
            if j <= i:
                continue
            if parcel_of is not None and parcel_of[i] is not None and parcel_of[j] is not None \
                    and parcel_of[i] != parcel_of[j]:
                continue                    # registered as separate parcels: their edges divide them
            h = geoms[j]
            other = np.array([h.centroid.x, h.centroid.y])
            v = other - c; d = np.hypot(*v)
            if d < 2.0 or d > reach:
                continue
            v = v / d
            # each house's front points away from the other: they face opposite streets
            if np.dot(v, fbt[i]) > -0.3 or np.dot(v, fbt[j]) < 0.3:
                continue
            # and nothing stands in the gap: two houses back on to each other across open ground,
            # not across a third building
            gap = LineString([tuple(c + v * 1.0), tuple(other - v * 1.0)])
            if any(g2.intersects(gap) for g2 in geoms if g2 is not g and g2 is not h):
                continue
            mid = (c + other) / 2
            # the back line runs along the gap, square to the two fronts (parallel to the rows), so
            # the longer house's own long side decides its direction
            li = g.minimum_rotated_rectangle.length
            lj = h.minimum_rotated_rectangle.length
            nrm = fbt[i] if li >= lj else fbt[j]
            axis = np.array([-nrm[1], nrm[0]])
            line = LineString([tuple(mid - axis * 200), tuple(mid + axis * 200)])
            if ev_tree is not None:
                near = [evidence_lines[k] for k in ev_tree.query(mid_point(mid).buffer(4.0))]
                best = None
                for e in near:
                    if e.geom_type == "LineString" and e.distance(LineString([tuple(mid), tuple(c)])) < 3.0:
                        dd = e.distance(mid_point(mid))
                        if best is None or dd < best[0]:
                            best = (dd, e)
                if best:
                    line = best[1]
            # clipped to the block, so its ends land on the block's far side (a building or a
            # corridor) and never in open land: the growth cap below keeps it only the yard's back
            line = line.intersection(block.buffer(1.0))
            if line.is_empty or line.length < 1:
                continue
            if line.geom_type == "MultiLineString":
                line = max(line.geoms, key=lambda g: g.length)
            if line.geom_type != "LineString":
                continue
            out[inside[i][0]] = line
            out[inside[j][0]] = line
    return out


def garden_caps(block, geoms, gidx, fbt, backs, skip=()):
    """The back edge of each house's garden cap, as a line: the side of its mitred GARDEN reach
    away from the street. A house that has a shared back line (backs) does not get one. The line is
    the reach's back edge only, CAP_OVERHANG metres past the house's corners either way, so the
    part beyond the division lines either side is a dangle that polygonize discards. It is a cut of
    the block like any other, so where a plot backing on to open land ends, it ends on a face
    boundary and two neighbours agree on it."""
    out = []
    for i, g in enumerate(geoms):
        if gidx[i] in backs:
            continue
        if gidx[i] in skip:
            continue                   # the registered parcel is where this plot ends
        f = np.asarray(fbt[i], float)
        a = np.array([-f[1], f[0]])
        c = np.array([g.centroid.x, g.centroid.y])
        vs = [np.array(p) for p in g.exterior.coords]
        depth = max(float(np.dot(v - c, -f)) for v in vs)
        half = max(abs(float(np.dot(v - c, a))) for v in vs) + CAP_OVERHANG
        m = c - f * (depth + GARDEN)
        seg = LineString([tuple(m - a * half), tuple(m + a * half)]).intersection(block.buffer(0.5))
        parts = [seg] if seg.geom_type == "LineString" else \
            [x for x in getattr(seg, "geoms", []) if x.geom_type == "LineString"]
        for x in parts:
            if x.length > 1:
                out.append(x)
    return out


def _label_outside(p, bunion, B, parent=None):
    """What lies beyond the region's boundary where a one-face piece has its midpoint p.

    A *building* is a building and the worked area's edge is the edge. The question is what the rest
    is, and the answer depends on what is being divided:

    - dividing a **whole block**, as stage 3 did, everything else is a *corridor*: a block is the
      complement of the corridors and the buildings, so beyond its boundary is always one of those
      two (a sliver between a corridor and a house is in no block, and a front along it would
      otherwise never be drawn).
    - dividing a **worked piece**, as stage 2 does, the *region* is the parent block, so beyond the
      region is only ever outside the parent - a corridor - and inside it is the rest of the block,
      which is open land. Calling that open land a corridor made a plot against open land into a plot
      against a street: a `front` with the zone's material and a gate, ending where the piece outline
      turned away from any real street.

    So the caller passes the **parent block** - the region that was cut, not the piece - and the
    answer is two-valued: inside it is open, beyond it exactly as stage 3 answered. There is no
    `piece` parameter: an earlier version took one and never read it, because what decides the answer
    is the region's boundary, and the region is the parent."""
    # a square with no buildings at all unions to an empty GeometryCollection, whose .boundary is
    # None rather than an empty line, so it is asked for the boundary only when there is one. (An
    # out-of-town square can hold nothing but open land, a couple of lanes and a farm track -
    # measured: square -7,2 has no footprints and crashed the whole city run on this.)
    bb = bunion.boundary if bunion is not None and not bunion.is_empty else None
    if bb is not None and bb.distance(p) < 0.01:
        return ("building",)
    if B is not None and B.boundary.distance(p) < 0.01:
        return ("edge",)
    # The question is whether the edge lies *on* the parent block's boundary, and a bare `contains`
    # cannot answer it: a probe on the boundary is contained by the parent wherever the stored parent
    # is a hair wider than the block that was cut, so it answers "inside" where the truth is that the
    # ground beyond is a corridor (measured: the probe sat 0.0000 m from both the parent's boundary
    # and the pass-1 corridor union, and was still reported as inside).
    if parent is not None:
        if parent.boundary.distance(p) <= PARENT_ON:
            return ("corridor",)     # on the parent's own edge: beyond it is what stage 3 saw
        if parent.contains(p):
            return ("open",)         # strictly inside the parent: the rest of the block, open land
    return ("corridor",)


def ring_adjacency(faces, lines, log=None):
    """The faces either side of each piece of the noded linework, from the rings alone — no probing.
    Every ring edge of a polygonize face is an edge of the noded linework, so for each piece of
    `lines` the faces on its two sides are the faces recorded for its own coordinate pairs. A piece
    with two faces is an interior boundary, with one is on the block's outside, with none is a
    dangle and is ignored. Returns (pieces, side_a, side_b): the pieces of `lines` with their face
    either side (a face index or None).

    A piece is looked up by *every* consecutive pair of its coordinates, not just one: a pair key
    can differ after rounding at a junction, or a piece can be a LinearRing whose first pair is its
    closing pair. If every pair misses, the faces whose boundary is within 0.01 m of the piece's
    midpoint are taken from an STRtree — that should be a handful of pieces, never hundreds, and the
    count is logged so a run where it is not can be seen."""
    ring = collections.defaultdict(set)
    for fi, f in enumerate(faces):
        for r in [f.exterior] + list(f.interiors):
            cs = list(r.coords)
            for a, b in zip(cs, cs[1:]):
                ring[_edge_key(a, b)].add(fi)
    ftree = STRtree([f.boundary for f in faces]) if faces else None

    pieces, sa, sb = [], [], []
    fallback = 0
    for piece in (lines.geoms if hasattr(lines, "geoms") else [lines]):
        if getattr(piece, "geom_type", None) != "LineString" or piece.length < 0.05:
            continue
        cs = list(piece.coords)
        # every consecutive pair is looked up, so a piece is found however polygonize threaded it;
        # the faces that come back are then kept only if their boundary runs along most of the piece
        # (a pair at a junction can name a third face the piece only touches a corner of)
        cand = set()
        for a, b in zip(cs, cs[1:]):
            cand |= ring.get(_edge_key(a, b), set())
        if not cand and ftree is not None:
            fallback += 1
            mid_all = piece.interpolate(0.5, normalized=True)
            for k in ftree.query(mid_all.buffer(0.05)):
                cand.add(k)
        fs = []
        for k in cand:
            try:
                seg = piece.intersection(faces[k].boundary)
            except Exception:
                continue
            if not seg.is_empty and seg.length > 0.5 * piece.length:
                fs.append(k)
        fs = list(dict.fromkeys(fs))
        if len(fs) == 2:
            a, b = fs[0], fs[1]
        elif len(fs) == 1:
            a, b = fs[0], None
        else:
            a, b = None, None
        pieces.append(piece); sa.append(a); sb.append(b)
    if log is not None:
        log(f"      ring map: {fallback} pieces fell back to the face-boundary tree")
    return pieces, sa, sb


def _edge_key(a, b):
    ka = (round(a[0], 6), round(a[1], 6)); kb = (round(b[0], 6), round(b[1], 6))
    return (ka, kb) if ka <= kb else (kb, ka)


def _end_direction(coords, end):
    """A run's outward unit direction at one end, and the point at that end. `end` is 0 for the start
    and -1 for the finish. The direction is the end point minus its nearest neighbour along the run,
    taken from the first coordinate that really differs from the end point, so a run holding repeated
    coordinates still gets a usable direction rather than 0/0. Returns (None, None) when every
    coordinate coincides."""
    p = np.array(coords[end], float)
    n_coords = len(coords)
    order = range(1, n_coords) if end == 0 else range(n_coords - 2, -1, -1)
    for i in order:
        q = np.array(coords[i], float)
        v = p - q
        n = np.hypot(*v)
        if n > 1e-9:
            return p, v / n
    return None, None


SLIVER_WIDTH = 1.0      # metres: an open strip between two plots this narrow is a division artefact
SLIVER_MIN_LENGTH = 2.0  # metres: shorter than this is a corner, not a strip
SLIVER_ALLEY = 0.5      # metres: a source way running this far inside it means a real passage


def _inscribed_width(poly):
    """The widest a shape gets, in metres: the **diameter** of the largest circle that fits inside.

    `maximum_inscribed_circle` returns a LineString from the shape's core to the point on its edge
    where the largest empty circle touches, so `c.length` is the circle's **radius**, not its
    diameter. Reading it as a width made every strip look half as wide as it is: a 1.5 m alley
    measured 0.75 and passed a one-metre sliver test."""
    try:
        c = shapely.maximum_inscribed_circle(poly, tolerance=0.05)
        return 2.0 * c.length if c.geom_type == "LineString" else None
    except Exception:
        return None


def _frontage_parcels(par_lines, region, B=None, bunion=None):
    """Registered boundaries with the stretches that run just inside the street taken off, and the
    ends left by that carried on to the street's edge.

    A registered extent is indicative, and along a street its front edge lies 0.1 to 0.5 m inside the
    block's own edge rather than on it. Cut into the block, that leaves a long strip a few tenths of a
    metre wide between the street and the gardens. The strip can only go to one owner, though it lies
    in front of several gardens, so every other garden beside it ends up with two fronts: the street's
    edge and its own registered edge, a hand's width apart. Measured on square -1,2, 365 of the 388
    doubled walls were this. Within `SLIVER_WIDTH` of the street the street's edge *is* the frontage,
    so that is the line kept: a registered boundary coming up to the street is carried on to meet it,
    and one running alongside it is dropped there.

    Only the street counts: the region's edge along a house or along the worked area's edge is not a
    frontage, and pulling a registered line onto the worked area's edge moved a garden 0.37 m off the
    square's edge, leaving a stub over the edge too short to walk."""
    polys = region.geoms if region.geom_type == "MultiPolygon" else [region]
    street = unary_union([p.exterior for p in polys])
    if B is not None:
        street = street.difference(B.boundary.buffer(0.01))
    if bunion is not None and not bunion.is_empty:
        street = street.difference(bunion.buffer(0.01))
    if street.is_empty:
        return par_lines
    zone = street.buffer(SLIVER_WIDTH).intersection(region)
    shapely.prepare(zone)
    out = []
    for line in par_lines:
        if not zone.intersects(line):
            out.append(line)
            continue
        ends = {line.coords[0][:2], line.coords[-1][:2]}
        kept = line.difference(zone)
        for part in getattr(kept, "geoms", [kept]):
            if part.geom_type != "LineString" or part.length < 0.05:
                continue
            cs = [c[:2] for c in part.coords]
            # an end the zone cut goes on to the street's edge, a little past it so the noding
            # meets the edge rather than stopping a rounding error short
            if cs[0] not in ends:
                cs = [_to_street(street, cs[0])] + cs
            if cs[-1] not in ends:
                cs = cs + [_to_street(street, cs[-1])]
            out.append(LineString(cs))
    return out


def _to_street(street, end):
    p = street.interpolate(street.project(Point(end)))
    d = np.array([p.x - end[0], p.y - end[1]])
    n = np.hypot(*d)
    return tuple(np.array(end) + d * (1 + 0.05 / n)) if n > 1e-9 else (p.x, p.y)


TWIN = 1.3              # metres: two boundaries closer than this, running together, are one boundary
TWIN_ANGLE = math.radians(25)
TWIN_STEP = 0.5         # metres between the points a line is tested at
TWIN_MIN = 1.0          # metres: a shorter shared stretch is a crossing, not a boundary drawn twice


def _street_edge(region, B=None, bunion=None):
    polys = region.geoms if region.geom_type == "MultiPolygon" else [region]
    street = unary_union([p.exterior for p in polys])
    if B is not None:
        street = street.difference(B.boundary.buffer(0.01))
    if bunion is not None and not bunion.is_empty:
        street = street.difference(bunion.buffer(0.01))
    return street


def _directions(line, d):
    """The unit direction of `line` at each distance in `d` along it."""
    a = shapely.line_interpolate_point(line, np.maximum(d - 0.25, 0.0))
    b = shapely.line_interpolate_point(line, np.minimum(d + 0.25, line.length))
    v = shapely.get_coordinates(b) - shapely.get_coordinates(a)
    n = np.hypot(v[:, 0], v[:, 1])
    n[n < 1e-9] = 1.0
    return v / n[:, None]


def _twin_stretches(line, held, tree, ways_tree, ways):
    """The stretches of `line`, as (start, end) metres along it, that run within TWIN of a line in
    `held` and in nearly the same direction, with no mapped way between the two."""
    L = line.length
    if L < TWIN_MIN:
        return []
    d = np.linspace(0.0, L, max(2, int(L / TWIN_STEP) + 1))
    pts = shapely.line_interpolate_point(line, d)
    mine = _directions(line, d)
    hit = np.zeros(len(d), bool)
    pi, hi = tree.query(pts, predicate="dwithin", distance=TWIN)
    for p, h in zip(pi, hi):
        if hit[p]:
            continue
        other = held[int(h)]
        t = other.project(pts[p])
        q = other.interpolate(t)
        u = _directions(other, np.array([t]))[0]
        if abs(mine[p] @ u) < math.cos(TWIN_ANGLE):
            continue
        # a mapped footway between the two is a real passage, and both its sides stand
        if ways_tree is not None:
            gap = LineString([pts[p], q])
            if gap.length > 0.2 and any(ways[int(w)].distance(gap.interpolate(0.5, normalized=True)) < 0.3
                                        for w in ways_tree.query(gap)):
                continue
        hit[p] = True
    runs, start = [], None
    for k in range(len(d)):
        if hit[k] and start is None:
            start = k
        if (not hit[k] or k == len(d) - 1) and start is not None:
            end = k if hit[k] else k - 1
            a, b = d[start], d[end]
            # the run reaches out half a step either side, to the ends when it is that close
            a = 0.0 if start == 0 else a - TWIN_STEP / 2
            b = L if end == len(d) - 1 else b + TWIN_STEP / 2
            if b - a >= TWIN_MIN:
                runs.append((a, b))
            start = None
    return runs


def _one_boundary(ranked, ways=(), net=None):
    """Lines, ranked strongest first, with every stretch that runs alongside a stronger line taken off,
    and the ends that leaves carried on to meet it.

    The block is cut by several sets of lines that each describe the same fences in their own way: the
    street's edge, walls the lidar sees, registered parcel extents, and the divisions guessed between
    houses. Where two of them trace one fence a few tenths of a metre apart, or leave one corner at a
    shallow angle, both were cut and both were drawn: measured on four squares, three quarters of the
    doubled walls were in the partition itself, half of them such wedges and half parallel runs. Here
    each fence is drawn once, by the most trusted line that describes it. Within a rank the earlier line
    (in the caller's geometric order) holds, and only stretches inside `net` - the lines that bound
    ground - can stand in for another. Returns, for every line of every rank but the first (which is
    kept whole), (the line, what is kept of it, what it gave away or None, its rank)."""
    first = [g for l in ranked[0] if not l.is_empty for g in getattr(l, "geoms", [l])
             if g.geom_type == "LineString"]
    tagged = [(r, g) for r, group in enumerate(ranked[1:], 1) for l in group for g in getattr(l, "geoms", [l])
              if g.geom_type == "LineString" and not g.is_empty]
    rest = [g for _, g in tagged]
    ways = [w for w in ways if w is not None and not w.is_empty]
    ways_tree = STRtree(ways) if ways else None
    # one index over every line: a line is tested only against those before it, as they were kept
    allx = first + rest
    tree = STRtree(allx)
    kept = {i: [l] for i, l in enumerate(first)}
    # only the stretches that bound ground can stand in for another line: a loose end or a line
    # just outside the block divides nothing, and the ground either side of the weaker would merge
    bounding = {}

    def bound(i):
        out = []
        for l in kept[i]:
            g = l if net is None or net.contains(l) else l.intersection(net)
            out += [p for p in getattr(g, "geoms", [g]) if p.geom_type == "LineString" and p.length > 0.05]
        bounding[i] = out
    for i in kept:
        bound(i)
    out = []
    for n, part in enumerate(rest):
        i = len(first) + n
        cand = [int(j) for j in tree.query(part.buffer(TWIN)) if int(j) < i]
        held = [g for j in sorted(cand) for g in bounding.get(j, [])]
        if not held:
            kept[i] = [part]; bound(i); out.append((part, [part], None, tagged[n][0]))
            continue
        local = STRtree(held)
        runs = _twin_stretches(part, held, local, ways_tree, ways)
        if not runs:
            kept[i] = [part]; bound(i); out.append((part, [part], None, tagged[n][0]))
            continue
        L = part.length
        keep, at = [], 0.0
        for a, b in runs:
            if a - at >= 0.05:
                keep.append((at, a))
            at = b
        if L - at >= 0.05:
            keep.append((at, L))
        pieces = []
        for a, b in keep:
            piece = substring(part, a, b)
            if piece.geom_type != "LineString" or piece.length < 0.05:
                continue
            cs = [c[:2] for c in piece.coords]
            if a > 0.0:
                cs = [_meet(held, local, cs[0])] + cs
            if b < L:
                cs = cs + [_meet(held, local, cs[-1])]
            pieces.append(LineString(cs))
        kept[i] = pieces
        bound(i)
        given = unary_union([substring(part, a, b) for a, b in runs])
        out.append((part, pieces, given, tagged[n][0]))
    return out


def _meet(held, tree, end):
    """`end` carried on to the nearest held line, a little past it so the noding meets it."""
    k = int(tree.query_nearest(Point(end))[0])
    return _to_street(held[k], end)


def _absorb_plot_slivers(faces, face_label, written, block, ways, log=print):
    """Split a thin open strip between two plots down its middle, so the neighbours share one edge.

    The block division cuts each plot from its own house outwards, and where two plots nearly meet it
    leaves a strip of open ground a few centimetres wide. Both plots then draw their own boundary
    along their own side of that strip, which is what `check_map` reports as "walls doubled" - and the
    player sees two hedges, an unwalkable gap apart, where there should be one boundary.

    A strip is merged only when all three hold:

      - its **maximum inscribed width** is under `SLIVER_WIDTH`, measured as the widest circle that
        fits inside it - a long thin strip can have a large length and area and still be a sliver, and
        the longest-edge or bounding-box measures do not see that;
      - it is **bounded by plots along both of its long sides**, so merging it removes a doubling
        rather than an open yard;
      - **no source way runs inside it**. A mapped footway is a real alley, and merging one would
        delete a passage the map says exists.

    The merged faces take the label of the nearest plot, so the two neighbours end up adjoining and
    the strip's two boundaries become one shared edge. Nothing is moved and no geometry is invented:
    the strip's area goes to whichever plot is nearer, and the division runs along the middle of what
    was already there.

    Returns (face_label, faces), with the strip's area added to its neighbour and the strip gone."""
    plots = [i for i in written if face_label[i][0] == "plot"]
    opens = [i for i in written if face_label[i][0] == "open"]
    if not plots or not opens:
        return face_label, faces
    merged = 0
    total = 0.0
    for i in opens:
        f = faces[i]
        if f.area <= 0 or f.area > 400 or f.length < SLIVER_MIN_LENGTH:
            continue
        w = _inscribed_width(f)
        if w is None or w > SLIVER_WIDTH:
            continue
        # bounded by plots along both long sides: most of its boundary is a plot's boundary
        touch = 0.0
        near = []
        for j in plots:
            g = faces[j]
            if g.distance(f) > 0.05:
                continue
            shared = f.boundary.intersection(g.boundary).length
            if shared > 0.0:
                touch += shared
                near.append((shared, j))
        if not near or touch < 0.5 * f.length:
            continue
        # a real passage survives: a source way running inside it
        if ways and any(wl.intersection(f).length > SLIVER_ALLEY for wl in ways
                        if wl.distance(f) < 1.0):
            continue
        _, j = max(near)
        # give the strip's ground to the nearer plot, and drop the strip
        try:
            joined = unary_union([faces[j], f])
        except Exception:
            continue
        if joined.geom_type != "Polygon" or not joined.is_valid:
            continue
        faces[j] = joined
        face_label[i] = face_label[j]
        merged += 1
        total += f.area
    if merged:
        log(f"      {merged} open strips between plots merged into a neighbour ({total:.0f} m2)")
    return face_label, faces


ARM_WIDTH = 1.6         # metres: a part of a face narrower than this is an arm, not ground to use
ARM_MIN_LENGTH = 2.0    # metres: an arm shorter than this is a corner
ARM_SHARE = 0.6        # a re-cut face this much inside an arm goes with it
ARM_STRAIGHT = 0.25     # metres: the opening's round ends are cut as straight lines, within this
ARM_KEEP = 10.0         # m^2: a plot is never left with less than this by giving an arm away


def _merged_ground(recut, faces, face_label, floor=1.0, strip=2.0):
    """Where a re-cut joins real ground of two owners. Handing over a strip is the point - one fence
    drawn instead of two - but ground wider than `strip` changing hands means a boundary given away
    left a gap, and a garden would join the land beside it. Returns the ground that would change
    hands, one shape per leak."""
    old = STRtree(faces)
    leaks = []
    for f in recut:
        parts = collections.defaultdict(list)
        for k in old.query(f):
            x = faces[int(k)].intersection(f)
            if x.area > floor:
                parts[face_label[int(k)]].append(x)
        if len(parts) < 2:
            continue
        by_area = sorted(parts.values(), key=lambda xs: -sum(x.area for x in xs))
        for xs in by_area[1:]:
            u = unary_union(xs)
            w = _inscribed_width(u)
            if w is None or w > strip:
                leaks.append(u)
    return leaks


def _recut(region, lines, faces, face_label):
    """The block cut again along `lines`, each new face keeping the label of the old face it mostly
    covers. Returns (faces, labels), or None when the cut came to nothing."""
    recut = [f for f in polygonize(lines) if region.contains(f.representative_point())]
    if not recut:
        return None
    old = STRtree(faces)
    labels = []
    for f in recut:
        best, lab = 0.0, ("open",)
        for k in old.query(f):
            a = faces[int(k)].intersection(f).area
            if a > best:
                best, lab = a, face_label[int(k)]
        if best < SLIT:
            # a hairline slit overlaps nothing, and left open it was drawn as a hedge out and back
            # through whatever it lay in, a house included: it belongs to the ground it lies in
            g = f.buffer(0.05)
            for k in old.query(g):
                a = faces[int(k)].intersection(g).area
                if a > best:
                    best, lab = a, face_label[int(k)]
        labels.append(lab)
    return recut, labels


def _thin_arms(faces, face_label, ways):
    """The thin arms of one owner's ground that run between two other owners' ground, as
    [(arm polygon, label it should take, its owner's label, cut lines that separate it)].

    A neck or arm a metre or so wide that runs between two neighbours' ground has a boundary down
    each side, drawn a hand's width apart: two walls where the player expects one. Giving the arm to
    the neighbour it shares the longer side with leaves a single boundary, shared by the two.

    An owner's faces are taken together, because a neck often crosses from one face of the same
    owner into the next and is thin in neither."""
    tree = STRtree(faces)
    by_label = collections.defaultdict(list)
    for f, lab in zip(faces, face_label):
        by_label[lab].append(f)
    arms = []
    for lab, fs in by_label.items():
        union = unary_union(fs)
        own_area = union.area
        for comp in getattr(union, "geoms", [union]):
            if comp.geom_type != "Polygon" or comp.area < 0.5:
                continue
            opened = comp.buffer(-ARM_WIDTH / 2).buffer(ARM_WIDTH / 2)
            rest = comp if opened.is_empty else comp.difference(opened)
            for part in getattr(rest, "geoms", [rest]):
                if part.geom_type != "Polygon" or part.area < 0.5:
                    continue
                cs = list(part.minimum_rotated_rectangle.exterior.coords)
                length = max(math.dist(cs[0], cs[1]), math.dist(cs[1], cs[2]))
                if length < ARM_MIN_LENGTH:
                    continue
                width = _inscribed_width(part)
                if width is None or width > ARM_WIDTH:
                    continue
                if ways and any(wl.intersection(part).length > SLIVER_ALLEY for wl in ways
                                if wl.distance(part) < 1.0):
                    continue
                share = collections.defaultdict(float)
                ring = part.exterior
                for k in tree.query(part.buffer(0.05)):
                    k = int(k)
                    if face_label[k] == lab:
                        continue
                    share[face_label[k]] += ring.intersection(faces[k].boundary.buffer(0.02)).length
                if sum(share.values()) < 1.6 * length:
                    continue
                target = max(share, key=lambda l: (share[l], str(l)))
                if lab[0] == "plot" and own_area - part.area < ARM_KEEP:
                    continue
                own_area -= part.area
                cut = ring.difference(comp.boundary.buffer(0.01))
                arms.append((part, target, lab, [_reach(g, comp.boundary)
                                                 for g in getattr(cut, "geoms", [cut])
                                                 if g.geom_type == "LineString" and g.length > 0.05]))
    return arms


def _reach(line, edge, past=0.05):
    """The line with each end carried to the edge it was cut from and a little past it, so the
    noding meets the edge instead of stopping a rounding error short."""
    cs = [tuple(c[:2]) for c in line.simplify(ARM_STRAIGHT).coords]
    out = []
    for end in (cs[0], cs[-1]):
        q = edge.interpolate(edge.project(Point(end)))
        d = np.array([q.x - end[0], q.y - end[1]])
        n = np.hypot(*d)
        out.append(tuple(np.array([q.x, q.y]) + d / n * past) if n > 1e-9 else end)
    return LineString([out[0]] + cs + [out[1]])


def _absorb_thin_arms(region, lines, faces, face_label, ways, log=print):
    """Give the thin arms found by `_thin_arms` to the neighbour they lie against, re-cutting the
    block along each arm's outline after every face has its owner (cutting before the growing moved
    gardens to open land). Returns (lines, faces, face_label)."""
    arms = _thin_arms(faces, face_label, ways)
    if not arms:
        return lines, faces, face_label
    extra = [g for _, _, _, cuts in arms for g in cuts]
    new_lines = unary_union([lines] + extra) if extra else lines
    got = _recut(region, new_lines, faces, face_label)
    if got is None:
        return lines, faces, face_label
    recut, labels = got
    atree = STRtree([a for a, _, _, _ in arms])
    moved = 0.0
    for n, f in enumerate(recut):
        for k in atree.query(f):
            arm, lab, _, _ = arms[int(k)]
            if labels[n] != lab and arm.intersection(f).area >= ARM_SHARE * f.area:
                moved += f.area
                labels[n] = lab
                break
    log(f"      {len(arms)} thin arms between neighbours given to one of them ({moved:.0f} m2)")
    return new_lines, recut, labels


def _absorb_slivers(faces, face_label, pieces, side_a, side_b):
    share = collections.defaultdict(float)
    for p, a, b in zip(pieces, side_a, side_b):
        if a is not None and b is not None and a != b:
            share[(a, b)] += p.length
    neighbours = collections.defaultdict(list)
    for (a, b), L in share.items():
        neighbours[a].append((L, b)); neighbours[b].append((L, a))
    face_label = list(face_label)
    changed = True
    while changed:
        changed = False
        for i, f in enumerate(faces):
            if f.area >= SLIVER_AREA and f.area / max(f.length, 1e-9) >= SLIVER_THIN:
                continue
            if not neighbours[i]:
                continue
            _, j = max(neighbours[i])
            if face_label[j] != face_label[i]:
                face_label[i] = face_label[j]
                changed = True
    return face_label


def make_plots(block, buildings, evidence_lines, ev_tree, zone, axes, fronts, bunion, B,
               parcels=None, parent=None, log=print, sliver_ways=()):
    """Divide one block between the buildings in it. Every cut goes into one polygonize; each face
    then goes to the building it is nearest to by path, and is a plot's if the growing reached it
    within reach GARDEN of it (otherwise open land). Returns (plots, edges): plots as
    [(polygon, 'plot' or 'open', building index or None)], and edges as every segment of the noded
    network with a label either side, [(LineString, label, label)].

    `parcels` (a Parcels, or None where a map has none) are the registered property extents. Their
    boundaries join the cuts as evidence of the highest trust, and a face is a house's plot only
    inside that house's own parcel: so a plot is the parcel the house stands in, divided among the
    houses in it, and never spills next door. Where a house's title is not registered nothing
    changes, and the stage 1 divisions divide the block as they always did."""
    # The *region* is what is cut and polygonized: the parent block when the caller gives one, so the
    # same lines and the same faces whichever worked piece or square is asking - which is the point
    # of stage 3b. `block` is then only the worked piece, and it decides two things: which houses
    # seed the growing, and which open ground this piece writes out.
    #
    # Cutting the *piece* instead puts its outline into the line network, so a big open face at the
    # edge of the block is sliced by a line that is not a boundary in the ground, and the sliver
    # nearest a house is swallowed into a plot: measured, stage 3's largest open face was 93,221 m²
    # against 44,099 m² when the piece was cut, and 147 drawn edges lay along piece outlines where no
    # real boundary runs.
    region = parent if parent is not None else block
    shapely.prepare(region)
    btree0 = STRtree([b for _, b in buildings])
    # Sorted by global building index before anything uses it. An STRtree's `query` returns items in an
    # order that depends on how the index was built, so the same buildings come back in a different
    # order when the window holds more of them - and this list feeds `geoms`, which feeds
    # `side_wall_lines` and the tie-breaks in `house_divisions`. Measured: the same 37 buildings in a
    # different order, from a window 200 m larger, cut one piece into 47 plots instead of 45, with the
    # cut lines differing by a centimetre and the total area identical. The order has to come from the
    # data, not from the index.
    inside = sorted((buildings[k] for k in btree0.query(region.buffer(0.5))
                     if buildings[k][1].distance(region) < 0.5),
                    key=lambda ib: ib[0])
    # the piece's own houses: the only ones that may seed the growing. Two houses in different pieces
    # of one block are at least 2 * REACH_GROW apart (a piece is the block within REACH_GROW of its
    # houses), which is beyond any plot's reach, so they can never compete for a face.
    # the piece's own houses, as *global building indices*. `btree0.query` returns positions in
    # `buildings`, and a position is not a building index when the caller passes a window's subset
    # (pass 2 does), so the position is mapped back through `buildings` - the seed test below
    # compares against `inside[i][0]`, which is a global index.
    mine = {buildings[k][0] for k in btree0.query(block.buffer(0.5))
            if buildings[k][1].distance(block) < 0.5}

    # evidence runs near the block, carried EXTEND past each end so they close faces
    # Sorted by geometry: `ev_tree.query` returns them in an order that depends on how the tree was
    # built, and `unary_union` below nodes them differently when the order changes (measured: 46 plots
    # became 51 from a shuffled evidence list). The key must be geometric, not the line's position in
    # the caller's list, so that shuffling that list still gives the same order.
    ev = []
    for k in sorted(int(k) for k in ev_tree.query(region.buffer(EXTEND))):
        l = evidence_lines[k]
        if l.geom_type != "LineString" or l.length < 1:
            continue
        c = list(l.coords)
        # the run's direction at each end, taken from the first pair of coordinates that actually
        # differ: a line can hold repeated coordinates (a wall run that doubles back on itself, or
        # two joins at the same point), and a pair that coincides gives 0/0 and a nan direction,
        # which reaches GEOS as a LineString it cannot read ("edge direction cannot be determined").
        a, d = _end_direction(c, 0)
        y, e = _end_direction(c, -1)
        if a is None or y is None:
            continue                    # every coordinate the same: nothing to extend
        ev.append(LineString([tuple(a + d * EXTEND)] + c + [tuple(y + e * EXTEND)]))
    ev.sort(key=lambda l: (round(l.bounds[0], 2), round(l.bounds[1], 2),
                           round(l.bounds[2], 2), round(l.bounds[3], 2), round(l.length, 2)))

    geoms = [b for _, b in inside]
    gidx = [i for i, _ in inside]
    if axes is None:
        axes = {i: a for (i, _), a in zip(inside, building_axes(geoms))}
    if fronts is None:
        fronts = {i: np.array([-axes[i][1], axes[i][0]]) for i, _ in inside}
    fbt = [fronts[i] for i in gidx]

    # the registered parcel each house stands in, and the boundary lines of the parcels near this
    # block. A house whose title the download does not have keeps None and is divided by the rules.
    par_lines = parcels.near(region) if parcels is not None else []
    # sorted by geometry so the polygonize below is independent of the caller's parcel order
    par_lines.sort(key=lambda l: (round(l.bounds[0], 2), round(l.bounds[1], 2),
                                  round(l.bounds[2], 2), round(l.bounds[3], 2), round(l.length, 2)))
    par_tree = STRtree(par_lines) if par_lines else None
    parcel_of = [parcels.index_of(g) if parcels is not None else None for g in geoms]
    # a house in a parcel of its own needs no inferred division: the parcel's edge is its boundary
    covered = {i for i, k in zip(gidx, parcel_of) if k is not None}

    cuts, back_cuts, caps = [], [], []
    if inside:
        cuts = house_divisions(region, geoms, fbt, parcel_of, par_lines, par_tree)
        if not cuts and not par_lines:
            pts = []
            for b in geoms:
                bd = b.exterior
                n = max(4, int(bd.length / 3))
                for k in range(n):
                    p = bd.interpolate(k / n, normalized=True); pts.append((p.x, p.y))
            vedges = shapely.voronoi_polygons(MultiPoint(pts), extend_to=region.buffer(5), only_edges=True)
            cuts = [vedges.intersection(region.buffer(1))]
        backs = back_lines(region, inside, fbt, evidence_lines, ev_tree, parcel_of)
        back_cuts = list({(round(b.bounds[0], 2), round(b.bounds[1], 2),
                          round(b.bounds[2], 2), round(b.bounds[3], 2)): b for b in backs.values()}.values())
        caps = garden_caps(region, geoms, gidx, fbt, backs, skip=covered)
    else:
        backs = {}

    # ONE polygonize: every cut is a line, and nothing is cut after this point
    lines = unary_union([region.boundary] + list(cuts) + ev + par_lines + list(back_cuts) + caps)
    faces = [f for f in polygonize(lines) if region.contains(f.representative_point())]
    if not faces:
        faces = [region]
    log(f"   block: {len(inside)} buildings, {len(cuts)} division lines, {len(ev)} evidence lines, "
        f"{len(par_lines)} parcel lines, {len(back_cuts)} back lines, {len(caps)} caps, "
        f"{len(faces)} faces")

    # the faces either side of every piece of the noded linework, from the rings alone (topology,
    # which cannot miss where a probe could land on a neighbouring line), and whether each piece
    # lies on an evidence line. The same map gives the adjacency the region growing walks. A piece
    # that lies on a registered parcel boundary is marked with the higher cost: the growing crosses
    # it only where nothing else can reach, so a plot is the parcel its house stands in.
    evtree = STRtree(ev) if ev else None
    pieces, side_a, side_b = ring_adjacency(faces, lines, log=log)
    adj = collections.defaultdict(list)
    for p, a, b in zip(pieces, side_a, side_b):
        if a is not None and b is not None and a != b:
            cost = 0.0
            if p.length > 0.1 and p.is_valid:
                mpt = p.interpolate(0.5, normalized=True)
                if par_tree is not None and on_line(par_tree, par_lines, mpt, 0.3):
                    cost = PARCEL_CROSS
                elif evtree is not None and any(ev[int(e)].distance(mpt) < 0.3
                                                for e in np.atleast_1d(evtree.query(mpt.buffer(0.3)))):
                    cost = CROSS
            adj[a].append((b, cost)); adj[b].append((a, cost))
    log(f"      {len(pieces)} pieces, {sum(len(v) for v in adj.values()) // 2} adjacency links")

    # region growing: seeds are the faces a building stands in, then Dijkstra over face-centroid
    # distances, crossing an evidence line costing CROSS metres more. A face within SEED_REACH of two
    # houses (two houses at distance 0, as a shared front wall's two fronts are) goes to the house
    # that shares the longer *boundary* with it, not to whichever the tree happened to return first:
    # the first-returned house took the whole face and then lost it, because the face lies outside
    # its own title, so the front came out open land between two houses.
    btree = STRtree(geoms)
    dist = [math.inf] * len(faces); own = [None] * len(faces); heap = []
    shared_by = 0
    for i, f in enumerate(faces):
        # only this piece's own houses seed: a face in the rest of the parent block is not this
        # piece's to give away, and two houses in different pieces are 2 * REACH_GROW apart, beyond
        # any plot's reach, so the other pieces' houses cannot compete for it anyway
        # `btree` is an index over `geoms`, so a hit `k` is a position in `inside`, whose own
        # building index is `inside[k][0]` (`gidx[k]`). The face may only be seeded by a house of
        # this piece.
        cand = [int(k) for k in btree.query(f.buffer(SEED_REACH))
                if geoms[int(k)].distance(f) < SEED_REACH and inside[int(k)][0] in mine]
        if cand:
            if len(cand) > 1:
                shared_by += 1
            # the longest shared boundary decides, so the face goes to the house it mostly borders
            k = max(cand, key=lambda k: geoms[k].boundary.intersection(f.buffer(0.05)).length)
            dist[i] = geoms[k].distance(f); own[i] = gidx[k]
        if own[i] is not None:
            heapq.heappush(heap, (dist[i], i))
    log(f"      {shared_by} faces seeded by more than one house")
    cents = [f.centroid for f in faces]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, cost in adj[i]:
            nd = d + cents[i].distance(cents[j]) + cost
            if nd < dist[j]:
                dist[j] = nd; own[j] = own[i]; heapq.heappush(heap, (nd, j))
    log("      grown")

    # label each face: a plot's if the growing reached it and it is inside that house's reach
    bld_of = dict(inside)
    reach = {}
    for k, g in inside:
        r = g.buffer(GARDEN + FACE_PAD, join_style="mitre")
        if k in backs:
            r = r.intersection(_half_plane(backs[k], g.centroid))
        reach[k] = r
    # where a house's title is registered, its plot may not leave that parcel: the parcel is the
    # reach's own limit, so a plot is the parcel the house stands in divided among the houses in it
    if parcels is not None:
        for n, k in enumerate(gidx):
            if parcel_of[n] is not None:
                # the parcel's extent is indicative, so it is grown by PARCEL_PAD before it caps the
                # reach: a house straddling its own registered edge still keeps its plot
                reach[k] = reach[k].intersection(parcels.polys[parcel_of[n]].buffer(PARCEL_PAD))
    face_label = []
    for i, f in enumerate(faces):
        k = own[i]
        if k is not None and dist[i] <= REACH_GROW and reach[k].contains(f.representative_point()):
            face_label.append(("plot", k))
        else:
            face_label.append(("open",))

    # absorb slivers: a face too small to be a plot of its own (or too thin) takes the label of the
    # neighbour it shares its longest edge with. This is a rule of the partition — a hedge is never
    # drawn round a square metre of nothing — and it stops a face being left with no owner, which is
    # where the loose ends and the extra uncovered area came from. Repeat until nothing changes.
    # Longest shared edge between faces, from the piece adjacency already built.
    face_label = _absorb_slivers(faces, face_label, pieces, side_a, side_b)

    # The registered fronts just inside the street come out only now, after every face has its
    # owner. Taken out before the growing, the strip they bounded joined the faces behind it, and
    # the bigger faces grew differently: measured on two squares, 20,000 m2 of gardens went to open
    # land and 13,000 m2 moved next door. Re-cut here, each face keeps the owner of the face it
    # mostly is, and the strip just joins whichever garden it lies in front of. The same then goes
    # for every pair of sources tracing one fence (`_one_boundary`), judged against these faces.
    street = _street_edge(region, B, bunion)
    front_pl = _frontage_parcels(par_lines, region, B, bunion)

    front_lines = unary_union([region.boundary] + list(cuts) + ev + front_pl + list(back_cuts) + caps)
    base = _recut(region, front_lines, faces, face_label)
    if base:
        faces, face_label = base
        lines = front_lines
    # A line can only give way to one that bounds ground here. A stronger line just outside the
    # block, or the loose end of one inside it, divides nothing: the ground either side of the weaker
    # line would merge (measured: a 25,000 m2 garden became open land with the field beside it).
    net = unary_union([f.boundary for f in faces]).buffer(0.02)
    shapely.prepare(net)
    twins = _one_boundary([[street], ev, front_pl, list(cuts), list(back_cuts), list(caps)],
                          ways=sliver_ways, net=net)
    # in the order the first cut used: the noding, and so the faces, depend on it
    order = {3: 0, 1: 1, 2: 2, 4: 3, 5: 4}
    back = []
    got = None
    once = [g for n, (part, pieces, given, rank) in sorted(enumerate(twins), key=lambda t: order[t[1][3]])
            for g in pieces]
    for _ in range(6):
        twin_lines = unary_union([region.boundary] + once + back)
        got = _recut(region, twin_lines, faces, face_label)
        leaks = _merged_ground(got[0], faces, face_label) if got else []
        if not leaks:
            break
        # put back the given-away stretches along the leaking ground, and only those
        zone = unary_union(leaks).buffer(1.0)
        more = [given.intersection(zone) for _, _, given, _r in twins
                if given is not None and given.intersects(zone)]
        more = [g for g in more if not g.is_empty and g.length > 0.05]
        if not more:
            got = None
            break
        back += more
    else:
        got = None
    if got is None and base:
        got, twin_lines = base, front_lines
    if got:
        lines = twin_lines
        faces, face_label = got
        pieces, side_a, side_b = ring_adjacency(faces, lines, log=log)
        # the re-cut leaves its own scraps where a carried-on end meets the line it gave way to
        face_label = _absorb_slivers(faces, face_label, pieces, side_a, side_b)
    cut_lines = lines
    lines, faces, face_label = _absorb_thin_arms(region, lines, faces, face_label, sliver_ways,
                                                  log=log)
    if lines is not cut_lines:
        pieces, side_a, side_b = ring_adjacency(faces, lines, log=log)

    # What this piece writes out, of the faces of the whole parent block it just cut:
    # - its own plots, wherever their faces lie (a plot grown from one of this piece's houses belongs
    #   to it even if it reaches into the next piece's ground, which it cannot: they are far apart);
    # - every open face whose representative point lies inside the piece.
    # Open ground outside every piece belongs to nobody and is left to `assemble`'s open-land step,
    # which already cuts open ground by evidence, so nothing is lost by leaving it.
    written = []
    for i, f in enumerate(faces):
        lab = face_label[i]
        if lab[0] == "plot" or block.contains(f.representative_point()):
            written.append(i)

    face_label, faces = _absorb_plot_slivers(faces, face_label, written, block, sliver_ways,
                                             log=log)

    # plots: each distinct label's faces unioned
    groups = collections.OrderedDict()
    for i in written:
        lab = face_label[i]
        groups.setdefault(lab, []).append(faces[i])
    plots = []
    for lab, fs in groups.items():
        try:
            g = shapely.coverage_union_all(fs)
        except Exception:
            g = unary_union([f.buffer(0) for f in fs])
        if not g.is_valid:
            g = g.buffer(0)
        kind = "plot" if lab[0] == "plot" else "open"
        bi = lab[1] if lab[0] == "plot" else None
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.geom_type == "Polygon" and not part.is_empty:
                plots.append((part, kind, bi))
    log(f"      {len(plots)} pieces")

    # edges: each piece's two labels, from the ring map. A piece with no face either side is a
    # dangle and is ignored; with one face, what lies beyond is a building, a corridor or the worked
    # area's edge, from where its midpoint is; with two, each face's label.
    #
    # A segment is drawn only where this piece wrote the ground either side of it: a segment between
    # two faces of the parent block that this piece did not write (open ground beyond the piece that
    # belongs to nobody) is not this piece's to draw, and drawing it would put a boundary in the
    # network that no piece of the block owns.
    have = set(written)
    edges = []
    labelled = []
    for p, a, b in zip(pieces, side_a, side_b):
        if a is None and b is None:
            continue
        mpt = p.interpolate(0.5, normalized=True)
        # What lies beyond a face this piece did not write is open ground of the parent block - the
        # ground beyond the piece, which belongs to nobody and is left to the open-land step
        la = face_label[a] if (a is not None and a in have) else ("open",)
        lb = face_label[b] if (b is not None and b in have) else ("open",)
        # a face on the *outside* of the whole region is not inside the parent block, so the answer
        # there is what stage 3 gave: a building, the worked area's edge, or a corridor
        if a is None:
            la = _label_outside(mpt, bunion, B, parent)
        if b is None:
            lb = _label_outside(mpt, bunion, B, parent)
        labelled.append((p, a, b, la, lb))
    # A hairline face with the same thing across every side is a spike: drawn, its edges were a wall
    # out and back into a house. One between two different neighbours closes a junction, and keeps
    # its owner, or the fences either side of it stop short of each other.
    across = collections.defaultdict(set)
    for p, a, b, la, lb in labelled:
        if a is not None and faces[a].area < SLIT:
            across[a].add(lb)
        if b is not None and faces[b].area < SLIT:
            across[b].add(la)
    spikes = {f for f, labs in across.items() if len(labs) == 1}
    for p, a, b, la, lb in labelled:
        if a in spikes or b in spikes or la == lb:
            continue
        edges.append((p, la, lb))
    return plots, edges


def classify_edges(raw_edges, evidence, ev_tree, zone_at, parcel_lines=(), parcel_tree=None,
                   houses=(), others=None, B=None, row_at=None):
    """The drawn boundaries, from the labelled segments of the blocks' networks. Segments along a
    building or the worked area's edge are dropped (kind 'none'), and the rest are grouped by their
    pair of labels and merged, so a boundary between two neighbours is one line. Returns
    [(LineString, kind, support, source)].

    `parcel_lines` are the registered property boundaries: a piece lying on one is a boundary the
    data already knows, so it is drawn as evidence (and gets its material from the lidar or the
    zone, as any other front does) however short the lidar run along it is. Returns
    [(LineString, kind, support, source)], where support counts a parcel edge as evidence, and the
    source says whether the piece is on a parcel ('parcel'), on the lidar or mapped barriers
    ('evidence'), or neither ('inferred'); 'front' and 'none' are the corridor and open-land cases."""
    htree = STRtree(list(houses)) if len(houses) else None
    def support(seg):
        """(share on evidence, kind the evidence shows, share of the piece on a registered
        boundary, share on the lidar or a mapped barrier). A registered boundary is evidence in its
        own right, so it counts towards the first share and gives no kind of its own: the material
        still comes from the lidar or the zone. The third and fourth are kept apart because a
        cadastre's line and a physical one are not the same thing: the cadastre says where a
        boundary is, the lidar says whether anything stands there."""
        n = max(2, int(seg.length / 2.0)) if seg.length >= 0.5 else 1
        kinds = collections.Counter(); covered = 0.0; on_pc = 0.0; on_real = 0.0
        for k in range(n + 1):
            p = seg.interpolate(k / n, normalized=True)
            if on_line(parcel_tree, parcel_lines, p, 0.3):
                covered += 1; on_pc += 1
                continue
            best = None
            for e in np.atleast_1d(ev_tree.query(p.buffer(1.5))):
                d = evidence[int(e)][0].distance(p)
                if d < 1.5 and (best is None or d < best[0]):
                    best = (d, evidence[int(e)][1])
            if best:
                covered += 1; on_real += 1; kinds[best[1]] += 1
        return (covered / (n + 1), (kinds.most_common(1)[0][0] if kinds else None),
                on_pc / (n + 1), on_real / (n + 1))

    groups = collections.defaultdict(list)
    for sg, la, lb in raw_edges:
        if ("building",) in (la, lb) or ("edge",) in (la, lb):
            continue                       # a house, or the worked area's edge: not drawn
        if la == lb:
            continue
        groups[tuple(sorted((la, lb), key=str))].append(sg)

    edges = []
    plot_len = parcel_len = 0.0
    for key, segs in groups.items():
        # `linemerge` refuses a set it cannot make one line of, and a degenerate two-point LineString
        # raises rather than coming back unmerged. Segments below the length filter are dropped first,
        # and the merge falls back to the union so a square cannot be lost to one short piece.
        segs = [s for s in segs if not s.is_empty and s.length >= 0.05]
        if not segs:
            continue
        if len(segs) == 1:
            merged = segs[0]
        else:
            try:
                merged = linemerge(unary_union(segs))
            except ValueError:
                merged = unary_union(segs)
        parts = [merged] if merged.geom_type == "LineString" else \
            [g for g in getattr(merged, "geoms", []) if g.geom_type == "LineString"]
        sides = {key[0][0], key[1][0]}
        for s in parts:
            if s.length < 0.1:
                continue
            sup, ek, pc, real = support(s)
            m = s.interpolate(0.5, normalized=True)
            if "plot" in sides:
                plot_len += s.length
                parcel_len += s.length * pc
            if "corridor" in sides:
                if sides == {"corridor", "open"}:
                    kind = ek if (sup >= SUPPORT and ek) else "none"
                else:
                    kind = ek if (sup >= SUPPORT and ek) else front_style(zone_at(m.x, m.y), m.x, m.y, row_at(m.x, m.y) if row_at else None)
                edges.append((s, kind, sup, "front", pc, kind != "none", key)); continue
            # a boundary between plots, or between a plot and open land. What it is made of comes
            # from the pair of labels, as in stage 1 (a boundary between two gardens is a fence,
            # one against open land a hedge) and from the lidar where it saw one.
            kind = ek or ("fence" if sides == {"plot"} else "hedge")
            src = "parcel" if pc >= SUPPORT else ("evidence" if sup >= SUPPORT else "inferred")
            # A registered boundary is the cadastre's line, and the cadastre's line is only
            # sometimes a physical one: a title runs across two fields of one farm, or across a
            # lawn, with nothing standing along it, and a hedge drawn there would be invented. So a
            # parcel-sourced piece is drawn only where something really is there: the lidar or a
            # mapped barrier along it, or a house near enough that it is a garden's edge. A piece
            # with neither is nothing, and only divided the block.
            keep = not (src == "parcel"
                        and max(real, garden_share(htree, houses, s)) < SUPPORT)
            edges.append((s, kind, sup, src, pc, keep, key))
    # Dropping a piece can leave a neighbour's end touching nothing, which is a loose end. So the
    # drop is made coherent before anything is written out: a piece is kept if dropping it would
    # strand a kept piece's end, repeated until nothing changes. A piece whose whole neighbourhood
    # is nothing stays dropped; one that met a kept boundary is kept with it. The drawn network then
    # has no end in mid-air and no invented boundary standing in open land.
    edges = _drop_dangling(edges, others, B)
    kinds = collections.Counter(e[1] for e in edges if e[3] in ("evidence", "parcel"))
    common = kinds.most_common(1)[0][0] if kinds else "fence"
    # The pair of labels either side is kept on the way out, because a writer needs it and `kind`
    # alone cannot say it: a boundary *between two plots* is a wall the player walks past, while a
    # boundary between a plot and a *corridor* is the corridor's own edge. Drawing the second as a
    # barrier puts a hedge down the middle of the road - measured, 266 of 3,699 barrier runs were
    # inside a carriageway on square 0,3, some of them wholly inside it.
    edges = [(s, common if src == "inferred" else k, sup, src, pair)
             for s, k, sup, src, _pc, pair in edges]
    return edges, (parcel_len / plot_len if plot_len else 0.0)
