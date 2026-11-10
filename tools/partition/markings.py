"""Road markings (`mk`): the white centre dashes down a street and the give-way lines where a lesser
street meets a greater one, laid on the streets as the partition built them and kept to the road the
game draws.

Every square lays the markings of the whole street network round it the same way and keeps only the
pieces that lie on its own carriageway, so a junction on a square's side gets one give-way line, cut
where the two squares' roads meet, not one from each square.

Each mark is [x0, y0, x1, y1, z0, z1, kind]: kind 0 a centre dash, 1 a dash of a give-way line.
"""
import math

import shapely
from shapely.geometry import LineString, Point
from shapely.ops import substring, unary_union
from shapely.strtree import STRtree

RANK = {"trunk": 6, "primary": 5, "secondary": 4, "tertiary": 3, "unclassified": 2, "residential": 2, "living_street": 1}
GIVES_WAY = {"primary", "secondary", "tertiary", "residential", "unclassified"}
DASHED = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified"}
NODE = 1.0            # metres within which street ends are one junction
STRAIGHT_ON = 45.0    # degrees off straight that two arms of a junction still run on as one road
MERGE = 35.0          # degrees within which an arm leaves alongside one of the same street
ARM_LOOK = 8.0        # metres along an arm its direction is read over
DASH, GAP = 0.6, 0.6  # a give-way line's dashes and the gaps between them
ROWS = (0.1, 0.55)    # metres back from the greater road's kerb line of the two rows of dashes
FURTHEST = 25.0       # metres from a junction a give-way line may stand, where the roads part slowly
KERB_IN = 0.2         # metres a give-way line stops short of the kerb at each end
CENTRE_DASH, CENTRE_EVERY = 3.0, 9.0
CLEAR_OF_JUNCTION = 10.0
CLEAR_OF_CROSSING = 6.0


def _unit(dx, dy):
    l = math.hypot(dx, dy) or 1.0
    return dx / l, dy / l


def _dir(line, s, reach=1.0):
    a, b = line.interpolate(max(0.0, s - reach)), line.interpolate(min(line.length, s + reach))
    return _unit(b.x - a.x, b.y - a.y)


def junctions(streets):
    """Where streets meet: each a point and its arms, an arm being (street, its line leading away from
    the junction). A street whose end lands part way along another makes that other two arms."""
    lines = [s["line"] for s in streets]
    tree = STRtree(lines)
    ends = [(i, e, Point(l.coords[0] if e == 0 else l.coords[-1])) for i, l in enumerate(lines) for e in (0, 1)]
    etree = STRtree([p for *_, p in ends])
    seen, out = set(), []
    for k, (i, e, p) in enumerate(ends):
        if k in seen:
            continue
        group = [int(j) for j in etree.query(p.buffer(NODE)) if int(j) not in seen]
        seen.update(group)
        at = Point(sum(ends[j][2].x for j in group) / len(group), sum(ends[j][2].y for j in group) / len(group))
        arms = []
        for j in group:
            ii, ee, _ = ends[j]
            l = lines[ii]
            arms.append((ii, l if ee == 0 else LineString(l.coords[::-1])))
        mine = {ends[j][0] for j in group}
        for ii in tree.query(at.buffer(NODE)):
            ii = int(ii)
            l = lines[ii]
            if ii in mine or l.distance(at) > NODE:
                continue
            s = l.project(at)
            if s < NODE or s > l.length - NODE:
                continue
            arms.append((ii, LineString(substring(l, s, l.length).coords)))
            arms.append((ii, LineString(substring(l, 0, s).coords[::-1])))
        if len(arms) >= 3:
            out.append((at, arms))
    return out


def _heading(arm):
    a, b = Point(arm.coords[0]), arm.interpolate(min(ARM_LOOK, arm.length))
    return _unit(b.x - a.x, b.y - a.y)


def give_way_arms(streets, arms):
    """Which arms of a junction give way, and the arms of the road they give way to. The road with
    right of way is the pair of arms running on straight through the junction that ranks highest (the
    same street's two arms before two of different names); an arm off it gives way if it ranks no
    higher. Where no two arms run on, the highest-ranked arms have right of way and only lesser ones
    give way."""
    rank = lambda a: RANK.get(streets[a[0]]["cls"], 0)
    heads = [_heading(l) for _, l in arms]
    best = None
    for a in range(len(arms)):
        for b in range(a + 1, len(arms)):
            off = 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, heads[a][0] * heads[b][0] + heads[a][1] * heads[b][1]))))
            if off > STRAIGHT_ON:
                continue
            na, nb = streets[arms[a][0]].get("name"), streets[arms[b][0]].get("name")
            score = (min(rank(arms[a]), rank(arms[b])), bool(na) and na == nb, -off)
            if best is None or score > best[0]:
                best = (score, (a, b))
    if best is None:
        top = max(rank(a) for a in arms)
        major = [k for k, a in enumerate(arms) if rank(a) == top]
        minor = [k for k, a in enumerate(arms) if rank(a) < top]
    else:
        major = list(best[1])
        floor = best[0][0]
        others = [k for k in range(len(arms)) if k not in major]
        # a side road that outranks the road running through leaves it unclear who gives way
        if any(rank(arms[k]) > floor for k in others):
            return [], major
        minor = others
    # (one half of a dual carriageway parting from or joining the other is no side road; the map often
    # leaves one half unnamed)
    def merging(k):
        h, n = heads[k], streets[arms[k][0]].get("name")
        return any((not n or not streets[arms[j][0]].get("name") or streets[arms[j][0]].get("name") == n)
                   and math.degrees(math.acos(max(-1.0, min(1.0, h[0] * heads[j][0] + h[1] * heads[j][1])))) < MERGE
                   for j in major)
    return [k for k in minor if streets[arms[k][0]]["cls"] in GIVES_WAY and not merging(k)], major


def _across(arm, s, half):
    c = arm.interpolate(s)
    ux, uy = _dir(arm, s)
    return LineString([(c.x + uy * half, c.y - ux * half), (c.x - uy * half, c.y + ux * half)]), c, (ux, uy)


def _dashes(cut, c, step, out):
    """Dashes along `cut` (the line across the road, already kept to the carriageway), centred on the
    street's middle line so the two rows line up."""
    if cut.length < DASH:
        return
    (ax, ay), (bx, by) = cut.coords[0], cut.coords[-1]
    ux, uy = _unit(bx - ax, by - ay)
    t0 = (c.x - ax) * ux + (c.y - ay) * uy
    k0 = math.floor((0 - t0) / step) - 1
    k1 = math.ceil((cut.length - t0) / step) + 1
    for k in range(k0, k1 + 1):
        lo = max(0.0, t0 + k * step - DASH / 2)
        hi = min(cut.length, t0 + k * step + DASH / 2)
        if hi - lo >= DASH * 0.5:
            out.append(((ax + ux * lo, ay + uy * lo), (ax + ux * hi, ay + uy * hi)))


def _strip(at, street, arm):
    """The carriageway of one arm of the road with right of way, out from the junction."""
    half = street["half"](arm.interpolate(min(2.0, arm.length / 2)))
    return LineString(substring(arm, 0, min(30.0, arm.length)).coords).buffer(half, cap_style="flat").union(at.buffer(half))


def give_way_lines(streets, carriageway, nodes=None):
    """The dashes of every give-way line, as ((x0, y0), (x1, y1)) pairs, before they are kept to a square.
    Each lies square across the street that gives way, its first row just behind the line of the
    greater road's kerb (that road's carriageway edge run on across the mouth of the junction), and
    reaches across the lesser road's carriageway as drawn, short of its kerbs."""
    out = []
    for at, arms in nodes if nodes is not None else junctions(streets):
        minor, major = give_way_arms(streets, arms)
        if not minor:
            continue
        strip = unary_union([_strip(at, streets[arms[k][0]], arms[k][1]) for k in major])
        for k in minor:
            i, arm = arms[k]
            half = streets[i]["half"](arm.interpolate(min(3.0, arm.length / 2)))
            s = None
            t = 0.5
            while t < min(arm.length - 1.0, FURTHEST):
                seg, _, _ = _across(arm, t, half - KERB_IN)
                if not seg.intersects(strip):
                    s = t
                    break
                t += 0.1
            if s is None:
                continue
            rows = []
            for back in ROWS:
                seg, c, _ = _across(arm, s + back, half + 2.0)
                if carriageway is not None:
                    road = seg.intersection(carriageway)
                    pieces = [g for g in getattr(road, "geoms", [road]) if g.geom_type == "LineString" and g.distance(c) < 0.5]
                    if not pieces:
                        rows = []
                        break
                    piece = pieces[0]
                    # in from the kerb at each end, and no wider than the lesser road's own mouth
                    lo, hi = seg.project(Point(piece.coords[0])), seg.project(Point(piece.coords[-1]))
                    lo, hi = min(lo, hi), max(lo, hi)
                    mid = seg.project(c)
                    lo, hi = max(lo + KERB_IN, mid - half - 1.0), min(hi - KERB_IN, mid + half + 1.0)
                else:
                    mid = seg.project(c)
                    lo, hi = mid - half + KERB_IN, mid + half - KERB_IN
                if hi - lo < 1.5:
                    rows = []
                    break
                # and none of it out in the greater road, where the two part at a narrow angle
                cut = substring(seg, lo, hi).difference(strip)
                pieces = [g for g in getattr(cut, "geoms", [cut]) if g.geom_type == "LineString"]
                if not pieces:
                    rows = []
                    break
                cut = min(pieces, key=lambda g: g.distance(c))
                if cut.length < 1.5 or cut.distance(c) > 0.5:
                    rows = []
                    break
                rows.append((cut, c))
            for cut, c in rows:
                _dashes(cut, c, DASH + GAP, out)
    return out


def centre_dashes(streets, nodes, crossings=()):
    """The centre line's dashes down each street of a class that has one, clear of junctions and crossings."""
    near = [p for p, _ in nodes] + [Point(q) for q in crossings]
    clear = [CLEAR_OF_JUNCTION] * len(nodes) + [CLEAR_OF_CROSSING] * len(crossings)
    tree = STRtree(near) if near else None

    def blocked(p):
        if tree is None:
            return False
        return any(near[int(k)].distance(p) < clear[int(k)] for k in tree.query(p.buffer(CLEAR_OF_JUNCTION)))
    out = []
    for st in streets:
        if st["cls"] not in DASHED:
            continue
        line = st["line"]
        s = 4.0
        while s + CENTRE_DASH < line.length:
            a, b = line.interpolate(s), line.interpolate(s + CENTRE_DASH)
            if not blocked(a) and not blocked(b):
                out.append(((a.x, a.y), (b.x, b.y)))
            s += CENTRE_EVERY
    return out


def road_markings(streets, carriageway, ground, crossings=()):
    """`mk` for one square: the network's markings kept to `carriageway` (the square's drawn road), each
    piece at least long enough to see. `streets` are dicts of line, cls, name and half(point), the
    carriageway's half width where the street passes that point."""
    if carriageway is None or carriageway.is_empty or not streets:
        return []
    shapely.prepare(carriageway)
    nodes = junctions(streets)
    r = lambda v: round(float(v), 2)
    out = []
    for kind, marks, shortest in ((0, centre_dashes(streets, nodes, crossings), 0.5),
                                  (1, give_way_lines(streets, carriageway, nodes), 0.25)):
        for a, b in marks:
            seg = LineString([a, b])
            if not carriageway.intersects(seg):
                continue
            kept = seg.intersection(carriageway)
            for g in getattr(kept, "geoms", [kept]):
                if g.geom_type != "LineString" or g.length < shortest:
                    continue
                (x0, y0), (x1, y1) = g.coords[0], g.coords[-1]
                out.append([r(x0), r(y0), r(x1), r(y1), r(ground(x0, y0)), r(ground(x1, y1)), kind])
    return out
