"""More of the scenery rules, called for each square by tools/check_map.py and counted with its own.

12. Buildings stand on their ground: no wall's foot in the air or eaves under the hill, no two
    buildings in one another, none with no height, and every front door, shop sign and bay window
    on its building's wall, a door opening on to open ground rather than into another building or
    a wall.
13. Streets and paths join up: two that meet do so at one height, one cut by a square's edge goes
    on in the next square at the same height, none ends or runs inside a building, and none is too
    steep to walk.
14. The ground and water: the ground meets its neighbour's at every square's edge; a pond or river
    sits between its banks, not hung above them (except where it falls over a weir, wf, runs on
    into more water as high, or stands in a tank's walls); a stream drawn as a line runs on its ground.
15. Small things stand on the ground (not floating or sunk), not on top of one another; a parked car
    is not in a building, in the water or in another car; a bus stop, crossing or path gate is on
    its street or path (a bus stop's street may be one closed to traffic that buses use: bu).
16. A tunnel's mouths are on the ground.
17. Where the game sends players: a pub's door is outside, near a street and inside the force
    field; an overhead wire doesn't run through a building or low over a road.
18. Boats: a moored boat is on the canal's water, not in a lock, under a bridge or in another boat.
19. The railway is watertight, as the game builds it (tools/watertight.ts runs the game's own
    web/src/railway.ts over the squares' ground): nowhere on its track bed, bridges or platforms is
    what you stand on well below what's drawn ("falls through the floor"), and no ray from standing
    height on, under or beside the line passes into its body (under its ballast, deck or platform,
    above the ground and an arch's opening) without meeting a face ("sky through the ground").
20. Nothing is drawn over a street, as the game draws it (tools/overroad.mjs looks down on every
    kerbed street of the built game, a metre apart along and across it, in a muted headless Chrome):
    the first face seen over a carriageway is the road, not paving, grass, earth, the ground over a
    buried road, a slab, a wall or a building; the first over a pavement is paving (road running on
    from the kerb is a carriageway drawn wider than its record, a row of its own); and no pavement
    stands on a lip more than 0.3 m over the open ground behind it. Each place's score is its area in
    m2. Only when web/dist has been built (each run reads the maps as they are now); CD_OVERROAD=0
    leaves it out.

(11 is the roofs' rule.) Only things a player would see as broken are counted, and each test is
loose enough that a hit is worth looking at.
"""
import functools, json, math, os, subprocess, tempfile
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import substring, unary_union

PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
WEIR_REACH = 2.0    # metres either side of a weir's line that its face covers
VEHICLE = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service", "unknown",
           "trunk_link", "primary_link", "secondary_link"}
RW = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 6, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.4, "track": 2.8, "bridleway": 2}
OVERROAD_ONLY = [None]    # the squares being checked, when not all of them (check_map.py --tiles)
EDGE = 15.0   # metres: something nearer a square's edge than this may belong with what is in the next square


def terrain(T):
    """The game's ground (map.ts: two triangles to each cell), for many points at once."""
    nx, ny = T["nx"], T["ny"]
    H = np.array(T["h"], dtype=float).reshape(ny, nx) / 10 + T["z0"]

    def ground(x, y):
        x, y = np.asarray(x, float), np.asarray(y, float)
        fi, fj = (x - T["x0"]) / T["dx"], (y - T["y0"]) / T["dy"]
        i, j = np.clip(np.floor(fi).astype(int), 0, nx - 2), np.clip(np.floor(fj).astype(int), 0, ny - 2)
        u, v = np.clip(fi - i, 0, 1), np.clip(fj - j, 0, 1)
        a, b, c, d = H[j, i], H[j, i + 1], H[j + 1, i], H[j + 1, i + 1]
        return np.where(u + v <= 1, a + (b - a) * u + (c - a) * v, d + (c - d) * (1 - u) + (b - d) * (1 - v))
    return ground


@functools.lru_cache(maxsize=4)
def _whole(root, map_id):
    """What the map keeps outside its squares: the canal, the pubs and the force field."""
    def load(name):
        p = os.path.join(root, f"{map_id}{name}.json")
        return json.load(open(p)) if os.path.exists(p) else None
    head, wide = load(""), load("-wide")
    src = wide if wide and "field" in wide else head or {}
    return {"canal": load("-canal"), "pubs": (load("-pubs") or {}).get("pb") or [],
            "field": src.get("field"), "fc": src.get("fc") or [0, 0]}


@functools.lru_cache(maxsize=4)
def _set_pieces(centre):
    """Each set piece's outlines in data metres (landmarks/setpieces.ts): the game hides what the map
    has inside them and builds its own, so nothing there is the map's to judge. Read from the game's
    own table with its bundler; none if that can't be run."""
    web = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
    src = (f'import {{ SET_PIECES }} from "{web}/src/landmarks/setpieces";'
           'console.log(JSON.stringify(SET_PIECES.map((s: any) => [s.at, s.bearing, [s.outline, ...(s.more ?? [])]])));')
    try:
        js = subprocess.run([os.path.join(web, "node_modules", ".bin", "esbuild"), "--bundle", "--platform=node", "--format=esm",
                             "--loader=ts", "--log-level=error", "--banner:js=globalThis.location={search:''};globalThis.window=globalThis;"],
                            input=src, capture_output=True, text=True, check=True).stdout
        pieces = json.loads(subprocess.run(["node", "--input-type=module"], input=js, capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []
    lon0, lat0 = centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    out = []
    for (lon, lat), bearing, rings in pieces:
        ox, oy = (lon - lon0) * kx, (lat - lat0) * ky
        a = math.radians(90 - bearing)
        ux, uy = math.cos(a), math.sin(a)
        for r in rings:
            if len(r) >= 3: out.append(_poly([(ox + ux * lx + uy * lz, oy + uy * lx - ux * lz) for lx, lz in r]))
    return out


@functools.lru_cache(maxsize=2)
def watertight(root, map_id):
    """Rule 19's findings over the whole map, from tools/watertight.ts bundled with the game's code;
    none if that can't be run. Called once before the squares are checked, so it runs only once."""
    here = os.path.dirname(os.path.abspath(__file__))
    web = os.path.join(os.path.dirname(here), "web")
    try:
        js = subprocess.run([os.path.join(web, "node_modules", ".bin", "esbuild"), "--bundle", "--platform=node", "--format=esm",
                             "--loader=ts", "--log-level=error",
                             "--banner:js=globalThis.location={search:''};globalThis.window=globalThis;"
                             "globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>({})})})};"],
                            input=open(os.path.join(here, "watertight.ts")).read(), cwd=web, capture_output=True, text=True, check=True).stdout
        with tempfile.NamedTemporaryFile("w", suffix=".mjs") as f:
            f.write(js); f.flush()
            return json.loads(subprocess.run(["node", f.name, os.path.abspath(root), map_id], capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []


@functools.lru_cache(maxsize=2)
def overroad(root, map_id, only=None):
    """Rule 20's places over the squares given (all if None), from tools/overroad.mjs looking at the
    built game; none if there is no built game or no browser. Called once before the squares are checked."""
    here = os.path.dirname(os.path.abspath(__file__))
    if os.environ.get("CD_OVERROAD") == "0" or not os.path.exists(os.path.join(os.path.dirname(here), "web", "dist", "index.html")):
        return []
    args = ["node", os.path.join(here, "overroad.mjs"), "--map", map_id, "--maps", os.path.abspath(root)]
    if only: args += ["--only", " ".join(only)]
    try:
        return json.loads(subprocess.run(args, capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []


def _unmask(m, pieces):
    """The square as the game shows it: what a set piece hides taken out."""
    if not pieces: return
    sq = box(*m["b"]).buffer(200)
    near = [p for p in pieces if p.intersects(sq)]
    if not near: return
    hide = lambda x, y: any(p.contains(Point(x, y)) for p in near)
    mid = lambda ring: (sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring))
    m["bl"] = [b for b in m.get("bl") or [] if not hide(*mid(b["r"][0]))]
    m["wp"] = [w for w in m.get("wp") or [] if w.get("c") == "canal" or not all(hide(q[0], q[1]) for q in w["r"][0])]
    for k in ("tr", "sb", "dr", "by", "sh"):
        if m.get(k): m[k] = [q for q in m[k] if not hide(+q[0], +q[1])]
    m["sp"] = [list(p.exterior.coords) for p in near for p in getattr(p, "geoms", [p])]


@functools.lru_cache(maxsize=12)
def _terrain_of(path):
    return terrain(json.load(open(path))["t"]) if os.path.exists(path) else None


def beyond(f, m, ground):
    """ground, and past the square's edge the ground of the square there (a building held by this
    square can reach over its edge, standing on the next square's ground in the game)."""
    x0, y0, x1, y1 = m["b"]
    size = x1 - x0
    try:
        ti, tj = (int(n) for n in os.path.basename(f)[:-5].split("_"))
    except ValueError:
        return ground

    def at(x, y):
        x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
        out = np.asarray(ground(x, y), float).copy()
        di, dj = np.floor((x - x0) / size).astype(int), np.floor((y - y0) / size).astype(int)
        for a, b in set(zip(di.tolist(), dj.tolist())) - {(0, 0)}:
            g = _terrain_of(os.path.join(os.path.dirname(f), f"{ti + a}_{tj + b}.json"))
            k = (di == a) & (dj == b)
            if g is not None: out[k] = g(x[k], y[k])
        return out
    return at


@functools.lru_cache(maxsize=24)
def _buildings_of(path, centre):
    """A square's buildings as the game shows them, with their outlines, for the squares beside one."""
    if not os.path.exists(path): return []
    n = json.load(open(path))
    if centre: _unmask(n, _set_pieces(centre))
    return [(b, _poly(b["r"][0], b["r"][1:])) for b in n.get("bl") or [] if len(b["r"][0]) >= 3]


def next_door(f, m):
    """The buildings of the squares round this one that reach within 40 m of it: a door, a sign or a
    path near the edge can be on a building that the next square holds."""
    try:
        ti, tj = (int(n) for n in os.path.basename(f)[:-5].split("_"))
    except ValueError:
        return []
    near = box(*m["b"]).buffer(40)
    centre = tuple(m["centre"]) if m.get("centre") else None
    return [(b, h) for di in (-1, 0, 1) for dj in (-1, 0, 1) if di or dj
            for b, h in _buildings_of(os.path.join(os.path.dirname(f), f"{ti + di}_{tj + dj}.json"), centre) if h.intersects(near)]


@functools.lru_cache(maxsize=12)
def _edge_of(path):
    """A neighbouring square's ground and street ends, for the seams."""
    if not os.path.exists(path): return None
    n = json.load(open(path))
    if "t" not in n: return None
    ends = [(q[0], q[1], q[2], len(q) > 3 and q[3]) for r in n.get("rd") or [] if len(r["p"]) > 1 for q in (r["p"][0], r["p"][-1])]
    return n["t"], np.asarray([e[:3] for e in ends], float).reshape(-1, 3), n["b"]


def surface(m, ground):
    """The ground as the game draws it and stands things on: the streets' faces (sf) where there are
    some, else the terrain (map.ts standOnDrawn)."""
    sf = m.get("sf")
    if not sf or "o" not in sf: return ground
    v = np.cumsum(np.asarray(sf["v"], float).reshape(-1, 3), axis=0) / 100 + [sf["o"][0], sf["o"][1], 0]
    tri = np.concatenate([np.cumsum(np.asarray(sf[k], np.int64)) for k in ("road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel") if sf.get(k)] or [np.zeros(0, np.int64)]).reshape(-1, 3)
    if not len(tri): return ground
    A, B, C = v[tri[:, 0]], v[tri[:, 1]], v[tri[:, 2]]
    tree = shapely.STRtree(shapely.polygons(np.stack([A[:, :2], B[:, :2], C[:, :2]], axis=1)))

    def drawn(x, y):
        x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
        z = ground(x, y)
        pi, ti = tree.query(shapely.points(np.stack([x, y], axis=1)), predicate="intersects")
        if len(pi):
            a, b, c = A[ti], B[ti], C[ti]
            d = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
            d = np.where(np.abs(d) < 1e-9, 1e-9, d)
            l1 = ((b[:, 1] - c[:, 1]) * (x[pi] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y[pi] - c[:, 1])) / d
            l2 = ((c[:, 1] - a[:, 1]) * (x[pi] - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y[pi] - c[:, 1])) / d
            z[pi] = l1 * a[:, 2] + l2 * b[:, 2] + (1 - l1 - l2) * c[:, 2]
        return z
    return drawn


def _poly(ring, holes=()):
    g = Polygon(ring, [h for h in holes if len(h) >= 3])
    return g if g.is_valid else g.buffer(0)


def square(m, tag, note, f):
    if "t" not in m: return
    ground = terrain(m["t"])
    root, map_id = os.path.dirname(os.path.dirname(f)), os.path.basename(os.path.dirname(f))
    if not os.path.exists(os.path.join(root, f"{map_id}.json")):
        root, map_id = os.path.dirname(f), os.path.basename(f)[:-5]
    whole = _whole(root, map_id)
    m = dict(m)
    if m.get("centre"): _unmask(m, _set_pieces(tuple(m["centre"])))
    sq = box(*m["b"])
    inner = sq.buffer(-EDGE)
    at = lambda x, y: (tag, round(x), round(y))

    blds = [b for b in m.get("bl") or [] if len(b["r"][0]) >= 3]
    homes = [_poly(b["r"][0], b["r"][1:]) for b in blds]
    own = len(blds)
    for b, h in next_door(f, m):
        blds.append(b); homes.append(h)
    htree = shapely.STRtree(homes)
    solid = shapely.STRtree([h.buffer(-0.3) for h in homes])
    rings = [h.exterior for h in homes for h in getattr(h, "geoms", [h])] + [LineString(r) for r in m.get("sp") or [] if len(r) >= 3]
    ring_tree = shapely.STRtree(rings)
    roads = [r for r in m.get("rd") or [] if len(r["p"]) > 1]
    rlines = [LineString([q[:2] for q in r["p"]]) for r in roads]
    rtree = shapely.STRtree(rlines)
    marked = [any(len(q) > 3 and q[3] for q in r["p"]) for r in roads]
    # where the ground isn't the floor: decks, tunnels and set pieces, whose things stand on their own heights
    decks = [rlines[i].buffer(9) for i in range(len(roads)) if marked[i]]
    decks += [LineString([q[:2] for q in t["p"]]).buffer(8) for t in m.get("tn") or [] if len(t["p"]) > 1]
    decks += [_poly(r) for r in m.get("sp") or [] if len(r) >= 3]
    for lm in m.get("lm") or []: decks.append(Point(lm[1], lm[2]).buffer(40))
    dtree = shapely.STRtree(decks)
    waters = [_poly(w["r"][0], w["r"][1:]) for w in m.get("wp") or [] if len(w["r"][0]) >= 3]
    wtree = shapely.STRtree(waters)
    bars = [b for b in m.get("br") or [] if len(b["p"]) > 1]
    btree = shapely.STRtree([LineString([q[:2] for q in b["p"]]) for b in bars])

    def pts(xy):
        return shapely.points(np.asarray(xy, float).reshape(-1, 2))

    def hits(tree, p, pred="within"):
        out = np.zeros(len(p), bool)
        if len(p) and len(tree.geometries): out[tree.query(p, predicate=pred)[0]] = True
        return out

    def off_deck(p):
        return ~hits(dtree, p)

    drawn = surface(m, ground)
    buildings(m, own, blds, homes, htree, solid, ring_tree, rings, bars, btree, beyond(f, m, drawn), note, at, off_deck, pts)
    streets(m, roads, rlines, rtree, marked, homes, solid, ground, note, at, sq, f)
    land_and_water(m, waters, ground, note, at, sq, f)
    small_things(m, roads, rlines, rtree, solid, wtree, drawn, note, at, off_deck, pts, hits, inner)
    for t in m.get("tn") or []:
        p = t["p"]
        if len(p) < 2: continue
        for q, r in ((p[0], p[1]), (p[-1], p[-2])):
            if not sq.buffer(-3).contains(Point(q[:2])): continue    # (cut by the square's edge, not a mouth)
            d = math.dist(q[:2], r[:2]) or 1
            ox, oy = q[0] + (q[0] - r[0]) / d * 3, q[1] + (q[1] - r[1]) / d * 3
            dz = q[2] - float(ground(ox, oy))
            if abs(dz) > 1.0: note("16 tunnel mouth off the ground", abs(dz), at(q[0], q[1]), f"{t['c']} {t['n']!r} floor {dz:+.1f} m from the ground outside")
    gameplay(m, whole, blds, homes, htree, solid, roads, rlines, rtree, waters, wtree, note, at, sq, pts, hits)
    for w in watertight(root, map_id):
        if sq.contains(Point(w["x"], w["y"])): note(w["rule"], w["score"], at(w["x"], w["y"]), w["what"])
    for w in overroad(root, map_id, OVERROAD_ONLY[0]):
        if sq.contains(Point(w["x"], w["y"])): note(w["rule"], w["score"], at(w["x"], w["y"]), w["what"])
    street_faces(m, roads, rlines, marked, note, at, sq)
    boats(m, whole, roads, rlines, rtree, marked, waters, wtree, ground, note, at, sq)


def buildings(m, own, blds, homes, htree, solid, ring_tree, rings, bars, btree, ground, note, at, off_deck, pts):
    sq = box(*m["b"])
    for b, h in zip(blds[:own], homes[:own]):
        c = h.representative_point()
        if h.area < 4: continue
        ring = h.exterior if h.geom_type == "Polygon" else max(h.geoms, key=lambda g: g.area).exterior
        along = [ring.interpolate(s) for s in np.arange(0, ring.length, 2.0)]
        xy = np.array([(p.x, p.y) for p in along])
        if not off_deck(pts(xy)).all(): continue
        g = ground(xy[:, 0], xy[:, 1])
        gap = b["g"] - 0.6 - g.min()
        if gap > 0.3: note("12 building floating", gap, at(c.x, c.y), f"{b['c']} wall foot {gap:.1f} m over the ground")
        under = g.max() - (b["g"] + b["h"])
        if under > 0.5: note("12 building's eaves under the ground", under, at(c.x, c.y), f"{b['c']} {under:.1f} m")
        if b["h"] < 2.0: note("12 building with no height", 2.0 - b["h"], at(c.x, c.y), f"{b['c']} {b['h']:.1f} m")
    seen = set()
    for i, h in enumerate(homes):
        for j in htree.query(h):
            j = int(j)
            if j <= i or (i, j) in seen: continue
            seen.add((i, j))
            a = h.intersection(homes[j]).area
            small = min(h.area, homes[j].area)
            if a > 4 and a > 0.2 * small:
                x = h.intersection(homes[j]).representative_point()
                if sq.contains(x): note("12 buildings inside each other", a, at(x.x, x.y), f"{blds[i]['c']} and {blds[j]['c']} share {a:.0f} m2 ({a / small:.0%} of the smaller)")

    def on_wall(x, y):
        p = Point(x, y)
        k = ring_tree.query_nearest(p)
        return rings[int(k[0])].distance(p) if len(k) else 99
    for d in m.get("dr") or []:
        x, y, a = d[0], d[1], d[3]
        off = on_wall(x, y)
        if off > 0.3:
            note("12 door not on a wall", off, at(x, y), f"{off:.1f} m from the nearest wall")
            continue
        ox, oy = math.sin(a), -math.cos(a)
        indoors = lambda o: any(homes[int(k)].buffer(-0.1).contains(o) for k in htree.query(o))
        if indoors(Point(x + ox * 0.8, y + oy * 0.8)):
            if indoors(Point(x - ox * 0.8, y - oy * 0.8)): note("12 door on a party wall", 1, at(x, y), "a building each side")
            else: note("12 door facing into its building", 1, at(x, y), "")
            continue
        step = LineString([(x + ox * 0.15, y + oy * 0.15), (x + ox * 0.75, y + oy * 0.75)])
        for k in btree.query(step):
            if step.intersects(LineString([q[:2] for q in bars[int(k)]["p"]])):
                note("12 door opening into a wall", 1, at(x, y), bars[int(k)]["c"]); break
    for s in m.get("sh") or []:
        if len(s) > 7 and s[7]: continue
        off = on_wall(s[0], s[1])
        if off > 0.3: note("12 shop sign not on a wall", off, at(s[0], s[1]), f"{s[5]!r} {off:.1f} m off")
    for q in m.get("by") or []:
        off = abs(on_wall(q[0], q[1]) - 0.45)   # (its point is the middle of the bay, out from the wall)
        if off > 0.3: note("12 bay window not on a wall", off, at(q[0], q[1]), f"{off:.1f} m off")


def streets(m, roads, rlines, rtree, marked, homes, solid, ground, note, at, sq, f):
    tubes = [LineString([q[:2] for q in t["p"]]).buffer(6) for t in m.get("tn") or [] if len(t["p"]) > 1]
    in_tube = lambda p: any(t.contains(p) for t in tubes)
    # two ways meeting: an end of one on the other
    met = set()
    for i, r in enumerate(roads):
        for e in (r["p"][0], r["p"][-1]):
            if len(e) > 3 and e[3]: continue
            pe = Point(e[:2])
            if in_tube(pe): continue
            for j in rtree.query(pe.buffer(0.3)):
                j = int(j)
                if j == i or rlines[j].distance(pe) > 0.3: continue
                o = roads[j]["p"]
                s = rlines[j].project(pe)
                cum = np.concatenate([[0], np.cumsum([math.dist(a[:2], b[:2]) for a, b in zip(o, o[1:])])])
                k = int(np.clip(np.searchsorted(cum, s), 1, len(o) - 1))
                if any(len(q) > 3 and q[3] for q in (o[k - 1], o[k])): continue
                z = float(np.interp(s, cum, [q[2] for q in o]))
                dz = abs(e[2] - z)
                key = (round(e[0]), round(e[1]))
                if dz > 0.75 and sq.contains(pe) and key not in met:
                    met.add(key)
                    note("13 ways meet at different heights", dz, at(e[0], e[1]), f"{r['c']} {r['n']!r} {dz:.1f} m off {roads[j]['c']} {roads[j]['n']!r}")
                    break
    # cut by the square's edge: the next square's piece starts where this one stops, at its height
    stem = os.path.basename(f)[:-5]
    try:
        ti, tj = (int(n) for n in stem.split("_"))
    except ValueError:
        ti = tj = None
    if ti is not None:
        x0, y0, x1, y1 = m["b"]
        for r, mk in zip(roads, marked):
            for e in (r["p"][0], r["p"][-1]):
                dis = [0] + [1] * (abs(e[0] - x1) < 0.5) + [-1] * (abs(e[0] - x0) < 0.5)
                djs = [0] + [1] * (abs(e[1] - y1) < 0.5) + [-1] * (abs(e[1] - y0) < 0.5)
                nbs = [(di, dj, _edge_of(os.path.join(os.path.dirname(f), f"{ti + di}_{tj + dj}.json"))) for di in dis for dj in djs if di or dj]
                nbs = [(di, dj, nb) for di, dj, nb in nbs if nb is not None and len(nb[1])]
                if not nbs: continue
                ends = np.concatenate([nb[1] for _, _, nb in nbs])
                first = (min(ti, *(ti + di for di, _, _ in nbs)), min(tj, *(tj + dj for _, dj, _ in nbs))) == (ti, tj)
                d = np.hypot(ends[:, 0] - e[0], ends[:, 1] - e[1])
                k = int(np.argmin(d))
                if d[k] > 1.5: note("13 way stops at a square's edge", d[k], at(e[0], e[1]), f"{r['c']} {r['n']!r}: nearest in the next square {d[k]:.1f} m away")
                elif first and abs(ends[k, 2] - e[2]) > 0.3:
                    note("13 way steps at a square's edge", abs(ends[k, 2] - e[2]), at(e[0], e[1]), f"{r['c']} {r['n']!r} {abs(ends[k, 2] - e[2]):.1f} m")
    # inside buildings
    for r, ln, mk in zip(roads, rlines, marked):
        if mk or any(t.intersects(ln) for t in tubes): continue
        for e in (r["p"][0], r["p"][-1]):
            pe = Point(e[:2])
            if sq.contains(pe) and any(homes[int(k)].buffer(-1.0).contains(pe) for k in solid.query(pe)):
                note("13 way ends inside a building", 1, at(e[0], e[1]), f"{r['c']} {r['n']!r}")
        if r["c"] in PATHS:
            parts = [homes[int(k)].buffer(-0.5).intersection(ln) for k in solid.query(ln)]
            inside = sum(x.length for x in parts)
            if inside > 4:
                c = max(parts, key=lambda x: x.length).interpolate(0.5, normalized=True)
                note("13 path through a building", inside, at(c.x, c.y), f"{r['c']} {r['n']!r} {inside:.0f} m indoors")
    # too steep to walk: a path, not steps, steeper than 1 in 1.5 over a few metres
    for r, mk in zip(roads, marked):
        if r["c"] not in PATHS or r["c"] == "steps" or mk: continue
        p = r["p"]
        for a, b in zip(p, p[1:]):
            d = math.dist(a[:2], b[:2])
            if d > 2 and abs(b[2] - a[2]) / d > 0.67:
                note("13 path too steep to walk", abs(b[2] - a[2]) / d, at(a[0], a[1]), f"{r['c']} {r['n']!r} 1 in {d / abs(b[2] - a[2]):.1f}")
                break


def land_and_water(m, waters, ground, note, at, sq, f):
    stem = os.path.basename(f)[:-5]
    try:
        ti, tj = (int(n) for n in stem.split("_"))
    except ValueError:
        return_seams = True
    else:
        return_seams = False
    if not return_seams:
        x0, y0, x1, y1 = m["b"]
        for di, dj in ((1, 0), (0, 1)):
            nb = _edge_of(os.path.join(os.path.dirname(f), f"{ti + di}_{tj + dj}.json"))
            if nb is None: continue
            theirs = terrain(nb[0])
            s = np.arange(0, (y1 - y0 if di else x1 - x0) + 0.01, 2.0)
            xs, ys = (np.full_like(s, x1), y0 + s) if di else (x0 + s, np.full_like(s, y1))
            dz = np.abs(ground(xs, ys) - theirs(xs, ys))
            k = int(np.argmax(dz))
            if dz[k] > 0.3: note("14 ground steps at a square's edge", float(dz[k]), at(xs[k], ys[k]), f"{dz[k]:.1f} m, {int((dz > 0.3).sum()) * 2} m of the edge")
    # (water falling over a weir stands over the water below it there: the game draws the weir's face)
    falls = [LineString([q[:2] for q in f["p"]]).buffer(WEIR_REACH) for f in m.get("wf") or [] if len(f["p"]) > 1]
    falls = unary_union(falls) if falls else None
    srcs = [w for w in m.get("wp") or [] if len(w["r"][0]) >= 3]
    for n, (w, src) in enumerate(zip(waters, srcs)):
        # (and a tank's walls hold its water up wherever it stands over the ground: world.ts builds them)
        if src.get("c") == "canal" or src.get("k") == "t" or w.area < 30: continue
        # (nor is it over a bank where it runs on into more water as high, cut from it at a weir)
        on = [o.buffer(0.5) for k, (o, e) in enumerate(zip(waters, srcs)) if k != n and e.get("c") != "canal" and e["z"] >= src["z"] - 0.5 and o.distance(w) < 0.5]
        on = unary_union(on) if on else None
        ring = w.exterior if w.geom_type == "Polygon" else max(w.geoms, key=lambda g: g.area).exterior
        s = np.arange(0, ring.length, 2.0)
        xy = np.array([ring.interpolate(t).coords[0] for t in s])
        keep = np.array([sq.contains(Point(q)) and min(abs(q[0] - m["b"][0]), abs(q[0] - m["b"][2]), abs(q[1] - m["b"][1]), abs(q[1] - m["b"][3])) > 1
                         and (falls is None or not falls.contains(Point(q))) and (on is None or not on.contains(Point(q))) for q in xy])
        if keep.sum() < 5: continue
        low = src["z"] - ground(xy[keep, 0], xy[keep, 1])
        hung = low > 0.5
        if hung.mean() > 0.2:
            k = int(np.argmax(low))
            q = xy[keep][k]
            note("14 water above its banks", float(low[k]), at(q[0], q[1]), f"{hung.mean():.0%} of its edge, up to {low[k]:.1f} m over the bank")
    for l in m.get("wl") or []:
        if l.get("c") == "canal" or len(l["p"]) < 2: continue
        p = np.asarray([q[:3] for q in l["p"]], float)
        dz = p[:, 2] - ground(p[:, 0], p[:, 1])
        k = int(np.argmax(np.abs(dz)))
        if abs(dz[k]) > 1.5 and sq.contains(Point(p[k, :2])): note("14 stream off its ground", float(abs(dz[k])), at(p[k, 0], p[k, 1]), f"{l['c']} {dz[k]:+.1f} m")


def small_things(m, roads, rlines, rtree, solid, wtree, ground, note, at, off_deck, pts, hits, inner):
    fx = m.get("fx") or []
    groups = (("tree", [q[:3] for q in m.get("tr") or []], 0.6), ("shrub", [q[:3] for q in m.get("sb") or []], 0.6),
              ("street item", [q[1:4] for q in fx if q[0] != "car"], 0.4), ("parked car", [q[1:4] for q in fx if q[0] == "car"], 0.4))
    for kind, items, tol in groups:
        if not items: continue
        a = np.asarray(items, float)
        p = pts(a[:, :2])
        dz = a[:, 2] - ground(a[:, 0], a[:, 1])
        free = off_deck(p)
        for n in np.nonzero(free & (np.abs(dz) > tol))[0]:
            note(f"15 {kind} {'floating' if dz[n] > 0 else 'sunk'}", float(abs(dz[n])), at(a[n, 0], a[n, 1]), f"{dz[n]:+.1f} m")
    # on top of each other
    items = [q for q in fx if q[0] not in ("car", "wheelie")]
    if items:
        a = np.asarray([q[1:3] for q in items], float)
        t = shapely.STRtree(pts(a))
        l, r = t.query(pts(a), predicate="dwithin", distance=0.35)
        for i, j in zip(l, r):
            if i < j: note("15 street items on top of each other", 1, at(a[i, 0], a[i, 1]), f"{items[i][0]} and {items[j][0]}")
    cars = [q for q in fx if q[0] == "car"]
    if cars:
        boxes = []
        for q in cars:
            c, s = math.cos(q[4]), math.sin(q[4])
            hl, hw = 2.0, 0.85
            boxes.append(Polygon([(q[1] + c * u * hl - s * v * hw, q[2] + s * u * hl + c * v * hw) for u, v in ((1, 1), (-1, 1), (-1, -1), (1, -1))]))
        ct = shapely.STRtree(boxes)
        for i, b in enumerate(boxes):
            for j in ct.query(b):
                j = int(j)
                if j > i and b.intersection(boxes[j]).area > 0.8: note("15 parked cars in each other", b.intersection(boxes[j]).area, at(cars[i][1], cars[i][2]), "")
        p = pts([q[1:3] for q in cars])
        for n in np.nonzero(hits(solid, p))[0]: note("15 parked car inside a building", 1, at(cars[n][1], cars[n][2]), "")
        for n in np.nonzero(hits(wtree, p))[0]: note("15 parked car in the water", 1, at(cars[n][1], cars[n][2]), "")
    # on their street or path
    vlines = [(ln, r) for ln, r in zip(rlines, roads) if r["c"] in VEHICLE]
    blines = vlines + [(ln, r) for ln, r in zip(rlines, roads) if r.get("bu") and r["c"] not in VEHICLE]
    btree = shapely.STRtree([l for l, _ in blines])
    vtree = shapely.STRtree([l for l, _ in vlines])
    def street_gap(x, y, tree, lines):
        p = Point(x, y)
        near = tree.query(p.buffer(40))
        return min((lines[int(k)][0].distance(p) - (lines[int(k)][1].get("w") or RW.get(lines[int(k)][1]["c"], 4)) / 2 for k in near), default=40)
    for q in fx:
        if q[0] != "bus" or not inner.contains(Point(q[1], q[2])): continue
        g = street_gap(q[1], q[2], btree, blines)
        if g > 6: note("15 bus stop away from the road", g, at(q[1], q[2]), f"{q[5] if len(q) > 5 else ''!r} {g:.0f} m from the kerb")
    for q in m.get("cx") or []:
        if not inner.contains(Point(q[0], q[1])): continue
        g = street_gap(q[0], q[1], vtree, vlines)
        if g > 1: note("15 crossing off the road", g, at(q[0], q[1]), f"{q[4]} {g:.0f} m off the carriageway")
    alls = [(ln, r) for ln, r in zip(rlines, roads)]
    for q in m.get("pb") or []:
        if not inner.contains(Point(q[1], q[2])): continue
        p = Point(q[1], q[2])
        g = min((rlines[int(k)].distance(p) for k in rtree.query(p.buffer(10))), default=10)
        if g > 1.5: note("15 path gate off its path", g, at(q[1], q[2]), f"{q[0]} {g:.1f} m off")


KERBED = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified"}   # (a living street is paved flush)
FACE_KINDS = ("road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel")


def longest_run(lines):
    """The length of the longest unbroken stretch of `lines`."""
    parts = shapely.line_merge(shapely.union_all([g for g in getattr(lines, "geoms", [lines]) if g.geom_type in ("LineString", "MultiLineString")] or [LineString()]))
    return max((g.length for g in getattr(parts, "geoms", [parts])), default=0.0)


def faces_of(m):
    """The streets' faces (sf) as the game draws them: each kind's triangles, unioned."""
    sf = m.get("sf")
    if not sf or "o" not in sf: return {}
    v = np.cumsum(np.asarray(sf["v"], float).reshape(-1, 3), axis=0) / 100 + [sf["o"][0], sf["o"][1], 0]
    out = {}
    for k in FACE_KINDS:
        if not sf.get(k): continue
        tri = np.cumsum(np.asarray(sf[k], np.int64)).reshape(-1, 3)
        polys = shapely.polygons(np.stack([v[tri[:, 0], :2], v[tri[:, 1], :2], v[tri[:, 2], :2]], axis=1))
        out[k] = shapely.union_all(shapely.make_valid(polys[shapely.area(polys) > 1e-6]))
    return out


def levels_of(m):
    """Each street face kind's corner heights, by where the corner is."""
    sf = m.get("sf")
    v = np.cumsum(np.asarray(sf["v"], float).reshape(-1, 3), axis=0) / 100 + [sf["o"][0], sf["o"][1], 0]
    out = {}
    for k in ("path", "pave"):
        ids = np.unique(np.cumsum(np.asarray(sf.get(k) or [], np.int64)))
        out[k] = {(round(v[i, 0], 2), round(v[i, 1], 2)): v[i, 2] for i in ids}
    return out


def street_faces(m, roads, rlines, marked, note, at, sq):
    """Where a path or a pedestrian area meets a street, each keeps to its own ground: no paving or path
    lies over a kerbed street's carriageway (a sawtooth of paving into the road where a pedestrian
    area's edge runs along it), and no path's strip runs along a pavement beside it (it is that pavement)."""
    F = faces_of(m)
    if not F: return
    inner = sq.buffer(-3)
    soft = shapely.union_all([F[k] for k in ("pave", "path", "front", "drive", "grass", "dirt", "gravel") if k in F] or [Polygon()])
    for r, ln, mk in zip(roads, rlines, marked):
        if r["c"] not in KERBED or mk or ln.length < 6: continue
        core = substring(ln, 2, ln.length - 2)
        # (the middle of the road only: a record's width and its drawn carriageway differ by a little)
        band = core.buffer(1.0, cap_style="flat").intersection(inner)
        over = band.intersection(soft).area
        if over > 0.5:
            c = band.intersection(soft).representative_point()
            note("9 paving over a carriageway", over, at(c.x, c.y), f"{r['c']} {r['n']!r} {over:.1f} m2")
    if "pave" in F:
        # (two faces drawn over each other flicker in the game, and a pavement over the road hides it)
        cars = shapely.union_all([F[k] for k in ("road", "service") if k in F] or [Polygon()])
        both = F["pave"].intersection(cars).intersection(inner)
        for g in getattr(both, "geoms", [both]):
            if g.geom_type == "Polygon" and g.area > 0.5:
                c = g.representative_point()
                note("9 pavement over the road", g.area, at(c.x, c.y), f"{g.area:.1f} m2")
    slivers(F, roads, rlines, note, at, inner)
    if "path" in F and "pave" in F:
        edge = F["pave"].boundary
        # (a footway up a bank beside the street, a step off the pavement's level, is a path of its own)
        zs = levels_of(m)
        for g in getattr(F["path"], "geoms", [F["path"]]):
            if g.geom_type != "Polygon" or not inner.intersects(g): continue
            shared = g.exterior.intersection(edge.buffer(0.05))
            # (its longest stretch: a path leaving the pavement at a slant at both ends runs along it nowhere)
            along = longest_run(shared)
            steps = [abs(zs["path"][k] - zs["pave"][k]) for k in
                     ((round(x, 2), round(y, 2)) for x, y in shapely.get_coordinates(shared))
                     if k in zs["path"] and k in zs["pave"]]
            if steps and max(steps) > 0.4: continue
            if along > 6:
                c = g.representative_point()
                note("9 path strip along a pavement", along, at(c.x, c.y), f"{along:.0f} m")


SLIVER = 0.25    # metres: half the width a piece of road or paving must have, or it is a sliver
SPIKE = 50       # degrees: a sharper corner where road and paving meet is a point of one into the other


def slivers(F, roads, rlines, note, at, inner):
    """Where the carriageway and the paving meet, each piece of either is as wide as a kerb line makes
    it: no spike or sliver narrower than a metre poking into the other (a point of paving into the road
    at a junction, a bow tie's tip, a thin wedge of road between two pavements). A narrow pavement
    along its kerb is no sliver: one that runs along the other kind on most of its edge is."""
    cars = shapely.union_all([F[k] for k in ("road", "service") if k in F] or [Polygon()])
    walk = shapely.union_all([F[k] for k in ("pave", "drive", "front", "path") if k in F] or [Polygon()])
    if cars.is_empty or walk.is_empty: return
    rt = shapely.STRtree(rlines) if rlines else None
    for A, B, kind in ((cars, walk, "road"), (walk, cars, "paving")):
        near = A.intersection(B.buffer(1.0)).intersection(inner)
        if near.is_empty: continue
        thin = near.difference(A.buffer(-SLIVER).buffer(SLIVER + 0.01))
        edge = B.buffer(0.05)
        for g in getattr(thin, "geoms", [thin]):
            if g.geom_type != "Polygon" or g.area < 0.25 or not g.length: continue
            if g.exterior.intersection(edge).length < 0.6 * g.exterior.length: continue
            c = g.representative_point()
            name = ""
            if rt is not None:
                k = rt.nearest(c)
                name = roads[int(k)].get("n") or roads[int(k)]["c"]
            note("9 sliver or spike where road and paving meet", g.area, at(c.x, c.y), f"{kind} {name!r} {g.area:.1f} m2")
        # a point: a corner of one kind sharper than SPIKE whose two sides are both kerbs with the other
        # (a block's corner at a junction is square or rounded, and a pavement's end is cut square)
        for g in getattr(A, "geoms", [A]):
            if g.geom_type != "Polygon": continue
            for ring in [g.exterior, *g.interiors]:
                q = np.asarray(ring.simplify(0.1).coords)[:-1]
                if len(q) < 3: continue
                a, b = np.roll(q, 1, axis=0) - q, np.roll(q, -1, axis=0) - q
                la, lb = np.hypot(*a.T), np.hypot(*b.T)
                ang = np.degrees(np.arccos(np.clip((a * b).sum(1) / np.maximum(la * lb, 1e-9), -1, 1)))
                inside = (a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]) * (1 if ring.is_ccw else -1) < 0
                for i in np.nonzero((ang < SPIKE) & inside & (la > 0.5) & (lb > 0.5))[0]:
                    p = Point(q[i])
                    if not inner.contains(p): continue
                    sides = [LineString([q[i], q[i] + v / n * min(n, 1.0)]) for v, n in ((a[i], la[i]), (b[i], lb[i]))]
                    if not all(edge.contains(sd) for sd in sides): continue
                    name = roads[int(rt.nearest(p))].get("n") or "" if rt is not None else ""
                    note("9 sliver or spike where road and paving meet", 1, at(p.x, p.y), f"{kind} point {ang[i]:.0f} degrees {name!r}")


def gameplay(m, whole, blds, homes, htree, solid, roads, rlines, rtree, waters, wtree, note, at, sq, pts, hits):
    for x, y, name, _, ang in whole["pubs"]:
        p = Point(x, y)
        if not sq.contains(p): continue
        if ang is not None and len(solid.query(p, predicate="within")): note("17 pub door inside a building", 1, at(x, y), name)
        if len(wtree.query(p, predicate="within")): note("17 pub in the water", 1, at(x, y), name)
        g = min((rlines[int(k)].distance(p) for k in rtree.query(p.buffer(60))), default=60)
        if g > 40: note("17 pub far from a street", g, at(x, y), f"{name} {g:.0f} m")
        if whole["field"] and math.dist((x, y), whole["fc"]) > whole["field"]: note("17 pub outside the force field", math.dist((x, y), whole["fc"]) - whole["field"], at(x, y), name)
    vroads = [(ln, r) for ln, r in zip(rlines, roads) if r["c"] in VEHICLE and not any(len(q) > 3 and q[3] for q in r["p"])]
    vtree = shapely.STRtree([l for l, _ in vroads])
    for x0, y0, z0, x1, y1, z1, *_ in m.get("wr") or []:
        w = LineString([(x0, y0), (x1, y1)])
        L = w.length or 1
        sag = min(0.9, L * 0.018)
        zt = lambda t: z0 + (z1 - z0) * t - sag * 4 * t * (1 - t)
        for k in htree.query(w):
            x = homes[int(k)].buffer(-0.5).intersection(w)
            if x.is_empty or x.length < 0.5: continue
            if homes[int(k)].buffer(0.5).intersects(shapely.multipoints([(x0, y0), (x1, y1)])): continue   # (a drop to the house, ending in its wall)
            c = x.interpolate(0.5, normalized=True)
            if zt(w.project(c) / L) < blds[int(k)]["g"] + blds[int(k)]["h"] - 0.3:
                note("17 overhead wire through a building", x.length, at(c.x, c.y), f"{x.length:.0f} m of wire inside")
                break
        for k in vtree.query(w):
            ln, r = vroads[int(k)]
            x = ln.intersection(w)
            if x.is_empty or x.geom_type != "Point": continue
            s = ln.project(x)
            p = r["p"]
            cum = np.concatenate([[0], np.cumsum([math.dist(a[:2], b[:2]) for a, b in zip(p, p[1:])])])
            clear = zt(w.project(x) / L) - float(np.interp(s, cum, [q[2] for q in p]))
            if clear < 4.5: note("17 overhead wire low over a road", 4.5 - clear, at(x.x, x.y), f"{r['c']} {r['n']!r} {clear:.1f} m clear")


def boats(m, whole, roads, rlines, rtree, marked, waters, wtree, ground, note, at, sq):
    canal = whole["canal"]
    if not canal or not canal.get("moor"): return
    runs = [(LineString([q[:2] for q in r["p"]]), r) for r in canal["runs"] if len(r["p"]) > 1]
    hulls = []
    for x, y, a, L, *_ in canal["moor"]:
        c, s = math.cos(a), math.sin(a)
        hulls.append(Polygon([(x + c * u * L / 2 - s * v * 1.04, y + s * u * L / 2 + c * v * 1.04) for u, v in ((1, 1), (-1, 1), (-1, -1), (1, -1))]))
    for i, ((x, y, a, L, *_), hull) in enumerate(zip(canal["moor"], hulls)):
        if not sq.contains(Point(x, y)): continue
        worst = 0.0
        for px, py in list(hull.exterior.coords)[:4]:
            p = Point(px, py)
            if any(waters[int(w)].buffer(0.3).contains(p) for w in wtree.query(p)): continue   # (a basin or marina's water)
            ln, r = min(runs, key=lambda lr: lr[0].distance(p))
            k = min(range(len(r["p"])), key=lambda k: math.dist(r["p"][k][:2], (px, py)))
            if float(ground(px, py)) < r["lv"] + 0.3: continue    # (over water lower than the canal: the river or a basin beside it)
            worst = max(worst, ln.distance(p) - r["p"][k][2])
        if worst > 0.3: note("18 moored boat on the bank", worst, at(x, y), f"{L:.0f} m boat, {worst:.1f} m out of the water")
        for j, other in enumerate(hulls):
            if j > i and hull.intersection(other).area > 1: note("18 moored boats in each other", hull.intersection(other).area, at(x, y), "")
        for lk in canal.get("locks") or []:
            if LineString([lk["lo"], lk["hi"]]).buffer(3).intersects(hull): note("18 moored boat in a lock", 1, at(x, y), lk.get("n", ""))
        for k in rtree.query(hull):
            if marked[int(k)] and rlines[int(k)].intersects(hull):
                note("18 moored boat under a bridge", 1, at(x, y), f"{roads[int(k)]['c']} {roads[int(k)]['n']!r}"); break
