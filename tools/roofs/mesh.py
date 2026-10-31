"""Roofs from the lidar as the game keeps them: a mesh of flat faces over each footprint.

tools/roofs/shapes.py works out each building's roof as faces (each a polygon of the footprint and
the plane it lies in); mesh() turns those into what the game draws (map.ts RoofMesh), with walls
standing in the steps between faces and the walls' tops along the outline. Each square's roofs are
kept in data/<map>/measured/faces/<ti>_<tj>.json, by each building's outline as built
(tools/prep_map.py reads them), in metres above sea level in the survey's frame: v the points
(x, y, z), t the roof's triangles, w the walls in its steps, r the outline with the points where
faces meet it added, z the roof's height at each of those along each wall.
"""
import hashlib, json, math, os, sys

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, Point

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT     # noqa: E402


def height(p, x, y):
    return p[0] * x + p[1] * y + p[2]



def mesh(poly, faces, planes, floor, top):
    """Points, roof triangles, walls in the steps, and the outline's wall tops."""
    zf = lambda k, xx, yy: float(min(top, max(floor, height(planes[k], xx, yy))))
    V, T, Wl, index = [], [], [], {}
    def vid(xx, yy, zz):
        key_ = (round(xx, 2), round(yy, 2), round(zz, 2))
        if key_ not in index: index[key_] = len(V); V.append(key_)
        return index[key_]
    for k, g in faces:
        for tri in shapely.get_parts(shapely.constrained_delaunay_triangles(g)):
            c = list(tri.exterior.coords)[:3]
            # counter-clockwise from above
            if (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]) < 0: c = [c[0], c[2], c[1]]
            T.append([vid(cx, cy, zf(k, cx, cy)) for cx, cy in c])
    tree = shapely.STRtree([g for _, g in faces])
    def face_at(px, py, skip):
        # by distance: the faces are snapped to a centimetre grid, and buffering one by less than
        # that leaves nothing, so no step ever found the face beside it
        for i in tree.query(Point(px, py).buffer(1e-3)):
            if i != skip and faces[i][1].distance(Point(px, py)) < 1e-3: return i
        return None
    # the steps: along every face edge, a wall from the face on the other side up to this one
    for fi, (k, g) in enumerate(faces):
        for ring in [g.exterior, *g.interiors]:
            cs = list(ring.coords)
            for (ax, ay), (bx, by) in zip(cs[:-1], cs[1:]):
                L = math.hypot(bx - ax, by - ay)
                if L < 0.05: continue
                mx, my = (ax + bx) / 2, (ay + by) / 2
                nx, ny = (by - ay) / L * 0.05, -(bx - ax) / L * 0.05
                other = None
                for s in (1, -1):
                    q = Point(mx + nx * s, my + ny * s)
                    if g.contains(q): continue
                    other = face_at(q.x, q.y, fi)
                    break
                if other is None: continue
                ok_ = faces[other][0]
                ha, hb = zf(k, ax, ay), zf(k, bx, by)
                la, lb = zf(ok_, ax, ay), zf(ok_, bx, by)
                if ha - la > 0.05 or hb - lb > 0.05:
                    if (ha - la) * (hb - lb) < 0:
                        t = (ha - la) / ((ha - la) - (hb - lb))
                        cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
                        cz = zf(k, cx, cy)
                        if ha > la: Wl.append([ax, ay, la, ha, cx, cy, cz, cz])
                        else: Wl.append([cx, cy, cz, cz, bx, by, lb, hb])
                    else:
                        Wl.append([ax, ay, la, ha, bx, by, lb, hb])
    # the outline, with every face corner that lies on it, and the roof's height there along each wall
    rings, tops = [], []
    corners = [Point(c) for _, g in faces for ring in [g.exterior, *g.interiors] for c in ring.coords]
    for ring in [poly.exterior, *poly.interiors]:
        line = LineString(ring.coords)
        ds = sorted({round(line.project(p), 3) for p in corners if line.distance(p) < 0.02} | {round(line.project(Point(c)), 3) for c in ring.coords[:-1]})
        pts = [line.interpolate(d) for d in ds]
        pts = [p for i, p in enumerate(pts) if i == 0 or p.distance(pts[i - 1]) > 0.05]
        if len(pts) > 1 and pts[-1].distance(pts[0]) < 0.05: pts = pts[:-1]
        zs = []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            mx, my = (p.x + q.x) / 2, (p.y + q.y) / 2
            best, bd = None, 1e9
            for fi in tree.query(Point(mx, my).buffer(0.1)):
                d = faces[fi][1].distance(Point(mx, my))
                if d < bd: best, bd = fi, d
            if best is None: zs.append([floor, floor]); continue
            k = faces[best][0]
            zs.append([zf(k, p.x, p.y), zf(k, q.x, q.y)])
        rings.append([[p.x, p.y] for p in pts]); tops.append(zs)
    return V, T, Wl, rings, tops



def surface_errors(V, T, xs, ys, zs):
    """How far the survey's samples lie off the faces, each sample on the triangle over it."""
    tris = [Polygon([V[i][:2] for i in t]) for t in T]
    tree = shapely.STRtree(tris)
    errs = []
    for x, y, z in zip(xs, ys, zs):
        for ti in tree.query(Point(x, y)):
            t = T[ti]
            (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) = (V[i] for i in t)
            d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
            if abs(d) < 1e-9: continue
            l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d
            l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d
            l3 = 1 - l1 - l2
            if min(l1, l2, l3) < -1e-3: continue
            errs.append(z - (l1 * z1 + l2 * z2 + l3 * z3))
            break
    return np.array(errs) if len(errs) >= 12 else None



def ring_key(b):
    """A building's key: its outline as built, to the decimetre (tools/prep_map.py makes the same)."""
    return hashlib.sha1(json.dumps(b["r"], separators=(",", ":")).encode()).hexdigest()[:20]



def miss(e):
    """How far a roof is from the survey: the mean distance, which a few samples straddling a step
    (where no plane fits) move less than they move the RMS; and the RMS."""
    return float(np.mean(np.abs(e))), float(np.sqrt(np.mean(e ** 2)))



def today_miss(drawn, sq_path, jobs):
    """How far today's roofs are from the survey, at the same samples, set in the survey's frame."""
    from errors import drawn_heights
    pts = {str(i): [[float(a), float(b)] for a, b in zip(s[0], s[1])] for i, s in jobs.items()}
    got = drawn_heights(drawn, sq_path, pts)
    out = {}
    for i, s in jobs.items():
        d = np.array(got[str(i)])
        z = s[2]
        # the drawn roof stands on the map's ground: compare shapes, not the frame offset
        e = z - d
        out[i] = miss(e - np.median(e))
    return out



def r2(v): return round(float(v), 2)



def load(map_id, sq):
    """A square's kept roofs, by ring_key, or {}."""
    p = os.path.join(ROOT, "data", map_id, "measured", "faces", f"{sq}.json")
    if not os.path.exists(p): return {}
    with open(p) as f: return json.load(f)



OUTLINE_SNAP = 0.11    # metres: one decimetre's rounding, and no more
SEAM_PARTNER = 0.15    # metres: another face's point this near is the same seam's other end


def for_game(kept, lift):
    """A kept roof as the game reads it (map.ts RoofMesh), lifted by lift metres from the survey's
    frame into the map's: the outline with its added points, and the roof."""
    r1, r2_ = (lambda v: round(v, 1)), (lambda v: round(v, 2))
    v = [a for x, y, z in kept["v"] for a in (r1(x), r1(y), r2_(z + lift))]
    w = [r2_(a + (lift if k % 4 >= 2 else 0)) if k % 4 >= 2 else r1(a) for q in kept["w"] for k, a in enumerate(q)]
    z = [[r2_(a + lift) for pair in ring for a in pair] for ring in kept["z"]]
    rings = [[[r1(x), r1(y)] for x, y in ring] for ring in kept["r"]]
    # a roof point on the outline rounds to the outline's point, not a decimetre off it, which would
    # open a sliver between the roof and the wall's top; but not when that would part it from a
    # neighbouring face's point beside it, which would open the seam between the two faces instead
    corners = np.array([q for ring in rings for q in ring], float)
    xy = np.array(v, float).reshape(-1, 3)[:, :2]
    target = {}
    for i, (x, y) in enumerate(xy):
        d = np.hypot(corners[:, 0] - x, corners[:, 1] - y)
        k = int(np.argmin(d))
        if 0 < d[k] <= OUTLINE_SNAP: target[i] = k
    for i, k in target.items():
        d = np.hypot(xy[:, 0] - xy[i, 0], xy[:, 1] - xy[i, 1])
        if any(target.get(int(j)) != k for j in np.nonzero((d > 0) & (d <= SEAM_PARTNER))[0]): continue
        v[3 * i], v[3 * i + 1] = float(corners[k, 0]), float(corners[k, 1])
    return rings, dict(v=v, t=[i for tri in kept["t"] for i in tri], w=w, z=z)
