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
21. Nothing stands in a train's way (tools/trackclear.ts runs the game's own web/src/railway.ts and
    walks every line out in the open, and into each tunnel mouth, through the space a train fills):
    no face of the railway itself (a tunnel face without an opening big enough, a parapet, pier or
    platform wall across a track) and none of the squares' buildings, walls, fences, hedges, gates,
    trees or street furniture across it; and no line just stops out in the open with nothing at its end.
22. Roofs are solid (tools/roof_probe.mjs runs the game's own map.ts and player.ts on a sample of
    each square's buildings, CD_ROOFS_PER of them, 40 unless set): a player dropped on any point of
    a roof as world.ts draws it, slowly or falling fast on a slow frame, stands on it at the drawn
    height; no part of an outline is left with no roof over it; and walking across a roof never
    takes you down into it. CD_ROOFS=0 leaves it out.
23. Paths are whole, as the game draws them (tools/overroad.mjs, in the same look as rule 20, along
    every path on the ground, half a metre apart along it and a quarter across): the first face seen
    over a path is the path, or the paving or street it crosses, not the ground's own grass come up
    through it ("ground drawn over a path") nor bare ground with no path under it at all, where a path
    is broken into pieces or two ways meet with a gap between them ("path not drawn"); and no two
    pieces of a path lying side by side on the ground differ in height by more than 0.05 m where they
    meet (a rise within 2 cm, not a path across a steep bank). Each place's score is its area in m2, or a step's height. Rule 9 counts paths
    clashing with walls and buildings, and 13 a way inside a building (so a path
    under a roof is left to them); this counts the path itself coming apart.

24-36 measure how far the ground is from one sheet (docs/plans/ground-architecture.md, section 6.1),
from the packs alone, a few seconds a square:
24. Paths, front paths and drives lie level across (the ground they're drawn on tilts no more than
    2 degrees across the way's line).
25. No tree, shrub or boulder stands in a path, drive or pavement.
26. No face's edge stands more than 0.3 m off what is beside it (a wedge down a bank, a pavement
    over a path).
27. Faces meet: no strip of bare ground between a path and a street, no lump of ground between faces
    of two kinds, no pavement that just stops with nothing across its end.
28. A bridge's deck lands on the street at each end, not in the air or off the street's height.
29. No parapet gap where three or more pieces of a bridge meet on its deck.
30. No ground stands up through a deck.
31. Room under a bridge: the ground half a metre under its underside, and headroom for a way or the
    canal's towpath under the game's ceiling there.
32. Tunnels as the game builds them (tools/tunnel_mesh.ts runs web/src/tunnels.ts): tubes meet where
    pieces meet and go on over a square's edge; walls and floor are solid where they're drawn.
33. Flights of steps land on something to walk on, and their treads are neither buried (unless a
    retaining wall holds the bank), nor standing as blocks, nor out of reach of where you walk.
34. A lock's edges: no canal water over its paving, no gap between its water and its gates, no works
    bank over its paving.
35. No land standing in a pond or river, no canal works in a river, no two touching waters at two levels.
36. No wall, fence or hedge on water, the canal's banks, verges or a lock's paving, or along a path.
37. A building OpenStreetMap or Wikidata says was built as a church, or whose name says so, is drawn as one (the same test as
    the build's, tools/worship.py, read from data/<map>/ beside the packs).
38. The ground is closed, as the game draws it (tools/ground_seams.mjs builds each square's ground,
    faces, kerbs and retaining walls with the game's own world.ts): every edge of the ground or of a
    face's top meets another triangle, edge to edge or along a run of edges on its line, or has more
    ground or a face just across it; the rest are cracks the sky shows through, each scored by its
    length in metres. Edges along a square's own sides are left to rule 14. CD_SEAMS=0 leaves it out.
39-46 are faults found by playing, from the packs alone (played below):
39. Road markings lie on the carriageway, square across it, on the street that gives way and behind
    the other street's kerb line.
40. A lane's or yard's carriageway (the service face, a lighter grey) stops at the kerbed street it
    meets, not reaching into it as a wedge, a point or a row of thin triangles.
41. No step in the carriageway: no road or lane triangle climbs steeper than 1 in 2.
42. The faces meet the next square's: the same kind at the same height either side of a square's side.
43. Flights of steps don't lie over each other, and no handrail stands on a pavement or the road.
44. No wall, fence or hedge stands with its foot over what is drawn under it, the sky showing
    through beneath it (tools/ground_seams.mjs, with rule 38; CD_SEAMS=0 leaves it out).
45. No street face of the map's is left inside a set piece's outline, as the game leaves them (the set
    piece takes out those it lays its own ground over; tools/ground_seams.mjs, with rule 38).
46. A set piece's floor at the street's level runs on to what stands beyond its edge, with no gap to
    drop into between it and a wall or another floor (tools/ground_seams.mjs, with rule 38).
`python3 -I tools/check_more.py <map> [--tiles ti,tj ...]` runs 24 on alone, with each square's figures.

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
           'console.log(JSON.stringify(SET_PIECES.map((s: any) => [s.at, s.bearing, [s.outline, ...(s.more ?? [])], s.street ?? null])));')
    try:
        js = subprocess.run([os.path.join(web, "node_modules", ".bin", "esbuild"), "--bundle", "--platform=node", "--format=esm",
                             "--loader=ts", "--log-level=error", "--banner:js=globalThis.location={search:''};globalThis.window=globalThis;"],
                            input=src, capture_output=True, text=True, check=True).stdout
        pieces = json.loads(subprocess.run(["node", "--input-type=module"], input=js, capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []
    lon0, lat0 = centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    out, streets = [], []
    for (lon, lat), bearing, rings, street in pieces:
        ox, oy = (lon - lon0) * kx, (lat - lat0) * ky
        a = math.radians(90 - bearing)
        ux, uy = math.cos(a), math.sin(a)
        at = lambda lx, lz: (ox + ux * lx + uy * lz, oy + uy * lx - ux * lz)
        for r in rings:
            if len(r) >= 3: out.append(_poly([at(lx, lz) for lx, lz in r]))
        # (the street it lays end to end, whose faces the game cuts out of the square's: setpieces.ts cutFaces)
        if street:
            x0, x1, z = street["x0"], street["x1"], street["zMax"]
            streets.append(_poly([at(x0, -z), at(x1, -z), at(x1, z), at(x0, z)]))
    _SET_PIECE_STREETS[centre] = streets
    return out


_SET_PIECE_STREETS = {}


def set_piece_streets(centre):
    """The streets set pieces lay themselves (landmarks/setpieces.ts `street`), in data metres: the
    game cuts the map's own faces out of them and draws the street as laid."""
    _set_pieces(centre)
    return _SET_PIECE_STREETS.get(centre, [])


@functools.lru_cache(maxsize=2)
def watertight(root, map_id):
    """Rule 19's findings over the whole map, from tools/watertight.ts bundled with the game's code;
    none if that can't be run. Called once before the squares are checked, so it runs only once."""
    return _railway_check("watertight.ts", root, map_id)


def trackclear(root, map_id):
    """Rule 21's findings over the whole map, from tools/trackclear.ts, as watertight's."""
    return _railway_check("trackclear.ts", root, map_id)


@functools.lru_cache(maxsize=4)
def _railway_check(script, root, map_id, canvas="({})"):
    here = os.path.dirname(os.path.abspath(__file__))
    web = os.path.join(os.path.dirname(here), "web")
    try:
        js = subprocess.run([os.path.join(web, "node_modules", ".bin", "esbuild"), "--bundle", "--platform=node", "--format=esm",
                             "--loader=ts", "--log-level=error",
                             "--banner:js=globalThis.location={search:''};globalThis.window=globalThis;"
                             "globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>" + canvas + "})})};"],
                            input=open(os.path.join(here, script)).read(), cwd=web, capture_output=True, text=True, check=True).stdout
        with tempfile.NamedTemporaryFile("w", suffix=".mjs") as f:
            f.write(js); f.flush()
            return json.loads(subprocess.run(["node", f.name, os.path.abspath(root), map_id], capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []


@functools.lru_cache(maxsize=2)
def roofs_solid(root, map_id, only=None):
    """Rule 22's findings over the squares given (all if None), from tools/roof_probe.mjs; none if
    it can't be run. Called once before the squares are checked."""
    if os.environ.get("CD_ROOFS") == "0": return []
    here = os.path.dirname(os.path.abspath(__file__))
    args = ["node", os.path.join(here, "roof_probe.mjs"), "--map", map_id, "--maps", os.path.abspath(root), "--json",
            "--per", os.environ.get("CD_ROOFS_PER", "40")]
    if only: args += ["--squares", " ".join(t.replace("_", ",") for t in only)]
    try:
        return json.loads(subprocess.run(args, capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []


@functools.lru_cache(maxsize=2)
def ground_seams(root, map_id, only=None):
    """Rule 38's cracks over the squares given (all if None), from tools/ground_seams.mjs building each
    square's ground and faces as the game does; none if it can't be run. CD_SEAMS=0 leaves it out."""
    if os.environ.get("CD_SEAMS") == "0": return []
    here = os.path.dirname(os.path.abspath(__file__))
    args = ["node", os.path.join(here, "ground_seams.mjs"), "--map", map_id, "--maps", os.path.abspath(root), "--rules"]
    if only: args += ["--squares", " ".join(t.replace("_", ",") for t in only)]
    if GROUND != "cdt": args += ["--query", f"ground={GROUND}"]
    try:
        return json.loads(subprocess.run(args, capture_output=True, text=True, check=True).stdout)
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
    if GROUND != "cdt": args += ["--query", f"ground={GROUND}"]
    try:
        # (the game loads the squares' packs, not their JSON: packs left from an earlier build of the
        # map would be looked at in place of the map being checked)
        subprocess.run(["node", os.path.join(here, "pack_squares.mjs"), "--maps", os.path.abspath(root), "--map", map_id],
                       capture_output=True, text=True, check=True)
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
    gone = [LineString(b["r"][0] + b["r"][0][:1]) for b in m.get("bl") or [] if hide(*mid(b["r"][0]))]
    m["bl"] = [b for b in m.get("bl") or [] if not hide(*mid(b["r"][0]))]
    m["wp"] = [w for w in m.get("wp") or [] if w.get("c") == "canal" or not all(hide(q[0], q[1]) for q in w["r"][0])]
    # (a hidden building's door, bay window and sign go with it: setpieces.ts GONE_REACH)
    kept = [LineString(b["r"][0] + b["r"][0][:1]) for b in m["bl"]]
    def on_gone(x, y):
        g = min((r.distance(Point(x, y)) for r in gone), default=9)
        return g < 0.6 and not any(r.distance(Point(x, y)) < g for r in kept)
    for k in ("tr", "sb", "rk", "dr", "by", "sh"):
        if m.get(k): m[k] = [q for q in m[k] if not hide(+q[0], +q[1]) and not (k in ("dr", "by", "sh") and on_gone(+q[0], +q[1]))]
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
    for w in watertight(root, map_id) + trackclear(root, map_id):
        if sq.contains(Point(w["x"], w["y"])): note(w["rule"], w["score"], at(w["x"], w["y"]), w["what"])
    for w in overroad(root, map_id, OVERROAD_ONLY[0]) + roofs_solid(root, map_id, OVERROAD_ONLY[0]) + ground_seams(root, map_id, OVERROAD_ONLY[0]):
        if sq.contains(Point(w["x"], w["y"])): note(w["rule"], w["score"], at(w["x"], w["y"]), w["what"])
    street_faces(m, roads, rlines, marked, note, at, sq)
    boats(m, whole, roads, rlines, rtree, marked, waters, wtree, ground, note, at, sq)
    ground_measures(m, tag, note, f)


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
              ("boulder", [q[:3] for q in m.get("rk") or []], 0.6),
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
    # (a crossing or a set of lights is on any carriageway: a busway, a motorway's slip road)
    clines = [(ln, r) for ln, r in zip(rlines, roads) if r["c"] not in PATHS]
    ctree = shapely.STRtree([l for l, _ in clines])
    for q in m.get("cx") or []:
        if not inner.contains(Point(q[0], q[1])): continue
        g = street_gap(q[0], q[1], ctree, clines)
        if g > 1: note("15 crossing off the road", g, at(q[0], q[1]), f"{q[4]} {g:.0f} m off the carriageway")
    alls = [(ln, r) for ln, r in zip(rlines, roads)]
    for q in m.get("pb") or []:
        if not inner.contains(Point(q[1], q[2])): continue
        p = Point(q[1], q[2])
        g = min((rlines[int(k)].distance(p) for k in rtree.query(p.buffer(10))), default=10)
        if g > 1.5: note("15 path gate off its path", g, at(q[1], q[2]), f"{q[0]} {g:.1f} m off")


KERBED = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified"}   # (a living street is paved flush)
# (the railway's bed is a face only to the sheet: the game leaves it out without it)
FACE_KINDS = ("road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel") + (("bed",) if (os.environ.get("CD_GROUND") or "cdt") in ("sheet", "cdt") else ())


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
    cracks(m, F, roads, rlines, note, at, inner)
    if "path" in F and "pave" in F:
        edge = F["pave"].boundary
        # (a footway up a bank beside the street, a step off the pavement's level, is a path of its own)
        zs = levels_of(m)
        # (and a flight of steps across paving is drawn on its own strip, never on the pavement: as
        # furniture.ts stepsDetail, one a metre long with a tread count, handrails or a rise over 0.3 m)
        ground = terrain(m["t"])
        def drawn(r):
            p = r["p"]
            if r["c"] != "steps" or len(p) < 2 or any(len(q) > 3 for q in p) or LineString([q[:2] for q in p]).length < 1:
                return False
            return bool(r.get("sc") or r.get("hr")) or abs(ground(*p[-1][:2]) - ground(*p[0][:2])) > 0.3
        flights = shapely.union_all([LineString([q[:2] for q in r["p"]]).buffer(r.get("w", 1.8) / 2 + 1.0, cap_style="flat")
                                     for r in roads if drawn(r)] or [Polygon()])
        for g in getattr(F["path"], "geoms", [F["path"]]):
            if g.geom_type != "Polygon" or not inner.intersects(g): continue
            if g.intersection(flights).area > 0.5 * g.area: continue
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


CRACK = 0.4     # metres: a gap narrower than this between two faces is a crack, not a place left open


def cracks(m, F, roads, rlines, note, at, inner):
    """Where two street faces meet, they meet: no crack of bare ground between a road, its paving, a
    drive or a path, narrower than CRACK and closed in by faces all round. One along a wall, fence
    or hedge, or a building's wall, is where the faces stop for it."""
    allf = shapely.union_all(list(F.values()))
    holes = [Polygon(h) for g in getattr(allf, "geoms", [allf]) if g.geom_type == "Polygon" for h in g.interiors]
    holes = [h for h in holes if h.area >= 0.05 and inner.contains(h) and h.buffer(-CRACK / 2).is_empty]
    if not holes: return
    stops = [LineString([q[:2] for q in b["p"]]) for b in m.get("br") or [] if len(b["p"]) > 1]
    stops += [LineString(b["r"][0] + b["r"][0][:1]) for b in m.get("bl") or [] if len(b["r"][0]) >= 3]
    near = shapely.union_all([g.buffer(0.5) for g in stops] or [Polygon()])
    rt = shapely.STRtree(rlines) if rlines else None
    for h in holes:
        if h.intersection(near).area > 0.5 * h.area: continue
        c = h.representative_point()
        name = (roads[int(rt.nearest(c))].get("n") or "") if rt is not None else ""
        note("9 crack between street faces", h.area, at(c.x, c.y), f"{name!r} {h.area:.2f} m2, {h.length / 2:.1f} m long")


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


# ---- 24 on: the ground's measures (docs/plans/ground-architecture.md, section 6.1) ----------------
# Each reads the square's pack only and says how far today's ground is from one sheet. Where the game
# changes the ground as a square loads (world.ts lets the grid down under street faces and brings the
# grass up to meet them), drawn_terrain below follows it closely enough for these; the far pass that
# lowers a grid corner only as far as a pavement face needs (world.ts clearOf) is left out, so a
# few lumps beside pavements may read a little high.

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from partition.check_tile import interior_length    # (a line against a polygon is measured on its interior)
from shapely.prepared import prep
import importlib.util
_spec = importlib.util.spec_from_file_location("ground_sheet", os.path.join(os.path.dirname(os.path.abspath(__file__)), "partition", "sheet.py"))
gsheet = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(gsheet)
# The ground is measured as the game draws it: a square that has the baked sheet (gs) is drawn from it,
# its open ground triangulated round the faces' edges as the game's own code does it
# (tools/sheet_cdt.mjs), heights found as for the sheet's cut cells. CD_GROUND=sheet measures it cut
# cell by cell instead (?ground=sheet), and CD_GROUND=old the grid let down under the faces (?ground=old).
GROUND = os.environ.get("CD_GROUND") or "cdt"
GROUND_SHEET = GROUND in ("sheet", "cdt")
GROUND_CDT = GROUND == "cdt"


def cdt_land(m, f, sink):
    """The sheet's land for square file f with ?ground=cdt's triangles in place of the cut cells'."""
    here = os.path.dirname(os.path.abspath(__file__))
    tag = os.path.basename(f)[:-5]
    out = subprocess.run(["node", os.path.join(here, "sheet_cdt.mjs"), "--maps", os.path.abspath(os.path.dirname(os.path.dirname(f))),
                          "--map", os.path.basename(os.path.dirname(f)), "--squares", tag.replace("_", ",")], capture_output=True, text=True, check=True).stdout
    got = json.loads(out).get(tag)
    land = gsheet.Land(m, sink=sink)
    if not got: return land
    T = m["t"]
    land.tris = np.asarray(got["tris"], float).reshape(-1, 3, 2)
    land.tz = land._heights(land.tris.reshape(-1, 2)).reshape(-1, 3) if len(land.tris) else np.zeros((0, 3))
    land.tri_tree = shapely.STRtree(shapely.polygons(land.tris)) if len(land.tris) else None
    mixed = np.zeros((T["ny"] - 1) * (T["nx"] - 1), bool)
    mixed[np.asarray(got["cells"], np.int64)] = True
    land.mixed = mixed.reshape(T["ny"] - 1, T["nx"] - 1)
    return land

FACE_LIFT = {"road": 0.07, "service": 0.07, "pave": 0.17, "path": 0.04, "front": 0.04, "drive": 0.04, "grass": 0.04, "dirt": 0.04, "gravel": 0.04, "bed": 0.0}
ON_GROUND = ("path", "front", "drive", "grass", "dirt", "gravel")    # drawn on the ground as it's drawn, not at their written height
TILT = 2.0           # degrees across a path before it counts as tilted
TALL_EDGE = 0.3      # metres a face's edge may stand over what is beside it
KERB_RAISE = 0.25    # world.ts: the most the grass beside a face is brought up to meet it
GAP = 0.02           # metres between a path and a street before it is a gap
LUMP = 0.05          # metres the grass may be raised under a path beside a street face
DECK_END = 0.1       # metres between a deck's end and the street it lands on
DECK_CLEAR = 0.5     # metres under a deck with nothing passing
HEAD = 1.9           # metres a walker needs under a ceiling (player.ts EYE 1.65, and the head over it)
KINDS = {"arch": 0.9, "beam": 1.1, "truss": 0.9, "foot": 0.45, "suspension": 0.45}   # world.ts: each kind's deck depth
FOOT = {"footway", "path", "cycleway", "steps", "bridleway"}
GAME_KERBED = KERBED | {"living_street"}
WALL_BESIDE = 0.4     # metres from a retaining wall that a tread's side counts as held by it
LANDING = (0.1, 0.05)   # metres off a walkable face, and up or down from it, that a flight's end may land
STAIR_PITCH = 0.7       # furniture.ts: the steepest a flight's treads climb
TREAD_DEPTH = 0.15      # furniture.ts: how far a tread's block goes on down under its step
LOCK_HALF, COPE, APRON, TAIL = 2.15, 1.2, 4.5, 2.2   # canal.ts
LEVELS_AGREE = 0.03     # metres two touching waters may differ
FENCE_IN = 0.3          # metres of a wall, fence or hedge inside water or a way before it counts


def _road_half(c, w=None):
    return w / 2 if w else {"trunk": 9, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
                            "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 6, "footway": 1.6, "steps": 1.8,
                            "cycleway": 2, "path": 1.4, "track": 2.8, "bridleway": 2}.get(c, 4) / 2


def _deck_sides(r):
    """map.ts deckSides: how far a bridge's deck reaches left and right of its line."""
    dk = r.get("dk")
    if isinstance(dk, list): return (dk[0], dk[1]) if len(dk) == 2 else (max(dk), max(dk))
    if dk: return dk, dk
    kerbed = r["c"] in GAME_KERBED
    pave = max([0, *(r.get("pv") or [1.7, 1.7])]) if kerbed else (0 if r.get("w") else 0.3)
    h = max(_road_half(r["c"]) + (1.7 if kerbed else 0.3), _road_half(r["c"], r.get("w")) + pave)
    return h, h


class Sheet:
    """A square's street faces as drawn: corners, triangles, each triangle's kind, and the outlines."""
    def __init__(self, m):
        sf = m.get("sf") or {}
        self.ok = bool(sf.get("o"))
        if not self.ok: return
        cm = np.cumsum(np.asarray(sf["v"], np.int64).reshape(-1, 3), axis=0)
        self.cm = cm
        self.V = cm / 100 + [sf["o"][0], sf["o"][1], 0]
        self.level = bool(sf.get("pl"))     # (paths written level, to be drawn at their written height)
        tris, kinds = [], []
        for n, k in enumerate(FACE_KINDS):
            if not sf.get(k): continue
            t = np.cumsum(np.asarray(sf[k], np.int64)).reshape(-1, 3)
            tris.append(t); kinds.append(np.full(len(t), n))
        self.T = np.concatenate(tris) if tris else np.zeros((0, 3), np.int64)
        self.K = np.concatenate(kinds) if kinds else np.zeros(0, int)
        A, B, C = self.V[self.T[:, 0]], self.V[self.T[:, 1]], self.V[self.T[:, 2]]
        self.A, self.B, self.C = A, B, C
        self.polys = shapely.polygons(np.stack([A[:, :2], B[:, :2], C[:, :2]], axis=1))
        self.tree = shapely.STRtree(self.polys)
        self.edges = [(e["c"] if e["c"] in FACE_LIFT else "road", np.cumsum(np.asarray(e["i"], np.int64))) for e in sf.get("e") or []]
        self.left = bool(sf.get("l"))

    def kind_mask(self, kinds):
        return np.isin(self.K, [FACE_KINDS.index(k) for k in kinds])

    def union(self, kinds):
        sel = self.kind_mask(kinds)
        p = self.polys[sel]
        p = p[shapely.area(p) > 1e-6]
        return shapely.union_all(shapely.make_valid(p)) if len(p) else Polygon()

    def hit(self, x, y, kinds=None):
        """For each point, the triangle under it (-1 for none) and the plane's height there."""
        x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
        out, z = np.full(len(x), -1), np.full(len(x), np.nan)
        pi, ti = self.tree.query(shapely.points(np.stack([x, y], axis=1)), predicate="intersects")
        if kinds is not None:
            keep = self.kind_mask(kinds)[ti]
            pi, ti = pi[keep], ti[keep]
        a, b, c = self.A[ti], self.B[ti], self.C[ti]
        d = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        d = np.where(np.abs(d) < 1e-9, 1e-9, d)
        l1 = ((b[:, 1] - c[:, 1]) * (x[pi] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y[pi] - c[:, 1])) / d
        l2 = ((c[:, 1] - a[:, 1]) * (x[pi] - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y[pi] - c[:, 1])) / d
        out[pi] = ti
        z[pi] = l1 * a[:, 2] + l2 * b[:, 2] + (1 - l1 - l2) * c[:, 2]
        return out, z

    def z_on(self, t, x, y):
        """The height of triangle t's plane over each (x, y)."""
        a, b, c = self.A[t], self.B[t], self.C[t]
        d = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        d = np.where(np.abs(d) < 1e-9, 1e-9, d)
        l1 = ((b[:, 1] - c[:, 1]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y - c[:, 1])) / d
        l2 = ((c[:, 1] - a[:, 1]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y - c[:, 1])) / d
        return l1 * a[:, 2] + l2 * b[:, 2] + (1 - l1 - l2) * c[:, 2]

    def top(self, x, y, drawn):
        """The height the game draws at each point: a street face's written height and lift, a path's
        drawn ground and lift, else the drawn ground; and the kind there (None off the faces)."""
        ti, z = self.hit(x, y)
        g = drawn(x, y)
        out = np.asarray(g, float).copy()
        kinds = np.full(len(out), None, object)
        on = ti >= 0
        for n, k in enumerate(FACE_KINDS):
            s = on & (self.K[np.maximum(ti, 0)] == n)
            if not s.any(): continue
            kinds[s] = k
            out[s] = (g[s] if k in ON_GROUND and not self.level else z[s]) + FACE_LIFT[k]
        return out, kinds


def drawn_terrain(m, sheet, faces=True):
    """The ground as world.ts draws it under and beside the street faces: let down under a carriageway
    (0.3 m, less at its edge) and a pavement (0.08 m), brought to just under a face's edge within
    three quarters of a cell of it (up by KERB_RAISE at most), and let down under a bridge that isn't
    a path's. Returns the grid and the ground over it, as terrain() does. With the sheet (faces False),
    only the bridges' letting down, over the sheet's carved grid."""
    T = m["t"]; nx, ny = T["nx"], T["ny"]
    H = gsheet.read(m["gs"], T)[1] if not faces else np.array(T["h"], dtype=float).reshape(ny, nx) / 10 + T["z0"]
    under, round_, path_to = np.full(H.shape, np.inf), np.full(H.shape, np.inf), np.full(H.shape, np.inf)
    cov = np.zeros(H.shape, bool)
    X, Y = np.meshgrid(T["x0"] + np.arange(nx) * T["dx"], T["y0"] + np.arange(ny) * T["dy"])
    ground = terrain(T)
    for r in m.get("rd") or []:
        p = r["p"]
        if r["c"] in PATHS or len(p) < 2 or not any(len(q) > 3 and q[3] in (1, 2) for q in p): continue
        reach = _road_half(r["c"], r.get("w")) + 0.5
        ln = LineString([q[:2] for q in p])
        x0, y0, x1, y1 = ln.bounds
        sel = (X > x0 - reach) & (X < x1 + reach) & (Y > y0 - reach) & (Y < y1 + reach)
        if not sel.any(): continue
        pts = shapely.points(X[sel], Y[sel])
        d = shapely.distance(pts, ln)
        near = d < reach
        if not near.any(): continue
        foot = shapely.line_interpolate_point(ln, shapely.line_locate_point(ln, pts[near]))
        hc = ground(shapely.get_x(foot), shapely.get_y(foot)) - 0.3
        idx = np.argwhere(sel)[near]
        under[idx[:, 0], idx[:, 1]] = np.minimum(under[idx[:, 0], idx[:, 1]], hc)
    if sheet.ok and faces:
        # (paths written level across carve the ground to just under them as well, world.ts PATH_UNDER)
        streets = sheet.kind_mask(FACE_KINDS if sheet.level else ("road", "service", "pave"))
        if streets.any():
            ids = np.nonzero(streets)[0]
            tree = shapely.STRtree(sheet.polys[ids])
            pts = shapely.points(X.ravel(), Y.ravel())
            pi, ti = tree.query(pts, predicate="within")
            t = ids[ti]
            zz = sheet.z_on(t, X.ravel()[pi], Y.ravel()[pi])
            pave = sheet.K[t] == FACE_KINDS.index("pave")
            path = sheet.K[t] > FACE_KINDS.index("pave")
            covered = np.zeros(H.size, bool)
            covered[pi[~path]] = True
            u, ro, pr = under.ravel(), round_.ravel(), path_to.ravel()
            np.minimum.at(ro, pi[pave], zz[pave] - 0.08)
            np.minimum.at(ro, pi[path], zz[path] - 0.02)
            np.minimum.at(pr, pi[path], zz[path] - 0.02)
            np.minimum.at(u, pi[~pave & ~path], zz[~pave & ~path] - 0.3)
            reach = T["dx"] * 0.75
            free = np.nonzero(~covered)[0]
            qi, qt = tree.query_nearest(pts[free], max_distance=reach, all_matches=False)
            if len(qi):
                tri = sheet.polys[ids[qt]]
                at = shapely.shortest_line(pts[free[qi]], shapely.boundary(tri))
                ex, ey = shapely.get_coordinates(shapely.get_point(at, 1)).T
                ez = sheet.z_on(ids[qt], ex, ey)
                bump = np.where(sheet.K[ids[qt]] == FACE_KINDS.index("pave"), 0.14, np.where(sheet.K[ids[qt]] > FACE_KINDS.index("pave"), 0.02, 0.04))
                np.minimum.at(ro, free[qi], ez + bump)
                by_path = sheet.K[ids[qt]] > FACE_KINDS.index("pave")
                np.minimum.at(pr, free[qi][by_path], (ez + bump)[by_path])
            cov = covered.reshape(H.shape)
            edge = cov & ~(np.pad(cov, 1, constant_values=True)[1:-1, :-2] & np.pad(cov, 1, constant_values=True)[1:-1, 2:]
                           & np.pad(cov, 1, constant_values=True)[:-2, 1:-1] & np.pad(cov, 1, constant_values=True)[2:, 1:-1])
            under = u.reshape(H.shape); round_ = ro.reshape(H.shape); path_to = pr.reshape(H.shape)
            under[edge & np.isfinite(under)] += 0.2
    # (world.ts: a flight is sunk into the hill, the ground beside it cut to the straight climb between its
    # ends, where no path or street face decides it)
    for r in (m.get("rd") or []) if sheet.ok and sheet.level and faces else []:
        p = r["p"]
        if r["c"] != "steps" or len(p) < 2 or any(len(q) > 3 and q[3] for q in p): continue
        ln = LineString([q[:2] for q in p])
        if ln.length < 1: continue
        reach = _road_half(r["c"], r.get("w")) + T["dx"] * 0.75
        x0, y0, x1, y1 = ln.bounds
        sel = (X > x0 - reach) & (X < x1 + reach) & (Y > y0 - reach) & (Y < y1 + reach)
        if not sel.any(): continue
        pts = shapely.points(X[sel], Y[sel])
        near = shapely.distance(pts, ln) < reach
        if not near.any(): continue
        g0, g1 = float(ground(np.array([p[0][0]]), np.array([p[0][1]]))[0]), float(ground(np.array([p[-1][0]]), np.array([p[-1][1]]))[0])
        s_ = shapely.line_locate_point(ln, pts[near])
        idx = np.argwhere(sel)[near]
        free_ = ~np.isfinite(path_to[idx[:, 0], idx[:, 1]]) & ~cov[idx[:, 0], idx[:, 1]]
        idx, s_ = idx[free_], s_[free_]
        round_[idx[:, 0], idx[:, 1]] = np.minimum(round_[idx[:, 0], idx[:, 1]], g0 + (g1 - g0) * s_ / ln.length - 0.02)
    to = np.where(np.isfinite(under), under, round_)
    # (world.ts PATH_FILL: beside a level path the ground is filled up to its edge where the path decides it)
    # (never under or beside a bridge's deck)
    no_fill = np.zeros(H.shape, bool)
    for r in (m.get("rd") or []) if sheet.ok and sheet.level else []:
        flags = _flags(r)
        for a0, b0 in _spans(flags):
            run = [q[:2] for q in r["p"][a0:b0 + 1]]
            if len(run) < 2: continue
            ln = LineString(run)
            reach = _road_half(r["c"], r.get("w")) + T["dx"] * 0.75
            x0, y0, x1, y1 = ln.bounds
            sel = (X > x0 - reach) & (X < x1 + reach) & (Y > y0 - reach) & (Y < y1 + reach)
            if not sel.any(): continue
            hit = shapely.distance(shapely.points(X[sel], Y[sel]), ln) < reach
            idx = np.argwhere(sel)[hit]
            no_fill[idx[:, 0], idx[:, 1]] = True
    raise_ = np.zeros(H.shape) if not faces else np.where(np.isfinite(under), 0.0, np.where(np.isfinite(path_to) & (round_ == path_to) & ~no_fill, 1.5, KERB_RAISE))
    sink = np.where(np.isfinite(to), np.maximum(-raise_, H - to), 0.0)
    D = H - sink
    T2 = dict(T, h=((D - T["z0"]) * 10).ravel().tolist())
    return D, terrain(T2)


def _gradient(T):
    """The slope of the game's ground triangle under each point, east and north."""
    nx, ny = T["nx"], T["ny"]
    H = np.array(T["h"], dtype=float).reshape(ny, nx) / 10

    def grad(x, y):
        fi, fj = (x - T["x0"]) / T["dx"], (y - T["y0"]) / T["dy"]
        i, j = np.clip(np.floor(fi).astype(int), 0, nx - 2), np.clip(np.floor(fj).astype(int), 0, ny - 2)
        u, v = fi - i, fj - j
        a, b, c, d = H[j, i], H[j, i + 1], H[j + 1, i], H[j + 1, i + 1]
        low = u + v <= 1
        return np.where(low, b - a, d - c) / T["dx"], np.where(low, c - a, d - b) / T["dy"]
    return grad


def _tri_samples(A, B, C, step=0.7):
    """Points spread evenly over each triangle, each with the area it stands for and its triangle."""
    area = 0.5 * np.abs((B[:, 0] - A[:, 0]) * (C[:, 1] - A[:, 1]) - (C[:, 0] - A[:, 0]) * (B[:, 1] - A[:, 1]))
    n = np.clip(np.ceil(np.sqrt(2 * area) / step), 1, 40).astype(int)
    xs, ws, ids = [], [], []
    for k in np.unique(n):
        sel = np.nonzero(n == k)[0]
        bc = [((i + 1 / 3) / k, (j + 1 / 3) / k) for i in range(k) for j in range(k - i)]
        bc += [((i + 2 / 3) / k, (j + 2 / 3) / k) for i in range(k) for j in range(k - i - 1)]
        bc = np.asarray(bc)
        P = A[sel, None, :2] + bc[None, :, :1] * (B - A)[sel, None, :2] + bc[None, :, 1:] * (C - A)[sel, None, :2]
        xs.append(P.reshape(-1, 2)); ws.append(np.repeat(area[sel] / len(bc), len(bc))); ids.append(np.repeat(sel, len(bc)))
    if not xs: return np.zeros((0, 2)), np.zeros(0), np.zeros(0, int)
    return np.concatenate(xs), np.concatenate(ws), np.concatenate(ids)


def _segments(lines):
    """Each line's pieces, with the line each came from."""
    segs, owner = [], []
    for k, p in enumerate(lines):
        for a, b in zip(p, p[1:]):
            if math.dist(a[:2], b[:2]) > 1e-3: segs.append(LineString([a[:2], b[:2]])); owner.append(k)
    return segs, np.asarray(owner, int)


def path_tilt(m, sheet, off_deck, note, at, inner, fig):
    """24. Paths, front paths and drives lie level across: the ground they're drawn on, measured across
    the way's line (the nearest way's direction), tilts by more than TILT. A way's score is the
    length of it tilted (the tilted area over its width)."""
    kinds = ("path", "grass", "dirt", "gravel", "front", "drive")
    sel = sheet.kind_mask(kinds)
    if not sel.any(): return
    xy, w, ti = _tri_samples(sheet.A[sel], sheet.B[sel], sheet.C[sel])
    tk = sheet.K[np.nonzero(sel)[0]][ti]
    keep = off_deck(shapely.points(xy)) & shapely.contains_xy(inner, xy[:, 0], xy[:, 1])
    xy, w, ti, tk = xy[keep], w[keep], ti[keep], tk[keep]
    roads = [r for r in m.get("rd") or [] if r["c"] in PATHS and len(r["p"]) > 1]
    groups = {"path": [r["p"] for r in roads], "front": [[q[:2], q[2:4]] for q in m.get("fp") or []],
              "drive": [[q[:2], q[2:4]] for q in m.get("dv") or []]}
    labels = {"path": [(r["c"], r.get("n") or "", r.get("w") or 2 * _road_half(r["c"])) for r in roads],
              "front": [("front path", "", 1.2)] * len(groups["front"]), "drive": [("drive", "", 3.0)] * len(groups["drive"])}
    if sheet.level:
        a, b, c = sheet.A[sel][ti], sheet.B[sel][ti], sheet.C[sel][ti]
        d = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1])
        d = np.where(np.abs(d) < 1e-9, 1e-9, d)
        gx = ((b[:, 2] - a[:, 2]) * (c[:, 1] - a[:, 1]) - (c[:, 2] - a[:, 2]) * (b[:, 1] - a[:, 1])) / d
        gy = ((c[:, 2] - a[:, 2]) * (b[:, 0] - a[:, 0]) - (b[:, 2] - a[:, 2]) * (c[:, 0] - a[:, 0])) / d
    else:
        gx, gy = _gradient(m["t"])(xy[:, 0], xy[:, 1])
    deg = np.full(len(xy), np.nan)
    owner_of = np.full(len(xy), -1)
    group_of = np.full(len(xy), "", object)
    for g, mine in (("path", ("path", "grass", "dirt", "gravel")), ("front", ("front",)), ("drive", ("drive",))):
        s = np.isin(tk, [FACE_KINDS.index(k) for k in mine])
        lines = groups[g] or groups["path"]
        lab = labels[g] if groups[g] else labels["path"]
        if not s.any() or not lines: continue
        segs, owner = _segments(lines)
        if not segs: continue
        tree = shapely.STRtree(segs)
        pi, si = tree.query_nearest(shapely.points(xy[s]), all_matches=False)
        ends = shapely.get_coordinates(np.asarray(segs, object)[si]).reshape(-1, 2, 2)
        dv = ends[:, 1] - ends[:, 0]
        nrm = np.stack([-dv[:, 1], dv[:, 0]], 1) / np.hypot(dv[:, 0], dv[:, 1])[:, None]
        idx = np.nonzero(s)[0][pi]
        deg[idx] = np.degrees(np.arctan(np.abs(gx[idx] * nrm[:, 0] + gy[idx] * nrm[:, 1])))
        owner_of[idx] = owner[si]
        group_of[idx] = g
        steps = np.asarray([lab[o][0] == "steps" for o in owner[si]])
        deg[idx[steps]] = np.nan        # (a flight's treads are level whatever the ground)
    ok = ~np.isnan(deg)
    fig["path m2"] = fig.get("path m2", 0) + float(w[ok].sum())
    for t in (2, 5, 10):
        fig[f"path tilted >{t} deg m2"] = fig.get(f"path tilted >{t} deg m2", 0) + float(w[ok & (deg > t)].sum())
    bad = ok & (deg > TILT)
    for g in ("path", "front", "drive"):
        lab = labels[g] if groups[g] else labels["path"]
        s = bad & (group_of == g)
        if not s.any(): continue
        for o in np.unique(owner_of[s]):
            k = s & (owner_of == o)
            c, n, width = lab[o]
            length = float(w[k].sum()) / width
            if length < 5: continue
            j = np.nonzero(k)[0][np.argmax(deg[k])]
            note("24 path tilted sideways", length, at(*xy[j]), f"{c} {n!r} {length:.0f} m over {TILT:g} degrees across, up to {deg[j]:.0f}")


def things_in_paths(m, sheet, note, at, inner, fig):
    """25. Nothing stands up through a path: no tree's trunk, shrub or boulder inside a path's, drive's
    or pavement's face (what the game draws over a path, the ground or a deck, is rule 23's, in the
    drawn scene)."""
    walk = sheet.union(("path", "grass", "dirt", "gravel", "front", "drive", "pave"))
    if walk.is_empty: return
    walk = walk.buffer(-0.2)
    if walk.is_empty: return
    walk = prep(walk)
    n = 0
    for key, what in (("tr", "tree"), ("sb", "shrub"), ("rk", "boulder")):
        for q in m.get(key) or []:
            p = Point(q[0], q[1])
            if inner.contains(p) and walk.contains(p):
                n += 1
                note("25 tree, shrub or boulder in a path", 1, at(q[0], q[1]), what)
    fig["things in paths"] = fig.get("things in paths", 0) + n


def face_edges(m, sheet, drawn, note, at, inner, fig, land=None):
    """26. A face's edge stands no more than TALL_EDGE over what is beside it: the side face the game
    draws down from a free edge to the drawn ground (a wedge down a bank), or up from a lower face
    it shares the edge with (a pavement over a path). A place is one outline, its score the length
    of edge over TALL_EDGE. With the sheet (land), a free edge's side face runs to where the sheet meets
    it; where the sheet holds the ground off it with a retaining wall, the wall's length is a figure
    of its own, not a fault."""
    if not sheet.edges: return
    V, cm = sheet.V, sheet.cm
    NP = len(V)
    spot = {}
    sp = np.empty(NP, np.int64)
    for i, (x, y) in enumerate(map(tuple, cm[:, :2].tolist())):
        sp[i] = spot.setdefault((x, y), i)
    g = drawn(V[:, 0], V[:, 1])
    tops = {k: (g if k in ON_GROUND and not sheet.level else V[:, 2]) + FACE_LIFT[k] for k in FACE_LIFT}
    owner = {}
    for kind, idx in sheet.edges:
        for a, b in zip(idx[:-1], idx[1:]): owner[(sp[a], sp[b])] = (kind, a, b)
    total = {}
    for kind, idx in sheet.edges:
        top = tops[kind]
        length, worst, where = 0.0, 0.0, None
        for a, b in zip(idx[:-1], idx[1:]):
            l = math.dist(V[a, :2], V[b, :2])
            if l < 1e-3: continue
            other = owner.get((sp[b], sp[a]))
            if other:
                ok, oa, ob = other
                h = max(top[a] - tops[ok][ob], top[b] - tops[ok][oa])
                if h < 0.02: continue
            elif land is not None:
                fs = land.F.spot
                if (fs[a], fs[b]) not in land.free: continue    # (along the square's edge: the next square's ground meets it)
                ma, mb = land.meets[fs[a]], land.meets[fs[b]]
                h = max(abs(top[a] - ma), abs(top[b] - mb))
                if h > TALL_EDGE and (fs[a] in land.held or fs[b] in land.held):
                    mid = Point((V[a, 0] + V[b, 0]) / 2, (V[a, 1] + V[b, 1]) / 2)
                    if inner.contains(mid): fig["retaining wall m"] = fig.get("retaining wall m", 0) + l
                    continue
            else:
                # (the side face runs down to the drawn ground at the corner, which is the ground
                # beside the edge there)
                h = max(top[a] - g[a], top[b] - g[b])
            if h > TALL_EDGE:
                mid = Point((V[a, 0] + V[b, 0]) / 2, (V[a, 1] + V[b, 1]) / 2)
                if not inner.contains(mid): continue
                length += l
                if h > worst: worst, where = h, mid
        if length >= 1.0:
            total[kind] = total.get(kind, 0) + length
            note("26 face edge standing off the ground", length, at(where.x, where.y), f"{kind} {length:.1f} m over {TALL_EDGE:g} m, up to {worst:.1f} m")
    for k, v in total.items(): fig[f"tall edge m ({k})"] = fig.get(f"tall edge m ({k})", 0) + v


def face_joins(m, sheet, D, drawn, note, at, inner, fig):
    """27. Where faces meet, they meet: (a) no gap between a path and a street face that it runs up to:
    no strip of bare ground wider than GAP within 0.3 m of both; (b) no lump: a corner of the ground as it's
    drawn, within a metre of faces of two kinds (street, pavement, path), standing more than LUMP over
    both; (c) a pavement doesn't just
    stop across its width with nothing there (no face, building, wall or fence)."""
    paths = sheet.union(("path", "grass", "dirt", "gravel", "front", "drive"))
    streets = sheet.union(("road", "service", "pave"))
    if not paths.is_empty and not streets.is_empty:
        # (the uncovered ground lying within 0.3 m of both, wider than GAP: a strip of grass between them)
        allf = sheet.union(FACE_KINDS)
        gaps = paths.buffer(0.15).intersection(streets.buffer(0.15)).difference(allf).intersection(inner)
        by_street, by_path = streets.buffer(0.03), paths.buffer(0.03)
        shapely.prepare(by_street); shapely.prepare(by_path)
        tot = 0.0
        for gp in getattr(gaps, "geoms", [gaps]):
            if gp.geom_type != "Polygon" or gp.buffer(-GAP / 2).is_empty: continue
            # (its length is how far it runs along both: a strip beside one only, past a thin strip
            # of the other, is no gap between them)
            if not (by_street.intersects(gp) and by_path.intersects(gp)): continue
            length = min(gp.boundary.intersection(by_street).length, gp.boundary.intersection(by_path).length, gp.length / 2)
            if length < 0.5: continue
            tot += length
            c = gp.representative_point()
            note("27 gap between a path and a street", length, at(c.x, c.y), f"{length:.1f} m long, {gp.area:.2f} m2")
        fig["path-street gap m"] = fig.get("path-street gap m", 0) + tot
    T = m["t"]
    X, Y = np.meshgrid(T["x0"] + np.arange(T["nx"]) * T["dx"], T["y0"] + np.arange(T["ny"]) * T["dy"])
    X, Y, Z = X.ravel(), Y.ravel(), D.ravel()
    pts = shapely.points(X, Y)
    free = np.ones(len(X), bool)
    free[sheet.tree.query(pts, predicate="intersects")[0]] = False
    free &= shapely.contains_xy(inner, X, Y)
    tops = []
    for kinds in (("road", "service"), ("pave",), ON_GROUND):
        ids = np.nonzero(sheet.kind_mask(kinds))[0]
        top = np.full(len(X), np.nan)
        if len(ids):
            qi, qt = shapely.STRtree(sheet.polys[ids]).query_nearest(pts[free], max_distance=1.0, all_matches=False)
            k = np.nonzero(free)[0][qi]
            ex, ey = shapely.get_coordinates(shapely.get_point(shapely.shortest_line(pts[k], sheet.polys[ids[qt]]), 1)).T
            if kinds is ON_GROUND and not sheet.level: top[k] = drawn(ex, ey) + 0.04
            else: top[k] = sheet.z_on(ids[qt], ex, ey) + FACE_LIFT[kinds[0]]
        tops.append(top)
    tops = np.stack(tops)
    near = (~np.isnan(tops)).sum(0) >= 2
    with np.errstate(invalid="ignore"):
        lump = near & (Z > np.nanmax(np.where(near, tops, -np.inf), axis=0) + LUMP)
    for k in np.nonzero(lump)[0]:
        up = float(Z[k] - np.nanmax(tops[:, k]))
        note("27 lump between faces", up, at(X[k], Y[k]), f"the ground {up:.2f} m over the faces either side")
    fig["lumps between faces"] = fig.get("lumps between faces", 0) + int(lump.sum())
    pave = sheet.union(("pave",))
    if pave.is_empty: return
    others = sheet.union(tuple(k for k in FACE_KINDS if k != "pave"))
    stops = [LineString([q[:2] for q in b["p"]]) for b in m.get("br") or [] if len(b["p"]) > 1]
    stops += [LineString(b["r"][0] + b["r"][0][:1]) for b in m.get("bl") or [] if len(b["r"][0]) >= 3]
    # (a deck is drawn by the bridge, not as faces: a pavement running on to one has something there)
    decks = [LineString([q[:2] for q in r["p"]]).buffer(max(_deck_sides(r)) + 1) for r in m.get("rd") or [] if len(r["p"]) > 1 and any(_flags(r))]
    # (nor is a set piece that paves its outline to the edge, where the square's faces were cut for it)
    from partition import setpiece_cuts
    filled = setpiece_cuts.holes(m.get("centre"), m["b"], sheet.union(("road", "service")))
    stopped = shapely.union_all([others.buffer(0.05)] + [s.buffer(0.3) for s in stops] + decks
                                + ([filled.buffer(0.3)] if filled is not None else []))
    kerbed = [LineString([q[:2] for q in r["p"]]) for r in m.get("rd") or [] if r["c"] in GAME_KERBED and len(r["p"]) > 1]
    if not kerbed: return
    ktree = shapely.STRtree(kerbed)
    n = 0
    for gp in getattr(pave, "geoms", [pave]):
        if gp.geom_type != "Polygon": continue
        q = np.asarray(gp.exterior.simplify(0.05).coords)
        for a, b in zip(q[:-1], q[1:]):
            l = math.dist(a, b)
            if l < 0.8 or l > 6: continue
            seg = LineString([a, b])
            mid = seg.interpolate(0.5, normalized=True)
            if not inner.contains(mid) or stopped.contains(mid): continue
            r = kerbed[int(ktree.nearest(mid))]
            s = r.project(mid)
            p0, p1 = r.interpolate(max(0, s - 1)), r.interpolate(min(r.length, s + 1))
            dx, dy = p1.x - p0.x, p1.y - p0.y
            dl = math.hypot(dx, dy) or 1
            across = abs((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (l * dl)
            if across > 0.4 or r.distance(mid) > 12: continue
            n += 1
            note("27 pavement just stops", l, at(mid.x, mid.y), f"{l:.1f} m wide, nothing across its end")
    fig["pavement ends"] = fig.get("pavement ends", 0) + n


def _flags(r):
    return [q[3] if len(q) > 3 and q[3] in (1, 2) else 0 for q in r["p"]]


def _spans(flags, structural=True):
    """map.ts bridgeSpans: from the point before a bridge's run of points to the point after."""
    n, out, i = len(flags), [], 0
    on = [f == 1 if structural else f > 0 for f in flags]
    while i < n:
        if not on[i]: i += 1; continue
        j = i
        while j + 1 < n and on[j + 1]: j += 1
        a, b = max(0, i - 1), min(n - 1, j + 1)
        if b > a: out.append((a, b))
        i = j + 1
    return out


def join_spans(roads):
    """world.ts joinSpans: a bridge's pieces joined end to end where exactly two meet on the span, or
    where a junction on the deck carries the same street on nearly straight. Returns the joined
    lines, and for each place on a deck where three or more pieces meet, the pieces there."""
    lst = [r for r in roads if len(r["p"]) > 1 and any(_flags(r))]
    key = lambda q: (round(q[0] * 3), round(q[1] * 3))
    ends = {}
    for i, r in enumerate(lst):
        for q in (r["p"][0], r["p"][-1]): ends.setdefault(key(q), []).append(i)

    def leaving(r, q):
        p = r["p"]
        A, B = (p[0], p[1]) if key(p[0]) == key(q) else (p[-1], p[-2])
        l = math.dist(A[:2], B[:2]) or 1
        return ((B[0] - A[0]) / l, (B[1] - A[1]) / l)

    def onward(i, q):
        e = ends.get(key(q)) or []
        if len(e) < 2 or (q[3] if len(q) > 3 else 0) != 1: return None
        if len(e) == 2:
            j = e[1] if e[0] == i else e[0]
            return None if j == i else j
        a, da, best, most = lst[i], leaving(lst[i], q), None, math.cos(math.pi / 5)
        for j in e:
            b = lst[j]
            if j == i or ((a["n"] != b["n"]) if (a["n"] or b["n"]) else a["c"] != b["c"]): continue
            db = leaving(b, q)
            s = -(da[0] * db[0] + da[1] * db[1])
            if s > most: most, best = s, j
        return best

    def nxt(i, q):
        j = onward(i, q)
        return j if j is not None and onward(j, q) == i else None

    used, out = set(), []

    def chain(start):
        r0 = lst[start]
        fwd0 = nxt(start, r0["p"][0]) is None
        pts, i, pieces = list(r0["p"] if fwd0 else r0["p"][::-1]), start, [r0]
        used.add(start)
        while True:
            j = nxt(i, pts[-1])
            if j is None or j in used: break
            q = lst[j]["p"]
            pts += (q if key(q[0]) == key(pts[-1]) else q[::-1])[1:]
            pieces.append(lst[j]); used.add(j); i = j
        main = max(pieces, key=lambda r: LineString([q[:2] for q in r["p"]]).length)
        out.append(dict(main, p=pts, pieces=pieces))

    for i, r in enumerate(lst):
        if i not in used and (nxt(i, r["p"][0]) is None or nxt(i, r["p"][-1]) is None): chain(i)
    for i in range(len(lst)):
        if i not in used: chain(i)
    joints = [(k, [lst[i] for i in e]) for k, e in ends.items() if len(e) >= 3
              and any((q[3] if len(q) > 3 else 0) == 1 for i in e for q in (lst[i]["p"][0], lst[i]["p"][-1]) if key(q) == k)]
    return out, joints


def bridges(m, f, sheet, drawn, ground, note, at, sq, fig):
    """28-31. Bridges, joined as the game joins them (world.ts joinSpans), with each kind's deck
    (world.ts KINDS) under its top:
    28. a deck's end lands on the street it meets: it doesn't stop in the air (falling off its last
        point, world.ts offTheEnd, or ending on its span with nothing going on, here or in the next
        square), and where it lands its floor is within DECK_END of the face or ground there;
    29. where three or more pieces meet on a deck, only the straightest two are joined, and the
        parapets of the others stop there with a gap;
    30. no ground stands up through a deck's floor between its abutments (ground into the deck's
        underside, hidden in the slab, is counted in the figures only);
    31. room under a bridge: the ground under a span's middle stays DECK_CLEAR under its underside,
        and a way passing under has HEAD under the game's ceiling there, the canal's towpath included:
        the flat underside of the deck's kind (map.ts ceiling). Where world.ts draws an arch under a
        stone bridge, the game's ceiling is the arch's barrel, lower towards its sides; that isn't
        modelled here (which arches are built hangs on the piers, the canal's banks and every way
        passing under, flattened to keep 2.4 m over them), so over the canal's towpath this can
        overstate the room."""
    roads = [r for r in m.get("rd") or [] if len(r["p"]) > 1]
    pieces = [_poly(r) for r in m.get("sp") or [] if len(r) >= 3]
    held = lambda x, y: any(p.contains(Point(x, y)) for p in pieces)
    chains, joints = join_spans(roads)
    x0, y0, x1, y1 = m["b"]
    seam = lambda q: min(abs(q[0] - x0), abs(q[0] - x1), abs(q[1] - y0), abs(q[1] - y1)) < 0.6
    for k, rs in joints:
        x, y = k[0] / 3, k[1] / 3
        if held(x, y) or not sq.contains(Point(x, y)): continue
        note("29 parapet gap where pieces meet on a deck", len(rs), at(x, y), f"{len(rs)} pieces: " + ", ".join(sorted({r.get('n') or r['c'] for r in rs})))
        fig["parapet gaps"] = fig.get("parapet gaps", 0) + 1
    try:
        ti, tj = (int(n) for n in os.path.basename(f)[:-5].split("_"))
    except ValueError:
        ti = tj = None
    canal = _whole(*_root_of(f))["canal"]
    tow = []
    if canal:
        for run in canal["runs"]:
            for a, b in zip(run["p"], run["p"][1:]):
                if (a[6] | b[6]) & 1: continue
                for side, wi in ((1, 7), (-1, 8)):
                    if a[wi] <= 0: continue
                    tow.append((LineString([a[:2], b[:2]]).offset_curve(side * (a[2] + a[wi] / 2)), run["lv"] + 0.4))
    tow = [t for t in tow if not t[0].is_empty]
    ttree = shapely.STRtree([t[0] for t in tow]) if tow else None
    ways = [(LineString([q[:2] for q in r["p"]]), r) for r in roads]
    wtree = shapely.STRtree([w[0] for w in ways])
    # (under a deck over water, or over the canal's works and locks, the ground is hidden or dug: the
    # water's surface or the canal's own bed is what's there)
    near = box(*m["b"]).buffer(50)
    hidden = [_poly(w["r"][0], w["r"][1:]) for w in m.get("wp") or [] if len(w["r"][0]) >= 3]
    cp = canal_pieces(*_root_of(f))
    if cp:
        hidden += [g for g, _ in cp["water"]] + cp["banks"] + cp["verges"] + [lk["zone"] for lk in cp["locks"]]
    hidden = shapely.union_all([g for g in hidden if g.intersects(near)] or [Polygon()])
    shapely.prepare(hidden)
    clear_low, through = 0.0, 0.0
    for r in chains:
        p, flags = r["p"], _flags(r)
        if any(held(q[0], q[1]) for q in p if len(q) > 3): continue
        kind = r.get("bt") if r.get("bt") in KINDS else ("foot" if r["c"] in FOOT else "beam" if r["c"] in ("trunk", "motorway") else "arch")
        deck = KINDS[kind]
        lift = 0.2 if r["c"] in GAME_KERBED else 0.1
        hl, hr = _deck_sides(r)
        h = lambda i: p[i][2] if flags[i] else float(ground(p[i][0], p[i][1]))
        falls = lambda i, j: flags[j] != 1 and abs(h(i) - h(j)) > max(2, math.dist(p[i][:2], p[j][:2]))
        name = f"{r['c']} {r.get('n') or ''!r}"
        for a0, b0 in _spans(flags):
            hang_a, hang_b = a0 + 1 < b0 and falls(a0 + 1, a0), b0 - 1 > a0 and falls(b0 - 1, b0)
            a, b = (a0 + 1 if hang_a else a0), (b0 - 1 if hang_b else b0)
            # (a short span hanging off both ends leaves no deck between them)
            if b <= a: continue
            line = LineString([q[:2] for q in p[a:b + 1]])
            if line.length < 3: continue
            for end, hang, inward in ((a, hang_a, a + 1), (b, hang_b, b - 1)):
                q = p[end]
                if not sq.contains(Point(q[:2])): continue
                floor = h(end) + 0.03
                if hang:
                    drop = abs(floor - float(ground(q[0], q[1])))
                    note("28 deck stops in the air", drop, at(q[0], q[1]), f"{name} {kind}, its end {drop:.1f} m off the ground below")
                    fig["deck ends off"] = fig.get("deck ends off", 0) + 1
                    continue
                if flags[end] == 1:
                    if seam(q):
                        e = None
                        for di in (-1, 0, 1):
                            for dj in (-1, 0, 1):
                                if ti is None or not (di or dj): continue
                                got = _edge_of(os.path.join(os.path.dirname(f), f"{ti + di}_{tj + dj}.json"))
                                if got is None or not len(got[1]): continue
                                d = np.hypot(got[1][:, 0] - q[0], got[1][:, 1] - q[1])
                                e = min(e if e is not None else 9, float(d.min()))
                        if e is not None and e < 1.0: continue
                    if any(rr is not r and any(math.dist(qq[:2], q[:2]) < 1.0 and len(qq) > 3 and qq[3] in (1, 2) for qq in rr["p"]) for rr in chains):
                        continue
                    drop = floor - float(ground(q[0], q[1]))
                    note("28 deck stops in the air", drop, at(q[0], q[1]), f"{name} {kind}, its end on the span {drop:.1f} m over the ground")
                    fig["deck ends off"] = fig.get("deck ends off", 0) + 1
                    continue
                # (just off the deck's end, along the way it was going)
                d = math.dist(q[:2], p[inward][:2]) or 1
                ox, oy = q[0] + (q[0] - p[inward][0]) / d * 0.5, q[1] + (q[1] - p[inward][1]) / d * 0.5
                there, k = sheet.top(np.array([ox]), np.array([oy]), drawn) if sheet.ok else (drawn(np.array([ox]), np.array([oy])), [None])
                gap = abs(floor - (float(there[0]) - (FACE_LIFT[k[0]] if k[0] else 0)))
                if gap > DECK_END:
                    note("28 deck end off the street", gap, at(q[0], q[1]), f"{name} {kind}, {gap * 100:.0f} cm from the {k[0] or 'ground'} it meets")
                    fig["deck ends off"] = fig.get("deck ends off", 0) + 1
            # the deck's footprint between its abutments, a metre and a half in from each, every half metre
            s = np.arange(1.5, line.length - 1.5, 0.5)
            if not len(s): continue
            cum = np.concatenate([[0], np.cumsum([math.dist(u[:2], v[:2]) for u, v in zip(p[a:b], p[a + 1:b + 1])])])
            tops = np.interp(s, cum, [h(i) for i in range(a, b + 1)])
            ctr = shapely.line_interpolate_point(line, s)
            ahead = shapely.line_interpolate_point(line, np.minimum(s + 0.3, line.length))
            cx, cy = shapely.get_x(ctr), shapely.get_y(ctr)
            dx, dy = shapely.get_x(ahead) - cx, shapely.get_y(ahead) - cy
            dl = np.hypot(dx, dy); dl[dl == 0] = 1
            nx_, ny_ = -dy / dl, dx / dl
            over, low, worst, wx, wy = 0.0, 0.0, 0.0, 0, 0
            for o in np.arange(-hr, hl + 1e-6, 0.5):
                x, y = cx + nx_ * o, cy + ny_ * o
                g = np.where(shapely.contains_xy(hidden, x, y), -np.inf, drawn(x, y))
                up = g - (tops + 0.03)
                inner_ = g - (tops + lift - deck)
                over += 0.25 * float((up > 0).sum())
                through += 0.25 * float((inner_ > 0).sum())
                low += 0.25 * float((inner_ > -DECK_CLEAR).sum())
                if len(up) and up.max() > worst: k = int(np.argmax(up)); worst, wx, wy = float(up[k]), x[k], y[k]
            clear_low += low
            mid = line.interpolate(0.5, normalized=True)
            if over >= 0.25 and sq.contains(mid):
                note("30 ground up through a deck", over, at(wx, wy), f"{name} {kind}, {over:.1f} m2, up to {worst:.2f} m over its floor")
                fig["ground through decks m2"] = fig.get("ground through decks m2", 0) + over
            if low >= 1 and sq.contains(mid):
                note("31 no room under a bridge", low, at(mid.x, mid.y), f"{name} {kind}, {low:.0f} m2 within {DECK_CLEAR:g} m of its underside")
            # ways passing under, and the towpath
            foot = line.buffer(max(hl, hr), cap_style="flat")
            under = [(ways[int(k)][0], ways[int(k)][1]) for k in wtree.query(foot)]
            under += [(tow[int(k)][0], {"c": "towpath", "n": "", "lv": tow[int(k)][1]}) for k in (ttree.query(foot) if ttree else [])]
            for wl, w in under:
                if w is r or any(w is pc for pc in r.get("pieces", [])) or not wl.crosses(line): continue
                x = wl.intersection(line)
                x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                if w["c"] == "towpath": wz = w["lv"]
                else:
                    wp_ = w["p"]
                    k = min(range(len(wp_)), key=lambda i: math.dist(wp_[i][:2], (x.x, x.y)))
                    if len(wp_[k]) > 3 and wp_[k][3]: continue
                    if w["c"] not in PATHS and w["c"] not in GAME_KERBED: continue
                    wz = float(drawn(np.array([x.x]), np.array([x.y]))[0])
                top = float(np.interp(line.project(x), cum, [h(i) for i in range(a, b + 1)])) + lift
                room = top - deck - wz
                if room < HEAD and top - wz > 1.0:
                    note("31 no room under a bridge", HEAD - room, at(x.x, x.y), f"{w['c']} {w['n']!r} under {name}: {room:.1f} m to the ceiling")
                    fig["ways without room"] = fig.get("ways without room", 0) + 1
    fig["deck underside in ground m2"] = fig.get("deck underside in ground m2", 0) + through
    fig["under decks within clear m2"] = fig.get("under decks within clear m2", 0) + clear_low


def _root_of(f):
    root, map_id = os.path.dirname(os.path.dirname(f)), os.path.basename(os.path.dirname(f))
    if not os.path.exists(os.path.join(root, f"{map_id}.json")):
        root, map_id = os.path.dirname(f), os.path.basename(f)[:-5]
    return root, map_id


def _stair(p, ground):
    """furniture.ts stairLayout: a flight's length, a point along it, and its treads' height there."""
    cum = np.concatenate([[0], np.cumsum([math.dist(a[:2], b[:2]) for a, b in zip(p, p[1:])])])
    L = cum[-1]
    if L < 1: return None
    xs, ys = [q[0] for q in p], [q[1] for q in p]
    along = lambda s: (np.interp(s, cum, xs), np.interp(s, cum, ys))
    N = max(2, math.ceil(L / 0.25))
    s = L * np.arange(N + 1) / N
    x, y = along(s)
    g0, g1 = float(ground(np.array([xs[0]]), np.array([ys[0]]))[0]), float(ground(np.array([xs[-1]]), np.array([ys[-1]]))[0])
    hh = np.maximum(g0 + (g1 - g0) * s / L, ground(x, y))
    most = STAIR_PITCH * L / N
    for i in range(N - 1, -1, -1): hh[i] = max(hh[i], hh[i + 1] - most)
    for i in range(1, N + 1): hh[i] = max(hh[i], hh[i - 1] - most)
    return L, along, lambda q: np.interp(q, s, hh), abs(g1 - g0)


def flights(m, sheet, walk, note, at, inner, fig):
    """33. Flights of steps (furniture.ts stepsDetail), with the treads laid as the game lays them:
    (a) each end lands on something to walk on: a face, or another way's line, within LANDING[0], at
    the treads' height within LANDING[1]; (b) no tread is buried, the ground beside it higher than its
    top with no retaining wall holding it there (with the sheet a flight is sunk into the hill, its
    bank held by one: gs `s`); (c) none stands as a grey block, more than 0.3 m over the ground
    beside it with nothing holding the bank: a side where the game builds no cheek wall (furniture.ts builds one the whole
    length of a side where the ground just beside any tread is more than 0.3 m under its top, or
    under its block's foot); (d) a
    tread you can stand on: the treads are floors, so you stand on a tread unless the ground over it
    is more than a step (0.2 m) higher, and you can climb to it from the one before (no more than
    0.6 m up). A flight's score is the share of its treads that fail (b), (c) or (d)."""
    roads = [r for r in m.get("rd") or [] if len(r["p"]) > 1]
    stepped = [r for r in roads if r["c"] == "steps" and not any(_flags(r))]
    if not stepped: return
    ways = [(LineString([q[:2] for q in r["p"]]), r) for r in roads]
    wtree = shapely.STRtree([w[0] for w in ways])
    walkable = sheet.union(FACE_KINDS) if sheet.ok else Polygon()
    # (with the sheet, where the ground beside a face is held above it by a retaining wall: a flight
    # sunk into the hill has its bank held so, and a tread with that wall beside it isn't buried)
    walls = None
    if GROUND_SHEET and m.get("gs") and m.get("sf"):
        held = gsheet.read(m["gs"], m["t"])[2]
        F = gsheet.Faces(m["sf"], m["b"])
        up = [(a, b) for a, b in F.free.tolist() if max(held.get(int(F.spot[a]), 0), held.get(int(F.spot[b]), 0)) > 0.05]
        if up:
            walls = shapely.STRtree([LineString([F.V[a, :2], F.V[b, :2]]) for a, b in up])
    walled_at = lambda x, y: walls is not None and len(walls.query(Point(x, y), predicate="dwithin", distance=WALL_BESIDE)) > 0
    totals = dict(treads=0, buried=0, block=0, unwalkable=0, landings=0)
    for r in stepped:
        lay = _stair(r["p"], walk)
        if not lay: continue
        L, along, height, rise = lay
        if not inner.contains(Point(r["p"][0][:2])): continue
        treads = r.get("sc") or (round(rise / 0.16) if rise > 0.3 else 0)
        count = min(treads, 240, int(L // 0.2))
        w = r.get("w") or 1.8
        bad = dict(buried=0, block=0, unwalkable=0)
        rows = []
        for k in range(count):
            s0, s1 = L * k / count, L * (k + 1) / count
            x, y = along((s0 + s1) / 2)
            x1, y1 = along(min(L, (s0 + s1) / 2 + 0.1))
            dx, dy = x1 - x, y1 - y
            dl = math.hypot(dx, dy) or 1
            nx_, ny_ = -dy / dl * w / 2, dx / dl * w / 2
            top = max(height(s0), height(s1))
            side = walk(np.array([x + nx_ * 1.15, x - nx_ * 1.15]), np.array([y + ny_ * 1.15, y - ny_ * 1.15]))
            here = float(walk(np.array([x]), np.array([y]))[0])
            foot = min(here, height(s0), height(s1)) - TREAD_DEPTH
            k_ = 1 + 0.1 / (w / 2)
            beside = walk(np.array([x + nx_ * k_, x - nx_ * k_]), np.array([y + ny_ * k_, y - ny_ * k_]))
            rows.append((top, side, (top - beside > 0.3) | (beside < foot)))
            if any(z > top + 0.05 and not walled_at(x + sx * nx_ * 1.15, y + sx * ny_ * 1.15) for z, sx in zip(side, (1, -1))):
                bad["buried"] += 1
            if here - top > 0.2 or (k and top - last > 0.6): bad["unwalkable"] += 1
            last = top
        # (a side has its cheek wall the whole way if it needs one anywhere)
        walled = np.any([c for _, _, c in rows], axis=0) if rows else np.zeros(2, bool)
        bad["block"] = sum(1 for top, side, _ in rows if ((top - side > 0.3) & ~walled).any())
        totals["treads"] += count
        for k, v in bad.items(): totals[k] += v
        if count:
            share = max(bad.values()) / count
            if share > 0:
                worst = max(bad, key=bad.get)
                x, y = r["p"][len(r["p"]) // 2][:2]
                note("33 flight's treads wrong", share, at(x, y), f"{r.get('n') or 'steps'!r}: of {count}, {bad['buried']} buried, {bad['block']} standing as a block, {bad['unwalkable']} not where you walk")
        for e in (r["p"][0], r["p"][-1]):
            pt = Point(e[:2])
            off = walkable.distance(pt) if not walkable.is_empty else 99
            for k in wtree.query(pt.buffer(3)):
                wl, wr = ways[int(k)]
                if wr is r: continue
                off = min(off, max(0, wl.distance(pt) - _road_half(wr["c"], wr.get("w"))))
            tread = float(height(0 if e is r["p"][0] else L))
            there = float(walk(np.array([e[0]]), np.array([e[1]]))[0])
            if off > LANDING[0] or abs(tread - there) > LANDING[1]:
                totals["landings"] += 1
                note("33 flight lands on nothing", off + abs(tread - there), at(e[0], e[1]), f"{r.get('n') or 'steps'!r}: {off:.1f} m from anything to walk on, {tread - there:+.2f} m from it")
    for k, v in totals.items(): fig[f"flight {k}"] = fig.get(f"flight {k}", 0) + v


def _band(p, lo, hi, skip=lambda a, b: False):
    """The strip beside a line of points between offsets lo(i) and hi(i) (left of the line positive)."""
    xy = np.asarray([q[:2] for q in p], float)
    if len(xy) < 2: return Polygon()
    d = np.gradient(xy, axis=0)
    n = np.stack([-d[:, 1], d[:, 0]], 1) / np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-9)[:, None]
    quads = []
    for i in range(len(xy) - 1):
        if skip(p[i], p[i + 1]): continue
        a0, a1 = xy[i] + n[i] * lo(i), xy[i] + n[i] * hi(i)
        b0, b1 = xy[i + 1] + n[i + 1] * lo(i + 1), xy[i + 1] + n[i + 1] * hi(i + 1)
        q = Polygon([a0, b0, b1, a1])
        quads.append(q if q.is_valid else q.buffer(0))
    return shapely.union_all(quads) if quads else Polygon()


MOUTH_REACH = 30


@functools.lru_cache(maxsize=4)
def canal_pieces(root, map_id):
    """The canal as canal.ts and works.ts lay it, from its file: each run's water (with its level),
    banks (the towpath's side and the other) and verges, out of its tunnels; and each lock's chamber,
    its walls' coping and paving, its lock water, in the lock's own frame turned to data metres."""
    canal = _whole(root, map_id)["canal"]
    if not canal: return None
    tunnel = lambda a, b: bool((a[6] | b[6]) & 1)

    def frame(lk):
        (ax, ay), (bx, by) = lk["lo"], lk["hi"]
        L = math.dist((ax, ay), (bx, by)) or 1
        ux, uy = (bx - ax) / L, (by - ay) / L
        rect = lambda u0, u1, v0, v1: Polygon([(ax + ux * u - uy * v, ay + uy * u + ux * v) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])
        return L, rect, lk.get("tl") or TAIL + (lk["zh"] - lk["zl"]) * 6
    # beside a lock, the pound's water stops at its walls, and runs on from each pair of gates to the
    # chamber's own water; the works leave out their banks under its coping and paving, but for an
    # edge tucked 5 cm under them (canal.ts outsideLocks, works.ts)
    beside, under, gates = [], [], []
    for lk in canal.get("locks") or []:
        L, rect, wl = frame(lk)
        beside += [rect(-wl, L + TAIL, LOCK_HALF, 50), rect(-wl, L + TAIL, -50, -LOCK_HALF)]
        under.append(rect(-wl + 0.05, L + TAIL - 0.05, -(LOCK_HALF + COPE + APRON - 0.05), LOCK_HALF + COPE + APRON - 0.05))
        gates.append((lk["lo"], rect(0, 0.5, -LOCK_HALF, LOCK_HALF)))
        gates.append((lk["hi"], rect(L - 0.5, L, -LOCK_HALF, LOCK_HALF)))
    beside, under = shapely.union_all(beside or [Polygon()]), shapely.union_all(under or [Polygon()])
    water, banks, verges = [], [], []
    for run in canal["runs"]:
        p = run["p"]
        if len(p) < 2: continue
        # where a run opens into a river, nothing of it is laid past the river's edge (canal.ts clipMouths)
        past = shapely.union_all([Polygon([(x - ny * MOUTH_REACH, y + nx * MOUTH_REACH), (x + ny * MOUTH_REACH, y - nx * MOUTH_REACH),
                                           (x + ny * MOUTH_REACH + nx * MOUTH_REACH, y - nx * MOUTH_REACH + ny * MOUTH_REACH),
                                           (x - ny * MOUTH_REACH + nx * MOUTH_REACH, y + nx * MOUTH_REACH + ny * MOUTH_REACH)])
                                  for x, y, nx, ny in run.get("x") or []] or [Polygon()])
        wet = _band(p, lambda i: -p[i][2], lambda i: p[i][2], tunnel).difference(beside)
        ends = [g for at, g in gates for e in (p[0], p[-1]) if math.dist(at, e[:2]) < 0.5]
        water.append((shapely.union_all([wet] + ends).difference(past), run["lv"]))
        banks.append(shapely.union_all([_band(p, lambda i: p[i][2], lambda i: p[i][2] + p[i][7], tunnel),
                                        _band(p, lambda i: -p[i][2] - p[i][8], lambda i: -p[i][2], tunnel)]).difference(under).difference(past))
        verges.append(shapely.union_all([_band(p, lambda i: p[i][2] + p[i][7], lambda i: p[i][2] + p[i][7] + p[i][9], tunnel),
                                         _band(p, lambda i: -p[i][2] - p[i][8] - p[i][10], lambda i: -p[i][2] - p[i][8], tunnel)]).difference(past))
    locks = []
    for lk in canal.get("locks") or []:
        L, rect, wl = frame(lk)
        sides = lambda v0, v1: shapely.union_all([rect(-wl, L + TAIL, v0, v1), rect(-wl, L + TAIL, -v1, -v0)])
        locks.append(dict(n=lk.get("n", ""), lo=tuple(lk["lo"]), hi=tuple(lk["hi"]), chamber=rect(0, L, -LOCK_HALF, LOCK_HALF),
                          walls=sides(LOCK_HALF, LOCK_HALF + COPE + APRON), paving=sides(LOCK_HALF + COPE, LOCK_HALF + COPE + APRON),
                          water=rect(0.4, L - 0.4, -LOCK_HALF, LOCK_HALF), zone=rect(-wl - 2, L + TAIL + 2, -LOCK_HALF - COPE - APRON - 2, LOCK_HALF + COPE + APRON + 2)))
    return dict(water=water, banks=banks, verges=verges, locks=locks, weirs=[])


def locks(cp, note, at, sq, fig):
    """34. A lock's edges (canal.ts, works.ts; the maintainer's, measured only): (a) no pound's water lies
    outside the lock's walls, over its coping and paving (the strips floating beside the wing walls);
    (b) no gap is left between the lock's water and its gates, with the chamber's floor showing;
    (c) no works bank lies over the lock's paving, two surfaces a few centimetres apart. Open edges
    and slivers in the works' meshes, and sky seen down through a chamber (the ground is hidden there
    in the shader), need the drawn scene and are left to a browser measure."""
    if not cp: return
    for lk in cp["locks"]:
        c = lk["chamber"].centroid
        if not sq.contains(c): continue
        wat = shapely.union_all([w for w, _ in cp["water"] if w.intersects(lk["zone"])] or [Polygon()])
        bank = shapely.union_all([b for b in cp["banks"] if b.intersects(lk["zone"])] or [Polygon()])
        out = wat.intersection(lk["walls"]).area
        gap = lk["chamber"].difference(lk["water"]).difference(wat).area
        over = bank.intersection(lk["paving"]).area
        for what, v, words in (("34 canal water outside a lock's walls", out, "water over its coping and paving"),
                               ("34 gap between a lock's water and its gates", gap, "of the chamber's floor uncovered"),
                               ("34 works bank over a lock's paving", over, "of bank lying on its paving")):
            if v > 0.1:
                note(what, v, at(c.x, c.y), f"{lk['n']}: {v:.1f} m2 {words}")
                fig[what[3:] + " m2"] = fig.get(what[3:] + " m2", 0) + v


def water(m, cp, ground, note, at, sq, inner, fig):
    """35. Land and water: (a) no ground stands above a pond's or river's surface inside its outline
    (the game draws it flat at its level and lets the ground hide its edge); (b) the canal's works
    (its water, banks and verges) don't run on into a river; (c) two waters that touch lie at one
    level (within LEVELS_AGREE), unless a weir (wf) or a lock stands between them."""
    canal_file = cp is not None
    bodies = [(w, _poly(w["r"][0], w["r"][1:])) for w in m.get("wp") or [] if len(w["r"][0]) >= 3]
    rivers = [(w, g) for w, g in bodies if not (canal_file and w.get("c") == "canal")]
    land = 0.0
    for w, g in rivers:
        g = g.buffer(-0.05)
        if g.is_empty: continue
        x0, y0, x1, y1 = g.bounds
        X, Y = np.meshgrid(np.arange(x0 + 0.5, x1, 1.0), np.arange(y0 + 0.5, y1, 1.0))
        X, Y = X.ravel(), Y.ravel()
        k = shapely.contains_xy(g, X, Y) & shapely.contains_xy(inner, X, Y)
        if not k.any(): continue
        up = ground(X[k], Y[k]) - w["z"]
        a = float((up > 0.02).sum())
        if a >= 1:
            land += a
            j = int(np.argmax(up))
            note("35 land standing in the water", a, at(X[k][j], Y[k][j]), f"{a:.0f} m2 above the water at {w['z']:.1f} m, up to {up[j]:.1f} m")
    fig["land in water m2"] = fig.get("land in water m2", 0) + land
    if cp:
        works = [(shapely.union_all([wat, b, v]), lv) for (wat, lv), b, v in zip(cp["water"], cp["banks"], cp["verges"])]
        for w, g in rivers:
            if w.get("c") == "canal": continue
            for piece, lv in works:
                if not piece.intersects(g): continue
                x = piece.intersection(g.buffer(-0.05)).intersection(inner)
                if x.area > 1:
                    c = x.representative_point()
                    note("35 canal works in a river", x.area, at(c.x, c.y), f"{x.area:.0f} m2 of the canal (level {lv:.1f}) in water at {w['z']:.1f}")
                    fig["canal in river m2"] = fig.get("canal in river m2", 0) + x.area
    levels = [(g, w["z"]) for w, g in rivers]
    if cp: levels += [(wat, lv) for wat, lv in cp["water"] if wat.intersects(box(*m["b"]))]
    steps = [LineString([q[:2] for q in wf["p"]]).buffer(3) for wf in m.get("wf") or [] if len(wf["p"]) > 1]
    if cp: steps += [lk["zone"] for lk in cp["locks"]]
    for i in range(len(levels)):
        for j in range(i + 1, len(levels)):
            (a, za), (b, zb) = levels[i], levels[j]
            if abs(za - zb) <= LEVELS_AGREE or a.distance(b) > 0.5: continue
            touch = a.buffer(0.5).intersection(b.buffer(0.5))
            if touch.is_empty or any(s.intersects(touch) for s in steps): continue
            c = touch.representative_point()
            if not inner.contains(c): continue
            note("35 touching water at two levels", abs(za - zb), at(c.x, c.y), f"{za:.2f} m and {zb:.2f} m")
            fig["water level steps"] = fig.get("water level steps", 0) + 1


def fences_on_ways(m, sheet, cp, note, at, inner, fig):
    """36. No wall, fence or hedge stands more than FENCE_IN inside water, the canal's banks and
    towpath, its verges, a lock's coping and paving, or a path's face (measured on each one's
    interior: check_tile.interior_length). A river's bank has no face of its own in the packs yet,
    so it can't be counted."""
    places = []
    wat = [_poly(w["r"][0], w["r"][1:]) for w in m.get("wp") or [] if len(w["r"][0]) >= 3 and not (cp and w.get("c") == "canal")]
    if cp: wat += [w for w, _ in cp["water"]]
    places.append(("water", wat))
    if cp:
        places += [("the canal's bank", cp["banks"]), ("the canal's verge", cp["verges"]), ("a lock's paving", [lk["walls"] for lk in cp["locks"]])]
    if sheet.ok:
        pu = sheet.union(("path", "grass", "dirt", "gravel"))
        places.append(("a path", [g for g in getattr(pu, "geoms", [pu]) if not g.is_empty]))
    sq = box(*m["b"]).buffer(5)
    places = [(name, [g for g in gs if g.intersects(sq)]) for name, gs in places]
    places = [(name, gs, shapely.STRtree(gs)) for name, gs in places if gs]
    tot = {}
    for b in m.get("br") or []:
        if len(b["p"]) < 2: continue
        ln = LineString([q[:2] for q in b["p"]])
        if not inner.intersects(ln): continue
        best = max(((interior_length(ln, gs, tree), name, gs, tree) for name, gs, tree in places), default=(0, "", [], None), key=lambda b: b[0])
        if best[0] > FENCE_IN:
            inside = [ln.intersection(best[2][int(k)].buffer(-0.05)) for k in best[3].query(ln)]
            c = max(inside, key=lambda g: g.length).interpolate(0.5, normalized=True)
            tot[best[1]] = tot.get(best[1], 0) + best[0]
            note("36 fence on water or a way", best[0], at(c.x, c.y), f"{b['c']} {best[0]:.1f} m in {best[1]}")
    for k, v in tot.items(): fig[f"fence in {k} m"] = fig.get(f"fence in {k} m", 0) + v


def sheet_holes(m, land, note, at, inner, fig):
    """With the sheet, a cell drawn as no ground at all must be wholly under faces: the part of it no
    face covers is a hole through the ground, which shows the sky's colour."""
    T = m["t"]
    js, is_ = np.nonzero(land.covered & ~land.mixed)
    if not len(js): return
    x0, y0 = T["x0"] + is_ * T["dx"], T["y0"] + js * T["dy"]
    cells = shapely.box(x0, y0, x0 + T["dx"], y0 + T["dy"])
    gap = shapely.area(shapely.difference(cells, land.faces))
    for k in np.nonzero(gap > 0.05)[0].tolist():
        c = cells[k].centroid
        if not inner.contains(c): continue
        fig["sheet holes m2"] = fig.get("sheet holes m2", 0) + float(gap[k])
        note("26 hole in the ground beside a face", float(gap[k]), at(c.x, c.y), f"{gap[k]:.1f} m2 of a cell left undrawn")


def ground_measures(m, tag, note, f, off_deck=None):
    """Rules 24 on, for one square; returns the square's figures (areas, lengths, shares) by name."""
    fig = {}
    if "t" not in m: return fig
    sq = box(*m["b"])
    inner = sq.buffer(-EDGE)
    at = lambda x, y: (tag, round(float(x)), round(float(y)))
    ground = terrain(m["t"])
    sheet = Sheet(m)
    land = None
    if GROUND_SHEET and sheet.ok and m.get("gs"):
        D, _ = drawn_terrain(m, sheet, faces=False)
        sink = gsheet.read(m["gs"], m["t"])[1] - D
        land = cdt_land(m, f, sink) if GROUND_CDT else gsheet.Land(m, sink=sink)
        drawn = land.ground
        # (the land as drawn, carved to meet the faces, for the water's rules)
        ground = terrain(dict(m["t"], h=np.round((gsheet.read(m["gs"], m["t"])[1] - m["t"]["z0"]) * 10).ravel().tolist()))
    else:
        D, drawn = drawn_terrain(m, sheet)
    if off_deck is None:
        decks = [LineString([q[:2] for q in r["p"]]).buffer(9) for r in m.get("rd") or [] if len(r["p"]) > 1 and any(_flags(r))]
        decks += [LineString([q[:2] for q in t["p"]]).buffer(8) for t in m.get("tn") or [] if len(t["p"]) > 1]
        dtree = shapely.STRtree(decks)
        def off_deck(p):
            out = np.ones(len(p), bool)
            if len(decks): out[dtree.query(p, predicate="within")[0]] = False
            return out
    walk = (lambda x, y: sheet.top(x, y, drawn)[0]) if sheet.ok else drawn
    if sheet.ok:
        path_tilt(m, sheet, off_deck, note, at, inner, fig)
        things_in_paths(m, sheet, note, at, inner, fig)
        face_edges(m, sheet, drawn, note, at, inner, fig, land)
        if land is not None: sheet_holes(m, land, note, at, inner, fig)
        face_joins(m, sheet, D, drawn, note, at, inner, fig)
    # (a deck's end comes down to the survey's grid as the game reads it, map.ts trueGround: the
    # sheet's carving is drawing only)
    bridges(m, f, sheet, drawn, terrain(m["t"]), note, at, sq, fig)
    for w in tunnel_mesh(*_root_of(f)):
        if sq.contains(Point(w["x"], w["y"])):
            note(w["rule"], w["score"], at(w["x"], w["y"]), w["what"])
            fig[w["rule"][3:]] = fig.get(w["rule"][3:], 0) + 1
    flights(m, sheet, walk, note, at, inner, fig)
    cp = canal_pieces(*_root_of(f))
    locks(cp, note, at, sq, fig)
    water(m, cp, ground, note, at, sq, inner, fig)
    fences_on_ways(m, sheet, cp, note, at, inner, fig)
    churches_drawn(m, *_root_of(f), note, at, fig)
    played(m, f, sheet, note, at, sq, inner, fig)
    return fig


# ---- 39 on: faults found by playing ------------------------------------------------------------

GIVES_WAY = {"primary", "secondary", "tertiary", "residential", "unclassified"}   # tools/streets.py KERBED: the streets it paints give-way lines on
RANK = {"trunk": 6, "primary": 5, "secondary": 4, "tertiary": 3, "unclassified": 2, "residential": 2, "living_street": 1}   # tools/streets.py, which gives way to which
MARK_OFF = 0.1       # metres of a marking off the carriageway before it counts
SQUARE_TO = 10.0     # degrees a give-way or stop line may lie off square across its street
STRAIGHT_ON = 30.0   # degrees within which a street leaving a junction runs straight on
SEAM_STEP = 0.03     # metres two squares' faces may differ in height where they meet
ROAD_STEP = 0.1      # metres a carriageway triangle may rise across before a steep one counts as a step
ROAD_PITCH = 0.5     # the steepest a carriageway triangle may climb (1 in 2: no street in Bath is near it)
SERVICE_IN = 0.3     # metres in from a kerbed street's edge that a lane's or yard's face may not reach
RAIL_ON = 0.4        # metres of a flight's handrail standing on a pavement or road before it counts


def _dir_at(line, pt, reach=1.0):
    """The unit direction of a line where it passes nearest a point."""
    s = line.project(pt)
    a, b = line.interpolate(max(0.0, s - reach)), line.interpolate(min(line.length, s + reach))
    dx, dy = b.x - a.x, b.y - a.y
    l = math.hypot(dx, dy) or 1.0
    return dx / l, dy / l


def _off_square(u, v):
    """Degrees two directions are off square to each other (0 when at right angles)."""
    return abs(90.0 - math.degrees(math.acos(min(1.0, abs(u[0] * v[0] + u[1] * v[1])))))


def _off_line(u, v):
    """Degrees two directions are off lying along each other, either way round."""
    return math.degrees(math.acos(min(1.0, abs(u[0] * v[0] + u[1] * v[1]))))


def _street_lines(m):
    """The square's carriageways off any bridge: each record and its line."""
    out = []
    for r in m.get("rd") or []:
        if len(r["p"]) > 1 and r["c"] in VEHICLE and not any(_flags(r)):
            out.append((r, LineString([q[:2] for q in r["p"]])))
    return out


@functools.lru_cache(maxsize=16)
def _streets_of(path):
    return _street_lines(json.load(open(path))) if os.path.exists(path) else []


def _streets_round(m, f):
    """This square's carriageways and the next squares' within 30 m of it, a street cut at a square's
    side joined up again with its piece over the side, so a junction just over the side is seen."""
    tag = os.path.basename(f)[:-5]
    out = _street_lines(m)
    try: ti, tj = map(int, tag.split("_"))
    except ValueError: return out
    near = box(*m["b"]).buffer(30)
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            if a or b:
                out += [(r, l) for r, l in _streets_of(os.path.join(os.path.dirname(f), f"{ti + a}_{tj + b}.json")) if l.intersects(near)]
    x0, y0, x1, y1 = m["b"]
    on_side = lambda p: min(abs(p[0] - x0), abs(p[0] - x1), abs(p[1] - y0), abs(p[1] - y1)) < 0.5
    joined, used = [], set()
    for i, (r, l) in enumerate(out):
        if i in used: continue
        used.add(i)
        for j, (o, ol) in enumerate(out):
            if j in used or o.get("n") != r.get("n") or o["c"] != r["c"]: continue
            ends = [(p, q) for p in (l.coords[0], l.coords[-1]) for q in (ol.coords[0], ol.coords[-1]) if on_side(p) and math.dist(p, q) < 0.5]
            if ends:
                merged = shapely.line_merge(shapely.union_all([l, ol]))
                if merged.geom_type == "LineString":
                    l = merged; used.add(j)
        joined.append((r, l))
    return joined


def markings(m, f, sheet, note, at, sq, fig):
    """39. Road markings (furniture.ts: mk's centre dashes and give-way lines, cx's stop lines, studs and
    zebra stripes) lie on the carriageway as drawn, the road and service faces, and are square to it:
    (a) none lies off the carriageway by more than MARK_OFF; (b) a give-way line and a crossing's stop
    line lie square across their street, within SQUARE_TO; (c) a give-way line is on the street that
    gives way: not across one running straight on with no side road, or past only lesser ones, nor
    where no street meets it at all, there being no end of its street within reach where it meets
    one it gives way to; (d) and it stands behind the line of the other street's kerb (its carriageway's
    edge, run on across the mouth of the junction), not out in that street's carriageway."""
    if not sheet.ok: return
    cars = sheet.union(("road", "service"))
    if cars.is_empty: return
    # (near the square's own sides the next square's faces carry on; a bridge's deck is its own)
    own = box(*m["b"]).buffer(-0.5)
    decks = [LineString([q[:2] for q in r["p"]]).buffer(_road_half(r["c"], r.get("w")) + 2) for r in m.get("rd") or [] if len(r["p"]) > 1 and any(_flags(r))]
    if decks: own = own.difference(shapely.union_all(decks))
    streets = _streets_round(m, f)
    if not streets: return
    stree = shapely.STRtree([l for _, l in streets])
    totals = dict(marks=0, off=0, crooked=0, through=0, back=0)

    def off_by(g):
        return g.intersection(own).difference(cars).length if g.geom_type == "LineString" else g.intersection(own).difference(cars).area

    mk = m.get("mk") or []
    for q in mk:
        if q[6]: continue
        seg = LineString([q[:2], q[2:4]])
        if not own.contains(seg.centroid): continue
        totals["marks"] += 1
        out = off_by(seg)
        if out > MARK_OFF:
            totals["off"] += 1
            note("39 road marking off the carriageway", out, at(seg.centroid.x, seg.centroid.y), f"centre dash {out:.1f} m off the road")
    # give-way lines: the dashes of one junction's line pair gathered together
    gw = [q for q in mk if q[6]]
    if gw:
        segs = [LineString([q[:2], q[2:4]]) for q in gw]
        blobs = shapely.union_all([s.buffer(0.8) for s in segs])
        btree = shapely.STRtree(segs)
        for blob in getattr(blobs, "geoms", [blobs]):
            mine = [segs[int(k)] for k in btree.query(blob, predicate="intersects")]
            c = shapely.union_all(mine).centroid
            if not own.contains(c): continue
            totals["marks"] += 1
            out = sum(off_by(s) for s in mine)
            # the line's direction across, from its two ends
            ends = np.asarray([p for s in mine for p in s.coords])
            ax = ends - ends.mean(0)
            w, vec = np.linalg.eigh(ax.T @ ax)
            d = vec[:, -1]
            if out > MARK_OFF:
                totals["off"] += 1
                note("39 road marking off the carriageway", out, at(c.x, c.y), f"give-way line {out:.1f} m off the road")
            # its street: of the carriageways it lies on, the one it is most nearly square across
            best = None
            for k in stree.query(c.buffer(1.0)):
                r, l = streets[int(k)]
                if r["c"] not in GIVES_WAY or l.distance(c) > _road_half(r["c"], r.get("w")) + 0.5: continue
                off = _off_square(d, _dir_at(l, c))
                if best is None or off < best[0]: best = (off, r, l)
            if best is None: continue
            off, r, l = best
            name = r.get("n") or r["c"]
            if off > SQUARE_TO:
                totals["crooked"] += 1
                note("39 give-way or stop line not square to its street", off, at(c.x, c.y), f"give-way line on {name!r} {off:.0f} degrees off square")
            # the junction it gives way at: an end of its street within reach where it meets a street
            # it gives way to (the map splits a street wherever its width changes or a lane joins, and
            # the nearer end may be only that)
            line = shapely.union_all(mine)
            meets = first = None
            same = lambda o: o.get("n") == r.get("n") and o["c"] == r["c"]
            todo = [(Point(l.coords[0]), r), (Point(l.coords[-1]), r)]
            looked = 0
            while todo and looked < 8:
                todo.sort(key=lambda e: e[0].distance(c))
                end, mine_r = todo.pop(0)
                looked += 1
                if end.distance(c) > 20: break
                # which way the street runs out of the junction, read along it rather than from the
                # line's middle, which may lie right at a split in the street
                ux, uy = end.x - c.x, end.y - c.y
                ul = math.hypot(ux, uy) or 1.0
                ux, uy = ux / ul, uy / ul
                ahead, side, runs = [], [], []
                for k in stree.query(end.buffer(1.0)):
                    o, ol = streets[int(k)]
                    if o is r or o is mine_r or ol.distance(end) > 1.0: continue
                    so = ol.project(end)
                    if same(o) and (so < 1.0 or so > ol.length - 1.0):
                        runs.append((o, ol, Point(ol.coords[-1] if so < 1.0 else ol.coords[0])))
                    for t in (so + 3.0, so - 3.0):
                        if not 0 <= t <= ol.length: continue
                        p = ol.interpolate(t)
                        vx, vy = p.x - end.x, p.y - end.y
                        vl = math.hypot(vx, vy)
                        if vl < 1.0: continue
                        turn = math.degrees(math.acos(max(-1.0, min(1.0, (vx * ux + vy * uy) / vl))))
                        (ahead if turn < STRAIGHT_ON else side).append((o, ol))
                if len(runs) == 1 and len(ahead) + len(side) == 1:
                    # only the street itself running on: no junction here, so on along it
                    todo.append((runs[0][2], runs[0][0]))
                    continue
                gives_way = (ahead or side) and not (ahead and all(RANK.get(o["c"], 0) < RANK.get(r["c"], 0) for o, _ in side))
                if gives_way:
                    meets = (end, ahead, side)
                    break
                if first is None and end.distance(c) <= 15: first = (ahead, side)
                if len(runs) == 1: todo.append((runs[0][2], runs[0][0]))
            if meets is None:
                if first is None: continue
                ahead, side = first
                totals["through"] += 1
                if not ahead and not side:
                    note("39 give-way line across a street with right of way", RANK.get(r["c"], 0), at(c.x, c.y), f"across {name!r}, where no street meets it")
                else:
                    runs = ", ".join(sorted({o.get("n") or o["c"] for o, _ in ahead}))
                    note("39 give-way line across a street with right of way", RANK.get(r["c"], 0), at(c.x, c.y),
                         f"across {name!r}, which runs on as {runs!r}" + (f" past {', '.join(sorted({o.get('n') or o['c'] for o, _ in side}))!r}" if side else ""))
                continue
            end, ahead, side = meets
            # the street it gives way to (not its own run on across the junction): the line stands
            # behind the line of that street's kerb, not out in its carriageway (where the lesser
            # street's mouth crosses the other's pavement it is road)
            back = 0.0
            for o, ol in side + [(o, ol) for o, ol in ahead if RANK.get(o["c"], 0) > RANK.get(r["c"], 0)]:
                if o["c"] not in GAME_KERBED: continue
                back = max(back, _road_half(o["c"], o.get("w")) - ol.distance(line))
            if back > 0.3:
                totals["back"] += 1
                note("39 give-way line short of the other street's kerb line", back, at(c.x, c.y), f"on {name!r}, {back:.1f} m out in the other street's carriageway")
    # crossings and lights: their stop lines, studs and stripes as furniture.ts lays them
    for x, y, z, a, kind, w in ((*q[:6],) for q in m.get("cx") or []):
        c = Point(x, y)
        if not own.contains(c): continue
        totals["marks"] += 1
        h, ux, uy = w / 2, math.cos(a), math.sin(a)
        nx, ny = -uy, ux
        quad = lambda s0, s1, t0, t1: Polygon([(x + ux * s + nx * t, y + uy * s + ny * t) for s, t in ((s0, t0), (s1, t0), (s1, t1), (s0, t1))])
        parts = []
        if kind == "z":
            t = -h + 0.25
            while t + 0.5 <= h - 0.15: parts.append(quad(-1.3, 1.3, t, t + 0.5)); t += 1.0
        else:
            sl = 3 if kind == "p" else 2
            parts += [quad(-sl - 0.15, -sl + 0.15, 0, h - 0.2), quad(sl - 0.15, sl + 0.15, -h + 0.2, 0)]
        out = sum(off_by(p) for p in parts if p.is_valid) / 0.3
        what = {"z": "zebra", "p": "crossing", "s": "lights"}.get(kind, kind)
        if out > MARK_OFF:
            totals["off"] += 1
            note("39 road marking off the carriageway", out, at(x, y), f"{what}'s stripes or stop lines {out:.1f} m off the road")
        best = None
        for k in stree.query(c.buffer(1.0)):
            r, l = streets[int(k)]
            if l.distance(c) > _road_half(r["c"], r.get("w")) + 0.5: continue
            off = _off_line((ux, uy), _dir_at(l, c, 3.0))
            if best is None or off < best[0]: best = (off, r)
        if best and best[0] > SQUARE_TO:
            totals["crooked"] += 1
            note("39 give-way or stop line not square to its street", best[0], at(x, y), f"{what} on {best[1].get('n') or best[1]['c']!r} {best[0]:.0f} degrees off square")
    for k, v in totals.items(): fig[f"marking {k}"] = fig.get(f"marking {k}", 0) + v


def lanes_in_streets(m, sheet, note, at, inner, fig):
    """40. A lane's, yard's or drive's carriageway (the service face, a slightly lighter grey) stops at the
    kerbed street it meets: none of it lies more than SERVICE_IN inside that street's carriageway, as a
    wedge or a point of the lighter grey into the road, or a run of thin triangles of it along the
    street. Each place's score is its area in m2."""
    if not sheet.ok: return
    svc = sheet.union(("service",))
    if svc.is_empty: return
    strips = [(r, l.buffer(_road_half(r["c"], r.get("w")) - SERVICE_IN, cap_style="flat"))
              for r, l in _street_lines(m) if r["c"] in GAME_KERBED | {"trunk"} and _road_half(r["c"], r.get("w")) > SERVICE_IN + 0.5]
    if not strips: return
    tree = shapely.STRtree([s for _, s in strips])
    over = svc.intersection(shapely.union_all([s for _, s in strips])).intersection(inner)
    total = 0.0
    for g in getattr(over, "geoms", [over]):
        if g.geom_type != "Polygon" or g.area < 0.5: continue
        total += g.area
        c = g.representative_point()
        k = tree.query(c, predicate="intersects")
        name = (strips[int(k[0])][0].get("n") or strips[int(k[0])][0]["c"]) if len(k) else ""
        note("40 lane's face in a street's carriageway", g.area, at(c.x, c.y), f"{g.area:.1f} m2 of the lighter grey in {name!r}")
    fig["service face in a street m2"] = fig.get("service face in a street m2", 0) + total


def road_steps(m, sheet, note, at, inner, fig):
    """41. Where two pieces of carriageway meet (a side street on to a main one, two streets at a
    junction), the road blends from one level to the other: no triangle of road or lane face climbs
    steeper than ROAD_PITCH, a step in the road with the earth showing down its face. Each place's
    score is the most its triangles rise across, in metres."""
    if not sheet.ok: return
    sel = np.nonzero(sheet.kind_mask(("road", "service")))[0]
    if not len(sel): return
    A, B, C = sheet.A[sel], sheet.B[sel], sheet.C[sel]
    n = np.cross(B - A, C - A)
    flat = np.abs(n[:, 2])
    pitch = np.hypot(n[:, 0], n[:, 1]) / np.maximum(flat, 1e-9)
    rise = np.maximum(np.maximum(A[:, 2], B[:, 2]), C[:, 2]) - np.minimum(np.minimum(A[:, 2], B[:, 2]), C[:, 2])
    mid = (A + B + C)[:, :2] / 3
    bad = (pitch > ROAD_PITCH) & (rise > ROAD_STEP) & (flat > 1e-6) & shapely.contains_xy(inner, mid[:, 0], mid[:, 1])
    if not bad.any(): return
    idx = np.nonzero(bad)[0]
    blobs = shapely.union_all([sheet.polys[sel[i]].buffer(0.3) for i in idx])
    tree = shapely.STRtree(shapely.points(mid[idx]))
    total = 0
    for g in getattr(blobs, "geoms", [blobs]):
        mine = idx[tree.query(g, predicate="intersects")]
        if not len(mine): continue
        up = float(rise[mine].max())
        total += 1
        c = g.representative_point()
        note("41 step in the carriageway", up, at(c.x, c.y), f"the road rises {up:.2f} m at up to 1 in {1 / float(pitch[mine].max()):.1f}")
    fig["road steps"] = fig.get("road steps", 0) + total


def square_joins(m, f, sheet, note, at, fig):
    """42. The faces meet the next square's as one: along this square's north and east sides, sampled
    every half metre a few centimetres either side, a face on one side has the same kind of face at the
    same height (within SEAM_STEP) on the other. Two kinds of carriageway (a street's and a lane's) shade
    differently, so a street drawn as one in this square and the other in the next shows a seam down it;
    a face that stops at the side shows the grass or a step there. Each place's score is its length in
    metres."""
    if not sheet.ok: return
    tag = os.path.basename(f)[:-5]
    try: ti, tj = map(int, tag.split("_"))
    except ValueError: return
    x0, y0, x1, y1 = m["b"]
    total = 0.0
    for nb, xs, ys, side in ((f"{ti}_{tj + 1}", None, y1, "north"), (f"{ti + 1}_{tj}", x1, None, "east")):
        g = os.path.join(os.path.dirname(f), nb + ".json")
        if not os.path.exists(g): continue
        o = json.load(open(g))
        if o.get("centre"): _unmask(o, _set_pieces(tuple(o["centre"])))
        other = Sheet(o)
        if not other.ok: continue
        if ys is not None:
            t = np.arange(x0 + 0.25, x1, 0.5)
            ax, ay, bx, by = t, np.full(len(t), ys - 0.03), t, np.full(len(t), ys + 0.03)
        else:
            t = np.arange(y0 + 0.25, y1, 0.5)
            ax, ay, bx, by = np.full(len(t), xs - 0.03), t, np.full(len(t), xs + 0.03), t
        ta, za = sheet.hit(ax, ay)
        tb, zb = other.hit(bx, by)
        ka = np.where(ta >= 0, sheet.K[np.maximum(ta, 0)], -1)
        kb = np.where(tb >= 0, other.K[np.maximum(tb, 0)], -1)
        either = (ka >= 0) | (kb >= 0)
        bad = either & ((ka != kb) | (np.abs(np.nan_to_num(za) - np.nan_to_num(zb)) > SEAM_STEP))
        # runs of failing samples, each a place
        k = 0
        while k < len(t):
            if not bad[k]: k += 1; continue
            j = k
            while j + 1 < len(t) and bad[j + 1]: j += 1
            length = (j - k + 1) * 0.5
            if length >= 1.0:
                total += length
                mid = (k + j) // 2
                name = lambda kk: FACE_KINDS[kk] if kk >= 0 else "nothing"
                kinds = {(name(ka[i]), name(kb[i])) for i in range(k, j + 1)}
                if all(a == b for a, b in kinds):
                    dz = float(np.nanmax(np.abs(za[k:j + 1] - zb[k:j + 1])))
                    what = f"{kinds.pop()[0]} {dz:.2f} m apart in height"
                else:
                    a, b = max(((a, b) for a, b in kinds if a != b), key=lambda p: sum(1 for i in range(k, j + 1) if (name(ka[i]), name(kb[i])) == p))
                    what = f"{a} here, {b} in {nb}"
                note("42 faces don't meet the next square's", length, at(ax[mid], ay[mid]), f"{length:.0f} m along the {side} side: {what}")
            k = j + 1
    fig["square side mismatched m"] = fig.get("square side mismatched m", 0) + total


def _leaving(l, end, reach=1.5):
    """The unit direction a line leaves one of its ends (0 or -1) in, over its first reach metres."""
    s = 0.0 if end == 0 else l.length
    a = l.interpolate(s)
    b = l.interpolate(min(reach, l.length) if end == 0 else max(0.0, l.length - reach))
    dx, dy = b.x - a.x, b.y - a.y
    d = math.hypot(dx, dy) or 1.0
    return dx / d, dy / d


def flights_and_rails(m, sheet, note, at, inner, fig):
    """43. Flights of steps (furniture.ts stepsDetail) keep to themselves: no two flights' treads lie
    over each other (beyond where one runs on from the other's end), and no handrail stands out on a
    pavement or the road, more than RAIL_ON of it on a pavement, road or lane face. Scores: the
    overlap's area in m2, the rail's length on the paving in metres."""
    if not sheet.ok: return
    fl = []
    for r in m.get("rd") or []:
        if r["c"] != "steps" or len(r["p"]) < 2 or any(_flags(r)): continue
        l = LineString([q[:2] for q in r["p"]])
        if l.length < 1: continue
        fl.append((r, l, l.buffer((r.get("w") or 1.8) / 2, cap_style="flat")))
    if not fl: return
    tree = shapely.STRtree([s for *_, s in fl])
    totals = dict(crossing=0, rails=0)
    for i, (r, l, s) in enumerate(fl):
        for j in tree.query(s, predicate="intersects"):
            if j <= i: continue
            o, ol, os_ = fl[int(j)]
            both = s.intersection(os_)
            # (one flight running on from another's end shares a landing with it, unless it turns
            # straight back over the other's first treads)
            back = False
            for e, f_ in ((l, 0), (l, -1)):
                for g_, h_ in ((ol, 0), (ol, -1)):
                    if Point(e.coords[f_]).distance(Point(g_.coords[h_])) >= 1.0: continue
                    u, v = _leaving(e, f_), _leaving(g_, h_)
                    back |= math.degrees(math.acos(max(-1.0, min(1.0, u[0] * v[0] + u[1] * v[1])))) < 40
                    both = both.difference(Point(e.coords[f_]).buffer(0.9)).difference(Point(g_.coords[h_]).buffer(0.9))
            if back: both = s.intersection(os_)
            if both.area < 0.3 or not inner.contains(both.representative_point()): continue
            totals["crossing"] += 1
            c = both.representative_point()
            note("43 flights of steps over each other", both.area, at(c.x, c.y), f"{r.get('n') or 'steps'!r} and {o.get('n') or 'steps'!r} share {both.area:.1f} m2" + (", one turning straight back over the other" if back else ""))
    paving = ("pave", "road", "service")
    for r, l, s in fl:
        sides = (r.get("hr") or 0) & 7
        if not sides or not inner.contains(Point(l.coords[0])): continue
        w = r.get("w") or 1.8
        for bit, off in ((1, w / 2 - 0.08), (2, -w / 2 + 0.08), (4, 0.0)):
            if not sides & bit: continue
            ss = np.arange(0.15, l.length - 0.15, 0.25)
            if not len(ss): continue
            pts = [l.interpolate(t) for t in ss]
            dirs = [_dir_at(l, p, 0.3) for p in pts]
            px = np.array([p.x - d[1] * off for p, d in zip(pts, dirs)])
            py = np.array([p.y + d[0] * off for p, d in zip(pts, dirs)])
            ti, _ = sheet.hit(px, py, paving)
            on = int((ti >= 0).sum())
            length = on * 0.25
            if length > RAIL_ON:
                totals["rails"] += 1
                k = int(np.nonzero(ti >= 0)[0][on // 2])
                note("43 handrail standing on a pavement or road", length, at(px[k], py[k]), f"{r.get('n') or 'steps'!r}: {length:.1f} m of its rail on {FACE_KINDS[sheet.K[ti[k]]]}")
    for k, v in totals.items(): fig[f"flights {k}"] = fig.get(f"flights {k}", 0) + v


def played(m, f, sheet, note, at, sq, inner, fig):
    """Rules 39 to 43, for one square. (Each looks at what lies within the square itself, so they run
    up to a metre from its sides rather than EDGE: what they measure is drawn there by this square.)"""
    inner = sq.buffer(-1.0)
    markings(m, f, sheet, note, at, sq, fig)
    lanes_in_streets(m, sheet, note, at, inner, fig)
    road_steps(m, sheet, note, at, inner, fig)
    square_joins(m, f, sheet, note, at, fig)
    flights_and_rails(m, sheet, note, at, inner, fig)


@functools.lru_cache(maxsize=2)
def church_outlines(map_id):
    """The outlines (model metres) of the map's buildings OpenStreetMap or Wikidata says were built as
    churches, as the build reads them (tools/worship.py)."""
    import lzma
    from area import area
    from worship import churches, built_as_church, name_says_church
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", map_id, "osm.geojson.xz")
    if not os.path.exists(src): return []
    known = churches(map_id)
    lon0, lat0 = area(map_id).centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    out = []
    for f in json.load(lzma.open(src))["features"]:
        if f["geometry"]["type"] != "Polygon" or not built_as_church(f["properties"], known): continue
        g = Polygon([((x - lon0) * kx, (y - lat0) * ky) for x, y in f["geometry"]["coordinates"][0]]).buffer(0)
        if not g.is_empty: out.append(g)
    ov = os.path.join(os.path.dirname(src), "building.geojson.xz")
    for f in json.load(lzma.open(ov))["features"] if os.path.exists(ov) else []:
        q = f["properties"]
        if f["geometry"]["type"] != "Polygon" or not (q.get("class") in ("church", "chapel", "cathedral") or name_says_church((q.get("names") or {}).get("primary"))): continue
        g = Polygon([((x - lon0) * kx, (y - lat0) * ky) for x, y in f["geometry"]["coordinates"][0]]).buffer(0)
        if not g.is_empty: out.append(g)
    return out


def churches_drawn(m, root, map_id, note, at, fig):
    """37. Each church outline whose middle is in the square is drawn as a church by some building
    covering half of it (a set piece's buildings are left out: the game draws its own)."""
    sq = box(*m["b"])
    blds = [(_poly(b["r"][0]), b.get("c")) for b in m.get("bl") or [] if len((b.get("r") or [[]])[0]) >= 3]
    tree = shapely.STRtree([g for g, _ in blds]) if blds else None
    n = 0
    for g in church_outlines(map_id):
        c = g.representative_point()
        if not sq.contains(c) or tree is None: continue
        over = [blds[int(k)] for k in tree.query(g) if blds[int(k)][0].intersection(g).area > 0.5 * min(blds[int(k)][0].area, g.area)]
        if not over or any(k == "church" for _, k in over): continue
        n += 1
        note("37 church not drawn as one", g.area, at(c.x, c.y), f"drawn as {over[0][1]}, {g.area:.0f} m2")
    if n: fig["churches not drawn as one"] = fig.get("churches not drawn as one", 0) + n


@functools.lru_cache(maxsize=2)
def tunnel_mesh(root, map_id):
    """Rule 32's findings over the whole map, from tools/tunnel_mesh.ts bundled with the game's code."""
    # (the tunnels' textures are painted pixel by pixel, so their canvas needs pixels to paint)
    return _railway_check("tunnel_mesh.ts", root, map_id, "({data:new Uint8ClampedArray(4)})")


def main():
    """python3 -I tools/check_more.py <map> [web/public/maps] [--tiles ti,tj ...]: rules 24 on alone,
    with each square's figures, for the ground's baselines."""
    import glob, sys, collections
    args = sys.argv[1:]
    map_id = args[0]
    root = args[1] if len(args) > 1 and not args[1].startswith("--") else "web/public/maps"
    if "--tiles" in args:
        k = args.index("--tiles")
        files = [os.path.join(root, map_id, f"{a.replace(',', '_')}.json") for a in args[k + 1:] if not a.startswith("--")]
    else:
        files = sorted(glob.glob(os.path.join(root, map_id, "*_*.json")))
    counts, worst, figs = collections.Counter(), collections.defaultdict(list), collections.Counter()
    for f in files:
        found = []
        m = json.load(open(f))
        tag = os.path.basename(f)[:-5]
        if m.get("centre"): _unmask(m, _set_pieces(tuple(m["centre"])))
        fig = ground_measures(m, tag, lambda rule, score, where, what: found.append((rule, score, where, what)), f)
        sc = collections.Counter(r for r, *_ in found)
        print(f"{tag}: " + ", ".join(f"{r.split(' ')[0]}:{n}" for r, n in sorted(sc.items())) , flush=True)
        print("    " + ", ".join(f"{k} {v:.1f}" if isinstance(v, float) else f"{k} {v}" for k, v in sorted(fig.items())), flush=True)
        counts.update(sc); figs.update(fig)
        for rule, score, where, what in found: worst[rule].append((score, where, what))
    print("rule failures across", len(files), "map files:")
    for rule in sorted(counts):
        print(f"  {counts[rule]:6d}  {rule}")
        for score, where, what in sorted(worst[rule], key=lambda w: -w[0])[:int(os.environ.get("SHOW", 4))]:
            print(f"           {where[0]:>8s} ({where[1]:>6},{where[2]:>6})  {what}")
    print("figures:")
    for k, v in sorted(figs.items()): print(f"  {v:12.1f}  {k}")
    if figs.get("path m2"):
        for t in (2, 5, 10): print(f"  {100 * figs[f'path tilted >{t} deg m2'] / figs['path m2']:11.1f}%  of path area tilted over {t} degrees")


if __name__ == "__main__":
    main()
