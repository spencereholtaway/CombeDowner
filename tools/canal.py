"""Lay out a map's canal for the game: its water at the right level all the way along, its locks
and its tunnels, and the boats moored along it.

Usage: python3 -I tools/canal.py <map> <dir with the wide .geojson layers> <out.json>

e.g. python3 -I tools/canal.py combe-down data/raw/combe-down/wide web/public/maps/combe-down-canal.json

Reads the canal lines and their water from Overture's water layer (water.geojson) and the roads
(segment.geojson, for where bridges cross), with ground heights from the same terrain tiles as the
map (tools/terrain.py, cached in <dir>/terrain15/). The map's own water draws every stretch of a
canal at the lowest level round its edge, which puts a flight of locks under one flat sheet of
water and an aqueduct down in the valley it crosses; the game draws the canal from this file
instead (web/src/canal.ts) and leaves the map's canal water out.

Overture doesn't say where the locks and tunnels are, so they come from the map's pack below: each
lock by where its lower and upper gates are, from the river up, and how far it lifts a boat; each
tunnel by its two portals; and one point on the canal with its water level. Every other stretch's
level follows from that one through the locks. Stretches the locks don't join to it are left out.

Writes {"runs", "locks", "tunnels", "moor"}, positions in metres east (x) and north (y) of the map
centre and heights in metres above sea level:
- runs: the stretches of water between locks, junctions and ends, each {"lv": its water level,
  "p": [[x, y, half its width, ground in the middle, ground beyond the left bank, beyond the right
  bank, flags, left bank's width, right bank's, left verge's, right verge's], ...]}, points about
  4 m apart. Flags: 1 in a tunnel, 2 on an aqueduct, 4 a pier under the aqueduct here. A run's
  ends are where it meets a lock's gates, another run, or nothing. Each bank is level, just above
  the water, from the water's edge out to its width (the towpath's side wider; in a tunnel, the
  towpath's ledge through it, or nothing), then its verge reaches the ground (web/src/works.ts).
- locks: {"n": name, "no": its number, "lo": [x, y] the lower gates, "hi": [x, y] the upper,
  "zl", "zh": the water below and above, "tl": how far its wing walls run on below the lower gates,
  with the towpath coming down beside them from the top of the lock to the bank of the pound below
  (the water between them is the lock's own width)}.
- tunnels: {"n": name, "a": [x, y], "b": [x, y], "tw": the towpath's side through it, 1 left
  (looking from the run's start), -1 right, 0 none} portal to portal.
- moor: boats moored along the bank, [x, y, angle (radians, east is 0, north a quarter turn), length, paint].
"""
import json, math, os, random, sys
import numpy as np
import shapely
from shapely.geometry import shape, Point, LineString
from shapely.ops import linemerge, substring, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from terrain import Terrain

PACKS = {
    "combe-down": dict(
        # The Kennet and Avon. From Bath Top Lock it runs on one level, the long pound, through
        # Sydney Gardens, Bathampton and over the Dundas Aqueduct to Bradford-on-Avon.
        level=((2790, 742), 35.2),
        # The Widcombe flight, from the River Avon up: Bath Deep Lock was two locks until 1976.
        locks=[
            ("Bath Bottom Lock", "7", (-670.9, 1637.9), (-645.6, 1634.0), 2.7),
            ("Bath Deep Lock", "8/9", (-513.7, 1611.9), (-488.8, 1607.8), 5.9),
            ("Wash House Lock", "10", (-437.6, 1628.2), (-421.4, 1648.3), 2.7),
            ("Abbey View Lock", "11", (-289.3, 1818.3), (-272.1, 1837.3), 2.7),
            ("Pulteney Lock", "12", (-260.2, 1910.5), (-262.4, 1935.6), 2.7),
            ("Bath Top Lock", "13", (-266.2, 1985.9), (-268.5, 2011.4), 2.7),
        ],
        # Sydney Gardens: under Cleveland House on Sydney Road, and under Beckford Road at the north end
        tunnels=[
            ("Cleveland House Tunnel", (-184.1, 2551.1), (-194.6, 2604.3)),
            ("Sydney Gardens Tunnel", (-195.8, 2760.7), (-189.2, 2811.1)),
        ],
    ),
    "bradford-on-avon": dict(
        # The Kennet and Avon carries on through Bradford-on-Avon on the same long pound as Bath
        # (35.2 m: see the combe-down pack), with Bradford Lock lowering it a boat's depth towards
        # Trowbridge: the long pound runs west through the town to Bath, and Bradford Lock lifts it
        # east towards Devizes. Positions are metres east and north of this map's own centre (the
        # station), read off the built water layer.
        level=((-1268.5, -457.0), 35.2),
        locks=[
            # Bradford Lock: the lower gates to the west (the long pound), the upper to the east
            ("Bradford Lock", "14", (14.0, -388.6), (39.2, -430.9), 3.7),
        ],
        tunnels=[],
    ),
}
STEP = 4.0                 # metres between points along the water
TUNNEL_HALF = 2.6          # half a tunnel's width of water
AQUEDUCT = 3.0             # metres the ground drops below the water for the canal to be on an aqueduct
SPAN = 16.0                # metres an aqueduct's arches span, at least
TAIL = 2.2                 # how far a lock's walls run past each pair of gates (canal.ts)
WING = 6.0                 # below a lock, its wing walls and the towpath beside them come down a metre in this many
WIDEN = 0.25               # how fast the water may narrow or widen along the canal, metres each side a metre
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
TOW_REACH = 14.0           # a path this close to the water's edge, running along it, is the towpath
SIDE_RUN = 8               # points (of 4 m) each side looked at to say which side the towpath is on
TOW_WIDE = 3.0             # the towpath's bank, from the water's edge (its coping) to its far side
BANK_WIDE = 1.4            # the bank on the other side
COPE_W = 0.45              # the stone coping along the water's edge: all the bank there is where it's squeezed
VERGE = 2.0                # from the bank's edge to the ground: a grass slope, or a wall and a slope
TUNNEL_LEDGE = 1.3         # the towpath's ledge through a tunnel
ROAD_HALF = {"motorway": 7, "trunk": 6, "primary": 4.3, "secondary": 4, "tertiary": 3.5, "residential": 3, "unclassified": 2.8,
             "living_street": 2.5, "service": 1.8, "unknown": 2}
PAINTS = 7                 # boat liveries the game knows (canal.ts)
r1 = lambda v: round(float(v), 1)
wing = lambda lk: TAIL + (lk["zh"] - lk["zl"]) * WING     # how far a lock's wing walls run below its bottom gates


def main():
    map_id, src, out = sys.argv[1:4]
    A = area(map_id, wide=True)
    pack = PACKS.get(map_id)
    if not pack: raise SystemExit(f"no canal pack for {map_id}")
    T = Terrain(A.centre, os.path.join(src, "terrain15"))
    proj = lambda g: shapely.transform(g, lambda a: np.column_stack(T.proj(a[:, 0], a[:, 1])))
    circle = Point(*A.field_centre).buffer(A.half + 200, 128)

    # ---- the canal's lines, joined up into stretches between junctions and ends --------------
    feats = json.load(open(os.path.join(src, "water.geojson")))["features"]
    lines, water, rivers = [], [], []
    for f in feats:
        p = f["properties"]
        if p.get("class") == "river":
            g = proj(shape(f["geometry"]))
            if g.intersects(circle): rivers.append(g if g.is_valid else shapely.make_valid(g))
        if p.get("class") != "canal": continue
        g = proj(shape(f["geometry"]))
        if not g.intersects(circle): continue
        if g.geom_type.endswith("LineString"): lines += list(getattr(g, "geoms", [g]))
        elif g.geom_type.endswith("Polygon"): water.append(g if g.is_valid else shapely.make_valid(g))
    # a line that stops just short of another (a branch meeting the main line) is joined to it
    joined = []
    for i, l in enumerate(lines):
        rest = unary_union(lines[:i] + lines[i + 1:])
        pts = list(l.coords)
        for e in (0, -1):
            E = Point(pts[e])
            if 0.01 < rest.distance(E) < 3.0:
                q = rest.interpolate(rest.project(E)) if rest.geom_type == "LineString" else \
                    min((g.interpolate(g.project(E)) for g in rest.geoms), key=E.distance)
                pts[e] = (q.x, q.y)
        joined.append(LineString(pts))
    merged = linemerge(shapely.set_precision(unary_union(joined), 0.01).intersection(circle))
    chains = [c for c in getattr(merged, "geoms", [merged]) if c.length > 1]
    print(f"canal: {len(lines)} lines, {len(chains)} stretches, {len(water)} pieces of water")

    # ---- locks: cut out of the stretch they're on -------------------------------------------
    locks = []
    for name, no, lo, hi, rise in pack["locks"]:
        P, Q = Point(lo), Point(hi)
        k = min(range(len(chains)), key=lambda i: chains[i].distance(P) + chains[i].distance(Q))
        c = chains[k]
        if c.distance(P) > 8 or c.distance(Q) > 8: raise SystemExit(f"{name}: not on the canal")
        s0, s1 = c.project(P), c.project(Q)
        a, b = sorted((s0, s1))
        before, after = substring(c, 0, a), substring(c, b, c.length)
        del chains[k]
        chains += [p for p in (before, after) if p.length > 0.5]
        L, H = c.interpolate(s0), c.interpolate(s1)
        locks.append(dict(n=name, no=no, lo=[L.x, L.y], hi=[H.x, H.y], rise=rise))

    # ---- levels: from the pack's one point, through the locks ------------------------------
    key = lambda x, y: (round(x * 2), round(y * 2))
    ends = {}
    for i, c in enumerate(chains):
        for x, y in (c.coords[0], c.coords[-1]): ends.setdefault(key(x, y), []).append(i)
    (sx, sy), level0 = pack["level"]
    seed = min(range(len(chains)), key=lambda i: chains[i].distance(Point(sx, sy)))
    level = {seed: level0}
    todo = [seed]
    while todo:
        i = todo.pop()
        c = chains[i]
        for x, y in (c.coords[0], c.coords[-1]):
            for j in ends.get(key(x, y), []):
                if j not in level: level[j] = level[i]; todo.append(j)
            for lk in locks:
                for here, there, dz in (("lo", "hi", 1), ("hi", "lo", -1)):
                    if key(*lk[here]) != key(x, y): continue
                    for j in ends.get(key(*lk[there]), []):
                        if j not in level: level[j] = level[i] + dz * lk["rise"]; todo.append(j)
    for lk in locks:
        lo_run = [j for j in ends.get(key(*lk["lo"]), []) if j in level]
        hi_run = [j for j in ends.get(key(*lk["hi"]), []) if j in level]
        if not lo_run or not hi_run: raise SystemExit(f"{lk['n']}: not joined up")
        lk["zl"], lk["zh"] = level[lo_run[0]], level[hi_run[0]]
    keep = sorted(level)
    print(f"levels: {len(keep)} of {len(chains)} stretches joined to the long pound; dropped {sum(chains[i].length for i in range(len(chains)) if i not in level):.0f} m")

    # ---- tunnels ------------------------------------------------------------------------------
    tunnels = []
    for name, a, b in pack["tunnels"]:
        k = min(keep, key=lambda i: chains[i].distance(Point(a)) + chains[i].distance(Point(b)))
        c = chains[k]
        s0, s1 = sorted((c.project(Point(a)), c.project(Point(b))))
        tunnels.append(dict(n=name, run=k, s0=s0, s1=s1, a=list(c.interpolate(c.project(Point(a))).coords[0]),
                            b=list(c.interpolate(c.project(Point(b))).coords[0])))

    # ---- each stretch's points: width from the mapped water, ground either side ----------------
    wet = unary_union(water) if water else None
    bounds = wet.boundary if wet is not None else None

    def across(x, y, nx, ny):
        """How far the water reaches each side of (x, y) along (nx, ny) (left) and back (right)."""
        out = []
        for s in (1, -1):
            ray = LineString([(x, y), (x + nx * s * 14, y + ny * s * 14)])
            hit = ray.intersection(bounds) if bounds is not None else None
            if hit is None or hit.is_empty: out.append(None); continue
            pts = [g for g in getattr(hit, "geoms", [hit]) if g.geom_type == "Point"]
            out.append(min(Point(x, y).distance(q) for q in pts) if pts else None)
        return out

    runs, index = [], {}
    for k in keep:
        c = chains[k]
        n = max(1, int(math.ceil(c.length / STEP)))
        at = []
        for s in range(n + 1):
            d = c.length * s / n
            q = c.interpolate(d)
            a, b = c.interpolate(max(0, d - 1)), c.interpolate(min(c.length, d + 1))
            tx, ty = b.x - a.x, b.y - a.y
            tl = math.hypot(tx, ty) or 1
            nx, ny = -ty / tl, tx / tl                     # to the left
            inside = any(t["run"] == k and t["s0"] - 0.5 <= d <= t["s1"] + 0.5 for t in tunnels)
            if inside: half = TUNNEL_HALF
            else:
                l, r = across(q.x, q.y, nx, ny) if wet is not None and wet.contains(q) else (None, None)
                half = (l + r) / 2 if l and r else (l or r or 4.5)
                half = max(2.6, min(9.0, half))
            at.append((q, nx, ny, half, inside))
        # the width as the water's mapped outline gives it wanders a few metres from one point to
        # the next, so the banks would too: it's evened out along the stretch, and narrows or
        # widens no faster than WIDEN a metre (so it still closes in to a lock's width at its gates)
        raw = [h for _, _, _, h, _ in at]
        near = lambda i: [raw[j] for j in range(max(0, i - 3), min(len(raw), i + 4)) if not at[j][4]]
        hs = [h if at[i][4] else sum(near(i)) / len(near(i)) for i, h in enumerate(raw)]
        gates = {key(*lk[e]) for lk in locks for e in ("lo", "hi")}
        for i in (0, len(at) - 1):
            if key(at[i][0].x, at[i][0].y) in gates: hs[i] = 2.6       # a lock's gates: its own width
        # and below a lock, between its wing walls
        for lk in locks:
            for i, e in ((0, 1), (len(at) - 1, -1)):
                if key(at[i][0].x, at[i][0].y) != key(*lk["lo"]): continue
                for j in range(len(at)):
                    if abs(j - i) * c.length / n <= wing(lk): hs[j] = min(hs[j], 2.6)
        for i in range(1, len(hs)):
            if not at[i][4]: hs[i] = min(hs[i], max(2.6, hs[i - 1]) + WIDEN * STEP)
        for i in range(len(hs) - 2, -1, -1):
            if not at[i][4]: hs[i] = min(hs[i], max(2.6, hs[i + 1]) + WIDEN * STEP)
        pts = []
        for (q, nx, ny, _, inside), half in zip(at, hs):
            half = TUNNEL_HALF if inside else max(2.6, min(9.0, half))
            gc = T.elev(q.x, q.y)
            gl = T.elev(q.x + nx * (half + 1.5), q.y + ny * (half + 1.5))
            gr = T.elev(q.x - nx * (half + 1.5), q.y - ny * (half + 1.5))
            pts.append([r1(q.x), r1(q.y), r1(half), r1(gc), r1(gl), r1(gr), 1 if inside else 0])
        index[k] = len(runs)
        runs.append(dict(lv=round(level[k], 2), p=pts))

    # ---- aqueducts: where the canal crosses a valley on arches --------------------------------
    roads, big = [], []
    for f in json.load(open(os.path.join(src, "segment.geojson")))["features"]:
        if f["properties"].get("subtype") not in ("road", "rail"): continue
        g = proj(shape(f["geometry"]))
        if not g.intersects(circle): continue
        roads.append(g)
        if f["properties"]["subtype"] == "rail" or f["properties"].get("class") not in PATHS: big.append(g)
    under = unary_union(big + rivers)     # what passes under an aqueduct: no pier on it (paths can go round)
    for k in keep:
        r = runs[index[k]]
        p, lv = r["p"], r["lv"]
        low = [q[3] < lv - AQUEDUCT for q in p]
        i = 0
        while i < len(p):
            if not low[i]: i += 1; continue
            j = i
            while j + 1 < len(p) and low[j + 1]: j += 1
            a, b = max(0, i - 1), min(len(p) - 1, j + 1)
            if b - a >= 2:
                for q in p[a:b + 1]: q[6] |= 2
                # piers between the arches, about SPAN apart, moved off anything passing underneath
                last = a
                for t in range(a + 1, b):
                    if (t - last) * STEP >= SPAN and (b - t) * STEP >= SPAN * 0.6 and under.distance(Point(p[t][0], p[t][1])) > 5:
                        p[t][6] |= 4
                        last = t
                print(f"  aqueduct at {p[(a + b) // 2][:2]}: {(b - a) * STEP:.0f} m, {sum(1 for q in p[a:b + 1] if q[6] & 4)} piers, {lv - min(q[3] for q in p[a:b + 1]):.1f} m up")
            i = j + 1

    # ---- the banks: which side the towpath is on, and how wide each bank is ---------------------
    # The canal is laid as it was built, not as the survey's ground happens to lie: each side of the
    # water has a level bank at the coping's height (canal.ts, works.ts), the towpath on one side
    # (wherever a mapped path runs along the water there) and a narrower bank on the other, then a
    # verge down or up to the ground. A building or a street running beside the water squeezes the
    # bank on that side down to its coping. Decided here, once for the whole canal, so every square
    # of the map lays the same banks where they meet.
    tow_lines, side_obstacles = [], []
    for f in json.load(open(os.path.join(src, "segment.geojson")))["features"]:
        p = f["properties"]
        if p.get("subtype") != "road": continue
        g = proj(shape(f["geometry"]))
        if not g.intersects(circle): continue
        c = p.get("class")
        flags = {v for fl in p.get("road_flags") or [] for v in fl.get("values") or []}
        if c in PATHS and c not in ("steps", "track"): tow_lines.append(g)
        elif c not in PATHS and "is_bridge" not in flags and "is_tunnel" not in flags:
            side_obstacles.append((g, ROAD_HALF.get(c, 3.0)))
    bfeats = [proj(shape(f["geometry"])) for f in json.load(open(os.path.join(src, "building.geojson")))["features"]]
    canal_zone = unary_union([LineString([q[:2] for q in r["p"]]) for r in runs if len(r["p"]) > 1]).buffer(30)
    blds = [b if b.is_valid else shapely.make_valid(b) for b in bfeats if b.intersects(canal_zone)]
    btree = shapely.STRtree(blds) if blds else None
    tow_segs = []
    for g in tow_lines:
        if not g.intersects(canal_zone): continue
        for ln in getattr(g, "geoms", [g]):
            c = list(ln.coords)
            tow_segs += [LineString([c[i], c[i + 1]]) for i in range(len(c) - 1) if math.dist(c[i], c[i + 1]) > 0.3]
    ttree = shapely.STRtree(tow_segs) if tow_segs else None
    obs_segs = []
    for g, rh in side_obstacles:
        if not g.intersects(canal_zone): continue
        for ln in getattr(g, "geoms", [g]):
            c = list(ln.coords)
            obs_segs += [(LineString([c[i], c[i + 1]]), rh) for i in range(len(c) - 1) if math.dist(c[i], c[i + 1]) > 0.3]
    otree = shapely.STRtree([s for s, _ in obs_segs]) if obs_segs else None
    gate_pts = [Point(lk[e]) for lk in locks for e in ("lo", "hi")]
    for r in runs:
        p = r["p"]
        n = len(p)
        normals = []
        for k in range(n):
            a, b = p[max(0, k - 1)], p[min(n - 1, k + 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]; tl = math.hypot(tx, ty) or 1
            normals.append((tx / tl, ty / tl, -ty / tl, tx / tl))
        # which side the towpath runs on: the mapped paths along the water, either side, near each point
        vote = [0.0] * n
        for k, q in enumerate(p):
            if ttree is None: break
            tx, ty, nx, ny = normals[k]
            here = Point(q[0], q[1])
            for j in ttree.query(here.buffer(q[2] + TOW_REACH)):
                s = tow_segs[int(j)]
                (ax, ay), (bx, by) = s.coords
                L = math.hypot(bx - ax, by - ay)
                if abs((bx - ax) * tx + (by - ay) * ty) / L < 0.8: continue      # crossing the canal: a bridge
                m = s.interpolate(s.project(here))
                off = (m.x - q[0]) * nx + (m.y - q[1]) * ny
                if q[2] - 1.0 < abs(off) < q[2] + TOW_REACH: vote[k] += math.copysign(1.0 / (1 + abs(off) - q[2]), off)
        # evened out along the canal (a towpath doesn't swap sides from one point to the next) and
        # carried on to points with no path mapped beside them from the nearest that has one
        side = []
        for k in range(n):
            v = sum(vote[max(0, k - SIDE_RUN):k + SIDE_RUN + 1])
            side.append(0 if abs(v) < 0.05 else (1 if v > 0 else -1))
        known = [k for k in range(n) if side[k]]
        if known:
            for k in range(n):
                if not side[k]: side[k] = side[min(known, key=lambda j: abs(j - k))]
        for k, q in enumerate(p):
            tx, ty, nx, ny = normals[k]
            here = Point(q[0], q[1])
            widths, verges = [], []
            for s in (1, -1):
                if q[6] & 1:            # in a tunnel: a ledge for the towpath through it on its side
                    widths.append(TUNNEL_LEDGE if s == side[k] else 0.0); verges.append(0.0); continue
                want = TOW_WIDE if s == side[k] else BANK_WIDE
                # how much room there is before a building, or a street alongside the water
                ray = LineString([(q[0] + nx * s * q[2], q[1] + ny * s * q[2]), (q[0] + nx * s * (q[2] + want + VERGE + 1), q[1] + ny * s * (q[2] + want + VERGE + 1))])
                room = want + VERGE + 1
                if btree is not None:
                    for j in btree.query(ray):
                        hit = blds[int(j)].intersection(ray)
                        if not hit.is_empty: room = min(room, Point(ray.coords[0]).distance(hit))
                if otree is not None:
                    for j in otree.query(ray.buffer(8)):
                        sg, rh = obs_segs[int(j)]
                        (ax, ay), (bx, by) = sg.coords
                        L = math.hypot(bx - ax, by - ay)
                        if abs((bx - ax) * tx + (by - ay) * ty) / L < 0.7: continue    # crossing over it
                        d = sg.distance(Point(ray.coords[0])) - rh
                        if sg.distance(ray) < rh: room = min(room, max(0.0, d))
                w = max(COPE_W, min(want, room - 0.3))
                widths.append(round(w, 2))
                verges.append(round(max(0.3, min(VERGE, room - w - 0.2)), 2))
            q += [widths[0], widths[1], verges[0], verges[1]]
        r["tw"] = side[0] if len(set(side)) == 1 else None
    # each tunnel's towpath side, for the ledge through it (canal.ts)
    for t in tunnels:
        r = runs[index[t["run"]]]
        k = min(range(len(r["p"])), key=lambda i: math.dist(r["p"][i][:2], ((t["a"][0] + t["b"][0]) / 2, (t["a"][1] + t["b"][1]) / 2)))
        t["tw"] = 1 if r["p"][k][7] > 0 else -1 if r["p"][k][8] > 0 else 0
    for r in runs: r.pop("tw", None)

    # ---- boats moored along the bank: in rows here and there on the long pound ------------------
    canal_all = unary_union([chains[k] for k in keep])
    crossings = unary_union(roads).intersection(canal_all) if roads else None
    avoid = [Point(x, y) for lk in locks for x, y in (lk["lo"], lk["hi"])] + \
            [Point(t[e]) for t in tunnels for e in ("a", "b")]
    for k in keep:
        for x, y in (chains[k].coords[0], chains[k].coords[-1]): avoid.append(Point(x, y))
    near_avoid = unary_union([p.buffer(70) for p in avoid] + ([crossings.buffer(25)] if crossings is not None and not crossings.is_empty else []))
    rnd = random.Random(1810)
    moor = []
    for k in keep:
        if abs(level[k] - level0) > 0.01: continue
        c, pts = chains[k], runs[index[k]]["p"]
        d = 40.0
        while d < c.length - 40:
            d += rnd.uniform(150, 450)
            if rnd.random() < 0.3: continue
            side = rnd.choice((1, -1))
            for _ in range(rnd.randint(3, 8)):
                L = rnd.choice((12, 15, 17, 18, 20, 21))
                if d + L > c.length - 40: break
                i0, i1 = int(d / c.length * (len(pts) - 1)), int(math.ceil((d + L) / c.length * (len(pts) - 1)))
                span = pts[i0:i1 + 1]
                bank = [q[4] if side > 0 else q[5] for q in span]
                if (min(q[2] for q in span) < 5 or any(q[6] for q in span) or min(bank) < level0 - 0.3
                        or near_avoid.intersects(substring(c, d, d + L))):
                    d += L + 2
                    continue
                m = c.interpolate(d + L / 2)
                a, b = c.interpolate(d), c.interpolate(d + L)
                ang = math.atan2(b.y - a.y, b.x - a.x)
                half = sum(q[2] for q in span) / len(span)
                off = side * (half - 1.15)
                nx, ny = -math.sin(ang), math.cos(ang)
                if rnd.random() < 0.5: ang += math.pi       # moored facing either way
                moor.append([r1(m.x + nx * off), r1(m.y + ny * off), round(ang, 3), L, rnd.randrange(PAINTS)])
                d += L + rnd.uniform(1.5, 4)

    out_d = dict(
        runs=runs,
        locks=[dict(n=lk["n"], no=lk["no"], lo=[r1(v) for v in lk["lo"]], hi=[r1(v) for v in lk["hi"]],
                    zl=round(lk["zl"], 2), zh=round(lk["zh"], 2), tl=r1(wing(lk))) for lk in locks],
        tunnels=[dict(n=t["n"], a=[r1(v) for v in t["a"]], b=[r1(v) for v in t["b"]], tw=t["tw"]) for t in tunnels],
        moor=moor,
    )
    json.dump(out_d, open(out, "w"), separators=(",", ":"))
    for r in runs:
        p = r["p"]
        low = min(min(q[4], q[5]) for q in p if not q[6]) if any(not q[6] for q in p) else None
        print(f"  run {p[0][:2]} -> {p[-1][:2]}: {len(p)} points, water {r['lv']}, lowest bank {low}")
    print(f"{len(runs)} stretches, {len(locks)} locks, {len(tunnels)} tunnels, {len(moor)} moored boats -> {out} ({os.path.getsize(out) // 1024} KB)")


main()
