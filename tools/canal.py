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
- moor: boats moored along the bank, [x, y, angle (radians, east is 0, north a quarter turn), length, paint]:
  where the lidar saw boats moored (data/<map>/moorings.json, tools/moorings.py), or else in rows
  here and there on the long pound.
"""
import json, math, os, random, sys
from collections import defaultdict
import numpy as np
import shapely
import shapely.affinity
from shapely.geometry import shape, Point, LineString
from shapely.ops import linemerge, nearest_points, substring, unary_union

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
BASIN_HALF, BASIN_REACH = 14.0, 26.0   # a junction's basin: the water's half width at the junction, and how far out the stretches widen into it
AQUEDUCT_HALF = 2.8        # half the water's width in an aqueduct's trough, at most (landmarks/dundas.ts)
REACH_ON, CLEAR_ON = 6, 6.0   # an aqueduct runs on up to this many points to take in a railway or road passing under the canal this close
TAIL = 2.2                 # how far a lock's walls run past each pair of gates (canal.ts)
WING = 6.0                 # below a lock, its wing walls and the towpath beside them come down a metre in this many
WIDEN = 0.25               # how fast the water may narrow or widen along the canal, metres each side a metre
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
TOW_REACH = 14.0           # a path this close to the water's edge, running along it, is the towpath
SIDE_RUN = 8               # points (of 4 m) each side looked at to say which side the towpath is on
TOW_WIDE = 3.0             # the towpath's bank, from the water's edge (its coping) to its far side
BANK_WIDE = 1.4            # the bank on the other side
COPE_W = 0.45              # the stone coping along the water's edge: all the bank there is where it's squeezed
BASIN_MIN = 400.0          # square metres: a basin or marina off the canal at least this big is open water of its own
BASIN_NECK = 5.0           # metres: water narrower than twice this beside the canal is its own outline wandering, not a basin
BERTH = 2.6                # metres between boats moored side by side, a narrowboat's beam and fenders
CHANNEL_CLEAR = 10.0       # metres kept clear of moored boats where a basin opens on to the canal
ENTRY_REACH = 25.0         # metres: a basin this near the canal with no water mapped between has a channel cut to it
ENTRY_HALF, ENTRY_IN = 2.5, 3.0   # that channel's half width (a boat's beam and room either side), and how far it runs on into the basin
VERGE = 2.0                # from the bank's edge to the ground: a grass slope, or a wall and a slope
TUNNEL_LEDGE = 1.3         # the towpath's ledge through a tunnel
ROAD_HALF = {"motorway": 7, "trunk": 6, "primary": 4.3, "secondary": 4, "tertiary": 3.5, "residential": 3, "unclassified": 2.8,
             "living_street": 2.5, "service": 1.8, "unknown": 2}
PAINTS = 7                 # boat liveries the game knows (canal.ts)
WAY_CLEAR = 1.0           # metres either side of a mapped path's line kept clear of a moored boat: a pontoon's walkway and a little room
HULL = 1.04                # half a narrowboat's beam (canal.ts HW)
r1 = lambda v: round(float(v), 1)
wing = lambda lk: TAIL + (lk["zh"] - lk["zl"]) * WING     # how far a lock's wing walls run below its bottom gates


def basin_boats(basins, seen, corridor, infra_file, proj, circle, ways):
    """Boats moored in the basins and marinas, [x, y, angle, length, paint, level]: where the lidar
    saw them (tools/moorings.py's entries with no side), or else, in a marina, berthed side by side
    along its pontoons where they're mapped and nose to tail round its edge where they aren't. The
    level, which the boats on the canal leave out, marks them as lying off it (they don't cast off)."""
    rnd = random.Random(1814)
    seen_boats = [m for m in (json.load(open(seen)) if os.path.exists(seen) else []) if not m[4]]
    piers = []
    if os.path.exists(infra_file):
        for f in json.load(open(infra_file))["features"]:
            if f["properties"].get("class") not in ("pier", "pontoon", "jetty"): continue
            g = proj(shape(f["geometry"]))
            if not g.intersects(circle): continue
            if g.geom_type.endswith("Polygon"):
                # (a pontoon drawn as an outline: its long middle line)
                rect = g.minimum_rotated_rectangle
                c = list(rect.exterior.coords)
                sides = sorted([(math.dist(c[i], c[i + 1]), i) for i in range(4)])
                g = LineString([((c[k][0] + c[k + 1][0]) / 2, (c[k][1] + c[k + 1][1]) / 2) for k in (sides[0][1], sides[1][1])])
            piers += list(getattr(g, "geoms", [g])) if g.geom_type.endswith("LineString") else []
    channel = corridor.buffer(CHANNEL_CLEAR)
    # (the pontoons' walkways and any bridge over the water, as the game draws them, kept clear of hulls)
    water = unary_union([b["poly"] for b in basins]) if basins else None
    ways = [(g, path) for g, path in ways if water is not None and g.intersects(water)]
    walks = unary_union([g.buffer(WAY_CLEAR if path else 4.0) for g, path in ways]) if ways else None
    piers += [ln for g, path in ways if path for ln in getattr(g, "geoms", [g]) if ln.geom_type == "LineString"]
    out = []
    for b in basins:
        poly, lv = b["poly"], b["lv"]
        room = poly.buffer(-0.3)
        laid = []

        def berth(cx, cy, ang, L, seen_=False):
            hull = shapely.affinity.rotate(shapely.box(cx - L / 2, cy - HULL, cx + L / 2, cy + HULL), ang, origin=(cx, cy), use_radians=True)
            # (where the survey saw one it's there, whatever the outline says: only overlaps are dropped)
            if not (poly.buffer(0.5) if seen_ else room).contains(hull) or (not seen_ and not b["own"] and hull.intersects(channel)) \
                    or (not seen_ and walks is not None and hull.intersects(walks)) \
                    or any(hull.distance(o) < (0.05 if seen_ else 0.3) for o in laid): return False
            laid.append(hull)
            out.append([r1(cx), r1(cy), round(ang, 3), L, rnd.randrange(PAINTS), round(lv, 2)])
            return True

        mine = [m for m in seen_boats if poly.contains(Point((m[0] + m[2]) / 2, (m[1] + m[3]) / 2))]
        for x0, y0, x1, y1, _ in mine:
            L = round(max(7.0, min(21.0, math.dist((x0, y0), (x1, y1)))), 1)
            ang = math.atan2(y1 - y0, x1 - x0) + (math.pi if rnd.random() < 0.5 else 0)
            berth((x0 + x1) / 2, (y0 + y1) / 2, ang, L, True)
        if mine or not b["marina"]: continue
        for pier in piers:
            if not pier.intersects(poly): continue
            pier = pier.intersection(poly)
            for seg in getattr(pier, "geoms", [pier]):
                if seg.geom_type != "LineString": continue
                c = list(seg.coords)
                for (ax, ay), (bx, by) in zip(c, c[1:]):
                    span = math.dist((ax, ay), (bx, by))
                    if span < BERTH: continue
                    ux, uy = (bx - ax) / span, (by - ay) / span
                    for side in (1, -1):
                        nx, ny = -uy * side, ux * side
                        d = BERTH / 2
                        while d < span - BERTH / 2:
                            L = rnd.choice((12, 15, 17, 18, 20, 21))
                            for L_ in sorted({L, 15, 12, 10}, reverse=True):
                                if L_ > L: continue
                                cx, cy = ax + ux * d + nx * (L_ / 2 + 0.8), ay + uy * d + ny * (L_ / 2 + 0.8)
                                if berth(cx, cy, math.atan2(ny, nx) + (math.pi if rnd.random() < 0.5 else 0), L_): break
                            d += BERTH
        # round the edge, nose to tail, wherever the pontoons haven't filled it
        for ring in [poly.exterior, *poly.interiors]:
            line = LineString(ring.coords)
            d = 0.0
            while d < line.length - 8:
                L = rnd.choice((12, 15, 17, 18, 20, 21))
                a, e = line.interpolate(d), line.interpolate(min(line.length, d + L))
                ang = math.atan2(e.y - a.y, e.x - a.x)
                m = line.interpolate(d + L / 2)
                inward = 1 if poly.contains(Point(m.x - math.sin(ang) * 2, m.y + math.cos(ang) * 2)) else -1
                off = (HULL + 0.4) * inward
                if berth(m.x - math.sin(ang) * off, m.y + math.cos(ang) * off, ang + (math.pi if rnd.random() < 0.5 else 0), L):
                    d += L + rnd.uniform(1.0, 2.5)
                else:
                    d += 3.0
    if out: print(f"basins: {len(out)} boats moored in them")
    return out


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
    marina_water = []          # water the map draws itself that's tagged as a marina (a river's, say)
    for f in feats:
        p = f["properties"]
        tags = dict(map(tuple, p.get("source_tags") or []))
        if p.get("class") not in ("canal", "river", "stream", "sea", "ocean") and tags.get("water") == "marina" \
                and f["geometry"]["type"].endswith("Polygon"):
            g = proj(shape(f["geometry"]))
            if g.intersects(circle): marina_water.append(g if g.is_valid else shapely.make_valid(g))
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
    roads, big, ways = [], [], []
    for f in json.load(open(os.path.join(src, "segment.geojson")))["features"]:
        if f["properties"].get("subtype") not in ("road", "rail"): continue
        g = proj(shape(f["geometry"]))
        if not g.intersects(circle): continue
        roads.append(g)
        ways.append((g, f["properties"]["subtype"] == "road" and f["properties"].get("class") in PATHS))
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
            # and on over a railway or a road passing under the canal just beyond where the survey's
            # ground comes up (the survey reads the aqueduct's own end as ground): it goes under
            # the aqueduct's last arch, not into the canal's bank
            while a > 0 and a > i - 1 - REACH_ON and under.distance(Point(p[a - 1][0], p[a - 1][1])) < CLEAR_ON: a -= 1
            while b < len(p) - 1 and b < j + 1 + REACH_ON and under.distance(Point(p[b + 1][0], p[b + 1][1])) < CLEAR_ON: b += 1
            if a > 0 and under.distance(Point(p[a][0], p[a][1])) < CLEAR_ON: a -= 1
            if b < len(p) - 1 and under.distance(Point(p[b][0], p[b][1])) < CLEAR_ON: b += 1
            if b - a >= 2:
                for q in p[a:b + 1]: q[6] |= 2; q[2] = min(q[2], AQUEDUCT_HALF)     # (the trough is narrower than the cut either side)
                # piers between the arches, about SPAN apart, moved off anything passing underneath
                last = a
                for t in range(a + 1, b):
                    if (t - last) * STEP >= SPAN and (b - t) * STEP >= SPAN * 0.6 and under.distance(Point(p[t][0], p[t][1])) > 5:
                        p[t][6] |= 4
                        last = t
                print(f"  aqueduct at {p[(a + b) // 2][:2]}: {(b - a) * STEP:.0f} m, {sum(1 for q in p[a:b + 1] if q[6] & 4)} piers, {lv - min(q[3] for q in p[a:b + 1]):.1f} m up")
            i = j + 1

    # ---- junctions: a basin where three stretches meet ------------------------------------------
    # Where the canal branches (the Somerset Coal Canal leaving the Kennet and Avon at Dundas) it
    # opens out into a basin, wide open water where boats pass and turn, not three channels meeting
    # at a point: each stretch widens out over its last BASIN_REACH metres to BASIN_HALF at the
    # junction, their waters running into one another (works.ts gives the water there priority over
    # any stretch's bank). An aqueduct's trough stays as it is.
    jends = defaultdict(list)
    for i, r in enumerate(runs):
        for e in (0, -1): jends[(round(r["p"][e][0]), round(r["p"][e][1]))].append((i, e))
    lock_ends = {(round(x), round(y)) for lk in locks for x, y in (lk["lo"], lk["hi"])}
    for spot, here in jends.items():
        # (a real branch, every stretch a length of canal, not a side pound between locks)
        if len(here) < 3 or spot in lock_ends or any(sum(math.dist(a[:2], b[:2]) for a, b in zip(runs[i]["p"], runs[i]["p"][1:])) < 100 for i, _ in here): continue
        node = runs[here[0][0]]["p"][here[0][1]][:2]
        for i, e in here:
            p = runs[i]["p"]
            for q in (p if e == 0 else reversed(p)):
                d = math.dist(q[:2], node)
                if d >= BASIN_REACH: break
                if q[6] & 3: continue
                f = 1 - d / BASIN_REACH; f = f * f * (3 - 2 * f)
                q[2] = r1(max(q[2], q[2] + (BASIN_HALF - q[2]) * f))
        print(f"  basin at the junction at {[r1(v) for v in node]}")

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

    # ---- basins and marinas: open water off the canal, at the level of the pound it opens on to ------
    # The canal is drawn from its middle line and its width, so water mapped as the canal's beyond
    # that (a marina dug out beside it, a side pond by a lock) would be left out; it's kept here as
    # a basin of its own, drawn and dug at its pound's level, with the canal's bank left open where
    # the two meet (web/src/works.ts). A marina the map draws itself (on a river) is kept too, "own",
    # just for its boats.
    open_runs = [(LineString([a[:2], b[:2]]), max(a[2], b[2]), i) for i, r in enumerate(runs) for a, b in zip(r["p"], r["p"][1:])
                 if math.dist(a[:2], b[:2]) > 0.01]
    corridor = unary_union([ln.buffer(h + 1.0) for ln, h, _ in open_runs]) if open_runs else Point(1e9, 1e9).buffer(1)
    lock_zone = unary_union([LineString([lk["lo"], lk["hi"]]).buffer(14.0) for lk in locks]) if locks else Point(1e9, 1e9).buffer(1)
    marina_land = []
    for f in json.load(open(os.path.join(src, "land_use.geojson")))["features"]:
        tags = dict(map(tuple, f["properties"].get("source_tags") or []))
        if tags.get("leisure") == "marina" and f["geometry"]["type"].endswith("Polygon"):
            g = proj(shape(f["geometry"]))
            if g.intersects(circle): marina_land.append(g if g.is_valid else shapely.make_valid(g))
    marina_land = unary_union(marina_land) if marina_land else None
    # (the canal's own water past where its stretches end, at the edge of the map, isn't a basin)
    beyond = unary_union(lines).difference(corridor).buffer(10.0) if lines else Point(1e9, 1e9).buffer(1)
    btree_all = shapely.STRtree(bfeats)

    def built_on(q):
        """The buildings standing in water q (its outline is often rough round them): they stand."""
        return unary_union([bfeats[int(k)].buffer(0.3, join_style=2) for k in btree_all.query(q.buffer(2))] or [Point(1e9, 1e9).buffer(1)])

    def entrance(piece, q):
        """The way into basin q from the canal: the water mapped between them, where a boat fits
        through it, or else a channel cut straight through the bank from the nearest point of the
        canal, unless that would cut the towpath (an entrance there is under a footbridge, which
        the map would have). None if neither."""
        parts = piece.difference(q).buffer(-HULL).buffer(HULL)
        mapped = [g for g in getattr(parts, "geoms", [parts]) if g.geom_type == "Polygon" and g.distance(q) < 1.0 and g.distance(corridor) < 1.5]
        if mapped: return unary_union(mapped)
        k = min(range(len(open_runs)), key=lambda j: open_runs[j][0].distance(q))
        ln = open_runs[k][0]
        c, a = nearest_points(ln, q)
        (x0, y0), (x1, y1) = ln.coords
        bank = min(runs[open_runs[k][2]]["p"], key=lambda p: math.dist(p[:2], (c.x, c.y)))
        left = (x1 - x0) * (a.y - y0) - (y1 - y0) * (a.x - x0) > 0
        if bank[7 if left else 8] >= 1.5:
            print(f"  basin at {[r1(v) for v in a.coords[0]]} lies off the towpath's side: no channel cut")
            return None
        L = c.distance(a) or 1
        ux, uy = (a.x - c.x) / L, (a.y - c.y) / L
        return LineString([(c.x, c.y), (a.x + ux * ENTRY_IN, a.y + uy * ENTRY_IN)]).buffer(ENTRY_HALF, cap_style="flat")

    basins = []
    for w in water:
        rest = w.difference(corridor).difference(lock_zone).difference(beyond)
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "Polygon" or piece.distance(corridor) > ENTRY_REACH: continue
            body = piece.buffer(-BASIN_NECK).buffer(BASIN_NECK)
            for q in getattr(body, "geoms", [body]):
                if q.geom_type != "Polygon" or q.area < BASIN_MIN: continue
                way = entrance(piece, q)
                if way is None: continue
                # (on into the canal's water a little, so no sliver of bank is left across the mouth)
                way = unary_union([way, way.buffer(2.0).intersection(corridor)]).buffer(0.8).buffer(-0.8)
                # its pound: the stretch it opens on to
                k = min(range(len(open_runs)), key=lambda j: open_runs[j][0].distance(way))
                lv = runs[open_runs[k][2]]["lv"]
                shape_ = unary_union([q.buffer(1.5).intersection(w), way])
                # (a strip of land by the entrance narrower than a square of the ground's 4 m grid
                # can't be drawn as land: it's water)
                shape_ = unary_union([shape_, shape_.buffer(2.0).buffer(-2.0).intersection(way.buffer(6.0))])
                shape_ = shape_.difference(lock_zone).difference(built_on(q))
                shape_ = max(getattr(shape_, "geoms", [shape_]), key=lambda g: g.area if g.geom_type == "Polygon" else 0)
                if shape_.geom_type != "Polygon": continue
                basins.append(dict(poly=shape_.simplify(0.3), lv=lv, own=False,
                                   marina=marina_land is not None and shape_.intersection(marina_land).area > 0.3 * shape_.area))
    for w in marina_water:
        for q in getattr(w, "geoms", [w]):
            if q.geom_type != "Polygon" or q.area < BASIN_MIN: continue
            # (the map's own water is drawn at the lowest of its banks, a little above: prep_map.py)
            edge = q.exterior
            lv = min(T.elev(*edge.interpolate(t, normalized=True).coords[0]) for t in np.linspace(0, 1, 80, endpoint=False)) + 0.1
            q = q.difference(built_on(q))
            q = max(getattr(q, "geoms", [q]), key=lambda g: g.area if g.geom_type == "Polygon" else 0)
            if q.geom_type == "Polygon": basins.append(dict(poly=q.simplify(0.3), lv=round(float(lv), 2), own=True, marina=True))
    print(f"basins: {sum(not b['own'] for b in basins)} off the canal ({sum(b['marina'] and not b['own'] for b in basins)} marinas), "
          f"{sum(b['own'] for b in basins)} marinas on other water")

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
    # where the lidar saw boats moored (tools/moorings.py), if it's been looked at for this map:
    # each stretch filled with boats nose to tail, from the long pound's levels or any other
    seen = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", map_id, "moorings.json")
    if os.path.exists(seen):
        for x0, y0, x1, y1, side in json.load(open(seen)):
            if not side: continue          # (a boat in a basin, placed below)
            mid = Point((x0 + x1) / 2, (y0 + y1) / 2)
            k = min(keep, key=lambda k: chains[k].distance(mid))
            c, pts = chains[k], runs[index[k]]["p"]
            if c.distance(mid) > 8: continue
            d0, d1 = sorted((c.project(Point(x0, y0)), c.project(Point(x1, y1))))
            # (the side as the chain runs, which may be the other way from x0, y0 to x1, y1)
            if c.project(Point(x0, y0)) > c.project(Point(x1, y1)): side = -side
            d = d0
            while d1 - d >= 6.5:
                room = d1 - d + 1.0
                L = rnd.choice([v for v in (21, 20, 18, 17, 15, 12) if v <= room] or [round(min(room, 10.0), 1)])
                i0 = int(d / c.length * (len(pts) - 1))
                i1 = int(math.ceil((d + L) / c.length * (len(pts) - 1)))
                # (as far out as the narrowest water along the boat, where the canal narrows past it)
                half = min(q[2] for q in pts[min(len(pts) - 1, i0):min(len(pts), i1 + 1)])
                m, a, b = c.interpolate(d + L / 2), c.interpolate(d), c.interpolate(d + L)
                ang = math.atan2(b.y - a.y, b.x - a.x)
                off = side * (half - 1.15)
                nx, ny = -math.sin(ang), math.cos(ang)
                if rnd.random() < 0.5: ang += math.pi
                moor.append([r1(m.x + nx * off), r1(m.y + ny * off), round(ang, 3), L, rnd.randrange(PAINTS)])
                d += L + rnd.uniform(0.6, 1.5)
        print(f"moorings: {len(moor)} boats where the lidar saw them moored")
    for k in (keep if not moor else []):
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

    moor += basin_boats(basins, seen, corridor, os.path.join(src, "infrastructure.geojson"), proj, circle, ways)

    out_d = dict(
        runs=runs,
        locks=[dict(n=lk["n"], no=lk["no"], lo=[r1(v) for v in lk["lo"]], hi=[r1(v) for v in lk["hi"]],
                    zl=round(lk["zl"], 2), zh=round(lk["zh"], 2), tl=r1(wing(lk))) for lk in locks],
        tunnels=[dict(n=t["n"], a=[r1(v) for v in t["a"]], b=[r1(v) for v in t["b"]], tw=t["tw"]) for t in tunnels],
        moor=moor,
        **({"basins": [dict(lv=round(b["lv"], 2), r=[[[r1(x), r1(y)] for x, y in list(ring.coords)[:-1]] for ring in [b["poly"].exterior, *b["poly"].interiors]],
                            **({"own": 1} if b["own"] else {})) for b in basins]} if basins else {}),
    )
    json.dump(out_d, open(out, "w"), separators=(",", ":"))
    for r in runs:
        p = r["p"]
        low = min(min(q[4], q[5]) for q in p if not q[6]) if any(not q[6] for q in p) else None
        print(f"  run {p[0][:2]} -> {p[-1][:2]}: {len(p)} points, water {r['lv']}, lowest bank {low}")
    print(f"{len(runs)} stretches, {len(locks)} locks, {len(tunnels)} tunnels, {len(moor)} moored boats -> {out} ({os.path.getsize(out) // 1024} KB)")


main()
