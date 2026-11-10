"""The street graph: centre lines noded and merged into edges between junctions.

The data's streets come as way after way, split wherever a tag changes, at every shared node,
and often twice (both carriageways of a dual road). What the corridor fit needs is one edge per
stretch between real junctions, with every way's tags kept as observations positioned along that
edge. So the ways are noded against each other into pieces, and pieces are chained through
degree-2 nodes of the same highway class; a path joining a street does not break the street into
two edges, because paths and streets are counted separately. An edge carries the class and the
name of the first way in it, and the list of (start, end, tags) observations along its length
that the corridor fit reads the width and pavement tags from.
"""
import collections

from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

PATHS = {"footway", "path", "cycleway", "bridleway", "steps", "track"}
DRAWN = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street",
         "service", "pedestrian", "raceway", "escape"} | PATHS
JOIN, BESIDE = 1.0, 8.0     # metres: an end this close carries a way on; a way this close runs beside it


def as_built(roads):
    """A way still being built (highway=construction) is drawn as what it will be: OpenStreetMap
    names that in its construction tag. Where the tag is missing, it is what it carries straight on
    from, or failing that what it runs beside, as a new stretch of a street is mapped; and a
    construction of something not drawn here goes. roads: [(LineString, tags)], as street_graph."""
    if not any(t.get("highway") == "construction" for _, t in roads):
        return roads
    drawn = lambda c: (c or "").removesuffix("_link") in DRAWN
    built = [(l, t) for l, t in roads if t.get("highway") != "construction"]
    tree = STRtree([l for l, _ in built])

    def heading(l, end):
        c = l.coords
        a, b = (c[0], c[1]) if end == 0 else (c[-1], c[-2])
        d = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 or 1
        return ((b[0] - a[0]) / d, (b[1] - a[1]) / d)

    def nearby(l):
        best = None
        for e in (0, -1):
            here = Point(l.coords[e])
            for k in tree.query(here.buffer(JOIN)):
                m = built[int(k)][0]
                for f in (0, -1):
                    if Point(m.coords[f]).distance(here) > JOIN:
                        continue
                    h, g = heading(l, e), heading(m, f)
                    straight = -(h[0] * g[0] + h[1] * g[1])
                    if straight > 0.7 and (best is None or straight > best[0]):
                        best = (straight, built[int(k)][1]["highway"])
        if best:
            return best[1]
        mid = l.interpolate(0.5, normalized=True)
        h = heading(l, 0)
        side = []
        for k in tree.query(mid.buffer(BESIDE)):
            m = built[int(k)][0]
            d = m.distance(mid)
            if d > BESIDE:
                continue
            t = m.project(mid)
            a, b = m.interpolate(max(0.0, t - 1)), m.interpolate(min(m.length, t + 1))
            n = a.distance(b) or 1
            if abs(h[0] * (b.x - a.x) / n + h[1] * (b.y - a.y) / n) > 0.9:
                side.append((d, built[int(k)][1]["highway"]))
        return min(side)[1] if side else None

    out = []
    for l, t in roads:
        if t.get("highway") != "construction":
            out.append((l, t))
            continue
        will = t.get("construction")
        cls = will if drawn(will) else nearby(l) if will in (None, "yes") else None
        if drawn(cls):
            out.append((l, dict(t, highway=cls)))
    return out


def street_graph(roads, bbox, log=print):
    """roads: [(LineString, tags)]. Returns edges: dict with 'line' (LineString between junctions),
    'cls', 'name', 'obs' (list of (t0, t1, tags) along it, metres)."""
    lines = [l for l, _ in roads]
    noded = unary_union(lines)
    pieces = list(noded.geoms) if hasattr(noded, "geoms") else [noded]
    src = STRtree(lines)
    piece_tags = []
    for pc in pieces:
        mid = pc.interpolate(0.5, normalized=True)
        # ties broken by the line's position, not by the index's order
        k = min((int(k) for k in src.query(mid.buffer(0.5))),
                key=lambda k: (lines[k].distance(mid), k), default=None)
        piece_tags.append(roads[k][1] if k is not None else {})
    deg = collections.Counter(); pdeg = collections.Counter()
    for i, pc in enumerate(pieces):
        c = pc.coords
        d = pdeg if piece_tags[i].get("highway") in PATHS else deg
        d[tuple(round(v, 3) for v in c[0])] += 1; d[tuple(round(v, 3) for v in c[-1])] += 1
    used = [False] * len(pieces)
    at = collections.defaultdict(list)
    for i, pc in enumerate(pieces):
        c = pc.coords
        at[tuple(round(v, 3) for v in c[0])].append(i); at[tuple(round(v, 3) for v in c[-1])].append(i)
    edges = []
    log(f"     noded into {len(pieces)} pieces; nodes by degree {sorted(collections.Counter(deg.values()).items())}")

    def walk(i, end):
        """Follow from piece i out of node `end` while the node has degree 2 and the class matches."""
        chain = []
        while True:
            ispath = piece_tags[i].get("highway") in PATHS
            d = pdeg if ispath else deg
            nxt = [j for j in at[end] if j != i and not used[j] and (piece_tags[j].get("highway") in PATHS) == ispath]
            if d[end] != 2 or len(nxt) != 1:
                return chain
            j = nxt[0]
            if piece_tags[j].get("highway") != piece_tags[i].get("highway"):
                return chain
            used[j] = True
            c = list(pieces[j].coords)
            if tuple(round(v, 3) for v in c[0]) != end:
                c.reverse()
            chain.append((j, c)); i, end = j, tuple(round(v, 3) for v in c[-1])

    for i, pc in enumerate(pieces):
        if used[i]:
            continue
        used[i] = True
        c = list(pc.coords)
        fwd = walk(i, tuple(round(v, 3) for v in c[-1]))
        bwd = walk(i, tuple(round(v, 3) for v in c[0]))
        coords, obs = [], []
        for j, cc in reversed(bwd):
            coords += list(reversed(cc))[:-1]; obs.append(j)
        coords += c; obs.append(i)
        for j, cc in fwd:
            coords += cc[1:]; obs.append(j)
        line = LineString(coords)
        if line.length < 0.5:
            continue
        t, o = 0.0, []
        for j in obs:
            L = pieces[j].length
            o.append((t, t + L, piece_tags[j])); t += L
        cls = piece_tags[i].get("highway", "unknown")
        edges.append(dict(line=line, cls=cls, name=piece_tags[i].get("name", ""), obs=o))
    return edges
