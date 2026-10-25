"""Bridges, tunnels and road profiles for a street graph, worked out for the whole map at once.

The partition's roads used to lie on the raw ground, so a bridge was a hole in the road and a
dip under a bridge was missing. `prep_map.py` has the rules that make a road rise and fall like a
road, carry a bridge straight between its ends and dip what passes under it; they are run here over
the partition's street edges instead of Overture's segments. `prep_map.py` is a script and cannot be
imported, so `solve` is its bridge section ported rule for rule (in its order, with the same
numbers), and the carrying, grade and kink rules are `profiles.py`, which both share. When
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
from shapely.ops import substring
from shapely.strtree import STRtree

import tunnels as TN
from profiles import carry_profile, ease_grades, ease_kinks

STEP = 4.0

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
LOCK_REACH, BESIDE = 15.0, 8.0
TOW_UP = 0.4      # the canal's banks stand this far above the water
TOW_REACH = 6.0   # metres out from the water's edge that the towpath may run
RANK = {"motorway": 0, "trunk": 0, "primary": 1, "secondary": 2, "tertiary": 3, "residential": 4, "living_street": 4,
        "unclassified": 5, "pedestrian": 5, "service": 6, "unknown": 6}
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

    The street graph comes from OSM, which has no bridge or tunnel tags, so each stretch Overture
    marks is laid onto the edges it runs along: the points of an edge within `reach` of the stretch
    and heading the same way. A footway that happens to run beside a street does not mark the
    street, so a path only marks paths."""
    tree = STRtree([e["line"] for e in edges])
    found = {}
    for g, p in segments:
        flags = overture_flags(p)
        if not flags:
            continue
        is_path = (p.get("class") or "unknown") in PATHS
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
    run, parts, bridge, tunnel, base = [], [], [], [], 0.0
    total = sum(e["line"].length for e, _ in chain) or 1.0
    for e, rev in chain:
        line = e["line"]
        pts = densify(LineString(list(line.coords)[::-1]) if rev else line)
        start = len(run) - 1 if run else 0
        for x, y, t in pts[1:] if run else pts:
            run.append([x, y, (base + t * line.length) / total])
        parts.append((e["id"], rev, start, len(run) - 1))
        L = line.length
        for kind, into in (("bridge", bridge), ("tunnel", tunnel)):
            for a, b in (e.get("struct") or {}).get(kind, []):
                a, b = (L - b, L - a) if rev else (a, b)
                into.append(((base + a) / total, (base + b) / total))
        base += L
    c = chain[0][0]["cls"]
    z = level_structures(run, [elev(x, y) for x, y, _ in run], bridge, tunnel)
    bored = TN.bores(run, z, tunnel, elev)
    return dict(parts=parts, c=c, run=run, z=z, span=in_ranges(run, bridge), bored=bored,
                tunnel_ranges=tunnel)


def split_back(r):
    """{edge id: dict(z, span, deck, bored, dip, tow, gone)} from a solved through-road, each in its
    edge's own direction: `tow` the points on the canal's towpath, `gone` those in a canal tunnel."""
    out = {}
    for eid, rev, s, e in r["parts"]:
        idx = list(range(s, e + 1))
        if rev:
            idx.reverse()
        pos = {i: n for n, i in enumerate(idx)}
        last = len(idx) - 1
        bored = []
        for i0, i1 in r["bored"]:
            lo, hi = max(i0, s), min(i1, e)
            if lo > hi:
                continue
            pa = pos[lo] + ((1 if rev else -1) if i0 < s else 0)
            pb = pos[hi] + ((-1 if rev else 1) if i1 > e else 0)
            a, b = sorted((pa, pb))
            bored.append([a, b])
        out[eid] = dict(z=[round(r["z"][i], 2) for i in idx],
                        span=sorted(pos[i] for i in r["span"] if i in pos),
                        deck=sorted(pos[i] for i in r["deck"] if i in pos), bored=bored,
                        dip=sorted(pos[i] for i in r.get("dipped", ()) if i in pos),
                        tow=sorted(pos[i] for i in r["tow"] if i in pos) if r.get("tow") else [],
                        gone=sorted(pos[i] for i in r.get("gone", ()) if i in pos))
    return out


TOW_OVER = 2.0      # metres a deck stands over the towpath at its end for the span to reach on over it


def towpath_points(run, z, c, canal_open, canal_tree, locks, bridged):
    """{i: height} of the points of a path's run that lie on the canal's towpath: level with the
    coping, whatever the survey made of the ground, so the path neither rises to the bridges over it
    nor dips under them. A path crossing the bank on its way to the towpath is level with it there.
    The run keeps its place (the street graph has fitted it); prep_map.py's `towpath` also moves the
    points onto the towpath's middle."""
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


def solve(pending, water_polys, rail_tracks, canal, elev, bm):
    """Decide the structures over a set of runs, changing their heights, `span` and `deck` in place.

    The rules are `prep_map.py`'s, in its order, with `tools/profiles.py` (shared with it) doing the
    carrying, grade and kink work: the network smoothed as a whole, underpasses, paths riding a road's
    deck, which marked spans are real bridges, the canal's bridges, every span carried straight, ways
    that cross at different heights, what dips under a bridge, the steepest each road may be, and
    paths afloat. Each run here is already a whole through-road, so `prep_map.py`'s `chains()` is each
    run in turn. `canal` is the canal file's contents (or None), `bm` the map's box."""
    water_tree = STRtree(water_polys)
    rail_lines = [LineString([q[:2] for q in t["p"]]) for t in rail_tracks if len(t["p"]) > 1]
    rail_tracks = [t for t in rail_tracks if len(t["p"]) > 1]
    rail_tree = STRtree(rail_lines)
    road_lines = [LineString([q[:2] for q in r["run"]]) for r in pending]
    road_tree = STRtree(road_lines)
    chains = [[(k, i) for i in range(len(r["run"]))] for k, r in enumerate(pending) if len(r["run"]) >= 2]
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
        for r in pending:
            if r["c"] in PATHS:
                r["tow"] = {i: h for i, h in towpath_points(r["run"], r["z"], r["c"], canal_open, canal_tree, locks, r["span"]).items()
                            if i not in r.get("gone", ())}
                r["span"] -= set(r["tow"])
                for i, h in r["tow"].items():
                    r["z"][i] = h

    smooth_network(pending, chains, elev)

    # an underpass: a tunnel stretch too shallow to bore, which stays a road in a cutting. Whatever
    # crosses over it is carried over as a bridge, with the cutting as wide as the road in it
    underpasses = []
    for k, r in enumerate(pending):
        if not r["tunnel_ranges"]:
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
                over = {i for i, q in enumerate(r["run"]) if poly.contains(Point(q[:2]))}
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

    # 1. paths along a road's marked span ride on its deck
    decks = []
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
            for j in deck_tree.query(pl):
                k, poly, line, zs, _, _ = decks[int(j)]
                if pl.length > 6 and pl.intersection(poly).length < 0.6 * min(pl.length, line.length) and road_lines[k].crosses(pl):
                    continue
                for i, q in enumerate(r["run"]):
                    if i in r["tow"] or not poly.contains(Point(q[:2])):
                        continue
                    t = line.project(Point(q[:2])) / (line.length or 1) * (len(zs) - 1)
                    lo = min(len(zs) - 2, int(t))
                    f = t - lo
                    # only where the data has the path on a bridge itself, or it is at the deck's
                    # height already: a path going down past the bridge's end doesn't ride it
                    if i not in r["span"] and abs(r["z"][i] - (zs[lo] + (zs[lo + 1] - zs[lo]) * f)) > 1.0:
                        continue
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

    def ease_roads(x, y, head, skip, down=True, reach=None, own=None):
        """Bring every road's points within DIP of (x, y) down to head (or up, with down False),
        easing in and out, so roads meeting there stay joined; skip: road indexes left alone (the
        bridge itself), and any road's points on a span or a deck are left alone too (except road
        own's, the one being carried over the canal), as is the towpath; a road that is a bridge
        somewhere else is still brought down beside it, and its deck carried to its new approaches
        afterwards (carry_spans)."""
        n = 0
        for j in road_tree.query(Point(x, y).buffer(reach or DIP)):
            j = int(j)
            if j in skip:
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
    # these after the dips; here they come before, so what passes under is dipped for headroom too)
    for k, r in enumerate(pending):
        if r["c"] in ("steps", "pedestrian"):
            continue
        before = set(r["span"])
        for j in road_tree.query(road_lines[k].buffer(4.0)):
            o = pending[int(j)]
            if int(j) == k or o["c"] in PATHS:
                continue
            half, line = RW.get(o["c"], 4) / 2, road_lines[int(j)]
            for i, q in enumerate(r["run"]):
                if i in r["span"] or i in r["deck"] or i in r["tow"] or line.distance(Point(q[:2])) > half:
                    continue
                m_ = min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], q[:2]))
                if r["z"][i] - o["z"][m_] >= (2.5 if r["c"] in PATHS else 3.0) and m_ not in o["span"]:
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
                dipped += ease_roads(x.x, x.y, head, own_road(k, line))
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
                    dipped += ease_roads(x.x, x.y, head, set())
                    dips.append((j, x))
            k = e + 1
    if dipped:
        carry_spans(True)

    limit_grades(pending, chains, dips)

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


def smooth_network(pending, chains, elev):
    """Roads rise and fall like roads, not like the survey's pixels: the main roads first, each
    along its length by distance (about a dozen metres either way); where a lesser road meets one
    already smoothed it takes that road's height there and eases into it; and no road is left
    steeper than the hill it climbs, measured over 40 m, with a little to spare. Bridges and tunnels
    keep the heights they were carried at. From prep_map.py's `smooth_network`."""
    done = {}
    key = lambda q: (round(q[0] * 2), round(q[1] * 2))
    order = []
    for ch in chains:
        c = pending[ch[0][0]]["c"]
        if c in PATHS and c != "pedestrian":
            continue
        L = sum(math.dist(pending[k1]["run"][i1][:2], pending[k2]["run"][i2][:2]) for (k1, i1), (k2, i2) in zip(ch, ch[1:]))
        order.append((RANK.get(c, 6), -L, ch))
    order.sort(key=lambda o: (o[0], o[1]))
    tun = {k: in_ranges(r["run"], r["tunnel_ranges"]) for k, r in enumerate(pending) if r["tunnel_ranges"]}
    for _, _, ch in order:
        pts = [pending[k]["run"][i] for k, i in ch]
        z = np.array([pending[k]["z"][i] for k, i in ch], dtype=float)
        n = len(ch)
        fixed = np.array([i in pending[k]["span"] or i in tun.get(k, ()) for k, i in ch])
        for m, q in enumerate(pts):
            h = done.get(key(q))
            # a road laid already, meeting this one there: unless it's well above or below (a
            # bridge's deck and a road passing under it at a point the data happens to give both)
            if h is not None and abs(h - z[m]) < 2.5:
                z[m] = h
                fixed[m] = True
        d = np.zeros(n)
        for m in range(1, n):
            d[m] = d[m - 1] + math.dist(pts[m - 1][:2], pts[m][:2])
        out = z.copy()
        for m in range(n):
            if fixed[m]:
                continue
            near = np.flatnonzero(np.abs(d - d[m]) < 3 * SIGMA)
            w = np.exp(-((d[near] - d[m]) ** 2) / (2 * SIGMA ** 2))
            out[m] = float((w * z[near]).sum() / w.sum())
        z = out
        lim = np.zeros(max(0, n - 1))
        for m in range(n - 1):
            dd = d[m + 1] - d[m]
            if dd < 0.01:
                lim[m] = 0.0
                continue
            (ax, ay), (bx, by) = pts[m][:2], pts[m + 1][:2]
            ux, uy = (bx - ax) / dd, (by - ay) / dd
            mx, my = (ax + bx) / 2, (ay + by) / 2
            hill = abs(elev(mx + ux * 20, my + uy * 20) - elev(mx - ux * 20, my - uy * 20)) / 40
            lim[m] = min(STEEPEST.get(pending[ch[m][0]]["c"], 0.33), max(GRADE, hill + 0.03)) * dd
        ease_grades(z, d, lim, fixed)
        ease_kinks(z, d, fixed)
        for m, (k, i) in enumerate(ch):
            pending[k]["z"][i] = float(z[m])
            done[key(pts[m])] = float(z[m])


def limit_grades(pending, chains, dips):
    """No road steeper than its kind may be (STEEPEST), after the dips under bridges and the climbs
    onto them: where one is, the ramp is lengthened, the bottom of each dip (and every bridge's deck,
    and the towpath) staying where it is. From prep_map.py's `limit_grades`."""
    held = collections.defaultdict(set)
    for j, x in dips:
        for i, q in enumerate(pending[j]["run"]):
            if math.dist(q[:2], (x.x, x.y)) < 6:
                held[j].add(i)
    done, key = {}, lambda q: (round(q[0] * 2), round(q[1] * 2))
    order = sorted((ch for ch in chains if pending[ch[0][0]]["c"] not in PATHS or pending[ch[0][0]]["c"] == "pedestrian"),
                   key=lambda ch: (RANK.get(pending[ch[0][0]]["c"], 6), -len(ch)))
    for ch in order:
        pts = [pending[k]["run"][i] for k, i in ch]
        z = [pending[k]["z"][i] for k, i in ch]
        meets = [key(q) in done and abs(done[key(q)] - h) < 2.5 for q, h in zip(pts, z)]
        z = [done[key(q)] if m_ else h for q, h, m_ in zip(pts, z, meets)]
        d = [0.0]
        for a, b in zip(pts, pts[1:]):
            d.append(d[-1] + math.dist(a[:2], b[:2]))
        fixed = [m_ or i in pending[k]["span"] or i in pending[k]["deck"] or i in pending[k]["tow"] or i in held[k]
                 for m_, (k, i) in zip(meets, ch)]
        lim = [STEEPEST.get(pending[ch[m][0]]["c"], 0.33) * (d[m + 1] - d[m]) for m in range(len(ch) - 1)]
        ease_grades(z, d, lim, fixed)
        ease_kinks(z, d, fixed)
        for q, (k, i), h in zip(pts, ch, z):
            pending[k]["z"][i] = h
            done.setdefault(key(q), h)


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


def drop_empty_spans(roads, ground, water, rails, reach=2.5):
    """Clear the span marks of a bridge with nothing under it, as the tile will draw it: no water,
    railway or road it does not join, and no drop of 2.5 m to the ground. A marked stretch that
    lost its crossing to the square's edge, or whose street the ground was never cut for, would
    otherwise be a deck over nothing; it lies on the ground instead. `roads` are `rd` records."""
    lines = [LineString([q[:2] for q in r["p"]]) for r in roads]
    tree = STRtree(lines)
    water_tree, rail_tree = STRtree(water), STRtree(rails)

    def joined(i, j):
        return any(lines[b].distance(Point(roads[a]["p"][e][:2])) < reach
                   for a, b in ((i, j), (j, i)) for e in (0, -1))
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
