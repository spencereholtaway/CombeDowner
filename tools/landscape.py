"""Front doors, garden shrubs and the Palladian Bridge.

Doors: each house gets a front door on the wall that faces the nearest street (terraced houses
put it towards one side, as they do), painted in one of the colours common on Bath doors. The
wall is divided into equal bays, a window in each and centred on the wall (see bays_on), and the
door takes the middle of one bay, under the window above; the renderer leaves that bay's ground
floor window out. The door records how many bays its wall has, so the game lays them out the same.

Shrubs: wherever the canopy height map shows growth between 1 and 3.5 m that is not a tree top,
not on a road and not inside a building, there is a shrub. Sampled on a 4.8 m grid, outside mapped woods.

Palladian Bridge: Prior Park's 1755 covered bridge, placed from Overture's point for it.

When the map is built in tiles (tools/prep_tiles.py), each tile works over a margin round itself
and keeps only what lands inside it, so things near an edge are worked out by two tiles. With
keys or keyed set, the random choices for each house, door and street come from where it stands
rather than the order of the lists, so both tiles agree and nothing is drawn twice or left out.
"""
import math, random, zlib
import numpy as np
import shapely
from shapely.geometry import LineString, Point

DOOR_COLOURS = 8   # renderer palette size


BAY_ZONES = {"suburb", "foxhill"}
BAY = 3.4          # metres: a house's window spacing (the renderer's bay for houses)


def bays_on(L, door=False):
    """Window bays on a house wall L metres long. A wall with a front door has at least two once
    it is wide enough for a door beside a window."""
    n = int(L / BAY + 0.5)
    if door and n < 2 and L >= 2 * 0.7 * BAY: n = 2
    return max(n, 1) if door else n


def spot(x, y):
    """A whole number for a place, to seed the random choices made there."""
    return zlib.crc32(f"{round(x, 1)},{round(y, 1)}".encode())


def front_doors(polys, info, roads, gelev, rnd, bays=None, keys=None, walls=()):
    """Doors (and, if a list is given, bay windows: 1930s suburban semis and detached houses
    usually have one beside the door, often two storeys high). keys: see buildings.classify.
    walls (lines): a door goes in another bay of its wall rather than open on to one of them."""
    wtree = shapely.STRtree(list(walls)) if len(walls) else None
    lines = [LineString([(a, b) for a, b, *_ in r["p"]]) for r in roads
             if r["c"] not in ("footway", "steps", "path", "cycleway", "bridleway", "track") and len(r["p"]) > 1]
    tree = shapely.STRtree(lines)
    out = []
    for i, (poly, b) in enumerate(zip(polys, info)):
        if b["kind"] not in ("detached", "semi", "terrace") or b["eaves"] < 3: continue
        rr = random.Random(keys[i] * 53 + 11) if keys is not None else rnd
        c = poly.centroid
        near = [int(k) for k in tree.query(c.buffer(50))]
        if not near: continue
        road = min((lines[k] for k in near), key=lambda l: l.distance(c))
        ring = list(poly.exterior.coords)[:-1]
        best = None
        for k in range(len(ring)):
            a, q = ring[k], ring[(k + 1) % len(ring)]
            L = math.dist(a, q)
            if L < 2.2: continue
            m = ((a[0] + q[0]) / 2, (a[1] + q[1]) / 2)
            d = road.distance(Point(m))
            if best is None or d < best[0] - 0.5: best = (d, a, q, L)
        if not best: continue
        _, a, q, L = best
        # the game draws the footprint rounded to 0.1 m: count bays on that wall
        a, q = (round(a[0], 1), round(a[1], 1)), (round(q[0], 1), round(q[1], 1))
        L = math.dist(a, q)
        ux, uy = (q[0] - a[0]) / L, (q[1] - a[1]) / L
        # terraces put the door in an end bay; others in the middle one
        n = bays_on(L, door=True)
        if b["kind"] == "terrace": k = 0 if rr.random() < 0.5 else n - 1
        else: k = n // 2 if n % 2 or rr.random() < 0.5 else n // 2 - 1
        nx, ny = uy, -ux
        mx, my = a[0] + ux * L / 2, a[1] + uy * L / 2
        if (mx - c.x) * nx + (my - c.y) * ny < 0: nx, ny = -nx, -ny
        def blocked(k):
            px, py = a[0] + ux * L * (k + 0.5) / n, a[1] + uy * L * (k + 0.5) / n
            step = LineString([(px + nx * 0.15, py + ny * 0.15), (px + nx * 0.75, py + ny * 0.75)])
            return wtree is not None and any(walls[int(j)].intersects(step) for j in wtree.query(step))
        if blocked(k): k = next((j for j in sorted(range(n), key=lambda j: abs(j - k)) if not blocked(j)), k)
        f = (k + 0.5) / n
        px, py = a[0] + ux * L * f, a[1] + uy * L * f
        ang = math.atan2(uy, ux)
        if math.sin(ang) * nx - math.cos(ang) * ny < 0: ang += math.pi
        px, py = px + nx * 0.03, py + ny * 0.03
        out.append([round(px, 2), round(py, 2), round(gelev(px, py), 2), round(ang, 3), rr.randrange(DOOR_COLOURS), n])
        if bays is not None and n >= 2 and b["kind"] in ("semi", "detached") and b["zone"] in BAY_ZONES and L > 6 and rr.random() < 0.6:
            g = (k + (1.5 if k + 1 < n else -0.5)) / n    # over the window in the next bay
            bx, by = a[0] + ux * L * g + nx * 0.45, a[1] + uy * L * g + ny * 0.45
            storeys = 2 if b["eaves"] > 4.5 and rr.random() < 0.6 else 1
            bays.append([round(bx, 2), round(by, 2), round(gelev(bx, by), 2), round(ang, 3), storeys, b["wall"][0], round(min(2.6, L * 0.32), 2)])
    return out


# streets with kerbs have a 1.7 m pavement each side (as drawn in web/src/world.ts)
KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
PAVE = 1.7


def shrubs(canopy, footprints, roads, RW, inside, gelev, woods=(), step_px=4, reach=None):
    """Woods are left out: their undergrowth is hidden under the trees anyway. Only within reach
    metres of the map's centre, if given (None: everywhere the data reaches). Nothing grows on a
    street's hard surface: the carriageway, and the pavements of a kerbed street (as drawn in
    web/src/world.ts)."""
    if canopy is None: return []
    solid = shapely.STRtree(list(woods) + [f.buffer(0.8) for f in footprints] +
                            [LineString([(a, b) for a, b, *_ in r["p"]]).buffer((r.get("w") or RW.get(r["c"], 3)) / 2 + (max(r.get("pv", [PAVE])) if r["c"] in KERBED else 0) + 0.6)
                             for r in roads if len(r["p"]) > 1])
    out = []
    # on the canopy tile's own pixel grid when aligned (see canopy.py), so overlapping tiles agree
    for i, j, h in canopy.low_growth(step_px, 1.0, 3.5):
        x, y = canopy.model_xy(i, j)
        if not inside(x, y) or (reach is not None and math.hypot(x, y) > reach): continue
        if len(solid.query(Point(x, y), predicate="intersects")): continue
        out.append([round(x, 1), round(y, 1), round(gelev(x, y), 1), round(h, 1)])
    return out


def approaches(gates, drives, doors, polys, gelev, rnd, keyed=False, walls=()):
    """Front paths from each gate to the nearest front door it can reach without going through a
    wall, fence or hedge (walls, as lines), driveways from each drive gap up to the house (with a
    car on most), and wheelie bins beside front doors (where no wall or fence is in the way)."""
    wtree = shapely.STRtree(list(walls)) if walls else None
    def walled_off(line):
        for k in (wtree.query(line) if wtree is not None else []):
            x = walls[int(k)].intersection(line)
            for h in getattr(x, "geoms", [x]):
                if not h.is_empty and line.project(h.centroid) > 1.0: return True
        return False
    at = (lambda x, y: random.Random(spot(x, y))) if keyed else (lambda x, y: rnd)
    btree = shapely.STRtree(polys)
    door_pts = [Point(d[0], d[1]) for d in doors]
    dtree = shapely.STRtree(door_pts) if door_pts else None
    paths, drv, fx = [], [], []
    r2 = lambda v: round(float(v), 2)
    for x0, y0, x1, y1, _z, _style in gates:
        g = Point((x0 + x1) / 2, (y0 + y1) / 2)
        if dtree is None: break
        near = [int(k) for k in dtree.query(g.buffer(25))]
        if not near: continue
        for k in sorted(near, key=lambda k: door_pts[k].distance(g))[:3]:
            d = door_pts[k]
            line = LineString([g, d])
            # not through another building, nor through a wall past the gate's own
            if line.length < 1.5 or any(polys[int(b)].intersection(line).length > 1.0 for b in btree.query(line)) or walled_off(line): continue
            paths.append([r2(g.x), r2(g.y), r2(d.x), r2(d.y)])
            break
    for x, y, i in drives:
        house = polys[i]
        c = house.centroid
        ux, uy = c.x - x, c.y - y
        L = math.hypot(ux, uy) or 1
        ux, uy = ux / L, uy / L
        # run towards the house until close to its wall (at most 14 m)
        length = 2.0
        while length < 14 and house.distance(Point(x + ux * length, y + uy * length)) > 1.2: length += 0.5
        ex, ey = x + ux * length, y + uy * length
        if any(polys[int(b)].intersects(LineString([(x, y), (ex, ey)]).buffer(1.2)) for b in btree.query(Point(ex, ey).buffer(15)) if int(b) != i):
            continue
        drv.append([r2(x), r2(y), r2(ex), r2(ey)])
        rr = at(x, y)
        if length > 6 and rr.random() < 0.6:
            mx, my = x + ux * (length - 3.2), y + uy * (length - 3.2)
            fx.append(["car", r2(mx), r2(my), r2(gelev(mx, my)), r2(math.atan2(uy, ux) + (math.pi if rr.random() < 0.5 else 0)), rr.randrange(10)])
    for dx, dy, dz, ang, *_ in doors:
        rr = at(dx, dy)
        if rr.random() < 0.5: continue
        # beside the door, half a metre out from the wall
        ox, oy = math.cos(ang), math.sin(ang)
        nx, ny = math.sin(ang), -math.cos(ang)     # out of the wall (the door's local +z)
        side = 1.6 if rr.random() < 0.5 else -1.6
        bx, by = dx + ox * side + nx * 0.55, dy + oy * side + ny * 0.55
        # (not where a wall, fence or hedge runs along the front of the house there)
        if wtree is not None and any(walls[int(k)].distance(Point(bx, by)) < 0.6 for k in wtree.query(Point(bx, by).buffer(0.6))): continue
        fx.append(["wheelie", r2(bx), r2(by), r2(gelev(bx, by)), r2(ang), rr.randrange(3)])
    return paths, drv, fx


POLE_TOP = 7.6           # metres above a pole's foot that the span to the next pole hangs from
POLE_DROP = 7.3          # and the drop to a house
POLE_SLIDE = (0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6)    # metres along the street a pole may stand off its spot


def telegraph(roads, doors, zone_at, gelev, rnd, keyed=False, clear=lambda x, y: True, widths=None):
    """Wooden telegraph poles along residential streets (about every 40 m, on one side), wires
    sagging between them and drop wires to nearby houses. Mulberry Park's cables are buried.

    A pole stands at the back of the street's own pavement (its width and pavements as fitted: `w`
    and `pv`, else `widths` by kind and a 1.7 m pavement), on a side that has one, where it is `clear`
    (off every wall and out of every building), slid along the street to the nearest spot that is, or
    not at all: then the run of wire stops there. Each pole carries its own number ["pole", x, y, z, angle, id], and each wire the
    numbers of the poles it hangs from [x0, y0, z0, x1, y1, z1, a, b] (b is -1 for a drop to a house),
    so whatever later moves or removes a pole moves or removes its wires with it (`string_wires`)."""
    poles, wires = [], []
    door_pts = [Point(d[0], d[1]) for d in doors]
    dtree = shapely.STRtree(door_pts) if door_pts else None
    r2 = lambda v: round(float(v), 2)
    for r in roads:
        if r["c"] not in ("residential", "unclassified") or len(r["p"]) < 2: continue
        line = LineString([(a, b) for a, b, *_ in r["p"]])
        if line.length < 50: continue
        key = spot(*r["p"][0][:2]) + spot(*r["p"][-1][:2])
        rnd_ = random.Random(key) if keyed else rnd
        # (a pole's number: its street, by both ends in order and its length, and its place along it)
        street = zlib.crc32(f"{round(r['p'][0][0], 1)},{round(r['p'][0][1], 1)}|{round(r['p'][-1][0], 1)},"
                            f"{round(r['p'][-1][1], 1)}|{round(line.length)}".encode())
        side = 1 if rnd_.random() < 0.5 else -1
        half = r.get("w", (widths or {}).get(r["c"], 6.0)) / 2
        pv = r.get("pv") or [1.7, 1.7]
        if pv[0 if side > 0 else 1] <= 0 and pv[1 if side > 0 else 0] > 0:
            side = -side
        own = pv[0 if side > 0 else 1]
        off = half + (own - 0.25 if own > 0.5 else own + 0.4)    # the back of the pavement, or the verge
        prev = None
        s, n = 12.0, 0
        while s < line.length - 6:
            c = line.interpolate(s)
            if zone_at(c.x, c.y) == "mulberry": prev = None; s += 40; continue
            n += 1
            at = None
            for d in POLE_SLIDE:
                t = min(max(s + d, 0.0), line.length)
                c = line.interpolate(t)
                p0, p1 = line.interpolate(max(0, t - 1)), line.interpolate(min(line.length, t + 1))
                ex, ey = p1.x - p0.x, p1.y - p0.y
                l = math.hypot(ex, ey) or 1
                px, py = c.x - ey / l * off * side, c.y + ex / l * off * side
                if clear(px, py):
                    at = (px, py, ex, ey)
                    break
            if at is None:
                prev = None
                s += 38 + rnd_.random() * 6
                continue
            px, py, ex, ey = at
            z = gelev(px, py)
            pid = street * 1000 + n
            poles.append(["pole", r2(px), r2(py), r2(z), r2(math.atan2(ey, ex)), pid])
            top = (px, py, z + POLE_TOP)
            if prev: wires.append([r2(prev[0]), r2(prev[1]), r2(prev[2]), r2(top[0]), r2(top[1]), r2(top[2]), prev[3], pid])
            prev = (*top, pid)
            # drops to a couple of nearby houses
            if dtree is not None:
                near = [int(k) for k in dtree.query(Point(px, py).buffer(28))]
                if keyed: near.sort(key=lambda k: (doors[k][0], doors[k][1]))
                for k in near[:3]:
                    d = doors[k]
                    if rnd_.random() < 0.5: continue
                    wires.append([r2(px), r2(py), r2(z + POLE_DROP), r2(d[0]), r2(d[1]), r2(d[2] + 5.2), pid, -1])
            s += 38 + rnd_.random() * 6
    return poles, wires


def string_wires(poles, wires, elsewhere=()):
    """`wires` hung from where their poles stand now, by the poles' numbers: `poles` is every pole row
    there is. A wire whose pole has gone goes with it. A pole number in `elsewhere` stands in another
    square, so that end is left as it is for the city's last pass to string. Wires from before poles
    carried numbers are left as they are."""
    at = {p[5]: p for p in poles if len(p) > 5}
    out = []
    for w in wires:
        if len(w) < 8:
            out.append(w); continue
        a, b = w[6], w[7]
        ends = []
        for pid, xyz, lift in ((a, w[0:3], POLE_DROP if b == -1 else POLE_TOP), (b, w[3:6], POLE_TOP)):
            if pid == -1:
                ends.append(list(xyz))
            elif pid in at:
                p = at[pid]
                ends.append([p[1], p[2], round(p[3] + lift, 2)])
            elif pid in elsewhere:
                ends.append(list(xyz))
            else:
                ends = None
                break
        if ends:
            out.append(ends[0] + ends[1] + [a, b])
    return out
