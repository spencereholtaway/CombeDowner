"""Walls, fences and hedges traced from the Environment Agency lidar.

Overture (from OpenStreetMap) has only a few hundred walls for the whole of Bath, but the lidar
sees every garden and field boundary that stands a metre or so above the ground: the surveyed
surface less the bare ground shows each one as a thin raised line. A wall half a metre thick is
narrower than the survey's 1 m pixels, so this looks for ridges rather than solid shapes:

- a ridge is a pixel standing 0.45 m or more above the ground two metres away on both sides, in
  some direction, between 0.5 and 3.5 m high, that isn't a building (or just beside one), a tree
  crown, or on a road's carriageway (where rows of parked cars look just like walls);
- the ridges are thinned to lines and straight runs are found in them (a Hough transform);
- each run is turned to line up with the nearest building, when it is within 15 degrees of
  square to it (garden walls run square to the houses), and runs in line with each other are
  joined across gaps of up to 5 m;
- a run is kept when it is at least 7 m long and the lidar shows the ridge along most of it, and
  its height is the middle of the ridge's heights along it. A ridge whose height wanders a lot
  is a hedge;
- under a tree the lidar sees only the crown, so where a run goes into a crown and another in
  line with it comes out the other side (within 20 m), the wall is carried on between them.

What a boundary is made of the lidar can't tell, so that comes from the area (see STYLE), as the
guessed garden boundaries' does.
"""
import math
import numpy as np
import shapely
from shapely.geometry import LineString, Point

MIN_LEN = 7.0       # metres: a shorter run is too likely to be a shed, a car or a bush
SUPPORT = 0.7       # share of a run the ridge must be found along
CAR_SUPPORT = 0.85  # the same, for a run on a street as drawn (a row of parked cars has gaps)
ROUGH = 0.4         # metres: a ridge whose height varies more than this along it is a hedge
MAX_H = 2.4         # tallest a wall is built (anything taller is usually a tree's edge)
# what a boundary is built as, by zone, by height: (below 1.3 m, from 1.3 m)
STYLE = {
    "village": ("garden_wall", "stone_wall"), "bath": ("garden_wall", "stone_wall"),
    "georgian": ("garden_wall", "stone_wall"), "victorian": ("garden_wall", "stone_wall"),
    "riverside": ("brick_wall_low", "brick_wall"), "mulberry": ("brick_wall_low", "brick_wall"),
    "foxhill": ("brick_wall_low", "fence"), "suburb": ("brick_wall_low", "fence"),
    "london": ("brick_wall_low", "brick_wall"), "squares": ("brick_wall_low", "brick_wall"),
    "cape": ("boundary_wall", "security_wall"), "bokaap": ("boundary_wall", "security_wall"),
    "cbd": ("boundary_wall", "security_wall"),
}


def _ridges(nd, solid):
    H, W = nd.shape
    P = np.pad(nd, 2, mode="edge")
    sh = lambda dr, dc: P[2 + dr:2 + dr + H, 2 + dc:2 + dc + W]
    ridge = np.zeros(nd.shape, dtype=bool)
    for dr, dc in ((0, 2), (2, 0), (2, 2), (2, -2)):
        ridge |= (nd - sh(dr, dc) > 0.45) & (nd - sh(-dr, -dc) > 0.45)
    return ridge & (nd > 0.5) & (nd < 3.5) & ~solid


def _merge(segs, ang_tol=6, off_tol=1.0, gap=5.0):
    """Join runs that are in line (within ang_tol degrees and off_tol metres) and overlap or
    nearly meet (gap metres), until no more can be."""
    segs = [(np.asarray(a, float), np.asarray(b, float)) for a, b in segs]
    cos_tol = math.cos(math.radians(ang_tol))
    changed = True
    while changed:
        changed, out, used = False, [], [False] * len(segs)
        for i in range(len(segs)):
            if used[i]: continue
            used[i] = True
            a, b = segs[i]
            for j in range(i + 1, len(segs)):
                if used[j]: continue
                c, d = segs[j]
                u, v = b - a, d - c
                L, M = np.linalg.norm(u), np.linalg.norm(v)
                if L < 1e-6 or M < 1e-6 or abs(u @ v) / (L * M) < cos_tol: continue
                (p, q), (r, s) = ((a, b), (c, d)) if L >= M else ((c, d), (a, b))
                w = (q - p) / np.linalg.norm(q - p)
                nrm = np.array([-w[1], w[0]])
                if max(abs((r - p) @ nrm), abs((s - p) @ nrm)) > off_tol: continue
                t0, t1 = sorted([0.0, (q - p) @ w])
                r0, r1 = sorted([(r - p) @ w, (s - p) @ w])
                if r0 > t1 + gap or r1 < t0 - gap: continue
                pts = np.array([a, b, c, d])
                m = pts.mean(0)
                dirv = np.linalg.svd(pts - m)[2][0]
                ts = (pts - m) @ dirv
                a, b = m + dirv * ts.min(), m + dirv * ts.max()
                used[j] = changed = True
            out.append((a, b))
        segs = out
    return segs


def lidar_walls(lidar, box, footprints, roads, road_width, kerbed, zone_of, inner_width=None):
    """Boundaries in box (x0, y0, x1, y1, model metres) as dicts c (style), h (height, metres)
    and p ([[x, y], ...]); roads are carriageways to leave out, road_width(r) their width.

    With inner_width(r) (the narrowest the street could be), only that middle strip is left out,
    so a wall the street as drawn would run over is still found (the street is then narrowed to
    it, see tools/roadwidth.py). A run found on the street as drawn has to look more like a wall
    than a row of parked cars: unbroken (CAR_SUPPORT) for 12 m or more, and level along its top."""
    from shapely import contains_xy
    from scipy.ndimage import binary_dilation, grey_opening
    from skimage.morphology import skeletonize
    from skimage.transform import probabilistic_hough_line
    x0, y0, x1, y1 = box
    xs, ys = np.arange(x0 + 0.5, x1, 1.0), np.arange(y0 + 0.5, y1, 1.0)
    GX, GY = np.meshgrid(xs, ys)
    surf, bare = lidar.surface_and_ground(GX.ravel(), GY.ravel())
    nd = (surf - bare).reshape(GX.shape)
    seen = ~np.isnan(nd)
    if not seen.any(): return []
    nd = np.where(seen, nd, 0.0)
    near_bld = shapely.unary_union([f.buffer(0.8) for f in footprints if f.intersects(shapely.box(*box))])
    on_road = [r for r in roads if r["c"] in kerbed or r["c"] in ("service", "unknown")]
    carriage = shapely.unary_union([LineString([q[:2] for q in r["p"]]).buffer((inner_width(r) if inner_width else road_width(r)) / 2 - 0.3, cap_style=2)
                                    for r in on_road])
    drawn = shapely.unary_union([LineString([q[:2] for q in r["p"]]).buffer(road_width(r) / 2, cap_style=2) for r in on_road]) \
        if inner_width else None
    solid = contains_xy(near_bld, GX, GY) | contains_xy(carriage, GX, GY)
    crowns = binary_dilation(grey_opening(nd, size=(3, 3)) > 2.5, iterations=1)
    solid |= crowns
    ridge = _ridges(nd, solid)
    segs = probabilistic_hough_line(skeletonize(ridge), threshold=3, line_length=5, line_gap=2, rng=1)
    to_xy = lambda c, r: np.array([x0 + 0.5 + c, y0 + 0.5 + r])
    segs = [(to_xy(*a), to_xy(*b)) for a, b in segs]

    # square to the nearest building
    blds = [f for f in footprints if f.intersects(shapely.box(x0 - 30, y0 - 30, x1 + 30, y1 + 30))]
    btree = shapely.STRtree(blds) if blds else None
    axes = []
    for f in blds:
        c = list(f.minimum_rotated_rectangle.exterior.coords)
        axes.append(math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0]))

    def square_up(a, b):
        m, L = (a + b) / 2, np.linalg.norm(b - a)
        if btree is None: return a, b
        k = btree.query_nearest(Point(*m), max_distance=25)
        if len(k) == 0: return a, b
        ang, ax = math.atan2(b[1] - a[1], b[0] - a[0]), axes[int(k[0])]
        off, best = min((abs((ang - (ax + q * math.pi / 2) + math.pi / 2) % math.pi - math.pi / 2), ax + q * math.pi / 2) for q in range(2))
        if off > math.radians(15): return a, b
        u = np.array([math.cos(best), math.sin(best)])
        return m - u * L / 2, m + u * L / 2

    H, W = nd.shape
    out = []
    for a, b in _merge([square_up(a, b) for a, b in segs]):
        L = np.linalg.norm(b - a)
        if L < MIN_LEN: continue
        n = max(2, int(L / 0.5))
        found, hs = 0, []
        for k in range(n + 1):
            x, y = a + (b - a) * k / n
            c, r = int(round(x - x0 - 0.5)), int(round(y - y0 - 0.5))
            if not (1 <= r < H - 1 and 1 <= c < W - 1): continue
            w = ridge[r - 1:r + 2, c - 1:c + 2]
            if w.any():
                found += 1
                hs.append(float(nd[r - 1:r + 2, c - 1:c + 2][w].max()))
        if found < SUPPORT * (n + 1): continue
        if drawn is not None and drawn.intersects(LineString([a, b]).centroid) and \
           (found < CAR_SUPPORT * (n + 1) or L < 12 or float(np.std(hs)) > 0.25): continue
        h = min(MAX_H, float(np.median(hs)))
        if float(np.std(hs)) > ROUGH: style = "hedge"
        else:
            low, high = STYLE.get(zone_of(*(a + b) / 2), ("brick_wall_low", "brick_wall"))
            style = low if h < 1.3 else high
        out.append(dict(c=style, h=round(h, 1), p=[[round(float(a[0]), 1), round(float(a[1]), 1)], [round(float(b[0]), 1), round(float(b[1]), 1)]]))
    return out + _under_trees(out, crowns, x0, y0)


def _under_trees(found, crowns, x0, y0):
    """Walls carried on under trees: where a wall runs into a tree's crown and one in line with it
    comes out the other side, within 20 m, the gap between them is mostly crown, the wall is taken
    to carry on under it (a gap in the open is a gateway or a drive, and stays one)."""
    H, W = crowns.shape
    seg = [(np.array(w["p"][0], float), np.array(w["p"][1], float), w) for w in found]
    cos_tol, out = math.cos(math.radians(8)), []
    if not seg: return out
    tree = shapely.STRtree([LineString([p, q]) for p, q, _ in seg])
    for i in range(len(seg)):
        for j in tree.query(LineString([seg[i][0], seg[i][1]]).buffer(20)):
            j = int(j)
            if j <= i: continue
            a, b, wa = seg[i]
            c, d, wb = seg[j]
            u, v = b - a, d - c
            if abs(u @ v) / (np.linalg.norm(u) * np.linalg.norm(v) or 1) < cos_tol: continue
            # the nearest ends, and how far apart and off line they are
            e, f = min(((p, q) for p in (a, b) for q in (c, d)), key=lambda pq: np.linalg.norm(pq[1] - pq[0]))
            gap = np.linalg.norm(f - e)
            if not 2 <= gap <= 20: continue
            un = u / np.linalg.norm(u)
            if abs(un[0] * (f - e)[1] - un[1] * (f - e)[0]) > 1.5: continue
            k = max(2, int(gap))
            under = 0
            for t in np.linspace(0, 1, k + 1)[1:-1]:
                x, y = e + (f - e) * t
                r, col = int(y - y0), int(x - x0)
                under += 0 <= r < H and 0 <= col < W and bool(crowns[r, col])
            if under < 0.6 * (k - 1): continue
            wall = wa if wa["c"] != "hedge" else wb
            out.append(dict(c=wall["c"], h=min(wa["h"], wb["h"]),
                            p=[[round(float(e[0]), 1), round(float(e[1]), 1)], [round(float(f[0]), 1), round(float(f[1]), 1)]]))
    return out
