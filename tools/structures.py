"""Bridges, tunnels and road profiles for a street graph, worked out for the whole map at once.

The partition's roads used to lie on the raw ground, so a bridge was a hole in the road and a
dip under a bridge was missing. `prep_map.py` has the rules that make a road rise and fall like a
road, carry a bridge straight between its ends and dip what passes under it; they are run here over
the partition's street edges instead of Overture's segments. `prep_map.py` is a script and cannot be
imported, so `solve` is its bridge section ported rule for rule (in its order, with the same
numbers), and the carrying and kink rules are `profiles.py` and the grading `grading.py`, which both share. When
`prep_map.py`'s rules change, change them here too.

It has to be global: a dip under one bridge lowers every road that meets the road underneath, so
a square cannot decide it from its own roads. `solve` takes a list of runs like `prep_map.py`'s
`pending` (a road densified every 4 m, each point [x, y, t], with its heights) and gives back the
heights, which points are a bridge's span, which ride on a deck beside one, and which are bored.
Nothing here is decided over the network: it is all build-time.
"""
import collections
import math

import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points, substring
from shapely.strtree import STRtree

import tunnels as TN
from grading import COARSE, grade
from profiles import carry_profile, ease_kinks

STEP = 4.0
LOW_STEP = 1.0      # metres between the points of a path with a short tunnel, which may pass under a street
SHORT_TUNNEL = 40.0  # metres: a path's tunnel no longer than this may be a low arch under a street (low_bores)

# the same widths as prep_map.py, which keeps them in step with the game's
RW = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 4, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.4, "track": 2.8, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
KERBED_RD = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
NARROW = {"footway", "steps", "cycleway", "path"}
VIADUCT = 40
CLEAR_ROAD, CLEAR_PATH, DIP = 4.6, 2.8, 35.0
CANAL_HEAD = 2.8     # metres of air over the water under a canal bridge (and enough over the towpath beside it)
RAIL_HEAD = 4.3      # metres from a track's line to a deck's underside: a train's roof and room over it (check_more.RAIL_HEAD)
# metres from a deck's top to its underside, with the game's lift taken off and a little to spare: the
# deepest a path's bridge or a road's is drawn (world.ts), as which kind it is is decided in the writer
FOOT_DECK, ROAD_DECK = 0.95, 1.15
LOCK_REACH, BESIDE = 15.0, 8.0
TOW_UP = 0.4      # the canal's banks stand this far above the water
TOW_REACH = 6.0   # metres out from the water's edge that the towpath may run
VERGE = 1.5       # metres in from a road's full width that a path must be to lie on top of it
SIGMA = 6.0       # metres: how far along a road its heights are evened out
GRADE = 0.18      # the steepest a road is laid where the hill under it is gentler than that
STEEPEST = {"motorway": 0.08, "trunk": 0.12, "primary": 0.15, "secondary": 0.15, "tertiary": 0.2, "living_street": 0.25,
            "residential": 0.25, "unclassified": 0.25, "pedestrian": 0.25, "service": 0.33, "unknown": 0.33}


# ---- which stretches of which street are structures --------------------------------------------

def overture_flags(props):
    """(kind, t0, t1) for each bridge or tunnel stretch an Overture segment marks, as fractions."""
    out = []
    for f in props.get("road_flags") or []:
        a, b = f.get("between") or (0.0, 1.0)
        vals = set(f.get("values") or [])
        if "is_bridge" in vals:
            out.append(("bridge", a, b))
        if "is_tunnel" in vals:
            out.append(("tunnel", a, b))
    return out


def match_structures(edges, segments, reach=3.0, step=1.0, merge=3.0):
    """{edge id: {"bridge": [[m0, m1], ...], "tunnel": [...]}} in metres along each edge.

    The street graph's own bridge and tunnel tags come from OSM (`osm_structures`), but the packed
    roads may predate them, so each stretch Overture marks is laid onto the edges it runs along too: the points of an edge within `reach` of the stretch
    and heading the same way. A footway that happens to run beside a street does not mark the
    street, so a path only marks paths; and a road only marks the same road (its class or its
    name), so a lane the data draws over a road's tunnel is not in that tunnel."""
    tree = STRtree([e["line"] for e in edges])
    found = {}
    for g, p in segments:
        flags = overture_flags(p)
        if not flags:
            continue
        cls = p.get("class") or "unknown"
        is_path = cls in PATHS
        name = (p.get("names") or {}).get("primary")
        for part in (g.geoms if hasattr(g, "geoms") else [g]):
            if part.geom_type != "LineString" or part.length < 0.5:
                continue
            for kind, a, b in flags:
                sub = substring(part, a * part.length, b * part.length)
                if sub.geom_type != "LineString" or sub.length < 0.3:
                    continue
                for j in tree.query(sub.buffer(reach)):
                    e = edges[int(j)]
                    if (e["cls"] in PATHS) != is_path:
                        continue
                    if not is_path and e["cls"].replace("_link", "") != cls and not (name and e.get("name") == name):
                        continue
                    for m0, m1 in _covered(e["line"], sub, reach, step, merge):
                        found.setdefault(e["id"], {}).setdefault(kind, []).append([round(m0, 1), round(m1, 1)])
    return {i: {k: _merged(v, merge) for k, v in d.items()} for i, d in found.items()}


def _covered(line, sub, reach, step, merge):
    """The stretches (metres along line) that lie along sub: near it and running the same way."""
    n = max(1, int(math.ceil(line.length / step)))
    ts = [line.length * k / n for k in range(n + 1)]
    ok = []
    for t in ts:
        pt = line.interpolate(t)
        if sub.distance(pt) > reach:
            ok.append(False)
            continue
        a, b = line.interpolate(max(0.0, t - 1.0)), line.interpolate(min(line.length, t + 1.0))
        s = sub.project(pt)
        if (s < 0.01 or s > sub.length - 0.01) and sub.distance(pt) > 1.0:
            ok.append(False)      # beside the stretch's end, not along it
            continue
        c, d = sub.interpolate(max(0.0, s - 1.0)), sub.interpolate(min(sub.length, s + 1.0))
        ux, uy, vx, vy = b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y
        nu, nv = math.hypot(ux, uy), math.hypot(vx, vy)
        ok.append(nu > 0 and nv > 0 and abs(ux * vx + uy * vy) / (nu * nv) >= 0.7)
    out, k = [], 0
    while k <= n:
        if not ok[k]:
            k += 1
            continue
        e = k
        while e + 1 <= n and ok[e + 1]:
            e += 1
        out.append([max(0.0, ts[k] - step / 2), min(line.length, ts[e] + step / 2)])
        k = e + 1
    return _merged(out, merge)


def osm_structures(edges, found=None, merge=3.0):
    """`found` ({edge id: {kind: ranges}}, as from `match_structures`) with each edge's own OSM ways
    tagged bridge or tunnel added, over the stretch of the edge each way covers. A covered way (an
    arcade, a canopy over a path, `tunnel=covered` under a deck) is neither: it stays on the ground
    with its roof over it. Nor is a closed way (`_ring`): drawn round the edge of a raised deck or
    plaza, it outlines the deck rather than crossing anything."""
    out = {i: {k: [list(r) for r in v] for k, v in d.items()} for i, d in (found or {}).items()}
    for e in edges:
        for t0, t1, tags in e.get("obs", ()):
            if tags.get("_ring"):
                continue
            for kind, yes in (("bridge", lambda v: v != "no"), ("tunnel", lambda v: v in ("yes", "culvert"))):
                if yes(tags.get(kind, "no")):
                    out.setdefault(e["id"], {}).setdefault(kind, []).append([round(t0, 1), round(t1, 1)])
    return {i: {k: _merged(v, merge) for k, v in d.items()} for i, d in out.items()}


def _merged(ranges, gap):
    out = []
    for a, b in sorted(ranges):
        if out and a <= out[-1][1] + gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


# ---- the profile rules, as prep_map.py has them -------------------------------------------------

def densify(line, step=STEP):
    """The edge as points [x, y, t] every `step` m or a little under, t the fraction along it."""
    n = max(1, int(math.ceil(line.length / step)))
    out = []
    for k in range(n + 1):
        p = line.interpolate(line.length * k / n)
        out.append([p.x, p.y, k / n])
    return out


def in_ranges(run, ranges):
    return {i for i, (_, _, t) in enumerate(run) if any(a <= t <= b for a, b in ranges)}


def tunnel_inside(idx):
    """The points of a tunnel's stretches inside it, not at its mouths: a way can only join it there."""
    return {i for i in idx if i - 1 in idx and i + 1 in idx}


def level_structures(run, z, bridges, tunnels):
    """Carry bridges and tunnels straight between the road at either end (`profiles.carry_profile`;
    a tunnel's ends as the survey has them)."""
    d = [0.0]
    for p, q in zip(run, run[1:]):
        d.append(d[-1] + math.dist(p[:2], q[:2]))
    for ranges, fit in ((tunnels, False), (bridges, True)):
        on = [any(a <= t <= b for a, b in ranges) for _, _, t in run]
        if any(on):
            carry_profile(z, d, on, [True] * len(z), fit=fit)
    return z


def stretches(idx):
    """Runs of consecutive indexes in the set idx, each as a sorted list."""
    out, cur = [], []
    for i in sorted(idx):
        if cur and i != cur[-1] + 1:
            out.append(cur)
            cur = []
        cur.append(i)
    if cur:
        out.append(cur)
    return out


def chain_edges(edges, straight=40.0):
    """The edges joined into through-roads: [[(edge, reversed), ...], ...].

    Overture's bridges and approaches run on past a junction that OSM splits a street at, and the
    height of a road should carry on across such a junction instead of starting afresh from the
    raw ground, so at each node the ends of two edges of the same class that carry straight on
    (within `straight` degrees), each the other's best fit, are taken as one road."""
    ends = {}
    for k, e in enumerate(edges):
        cs = list(e["line"].coords)
        for end, (p, q) in enumerate(((cs[0], cs[1]), (cs[-1], cs[-2]))):
            ends.setdefault((round(p[0], 3), round(p[1], 3)), []).append((k, end, math.atan2(q[1] - p[1], q[0] - p[0])))
    cand = []
    for node, es in ends.items():
        for i in range(len(es)):
            for j in range(i + 1, len(es)):
                (k1, e1, a1), (k2, e2, a2) = es[i], es[j]
                if k1 == k2 or edges[k1]["cls"] != edges[k2]["cls"]:
                    continue
                turn = abs((a1 - a2 + math.pi) % (2 * math.pi) - math.pi)     # pi when dead straight
                bend = math.degrees(math.pi - turn)
                if bend <= straight:
                    cand.append((bend, k1, e1, k2, e2))
    used, nxt = set(), {}
    for bend, k1, e1, k2, e2 in sorted(cand):
        if (k1, e1) in used or (k2, e2) in used:
            continue
        used |= {(k1, e1), (k2, e2)}
        nxt[(k1, e1)] = (k2, e2)
        nxt[(k2, e2)] = (k1, e1)
    seen, out = set(), []
    for k in range(len(edges)):
        if k in seen:
            continue
        # walk to one end of the road, then along it
        start, end = k, 0
        while (start, end) in nxt and nxt[(start, end)][0] not in seen:
            k2, e2 = nxt[(start, end)]
            if k2 == k:
                break
            start, end = k2, 1 - e2
            if start == k:
                break
        chain, cur, enter = [], start, end
        while cur not in seen:
            seen.add(cur)
            chain.append((edges[cur], enter == 1))
            far = 1 - enter
            if (cur, far) not in nxt:
                break
            cur, enter = nxt[(cur, far)]
        out.append(chain)
    return out


def make_run(chain, elev):
    """One through-road as a `pending` record: its run (each edge walked every 4 m, in the road's
    direction), smoothed heights with the structures carried straight, and which points are a span
    or bored. `parts` says which points came from which edge, to give each edge its own back."""
    run, parts, bridge, tunnel, base, osm = [], [], [], [], 0.0, []
    total = sum(e["line"].length for e, _ in chain) or 1.0
    for e, rev in chain:
        line = e["line"]
        pts = densify(LineString(list(line.coords)[::-1]) if rev else line)
        start = len(run) - 1 if run else 0
        for x, y, t in pts[1:] if run else pts:
            run.append([x, y, (base + t * line.length) / total])
            osm.append(_osm_level(e, line.length * (1 - t if rev else t)))
        parts.append((e["id"], rev, start, len(run) - 1))
        L = line.length
        for kind, into in (("bridge", bridge), ("tunnel", tunnel)):
            for a, b in (e.get("struct") or {}).get(kind, []):
                a, b = (L - b, L - a) if rev else (a, b)
                into.append(((base + a) / total, (base + b) / total))
        base += L
    c = chain[0][0]["cls"]
    z = level_structures(run, [elev(x, y) for x, y, _ in run], bridge, tunnel)
    bored = TN.bores(run, z, tunnel, elev, c)
    return dict(parts=parts, c=c, run=run, z=z, span=in_ranges(run, bridge), bored=bored,
                tunnel_ranges=tunnel, osm=osm)


def _osm_level(e, m):
    """(layer, roofed, passage) the OSM way under an edge's point `m` metres along it has: its layer,
    whether it is tagged as in a tunnel, a building's passage or under cover, and whether it is
    tagged as passing under a building (a passage, or covered)."""
    for t0, t1, tags in e.get("obs", ()):
        if t0 - 0.05 <= m <= t1 + 0.05:
            try:
                layer = int(float(tags.get("layer", 0)))
            except ValueError:
                layer = 0
            passage = tags.get("tunnel") == "building_passage" or tags.get("covered", "no") != "no"
            return layer, tags.get("tunnel", "no") != "no" or tags.get("covered", "no") != "no", passage
    return 0, False, False


def split_back(r):
    """{edge id: dict(z, span, deck, bored, dip, tow, gone, under)} from a solved through-road, each in its
    edge's own direction: `tow` the points on the canal's towpath, `gone` those in a canal tunnel,
    `under` those in a tunnel the data has that isn't bored (an underpass, or a path under a street),
    `cr` each bore given a crown of its own [from, to, crown] (deep_bores)."""
    out = {}
    for eid, rev, s, e in r["parts"]:
        idx = list(range(s, e + 1))
        if rev:
            idx.reverse()
        pos = {i: n for n, i in enumerate(idx)}
        last = len(idx) - 1
        bored, low, crowns = [], [], []
        for i0, i1 in r["bored"]:
            lo, hi = max(i0, s), min(i1, e)
            if lo > hi:
                continue
            pa = pos[lo] + ((1 if rev else -1) if i0 < s else 0)
            pb = pos[hi] + ((-1 if rev else 1) if i1 > e else 0)
            a, b = sorted((pa, pb))
            bored.append([a, b])
            if (i0, i1) in r.get("low", ()):
                low.append([a, b])
            if (i0, i1) in r.get("crowns", {}):
                crowns.append([a, b, r["crowns"][i0, i1]])
        out[eid] = dict(z=[round(r["z"][i], 2) for i in idx],
                        span=sorted(pos[i] for i in r["span"] if i in pos),
                        deck=sorted(pos[i] for i in r["deck"] if i in pos), bored=bored,
                        dip=sorted(pos[i] for i in r.get("dipped", ()) if i in pos),
                        tow=sorted(pos[i] for i in r["tow"] if i in pos) if r.get("tow") else [],
                        gone=sorted(pos[i] for i in r.get("gone", ()) if i in pos),
                        under=sorted(pos[i] for i in in_ranges(r["run"], r["tunnel_ranges"])
                                     if i in pos and not any(b0 <= i <= b1 for b0, b1 in r["bored"])),
                        **({"low": low} if low else {}), **({"cr": crowns} if crowns else {}))
    return out


TOW_OVER = 2.0      # metres a deck stands over the towpath at its end for the span to reach on over it


TOW_CLIMB = 1.0     # metres over the towpath a path's end at a street must be to have climbed the bank to it
TOW_FOOT = 0.5      # metres over the towpath the survey has a path's point at, still on the towpath


def towpath_points(run, z, c, canal_open, canal_tree, locks, bridged, streets=(), bank=None):
    """{i: height} of the points of a path's run that lie on the canal's towpath: level with the
    coping, whatever the survey made of the ground, so the path neither rises to the bridges over it
    nor dips under them. A path crossing the bank on its way to the towpath is level with it there.
    The run keeps its place (the street graph has fitted it); prep_map.py's `towpath` also moves the
    points onto the towpath's middle. `streets`: which of its ends (0, the last) meet a street; `bank`
    takes the points of a path climbing the bank from the towpath to one."""
    snap = c != "steps"
    at = {}
    for i, q in enumerate(run):
        if i in bridged:
            continue
        j = int(canal_tree.nearest(Point(q[:2])))
        a, b, lv = canal_open[j]
        L = math.dist(a[:2], b[:2]) or 1
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        t = min(1, max(0, ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L))
        cx, cy = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        o = -(q[0] - cx) * uy + (q[1] - cy) * ux
        k = 7 if o >= 0 else 8
        half = a[2] + (b[2] - a[2]) * t
        w = (a[k] + (b[k] - a[k]) * t) if len(a) > k and len(b) > k else 1.6
        p0, p1 = run[max(0, i - 1)], run[min(len(run) - 1, i + 1)]
        dl = math.dist(p0[:2], p1[:2]) or 1
        along = abs((p1[0] - p0[0]) * ux + (p1[1] - p0[1]) * uy) / dl
        if math.hypot(q[0] - cx, q[1] - cy) > half + w + 1.5 or by_a_lock(q[0], q[1], locks):
            continue
        if (w >= 1.5 and half + 0.3 < abs(o) <= half + w) and (not snap or along < 0.8):
            at[i] = lv + TOW_UP
        elif snap and w >= 1.5 and along >= 0.8 and half - 1.0 < abs(o) < half + w + 1.5:
            at[i] = lv + TOW_UP
    # a path that leaves the towpath up the bank to a street (at a bridge's end, say) is on the
    # towpath only as far as the survey has it near the towpath's level: put on it all the way, it
    # met the street a storey below it, against the bridge's side
    if at:
        tow = min(at.values())
        for end in streets:
            if z[end] < tow + TOW_CLIMB:
                continue
            i, step = end, (1 if end == 0 else -1)
            while 0 <= i < len(run) and z[i] > tow + TOW_FOOT:
                at.pop(i, None)
                if bank is not None:
                    bank.add(i)
                i += step
    on = sorted(at)
    for i0, i1 in zip(on, on[1:]):
        if 1 < i1 - i0 <= 3:
            for i in range(i0 + 1, i1):
                at[i] = at[i0] + (at[i1] - at[i0]) * (i - i0) / (i1 - i0)
    return at


def canal_bores(canal):
    """The canal's tunnels, each from portal to portal, as one area wide enough to take the towpath's
    ledge in it; None if the canal has none."""
    out = []
    for run in (canal or {}).get("runs", []):
        bore = []
        for q in run["p"] + [[0, 0, 0, 0, 0, 0, 0]]:
            if q[6] & 1:
                bore.append(q)
                continue
            if len(bore) > 1:
                out.append(LineString([b[:2] for b in bore]).buffer(max(b[2] for b in bore) + 1.3 + 2.0, cap_style="flat"))
            bore = []
    return shapely.union_all(out) if out else None


def by_a_lock(x, y, locks):
    """Is (x, y) beside one of the canal's locks, or between its wing walls?"""
    for lk in locks:
        (lx, ly), (hx, hy) = lk["lo"], lk["hi"]
        L = math.hypot(hx - lx, hy - ly) or 1
        ux, uy = (hx - lx) / L, (hy - ly) / L
        u, v = (x - lx) * ux + (y - ly) * uy, abs(-(x - lx) * uy + (y - ly) * ux)
        if v < 14 and -lk.get("tl", 2.2 + (lk["zh"] - lk["zl"]) * 6) - 1 < u < L + 3.5:
            return True
    return False


PASSAGE = 2.0    # metres of a path inside a building that make it a passage through it (write_tile.INDOORS_FLOOR)


def in_passage(buildings):
    """(run, i) -> whether a path's point i is at a building it runs on through. Its deck carries
    it through (write_tile.ways_out_of_buildings leaves a building by a deck to it): laid on the
    ground, the building would cut it in two."""
    inner = [g for g in (b.buffer(0).buffer(-0.3) for b in buildings) if not g.is_empty]
    tree = STRtree(inner) if inner else None

    def test(run, i):
        if tree is None:
            return False
        p = Point(run[i][:2])
        line = LineString([q[:2] for q in run])
        # (as far out from the wall as a passage is long: the deck reaches the path's first point
        # outside, and the path steps off it there rather than a stub short of the doorway)
        return any(inner[int(k)].distance(p) < PASSAGE and inner[int(k)].intersection(line).length > PASSAGE
                   for k in tree.query(p.buffer(PASSAGE)))
    return test


def solve(pending, water_polys, rail_tracks, canal, elev, bm, detail, buildings=()):
    """Decide the structures over a set of runs, changing their heights, `span` and `deck` in place.

    The rules are `prep_map.py`'s, in its order, with `tools/profiles.py` (shared with it) doing the
    carrying, grade and kink work: the network smoothed as a whole, underpasses, paths riding a road's
    deck, which marked spans are real bridges, the canal's bridges, every span carried straight, ways
    that cross at different heights, what dips under a bridge, the steepest each road may be, and
    paths afloat. Each run here is already a whole through-road, so `prep_map.py`'s `chains()` is each
    run in turn. `canal` is the canal file's contents (or None), `bm` the map's box, `detail` the
    finest scale the terrain has detail at (grading.terrain_detail), `buildings` the footprints."""
    water_tree = STRtree(water_polys)
    rail_lines = [LineString([q[:2] for q in t["p"]]) for t in rail_tracks if len(t["p"]) > 1]
    rail_tracks = [t for t in rail_tracks if len(t["p"]) > 1]
    rail_tree = STRtree(rail_lines)
    road_lines = [LineString([q[:2] for q in r["run"]]) for r in pending]
    road_tree = STRtree(road_lines)
    chains = [[(k, i) for i in range(len(r["run"]))] for k, r in enumerate(pending) if len(r["run"]) >= 2]
    TN.rebore(pending, elev)
    for r in pending:
        r["deck"] = set()
        r.setdefault("tow", {})
        r["ride"], r["beside"], r["least"], r["solid"] = {}, {}, {}, set()

    canal_open, locks = [], (canal or {}).get("locks", [])
    for run in (canal or {}).get("runs", []):
        p = run["p"]
        for i in range(len(p) - 1):
            if not (p[i][6] | p[i + 1][6]) & 3:
                canal_open.append((p[i], p[i + 1], run["lv"]))
    # where the towpath goes through one of the canal's tunnels it is the tunnel's own ledge, which
    # the game builds, so a path is not drawn there, and nothing over it is a bridge
    bores = canal_bores(canal)
    if bores is not None:
        for r in pending:
            if r["c"] in PATHS and r["c"] != "pedestrian":
                r["gone"] = {i for i, q in enumerate(r["run"]) if bores.contains(Point(q[:2]))}
                if r["gone"]:
                    r["span"] -= r["gone"]
                    r["bored"] = [b for b in r["bored"] if not any(b[0] <= i <= b[1] for i in r["gone"])]
    # the towpath is level with the canal's banks: nothing eases it and no span is carried over it
    if canal_open:
        canal_tree = STRtree([LineString([a[:2], b[:2]]) for a, b, _ in canal_open])
        def at_street(k, q):
            # (as near as joined() takes a junction to be: the graph has fitted both)
            return any(pending[int(j)]["c"] not in PATHS and road_lines[int(j)].distance(Point(q[:2])) < 2.5
                       for j in road_tree.query(Point(q[:2]).buffer(2.5)) if int(j) != k)
        for k, r in enumerate(pending):
            if r["c"] in PATHS:
                ends = [e for e in (0, len(r["run"]) - 1) if at_street(k, r["run"][e])]
                r["bank"] = set()
                r["tow"] = {i: h for i, h in towpath_points(r["run"], r["z"], r["c"], canal_open, canal_tree, locks, r["span"], ends, r["bank"]).items()
                            if i not in r.get("gone", ())}
                r["span"] -= set(r["tow"])
                for i, h in r["tow"].items():
                    r["z"][i] = h

    smooth_network(pending, chains, elev, detail)

    def joined(k, j):
        """Do roads k and j meet: an end of one on the other, or a point of each at the same spot (a
        crossroads, which the data gives both roads a point at)? Then they are a junction, not a crossing."""
        for a, b in ((k, j), (j, k)):
            run = pending[a]["run"]
            for q in (run[0], run[-1]):
                if road_lines[b].distance(Point(q[:2])) < 2.5:
                    return True
        if road_lines[k].crosses(road_lines[j]):
            x = road_lines[k].intersection(road_lines[j])
            x = x.geoms[0] if hasattr(x, "geoms") else x
            if x.geom_type == "Point" and all(any(math.dist(q[:2], (x.x, x.y)) < 0.7 for q in pending[i]["run"]) for i in (k, j)):
                return True
        return False

    def steps_over(r, over, o, j, k):
        """Are mapped steps carried over way j? Only when OSM says so: the steps on a different layer
        from it, or it tagged as in a tunnel or under cover where they pass. Steps that meet it at a
        node, or cross a way OSM has open there, meet it at grade, as a flight down to it."""
        if not over or joined(k, j):
            return False
        line = road_lines[j]
        for i in over:
            q = r["run"][i][:2]
            t = min(range(len(o["run"])), key=lambda n: math.dist(o["run"][n][:2], q))
            if line.distance(Point(q)) > RW.get(o["c"], 4) / 2 + 1.0:
                continue
            if r["osm"][i][0] != o["osm"][t][0] or o["osm"][t][1]:
                return True
        return False

    deep_bores(pending, road_lines, road_tree, elev)

    # an underpass: a tunnel stretch too shallow to bore, which stays a road in a cutting. Whatever
    # crosses over it is carried over as a bridge, with the cutting as wide as the road in it. Not
    # the ends of a tunnel that is bored: those are its road coming out of the hill face, and what
    # passes near them is on the ground over the tunnel (a bridge there is the data's own)
    underpasses = []
    for k, r in enumerate(pending):
        if not r["tunnel_ranges"] or r["bored"]:
            continue
        shallow = in_ranges(r["run"], r["tunnel_ranges"]) - {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)}
        # (the cuttings at either end of a bored tunnel are two underpasses, not one through the hill)
        for st in stretches(shallow):
            pts = [r["run"][i][:2] for i in st]
            # (a path through a building's passage, which the data also calls a tunnel, is at the
            # street's level, with nothing over it to carry)
            deep = max((elev(r["run"][i][0], r["run"][i][1]) - r["z"][i] for i in st), default=0)
            if len(pts) >= 2:
                mid = LineString(pts)
                underpasses.append((k, mid.buffer(max(TN.HALF + TN.CUT, RW.get(r["c"], 4) / 2 + 2.5) + 1.0), mid, deep))
    if underpasses:
        under_tree = STRtree([u[1] for u in underpasses])
        for k, r in enumerate(pending):
            for j in under_tree.query(road_lines[k]):
                under_k, poly, mid, deep = underpasses[int(j)]
                if under_k == k:
                    continue
                # (a street in a tunnel of its own beside it, the other carriageway, is not over it)
                over = {i for i, q in enumerate(r["run"]) if poly.contains(Point(q[:2]))}
                if r["c"] not in PATHS:
                    over -= in_ranges(r["run"], r["tunnel_ranges"])
                if r["c"] == "steps" and not steps_over(r, over, pending[under_k], under_k, k):
                    continue
                r["span"] |= over
                # one crossing it is a bridge whatever the survey's ground there (2. keeps it), and so
                # is one the data lays right on top of the road down in it, along it
                if deep < 2.5:
                    continue
                if road_lines[k].crosses(mid):
                    r.setdefault("overpass", set()).update(over)
                else:
                    half = RW.get(pending[under_k]["c"], 4) / 2 + 0.5
                    top = {i for i in over if mid.distance(Point(r["run"][i][:2])) < half}
                    if len(top) >= 3:
                        r.setdefault("overpass", set()).update(top)

    def crossing(k, j, line):
        """Where road j crosses the stretch line of road k, well inside it: the point, or None."""
        if j == k or joined(k, j) or not road_lines[j].crosses(line):
            return None
        x = road_lines[j].intersection(line)
        x = x.geoms[0] if hasattr(x, "geoms") else x
        if x.geom_type != "Point":
            return None
        t = line.project(x)
        return x if 1 < t < line.length - 1 else None

    def span_line(r, st):
        a, b = max(0, st[0] - 1), min(len(r["run"]) - 1, st[-1] + 1)
        return a, b, LineString([r["run"][i][:2] for i in range(a, b + 1)])

    # (a stretch the data has both in a tunnel and on a bridge is in the tunnel: carried as a span, it
    # stood over the street on the hill above and pushed it down under itself)
    for r in pending:
        if r["tunnel_ranges"] and r["span"]:
            r["span"] -= tunnel_inside(in_ranges(r["run"], r["tunnel_ranges"]))

    # 1. paths along a road's marked span ride on its deck
    decks, was_span = [], {}
    for k, r in enumerate(pending):
        if (r["c"] in PATHS and r["c"] != "pedestrian") or not r["span"]:
            continue
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            reach = RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.5 + (4.0 if r["c"] == "pedestrian" else 0.0)
            decks.append((k, line.buffer(reach, cap_style=2), line, [r["z"][i] for i in range(a, b + 1)], a, b))
    if decks:
        deck_tree = STRtree([d[1] for d in decks])
        for r in pending:
            if r["c"] not in NARROW:
                continue
            pl = LineString([q[:2] for q in r["run"]])
            # (where the data has the path in a tunnel it passes under, not over)
            under = in_ranges(r["run"], r["tunnel_ranges"])
            for j in deck_tree.query(pl):
                k, poly, line, zs, _, _ = decks[int(j)]
                if pl.length > 6 and pl.intersection(poly).length < 0.6 * min(pl.length, line.length) and road_lines[k].crosses(pl):
                    continue
                for i, q in enumerate(r["run"]):
                    # (nor does one climbing the bank from the towpath to the street at its end)
                    if i in r["tow"] or i in under or i in r.get("bank", ()) or not poly.contains(Point(q[:2])):
                        continue
                    t = line.project(Point(q[:2])) / (line.length or 1) * (len(zs) - 1)
                    lo = min(len(zs) - 2, int(t))
                    f = t - lo
                    # only where the data has the path on a bridge itself, or it is at the deck's
                    # height already: a path going down past the bridge's end doesn't ride it
                    if i not in r["span"] and abs(r["z"][i] - (zs[lo] + (zs[lo + 1] - zs[lo]) * f)) > 1.0:
                        continue
                    was_span[id(r), i] = i in r["span"]
                    r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
                    r["deck"].add(i)
                    r["span"].discard(i)
                    r["ride"][i] = int(j)

    # 2. which marked spans are real bridges
    for k, r in enumerate(pending):
        if not r["span"]:
            continue
        run, z, keep = r["run"], r["z"], set()
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            real = any(water_polys[int(j)].intersects(line) for j in water_tree.query(line)) \
                or any(rail_lines[int(j)].intersects(line) for j in rail_tree.query(line)) \
                or any(z[i] - elev(run[i][0], run[i][1]) > 2.5 for i in st) \
                or any(i in r.get("overpass", ()) for i in st)
            solid = real
            if not real:
                for j in road_tree.query(line):
                    j = int(j)
                    x = crossing(k, j, line)
                    if x is None or pending[j]["deck"]:
                        continue
                    i = min(range(len(pending[j]["run"])), key=lambda i: math.dist(pending[j]["run"][i][:2], (x.x, x.y)))
                    if z[st[0]] - pending[j]["z"][i] >= 3.5 or (r["c"] not in PATHS and pending[j]["c"] not in PATHS and line.length >= 20):
                        real = True
                        break
                    # a bridge marked over a road, the road passing well inside it, is a bridge
                    # however the survey has filled the gap under it
                    if pending[j]["c"] not in PATHS and 4 < line.project(x) < line.length - 4:
                        real = True
                        r["solid"].update(st)
                        break
            if real:
                keep |= set(st)
            if real and solid:
                r["solid"].update(st)
        r["span"] = keep

    # 2b. a path down on the ground that rode a pedestrian street's span that isn't a bridge (a
    # building's passage beside a square, which the pedestrian street's wide reach takes in) is on
    # the ground: left riding, it was a deck the ground was dug out under. It keeps the height it
    # took, the street's beside it, as the streets it meets are levelled to it. One through a
    # building rides on
    passage = in_passage(buildings)
    for r in pending:
        for i, j in list(r["ride"].items()):
            k, _, _, _, a, b = decks[j]
            if pending[k]["c"] != "pedestrian" or any(a <= m <= b for m in pending[k]["span"]) or was_span[id(r), i] \
                    or abs(r["z"][i] - elev(*r["run"][i][:2])) > 0.5 or passage(r["run"], i):
                continue
            r["deck"].discard(i)
            del r["ride"][i]

    # 2'. a path running along beside a street goes where the street goes: where the street isn't on
    # a bridge, its pavement isn't one either
    streets_ = [k for k, r in enumerate(pending) if r["c"] not in PATHS or r["c"] == "pedestrian"]
    street_tree = STRtree([road_lines[k] for k in streets_]) if streets_ else None
    for k, r in enumerate(pending):
        if r["c"] not in NARROW or not r["span"] or street_tree is None:
            continue
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            if line.length < 2:
                continue
            for j in street_tree.query(line.buffer(10)):
                o = pending[streets_[int(j)]]
                ln = road_lines[streets_[int(j)]]
                if ln.buffer(RW.get(o["c"], 4) / 2 + 6).contains(line) and not any(
                        ln.distance(Point(o["run"][i][:2])) < 0.5 and line.distance(Point(o["run"][i][:2])) < 12 for i in o["span"]):
                    ux, uy = line.coords[-1][0] - line.coords[0][0], line.coords[-1][1] - line.coords[0][1]
                    p0 = ln.interpolate(ln.project(Point(line.coords[0])))
                    p1 = ln.interpolate(ln.project(Point(line.coords[-1])))
                    if abs(ux * (p1.x - p0.x) + uy * (p1.y - p0.y)) < 0.7 * line.length * math.dist((p0.x, p0.y), (p1.x, p1.y)):
                        continue
                    r["span"] -= set(st)
                    break

    # 2b. a path's span crossing a street at the street's level is a pedestrian crossing there,
    # not a bridge over it: the street wins and the span stops either side of it
    for k, r in enumerate(pending):
        if r["c"] not in PATHS or not r["span"]:
            continue
        run, z = r["run"], r["z"]
        for st in stretches(set(r["span"])):
            a, b, line = span_line(r, st)
            if line.length >= VIADUCT:
                continue
            for j in road_tree.query(line):
                j = int(j)
                if pending[j]["c"] in PATHS:
                    continue
                x = crossing(k, j, line)
                if x is None:
                    continue
                o = pending[j]
                i = min(range(len(o["run"])), key=lambda i: math.dist(o["run"][i][:2], (x.x, x.y)))
                if st[0] in r["solid"]:
                    continue
                if abs(z[min(range(len(run)), key=lambda i: math.dist(run[i][:2], (x.x, x.y)))] - o["z"][i]) < 1.0:
                    reach = RW.get(o["c"], 4) / 2 + 2.0
                    for i2 in st:
                        if math.dist(run[i2][:2], (x.x, x.y)) < reach + 2:
                            r["span"].discard(i2)

    # 2b'. and a path's span never runs across a street it meets at the street's level
    vehicle_idx = [j for j, o in enumerate(pending) if o["c"] not in PATHS]
    vehicle_tree = STRtree([road_lines[j] for j in vehicle_idx])
    for r in pending:
        if r["c"] not in PATHS or not r["span"]:
            continue
        for i in sorted(r["span"]):
            if i in r["solid"]:
                continue
            pt = Point(r["run"][i][:2])
            for jj in vehicle_tree.query(pt.buffer(8)):
                o = pending[vehicle_idx[int(jj)]]
                if road_lines[vehicle_idx[int(jj)]].distance(pt) > RW.get(o["c"], 4) / 2 + 1.5:
                    continue
                kk = min(range(len(o["run"])), key=lambda kk: math.dist(o["run"][kk][:2], r["run"][i][:2]))
                if abs(o["z"][kk] - r["z"][i]) < 1.0:
                    r["span"].discard(i)
                    break

    # 2c. a road marked as a bridge where it crosses under the railway (the data has it the wrong
    # way up) is no bridge: it passes under
    for k, r in enumerate(pending):
        if not r["span"] or not rail_lines:
            continue
        for st in stretches(set(r["span"])):
            a, b, line = span_line(r, st)
            for t in rail_tree.query(line):
                rl = rail_lines[int(t)]
                if not rl.crosses(line):
                    continue
                x = rl.intersection(line)
                x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point":
                    continue
                tp = rail_tracks[int(t)]["p"]
                kk = min(range(len(tp)), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                zr = r["z"][min(range(len(r["run"])), key=lambda i: math.dist(r["run"][i][:2], (x.x, x.y)))]
                if zr < tp[kk][2] - 1.0:
                    for i2 in st:
                        r["span"].discard(i2)

    def joined_near(j, x, y, skip):
        """Road j and the roads that meet it within DIP of (x, y), at its level, and those that meet
        them: a road beside it there that joins it nowhere near is not brought down with it."""
        zone = Point(x, y).buffer(DIP)
        near = {int(i): road_lines[int(i)].intersection(zone) for i in road_tree.query(zone) if int(i) not in skip}
        near[j] = road_lines[j].intersection(zone)

        def z_at(i, p):
            run = pending[i]["run"]
            return pending[i]["z"][min(range(len(run)), key=lambda m: math.dist(run[m][:2], (p.x, p.y)))]
        seen, todo = {j}, [j]
        while todo:
            a = todo.pop()
            for b, g in near.items():
                if b in seen or g.is_empty or near[a].is_empty or near[a].distance(g) > 0.5:
                    continue
                pa, pb = nearest_points(near[a], g)
                if abs(z_at(a, pa) - z_at(b, pb)) < 2.0:
                    seen.add(b)
                    todo.append(b)
        return seen

    def ease_roads(x, y, head, skip, down=True, reach=None, own=None, only=None):
        """Bring every road's points within DIP of (x, y) down to head (or up, with down False),
        easing in and out, so roads meeting there stay joined; skip: road indexes left alone (the
        bridge itself), and any road's points on a span or a deck are left alone too (except road
        own's, the one being carried over the canal), as is the towpath; a road that is a bridge
        somewhere else is still brought down beside it, and its deck carried to its new approaches
        afterwards (carry_spans). With `only`, just those roads."""
        n = 0
        for j in road_tree.query(Point(x, y).buffer(reach or DIP)):
            j = int(j)
            if j in skip or (only is not None and j not in only):
                continue
            o = pending[j]
            for i, q in enumerate(o["run"]):
                if j != own and (i in o["span"] or i in o["deck"]):
                    continue
                if i in o["tow"]:
                    continue
                d = math.dist(q[:2], (x, y))
                if d >= DIP:
                    continue
                e = d / DIP
                e = e * e * (3 - 2 * e)
                want = head + (o["z"][i] - head) * e
                if (want < o["z"][i]) if down else (want > o["z"][i]):
                    if down:
                        o.setdefault("dipped", set()).add(i)
                    o["z"][i] = want
                    n += 1
        return n

    # 2d. a road or path crossing the canal is a bridge over it, with headroom for a boat; unless
    # the canal is in a tunnel there (it passes under the road)
    canal_runs, gates, lock_levels = [], [], []
    for run in (canal or {}).get("runs", []):
        pts = run["p"]
        for i in range(len(pts) - 1):
            if (pts[i][6] | pts[i + 1][6]) & 1:
                continue
            canal_runs.append((LineString([pts[i][:2], pts[i + 1][:2]]), run["lv"], max(pts[i][2], pts[i + 1][2])))
    gates = [Point(g) for lk in locks for g in (lk["lo"], lk["hi"])]
    lock_levels = [(Point(lk["lo"]), Point(lk["hi"]), max(lk["zl"], lk["zh"])) for lk in locks]
    canal_tree = STRtree([c[0] for c in canal_runs])
    canal_x = []
    for k, r in enumerate(pending):
        for j in canal_tree.query(road_lines[k]):
            seg, lv, half = canal_runs[int(j)]
            if not road_lines[k].crosses(seg):
                continue
            x = road_lines[k].intersection(seg)
            x = x.geoms[0] if hasattr(x, "geoms") else x
            if x.geom_type != "Point":
                continue
            if r["c"] in PATHS and any(g.distance(x) < LOCK_REACH for g in gates):
                continue
            # over a lock's chamber a boat rises to the upper pound, so a crossing there clears the
            # higher of the two; one below the bottom gates (Pulteney Road at Bath Deep Lock) has
            # only the lower pound under it
            for lo, hi, top in lock_levels:
                if lo.distance(x) + hi.distance(x) < lo.distance(hi) + 6:
                    lv = max(lv, top)
            canal_x.append((k, x, lv, half))
    road_x = [(x, lv, k) for k, x, lv, half in canal_x if pending[k]["c"] not in PATHS]
    for k, x, lv, half in canal_x:
        r, run = pending[k], pending[k]["run"]
        deck = lv + CANAL_HEAD + 0.6
        reach = half + 6.0
        beside = next((ok for ox, _, ok in road_x if x.distance(ox) < BESIDE), None) if r["c"] in PATHS else None
        ease_roads(x.x, x.y, deck, set(), down=False, own=k)
        for i, q in enumerate(run):
            if math.dist(q[:2], (x.x, x.y)) < reach:
                if beside is not None:
                    o = pending[beside]
                    r["deck"].add(i)
                    r["span"].discard(i)
                    r["beside"][i] = beside
                    r["z"][i] = o["z"][min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], q[:2]))]
                else:
                    r["span"].add(i)
                    r["solid"].add(i)
                if math.dist(q[:2], (x.x, x.y)) < half + 1.5:
                    r["least"][i] = lv + CANAL_HEAD + 0.6
                # and over the towpath, with a walker's headroom that still holds once heights are
                # rounded to the decimetre
                pt = Point(q[:2])
                if any(canal_runs[int(c)][0].distance(pt) < half + TOW_REACH for c in canal_tree.query(pt.buffer(half + TOW_REACH))):
                    r["least"][i] = max(r["least"].get(i, -math.inf), lv + TOW_UP + CLEAR_PATH + 0.1)

    # 2e. a deck over the railway clears a train with room over its roof: the crest eases out over its
    # approaches (carry_profile), and the ways meeting its ends come up to them in the writer
    for r in pending:
        for st in stretches(set(r["span"])):
            a, b, line = span_line(r, st)
            for t in rail_tree.query(line):
                rl = rail_lines[int(t)]
                if not rl.crosses(line):
                    continue
                x = rl.intersection(line)
                x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point":
                    continue
                tp = rail_tracks[int(t)]["p"]
                cum = np.concatenate([[0], np.cumsum([math.dist(u[:2], v[:2]) for u, v in zip(tp, tp[1:])])])
                track = float(np.interp(rl.project(x), cum, [q[2] for q in tp]))
                zr = r["z"][min(range(a, b + 1), key=lambda i: math.dist(r["run"][i][:2], (x.x, x.y)))]
                # (a track over the way is the railway's own bridge over it)
                if zr < track + 1.0:
                    continue
                need = track + RAIL_HEAD + (FOOT_DECK if r["c"] in PATHS else ROAD_DECK)
                for i in st:
                    if rl.distance(Point(r["run"][i][:2])) < STEP:
                        r["least"][i] = max(r["least"].get(i, -math.inf), need)

    def carry_spans(raise_only=False):
        """Carry every span straight (carry_profile) along whole roads; raise_only: a deck may come
        up but not down (once what passes under has been given headroom under it)."""
        n_spans = 0
        on_deck = collections.defaultdict(list)
        for k, r in enumerate(pending):
            for i in r["span"]:
                on_deck[(round(r["run"][i][0]), round(r["run"][i][1]))].append((k, i))

        def deck_at(q, own, z=None):
            """The deck of a bridge that road end q (at height z) joins, if any: a road ending well
            below a deck (more than any junction could be: less than headroom) passes under it."""
            for dx_ in (-1, 0, 1):
                for dy_ in (-1, 0, 1):
                    for k, i in on_deck.get((round(q[0]) + dx_, round(q[1]) + dy_), []):
                        h = pending[k]["z"][i]
                        if k not in own and math.dist(pending[k]["run"][i][:2], q[:2]) < 1.0 and (z is None or abs(h - z) < 2.5):
                            return h
            return None
        for chain in chains:
            pts = [pending[k]["run"][i] for k, i in chain]
            z0_, z1_ = pending[chain[0][0]]["z"][chain[0][1]], pending[chain[-1][0]]["z"][chain[-1][1]]
            if not any(i in pending[k]["span"] for k, i in chain) and deck_at(pts[0], (), z0_) is None and deck_at(pts[-1], (), z1_) is None:
                continue
            z = [pending[k]["z"][i] for k, i in chain]
            on = [i in pending[k]["span"] for k, i in chain]
            d = [0.0]
            for a, b in zip(pts, pts[1:]):
                d.append(d[-1] + math.dist(a[:2], b[:2]))
            free = [not on[m] and i not in pending[k]["deck"] and i not in pending[k]["tow"] for m, (k, i) in enumerate(chain)]
            own = {k for k, _ in chain}
            # an end on the ground meeting a bridge there rises or falls to its deck over the last 20 m
            for e0, step in ((0, 1), (len(chain) - 1, -1)):
                h = deck_at(pts[e0], own, z[e0]) if free[e0] else None
                if h is None or abs(h - z[e0]) < 0.2:
                    continue
                j = e0
                while 0 <= j < len(chain) and free[j] and abs(d[j] - d[e0]) < 20:
                    w = abs(d[j] - d[e0]) / 20
                    w = w * w * (3 - 2 * w)
                    z[j] = h + (z[j] - h) * w
                    j += step
            least = [pending[k]["least"].get(i, -math.inf) for k, i in chain]
            before = list(z)
            n_spans += carry_profile(z, d, on, free, (deck_at(pts[0], own, z[0]), deck_at(pts[-1], own, z[-1])), least)
            if raise_only:
                z = [max(a, b) if on[m] else a for m, (a, b) in enumerate(zip(z, before))]
            for (k, i), h in zip(chain, z):
                pending[k]["z"][i] = h
        # and the paths riding on a road's deck beside it take its new heights
        for r in pending:
            for i, j in r["ride"].items():
                k, poly, line, _, a, b = decks[j]
                zs = pending[k]["z"][a:b + 1]
                t = line.project(Point(r["run"][i][:2])) / (line.length or 1) * (len(zs) - 1)
                lo = min(len(zs) - 2, int(t))
                f = t - lo
                r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
        return n_spans

    # 2f. two ways crossing a metre and a half or more apart in height, with no bridge in the data
    # and no junction between them, cross on a bridge: the upper one is carried over the lower one
    for k, r in enumerate(pending):
        for j in road_tree.query(road_lines[k]):
            j = int(j)
            if j <= k:
                continue
            x = crossing(k, j, road_lines[k])
            if x is None:
                continue
            o = pending[j]
            near_k = [i for i, q in enumerate(r["run"]) if math.dist(q[:2], (x.x, x.y)) < 6]
            near_j = [i for i, q in enumerate(o["run"]) if math.dist(q[:2], (x.x, x.y)) < 6]
            if not near_k or not near_j:
                continue
            if any(i in r["span"] | r["deck"] for i in near_k) or any(i in o["span"] | o["deck"] for i in near_j):
                continue
            if r["tunnel_ranges"] and in_ranges([r["run"][i] for i in near_k], r["tunnel_ranges"]):
                continue
            if o["tunnel_ranges"] and in_ranges([o["run"][i] for i in near_j], o["tunnel_ranges"]):
                continue
            zk, zj = min(r["z"][i] for i in near_k), min(o["z"][i] for i in near_j)
            if detail > COARSE:
                # (where they cross, and each no lower than the survey there, which a way graded through a
                # bump in it was cut from: grading.COARSE)
                at = lambda w, near: w["z"][min(near, key=lambda i: math.dist(w["run"][i][:2], (x.x, x.y)))]
                zk, zj = (max(at(w, near), elev(x.x, x.y)) for w, near in ((r, near_k), (o, near_j)))
            if abs(zk - zj) < 1.5:
                continue
            (up, upi), (lo_, loi) = ((r, k), (o, j)) if zk > zj else ((o, j), (r, k))
            reach = RW.get(lo_["c"], 4) / 2 + 2.5
            for i, q in enumerate(up["run"]):
                if math.dist(q[:2], (x.x, x.y)) < reach and i not in up["tow"]:
                    up["span"].add(i)
                    up["solid"].add(i)
    carry_spans()
    carry_spans()

    # 2g. a road the data lays right on top of another, well above it (a lane along the top of a
    # cutting drawn over the road down in it, or a path whose bridge the data stops short of the
    # road it crosses), is on a bridge there: the ground is the lower road's. (`prep_map.py` finds
    # these after the dips; here they come before, so what passes under is dipped for headroom too).
    # Over a bored tunnel the ground is the hill over its roof, and a way on it stays on the ground;
    # and a path along the top of a cutting's side, over the road's verge, is beside it, not on it.
    # On a coarse survey (grading.COARSE) a road graded down through a bump in it (a building) is
    # measured from the ground it was cut from, which the way crossing it still has; a fine one sees
    # the gap under a footbridge, and the road under it is measured as it lies
    for k, r in enumerate(pending):
        if r["c"] in ("steps", "pedestrian"):
            continue
        before = set(r["span"])
        for j in road_tree.query(road_lines[k].buffer(4.0)):
            o = pending[int(j)]
            if int(j) == k or o["c"] in PATHS:
                continue
            half, line = RW.get(o["c"], 4) / 2 - (VERGE if r["c"] in PATHS else 0.0), road_lines[int(j)]
            for i, q in enumerate(r["run"]):
                if i in r["span"] or i in r["deck"] or i in r["tow"] or line.distance(Point(q[:2])) > half:
                    continue
                m_ = min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], q[:2]))
                if any(b0 <= m_ <= b1 for b0, b1 in o["bored"]):
                    continue
                below = max(o["z"][m_], elev(*o["run"][m_][:2])) if detail > COARSE else o["z"][m_]
                if r["z"][i] - below >= (2.5 if r["c"] in PATHS else 3.0) and m_ not in o["span"]:
                    r["span"].add(i)
                    r["solid"].add(i)
        # (and its bridge doesn't touch down for a point or two between them)
        if r["span"] != before:
            on = set(r["span"])
            for i in range(1, len(r["run"]) - 1):
                if i not in on and i not in r["deck"] and i not in r["tow"] and \
                        any(i - n in on for n in (1, 2)) and any(i + n in on for n in (1, 2)):
                    r["span"].add(i)
                    r["solid"].add(i)
    carry_spans(True)

    # 3. what passes under a road's bridge passes under it (but not the rest of the bridge's own
    # road, nor a road joining it on the bridge)
    dips = []
    def own_road(k, line):
        on = line.buffer(1.0)
        return {k} | {int(j) for j in road_tree.query(on) if any(on.contains(Point(pending[int(j)]["run"][e][:2])) for e in (0, -1))}
    dipped = 0
    for k, r in enumerate(pending):
        if not r["span"]:
            continue
        run, z = r["run"], r["z"]
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            solid = st[0] in r["solid"] or line.length >= 20
            if r["c"] in PATHS:
                solid = line.length >= VIADUCT
            for j in road_tree.query(line):
                j = int(j)
                x = crossing(k, j, line)
                if x is None:
                    continue
                o = pending[j]
                # (but a path coming off a bridge's deck and down under the same bridge, to the
                # towpath under it, has the deck only behind it)
                m_ = min(range(len(o["run"]) - 1), key=lambda m: LineString([o["run"][m][:2], o["run"][m + 1][:2]]).distance(x))
                if any(i in o["span"] | o["deck"] for i in (m_ - 1, m_, m_ + 1, m_ + 2)):
                    continue
                if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"]):
                    continue
                t = line.project(x) / (line.length or 1) * (b - a)
                lo = a + min(b - a - 1, int(t))
                f = t - (lo - a)
                deck = z[lo] + (z[lo + 1] - z[lo]) * f
                near = [o["z"][i] for i in range(len(o["run"])) if math.dist(o["run"][i][:2], (x.x, x.y)) < 6]
                under = min(near) if near else deck
                if not solid and not 3 < line.project(x) < line.length - 3:
                    continue
                # a bridge reaches right over what goes under it: where that crosses at its very end,
                # its span runs on a few metres past, rather than the road coming down off its deck
                # onto an embankment the way under runs into
                to_a, to_b = math.dist(run[st[0]][:2], (x.x, x.y)), math.dist(run[st[-1]][:2], (x.x, x.y))
                if min(to_a, to_b) < 5:
                    near_i = min(range(len(run)), key=lambda i: math.dist(run[i][:2], (x.x, x.y)))
                    step = -1 if to_a < to_b else 1
                    end = st[0] if step < 0 else st[-1]
                    for i in range(end, near_i + step * 2 + step, step):
                        if 0 <= i < len(run) and i not in r["deck"]:
                            r["span"].add(i)
                            r["solid"].add(i)
                if o["c"] in PATHS and line.length < VIADUCT and st[0] not in r["solid"] and abs(deck - under) < 1.0:
                    continue
                dips.append((j, x))
                head = deck - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD) - 0.5
                skip = own_road(k, line)
                dipped += ease_roads(x.x, x.y, head, skip, only=joined_near(j, x.x, x.y, skip))
    # 3b. and under the railway's bridges and viaducts
    for track in rail_tracks:
        tp = track["p"]
        k = 0
        while k < len(tp):
            if tp[k][3] != 1:
                k += 1
                continue
            e = k
            while e + 1 < len(tp) and tp[e + 1][3] == 1:
                e += 1
            if e > k:
                seg = LineString([q[:2] for q in tp[k:e + 1]])
                for j in road_tree.query(seg):
                    j = int(j)
                    o = pending[j]
                    if not road_lines[j].crosses(seg):
                        continue
                    x = road_lines[j].intersection(seg)
                    x = x.geoms[0] if hasattr(x, "geoms") else x
                    if x.geom_type != "Point":
                        continue
                    if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 4 for i in o["span"] | o["deck"]):
                        continue
                    kk = min(range(k, e + 1), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                    head = tp[kk][2] - 0.9 - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
                    dipped += ease_roads(x.x, x.y, head, set(), only=joined_near(j, x.x, x.y, set()))
                    dips.append((j, x))
            k = e + 1
    if dipped:
        carry_spans(True)

    limit_grades(pending, chains, dips, detail)
    finer_runs(pending)
    low_bores(pending, road_lines, road_tree)

    # 4. a path through the water (the data has no bridge) is a footbridge: its points well
    # inside a pond or river are a span, just above the water
    afloat = 0
    for r in pending:
        if r["c"] not in PATHS:
            continue
        pl = LineString([q[:2] for q in r["run"]])
        for w in water_tree.query(pl):
            poly = water_polys[int(w)]
            if not poly.intersects(pl):
                continue
            near = poly.intersection(bm)
            ring = max(getattr(near, "geoms", [near]), key=lambda g: g.area if g.geom_type == "Polygon" else 0, default=None)
            if ring is None or ring.geom_type != "Polygon":
                continue
            coords = list(ring.exterior.coords)
            if len(coords) < 3:
                continue
            wz = min(elev(x, y) for x, y in coords[::max(1, len(coords) // 40)]) + 0.1
            for i, q in enumerate(r["run"]):
                pt = Point(q[:2])
                if poly.contains(pt) and poly.exterior.distance(pt) > 1.5 and i not in r["deck"]:
                    r["span"].add(i)
                    r["z"][i] = max(r["z"][i], wz + 0.8)
                    afloat += 1
    if afloat:
        carry_spans(True)

    for r in pending:
        # a point the towpath took that has a bridge on both sides of it is on the bridge, high over
        # the bank, not down on the towpath
        on = r["span"] | r["deck"]
        for i in [i for i in r["tow"] if i - 1 in on and i + 1 in on]:
            del r["tow"][i]
            r["z"][i] = (r["z"][i - 1] + r["z"][i + 1]) / 2
            (r["span"] if i - 1 in r["span"] else r["deck"]).add(i)
        # and one just past a span's end with the deck still well above the towpath is the span
        # reaching on over it, as a span does over a path crossing at its end
        for i in sorted(r["tow"]):
            ends = [n for n in (i - 1, i + 1) if n in r["span"] and n not in r["tow"]]
            if ends and max(r["z"][n] for n in ends) - r["tow"][i] > TOW_OVER:
                r["z"][i] = max(r["z"][n] for n in ends)
                r["span"].add(i)
                del r["tow"][i]
        for i, h in r["tow"].items():
            r["z"][i] = h
            r["span"].discard(i)
            r["deck"].discard(i)
        # a path beside a road over the canal takes the road's final height
        for i, k in r["beside"].items():
            o = pending[k]
            r["z"][i] = o["z"][min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], r["run"][i][:2]))]
    return pending


UNDER_CROWN = TN.UNDER_CROWN    # metres from a short path tunnel's floor to its arch, under a street at grade
UNDER_COVER = 0.4    # metres of street and fill over that arch
UNDER_RAMP = 0.25    # the steepest a path's approach falls to such an arch, walked as a slope (write_tile.STEEPEST_WALK)
UNDER_STAIR = 0.7    # and down a flight, only where the data maps the approach as steps (flights.STAIR_PITCH)


def finer_runs(pending):
    """A path with a short tunnel and nothing else marked along it, its heights settled, given a point
    every LOW_STEP instead of every STEP: a low arch's mouth can then sit at the kerb and the steps down
    to it fit between the kerb and the next way (low_bores), where at 4 m they missed by a point. Each
    edge stays evenly walked, as the writer reads its profile."""
    for r in pending:
        tunnels = r.get("tunnel_ranges") or []
        if r["c"] not in PATHS or r["c"] == "pedestrian" or not tunnels or r["span"] or r["deck"] or r["bored"] \
                or r.get("tow") or r.get("gone") or r.get("dipped") or r.get("beside"):
            continue
        run, z = r["run"], r["z"]
        total = sum(math.dist(a[:2], b[:2]) for a, b in zip(run, run[1:])) or 1.0
        if sum(b - a for a, b in tunnels) * total > SHORT_TUNNEL:
            continue
        new_run, new_z, parts = [], [], []
        for eid, rev, s, e in r["parts"]:
            line = LineString([q[:2] for q in run[s:e + 1]])
            cum = np.concatenate([[0.0], np.cumsum([math.dist(a[:2], b[:2]) for a, b in zip(run[s:e], run[s + 1:e + 1])])])
            n = max(1, int(math.ceil(line.length / LOW_STEP)))
            start = len(new_run) - 1 if new_run else 0
            for k in range(1 if new_run else 0, n + 1):
                d = line.length * k / n
                q = line.interpolate(d)
                new_run.append([q.x, q.y, float(np.interp(d, cum, [run[i][2] for i in range(s, e + 1)]))])
                new_z.append(float(np.interp(d, cum, z[s:e + 1])))
            parts.append((eid, rev, start, len(new_run) - 1))
        r["run"], r["z"], r["parts"] = new_run, new_z, parts


def low_bores(pending, road_lines, road_tree):
    """A path the data has in a tunnel under a street, too short or too shallow to bore through a hill
    (`tunnels.bores`), at the street's level: it passes under the street through a low arch, the
    street carried over it as it is. The arch is the data's tunnel, its mouths at the stretch's ends,
    its floor UNDER_CROWN and UNDER_COVER under the street. The path falls to the floor outside the
    mouths, from the nearest ways meeting it either side: as a slope no steeper than UNDER_RAMP, the
    ground cut to it, or, only where the data maps the way as steps, as a flight no steeper than
    UNDER_STAIR; never inside the arch. Where either side has no room for that there is no arch: the path stays at the street's level and the writer
    stops it at the kerb either side (write_tile.paths_under_streets). Each such bore is listed in its
    run's `low` (the game draws its arch UNDER_CROWN high), its approaches as dipped (the writer
    holds them there and lays the ground to them)."""
    points = collections.defaultdict(list)
    for k, r in enumerate(pending):
        for i, q in enumerate(r["run"]):
            points[(round(q[0] / 2), round(q[1] / 2))].append((k, i))

    def joined(k, i):
        x, y = pending[k]["run"][i][:2]
        return any(k2 != k and math.dist(pending[k2]["run"][i2][:2], (x, y)) < 1.5
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1) for k2, i2 in points.get((round(x / 2) + dx, round(y / 2) + dy), ()))
    def crosses(k, a, b):
        seg = LineString([pending[k]["run"][a][:2], pending[k]["run"][b][:2]])
        return any(int(j) != k and road_lines[int(j)].intersects(seg) for j in road_tree.query(seg))
    made = 0
    for k, r in enumerate(pending):
        if r["c"] not in PATHS or r["c"] == "pedestrian" or not r["tunnel_ranges"]:
            continue
        run, z, n = r["run"], r["z"], len(r["run"])
        bored = {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)}
        inside = in_ranges(run, r["tunnel_ranges"]) - bored - r["span"] - r["deck"]
        for st in stretches(inside):
            line = LineString([run[i][:2] for i in range(max(0, st[0] - 1), min(n - 1, st[-1] + 1) + 1)])
            if line.length < 1:
                continue
            over = None
            for j in road_tree.query(line):
                j = int(j)
                o = pending[j]
                if o["c"] in PATHS or not road_lines[j].crosses(line):
                    continue
                x = road_lines[j].intersection(line)
                x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point":
                    continue
                m_ = min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], (x.x, x.y)))
                i_ = min(st, key=lambda i: math.dist(run[i][:2], (x.x, x.y)))
                if m_ in o["span"] or abs(o["z"][m_] - z[i_]) > 1.5:
                    continue
                over = (j, m_, x)
                break
            if over is None:
                continue
            j, m_, x = over
            o = pending[j]
            floor = o["z"][m_] - UNDER_CROWN - UNDER_COVER
            # (the bore runs under the street's whole width, kerb to kerb and its pavements; where the
            # fall to it has no room past the pavements its class may have, its mouth stands at the kerb)
            # (the arch is the data's tunnel and no more: its mouths at the stretch's ends, and the fall
            # from the ground to its floor laid outside them, along the way either side)
            ramps = []
            for e, step in ((st[0], -1), (st[-1], 1)):
                # out to where the fall fits as a slope you can walk, or as a flight where the data maps
                # steps, before the next way meeting the path or its end; where neither fits there is no arch
                got = None
                for pitch in (UNDER_RAMP,) + ((UNDER_STAIR,) if r["c"] == "steps" else ()):
                    d, at, ok = 0.0, e, True
                    while z[at] - floor > d * pitch:
                        nxt = at + step
                        if not 0 <= nxt < n or joined(k, at) or nxt in r["span"] | r["deck"] or crosses(k, at, nxt):
                            ok = False
                            break
                        d += math.dist(run[at][:2], run[nxt][:2])
                        at = nxt
                    if ok:
                        got = (e, at, step, d)
                        break
                if not got:
                    break
                ramps.append(got)
            if len(ramps) < 2:
                continue
            i0, i1 = ramps[0][0], ramps[1][0]
            if i1 - i0 < 2:
                continue
            for i in range(i0, i1 + 1):
                z[i] = floor
            for e, end, step, d in ramps:
                top, along = z[end], 0.0
                for i in range(e + step, end, step):
                    along += math.dist(run[i][:2], run[i - step][:2])
                    z[i] = floor + (top - floor) * along / (d or 1)
                    r.setdefault("dipped", set()).add(i)
            r["bored"] = sorted(r["bored"] + [(i0, i1)])
            r.setdefault("low", []).append((i0, i1))
            made += 1
    return made


DEEP_HEAD = 4.0      # metres a road's bore needs from floor to crown, for a van or a fire engine
DEEP_HEAD_PATH = 2.3  # and a path's, for a walker with a hand raised
DEEP_COVER = 0.5     # metres of street and vault over the crown
DEEP_ALONG = 2.5     # metres either side of such a bore's line that another way running along it is in it
DEEP_MOUTH = 1.0     # metres the ground may stand over the way just outside its mouth


def deep_bores(pending, road_lines, road_tree, elev):
    """A stretch the data has in a building's passage, too shallow under the hill to bore
    (`tunnels.bores`), with a street or path crossing over it high enough to leave headroom under
    it (a lane under a terrace and its street): bored, portal to portal at the data's own ends, its
    crown as high as its kind needs or the way over it leaves (`crowns`). The ways over it then stay
    on the ground over its roof, as over any bore, rather than being carried over a cutting. Across
    Bath the ways crossing over the data's tunnels and passages stand either under 1.6 m over them
    (a passage at grade, or a path going under a street at its level: low_bores) or 2.9 m and more,
    so the headroom asked for falls in that gap for paths and above the lowest (a building passage
    3.1 m under a walkway) for roads."""
    made = 0
    for k, r in enumerate(pending):
        if not r["tunnel_ranges"] or len(r["run"]) < 2:
            continue
        run, z, n = r["run"], r["z"], len(r["run"])
        bored = {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)}
        need = (DEEP_HEAD_PATH if r["c"] in PATHS else DEEP_HEAD) + DEEP_COVER
        # (a towpath through the canal's own tunnel is the tunnel's ledge, which the game builds)
        for st in stretches(in_ranges(run, r["tunnel_ranges"]) - bored - r["span"] - set(r.get("gone", ())) - set(r["tow"])):
            # (a subway under a main road stays the underpass it is, the road bridging its cutting: its
            # approaches dip to it, and a bore there met them with a step)
            if len(st) < 2 or not any(r["osm"][i][2] for i in st):
                continue
            line = LineString([run[i][:2] for i in st])
            if line.length < 4:
                continue
            over, clash = [], False
            for j in road_tree.query(line.buffer(1.0)):
                j = int(j)
                if j == k:
                    continue
                o = pending[j]
                x = road_lines[j].intersection(line)
                for q in getattr(x, "geoms", [x]):
                    if q.is_empty or q.geom_type != "Point":
                        continue
                    t = line.project(q)
                    # (not at a portal, where a way meets the lane coming out)
                    if (t < 1.0 and st[0] > 0) or (t > line.length - 1.0 and st[-1] < n - 1):
                        continue
                    m = min(range(len(o["run"])), key=lambda m_: math.dist(o["run"][m_][:2], (q.x, q.y)))
                    if m in in_ranges(o["run"], o["tunnel_ranges"]):
                        continue
                    i = min(st, key=lambda i_: math.dist(run[i_][:2], (q.x, q.y)))
                    up = o["z"][m] - z[i]
                    if up >= need:
                        over.append(up)
                    elif up > 1.0:
                        clash = True
            i0, i1 = st[0], st[-1]
            # (and nothing else runs along it within its bore, between its floor and the street over it:
            # a flight laid along a subway's line, up to the road, would stand in the tube)
            for j in road_tree.query(line.buffer(DEEP_ALONG)):
                j = int(j)
                o = pending[j]
                if j == k or clash:
                    continue
                skip = in_ranges(o["run"], o["tunnel_ranges"])
                for m, q in enumerate(o["run"]):
                    t = line.project(Point(q[:2]))
                    if m in skip or not 1.0 < t < line.length - 1.0 or line.distance(Point(q[:2])) > DEEP_ALONG:
                        continue
                    i = min(st, key=lambda i_: math.dist(run[i_][:2], q[:2]))
                    if 0.5 < o["z"][m] - z[i] < need:
                        clash = True
                        break
            # (and it comes out at the ground's level at each end, where it isn't carried on by the next
            # way: one coming up out of a dip to its mouth is an underpass, its approaches dipped to it)
            for e, out in ((i0, i0 - 1), (i1, i1 + 1)):
                if 0 <= out < n and out not in r["span"] and elev(*run[out][:2]) - z[e] > DEEP_MOUTH:
                    clash = True
            if not over or clash:
                continue
            r["bored"] = sorted(r["bored"] + [(i0, i1)])
            r.setdefault("crowns", {})[(i0, i1)] = round(min(TN.crown(r["c"]), min(over) - DEEP_COVER), 1)
            made += 1
    return made


def _graded_roads(pending, chains):
    """The chains that are graded: streets, pedestrian streets among them, not paths."""
    return [ch for ch in chains if pending[ch[0][0]]["c"] not in PATHS or pending[ch[0][0]]["c"] == "pedestrian"]


def _tunnel_layer(pending, order):
    """Which points of the graded chains are inside a street's tunnel (True) or not (False): a road
    passing over a shallow tunnel meets the road in it at a point the data gives both, and the two
    are not a junction. A chain's ends are left out, as they meet whatever they meet, except on a
    shallow tunnel's stretch, mouths included: what the data joins there is carried over the
    cutting as a bridge (the underpass rule), so it doesn't meet the road going in."""
    key = lambda q: (round(q[0] * 2), round(q[1] * 2))
    ways_at = collections.defaultdict(set)
    for ch in order:
        for k, i in ch:
            ways_at[key(pending[k]["run"][i])].add(k)
    inside, cutting = {}, set()
    for k, r in enumerate(pending):
        if r["tunnel_ranges"] and r["c"] not in PATHS:
            tun = in_ranges(r["run"], r["tunnel_ranges"])
            shared = set() if r["bored"] else {i for i in tun if ways_at[key(r["run"][i])] - {k}}
            inside[k] = tunnel_inside(tun) | shared
            cutting |= {(key(r["run"][i]), k) for i in shared}
    under = collections.defaultdict(set)
    for q, k in cutting:
        under[q].add(k)
    layer = {}
    for ch in order:
        for m, (k, i) in enumerate(ch):
            q = key(pending[k]["run"][i])
            if 0 < m < len(ch) - 1 or under[q] - {k}:
                layer[(k, i)] = i in inside.get(k, ())
    return layer


def regrade(pending, order, xy, target, fixed, steep, detail, survey=None):
    """The network graded (tools/grading.py) and written back to the roads, each then eased of sharp
    changes of gradient between its junctions (a junction stays where the grading put it). From
    prep_map.py's `regrade`."""
    exact = [[STEEPEST.get(pending[k]["c"], 0.33) for k, _ in ch[:-1]] for ch in order]
    graded = grade(order, xy, target, fixed, steep, detail, [RW.get(pending[ch[0][0]]["c"], 4) / 2 for ch in order], exact,
                   layer=_tunnel_layer(pending, order), survey=survey)
    key = lambda q: (round(q[0] * 2), round(q[1] * 2))
    seen = collections.Counter(q for ch in order for q in {key(pending[k]["run"][i]) for k, i in ch})
    for ch in order:
        pts = [pending[k]["run"][i] for k, i in ch]
        z = [graded[(k, i)] for k, i in ch]
        d = [0.0]
        for a, b in zip(pts, pts[1:]):
            d.append(d[-1] + math.dist(a[:2], b[:2]))
        held = [(k, i) in fixed or seen[key(pts[m][:2])] > 1 or m in (0, len(ch) - 1) for m, (k, i) in enumerate(ch)]
        ease_kinks(z, d, held)
        for m, (k, i) in enumerate(ch):
            pending[k]["z"][i] = float(z[m])


def smooth_network(pending, chains, elev, detail):
    """Roads rise and fall like roads, not like the survey's pixels: each is evened out along its
    length by distance (about a dozen metres either way), then the whole network is graded at once:
    every junction at one height, no stretch steeper than its kind of road may be nor than the hill
    it climbs (measured over 40 m, with a little to spare), and bumps narrower than the survey can
    really see evened out. Bridges and tunnels keep the heights they were carried at. From
    prep_map.py's `smooth_network`."""
    order = _graded_roads(pending, chains)
    tun = {k: in_ranges(r["run"], r["tunnel_ranges"]) for k, r in enumerate(pending) if r["tunnel_ranges"]}
    xy, target, fixed, steep, survey = {}, {}, {}, [], {}
    for ch in order:
        pts = [pending[k]["run"][i] for k, i in ch]
        z = np.array([pending[k]["z"][i] for k, i in ch], dtype=float)
        n = len(ch)
        d = np.zeros(n)
        for m in range(1, n):
            d[m] = d[m - 1] + math.dist(pts[m - 1][:2], pts[m][:2])
        for m, (k, i) in enumerate(ch):
            xy[(k, i)] = pts[m][:2]
            survey[(k, i)] = float(z[m])
            if i in pending[k]["span"] or i in tun.get(k, ()):
                target[(k, i)] = fixed[(k, i)] = float(z[m])
                continue
            near = np.flatnonzero(np.abs(d - d[m]) < 3 * SIGMA)
            w = np.exp(-((d[near] - d[m]) ** 2) / (2 * SIGMA ** 2))
            target[(k, i)] = float((w * z[near]).sum() / w.sum())
        lim = []
        for m in range(n - 1):
            dd = d[m + 1] - d[m]
            if dd < 0.01:
                lim.append(1.0)
                continue
            (ax, ay), (bx, by) = pts[m][:2], pts[m + 1][:2]
            ux, uy = (bx - ax) / dd, (by - ay) / dd
            mx, my = (ax + bx) / 2, (ay + by) / 2
            hill = abs(elev(mx + ux * 20, my + uy * 20) - elev(mx - ux * 20, my - uy * 20)) / 40
            lim.append(min(STEEPEST.get(pending[ch[m][0]]["c"], 0.33), max(GRADE, hill + 0.03)))
        steep.append(lim)
    regrade(pending, order, xy, target, fixed, steep, detail, survey)


def limit_grades(pending, chains, dips, detail):
    """No road steeper than its kind may be (STEEPEST), after the dips under bridges and the climbs
    onto them: the network is graded again, the bottom of each dip (and every bridge's deck, and the
    towpath) staying where it is, so the ramps either side are lengthened and the roads meeting them
    follow. From prep_map.py's `limit_grades`."""
    held = collections.defaultdict(set)
    for j, x in dips:
        for i, q in enumerate(pending[j]["run"]):
            if math.dist(q[:2], (x.x, x.y)) < 6:
                held[j].add(i)
    order = _graded_roads(pending, chains)
    xy, target, fixed, steep = {}, {}, {}, []
    for ch in order:
        for k, i in ch:
            r = pending[k]
            xy[(k, i)] = r["run"][i][:2]
            target[(k, i)] = r["z"][i]
            if i in r["span"] or i in r["deck"] or i in r["tow"] or i in held[k]:
                fixed[(k, i)] = r["z"][i]
        steep.append([STEEPEST.get(pending[ch[m][0]]["c"], 0.33) for m in range(len(ch) - 1)])
    regrade(pending, order, xy, target, fixed, steep, detail)


def grow_marks(z, ground, span, deck, reach=3, forbid=()):
    """Run each span (and deck) out, by at most `reach` points, to where the road meets the ground
    as it is drawn, so the game's deck reaches the banks rather than stopping short with a step
    down (never onto a point in `forbid`). `ground` is the height of the drawn ground under
    each point, None off the grid."""
    n = len(z)

    def low(i):
        return i not in forbid and ground[i] is not None and z[i] - ground[i] > 0.3
    for marks, other in ((span, deck), (deck, span)):
        for st in stretches(set(marks)):
            a, b = st[0], st[-1]
            for _ in range(reach):
                if a > 0 and a - 1 not in other and low(a - 1):
                    a -= 1
                    marks.add(a)
            for _ in range(reach):
                if b < n - 1 and b + 1 not in other and low(b + 1):
                    b += 1
                    marks.add(b)
    return span, deck


def follow_ground(z, ground, span, deck, tol=0.4):
    """The heights with every point that is not a span or a deck held within `tol` of the ground
    drawn under it. The tile's ground was cut for the old build's roads and bridges, and a road
    that wanders from it is buried or floats; only a bridge's deck is meant to leave it."""
    return [v if i in span or i in deck or ground[i] is None else min(max(v, ground[i] - tol), ground[i] + tol)
            for i, v in enumerate(z)]


def ease_bends(xy, z, ground, fixed, ends=(), tol=0.4, limit=0.2, rounds=60):
    """The heights with sharp changes of slope eased out, where the ground allows it. A road held
    to the drawn ground copies every dip and step the survey left in it, and the game's road reads
    those as kinks; each loose point moves towards the straight line between its neighbours, never
    more than `tol` from the ground, until no bend is sharper than `limit` (the checker's is 0.25).
    Points in `fixed` (bridges, decks, and the two ends, which neighbouring squares share) stay
    put. Points in `ends` are the last ones of a bridge's deck: they may come down towards the
    ground, so the deck reaches the bank on a slope instead of a step, but never rise or sink."""
    n = len(z)
    z = list(z)
    if n < 3:
        return z
    d = [math.dist(xy[i], xy[i + 1]) or 0.01 for i in range(n - 1)]
    bounds = {}
    for i in range(1, n - 1):
        if ground[i] is None:
            continue
        if i in ends:
            bounds[i] = (ground[i] - 0.25, z[i])
        elif i not in fixed:
            bounds[i] = (ground[i] - tol, ground[i] + tol)

    def bend(i):
        return abs((z[i + 1] - z[i]) / d[i] - (z[i] - z[i - 1]) / d[i - 1])
    for _ in range(rounds):
        sharp = {j for i in range(1, n - 1) if bend(i) > limit for j in (i - 1, i, i + 1)}
        moved = False
        for i, (lo, hi) in bounds.items():
            if i not in sharp:
                continue
            line = z[i - 1] + (z[i + 1] - z[i - 1]) * d[i - 1] / (d[i - 1] + d[i])
            new = min(max(z[i] + (line - z[i]) * 0.5, lo), hi)
            moved = moved or abs(new - z[i]) > 1e-4
            z[i] = new
        if not moved:
            break
    return z


def deck_ends(marks, reach=4):
    """The `reach` points at each end of every stretch of marked points."""
    out = set()
    for st in stretches(marks):
        out.update(st[:reach] + st[-reach:])
    return out


def drop_empty_spans(roads, ground, water, rails, reach=2.5, sq=None):
    """Clear the span marks of a bridge with nothing under it, as the tile will draw it: no water,
    railway or road it does not join, and no drop of 2.5 m to the ground. A marked stretch whose
    street the ground was never cut for would otherwise be a deck over nothing; it lies on the
    ground instead. `roads` are `rd` records.

    A stretch reaching a side of the square `sq` is left as `solve` marked it: the bridge goes on
    into the next square, and what it crosses may be there. `solve` judged it whole, so both
    squares keep it, where judging each square's part on its own left the deck on one side of the
    seam and the road on the ground at the other."""
    lines = [LineString([q[:2] for q in r["p"]]) for r in roads]
    tree = STRtree(lines)
    water_tree, rail_tree = STRtree(water), STRtree(rails)

    def joined(i, j):
        return any(lines[b].distance(Point(roads[a]["p"][e][:2])) < reach
                   for a, b in ((i, j), (j, i)) for e in (0, -1))

    def on_side(q, tol=0.05):
        return min(abs(q[0] - sq[0]), abs(q[0] - sq[2]), abs(q[1] - sq[1]), abs(q[1] - sq[3])) < tol
    dropped = 0
    for n, r in enumerate(roads):
        p = r["p"]
        k = 0
        while k < len(p):
            if len(p[k]) < 4 or p[k][3] != 1:
                k += 1
                continue
            e = k
            while e + 1 < len(p) and len(p[e + 1]) > 3 and p[e + 1][3] == 1:
                e += 1
            if sq is not None and any(on_side(p[i]) for i in range(k, e + 1)):
                k = e + 1
                continue
            seg = LineString([q[:2] for q in p[max(0, k - 1):min(len(p) - 1, e + 1) + 1]])
            under = any(water[int(w)].intersects(seg) for w in water_tree.query(seg)) \
                or any(rails[int(t)].intersects(seg) for t in rail_tree.query(seg)) \
                or any(int(j) != n and lines[int(j)].crosses(seg) and not joined(n, int(j)) for j in tree.query(seg)) \
                or any(ground(q[0], q[1]) is not None and q[2] - ground(q[0], q[1]) > 2.5 for q in p[k:e + 1])
            if not under:
                for i in range(k, e + 1):
                    g = ground(p[i][0], p[i][1])
                    p[i] = [p[i][0], p[i][1], p[i][2] if g is None else round(min(max(p[i][2], g - 0.4), g + 0.4), 1)]
                dropped += 1
            k = e + 1
    return dropped


# ---- each structure's ends, decided once for the whole map ---------------------------------------

JOINT = 1.0       # metres: a deck's end this close to another's deck, and this near its height, runs on into it


def end_id(kind, x, y):
    """A stable name for an end, from what it is and where (to half a metre), as `edge_id` is."""
    import hashlib
    return hashlib.sha1(f"{kind} {round(x * 2)} {round(y * 2)}".encode()).hexdigest()[:10]


def structure_ends(pending):
    """Every bridge's and tunnel's ends, from the whole of each structure (a span crossing a square's
    edge has one pair): [(run index, point index, kind, x, y, z, half width, id)].

    A bridge's ends are the points just off its span at each end, as the game builds them
    (map.ts bridgeSpans). An `abutment` stands on the bank there; a `joint` is where it runs on into
    another deck in the air, and stands on nothing; an `open` end is one whose span runs to the end
    of its way with nothing going on there. A bored tunnel's are its two `portal`s."""
    decks = collections.defaultdict(list)
    for k, r in enumerate(pending):
        for i in r["span"] | r["deck"]:
            decks[(round(r["run"][i][0]), round(r["run"][i][1]))].append((k, i))

    def on_deck(k, i):
        r_xy = pending[k]["run"][i][:2]
        x, y = r_xy
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for k2, i2 in decks.get((round(x) + dx, round(y) + dy), ()):
                    if k2 != k and math.dist(pending[k2]["run"][i2][:2], r_xy) < JOINT \
                            and abs(pending[k2]["z"][i2] - pending[k]["z"][i]) < JOINT:
                        return True
        return False

    points = collections.defaultdict(list)
    for k, r in enumerate(pending):
        for i, q in enumerate(r["run"]):
            points[(round(q[0]), round(q[1]))].append((k, i))

    def met(k, i):
        """Whether another way comes to the point at its height, which the deck's end then lands on
        (one well under it passes beneath)."""
        x, y = pending[k]["run"][i][:2]
        return any(k2 != k and math.dist(pending[k2]["run"][i2][:2], (x, y)) < 1.5 and abs(pending[k2]["z"][i2] - pending[k]["z"][i]) < JOINT
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1) for k2, i2 in points.get((round(x) + dx, round(y) + dy), ()))

    out = []
    for k, r in enumerate(pending):
        run, z, n = r["run"], r["z"], len(r["run"])
        half = RW.get(r["c"], 4) / 2
        for st in stretches(r["span"]):
            for i, inner in ((st[0] - 1, st[0]), (st[-1] + 1, st[-1])):
                if 0 <= i < n:
                    kind = "joint" if on_deck(k, i) else "abutment"
                else:
                    i = inner
                    kind = "joint" if on_deck(k, i) else "abutment" if met(k, i) else "open"
                x, y = run[i][:2]
                out.append((k, i, kind, x, y, z[i], half, end_id(kind, x, y)))
        for i0, i1 in r.get("bored") or ():
            for i in (i0, i1):
                if 0 <= i < n:
                    x, y = run[i][:2]
                    out.append((k, i, "portal", x, y, z[i], half, end_id("portal", x, y)))
    return out


def ends_by_edge(pending, ends):
    """{edge id: [[kind, x, y, z, half width, id], ...]}: each end filed under the edge it lies on."""
    out = collections.defaultdict(list)
    for k, i, kind, x, y, z, half, eid in ends:
        for edge, _rev, s, e in pending[k]["parts"]:
            if s <= i <= e:
                out[edge].append([kind, round(x, 2), round(y, 2), round(z, 2), round(half, 2), eid])
                break
    return out
