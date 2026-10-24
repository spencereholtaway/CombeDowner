"""Where boats moor on a map's canal, from the narrowboats the lidar caught moored there.

Usage: python3 -I tools/moorings.py <map> <dir with lidar/dsm/*.tif> [<canal.json>] [<out.json>]

e.g. python3 -I tools/moorings.py combe-down data/raw/combe-down/wide

The Environment Agency's first-return surface (lidar/dsm/, tools/fetch.py) sees the roof of every
boat moored when it was flown: a strip a couple of metres wide along the edge of the water, its roof
level and a metre or two over the water, with open water out in the middle of the canal. This walks
both edges of every open stretch of the canal (web/public/maps/<map>-canal.json, not its tunnels,
aqueducts or locks) half a metre at a time and keeps each run of roof at least 7 m long, joined
over gaps of less than a metre and a half (boats moored nose to tail), whose roof is level enough
for a boat's (a bush hanging over the water from the bank is lumpier). Those are the moorings:
tools/canal.py moors its boats along them instead of guessing.

Writes data/<map>/moorings.json: [[x0, y0, x1, y1, side], ...], each stretch's two ends (metres
east and north of the map centre, along the canal's line) and which side of the water, 1 to the
left looking from x0, y0 to x1, y1 and -1 to the right. Small, so it's kept with the map's inputs and
a rebuild needs no lidar.
"""
import glob, json, math, os, sys
import numpy as np

STEP = 0.5          # metres between samples along the water
ROOF = (0.7, 2.4)   # a boat's roof above the water, metres
MIN_LEN = 7.0       # metres of roof for a boat
GAP = 1.5           # metres between boats moored nose to tail, at most
LEVEL = 0.7         # metres: the spread of the middle half of a roof's heights, at most
MIDDLE = 0.6        # metres: the middle of the canal stays this low, or it's a bridge or a tree over it


def main():
    map_id, raw = sys.argv[1:3]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    canal_file = sys.argv[3] if len(sys.argv) > 3 else os.path.join(root, "web", "public", "maps", f"{map_id}-canal.json")
    out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(root, "data", map_id, "moorings.json")
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
    for r in c["runs"]:
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
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(found, open(out, "w"))
    total = sum(math.dist(f[:2], f[2:4]) for f in found)
    print(f"{len(found)} moorings, {total:.0f} m of boats -> {out}")


if __name__ == "__main__":
    main()
