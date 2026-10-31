"""Where boats moor on a map's canal, from the narrowboats the lidar caught moored there.

Usage: python3 -I tools/moorings.py <map> <dir with lidar/dsm/*.tif> [<canal.json>] [<out.json>] [--basins]

--basins looks again only in the basins and marinas, keeping the moorings along the canal already
in <out.json> (so the survey is needed only where they are).

e.g. python3 -I tools/moorings.py combe-down data/raw/combe-down/wide

The Environment Agency's first-return surface (lidar/dsm/, tools/fetch.py) sees the roof of every
boat moored when it was flown: a strip a couple of metres wide along the edge of the water, its roof
level and a metre or two over the water, with open water out in the middle of the canal. This walks
both edges of every open stretch of the canal (web/public/maps/<map>-canal.json, not its tunnels,
aqueducts or locks) half a metre at a time and keeps each run of roof at least 7 m long, joined
over gaps of less than a metre and a half (boats moored nose to tail), whose roof is level enough
for a boat's (a bush hanging over the water from the bank is lumpier). Those are the moorings:
tools/canal.py moors its boats along them instead of guessing.

In the basins and marinas off the canal (tools/canal.py writes them in the canal file) the boats
lie every which way, so there each blob of roof over the water is a boat, or a row of them moored
side by side.

Writes data/<map>/moorings.json: [[x0, y0, x1, y1, side], ...], each stretch's two ends (metres
east and north of the map centre, along the canal's line) and which side of the water, 1 to the
left looking from x0, y0 to x1, y1 and -1 to the right, or 0 for a boat in a basin (x0, y0 to
x1, y1 along its middle). Small, so it's kept with the map's inputs and
a rebuild needs no lidar.
"""
import glob, json, math, os, sys
import numpy as np

STEP = 0.5          # metres between samples along the water
ROOF = (0.7, 2.4)   # a boat's roof above the water, metres
MIN_LEN = 7.0       # metres of roof for a boat
GAP = 1.5           # metres between boats moored nose to tail, at most
LEVEL = 0.7         # metres: the spread of the middle half of a roof's heights, at most
BASIN_STEP = 0.5    # metres between samples over a basin
BEAM_ROW = 3.4      # metres: a roof wider than this in a basin is boats moored side by side
BERTH = 2.3         # metres from one boat's middle to the next, side by side
MIDDLE = 0.6        # metres: the middle of the canal stays this low, or it's a bridge or a tree over it


def basin_boats(basins, dsm):
    """The boats in the basins and marinas off the canal (tools/canal.py "basins"), each one's ends
    along its middle as [x0, y0, x1, y1, 0]. Their roofs are blobs of the survey a boat's height
    over the water. In a marina they're moored side by side, so one blob is often a row of boats:
    one longer than any boat is a row of them lying across it, else its boats lie along it."""
    import shapely
    from scipy import ndimage
    out = []
    for b in basins:
        poly, lv = shapely.Polygon(b["r"][0], b["r"][1:]), b["lv"]
        x0, y0, x1, y1 = poly.bounds
        xs, ys = np.arange(x0, x1, BASIN_STEP), np.arange(y0, y1, BASIN_STEP)
        X, Y = np.meshgrid(xs, ys)
        inside = shapely.contains_xy(poly.buffer(-0.5), X, Y)
        roof = np.zeros(X.shape, dtype=bool)
        for j, i in zip(*np.nonzero(inside)):
            v = dsm(X[j, i], Y[j, i])
            roof[j, i] = v is not None and ROOF[0] < v - lv < ROOF[1]
        blobs, n = ndimage.label(roof)
        for k in range(1, n + 1):
            jj, ii = np.nonzero(blobs == k)
            if len(jj) * BASIN_STEP ** 2 < MIN_LEN * 1.2: continue
            rect = shapely.MultiPoint(np.column_stack([X[jj, ii], Y[jj, ii]])).minimum_rotated_rectangle.buffer(BASIN_STEP / 2, join_style=2)
            if rect.geom_type != "Polygon": continue
            c = list(rect.minimum_rotated_rectangle.exterior.coords)[:4]
            e = [(math.dist(c[i], c[(i + 1) % 4]), i) for i in range(4)]
            (long_, li), (short, si) = max(e), min(e)
            if long_ < MIN_LEN: continue
            ux, uy = (c[(li + 1) % 4][0] - c[li][0]) / long_, (c[(li + 1) % 4][1] - c[li][1]) / long_
            cx, cy = sum(q[0] for q in c) / 4, sum(q[1] for q in c) / 4
            if short <= BEAM_ROW:
                rows = max(1, round(long_ / 21.0 + 0.3))
                for r_ in range(rows):
                    f = (r_ + 0.5) / rows - 0.5
                    L = long_ / rows
                    mx, my = cx + ux * f * long_, cy + uy * f * long_
                    out.append([round(mx - ux * L / 2, 1), round(my - uy * L / 2, 1), round(mx + ux * L / 2, 1), round(my + uy * L / 2, 1), 0])
                continue
            # a row of boats side by side: they lie across it if it's longer than a boat
            if long_ > 23.0:
                if short < MIN_LEN: continue
                L, n_, (ax, ay), (bx, by) = short, round(long_ / BERTH), (-uy, ux), (ux, uy)
            else:
                L, n_, (ax, ay), (bx, by) = long_, round(short / BERTH), (ux, uy), (-uy, ux)
            span = (long_ if long_ > 23.0 else short)
            for r_ in range(max(1, n_)):
                f = ((r_ + 0.5) / max(1, n_) - 0.5) * span
                mx, my = cx + bx * f, cy + by * f
                out.append([round(mx - ax * L / 2, 1), round(my - ay * L / 2, 1), round(mx + ax * L / 2, 1), round(my + ay * L / 2, 1), 0])
    if basins: print(f"basins: {len(out)} boats seen moored in {len(basins)} basins and marinas")
    return out


def main():
    args = sys.argv[1:]
    only_basins = "--basins" in args
    if only_basins: args.remove("--basins")
    map_id, raw = args[:2]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    canal_file = args[2] if len(args) > 2 else os.path.join(root, "web", "public", "maps", f"{map_id}-canal.json")
    out = args[3] if len(args) > 3 else os.path.join(root, "data", map_id, "moorings.json")
    import rasterio
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from area import area
    from lidar import bng_transformer
    A = area(map_id)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    try: T = bng_transformer()
    except SystemExit:
        # (without the OS's grid PROJ is a few tens of centimetres out: nothing to a boat's length)
        import pyproj
        pyproj.network.set_network_enabled(False)
        T = pyproj.Transformer.from_crs(4326, 27700, always_xy=True, only_best=False)
        print("moorings: no OSTN15 grid, so reading the survey a few tens of centimetres out")
    tiles = [(r, r.read(1)) for r in (rasterio.open(f) for f in glob.glob(os.path.join(raw, "lidar", "dsm", "*.tif")))]
    if not tiles: raise SystemExit(f"no lidar surface in {raw}/lidar/dsm (python3 -I tools/fetch.py {map_id} --only lidar)")

    def dsm(x, y):
        e, n = T.transform(x / kx + lon0, y / ky + lat0)
        for r, a in tiles:
            row, col = r.index(e, n)
            if 0 <= row < a.shape[0] and 0 <= col < a.shape[1]:
                v = a[row, col]
                return None if v < -100 else float(v)
        return None

    c = json.load(open(canal_file))
    found = []
    if only_basins:
        found = [m for m in json.load(open(out)) if m[4]] if os.path.exists(out) else []
    for r in ([] if only_basins else c["runs"]):
        p, lv = r["p"], r["lv"]
        pts = []
        for a, b in zip(p, p[1:]):
            if (a[6] | b[6]) & 3: pts.append(None); continue
            L = math.dist(a[:2], b[:2]) or 1
            n = max(1, int(L / STEP))
            for k in range(n):
                f = k / n
                pts.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, (b[0] - a[0]) / L, (b[1] - a[1]) / L))
        for side in (1, -1):
            def roof(q):
                if q is None: return False
                x, y, half, ux, uy = q
                nx, ny = -uy * side, ux * side
                hits = sum(1 for o in np.arange(half - 2.6, half - 0.3, 0.5)
                           if (v := dsm(x + nx * o, y + ny * o)) is not None and ROOF[0] < v - lv < ROOF[1])
                o = half - 3.5 if half > 4.2 else 0.0
                mid = dsm(x - nx * o, y - ny * o)
                return hits >= 2 and mid is not None and mid - lv < MIDDLE
            on = [roof(q) for q in pts]
            k, skip = 0, int(GAP / STEP)
            while k < len(on):
                if not on[k]: k += 1; continue
                j = k
                while j + 1 < len(on) and any(on[j + 1:j + 1 + skip]): j += 1
                if (j - k) * STEP >= MIN_LEN and pts[k] and pts[j] and None not in pts[k:j + 1]:
                    # level enough for a boat's roof?
                    hs = []
                    for q in pts[k:j + 1:2]:
                        x, y, half, ux, uy = q
                        for o in np.arange(half - 2.2, half - 0.4, 0.4):
                            v = dsm(x - uy * side * o, y + ux * side * o)
                            if v is not None and 0.5 < v - lv < 3.0: hs.append(v - lv)
                    if len(hs) > 8 and np.percentile(hs, 75) - np.percentile(hs, 25) <= LEVEL:
                        found.append([round(pts[k][0], 1), round(pts[k][1], 1), round(pts[j][0], 1), round(pts[j][1], 1), side])
                k = j + 1
    found += basin_boats(c.get("basins", []), dsm)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(found, open(out, "w"))
    total = sum(math.dist(f[:2], f[2:4]) for f in found)
    print(f"{len(found)} moorings, {total:.0f} m of boats -> {out}")


if __name__ == "__main__":
    main()
