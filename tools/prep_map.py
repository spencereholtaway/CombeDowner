"""Pack the Overture layers plus lidar terrain into one JSON file for the game.

Usage: python3 -I tools/prep_map.py <map> <dir with raw .geojson layers> <out.json> [--tile ti tj]
       [--measured <file> | --measure <file>]

Adapted from the Bath prototype (Train-Game, Tools/overture-poc/prep_3d.py). Terrain comes from
AWS Terrain Tiles (Mapzen "terrarium" PNGs, zoom 15, about 3 m per pixel here), which in England
are built from Environment Agency lidar. Model coordinates are metres east/north of the map
centre; elevations are metres above sea level.

Changes for first person:
- the terrain is flattened under vehicle roads, so roads sit flush and need no lift;
- each vertex of the terrain grid gets a ground type (grass, pitch, wood...) for colouring;
- small rectangular buildings get a gabled roof, given as an oriented rectangle;
- woods are scattered with trees, and walls, fences and hedges are kept as barrier lines.

With --tile ti tj it builds one square of a map with a wide area (the whole of Bath) instead, from
the map's wide data (tools/prep_tiles.py builds them all; see docs/new-area.md). The squares lie on
one terrain grid set in area.py (squares): each is 261 x 261 of its cells, and squares 0-2 each way
are the detailed area in the middle (Combe Down), stitched into one file for the game. A tile is
worked out over a margin of 15 cells round itself (roads further), so roads, gardens and river beds
near an edge come out the same from both sides, then it keeps only what is its own:
- terrain: its 262 x 262 vertices, the edges shared exactly with its neighbours;
- buildings: whole, in the tile holding the middle of the footprint;
- doors, signs, trees, furniture and the like: those standing inside the tile; short pieces
  (markings, wires, gates, paths, drives) by their middle;
- roads, walls, streams and tunnels: cut at the tile's edge; water and named places cut to it;
- the spawn green, if it's the tile's.

With --measured, what would come from the lidar and the tree canopy map (building heights, roofs
and roof levels, and the canopy) is read from that file instead (one square's measurements, see
tools/mapdata.py), and neither is needed; with --measure, they are worked out from the lidar and
the canopy map as usual and written to that file. Both build exactly the same map.
"""
from collections import defaultdict
import copy, io, json, math, multiprocessing, os, random, sys, urllib.request, zlib
import numpy as np
import shapely
from PIL import Image
from shapely.geometry import shape, box, Point
from shapely.ops import substring, transform, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import RELEASE, area

args = sys.argv[1:]
TILE = None
if "--tile" in args:
    k = args.index("--tile")
    TILE = (int(args[k + 1]), int(args[k + 2]))
    del args[k:k + 3]
STORE = None
for flag in ("--measured", "--measure"):
    if flag in args:
        import mapdata
        k = args.index(flag)
        STORE = mapdata.Store(args[k + 1], record=flag == "--measure")
        del args[k:k + 2]
KEEP = None
if "--buildings-from" in args:
    # the buildings of an earlier build of this map, with their lidar-measured heights and roofs,
    # carried over onto the same footprints where this build's lidar doesn't reach (for a rebuild
    # where the lidar can't all be fetched)
    k = args.index("--buildings-from")
    KEEP = json.load(open(args[k + 1]))["bl"]
    del args[k:k + 2]
A, src_dir, out_path = area(args[0], wide=TILE is not None), args[1], args[2]
lon0, lat0 = A.centre
kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
proj = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)
if TILE is None:
    W, S, E, N = A.bbox
    B = box(W, S, E, N)
    X0, Y0 = proj(W, S)
    X1, Y1 = proj(E, N)
    ROAD_BOX = None          # roads are cut at the edge of the data like everything else
else:
    # ---- the tile: a square of the map's grid (area.py), worked out over a margin round it ----
    G = A.squares
    D, CELLS, MARGIN = G.dx, G.cells, 15
    ti, tj = TILE
    lat_x = lambda i: G.x0 + i * D               # the grid's vertex i east, j north, in metres
    lat_y = lambda j: G.y0 + j * D
    TX0, TY0, TX1, TY1 = lat_x(ti * CELLS), lat_y(tj * CELLS), lat_x((ti + 1) * CELLS), lat_y((tj + 1) * CELLS)
    gi0, gj0 = ti * CELLS - MARGIN, tj * CELLS - MARGIN
    X0, Y0, X1, Y1 = lat_x(gi0), lat_y(gj0), lat_x(gi0 + CELLS + 2 * MARGIN), lat_y(gj0 + CELLS + 2 * MARGIN)
    W, S, E, N = X0 / kx + lon0, Y0 / ky + lat0, X1 / kx + lon0, Y1 / ky + lat0
    # roads are taken whole for 500 m past the margin, so a street's lamps, cars and bridges are
    # laid out from the same start in every tile that has it
    ROAD_BOX = (X0 - 500, Y0 - 500, X1 + 500, Y1 + 500)
    TBOX = box(TX0, TY0, TX1, TY1)
    own = lambda x, y: TX0 <= x < TX1 and TY0 <= y < TY1     # the tile's own (each point is in one tile)
BM = box(X0, Y0, X1, Y1)
r1 = lambda v: round(float(v), 1)
rnd = random.Random(1622)

# ---- terrain ------------------------------------------------------------------
Z = 15
NPX = 256 * 2 ** Z
gpx = lambda lon: (lon + 180) / 360 * NPX
gpy = lambda lat: (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * NPX
m = 0.002
if TILE is None:
    tx0, tx1 = int(gpx(W - m) // 256), int(gpx(E + m) // 256)
    ty0, ty1 = int(gpy(N + m) // 256), int(gpy(S - m) // 256)
else:
    # a tile needs the ground 1250 m round itself, for the water levels of its neighbours' rivers
    g = 1250
    tx0, tx1 = int(gpx((TX0 - g) / kx + lon0) // 256), int(gpx((TX1 + g) / kx + lon0) // 256)
    ty0, ty1 = int(gpy((TY1 + g) / ky + lat0) // 256), int(gpy((TY0 - g) / ky + lat0) // 256)
cache = os.path.join(src_dir, "terrain15")     # downloaded tiles are kept here for the next build


def terrain_tile(tx, ty):
    path = os.path.join(cache, f"{Z}_{tx}_{ty}.png")
    if not os.path.exists(path):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
        data = urllib.request.urlopen(url, timeout=30).read()
        os.makedirs(cache, exist_ok=True)
        tmp = f"{path}.{os.getpid()}"
        open(tmp, "wb").write(data)
        os.replace(tmp, path)      # several builds may fetch the same tile at once
    return Image.open(path)


rows = []
for ty in range(ty0, ty1 + 1):
    row = []
    for tx in range(tx0, tx1 + 1):
        a = np.asarray(terrain_tile(tx, ty).convert("RGB")).astype(float)
        row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
    rows.append(np.hstack(row))
DEM = np.vstack(rows)


def elev(x, y):
    """Bilinear terrain height at model metres (x east, y north)."""
    lon, lat = x / kx + lon0, y / ky + lat0
    u, v = gpx(lon) - tx0 * 256 - 0.5, gpy(lat) - ty0 * 256 - 0.5
    i, j = int(math.floor(u)), int(math.floor(v))
    fu, fv = u - i, v - j
    q = DEM[j:j + 2, i:i + 2]
    return (q[0, 0] * (1 - fu) + q[0, 1] * fu) * (1 - fv) + (q[1, 0] * (1 - fu) + q[1, 1] * fu) * fv


if TILE is not None:
    def elev(x, y):
        """As above, but worked out from the whole world's pixel grid, so every tile gets exactly
        the same height at the same point whichever terrain tiles it has loaded."""
        lon, lat = x / kx + lon0, y / ky + lat0
        u, v = gpx(lon) - 0.5, gpy(lat) - 0.5
        i, j = int(math.floor(u)), int(math.floor(v))
        fu, fv = u - i, v - j
        q = DEM[j - ty0 * 256:j - ty0 * 256 + 2, i - tx0 * 256:i - tx0 * 256 + 2]
        return (q[0, 0] * (1 - fu) + q[0, 1] * fu) * (1 - fv) + (q[1, 0] * (1 - fu) + q[1, 1] * fu) * fv


# ---- the ground from the lidar --------------------------------------------------------------
# The terrain tiles above are a mix of surveys at about 3 m, often half a metre out and up to 4 m
# out on steep ground and by water. The Environment Agency's 1 m lidar ground (lidar/dtm) is the
# ground wherever it covers: each vertex of the map's 4 m grid is the mean of the 16 lidar metres
# round it, worked out on the grid's own lattice so every square gets the same heights at the same
# place. The terrain tiles fill in only where the lidar has no cover, eased into it over 20 m.
if TILE is not None and os.path.isdir(os.path.join(src_dir, "lidar", "dtm")) and not os.environ.get("NO_LIDAR_GROUND"):
    import glob
    from lidar import Lidar, _to_bng
    from scipy.ndimage import distance_transform_edt
    _L = Lidar.__new__(Lidar); _L.grids = {}
    import rasterio
    _L.grids["dtm"] = []
    for f in sorted(glob.glob(os.path.join(src_dir, "lidar", "dtm", "*.tif"))):
        try:
            with rasterio.open(f) as src: _L.grids["dtm"].append([f, src.transform, src.shape, None])
        except Exception as e: print(f"ground: {os.path.basename(f)} unreadable, left to the terrain tiles ({e.__class__.__name__})")
    pad = int(math.ceil(1250 / D))
    li0, lj0 = gi0 - pad, gj0 - pad
    lnx = lny = CELLS + 2 * MARGIN + 2 * pad + 1
    LX = lat_x(li0) + np.arange(lnx) * D; LY = lat_y(lj0) + np.arange(lny) * D
    # (model metres to the national grid: as good as straight across a few km, so fitted once)
    fx, fy = np.meshgrid(np.linspace(LX[0], LX[-1], 5), np.linspace(LY[0], LY[-1], 5))
    fe, fn = _to_bng((fx.ravel() / kx + lon0, fy.ravel() / ky + lat0))
    M = np.c_[fx.ravel(), fy.ravel(), np.ones(fx.size)]
    ce, cn = np.linalg.lstsq(M, fe, rcond=None)[0], np.linalg.lstsq(M, fn, rcond=None)[0]
    gx_, gy_ = np.meshgrid(LX, LY)
    acc, cnt = np.zeros(gx_.shape), np.zeros(gx_.shape)
    for ox in (-1.5, -0.5, 0.5, 1.5):
        for oy in (-1.5, -0.5, 0.5, 1.5):
            px, py = (gx_ + ox).ravel(), (gy_ + oy).ravel()
            v = _L._sample("dtm", ce[0] * px + ce[1] * py + ce[2], cn[0] * px + cn[1] * py + cn[2]).reshape(gx_.shape)
            ok = ~np.isnan(v); acc[ok] += v[ok]; cnt[ok] += 1
    lid = np.where(cnt >= 8, acc / np.maximum(cnt, 1), np.nan)
    have = ~np.isnan(lid)
    if have.any():
        tiles_ = np.array([[elev(x, y) for x in LX] for y in LY]) if not have.all() else None
        w = np.clip(distance_transform_edt(have) * D / 20.0, 0, 1) if tiles_ is not None else np.ones(lid.shape)
        LG = np.where(have, w * np.nan_to_num(lid) + (1 - w) * (tiles_ if tiles_ is not None else 0), tiles_ if tiles_ is not None else 0)
        _terrain_elev = elev
        def elev(x, y):
            """Height of the ground (the lidar's, else the terrain tiles') at model metres, from the
            lattice above, two triangles a cell as the game draws it."""
            fi, fj = (x - LX[0]) / D, (y - LY[0]) / D
            if not (0 <= fi < lnx - 1 and 0 <= fj < lny - 1): return _terrain_elev(x, y)
            i, j = int(fi), int(fj); u, v = fi - i, fj - j
            if u + v <= 1: return LG[j, i] + (LG[j, i + 1] - LG[j, i]) * u + (LG[j + 1, i] - LG[j, i]) * v
            return LG[j + 1, i + 1] + (LG[j + 1, i] - LG[j + 1, i + 1]) * (1 - u) + (LG[j, i + 1] - LG[j + 1, i + 1]) * (1 - v)
        print(f"ground: from the lidar at {have.mean() * 100:.0f}% of points, the terrain tiles elsewhere")


def low(x, y, r):
    """Lowest ground within r metres: used for water surfaces, which sit below their banks."""
    return min([elev(x, y)] + [elev(x + r * math.cos(a), y + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)])


STEP = 4.0
BANK = 10.0     # metres back from the water's edge over which the ground slopes down to it
if TILE is None:
    nx, ny = int(math.ceil((X1 - X0) / STEP)) + 1, int(math.ceil((Y1 - Y0) / STEP)) + 1
    dx, dy = (X1 - X0) / (nx - 1), (Y1 - Y0) / (ny - 1)
    grid = np.array([[elev(X0 + i * dx, Y0 + j * dy) for i in range(nx)] for j in range(ny)])  # rows south -> north
    GX, GY = np.meshgrid(X0 + np.arange(nx) * dx, Y0 + np.arange(ny) * dy)
else:
    # the vertices of the detailed map's grid, numbered from its corner, so neighbouring tiles share them exactly
    nx = ny = CELLS + 2 * MARGIN + 1
    dx = dy = D
    xs, ys = [lat_x(gi0 + i) for i in range(nx)], [lat_y(gj0 + j) for j in range(ny)]
    grid = np.array([[elev(x, y) for x in xs] for y in ys])
    GX, GY = np.meshgrid(np.array(xs), np.array(ys))

# ---- helpers ------------------------------------------------------------------
_job = None


def _run(i):
    return _job(i)


def each(fn, items):
    """[fn(x) for x in items], for the detailed map spread over the machine's cores (the squares
    already build several at once). Each item is worked out on its own, so it comes out the same."""
    global _job
    items = list(items)
    cores = os.cpu_count() or 1
    if TILE is not None or cores < 2 or len(items) < 200: return [fn(x) for x in items]
    _job = lambda i: fn(items[i])
    with multiprocessing.get_context("fork").Pool(cores) as pool:
        return pool.map(_run, range(len(items)), chunksize=32)


_layers = {}


def L(f):
    """One layer's features as (geometry, properties). Each file is read once and kept, as several
    steps read the same layer; the properties are copied each time, so no step sees another's changes."""
    if f not in _layers:
        _layers[f] = [(shape(x["geometry"]), x["properties"]) for x in json.load(open(f"{src_dir}/{f}.geojson"))["features"]]
    return [(g, copy.deepcopy(p)) for g, p in _layers[f]]


inside = lambda x, y: X0 <= x <= X1 and Y0 <= y <= Y1
name = lambda p: (p.get("names") or {}).get("primary") or ""


def densify_runs(coords, step, within=None):
    """Walk a full (unclipped) lon/lat line; return runs of in-bbox points as [x, y, t], t = fraction along the line.
    within: another box (x0, y0, x1, y1, model metres) to keep the points in, instead of the data's."""
    W, S, E, N = globals()["W"], globals()["S"], globals()["E"], globals()["N"]
    ins = inside
    if within is not None:
        W, S, E, N = within[0] / kx + lon0, within[1] / ky + lat0, within[2] / kx + lon0, within[3] / ky + lat0
        ins = lambda x, y: within[0] <= x <= within[2] and within[1] <= y <= within[3]
    seg_len = []
    for (a, b, *_), (c, d, *_) in zip(coords, coords[1:]):
        cl = math.cos(math.radians((b + d) / 2))
        seg_len.append(math.hypot((c - a) * 111320 * cl, (d - b) * 110574))
    total = sum(seg_len) or 1
    runs, cur, acc = [], [], 0.0
    for k, ((a, b, *_), (c, d, *_)) in enumerate(zip(coords, coords[1:])):
        lo_ln, hi_ln, lo_lt, hi_lt = min(a, c), max(a, c), min(b, d), max(b, d)
        if hi_ln < W or lo_ln > E or hi_lt < S or lo_lt > N:
            if cur: runs.append(cur); cur = []
            acc += seg_len[k]; continue
        pa, pb = proj(a, b), proj(c, d)
        n = max(1, int(math.ceil(seg_len[k] / step)))
        for s in range(n + (1 if k == len(seg_len) - 1 else 0)):
            f = s / n
            x, y = pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f
            if ins(x, y):
                cur.append([x, y, (acc + seg_len[k] * f) / total])
            elif cur:
                runs.append(cur); cur = []
        acc += seg_len[k]
    if cur: runs.append(cur)
    return [r for r in runs if len(r) > 1]


def flag_ranges(p, key):
    out = []
    for f in p.get(key) or []:
        if {"is_bridge", "is_tunnel"} & set(f.get("values") or []):
            out.append(tuple(f.get("between") or (0.0, 1.0)))
    return out


APPROACH = 10   # points (40 m) back from a bridge's end over which the survey may have the road dropping into the gap


def level_structures(run, z, ranges):
    """Carry bridges and tunnels straight between the road at either end. The survey's ground
    drops away into the gap over the last few dozen metres before a bridge (the bridge taken out
    of it and the bank put in), where the road doesn't: so each end is taken from the highest
    point of the road within APPROACH points of it, and the approach from there is held level."""
    ts = [p[2] for p in run]
    for a, b in ranges:
        idx = [i for i, t in enumerate(ts) if a <= t <= b]
        if not idx: continue
        i0, i1 = max(0, idx[0] - 1), min(len(run) - 1, idx[-1] + 1)
        ia = max(range(max(0, i0 - APPROACH), i0 + 1), key=lambda i: z[i])
        ib = max(range(i1, min(len(run), i1 + APPROACH + 1)), key=lambda i: z[i])
        za, zb, ta, tb = z[ia], z[ib], ts[i0], ts[i1]
        for i in range(ia, i0 + 1): z[i] = za
        for i in range(i1, ib + 1): z[i] = zb
        for i in range(i0 + 1, i1):
            z[i] = za + (zb - za) * ((ts[i] - ta) / ((tb - ta) or 1))
    return z


def in_ranges(run, ranges):
    """Which points of run (by index) fall in the stretches ranges, as fractions along the line."""
    return {i for i, (_, _, t) in enumerate(run) if any(a <= t <= b for a, b in ranges)}


SMOOTH = 3      # points (of 4 m) each side averaged into a road's height, so it rises and falls like a road, not like the survey's pixels


def smooth_profile(run, z, keep):
    """A road's heights, smoothed along its length, apart from the points in keep (bridges and
    tunnels, which are carried straight already) and the two ends (where it meets other roads,
    which must agree on the height there). In a tile, it eases back to the plain survey near the
    detailed map, whose roads were built without smoothing, so the two meet."""
    n = len(z)
    if n < 3: return z
    out = list(z)
    for i in range(1, n - 1):
        if i in keep: continue
        lo, hi = max(0, i - SMOOTH), min(n - 1, i + SMOOTH)
        js = [j for j in range(lo, hi + 1) if j not in keep]     # (not the ground under a bridge: that's the river)
        if len(js) < 2: continue
        avg = sum(z[j] for j in js) / len(js)
        w = min(1.0, i / SMOOTH, (n - 1 - i) / SMOOTH)        # pinned at the ends
        out[i] = z[i] + (avg - z[i]) * w
    return out


def line_coords(g):
    return [list(l.coords) for l in getattr(g, "geoms", [g]) if l.geom_type == "LineString"]


def polys(g):
    """Projected, clipped polygons of a lon/lat geometry."""
    c = transform(proj, g).intersection(BM)
    return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]


def whole_polys(g, within=BM):
    """Projected polygons of a lon/lat geometry that reach into within, whole (not cut to it)."""
    c = transform(proj, g)
    if not c.intersects(within): return []
    return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]


def cover_xy(poly, edge=False):
    """The grid vertices inside poly (and on its edge, with edge), as a window of the grid and a
    mask over it: only the vertices round the polygon are tested."""
    x0, y0, x1, y1 = poly.bounds
    i0, i1 = max(0, int((x0 - X0) / dx)), min(nx - 1, int((x1 - X0) / dx) + 1)
    j0, j1 = max(0, int((y0 - Y0) / dy)), min(ny - 1, int((y1 - Y0) / dy) + 1)
    win = (slice(j0, max(j0, j1 + 1)), slice(i0, max(i0, i1 + 1)))
    test = shapely.intersects_xy if edge else shapely.contains_xy
    return win, test(poly, GX[win], GY[win])


# ---- roads (also flatten the terrain under them) ------------------------------
# classes the game has no drawing for are mapped to the nearest one it does (as prep_wide.py does)
CLASS = {"motorway": "primary", "trunk": "primary", "living_street": "residential"}
# the same widths as RW in web/src/map.ts and web/src/world.ts: keep the three tables in step, or
# parked cars overhang the kerb and markings end under the pavement
RW = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 4, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.4, "track": 2.8, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
import tunnels as TN
roads, tunnel_list = [], []
flat_w = np.full(grid.shape, np.inf)   # distance from each grid vertex to the nearest road it is flattened to
flat_z = grid.copy()
flat_in = np.zeros(grid.shape, dtype=bool)   # the vertex is inside a road's carriageway (not just its easing)
flat_f = np.zeros(grid.shape)          # how far out from that road's centre line the ground is flat (the verge's edge)
SLOPE = 1.5                            # the ground eases from a road's level to its own over this many metres per metre of difference
EASE = 12.0                            # and over this far at most


PROTECT = None                         # grid vertices under a bridge's span: no road flattens them


def flatten(run, z, reach, only=None, weak=False):
    """Flatten the terrain under the line run (heights z) out to reach, and ease it back to its
    own level beyond that, over a distance that depends on how far it has to go (a cutting or
    an embankment gets a slope, not a step); only: the indexes of the points whose segments
    count. The ground under a bridge (PROTECT) is left to the bridge. weak: a path's, which takes
    no ground a road has flattened, and none of its easing that's nearer the road."""
    for k, ((ax, ay, *_), (bx, by, *_), za, zb) in enumerate(zip(run, run[1:], z, z[1:])):
        if only is not None and not (k in only and k + 1 in only): continue
        far = reach + EASE
        i0, i1 = max(0, int((min(ax, bx) - far - X0) / dx)), min(nx - 1, int((max(ax, bx) + far - X0) / dx) + 1)
        j0, j1 = max(0, int((min(ay, by) - far - Y0) / dy)), min(ny - 1, int((max(ay, by) + far - Y0) / dy) + 1)
        if i1 < i0 or j1 < j0: continue          # off the grid (a tile's roads reach past it)
        px, py = GX[j0:j1 + 1, i0:i1 + 1], GY[j0:j1 + 1, i0:i1 + 1]
        vx, vy = bx - ax, by - ay
        t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy or 1), 0, 1)
        d = np.hypot(px - (ax + t * vx), py - (ay + t * vy))
        zz = za + (zb - za) * t
        W = (slice(j0, j1 + 1), slice(i0, i1 + 1))
        inside = d < reach
        # the nearest road wins, but a carriageway beats another road's easing (one road passing
        # under another is seen to separately: the one under is dipped and the ground cut with it)
        win = (d < far) & np.where(inside, ~flat_in[W] | (d < flat_w[W]), ~flat_in[W] & (d < flat_w[W]))
        if weak: win &= ~flat_in[W] & (d < flat_w[W] - flat_f[W])
        if PROTECT is not None: win &= ~PROTECT[W]
        flat_w[W][win] = d[win]
        flat_z[W][win] = zz[win]
        flat_f[W][win] = reach
        flat_in[W] |= win & inside


# every road run first, with its heights and what's marked on it; then the underpasses, so the
# roads over them are spans; then the roads are written out and the ground flattened under them
pending = []
for g, p in L("segment"):
    if p["subtype"] != "road": continue
    c = CLASS.get(p.get("class") or "unknown", p.get("class") or "unknown")
    # a street closed to motor vehicles (the pedestrianised streets in town, some only in the
    # daytime) is a pedestrian street here: drawn, but with no traffic, no parked cars and no
    # centre lines; and a one-way street says which way (1 with its points, -1 against them)
    one_way = 0
    for ar in p.get("access_restrictions") or []:
        if ar.get("access_type") != "denied": continue
        w = ar.get("when") or {}
        if w.get("heading") == "backward" and not w.get("mode"): one_way = 1
        elif w.get("heading") == "forward" and not w.get("mode"): one_way = -1
        elif not w.get("heading") and not w.get("using") and not w.get("recognized") and not w.get("vehicle") and (w.get("mode") is None or "motor_vehicle" in w["mode"]) and c not in PATHS:
            c = "pedestrian"     # (a weight or height limit is a restriction on some vehicles, not a closure)
    ranges = flag_ranges(p, "road_flags")
    tunnel_ranges = [tuple(f.get("between") or (0.0, 1.0)) for f in p.get("road_flags") or [] if "is_tunnel" in (f.get("values") or [])]
    bridge_ranges = [tuple(f.get("between") or (0.0, 1.0)) for f in p.get("road_flags") or [] if "is_bridge" in (f.get("values") or [])]
    for coords in line_coords(g):
        for run in densify_runs(coords, 4.0, ROAD_BOX):
            # smoothed first (a road; a path lies on the ground as it is), then the structures
            # carried straight between the smoothed road at their ends
            z = [elev(x, y) for x, y, _ in run]
            if c not in PATHS: z = smooth_profile(run, z, in_ranges(run, ranges))
            z = level_structures(run, z, ranges)
            bored = TN.bores(run, z, tunnel_ranges, elev)
            pending.append(dict(c=c, n=name(p), run=run, z=z, span=in_ranges(run, bridge_ranges), bored=bored, tunnel_ranges=tunnel_ranges, ow=one_way))
# an underpass: a tunnel stretch too shallow to bore, which stays a road in a cutting. Whatever
# crosses over it is carried over as a bridge (Overture seldom marks the road on top), with the
# cutting as wide as the road in it
underpasses = []
for k, r in enumerate(pending):
    if not r["tunnel_ranges"]: continue
    shallow = in_ranges(r["run"], r["tunnel_ranges"]) - {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)}
    pts = [r["run"][i][:2] for i in sorted(shallow)]
    if len(pts) >= 2: underpasses.append((k, shapely.LineString(pts).buffer(max(TN.HALF + TN.CUT, RW.get(r["c"], 4) / 2 + 2.5) + 1.0)))
under_tree = shapely.STRtree([u for _, u in underpasses])
carried = 0
for k, r in enumerate(pending):
    if not underpasses: break
    line = shapely.LineString([q[:2] for q in r["run"]])
    for j in under_tree.query(line):
        if underpasses[int(j)][0] == k: continue
        poly = underpasses[int(j)][1]
        over = {i for i, q in enumerate(r["run"]) if poly.contains(shapely.Point(q[:2]))}
        carried += len(over - r["span"])
        r["span"] |= over
if underpasses: print(f"underpasses: {len(underpasses)}, with {carried} points of other roads carried over them as bridges")
# ---- bridges: what's really a bridge, what rides on one, what passes under one ---------------
# Overture marks odd little "bridges" (a street over a vault, a few metres of a path) with nothing
# to cross, maps a bridge's pavements as footways of their own, and the survey's ground under a
# bridge is often the deck itself (the bridge taken out and the gap filled in), so the road
# crossing under comes out at the deck's height. In order:
# 1. a path running along a road's span, within its deck, rides on the deck (a fourth value of 2:
#    at the road's height, with nothing built of its own);
# 2. a marked stretch is a bridge only if it crosses water, the railway or another road it
#    doesn't join (roads that meet are a junction, never one over the other), or the ground drops
#    well away under it; otherwise it's flattened into the ground like the rest of the road;
# 3. a road crossing under a road's bridge, without joining it, is dipped to leave headroom,
#    easing in and out over a few dozen metres, and its own flattening cuts the ground with it.
rail_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-rail.json")
rail_tracks = json.load(open(rail_file))["tracks"] if os.path.exists(rail_file) else []
water_polys = [transform(proj, g) for g, p in L("water") if p.get("class") != "sea" and g.geom_type.endswith("Polygon")]
water_tree = shapely.STRtree(water_polys)
rail_lines = [shapely.LineString([q[:2] for q in t["p"]]) for t in rail_tracks if len(t["p"]) > 1]
rail_tree = shapely.STRtree(rail_lines)
road_lines = [shapely.LineString([q[:2] for q in r["run"]]) for r in pending]
road_tree = shapely.STRtree(road_lines)
KERBED_RD = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}


def stretches(idx):
    """Runs of consecutive indexes in the set idx, each as a sorted list."""
    out, cur = [], []
    for i in sorted(idx):
        if cur and i != cur[-1] + 1: out.append(cur); cur = []
        cur.append(i)
    if cur: out.append(cur)
    return out


def joined(k, j):
    """Do roads k and j meet: an end of one on the other, or a point of each at the same spot (a
    crossroads, which the data gives both roads a point at)? Then they're a junction, not a crossing."""
    for a, b in ((k, j), (j, k)):
        run = pending[a]["run"]
        for q in (run[0], run[-1]):
            if road_lines[b].distance(shapely.Point(q[:2])) < 2.5: return True
    if road_lines[k].crosses(road_lines[j]):
        x = road_lines[k].intersection(road_lines[j]); x = x.geoms[0] if hasattr(x, "geoms") else x
        if x.geom_type == "Point" and all(any(math.dist(q[:2], (x.x, x.y)) < 0.7 for q in pending[i]["run"]) for i in (k, j)): return True
    return False


def crossing(k, j, line):
    """Where road j crosses the stretch line of road k, well inside it: the point, or None."""
    if j == k or joined(k, j) or not road_lines[j].crosses(line): return None
    x = road_lines[j].intersection(line)
    x = x.geoms[0] if hasattr(x, "geoms") else x
    if x.geom_type != "Point": return None
    t = line.project(x)
    return x if 1 < t < line.length - 1 else None


def span_line(r, st):
    a, b = max(0, st[0] - 1), min(len(r["run"]) - 1, st[-1] + 1)
    return a, b, shapely.LineString([r["run"][i][:2] for i in range(a, b + 1)])


def in_water(q):
    pt = shapely.Point(q[:2])
    return any(water_polys[int(j)].contains(pt) for j in water_tree.query(pt))


BANKED = 3.0    # metres each side of a path kept up on its bank or at a footbridge's end (the ground's grid is 4 m)
ALONG, DEEP = 8.0, 4.0    # metres: a way this far inside the water's outline, never further than DEEP from its edge, runs along it


def across_water(line):
    """Does line cross the water (a river, a pond) rather than run along its edge? A way along the
    bank dips into the water's outline where the data's edge is rough, but never gets far from the
    edge; a way across a river reaches well out into it, and one across a stream is only briefly
    in the water at all."""
    return any(cuts_water(water_polys[int(j)], line) for j in water_tree.query(line))


def cuts_water(w, line):
    if not w.intersects(line): return False
    if not w.is_valid: w = shapely.make_valid(w)
    inside = w.intersection(line)
    if inside.length < ALONG: return True
    edge = w.boundary
    for part in getattr(inside, "geoms", [inside]):
        if part.length <= 0: continue
        n = max(2, int(part.length / 2))
        if any(edge.distance(part.interpolate(k / n, normalized=True)) > DEEP for k in range(n + 1)): return True
    # or it goes right across a narrow stream or an arm of a pond, never far from either bank: it
    # cuts the water near it in two, with a good piece either side (a way along the bank only
    # shaves off a sliver no wider than it reaches in)
    near = w.intersection(line.buffer(40))
    d = near.difference(line.buffer(0.05))
    pieces = sorted((g.area for g in getattr(d, "geoms", [d]) if g.area > 0), reverse=True)
    return len(pieces) > 1 and pieces[1] > DEEP * inside.length


# 1. paths along a road's marked span ride on its deck
decks = []
for k, r in enumerate(pending):
    if r["c"] in PATHS or not r["span"]: continue
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        decks.append((k, line.buffer(RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.5, cap_style=2), line, [r["z"][i] for i in range(a, b + 1)]))
deck_tree = shapely.STRtree([d[1] for d in decks])
ridden = 0
NARROW = {"footway", "steps", "cycleway", "path"}     # a bridge's pavements are mapped as these; a pedestrian street is a street
for r in pending:
    r["deck"] = set()
    if r["c"] not in NARROW: continue
    pl = shapely.LineString([q[:2] for q in r["run"]])
    for j in deck_tree.query(pl):
        k, poly, line, zs = decks[int(j)]
        # along the road, not across it
        if pl.length > 6 and pl.intersection(poly).length < 0.6 * min(pl.length, line.length) and road_lines[k].crosses(pl): continue
        for i, q in enumerate(r["run"]):
            if not poly.contains(shapely.Point(q[:2])): continue
            t = line.project(shapely.Point(q[:2])) / (line.length or 1) * (len(zs) - 1)
            lo = min(len(zs) - 2, int(t)); f = t - lo
            r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
            r["deck"].add(i); r["span"].discard(i); ridden += 1
if ridden: print(f"bridges: {ridden} path points ride on a road's deck beside it")

# 2. which marked spans are real bridges
kept = dropped = 0
for k, r in enumerate(pending):
    if not r["span"]: continue
    run, z, keep = r["run"], r["z"], set()
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        real = across_water(line) \
            or any(rail_lines[int(j)].intersects(line) for j in rail_tree.query(line)) \
            or any(z[i] - elev(run[i][0], run[i][1]) > 2.5 and not in_water(run[i]) for i in st)     # (a drop to the water it runs along is no gap to bridge)
        solid = real
        if not real:
            for j in road_tree.query(line):
                j = int(j)
                x = crossing(k, j, line)
                if x is None or pending[j]["deck"]: continue
                # over another road: the data has the deck well above it (a footbridge, a flyover),
                # or it's a road long enough to be a bridge over a road, and the survey has merely
                # filled the gap (a path crossing a street at grade is a crossing, not a bridge)
                i = min(range(len(pending[j]["run"])), key=lambda i: math.dist(pending[j]["run"][i][:2], (x.x, x.y)))
                if z[st[0]] - pending[j]["z"][i] >= 3.5 or (r["c"] not in PATHS and pending[j]["c"] not in PATHS and line.length >= 20):
                    real = True; break
        if real: keep |= set(st); kept += 1
        else: dropped += 1
        if real and solid: r.setdefault("solid", set()).update(st)
    r["span"] = keep
if kept or dropped: print(f"bridges: {kept} marked spans with something under them, {dropped} with nothing under them flattened as road")

# 2b. a path's span crossing a street at the street's level is a pedestrian crossing there,
# not a bridge over it: the street wins and the span stops either side of it
VIADUCT = 40    # metres: a path's span this long is a viaduct, and what crosses under it goes under
for k, r in enumerate(pending):
    if r["c"] not in PATHS or not r["span"]: continue
    run, z = r["run"], r["z"]
    for st in stretches(set(r["span"])):
        a, b, line = span_line(r, st)
        if line.length >= VIADUCT: continue
        for j in road_tree.query(line):
            j = int(j)
            if pending[j]["c"] in PATHS: continue
            x = crossing(k, j, line)
            if x is None: continue
            o = pending[j]
            i = min(range(len(o["run"])), key=lambda i: math.dist(o["run"][i][:2], (x.x, x.y)))
            if abs(z[min(range(len(run)), key=lambda i: math.dist(run[i][:2], (x.x, x.y)))] - o["z"][i]) < 1.0:
                reach = RW.get(o["c"], 4) / 2 + 2.0
                for i2 in st:
                    if math.dist(run[i2][:2], (x.x, x.y)) < reach + 2: r["span"].discard(i2)

# 2b'. and a path's span never runs across a street it meets at the street's level (a bridge's
# pavement coming down onto the street at its end): those points are the street's
vehicle_idx = [j for j, o in enumerate(pending) if o["c"] not in PATHS]
vehicle_tree = shapely.STRtree([road_lines[j] for j in vehicle_idx])
for r in pending:
    if r["c"] not in PATHS or not r["span"]: continue
    for i in sorted(r["span"]):
        pt = shapely.Point(r["run"][i][:2])
        for jj in vehicle_tree.query(pt.buffer(8)):
            o = pending[vehicle_idx[int(jj)]]
            if road_lines[vehicle_idx[int(jj)]].distance(pt) > RW.get(o["c"], 4) / 2 + 1.5: continue
            kk = min(range(len(o["run"])), key=lambda kk: math.dist(o["run"][kk][:2], r["run"][i][:2]))
            if abs(o["z"][kk] - r["z"][i]) < 1.0: r["span"].discard(i); break

# 2c. a road marked as a bridge where it crosses under the railway (the data has it the wrong
# way up) is no bridge: it passes under
for k, r in enumerate(pending):
    if not r["span"] or not rail_lines: continue
    for st in stretches(set(r["span"])):
        a, b, line = span_line(r, st)
        for t in rail_tree.query(line):
            rl = rail_lines[int(t)]
            if not rl.crosses(line): continue
            x = rl.intersection(line); x = x.geoms[0] if hasattr(x, "geoms") else x
            if x.geom_type != "Point": continue
            tp = rail_tracks[int(t)]["p"]
            kk = min(range(len(tp)), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
            zr = r["z"][min(range(len(r["run"])), key=lambda i: math.dist(r["run"][i][:2], (x.x, x.y)))]
            if zr < tp[kk][2] - 1.0:
                for i2 in st: r["span"].discard(i2)

CLEAR_ROAD, CLEAR_PATH, DIP = 4.6, 2.9, 35.0     # headroom under a bridge for a road, for a path (a little over the 4.5 and 2.8 tools/check_map.py asks); metres over which a road eases down to it


def ease_roads(x, y, head, skip, down=True, reach=None, own=None, by=None):
    """Bring every road's points within DIP of (x, y) down to head (or up, with down False),
    easing in and out, so roads meeting there stay joined; skip: road indexes left alone (the
    bridge itself), and any road's points on a span or a deck are left alone too (except road
    own's, the one being carried over the canal), as is any road that is itself a bridge there.
    With by, everything there is lowered by that much instead, easing out, keeping its own slope."""
    n = 0
    for j in road_tree.query(shapely.Point(x, y).buffer(reach or DIP)):
        j = int(j)
        if j in skip: continue
        o = pending[j]
        if j != own and any(math.dist(o["run"][i][:2], (x, y)) < DIP + 10 for i in o["span"]): continue
        for i, q in enumerate(o["run"]):
            if j != own and (i in o["span"] or i in o["deck"]): continue
            d = math.dist(q[:2], (x, y))
            if d >= DIP: continue
            e = d / DIP; e = e * e * (3 - 2 * e)
            want = head + (o["z"][i] - head) * e if by is None else o["z"][i] - by * (1 - e)
            if (want < o["z"][i]) if down else (want > o["z"][i]): o["z"][i] = want; n += 1
    return n


# 2d. a road or path crossing the canal is a bridge over it (Overture rarely marks them), with
# headroom for a boat; unless the canal is in a tunnel there (it passes under the road)
CANAL_HEAD = 2.6     # metres of air over the water under a canal bridge
canal_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-canal.json")
canal_runs = []
if os.path.exists(canal_file):
    for run in json.load(open(canal_file))["runs"]:
        pts = run["p"]
        for i in range(len(pts) - 1):
            if (pts[i][6] | pts[i + 1][6]) & 1: continue
            canal_runs.append((shapely.LineString([pts[i][:2], pts[i + 1][:2]]), run["lv"], max(pts[i][2], pts[i + 1][2])))
canal_tree = shapely.STRtree([c[0] for c in canal_runs])
# (a path crossing at a lock is the lock's walkway, and one beside a road's crossing is the
# road's pavement: it rides the road's deck, with nothing of its own)
LOCK_REACH, BESIDE = 15.0, 8.0
gates = [shapely.Point(g) for l in (json.load(open(canal_file))["locks"] if os.path.exists(canal_file) else []) for g in (l["lo"], l["hi"])]
canal_x = []     # (road index, crossing point, lv, half)
lock_levels = [(shapely.Point(l["lo"]), shapely.Point(l["hi"]), max(l["zl"], l["zh"])) for l in (json.load(open(canal_file))["locks"] if os.path.exists(canal_file) else [])]
for k, r in enumerate(pending):
    for j in canal_tree.query(road_lines[k]):
        seg, lv, half = canal_runs[int(j)]
        if not road_lines[k].crosses(seg): continue
        x = road_lines[k].intersection(seg); x = x.geoms[0] if hasattr(x, "geoms") else x
        if x.geom_type != "Point": continue
        if r["c"] in PATHS and any(g.distance(x) < LOCK_REACH for g in gates): continue
        # a road crossing at a lock clears the higher of the two pounds, not just the one it's over
        for lo, hi, top in lock_levels:
            if lo.distance(x) < 25 or hi.distance(x) < 25: lv = max(lv, top)
        canal_x.append((k, x, lv, half))
over_canal = 0
road_x = [(x, lv) for k, x, lv, half in canal_x if pending[k]["c"] not in PATHS]
for k, x, lv, half in canal_x:
    r, run = pending[k], pending[k]["run"]
    deck = lv + CANAL_HEAD + 0.6
    reach = half + 6.0      # the water and the towpath either side
    beside = r["c"] in PATHS and any(x.distance(ox) < BESIDE for ox, _ in road_x)
    # the road, and the roads joining it on the approaches, rise to the deck; then the span
    ease_roads(x.x, x.y, deck, set(), down=False, own=k)
    for i, q in enumerate(run):
        if math.dist(q[:2], (x.x, x.y)) < reach:
            if beside: r["deck"].add(i); r["span"].discard(i)
            else: r["span"].add(i); r.setdefault("solid", set()).add(i)
            over_canal += 1
if over_canal: print(f"bridges: {over_canal} road points carried over the canal")

# 3. what passes under a road's bridge passes under it
dipped = 0
dips = []     # (road index, crossing point): the roads dipped under a bridge, for the ground to follow them
for k, r in enumerate(pending):
    if not r["span"]: continue
    run, z = r["run"], r["z"]
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        solid = st[0] in r.get("solid", set()) or line.length >= 20
        if r["c"] in PATHS: solid = line.length >= VIADUCT
        for j in road_tree.query(line):
            j = int(j)
            x = crossing(k, j, line)
            if x is None: continue
            o = pending[j]
            # a bridge or a deck itself here: leave it be
            if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"] | o["deck"]): continue
            # a path meeting a road's short span at its level crosses on the deck, it doesn't go under
            if o["c"] in PATHS and line.length < VIADUCT and st[0] not in r.get("solid", set()): continue
            t = line.project(x) / (line.length or 1) * (b - a)
            lo = a + min(b - a - 1, int(t)); f = t - (lo - a)
            deck = z[lo] + (z[lo + 1] - z[lo]) * f
            # a short span counts too where it stands well above what it crosses: a footbridge, not
            # a crossing, and the street under it is dipped to the full headroom
            i = min(range(len(o["run"])), key=lambda i: math.dist(o["run"][i][:2], (x.x, x.y)))
            if not solid and deck - o["z"][i] < CLEAR_PATH - 0.4: continue
            dips.append((j, x))
            head = deck - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
            # the road under, and the roads joining it there, dip together (under a footbridge, only
            # by what it lacks, so a street climbing past it keeps its slope and its junctions)
            if solid: dipped += ease_roads(x.x, x.y, head, {k})
            elif o["z"][i] > head: dipped += ease_roads(x.x, x.y, head, {k}, by=o["z"][i] - head)
# 3b. and under the railway's bridges and viaducts (tools/railway.py marks them)
for t, track in enumerate(rail_tracks):
    tp = track["p"]
    k = 0
    while k < len(tp):
        if tp[k][3] != 1: k += 1; continue
        e = k
        while e + 1 < len(tp) and tp[e + 1][3] == 1: e += 1
        if e > k:
            seg = shapely.LineString([q[:2] for q in tp[k:e + 1]])
            for j in road_tree.query(seg):
                j = int(j); o = pending[j]
                if not road_lines[j].crosses(seg): continue
                x = road_lines[j].intersection(seg); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"] | o["deck"]): continue
                kk = min(range(k, e + 1), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                head = tp[kk][2] - 0.9 - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
                dipped += ease_roads(x.x, x.y, head, set())
                dips.append((j, x))
        k = e + 1
if dipped: print(f"bridges: {dipped} road points dipped to pass under a bridge")

# 4. a path through the water (the data has no bridge) is a footbridge: its points well inside a
# pond or river are a span, just above the water; but a path along the water's edge, inside the
# data's rough outline of it, stands on the bank: the ground is kept up under it (r["bank"])
afloat = banked = 0
for r in pending:
    r["bank"] = set()
    if r["c"] not in PATHS: continue
    pl = shapely.LineString([q[:2] for q in r["run"]])
    for w in water_tree.query(pl):
        poly = water_polys[int(w)]
        if not poly.intersects(pl): continue
        near = poly.intersection(BM.buffer(200))     # (a river's polygon runs far past the terrain loaded here)
        ring = max(getattr(near, "geoms", [near]), key=lambda g: g.area if g.geom_type == "Polygon" else 0, default=None)
        if ring is None or ring.geom_type != "Polygon": continue
        coords = list(ring.exterior.coords)
        if len(coords) < 3: continue
        wz = min(elev(x, y) for x, y in coords[::max(1, len(coords) // 40)]) + 0.1
        if not cuts_water(poly, pl):     # (and above the water, not under it)
            edge = poly.buffer(BANKED)
            for i, q in enumerate(r["run"]):
                if i not in r["span"] and i not in r["deck"] and edge.contains(shapely.Point(q[:2])):
                    r["bank"].add(i); r["z"][i] = max(r["z"][i], wz + 0.6); banked += 1
            continue
        for i, q in enumerate(r["run"]):
            pt = shapely.Point(q[:2])
            if poly.contains(pt) and poly.exterior.distance(pt) > 1.5 and i not in r["deck"]:
                r["span"].add(i); r["z"][i] = max(r["z"][i], wz + 0.8); afloat += 1
if afloat: print(f"bridges: {afloat} path points over water carried as footbridges")
if banked: print(f"bridges: {banked} path points along the water's edge kept on its bank")

# the ground under every span is nobody's to flatten, except where a road dips under it; and
# where the survey has a hump under a span (the bridge filled in), it's cut down below the deck
PROTECT = np.zeros(grid.shape, dtype=bool)
for r in pending:
    if not r["span"]: continue
    half = RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.0
    for st in stretches(r["span"]):
        if len(st) < 4: continue
        inner = st[1:-1]
        line = shapely.LineString([r["run"][i][:2] for i in inner])
        poly = line.buffer(half, cap_style=2)
        win, inn = cover_xy(poly)
        PROTECT[win][inn] = True
        zs = [r["z"][i] for i in inner]
        px, py = GX[win][inn], GY[win][inn]
        if len(px):
            tt = np.array([line.project(shapely.Point(x, y)) for x, y in zip(px, py)]) / (line.length or 1) * (len(zs) - 1)
            lo = np.clip(tt.astype(int), 0, len(zs) - 2); fr = tt - lo
            deck = np.array(zs)[lo] + (np.array(zs)[lo + 1] - np.array(zs)[lo]) * fr
            blk = grid[win]; blk[inn] = np.minimum(blk[inn], deck - 0.6); grid[win] = blk
# (but every road at grade keeps its own ground, under a bridge or beside its abutments)
for o in pending:
    pts = [q[:2] for i, q in enumerate(o["run"]) if i not in o["span"] and i not in o["deck"]]
    if len(pts) < 2: continue
    for st in stretches({i for i in range(len(o["run"])) if i not in o["span"] and i not in o["deck"]}):
        if len(st) < 2: continue
        poly = shapely.LineString([o["run"][i][:2] for i in st]).buffer(RW.get(o["c"], 4) / 2 + 2.5, cap_style=2)
        win, inn = cover_xy(poly)
        PROTECT[win][inn] = False

path_ground = []     # (run, z, reach, only): those, flattened after the roads, which keep theirs
for r in pending:
    c, run, z, span, bored, tunnel_ranges = r["c"], r["run"], r["z"], r["span"], r["bored"], r["tunnel_ranges"]
    deck = r.get("deck", set())
    if bored or tunnel_ranges:
        flatten(run, z, TN.HALF + TN.CUT if bored else max(TN.HALF + TN.CUT, RW.get(c, 4) / 2 + 2.5), TN.cuttings(run, tunnel_ranges, bored))
    if c in PATHS and c != "pedestrian":     # (a pedestrianised street is still a street: its ground is flattened)
        # a path along the water's edge keeps its bank up under it, and a footbridge's ends
        # stand on ground brought up to its deck (an abutment, not a step down to the bank)
        if r["bank"]: path_ground.append((run, z, BANKED, r["bank"] | {i + 1 for i in r["bank"]} | {i - 1 for i in r["bank"]}))
        for st in stretches(span | deck):
            # (the ground is brought up off the bridge, from the abutment outwards: what the
            # bridge crosses keeps its own, however short the span)
            for end, out in ((st[0], st[0] - 1), (st[-1], st[-1] + 1)):
                q, zz = (run[out], z[out]) if 0 <= out < len(run) else (run[end], z[end])     # (or the way ends on the bridge)
                o2 = st[1] if len(st) > 1 and end == st[0] else st[-2] if len(st) > 1 else end
                vx, vy = q[0] - run[o2][0], q[1] - run[o2][1]; d = math.hypot(vx, vy)
                if d < 0.1 or zz - elev(q[0], q[1]) > 2.5: continue     # (a high deck ends on its own abutment, built by the game)
                path_ground.append(([q, [q[0] + vx / d * 3, q[1] + vy / d * 3, 0]], [zz, zz], BANKED, None))
        continue
    # the ground is flattened under the road, but not under a bridge's span: what it
    # crosses (the river, the railway, another road) keeps its own ground, and the game
    # builds the deck, its parapets and its abutments at the road's own height
    open_pts = {i for i in range(len(run)) if i not in span and i not in deck}
    if bored: open_pts &= {i for i0, i1 in TN.split(run, bored) for i in range(i0, i1 + 1)}
    flatten(run, z, RW.get(c, 4) / 2 + 2.5, None if len(open_pts) == len(run) else open_pts)
# the railway (tools/railway.py, <map>-rail.json): the ground is flattened under the track where it
# runs on the ground, as under a road, so it sits in its cuttings and on its embankments rather
# than through the hillside; not under its bridges and viaducts, nor over its tunnels
RAIL_HALF = 4.5
rail_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-rail.json")
if os.path.exists(rail_file):
    rail_runs = 0
    for t in json.load(open(rail_file))["tracks"]:
        run, z = [], []
        def rail_flush():
            global rail_runs
            if len(run) > 1: flatten(run, z, RAIL_HALF); rail_runs += 1
        for q in t["p"]:
            if q[3] == 0 and X0 - 60 <= q[0] <= X1 + 60 and Y0 - 60 <= q[1] <= Y1 + 60:
                run.append([q[0], q[1], 0]); z.append(q[2])
            else:
                rail_flush(); run, z = [], []
        rail_flush()
    if rail_runs: print(f"railway: the ground flattened under {rail_runs} stretches of track")
for run, z, reach, only in path_ground: flatten(run, z, reach, only, weak=True)
if tunnel_list:
    print("tunnels: " + ", ".join(f"{t['n'] or t['c']} {sum(math.dist(a[:2], b[:2]) for a, b in zip(t['p'], t['p'][1:])):.0f} m"
                                  for t in tunnel_list))
# blend: fully flat on the carriageway and its verge, then easing back to the natural ground
# over a distance that grows with the drop or rise, so a road in a cutting or on an embankment
# gets a slope beside it rather than a step
ease = np.clip(np.abs(grid - flat_z) * SLOPE, 2.5, EASE)
k = np.clip((flat_w - flat_f) / ease, 0, 1)
k = k * k * (3 - 2 * k)
k[np.isinf(flat_w)] = 1
grid = flat_z * (1 - k) + grid * k


def gelev0(x, y):
    fi, fj = (x - X0) / dx, (y - Y0) / dy
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = min(1, max(0, fi - i)), min(1, max(0, fj - j))
    return (grid[j, i] * (1 - u) + grid[j, i + 1] * u) * (1 - v) + (grid[j + 1, i] * (1 - u) + grid[j + 1, i + 1] * u) * v


# a span's marks run to where the deck meets the ground as it now is, so the game's deck reaches
# the banks rather than stopping short with a step down; then the roads are written out
grown = 0
for r in pending:
    if not r["span"]: continue
    run, z, n = r["run"], r["z"], len(r["run"])
    for st in stretches(set(r["span"])):
        a, b = st[0], st[-1]
        while a > 0 and a - 1 not in r["deck"] and z[a - 1] - gelev0(run[a - 1][0], run[a - 1][1]) > 0.3: a -= 1; r["span"].add(a); grown += 1
        while b < n - 1 and b + 1 not in r["deck"] and z[b + 1] - gelev0(run[b + 1][0], run[b + 1][1]) > 0.3: b += 1; r["span"].add(b); grown += 1
for r in pending:
    if not r["deck"]: continue
    run, z, n = r["run"], r["z"], len(r["run"])
    for st in stretches(set(r["deck"])):
        a, b = st[0], st[-1]
        while a > 0 and a - 1 not in r["span"] and z[a - 1] - gelev0(run[a - 1][0], run[a - 1][1]) > 0.3: a -= 1; r["deck"].add(a); grown += 1
        while b < n - 1 and b + 1 not in r["span"] and z[b + 1] - gelev0(run[b + 1][0], run[b + 1][1]) > 0.3: b += 1; r["deck"].add(b); grown += 1
if grown: print(f"bridges: spans run {grown} points further to where their decks meet the ground")
for r in pending:
    c, run, z, span, bored, deck = r["c"], r["run"], r["z"], r["span"], r["bored"], r.get("deck", set())
    # a bridge's points carry a fourth value: 1 on a span the game builds the bridge for, 2 on
    # a deck beside a road's span (a path along a bridge), at the road's height, with nothing built
    pts = [[r1(a), r1(b), r1(h)] + ([1] if i in span else [2] if i in deck else []) for i, ((a, b, _), h) in enumerate(zip(run, z))]
    for i0, i1 in TN.split(run, bored):
        roads.append(dict(c=c, n=r["n"], p=pts[i0:i1 + 1], **({"ow": r["ow"]} if r["ow"] else {})))
    for i0, i1 in bored:
        tunnel_list.append(dict(c=c, n=r["n"], p=pts[i0:i1 + 1]))
del pending
z0 = math.floor(grid.min()) if TILE is None else A.squares.z0     # every tile measures from the same height


def gelev(x, y):
    """Height of the (road-flattened) terrain grid as the game draws it: each cell is two
    triangles, split the same way as web/src/map.ts ground(), so nothing placed on a steep cell
    floats or sinks."""
    fi, fj = (x - X0) / dx, (y - Y0) / dy
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = min(1, max(0, fi - i)), min(1, max(0, fj - j))
    if u + v <= 1: return grid[j, i] + (grid[j, i + 1] - grid[j, i]) * u + (grid[j + 1, i] - grid[j, i]) * v
    return grid[j + 1, i + 1] + (grid[j + 1, i] - grid[j + 1, i + 1]) * (1 - u) + (grid[j, i + 1] - grid[j + 1, i + 1]) * (1 - v)


def dense_ring(pts):
    """A ring's corners, with points added every 4 m or so along each side."""
    dense = []
    for (a, b), (cc, d) in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(math.hypot(cc - a, d - b) // 4))
        dense += [(a + (cc - a) * s / n, b + (d - b) * s / n) for s in range(n)]
    return dense


if True:
    # ---- the water ------------------------------------------------------------------------------
    # Each piece lies at the lowest ground round its own edge and the ground under it is dug out
    # below that. A tile's water is cut into the tile and its eight neighbours: every tile works
    # out the same pieces round its edges, so a river bed meets its neighbour's exactly, and only
    # the tile's own pieces are written to the map. The detailed map's is cut to its box.
    if TILE is not None:
        def tile_box(a, b):
            return box(lat_x(a * CELLS), lat_y(b * CELLS), lat_x((a + 1) * CELLS), lat_y((b + 1) * CELLS))
        near_boxes = [((a, b), tile_box(a, b)) for a in (ti - 1, ti, ti + 1) for b in (tj - 1, tj, tj + 1)]
    else:
        near_boxes = [(None, BM)]
    wp, water_all, banks = [], [], []
    # the canal's water is at the levels tools/canal.py worked out (the map's own canal pieces are
    # left out by the game, which draws the canal from that file), so its bed and banks are dug
    # and sloped to those, not to the lowest bank of a piece that might run through a flight of locks
    canal_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-canal.json")
    canal_lv = None
    if os.path.exists(canal_file):
        cpts, clv = [], []
        for run in json.load(open(canal_file))["runs"]:
            for q in run["p"]: cpts.append((q[0], q[1])); clv.append(run["lv"])
        if cpts:
            ctree, clv = shapely.STRtree(shapely.points(np.array(cpts))), np.array(clv)
            canal_lv = lambda xs, ys: clv[ctree.nearest(shapely.points(np.column_stack([np.ravel(xs), np.ravel(ys)])))].reshape(np.shape(xs))
            cin = np.array([bool(f & 1) for run in json.load(open(canal_file))["runs"] for f in (q[6] for q in run["p"])])
            canal_in_tunnel = lambda xs, ys: cin[ctree.nearest(shapely.points(np.column_stack([np.ravel(xs), np.ravel(ys)])))].reshape(np.shape(xs))
            chalf = np.array([q[2] for run in json.load(open(canal_file))["runs"] for q in run["p"]])
            cxy = np.array(cpts)
            def canal_bed(xs, ys):
                """Is each point within the canal's own water (the run's half width, which canal.ts draws)?"""
                pts = shapely.points(np.column_stack([np.ravel(xs), np.ravel(ys)]))
                near = ctree.nearest(pts)
                d = np.hypot(np.ravel(xs) - cxy[near, 0], np.ravel(ys) - cxy[near, 1])
                return (d <= chalf[near] + 0.8).reshape(np.shape(xs))
    for g, p in L("water"):
        if p.get("class") == "sea" or not g.geom_type.endswith("Polygon"): continue
        is_canal = p.get("class") == "canal" and canal_lv is not None
        whole = transform(proj, g)
        if not whole.intersects(BM): continue
        if not whole.is_valid: whole = shapely.make_valid(whole)
        for at, q in near_boxes:
            if not whole.intersects(q): continue
            piece = whole.intersection(q)
            for poly in getattr(piece, "geoms", [piece]):
                if poly.geom_type != "Polygon" or poly.area <= 0: continue
                rings = [dense_ring(list(ring.coords)[:-1]) for ring in [poly.exterior, *poly.interiors]]
                wz = min(elev(x, y) for x, y in rings[0]) + 0.1
                entry = dict(r=[[[r1(x), r1(y)] for x, y in ring] for ring in rings], z=r1(wz), **({"c": "canal"} if is_canal else {}))
                water_all.append(entry)
                if at == TILE: wp.append(entry)
                if poly.intersects(BM):
                    # lidar over water is noisy and rarely below the banks: give the water a bed so it shows
                    win, wet = cover_xy(poly, edge=True)
                    wet &= ~flat_in[win]       # (never under a road at grade, or the railway: only under a bridge's span)
                    if is_canal:
                        # the bed, only as wide as the canal's own water: the rest of the piece is bank
                        lv = canal_lv(GX[win][wet], GY[win][wet])
                        bed = canal_bed(GX[win][wet], GY[win][wet]) & ~canal_in_tunnel(GX[win][wet], GY[win][wet])
                        blk = grid[win]; blk[wet] = np.where(bed, np.minimum(blk[wet], lv - 1.0), np.maximum(blk[wet], lv + 0.3)); grid[win] = blk
                    else:
                        grid[win][wet] = np.minimum(grid[win][wet], wz - 0.6)
                    banks.append((poly, None if is_canal else wz))
    # the banks: the ground within BANK metres of the water's edge slopes down to just above it,
    # instead of standing where the survey (which is noisy by water) left it, a cliff's drop
    # above; a road's flattened ground is left alone, so a road along the river stays up
    BUILT = np.zeros(grid.shape, dtype=bool)        # ground under and just round a building: a quay, not a bank
    for g, p in L("building"):
        for bp in whole_polys(g):
            win, inn = cover_xy(bp.buffer(2.5))
            BUILT[win][inn] = True
    for poly, wz in banks:
        edge = poly.exterior
        x0, y0, x1, y1 = poly.bounds
        i0, i1 = max(0, int((x0 - BANK - X0) / dx)), min(nx - 1, int((x1 + BANK - X0) / dx) + 1)
        j0, j1 = max(0, int((y0 - BANK - Y0) / dy)), min(ny - 1, int((y1 + BANK - Y0) / dy) + 1)
        if i1 < i0 or j1 < j0: continue
        win = (slice(j0, j1 + 1), slice(i0, i1 + 1))
        px, py = GX[win], GY[win]
        near = ~shapely.contains_xy(poly, px, py) & (flat_w[win] > flat_f[win] + 0.5) & ~BUILT[win]     # (not a road's flattened ground, nor a building's)
        if PROTECT is not None: near &= ~PROTECT[win]                                                   # (nor a bridge's abutments)
        if not near.any(): continue
        d = shapely.distance(edge, shapely.points(px[near], py[near]))
        s = np.clip(d / BANK, 0, 1); s = s * s * (3 - 2 * s)
        lip = (canal_lv(px[near], py[near]) if wz is None else wz) + 0.3
        want = lip + (grid[win][near] - lip) * s
        blk = grid[win]
        blk[near] = np.minimum(blk[near], want)
        grid[win] = blk
    # the canal's bed and banks along its own line (tools/canal.py), wherever the water polygons
    # fall short: the bed a metre under the water as wide as the water, the banks sloping down to
    # just above it, except in a tunnel, on an aqueduct, or under a road at grade (its flattened
    # ground, which a bridge over the canal leaves alone)
    if canal_lv is not None:
        cseg, clvs, chalfs, cflags = [], [], [], []
        for run in json.load(open(canal_file))["runs"]:
            pts = run["p"]
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                if max(a[0], b[0]) < X0 - 20 or min(a[0], b[0]) > X1 + 20 or max(a[1], b[1]) < Y0 - 20 or min(a[1], b[1]) > Y1 + 20: continue
                cseg.append(shapely.LineString([a[:2], b[:2]])); clvs.append(run["lv"]); chalfs.append(max(a[2], b[2])); cflags.append(a[6] | b[6])
        if cseg:
            ctree2 = shapely.STRtree(cseg)
            dug = 0
            for si, seg in enumerate(cseg):
                if cflags[si] & 3: continue
                half, lv = chalfs[si], clvs[si]
                win, near = cover_xy(seg.buffer(half + BANK), edge=True)
                if not near.any(): continue
                px, py = GX[win][near], GY[win][near]
                d = shapely.distance(seg, shapely.points(np.column_stack([px, py]))) - half
                blk = grid[win]; cur = blk[near]
                bed = d <= 0.8
                t = np.clip(d / BANK, 0, 1); e = t * t * (3 - 2 * t)
                lip = lv + 0.3
                want = np.where(bed, lv - 1.0, lip + (cur - lip) * e)
                keep = (flat_in[win][near] | BUILT[win][near] | (PROTECT[win][near] if PROTECT is not None else False)) & ~bed
                new = np.where(keep, cur, np.minimum(cur, want))
                dug += int((new < cur - 0.05).sum())
                blk[near] = new; grid[win] = blk
            if dug: print(f"canal: the ground dug or sloped at {dug} vertices along its line")
if TILE is not None:
    # from here on only the roads near the tile count (the rest were for the terrain)
    reach = box(X0 - 100, Y0 - 100, X1 + 100, Y1 + 100)
    roads = [r for r in roads if len(r["p"]) > 1 and shapely.LineString([q[:2] for q in r["p"]]).intersects(reach)]


# ---- ground types per terrain vertex ------------------------------------------
# 0 garden/grass, 1 pitch (and golf greens), 2 wood floor, 3 farmland/meadow, 4 cemetery,
# 5 hard standing (school, parking, retail), 6 flowerbed, 7 playground
GT = np.zeros(grid.shape, dtype=np.int8)
layers = []
for g, p in L("land_use"):
    c = p.get("class")
    t = {"pitch": 1, "green": 1, "tee": 1, "farmland": 3, "meadow": 3, "cemetery": 4, "retail": 5, "pedestrian": 5,
         "flowerbed": 6, "playground": 7}.get(c)
    if t is not None: layers.append((t, g))
for g, p in L("infrastructure"):
    if p.get("class") == "parking" and g.geom_type.endswith("Polygon"): layers.append((5, g))
woods, cover = [], []   # mapped woods (OSM), and coarse satellite forest cover that also spans gardens
for g, p in L("land"):
    if p.get("subtype") == "forest" and g.geom_type.endswith("Polygon"):
        layers.append((2, g)); woods += polys(g)
for g, p in L("land_cover"):
    if p.get("subtype") == "forest": cover += polys(g)
for t, g in layers:
    for poly in polys(g):
        win, inn = cover_xy(poly)
        GT[win][inn] = t

# ---- buildings ----------------------------------------------------------------
from buildings import classify

ROOF_RISE_TOP = 0.6   # how much of the roof counts as solid for bullets and collision
cand = []
if TILE is not None:
    # buildings this far past the margin are classed too, so a terrace that runs over the edge is
    # one terrace, the same from both sides
    WORK = box(X0 - 150, Y0 - 150, X1 + 150, Y1 + 150)
for g, p in L("building"):
    for poly in (polys(g) if TILE is None else whole_polys(g, WORK)):
        if TILE is not None:
            c = poly.centroid
            p = dict(p, _own=own(c.x, c.y))      # whole, in the tile holding its middle
        poly = poly.simplify(0.25)
        if poly.area < 6 or poly.geom_type != "Polygon": continue
        cand.append((poly, p))
# buildings whose roofs stand at different levels in the lidar (a mansion between lower links
# and wings, a house with a single-storey extension) are split where the levels change, and big
# irregular buildings (Prior Park, the schools) become rectangular wings, each with a roof of its own
from buildings import roof_parts, wings
lidar = None
if STORE is not None and not STORE.record: print("lidar: from the measurements")
else:
    try:
        from lidar import Lidar
        lidar = Lidar(os.path.join(src_dir, "lidar"), (lon0, lat0, kx, ky))
    except Exception as e:
        if STORE is not None: raise SystemExit(f"--measure needs the lidar: {e}")
        print("no lidar data:", e)
split, levels, reused = [], 0, 0
if KEEP:
    # the earlier build's footprints, to split a building the same way it did where this build's
    # lidar can't see the roof levels (so its measured parts can be carried over below)
    kept_polys = [shapely.Polygon(b["r"][0]) for b in KEEP if len(b["r"][0]) >= 3]
    kept_tree = shapely.STRtree(kept_polys)
if lidar is not None and TILE is None:
    lidar.preload(A.bbox)
    lidar.workers = os.cpu_count() or 1
if STORE is not None and not STORE.record:
    roof_levels = [STORE.get_roofs(poly) if poly.area > 80 else None for poly, p in cand]
else:
    roof_levels = each(lambda poly: roof_parts(poly, lidar.surface, lidar.ground) if lidar is not None and poly.area > 80 else None,
                       [poly for poly, p in cand])
    if STORE is not None: roof_levels = STORE.put_roofs([poly for poly, p in cand], roof_levels)
for (poly, p), lv in zip(cand, roof_levels):
    church = (p.get("class") in ("church", "chapel") or "Chapel" in name(p) or name(p) == "Holy Trinity")
    parts = [poly]
    if lv is not None:
        parts = lv
        levels += len(parts) - 1
    if KEEP and len(parts) == 1 and poly.area > 80:
        found = [kept_polys[int(k)] for k in kept_tree.query(poly) if kept_polys[int(k)].centroid.within(poly)]
        if len(found) >= 2 and 0.85 * poly.area <= sum(f.area for f in found) <= 1.15 * poly.area:
            parts = found
            reused += 1
    if not church:
        parts = [w for part in parts for w in (wings(part) if part.area > 400 else [part])]
    if len(parts) > 1:
        split += [(w, dict(p, _whole=poly.area, _whole_geom=poly)) for w in parts]
    else:
        split.append((poly, p))
print(f"split buildings: {levels} more parts where roof levels change" + (f", {reused} split as the earlier build did" if reused else ""))
print(f"split buildings: {len(split) - len(cand)} more footprints in all")
cand = split

# tree canopy heights (Meta / WRI), for trees, hedges and shrubs, and for spotting trees over roofs
canopy = None
canopy_grid = None
try:
    if STORE is not None and not STORE.record: raise FileNotFoundError("from the measurements")
    from canopy import Canopy
    canopy = Canopy(os.path.join(src_dir, "canopy"), A.bbox if TILE is None else (W - 0.0003, S - 0.0002, E + 0.0003, N + 0.0002),
                    (lon0, lat0, kx, ky))
    canopy.aligned = TILE is not None
except Exception as e:
    if STORE is not None and STORE.record: raise SystemExit(f"--measure needs the canopy map: {e}")
    print("no canopy data:", e)

# real heights and roof shapes from Environment Agency lidar, where the tiles are present
measured = None
try:
    if STORE is None:
        if lidar is None: raise FileNotFoundError("no lidar tiles")
        measured = each(lambda poly: lidar.measure(poly, canopy.at if canopy is not None else None), [c[0] for c in cand])
    else:
        # what the survey shows, kept or read back, then judged here
        import lidar as LD
        if STORE.record: surveyed = STORE.put_buildings([c[0] for c in cand], each(lambda poly: lidar.survey(poly, canopy.at if canopy is not None else None), [c[0] for c in cand]))
        else: surveyed = STORE.get_buildings([c[0] for c in cand])
        measured = [LD.decide(c[0], got) for c, got in zip(cand, surveyed)]
    print(f"lidar: measured {sum(1 for x in measured if x)} of {len(cand)} buildings "
          f"({sum(1 for x in measured if x and x['flat'])} flat, {sum(1 for x in measured if x and x['hipped'])} hipped)")
except Exception as e:
    print("no lidar data:", e)
# wall materials from energy certificates, where the data is present (see tools/epc.py)
certs = None
try:
    import epc
    homes = epc.load(os.path.join(src_dir, "epc"), A.bbox, proj)
    certs = epc.per_building(homes, [c[0] for c in cand])
    print(f"epc: {len(homes)} addresses, {sum(1 for c in certs if c)} buildings, "
          f"{sum(1 for c in certs if c and c['wall'])} with a known wall, {sum(1 for c in certs if c and c['bungalow'])} bungalows")
except FileNotFoundError as e:
    print("no EPC data:", e)
# the random choices for each building come from where it stands (see buildings.classify), as do
# those along each street and at each door below, so a rebuild comes out the same, a change in one
# place doesn't reshuffle the rest, and a tile picks the same as its neighbour where they overlap
keys = [(lambda c: zlib.crc32(f"{c.x:.1f},{c.y:.1f}".encode()))(poly.centroid) for poly, _ in cand]
info = classify([c[0] for c in cand], [c[1] for c in cand], rnd, A.zones, A.default_zone, measured, certs, keys)
if TILE is not None:
    # the buildings past the margin were only there to be classed
    near_m = [i for i, c in enumerate(cand) if c[0].intersects(BM)]
    cand, info, keys = [cand[i] for i in near_m], [info[i] for i in near_m], [keys[i] for i in near_m]
# tree heights from the lidar too, now the roofs under trees have been measured against the Meta map
if canopy is not None and lidar is not None:
    canopy.refine(lidar, [c[0] for c in cand])
    print("canopy: tree heights from lidar")
# (and the canopy from here on is what the measurements keep of it, measuring or not)
if STORE is not None:
    canopy = STORE.put_canopy(canopy) if STORE.record else STORE.get_canopy()
    if STORE.missed: print(f"measurements: {STORE.missed} footprints not measured (changed since), left to the guess")
# hand-made landmarks from the map's own pack, if it has one (see tools/landmarks): it may stand a
# landmark in place of a building part (a portico the lidar shows as a low block on the front)
import landmarks
from types import SimpleNamespace
pack = landmarks.load(A.landmarks)
ctx = SimpleNamespace(
    buildings=[dict(poly=c[0], whole=c[1].get("_whole_geom", c[0]), name=name(c[1]), props=c[1], eaves=b["eaves"], ridge=b["eaves"] + (b["roof"]["rise"] if b["roof"] else 0))
               for c, b in zip(cand, info)],
    places=L("place"), proj=proj, gelev=gelev)
gone = landmarks.replaced(pack, ctx)
fresh = [bool(m) for m in measured] if measured else [False] * len(cand)   # measured by this build's lidar
if gone:
    cand = [c for i, c in enumerate(cand) if i not in gone]
    info = [b for i, b in enumerate(info) if i not in gone]
    fresh = [f for i, f in enumerate(fresh) if i not in gone]
    if keys is not None: keys = [k for i, k in enumerate(keys) if i not in gone]
blds, footprints = [], []
for (poly, p), b in zip(cand, info):
    ring = [[r1(a), r1(c)] for a, c in list(poly.exterior.coords)[:-1]]
    holes = [[[r1(a), r1(c)] for a, c in list(r.coords)[:-1]] for r in poly.interiors]
    ground = min(gelev(x, y) for x, y in ring)
    top = max(gelev(x, y) for x, y in ring)
    out = dict(r=[ring, *holes], h=round(b["eaves"], 1), g=r1(ground), c=b["kind"], n=name(p),
               m={"stone": "s", "brick": "k", "buff": "y", "render": "r"}[b["wall"]], rc=b["cover"][0], w=1 if b["windows"] else 0, dz=r1(top - ground))
    if b["roof"]:
        out["rr"] = [[r1(x), r1(y)] for x, y in b["roof"]["rect"]]
        out["rp"] = round(b["roof"]["rise"], 1)
        out["hp"] = [round(v, 1) for v in b["roof"]["hips"]]
    if b["chim"]:
        out["ch"] = [[r1(x), r1(y)] for x, y in b["chim"]]
    if b["parapet"]:
        out["pp"] = b["parapet"]
    if b["storeys"]:
        out["st"] = b["storeys"]
    blds.append(out)
    footprints.append(poly)

# ---- how wide the pedestrianised streets are ---------------------------------------------
# A street in town that's closed to traffic is paved from one row of shopfronts to the other, so
# its width comes from the buildings either side of it rather than being the same for them all:
# from each point, look across to the first wall on each side (up to 15 m), and pave out as far
# as the further of the two (the mapped line isn't always down the street's middle; the extra on
# the near side is under the buildings). Where only one side has a wall (a square, a park), the
# paving reaches it; where neither does, the street keeps the usual width. The widths are
# smoothed along the street, and the street is cut where its width changes, so each piece has
# one width, "w" (metres across). A point's width depends only on the buildings round it, so a
# street that crosses into the next square of Bath has the same width on both sides of the join.
PED_REACH, PED_DEFAULT = 15.0, 6.0          # (6 m: the width web/src/world.ts gives one with none)
fp_tree = shapely.STRtree(footprints)


def wall_to_wall(x, y, ux, uy):
    """Half the paved width at (x, y), for a street running along (ux, uy); None inside a building."""
    pt = Point(x, y)
    if any(footprints[int(k)].contains(pt) for k in fp_tree.query(pt)): return None
    seen = []
    for s in (1, -1):
        ray = shapely.LineString([(x, y), (x - uy * s * PED_REACH, y + ux * s * PED_REACH)])
        hits = [pt.distance(ray.intersection(footprints[int(k)])) for k in fp_tree.query(ray, predicate="intersects")]
        if hits: seen.append(min(hits))
    if not seen: return None
    return min(PED_REACH, max(max(seen), 1.5 if len(seen) == 2 else PED_DEFAULT / 2))


def rw(r):
    """A road's width in metres: its own, if it has one (a pedestrianised street, or one the lidar
    shows is narrower), else its class's."""
    return r.get("w") or RW.get(r["c"], 4)


def pave(r):
    """How wide the wider pavement of a kerbed street is: its own, where narrowed (see tools/roadwidth.py), else 1.7 m."""
    return max(r.get("pv", [1.7]))


ped_roads, widened = [], 0
for r in roads:
    pts = r["p"]
    if r["c"] != "pedestrian" or len(pts) < 2:
        ped_roads.append(r); continue
    halves = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        halves.append(wall_to_wall(pts[i][0], pts[i][1], (b[0] - a[0]) / l, (b[1] - a[1]) / l))
    # the middle of the widths within three points either way: a side alley or a doorway's recess
    # doesn't widen the street
    widths = []
    for i in range(len(pts)):
        near = [h for h in halves[max(0, i - 3):i + 4] if h is not None]
        widths.append(round(2 * float(np.median(near)) * 2) / 2 if near else PED_DEFAULT)
    if any(len(q) > 3 for q in pts):        # a street on a bridge stays in one piece
        ped_roads.append(dict(r, w=float(np.median(widths)))); continue
    start = 0
    for i in range(1, len(pts) + 1):
        if i == len(pts) or widths[i] != widths[start]:
            piece = pts[max(0, start - 1):i]       # each piece starts where the one before ended
            if len(piece) > 1: ped_roads.append(dict(r, p=piece, w=widths[start]))
            start = i
    widened += 1
roads = ped_roads
print(f"pedestrian streets: {widened} measured wall to wall")

# ---- walls, fences and hedges the lidar sees (tools/walls.py) -------------------------------
# found first, looking into the streets as far as each could narrow, so the streets can then be
# fitted between them (below); they're added to the map with the other walls further on
found_walls = []
if STORE is not None and not STORE.record and not os.environ.get("NO_LIDAR_WALLS"):
    found_walls = STORE.get_walls() or []
    if STORE.get_walls() is None: print("walls: none in the measurements (measure afresh to find them in the lidar)")
    elif TILE is not None:
        # one finding for each place: a wall found in the lidar belongs to the square its middle is
        # in, so where two squares overlap (each is built over a margin round it) both have the same
        # walls there, taken from the square they belong to, and lay the same gardens round them
        import mapdata
        def _middle(w):
            line = shapely.LineString([q[:2] for q in w["p"]])
            return line.interpolate(0.5, normalized=True)
        def _of(a, b, walls):
            sq = box(lat_x(a * CELLS), lat_y(b * CELLS), lat_x((a + 1) * CELLS), lat_y((b + 1) * CELLS))
            return [w for w in walls if len(w["p"]) > 1 and sq.contains(_middle(w))]
        found_walls = _of(ti, tj, found_walls)
        for a in (ti - 1, ti, ti + 1):
            for b in (tj - 1, tj, tj + 1):
                there = os.path.join(os.path.dirname(STORE.path), f"{a}_{b}.zip")
                if (a, b) == (ti, tj) or not os.path.exists(there): continue
                found_walls += [w for w in _of(a, b, mapdata.Store(there).get_walls() or [])
                                if BM.intersects(shapely.LineString([q[:2] for q in w["p"]]))]
        found_walls.sort(key=lambda w: (round(w["p"][0][0], 1), round(w["p"][0][1], 1)))
elif lidar is not None and not os.environ.get("NO_LIDAR_WALLS"):
    from walls import lidar_walls
    from buildings import zone_at
    from roadwidth import NARROWEST
    BX0, BY0, BX1, BY1 = BM.bounds
    STEP_W = 1100.0           # (the survey is read a square at a time)
    for bx in np.arange(BX0, BX1, STEP_W):
        for by in np.arange(BY0, BY1, STEP_W):
            found_walls += lidar_walls(lidar, (bx, by, min(BX1, bx + STEP_W), min(BY1, by + STEP_W)), footprints, roads, rw,
                                       {"primary", "secondary", "tertiary", "residential", "unclassified"},
                                       lambda x, y: zone_at(A.zones, x, y, A.default_zone),
                                       inner_width=lambda r: min(rw(r), NARROWEST.get(r["c"], 3.5)))
    if STORE is not None: found_walls = STORE.put_walls(found_walls)

# ---- how wide the other streets are: OpenStreetMap, fitted between the walls (tools/roadwidth.py) --
from shops import load_osm
osm_roads = load_osm(os.path.join(src_dir, "osm-roads.geojson"), proj)
if (found_walls or osm_roads) and not os.environ.get("NO_LIDAR_WIDTHS"):
    from roadwidth import measure
    obstacles = [shapely.LineString(w["p"]) for w in found_walls] + [f.exterior for f in footprints]
    roads, narrowed = measure(obstacles, roads, RW, {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified"}, osm_roads,
                              houses=len(found_walls))
    print(f"streets: {narrowed} narrowed to OpenStreetMap's widths and pavements, and to the walls either side in the lidar"
          + ("" if osm_roads else " (no osm-roads.geojson)"))

# ---- no street runs through a house ----------------------------------------------------------
# Buildings went down first and don't move: where a street's line runs on through one (a drive
# mapped on into a garage, a lane drawn across a house), the street stops at its wall, half a
# metre short. Its width was fitted between the buildings either side above.
def _through_buildings(roads):
    inner = [f.buffer(-0.3) for f in footprints]
    inner = [g for g in inner if not g.is_empty]
    if not inner: return roads, 0
    btree = shapely.STRtree(inner)
    out, cut = [], 0
    for r in roads:
        if r["c"] in PATHS or len(r["p"]) < 2 or any(len(q) > 3 for q in r["p"]):
            out.append(r); continue
        line = shapely.LineString([tuple(q[:3]) for q in r["p"]])
        hit = [inner[int(k)] for k in btree.query(line) if inner[int(k)].intersection(line).length > 1.0]
        if not hit: out.append(r); continue
        rest = line.difference(unary_union([h.buffer(0.8) for h in hit]))
        cut += 1
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type == "LineString" and piece.length >= 3:
                out.append(dict(r, p=[[r1(x), r1(y), r1(z)] for x, y, z in piece.coords]))
    return out, cut
roads, _cut = _through_buildings(roads)
print(f"streets: {_cut} stop at a building they ran through")

# ---- footpaths: none runs along a carriageway --------------------------------------------------
# A footpath mapped down the middle of a street (a pavement drawn as the street's centre line, or a
# cycle lane) is the street: the stretch of it lying along a carriageway is left out. One crossing
# the street is kept.
def _along_streets(roads):
    cars = [(shapely.LineString([q[:2] for q in r["p"]]), rw(r)) for r in roads if r["c"] not in PATHS and len(r["p"]) > 1]
    if not cars: return roads, 0
    areas = [L.buffer(w / 2, cap_style=2) for L, w in cars]
    ctree = shapely.STRtree(areas)
    out, cut = [], 0.0
    for r in roads:
        if r["c"] not in PATHS or r["c"] == "pedestrian" or len(r["p"]) < 2 or any(len(q) > 3 for q in r["p"]):
            out.append(r); continue
        line = shapely.LineString([tuple(q[:3]) for q in r["p"]])
        near = [int(k) for k in ctree.query(line)]
        if not near: out.append(r); continue
        drop = []
        for k in near:
            inside = areas[k].intersection(line)
            for part in getattr(inside, "geoms", [inside]):
                if part.geom_type != "LineString" or part.length < 3: continue
                a, b = part.coords[0], part.coords[-1]
                road = cars[k][0]
                ta, tb = road.project(shapely.Point(a[:2])), road.project(shapely.Point(b[:2]))
                if abs(tb - ta) > 0.8 * part.length: drop.append(part.buffer(0.05, cap_style=2))   # (running along it, not across)
        if not drop: out.append(r); continue
        rest = line.difference(unary_union(drop))
        cut += line.length - rest.length
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type == "LineString" and piece.length >= 2:
                out.append(dict(r, p=[[r1(x), r1(y), r1(z)] for x, y, z in piece.coords]))
    return out, cut
roads, _cut = _along_streets(roads)
print(f"footpaths: {_cut / 1000:.1f} km lying along a street's carriageway left out")

# ---- gardens: plot boundaries, gates and drives ---------------------------------
from gardens import plots
KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
corridor = [shapely.LineString([(a, b) for a, b, *_ in r["p"]]).buffer(
    rw(r) / 2 + (pave(r) if r["c"] in KERBED else 0.3), cap_style=2)
    for r in roads if len(r["p"]) > 1]
OPEN = {"park", "recreation_ground", "pitch", "playground", "grass", "cemetery", "village_green", "common", "meadow"}
open_land = [poly for g, p in L("land_use") if p.get("class") in OPEN for poly in polys(g)]
front, side, gates, drives = plots([c[0] for c in cand], info, corridor, BM.bounds, rnd, open_land, keys,
                                   fronts=[r["c"] not in PATHS for r in roads if len(r["p"]) > 1])
garden_br = []
for style, line in front + side:
    n = max(1, int(math.ceil(line.length / 2.5)))
    pts = [line.interpolate(k / n, normalized=True) for k in range(n + 1)]
    garden_br.append(dict(c=style, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))

gate_list = [[r1(x0), r1(y0), r1(x1), r1(y1), r1(gelev((x0 + x1) / 2, (y0 + y1) / 2)), st] for x0, y0, x1, y1, st in gates]

# ---- sports pitches: football and rugby pitches and cricket fields ----------------------
from pitches import pitches
pitch_list = pitches(L("land_use"), polys if TILE is None else whole_polys)   # a tile's whole, by their middle

# ---- named places, for telling players where they are off the streets ------------------------
WIDE = {"protected_landscape_seascape", "wilderness_area", "species_management_area"}
places = []
for f in ("land_use", "water"):
    for g, p in L(f):
        n = name(p)
        if not n or p.get("class") in WIDE or p.get("class") == "sea" or not g.geom_type.endswith("Polygon"): continue
        for poly in polys(g):
            if not 300 < poly.area < 600000: continue
            ring = list(poly.simplify(2.0).exterior.coords)[:-1]
            if len(ring) >= 3: places.append((poly.area, dict(n=n, r=[[r1(x), r1(y)] for x, y in ring])))
if TILE is not None:
    # a tile's: judged by the whole place's size, then cut to the tile
    places = []
    for f in ("land_use", "water"):
        for g, p in L(f):
            n = name(p)
            if not n or p.get("class") in WIDE or p.get("class") == "sea" or not g.geom_type.endswith("Polygon"): continue
            for poly in whole_polys(g, TBOX):
                if not 300 < poly.area < 600000: continue
                cut = poly.intersection(TBOX)
                for piece in getattr(cut, "geoms", [cut]):
                    if piece.geom_type != "Polygon" or piece.area < 1: continue
                    ring = list(piece.simplify(2.0).exterior.coords)[:-1]
                    if len(ring) >= 3: places.append((poly.area, dict(n=n, r=[[r1(x), r1(y)] for x, y in ring])))
places = [p for _, p in sorted(places, key=lambda t: t[0])]   # smallest first, so the most specific wins

# ---- streams (the ponds and rivers were done with the terrain) ----------------------------
wl = []
for g, p in L("water"):
    if p.get("class") == "sea": continue
    if g.geom_type.endswith("LineString"):
        for coords in line_coords(g):
            for run in densify_runs(coords, 4.0):
                wl.append(dict(c=p.get("class"), p=[[r1(x), r1(y), r1(gelev(x, y))] for x, y, _ in run]))

# ---- barriers: walls, fences, hedges --------------------------------------------
br = []
for g, p in L("infrastructure"):
    c = p.get("class")
    if p.get("subtype") != "barrier" or c not in ("wall", "fence", "hedge", "retaining_wall"): continue
    lines = [list(r.coords) for r in getattr(g, "geoms", [g]) for r in ([r.exterior] if r.geom_type == "Polygon" else [r])]
    for coords in lines:
        for run in densify_runs(coords, 3.0):
            br.append(dict(c=c, p=[[r1(x), r1(y), r1(gelev(x, y))] for x, y, _ in run]))

# ---- trees ----------------------------------------------------------------------
# Real tree positions and heights from the canopy height map where it is available; otherwise
# woods are scattered with trees and gardens lightly.
trees = []
if canopy is not None:
    # a street's hard surface: its carriageway, and its pavements where it has kerbs (as drawn in
    # web/src/world.ts); footpaths and steps count too, so no trunk stands in a path
    KERBED, PAVE = {"primary", "secondary", "tertiary", "residential", "unclassified"}, 1.7
    street_lines = [(shapely.LineString([(a, b) for a, b, *_ in r["p"]]), rw(r) / 2 + (pave(r) if r["c"] in KERBED else 0), r["c"])
                    for r in roads if len(r["p"]) > 1]
    street_tree = shapely.STRtree([l.buffer(w + 0.3) for l, w, _ in street_lines])
    houses = shapely.STRtree([f.buffer(0.6) for f in footprints])
    # In the middle of town the lidar's "tree tops" against a building are its cornices, signs
    # and eaves (the surveyed roof is a little off the mapped footprint): a crown can't grow into
    # a wall, so a top within 2 m of one there isn't a tree, and nor is one within 3 m of a
    # shopfront in a pedestrianised street. The trees in the squares (Abbey Green, Kingsmead
    # Square, Orange Grove) stand well clear.
    from buildings import zone_at
    TOWN = {"bath", "georgian"}
    walls = shapely.STRtree(footprints)
    against = lambda x, y, d: len(walls.query(shapely.Point(x, y).buffer(d), predicate="intersects")) > 0
    town_tops = 0
    tops = canopy.tree_tops(min_height=3.5, radius_m=3.0)
    for (x, y, h) in tops:
        if not inside(x, y): continue
        if zone_at(A.zones, x, y, A.default_zone) in TOWN and against(x, y, 2.0): town_tops += 1; continue
        # a street tree's crown hangs over the road: stand its trunk on the verge instead; one in
        # a paved square or a pedestrianised street stands where it is, clear of the shopfronts
        hits = [street_lines[int(k)] for k in street_tree.query(shapely.Point(x, y), predicate="intersects")]
        if hits and all(cls == "pedestrian" for _, _, cls in hits):
            if against(x, y, 3.0): town_tops += 1; continue
            hits = []
        for line, w, cls in hits:
            if cls == "pedestrian": continue
            s = line.project(shapely.Point(x, y))
            c = line.interpolate(s)
            p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
            ex, ey = p1.x - p0.x, p1.y - p0.y      # not dx/dy: those are the terrain grid spacing
            l = math.hypot(ex, ey) or 1
            side = 1 if (x - c.x) * -ey + (y - c.y) * ex >= 0 else -1
            x, y = c.x - ey / l * (w + 0.8) * side, c.y + ex / l * (w + 0.8) * side
            break
        if len(houses.query(shapely.Point(x, y), predicate="intersects")): continue
        if any(street_lines[int(k)][2] != "pedestrian" for k in street_tree.query(shapely.Point(x, y), predicate="intersects")): continue   # moved onto another street
        # the tree model is about 7.5 x its scale tall
        trees.append([r1(x), r1(y), r1(gelev(x, y)), round(min(2.6, max(0.35, h / 7.5)), 2)])
    if town_tops: print(f"trees: {town_tops} lidar tops against buildings in town left out")
    # Woods are drawn as one continuous canopy with trunks underneath: a grid of canopy heights
    # over the woods (0 elsewhere), and trees inside woods are marked trunk-only.
    if woods:
        import base64
        wood_all = unary_union(woods).buffer(3)
        STEP_C = 4.0
        cx0, cy0, cx1, cy1 = wood_all.bounds
        cnx, cny = int((cx1 - cx0) / STEP_C) + 2, int((cy1 - cy0) / STEP_C) + 2
        GXc, GYc = np.meshgrid(cx0 + np.arange(cnx) * STEP_C, cy0 + np.arange(cny) * STEP_C)
        inw = shapely.contains_xy(wood_all, GXc, GYc)
        hc = np.zeros((cny, cnx), dtype=np.uint8)
        for j, i in zip(*np.nonzero(inw)):
            v = canopy.at(GXc[j, i], GYc[j, i])
            hc[j, i] = int(min(40, v)) if v >= 4 else 0
        canopy_grid = dict(x0=r1(cx0), y0=r1(cy0), step=STEP_C, nx=cnx, ny=cny,
                           h=base64.b64encode(hc.tobytes()).decode())
        if TILE is not None:
            # a tile's canopy cells are the terrain grid's cells, so its woods meet the next tile's
            # without a gap or an overlap: cell (i, j) of the tile is centred in terrain cell (i, j)
            canopy_grid = None
            wood_t = wood_all.intersection(TBOX)
            if not wood_t.is_empty:
                bx0, by0, bx1, by1 = wood_t.bounds
                ci0, cj0 = max(0, int((bx0 - TX0) / D)), max(0, int((by0 - TY0) / D))
                ci1, cj1 = min(CELLS - 1, int((bx1 - TX0) / D)), min(CELLS - 1, int((by1 - TY0) / D))
                cnx, cny = ci1 - ci0 + 1, cj1 - cj0 + 1
                cx = np.array([TX0 + (ci0 + i + 0.5) * D for i in range(cnx)])
                cy = np.array([TY0 + (cj0 + j + 0.5) * D for j in range(cny)])
                GXc, GYc = np.meshgrid(cx, cy)
                inw = shapely.contains_xy(wood_all, GXc, GYc)
                hc = np.zeros((cny, cnx), dtype=np.uint8)
                for j, i in zip(*np.nonzero(inw)):
                    v = canopy.at(GXc[j, i], GYc[j, i])
                    hc[j, i] = int(min(40, v)) if v >= 4 else 0
                if hc.any():
                    canopy_grid = dict(x0=float(cx[0]), y0=float(cy[0]), step=D, nx=cnx, ny=cny,
                                       h=base64.b64encode(hc.tobytes()).decode())
        in_wood = shapely.contains_xy(unary_union(woods), np.array([t[0] for t in trees]), np.array([t[1] for t in trees]))
        for t, w in zip(trees, in_wood):
            if w: t.append(1)
else:
    blocked = unary_union([f.buffer(2.5) for f in footprints] +
                          [shapely.LineString([(a, b) for a, b, *_ in r["p"]]).buffer(rw(r) / 2 + 1.5)
                           for r in roads if len(r["p"]) > 1])
    wood = unary_union(woods).difference(blocked) if woods else None
    garden = unary_union(cover).difference(blocked).difference(unary_union(woods)) if cover else None

    def scatter(area, SP):
        x_a, y_a, x_b, y_b = area.bounds
        ys = np.arange(y_a, y_b, SP)
        for jy, yy in enumerate(ys):
            xs = np.arange(x_a + (SP / 2 if jy % 2 else 0), x_b, SP)
            jx = xs + np.array([rnd.uniform(-2.4, 2.4) for _ in xs])
            jy_ = yy + np.array([rnd.uniform(-2.4, 2.4) for _ in xs])
            ok = shapely.contains_xy(area, jx, jy_)
            for x, y in zip(jx[ok], jy_[ok]):
                trees.append([r1(x), r1(y), r1(gelev(x, y)), round(rnd.uniform(0.75, 1.35), 2)])

    if wood is not None and not wood.is_empty: scatter(wood, 7.5)
    if garden is not None and not garden.is_empty: scatter(garden, 22.0)

# ---- street furniture, signs, lamps, markings and parked cars --------------------
from streets import street_furniture
fx, marks = street_furniture(roads, L("infrastructure"), gate_list, RW, gelev, proj, inside, rnd, keyed=True)

# ---- shop signs ----------------------------------------------------------------
from shops import businesses, shop_signs
found, shop_log = businesses(src_dir, A.bbox, proj, [c[0] for c in cand], info, L("place"), inside,
                             getattr(pack, "SIGN_NAMES", None), getattr(pack, "SIGN_SKIP", ()))
for line in shop_log: print("shops:", line)
src_count = {s: sum(1 for b in found if b["src"] == s) for s in ("osm", "fsa", "overture")}
print(f"shops: {len(found)} businesses ({', '.join(f'{n} {s}' for s, n in src_count.items() if n)})")
signs, pubs = shop_signs(found, [c[0] for c in cand], roads, gelev)
for bi in pubs:
    # pubs here are mid-19th-century ashlar with low hipped slate roofs (the Hadley Arms)
    b = blds[bi]
    b.update(m="s", rc="s")
    if "rr" in b:
        d = math.dist(b["rr"][1], b["rr"][2])
        b["hp"] = [round(d / 2, 1), round(d / 2, 1)]
        b["rp"] = round(b["rp"] * 0.75, 1)

# ---- walls, fences and hedges the lidar sees (tools/walls.py) -------------------------------
# Far more of them than the map data has. Where one runs along a guessed garden boundary it takes
# that boundary's place, and where the data already maps a wall there the mapped one is kept.
lidar_br = []
if found_walls:
    # a lidar wall that lies along a mapped one (most of its length within 1.5 m) is that wall
    mapped = [shapely.LineString([(x, y) for x, y, _ in b["p"]]) for b in br if len(b["p"]) > 1]
    mtree = shapely.STRtree(mapped) if mapped else None
    for w in found_walls:
        line = shapely.LineString(w["p"])
        if not inside(*line.centroid.coords[0]): continue
        if mtree is not None:
            near = [mapped[int(k)].buffer(1.5) for k in mtree.query(line.buffer(1.5))]
            if near and line.intersection(unary_union(near)).length > 0.6 * line.length: continue
        n = max(1, int(math.ceil(line.length / 2.5)))
        pts = [line.interpolate(k / n, normalized=True) for k in range(n + 1)]
        lidar_br.append(dict(c=w["c"], h=w["h"], p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))
    print(f"walls: {len(lidar_br)} seen in the lidar ({sum(1 for w in lidar_br if w['c'] == 'hedge')} hedges), "
          f"{sum(shapely.LineString([q[:2] for q in w['p']]).length for w in lidar_br) / 1000:.1f} km")
# a wall mapped twice (both its faces, two surveys of it, or a wall and a fence mapped along one
# line), or seen twice in the lidar, is kept once: the lidar can trace both sides of a thick hedge, or
# a fence inside one, a metre or so apart. The solid one is laid first (a wall before a fence before a
# hedge), the longer first among alike.
from gardens import _network
SOLID = {"wall": 0, "retaining_wall": 0, "stone_wall": 0, "brick_wall": 0, "fence": 1, "hedge": 2}
def _once(walls, taken=(), near=1.2):
    lines = sorted(((k, shapely.LineString([q[:2] for q in b["p"]])) for k, b in enumerate(walls) if len(b["p"]) > 1),
                   key=lambda kl: (SOLID.get(walls[kl[0]]["c"], 1), -kl[1].length))
    out = []
    for k, line in _network(lines, taken=taken, near=near):
        n = max(1, int(math.ceil(line.length / 2.5)))
        out.append(dict(walls[k], p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in (line.interpolate(i / n, normalized=True) for i in range(n + 1))]))
    return out
br = _once(br)
lidar_br = _once(lidar_br, taken=[shapely.LineString([q[:2] for q in b["p"]]) for b in br])
# A guessed garden boundary, front or side, gives way to a real wall (mapped or seen in the lidar)
# running along it; what's left of it is run on to meet the real wall where it stops just short,
# so the fences join it at the corners. (A gate left without its wall moves onto the real one, below.)
# a wall, fence or hedge cut or trimmed keeps its own corners: its points are kept, with more added
# where they're over 2.5 m apart (spacing them out evenly instead would cut its corners, onto a
# pavement or across another wall)
def _lay(piece):
    pts = list(piece.coords)
    out_ = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.ceil((math.dist(a, b) - 0.5) / 2.5)))      # (not a step already about 2.5 m)
        out_ += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return [[r1(x), r1(y), r1(gelev(x, y))] for x, y in out_]


real = [shapely.LineString([q[:2] for q in b["p"]]) for b in br + lidar_br if len(b["p"]) > 1]
if real:
    # the guessed boundaries are laid again, in their own order, as one network with the real walls
    # already down: each keeps 2 m off a real wall and half a metre off another guessed one, so two
    # boundaries that met at a corner by a real wall run on to it once, not side by side
    was = sum(shapely.LineString([q[:2] for q in b["p"]]).length for b in garden_br if len(b["p"]) > 1)
    garden_br = [dict(c=c, p=_lay(line)) for c, line in
                 _network([(b["c"], shapely.LineString([q[:2] for q in b["p"]])) for b in garden_br if len(b["p"]) > 1],
                          taken=real, near=0.5, shortest=1.0, taken_near=2.0)]
    now = sum(shapely.LineString([q[:2] for q in b["p"]]).length for b in garden_br)
    print(f"gardens: {(was - now) / 1000:.1f} km of guessed boundary gave way to real walls")

# ---- the landmarks (they need the water and the pitches; the walls below are kept off them) -----
ctx.water = water_all
ctx.pitches = pitch_list
marks_lm = landmarks.place(pack, ctx)

# ---- walls, fences and hedges are kept clear, once the streets are final ------------------------
# Every wall is cut here and nowhere later, so the gates and the small things that follow are placed
# against the walls as they'll stand:
#  - a gap where a street or path actually crosses one (a wall running alongside a street, a front
#    garden wall at the back of the pavement, is left whole);
#  - nothing on a street's carriageway or pavement (it stands just clear of the pavement's back), on
#    the railway, in the water or the canal's channel, or under a landmark (the canopy map sees
#    trees overhanging a road as cover on it, and Overture's walls run across the railway's
#    cuttings).
def _kept_clear_of():
    """The places no wall, fence or hedge stands: carriageways, pavements, railway, water, landmarks."""
    out_ = []
    for r in roads:
        if len(r["p"]) < 2 or r["c"] in PATHS: continue
        line = shapely.LineString([q[:2] for q in r["p"]])
        out_.append(line.buffer(rw(r) / 2, cap_style=2))
        if "pv" in r or r["c"] in KERBED_RD | {"trunk"}:
            for side, pv_ in zip((1, -1), r.get("pv", [1.7, 1.7])):
                if pv_ > 0.3: out_.append(line.buffer(side * (rw(r) / 2 + pv_ - 0.2), cap_style=2, single_sided=True))
    for t in rail_tracks:
        pts = [q[:2] for q in t["p"] if q[3] != 2 and X0 - 20 <= q[0] <= X1 + 20 and Y0 - 20 <= q[1] <= Y1 + 20]
        if len(pts) > 1: out_.append(shapely.LineString(pts).buffer(RAIL_HALF, cap_style=2))
    for seg, lv, half in canal_runs:
        out_.append(seg.buffer(half + 0.8, cap_style=2))
    for w in water_all:
        if len(w["r"][0]) >= 3: out_.append(shapely.Polygon(w["r"][0], [tuple(map(tuple, h)) for h in w["r"][1:]]).buffer(0.8))
    out_ += list(getattr(ctx, "clear", []))
    return out_
def _walls_kept_clear(runs):
    gap_parts = [c.buffer(0.4) for c in corridor]
    gap_lines = [shapely.LineString([(a, b) for a, b, *_ in r["p"]]) for r in roads if len(r["p"]) > 1]
    gap_tree = shapely.STRtree(gap_parts)
    keep_off = _kept_clear_of()
    off_tree = shapely.STRtree(keep_off) if keep_off else None
    kept, n_cut = [], 0
    for b in runs:
        line = shapely.LineString([(x, y) for x, y, _ in b["p"]])
        if line.length < 0.5: continue
        near = [gap_parts[int(k)] for k in gap_tree.query(line) if gap_lines[int(k)].intersects(line)]
        if off_tree is not None: near += [keep_off[int(k)] for k in off_tree.query(line) if keep_off[int(k)].intersects(line)]
        rest = line.difference(unary_union(near)) if near else line
        if near: n_cut += 1
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "LineString" or piece.length < 1.2: continue     # (a stub left between two gaps would stand alone)
            kept.append(dict(c=b["c"], p=_lay(piece), **({"h": b["h"]} if "h" in b else {})))
    return kept, n_cut
barriers, n_cut = _walls_kept_clear(br + lidar_br + garden_br)
print(f"walls: {n_cut} runs cut where streets and paths cross them, or kept off the road, the railway, the water and the landmarks")

# ---- hedges: garden boundaries with a low band of growth along them in the canopy map ----
if canopy is not None:
    FRONT = {"garden_wall", "brick_wall_low", "railing", "hedge_low"}
    hedged = 0
    for b in barriers:
        if b["c"] in ("wall", "fence", "hedge", "retaining_wall") or "h" in b or len(b["p"]) < 2: continue   # (not one the lidar measured)
        line = shapely.LineString([(x, y) for x, y, _ in b["p"]])
        hs = [canopy.at(*line.interpolate(k, normalized=False).coords[0]) for k in np.arange(0, line.length, 1.0)]
        if len(hs) < 2: continue
        green = sum(1 for h in hs if 1.0 <= h <= 4.5) / len(hs)
        if green > 0.6:
            b["c"] = "hedge_low" if b["c"] in FRONT else "hedge"
            hedged += 1
    print(f"canopy: {len(trees)} trees, {hedged} garden boundaries are hedges")

# ---- one wall, one run: runs of the same wall, fence or hedge that meet end to end and carry on
# the same way (within 35 degrees) are joined, so it's drawn as one, with no seam or post at the join
def _dir(pts, end):
    a, b = (pts[1], pts[0]) if end == 0 else (pts[-2], pts[-1])
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
    return (b[0] - a[0]) / L, (b[1] - a[1]) / L
def _join_runs(barriers):
    joined_any = True
    while joined_any:
        joined_any = False
        ends = shapely.STRtree([shapely.Point(b["p"][e][:2]) for b in barriers for e in (0, -1)])
        used = set()
        for i, b in enumerate(barriers):
            if i in used or len(b["p"]) < 2: continue
            hit = False
            for e in (0, -1):
                here = shapely.Point(b["p"][e][:2])
                for k in ends.query(here.buffer(0.3)):
                    j, f = int(k) // 2, (0, -1)[int(k) % 2]
                    o = barriers[j]
                    if j == i or j in used or o["c"] != b["c"] or o.get("h") != b.get("h") or len(o["p"]) < 2: continue
                    if shapely.Point(o["p"][f][:2]).distance(here) > 0.3: continue
                    (ux, uy), (vx, vy) = _dir(b["p"], e), _dir(o["p"], f)
                    if -(ux * vx + uy * vy) < math.cos(math.radians(35)): continue    # (they must carry on, not fold back)
                    a_ = b["p"] if e == -1 else b["p"][::-1]
                    c_ = o["p"] if f == 0 else o["p"][::-1]
                    b["p"] = a_ + c_[1:]
                    used.add(j); joined_any = hit = True
                    break
                if hit: break
        barriers = [b for k, b in enumerate(barriers) if k not in used]
    return barriers
n_runs = len(barriers)
barriers = _join_runs(barriers)
print(f"walls: {n_runs - len(barriers)} runs joined end to end to the run they carry on from")
# ---- junctions: every wall end is settled here, once, after all the cutting -----------------------
# An end is free, at another run's end (a corner, or the joins above), or exactly on another run: one
# that pokes past a run it meets (by up to a metre) stops at it, and one already on a run stays there.
# The meeting point becomes a point of both runs, so the two share it exactly, however shallow the
# angle they meet at (the map's 10 cm grid would otherwise leave a shallow junction either short or
# poking through); and where it's within a metre of the other run's free end, that run stops there
# too, a corner rather than a tail. Nothing is run on across a gap here: the gaps are the wall cut's,
# where a path goes through (the gardens were run on to meet their walls when they were laid). (Gates
# are cut into the walls below, a metre or more from any end, so they don't move these.)
def _junctions(barriers, over=1.0, on_it=0.1):
    lines = [shapely.LineString([q[:2] for q in b["p"]]) for b in barriers]
    tree = shapely.STRtree(lines)
    ends_ = shapely.STRtree([shapely.Point(l.coords[e]) for l in lines for e in (0, -1)])
    at_end = lambda i, pt: any(int(k) // 2 != i and shapely.Point(lines[int(k) // 2].coords[(0, -1)[int(k) % 2]]).distance(pt) < 0.3
                               for k in ends_.query(pt.buffer(0.3)))
    meets, n = defaultdict(list), 0     # run -> the points other runs now end on
    for i, b in enumerate(barriers):
        line = lines[i]
        if line.length < 0.5: continue
        lo, hi, new0, new1 = 0.0, line.length, None, None
        for e in (0, -1):
            pt = shapely.Point(line.coords[e])
            if at_end(i, pt): continue
            near = [int(k) for k in tree.query(pt.buffer(over)) if int(k) != i]
            # (poking past a run it meets: stop at the crossing nearest its end, within a metre)
            cross = []
            if line.length > 2 * over + 0.5:
                for k in near:
                    x = line.intersection(lines[k])
                    for h in getattr(x, "geoms", [x]):
                        if h.is_empty or h.geom_type != "Point": continue
                        t = line.project(h)
                        if (0.0 < t < over) if e == 0 else (line.length - over < t < line.length): cross.append((t, k, h))
            if cross:
                t, k, h = max(cross, key=lambda c: c[0]) if e == 0 else min(cross, key=lambda c: c[0])
                if e == 0: lo, new0 = t, (k, h)
                else: hi, new1 = t, (k, h)
                continue
            # (ending on one already: the meeting is made a point of both)
            best = min(near, key=lambda k: lines[k].distance(pt), default=None)
            if best is None or lines[best].distance(pt) >= on_it: continue
            on = lines[best].interpolate(lines[best].project(pt))
            if e == 0: new0 = (best, on)
            else: new1 = (best, on)
        if new0 is None and new1 is None: continue
        piece = substring(line, lo, hi) if (lo, hi) != (0.0, line.length) else line
        pts = list(piece.coords)
        for e, got in ((0, new0), (-1, new1)):
            if got is None: continue
            k, h = got
            q = (r1(h.x), r1(h.y))
            if e == 0: pts = [q] + (pts[1:] if math.dist(pts[0], q) < 0.05 or lo > 0 else pts)
            else: pts = (pts[:-1] if math.dist(pts[-1], q) < 0.05 or hi < line.length else pts) + [q]
            meets[k].append(q)
        if len(pts) < 2 or shapely.LineString(pts).length < 0.5: continue
        b["p"] = _lay(shapely.LineString(pts)); n += 1
    # each point another run now ends on goes into the run it ends on, as one of its own points; and
    # where that's within a metre of the run's own free end, the two meet at a corner, so the run
    # stops there too instead of poking past
    for k, qs in meets.items():
        pts = [tuple(q[:2]) for q in barriers[k]["p"]]
        for q in qs:
            line = shapely.LineString(pts)
            if line.length == 0: break
            t = line.project(shapely.Point(q))
            if t < over and not at_end(k, shapely.Point(pts[0])) and line.length - t > 0.5:
                pts = [q] + list(substring(line, t, line.length).coords)[1:]; continue
            if t > line.length - over and not at_end(k, shapely.Point(pts[-1])) and t > 0.5:
                pts = list(substring(line, 0, t).coords)[:-1] + [q]; continue
            if 0.05 < t < line.length - 0.05 and min(math.dist(q, p_) for p_ in pts) > 0.05:
                along = [0.0] + list(np.cumsum([math.dist(a_, b_) for a_, b_ in zip(pts, pts[1:])]))
                j = next(j for j in range(1, len(pts)) if along[j] >= t)
                pts.insert(j, q)
        barriers[k]["p"] = [[x, y, r1(gelev(x, y))] for x, y in pts]
    return n
print(f"walls: {_junctions(barriers)} runs stopped at, or made to share a point with, the run they meet")

# ---- gates: each stands in a wall, with the wall either side of it -------------------------------
# A gate whose wall was taken over by a real one (or cut short) moves into the nearest wall within
# 2.5 m, which is opened for it; with none near, its front is left open (the path still starts there).
blines = [shapely.LineString([q[:2] for q in b["p"]]) for b in barriers]
btree = shapely.STRtree(blines) if blines else None
walled = lambda pt, r=0.3: btree is not None and any(blines[int(k)].distance(pt) < r for k in btree.query(pt.buffer(r)))
cuts, gates_ok, moved, opened = defaultdict(list), [], 0, 0
for g in gate_list:
    x0, y0, x1, y1, z, st = g
    if st == "open" or (walled(shapely.Point(x0, y0)) and walled(shapely.Point(x1, y1))): gates_ok.append(g); continue
    c = shapely.Point((x0 + x1) / 2, (y0 + y1) / 2)
    done = False
    for k in sorted((int(k) for k in btree.query(c.buffer(2.5))), key=lambda k: blines[k].distance(c)) if btree is not None else []:
        wl_ = blines[k]
        if wl_.distance(c) > 2.5: break
        if wl_.length < 3.2: continue
        t = min(max(wl_.project(c), 1.6), wl_.length - 1.6)     # (a metre of wall left each side)
        if any(abs(t - u) < 2.2 for u in cuts[k]): continue        # (another gate already opened there: a metre of wall between them at least)
        p0, p1 = wl_.interpolate(t - 0.55), wl_.interpolate(t + 0.55)
        cuts[k].append(t)
        gates_ok.append([r1(p0.x), r1(p0.y), r1(p1.x), r1(p1.y), r1(gelev(c.x, c.y)), barriers[k]["c"]])
        moved += 1; done = True
        break
    if not done:
        gates_ok.append([x0, y0, x1, y1, z, "open"]); opened += 1
if cuts:
    cut_b = []
    for k, b in enumerate(barriers):
        if k not in cuts: cut_b.append(b); continue
        wl_, pos = blines[k], 0.0
        for t in sorted(cuts[k]) + [None]:
            a, e = (pos, wl_.length) if t is None else (pos, t - 0.55)
            if e - a >= 0.9:
                cut_b.append(dict(b, p=_lay(substring(wl_, a, e))))
            if t is not None: pos = t + 0.55
    barriers = cut_b
gate_list = gates_ok
print(f"gates: {moved} moved into a real wall, {opened} left as an open front")
# a stub of wall (under 1.5 m) with no wall, fence, hedge or closed gate at either end is a post in
# the way, not a wall: it goes. (Squares lay the same walls where they overlap, so a run a square's
# edge cuts in two is judged whole, and its two pieces still meet.)
def _lone_stubs_out(runs, gates_):
    ends_ = [shapely.LineString([q[:2] for q in b["p"]]) for b in runs] + \
            [shapely.Point(g[e], g[e + 1]) for g in gates_ if g[5] != "open" for e in (0, 2)]
    tree = shapely.STRtree(ends_) if ends_ else None
    joined = lambda k, pt: any(int(j) != k and ends_[int(j)].distance(pt) < 0.3 for j in tree.query(pt.buffer(0.3)))
    return [b for k, b in enumerate(runs) if ends_[k].length >= 1.5
            or joined(k, shapely.Point(b["p"][0][:2])) or joined(k, shapely.Point(b["p"][-1][:2]))]
n_runs = len(barriers)
barriers = _lone_stubs_out(barriers, gate_list)
print(f"walls: {n_runs - len(barriers)} stubs standing on their own left out")

# ---- front doors, garden shrubs, the Palladian Bridge -------------------------------
from landscape import front_doors, shrubs
bays = []
doors = front_doors([c[0] for c in cand], info, roads, gelev, rnd, bays, keys)
# (only round the middle of the detailed map, where everyone plays; a tile has them everywhere)
shrub_list = shrubs(canopy, footprints, roads, RW, inside, gelev, woods)
from landscape import approaches
paths, drive_strips, extra_fx = approaches(gate_list, drives, doors, [c[0] for c in cand], gelev, rnd, keyed=True,
                                           walls=[shapely.LineString([q[:2] for q in b["p"]]) for b in barriers if len(b["p"]) > 1])
fx += extra_fx
from landscape import telegraph
from buildings import zone_at
tpoles, twires = telegraph(roads, doors, lambda x, y: zone_at(A.zones, x, y, A.default_zone), gelev, rnd, keyed=True)
fx += tpoles
# ---- nothing small stands on a wall, or a path through one ----------------------------------------
# a front path that would cross a wall, fence or hedge anywhere but at its own gate is left out; a
# shrub on a boundary is part of it (the hedge) and goes; a tree stands half a metre off it; a bin, a
# sign or a bench on one, or indoors, goes
blines = [shapely.LineString([q[:2] for q in b["p"]]) for b in barriers if len(b["p"]) > 1]
btree = shapely.STRtree(blines) if blines else None
near_line = lambda pt, r: [blines[int(k)] for k in btree.query(pt.buffer(r)) if blines[int(k)].distance(pt) < r] if btree is not None else []
n_paths = len(paths)
def path_clear(q):
    wl_ = shapely.LineString([(q[0], q[1]), (q[2], q[3])])
    for k in (btree.query(wl_) if btree is not None else []):
        x = blines[int(k)].intersection(wl_)
        for h in getattr(x, "geoms", [x]):
            if not h.is_empty and wl_.project(h.centroid) > 1.0: return False
    return True
paths = [q for q in paths if path_clear(q)]
n_sb = len(shrub_list)
shrub_list = [q for q in shrub_list if not near_line(shapely.Point(q[0], q[1]), 0.3)]
nudged = 0
for q in trees:
    pt = shapely.Point(q[0], q[1])
    for wl_ in near_line(pt, 0.5):
        on = wl_.interpolate(wl_.project(pt))
        tx_, ty_ = q[0] - on.x, q[1] - on.y
        dd = math.hypot(tx_, ty_)
        if dd < 1e-3:
            a_, b_ = wl_.interpolate(max(0, wl_.project(pt) - 0.5)), wl_.interpolate(min(wl_.length, wl_.project(pt) + 0.5))
            tx_, ty_, dd = -(b_.y - a_.y), b_.x - a_.x, math.hypot(b_.x - a_.x, b_.y - a_.y) or 1
        q[0], q[1] = r1(on.x + tx_ / dd * 0.5), r1(on.y + ty_ / dd * 0.5)
        q[2] = r1(gelev(q[0], q[1]))
        nudged += 1
        break
indoor = shapely.STRtree([shapely.Polygon(b["r"][0]).buffer(-0.3) for b in blds if len(b["r"][0]) >= 3])
# the way through a gate, up a front path or along a drive is kept clear: a shrub there goes, and a
# tree steps to the nearest spot beside it (or goes, where that's on a wall or indoors)
ways = ([shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.0) for q in gate_list]
        + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.9) for q in paths]
        + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.5) for q in drive_strips])
way_tree = shapely.STRtree(ways) if ways else None
in_way = lambda pt: [ways[int(k)] for k in way_tree.query(pt, predicate="within")] if way_tree is not None else []
n_sb2 = len(shrub_list)
shrub_list = [q for q in shrub_list if not in_way(shapely.Point(q[0], q[1]))]
n_tr, stepped, kept = len(trees), 0, []
for q in trees:
    pt = shapely.Point(q[0], q[1])
    hit = in_way(pt)
    if hit:
        rim = shapely.unary_union(hit).exterior
        on = rim.interpolate(rim.project(pt))
        dd = math.hypot(on.x - q[0], on.y - q[1]) or 1
        nx_, ny_ = r1(on.x + (on.x - q[0]) / dd * 0.3), r1(on.y + (on.y - q[1]) / dd * 0.3)
        to = shapely.Point(nx_, ny_)
        if in_way(to) or near_line(to, 0.5) or len(indoor.query(to, predicate="within")): continue
        q[0], q[1], q[2] = nx_, ny_, r1(gelev(nx_, ny_))
        stepped += 1
    kept.append(q)
trees = kept
print(f"fitting: {n_sb2 - len(shrub_list)} shrubs in a gateway, on a front path or a drive, {stepped} trees stepped "
      f"out of one, {n_tr - len(trees)} trees left out")
n_fx = len(fx)
fx = [f for f in fx if f[0] == "car" or not (near_line(shapely.Point(f[1], f[2]), 0.2) or len(indoor.query(shapely.Point(f[1], f[2]), predicate="within")))]
print(f"fitting: {n_paths - len(paths)} front paths through a wall left out, {n_sb - len(shrub_list)} shrubs on a boundary, "
      f"{nudged} trees moved off one, {n_fx - len(fx)} street items on one or indoors")
# no parked car through a wall, a fence, a hedge or a building: a car the size the game draws it
# (web/src/map.ts) that touches one is left out
solid = shapely.STRtree([shapely.LineString([(x, y) for x, y, *_ in b["p"]]).buffer(0.15) for b in barriers if len(b["p"]) > 1]
                        + [shapely.Polygon(b["r"][0]) for b in blds])
def car_clear(f):
    x, y, a = f[1], f[2], f[4]
    ux, uy = math.cos(a), math.sin(a)
    box_ = shapely.Polygon([(x + ux * s_ * 2.05 - uy * t_ * 0.88, y + uy * s_ * 2.05 + ux * t_ * 0.88) for s_, t_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    return not len(solid.query(box_, predicate="intersects"))
n_fx = len(fx)
fx = [f for f in fx if f[0] != "car" or car_clear(f)]
print(f"cars: {n_fx - len(fx)} left out where they would stand in a wall or a building")

# ---- spawn area: a named green where everyone starts (Firs Field on Combe Down) ----------
spawn = None
for g, p in L("land_use"):
    if getattr(A, "spawn", None) and name(p) == A.spawn:
        for poly in (polys(g) if TILE is None else [q for q in whole_polys(g) if own(q.centroid.x, q.centroid.y)]):
            spawn = [[r1(x), r1(y)] for x, y in list(poly.simplify(0.5).exterior.coords)[:-1]]

if KEEP:
    # the same footprint (middle within a metre and a half, area within a sixth): the earlier
    # build's measurements, on this build's ground, for the buildings this build's own lidar
    # didn't reach (where it did, the fresh measurement is kept)
    kept = shapely.STRtree([shapely.Polygon(b["r"][0]) for b in KEEP if len(b["r"][0]) >= 3])
    kept_bl = [b for b in KEEP if len(b["r"][0]) >= 3]
    carried = 0
    for b, f in zip(blds, fresh):
        if f: continue
        poly = shapely.Polygon(b["r"][0]); c = poly.centroid
        for k in kept.query(c.buffer(1.5)):
            o = kept_bl[int(k)]; op = shapely.Polygon(o["r"][0])
            if op.centroid.distance(c) < 1.5 and abs(op.area - poly.area) < poly.area / 6:
                for key_ in ("h", "dz", "m", "rc", "w", "rr", "rp", "hp", "ch", "pp", "st", "c"):
                    if key_ in o: b[key_] = o[key_]
                    elif key_ in b: del b[key_]
                carried += 1
                break
    print(f"buildings: {carried} of {len(blds)} carried over from the earlier build with their measured heights and roofs")

# a way's points off its bridges are walked and drawn on the ground, but the game takes a way with
# no bridge marked that stands well above the ground (as it now is, banks dug) for a bridge of its
# own: so they're held down near it
held = 0
for r in roads:
    for q in r["p"]:
        if len(q) == 3 and X0 <= q[0] <= X1 and Y0 <= q[1] <= Y1 and q[2] > (top := r1(gelev(q[0], q[1]) + 2.5)): q[2] = top; held += 1
if held: print(f"bridges: {held} way points off any bridge held down near the ground")

out = dict(
    id=A.id, name=A.name, release=RELEASE, centre=A.centre, field=A.field, fc=list(A.field_centre), b=[r1(X0), r1(Y0), r1(X1), r1(Y1)],
    bk=1,     # built under the scenery rules (docs/new-area.md)
    v=list(A.view) if getattr(A, "view", None) else None,
    t=dict(nx=nx, ny=ny, x0=r1(X0), y0=r1(Y0), dx=round(dx, 4), dy=round(dy, 4), z0=z0,
           h=[int(round((v - z0) * 10)) for v in grid.ravel()],   # decimetres above z0, rows south -> north
           k="".join(str(int(v)) for v in GT.ravel())),
    bl=blds, rd=roads, wp=wp, wl=wl, br=barriers, gt=gate_list, tr=trees, spawn=spawn, fx=fx, mk=marks, sh=signs, lm=marks_lm, dr=doors, sb=shrub_list, cn=canopy_grid, pl=places, fp=paths, dv=drive_strips, by=bays, wr=twires, pi=pitch_list, tn=tunnel_list,
)
if TILE is not None:
    # ---- a tile keeps only what is its own -------------------------------------------------
    def clip_runs(pts, x0=TX0, y0=TY0, x1=TX1, y1=TY1):
        """The pieces of a line of [x, y, z] points inside the tile, cut where it crosses the edge."""
        out_, cur = [], []
        lerp = lambda a, b, t: [r1(a[k] + (b[k] - a[k]) * t) for k in range(3)] + ([a[3]] if len(a) > 3 and len(b) > 3 and a[3] == b[3] else [])
        for a, b in zip(pts, pts[1:]):
            t0, t1, ex, ey = 0.0, 1.0, b[0] - a[0], b[1] - a[1]
            for pp, qq in ((-ex, a[0] - x0), (ex, x1 - a[0]), (-ey, a[1] - y0), (ey, y1 - a[1])):
                if pp == 0:
                    if qq < 0: t0, t1 = 1.0, 0.0
                elif pp < 0: t0 = max(t0, qq / pp)
                else: t1 = min(t1, qq / pp)
            if t0 >= t1:
                if cur: out_.append(cur); cur = []
                continue
            pa, pb = (list(a) if t0 == 0 else lerp(a, b, t0)), (list(b) if t1 == 1 else lerp(a, b, t1))
            if cur and t0 == 0: cur.append(pb)
            else:
                if cur: out_.append(cur)
                cur = [pa, pb]
            if t1 < 1: out_.append(cur); cur = []
        if cur: out_.append(cur)
        return [q for q in out_ if len(q) > 1 and any(q[k][:2] != q[0][:2] for k in range(1, len(q)))]

    def cut_lines(lines, grounded=False):
        """Each line's pieces inside the tile. A road keeps its own height where it's cut, but a wall
        or fence stands on the ground, so where one is cut at the edge its new end is set on it."""
        cut = [dict(ln, p=piece) for ln in lines for piece in clip_runs(ln["p"])]
        if grounded:
            for ln in cut:
                for q in ln["p"]: q[2] = r1(gelev(q[0], q[1]))
        return cut

    mid = lambda q, a, b: own((q[a] + q[b]) / 2, (q[a + 1] + q[b + 1]) / 2)    # a short piece, by its middle
    tbl = [(b, p) for b, (_, p) in zip(blds, cand)]
    blds = [b for b, p in tbl if p.get("_own")]
    out.update(
        b=[TX0, TY0, TX1, TY1], tile=[ti, tj], v=None, spawn=spawn,
        t=dict(nx=CELLS + 1, ny=CELLS + 1, x0=TX0, y0=TY0, dx=D, dy=D, z0=z0,
               h=[int(round((v - z0) * 10)) for v in grid[MARGIN:MARGIN + CELLS + 1, MARGIN:MARGIN + CELLS + 1].ravel()],
               k="".join(str(int(v)) for v in GT[MARGIN:MARGIN + CELLS + 1, MARGIN:MARGIN + CELLS + 1].ravel())),
        bl=blds, rd=cut_lines(roads), wp=wp, wl=cut_lines(wl, True), br=cut_lines(barriers, True), tn=cut_lines(tunnel_list),
        gt=[q for q in gate_list if mid(q, 0, 2)], mk=[q for q in marks if mid(q, 0, 2)], wr=[q for q in twires if mid(q, 0, 3)],
        fp=[q for q in paths if mid(q, 0, 2)], dv=[q for q in drive_strips if mid(q, 0, 2)],
        tr=[q for q in trees if own(q[0], q[1])], fx=[q for q in fx if own(q[1], q[2])], sh=[q for q in signs if own(q[0], q[1])],
        lm=[q for q in marks_lm if own(q[1], q[2])], dr=[q for q in doors if own(q[0], q[1])], sb=[q for q in shrub_list if own(q[0], q[1])],
        by=[q for q in bays if own(q[0], q[1])], pi=[q for q in pitch_list if own(q[1], q[2])],
        cn=canopy_grid, pl=places,
    )
    roads, wl, barriers, signs, doors, shrub_list, marks, trees, fx = (out[k] for k in ("rd", "wl", "br", "sh", "dr", "sb", "mk", "tr", "fx"))
    # (nx and ny stay the working grid's: gelev reads them, and the walls are set on the ground
    # again below. A square's own grid is out["t"].)
landmarks.clear(ctx, out)      # nothing growing or standing where a landmark stands
# ---- the corridors are kept clear --------------------------------------------------------------
# Nothing small stands in a road's carriageway, on the railway, or in the water or the canal's
# channel: trees, shrubs and street items there are taken out (the canopy map sees trees
# overhanging a road or a river as cover on it). The walls were kept off all of these when they
# were laid, above.
corridors = []
for r in out["rd"]:
    if len(r["p"]) > 1 and r["c"] not in PATHS: corridors.append(shapely.LineString([q[:2] for q in r["p"]]).buffer(rw(r) / 2, cap_style=2))
for t in rail_tracks:
    pts = [q[:2] for q in t["p"] if q[3] != 2 and X0 - 20 <= q[0] <= X1 + 20 and Y0 - 20 <= q[1] <= Y1 + 20]
    if len(pts) > 1: corridors.append(shapely.LineString(pts).buffer(RAIL_HALF, cap_style=2))
for seg, lv, half in canal_runs:
    corridors.append(seg.buffer(half + 0.8, cap_style=2))
for w in out["wp"]:
    if len(w["r"][0]) >= 3: corridors.append(shapely.Polygon(w["r"][0], [tuple(map(tuple, h)) for h in w["r"][1:]]).buffer(0.8))
if corridors:
    ctree = shapely.STRtree(corridors)
    def clear_at(x, y):
        pt = shapely.Point(x, y)
        return any(corridors[int(k)].contains(pt) for k in ctree.query(pt))
    before = (len(out["tr"]), len(out["sb"]), len(out["fx"]))
    out["tr"] = [q for q in out["tr"] if not clear_at(q[0], q[1])]
    out["sb"] = [q for q in out["sb"] if not clear_at(q[0], q[1])]
    out["fx"] = [q for q in out["fx"] if q[0] == "car" or not clear_at(q[1], q[2])]     # (parked cars stand in the road on purpose)
    gone = (before[0] - len(out["tr"]), before[1] - len(out["sb"]), before[2] - len(out["fx"]))
    print(f"corridors: {gone[0]} trees, {gone[1]} shrubs and {gone[2]} street items taken off the roads, the railway and the water")
json.dump(out, open(out_path, "w"), separators=(",", ":"))
if STORE is not None: STORE.save()
print(f"terrain {out['t']['nx']}x{out['t']['ny']} @ {STEP} m, {grid.min():.1f}-{grid.max():.1f} m; {len(blds)} buildings "
      f"({sum('rr' in b for b in blds)} gabled), {len(roads)} road runs, {len(wp)} ponds, {len(wl)} streams, "
      f"{len(barriers)} wall/fence/hedge runs ({len(br)} mapped + {len(garden_br)} gardens, before path gaps), {len(gate_list)} gates, {len(fx)} street items, {len(signs)} shop signs, {len(doors)} doors, {len(shrub_list)} shrubs, {len(marks)} markings, {len(trees)} trees, {len(places)} places; {os.path.getsize(out_path) / 1e6:.1f} MB")
