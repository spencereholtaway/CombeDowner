"""Lay out a map's railways for the game: the track, with its bridges and tunnels, the station
platforms, and the routes the trains run.

Usage: python3 -I tools/railway.py <map> <dir with the wide .geojson layers> <out.json>

e.g. python3 -I tools/railway.py combe-down data/raw/combe-down/wide web/public/maps/combe-down-rail.json

Reads the railway lines from Overture's segment layer (segment.geojson), keeping the working lines
(not the old ones that are footpaths now, nor the disused sidings), cut to the wide area's circle,
and the stations and platforms from its infrastructure layer (infrastructure.geojson). Heights
come from the same terrain tiles as the map (tools/terrain.py): the track follows the ground as a
railway is built over it, evened out, never steeper than 1 in 50, and carried straight from end to
end of each bridge and tunnel Overture marks (tools/profiles.py). Tracks side by side then agree,
so the bed they share is level across or falls gently (share_beds).

Trains run along routes: a route is the track followed from one edge of the circle to another,
going straight on at each set of points. Trains in Britain keep left, so where there are two
tracks side by side each route's trains go the way that keeps the other track on their right; a
single line has trains both ways.

Writes {"tracks", "routes", "platforms", "portals"}, positions in metres east (x) and north (y) of
the map centre and heights in metres above sea level:
- tracks: [{"n": line name, "p": [[x, y, z, 0 on the ground / 1 on a bridge / 2 in a tunnel, and on a
  bridge the ground under it], ...]}], points about 6 m apart.
- routes: [{"n": name, "t": [[track, 1 forwards or -1 backwards], ...], "st": [[distance along, station], ...],
  "both": 1 if trains run both ways}].
- routes also say where their trains are bound ("to", and "via" the stations they call at after this map, for
  the departure boards: SERVICES), and, on a line that carries on to another map (LINKS), whether this
  route's trains do ("on": 1 if the linked station is the last they call at here, so they go on there).
- platforms: [{"n": station, "r": [[x, y], ...] the edge, "z": the platform's top, "no": its number, if the data has one}].
- canopies: [{"r": [[x, y], ...] the outline, "z": the platform's top}] the canopies over platforms up off the ground,
  and "t": 1 on an outline that is left out of the squares but not drawn (the station's whole extent, or one canopy again).
- portals: [[x, y, z, angle, ground]] tunnel mouths, the angle pointing into the hill (east is 0, north a quarter turn),
  and the ground's height over the tunnel just inside it.
"""
import json, math, os, sys
import numpy as np
import shapely
from shapely.geometry import shape, Point, LineString
from shapely.ops import nearest_points

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from terrain import Terrain
from profiles import carry_profile, ease_grades

STEP = 6.0           # metres between points along the track
RAIL_SIGMA = 25.0    # metres along the line over which its height is evened out
RAIL_GRADE = 0.02    # the steepest the line climbs (1 in 50: the main line through Bath is gentler still)
ALONG = 6.0          # a track this near a platform runs alongside it
RAMP = 150.0         # metres the track takes to come back to its own height either side of a station
WANDER = 0.3         # a station's track that rises and falls less than this along it is left as it is

# Journeys between two maps, which neither map's own track shows: the train from Bath Spa runs on
# into Bradford-on-Avon's map. Each link names the two maps, the station at each end, the line the
# two ends belong to, and the real distance in metres: the ride takes that at V_LINK, which allows
# for slowing for the two stops on the way (Freshford and Avoncliff), so about ten minutes.
V_LINK = 26.0        # m/s, the local train's average over the valley line
LINKS = [
    # Bath Spa to Bradford-on-Avon: down the Wessex Main Line through Freshford and Avoncliff
    ("combe-down", "Bath Spa", "bradford-on-avon", "Bradford-on-Avon", "Wessex Main Line", 15500),
]

# The services to run, when the plain edge-to-edge search finds too many ways through a junction (it
# makes loops round the Bathampton loop and back, and the odd route that turns at Bath Spa). Each is
# a dict: `stops` in order, `line` to call the service, `kind` (1 the long-distance HSTs, 0 the local
# two-car units), and `lines` (the named lines the route runs on, which tells services apart that
# share their stops), and `to` and `via`, where its trains are bound and the stations they call at
# after this map, for the departure boards (web/src/railway.ts). The Wessex trains run down the Wessex line to Bradford-on-Avon but share the
# main line through Bath Spa and Oldfield Park, so the London and Bradford trains have the same stops
# and only the lines they run on tell them apart. Any route the search finds that matches a service
# is kept and named by it; routes matching none are dropped, so the timetable only ever shows trains
# that really run. A map with no entry keeps every route the search finds (for a map with no junction
# to make a mess of).
SERVICES = {
    "combe-down": [
        # the London trains: edge to edge along the Great Western Main Line alone, through Oldfield
        # Park and Bath Spa, run each way
        dict(stops=["Oldfield Park", "Bath Spa"], line="Great Western Main Line", kind=1, lines={"Great Western Main Line"},
             to="London Paddington", via=["Chippenham", "Swindon", "Didcot Parkway", "Reading"]),
        dict(stops=["Bath Spa", "Oldfield Park"], line="Great Western Main Line", kind=1, lines={"Great Western Main Line"},
             to="Bristol Temple Meads", via=[]),
        # the Wessex line down the valley to Bradford-on-Avon, each way: it runs along both the
        # Wessex line and the main line, which tells it from the London trains
        dict(stops=["Oldfield Park", "Bath Spa"], line="Wessex Main Line", kind=0, lines={"Great Western Main Line", "Wessex Main Line"},
             to="Westbury", via=["Freshford", "Avoncliff", "Bradford-on-Avon", "Trowbridge", "Westbury"]),
        dict(stops=["Bath Spa", "Oldfield Park"], line="Wessex Main Line", kind=0, lines={"Great Western Main Line", "Wessex Main Line"},
             to="Cardiff Central", via=["Keynsham", "Bristol Temple Meads", "Filton Abbey Wood", "Newport", "Cardiff Central"]),
    ],
    # Bradford-on-Avon: one station, so the two ways are told apart by `on`, whether the train goes
    # on to the linked map (Bath) from here
    "bradford-on-avon": [
        dict(stops=["Bradford-on-Avon"], line="Wessex Main Line", kind=0, lines={"Wessex Main Line"}, on=1,
             to="Cardiff Central", via=["Avoncliff", "Freshford", "Bath Spa", "Oldfield Park", "Keynsham", "Bristol Temple Meads", "Cardiff Central"]),
        dict(stops=["Bradford-on-Avon"], line="Wessex Main Line", kind=0, lines={"Wessex Main Line"}, on=0,
             to="Westbury", via=["Trowbridge", "Westbury"]),
    ],
}
EDGE = 60            # a track end this near the circle's edge is where trains come and go
CANOPY_REACH = 1.5  # metres past a platform's edge its canopy may overhang the track
CANOPY_SHARE = 0.5  # how much of a footprint over a raised platform makes it the platform's canopy
CANOPY_TRACK = 8.0  # metres of track under an outline that make it the station's extent rather than a canopy
CANOPY_RAISED = 2.0 # metres a platform stands over the ground for what's on it not to stand on the ground
COVER_AT = (4, 6, 8, 10, 12)   # metres into a tunnel from its mouth that the ground over it is read at
SHORT_TUNNEL = 50    # metres: a tunnel shorter than this is something going over the line, and has no mouths
ROAD_HALF = {"motorway": 7, "trunk": 6, "primary": 4.3, "secondary": 4, "tertiary": 3.5, "residential": 3, "unclassified": 2.8,
             "living_street": 2.5, "service": 1.8, "unknown": 2}     # half a road's width (the rest are paths: 1.5)
r1 = lambda v: round(float(v), 1)
TOY = {"miniature"}  # OpenStreetMap's railway values for a garden or park's ride-on railway, not a real line
TOY_SPUR = 30        # metres: ordinary rail this short joining only toy track is part of the model
TOUCH = 0.5          # metres: track ends this near are joined
TOY_MATCH = 1.5      # metres: an Overture segment this near toy track along most of it is that track


def open_runs(p):
    """Each stretch of a track's points [x, y, z, flag, ...] that is out in the open (not in a tunnel),
    as [x, y] points, run on to the tunnel mouths at its ends: halfway to the first point inside,
    where the mouths stand (`portals` below)."""
    runs, run = [], []
    for k, q in enumerate(p):
        if q[3] == 2:
            if run:
                run.append([(run[-1][0] + q[0]) / 2, (run[-1][1] + q[1]) / 2])
                runs.append(run)
                run = []
            continue
        if not run and k > 0 and p[k - 1][3] == 2:
            run.append([(p[k - 1][0] + q[0]) / 2, (p[k - 1][1] + q[1]) / 2])
        run.append(list(q[:2]))
    if run: runs.append(run)
    return runs


# The tunnel mouths' faces, as web/src/railway.ts headwalls() groups them (the same numbers): mouths
# facing the same way side by side open in one face, at the outermost of them.
PORTAL_TURN, PORTAL_DEPTH, PORTAL_SIDE, PORTAL_STAGGER, PORTAL_R = 0.35, 2.5, 16, 9, 3.6
PORTAL_LEAST, PORTAL_CROWN, BORE_LIT = 5, 7, 11


def portal_faces(portals):
    """Each face: the middle of its foot (x, y), the way in (ux, uy), the rails' height, its reach
    across (the bores' outer edges) and the height of the bores' crown over the rails."""
    groups = []
    for m in portals:
        for g in groups:
            if any(_with(m, o) for o in g): g.append(m); break
        else: groups.append([m])
    out = []
    for g in groups:
        ang = math.atan2(sum(math.sin(m[3]) for m in g), sum(math.cos(m[3]) for m in g))
        ux, uy = math.cos(ang), math.sin(ang)
        cx, cy = sum(m[0] for m in g) / len(g), sum(m[1] for m in g) / len(g)
        along = [(m[0] - cx) * ux + (m[1] - cy) * uy for m in g]
        across = [(m[1] - cy) * ux - (m[0] - cx) * uy for m in g]
        base = min(m[2] for m in g)
        grounds = [m[4] for m in g if len(m) > 4]
        cover = sum(grounds) / len(grounds) - base if grounds else None
        crown = min(PORTAL_CROWN, cover - 0.6) if cover is not None and cover >= PORTAL_LEAST + 0.6 else PORTAL_CROWN
        out.append(dict(x=cx + ux * min(along), y=cy + uy * min(along), ux=ux, uy=uy, z=base,
                        v0=min(across) - PORTAL_R, v1=max(across) + PORTAL_R, crown=crown))
    return out


def _with(m, o):
    turn = abs(math.atan2(math.sin(m[3] - o[3]), math.cos(m[3] - o[3])))
    dx, dy, ux, uy = m[0] - o[0], m[1] - o[1], math.cos(o[3]), math.sin(o[3])
    along, side = abs(dx * ux + dy * uy), abs(dy * ux - dx * uy)
    return turn < PORTAL_TURN and side < PORTAL_SIDE and (along < PORTAL_DEPTH or (side < 2 * PORTAL_R + 1 and along < PORTAL_STAGGER))


def toy_track(src, proj):
    """Where a miniature railway runs (OpenStreetMap's railway=miniature, in osm-rail.geojson):
    Overture has it as rail of no known gauge, like a real line, so it would be built full size.
    With it go the short pieces of ordinary rail that join nothing but toy track, or stand on a
    turntable that does (a model's engine shed road): a piece that is part of a named or
    main/branch line, or that runs on to any other track, stays. Returns the area to leave out
    (or None) and the OpenStreetMap ways it takes."""
    path = os.path.join(src, "osm-rail.geojson")
    if not os.path.exists(path): return None, []
    ways = [(proj(shape(f["geometry"])), f["properties"]) for f in json.load(open(path))["features"]
            if f["geometry"]["type"] == "LineString"]
    toy = [(g, p) for g, p in ways if p.get("railway") in TOY]
    if not toy: return None, []
    toy_all = shapely.unary_union([g for g, _ in toy])
    tables = [g for g, p in ways if p.get("railway") == "turntable"]
    rails = [(g, p) for g, p in ways if p.get("railway") == "rail"]
    spur = lambda g, p: g.length < TOY_SPUR and not p.get("name") and p.get("usage") not in ("main", "branch")
    real = shapely.unary_union([g for g, p in rails if not spur(g, p)] or [Point(0, 0).buffer(0)])
    toy_tables = [t for t in tables if t.distance(toy_all) < TOUCH and t.distance(real) >= TOUCH]
    taken = list(toy)
    for g, p in rails:
        if not spur(g, p) or g.distance(real) < TOUCH: continue
        joins = [t for t in tables if t.distance(g) < TOUCH]
        if any(t.distance(toy_all) >= TOUCH and t not in toy_tables for t in joins): continue
        if g.distance(toy_all) < TOUCH or any(t in toy_tables for t in joins): taken.append((g, p))
    return shapely.unary_union([g for g, _ in taken] + toy_tables).buffer(TOY_MATCH), [p.get("osm") for _, p in taken]


DECK_SHARED, DECK_APART, DECK_STEP = 4.5, 6.5, 2.5    # metres apart side by side, and up and down


def share_decks(tracks):
    segs = [(ti, k, t["p"][k], t["p"][k + 1]) for ti, t in enumerate(tracks) for k in range(len(t["p"]) - 1)
            if t["p"][k][3] == 1 and t["p"][k + 1][3] == 1]
    if not segs: return
    tree = shapely.STRtree([LineString([a[:2], b[:2]]) for _, _, a, b in segs])
    new = {}
    for ti, t in enumerate(tracks):
        for k, q in enumerate(t["p"]):
            if q[3] != 1: continue
            best = {}
            for j in tree.query(Point(q[:2]).buffer(DECK_APART)):
                tj, kj, a, b = segs[int(j)]
                if tj == ti: continue
                vx, vy = b[0] - a[0], b[1] - a[1]
                f = min(1, max(0, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / ((vx * vx + vy * vy) or 1)))
                dist = math.hypot(a[0] + vx * f - q[0], a[1] + vy * f - q[1])
                z = a[2] + (b[2] - a[2]) * f
                if dist < DECK_APART and abs(z - q[2]) < DECK_STEP and (tj not in best or dist < best[tj][0]): best[tj] = (dist, z)
            if not best: continue
            ws = [(1.0, q[2])] + [(min(1.0, (DECK_APART - dd) / (DECK_APART - DECK_SHARED)), z) for dd, z in best.values()]
            new[(ti, k)] = sum(w * z for w, z in ws) / sum(w for w, _ in ws)
    for (ti, k), z in new.items(): tracks[ti]["p"][k][2] = z


BALLAST_TOP = 1.6     # metres either side of a track its ballast's level top reaches (railway.ts)
BED_APART = 5.8       # metres apart within which two tracks' beds run together (write_tile: RAIL_BED 2.3 each side, BED_JOIN 1.2)
BED_RAMP = (0.5, 1.0)  # metres two tracks differ by where their beds are wholly matched, and no longer at all
CROSSFALL = 1 / 20    # the steepest the shared bed may slope between two tracks' ballast, as a formation's drainage fall


def share_beds(tracks):
    """Tracks side by side on one bed agree in height: where their ballast tops meet or overlap they
    are at one height, and further apart the bed between them falls no steeper than CROSSFALL. Each
    track's own profile is evened out on its own, so two tracks a few metres apart came out up to
    35 cm different, and their ballast stood as a step. Only tracks alike (both on the ground, both
    on a bridge, both in a tunnel, or one at the other's end of a bridge or a tunnel) are matched."""
    segs = [(ti, k, t["p"][k], t["p"][k + 1]) for ti, t in enumerate(tracks) for k in range(len(t["p"]) - 1)]
    if not segs: return 0.0
    tree = shapely.STRtree([LineString([a[:2], b[:2]]) for _, _, a, b in segs])
    pairs = []
    for ti, t in enumerate(tracks):
        for k, q in enumerate(t["p"]):
            best = {}
            for j in tree.query(Point(q[:2]).buffer(BED_APART)):
                tj, kj, a, b = segs[int(j)]
                if tj == ti or q[3] not in (a[3], b[3]): continue
                vx, vy = b[0] - a[0], b[1] - a[1]
                f = min(1, max(0, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / ((vx * vx + vy * vy) or 1)))
                dist = math.hypot(a[0] + vx * f - q[0], a[1] + vy * f - q[1])
                dz = abs(a[2] + (b[2] - a[2]) * f - q[2])
                if dist < BED_APART and dz < BED_RAMP[1] and (tj not in best or dist < best[tj][0]):
                    best[tj] = (dist, kj, f, dz)
            for tj, (dist, kj, f, dz) in best.items():
                # (a track climbing away from its neighbour to a flyover or a dive keeps its own
                # height: the matching fades out as the two part, so it never jumps)
                w = min(1.0, max(0.0, (BED_RAMP[1] - dz) / (BED_RAMP[1] - BED_RAMP[0])))
                pairs.append((ti, k, tj, kj, f, max(0.0, dist - 2 * BALLAST_TOP) * CROSSFALL + (1 - w) * dz))
    # (each pass moves both ends of a pair half way to what the fall allows, all at once, so a track
    # between two others settles between them)
    worst = 0.0
    for _ in range(12):
        moves = {}
        for ti, k, tj, kj, f, allow in pairs:
            a, b = tracks[tj]["p"][kj], tracks[tj]["p"][kj + 1]
            dz = tracks[ti]["p"][k][2] - (a[2] + (b[2] - a[2]) * f)
            excess = abs(dz) - allow
            if excess <= 0.005: continue
            worst = max(worst, excess)
            m = moves.setdefault((ti, k), [0.0, 0])
            m[0] -= math.copysign(excess / 2, dz); m[1] += 1
        if not moves: break
        for (ti, k), (dz, c) in moves.items(): tracks[ti]["p"][k][2] += dz / c
    return worst


def main():
    map_id, src, out = sys.argv[1:4]
    A = area(map_id, wide=True)
    T = Terrain(A.centre, os.path.join(src, "terrain15"))
    proj = lambda g: shapely.transform(g, lambda a: np.column_stack(T.proj(a[:, 0], a[:, 1])))
    cx, cy = A.field_centre
    R = A.half
    circle = Point(cx, cy).buffer(R, 256)

    # ---- the working lines ---------------------------------------------------------------------
    tracks = []
    toy, toy_ways = toy_track(src, proj)
    if toy_ways: print(f"railways: leaving out the miniature railway's track ({', '.join(toy_ways)})")
    for f in json.load(open(os.path.join(src, "segment.geojson")))["features"]:
        p = f["properties"]
        if p.get("subtype") != "rail" or p.get("class") not in ("standard_gauge", "unknown"): continue
        flags = p.get("rail_flags") or []
        if any(v in ("is_abandoned", "is_disused") for rf in flags for v in rf["values"]): continue
        whole = proj(shape(f["geometry"]))
        if whole.geom_type != "LineString" or not whole.intersects(circle): continue
        if toy is not None and whole.intersection(toy).length >= 0.8 * whole.length: continue
        L = whole.length
        ranges = lambda what: [(rf.get("between") or [0, 1]) for rf in flags if what in rf["values"]]
        bridges, tunnels = [(a * L, b * L) for a, b in ranges("is_bridge")], [(a * L, b * L) for a, b in ranges("is_tunnel")]
        name = ((p.get("names") or {}).get("primary")) or ""
        # cut to the circle, keeping each piece's distance along the whole line for its flags
        cut = whole.intersection(circle)
        for piece in getattr(cut, "geoms", [cut]):
            if piece.geom_type != "LineString" or piece.length < 2: continue
            s0 = whole.project(Point(piece.coords[0]))
            n = max(1, int(math.ceil(piece.length / STEP)))
            pts = []
            for k in range(n + 1):
                d = piece.length * k / n
                q = piece.interpolate(d)
                s = s0 + d
                f_ = 2 if any(a <= s <= b for a, b in tunnels) else 1 if any(a <= s <= b for a, b in bridges) else 0
                pts.append([q.x, q.y, T.elev(q.x, q.y), f_])
            tracks.append(dict(n=name, p=pts))
    print(f"railways: {len(tracks)} pieces of track, {sum(LineString([q[:2] for q in t['p']]).length for t in tracks) / 1000:.1f} km")

    # ---- heights: as a railway is built, not as the survey has the ground -----------------------
    # Each bridge is carried straight from end to end, its ends taken from the line's own slope a
    # little way out (the survey has the ground dipping into the gap a bridge leaves, which the
    # track doesn't: tools/profiles.py); the rest is evened out along the line by distance, and each
    # tunnel laid straight between the line at its portals; and nowhere does the line climb steeper
    # than a railway can (RAIL_GRADE), the squares cutting and banking the ground to it (prep_map.py).
    # The pieces of track are levelled as whole lines: pieces that carry straight on into each other
    # are one line, and a piece meeting a line already levelled (at points, or end to end) takes its
    # height where they meet, so two pieces of one track never disagree where they join.
    key = lambda q: (round(q[0] * 2), round(q[1] * 2))
    ends = {}
    for ti, t in enumerate(tracks):
        for e in (0, -1): ends.setdefault(key(t["p"][e]), []).append((ti, e))
    def heading(ti, e):
        p = tracks[ti]["p"]
        a, b = (p[0], p[1]) if e == 0 else (p[-1], p[-2])
        l = math.dist(a[:2], b[:2]) or 1
        return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
    partner = {}
    for here in ends.values():
        pairs = sorted(((-(heading(*x)[0] * heading(*y)[0] + heading(*x)[1] * heading(*y)[1]), x, y) for i, x in enumerate(here) for y in here[i + 1:] if x[0] != y[0]), reverse=True)
        for straight, x, y in pairs:
            if straight > 0.7 and x not in partner and y not in partner: partner[x] = y; partner[y] = x
    seen, lines = set(), []
    def walk(ti, enter):
        line = []
        while ti not in seen:
            seen.add(ti)
            p = tracks[ti]["p"]
            line += [(ti, i) for i in (range(len(p)) if enter == 0 else range(len(p) - 1, -1, -1))]
            nxt = partner.get((ti, -1 if enter == 0 else 0))
            if not nxt: break
            ti, enter = nxt[0], (0 if nxt[1] == 0 else -1)
        return line
    for ti in range(len(tracks)):
        if ti in seen: continue
        if (ti, 0) not in partner: lines.append(walk(ti, 0))
        elif (ti, -1) not in partner: lines.append(walk(ti, -1))
    for ti in range(len(tracks)):
        if ti not in seen: lines.append(walk(ti, 0))
    laid, laid_at = {}, []
    for line in sorted(lines, key=len, reverse=True):
        p = [tracks[ti]["p"][i] for ti, i in line]
        n = len(p)
        z = [q[2] for q in p]
        d = [0.0]
        for a, b in zip(p, p[1:]): d.append(d[-1] + math.dist(a[:2], b[:2]))
        # where it meets a line laid already, it's held at that line's height (an end that joins one
        # part way along, at a set of points, takes the height of the nearest of its points)
        pinned = [laid.get(key(q)) for q in p]
        for e in (0, n - 1):
            if pinned[e] is None and laid_at:
                best = min(laid_at, key=lambda r: (r[0] - p[e][0]) ** 2 + (r[1] - p[e][1]) ** 2)
                if math.dist(best[:2], p[e][:2]) < STEP * 0.6: pinned[e] = best[2]
        # the bridges first, carried from the line's slope either side; the survey over a tunnel is
        # the hill above it, so the tunnels are left out of the evening and laid straight after it
        bridge = [q[3] == 1 for q in p]
        tunnel = [q[3] == 2 for q in p]
        # (a bridge running from the very end of a piece, or from a point or two short of it, starts
        # at the height of the line it leaves, as at a junction on a viaduct, not down at the
        # survey's ground under it)
        for e in (0, n - 1):
            if pinned[e] is not None: z[e] = pinned[e]
        carry_profile(z, d, bridge, [True] * n, fixed=(pinned[0], pinned[-1]))
        even = list(z)
        for i in range(n):
            if bridge[i] or tunnel[i]: continue
            ws = [(math.exp(-((d[m] - d[i]) ** 2) / (2 * RAIL_SIGMA ** 2)), z[m]) for m in range(max(0, i - 15), min(n, i + 16))
                  if abs(d[m] - d[i]) < 3 * RAIL_SIGMA and not tunnel[m]]
            even[i] = sum(w * v for w, v in ws) / sum(w for w, _ in ws)
        def lay_tunnels():
            k = 0
            while k < n:
                if not tunnel[k]: k += 1; continue
                j = k
                while j + 1 < n and tunnel[j + 1]: j += 1
                a, b = max(0, k - 1), min(n - 1, j + 1)
                za, zb = (even[a] if a < k else even[b]), (even[b] if b > j else even[a])
                for i in range(k, j + 1): even[i] = za + (zb - za) * (d[i] - d[a]) / ((d[b] - d[a]) or 1)
                k = j + 1
        lay_tunnels()
        lim = [RAIL_GRADE * (d[m + 1] - d[m]) for m in range(n - 1)]
        for i, h in enumerate(pinned):
            if h is not None: even[i] = h
        ease_grades(even, d, lim, [bridge[i] or pinned[i] is not None for i in range(n)])
        lay_tunnels()
        for i, q in enumerate(p):
            q[2] = even[i]
            laid.setdefault(key(q), even[i])
            laid_at.append((q[0], q[1], even[i]))
    # Tracks side by side on one viaduct are on one deck, at one height: each point on a bridge
    # takes the mean of its own height and those of the bridges beside it (within DECK_SHARED,
    # fading out to DECK_APART as they part), where they differ by less than a flyover would.
    share_decks(tracks)

    # Where the line crosses a road or a path well above it (more than 3 m) and the data marks no
    # bridge, it's on one: the road or path passes under. And each bridge runs on to where the
    # track meets the ground, not stopping short of it on a bank's edge.
    ways = []
    for f in json.load(open(os.path.join(src, "segment.geojson")))["features"]:
        pr = f["properties"]
        if pr.get("subtype") != "road": continue
        g = proj(shape(f["geometry"]))
        if g.intersects(circle): ways.append((g, ROAD_HALF.get(pr.get("class"), 1.5)))
    wtree = shapely.STRtree([g for g, _ in ways]) if ways else None
    for t in tracks:
        p = t["p"]
        n = len(p)
        line = LineString([q[:2] for q in p])
        if wtree is not None:
            for j in wtree.query(line):
                g, half = ways[int(j)]
                x = line.intersection(g)
                for pt in getattr(x, "geoms", [x]):
                    if pt.geom_type != "Point": continue
                    k = min(range(n), key=lambda k: math.dist(p[k][:2], (pt.x, pt.y)))
                    # (the road's own lowest ground either side of the line: the survey right under
                    # the track is the embankment's edge)
                    s0 = g.project(pt)
                    under = min(T.elev(q.x, q.y) for q in (g.interpolate(s0 + o) for o in (-6, -3, 0, 3, 6)))
                    if p[k][3] != 0 or p[k][2] - under < 3.0: continue
                    for i in range(n):
                        if p[i][3] == 0 and math.dist(p[i][:2], (pt.x, pt.y)) < half + 2.5: p[i][3] = 1
        for i in range(n):
            if p[i][3] != 1: continue
            for j, step in ((i - 1, -1), (i + 1, 1)):
                while 0 <= j < n and p[j][3] == 0 and p[j][2] - T.elev(p[j][0], p[j][1]) > 1.0 and abs(j - i) <= 4:
                    p[j][3] = 1; j += step
        # a short "tunnel" is a bridge or an aqueduct going over: the track is in the open under it
        k = 0
        while k < n:
            if p[k][3] != 2: k += 1; continue
            j = k
            while j + 1 < n and p[j + 1][3] == 2: j += 1
            if (j - k + 1) * STEP < SHORT_TUNNEL:
                for i in range(k, j + 1): p[i][3] = 0
            k = j + 1

    # ---- stations: the track level along each one's platforms ------------------------------
    # The ground the track follows is the lidar's, smoothed, and it wanders up and down by a metre
    # through a station on a viaduct (Bath Spa's), which left the platform's one level well above
    # the rails at one end and down at them at the other. A real station is level: every track
    # running alongside a station's platforms is laid at one height (the middle of what the ground
    # gave them there), and eases back to its own height over RAMP metres either side. A station
    # whose track is level already (most of it within WANDER) is left as it is: on the ground the squares
    # flatten the ground under the track to its height, so moving it there would lift it off.
    # The platforms are then all one step up from the station's level (below).
    stations = []
    infra = json.load(open(os.path.join(src, "infrastructure.geojson")))["features"]
    for f in infra:
        p = f["properties"]
        if p.get("class") == "railway_station" and (p.get("names") or {}).get("primary"):
            g = proj(shape(f["geometry"]))
            if g.within(circle): stations.append((p["names"]["primary"], g.centroid))
    all_track = shapely.unary_union([LineString([q[:2] for q in t["p"]]) for t in tracks])
    plats = []           # (station or "", polygon, number or "")
    for f in infra:
        p = f["properties"]
        if p.get("class") != "platform": continue
        g = proj(shape(f["geometry"]))
        if not g.geom_type.endswith("Polygon") or not g.within(circle) or g.distance(all_track) > 8: continue
        no = ((p.get("names") or {}).get("primary") or "").strip()
        for poly in getattr(g, "geoms", [g]):
            c = poly.centroid
            st = min(stations, key=lambda s: s[1].distance(c), default=None)
            plats.append((st[0] if st and st[1].distance(c) < 300 else "", poly, no if len(no) <= 3 else ""))
    level = {}           # station (or the platform itself, if it has none) -> the track's height there
    for key in {n or k for k, (n, _, _) in enumerate(plats)}:
        near = shapely.unary_union([poly for k, (n, poly, _) in enumerate(plats) if (n or k) == key]).buffer(ALONG)
        alongside = [(t, i) for t in tracks for i, q in enumerate(t["p"]) if q[3] != 2 and near.contains(Point(q[0], q[1]))]
        if not alongside: continue
        zs = [t["p"][i][2] for t, i in alongside]
        z = float(np.median(zs))
        level[key] = z
        if np.percentile(zs, 90) - np.percentile(zs, 10) < WANDER: continue
        for t in {id(t): t for t, _ in alongside}.values():
            p = t["p"]
            flat = [i for tt, i in alongside if tt is t]
            a, b = min(flat), max(flat)
            # along the track from the level stretch, for the easing either side of it
            s = [0.0]
            for i in range(1, len(p)): s.append(s[-1] + math.dist(p[i - 1][:2], p[i][:2]))
            for i in range(len(p)):
                far = s[a] - s[i] if i < a else s[i] - s[b] if i > b else 0.0
                if far >= RAMP: continue
                f_ = far / RAMP
                q = p[i]
                q[2] = z + (q[2] - z) * f_ * f_ * (3 - 2 * f_)
        print(f"  {key if isinstance(key, str) else 'a platform'}: the track laid level at {z:.2f} m along {len(alongside)} points")
    worst = share_beds(tracks)
    if worst: print(f"railways: tracks side by side brought to one bed (most apart before: {worst:.2f} m past the fall allowed)")

    # ---- routes: edge to edge, straight on at the points --------------------------------------
    key = lambda x, y: (round(x), round(y))
    at = {}
    for i, t in enumerate(tracks):
        for end, (x, y) in ((0, t["p"][0][:2]), (1, t["p"][-1][:2])): at.setdefault(key(x, y), []).append((i, end))
    def heading(i, fwd, start):
        p = tracks[i]["p"] if fwd > 0 else tracks[i]["p"][::-1]
        a, b = (p[0], p[min(3, len(p) - 1)]) if start else (p[max(0, len(p) - 4)], p[-1])
        l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        return (b[0] - a[0]) / l, (b[1] - a[1]) / l
    def at_edge(x, y): return math.hypot(x - cx, y - cy) > R - EDGE
    # Routes run from one edge of the data to another. At each set of points the train carries on by
    # every line that doesn't turn it sharper than the 0.6 heading test (about 53°), not just the one
    # that goes straightest: at Bath Spa the Wessex line to Bradford-on-Avon branches off the main
    # line to Box, and before this it was never taken (all eastbound trains went to Box). Every
    # edge-to-edge path is kept, de-duplicated; a loop back onto track already used is refused.
    JOIN = 0.6       # the least the two headings' dot product may be to carry on
    routes, seen = [], set()
    for i, t in enumerate(tracks):
        for end in (0, 1):
            x, y = t["p"][-end][:2]
            if not at_edge(x, y) or len(at.get(key(x, y), [])) > 1: continue
            first = (i, 1 if end == 0 else -1)
            # depth-first over every allowed continuation; a path ends when it reaches an edge or a
            # set of points it can't go straight on through
            stack = [(first, [first])]
            while stack:
                (cur, fwd), path = stack.pop()
                p = tracks[cur]["p"]
                ex, ey = (p[-1] if fwd > 0 else p[0])[:2]
                if at_edge(ex, ey):
                    sig = frozenset(path)
                    if sig not in seen:
                        seen.add(sig)
                        routes.append([[j, f] for j, f in path])
                    continue
                hx, hy = heading(cur, fwd, False)
                used = {j for j, _ in path}
                for j, e in at.get(key(ex, ey), []):
                    if j in used: continue
                    jf = 1 if e == 0 else -1
                    nx, ny = heading(j, jf, True)
                    if nx * hx + ny * hy > JOIN: stack.append(((j, jf), path + [(j, jf)]))

    def heads_to(line, other):
        """Whether a route leaves this map on the side towards the other map: at Bradford-on-Avon,
        whose station is its only stop, that's what tells the train to Bath from the one to Trowbridge."""
        lon, lat = area(other, wide=True).centre
        ox, oy = T.proj(np.array([lon]), np.array([lat]))
        a, b = line.coords[0], line.coords[-1]
        return (b[0] - a[0]) * (float(ox[0]) - cx) + (b[1] - a[1]) * (float(oy[0]) - cy) > 0
    def goes_on(name, line, stops):
        """On a line that carries on to another map (LINKS), 1 if this route's trains go on there:
        the linked station is the last they call at here and they leave towards that map. None off
        such a line."""
        for map_a, st_a, map_b, st_b, ln, _ in LINKS:
            here = st_a if map_id == map_a else st_b if map_id == map_b else None
            if here and ln == name and stops: return 1 if stops[-1] == here and heads_to(line, map_b if here == st_a else map_a) else 0
        return None
    def line_of(route):
        pts = []
        for j, f_ in route:
            p = tracks[j]["p"] if f_ > 0 else tracks[j]["p"][::-1]
            pts += p[1:] if pts else p
        return pts
    others = lambda route: shapely.unary_union([LineString([q[:2] for q in tracks[j]["p"]]) for j in range(len(tracks))
                                                if j not in {r[0] for r in route}])
    # Whether to keep every route the search finds (a map with no junction to make a mess of) or
    # only those matching a named service (SERVICES), wanted by the stops they call at.
    want = SERVICES.get(map_id)
    found = []
    for route in routes:
        pts = line_of(route)
        line = LineString([q[:2] for q in pts])
        if line.length < 2000: continue
        # keep left first, so the route is the way its trains run before its stops are measured:
        # turning it round after measuring would leave the stops distances against the other way
        rest = others(route)
        left = right = 0
        for d in np.arange(50, line.length - 50, 150):
            q, q2 = line.interpolate(d), line.interpolate(d + 5)
            near = rest.distance(q)
            if not 2.5 < near < 8: continue
            o = nearest_points(q, rest)[1]
            side = (q2.x - q.x) * (o.y - q.y) - (q2.y - q.y) * (o.x - q.x)
            if side > 0: left += 1
            else: right += 1
        both = left + right < 3
        if left > right: route = [[j, -f_] for j, f_ in route[::-1]]; pts = line_of(route); line = LineString([q[:2] for q in pts])
        # found from both its ends, a route kept left comes out the same way round both times
        if any(f_["route"] == route for f_ in found): continue
        st = sorted([[r1(line.project(c)), n] for n, c in stations if line.distance(c) < 40])
        # the lines this route runs along, for telling services apart by more than their stops
        found.append(dict(route=route, line=line, st=st, stops=[n for _, n in st], ran={tracks[j]["n"] for j, _ in route},
                          both=both, left=left, right=right, wrong=min(left, right)))
    if want is not None:
        # Each service takes the route matching it (its stops in order, and the lines it runs on: the
        # London and Bradford trains share their stops and are told apart by the Wessex line, which
        # only the Bradford trains use) that runs on the wrong line least. Two routes can match: one
        # that crosses over and comes up the valley on the down line, head on into the trains going
        # down it, and one that keeps to the up line all the way.
        chosen = {}
        for si, s_ in enumerate(want):
            fits = [k for k, f_ in enumerate(found) if k not in chosen and f_["stops"] == s_["stops"] and f_["ran"] == s_["lines"]
                    and ("on" not in s_ or goes_on(s_["line"], f_["line"], f_["stops"]) == s_["on"])]
            if fits: chosen[min(fits, key=lambda k: found[k]["wrong"])] = si
        found = [dict(f_, si=chosen[k]) for k, f_ in enumerate(found) if k in chosen]
    out_routes = []
    for f_ in found:
        route, line, st, stops, both, left, right = (f_[k] for k in ("route", "line", "st", "stops", "both", "left", "right"))
        if want is not None:
            si = f_["si"]
            name, kind = want[si]["line"], want[si]["kind"]
            bound = {k: want[si][k] for k in ("to", "via") if k in want[si]}
        else:
            bound = {}
            names = {}
            for j, _ in route: names[tracks[j]["n"]] = names.get(tracks[j]["n"], 0) + LineString([q[:2] for q in tracks[j]["p"]]).length
            name = max((n for n in names if n), key=lambda n: names[n], default="")
            kind = 1 if name and "great western" in name.lower() and line.length > 15000 else 0
        # on a line that carries on to another map, whether this route's trains do: they go on there
        # after the linked station if it's the last they call at here
        on = goes_on(name, line, stops)
        if on is not None: bound["on"] = on
        out_routes.append(dict(n=name, t=route, st=st, both=1 if both else 0, k=kind, **bound))
        print(f"  route {name or '(unnamed)'}: {line.length / 1000:.1f} km, {'both ways' if both else f'keeps left ({left}/{right})'}, {'HST' if kind else 'local'}, stops {stops}")

    # ---- platforms and tunnel mouths ----------------------------------------------------------
    # each a step up from its station's level track (the train's floor is a little higher still)
    platforms = []
    for k, (n, poly, no) in enumerate(plats):
        z = level.get(n or k)
        if z is None: continue
        ring = list(poly.simplify(0.5).exterior.coords)[:-1]
        platforms.append(dict(n=n, r=[[r1(x), r1(y)] for x, y in ring], z=r1(z + 0.9), **({"no": no} if no else {})))
    # The canopies over platforms up on a viaduct or a bank: a footprint the data maps mostly over
    # such a platform can't stand on the ground below as a building (it would be a solid block round
    # the line), so it's the platform's canopy, at the platform's height, and the squares leave it out.
    canopies = []
    raised = [(poly.buffer(CANOPY_REACH), r1(level[n or k] + 0.9)) for k, (n, poly, _) in enumerate(plats) if level.get(n or k) is not None]
    for f in [f for l in ("building", "footprints") if os.path.exists(os.path.join(src, f"{l}.geojson"))
              for f in json.load(open(os.path.join(src, f"{l}.geojson")))["features"]]:
        g = proj(shape(f["geometry"]))
        if not g.geom_type.endswith("Polygon") or not g.intersects(circle): continue
        for poly in getattr(g, "geoms", [g]):
            poly = poly.buffer(0)
            if poly.is_empty or poly.area < 6: continue
            over = [(poly.intersection(P).area, z) for P, z in raised if poly.intersects(P)]
            if not over or sum(a for a, _ in over) < CANOPY_SHARE * poly.area: continue
            z = max(over)[1]
            if z - T.elev(poly.centroid.x, poly.centroid.y) < CANOPY_RAISED: continue
            ring = list(poly.simplify(0.3).exterior.coords)[:-1]
            # (an outline the line runs through is the station's whole extent, not a roof: left out, not drawn)
            whole = all_track.intersection(poly).length > CANOPY_TRACK
            canopies.append((poly, dict(r=[[r1(x), r1(y)] for x, y in ring], z=z, **({"t": 1} if whole else {}))))
    # one canopy drawn where two outlines map the same one
    drawn = []
    for poly, c in sorted(canopies, key=lambda pc: -pc[0].area):
        if "t" not in c and any(poly.intersection(o).area > 0.8 * poly.area for o in drawn): c["t"] = 1
        if "t" not in c: drawn.append(poly)
    canopies = [c for _, c in canopies]
    if canopies: print(f"railway: {len(drawn)} platform canopies up off the ground, and {len(canopies) - len(drawn)} more outlines over them left out")
    portals = []
    for t in tracks:
        p = t["p"]
        for k in range(len(p)):
            if p[k][3] != 2: continue
            for o in (-1, 1):
                m = k + o
                if 0 <= m < len(p) and p[m][3] != 2:
                    # the mouth faces out of the hill, from the tunnel's end toward the open track
                    ang = math.atan2(p[k][1] - p[m][1], p[k][0] - p[m][0])
                    x, y = (p[k][0] + p[m][0]) / 2, (p[k][1] + p[m][1]) / 2
                    # the ground over the tunnel a few metres in, past the slope down into the cutting,
                    # which the face stands as high as
                    over = sorted(T.elev(x + math.cos(ang) * u, y + math.sin(ang) * u) for u in COVER_AT)[len(COVER_AT) // 2]
                    portals.append([r1(x), r1(y), r1((p[k][2] + p[m][2]) / 2), round(ang, 3), r1(over)])

    out_d = dict(
        tracks=[dict(n=t["n"], p=[[r1(q[0]), r1(q[1]), round(q[2], 2), q[3]] + ([r1(T.elev(q[0], q[1]))] if q[3] == 1 else []) for q in t["p"]])
                for t in tracks],
        routes=out_routes, platforms=platforms, portals=portals, **({"canopies": canopies} if canopies else {}),
    )
    # the journeys on to another map: which lines carry on, the station at each end, and how long
    # the ride takes (the real distance at the local train's speed, plus a stop at each station on
    # the way; the game starts the two maps' trains on the same clock so the same service is at
    # Bath Spa and at Bradford-on-Avon a journey apart, see web/src/railway.ts)
    # both ends of a journey get the link, each naming the map and station at the other end, so the
    # two maps' trains run to the same clock (web/src/railway.ts): one waits at its station for the
    # service whose numbers make it the same train
    links = []
    for map_a, st_a, map_b, st_b, line, dist in LINKS:
        if map_id == map_a: links.append(dict(line=line, station=st_a, to=map_b, to_station=st_b, secs=round(dist / V_LINK)))
        elif map_id == map_b: links.append(dict(line=line, station=st_b, to=map_a, to_station=st_a, secs=round(dist / V_LINK)))
    if links: out_d["links"] = links
    json.dump(out_d, open(out, "w"), separators=(",", ":"))
    print(f"{len(tracks)} tracks, {len(out_routes)} routes, {len(platforms)} platforms, {len(portals)} tunnel mouths -> {out} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
