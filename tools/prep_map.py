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
from shapely.ops import nearest_points, substring, transform, unary_union

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
    FLOOR_BOX = None
else:
    # ---- the tile: a square of the map's grid (area.py), worked out over a margin round it ----
    G = A.squares
    D, CELLS, MARGIN = G.dx, G.cells, 15
    SUB = int(os.environ.get("GRIDSUB", "1"))     # experiment: a finer ground grid, SUB points per cell
    D, CELLS, MARGIN = D / SUB, CELLS * SUB, MARGIN * SUB
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
    FLOOR_BOX = (TX0 - 1200, TY0 - 1200, TX1 + 1200, TY1 + 1200)    # (within the ground the tile reads)
    TBOX = box(TX0, TY0, TX1, TY1)
    own = lambda x, y: TX0 <= x < TX1 and TY0 <= y < TY1     # the tile's own (each point is in one tile)
BM = box(X0, Y0, X1, Y1)
r1 = lambda v: round(float(v), 1)


def _along(line, n):
    """Points along a line about line.length / n apart, for laying a wall on the ground: every
    corner of the line is one of them, so a fence keeps its corners square instead of having them
    cut off between two points."""
    cs = list(line.coords)
    step = line.length / max(1, n) if line.length > 0 else 1.0
    out = [Point(cs[0])]
    for a, b in zip(cs, cs[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6: continue
        m = max(1, int(math.ceil(L / step - 1e-6)))
        out += [Point(a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m) for k in range(1, m + 1)]
    return out
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
if getattr(A, "sea", None) is not None:
    DEM = np.maximum(DEM, A.sea - 20)     # the terrain tiles' seabed has the odd wild pixel, kilometres deep


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


from profiles import APPROACH, carry_profile, ease_grades, ease_kinks


def level_structures(run, z, bridges, tunnels):
    """Carry bridges and tunnels straight between the road at either end (carry_profile; a
    tunnel's ends as the survey has them)."""
    d = [0.0]
    for p, q in zip(run, run[1:]): d.append(d[-1] + math.dist(p[:2], q[:2]))
    for ranges, fit in ((tunnels, False), (bridges, True)):
        on = [any(a <= t <= b for a, b in ranges) for _, _, t in run]
        if any(on): carry_profile(z, d, on, [True] * len(z), fit=fit)
    return z


def in_ranges(run, ranges):
    """Which points of run (by index) fall in the stretches ranges, as fractions along the line."""
    return {i for i, (_, _, t) in enumerate(run) if any(a <= t <= b for a, b in ranges)}


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
MAIN = {"primary", "secondary"}     # Overture's classes for the main roads through town
import tunnels as TN
roads, tunnel_list = [], []
flat_w = np.full(grid.shape, np.inf)   # distance from each grid vertex to the nearest road it is flattened to
flat_z = grid.copy()
SURVEY = grid.copy()                   # the ground before any road is laid on it
flat_in = np.zeros(grid.shape, dtype=bool)   # the vertex is inside a road's carriageway (not just its easing)
flat_f = np.zeros(grid.shape)          # how far out from that road's centre line the ground is flat (the verge's edge)
SLOPE = 1.5                            # the ground eases from a road's level to its own over this many metres per metre of difference
EASE = 12.0                            # and over this far at most
UPHILL_WALL = 2.4                      # metres an unmeasured building's wall stands at least above the highest ground along it
GROUND_AGREE = 1.0                     # metres the survey's lowest ground at the walls may lie outside the map's and still be the same ground
OFFSET_REACH, OFFSET_MIN = 150.0, 5      # metres round a building, and surveyed buildings there, that set the two grounds' offset
MEASURED_WALL = 1.0                    # metres the measured eaves must stand above the map's highest ground at the walls


PROTECT = None                         # grid vertices under a bridge's span: no road flattens them


def flatten(run, z, reach, only=None):
    """Flatten the terrain under the line run (heights z) out to reach, and ease it back to its
    own level beyond that, over a distance that depends on how far it has to go (a cutting or
    an embankment gets a slope, not a step); only: the indexes of the points whose segments
    count. The ground under a bridge (PROTECT) is left to the bridge."""
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
        if PROTECT is not None: win &= ~PROTECT[W]
        flat_w[W][win] = d[win]
        flat_z[W][win] = zz[win]
        flat_f[W][win] = reach
        flat_in[W] |= win & inside


# the canal's towpath (tools/canal.py lays out the canal's banks, and the game builds them:
# web/src/works.ts). A mapped path running along the canal on its bank is the towpath, and is
# moved onto the middle of the canal's own towpath, level with the coping, whatever the survey
# made of the ground there: it doesn't rise to the bridges over it or dip under them. Where the
# towpath goes through one of the canal's tunnels it's the tunnel's own ledge (canal.ts), so that
# stretch is left out, and it's no tunnel of the roads': nothing over it is a bridge, and no
# cutting is dug for it through the hill.
canal_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-canal.json")
CANAL = json.load(open(canal_file)) if os.path.exists(canal_file) else None
TOW_UP, TOW_COPE = 0.4, 0.45          # the banks stand this far above the water; the coping's width
canal_open, canal_bores = [], []
if CANAL:
    for run in CANAL["runs"]:
        p = run["p"]
        for i in range(len(p) - 1):
            a, b = p[i], p[i + 1]
            if (a[6] | b[6]) & 1: continue      # (an aqueduct's trough is open water too, with its towpath over it)
            canal_open.append((a, b, run["lv"]))
        bore = []
        for q in p + [[0, 0, 0, 0, 0, 0, 0]]:          # each tunnel on its own, from portal to portal
            if q[6] & 1: bore.append(q); continue
            if len(bore) > 1: canal_bores.append(shapely.LineString([b[:2] for b in bore]).buffer(max(b[2] for b in bore) + 1.3 + 2.0, cap_style="flat"))
            bore = []
canal_open_tree = shapely.STRtree([shapely.LineString([a[:2], b[:2]]) for a, b, _ in canal_open]) if canal_open else None
canal_bore = unary_union(canal_bores) if canal_bores else None


def lock_coping(x, y):
    """The height of a lock's coping beside (x, y), if it's at a lock: level with the upper pound
    (and a little over) along the chamber, coming down with the wing walls below the bottom gates
    (canal.ts wingTop)."""
    for lk in (CANAL or {}).get("locks", []):
        (lx, ly), (hx, hy) = lk["lo"], lk["hi"]
        L = math.hypot(hx - lx, hy - ly) or 1
        ux, uy = (hx - lx) / L, (hy - ly) / L
        u, v = (x - lx) * ux + (y - ly) * uy, abs(-(x - lx) * uy + (y - ly) * ux)
        wing = lk.get("tl", 2.2 + (lk["zh"] - lk["zl"]) * 6)
        if v > 14 or not -wing - 1 < u < L + 3.5: continue
        return lk["zl"] + 0.45 + (lk["zh"] - lk["zl"]) * min(1, max(0, (u + wing) / (wing - 2.2)))
    return None


LOCK_IN, LOCK_PAVING = 2.15 + 1.2, 2.15 + 1.2 + 4.5 / 2     # a lock's walls and coping, and the middle of its paving (canal.ts)


def onto_lock_paving(x, y, dx, dy):
    """A point of a path running along a lock (dx, dy its way there) that the data has down inside
    the lock (in its chamber or between its wing walls, over the water) moved out sideways onto the
    middle of the paving on that side, at the coping's height there, as (x, y, height); or None (a
    path crossing the lock goes over it on its gates' walkway)."""
    for lk in (CANAL or {}).get("locks", []):
        (lx, ly), (hx, hy) = lk["lo"], lk["hi"]
        L = math.hypot(hx - lx, hy - ly) or 1
        ux, uy = (hx - lx) / L, (hy - ly) / L
        u, v = (x - lx) * ux + (y - ly) * uy, -(x - lx) * uy + (y - ly) * ux
        wing = lk.get("tl", 2.2 + (lk["zh"] - lk["zl"]) * 6)
        if abs(v) >= LOCK_IN or not -wing < u < L + 2.2: continue
        if abs(dx * ux + dy * uy) < 0.7 * (math.hypot(dx, dy) or 1): return None
        side = 1 if v >= 0 else -1
        top = lk["zl"] + 0.45 + (lk["zh"] - lk["zl"]) * min(1, max(0, (u + wing) / (wing - 2.2)))
        return (lx + ux * u - uy * side * LOCK_PAVING, ly + uy * u + ux * side * LOCK_PAVING, top)
    return None


def along_lock(line, x):
    """Does line run along the lock at point x (within 45 degrees of its length), rather than across it?"""
    s = line.project(x)
    a, b = line.interpolate(max(0, s - 2)), line.interpolate(min(line.length, s + 2))
    d = math.dist((a.x, a.y), (b.x, b.y)) or 1
    for lk in (CANAL or {}).get("locks", []):
        if not by_one_lock(lk, x.x, x.y): continue
        (lx, ly), (hx, hy) = lk["lo"], lk["hi"]
        L = math.hypot(hx - lx, hy - ly) or 1
        return abs((b.x - a.x) * (hx - lx) + (b.y - a.y) * (hy - ly)) / (d * L) > 0.7
    return False


def by_one_lock(lk, x, y):
    (lx, ly), (hx, hy) = lk["lo"], lk["hi"]
    L = math.hypot(hx - lx, hy - ly) or 1
    ux, uy = (hx - lx) / L, (hy - ly) / L
    u, v = (x - lx) * ux + (y - ly) * uy, abs(-(x - lx) * uy + (y - ly) * ux)
    return v < 14 and -lk.get("tl", 2.2 + (lk["zh"] - lk["zl"]) * 6) - 1 < u < L + 3.5


def by_a_lock(x, y):
    """Is (x, y) beside one of the canal's locks, or between its wing walls (canal.ts builds those)?"""
    return any(by_one_lock(lk, x, y) for lk in (CANAL or {}).get("locks", []))


def towpath(run, z, snap=True, bridged=()):
    """A path's run (points [x, y, t]) split round the canal's tunnels, as [(run, z, {i: height}
    of the points moved onto the towpath)], and whether a stretch was left out in a tunnel.
    bridged: the run's points on a bridge, which stay on it (a footbridge over the canal crosses
    its banks on the way over, but high above the towpath)."""
    keep = [i for i, q in enumerate(run) if canal_bore is None or not canal_bore.contains(shapely.Point(q[:2]))]
    pieces, cur = [], []
    for i in keep:
        if cur and i != cur[-1] + 1: pieces.append(cur); cur = []
        cur.append(i)
    if cur: pieces.append(cur)
    out = []
    for idx in pieces:
        if len(idx) < 2: continue
        pr, pz = [list(run[i]) for i in idx], [z[i] for i in idx]
        at = {}
        for i, q in enumerate(pr):
            if canal_open_tree is None: break
            if idx[i] in bridged: continue
            here = shapely.Point(q[:2])
            j = int(canal_open_tree.nearest(here))
            a, b, lv = canal_open[j]
            L = math.dist(a[:2], b[:2]) or 1
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            t = min(1, max(0, ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L))
            cx, cy = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            o = -(q[0] - cx) * uy + (q[1] - cy) * ux
            k = 7 if o >= 0 else 8
            half = a[2] + (b[2] - a[2]) * t
            w = (a[k] + (b[k] - a[k]) * t) if len(a) > k and len(b) > k else 1.6
            p0, p1 = pr[max(0, i - 1)], pr[min(len(pr) - 1, i + 1)]
            dl = math.dist(p0[:2], p1[:2]) or 1
            along = abs((p1[0] - p0[0]) * ux + (p1[1] - p0[1]) * uy) / dl
            p0, p1 = pr[max(0, i - 1)], pr[min(len(pr) - 1, i + 1)]
            on = onto_lock_paving(q[0], q[1], p1[0] - p0[0], p1[1] - p0[1])
            if on: at[i] = on; continue
            # (not just in line with the canal, but beside it; on an aqueduct, anywhere on its deck)
            if math.hypot(q[0] - cx, q[1] - cy) > half + w + (5.0 if (a[6] | b[6]) & 2 else 1.5): continue
            if by_a_lock(q[0], q[1]): continue
            # a path (or steps) crossing the bank on its way to or from the towpath: level with it
            # where it's on the bank, wherever it goes from there
            if (w >= 1.5 and half + 0.3 < abs(o) <= half + w) and (not snap or along < 0.8):
                at[i] = (q[0], q[1], lv + TOW_UP); continue
            if not snap or w < 1.5 or along < 0.8 or not half - 1.0 < abs(o) < half + w + (5.0 if (a[6] | b[6]) & 2 else 1.5): continue
            off = math.copysign(half + TOW_COPE + (w - TOW_COPE) / 2, o)
            at[i] = (cx - uy * off, cy + ux * off, lv + TOW_UP)
        # a point or two between ones on the towpath that wander off it go on it too
        on = sorted(at)
        for i0, i1 in zip(on, on[1:]):
            if 1 < i1 - i0 <= 3:
                for i in range(i0 + 1, i1):
                    f = (i - i0) / (i1 - i0)
                    at[i] = tuple(at[i0][c] + (at[i1][c] - at[i0][c]) * f for c in range(3))
        for i, (x, y, h) in at.items():
            pr[i][0], pr[i][1] = x, y
            pz[i] = h
        out.append((pr, pz, {i: h for i, (_, _, h) in at.items()}))
    return out, len(keep) < len(run)


# every road run first, with its heights and what's marked on it; then the underpasses, so the
# roads over them are spans; then the roads are written out and the ground flattened under them
pending = []
for g, p in L("segment"):
    if p["subtype"] != "road": continue
    c = CLASS.get(p.get("class") or "unknown", p.get("class") or "unknown")
    # a street closed to motor vehicles (the pedestrianised streets in town, some only in the
    # daytime) is a pedestrian street here: drawn, but with no traffic, no parked cars and no
    # centre lines; and a one-way street says which way (1 with its points, -1 against them).
    # A main road stays a road whatever's marked on it: what closes one is a bus gate (the foot of
    # Broad Street, Northgate Street, High Street, Manvers Street), still a road with buses on it
    # and its bus stops at the kerb, not a paved square
    one_way = 0
    for ar in p.get("access_restrictions") or []:
        if ar.get("access_type") != "denied": continue
        w = ar.get("when") or {}
        if w.get("heading") == "backward" and not w.get("mode"): one_way = 1
        elif w.get("heading") == "forward" and not w.get("mode"): one_way = -1
        elif not w.get("heading") and not w.get("using") and not w.get("recognized") and not w.get("vehicle") and (w.get("mode") is None or "motor_vehicle" in w["mode"]) and c not in PATHS and p.get("class") not in MAIN:
            c = "pedestrian"     # (a weight or height limit is a restriction on some vehicles, not a closure)
    ranges = flag_ranges(p, "road_flags")
    tunnel_ranges = [tuple(f.get("between") or (0.0, 1.0)) for f in p.get("road_flags") or [] if "is_tunnel" in (f.get("values") or [])]
    bridge_ranges = [tuple(f.get("between") or (0.0, 1.0)) for f in p.get("road_flags") or [] if "is_bridge" in (f.get("values") or [])]
    for coords in line_coords(g):
        # a tunnel's floor runs between the road at its two ends, which a long one (the Combe Down
        # Tunnel) can have well outside the tile's roads: so it is levelled over the whole of it
        floors = []
        if tunnel_ranges and FLOOR_BOX is not None:
            for wide in densify_runs(coords, 4.0, FLOOR_BOX):
                floors.append(([t for _, _, t in wide], level_structures(wide, [elev(x, y) for x, y, _ in wide], [], tunnel_ranges)))
        for run in densify_runs(coords, 4.0, ROAD_BOX):
            # the survey's heights, the structures carried straight between the road at their ends
            # (the roads are smoothed as a network once they're all in: smooth_network)
            z = [elev(x, y) for x, y, _ in run]
            z = level_structures(run, z, bridge_ranges, tunnel_ranges)
            for i in in_ranges(run, tunnel_ranges):
                for ts, zs_ in floors:
                    if ts[0] <= run[i][2] <= ts[-1]:
                        z[i] = float(np.interp(run[i][2], ts, zs_))
            pieces, through = (towpath(run, z, c != "steps", in_ranges(run, bridge_ranges)) if c in PATHS and CANAL else ([(run, z, {})], False))
            for run, z, tow in pieces:
                tr = [] if through else tunnel_ranges        # (a towpath through the canal's tunnel is no tunnel of its own)
                bored = TN.bores(run, z, tr, elev, c)
                pending.append(dict(c=c, n=name(p), run=run, z=z, span=in_ranges(run, bridge_ranges) - set(tow), bored=bored, tunnel_ranges=tr, ow=one_way, tow=tow))
TN.rebore(pending, elev)
def chains():
    """The roads in pending joined up where one ends where another of the same kind begins, as
    lists of (road index, point index) along each."""
    ends = defaultdict(list)
    key = lambda q: (round(q[0] * 2), round(q[1] * 2))
    for k, r in enumerate(pending):
        if len(r["run"]) < 2: continue
        ends[key(r["run"][0])].append((k, 0)); ends[key(r["run"][-1])].append((k, -1))
    kind = lambda c: "path" if c in PATHS else "road"
    def heading(k, e):      # the way road k leaves its end e
        run = pending[k]["run"]
        a, b = (run[0], run[1]) if e == 0 else (run[-1], run[-2])
        d = math.dist(a[:2], b[:2]) or 1
        return ((b[0] - a[0]) / d, (b[1] - a[1]) / d)
    partner = {}
    for spot, here in ends.items():
        pairs = []
        for x in range(len(here)):
            for y in range(x + 1, len(here)):
                (k1, e1), (k2, e2) = here[x], here[y]
                if k1 == k2 or kind(pending[k1]["c"]) != kind(pending[k2]["c"]): continue
                h1, h2 = heading(k1, e1), heading(k2, e2)
                straight = -(h1[0] * h2[0] + h1[1] * h2[1])      # 1 where one carries straight on into the other
                if straight > 0.7: pairs.append((straight, (k1, e1), (k2, e2)))
        for _, a, b in sorted(pairs, reverse=True):
            if a in partner or b in partner: continue
            partner[a] = b; partner[b] = a
    visited, out = set(), []
    def walk(k, enter):
        chain = []
        while k not in visited:
            visited.add(k)
            n = len(pending[k]["run"])
            chain += [(k, i) for i in (range(n) if enter == 0 else range(n - 1, -1, -1))]     # (the joints come twice, a step of nothing)
            nxt = partner.get((k, -1 if enter == 0 else 0))
            if not nxt: break
            k, enter = nxt[0], (0 if nxt[1] == 0 else -1)
        return chain
    for k, r in enumerate(pending):           # from each end that carries on into nothing
        if len(r["run"]) < 2 or k in visited: continue
        if (k, 0) not in partner: out.append(walk(k, 0))
        elif (k, -1) not in partner: out.append(walk(k, -1))
    for k, r in enumerate(pending):           # and round any loops left
        if len(r["run"]) >= 2 and k not in visited: out.append(walk(k, 0))
    return out


# Roads rise and fall like roads, not like the survey's pixels: the survey has walls, kerbs and
# banks in it, a metre or two up or down within a few metres along a street. So once every road is
# in, the network is smoothed as a whole, the main roads first: each road along its length (the
# pieces the data splits it into joined up), by distance, over about a dozen metres either way;
# where a lesser road meets one already smoothed (a side street at a junction, a crossroads) it
# takes that road's height there and eases into it; and no road is left steeper than the hill it
# climbs, measured over 40 m, with a little to spare (or 1 in 5.5, where the hill's gentler).
# Bridges and tunnels keep the heights they're carried at.
RANK = {"motorway": 0, "trunk": 0, "primary": 1, "secondary": 2, "tertiary": 3, "residential": 4, "living_street": 4,
        "unclassified": 5, "pedestrian": 5, "service": 6, "unknown": 6}
SIGMA = 6.0          # metres: how far along a road its heights are evened out
GRADE = 0.18         # the steepest a road is laid where the hill under it is gentler than that
# and the steepest each kind of road is laid whatever the hill: Bath's main roads climb at 1 in 8
# or so (Bathwick Hill, Wells Road), its steepest streets and lanes about 1 in 4 (Lyncombe Hill,
# Hodshill), and only drives and yards more, up to 1 in 3
STEEPEST = {"motorway": 0.08, "trunk": 0.12, "primary": 0.15, "secondary": 0.15, "tertiary": 0.2, "living_street": 0.25,
            "residential": 0.25, "unclassified": 0.25, "pedestrian": 0.25, "service": 0.33, "unknown": 0.33}


def smooth_network():
    done = {}
    key = lambda q: (round(q[0] * 2), round(q[1] * 2))
    order = []
    for ch in chains():
        c = pending[ch[0][0]]["c"]
        if c in PATHS and c != "pedestrian": continue
        L = sum(math.dist(pending[k1]["run"][i1][:2], pending[k2]["run"][i2][:2]) for (k1, i1), (k2, i2) in zip(ch, ch[1:]))
        order.append((RANK.get(c, 6), -L, ch))
    order.sort(key=lambda o: (o[0], o[1]))
    tun = {k: in_ranges(r["run"], r["tunnel_ranges"]) for k, r in enumerate(pending) if r["tunnel_ranges"]}
    for _, _, ch in order:
        pts = [pending[k]["run"][i] for k, i in ch]
        z = np.array([pending[k]["z"][i] for k, i in ch], dtype=float)
        n = len(ch)
        fixed = np.array([i in pending[k]["span"] or i in tun.get(k, ()) for k, i in ch])
        for m, q in enumerate(pts):
            h = done.get(key(q))
            # (a road laid already, meeting this one there: unless it's well above or below, a
            # bridge's deck and a road passing under it at a point the data happens to give both)
            if h is not None and abs(h - z[m]) < 2.5: z[m] = h; fixed[m] = True
        d = np.zeros(n)
        for m in range(1, n): d[m] = d[m - 1] + math.dist(pts[m - 1][:2], pts[m][:2])
        # evened out along it, by distance (the fixed points pull their neighbours, and keep their own)
        out = z.copy()
        for m in range(n):
            if fixed[m]: continue
            near = np.flatnonzero(np.abs(d - d[m]) < 3 * SIGMA)
            w = np.exp(-((d[near] - d[m]) ** 2) / (2 * SIGMA ** 2))
            out[m] = float((w * z[near]).sum() / w.sum())
        z = out
        # no steeper than the hill (over 40 m) it climbs
        lim = np.zeros(max(0, n - 1))
        for m in range(n - 1):
            dd = d[m + 1] - d[m]
            if dd < 0.01: lim[m] = 0.0; continue
            (ax, ay), (bx, by) = pts[m][:2], pts[m + 1][:2]
            ux, uy = (bx - ax) / dd, (by - ay) / dd
            mx, my = (ax + bx) / 2, (ay + by) / 2
            hill = abs(elev(mx + ux * 20, my + uy * 20) - elev(mx - ux * 20, my - uy * 20)) / 40
            lim[m] = min(STEEPEST.get(pending[ch[m][0]]["c"], 0.33), max(GRADE, hill + 0.03)) * dd
        ease_grades(z, d, lim, fixed)
        ease_kinks(z, d, fixed)
        for m, (k, i) in enumerate(ch):
            pending[k]["z"][i] = float(z[m])
            done[key(pts[m])] = float(z[m])


smooth_network()

# an underpass: a tunnel stretch too shallow to bore, which stays a road in a cutting. Whatever
# crosses over it is carried over as a bridge (Overture seldom marks the road on top), with the
# cutting as wide as the road in it. Not the ends of a tunnel that is bored: those are its road
# coming out of the hill face, and what passes near them is on the ground over the tunnel
underpasses = []
for k, r in enumerate(pending):
    if not r["tunnel_ranges"] or r["bored"]: continue
    shallow = sorted(in_ranges(r["run"], r["tunnel_ranges"]) - {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)})
    # (each unbroken stretch on its own: the cuttings at either end of a bored tunnel are two)
    runs_ = [[]]
    for i in shallow:
        if runs_[-1] and i != runs_[-1][-1] + 1: runs_.append([])
        runs_[-1].append(i)
    for st_ in runs_:
        pts = [r["run"][i][:2] for i in st_]
        # (and how far down in the ground it goes: a path through a building's passage, which the
        # data also calls a tunnel, is at the street's level, with nothing over it to carry)
        deep = max((elev(r["run"][i][0], r["run"][i][1]) - r["z"][i] for i in st_), default=0)
        if len(pts) >= 2: underpasses.append((k, shapely.LineString(pts).buffer(max(TN.HALF + TN.CUT, RW.get(r["c"], 4) / 2 + 2.5) + 1.0), shapely.LineString(pts), deep))
under_tree = shapely.STRtree([u[1] for u in underpasses])
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
        # (one that crosses it is a bridge, whatever the survey's ground there: 2. keeps it; and so
        # is one the data lays right on top of the road down in it, along it)
        mid, half_ = underpasses[int(j)][2], RW.get(pending[underpasses[int(j)][0]]["c"], 4) / 2 + 0.5
        if underpasses[int(j)][3] < 2.5: continue
        if line.crosses(mid): r.setdefault("overpass", set()).update(over)
        else:
            top = {i for i in over if mid.distance(shapely.Point(r["run"][i][:2])) < half_}
            if len(top) >= 3: r.setdefault("overpass", set()).update(top)
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
is_sea = lambda p: p.get("subtype") == "ocean" and getattr(A, "sea", None) is not None   # a map by the sea holds it at sea level
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


# 1. paths along a road's marked span ride on its deck
decks = []
for k, r in enumerate(pending):
    if (r["c"] in PATHS and r["c"] != "pedestrian") or not r["span"]: continue     # (a pedestrianised street is still a street)
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        # (a pedestrian street is drawn wall to wall, far wider than its class says: its pavements on a bridge ride it too)
        reach = RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.5 + (4.0 if r["c"] == "pedestrian" else 0.0)
        decks.append((k, line.buffer(reach, cap_style=2), line, [r["z"][i] for i in range(a, b + 1)], a, b))
deck_tree = shapely.STRtree([d[1] for d in decks])
ridden = 0
NARROW = {"footway", "steps", "cycleway", "path"}     # a bridge's pavements are mapped as these; a pedestrian street is a street
for r in pending:
    r["deck"] = set()
    if r["c"] not in NARROW: continue
    pl = shapely.LineString([q[:2] for q in r["run"]])
    for j in deck_tree.query(pl):
        k, poly, line, zs, _, _ = decks[int(j)]
        # along the road, not across it
        if pl.length > 6 and pl.intersection(poly).length < 0.6 * min(pl.length, line.length) and road_lines[k].crosses(pl): continue
        for i, q in enumerate(r["run"]):
            if i in r["tow"] or not poly.contains(shapely.Point(q[:2])): continue
            t = line.project(shapely.Point(q[:2])) / (line.length or 1) * (len(zs) - 1)
            lo = min(len(zs) - 2, int(t)); f = t - lo
            # (only where the data has the path on a bridge itself, or it's at the deck's height
            # already: a path going down past the bridge's end to the ground under it doesn't ride it)
            if i not in r["span"] and abs(r["z"][i] - (zs[lo] + (zs[lo + 1] - zs[lo]) * f)) > 1.0: continue
            r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
            r["deck"].add(i); r["span"].discard(i); ridden += 1
            r.setdefault("ride", {})[i] = int(j)
if ridden: print(f"bridges: {ridden} path points ride on a road's deck beside it")

# 2. which marked spans are real bridges
kept = dropped = 0
for k, r in enumerate(pending):
    if not r["span"]: continue
    run, z, keep = r["run"], r["z"], set()
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        real = any(water_polys[int(j)].intersects(line) for j in water_tree.query(line)) \
            or any(rail_lines[int(j)].intersects(line) for j in rail_tree.query(line)) \
            or any(z[i] - elev(run[i][0], run[i][1]) > 2.5 for i in st) \
            or any(i in r.get("overpass", ()) for i in st)
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
                # a bridge the data marks over a road, the road passing well inside it (not at one
                # of its ends, where a bridge's pavement meets a side street), is a bridge, however
                # the survey has filled the gap under it: the road dips under it for headroom (3.)
                if pending[j]["c"] not in PATHS and 4 < line.project(x) < line.length - 4:
                    real = True; r.setdefault("solid", set()).update(st); break
        if real: keep |= set(st); kept += 1
        else: dropped += 1
        if real and solid: r.setdefault("solid", set()).update(st)
    r["span"] = keep
if kept or dropped: print(f"bridges: {kept} marked spans with something under them, {dropped} with nothing under them flattened as road")
# 2'. a path running along beside a street goes where the street goes: where the street isn't on a
# bridge, its pavement isn't one either (Overture's pavements over Spring Gardens Road beside
# Argyle Street were footbridges of their own, standing up out of the street's pavement)
streets_ = [k for k, r in enumerate(pending) if r["c"] not in PATHS or r["c"] == "pedestrian"]
street_tree = shapely.STRtree([road_lines[k] for k in streets_]) if streets_ else None
alongside = 0
for k, r in enumerate(pending):
    if r["c"] not in NARROW or not r["span"] or street_tree is None: continue
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        if line.length < 2: continue
        for j in street_tree.query(line.buffer(10)):
            o = pending[streets_[int(j)]]
            ln = road_lines[streets_[int(j)]]
            # beside it the whole way, running along it, and the street on the ground there
            if ln.buffer(RW.get(o["c"], 4) / 2 + 6).contains(line) and not any(ln.distance(shapely.Point(o["run"][i][:2])) < 0.5 and line.distance(shapely.Point(o["run"][i][:2])) < 12 for i in o["span"]):
                ux, uy = line.coords[-1][0] - line.coords[0][0], line.coords[-1][1] - line.coords[0][1]
                p0 = ln.interpolate(ln.project(shapely.Point(line.coords[0]))); p1 = ln.interpolate(ln.project(shapely.Point(line.coords[-1])))
                if abs(ux * (p1.x - p0.x) + uy * (p1.y - p0.y)) < 0.7 * line.length * math.dist((p0.x, p0.y), (p1.x, p1.y)): continue
                r["span"] -= set(st); alongside += 1
                break
if alongside: print(f"bridges: {alongside} spans of pavements beside a street on the ground left on the ground")

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
            if st[0] in r.get("solid", ()): continue      # (a bridge the data marks over the street, the survey having filled the gap: 2.)
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
        if i in r.get("solid", ()): continue
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

CLEAR_ROAD, CLEAR_PATH, DIP = 4.6, 2.8, 35.0     # headroom under a bridge for a road, for a path; metres over which a road eases down to it


def joined_near(j, x, y, skip):
    """Road j and the roads that meet it within DIP of (x, y), at its level, and those that meet
    them: a road beside it there that joins it nowhere near is not brought down with it."""
    zone = shapely.Point(x, y).buffer(DIP)
    near = {int(i): road_lines[int(i)].intersection(zone) for i in road_tree.query(zone) if int(i) not in skip}
    near[j] = road_lines[j].intersection(zone)

    def z_at(i, p):
        run = pending[i]["run"]
        return pending[i]["z"][min(range(len(run)), key=lambda m: math.dist(run[m][:2], (p.x, p.y)))]
    seen, todo = {j}, [j]
    while todo:
        a = todo.pop()
        for b, g in near.items():
            if b in seen or g.is_empty or near[a].is_empty or near[a].distance(g) > 0.5: continue
            pa, pb = nearest_points(near[a], g)
            if abs(z_at(a, pa) - z_at(b, pb)) < 2.0: seen.add(b); todo.append(b)
    return seen


def ease_roads(x, y, head, skip, down=True, reach=None, own=None, only=None):
    """Bring every road's points within DIP of (x, y) down to head (or up, with down False),
    easing in and out, so roads meeting there stay joined; skip: road indexes left alone (the
    bridge itself), and any road's points on a span or a deck are left alone too (except road
    own's, the one being carried over the canal); a road that's a bridge somewhere else is still
    brought down beside it, and its deck carried to its new approaches afterwards (carry_spans).
    With `only`, just those roads."""
    n = 0
    for j in road_tree.query(shapely.Point(x, y).buffer(reach or DIP)):
        j = int(j)
        if j in skip or (only is not None and j not in only): continue
        o = pending[j]
        for i, q in enumerate(o["run"]):
            if j != own and (i in o["span"] or i in o["deck"]): continue
            if i in o["tow"]: continue          # (the towpath stays level with the canal's banks)
            d = math.dist(q[:2], (x, y))
            if d >= DIP: continue
            e = d / DIP; e = e * e * (3 - 2 * e)
            want = head + (o["z"][i] - head) * e
            if (want < o["z"][i]) if down else (want > o["z"][i]): o["z"][i] = want; n += 1
    return n


# 2d. a road or path crossing the canal is a bridge over it (Overture rarely marks them), with
# headroom for a boat; unless the canal is in a tunnel there (it passes under the road)
CANAL_HEAD = 2.8     # metres of air over the water under a canal bridge (and enough over the towpath beside it)
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
        if r["c"] in PATHS and (by_a_lock(x.x, x.y) or any(g.distance(x) < LOCK_REACH for g in gates)):
            # a path crossing at a lock goes over on its walls, its deck on the coping (canal.ts),
            # with the gates and the boats under it: carried at that height, not the data's; one
            # running along the lock is on its paving (it only crosses the canal's middle line
            # where the lock narrows it), and is no bridge at all
            top = lock_coping(x.x, x.y)
            if top is not None and not along_lock(road_lines[k], x): canal_x.append((k, x, top + 0.35 - CANAL_HEAD - 0.6, half))
            continue
        # a road crossing over a lock's chamber clears the higher of the two pounds (a boat rises
        # in it to the upper one), not just the one it's over; one crossing below the bottom gates
        # (Pulteney Road at Bath Deep Lock) only has the lower pound under it
        for lo, hi, top in lock_levels:
            if lo.distance(x) + hi.distance(x) < lo.distance(hi) + 6: lv = max(lv, top)
        canal_x.append((k, x, lv, half))
over_canal = 0
road_x = [(x, lv, k) for k, x, lv, half in canal_x if pending[k]["c"] not in PATHS]
for k, x, lv, half in canal_x:
    r, run = pending[k], pending[k]["run"]
    deck = lv + CANAL_HEAD + 0.6
    reach = half + 6.0      # the water and the towpath either side
    beside = next((ok for ox, _, ok in road_x if x.distance(ox) < BESIDE), None) if r["c"] in PATHS else None
    # the road, and the roads joining it on the approaches, rise to the deck; then the span
    ease_roads(x.x, x.y, deck, set(), down=False, own=k)
    for i, q in enumerate(run):
        if math.dist(q[:2], (x.x, x.y)) < reach:
            if beside is not None:
                # the road's pavement over the canal, at its deck's height
                o = pending[beside]
                r["deck"].add(i); r["span"].discard(i)
                r.setdefault("beside", {})[i] = beside       # (taken again from the road's final height when it's written out)
                r["z"][i] = o["z"][min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], q[:2]))]
            else: r["span"].add(i); r.setdefault("solid", set()).add(i)
            if math.dist(q[:2], (x.x, x.y)) < half + 1.5: r.setdefault("least", {})[i] = lv + CANAL_HEAD + 0.6
            over_canal += 1
if over_canal: print(f"bridges: {over_canal} road points carried over the canal")

# 2e. every span carried straight from abutment to abutment. Once it's settled what's a bridge (the
# data's own, a road over an underpass, a crossing of the canal, a path over the water), each is
# levelled the same way, and along the whole road, not the piece of it the data happens to split
# the bridge into: the pieces of a road that meet end to end are joined up first, so a bridge that
# is a piece of its own still has its approaches. Each approach is taken from the road's own slope
# a little way out (12 to 40 m), where the survey is clear of the gap it has for the bridge, and the
# last few metres ramp up from the survey to that line where the survey dips into the gap; the deck
# runs straight between the two. (Never held level for 40 m at the highest point nearby: on a
# hillside that's far up the slope, and the road would stand on a shelf and then plunge.)
def carry_spans(raise_only=False):
    """Carry every span straight (carry_profile) along whole roads; raise_only: a deck may come up
    but not down (once what passes under has been given headroom under it)."""
    n_spans = 0
    # where a road's end meets another road on a bridge (a side road joining it there), it meets
    # the deck at the deck's height
    on_deck = defaultdict(list)
    for k, r in enumerate(pending):
        for i in r["span"]: on_deck[(round(r["run"][i][0]), round(r["run"][i][1]))].append((k, i))
    def deck_at(q, own, z=None):
        """The deck of a bridge that road end q (at height z) joins, if any: a road ending well
        below a deck (more than any junction could be: less than headroom) passes under it."""
        for dx_ in (-1, 0, 1):
            for dy_ in (-1, 0, 1):
                for k, i in on_deck.get((round(q[0]) + dx_, round(q[1]) + dy_), []):
                    h = pending[k]["z"][i]
                    if k not in own and math.dist(pending[k]["run"][i][:2], q[:2]) < 1.0 and (z is None or abs(h - z) < 2.5): return h
        return None
    for chain in chains():
        pts = [pending[k]["run"][i] for k, i in chain]
        z0_, z1_ = pending[chain[0][0]]["z"][chain[0][1]], pending[chain[-1][0]]["z"][chain[-1][1]]
        if not any(i in pending[k]["span"] for k, i in chain) and deck_at(pts[0], (), z0_) is None and deck_at(pts[-1], (), z1_) is None: continue
        z = [pending[k]["z"][i] for k, i in chain]
        on = [i in pending[k]["span"] for k, i in chain]
        d = [0.0]
        for a, b in zip(pts, pts[1:]): d.append(d[-1] + math.dist(a[:2], b[:2]))
        # where a bridge that's a piece of its own meets the road leading to it, the point they share
        # is the abutment, on the ground in both (so the game ramps the deck up from it in the
        # bridge's piece, and the road meets it there at the same height)
        for m in range(len(chain) - 1):
            if d[m + 1] - d[m] < 0.01 and on[m] != on[m + 1]:
                on[m] = on[m + 1] = False
                for k, i in chain[m:m + 2]: pending[k]["span"].discard(i)
        free = [not on[m] and i not in pending[k]["deck"] and i not in pending[k]["tow"] for m, (k, i) in enumerate(chain)]
        own = {k for k, _ in chain}
        # and an end on the ground meeting a bridge there rises or falls to its deck over the last 20 m
        for e0, step in ((0, 1), (len(chain) - 1, -1)):
            h = deck_at(pts[e0], own, z[e0]) if free[e0] else None
            if h is None or abs(h - z[e0]) < 0.2: continue
            j = e0
            while 0 <= j < len(chain) and free[j] and abs(d[j] - d[e0]) < 20:
                w = abs(d[j] - d[e0]) / 20; w = w * w * (3 - 2 * w)
                z[j] = h + (z[j] - h) * w
                j += step
        least = [pending[k].get("least", {}).get(i, -math.inf) for k, i in chain]
        before = list(z)
        n_spans += carry_profile(z, d, on, free, (deck_at(pts[0], own, z[0]), deck_at(pts[-1], own, z[-1])), least)
        if raise_only: z = [max(a, b) if on[m] else a for m, (a, b) in enumerate(zip(z, before))]
        for (k, i), h in zip(chain, z): pending[k]["z"][i] = h
    # and the paths riding on a road's deck beside it take its new heights
    for r in pending:
        for i, j in r.get("ride", {}).items():
            k, poly, line, _, a, b = decks[j]
            zs = pending[k]["z"][a:b + 1]
            t = line.project(shapely.Point(r["run"][i][:2])) / (line.length or 1) * (len(zs) - 1)
            lo = min(len(zs) - 2, int(t)); f = t - lo
            r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
    return n_spans


# 2f. two ways crossing a metre and a half or more apart in height, with no bridge in the data and
# no junction between them, cross on a bridge: the upper one is carried over the lower one there
# (which then dips under it for headroom: 3. below), rather than the two passing through each other
inferred = 0
for k, r in enumerate(pending):
    for j in road_tree.query(road_lines[k]):
        j = int(j)
        if j <= k: continue
        x = crossing(k, j, road_lines[k])
        if x is None: continue
        o = pending[j]
        near_k = [i for i, q in enumerate(r["run"]) if math.dist(q[:2], (x.x, x.y)) < 6]
        near_j = [i for i, q in enumerate(o["run"]) if math.dist(q[:2], (x.x, x.y)) < 6]
        if not near_k or not near_j: continue
        if any(i in r["span"] | r["deck"] for i in near_k) or any(i in o["span"] | o["deck"] for i in near_j): continue
        if r["tunnel_ranges"] and in_ranges([r["run"][i] for i in near_k], r["tunnel_ranges"]): continue     # (in a tunnel: under the hill)
        if o["tunnel_ranges"] and in_ranges([o["run"][i] for i in near_j], o["tunnel_ranges"]): continue
        zk, zj = min(r["z"][i] for i in near_k), min(o["z"][i] for i in near_j)
        if abs(zk - zj) < 1.5: continue
        (up, upi), (lo_, loi) = ((r, k), (o, j)) if zk > zj else ((o, j), (r, k))
        reach = RW.get(lo_["c"], 4) / 2 + 2.5
        for i, q in enumerate(up["run"]):
            if math.dist(q[:2], (x.x, x.y)) < reach and i not in up["tow"]:
                up["span"].add(i); up.setdefault("solid", set()).add(i); inferred += 1
if inferred: print(f"bridges: {inferred} points of ways carried over others they cross well above, with no bridge in the data")
carry_spans()
print(f"bridges: {carry_spans()} spans carried straight between their abutments")      # (twice: a side road meets a bridge carried in the first go)

# 3. what passes under a road's bridge passes under it (but not the rest of the bridge's own road,
# the pieces the data splits it into, nor a road joining it on the bridge)
dipped = 0
dips = []     # (road index, crossing point): the roads dipped under a bridge, for the ground to follow them
chain_of = {}
for c_, ch in enumerate(chains()):
    for k_, _ in ch: chain_of[k_] = c_
def own_road(k, line):
    """The pieces of road k's own road, and the roads with an end on its bridge (line)."""
    same = {j for j, c_ in chain_of.items() if c_ == chain_of.get(k)} | {k}
    on = line.buffer(1.0)
    return same | {int(j) for j in road_tree.query(on) if any(on.contains(shapely.Point(pending[int(j)]["run"][e][:2])) for e in (0, -1))}
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
            # a bridge or a deck itself here: leave it be (but a path coming off a bridge's deck
            # and down under the same bridge, to the towpath under it, has the deck only behind it)
            m_ = min(range(len(o["run"]) - 1), key=lambda m: shapely.LineString([o["run"][m][:2], o["run"][m + 1][:2]]).distance(x))
            if any(i in o["span"] | o["deck"] for i in (m_ - 1, m_, m_ + 1, m_ + 2)): continue
            if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"]): continue
            t = line.project(x) / (line.length or 1) * (b - a)
            lo = a + min(b - a - 1, int(t)); f = t - (lo - a)
            deck = z[lo] + (z[lo + 1] - z[lo]) * f
            under = min(o["z"][i] for i in range(len(o["run"])) if math.dist(o["run"][i][:2], (x.x, x.y)) < 6) if any(math.dist(q[:2], (x.x, x.y)) < 6 for q in o["run"]) else deck
            # whatever crosses a bridge well inside it (not at its ends, where its own pavements
            # and the side streets meet it) goes under it, with headroom, however short the bridge
            if not solid and not 3 < line.project(x) < line.length - 3: continue
            # a bridge reaches right over what goes under it: where that crosses at its very end,
            # its span runs on a few metres past, rather than the road coming down off its deck
            # onto an embankment the way under runs into
            to_a, to_b = math.dist(run[st[0]][:2], (x.x, x.y)), math.dist(run[st[-1]][:2], (x.x, x.y))
            if min(to_a, to_b) < 5:
                near = min(range(len(run)), key=lambda i: math.dist(run[i][:2], (x.x, x.y)))
                step_ = -1 if to_a < to_b else 1
                end_ = st[0] if step_ < 0 else st[-1]
                far_ = near + step_ * 2
                for i in range(end_, far_ + step_, step_):
                    if 0 <= i < len(run) and i not in r["deck"]: r["span"].add(i); r.setdefault("solid", set()).add(i)
            # a path meeting a road's short span at its level crosses on the deck, it doesn't go under
            if o["c"] in PATHS and line.length < VIADUCT and st[0] not in r.get("solid", set()) and abs(deck - under) < 1.0: continue
            dips.append((j, x))
            head = deck - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD) - 0.5      # (a little to spare, the deck being sampled a point or two off the crossing)
            # the road under, and the roads joining it there, dip together
            skip = own_road(k, line)
            dipped += ease_roads(x.x, x.y, head, skip, only=joined_near(j, x.x, x.y, skip))
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
                if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 4 for i in o["span"] | o["deck"]): continue     # (a bridge itself right there)
                kk = min(range(k, e + 1), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                head = tp[kk][2] - 0.9 - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
                dipped += ease_roads(x.x, x.y, head, set(), only=joined_near(j, x.x, x.y, set()))
                dips.append((j, x))
        k = e + 1
if dipped: print(f"bridges: {dipped} road points dipped to pass under a bridge")
if dipped: carry_spans(True)      # (a road dipped beside a bridge of its own has its deck carried to its new approaches)


def limit_grades():
    """No road steeper than its kind may be (STEEPEST), after the dips under bridges and the
    climbs onto them: where one is, the ramp is lengthened, the bottom of each dip (and every
    bridge's deck, and the towpath) staying where it is."""
    held = defaultdict(set)
    for j, x in dips:
        for i, q in enumerate(pending[j]["run"]):
            if math.dist(q[:2], (x.x, x.y)) < 6: held[j].add(i)
    # (the main roads first, and a lesser road held where it meets one already eased, as in smooth_network)
    done, key = {}, lambda q: (round(q[0] * 2), round(q[1] * 2))
    order = sorted((ch for ch in chains() if pending[ch[0][0]]["c"] not in PATHS or pending[ch[0][0]]["c"] == "pedestrian"),
                   key=lambda ch: (RANK.get(pending[ch[0][0]]["c"], 6), -len(ch)))
    for ch in order:
        pts = [pending[k]["run"][i] for k, i in ch]
        z = [pending[k]["z"][i] for k, i in ch]
        meets = [key(q) in done and abs(done[key(q)] - h) < 2.5 for q, h in zip(pts, z)]
        z = [done[key(q)] if m_ else h for q, h, m_ in zip(pts, z, meets)]
        d = [0.0]
        for a, b in zip(pts, pts[1:]): d.append(d[-1] + math.dist(a[:2], b[:2]))
        fixed = [m_ or i in pending[k]["span"] or i in pending[k]["deck"] or i in pending[k]["tow"] or i in held[k] for m_, (k, i) in zip(meets, ch)]
        lim = [STEEPEST.get(pending[ch[m][0]]["c"], 0.33) * (d[m + 1] - d[m]) for m in range(len(ch) - 1)]
        ease_grades(z, d, lim, fixed)
        ease_kinks(z, d, fixed)
        for q, (k, i), h in zip(pts, ch, z):
            pending[k]["z"][i] = h
            done.setdefault(key(q), h)


limit_grades()

# 4. a path through the water (the data has no bridge) is a footbridge: its points well inside a
# pond or river are a span, just above the water
afloat = 0
for r in pending:
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
        for i, q in enumerate(r["run"]):
            pt = shapely.Point(q[:2])
            if poly.contains(pt) and poly.exterior.distance(pt) > 1.5 and i not in r["deck"]:
                r["span"].add(i); r["z"][i] = max(r["z"][i], wz + 0.8); afloat += 1
if afloat: print(f"bridges: {afloat} path points over water carried as footbridges")
if afloat: carry_spans(True)      # (the footbridges too)

# a road the data lays right on top of another, well above it (a lane along the top of a cutting
# drawn over the road down in it, or a path whose bridge the data stops short of the road it
# crosses), is on a bridge there: the ground is the lower road's. Over a bored tunnel the ground is
# the hill over its roof, and a way on it stays on the ground; and a path along the top of a
# cutting's side, over the road's verge, is beside it, not on it
stacked = 0
for k, r in enumerate(pending):
    if r["c"] in PATHS and r["c"] in ("steps", "pedestrian"): continue
    for j in road_tree.query(road_lines[k].buffer(4.0)):
        o = pending[int(j)]
        if int(j) == k or o["c"] in PATHS: continue
        half_ = RW.get(o["c"], 4) / 2 - (1.5 if r["c"] in PATHS else 0.0)    # (structures.VERGE)
        line_ = road_lines[int(j)]
        for i, q in enumerate(r["run"]):
            if i in r["span"] or i in r["deck"] or i in r["tow"]: continue
            pt = shapely.Point(q[:2])
            if line_.distance(pt) > half_: continue
            m_ = min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], q[:2]))
            if any(b0 <= m_ <= b1 for b0, b1 in o["bored"]): continue
            if r["z"][i] - o["z"][m_] >= (2.5 if r["c"] in PATHS else 3.0) and m_ not in o["span"]:
                r["span"].add(i); r.setdefault("solid", set()).add(i); stacked += 1
if stacked: print(f"bridges: {stacked} road points lying over another road well below them carried as bridges")

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
# the railway's bridges likewise: the track on the ground either side doesn't flatten the ground
# under a span (on the lidar's true embankments a short bridge's gap was filled from both ends);
# and the track on the ground keeps its own ground, under a road's bridge too, as does a road
# passing under at grade (a path under one lies on the ground as it is, and nothing fills it)
RAIL_HALF = 4.5
for t in rail_tracks:
    tp = t["p"]
    for st in stretches({i for i, q in enumerate(tp) if q[3] == 1}):
        a, b = tp[max(0, st[0] - 1)], tp[min(len(tp) - 1, st[-1] + 1)]
        pts = [((a[0] + tp[st[0]][0]) / 2, (a[1] + tp[st[0]][1]) / 2)] + [tuple(tp[i][:2]) for i in st] \
            + [((b[0] + tp[st[-1]][0]) / 2, (b[1] + tp[st[-1]][1]) / 2)]
        win, inn = cover_xy(shapely.LineString(pts).buffer(RAIL_HALF, cap_style=2))
        PROTECT[win][inn] = True
for t in rail_tracks:
    tp = t["p"]
    for st in stretches({i for i, q in enumerate(tp) if q[3] == 0}):
        if len(st) < 2: continue
        win, inn = cover_xy(shapely.LineString([tp[i][:2] for i in st]).buffer(RAIL_HALF))
        PROTECT[win][inn] = False
for o in pending:
    if o["c"] in PATHS and o["c"] != "pedestrian": continue
    for st in stretches({i for i in range(len(o["run"])) if i not in o["span"] and i not in o["deck"]}):
        if len(st) < 2: continue
        win, inn = cover_xy(shapely.LineString([o["run"][i][:2] for i in st]).buffer(RW.get(o["c"], 4) / 2 + 2.5, cap_style=2))
        PROTECT[win][inn] = False

for r in pending:
    c, run, z, span, bored, tunnel_ranges = r["c"], r["run"], r["z"], r["span"], r["bored"], r["tunnel_ranges"]
    deck = r.get("deck", set())
    if bored or tunnel_ranges:
        flatten(run, z, TN.HALF + TN.CUT if bored else max(TN.HALF + TN.CUT, RW.get(c, 4) / 2 + 2.5), TN.cuttings(run, tunnel_ranges, bored))
    if c in PATHS and c != "pedestrian":
        # a path lies on the ground as it is, except on its way up to a bridge of its own: there the
        # ground is laid to its ramp, so the deck meets the ground at its abutments
        ramp = {i for st in stretches(span) for e in (st[0], st[-1]) for i in range(e - 3, e + 4)
                if 0 <= i < len(run) and i not in span and i not in deck}
        if ramp: flatten(run, z, RW.get(c, 1.6) / 2 + 1.0, ramp)
        # and where it's dipped to pass under a bridge with headroom, the ground is dug out with it,
        # as it is under a road (the game lays a path on the ground: undug, it would run into the deck)
        # (not in a tunnel, which goes through the hill, and never deeper than a dip under a bridge)
        in_bore = {i for i0, i1 in bored for i in range(i0, i1 + 1)} | in_ranges(run, tunnel_ranges)
        dug = {i for i in range(len(run)) if i not in span and i not in deck and i not in r["tow"] and i not in in_bore
               and elev(run[i][0], run[i][1]) - 6.0 < z[i] < elev(run[i][0], run[i][1]) - 0.4}
        dug |= {j for i in dug for j in (i - 1, i + 1) if 0 <= j < len(run) and j not in span and j not in deck and j not in r["tow"] and j not in in_bore}
        if dug: flatten(run, z, RW.get(c, 1.6) / 2 + 1.0, dug)
        continue     # (a pedestrianised street is still a street: its ground is flattened)
    # the ground is flattened under the road, but not under a bridge's span: what it
    # crosses (the river, the railway, another road) keeps its own ground, and the game
    # builds the deck, its parapets and its abutments at the road's own height
    open_pts = {i for i in range(len(run)) if i not in span and i not in deck}
    if bored: open_pts &= {i for i0, i1 in TN.split(run, bored) for i in range(i0, i1 + 1)}
    flatten(run, z, RW.get(c, 4) / 2 + 2.5, None if len(open_pts) == len(run) else open_pts)
# the railway (tools/railway.py, <map>-rail.json): the ground is flattened under the track where it
# runs on the ground, as under a road, so it sits in its cuttings and on its embankments rather
# than through the hillside; not under its bridges and viaducts, nor over its tunnels
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
# the ground over a tunnel is the hill's, whole: the cut down to the road at each portal, and the
# easing out from it, stop a few metres in, inside the tube's mouth, where the game hides them
for r in pending:
    for i0, i1 in r["bored"]:
        bore = shapely.LineString([q[:2] for q in r["run"][i0:i1 + 1]])
        if bore.length < 4: continue
        win, inn = cover_xy(bore.buffer(TN.HALF + TN.CUT + 1.0, cap_style=2))
        gx, gy = GX[win][inn], GY[win][inn]
        along = shapely.line_locate_point(bore, shapely.points(gx, gy))
        under = (along > TN.INTO + 1.0) & (along < bore.length - TN.INTO - 1.0)
        blk = grid[win]
        sub = blk[inn]
        dug = under & (sub < SURVEY[win][inn] - 0.5)
        sub[dug] = SURVEY[win][inn][dug]
        blk[inn] = sub


def gelev0(x, y):
    fi, fj = (x - X0) / dx, (y - Y0) / dy
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = min(1, max(0, fi - i)), min(1, max(0, fj - j))
    return (grid[j, i] * (1 - u) + grid[j, i + 1] * u) * (1 - v) + (grid[j + 1, i] * (1 - u) + grid[j + 1, i + 1] * u) * v


# a span's marks run to where the deck meets the ground as it now is, so the game's deck reaches
# the banks rather than stopping short with a step down; then the roads are written out
grown = 0
on_tow = set()      # the points on the canal's towpath (level with its banks, whatever the ground)
for r in pending:
    if not r["span"]: continue
    run, z, n = r["run"], r["z"], len(r["run"])
    for st in stretches(set(r["span"])):
        a, b = st[0], st[-1]
        while a > 0 and a - 1 not in r["deck"] and z[a - 1] - gelev0(run[a - 1][0], run[a - 1][1]) > 0.3: a -= 1; r["span"].add(a); grown += 1
        while b < n - 1 and b + 1 not in r["deck"] and z[b + 1] - gelev0(run[b + 1][0], run[b + 1][1]) > 0.3: b += 1; r["span"].add(b); grown += 1
# (a path riding a deck only runs on along it a few metres: one leaving the bridge along the
# canal, over a lock or a cutting where the ground is far below, goes down to it, and isn't
# carried on through the air beside the canal at the bridge's height)
RIDE_ON = 6.0
for r in pending:
    if not r["deck"]: continue
    run, z, n = r["run"], r["z"], len(r["run"])
    for st in stretches(set(r["deck"])):
        a, b = st[0], st[-1]
        far = lambda i, j: math.dist(run[i][:2], run[j][:2]) > RIDE_ON
        while a > 0 and a - 1 not in r["span"] and not far(a - 1, st[0]) and z[a - 1] - gelev0(run[a - 1][0], run[a - 1][1]) > 0.3: a -= 1; r["deck"].add(a); grown += 1
        while b < n - 1 and b + 1 not in r["span"] and not far(b + 1, st[-1]) and z[b + 1] - gelev0(run[b + 1][0], run[b + 1][1]) > 0.3: b += 1; r["deck"].add(b); grown += 1
if grown: print(f"bridges: spans run {grown} points further to where their decks meet the ground")
for r in pending:
    # a point the towpath took that has a bridge on both sides of it is on the bridge, high over
    # the bank (a footbridge's crossing the data doesn't mark as one), not down on the towpath
    on = r["span"] | r["deck"]
    for i in [i for i in r["tow"] if i - 1 in on and i + 1 in on]:
        del r["tow"][i]; r["z"][i] = (r["z"][i - 1] + r["z"][i + 1]) / 2
        (r["span"] if i - 1 in r["span"] else r["deck"]).add(i)
    for i, h in r["tow"].items(): r["z"][i] = h; r["span"].discard(i); r["deck"].discard(i)
    for i in r["tow"]: on_tow.add((round(r["run"][i][0], 1), round(r["run"][i][1], 1)))
    for i, k in r.get("beside", {}).items():
        o = pending[k]
        r["z"][i] = o["z"][min(range(len(o["run"])), key=lambda m: math.dist(o["run"][m][:2], r["run"][i][:2]))]
    c, run, z, span, bored, deck = r["c"], r["run"], r["z"], r["span"], r["bored"], r.get("deck", set())
    # a bridge's points carry a fourth value: 1 on a span the game builds the bridge for, 2 on
    # a deck beside a road's span (a path along a bridge), at the road's height, with nothing built
    pts = [[r1(a), r1(b), r1(h)] + ([1] if i in span else [2] if i in deck else []) for i, ((a, b, _), h) in enumerate(zip(run, z))]
    for i0, i1 in TN.split(run, bored):
        roads.append(dict(c=c, n=r["n"], p=pts[i0:i1 + 1], **({"ow": r["ow"]} if r["ow"] else {})))
    for (i0, i1), (head, tail) in zip(bored, TN.faces(run, z, bored, elev, c)):
        tp = pts[i0:i1 + 1]
        tunnel_list.append(dict(c=c, n=r["n"], p=([[r1(v) for v in head]] if head else []) + tp + ([[r1(v) for v in tail]] if tail else [])))
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
    OTHER_WET = np.zeros(grid.shape, dtype=bool)    # under a river, a stream or a pond (not the canal)
    # how the game draws the canal (web/src/canal.ts): its bed 1.2 m under the water, and each lock's
    # chamber 2.15 m either side of its middle with 1.2 m of coping beyond, its walls running 2.2 m
    # past each pair of gates and its floor 1.6 m under the water below it. The survey over the
    # water is whatever the lidar caught (often the water itself, or the bank), so the ground is
    # dug to these instead, a little deeper, and the drawn bed and floors are what you stand on.
    CANAL_BED, LOCK_HALF, LOCK_COPE, LOCK_TAIL, LOCK_FLOOR = 1.3, 2.15, 1.2, 2.2, 2.0
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
            # the basins off it (a marina): canal.ts draws their water too, at their pound's level
            cbasins = [(shapely.Polygon(b["r"][0], b["r"][1:]).buffer(0.8), b["lv"]) for b in json.load(open(canal_file)).get("basins", []) if not b.get("own")]
    QUAY_DEPTH, QUAY_HEIGHT, QUAY_REACH = 2.5, 1.5, 30.0
    whole_sea = unary_union([q for g, p in L("water") if is_sea(p) for q in whole_polys(g, BM.buffer(QUAY_REACH))] or [Point(1e9, 1e9)])
    beaches = unary_union([q for g, p in L("land") if p.get("class") in ("beach", "sand") for q in whole_polys(g)] or [Point(1e9, 1e9)])
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
                at_sea = is_sea(p)
                wz = A.sea if at_sea else min(elev(x, y) for x, y in rings[0]) + 0.1
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
                        for bp, blv in cbasins:
                            inb = shapely.contains_xy(bp, GX[win][wet], GY[win][wet])
                            bed |= inb; lv = np.where(inb, blv, lv)
                        blk = grid[win]; blk[wet] = np.where(bed, np.minimum(blk[wet], lv - CANAL_BED), np.maximum(blk[wet], lv + 0.3)); grid[win] = blk
                    elif at_sea:
                        # the harbour's quays stand straight up out of deep water, a metre and a
                        # half above it; a beach is left to run down into the sea
                        grid[win][wet] = np.minimum(grid[win][wet], wz - QUAY_DEPTH)
                        qwin, quay = cover_xy(poly.buffer(QUAY_REACH, join_style=2), edge=True)
                        quay &= ~shapely.intersects_xy(whole_sea, GX[qwin], GY[qwin]) & ~shapely.contains_xy(beaches, GX[qwin], GY[qwin])
                        grid[qwin][quay] = np.maximum(grid[qwin][quay], wz + QUAY_HEIGHT)
                    else:
                        grid[win][wet] = np.minimum(grid[win][wet], wz - 0.6)
                        blk = OTHER_WET[win]; blk[wet] = True
                    if not at_sea: banks.append((poly, None if is_canal else wz))
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
        # (not a road's or the railway's flattened ground, nor a building's: a grid cell clear of
        # its edge, so no triangle of ground under the road or the track is dragged down with the bank)
        near = ~shapely.contains_xy(poly, px, py) & (flat_w[win] > flat_f[win] + 1.5 * dx) & ~BUILT[win]
        if PROTECT is not None: near &= ~PROTECT[win]                                                   # (nor a bridge's abutments)
        if not near.any(): continue
        d = shapely.distance(edge, shapely.points(px[near], py[near]))
        s = np.clip(d / BANK, 0, 1); s = s * s * (3 - 2 * s)
        lip = (canal_lv(px[near], py[near]) if wz is None else wz) + 0.3
        want = lip + (grid[win][near] - lip) * s
        blk = grid[win]
        blk[near] = np.minimum(blk[near], want)
        grid[win] = blk
    # the canal's bed, banks and towpath, along its own line (tools/canal.py). It's laid as a
    # canal is built, whatever the survey made of the ground by the water (which is noisy there,
    # and in Bath often a hillside): the bed under the water, then each bank level, a little above
    # the water, out to TOW_W past its edge and on over the towpath wherever a path runs along it,
    # and from there a cutting or an embankment back to the ground's own level, sloped as a road's
    # is. Beside a lock the banks are at its coping, and below its bottom gates they come down
    # beside its wing walls (tools/canal.py's "tl") to the pound below, as the towpath does. The bank is cut and filled to that, not just dug: a
    # canal on a hillside stands on its own bank on the downhill side. Left alone: the canal's
    # tunnels and aqueduct, buildings and the quays round them, a road at grade and its verge, and
    # the river (the bottom lock opens into it). Under a bridge, and over a road or the railway
    # in the canal's way, the banks are only dug, never filled: the towpath goes under a bridge
    # over the canal, and nothing is buried
    if canal_lv is not None:
        TOW_UP = 0.4        # how far a bank or towpath stands above the water
        TOW_W = 3.0         # how far the level bank reaches past the water's edge, at least
        TOW_REACH = 14.0    # a path this close to the water's edge, running along it, is its towpath
        LOCK_SIDE = 5.5     # how far the level ground reaches past a lock's coping
        segs = []           # (ax, ay, bx, by, half, level, flags)
        for run in json.load(open(canal_file))["runs"]:
            pts = run["p"]
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                if max(a[0], b[0]) < X0 - 60 or min(a[0], b[0]) > X1 + 60 or max(a[1], b[1]) < Y0 - 60 or min(a[1], b[1]) > Y1 + 60: continue
                segs.append((a[0], a[1], b[0], b[1], max(a[2], b[2]), run["lv"], a[6] | b[6]))
        clocks = json.load(open(canal_file))["locks"]
        seg_tree = shapely.STRtree([shapely.LineString([sg[:2], sg[2:4]]) for sg in segs]) if segs else None

        def canal_at(px, py):
            """For points: how far each is past the canal's water's edge (or a lock's coping), the
            water's level there, the level its bank is laid at, how far that bank reaches, and
            whether the canal there is in a tunnel or on the aqueduct."""
            n = len(px)
            d, lv, top, wide, odd = np.full(n, np.inf), np.zeros(n), np.zeros(n), np.full(n, TOW_W), np.zeros(n, dtype=bool)
            locky = np.zeros(n, dtype=bool)
            far = TOW_REACH + EASE + 10
            for ax, ay, bx, by, half, l, f in segs:
                sel = np.flatnonzero((px > min(ax, bx) - half - far) & (px < max(ax, bx) + half + far) & (py > min(ay, by) - half - far) & (py < max(ay, by) + half + far))
                if not len(sel): continue
                vx, vy = bx - ax, by - ay
                t = np.clip(((px[sel] - ax) * vx + (py[sel] - ay) * vy) / (vx * vx + vy * vy or 1), 0, 1)
                dd = np.hypot(px[sel] - ax - t * vx, py[sel] - ay - t * vy) - half
                k = dd < d[sel]; sel = sel[k]
                d[sel], lv[sel], top[sel], wide[sel], odd[sel] = dd[k], l, l + TOW_UP, TOW_W, bool(f & 3)
            for lk in clocks:
                (ax, ay), (bx, by) = lk["lo"], lk["hi"]
                span = math.hypot(bx - ax, by - ay) or 1
                ux, uy = (bx - ax) / span, (by - ay) / span
                u = (px - ax) * ux + (py - ay) * uy
                v = np.abs(-(px - ax) * uy + (py - ay) * ux)
                cope = lk["zh"] + 0.45 - 0.05          # (just under the coping, which canal.ts draws)
                side = LOCK_HALF + LOCK_COPE
                # beside the chamber, out from its coping
                k = (u >= -LOCK_TAIL) & (u <= span + LOCK_TAIL) & (v - side < d)
                d[k], lv[k], top[k], wide[k], odd[k], locky[k] = v[k] - side, cope, cope, LOCK_SIDE, False, True
                # below the bottom gates the lock's wing walls run on beside the water, their
                # coping coming down from the lock's to the pound's, and the ground beside them
                # with it, then easing back to its own level as it would by the canal's bank
                tl = lk.get("tl", LOCK_TAIL + (lk["zh"] - lk["zl"]) * 6)
                k = (u < -LOCK_TAIL) & (u >= -tl) & ((v < side + LOCK_SIDE) | ((d > 0) & (v < side + LOCK_SIDE + EASE + 4)))
                if k.any():
                    t = np.clip((u[k] + tl) / (tl - LOCK_TAIL), 0, 1)
                    wall = lk["zl"] + TOW_UP + (cope - lk["zl"] - TOW_UP) * t
                    d[k], lv[k], top[k], wide[k], odd[k], locky[k] = v[k] - side, wall, wall, LOCK_SIDE, False, True
            return d, lv, top, wide, odd, locky

        # the towpath: the mapped paths that run along the canal close to its water (on the
        # ground: not where a path is carried over something on a bridge); none in a square the
        # canal doesn't come near
        tow = []
        for r in roads if segs else []:
            if r["c"] not in PATHS or r["c"] in ("steps", "pedestrian") or len(r["p"]) < 2: continue
            c = np.array([q[:2] for q in r["p"]], dtype=float)
            if c[:, 0].max() < X0 - 60 or c[:, 0].min() > X1 + 60 or c[:, 1].max() < Y0 - 60 or c[:, 1].min() > Y1 + 60: continue
            mid = (c[:-1] + c[1:]) / 2
            qx, qy = np.concatenate([c[:-1, 0], mid[:, 0], c[1:, 0]]), np.concatenate([c[:-1, 1], mid[:, 1], c[1:, 1]])
            qd, _, _, _, qo, _ = canal_at(qx, qy)
            m = len(mid)
            close = ((qd < TOW_REACH) & ~qo).reshape(3, m).all(axis=0)
            for i in np.flatnonzero(close):
                if len(r["p"][i]) > 3 or len(r["p"][i + 1]) > 3: continue
                (ax, ay), (bx, by) = c[i], c[i + 1]
                if math.hypot(bx - ax, by - ay) < 0.5: continue
                # along the canal, not across it (a path crossing it is on a bridge)
                near = segs[int(seg_tree.nearest(shapely.Point(mid[i])))]
                sx, sy = near[2] - near[0], near[3] - near[1]
                cos = abs(sx * (bx - ax) + sy * (by - ay)) / ((math.hypot(sx, sy) or 1) * math.hypot(bx - ax, by - ay))
                if cos > 0.8: tow.append((ax, ay, bx, by, RW.get(r["c"], 1.6) / 2 + 0.8))
        win, near = cover_xy(shapely.MultiLineString([[sg[:2], sg[2:4]] for sg in segs]).buffer(TOW_REACH + EASE + 4), edge=True) if segs else (None, None)
        if segs and near.any():
            px, py = GX[win][near], GY[win][near]
            d, lv, top, wide, odd, locky = canal_at(px, py)
            # how far past the level bank (and the towpath) each point is
            out = d - wide
            for ax, ay, bx, by, hw in tow:
                sel = np.flatnonzero((px > min(ax, bx) - hw - 1) & (px < max(ax, bx) + hw + 1) & (py > min(ay, by) - hw - 1) & (py < max(ay, by) + hw + 1))
                if not len(sel): continue
                vx, vy = bx - ax, by - ay
                t = np.clip(((px[sel] - ax) * vx + (py[sel] - ay) * vy) / (vx * vx + vy * vy or 1), 0, 1)
                out[sel] = np.minimum(out[sel], np.hypot(px[sel] - ax - t * vx, py[sel] - ay - t * vy) - hw)
            blk = grid[win]; cur = blk[near]
            # the bank: from the bed up to its top at the water's edge, and level beyond
            rise = top - lv
            bank = np.where(d < 0, lv + np.maximum(-CANAL_BED, 0.45 * d), lv + rise * np.clip(d / np.maximum(0.9, rise), 0, 1))
            bank = np.where(d < wide, bank, top)                  # (and the towpath, where it runs on past that)
            # and beyond it, back to the ground's own level, over a distance that grows with the difference
            ease = np.clip(np.abs(cur - top) * SLOPE, 2.5, EASE)
            e = np.clip(out / ease, 0, 1); e = e * e * (3 - 2 * e)
            want = np.where(out <= 0, bank, top + (cur - top) * e)
            # a road or the railway, at grade or under a bridge, is never buried: there the canal only digs
            road = flat_in[win][near] | (flat_w[win][near] < flat_f[win][near] + 1.0)
            under = PROTECT[win][near] if PROTECT is not None else np.zeros(len(px), dtype=bool)
            keep = odd | ((road | BUILT[win][near] | OTHER_WET[win][near]) & (d > 0.8)) | (under & (out > 0))
            new = np.where(keep, cur, np.where(road | under, np.minimum(cur, want), want))
            # Along the open water the canal brings its own banks (web/src/works.ts: the coping, the
            # towpath, the verges and walls down or up to the ground), and the game cuts the ground
            # away under them, exactly along their outer edge. So the ground here is left as it lies,
            # for the ground just outside that edge (drawn in the same triangles as the ground just
            # inside it) to carry on smoothly, with no bank or ditch laid into the grid to jag it;
            # only under the water is it kept down below the surface, for the canal seen from afar.
            # Beside the locks it's laid as before, just under their paving (canal.ts).
            sunk = np.minimum(cur, lv - 0.3 - 0.9 * np.clip(-d / 1.5, 0, 1))
            new = np.where(locky, new, np.where(odd | (d >= 0), cur, sunk))
            print(f"canal: its banks laid at {int((np.abs(new - cur) > 0.05).sum())} vertices, {len(tow)} stretches of towpath")
            blk[near] = new; grid[win] = blk
        # the locks: the stretches stop at their gates, and the water piece round a lock is banked
        # up to the pound above, so each chamber is dug out here, under its coping too, below its
        # floor (the game hides the ground left inside the chamber between the grid's vertices, and
        # its outer walls go down past this, so there's stone, not a ditch, beside the coping)
        locked = 0
        for lk in json.load(open(canal_file))["locks"]:
            (ax, ay), (bx, by) = lk["lo"], lk["hi"]
            span = math.hypot(bx - ax, by - ay) or 1
            ux, uy = (bx - ax) / span, (by - ay) / span
            seg = shapely.LineString([(ax - ux * LOCK_TAIL, ay - uy * LOCK_TAIL), (bx + ux * LOCK_TAIL, by + uy * LOCK_TAIL)])
            win, near = cover_xy(seg.buffer(LOCK_HALF + LOCK_COPE + 0.8, cap_style="flat"), edge=True)
            if not near.any(): continue
            blk = grid[win]; cur = blk[near]
            new = np.minimum(cur, lk["zl"] - LOCK_FLOOR)
            locked += int((new < cur - 0.05).sum())
            blk[near] = new; grid[win] = blk
        if locked: print(f"canal: the ground dug out of the locks at {locked} vertices")
        # and under every bridge over the canal, down below the water, beside a lock as anywhere
        dug = 0
        for k, x, lv, half in canal_x:
            win, near = cover_xy(x.buffer(max(1.0, half - 0.3)), edge=True)
            if not near.any(): continue
            blk = grid[win]; cur = blk[near]
            new = np.minimum(cur, lv - 0.5)
            dug += int((new < cur - 0.05).sum())
            blk[near] = new; grid[win] = blk
        if dug: print(f"canal: the ground dug down under its bridges at {dug} vertices")
# a span's marks run on to where its deck meets the ground as it finally is, now the water's
# beds and banks and the canal's are laid (the ground under a bridge's end may have gone down)
regrown = 0
for r in roads:
    p = r["p"]
    if not any(len(q) > 3 for q in p): continue
    for flag in (1, 2):
        on = [len(q) > 3 and q[3] == flag for q in p]
        first = [i for i in range(len(p)) if on[i]]
        for i in range(len(p)):
            # (a path riding a deck runs on only from the points marked before, not ones this marks)
            if not on[i] or (flag == 2 and i not in first): continue
            for j, step in ((i - 1, -1), (i + 1, 1)):
                n_ = 0
                while 0 <= j < len(p) and len(p[j]) == 3 and p[j][2] - gelev(p[j][0], p[j][1]) > 0.3 and n_ < 5 \
                        and (flag == 1 or math.dist(p[j][:2], p[i][:2]) <= RIDE_ON):      # (a path riding a deck: only a few metres on)
                    p[j].append(flag); on[j] = True; regrown += 1; j += step; n_ += 1
if regrown: print(f"bridges: spans run {regrown} points further to the ground as it's finally laid")
# a deck can't stop in the air: where a span's last point is still well above the ground where the
# road goes on, the deck carries on down to it as a ramp (an approach on its own embankment, which
# the game builds as the bridge's sides), no steeper than a path or a road may be, rather than the
# road dropping off the end in one stretch
ramped = 0
# (only on this build's own ground: a road runs on past it, where the ground isn't known)
on_grid = lambda q: X0 + dx <= q[0] <= X0 + (nx - 2) * dx and Y0 + dy <= q[1] <= Y0 + (ny - 2) * dy
# (where a road ends with its ramp still in the air, the ramp carries on down the roads that go on
# from there: a flyover's slip road the data splits off at the end of the bridge)
ends_at = defaultdict(list)
for r in roads:
    for e in (0, len(r["p"]) - 1): ends_at[(round(r["p"][e][0]), round(r["p"][e][1]))].append((r, e))


ramp_made = set()      # (the points a ramp carried on to another road takes: none of them is a bridge's end to ramp from again)


def ramp_down(r, p, j, step, flag, grade, n_, seen, crossed=False):
    global ramped
    while 0 <= j < len(p) and len(p[j]) == 3 and n_ < 20 and on_grid(p[j]):
        g = gelev(p[j][0], p[j][1])
        if p[j - step][2] - g <= 0.6: return
        p[j][2] = max(g, p[j - step][2] - math.dist(p[j][:2], p[j - step][:2]) * grade)
        p[j].append(flag); ramped += 1; j += step; n_ += 1
        if crossed: ramp_made.add(id(p[j - step]))
    if 0 <= j < len(p) or n_ >= 20: return
    last = p[j - step]
    if not on_grid(last) or last[2] - gelev(last[0], last[1]) <= 0.6: return
    seen.add(id(r))
    for o, e in ends_at[(round(last[0]), round(last[1]))]:
        q = o["p"]
        if id(o) in seen or len(q) < 2 or len(q[e]) > 3 or math.dist(q[e][:2], last[:2]) > 0.5: continue
        nxt = 1 if e == 0 else -1
        if len(q[e + nxt]) > 3: continue
        q[e][2] = last[2]; q[e].append(flag); ramp_made.add(id(q[e])); ramped += 1
        ramp_down(o, q, e + nxt, nxt, flag, grade, n_ + 1, seen, True)


for r in roads:
    p = r["p"]
    if not any(len(q) > 3 for q in p): continue
    grade = 0.5 if r["c"] == "steps" else 0.125 if r["c"] in PATHS else STEEPEST.get(r["c"], 0.25) * 0.9
    for step in (1, -1):
        idx = range(len(p)) if step > 0 else range(len(p) - 1, -1, -1)
        for i in idx:
            j = i + step
            if len(p[i]) < 4 or id(p[i]) in ramp_made or (0 <= j < len(p) and len(p[j]) > 3): continue
            ramp_down(r, p, j, step, p[i][3], grade, 0, set())
if ramped: print(f"bridges: {ramped} points of ramp down off decks that ended in the air")
# and off its bridges a path lies on the ground as it's finally laid (as the game draws it)
for r in roads:
    if r["c"] not in PATHS: continue
    for q in r["p"]:
        if len(q) == 3 and (q[0], q[1]) not in on_tow and on_grid(q): q[2] = r1(gelev(q[0], q[1]))
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
        if STORE is not None and STORE.record and TILE is not None:
            # a square measured without its survey stores no walls and no building heights, and
            # every later build of it then goes without them
            gx, gy = np.meshgrid(np.linspace(TX0, TX1, 21), np.linspace(TY0, TY1, 21))
            missing = lidar.uncovered(gx.ravel(), gy.ravel())
            if missing > 0:
                raise SystemExit(f"--measure: the lidar has no tiles under {missing:.0%} of square {ti},{tj}; "
                                 f"fetch them first (python3 -I tools/fetch.py {args[0]} --only lidar)")
    except Exception as e:
        # a map outside England has no lidar: its measurements keep just the canopy
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
# a building mapped twice (on its own, and again as a wing cut from a bigger block round it)
# would stand two roofs in each other, fighting to be seen: one is left out, keeping the one with
# a name. A part standing in a bigger building (a tower, a higher range) covers far less of it and stays
_seen = shapely.STRtree([c[0] for c in cand]) if cand else None
_twice = set()
for i in sorted(range(len(cand)), key=lambda k: (not name(cand[k][1]), k)):
    poly = cand[i][0]
    for j in _seen.query(poly):
        j = int(j)
        if j != i and j not in _twice and (not name(cand[j][1]), j) < (not name(cand[i][1]), i) \
                and poly.intersection(cand[j][0]).area >= 0.8 * max(poly.area, cand[j][0].area):
            _twice.add(i)
            break
if _twice: print(f"buildings: {len(_twice)} mapped twice, left out")
cand = [c for i, c in enumerate(cand) if i not in _twice]

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
    if lidar is None and (STORE is None or STORE.record): raise FileNotFoundError("no lidar tiles")
    if STORE is None:
        measured = each(lambda poly: lidar.measure(poly, canopy.at if canopy is not None else None), [c[0] for c in cand])
    else:
        # what the survey shows, kept or read back, then judged here
        import lidar as LD
        if STORE.record: surveyed = STORE.put_buildings([c[0] for c in cand], each(lambda poly: lidar.survey(poly, canopy.at if canopy is not None else None), [c[0] for c in cand]))
        else: surveyed = STORE.get_buildings([c[0] for c in cand])
        import towers
        measured = towers.judge([c[0] for c in cand], [c[1] for c in cand], surveyed, proj, towers.load(A.id))
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
    if measured: measured = [measured[i] for i in near_m]
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
pack = landmarks.load(A.landmarks, A.id)
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
def unspiked(ring):
    """The ring without points where it doubles back on itself: a sliver left between two parts of
    a building rounds to a line out and back, which the game draws as a wall standing out of the
    house at its full height."""
    ring = [q for k, q in enumerate(ring) if q != ring[k - 1]]
    changed = True
    while changed and len(ring) >= 3:
        changed = False
        for k in range(len(ring)):
            a, b, c = ring[k - 1], ring[k], ring[(k + 1) % len(ring)]
            e1, e2 = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
            l1, l2 = math.hypot(*e1), math.hypot(*e2)
            if l1 < 1e-9 or l2 < 1e-9 or (e1[0] * e2[0] + e1[1] * e2[1]) / (l1 * l2) < -0.995:
                del ring[k]
                changed = True
                break
    return ring if len(ring) >= 3 else []


# The survey measures from the lidar's ground, the map stands on its terrain model, and over a
# district the two can sit metres apart: the survey's eaves are carried into the map's frame by the
# offset between the two grounds at the buildings round each one, so a whole street isn't shifted
walls_ground = [(min(gelev(x, y) for x, y in poly.exterior.coords), max(gelev(x, y) for x, y in poly.exterior.coords))
                for poly, _ in cand]
surveyed = [i for i, b in enumerate(info) if b.get("base") is not None]
centres = shapely.points([cand[i][0].centroid.coords[0] for i in surveyed]) if surveyed else None
centre_tree = shapely.STRtree(centres) if surveyed else None
lift = np.array([info[i]["base"] - walls_ground[i][0] for i in surveyed])


def ground_offset(poly):
    """The lidar's ground less the map's, at the surveyed buildings within OFFSET_REACH."""
    if centre_tree is None: return 0.0
    near = centre_tree.query(poly.centroid.buffer(OFFSET_REACH))
    return float(np.median(lift[near])) if len(near) >= OFFSET_MIN else 0.0


# roofs fitted to the lidar (tools/roofs/shapes.py), kept as faces by each building's outline as built
from roofs import mesh as roof_faces
FACES = roof_faces.load(A.id, f"{TILE[0]}_{TILE[1]}") if TILE is not None else {}
blds, footprints, bld_props, bld_fresh = [], [], [], []
at_measured, uphill, faced = 0, [0, 0], 0       # (unmeasured, measured on ground not the map's)
for (poly, p), b, f in zip(cand, info, fresh):
    ring = unspiked([[r1(a), r1(c)] for a, c in list(poly.exterior.coords)[:-1]])
    if not ring: continue       # a sliver with no area once rounded: nothing to build
    holes = [h for h in (unspiked([[r1(a), r1(c)] for a, c in list(r.coords)[:-1]]) for r in poly.interiors) if h]
    ground = min(gelev(x, y) for x, y in ring)
    top = max(gelev(x, y) for x, y in ring)
    shift = ground_offset(poly) if b.get("base") is not None else 0.0
    measured_at = b["base"] - shift + b["eaves"] if b.get("base") is not None else None
    if (measured_at is not None and ground - GROUND_AGREE <= b["base"] - shift <= top + GROUND_AGREE
            and measured_at >= top + MEASURED_WALL):
        # the survey's eaves at the height it measured them, not counted up from the grid's lowest
        # corner, which on a slope is metres off the survey's own ground at the walls
        eaves = measured_at
        at_measured += 1
    else:
        # nothing measured, or the survey's ground at the walls is not the map's even allowing for
        # the offset round it (a sunken yard, a cutting): the measured height stands on the map's
        # ground, and no wall is buried by the hill behind it, as a house built into a hill has a
        # lower floor on its downhill side
        eaves = max(ground + b["eaves"], top + UPHILL_WALL)
        uphill[measured_at is not None] += 1
    out = dict(r=[ring, *holes], h=round(eaves - ground, 1), g=r1(ground), c=b["kind"], n=name(p),
               m={"stone": "s", "brick": "k", "buff": "y", "render": "r", "paint": "c"}[b["wall"]], rc=b["cover"][0], w=1 if b["windows"] else 0, dz=r1(top - ground))
    if b["roof"]:
        out["rr"] = [[r1(x), r1(y)] for x, y in b["roof"]["rect"]]
        out["rp"] = round(b["roof"]["rise"], 1)
        out["hp"] = [round(v, 1) for v in b["roof"]["hips"]]
    k = roof_faces.ring_key(out) if FACES else None
    if k in FACES:
        # into the map's frame as the eaves were: the survey's heights over its ground at the walls
        # (where the survey gave no eaves here, its ground as the roofs were fitted)
        up = eaves - b["base"] - b["eaves"] if b.get("base") is not None else ground - FACES[k]["base"]
        out["r"], out["rm"] = roof_faces.for_game(FACES[k], up)
        faced += 1
    if b["chim"]:
        out["ch"] = [[r1(x), r1(y)] for x, y in b["chim"]]
    if b["parapet"]:
        out["pp"] = b["parapet"]
    if b["storeys"]:
        out["st"] = b["storeys"]
    blds.append(out)
    # (what is kept clear of the building is the outline as built, not the one before cleaning)
    built = shapely.Polygon(ring, holes).buffer(0)
    footprints.append(max(getattr(built, "geoms", [built]), key=lambda g: g.area) if not built.is_empty else poly)
    bld_props.append(p)
    bld_fresh.append(f)
if FACES: print(f"roofs: {faced} of {len(blds)} in faces from the lidar")
print(f"buildings: {at_measured} of {len(blds)} at their measured eaves height; by the hill behind them, "
      f"{uphill[0]} unmeasured and {uphill[1]} where the survey's ground isn't the map's")

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


def wall_to_wall(x, y, ux, uy, kerbs=None):
    """Half the paved width at (x, y), for a street running along (ux, uy); None inside a building
    or on another street. kerbs: the other streets' outlines (carriageway and pavements), which
    the paving stops at, so where a pedestrian street opens on to a road it isn't laid across it."""
    pt = Point(x, y)
    if any(footprints[int(k)].contains(pt) for k in fp_tree.query(pt)): return None
    if kerbs is not None and any(kerbs[0][int(k)].contains(pt) for k in kerbs[1].query(pt)): return None
    seen, stop = [], PED_REACH
    for s in (1, -1):
        ray = shapely.LineString([(x, y), (x - uy * s * PED_REACH, y + ux * s * PED_REACH)])
        hits = [pt.distance(ray.intersection(footprints[int(k)])) for k in fp_tree.query(ray, predicate="intersects")]
        if hits: seen.append(min(hits))
        if kerbs is not None:
            stop = min([stop] + [pt.distance(ray.intersection(kerbs[0][int(k)])) for k in kerbs[1].query(ray, predicate="intersects")])
    if not seen: return None if stop >= PED_REACH else min(stop, PED_DEFAULT / 2)
    return min(PED_REACH, stop, max(max(seen), 1.5 if len(seen) == 2 else PED_DEFAULT / 2))


def rw(r):
    """A road's width in metres: its own, if it has one (a pedestrianised street, or one the lidar
    shows is narrower), else its class's."""
    return r.get("w") or RW.get(r["c"], 4)


def pave(r):
    """How wide the wider pavement of a kerbed street is: its own, where narrowed (see tools/roadwidth.py), else 1.7 m."""
    return max(r.get("pv", [1.7]))


def paved_wall_to_wall(r, kerbs=None):
    """A pedestrian street cut into pieces of one width each."""
    pts = r["p"]
    halves = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        halves.append(wall_to_wall(pts[i][0], pts[i][1], (b[0] - a[0]) / l, (b[1] - a[1]) / l, kerbs))
    # the middle of the widths within three points either way: a side alley or a doorway's recess
    # doesn't widen the street
    widths = []
    for i in range(len(pts)):
        near = [h for h in halves[max(0, i - 3):i + 4] if h is not None]
        widths.append(round(2 * float(np.median(near)) * 2) / 2 if near else PED_DEFAULT)
    if kerbs is not None:
        # (a point's own reading caps the middle one: the paving at the mouth stops at the road's kerb)
        widths = [w if h is None else min(w, max(1.5, round(2 * h * 2) / 2)) for w, h in zip(widths, halves)]
    if any(len(q) > 3 for q in pts):        # a street on a bridge stays in one piece
        return [dict(r, w=float(np.median(widths)))]
    out, start = [], 0
    for i in range(1, len(pts) + 1):
        if i == len(pts) or widths[i] != widths[start]:
            piece = pts[max(0, start - 1):i]       # each piece starts where the one before ended
            if len(piece) > 1: out.append(dict(r, p=piece, w=widths[start]))
            start = i
    return out


# measured once against the buildings alone here (the lidar's walls are looked for as far into the
# street as that), then again once the other streets are fitted, against their kerbs too
ped_roads, ped_src = [], []
for r in roads:
    if r["c"] != "pedestrian" or len(r["p"]) < 2:
        ped_roads.append(r); continue
    ped_roads += [dict(q, _ped=len(ped_src)) for q in paved_wall_to_wall(r)]
    ped_src.append(r)
roads = ped_roads
print(f"pedestrian streets: {len(ped_src)} measured wall to wall")

# ---- walls, fences and hedges the lidar sees (tools/walls.py) -------------------------------
# found first, looking into the streets as far as each could narrow, so the streets can then be
# fitted between them (below); they're added to the map with the other walls further on
found_walls = []
if STORE is not None and not STORE.record and not os.environ.get("NO_LIDAR_WALLS"):
    found_walls = STORE.get_walls() or []
    if STORE.get_walls() is None: print("walls: none in the measurements (measure afresh to find them in the lidar)")
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
                              houses_from=len(found_walls))
    print(f"streets: {narrowed} narrowed to OpenStreetMap's widths and pavements, and to the walls either side in the lidar"
          + ("" if osm_roads else " (no osm-roads.geojson)"))

if ped_src:
    kerb_polys = []
    for r in roads:
        pts = r["p"]
        if r["c"] in PATHS or len(pts) < 2 or any(len(q) > 3 for q in pts): continue
        line = shapely.LineString([q[:2] for q in pts])
        if line.length <= 0: continue
        pl, pr = r.get("pv", [1.7, 1.7]) if r["c"] in KERBED_RD else (0.0, 0.0)
        kerb_polys.append(unary_union([line.buffer(rw(r) / 2 + pl, single_sided=True, cap_style="flat"),
                                       line.buffer(-(rw(r) / 2 + pr), single_sided=True, cap_style="flat")]))
    kerbs = (kerb_polys, shapely.STRtree(kerb_polys))
    out, done = [], set()
    for r in roads:
        k = r.get("_ped")
        if k is None: out.append(r); continue
        if k in done: continue
        done.add(k)
        out += paved_wall_to_wall(ped_src[k], kerbs)
    roads = out

# ---- pavements up to the door ----------------------------------------------------------------
# Where the houses open straight on to the street (the Bo-Kaap), there's no front garden: each
# side's pavement reaches the house fronts along it (up to DOOR_REACH past an ordinary pavement),
# so nothing is left between them for a garden.
DOOR_ZONES, DOOR_REACH, PAVE_W = {"bokaap"}, 5.0, 1.7


def _front_at(x, y, nx_, ny_, reach):
    """How far from (x, y), looking along (nx_, ny_), the first building is, or None."""
    pt = Point(x, y)
    ray = shapely.LineString([(x, y), (x + nx_ * reach, y + ny_ * reach)])
    hits = [pt.distance(ray.intersection(footprints[int(k)])) for k in fp_tree.query(ray, predicate="intersects")]
    return min(hits) if hits else None


def _to_the_door(roads):
    from buildings import zone_at
    out, n = [], 0
    for r in roads:
        pts = r["p"]
        if r["c"] not in KERBED_RD or len(pts) < 2 or any(len(q) > 3 for q in pts) \
                or zone_at(A.zones, *pts[len(pts) // 2][:2], A.default_zone) not in DOOR_ZONES:
            out.append(r); continue
        half, was = rw(r) / 2, list(r.get("pv", [PAVE_W, PAVE_W]))
        pv = list(was)
        for k, s in enumerate((1, -1)):           # left, then right, looking along the points
            seen = []
            for i in range(len(pts)):
                a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
                l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
                ux, uy = (b[0] - a[0]) / l, (b[1] - a[1]) / l
                d = _front_at(pts[i][0], pts[i][1], -uy * s, ux * s, half + was[k] + DOOR_REACH)
                if d is not None: seen.append(d - half)
            if len(seen) * 2 >= len(pts):       # houses along most of that side
                pv[k] = max(pv[k], round(float(np.median(seen)) * 2) / 2)
        if pv != was:
            r = dict(r, w=rw(r), pv=pv); n += 1
        out.append(r)
    return out, n


if DOOR_ZONES & ({z[0] for z in A.zones} | {A.default_zone}):
    roads, _doors = _to_the_door(roads)
    print(f"streets: {_doors} with their pavements run up to the house fronts")

# ---- pavements up to the shop fronts -----------------------------------------------------------
# A shop opens straight on to the pavement, anywhere: in front of one the pavement runs on up to
# its front (up to DOOR_REACH past the street's own), so no front garden is left there to guess.
# It's measured a stretch between two points at a time, as a row of shops seldom stands in one
# line, and never across another street's carriageway to a shop on the far side of it.
from shops import businesses
found, shop_log = businesses(src_dir, A.bbox, proj, [c[0] for c in cand], info, L("place"), inside,
                             getattr(pack, "SIGN_NAMES", None), getattr(pack, "SIGN_SKIP", ()))
_shop_tree = shapely.STRtree([cand[b["b"]][0] for b in found]) if found else None
shopfront = [_shop_tree is not None and len(_shop_tree.query(f.representative_point(), predicate="intersects")) > 0
             for f in footprints]


def _to_the_shops(roads):
    cars = [(r.get("n") or id(r), shapely.LineString([q[:2] for q in r["p"]]).buffer(rw(r) / 2, cap_style=2))
            for r in roads if r["c"] not in PATHS and len(r["p"]) > 1]
    car_tree = shapely.STRtree([g for _, g in cars])
    out, n = [], 0
    for r in roads:
        pts = r["p"]
        if r["c"] not in KERBED_RD or any(len(q) > 3 for q in pts):
            out.append(r); continue
        half, was = rw(r) / 2, list(r.get("pv", [PAVE_W, PAVE_W]))
        me = r.get("n") or id(r)
        seg = []
        for a, b in zip(pts, pts[1:]):
            line = shapely.LineString([a[:2], b[:2]])
            if line.length < 0.5: seg.append(list(was)); continue
            here = []
            for k, s in enumerate((1, -1)):           # left, then right, looking along the points
                strip = lambda v: line.buffer(s * (half + v), single_sided=True, cap_style=2).difference(line.buffer(half, cap_style=2))
                # the pavement grows out from its kerb until it meets a building: if that's a shop,
                # it reaches its front
                v, met = was[k], None
                while v < was[k] + DOOR_REACH and met is None:
                    g = strip(v + 0.5)
                    if any(cars[int(j)][0] != me and cars[int(j)][1].intersection(g).area > 0.1 for j in car_tree.query(g)):
                        met = []; break
                    hit = [int(j) for j in fp_tree.query(g) if footprints[int(j)].intersection(g).area > 0.1]
                    if hit: met = hit
                    else: v += 0.5
                # (None: an opening between the buildings, such as an alley's mouth)
                here.append(None if met is None else v if met and all(shopfront[j] for j in met) else was[k])
            seg.append(here)
        # an opening one stretch long between two shop fronts is paved across, at the narrower of
        # the two pavements either side of it
        for k in (0, 1):
            for i, h in enumerate(seg):
                if h[k] is not None: continue
                a = seg[i - 1][k] if i > 0 else None
                b = seg[i + 1][k] if i + 1 < len(seg) else None
                h[k] = min(a, b) if a is not None and b is not None and min(a, b) > was[k] else was[k]
        if all(v == was for v in seg):
            out.append(r); continue
        n += 1
        start = 0
        for i in range(1, len(seg) + 1):
            if i == len(seg) or seg[i] != seg[start]:
                out.append(dict(r, p=pts[start:i + 1], w=rw(r), pv=seg[start]))
                start = i
    return out, n


roads, _shops = _to_the_shops(roads)
print(f"streets: {_shops} with their pavements run up to the shop fronts along them")

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
from gardens import plots, _ahead
KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}


def _corridor(r):
    """A street's ground: its carriageway and pavements. A pavement run on up to the house or shop
    fronts on one side, wider than an ordinary one, is only on that side, so it doesn't take the
    gardens over the road."""
    line = shapely.LineString([(a, b) for a, b, *_ in r["p"]])
    if r["c"] not in KERBED or pave(r) <= PAVE_W or line.length <= 0:
        return line.buffer(rw(r) / 2 + (pave(r) if r["c"] in KERBED else 0.3), cap_style=2)
    pl, pr = r["pv"]
    return unary_union([line.buffer(rw(r) / 2 + PAVE_W, cap_style=2),
                        line.buffer(rw(r) / 2 + pl, single_sided=True, cap_style=2),
                        line.buffer(-(rw(r) / 2 + pr), single_sided=True, cap_style=2)])


corridor = [_corridor(r) for r in roads if len(r["p"]) > 1]
OPEN = {"park", "recreation_ground", "pitch", "playground", "grass", "cemetery", "village_green", "common", "meadow"}
open_land = [poly for g, p in L("land_use") if p.get("class") in OPEN for poly in polys(g)]
# a paved square or pedestrian street (Kingston Parade, Abbey Churchyard) is nobody's garden, holes
# and all (a tree bed in one), and gets no garden fence along its edge either
squares = [shapely.Polygon(poly.exterior) for g, p in L("land_use") if p.get("class") == "pedestrian" for poly in polys(g)]
front, side, gates, drives = plots([c[0] for c in cand], info, corridor, BM.bounds, rnd, open_land + squares, keys,
                                   fronts=[r["c"] not in PATHS for r in roads if len(r["p"]) > 1],
                                   names=[r.get("n") for r in roads if len(r["p"]) > 1])
if squares:
    off_square = unary_union(squares).buffer(0.6)
    n_sq = len(front) + len(side)
    clip = lambda run: [(st, q, o) for st, ln, o in run for q in getattr(ln.difference(off_square), "geoms", [ln.difference(off_square)])
                        if q.geom_type == "LineString" and q.length >= 1.2]
    front, side = clip(front), clip(side)
    print(f"gardens: {len(squares)} paved squares and pedestrian streets kept clear of garden boundaries ({n_sq} runs before, {len(front) + len(side)} after)")
side_style = {o: st for st, _, o in side}     # each garden's fence or hedge, by its house
garden_sides = [ln for _, ln, _ in side]     # (the side and back runs, for the lidar walls along them, below)
garden_br = []
for style, line, _ in front + side:
    n = max(1, int(math.ceil(line.length / 2.5)))
    pts = _along(line, n)
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
from streets import phone_boxes, street_furniture
phones = phone_boxes(L("osm")) if os.path.exists(f"{src_dir}/osm.geojson") else []
fx, marks = street_furniture(roads, L("infrastructure") + phones, gate_list, RW, gelev, proj, inside, rnd, keyed=True)

# ---- shop signs ----------------------------------------------------------------
from shops import shop_signs
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
        pts = _along(line.simplify(0.2), n)
        lidar_br.append(dict(c=w["c"], h=w["h"], p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))
    print(f"walls: {len(lidar_br)} seen in the lidar ({sum(1 for w in lidar_br if w['c'] == 'hedge')} hedges), "
          f"{sum(shapely.LineString([q[:2] for q in w['p']]).length for w in lidar_br) / 1000:.1f} km")
# a wall mapped twice (both its faces, or two surveys of it), or seen twice in the lidar, is kept once:
# the lidar can trace both sides of a thick hedge, or a fence inside one, a metre or so apart
from gardens import _network
def _once(walls, taken=(), near=0.5):
    lines = sorted(((k, shapely.LineString([q[:2] for q in b["p"]])) for k, b in enumerate(walls) if len(b["p"]) > 1), key=lambda kl: -kl[1].length)
    out = []
    for k, line in _network(lines, taken=taken, near=near):
        n = max(1, int(math.ceil(line.length / 2.5)))
        out.append(dict(walls[k], p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in _along(line, n)]))
    return out
br = _once(br)
lidar_br = _once(lidar_br, taken=[shapely.LineString([q[:2] for q in b["p"]]) for b in br], near=1.2)
if os.environ.get("FENCE_DUMP"):     # (for trying out other ways of laying garden boundaries)
    import pickle
    with open(os.environ["FENCE_DUMP"], "wb") as fh_:
        pickle.dump(dict(cand=[c[0] for c in cand], info=info, roads=roads, corridor=corridor, open_land=open_land + squares,
                         fronts=[r["c"] not in PATHS for r in roads if len(r["p"]) > 1], br=br, lidar_br=lidar_br,
                         front=front, side=side, gates=gates, grid=grid, X0=X0, Y0=Y0, dx=dx, dy=dy, nx=nx, ny=ny), fh_)
# Between gardens it's the other way round: a wall the lidar sees running along a guessed side or
# back fence (and not along a street) would only be built as that garden's fence or hedge (below),
# so the guessed one, which joins up with its neighbours, stands there and the lidar's goes.
_side_lines = garden_sides
if _side_lines and lidar_br:
    _stree, _street = shapely.STRtree(_side_lines), shapely.STRtree(corridor) if corridor else None
    _kept, _gone = [], 0
    for w in lidar_br:
        ln = shapely.LineString([q[:2] for q in w["p"]]) if len(w["p"]) > 1 else None
        if ln is None or w["c"] == "retaining_wall": _kept.append(w); continue
        st_ = [corridor[int(k)] for k in _street.query(ln.buffer(2.5))] if _street is not None else []
        if st_ and ln.intersection(unary_union(st_).buffer(2.5)).length > 0.6 * ln.length: _kept.append(w); continue
        if any(_side_lines[int(k)].distance(ln) < 1.5 and _side_lines[int(k)].intersection(ln.buffer(1.5)).length > 0.5 * ln.length
               for k in _stree.query(ln.buffer(1.5))): _gone += 1; continue
        _kept.append(w)
    lidar_br = _kept
    print(f"gardens: {_gone} walls seen in the lidar along a guessed garden fence left to the fence")
# A guessed garden boundary, front or side, gives way to a real wall (mapped or seen in the lidar)
# running along it; what's left of it is run on to meet the real wall where it stops just short,
# so the fences join it at the corners. (A gate left without its wall moves onto the real one, below.)
real = [shapely.LineString([q[:2] for q in b["p"]]) for b in br + lidar_br if len(b["p"]) > 1]
if real:
    rtree = shapely.STRtree(real)
    kept_g, gave = [], 0.0
    for b in garden_br:
        line = shapely.LineString([(x, y) for x, y, _ in b["p"]])
        close = [real[int(k)] for k in rtree.query(line.buffer(2.0))]
        if not close: kept_g.append(b); continue
        rest = line.difference(unary_union([c.buffer(2.0, cap_style=2) for c in close]))
        gave += line.length - rest.length
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "LineString" or piece.length < 1.5: continue
            pts = list(piece.coords)
            for end in (0, -1):
                q = shapely.Point(pts[end])
                best = min(close, key=lambda c: c.distance(q))
                if best.distance(q) < 2.2:
                    on = best.interpolate(best.project(q)).coords[0]
                    if _ahead(pts, end, on):
                        if end == 0: pts.insert(0, on)
                        else: pts.append(on)
            piece = shapely.LineString(pts)
            n = max(1, int(math.ceil(piece.length / 2.5)))
            qs = _along(piece, n)
            kept_g.append(dict(b, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in qs]))
    garden_br = kept_g
    print(f"gardens: {gave / 1000:.1f} km of guessed boundary gave way to real walls")

# ---- no near misses: a wall, fence or hedge whose end stops just short (within 2.5 m) of another
# one or of a house is run straight on to meet it, as a boundary would. It isn't where that would
# take it across a street or a path, through a house, or into a gateway, and a boundary that ends
# on its own with nothing that near is left as it is
def _close_gaps(runs, reach=2.5):
    lines = [shapely.LineString([q[:2] for q in b["p"]]) for b in runs]
    walls_ = [shapely.Polygon(b["r"][0]) for b in blds if len(b["r"][0]) >= 3]
    targets = lines + [w.exterior for w in walls_]
    ttree = shapely.STRtree(targets)
    hard = shapely.STRtree([c.buffer(0.2) for c in corridor] + [w.buffer(-0.2) for w in walls_]
                           + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.8) for q in gate_list])
    joined = 0
    made = defaultdict(list)       # the bridges laid so far, by the 3 m cell of their ends: two runs end to
    # end with a gap between them would otherwise each be run on to the other's end, doubling the gap
    def _bridged(pt):
        cx, cy = int(pt.x // 3), int(pt.y // 3)
        return any(bb.distance(pt) < 0.15 for i_ in (cx - 1, cx, cx + 1) for j_ in (cy - 1, cy, cy + 1) for bb in made.get((i_, j_), ()))
    def _made(bb):
        for q in (bb.coords[0], bb.coords[-1]): made[(int(q[0] // 3), int(q[1] // 3))].append(bb)
    for k, (b, line) in enumerate(zip(runs, lines)):
        if line.length < 1.0: continue
        pts = [list(q) for q in b["p"]]
        for end in (0, -1):
            here = shapely.Point(pts[end][:2])
            prev = pts[1] if end == 0 else pts[-2]
            ux, uy = here.x - prev[0], here.y - prev[1]
            L = math.hypot(ux, uy)
            if L < 1e-6: continue
            ux, uy = ux / L, uy / L
            if any(targets[int(j)].distance(here) < 0.15 for j in ttree.query(here.buffer(0.15)) if int(j) != k): continue   # (already meets one)
            if _bridged(here): continue
            ray = shapely.LineString([(here.x, here.y), (here.x + ux * reach, here.y + uy * reach)])
            best = None
            for j in ttree.query(ray):
                if int(j) == k: continue
                x = targets[int(j)].intersection(ray)
                for h in getattr(x, "geoms", [x]):
                    if h.is_empty: continue
                    d = ray.project(h if h.geom_type == "Point" else shapely.Point(h.coords[0]))
                    if d > 0.05 and (best is None or d < best[0]): best = (d, ray.interpolate(d))
            if best is None: continue
            bridge = shapely.LineString([(here.x, here.y), (best[1].x, best[1].y)])
            if len(hard.query(bridge, predicate="intersects")): continue
            # (nor where it would run along beside another boundary, doubling it)
            if any(lines[int(j)].intersection(bridge.buffer(1.2)).length > 0.6 * bridge.length + 0.3
                   for j in ttree.query(bridge.buffer(1.2)) if int(j) < len(lines) and int(j) != k): continue
            q = [r1(best[1].x), r1(best[1].y), r1(gelev(best[1].x, best[1].y))]
            if end == 0: pts.insert(0, q)
            else: pts.append(q)
            _made(bridge)
            joined += 1
        b["p"] = pts
    return joined
n_closed = _close_gaps(br + lidar_br + garden_br)
print(f"walls: {n_closed} ends that stopped just short run on to meet the wall, fence, hedge or house ahead")

# ---- the guessed garden boundaries tidied up, in this order:
# - a short sideways step (3 m or less) in a fence or hedge between two stretches going the same way
#   is taken out, so it runs straight on, unless another boundary joins it at the step or the straight line would go
#   through a house or onto a street;
# - nothing guessed stands on a footpath or out in a street (a front wall along a street's edge stays);
# - a loose bit of fence or hedge goes: a run under 5 m that doesn't meet a house, a gate or another
#   boundary at both ends, or under 10 m that meets nothing at either (again, as taking one out can
#   leave another loose); a front wall is kept, as its gate stands in it;
# - a fence or hedge end left loose within 2.5 m of another boundary or a house is carried straight to
#   the nearest point of it, unless that would cross a street or a path, go through a house or into a
#   gateway, run along beside another boundary, or turn back on itself.
def _tidy_gardens(runs, others):
    walls_ = [shapely.Polygon(b["r"][0]) for b in blds if len(b["r"][0]) >= 3]
    htree = shapely.STRtree(walls_) if walls_ else None
    hard = shapely.STRtree([c.buffer(0.2) for c in corridor] + [w.buffer(-0.2) for w in walls_]
                           + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.8) for q in gate_list])
    gate_pts = [shapely.Point(q[0], q[1]) for q in gate_list] + [shapely.Point(q[2], q[3]) for q in gate_list]
    gtree = shapely.STRtree(gate_pts) if gate_pts else None
    fronts_ = [r["c"] not in PATHS for r in roads if len(r["p"]) > 1]
    off = unary_union([c.buffer(-0.5) if fronts_[k] else c for k, c in enumerate(corridor)])
    line_of = lambda b: shapely.LineString([q[:2] for q in b["p"]])
    ang = lambda a, b: math.atan2(b[1] - a[1], b[0] - a[0])
    lines = [line_of(b) for b in runs]
    fixed = [line_of(b) for b in others if len(b["p"]) > 1]
    # short steps
    allx = lines + fixed
    lt = shapely.STRtree(allx)
    steps = 0
    def dense(pts):
        ln = shapely.LineString(pts); n = max(1, int(math.ceil(ln.length / 2.5)))
        qs = _along(ln, n)
        return [[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in qs]
    for k, b in enumerate(runs):
        if b["c"] not in ("fence", "hedge"): continue      # (a front wall follows its street as it is)
        pts = [list(q) for q in lines[k].simplify(0.1).coords]     # (its corners, not the points every 2.5 m)
        before = len(pts)
        joined = lambda q: any(int(j) != k and allx[int(j)].distance(shapely.Point(q[:2])) < 0.3 for j in lt.query(shapely.Point(q[:2]).buffer(0.3)))
        again = True
        while again:
            again = False
            for i in range(1, len(pts) - 2):
                a, c0, c1, d = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
                if math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 3.0: continue
                if abs(math.remainder(ang(a, c0) - ang(c1, d), 2 * math.pi)) > math.radians(25): continue
                if joined(c0) or joined(c1): continue
                if len(hard.query(shapely.LineString([a[:2], d[:2]]), predicate="intersects")): continue
                pts = pts[:i] + pts[i + 2:]; again = True; steps += 1; break
        if len(pts) < before: b["p"] = dense(pts)
    # off paths
    kept = []
    for b in runs:
        ln = line_of(b)
        rest = ln.difference(off) if ln.intersects(off) else ln
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "LineString" or piece.length < 1.5: continue
            n = max(1, int(math.ceil(piece.length / 2.5)))
            qs = _along(piece, n)
            kept.append(dict(b, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in qs]))
    runs = kept
    # loose bits
    for _ in range(3):
        lines = [line_of(b) for b in runs]
        allx = lines + fixed
        lt = shapely.STRtree(allx)
        def held(k, e):
            if any(int(j) != k and allx[int(j)].distance(e) < 0.3 for j in lt.query(e.buffer(0.3))): return True
            if htree is not None and any(walls_[int(j)].distance(e) < 0.6 for j in htree.query(e.buffer(0.6))): return True
            # the index only narrows the gates down: the test is the same
            return gtree is not None and any(gate_pts[int(j)].distance(e) < 0.4
                                             for j in gtree.query(e, predicate="dwithin", distance=0.5))
        keep = []
        for k, (b, ln) in enumerate(zip(runs, lines)):
            ends = held(k, shapely.Point(ln.coords[0])) + held(k, shapely.Point(ln.coords[-1]))
            if b["c"] in ("fence", "hedge") and ((ln.length < 5 and ends < 2) or (ln.length < 10 and ends == 0)): continue
            keep.append(b)
        if len(keep) == len(runs): break
        runs = keep
    # loose ends
    lines = [line_of(b) for b in runs]
    targets = lines + fixed + [w.exterior for w in walls_]
    tt = shapely.STRtree(targets)
    snapped, made = 0, []
    for k, b in enumerate(runs):
        if b["c"] not in ("fence", "hedge"): continue      # (a front wall's ends are where its gate and corners put them)
        pts = [list(q) for q in b["p"]]
        for end in (0, -1):
            h = shapely.Point(pts[end][:2])
            near_ = [(targets[int(j)].distance(h), int(j)) for j in tt.query(h.buffer(2.5)) if int(j) != k]
            near_ = [dj for dj in near_ if dj[0] <= 2.5]
            if not near_ or min(near_)[0] < 0.15: continue
            if any(bb.distance(h) < 0.15 for bb in made): continue      # (another run was already carried on to this end)
            j = min(near_)[1]
            on = targets[j].interpolate(targets[j].project(h))
            a, c0 = (pts[1], pts[0]) if end == 0 else (pts[-2], pts[-1])
            ux, uy, vx, vy = c0[0] - a[0], c0[1] - a[1], on.x - c0[0], on.y - c0[1]
            if ux * vx + uy * vy < -0.05 * math.hypot(ux, uy) * math.hypot(vx, vy): continue
            bridge = shapely.LineString([(h.x, h.y), (on.x, on.y)])
            if len(hard.query(bridge, predicate="intersects")): continue
            # (nor where it would run along beside another boundary, doubling it)
            if any(targets[int(i_)].intersection(bridge.buffer(1.2)).length > 0.6 * bridge.length + 0.3
                   for i_ in tt.query(bridge.buffer(1.2)) if int(i_) != k and int(i_) != j): continue
            q = [r1(on.x), r1(on.y), r1(gelev(on.x, on.y))]
            if end == 0: pts.insert(0, q)
            else: pts.append(q)
            made.append(bridge)
            snapped += 1
        b["p"] = pts
    print(f"gardens: {steps} short steps straightened, {snapped} loose ends run on to meet a boundary or house, {len(runs)} runs left")
    return runs
garden_br = _tidy_gardens(garden_br, br + lidar_br)


# ---- gaps where streets and paths cross walls, fences and hedges -------------------
# Only where a street or path actually crosses one: a wall running alongside a street (a front
# garden wall at the back of the pavement) is left whole. A guessed garden boundary is opened, too,
# where a street or path ends on it (a lane's end at a garden front), as the way carries on through.
gap_parts = [c.buffer(0.4) for c in corridor]
_guessed = {id(b) for b in garden_br}
gap_lines = [shapely.LineString([(a, b) for a, b, *_ in r["p"]]) for r in roads if len(r["p"]) > 1]
gap_tree = shapely.STRtree(gap_parts)
barriers = []
for b in br + lidar_br + garden_br:
    line = shapely.LineString([(x, y) for x, y, _ in b["p"]])
    if line.length < 0.5: continue
    near = [gap_parts[int(k)] for k in gap_tree.query(line)
            if gap_lines[int(k)].intersects(line) or (id(b) in _guessed and gap_lines[int(k)].distance(line) < 0.5)]
    rest = line.difference(unary_union(near)) if near else line
    for piece in getattr(rest, "geoms", [rest]):
        if piece.geom_type != "LineString" or piece.length < 1.2: continue     # (a stub left between two gaps would stand alone)
        n = max(1, int(math.ceil(piece.length / 2.5)))
        pts = _along(piece, n)
        barriers.append(dict(c=b["c"], p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts], **({"h": b["h"]} if "h" in b else {})))

# ---- a garden is fenced one way all round: a wall the lidar sees between or behind gardens (not along
# a street, and with a house within 25 m) is built as that house's garden fence or hedge, the same as
# its guessed ones, rather than as a stone or brick wall in among them
if side_style:
    street_edge = shapely.STRtree(corridor) if corridor else None
    def _fronts(line):
        near_ = [corridor[int(k)] for k in street_edge.query(line.buffer(2.5))] if street_edge is not None else []
        return bool(near_) and line.intersection(unary_union(near_).buffer(2.5)).length > 0.6 * line.length
    fenced_ = [k for k in side_style]
    fence_tree = shapely.STRtree([cand[k][0] for k in fenced_])
    matched = 0
    for b in barriers:
        if "h" not in b or b["c"] in ("retaining_wall",) or len(b["p"]) < 2: continue    # (only the lidar's)
        line = shapely.LineString([q[:2] for q in b["p"]])
        if _fronts(line): continue
        j = fence_tree.query_nearest(line.centroid, max_distance=25.0, all_matches=False)
        if not len(j): continue
        b["c"] = side_style[fenced_[int(j[0])]]
        if b["c"] == "fence": b["h"] = min(b["h"], 1.9)     # (a close-board fence is no taller than that)
        matched += 1
    print(f"gardens: {matched} walls seen in the lidar between gardens built as their garden's fence or hedge")

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

# ---- wavy garden fences, straightened (once the runs are joined up, so each is whole) ----
def _straighten(barriers):
    walls_ = [shapely.Polygon(b["r"][0]) for b in blds if len(b["r"][0]) >= 3]
    htree = shapely.STRtree(walls_)
    hard = shapely.STRtree([c.buffer(0.2) for c in corridor] + [w.buffer(-0.2) for w in walls_]
                           + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.8) for q in gate_list]
                           + [shapely.Point(f[1], f[2]).buffer(0.6) for f in fx])     # (and the bins, benches and signs)
    def dense(pts):
        ln = shapely.LineString(pts); n = max(1, int(math.ceil(ln.length / 2.5)))
        return [[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in _along(ln, n)]
    # wavy runs: a stretch that strays no more than WAVE metres from the straight line between two of
    # its corners is drawn straight between them, so long as the straight line runs clear of streets,
    # houses, gateways, street furniture and every other wall and fence. A guessed fence that ends on
    # it part way along has its end moved onto the straight line, so it still meets it; one that runs
    # on through it, or a real wall, holds it where they meet. Neither may end up running alongside or
    # across another wall or fence more than it did before.
    WAVE, waves = 3.0, 0
    line_of = lambda b: shapely.LineString([q[:2] for q in b["p"]])
    runs = [b for b in barriers if b["c"] in ("fence", "hedge") and "h" not in b and len(b["p"]) > 1]
    fixed = [line_of(b) for b in barriers if len(b["p"]) > 1 and not (b["c"] in ("fence", "hedge") and "h" not in b)]
    lines = [line_of(b) for b in runs]
    allines = lines + fixed
    lt = shapely.STRtree(allines)
    def end_near(j, q, d):
        if j >= len(runs): return None
        for e in (0, -1):
            if math.hypot(runs[j]["p"][e][0] - q[0], runs[j]["p"][e][1] - q[1]) < d: return e
        return None
    def _clash(ln, r, moved):
        """How many metres of a run lie alongside or across other walls and fences (besides where
        it meets them, at its ends and where another ends on it)."""
        ends = [shapely.Point(ln.coords[0]), shapely.Point(ln.coords[-1])]
        total = 0.0
        for j in lt.query(ln.buffer(1.3)):
            j = int(j)
            if j == r: continue
            o = moved.get(j, allines[j])
            near = ln.intersection(o.buffer(1.3))
            if near.is_empty: continue
            meet = [p for p in ends + [shapely.Point(o.coords[0]), shapely.Point(o.coords[-1])] if o.distance(p) < 0.4 and ln.distance(p) < 0.4]
            if meet: near = near.difference(unary_union([p.buffer(0.8) for p in meet]))
            total += near.length
        # and along a house wall, past where it meets it (it would stand over the doorstep and the bins)
        for h in htree.query(ln.buffer(0.8)):
            near = ln.intersection(walls_[int(h)].exterior.buffer(0.8)).difference(unary_union([e.buffer(1.5) for e in ends]))
            total += near.length
        return total
    for k, b in enumerate(runs):
        pts = [list(q) for q in lines[k].simplify(0.1).coords]
        if len(pts) < 3: continue
        ln = lines[k]
        own = shapely.MultiPoint([ln.coords[0], ln.coords[-1]]).buffer(0.3)
        hang = []     # (run, which end) of the guessed fences that end on this one part way along
        for j in lt.query(ln.buffer(0.3)):
            j = int(j)
            if j == k or j >= len(runs): continue
            for e in (0, -1):
                q = shapely.Point(runs[j]["p"][e][:2])
                if ln.distance(q) < 0.3 and not own.contains(q): hang.append((j, e))
        hung = {j for j, _ in hang}
        def joined(q):
            pt = shapely.Point(q[:2])
            return any(int(j) != k and allines[int(j)].distance(pt) < 0.3 and end_near(int(j), q, 0.5) is None
                       for j in lt.query(pt.buffer(0.3)))
        def clear(a, c):
            seg = shapely.LineString([a[:2], c[:2]])
            if len(hard.query(seg, predicate="intersects")): return False
            ends = shapely.MultiPoint([a[:2], c[:2]]).buffer(0.3)
            return not any(int(j) != k and int(j) not in hung and seg.intersects(allines[int(j)])
                           and not seg.intersection(allines[int(j)]).within(ends) for j in lt.query(seg))
        out, i = [pts[0]], 0
        while i < len(pts) - 1:
            far = i + 1
            for j in range(i + 2, len(pts)):
                if joined(pts[j - 1]): break
                seg = shapely.LineString([pts[i][:2], pts[j][:2]])
                if any(seg.distance(shapely.Point(q[:2])) > WAVE for q in pts[i + 1:j]): break
                if clear(pts[i], pts[j]): far = j
            out.append(pts[far]); i = far
        if len(out) < len(pts):
            # tried out first: the straightened run, and the fences moved to meet it, must not come
            # to run alongside (within 1.3 m of) or across any other wall or fence more than they did
            new_p = {k: dense(out)}
            new_l = {k: shapely.LineString([q[:2] for q in new_p[k]])}
            for j, e in hang:
                q = runs[j]["p"][e]
                m = new_l[k].interpolate(new_l[k].project(shapely.Point(q[:2])))
                if len(hard.query(shapely.LineString([q[:2], (m.x, m.y)]), predicate="intersects")): continue
                pj = [list(x) for x in new_p.get(j, runs[j]["p"])]
                pj[e] = [r1(m.x), r1(m.y), r1(gelev(m.x, m.y))]
                new_p[j] = pj; new_l[j] = shapely.LineString([x[:2] for x in pj])
            if all(_clash(new_l[r], r, new_l) <= _clash(allines[r], r, {}) + 0.5 for r in new_l):
                for r, pr in new_p.items():
                    runs[r]["p"] = pr; lines[r] = allines[r] = new_l[r]
                waves += len(pts) - len(out)
    return waves


print(f"gardens: {_straighten(barriers)} wavy bends in the fences and hedges straightened")
print(f"walls: {n_runs - len(barriers)} runs joined end to end to the run they carry on from")
# and a run that meets another stops at it, rather than poking out a post's width (up to a metre)
# beyond it on the far side
def _trim_ends(barriers, over=1.0):
    lines = [shapely.LineString([q[:2] for q in b["p"]]) for b in barriers]
    tree, trimmed = shapely.STRtree(lines), 0
    for i, b in enumerate(barriers):
        line = lines[i]
        if line.length < 2 * over + 0.5: continue
        cut0, cut1 = 0.0, line.length
        for k in tree.query(line):
            if int(k) == i: continue
            x = line.intersection(lines[int(k)])
            for h in getattr(x, "geoms", [x]):
                if h.is_empty or h.geom_type != "Point": continue
                t = line.project(h)
                if 0.05 < t < over: cut0 = max(cut0, t)
                if line.length - over < t < line.length - 0.05: cut1 = min(cut1, t)
        if cut0 == 0.0 and cut1 == line.length: continue
        piece = substring(line, cut0, cut1)
        n = max(1, int(math.ceil(piece.length / 2.5)))
        qs = _along(piece, n)
        b["p"] = [[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in qs]
        trimmed += 1
    return trimmed
print(f"walls: {_trim_ends(barriers)} runs trimmed to stop at the run they meet")

# ---- no run doubles another: where the end of a wall, fence or hedge runs on along another one
# (within 0.6 m, and the same way within 25 degrees), it is cut back to where it leaves it, so it
# meets that one instead of standing on it; a short run lying along another all its length goes
def _unoverlap(barriers):
    lines = [shapely.LineString([q[:2] for q in b["p"]]) if len(b["p"]) > 1 else None for b in barriers]
    keep = [k for k, l in enumerate(lines) if l is not None]
    tree = shapely.STRtree([lines[k] for k in keep])
    def along(k, a, b):
        """Whether the stretch a-b of run k lies along another run."""
        seg = shapely.LineString([a[:2], b[:2]])
        if seg.length < 0.05: return True
        m = seg.interpolate(0.5, normalized=True)
        ux, uy = (b[0] - a[0]) / seg.length, (b[1] - a[1]) / seg.length
        for j in tree.query(m.buffer(0.6)):
            o = keep[int(j)]
            if o == k or lines[o] is None or lines[o].distance(m) > 0.6: continue
            if barriers[o]["c"] == "retaining_wall": continue
            t = lines[o].project(m)
            if t < 0.3 or t > lines[o].length - 0.3: continue      # (two runs meeting end to end don't double)
            q0, q1 = lines[o].interpolate(max(0, t - 0.5)), lines[o].interpolate(min(lines[o].length, t + 0.5))
            L = math.hypot(q1.x - q0.x, q1.y - q0.y)
            if L < 1e-6: continue
            if abs((q1.x - q0.x) * ux + (q1.y - q0.y) * uy) / L > math.cos(math.radians(25)) and lines[o].distance(seg) < 0.6 \
                    and seg.intersection(lines[o].buffer(0.6)).length > 0.6 * seg.length:
                return True
        return False
    cut, gone = 0, 0
    for k in keep:
        b = barriers[k]
        if b["c"] == "retaining_wall" or lines[k] is None: continue
        pts = b["p"]; changed = False
        while len(pts) >= 2 and along(k, pts[0], pts[1]): pts = pts[1:]; changed = True
        while len(pts) >= 2 and along(k, pts[-2], pts[-1]): pts = pts[:-1]; changed = True
        if not changed: continue
        if len(pts) < 2 or shapely.LineString([q[:2] for q in pts]).length < 1.0:
            b["p"] = []; lines[k] = None; gone += 1
        else:
            b["p"] = pts; lines[k] = shapely.LineString([q[:2] for q in pts]); cut += 1
    barriers[:] = [b for b in barriers if len(b["p"]) >= 2]
    return cut, gone
_n_cut, _n_gone = _unoverlap(barriers)
print(f"walls: {_n_cut} ends cut back off a wall, fence or hedge they ran along, {_n_gone} runs lying along another left out")

# ---- nor does a guessed fence or hedge part way along: a stretch of one lying on another wall, fence
# or hedge (within 0.6 m, and running the same way) is taken out, and an end that pokes up to a metre
# past a run it crosses is cut back to it
def _undouble(barriers):
    guessed = lambda b: b["c"] in ("fence", "hedge", "hedge_low") and "h" not in b
    lines = [shapely.LineString([q[:2] for q in b["p"]]) for b in barriers]
    tree = shapely.STRtree(lines)
    def lies_on(k, seg):
        if seg.length < 0.05: return False
        ux, uy = (seg.coords[1][0] - seg.coords[0][0]) / seg.length, (seg.coords[1][1] - seg.coords[0][1]) / seg.length
        for j in tree.query(seg.buffer(0.6)):
            o = int(j)
            if o == k or lines[o] is None or lines[o].distance(seg) > 0.6: continue
            near = seg.intersection(lines[o].buffer(0.6))
            if near.length < 0.5 * seg.length: continue
            t = lines[o].project(seg.interpolate(0.5, normalized=True))
            q0, q1 = lines[o].interpolate(max(0, t - 0.5)), lines[o].interpolate(min(lines[o].length, t + 0.5))
            L = math.hypot(q1.x - q0.x, q1.y - q0.y)
            if L > 1e-6 and abs((q1.x - q0.x) * ux + (q1.y - q0.y) * uy) / L > math.cos(math.radians(25)): return True
        return False
    out, cut, poked = [], 0, 0
    for k, b in enumerate(barriers):
        if not guessed(b):
            out.append(b); continue
        pts, pieces, cur = b["p"], [], [b["p"][0]]
        for a, c in zip(pts, pts[1:]):
            if lies_on(k, shapely.LineString([a[:2], c[:2]])):
                if len(cur) > 1: pieces.append(cur)
                cur = [c]; cut += 1
            else: cur.append(c)
        if len(cur) > 1: pieces.append(cur)
        kept = []
        for pc in pieces:
            ln = shapely.LineString([q[:2] for q in pc])
            for end in (0, 1):
                if ln.length < 1.5: break
                tip = ln.coords[0] if end == 0 else ln.coords[-1]
                for j in tree.query(ln):
                    o = int(j)
                    if o == k or lines[o] is None: continue
                    x = ln.intersection(lines[o])
                    for h in getattr(x, "geoms", [x]):
                        if h.is_empty or h.geom_type != "Point": continue
                        d = math.hypot(h.x - tip[0], h.y - tip[1])
                        t = ln.project(h)
                        if 0.1 < d < 1.0 and (t < 1.0 if end == 0 else t > ln.length - 1.0):
                            ln = substring(ln, t, ln.length) if end == 0 else substring(ln, 0, t)
                            poked += 1; break
                    else: continue
                    break
            if ln.length >= (1.0 if len(pieces) == 1 else 1.5):     # (a bit left over between two cuts is a stub)
                n = max(1, int(math.ceil(ln.length / 2.5)))
                kept.append(dict(b, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in _along(ln, n)]))
        lines[k] = unary_union([shapely.LineString([q[:2] for q in d["p"]]) for d in kept]) if kept else None
        out.extend(kept)
    barriers[:] = out
    return cut, poked
_n_cut, _n_poke = _undouble(barriers)
print(f"walls: {_n_cut} stretches of guessed fence lying on another taken out, {_n_poke} ends poking past a run cut back")

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
        if any(abs(t - u) < 1.7 for u in cuts[k]): continue        # (another gate already opened there)
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
                piece = substring(wl_, a, e)
                n = max(1, int(math.ceil(piece.length / 2.5)))
                cut_b.append(dict(b, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in _along(piece, n)]))
            if t is not None: pos = t + 0.55
    barriers = cut_b
gate_list = gates_ok
print(f"gates: {moved} moved into a real wall, {opened} left as an open front")

# ---- front doors, garden shrubs, the Palladian Bridge -------------------------------
from landscape import front_doors, shrubs
bays = []
doors = front_doors([c[0] for c in cand], info, roads, gelev, rnd, bays, keys,
                    walls=[shapely.LineString([q[:2] for q in b["p"]]) for b in barriers if len(b["p"]) > 1])
# (only round the middle of the detailed map, where everyone plays; a tile has them everywhere)
shrub_list = shrubs(canopy, footprints, roads, RW, inside, gelev, woods)
ctx.water = water_all
ctx.pitches = pitch_list
marks_lm = landmarks.place(pack, ctx)
from landscape import approaches
paths, drive_strips, extra_fx = approaches(gate_list, drives, doors, [c[0] for c in cand], gelev, rnd, keyed=True,
                                           walls=[shapely.LineString([q[:2] for q in b["p"]]) for b in barriers if len(b["p"]) > 1])
fx += extra_fx
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
            # (crossing a boundary only in its gateway)
            if not h.is_empty and not any(math.hypot((g[0] + g[2]) / 2 - h.centroid.x, (g[1] + g[3]) / 2 - h.centroid.y) < 0.9 for g in gate_list):
                return False
    return True
paths = [q for q in paths if path_clear(q)]
n_sb = len(shrub_list)
shrub_list = [q for q in shrub_list if not near_line(shapely.Point(q[0], q[1]), 0.3)]
# (a tree between two boundaries too close to stand clear of both, it steps on to neither, goes)
nudged, squeezed = 0, set()
for n_, q in enumerate(trees):
    pt = shapely.Point(q[0], q[1])
    for wl_ in near_line(pt, 0.5):
        on = wl_.interpolate(wl_.project(pt))
        tx_, ty_ = q[0] - on.x, q[1] - on.y
        dd = math.hypot(tx_, ty_)
        if dd < 1e-3:
            a_, b_ = wl_.interpolate(max(0, wl_.project(pt) - 0.5)), wl_.interpolate(min(wl_.length, wl_.project(pt) + 0.5))
            tx_, ty_, dd = -(b_.y - a_.y), b_.x - a_.x, math.hypot(b_.x - a_.x, b_.y - a_.y) or 1
        for side in (1, -1):
            nx_, ny_ = r1(on.x + side * tx_ / dd * 0.5), r1(on.y + side * ty_ / dd * 0.5)
            if not near_line(shapely.Point(nx_, ny_), 0.4): break
        else:
            squeezed.add(n_); break
        q[0], q[1] = nx_, ny_
        q[2] = r1(gelev(q[0], q[1]))
        nudged += 1
        break
trees = [q for n_, q in enumerate(trees) if n_ not in squeezed]
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
# telegraph poles go up once the walls and buildings are down, each clear of them
from landscape import telegraph, string_wires
from buildings import zone_at
tpoles, twires = telegraph(roads, doors, lambda x, y: zone_at(A.zones, x, y, A.default_zone), gelev, rnd, keyed=True,
                           clear=lambda x, y: not (near_line(shapely.Point(x, y), 0.2)
                                                   or len(indoor.query(shapely.Point(x, y), predicate="within"))),
                           widths=RW)
fx += tpoles
n_fx = len(fx)
fx = [f for f in fx if f[0] == "car" or not (near_line(shapely.Point(f[1], f[2]), 0.2) or len(indoor.query(shapely.Point(f[1], f[2]), predicate="within")))]
twires = string_wires([f for f in fx if f[0] == "pole"], twires)
print(f"fitting: {n_paths - len(paths)} front paths through a wall left out, {n_sb - len(shrub_list)} shrubs on a boundary, "
      f"{nudged} trees moved off one ({len(squeezed)} between two left out), {n_fx - len(fx)} street items on one or indoors")
# a bench sits with its back to the nearest building (within 15 m), square to that stretch of its
# wall, so it looks out from it; with no building that near, to the nearest wall, fence or hedge
# (within 12 m); with neither, it keeps its street's facing (web/src/furniture.ts draws a bench's
# seat facing its local +z, data (sin a, -cos a)). Near a corner it takes the side it is alongside,
# and the longer one if it is off the corner, never the diagonal between them
def _segments(lines_):
    out = []
    for ln in lines_:
        cs = list(ln.coords)
        out += [shapely.LineString([cs[k][:2], cs[k + 1][:2]]) for k in range(len(cs) - 1) if cs[k][:2] != cs[k + 1][:2]]
    return out
back_sets = []
for lines_, reach in (([shapely.LineString(b["r"][0] + b["r"][0][:1]) for b in blds if len(b["r"][0]) >= 3], 15.0), (blines, 12.0)):
    segs = _segments(lines_)
    if segs: back_sets.append((segs, shapely.STRtree(segs), reach))
turned = 0
for f in fx:
    if f[0] != "bench": continue
    pt = shapely.Point(f[1], f[2])
    for backs, back_tree, reach in back_sets:
        near_ = [backs[int(k)] for k in back_tree.query(pt.buffer(reach)) if backs[int(k)].distance(pt) < reach]
        if near_: break
    else:
        continue
    dmin = min(sg.distance(pt) for sg in near_)
    alongside = lambda sg: 0.01 < sg.project(pt) < sg.length - 0.01
    sg = max((sg for sg in near_ if sg.distance(pt) < dmin + 0.3), key=lambda sg: (alongside(sg), sg.length))
    (ax_, ay_), (bx_, by_) = sg.coords
    tl = math.hypot(bx_ - ax_, by_ - ay_)
    nx_, ny_ = -(by_ - ay_) / tl, (bx_ - ax_) / tl
    on = sg.interpolate(sg.project(pt))
    if nx_ * (f[1] - on.x) + ny_ * (f[2] - on.y) < 0: nx_, ny_ = -nx_, -ny_
    f[4] = round(math.atan2(nx_, -ny_), 2)
    turned += 1
print(f"benches: {turned} turned to sit with their backs to a building, or a wall, fence or hedge")
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
# nor one half up a bank: across it, its wheels on the two sides stand at much the same height, and
# along it, the ground under its middle is about where its wheels put it (else it would float or sink)
def car_level(f):
    x, y, a = f[1], f[2], f[4]
    ux, uy = math.cos(a), math.sin(a)
    w = {(s_, t_): gelev(x + ux * s_ * 1.3 - uy * t_ * 0.75, y + uy * s_ * 1.3 + ux * t_ * 0.75) for s_ in (-1, 1) for t_ in (-1, 1)}
    across = abs((w[-1, -1] + w[1, -1]) - (w[-1, 1] + w[1, 1])) / 2
    mid = abs(gelev(x, y) - sum(w.values()) / 4)
    return across < 0.25 and mid < 0.15
n_fx = len(fx)
fx = [f for f in fx if f[0] != "car" or car_level(f)]
print(f"cars: {n_fx - len(fx)} left out where they would stand half up a bank")

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
    for b, f in zip(blds, bld_fresh):
        if f: continue
        poly = shapely.Polygon(b["r"][0]); c = poly.centroid
        for k in kept.query(c.buffer(1.5)):
            o = kept_bl[int(k)]; op = shapely.Polygon(o["r"][0])
            if op.centroid.distance(c) < 1.5 and abs(op.area - poly.area) < poly.area / 6:
                for key_ in ("dz", "m", "rc", "w", "rr", "rp", "hp", "ch", "pp", "st", "c"):
                    if key_ in o: b[key_] = o[key_]
                    elif key_ in b: del b[key_]
                # (its eaves at the height the earlier build measured, on this build's ground)
                b["h"] = round(o["g"] + o["h"] - b["g"], 1)
                carried += 1
                break
    print(f"buildings: {carried} of {len(blds)} carried over from the earlier build with their measured heights and roofs")

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

    def cut_lines(lines):
        return [dict(ln, p=piece) for ln in lines for piece in clip_runs(ln["p"])]

    mid = lambda q, a, b: own((q[a] + q[b]) / 2, (q[a + 1] + q[b + 1]) / 2)    # a short piece, by its middle
    tbl = list(zip(blds, bld_props))
    blds = [b for b, p in tbl if p.get("_own")]
    # a "building" standing mostly in the canal's water is a boat moored there (Cafe On The Barge
    # at Bathampton, the houseboats at Claverton): the game moors its own narrowboats, so it goes,
    # and its doors and bays with it
    if canal_open:
        water = unary_union([shapely.Polygon([(a[0] - (b[1] - a[1]) / L * a[2], a[1] + (b[0] - a[0]) / L * a[2]),
                                              (b[0] - (b[1] - a[1]) / L * b[2], b[1] + (b[0] - a[0]) / L * b[2]),
                                              (b[0] + (b[1] - a[1]) / L * b[2], b[1] - (b[0] - a[0]) / L * b[2]),
                                              (a[0] + (b[1] - a[1]) / L * a[2], a[1] - (b[0] - a[0]) / L * a[2])]).buffer(0.01)
                             for a, b, _ in canal_open for L in [math.dist(a[:2], b[:2]) or 1]
                             if X0 - 50 < a[0] < X1 + 50 and Y0 - 50 < a[1] < Y1 + 50])
        afloat = [shapely.Polygon(b["r"][0]) for b in blds if len(b["r"][0]) >= 3 and not water.is_empty
                  and shapely.Polygon(b["r"][0]).buffer(0).intersection(water).area > 0.6 * shapely.Polygon(b["r"][0]).buffer(0).area]
        if afloat:
            gone = unary_union(afloat).buffer(1.5)
            blds = [b for b in blds if len(b["r"][0]) < 3 or not any(shapely.Polygon(b["r"][0]).equals(a) for a in afloat)]
            doors = [q for q in doors if not gone.contains(shapely.Point(q[:2]))]
            bays = [q for q in bays if not gone.contains(shapely.Point(q[:2]))]
            print(f"canal: {len(afloat)} boats moored in the water mapped as buildings left out")
    out.update(
        b=[TX0, TY0, TX1, TY1], tile=[ti, tj], v=None, spawn=spawn,
        t=dict(nx=CELLS + 1, ny=CELLS + 1, x0=TX0, y0=TY0, dx=D, dy=D, z0=z0,
               h=[int(round((v - z0) * 10)) for v in grid[MARGIN:MARGIN + CELLS + 1, MARGIN:MARGIN + CELLS + 1].ravel()],
               k="".join(str(int(v)) for v in GT[MARGIN:MARGIN + CELLS + 1, MARGIN:MARGIN + CELLS + 1].ravel())),
        bl=blds, rd=cut_lines(roads), wp=wp, wl=cut_lines(wl), br=cut_lines(barriers), tn=cut_lines(tunnel_list),
        gt=[q for q in gate_list if mid(q, 0, 2)], mk=[q for q in marks if mid(q, 0, 2)], wr=[q for q in twires if own(q[0], q[1])],
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

# Nothing stands in a road's carriageway, on the railway, or in the water or the canal's channel:
# trees, shrubs and street items there are taken out, and walls, fences and hedges are cut where
# they cross any of them (the canopy map sees trees overhanging a road or a river as cover on it,
# and Overture's walls run across the railway's cuttings).
corridors = []
for r in out["rd"]:
    if len(r["p"]) > 1 and r["c"] not in PATHS: corridors.append(shapely.LineString([q[:2] for q in r["p"]]).buffer((r["w"] if "pv" in r else RW.get(r["c"], 4)) / 2, cap_style=2))
for t in rail_tracks:
    pts = [q[:2] for q in t["p"] if q[3] != 2 and X0 - 20 <= q[0] <= X1 + 20 and Y0 - 20 <= q[1] <= Y1 + 20]
    if len(pts) > 1: corridors.append(shapely.LineString(pts).buffer(RAIL_HALF, cap_style=2))
for seg, lv, half in canal_runs:
    corridors.append(seg.buffer(half + 0.8, cap_style=2))
# and nothing on the canal's banks or their verges (web/src/works.ts lays them)
for a, b, lv in canal_open:
    if max(a[0], b[0]) < X0 - 30 or min(a[0], b[0]) > X1 + 30 or max(a[1], b[1]) < Y0 - 30 or min(a[1], b[1]) > Y1 + 30: continue
    L = math.dist(a[:2], b[:2]) or 1
    nx_, ny_ = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
    reach = lambda q, k: q[2] + (q[7 + k] + q[9 + k] if len(q) > 10 else 3.6) + 0.3
    corridors.append(shapely.Polygon([(a[0] + nx_ * reach(a, 0), a[1] + ny_ * reach(a, 0)), (b[0] + nx_ * reach(b, 0), b[1] + ny_ * reach(b, 0)),
                                      (b[0] - nx_ * reach(b, 1), b[1] - ny_ * reach(b, 1)), (a[0] - nx_ * reach(a, 1), a[1] - ny_ * reach(a, 1))]).buffer(0.5))
for w in out["wp"]:
    if len(w["r"][0]) >= 3: corridors.append(shapely.Polygon(w["r"][0], [tuple(map(tuple, h)) for h in w["r"][1:]]).buffer(0.8))
if corridors:
    ctree = shapely.STRtree(corridors)
    def clear_at(x, y):
        pt = shapely.Point(x, y)
        return any(corridors[int(k)].contains(pt) for k in ctree.query(pt))
    before = (len(out["tr"]), len(out["sb"]), len(out["fx"]), len(out["br"]))
    out["tr"] = [q for q in out["tr"] if not clear_at(q[0], q[1])]
    out["sb"] = [q for q in out["sb"] if not clear_at(q[0], q[1])]
    out["fx"] = [q for q in out["fx"] if q[0] == "car" or not clear_at(q[1], q[2])]     # (parked cars stand in the road on purpose)
    # walls: the pieces outside the corridors, and off the pavements, are kept, cut at their edge
    # (a wall at the back of the pavement stands just clear of it)
    for r in out["rd"]:
        if len(r["p"]) < 2 or r["c"] in PATHS or "pv" not in r and r["c"] not in KERBED_RD | {"trunk"}: continue
        L_ = shapely.LineString([q[:2] for q in r["p"]])
        w_ = r["w"] if "pv" in r else RW.get(r["c"], 4)
        for side, pv_ in zip((1, -1), r.get("pv", [1.7, 1.7])):
            if pv_ > 0.3: corridors.append(L_.buffer(side * (w_ / 2 + pv_ - 0.2), cap_style=2, single_sided=True))
    ctree = shapely.STRtree(corridors)
    cut_walls = []
    blockers = unary_union([corridors[int(k)] for k in set(ctree.query(shapely.MultiLineString([[q[:2] for q in b["p"]] for b in out["br"] if len(b["p"]) > 1])))]) if any(len(b["p"]) > 1 for b in out["br"]) else None
    for b in out["br"]:
        if len(b["p"]) < 2: continue
        line = shapely.LineString([q[:2] for q in b["p"]])
        rest = line.difference(blockers) if blockers is not None and blockers.intersects(line) else line
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "LineString" or piece.length < 0.8: continue
            n = max(1, int(math.ceil(piece.length / 2.5)))
            pts = _along(piece, n)
            cut_walls.append(dict(b, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))
    _trim_ends(cut_walls)      # (and those cut back stop where they meet another, as above)
    _undouble(cut_walls)       # (and no guessed fence ends up on another, or poking past one)
    # a stub of wall left standing on its own (no wall, fence, hedge or gate at either end) is a
    # post in the way, not a wall: it goes. Last, as taking out a doubled fence can leave one alone,
    # and again until none is left, as a stub can be all that held up another.
    gate_ends = [shapely.Point(g[0], g[1]) for g in out.get("gt") or []] + [shapely.Point(g[2], g[3]) for g in out.get("gt") or []]
    n_cut = len(cut_walls)
    while True:
        ends_ = [shapely.LineString([q[:2] for q in b["p"]]) for b in cut_walls] + gate_ends
        etree = shapely.STRtree(ends_) if ends_ else None
        def _joined(k, pt):
            return any(int(j) != k and ends_[int(j)].distance(pt) < 0.3 for j in etree.query(pt.buffer(0.3)))
        kept_ = [b for k, b in enumerate(cut_walls) if ends_[k].length >= 1.5
                 or _joined(k, shapely.Point(b["p"][0][:2])) or _joined(k, shapely.Point(b["p"][-1][:2]))]
        if len(kept_) == len(cut_walls): break
        cut_walls = kept_
    out["br"] = cut_walls
    print(f"walls: {n_cut - len(cut_walls)} stubs standing on their own left out")
    # and a gate whose wall was cut back off the road or the pavement is left as an open front
    wl_lines = [shapely.LineString([q[:2] for q in b["p"]]) for b in cut_walls]
    wtree_ = shapely.STRtree(wl_lines) if wl_lines else None
    walled_ = lambda pt: wtree_ is not None and any(wl_lines[int(k)].distance(pt) < 0.3 for k in wtree_.query(pt.buffer(0.3)))
    n_open = 0
    for g in out.get("gt") or []:
        if g[5] != "open" and not (walled_(shapely.Point(g[0], g[1])) and walled_(shapely.Point(g[2], g[3]))):
            g[5] = "open"; n_open += 1
    print(f"gates: {n_open} left open where their wall was cut off the road or the pavement")
    gone = (before[0] - len(out["tr"]), before[1] - len(out["sb"]), before[2] - len(out["fx"]))
    print(f"corridors: {gone[0]} trees, {gone[1]} shrubs and {gone[2]} street items taken off the roads, the railway and the water; {before[3]} wall runs cut to {len(out['br'])}")
json.dump(out, open(out_path, "w"), separators=(",", ":"))
if STORE is not None: STORE.save()
print(f"terrain {out['t']['nx']}x{out['t']['ny']} @ {STEP} m, {grid.min():.1f}-{grid.max():.1f} m; {len(blds)} buildings "
      f"({sum('rr' in b for b in blds)} gabled), {len(roads)} road runs, {len(wp)} ponds, {len(wl)} streams, "
      f"{len(barriers)} wall/fence/hedge runs ({len(br)} mapped + {len(garden_br)} gardens, before path gaps), {len(gate_list)} gates, {len(fx)} street items, {len(signs)} shop signs, {len(doors)} doors, {len(shrub_list)} shrubs, {len(marks)} markings, {len(trees)} trees, {len(places)} places; {os.path.getsize(out_path) / 1e6:.1f} MB")

