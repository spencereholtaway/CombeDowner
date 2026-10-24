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


def zone_at(zones, x, y, default):
    for name, cx, cy, r in zones:
        if math.hypot(x - cx, y - cy) < r:
            return name
    return default


def groups(polys, wholes=None):
    """Shared-wall neighbours of each footprint, and the wall segments they share. wholes, if
    given, is the original footprint each one was split from (roof_parts): a house's own
    extension is not its neighbour, so a detached house with a lean-to stays detached."""
    tree = STRtree(polys)
    adj = defaultdict(dict)
    grown = [p.buffer(0.35) for p in polys]
    for i, p in enumerate(polys):
        for j in tree.query(grown[i]):
            j = int(j)
            if j <= i: continue
            if wholes is not None and wholes[i] is not None and wholes[i] is wholes[j]: continue
            shared = grown[i].intersection(grown[j])
            if shared.is_empty or shared.area <= 0: continue
            rect = shared.minimum_rotated_rectangle
            q = list(rect.exterior.coords)[:4]
            e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
            length = max(e0, e1)
            if length < 2.5: continue
            a, b = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
            wall = (a, b, shared.centroid.coords[0])
            adj[i][j] = wall
            adj[j][i] = wall
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
    None: their wall material, and whether they are bungalows, replace the guesses too."""
    adj, comp = groups(polys, [p.get("_whole_geom") for p in props])
    out = []
    cluster_seed = {}
    group_key = {}
    if keys is not None:
        for i in range(len(polys)):
            root = comp[i][0]
            group_key[root] = min(group_key.get(root, keys[i]), keys[i])
    for i, (poly, p) in enumerate(zip(polys, props)):
        cls = p.get("class") or p.get("subtype") or ""
        name = (p.get("names") or {}).get("primary") or ""
        ml = p.get("height")
        cx, cy = poly.centroid.coords[0]
        zone = zone_at(zones, cx, cy, default_zone)
        floors = p.get("num_floors") or 0
        above = floors - 2 if floors >= 4 else floors   # in Bath a floor count usually includes a basement and an attic
        root, size = comp[i]
        area = p.get("_whole") or poly.area      # a wing of a big building is classed as the whole building
        # one random draw per group, so a whole terrace shares its height and materials
        cr = cluster_seed.setdefault(root, random.Random((group_key[root] if keys is not None else root) * 7919 + 17))
        r_group = cr.random()
        r_self = random.Random(keys[i] * 31 + 3).random() if keys is not None else rnd.random()

        # ---- what kind of building ----
        if cls in ("church", "chapel") or "Chapel" in name or name == "Holy Trinity":
            kind = "church"
        elif cls in ("school", "kindergarten", "hospital", "university") or area > 700:
            kind = "institution"
        elif cls in ("garage", "garages", "shed", "hut", "roof") or area < 28:
            kind = "outbuilding"
        elif cls in ("retail", "commercial", "office", "kiosk") and size == 1:
            kind = "shop"
        elif area > 320 and zone in ("mulberry", "riverside", "london"):
            kind = "flats"
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
        elif kind == "institution" and zone in BATH and floors:
            tall = max(2, above)
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
                tall = min(4, max(2, above or 3))
                eaves = tall * 3.5 + 0.8 + r_group * 0.5   # tall Georgian rooms over a raised ground floor
            elif zone == "victorian":
                eaves = (above or (3 if r_group < 0.35 else 2)) * 3.0 + 0.4
            elif zone == "riverside":
                eaves = (above or 3) * 2.9
            else:
                eaves = (above or (3 if kind == "terrace" and r_group < 0.5 else 2)) * 3.1 + 0.3
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
            else:
                storeys = 2
                eaves = 5.2 + r_group * 0.4
            # Microsoft heights run low, but a very low one on a detached house means a bungalow
            if kind == "detached" and ml and ml < 3.3 and area > 45 and zone != "village":
                eaves = 2.7
            elif ml and ml > 8.5 and kind != "terrace":
                eaves = max(eaves, 8.4)

        # ---- real heights from lidar, where the survey has the building ----
        m = measured[i] if measured else None
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
        elif zone == "foxhill":
            wall = "render" if r_group < 0.55 else "brick" if r_group < 0.85 else "stone"
        elif kind in ("institution", "shop"):
            # big old buildings here (Prior Park, the schools) are Bath stone
            wall = "stone" if r_group < 0.7 or area > 1500 else "render"
        else:
            wall = "stone" if r_group < 0.55 else "render" if r_group < 0.85 else "brick"
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
            if m:
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
            if (zone == "riverside" and kind == "flats") or (m and m["flat"]):
                pass                                    # flat roofs
            elif m and depth > 3:
                hip0 = hip1 = 0.0
                half = min(depth / 2, length / 2)
                if "hips" in m:
                    # as fitted to the survey (only when the fit succeeded): rect[0] is at the
                    # start of the ridge, along u
                    hip0, hip1 = (half if h else 0.0 for h in m["hips"])
                elif m["hipped"]:
                    hip0 = hip1 = half
                if (hip0 or hip1) and kind == "semi" and walls:
                    # only the outer end is hipped: the other is the party wall, whatever the
                    # survey's fit made of the neighbour's roof running on past it
                    _, _, (wx, wy) = walls[0]
                    s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                    if s_wall > length / 2: hip1 = 0.0
                    else: hip0 = 0.0
                elif hip0 or hip1:
                    # the same in a terrace or a row of shops: no hip at an end that meets a
                    # neighbour's wall, so a middle house's roof runs on into the next one's.
                    # Only walls across the ridge count, near an end of it
                    for (ax, ay), (bx, by), (wx, wy) in walls:
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
                roof = dict(rect=rect, rise=rise, hips=(hip0, hip1), u=(ux, uy))
            elif depth > 3:
                rise = min(depth / 2 * PITCH, 5.5 if kind == "church" else 3.0 if zone == "georgian" else 4.2)
                if kind == "church": rise = depth / 2 * 1.2
                hip0 = hip1 = 0.0
                half = min(depth / 2, length / 2)
                if zone == "georgian": pass                                     # behind a parapet: plain gables
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
                roof = dict(rect=rect, rise=rise, hips=(hip0, hip1), u=(ux, uy))

        if m and not roof and not m["flat"]:
            eaves = max(2.2, m["mid"])     # a pitched roof drawn as a block: meet it halfway

        # a parapet along the eaves hides Georgian roofs from the street; a single-storey building
        # there is a later bungalow, garage or extension, with its roof in plain view
        parapet = 0.9 if zone == "georgian" and kind not in ("outbuilding", "church") and eaves >= 5.0 else 0.0

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
        elif zone == "mulberry":
            cover = "grey"
        elif zone == "foxhill":
            cover = "concrete" if r_group < 0.6 else "slate"
        else:
            cover = "slate" if r_group < 0.5 else "concrete" if r_group < 0.8 else "pantile"

        # ---- chimneys ----
        chim = []
        if roof and kind in ("terrace", "semi", "detached") and zone not in ("mulberry", "riverside") and eaves > 3:
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
        out.append(dict(kind=kind, zone=zone, eaves=eaves, wall=wall, cover=cover, roof=roof, chim=chim, parapet=parapet, storeys=tall,
                        windows=kind not in ("outbuilding",)))
    return out
