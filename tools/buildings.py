"""Decide what each building in Combe Down probably looks like: how many storeys, its roof, its
walls and its chimneys.

The map data gives footprints, a class for some buildings, and (for about a quarter of them)
machine-learned heights from Microsoft that run low and noisy. Everything else is inferred:

- Attachment comes from the footprints themselves: buildings sharing a wall at least 2.5 m long
  are grouped. A group of one is detached, two is a semi-detached pair, three or more a terrace.
- Local character comes from what is known about the area (see the zones in area.py):
  * B&NES's Combe Down character appraisal (2018) and Bath Preservation Trust notes: the area is
    "primarily of two-storey terraced and semi-detached form"; the old village has Bath stone
    ashlar terraces (De Montalt Place, 1729, for Ralph Allen's quarrymen; Isabella Place, about
    1800; Oxford Terrace, "two-storey ... Bath stone ashlar with clay roof pantiles").
  * Foxhill: a post-war estate of about 900 homes on former MoD land.
  * Mulberry Park: the 2016+ redevelopment of the MoD site by Curo and HTA: cottage houses,
    family villas and apartment blocks, "predominantly brick with Bath Stone details".
- Terrace roofs run along the row (one continuous ridge), semis have a hipped outer end and a
  chimney stack on the party wall, detached houses get gabled or hipped roofs.

Around Royal Victoria Park, in Bath itself, almost everything is Bath stone, and OpenStreetMap
often gives a floor count (which there includes the basement and the attic):
- georgian: the upper town (Royal Crescent, Brock Street, the Circus, Marlborough Buildings, Gay
  Street, Queen's Parade, St James's Square, Norfolk Crescent). Three tall storeys over a
  basement, a parapet hiding a low slate roof, stacks on every party wall.
- victorian: the villas and terraces west and north of the park. Two or three storeys, slate,
  hipped semis.
- riverside: the Western Riverside flats of the 2010s by the Avon: four to six storeys, flat roofs.
- bath: everywhere else, a Bath stone mix of two and three storeys.

Outside Bath:
- london: inner London (Hackney): Victorian terraces of yellow London stock brick, some red brick
  or stucco, two or three storeys under slate, with big blocks of council flats between them.
- squares: London's Georgian squares and terraces (Clapton Square, Sutton Place): three tall
  storeys of stock brick or stucco, a parapet hiding the slate, railings to the street.

Cape Town (no lidar or certificates, so OpenStreetMap's floor counts and heights stand in):
- cbd: the city centre and the Foreshore: rendered office blocks and towers, flat roofs.
- bokaap: the Bo-Kaap and De Waterkant: terraces of one or two storeys painted in bright colours,
  flat roofs behind parapets, opening straight on to the pavement.
- cape: the rest of the City Bowl: rendered Victorian cottages and double-storey houses under
  corrugated iron, with blocks of flats between them.
"""
import math, random, warnings
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import Point
from shapely.strtree import STRtree

PITCH = math.tan(math.radians(37))   # typical British pitched roof
STEEPEST = math.tan(math.radians(50))   # the steepest roof the survey may give: Bath's steep mansards are drawn as plain gables


BATH = ("georgian", "victorian", "riverside", "bath")
CAPE = ("cbd", "bokaap", "cape")


def cape_eaves(kind, zone, floors, height, r):
    """Eaves height in Cape Town, where there is no lidar: OpenStreetMap's floor count or height
    where the data has one (the city centre's towers mostly do), a guess for the zone otherwise."""
    if floors: return floors * 3.4 + (0.6 if zone == "cbd" else 0.2)
    if height and height > 4: return height * (0.97 if zone == "cbd" or kind in ("flats", "institution") else 0.8)
    if zone == "cbd": return (3 + int(r * 5)) * 3.5
    if zone == "bokaap": return 3.8 if r < 0.55 else 6.6
    if kind == "flats": return (3 if r < 0.5 else 4 if r < 0.8 else 6) * 3.0
    if kind in ("institution", "shop"): return (2 if r < 0.5 else 3) * 3.6
    return 3.8 if r < 0.45 else 6.6        # a Victorian cottage, or a double-storey house


# metres floor to floor, for a floor count in the data: what Bath's lidar measures against
# Overture's counts (a house's eaves come out at about 2.8 m a floor, a big building's a little more)
STOREY = {"flats": 2.8, "institution": 3.2, "shop": 3.2}
STOREY_HOUSE = 2.8
FACADE = {"brick": "brick", "plaster": "render", "render": "render", "stone": "stone", "concrete": "render",
          "cement_block": "render", "timber_framing": "render", "wood": "render"}
ROOF_COVER = {"slate": "slate", "roof_tiles": "pantile", "tiles": "pantile", "metal": "grey", "concrete": "concrete"}
NEAR_K, NEAR_R, NEAR_SHARE = 7, 60.0, 0.6   # neighbours' certificates: how many, how far, how many must agree


def _hex(c):
    c = (c or "").strip().lower()
    return c if len(c) == 7 and c[0] == "#" and all(ch in "0123456789abcdef" for ch in c[1:]) else None


def _brick_of(colour):
    """Red or buff (stock) brick from a mapped facade colour, or None."""
    h = _hex(colour)
    if not h: return None
    r, g = int(h[1:3], 16), int(h[3:5], 16)
    return "brick" if r > 2.2 * max(1, g) else "buff"


def near_walls(polys, certs):
    """For each building without a certificate's wall, the wall most of the certified buildings
    round it have, or None. A street was built of one thing, so the neighbours' certificates are a
    better guess for a house with none than the area's mix: in Bath, held out, they name the wall
    of a certified house nine times in ten, where the area's mix names it seven."""
    if not certs: return [None] * len(polys)
    known = [i for i, c in enumerate(certs) if c and c["wall"]]
    if not known: return [None] * len(polys)
    from scipy.spatial import cKDTree
    pts = np.array([p.centroid.coords[0] for p in polys])
    tree = cKDTree(pts[known])
    out = []
    for i in range(len(polys)):
        if certs[i] and certs[i]["wall"]: out.append(None); continue
        d, j = tree.query(pts[i], k=NEAR_K, distance_upper_bound=NEAR_R)
        got = [certs[known[int(q)]]["wall"] for dd, q in zip(np.atleast_1d(d), np.atleast_1d(j)) if np.isfinite(dd)]
        best = max(sorted(set(got)), key=got.count) if got else None
        out.append(best if len(got) >= 3 and got.count(best) >= NEAR_SHARE * len(got) else None)
    return out


def zone_at(zones, x, y, default):
    for name, cx, cy, r in zones:
        if math.hypot(x - cx, y - cy) < r:
            return name
    return default


# ---- what the census and the conservation areas say (tools/census.py, tools/conservation.py) ----
FLAT_M2 = 75.0          # square metres of a block's floors to each flat, its share of the stairs and landings with it
FLATS_LEAST = 150.0     # square metres: a smaller footprint is a house (a town house divided into flats is still one)
NEAR_GAP = 3.0          # metres between two houses' footprints that may be one party wall the outlines drew apart
WHOLE_AREA = 480.0      # metres: an output area no wider than this is whole in every square that builds a house in it
CORE_REACH = 400.0      # metres round a building in an old core over which its old neighbours' walls are counted
CORE_KNOWN = 5          # the fewest of them with a known wall that say what the old core is built of
CORE_TALL = 8.0         # metres to the eaves: a town house of three storeys or more
# an old core's houses differ a little within their material, as weathering, cleaning and soot leave
# them, and some fronts are painted: white, cream or a pale colour
PAINTS = ("#f7f5ef", "#f7f5ef", "#f1e7cc", "#e8eedf", "#f3e1da", "#e0e8f0", "#f2ecc8")
CORE_SHADES = {"stone": ("#f2dfb2", "#e4d2a8", "#d8cdb6"), "buff": ("#f2efe8", "#cfcac0", "#a9a294"),
               "brick": ("#c0644a", "#a85a46", "#c98062"), "render": PAINTS}
CHURCH_CLASSES = ("church", "chapel", "cathedral")   # Overture's classes for a building built as a church


def built_as_church(osm, map_id):
    """A test of whether a building (a lon/lat outline and its Overture properties) was built as a
    church: Overture's class says so, or an OpenStreetMap building covering it and covered by it
    says so (tools/worship.py: its tags, or what Wikidata says of it), or its name does (but a terrace
    called Chapel Row is houses)."""
    from worship import churches, built_as_church as tagged, name_says_church
    known = churches(map_id)
    outlines = [g.buffer(0) for g, q in osm if g.geom_type in ("Polygon", "MultiPolygon") and tagged(q, known)]
    tree = STRtree(outlines)

    def test(g, p):
        if (p.get("class") or "") in CHURCH_CLASSES or name_says_church((p.get("names") or {}).get("primary")):
            return True
        if not outlines or g.geom_type not in ("Polygon", "MultiPolygon"):
            return False
        g = g.buffer(0)
        return any((a := outlines[int(k)].intersection(g).area) > 0.5 * g.area and a > 0.5 * outlines[int(k)].area
                   for k in tree.query(g))
    return test


HOME = {"", "residential", "apartments", "house", "detached", "semidetached_house", "terrace", "bungalow"}
HOUSE = {"house", "detached", "semidetached_house", "terrace", "bungalow"}


def _data_wall(p, cert):
    """What a building's own data says its walls are (its certificate, then its mapped facade), or None."""
    if cert and cert["wall"]: return cert["wall"]
    facade = FACADE.get(p.get("facade_material") or "")
    if facade == "brick": facade = _brick_of(p.get("facade_color")) or "brick"
    return facade


def _form(size):
    return 0 if size == 1 else 1 if size == 2 else 2


def surveyed_heights(polys, props, outlines):
    """The heights layer (a survey of each roof's highest point above the ground, in model metres:
    [(height, outline)]) onto the footprints: a footprint the surveyed roofs cover at least half of
    takes their height, the area-weighted median where it covers several, as its "height", marked
    "_surveyed" so it is believed over a floor count. Returns how many were given one."""
    if not outlines: return 0
    tree = STRtree([g for _, g in outlines])
    given = 0
    for poly, p in zip(polys, props):
        pieces = []
        for k in tree.query(poly):
            h, g = outlines[int(k)]
            a = poly.intersection(g).area
            if a > 0: pieces.append((h, a))
        if sum(a for _, a in pieces) < 0.5 * poly.area: continue
        pieces.sort()
        half, run = sum(a for _, a in pieces) / 2, 0.0
        for h, a in pieces:
            run += a
            if run >= half: break
        p["height"], p["_surveyed"] = h, True
        given += 1
    return given


def priors(polys, props, certs, keys, zones, default_zone, census, cores):
    """What the census and the conservation areas say of each footprint, for classify, as
    dict(flats=..., near=[...], core=..., walls=...) per footprint.

    census is [(households by TS044's types, outline)] per output area, cores the conservation
    areas' outlines, both in the map's metres. polys must be every footprint near the ones being
    built (a square's whole cut of the map), so each output area is seen whole and a house comes
    out the same from every square that builds it.

    - flats: True or False for a home in an output area, None elsewhere. Overture's class, a
      floor count that says a block, and certificates that say houses win; then the area's blocks
      of flats are its biggest homes, each taken that brings the share of its households in flats
      (a block's by its floor area, a house's one) nearer the census's share in purpose-built
      flats. A block that would hold far more than the census's flats is something else (a
      school, a works).
    - near: houses whose footprints stand within NEAR_GAP of this one's that are taken as sharing
      its wall, as the outlines often draw a pair of semis or a row apart: the closest first, for
      as long as that brings the area's detached, semi-detached and terraced households nearer the
      census's.
    - core: in a conservation area where the zones in area.py have nothing to say, the area's old
      core: walls is then how many of its other buildings within CORE_REACH the data gives each
      wall, or None where it gives too few.
    An output area wider than WHOLE_AREA can run past what a square sees: there the same is done
    a house at a time, by the area's shares and the house's own draw."""
    n = len(polys)
    out = [dict(flats=None, near=[], core=False, walls=None) for _ in range(n)]
    if not n or not (census or cores): return out
    certs = certs or [None] * n
    pts = np.array([p.centroid.coords[0] for p in polys])
    zone = [zone_at(zones, x, y, default_zone) for x, y in pts]
    draw = lambda i, salt: random.Random(keys[i] * 7907 + salt).random()

    if cores:
        ctree = STRtree(cores)
        inside = shapely.points(pts)
        in_core = np.zeros(n, bool)
        for a, _b in zip(*ctree.query(inside, predicate="within")): in_core[int(a)] = True
        wall = [_data_wall(p, c) if in_core[i] else None for i, (p, c) in enumerate(zip(props, certs))]
        known = [i for i in range(n) if wall[i]]
        if known:
            from scipy.spatial import cKDTree
            ktree = cKDTree(pts[known])
        for i in range(n):
            if not in_core[i] or zone[i] != default_zone: continue
            out[i]["core"] = True
            if not known: continue
            got = [wall[known[k]] for k in ktree.query_ball_point(pts[i], CORE_REACH) if known[k] != i]
            if len(got) >= CORE_KNOWN: out[i]["walls"] = {w: got.count(w) for w in sorted(set(got))}

    if not census: return out
    adj, comp = groups(polys)
    otree = STRtree([g for _, g in census])
    oa_of = np.full(n, -1)
    for a, b in zip(*otree.query(shapely.points(pts), predicate="within")): oa_of[int(a)] = int(b)
    have_certs = any(certs)
    homes = defaultdict(list)
    est = np.zeros(n)
    fixed = {}
    for i, (poly, p) in enumerate(zip(polys, props)):
        cls = p.get("class") or p.get("subtype") or ""
        if oa_of[i] < 0 or cls not in HOME or poly.area < 28 or p.get("_church"): continue
        floors, c = p.get("num_floors") or 0, certs[i]
        est[i] = max(1.0, poly.area * (floors or 3) / FLAT_M2, (c["n"] - c["houses"]) if c else 0)
        if (poly.area > 320 or (poly.area > 150 and floors >= 4)) and (cls == "apartments" or (floors >= 4 and zone[i] not in BATH)):
            fixed[i] = True
        elif cls in HOUSE or (c and c["houses"] * 2 > c["n"]):
            fixed[i] = False
        elif poly.area < FLATS_LEAST or (have_certs and not (c and c["n"] > c["houses"])):
            fixed[i] = False          # a house, or (where the certificates are known) no homes at all
        homes[int(oa_of[i])].append(i)

    for k, members in sorted(homes.items()):
        hh, outline = census[k]
        target = np.array(hh[:4], float)
        x0, y0, x1, y1 = outline.bounds
        whole = max(x1 - x0, y1 - y0) <= WHOLE_AREA
        flats = {i for i in members if fixed.get(i) is True}
        if whole:
            # the households in flats as a share of those in flats and houses (a house holding one),
            # as near the census's as the biggest homes can bring it
            want = target[3] / max(1.0, target.sum())
            have, houses = sum(est[i] for i in flats), len(members) - len(flats)
            share = lambda f, h: f / max(1.0, f + h)
            for i in sorted((i for i in members if i not in fixed), key=lambda i: (-polys[i].area, keys[i])):
                if est[i] > 2 * target[3] + 10: continue
                if abs(share(have + est[i], houses - 1) - want) < abs(share(have, houses) - want):
                    flats.add(i); have += est[i]; houses -= 1
        else:
            part = target[3] / max(1.0, sum(hh))
            flats |= {i for i in members if i not in fixed and polys[i].area >= 320 and draw(i, 1) < part}
        for i in members: out[i]["flats"] = i in flats

        houses = [i for i in members if i not in flats]
        tree = STRtree([polys[i] for i in houses]) if houses else None
        links = []
        for i in houses:
            for b in tree.query(polys[i].buffer(NEAR_GAP)):
                j = houses[int(b)]
                if j <= i or comp[i][0] == comp[j][0] or j in adj[i]: continue
                gap = polys[i].distance(polys[j])
                if gap > NEAR_GAP or max(polys[i].area, polys[j].area) > 2.5 * min(polys[i].area, polys[j].area): continue
                reach = gap / 2 + 0.35
                if _shared_wall(polys[i].buffer(reach), polys[j].buffer(reach)) is None: continue
                links.append((gap, min(keys[i], keys[j]), i, j))
        links.sort()
        if not whole:
            # two detached houses become a pair as often as the census has semis to detached
            semi = target[1] / max(1.0, target[0] + target[1])
            for gap, _, i, j in links:
                if comp[i][1] > 1 or comp[j][1] > 1 or out[i]["near"] or out[j]["near"]: continue
                if random.Random(min(keys[i], keys[j]) * 7907 + max(keys[i], keys[j])).random() < semi:
                    out[i]["near"].append(j); out[j]["near"].append(i)
            continue
        # the groups as the houses' outlines touch, joined as links are taken
        size = {comp[i][0]: comp[i][1] for i in houses}
        parent = {}
        def find(r):
            while parent.get(r, r) != r: r = parent[r]
            return r
        flat_hh = sum(est[i] for i in flats)
        def error(join=()):
            got = np.zeros(4)
            got[3] = flat_hh
            for i in houses:
                r = find(comp[i][0])
                got[_form(sum(size[q] for q in join) if r in join else size[r])] += 1
            if got.sum() <= 0 or target.sum() <= 0: return 0.0
            return float(np.abs(got / got.sum() - target / target.sum()).sum())
        now = error()
        for gap, _, i, j in links:
            ri, rj = find(comp[i][0]), find(comp[j][0])
            if ri == rj: continue
            then = error((ri, rj))
            if then < now - 1e-9:
                parent[rj] = ri; size[ri] += size[rj]; now = then
                out[i]["near"].append(j); out[j]["near"].append(i)
    return out


def _shared_wall(gi, gj):
    """The wall two grown footprints share, as (end, end, middle), or None if under 2.5 m long."""
    shared = gi.intersection(gj)
    if shared.is_empty or shared.area <= 0: return None
    q = list(shared.minimum_rotated_rectangle.exterior.coords)[:4]
    e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
    if max(e0, e1) < 2.5: return None
    a, b = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
    return a, b, shared.centroid.coords[0]


def groups(polys, wholes=None, joined=()):
    """Shared-wall neighbours of each footprint, and the wall segments they share. wholes, if
    given, is the original footprint each one was split from (roof_parts): a house's own
    extension is not its neighbour, so a detached house with a lean-to stays detached. joined
    are pairs of houses whose footprints stand a little apart where the houses really share a
    wall (see priors): each side's wall is on its own footprint, so its chimney stands on it."""
    tree = STRtree(polys)
    adj = defaultdict(dict)
    grown = [p.buffer(0.35) for p in polys]
    for i, p in enumerate(polys):
        for j in tree.query(grown[i]):
            j = int(j)
            if j <= i: continue
            if wholes is not None and wholes[i] is not None and wholes[i] is wholes[j]: continue
            wall = _shared_wall(grown[i], grown[j])
            if wall is None: continue
            adj[i][j] = wall
            adj[j][i] = wall
    for i, j in joined:
        if j in adj[i]: continue
        reach = polys[i].distance(polys[j]) / 2 + 0.35
        wall = _shared_wall(polys[i].buffer(reach), polys[j].buffer(reach))
        if wall is None: continue
        for k, l in ((i, j), (j, i)):
            ring = polys[k].exterior
            on = ring.interpolate(ring.project(Point(wall[2])))
            adj[k][l] = (wall[0], wall[1], (on.x, on.y))
    comp, seen = {}, set()
    for i in range(len(polys)):
        if i in seen: continue
        stack, members = [i], []
        while stack:
            k = stack.pop()
            if k in seen: continue
            seen.add(k); members.append(k); stack += list(adj[k])
        for k in members: comp[k] = (min(members), len(members))
    return adj, comp


ALIKE = 0.75       # joined houses whose outlines' sides are each at least this share of the other's are one design
HOUSE_M2 = (28.0, 320.0)
HIPPED = ("hipped", "pyramidal")
GABLED = ("gabled", "saltbox", "gambrel", "skillion")


def _sides(poly):
    q = list(poly.minimum_rotated_rectangle.exterior.coords)
    return sorted((math.dist(q[0], q[1]), math.dist(q[1], q[2])))


def rows(polys, adj, measured=None, shapes=None):
    """The roofs of rows of alike houses, where the survey can't give a house its own: houses
    joined by a party wall with outlines of much the same size were built together. A house keeps
    the ridge the survey fits to it wherever that fit is sure which way it runs (lidar.sure_way)
    and the roof works, with no hip against a party wall, and its hipped or gabled ends where the
    survey is sure of those too. The others take their row's: the ridge the way the sure ones in
    the row run (along the row if most don't face the street, or none is sure), and the row's free
    ends hipped or gabled as its sure houses are, or else as mapped. A footprint drawn off the
    survey's building reads both ways about as well, which turned ridges house by house along a
    row and hipped one half of a semi.
    shapes: the roof shape mapped for each house.
    Returns ({house: ridge direction}, {house: whether the row's free ends are hipped, or None,
    for each house without the survey's own},
    {house in a row: "survey" where it keeps the survey's roof, or why it takes the row's},
    {house in a row with surveyed pitched roofs: the middle of their rises, eaves to ridge})."""
    sides = [_sides(p) if HOUSE_M2[0] <= p.area <= HOUSE_M2[1] else None for p in polys]

    def alike(i, j):
        a, b = sides[i], sides[j]
        return bool(a and b) and all(min(x, y) >= ALIKE * max(x, y) for x, y in zip(a, b))

    def wall_dir(w):
        (ax, ay), (bx, by), _ = w
        l = math.hypot(bx - ax, by - ay) or 1
        return (bx - ax) / l, (by - ay) / l, l

    def hip_on_wall(k, m):
        """Whether the survey's roof hips an end of its ridge that meets a neighbour's wall."""
        if not any(m.get("hips") or ()): return False
        ux, uy = m["u"]
        rect, length, _ = oriented_rect(polys[k], ux, uy)
        for (ax, ay), (bx, by), (wx, wy) in adj[k].values():
            wl = math.hypot(bx - ax, by - ay) or 1
            if abs((bx - ax) * ux + (by - ay) * uy) / wl > 0.5: continue
            s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
            if (s_wall < length / 4 and m["hips"][0]) or (s_wall > length * 3 / 4 and m["hips"][1]): return True
        return False

    ridge, hipped, why, pitch, seen = {}, {}, {}, {}, set()
    for i in range(len(polys)):
        if i in seen or not sides[i]: continue
        members, stack = [], [i]
        while stack:
            k = stack.pop()
            if k in seen: continue
            seen.add(k); members.append(k)
            stack += [j for j in adj[k] if j not in seen and alike(k, j)]
        if len(members) < 2: continue
        fam = set(members)
        own = {k: max((wall_dir(w) for j, w in adj[k].items() if j in fam), key=lambda d: d[2]) for k in members}
        across = along = 0
        sure_ends, mapped_ends, guessed_ends, follow, own_way = [], [], [], [], []
        for k in members:
            m = measured[k] if measured else None
            end = sum(j in fam for j in adj[k]) == 1
            if m and m["flat"]: continue
            if m and m.get("sure") and not hip_on_wall(k, m):
                c = abs(m["u"][0] * own[k][0] + m["u"][1] * own[k][1])
                across += c > 0.7
                along += c < 0.3
                if m.get("sure_hips"):
                    if end: sure_ends.append(bool(m["hipped"]))
                else:
                    own_way.append(k)
                    if end: guessed_ends.append(bool(m["hipped"]))
                why[k] = "survey"
                continue
            follow.append(k)
            why[k] = "no survey" if not m else "survey hips a party wall" if m.get("sure") else "survey unsure"
            shape = shapes[k] if shapes else None
            if end and not m and shape in HIPPED + GABLED: mapped_ends.append(shape in HIPPED)
            elif end and m: guessed_ends.append(bool(m["hipped"]))
        turn = across > 0 and across * 3 >= (across + along) * 2
        ends = sure_ends or mapped_ends or guessed_ends
        for k in follow + own_way:
            if k in follow:
                wx, wy, _ = own[k]
                ridge[k] = (wx, wy) if turn else (-wy, wx)
            hipped[k] = sum(ends) * 2 >= len(ends) if ends else None
        # a row was built to one pitch, which a house with a box dormer the width of it shares on
        # its slope to the street. A level top (a box dormer, a flat roof) says nothing of the pitch
        rises = [measured[k]["ridge"] - max(2.2, measured[k]["eaves"]) for k in members
                 if measured and measured[k] and not measured[k]["flat"] and not measured[k].get("level")]
        if len(rises) >= 2:
            for k in members: pitch[k] = float(np.median(rises))
    return ridge, hipped, why, pitch


def oriented_rect(poly, ux, uy):
    """Bounding rectangle of poly aligned to unit vector u: corners q0..q3 with q0->q1 along u."""
    vx, vy = -uy, ux
    pts = np.array(poly.exterior.coords)
    su, sv = pts @ [ux, uy], pts @ [vx, vy]
    a, b, c, d = su.min(), su.max(), sv.min(), sv.max()
    P = lambda s, t: (s * ux + t * vx, s * uy + t * vy)
    return [P(a, c), P(b, c), P(b, d), P(a, d)], b - a, d - c


def core_rect(poly, ux, uy, cut=0.1):
    """Like oriented_rect, but around the main body of an L-shaped or irregular footprint: wings,
    porches and towers that hold less than cut of the floor area at either side are left out, so
    the roof doesn't overhang the gaps between them."""
    vx, vy = -uy, ux
    x0, y0, x1, y1 = poly.bounds
    gx, gy = np.meshgrid(np.arange(x0 + 0.25, x1, 0.5), np.arange(y0 + 0.25, y1, 0.5))
    gx, gy = gx.ravel(), gy.ravel()
    keep = shapely.contains_xy(poly, gx, gy)
    if keep.sum() < 20: return oriented_rect(poly, ux, uy)
    gx, gy = gx[keep], gy[keep]
    su, sv = gx * ux + gy * uy, gx * vx + gy * vy
    a, b = np.percentile(su, [100 * cut, 100 * (1 - cut)])
    c, d = np.percentile(sv, [100 * cut, 100 * (1 - cut)])
    # the percentiles shave the ends of a plain rectangle too: give back what was shaved
    a, b = a - (b - a) * cut / (1 - 2 * cut), b + (b - a) * cut / (1 - 2 * cut)
    c, d = c - (d - c) * cut / (1 - 2 * cut), d + (d - c) * cut / (1 - 2 * cut)
    P = lambda s, t: (s * ux + t * vx, s * uy + t * vy)
    return [P(a, c), P(b, c), P(b, d), P(a, d)], b - a, d - c


def _largest_rect(mask):
    """Largest all-True rectangle in a 2D boolean array: (area, row0, row1, col0, col1), rows and
    columns inclusive at the start and exclusive at the end."""
    best = (0, 0, 0, 0, 0)
    h = np.zeros(mask.shape[1], dtype=int)
    for r in range(mask.shape[0]):
        h = np.where(mask[r], h + 1, 0)
        stack = []
        for c in range(len(h) + 1):
            cur = h[c] if c < len(h) else 0
            start = c
            while stack and stack[-1][1] >= cur:
                start, height = stack.pop()
                a = height * (c - start)
                if a > best[0]: best = (a, r - height + 1, r + 1, start, c)
            stack.append((start, cur))
    return best


STEP = 1.5        # a jump in roof height bigger than this between neighbouring metres is a wall
MIN_PART = 30     # square metres: the smallest part of a building kept apart from the rest
LEVEL_GAP = 2.0   # parts whose roofs stand closer together in height than this are one part


def _axes(poly):
    """Unit vectors along the longer side of poly's minimum rotated rectangle, and across it."""
    q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
    (ax, ay), (bx, by) = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
    l = math.hypot(bx - ax, by - ay) or 1
    ux, uy = (bx - ax) / l, (by - ay) / l
    return ux, uy, -uy, ux


ROW_TO_SIDE = math.radians(25)   # a row's ridge this near one of a house's own sides runs along that side


def own_side(poly, ux, uy):
    """The side of the house's own rectangle that a row's ridge direction (ux, uy) is nearest, so a
    house whose party wall is a little off square to it is still roofed over its own walls; the
    row's way itself if neither side is near it."""
    ax, ay, bx, by = _axes(poly)
    best = max(((ax, ay), (bx, by)), key=lambda a: abs(a[0] * ux + a[1] * uy))
    dot = best[0] * ux + best[1] * uy
    if abs(dot) < math.cos(ROW_TO_SIDE):
        return ux, uy
    return (best[0], best[1]) if dot > 0 else (-best[0], -best[1])


def _scraps_to(parts, poly):
    """Give each bit of poly that no part covers to the part it shares most wall with."""
    rest = poly.difference(shapely.unary_union(parts))
    for scrap in getattr(rest, "geoms", [rest]):
        if scrap.is_empty or scrap.area < 0.01: continue
        k = max(range(len(parts)), key=lambda i: parts[i].buffer(0.05).intersection(scrap.buffer(0.05)).area)
        parts[k] = parts[k].union(scrap.buffer(0.02, join_style=2))
    out = []
    for p in parts:
        p = p.simplify(0.3).buffer(0)
        geoms = [g for g in getattr(p, "geoms", [p]) if g.geom_type == "Polygon" and g.area > 1]
        if geoms: out.append(max(geoms, key=lambda g: g.area))
    # the map stores corners to 0.1 m: a split that would cross itself once rounded isn't worth it
    rounded = [shapely.Polygon([(round(x, 1), round(y, 1)) for x, y in w.exterior.coords]) for w in out]
    if len(out) < 2 or not all(w.is_valid for w in rounded): return [poly]
    return out


def roof_parts(poly, surface, ground):
    """Split a footprint where the survey shows its roofs at different levels: a mansion between
    lower links and wings, a house with a single-storey extension, a tower on a block of flats.
    surface(xs, ys) and ground(xs, ys) are the surveyed roof-or-ground and bare ground heights
    at points. The roof is sampled every metre; neighbouring metres belong to the same part
    unless the roof jumps by more than STEP between them (a pitched roof rises more gently than
    that, a wall between two levels doesn't). Parts smaller than MIN_PART join the neighbour they
    share most edge with, parts whose roofs differ by less than LEVEL_GAP are joined, and
    whatever the survey shows as open ground goes to the nearest part. Returns [poly] when the
    roof is all one level."""
    ux, uy, vx, vy = _axes(poly)
    pts = np.array(poly.exterior.coords)
    s0, t0 = (pts @ [ux, uy]).min(), (pts @ [vx, vy]).min()
    s1, t1 = (pts @ [ux, uy]).max(), (pts @ [vx, vy]).max()
    S, T = np.meshgrid(np.arange(s0 + 0.5, s1, 1.0), np.arange(t0 + 0.5, t1, 1.0))
    X, Y = S * ux + T * vx, S * uy + T * vy
    inside = shapely.contains_xy(poly, X, Y)
    if inside.sum() < 2 * MIN_PART: return [poly]
    z = np.full(X.shape, np.nan)
    z[inside] = surface(X[inside], Y[inside])
    g = np.full(X.shape, np.nan)
    g[inside] = ground(X[inside], Y[inside])
    roof = inside & (z - g >= 1.8)
    if roof.sum() < 2 * MIN_PART: return [poly]
    # a 3 x 3 median takes out chimneys, aerials and single noisy returns
    Z = np.where(roof, z, np.nan)
    pad = np.pad(Z, 1, constant_values=np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")      # all-nan windows outside the roof
        Z = np.nanmedian(np.stack([pad[1 + dj:1 + dj + Z.shape[0], 1 + di:1 + di + Z.shape[1]]
                                   for dj in (-1, 0, 1) for di in (-1, 0, 1)]), axis=0)
    Z[~roof] = np.nan

    # connected parts of the roof with no wall-sized jump inside them
    h, w = Z.shape
    parent = np.arange(h * w)
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for (dj, di) in ((0, 1), (1, 0)):
        A, B = Z[:h - dj, :w - di], Z[dj:, di:]
        ok = roof[:h - dj, :w - di] & roof[dj:, di:] & (np.abs(A - B) <= STEP)
        for j, i in zip(*np.nonzero(ok)):
            a, b = find(j * w + i), find((j + dj) * w + i + di)
            if a != b: parent[max(a, b)] = min(a, b)
    lab = np.full(h * w, -1)
    flat = np.flatnonzero(roof.ravel())
    lab[flat] = [find(i) for i in flat]
    lab = lab.reshape(h, w)

    # join small parts and parts at much the same level into their neighbours
    while True:
        ids, sizes = np.unique(lab[lab >= 0], return_counts=True)
        if len(ids) < 2: return [poly]
        size = dict(zip(ids, sizes))
        level = {k: float(np.median(Z[lab == k])) for k in ids}
        border = defaultdict(int)
        for (dj, di) in ((0, 1), (1, 0)):
            A, B = lab[:h - dj, :w - di], lab[dj:, di:]
            m = (A >= 0) & (B >= 0) & (A != B)
            for a, b in zip(A[m], B[m]): border[(min(a, b), max(a, b))] += 1
        nb = defaultdict(dict)
        for (a, b), n in border.items(): nb[a][b] = nb[b][a] = n
        merge = None
        for k in sorted(ids, key=lambda k: size[k]):
            if size[k] < MIN_PART:
                merge = (k, max(nb[k], key=nb[k].get)) if nb[k] else (k, None)
                break
        if merge is None:
            close = [(abs(level[a] - level[b]), a, b) for (a, b) in border if abs(level[a] - level[b]) < LEVEL_GAP]
            if close: merge = min(close)[1:]
        if merge is None: break
        a, b = merge
        lab[lab == a] = -1 if b is None else b

    # open ground inside the footprint (a yard, a glass roof the survey saw through) and dropped
    # specks go to the nearest part
    for _ in range(max(h, w)):
        todo = inside & (lab < 0)
        if not todo.any(): break
        pad = np.pad(lab, 1, constant_values=-1)
        for dj, di in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nbr = pad[1 + dj:1 + dj + h, 1 + di:1 + di + w]
            take = todo & (lab < 0) & (nbr >= 0)
            lab[take] = nbr[take]
    if len(np.unique(lab[lab >= 0])) < 2: return [poly]

    from rasterio.features import shapes
    from rasterio.transform import Affine
    P = lambda s_, t_: (s_ * ux + t_ * vx, s_ * uy + t_ * vy)
    regions = defaultdict(list)
    for geom, k in shapes(lab.astype(np.int32), mask=lab >= 0, transform=Affine(1, 0, s0, 0, 1, t0)):
        regions[int(k)].append(shapely.Polygon([P(s_, t_) for s_, t_ in geom["coordinates"][0]]).buffer(0))
    parts = [poly.intersection(shapely.unary_union(r)) for r in regions.values()]
    parts = [p for p in parts if not p.is_empty]
    if len(parts) < 2: return [poly]
    squared = _scraps_to(_squared(list(parts), poly, (ux, uy)), poly)
    return squared if len(squared) > 1 else _scraps_to(parts, poly)


def _squared(parts, poly, axis):
    """The survey's parts have metre-square edges along the building's overall axis, which go
    astray where a long building bends: there a raised block (a tower in a wing) comes out as a
    staircase across the wing. Each part but the biggest is squared to the walls around it
    instead: the rectangle round it along those walls, cut to the footprint. A part that only
    loosely fills that rectangle, or whose walls run along the axis anyway, is left alone."""
    big = max(range(len(parts)), key=lambda i: parts[i].area)
    ring = list(poly.exterior.coords)
    done = []
    for i in sorted(range(len(parts)), key=lambda i: parts[i].area):
        p = parts[i]
        if i == big or p.is_empty or p.area < MIN_PART: continue
        # the walls' direction near the part, from the edges within 2 m of it, or further off for
        # a part in the middle of a wing (angles taken four times over, so walls at right angles
        # to each other agree)
        for reach in (2.0, 6.0, 12.0):
            near, c4, s4 = p.buffer(reach), 0.0, 0.0
            for a, b in zip(ring, ring[1:]):
                l = shapely.LineString([a, b]).intersection(near).length
                if l < 0.5: continue
                th = math.atan2(b[1] - a[1], b[0] - a[0])
                c4, s4 = c4 + l * math.cos(4 * th), s4 + l * math.sin(4 * th)
            if math.hypot(c4, s4) >= 2: break
        else: continue
        th = math.atan2(s4, c4) / 4
        off = abs((th - math.atan2(axis[1], axis[0]) + math.pi / 4) % (math.pi / 2) - math.pi / 4)
        if off < math.radians(5): continue
        ux, uy = math.cos(th), math.sin(th)
        pts = shapely.get_coordinates(p)
        s_, t_ = pts @ [ux, uy], pts @ [-uy, ux]
        P = lambda a, b: (a * ux - b * uy, a * uy + b * ux)
        R = shapely.Polygon([P(s_.min(), t_.min()), P(s_.max(), t_.min()), P(s_.max(), t_.max()), P(s_.min(), t_.max())])
        if p.area < 0.6 * R.area: continue
        q = poly.intersection(R)
        for d in done: q = q.difference(parts[d])
        if q.is_empty: continue
        parts[i] = q
        # what's left of the others, less any slivers along the new walls (they go to whichever
        # part they share most wall with)
        for j in range(len(parts)):
            if j != i and j not in done:
                parts[j] = parts[j].difference(q).buffer(-0.4, join_style=2).buffer(0.4, join_style=2)
        done.append(i)
    return [p for p in parts if not p.is_empty]


def wings(poly, min_w=5.0, max_parts=24):
    """Split an L-, U- or otherwise irregular footprint into rectangular wings, so each can have
    a roof of its own: the largest rectangles (at least min_w metres each way) along the
    building's own axes, with any scraps left over joined to the wing they share most wall with.
    Returns [poly] when it doesn't split."""
    ux, uy, vx, vy = _axes(poly)
    pts = np.array(poly.exterior.coords)
    s0, t0 = (pts @ [ux, uy]).min(), (pts @ [vx, vy]).min()
    s1, t1 = (pts @ [ux, uy]).max(), (pts @ [vx, vy]).max()
    S, T = np.meshgrid(np.arange(s0 + 0.5, s1, 1.0), np.arange(t0 + 0.5, t1, 1.0))
    X, Y = S * ux + T * vx, S * uy + T * vy
    mask = shapely.contains_xy(poly, X, Y)
    rects = []
    P = lambda s_, t_: (s_ * ux + t_ * vx, s_ * uy + t_ * vy)
    while len(rects) < max_parts:
        a, r0, r1, c0, c1 = _largest_rect(mask)
        if r1 - r0 < min_w or c1 - c0 < min_w: break
        mask[r0:r1, c0:c1] = False
        sa, sb, ta, tb = s0 + c0, s0 + c1, t0 + r0, t0 + r1
        rects.append(shapely.Polygon([P(sa, ta), P(sb, ta), P(sb, tb), P(sa, tb)]))
    if len(rects) < 2: return [poly]
    return _scraps_to([poly.intersection(r.buffer(0.01, join_style=2)) for r in rects], poly)


def classify(polys, props, rnd: random.Random, zones, default_zone="suburb", measured=None, certs=None, keys=None):
    """Return one dict of building attributes per footprint (same order as polys).

    keys, if given, has a whole number per footprint worked out from where it stands: the random
    draws then come from it instead of from rnd and the order of the list, so a building comes
    out the same whichever tile of the map it is built with (tools/prep_tiles.py).

    measured, if given, has one lidar measurement (see lidar.py) or None per footprint: where
    there is one, the real eaves height and roof shape replace the guesses below. certs, if
    given, has what the energy certificates of the homes in each footprint say (see epc.py) or
    None: their wall material, and whether they are bungalows, replace the guesses too.

    A footprint's props may carry "_prior", what priors says of it (the census and the
    conservation areas), and "_fid", which footprint of the map it is, for the houses priors
    takes as sharing a wall ("near")."""
    whole = {p["_fid"]: i for i, p in enumerate(props) if "_fid" in p and p.get("_whole_geom") is None}
    joined = sorted({(min(i, whole[f]), max(i, whole[f])) for i, p in enumerate(props) if p.get("_whole_geom") is None
                     for f in (p.get("_prior") or {}).get("near", ()) if f in whole})
    adj, comp = groups(polys, [p.get("_whole_geom") for p in props], joined)
    apart = set(joined)
    row_ridge, row_hipped, row_why, row_pitch = rows(polys, adj, measured, [p.get("roof_shape") for p in props])
    near_wall = near_walls(polys, certs)
    # (the mapped facades count as well, for where an old core's fronts are painted)
    near_data = near_walls(polys, [{"wall": w} if (w := _data_wall(p, c)) else None for p, c in zip(props, certs or [None] * len(props))])
    # the parts one building was split into (where its roof levels change, or its wings) are no
    # neighbours of each other, but they are one building: one draw of materials for them all and
    # for any row they stand in, so a school's wings don't come out one in slate and one in tiles
    lead = {}
    def top(r):
        while lead.get(r, r) != r: r = lead[r]
        return r
    by_whole = {}
    for i, p in enumerate(props):
        w = p.get("_whole_geom")
        if w is None: continue
        a, b = top(comp[i][0]), top(comp[by_whole.setdefault(id(w), i)][0])
        if a != b: lead[max(a, b)] = min(a, b)
    mat = [top(comp[i][0]) for i in range(len(polys))]
    out = []
    cluster_seed = {}
    group_key = {}
    if keys is not None:
        for i in range(len(polys)):
            group_key[mat[i]] = min(group_key.get(mat[i], keys[i]), keys[i])
    for i, (poly, p) in enumerate(zip(polys, props)):
        cls = p.get("class") or p.get("subtype") or ""
        ml = p.get("height")
        cx, cy = poly.centroid.coords[0]
        zone = zone_at(zones, cx, cy, default_zone)
        floors = p.get("num_floors") or 0
        root, size = comp[i]
        area = p.get("_whole") or poly.area      # a wing of a big building is classed as the whole building
        # one random draw per group, so a whole terrace shares its height and materials (a draw
        # for each house from the group's stream gave every house of a row its own roof)
        if mat[i] not in cluster_seed:
            cluster_seed[mat[i]] = random.Random((group_key[mat[i]] if keys is not None else mat[i]) * 7919 + 17).random()
        r_group = cluster_seed[mat[i]]
        r_self = random.Random(keys[i] * 31 + 3).random() if keys is not None else rnd.random()
        prior = p.get("_prior") or {}
        core_wall = core_shade = None
        flats = prior.get("flats")          # what the census says, where it says anything
        core = bool(prior.get("core"))

        # ---- what kind of building ----
        if p.get("_church") or cls in CHURCH_CLASSES:
            kind = "church"
        elif cls in ("school", "kindergarten", "hospital", "university") or (area > 700 and not flats):
            kind = "institution"
        elif cls in ("garage", "garages", "shed", "hut", "roof") or area < 28:
            kind = "outbuilding"
        elif cls in ("retail", "commercial", "office", "kiosk") and size == 1:
            kind = "shop"
        elif flats:
            kind = "flats"
        elif flats is None and area > 320 and zone in ("mulberry", "riverside", "london", "cbd", "cape"):
            kind = "flats"
        elif flats is None and (area > 320 or (area > 150 and floors >= 4)) and (cls == "apartments" or (floors >= 4 and zone not in BATH)):
            kind = "flats"        # a block of flats by the data, in any area
        elif area > 420:
            kind = "institution"
        elif size >= 3:
            kind = "terrace"
        elif size == 2:
            kind = "semi"
        else:
            kind = "detached"

        # ---- storeys and eaves height ----
        tall = 0          # storeys, for buildings whose storeys are taller than usual (windows follow them)
        if kind == "outbuilding":
            eaves = 2.4 + r_self * 0.4
        elif kind == "church":
            eaves = 8.5
            tall = 1      # one row of tall windows, not a house's storeys
        elif zone in CAPE:
            eaves = cape_eaves(kind, zone, 0 if p.get("_surveyed") else floors, ml, r_group)
        elif kind == "institution" and zone in BATH and floors:
            tall = max(2, floors)
            eaves = tall * 3.5
        elif kind == "institution":
            storeys = 3 if (ml and ml > 7) or area > 1200 else 2
            eaves = storeys * 3.4
        elif kind == "flats" and zone == "riverside":
            eaves = (floors or (4 if r_group < 0.4 else 5 if r_group < 0.8 else 6)) * 3.0
        elif kind == "flats" and zone == "london":
            eaves = (4 if r_group < 0.4 else 5 if r_group < 0.75 else 8) * 2.8
        elif kind == "flats":
            eaves = (3 if r_group < 0.45 else 4) * 2.9
        elif kind == "shop" and zone in BATH:
            eaves = max(2, floors - 1 if floors >= 4 else floors or 3) * 3.2   # shops on the ground floor of town houses
        elif kind == "shop":
            eaves = 5.6
        elif zone in BATH:
            if zone == "georgian":
                tall = min(4, max(2, floors or 3))
                eaves = tall * 3.5 + 0.8 + r_group * 0.5   # tall Georgian rooms over a raised ground floor
            elif zone == "victorian":
                eaves = (floors or (3 if r_group < 0.35 else 2)) * 3.0 + 0.4
            elif zone == "riverside":
                eaves = (floors or 3) * 2.9
            else:
                eaves = (floors or (3 if kind == "terrace" and r_group < 0.5 else 2)) * 3.1 + 0.3
            if kind == "detached" and ml and ml < 3.3 and area > 45 and not floors:
                eaves = 2.7                           # a bungalow
        else:
            if zone == "village":
                storeys = 2
                eaves = 6.0 + r_group * 0.6          # Georgian and Victorian rooms are tall
            elif zone == "mulberry":
                storeys = 3 if r_group < 0.3 else 2
                eaves = storeys * 2.75
            elif zone == "london":
                storeys = 3 if r_group < 0.4 else 2
                eaves = storeys * 3.0 + 0.3
            elif zone == "squares":
                tall = 3
                eaves = tall * 3.3 + 0.6
            else:
                storeys = 2
                eaves = 5.2 + r_group * 0.4
            # Microsoft heights run low, but a very low one on a detached house means a bungalow
            if kind == "detached" and ml and ml < 3.3 and area > 45 and zone != "village":
                eaves = 2.7
            elif ml and ml > 8.5 and kind != "terrace":
                eaves = max(eaves, 8.4)

        # ---- the data's floor count or height, where there is no survey: in Bath, held out against
        # the lidar, they beat the area's guesses (median error 0.98 m against 1.13 m)
        m = measured[i] if measured else None
        if not m and zone not in CAPE and kind not in ("outbuilding", "church"):
            if p.get("_surveyed"): eaves = max(2.2, ml * (0.97 if kind in ("flats", "institution", "shop") else 0.8))
            elif floors: eaves = floors * STOREY.get(kind, STOREY_HOUSE) + 0.2
            elif ml and ml > 2.5: eaves = ml
            if tall: tall = max(1, round((eaves - 0.8) / 3.5))
        if cls == "bungalow" and kind not in ("outbuilding", "church", "institution"):
            tall = 1
            if not m: eaves = min(eaves, 2.6)

        # ---- real heights from lidar, where the survey has the building ----
        if m:
            eaves = max(2.2, m["eaves"])
            if tall and kind != "church": tall = max(1, round((eaves - 0.8) / 3.5))

        # ---- walls ----
        if zone in ("village", "georgian", "victorian") or kind == "church":
            wall = "stone"
        elif zone == "riverside":
            wall = "stone" if r_group < 0.6 else "buff" if r_group < 0.85 else "render"
        elif zone == "bath":
            wall = "stone" if r_group < 0.92 else "render"
        elif zone == "mulberry":
            wall = "brick" if r_group < 0.6 else "buff" if r_group < 0.85 else "stone"
        elif zone == "london":
            wall = "buff" if r_group < 0.6 else "brick" if r_group < 0.85 else "render"
        elif zone == "squares":
            wall = "buff" if r_group < 0.8 else "render"
        elif zone == "foxhill":
            wall = "render" if r_group < 0.55 else "brick" if r_group < 0.85 else "stone"
        elif zone == "cbd":
            wall = "render" if r_group < 0.6 else "buff" if r_group < 0.8 else "stone"
        elif zone == "bokaap":
            wall = "paint" if area < 260 and kind in ("terrace", "semi", "detached", "shop") else "render"   # the houses, not the blocks on the city side
        elif zone == "cape":
            wall = "render" if r_group < 0.85 else "brick"
        elif kind in ("institution", "shop") and zone == "suburb":
            # big old buildings here (Prior Park, the schools) are Bath stone
            wall = "stone" if r_group < 0.7 or area > 1500 else "render"
        elif zone == "suburb":
            wall = "stone" if r_group < 0.55 else "render" if r_group < 0.85 else "brick"
        else:
            wall = "render" if r_group < 0.45 else "brick" if r_group < 0.9 else "stone"   # an area no table knows
        if prior.get("walls") and kind in ("terrace", "semi", "detached", "shop"):
            # an old core's houses and shops are built of what most of its buildings are, as the data
            # gives them: held out, this names a certified wall in Bath's conservation areas 95 times
            # in 100, where the zone's mix named it 91, and a mapped facade in Hackney's 91 times
            # where it named 80 (its blocks of flats are of their own time, and keep the zone's mix)
            mix = prior["walls"]
            wall = max(sorted(mix), key=mix.get)
            r_core = random.Random(keys[i] * 613 + 29).random() if keys is not None else rnd.random()
            # a front is painted where most of the mapped facades and certificates round it say
            # rendered. Painting a share of the rest at the old core's own rate, at random, named a
            # mapped facade in Hackney's conservation areas 89 times in 100 where this names it 91
            if near_data[i] == "render": wall = "render"
            shades = CORE_SHADES.get(wall)
            core_shade, core_wall = shades[int(r_core * 977) % len(shades)] if shades else None, wall
        if near_wall[i]: wall = near_wall[i]
        facade = FACADE.get(p.get("facade_material") or "")
        if facade == "brick": facade = _brick_of(p.get("facade_color")) or ("buff" if wall == "buff" else "brick")
        if facade: wall = facade
        cert = certs[i] if certs else None
        if cert and cert["wall"]:
            wall = cert["wall"]
        if cert and cert["bungalow"] and kind not in ("outbuilding", "church", "institution"):
            tall = 1
            if not m: eaves = min(eaves, 2.6)

        # ---- roof ----
        roof = None
        if kind not in ("outbuilding",) and not (kind == "institution" and poly.area > 900 and not (m and not m["flat"])):
            # ridge direction: along the row for attached houses, along the long side otherwise
            walls = list(adj[i].values())
            # (the survey's hips stand where houses taken as sharing a wall really stand apart)
            touching = [w for j, w in adj[i].items() if (min(i, j), max(i, j)) not in apart]
            if i in row_ridge:
                ux, uy = own_side(poly, *row_ridge[i])
            elif m:
                ux, uy = m["u"]                         # the ridge as surveyed
            elif walls:
                (ax, ay), (bx, by), _ = walls[0]
                wl = math.hypot(bx - ax, by - ay) or 1
                ux, uy = -(by - ay) / wl, (bx - ax) / wl     # perpendicular to the party wall
            else:
                q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
                e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
                (ax, ay), (bx, by) = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
                l = math.hypot(bx - ax, by - ay) or 1
                ux, uy = (bx - ax) / l, (by - ay) / l
            rect, length, depth = oriented_rect(poly, ux, uy)
            fill = poly.area / max(1e-6, length * depth)
            # an L-, T- or cross-shaped footprint (a church with transepts) still gets its roof: the
            # game shrinks it to the biggest rectangle that stands on the walls and caps the rest flat
            if fill < 0.9:
                rect, length, depth = core_rect(poly, ux, uy)
            shape = None if m else p.get("roof_shape")      # the mapped shape, where there is no survey
            box = bool(m and m.get("level") and i in row_pitch and depth > 3 and kind in ("terrace", "semi")
                       and m["ridge"] - row_pitch[i] >= 2.2)
            if box:
                # a level top in a row of pitched roofs: a box dormer the width of the house, at the
                # survey's top, behind the row's slope to the street (tools/prep_map.py finds which
                # side that is). Its walls stand where the row's pitch from that top puts them
                eaves = m["ridge"] - row_pitch[i]
                if tall: tall = max(1, round((eaves - 0.8) / 3.5))
                roof = dict(rect=rect, rise=row_pitch[i], hips=(0.0, 0.0), u=(ux, uy), box=True)
            elif (zone == "riverside" and kind == "flats") or (m and m["flat"]) or zone in ("cbd", "bokaap") \
                    or (zone == "cape" and kind in ("flats", "institution", "shop")) or shape == "flat":
                pass                                    # flat roofs
            elif m and depth > 3:
                hip0 = hip1 = 0.0
                half = min(depth / 2, length / 2)
                same = m["u"][0] * ux + m["u"][1] * uy
                if "hips" in m and abs(same) > 0.7:
                    # as fitted to the survey (only when the fit succeeded): rect[0] is at the
                    # start of the ridge, along u
                    hip0, hip1 = (half if h else 0.0 for h in m["hips"][::1 if same > 0 else -1])
                elif m["hipped"]:
                    hip0 = hip1 = half
                if i in row_hipped:
                    if row_hipped[i] is not None: hip0 = hip1 = half if row_hipped[i] else 0.0
                    touching = walls
                if (hip0 or hip1) and kind == "semi" and touching and i not in row_hipped:
                    # only the outer end is hipped: the other is the party wall, whatever the
                    # survey's fit made of the neighbour's roof running on past it
                    _, _, (wx, wy) = touching[0]
                    s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                    if s_wall > length / 2: hip1 = 0.0
                    else: hip0 = 0.0
                elif hip0 or hip1:
                    # the same in a terrace or a row of shops: no hip at an end that meets a
                    # neighbour's wall, so a middle house's roof runs on into the next one's.
                    # Only walls across the ridge count, near an end of it
                    for (ax, ay), (bx, by), (wx, wy) in touching:
                        wl = math.hypot(bx - ax, by - ay) or 1
                        if abs((bx - ax) * ux + (by - ay) * uy) / wl > 0.5: continue
                        s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                        if s_wall < length / 4: hip0 = 0.0
                        elif s_wall > length * 3 / 4: hip1 = 0.0
                rise = min(8.0, max(0.8, m["ridge"] - eaves))
                # on a narrow house the survey's ridge and eaves can give a roof far too steep (a
                # back yard or a lower roof behind drags the eaves down, or the top of a mansard is
                # taken for the ridge), which leans out over the street. The ridge stays where the
                # survey has it, and the walls go up to meet a roof no steeper than STEEPEST
                steep = max(0.8, depth / 2 * STEEPEST)
                if rise > steep:
                    eaves += rise - steep
                    rise = steep
                    if tall and kind != "church": tall = max(1, round((eaves - 0.8) / 3.5))
                roof = dict(rect=rect, rise=rise, hips=(hip0, hip1), u=(ux, uy),
                            sure_ends=bool(m.get("sure_hips")) and i not in row_hipped)
            elif depth > 3:
                rise = min(depth / 2 * PITCH, 5.5 if kind == "church" else 3.0 if zone == "georgian" else 4.2)
                if kind == "church": rise = depth / 2 * 1.2
                hip0 = hip1 = 0.0
                half = min(depth / 2, length / 2)
                if shape in HIPPED: hip0 = hip1 = half
                elif shape in GABLED: pass
                elif zone in ("georgian", "squares") or (core and kind in ("terrace", "semi") and eaves >= CORE_TALL): pass   # behind a parapet: plain gables
                elif kind == "detached":
                    if zone == "village" or r_self < 0.45: pass                 # gabled
                    else: hip0 = hip1 = half                                    # hipped
                elif kind == "semi" and zone != "village" and r_group < 0.7:
                    # hip the outer end, away from the party wall
                    _, _, (wx, wy) = walls[0]
                    s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                    if s_wall > length / 2: hip0 = half
                    else: hip1 = half
                elif kind in ("institution", "flats") and r_group < 0.5:
                    hip0 = hip1 = half
                if i in row_hipped:
                    if row_hipped[i] is not None and shape not in HIPPED + GABLED:
                        hip0 = hip1 = half if row_hipped[i] else 0.0
                    # a row's roofs run on into each other: no hip against a party wall
                    for (ax, ay), (bx, by), (wx, wy) in walls:
                        wl = math.hypot(bx - ax, by - ay) or 1
                        if abs((bx - ax) * ux + (by - ay) * uy) / wl > 0.5: continue
                        s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                        if s_wall < length / 4: hip0 = 0.0
                        elif s_wall > length * 3 / 4: hip1 = 0.0
                roof = dict(rect=rect, rise=rise, hips=(hip0, hip1), u=(ux, uy))

        if m and not roof and not m["flat"]:
            eaves = max(2.2, m["mid"])     # a pitched roof drawn as a block: meet it halfway

        # a parapet along the eaves hides Georgian roofs from the street; a single-storey building
        # there is a later bungalow, garage or extension, with its roof in plain view
        parapet = 0.9 if zone in ("georgian", "squares") and kind not in ("outbuilding", "church") and eaves >= 5.0 else 0.0
        if zone in ("cbd", "bokaap") and kind not in ("outbuilding", "church"): parapet = 0.6
        if core and kind in ("terrace", "semi") and eaves >= CORE_TALL:
            # an old core's tall attached houses are Georgian and Regency town houses: a parapet,
            # and tall rooms with tall sash windows
            parapet = 0.9
            if not tall: tall = max(2, round((eaves - 0.6) / 3.3))

        # roof covering
        if zone == "village":
            cover = "pantile" if r_group < 0.45 else "slate"
        elif zone in ("georgian", "victorian"):
            cover = "slate" if r_group < 0.8 else "pantile"
        elif zone == "riverside":
            cover = "grey"
        elif zone == "bath":
            cover = "slate" if r_group < 0.7 else "pantile"
        elif zone == "london":
            cover = "slate" if r_group < 0.85 else "grey"
        elif zone == "squares":
            cover = "slate"
        elif zone == "mulberry":
            cover = "grey"
        elif zone in CAPE:
            cover = "grey"                     # corrugated iron
        elif zone == "foxhill":
            cover = "concrete" if r_group < 0.6 else "slate"
        else:
            cover = "slate" if r_group < 0.5 else "concrete" if r_group < 0.8 else "pantile"

        cover = ROOF_COVER.get(p.get("roof_material") or "", cover)

        # ---- chimneys ----
        chim = []
        if roof and kind in ("terrace", "semi", "detached") and zone not in ("mulberry", "riverside", "cbd", "bokaap") and eaves > 3:
            ux, uy = roof["u"]
            q = roof["rect"]
            mx, my = (q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2   # ridge start
            for j, (_, _, (wx, wy)) in adj[i].items():
                if j < i: continue      # one stack per party wall
                s = (wx - mx) * ux + (wy - my) * uy
                chim.append((mx + ux * s, my + uy * s))
            if not adj[i] and r_self < 0.85:
                length = math.dist(q[0], q[1])
                s = length * (0.18 if r_self < 0.5 else 0.82)
                chim.append((mx + ux * s, my + uy * s))
            elif kind == "terrace" and len(adj[i]) == 1 and r_self < 0.5:
                pass   # end-of-terrace: the stack on the shared wall is enough
        # (base: the survey's lowest ground at the walls, which its eaves and ridge are measured from)
        out.append(dict(kind=kind, zone=zone, core=core, row_roof=row_why.get(i) if roof else None, level=bool(m and m.get("level")), eaves=eaves, base=m.get("base") if m else None, wall=wall, cover=cover, roof=roof, chim=chim, parapet=parapet, storeys=tall,
                        wc=_hex(p.get("facade_color")) or (core_shade if wall == core_wall else None), rk=_hex(p.get("roof_color")),
                        windows=kind not in ("outbuilding",)))
    return out

