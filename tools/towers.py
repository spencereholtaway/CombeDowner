"""Church towers and spires, measured from the lidar.

Usage: python3 -I tools/towers.py <map> [<raw dir>]     measure afresh into data/<map>/measured/towers.json

The footprints in the open data are flat outlines, so a church comes out as a nave with a roof and
nothing more. Its tower is plain to see in the Environment Agency's surface model, though: a
compact block standing well above the church's own ridge. For each place of worship (Overture's
church, chapel and the like, and OpenStreetMap's places of worship) the survey over and just round
its footprint is searched for that block, and from it are read:
- where the tower stands and how big it is, square to the church;
- how high its walls go: the commonest height across its top, where the parapet and the roof
  behind it are (the edges of the block catch the lower roofs beside it, and a spire is a few
  samples spread up its height, so neither moves it);
- a spire, where the survey rises well above that, to a point in the middle of the tower;
- pinnacles, where it rises over a metre at two of the corners, and a good deal more at one.
Where the laser mostly went through leaves there, it is a tree in the churchyard, not a tower.

The measurements are kept in the repository (they are small), so the map builds without the
lidar; the map's builds place a tower on each (place(), through tools/landmarks), as a landmark the
game draws (web/src/landmarks/tower.ts).
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PX = 0.5            # metres between samples
REACH = 1.5         # metres round the footprint searched too: a tower's outline is often drawn short
ABOVE_RIDGE = 4.0   # metres above the church's ridge that only a tower reaches
LOWEST = 12.0       # metres: no lower than this is a tower
MIN_SIDE = 3.0      # metres: narrower than this is a bellcote or a chimney
MAX_AREA = 400.0    # square metres
SPIRE = 4.0         # metres a spire rises at least above the tower
PINNACLE = 1.0      # metres a corner rises above the tower to be a pinnacle
PINNACLES = 3.0     # metres the two highest corners rise between them, on a tower with pinnacles
LEAFY = 0.9         # share of the block the laser went through, beyond which it's a tree


def path(map_id):
    from mapdata import measured_dir
    return os.path.join(measured_dir(map_id), "towers.json")


def religious(raw):
    """Footprints of places of worship, lon/lat rings, with their names."""
    import shapely
    from shapely.geometry import shape
    blds = json.load(open(os.path.join(raw, "building.geojson")))["features"]
    osm = []
    p = os.path.join(raw, "osm.geojson")
    if os.path.exists(p):
        for f in json.load(open(p))["features"]:
            q = f["properties"]
            if f["geometry"]["type"] in ("Polygon", "MultiPolygon") and (
                    q.get("amenity") == "place_of_worship" or q.get("building") in ("church", "chapel", "cathedral")):
                osm.append(shape(f["geometry"]).buffer(0))
    tree = shapely.STRtree(osm)
    out = []
    for f in blds:
        q = f["properties"]
        if f["geometry"]["type"] != "Polygon": continue
        g = shape(f["geometry"]).buffer(0)
        if not (q.get("class") in ("church", "chapel", "cathedral", "religious", "temple", "mosque", "synagogue")
                or q.get("subtype") == "religious"
                or any(osm[int(i)].intersection(g).area > 0.5 * g.area for i in tree.query(g))):
            continue
        names = q.get("names")
        out.append((g, (names or {}).get("primary", "") if isinstance(names, dict) else ""))
    return out


def find(lidar, poly):
    """The towers on one footprint (model metres), as dicts in model metres."""
    import numpy as np, shapely
    from scipy import ndimage
    q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
    (ax, ay), (bx, by) = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
    L = math.hypot(bx - ax, by - ay) or 1
    ux, uy = (bx - ax) / L, (by - ay) / L
    reach = poly.buffer(REACH)
    x0, y0, x1, y1 = reach.bounds
    X, Y = np.meshgrid(np.arange(x0, x1, PX), np.arange(y0, y1, PX))
    near = shapely.contains_xy(reach, X, Y)
    inside = shapely.contains_xy(poly, X, Y)
    if inside.sum() < 40: return []
    e, n = lidar._bng(X.ravel(), Y.ravel())
    dsm = lidar._sample("dsm", e, n).reshape(X.shape)
    dtm = lidar._sample("dtm", e, n).reshape(X.shape)
    last = lidar._sample("last", e, n).reshape(X.shape) if "last" in lidar.grids else dsm
    if np.isnan(dtm[inside]).all(): return []
    base = float(np.nanpercentile(dtm[inside], 10))
    h = dsm - base
    roof = inside & (h > 2)
    if roof.sum() < 40: return []
    ridge = float(np.nanpercentile(h[roof], 85))
    tall = near & (h > max(ridge + ABOVE_RIDGE, LOWEST))
    lab, k = ndimage.label(tall)
    found = []
    for i in range(1, k + 1):
        m = lab == i
        if m.sum() * PX * PX < MIN_SIDE * MIN_SIDE or m.sum() * PX * PX > min(MAX_AREA, 0.6 * poly.area): continue
        hm = h[m]
        if float(np.nanmean(dsm[m] - last[m] > 1.0)) > LEAFY: continue
        vals, cnt = np.unique(np.floor(hm[~np.isnan(hm)]), return_counts=True)
        top = float(vals[np.argmax(np.convolve(cnt, [1, 1, 1], "same"))]) + 0.5
        if top < ridge + ABOVE_RIDGE - 1: continue
        # the tower's walls: where it stands near its full height (its edges blur into what's beside it)
        body = m & (h >= top - 2.5)
        S, T = X[body] * ux + Y[body] * uy, -X[body] * uy + Y[body] * ux
        s0, s1 = np.percentile(S, [2, 98])
        t0, t1 = np.percentile(T, [2, 98])
        w, d = s1 - s0 + PX, t1 - t0 + PX
        if min(w, d) < MIN_SIDE or max(w, d) > 2.2 * min(w, d): continue
        sc, tc = (s0 + s1) / 2, (t0 + t1) / 2
        S, T = X[m] * ux + Y[m] * uy, -X[m] * uy + Y[m] * ux
        peak = float(np.nanmax(hm))
        mid = (np.abs(S - sc) < 0.25 * w) & (np.abs(T - tc) < 0.25 * d)
        spire = 0.0
        if mid.any() and peak - top >= max(SPIRE, 0.6 * min(w, d)) and float(np.nanmax(hm[mid])) >= peak - 1.5:
            spire = peak - top + 1.0       # (the tip is finer than the samples)
        corners = []
        for cs, ct in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            c = (np.abs(S - (sc + cs * (w / 2 - 0.6))) < 1.0) & (np.abs(T - (tc + ct * (d / 2 - 0.6))) < 1.0)
            corners.append(float(np.nanmax(hm[c])) - top if c.any() else 0.0)
        # pinnacles are thinner than the samples, so the survey catches the tops of only some of them
        a_, b_ = sorted(corners)[-2:]
        pinnacle = min(4.5, max(1.5, (a_ + b_) / 2)) if a_ > PINNACLE and a_ + b_ >= PINNACLES else 0.0
        cx, cy = sc * ux - tc * uy, sc * uy + tc * ux
        # its height from the ground at its own foot, not the church's lowest
        under = (np.abs(X * ux + Y * uy - sc) < w / 2) & (np.abs(-X * uy + Y * ux - tc) < d / 2)
        foot = float(np.nanmin(dtm[under])) if (under & ~np.isnan(dtm)).any() else base
        found.append(dict(x=cx, y=cy, a=math.atan2(uy, ux), w=w, d=d, h=top + base - foot, s=spire, p=pinnacle))
    return found


def measure(map_id, raw):
    from area import area
    from lidar import Lidar
    A = area(map_id)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    lidar = Lidar(os.path.join(raw, "lidar"), (lon0, lat0, kx, ky))
    import shapely
    out = []
    for g, name in religious(raw):
        poly = shapely.transform(g, lambda c: (c - [lon0, lat0]) * [kx, ky])
        found = [t for t in find(lidar, poly) if not any(math.hypot(t["x"] - o["x"], t["y"] - o["y"]) < 3 for o in out)]
        if not found: continue
        # the church's own roof, without its tower, which would otherwise be taken for its ridge
        body = poly.difference(shapely.union_all([_box(t["x"], t["y"], t["a"], t["w"], t["d"]).buffer(1.0) for t in found]))
        body = max(getattr(body, "geoms", [body]), key=lambda q: q.area)
        got = lidar.survey(body) if not body.is_empty else None
        for t in found:
            t["n"] = name
            if got and "p95" in got: t["b"] = [round(got[k] - got["base"], 1) for k in ("p12", "p50", "p95")]
            out.append(t)
    rows = [dict(n=t["n"], lon=round(t["x"] / kx + lon0, 7), lat=round(t["y"] / ky + lat0, 7), a=round(t["a"], 3),
                 w=round(t["w"], 1), d=round(t["d"], 1), h=round(t["h"], 1), s=round(t["s"], 1), p=round(t["p"], 1), **({"b": t["b"]} if "b" in t else {}))
            for t in sorted(out, key=lambda t: (round(t["y"]), round(t["x"])))]
    os.makedirs(os.path.dirname(path(map_id)), exist_ok=True)
    with open(path(map_id), "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
    print(f"towers: {len(rows)}, {sum(1 for r in rows if r['s'])} with spires, {sum(1 for r in rows if r['p'])} with pinnacles")


# ---- in the build -------------------------------------------------------------------------------

def load(map_id):
    """The map's measured towers, or none."""
    p = path(map_id)
    return json.load(open(p)) if os.path.exists(p) else []


def _box(x, y, a, w, d):
    from shapely.geometry import Polygon
    ux, uy = math.cos(a), math.sin(a)
    return Polygon([(x + ux * s - uy * u, y + uy * s + ux * u) for s, u in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))])


def _rect(ctx, t):
    x, y = ctx.proj(t["lon"], t["lat"])
    return x, y, _box(x, y, t["a"], t["w"], t["d"])


STEEP = 8.0        # metres a church's roof may rise from its eaves to its ridge (a house's: lidar.MAX_RISE)
SPREAD = 1.2       # how far above its median a church's ridge may stand, in the spread of its roof below the median
RELIGIOUS = ("church", "chapel", "cathedral", "religious", "temple", "mosque", "synagogue")


def judge(polys, props, surveyed, proj, towers):
    """lidar.decide for each footprint, but a church's steep roof is believed, and its ridge is
    read from its own roof, not a tower standing on it: where a tower was measured on it, from
    the survey without the tower (towers' "b": the 12th, 50th and 95th percentile heights of the
    rest of the roof, above the ground at its walls); otherwise no higher than the spread of the
    roof's heights allows."""
    import shapely
    import lidar as LD
    from types import SimpleNamespace
    ctx = SimpleNamespace(proj=proj)
    rects = [(_rect(ctx, t)[2].buffer(1.0), t["b"]) for t in towers if "b" in t]
    tree = shapely.STRtree([r for r, _ in rects]) if rects else None
    out = []
    for poly, p, got in zip(polys, props, surveyed):
        church = p.get("class") in RELIGIOUS or p.get("subtype") == "religious"
        if church and got and "p95" in got and tree is not None:
            for i in tree.query(poly):
                r, b = rects[int(i)]
                if poly.area > 2 * r.area and got["p95"] - got["base"] > b[2] + 2:
                    got = dict(got, p12=got["base"] + b[0], p50=got["base"] + b[1], p95=got["base"] + b[2], fit=None)
                    break
        if church and got and "p95" in got:
            # a pitched roof's heights spread evenly from eaves to ridge: far more above the median
            # than below it is something standing on the roof (a tower, a bellcote, a tree)
            top = got["p50"] + SPREAD * max(got["p50"] - got["p12"], 1.0) + 1.0
            if got["p95"] > top + 1.0: got = dict(got, p95=top, fit=None)
        out.append(LD.decide(poly, got, STEEP if church else LD.MAX_RISE))
    return out


def _standing(ctx, towers):
    """Each tower that stands on one of ctx's buildings (the rest are elsewhere on the map), with
    its middle and outline, and the buildings it touches."""
    import shapely
    if not ctx.buildings: return []
    tree = shapely.STRtree([b["poly"] for b in ctx.buildings])
    out = []
    for t in towers:
        x, y, r = _rect(ctx, t)
        on = [int(i) for i in tree.query(r.buffer(1.0))]
        if on: out.append((t, x, y, r, on))
    return out


def replaces(ctx, towers):
    """Building parts a tower stands in place of: those mostly inside it and not much bigger."""
    gone = set()
    for t, x, y, r, on in _standing(ctx, towers):
        reach = r.buffer(1.0)
        for i in on:
            p = ctx.buildings[i]["poly"]
            if p.area < 2 * r.area and p.intersection(reach).area > 0.6 * p.area: gone.add(i)
    return gone


def place(ctx, towers, others):
    """["tower", x, y, ground, angle, width, depth, height, spire, pinnacles] for each tower, but
    where one of the map's hand-made landmarks already stands for it."""
    out = []
    for t, x, y, r, on in _standing(ctx, towers):
        if any(o[0] == "spire" and math.hypot(o[1] - x, o[2] - y) < 15 for o in others): continue
        g = min(ctx.gelev(px, py) for px, py in list(r.exterior.coords)[:4])
        out.append(["tower", round(x, 2), round(y, 2), round(g, 2), round(t["a"], 3), t["w"], t["d"], t["h"], t["s"], t["p"]])
        ctx.clear = getattr(ctx, "clear", []) + [r]
    return out


if __name__ == "__main__":
    map_id = sys.argv[1]
    measure(map_id, sys.argv[2] if len(sys.argv) > 2 else os.path.join("data", "raw", map_id, "wide"))
