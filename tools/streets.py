"""Street furniture and markings.

From the map data: bus stops (with their real names, and a shelter where the map says there is one),
benches, bins, post boxes (pillar, wall or lamp boxes, as mapped), red telephone boxes, bollards and
information boards, each moved onto the pavement and turned to face the street.

Generated: street name signs where streets meet, lamp posts, white centre lines, give-way lines
where a side street meets another, and cars parked along residential streets.

Every item is [type, x, y, ground, angle, ...]. The angle turns the item's local +x axis along
the street; its front (local +z) faces the carriageway.

keyed (always set by tools/prep_map.py): the random choices along each street
come from the street itself, not the order of the lists or Python's per-run string hashing, so two
tiles that both build a street near their shared edge put the same things on it.
"""
import math, random, zlib
import shapely
from shapely.geometry import LineString, Point

KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
RANK = {"primary": 5, "secondary": 4, "tertiary": 3, "unclassified": 2, "residential": 2, "living_street": 1}   # which gives way to which
PAVE = 1.7
CAR_COLOURS = 10   # the renderer picks from this many paints


# Royal Mail's boxes as the game draws them: a pillar box (and any the map doesn't say), a box set in
# a wall, and a small box on a post
POST_BOX = {"wall": 1, "lamp": 2}
# The red kiosks; the modern KX booths aren't drawn
RED_BOOTHS = ("K2", "K6", "K8")


def phone_boxes(osm):
    """The red telephone boxes in OpenStreetMap's features (osm.geojson), as infrastructure-like
    points. A kiosk kept as a book swap or a defibrillator's case still stands."""
    out = []
    for g, p in osm:
        if p.get("booth") in RED_BOOTHS:
            out.append((g if g.geom_type == "Point" else g.representative_point(), {"class": "telephone_box"}))
    return out


def tags_of(p):
    return dict(t for t in p.get("source_tags") or [] if len(t) == 2)


def street_furniture(roads, infra, gates, RW, gelev, proj, inside, rnd: random.Random, keyed=False):
    vehicle = [r for r in roads if r["c"] in KERBED or r["c"] in ("service", "unknown", "living_street")]
    lines = [LineString([(a, b) for a, b, *_ in r["p"]]) for r in vehicle]
    tree = shapely.STRtree(lines)
    half = lambda r: (r.get("w") or RW.get(r["c"], 4)) / 2     # (a pedestrianised street has its own width)

    def nearest_street(x, y):
        best = None
        for k in tree.query(Point(x, y).buffer(30)):
            d = lines[int(k)].distance(Point(x, y))
            if best is None or d < best[0]: best = (d, int(k))
        return best

    def place(x, y, k, extra_off):
        """Snap (x, y) to the pavement of street k on the side it is on: position and facing angle."""
        line, r = lines[k], vehicle[k]
        s = line.project(Point(x, y))
        p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
        dx, dy = p1.x - p0.x, p1.y - p0.y
        l = math.hypot(dx, dy) or 1
        dx, dy = dx / l, dy / l
        c = line.interpolate(s)
        side = 1 if (x - c.x) * -dy + (y - c.y) * dx > 0 else -1
        off = half(r) + max(0.3, extra_off - (PAVE - r.get("pv", [PAVE, PAVE])[0 if side > 0 else 1]))     # (the pavement on that side may be narrower, or none)
        px, py = c.x - dy * off * side, c.y + dx * off * side
        ang = math.atan2(dy, dx) + (0 if side > 0 else math.pi)
        return px, py, ang

    items = []
    r1 = lambda v: round(float(v), 2)
    # the game draws a kerbed street's pavement 0.2 m and its carriageway 0.07 m above the ground
    # (web/src/world.ts), and stands each item at the height stored here
    add = lambda kind, x, y, ang, *extra: items.append([kind, r1(x), r1(y), r1(gelev(x, y) + (0.07 if kind == "car" else 0.2)), r1(ang), *extra])

    # ---- mapped furniture --------------------------------------------------------
    stops = []
    for g, p in infra:
        if g.geom_type != "Point": continue
        x, y = proj(g.x, g.y)
        if not inside(x, y): continue
        c = p.get("class")
        kind = {"bus_stop": "bus", "bench": "bench", "waste_basket": "bin", "post_box": "postbox",
                "bollard": "bollard", "information": "info", "telephone_box": "phone"}.get(c)
        if not kind: continue
        near = nearest_street(x, y)
        if kind == "bus" and near and near[0] < 25:
            px, py, ang = place(x, y, near[1], 0.9)
            name = (p.get("names") or {}).get("primary") or "Bus stop"
            said = tags_of(p).get("shelter")
            if said in ("yes", "no"):
                shelter = 1 if said == "yes" else 0
            else:
                shelter = 1 if (random.Random(zlib.crc32(f"{x:.1f},{y:.1f}".encode())) if keyed else rnd).random() < 0.5 else 0
            add("bus", px, py, ang, name, shelter)
            stops.append((px, py))
        elif kind in ("postbox", "bin", "phone") and near and near[0] < 12:
            box = POST_BOX.get(tags_of(p).get("post_box:type"), 0) if kind == "postbox" else 0
            # a wall box is set in the wall at the back of the pavement, its slot facing the people
            # walking along it; the others stand out on the pavement
            back = 0.25 if box == 1 else 0.7 if kind == "phone" else 0.4
            px, py, ang = place(x, y, near[1], PAVE - back)
            if kind == "postbox":
                add(kind, px, py, ang, box)
            else:
                add(kind, px, py, ang)
        else:
            if near and near[0] < 30:
                dx, dy = _dir(lines[near[1]], x, y)
                ang = math.atan2(dy, dx)
                if kind == "bench":
                    # a bench looks out at the street, not away from it (tools/prep_map.py then
                    # turns one near a wall to sit with its back to that)
                    c = lines[near[1]].interpolate(lines[near[1]].project(Point(x, y)))
                    if (x - c.x) * -dy + (y - c.y) * dx < 0: ang += math.pi
            else:
                ang = 0
            add(kind, x, y, ang)

    # ---- junctions: where a street's end meets another street --------------------
    junctions = []   # (x, y, street index, other street index, end)
    for k, (line, r) in enumerate(zip(lines, vehicle)):
        for end, pt in ((0, Point(line.coords[0])), (1, Point(line.coords[-1]))):
            cands = [int(j) for j in tree.query(pt.buffer(3))]
            if keyed: cands.sort(key=lambda j: lines[j].coords[0])
            for j in cands:
                if j == k or vehicle[j].get("n") == r.get("n") and r.get("n"): continue
                if lines[j].distance(pt) < 2.5:
                    junctions.append((pt.x, pt.y, k, j, end)); break
    jpts = [Point(x, y) for x, y, *_ in junctions]
    jtree = shapely.STRtree(jpts) if jpts else None
    near_junction = lambda x, y, d: jtree is not None and any(jpts[int(i)].distance(Point(x, y)) < d for i in jtree.query(Point(x, y).buffer(d)))

    # ---- street name signs: one at each named street's junction ends -------------
    signed = set()
    for x, y, k, j, end in junctions:
        r = vehicle[k]
        if not r.get("n") or r["c"] not in KERBED: continue
        key = (r["n"], round(x / 40), round(y / 40))
        if key in signed: continue
        signed.add(key)
        line = lines[k]
        s = 6 if end == 0 else line.length - 6
        if s < 0 or s > line.length: continue
        c = line.interpolate(s)
        px, py, ang = place(c.x + 0.01, c.y + 0.01, k, PAVE - 0.25)
        # along the kerb at the back of the pavement, like a name plate on its posts, read from
        # the street it names and from the junction as you turn in
        add("sign", px, py, ang, r["n"])

    # ---- lamp posts --------------------------------------------------------------
    for line, r in zip(lines, vehicle):
        if r["c"] not in KERBED: continue
        n = int(line.length // 32)
        for i in range(n):
            side = 1 if i % 2 else -1
            off = half(r) + 0.45
            # (a mapped bin or post box already standing on the spot: the lamp goes a step along from it)
            for step in (0, 1.2, -1.2):
                s = 16 + i * 32 + step
                c = line.interpolate(s)
                p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
                dx, dy = p1.x - p0.x, p1.y - p0.y
                l = math.hypot(dx, dy) or 1
                px, py = c.x - dy / l * off * side, c.y + dx / l * off * side
                if not any(abs(q[1] - px) < 0.6 and abs(q[2] - py) < 0.6 for q in items): break
            if near_junction(px, py, 5): continue
            add("lamp", px, py, math.atan2(dy, dx) + (0 if side > 0 else math.pi))

    # ---- markings: centre dashes and give-way lines ------------------------------
    marks = []
    for line, r in zip(lines, vehicle):
        if r["c"] not in KERBED or RW.get(r["c"], 4) < 5.5: continue
        s = 4.0
        while s + 3 < line.length:
            a, b = line.interpolate(s), line.interpolate(s + 3)
            if not near_junction(a.x, a.y, 10) and not near_junction(b.x, b.y, 10):
                marks.append([r1(a.x), r1(a.y), r1(b.x), r1(b.y), r1(gelev(a.x, a.y)), r1(gelev(b.x, b.y)), 0])
            s += 9
    def carries_on(k, x, y):
        """Whether street k runs on past this end of it, under the same name (the map splits a
        street into pieces wherever another one joins it)."""
        n, pt = vehicle[k].get("n"), Point(x, y)
        return bool(n) and any(m != k and vehicle[m].get("n") == n and min(Point(lines[m].coords[0]).distance(pt), Point(lines[m].coords[-1]).distance(pt)) < 2.5
                               for m in (int(i) for i in tree.query(pt.buffer(3))))
    for x, y, k, j, end in junctions:
        line, r = lines[k], vehicle[k]
        if r["c"] not in KERBED: continue
        major = vehicle[j]
        # a street running on past a side road gives way to it only if it's the lesser road
        # (Broad Street doesn't stop for Green Street; a lane crossing a main road does)
        if carries_on(k, x, y) and RANK.get(major["c"], 0) <= RANK.get(r["c"], 0): continue
        s = half(major) + 1.0
        s = s if end == 0 else line.length - s
        if not 0 < s < line.length: continue
        c = line.interpolate(s)
        d = _dir(line, c.x, c.y)
        nx, ny = -d[1], d[0]
        w = half(r) - 0.2
        # two dashed lines across the road
        for back in (0, 0.45):
            bx, by = c.x - d[0] * back * (1 if end == 0 else -1), c.y - d[1] * back * (1 if end == 0 else -1)
            t = -w
            while t < w:
                t2 = min(w, t + 0.6)
                ax_, ay_, bx_, by_ = bx + nx * t, by + ny * t, bx + nx * t2, by + ny * t2
                marks.append([r1(ax_), r1(ay_), r1(bx_), r1(by_), r1(gelev(ax_, ay_)), r1(gelev(bx_, by_)), 1])
                t += 1.2

    # ---- parked cars -------------------------------------------------------------
    gate_pts = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in gates]
    stop_pts = [Point(s) for s in stops]
    for px, py, ang, colour in parked_cars(lines, vehicle, half, near_junction, gate_pts, stop_pts,
                                           keyed, lambda r: "none" if 2 * half(r) < 5 else "one"):
        add("car", px, py, ang, colour)
    return items, marks


def parked_cars(lines, vehicle, half, near_junction, gate_pts, stop_pts, keyed, sides_for):
    """Cars parked along residential streets: (x, y, angle, paint) for each.

    `sides_for(street)` says how many kerbs get cars: "none", "one" (chosen per street) or "both",
    each kerb with its own run of random choices."""
    gtree = shapely.STRtree(gate_pts) if gate_pts else None
    cars = []
    for line, r in zip(lines, vehicle):
        if r["c"] not in ("residential", "unclassified", "living_street"): continue
        rule = sides_for(r)
        if rule == "none": continue
        seed = (zlib.crc32((r.get("n") or "").encode()) if keyed else hash(r.get("n") or "")) % 100000 + int(line.length)
        if rule == "one":
            runs = [(random.Random(seed), None)]
        else:
            runs = [(random.Random(seed * 2 + 1), 1), (random.Random(seed * 2 + 2), -1)]
        for rr, fixed in runs:
            side = fixed if fixed else (1 if rr.random() < 0.5 else -1)
            s = 8.0
            while s < line.length - 8:
                c = line.interpolate(s)
                p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
                dx, dy = p1.x - p0.x, p1.y - p0.y
                l = math.hypot(dx, dy) or 1
                dx, dy = dx / l, dy / l
                off = half(r) - 1.05
                px, py = c.x - dy * off * side, c.y + dx * off * side
                ok = rr.random() < 0.5 and not near_junction(px, py, 12)
                if ok and gtree is not None:
                    ok = not any(gate_pts[int(i)].distance(Point(px, py)) < 4.5 for i in gtree.query(Point(px, py).buffer(4.5)))
                if ok and any(sp.distance(Point(px, py)) < 14 for sp in stop_pts): ok = False
                if ok:
                    cars.append((px, py, math.atan2(dy, dx) + (0 if rr.random() < 0.8 else math.pi), rr.randrange(CAR_COLOURS)))
                    s += 6.2 + rr.random() * 1.5
                else:
                    s += 4.0
    return cars


def _dir(line, x, y):
    s = line.project(Point(x, y))
    p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
    dx, dy = p1.x - p0.x, p1.y - p0.y
    l = math.hypot(dx, dy) or 1
    return dx / l, dy / l
