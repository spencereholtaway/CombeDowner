"""Garden plots and their boundaries: front walls with gates, and fences, walls or hedges
between neighbouring gardens.

Overture has almost no plot data, so plots are inferred: the land is split between buildings
(a Voronoi diagram of points along every footprint), each house keeps the part within a
garden's depth of it, and streets and paths are cut out. Plot edges that face a street become
the front boundary (with a gate opposite the house, and sometimes a driveway); edges between
two plots, or facing open land, become side and back boundaries.

The front boundary's style follows the area: Bath stone walls in the old village, low walls or
hedges in the suburbs, and so on (see STYLE). Between and behind the gardens it is always a wooden
close-board fence or a hedge. A front's style is picked once for each row of houses (one kind of
house along one street, standing close together), so a row's fronts match, and the fence or hedge
once for each back yard (all the gardens backing on to one another round a block). Side and back boundaries come from every plot's edge at once, as
one network, so where two plots meet it's one fence with no gap between two guesses at it; each
stretch takes the fence or hedge of the garden it bounds. They are then squared up to the house:
the cells (seeded round each house's rectangle, and reaching square-cornered from it) still bend
round their neighbours, so each run is straightened and turned to run square to, or in line with,
the house.
"""
import math, random
from collections import defaultdict
import shapely
from shapely.geometry import LineString, MultiLineString, MultiPoint, Point
from shapely.ops import substring, unary_union, voronoi_diagram

HOUSES = {"detached", "semi", "terrace"}
DEPTH = {"detached": 22, "semi": 20, "terrace": 16}   # how far a garden reaches from the house
# front boundary, side and back boundary, per zone; each is a list of (style, weight) (the side and
# back one is rolled for a whole back yard, so a hedged yard is kept rare)
STYLE = {
    "village": ([("garden_wall", 0.75), ("railing", 0.1), ("hedge_low", 0.15)], [("fence", 0.9), ("hedge", 0.1)]),
    "suburb": ([("garden_wall", 0.35), ("brick_wall_low", 0.2), ("hedge_low", 0.45)], [("fence", 0.88), ("hedge", 0.12)]),
    "foxhill": ([("hedge_low", 0.5), ("brick_wall_low", 0.3), ("railing", 0.2)], [("fence", 0.92), ("hedge", 0.08)]),
    "mulberry": ([("railing", 0.4), ("hedge_low", 0.4), ("brick_wall_low", 0.2)], [("fence", 0.92), ("hedge", 0.08)]),
    "london": ([("brick_wall_low", 0.5), ("railing", 0.3), ("hedge_low", 0.2)], [("fence", 0.92), ("hedge", 0.08)]),
    "squares": ([("railing", 0.85), ("brick_wall_low", 0.15)], [("fence", 0.92), ("hedge", 0.08)]),
    # Cape Town: a high plastered wall to the street or a steel palisade, and masonry walls between
    # and behind the plots rather than wooden fences; the Bo-Kaap's stoeps have low railings
    "cape": ([("security_wall", 0.55), ("palisade", 0.3), ("railing", 0.15)], [("boundary_wall", 0.9), ("hedge", 0.1)]),
    "bokaap": ([("railing", 0.5), ("security_wall", 0.3), ("palisade", 0.2)], [("boundary_wall", 1.0)]),
    "cbd": ([("palisade", 0.5), ("security_wall", 0.5)], [("boundary_wall", 1.0)]),
}
# an area with no style of its own: nothing that belongs to one town
NEUTRAL = ([("hedge_low", 0.4), ("brick_wall_low", 0.35), ("railing", 0.25)], [("fence", 0.85), ("hedge", 0.15)])
# what is guessed between and behind gardens: the later tidying (tools/prep_map.py) straightens,
# joins and trims these, and leaves fronts and measured walls as they are
BETWEEN = ("fence", "hedge", "boundary_wall")


def pick(options, r):
    acc = 0
    for name, w in options:
        acc += w
        if r < acc: return name
    return options[-1][0]


def densify(line, step):
    n = max(1, int(math.ceil(line.length / step)))
    return [line.interpolate(i / n, normalized=True).coords[0] for i in range(n + 1)]


def plots(polys, info, corridor_parts, bounds, rnd: random.Random, open_land=(), keys=None, fronts=None, names=None):
    """Return front and side boundaries as lists of (style, LineString, house index), and gates as
    (x0, y0, x1, y1, style). corridor_parts are the street and path areas, one polygon each.
    keys (see buildings.classify): each garden's styles come from its house's key instead of
    its place in the list, so a garden comes out the same in every tile that builds it.
    names: each street part's name, so the houses along one street can be told apart from the
    ones round the corner."""
    # Voronoi seeds: points every 2 m round the smallest rectangle round every footprint (rather
    # than the footprint itself, whose nooks bend the cells' edges), tagged with their building
    seeds, owner, seen = [], [], set()
    for i, p in enumerate(polys):
        for x, y in densify(shapely.minimum_rotated_rectangle(p).exterior, 2.0)[:-1]:
            k = (round(x * 4), round(y * 4))     # shared walls give coincident points: keep one
            if k in seen: continue
            seen.add(k); seeds.append((k[0] / 4, k[1] / 4)); owner.append(i)
    try:
        vor = voronoi_diagram(MultiPoint(seeds), envelope=shapely.box(*bounds), tolerance=0.05)
    except ValueError:      # GEOS now and then trips over its own snapping: try it without
        vor = voronoi_diagram(MultiPoint(seeds), envelope=shapely.box(*bounds))
    tree = shapely.STRtree([Point(s) for s in seeds])
    cells = defaultdict(list)
    for cell in vor.geoms:
        hits = tree.query(cell, predicate="contains")
        if len(hits): cells[owner[int(hits[0])]].append(cell)

    # streets as separate pieces (and grown by 1.2 m, for finding plot edges that face them),
    # so each plot only deals with the ones near it
    # public open space (greens, parks, pitches) is never part of anyone's garden
    # (the streets are grown by 0.15 m, so a front wall stands just inside the pavement's edge, clear of it)
    # Only a street the house faces (fronts[k], a road rather than a footpath) makes a front: a
    # garden's edge along a footpath or open land is a side or back boundary.
    facing = [c.buffer(0.15, join_style=2) for k, c in enumerate(corridor_parts) if fronts is None or fronts[k]]
    facing_name = [(names[k] if names is not None and names[k] else k) for k in range(len(corridor_parts)) if fronts is None or fronts[k]]
    corridor_parts = [c.buffer(0.15, join_style=2) for c in corridor_parts] + list(open_land)
    grown = [c.buffer(1.2, quad_segs=2) for c in facing] or [shapely.Point(bounds[0] - 1e6, bounds[1] - 1e6).buffer(1)]
    edges_of = [c.exterior for c in facing] or [shapely.LineString([(bounds[0] - 1e6, 0), (bounds[0] - 1e6 + 1, 0)])]
    ctree, gtree, btree = shapely.STRtree(corridor_parts), shapely.STRtree(grown), shapely.STRtree(polys)
    etree = shapely.STRtree(edges_of)
    near = lambda g, parts, t: unary_union([parts[int(k)] for k in t.query(g)])
    front, side, gates, drives = [], [], [], []
    plot_of, street_of = {}, {}
    for i, p in enumerate(polys):
        b = info[i]
        if b["kind"] not in HOUSES or i not in cells: continue
        plot = unary_union(cells[i]).intersection(_reach(p, DEPTH[b["kind"]]))
        streets = near(plot, corridor_parts, ctree)
        if not streets.is_empty: plot = plot.difference(streets)
        others = [polys[int(k)] for k in btree.query(plot) if int(k) != i]
        if others: plot = plot.difference(unary_union(others))
        if plot.is_empty: continue
        if plot.geom_type != "Polygon":
            plot = max(getattr(plot, "geoms", [plot]), key=lambda g: g.area if g.geom_type == "Polygon" else 0)
            if plot.geom_type != "Polygon": continue
        plot_of[i] = plot
        street_of[i] = near(plot, grown, gtree)

    rng_for = lambda i: random.Random((keys[i] if keys is not None else i) * 104729 + 7)
    row_of = _rows(plot_of, polys, info, keys, facing_name, gtree)
    yard_of = _yards(plot_of, keys, row_of)
    side_style, gate_grid = {}, defaultdict(list)
    for i, plot in plot_of.items():
        b, r = info[i], rng_for(i)
        # the front is rolled once for the whole row the house is in (by its first house), so a row's
        # fronts match; the fences or hedges behind are rolled once for all the gardens backing on to
        # one another round a block, so a shared back yard is one style; the house's own roll is
        # kept for things like its drive
        lead, yard = row_of[i], yard_of[i]
        style_front = pick(STYLE.get(info[lead]["zone"], NEUTRAL)[0], rng_for(lead).random())
        style_side = pick(STYLE.get(info[yard]["zone"], NEUTRAL)[1], rng_for(yard).random())
        edge = plot.exterior.difference(polys[i].buffer(0.4, join_style=2))
        street_side = street_of[i]
        f = edge.intersection(street_side)
        s = edge.difference(street_side)
        # a front runs along the street: a stretch of the plot's edge near the street that turns
        # away from it (a corner, the side of a narrow plot) is a side boundary instead
        f, turned = _along_street(f, edges_of, etree)
        if turned: s = unary_union([s] + turned)
        for piece in getattr(f, "geoms", [f]):
            if piece.geom_type != "LineString" or piece.length < 1.5: continue
            # a gate opposite the house; detached and semi-detached suburban houses may have a drive
            c = polys[i].centroid
            # the gate is kept a metre and a quarter or more from each end, so it's never squeezed
            # narrow and never leaves a stub of wall; a front too short for that is left open, with
            # an "open" gate in its middle for the front path to start from (nothing is drawn there)
            if piece.length < 3.6:
                q0, q1 = piece.interpolate(piece.length / 2 - 0.55), piece.interpolate(piece.length / 2 + 0.55)
                if not _gate_near(gate_grid, q0.x, q0.y, q1.x, q1.y):
                    _gate_add(gate_grid, gates, (q0.x, q0.y, q1.x, q1.y, "open"))
                continue
            at = min(max(piece.project(c), 1.8), piece.length - 1.8)
            gaps = [(at, 1.1, "gate")]
            if b["kind"] != "terrace" and b["zone"] != "village" and r.random() < 0.55 and piece.length > 9:
                d = at + 3.2 if at + 5 < piece.length else at - 3.2
                gaps = [(d, 3.0, "drive"), (at if abs(at - d) > 2.2 else at + (2.2 if at > d else -2.2), 1.1, "gate")]
            cuts = sorted((max(0, a - w / 2), min(piece.length, a + w / 2), kind) for a, w, kind in gaps)
            pos = 0.0
            for a, z, kind in cuts:
                if a - pos > 1.0: front.append((style_front, substring(piece, pos, a), i))
                if kind == "drive" and z - a > 2:
                    q = piece.interpolate((a + z) / 2)
                    drives.append((q.x, q.y, i))
                if kind == "gate" and z - a > 0.9:
                    p0, p1 = piece.interpolate(a), piece.interpolate(z)
                    # (two plots sharing a front would each put a gate in the same place)
                    if not _gate_near(gate_grid, p0.x, p0.y, p1.x, p1.y):
                        _gate_add(gate_grid, gates, (p0.x, p0.y, p1.x, p1.y, style_front))
                pos = max(pos, z)
            if piece.length - pos > 1.0: front.append((style_front, substring(piece, pos, piece.length), i))
        side_style[i] = style_side

    # The fronts are laid down one at a time, each keeping only what isn't within half a metre of
    # one laid before it (two plots sharing a front would each put one there), and a piece that stops
    # just short of another is run on to meet it.
    front = _network(front, shortest=1.0)
    side = _sides(plot_of, polys, keys, side_style, grown, front, row_of)
    # squaring can bring two runs together, so they are laid once more, longest first, each keeping
    # only what isn't within 1.2 m of one already down (two plots' backs that close are one fence)
    side = _network(sorted(_squared(side, front, polys), key=lambda sp: -sp[1].length), taken=[g for _, g, *_ in front], near=1.2)
    return front, side, gates, drives


def _reach(p, depth):
    """How far a garden reaches from its house: the house's own rectangle grown by `depth` front and
    back and by half that to each side, square-cornered and lined up with the house."""
    r = shapely.minimum_rotated_rectangle(p)
    cx, cy = r.centroid.x, r.centroid.y
    ax = _axis(p); ux, uy = math.cos(ax), math.sin(ax); vx, vy = -uy, ux
    cs = list(r.exterior.coords)[:4]
    us = [(x - cx) * ux + (y - cy) * uy for x, y in cs]; vs = [(x - cx) * vx + (y - cy) * vy for x, y in cs]
    u0, u1, v0, v1 = min(us) - depth * 0.5, max(us) + depth * 0.5, min(vs) - depth, max(vs) + depth
    return shapely.Polygon([(cx + u * ux + v * vx, cy + u * uy + v * vy) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])


def _rows(plot_of, polys, info, keys, facing_name, gtree, gap=6.0):
    """Which row each house is in: houses of the same kind facing the same street, standing within
    `gap` metres of each other, are one row (a terrace, a run of semis, a line of detached houses).
    A gap, a different kind of house or the corner onto another street starts a new row. Each house
    maps to the row's first house, by key."""
    key = lambda i: keys[i] if keys is not None else i
    ids = list(plot_of)
    # (a square with no street any house faces has only a stand-in far away, with no name)
    street = {i: facing_name[int(gtree.nearest(polys[i]))] if facing_name else None for i in ids}
    up = {i: i for i in ids}
    def find(i):
        while up[i] != i: up[i] = up[up[i]]; i = up[i]
        return i
    tree = shapely.STRtree([polys[i] for i in ids])
    for a in ids:
        for k in tree.query(polys[a].buffer(gap)):
            b = ids[int(k)]
            if b <= a or info[a]["kind"] != info[b]["kind"] or street[a] != street[b]: continue
            if polys[a].distance(polys[b]) > gap: continue
            ra, rb = find(a), find(b)
            if ra != rb: up[max(ra, rb, key=key)] = min(ra, rb, key=key)
    lead = {}
    for i in ids:
        r = find(i)
        if r not in lead or key(i) < key(lead[r]): lead[r] = i
    return {i: lead[find(i)] for i in ids}


def _yards(plot_of, keys, row_of, shared=2.0):
    """Which back yard each house's garden is part of: rows whose gardens meet along `shared` metres
    or more of boundary (back to back, or side by side round a block) are one yard. Streets, paths
    and open land are cut out of the gardens, so a yard is bounded by them. Each house maps to the
    yard's first house, by key."""
    key = lambda i: keys[i] if keys is not None else i
    ids = list(plot_of)
    up = {i: i for i in ids}
    def find(i):
        while up[i] != i: up[i] = up[up[i]]; i = up[i]
        return i
    for i in ids:     # a row's gardens go together, whether or not they touch
        ra, rb = find(i), find(row_of[i])
        if ra != rb: up[max(ra, rb, key=key)] = min(ra, rb, key=key)
    tree = shapely.STRtree([plot_of[i] for i in ids])
    for a in ids:
        edge = plot_of[a].exterior
        for k in tree.query(plot_of[a].buffer(0.1)):
            b = ids[int(k)]
            if b <= a or find(a) == find(b): continue
            if edge.intersection(plot_of[b].buffer(0.1)).length < shared: continue
            ra, rb = find(a), find(b)
            up[max(ra, rb, key=key)] = min(ra, rb, key=key)
    lead = {}
    for i in ids:
        r = find(i)
        if r not in lead or key(i) < key(lead[r]): lead[r] = i
    return {i: lead[find(i)] for i in ids}


def _sides(plot_of, polys, keys, side_style, grown, front, row_of=None):
    """The side and back boundaries, from every plot's edge at once: where two plots meet it's one
    line, so there is nothing to trim and no gap left between two guesses at it. What's against a
    house, along a street or on a front is taken out. Each stretch between two corners belongs to the
    garden it bounds (where two share it, the garden in the first row, by its first house's key, so
    a back line between two rows is one style all along) and takes that garden's fence or hedge,
    and the stretches are joined into runs of one style."""
    def one(p):
        p = shapely.set_precision(p, 0.05)
        if p.geom_type != "Polygon":
            p = max(getattr(p, "geoms", [p]), key=lambda g: g.area if g.geom_type == "Polygon" else 0)
        return p if p.geom_type == "Polygon" and not p.is_empty else None
    shaped = {i: q for i, q in ((i, one(p)) for i, p in plot_of.items()) if q is not None}
    if not shaped: return []
    ids = list(shaped)
    lines = unary_union([shaped[i].exterior for i in ids])
    cut = unary_union([g for g in grown] + [polys[i].buffer(0.4, join_style=2) for i in ids] + [g.buffer(0.3) for _, g, *_ in front])
    rest = lines.difference(cut)
    ptree = shapely.STRtree([shaped[i] for i in ids])
    key = lambda i: keys[i] if keys is not None else i
    def owner(piece):
        m = piece.interpolate(0.5, normalized=True)
        own = [ids[int(k)] for k in ptree.query(m.buffer(0.2))]
        # a back line shared between two rows takes the one row's style all along it
        return min(own, key=lambda i: (key(row_of[i]) if row_of else key(i), key(i))) if own else None
    by_style = defaultdict(list)
    for piece in getattr(rest, "geoms", [rest]):
        if piece.geom_type != "LineString" or piece.length < 0.2: continue
        o = owner(piece)
        if o is not None: by_style[side_style[o]].append(piece)
    side = []
    for style, pieces in by_style.items():
        merged = shapely.line_merge(MultiLineString(pieces))
        for run in getattr(merged, "geoms", [merged]):
            if run.geom_type != "LineString" or run.length < 1.0: continue
            o = owner(run)
            if o is not None: side.append((style, run, o))
    return side


def _axis(poly):
    """The way a house lies: the angle of the long side of the smallest rectangle round it."""
    cs = list(shapely.minimum_rotated_rectangle(poly).exterior.coords)
    (ax, ay), (bx, by), (cx, cy) = cs[0], cs[1], cs[2]
    return math.atan2(by - ay, bx - ax) if math.hypot(bx - ax, by - ay) >= math.hypot(cx - bx, cy - by) else math.atan2(cy - by, cx - bx)


def _squared(side, front, polys, bend=2.0, reach=5.0, rounds=30):
    """The side and back boundaries straightened and squared up, as one network so that where two
    meet they still meet. Each run is cut into straight stretches (a bend of under `bend` metres is
    taken out), then every corner and join that isn't held is moved, a little at a time, so each
    stretch runs square to or in line with its garden's house, whichever it is nearer. Held are the
    ends against a house, on a front boundary, and anything that would have to go more than `reach`
    metres; a corner is never moved to where a stretch would cross a house."""
    if not side: return side
    key = lambda q: (round(q[0] * 20), round(q[1] * 20))
    node, pos, home = {}, [], []
    def nid(q):
        k = key(q)
        if k not in node: node[k] = len(pos); pos.append([q[0], q[1]]); home.append((q[0], q[1]))
        return node[k]
    # each run as a chain of corners; where one run's end meets another part way along (a T), that
    # point is put into the other's chain too, so the two stay joined
    chains = [[nid(q) for q in ln.coords] for _, ln, *_ in side]
    for ch in chains:
        ch[:] = [a for k, a in enumerate(ch) if k == 0 or a != ch[k - 1]]
    segs, seg_of = [], []
    for c, ch in enumerate(chains):
        for k in range(len(ch) - 1):
            segs.append(LineString([home[ch[k]], home[ch[k + 1]]])); seg_of.append((c, ch[k], ch[k + 1]))
    stree = shapely.STRtree(segs) if segs else None
    inserts = defaultdict(list)
    for c, ch in enumerate(chains):
        for a in {ch[0], ch[-1]}:
            pt = Point(home[a])
            for k in (stree.query(pt.buffer(0.08)) if stree is not None else []):
                oc, u, v = seg_of[int(k)]
                if oc == c or a in (u, v) or segs[int(k)].distance(pt) > 0.08: continue
                inserts[(oc, u, v)].append((segs[int(k)].project(pt), a))
    for (oc, u, v), adds in inserts.items():
        ch = chains[oc]
        for k in range(len(ch) - 1):
            if ch[k] == u and ch[k + 1] == v:
                ch[k + 1:k + 1] = [a for _, a in sorted(adds)]
                break
    # then the bends of under `bend` m are taken out, keeping every end and join
    uses = defaultdict(int)
    for ch in chains:
        for a in ch: uses[a] += 1
    def thin(ch):
        keep = [k for k, a in enumerate(ch) if k in (0, len(ch) - 1) or uses[a] > 1]
        out = []
        for k0, k1 in zip(keep, keep[1:]):
            part = LineString([home[a] for a in ch[k0:k1 + 1]]) if k1 > k0 else None
            if part is None or len(part.coords) < 2: continue
            kept = {tuple(q) for q in part.simplify(bend).coords}
            out += [a for a in ch[k0:k1] if tuple(home[a]) in kept or a == ch[k0]]
        out.append(ch[-1])
        return [a for k, a in enumerate(out) if k == 0 or a != out[k - 1]]
    chains = [thin(ch) for ch in chains]
    owner = [extra[0] if extra else None for _, _, *extra in side]
    axes = {}
    def axis_of(o):
        if o not in axes: axes[o] = _axis(polys[o])
        return axes[o]
    # held: an end against a house or on a front boundary
    houses = shapely.STRtree(polys) if polys else None
    fronts = shapely.STRtree([g for _, g, *_ in front]) if front else None
    held = set()
    for ch in chains:
        for a in (ch[0], ch[-1]):
            pt = Point(home[a])
            if houses is not None and len(houses.query(pt.buffer(0.8), predicate="intersects")): held.add(a)
            if fronts is not None and len(fronts.query(pt.buffer(0.3), predicate="intersects")): held.add(a)
    # move the free corners towards where each stretch through them would be square
    for _ in range(rounds):
        pull = defaultdict(list)
        for ch, o in zip(chains, owner):
            if o is None or len(ch) < 2: continue
            ax = axis_of(o)
            for a, b in zip(ch, ch[1:]):
                (ax_, ay_), (bx_, by_) = pos[a], pos[b]
                ang = math.atan2(by_ - ay_, bx_ - ax_)
                snap = ax + round((ang - ax) / (math.pi / 2)) * math.pi / 2
                ux, uy = math.cos(snap), math.sin(snap)
                for m, f in ((a, b), (b, a)):
                    if m in held: continue
                    fx, fy = pos[f]
                    t = (pos[m][0] - fx) * ux + (pos[m][1] - fy) * uy
                    pull[m].append((fx + t * ux, fy + t * uy))
        moved = 0
        for m, targets in pull.items():
            tx = sum(q[0] for q in targets) / len(targets); ty = sum(q[1] for q in targets) / len(targets)
            nx, ny = pos[m][0] + (tx - pos[m][0]) * 0.5, pos[m][1] + (ty - pos[m][1]) * 0.5
            if math.hypot(nx - home[m][0], ny - home[m][1]) > reach: continue
            pos[m] = [nx, ny]; moved += 1
        if not moved: break
    # no stretch through a house: a corner that makes one goes back where it was
    for _ in range(3):
        bad = set()
        for ch in chains:
            for a, b in zip(ch, ch[1:]):
                seg = LineString([pos[a], pos[b]])
                if houses is not None and seg.length > 0 and any(polys[int(k)].buffer(-0.3).intersects(seg) for k in houses.query(seg)):
                    bad.update(m for m in (a, b) if m not in held)
        if not bad: break
        for m in bad: pos[m] = list(home[m])
    out = []
    for (style, _, *extra), ch in zip(side, chains):
        pts = [tuple(pos[a]) for a in ch]
        pts = [q for k, q in enumerate(pts) if k == 0 or math.hypot(q[0] - pts[k - 1][0], q[1] - pts[k - 1][1]) > 0.05]
        # a corner pulled past the next one would fold the run back on itself: that corner goes
        folded = True
        while folded and len(pts) >= 3:
            folded = False
            for k in range(1, len(pts) - 1):
                (ax_, ay_), (bx_, by_), (cx_, cy_) = pts[k - 1], pts[k], pts[k + 1]
                u, v = (bx_ - ax_, by_ - ay_), (cx_ - bx_, cy_ - by_)
                lu, lv = math.hypot(*u), math.hypot(*v)
                if lu < 0.05 or lv < 0.05 or (u[0] * v[0] + u[1] * v[1]) < -0.5 * lu * lv:
                    del pts[k]; folded = True; break
        if len(pts) >= 2: out.append((style, LineString(pts), *extra))
    return out


def _network(lines, taken=(), near=0.5, shortest=1.5):
    """Lay (style, LineString, ...) boundaries down one at a time (anything after the line is carried along), dropping what runs within `near` of one
    already down (or of `taken`), joining ends that stop just short of one, and straightening each."""
    laid, geoms = [], list(taken)
    zones = {}
    zone = lambda k: zones[k] if k in zones else zones.setdefault(k, geoms[k].buffer(near, cap_style=2))
    tree_of = lambda: (shapely.STRtree(geoms) if geoms else None)
    tree, since = tree_of(), 0
    for style, line, *extra in lines:
        if since > 40: tree, since = tree_of(), 0       # (the tree is rebuilt now and then; the newest are checked one by one)
        idx = [int(k) for k in tree.query(line.buffer(near))] if tree is not None else []
        idx += list(range(len(geoms) - since, len(geoms))) if since else []
        close = [geoms[k] for k in idx]
        hit = [zone(k) for k in idx]
        rest = line.difference(unary_union(hit)) if hit else line
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "LineString" or piece.length < shortest: continue
            pts = list(piece.coords)
            for end in (0, -1):
                q = Point(pts[end])
                best = min(close, key=lambda g: g.distance(q), default=None)
                if best is not None and best.distance(q) < near + 0.2:
                    on = best.interpolate(best.project(q)).coords[0]
                    if _ahead(pts, end, on):
                        if end == 0: pts.insert(0, on)
                        else: pts.append(on)
            piece = LineString(pts).simplify(0.3)
            laid.append((style, piece, *extra)); geoms.append(piece); since += 1
    return laid


def _ahead(pts, end, on):
    """Whether point `on` lies onward from the line's end (end 0 or -1), so running the line on to it
    doesn't fold it back on itself."""
    a, b = (pts[1], pts[0]) if end == 0 else (pts[-2], pts[-1])
    ux, uy, vx, vy = b[0] - a[0], b[1] - a[1], on[0] - b[0], on[1] - b[1]
    L = math.hypot(vx, vy)
    return L > 0.05 and (ux * vx + uy * vy) > 0.5 * math.hypot(ux, uy) * L


def _along_street(f, edges_of, etree, within=35):
    """Split front lines f into the stretches that run along the nearest street edge (within
    `within` degrees of it), and the ones that turn away from it."""
    keep, turned = [], []
    cos_ = math.cos(math.radians(within))
    for piece in getattr(f, "geoms", [f]):
        if piece.geom_type != "LineString" or piece.is_empty: continue
        pts = list(piece.simplify(0.3).coords)
        run, run_ok = [pts[0]], None
        for a, b in zip(pts, pts[1:]):
            m = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            e = edges_of[int(etree.nearest(m))]
            t = e.project(m)
            p0, p1 = e.interpolate(max(0, t - 0.5)), e.interpolate(min(e.length, t + 0.5))
            ex, ey, sx, sy = p1.x - p0.x, p1.y - p0.y, b[0] - a[0], b[1] - a[1]
            ok = abs(ex * sx + ey * sy) >= cos_ * (math.hypot(ex, ey) * math.hypot(sx, sy) or 1)
            if run_ok is None or ok == run_ok: run.append(b); run_ok = ok
            else:
                (keep if run_ok else turned).append(LineString(run))
                run, run_ok = [a, b], ok
        if len(run) > 1: (keep if run_ok else turned).append(LineString(run))
    return MultiLineString(keep) if keep else LineString(), turned


def _gate_near(grid, ax, ay, bx, by):
    cx, cy = math.floor((ax + bx) / 2), math.floor((ay + by) / 2)
    return any(math.hypot((g[0] + g[2] - ax - bx) / 2, (g[1] + g[3] - ay - by) / 2) < 1.0
               for i in (cx - 1, cx, cx + 1) for j in (cy - 1, cy, cy + 1) for g in grid.get((i, j), ()))


def _gate_add(grid, gates, g):
    gates.append(g); grid[(math.floor((g[0] + g[2]) / 2), math.floor((g[1] + g[3]) / 2))].append(g)
