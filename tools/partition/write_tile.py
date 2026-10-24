"""Write one square's game map file from the partition, for a first walk.

Usage: python3 -I tools/partition/write_tile.py <ti> <tj> <out.json> [--once dir] [--city dir]
                                                   [--base tile.json]

This is the first cut of stage 4's writer, and it is deliberately narrow: **one square, loaded in the
game, walked around**. The city-wide writer and the polish come after Dan has seen it.

It starts from a copy of the existing tile for the same square (`--base`) and replaces only the fields
the partition owns, so the only difference Dan sees is the partition's:

  - `rd`: one record per corridor stretch, from the corridors pass 1 fitted - so a street's width can
    change along it, and roads and pavements match the corridors the plots were cut against;
  - `br`: every drawn edge whose class is a barrier, from the **merged** runs `classify_edges` wrote
    (not the raw segments: how many pieces a boundary merges into depends on which junctions fall
    where, and a writer that took the segments as they came would emit a different number of wall
    records for the same wall);
  - `gt`: an opening goes in only if it cuts a barrier - a gate through a wall, fence, hedge or
    railing. An opening with no barrier at that point writes nothing, because there is no gap to cut,
    and a drive is a gap with no gate in it;
  - `fp`, `dv`: a straight line from each gate into its house, and the drives the writer puts beside
    some gates (`drives_from_openings`). The copied ones point at the old build's gates, so they are
    replaced;
  - `t`: the existing tile's ground, laid afresh where these streets and paths meet their bridges
    (`lay_ground`: a street's approach to its bridge, a path dug under one), with what stood on it
    moved up or down with it;
  - `bt` and `uo` on a bridge's record: what kind of bridge the game builds (OpenStreetMap's
    `osm-bridges` layer, else what it carries and crosses: `bridge_kinds`), and the stretches over
    what passes under it, where no pier stands. Nothing stands in the gap under a deck
    (`deck_gaps`: no wall is drawn there, and plants and street items under it go);
  - `bl` and the decoration fields: **copied** from the existing tile. The footprints are not what
    this stage is testing, and a bare tile would look worse for reasons that have nothing to do with
    the partition. Placing decoration against the new cross-sections is its own step, done after the
    layout works across the city; until then anything the new layout contradicts is **dropped**, not
    moved, because a bin standing in a new road reads as a mistake where a sparse square reads as
    unfinished (`drop_clashes`).

What is *not* done here, and is listed as findings instead: decoration that now stands on a new
barrier, in a new carriageway, or across a gate. That is reported, not fixed.
"""
import collections
import itertools
import json
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import substring, unary_union
from shapely.strtree import STRtree

from partition import MAP, ROOT, face_shape, once
from partition.openings import EDGE_STUB
from partition.plots import FRONT_REACH, SUPPORT, street_rows
from partition.settle import drop_unstood, house_kinds, load_evidence, owners_near, settle
from partition.standing import Standing
from partition.tidy import clear_gates_of_junctions, reseat_gates, tidy_walls
from streets import KERBED, parked_cars
from structures import canal_bores, drop_empty_spans, deck_ends, ease_bends, follow_ground, grow_marks, stretches

# The partition's edge classes, and the style name each becomes in the game. Every one of these is a
# key in `web/src/map.ts`'s BARRIER_HEIGHT, so no class needs a stand-in here.
BARRIER = {
    "garden_wall": "garden_wall", "stone_wall": "stone_wall", "brick_wall_low": "brick_wall_low",
    "hedge": "hedge", "hedge_low": "hedge_low", "fence": "fence", "wall": "wall",
    "railing": "railing", "retaining_wall": "retaining_wall", "brick_wall": "brick_wall",
}
# The game's own heights, from `web/src/map.ts` BARRIER_HEIGHT. A barrier with no measured height uses
# these, which is what the game would fall back to anyway - writing them makes the file explicit.
HEIGHT = {
    "wall": 0.9, "retaining_wall": 0.9, "fence": 1.2, "hedge": 1.3, "garden_wall": 0.9,
    "brick_wall_low": 0.75, "hedge_low": 1.0, "railing": 1.0, "stone_wall": 1.1, "brick_wall": 1.2,
}
SEGMENT = 4.0       # metres between points along a road's centre line
SURFACE_TOLERANCE = 0.05   # metres the street surfaces' outlines may move when simplified
# Metres the road surface is shrunk before a barrier is tested against it: the road's interior, not
# its boundary. A wall standing on the boundary is a front wall, and must survive.
ROAD_INSET = 0.05
# Metres either side of a boundary used to ask which side the street is on.
PROBE = 0.25
# Metres the game draws each barrier across its line, from `web/src/map.ts` `BAR` (`t`). A barrier is
# drawn **centred** on its line, so half of it stands on whichever side the line falls: for a hedge
# 0.9 m across, 0.45 m juts into the pavement. A barrier on a corridor boundary is therefore shifted
# out of the corridor by half its own thickness, towards the side the edge's labels say is not
# corridor. A barrier with no corridor side is drawn where the partition put it.
BARRIER_WIDTH = {
    "wall": 0.45, "retaining_wall": 0.5, "stone_wall": 0.45, "garden_wall": 0.35,
    "brick_wall": 0.3, "brick_wall_low": 0.3, "fence": 0.08, "hedge": 0.9, "hedge_low": 0.7,
    "railing": 0.05,
}
# Metres of clearance kept between copied decoration and a barrier. A tree or a bin standing in a wall
# is the same kind of wrong as one standing in a road, and the plank says both are placed later.
DECOR_CLEAR = 0.5
# Metres a lamp may stand inside the carriageway's edge: they are placed on the kerb line itself.
KERB_LINE = 0.3
MARK_SLACK = 0.2         # metres a road marking may stand beyond the carriageway's edge and be kept
# Road classes the game draws as paths, with no carriageway (`PATHS` in `web/src/map.ts`).
KERBED = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
PEDESTRIAN_STREET_NEAR = 15.0  # metres: main draws a wide pedestrian street on its middle line, so a street's edge can lie this far off it
PEDESTRIAN_NEAR = 3.0    # metres: how near an old pedestrian street a new street must lie along to be one
GAME_PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
# Metres either side of a gate's line, and of a front path, kept clear of trees and shrubs.
GATEWAY_CLEAR = 0.9
PATH_CLEAR = 0.8
ALONG_STREET = 0.8         # a stretch of path this much of its length running along a carriageway is that street
ALONG_PAVEMENT = 0.65      # beside a pavement it takes less, since a path leaving a pavement slants away
ON_STREET = 0.9            # a path this much of its length on a street's carriageway and pavements is that street
PATH_GATE_NEAR = 1.0       # a path crossing a boundary this close to a gate is going through the gate
PATH_END_REACH = 1.5       # a wall this near the house end of a path is cut short, not the whole path dropped
PATH_STOP_SHORT = 0.3
PATH_MIN_LEFT = 1.5
# Metres within which a front path is just lying along its own wall.
ALONG_EDGE = 0.35
# Metres: the shortest wall piece worth writing. It must sit **below** the wall the partition leaves
# each side of a gate (`openings.EDGE_STUB`, 0.9 m), or the writer deletes the very stub the gate was
# cut to leave. Measured: 319 of the 323 gate ends that missed their wall were exactly that - a 0.9 m
# stub dropped by a 1 m floor, so the gate ended in mid-air. The floor stops degenerate slivers; it is
# not there to second-guess the partition's own spacing.
MIN_PIECE = 0.5
# Metres: the shortest bit of wall kept after it is cut back off a road, the railway or the water.
MIN_CUT_PIECE = 0.8
# Metres of canal bank, and of railway either side of the track, that a wall may not stand in.
RAIL_HALF = 4.5
CANAL_MARGIN = 0.8
WATER_MARGIN = 0.8


def tile_base(ti, tj, extra=("canal", "rail", "cable", "pubs")):
    """The existing tile for a square, and the small files that go beside it."""
    d = os.path.join(ROOT, "web", "public", "maps", MAP)
    main = os.path.join(d, f"{ti}_{tj}.json")
    side = {e: os.path.join(os.path.dirname(d), f"{MAP}-{e}.json") for e in extra}
    return main, side


def ground_at(T, x, y, split=True):
    """The terrain height at a map point, from the game's own grid the tile carries.

    Two things about that grid are easy to get wrong and were both wrong here at first: `h` is in
    **decimetres** above `z0` (`prep_map.py` writes `int(round((v - z0) * 10))`), and its rows run
    **south to north** - row 0 is the south edge - so a point's row is `(y - y0) / dy` counted from
    the south, not from the north.
    """
    dx, dy, x0, y0, z0 = T["dx"], T["dy"], T["x0"], T["y0"], T["z0"]
    nx, ny, h = T["nx"], T["ny"], T["h"]
    u, v = (x - x0) / dx, (y - y0) / dy
    i, j = int(math.floor(u)), int(math.floor(v))
    if i < 0 or j < 0 or i + 1 >= nx or j + 1 >= ny:
        return None
    fu, fv = u - i, v - j

    def H(a, b):
        return h[b * nx + a] / 10.0 + z0
    # the game splits each cell into two triangles along one diagonal, not bilinearly, so a wall
    # stands on the surface the player walks on only if it reads the height the same way. Road
    # heights stay bilinear (`split=False`): `check_map.py` judges them against that surface.
    if not split:
        return ((H(i, j) * (1 - fu) + H(i + 1, j) * fu) * (1 - fv)
                + (H(i, j + 1) * (1 - fu) + H(i + 1, j + 1) * fu) * fv)
    if fu + fv <= 1:
        return H(i, j) + (H(i + 1, j) - H(i, j)) * fu + (H(i, j + 1) - H(i, j)) * fv
    return (H(i + 1, j + 1) + (H(i, j + 1) - H(i + 1, j + 1)) * (1 - fu)
            + (H(i + 1, j) - H(i + 1, j + 1)) * (1 - fv))


def read_partition(city, ti, tj):
    p = os.path.join(city, f"{ti}_{tj}", "partition.json")
    if not os.path.exists(p):
        raise SystemExit(f"no partition for {ti},{tj} in {city}: run the city first")
    return json.load(open(p))


MIN_CARRIAGEWAY = 2.5
FACE_MARGIN = 0.2               # the file keeps 0.1 m, so a wall on a face's edge can lie 0.05 m inside a strip as wide as the face
FIT_CHANGE = 0.5                # metres: a fitted width differing this much starts a new record
FIT_SHORT = 12.0                # metres: a record shorter than this joins its neighbour


_PARTS = {}


def _parts_of(area):
    """`area`'s separate polygons and an index over them. Cut against the whole of a square's street
    surface, a ray costs the surface's size; against the few polygons it is near, almost nothing."""
    hit = _PARTS.get(id(area))
    if hit is None or hit[0] is not area:
        if len(_PARTS) > 8:
            _PARTS.clear()
        parts = list(getattr(area, "geoms", [area]))
        hit = _PARTS[id(area)] = (area, parts, STRtree(parts))
    return hit


def _reach(area, p, nx, ny, side, cap):
    """How far from `p`, square to the line on `side`, the ground stays inside `area`, up to `cap`."""
    ray = LineString([(p[0], p[1]), (p[0] + nx * side * cap, p[1] + ny * side * cap)])
    _, parts, tree = _parts_of(area)
    best = 0.0
    for j in tree.query(ray):
        hit = parts[int(j)].intersection(ray)
        for g in getattr(hit, "geoms", [hit]):
            if g.geom_type == "LineString" and g.distance(Point(p)) < 0.2:
                best = max(best, max(math.hypot(x - p[0], y - p[1]) for x, y in g.coords))
    return best


def _clearance(houses, p, nx, ny, side, cap, tall=None):
    """How far from `p`, square to the line on `side`, the nearest house wall stands, up to `cap`.
    With `tall` (the lidar, asked only for a street with a measured width), a footprint's edge counts
    only where something stands in it within `LIDAR_INTO` of it: an outline drawn out over an alley
    the survey sees open does not narrow a street below what was measured on it."""
    ray = LineString([(p[0], p[1]), (p[0] + nx * side * cap, p[1] + ny * side * cap)])
    _, parts, tree = _parts_of(houses)
    best = cap
    for j in tree.query(ray):
        hit = parts[int(j)].intersection(ray)
        if hit.is_empty:
            continue
        d = hit.distance(Point(p))
        if tall is not None:
            seen = next((d + s for s in np.arange(0.0, LIDAR_INTO + 0.01, 0.25)
                         if tall(p[0] + nx * side * (d + s), p[1] + ny * side * (d + s))), None)
            if seen is None:
                continue
            d = seen
        best = min(best, d)
    return best


def fit_to_faces(xy, ws, pvs, car_area, walk_area, houses=None, tall=None):
    """Re-centre a street's line on the carriageway the partition drew and give it that width.

    The corridor pass fitted `w` as a strip symmetric about the line, but the partition's carriageway
    face is that strip with the buildings, junctions and neighbours' ground cut out of it, so a wall
    standing on the face's edge was inside the strip the game draws. Measured square to the line at
    each point: how far the carriageway face reaches each side, and how much pavement face lies beyond
    it. `ws` and `pvs` are the corridor's figures at each point; a point that cannot be measured (no
    face there) keeps them. The two ends do not move, so they still meet the junction or the square's
    edge they were fitted to. Returns [(points, w, pv)], one record per run of similar width.

    With `houses`, the line is then moved, up to `HOUSE_SHIFT`, so its carriageway lies in the open
    ground between the buildings either side: a face too narrow to be measured, or a shift the face's
    own figures could not make, otherwise left a measured wall standing in the road."""
    n = len(xy)

    def normal(a, b):
        d = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
        return (-(b[1] - a[1]) / d, (b[0] - a[0]) / d)

    nrm = [normal(xy[max(0, k - 1)], xy[min(n - 1, k + 1)]) for k in range(n)]

    def measure(p, nx, ny, w, pv):
        cap = w / 2 + 0.3
        dl = _reach(car_area, p, nx, ny, 1, cap)
        dr = _reach(car_area, p, nx, ny, -1, cap)
        if dl + dr < 1.0:
            return None
        pl = _reach(walk_area, p, nx, ny, 1, dl + pv[0] + 0.5) - dl if pv[0] > 0 else 0.0
        pr = _reach(walk_area, p, nx, ny, -1, dr + pv[1] + 0.5) - dr if pv[1] > 0 else 0.0
        return (dl, dr, max(0.0, pl), max(0.0, pr))

    raw = [measure(xy[k], nrm[k][0], nrm[k][1], ws[k], pvs[k]) for k in range(n)]
    # halfway between two points as well, so a pinch between them is seen
    mid = [measure(((xy[k][0] + xy[k + 1][0]) / 2, (xy[k][1] + xy[k + 1][1]) / 2), *normal(xy[k], xy[k + 1]),
                   ws[k], pvs[k]) for k in range(n - 1)]
    shift = []
    for k in range(n):
        if raw[k] is None or k in (0, n - 1) or raw[k][0] + raw[k][1] < MIN_CARRIAGEWAY:
            shift.append(0.0)
        else:
            shift.append(max(-ws[k] / 4, min(ws[k] / 4, (raw[k][0] - raw[k][1]) / 2)))
    # averaged along the line, so the street does not jitter from one point to the next
    shift = [sum(shift[max(0, k - 1):k + 2]) / len(shift[max(0, k - 1):k + 2]) if 0 < k < n - 1 else 0.0
             for k in range(n)]
    width, pave = [], []
    for k in range(n):
        w, pv = ws[k], pvs[k]
        near = [m for m in (mid[k - 1] if k else None, raw[k], mid[k] if k < n - 1 else None) if m]
        if raw[k] is None or k in (0, n - 1):
            width.append(w); pave.append((pv[0], pv[1]))
            continue
        width.append(max(MIN_CARRIAGEWAY, min(w, min(m[0] + m[1] for m in near) - FACE_MARGIN)))
        pave.append((min(pv[0], min(m[2] for m in near)) if pv[0] > 0 else 0.0,
                     min(pv[1], min(m[3] for m in near)) if pv[1] > 0 else 0.0))
    if houses is not None and not houses.is_empty:
        shift, width, pave = _between_houses(xy, nrm, shift, width, pave, houses, tall)
    moved = [(xy[k][0] + nrm[k][0] * shift[k], xy[k][1] + nrm[k][1] * shift[k]) for k in range(n)]
    runs, i = [], 0
    while i < n - 1:
        j = i + 1
        while j < n - 1 and abs(width[j] - width[i]) < FIT_CHANGE and abs(pave[j][0] - pave[i][0]) < FIT_CHANGE \
                and abs(pave[j][1] - pave[i][1]) < FIT_CHANGE:
            j += 1
        runs.append([i, j, 0.0])
        i = j
    merged = []
    for r in runs:
        r[2] = sum(math.hypot(moved[k + 1][0] - moved[k][0], moved[k + 1][1] - moved[k][1]) for k in range(r[0], r[1]))
        if merged and (r[2] < FIT_SHORT or merged[-1][2] < FIT_SHORT):
            merged[-1] = [merged[-1][0], r[1], merged[-1][2] + r[2]]
        else:
            merged.append(r)
    out = []
    for i0, i1, _ in merged:
        w = min(width[i0:i1 + 1])
        pl = min(p[0] for p in pave[i0:i1 + 1])
        pr = min(p[1] for p in pave[i0:i1 + 1])
        out.append((moved[i0:i1 + 1], round(w, 2), [round(pl, 2), round(pr, 2)]))
    return out


HOUSE_SHIFT = 2.0               # metres a street's line may move to clear the buildings either side
HOUSE_MARGIN = 0.1
LIDAR_INTO = 1.5                # metres into a footprint the lidar is looked at for the building itself
LIDAR_TALL = 1.5                # metres above the ground: lower than this, nothing stands there
NARROW_LANE = 1.8               # metres: a car's width, the least a lane squeezed between two buildings is drawn


def _between_houses(xy, nrm, shift, width, pave, houses, tall=None):
    """(shift, width, pave) at each inner point: moved the least it must be for the carriageway to clear the
    houses each side, where there is room between them. Where there is not, the line is centred in the
    gap and the carriageway narrowed to it, down to `NARROW_LANE`, since the buildings are measured and
    the street's width is a guess, and each pavement stops at the wall beyond it. The ends stay put.
    Halfway between two points is measured too and asked of both."""
    n = len(xy)
    reach = max(width) / 2 + HOUSE_SHIFT + 0.5

    def room(p, nx, ny, half):
        if houses.contains(Point(p)):
            return None
        left = _clearance(houses, p, nx, ny, 1, reach, tall) - HOUSE_MARGIN
        right = _clearance(houses, p, nx, ny, -1, reach, tall) - HOUSE_MARGIN
        return (-right + half, left - half, left, right)

    out, wide, paved = list(shift), list(width), list(pave)
    reach += max(max(v) for v in pave)
    for k in range(1, n - 1):
        half = width[k] / 2
        spans = [room(xy[k], nrm[k][0], nrm[k][1], half)]
        for a, b in ((k - 1, k), (k, k + 1)):
            m = ((xy[a][0] + xy[b][0]) / 2, (xy[a][1] + xy[b][1]) / 2)
            d = math.hypot(xy[b][0] - xy[a][0], xy[b][1] - xy[a][1]) or 1.0
            spans.append(room(m, -(xy[b][1] - xy[a][1]) / d, (xy[b][0] - xy[a][0]) / d, half))
        spans = [s for s in spans if s is not None]
        if not spans:
            continue
        lo, hi = max(s[0] for s in spans), min(s[1] for s in spans)
        s = (lo + hi) / 2 if lo > hi else min(hi, max(lo, out[k]))
        if abs(s) <= HOUSE_SHIFT:
            out[k] = s
            if lo > hi:
                wide[k] = max(NARROW_LANE, min(width[k], hi - lo + 2 * half))
        h, s = wide[k] / 2, out[k]
        left, right = min(v[2] for v in spans), min(v[3] for v in spans)
        paved[k] = (max(0.0, min(pave[k][0], left - s - h)) if pave[k][0] > 0 else 0.0,
                    max(0.0, min(pave[k][1], right + s - h)) if pave[k][1] > 0 else 0.0)
    return out, wide, paved


def lidar_tall(sq):
    """Whether the lidar sees something `LIDAR_TALL` or more high at (x, y); None without the lidar."""
    from partition.standing import ndsm
    got = ndsm(sq)
    if got is None:
        return None
    g, x0, y0 = got

    def tall(x, y):
        r, c = int(y - y0), int(x - x0)
        if not (0 <= r < g.shape[0] and 0 <= c < g.shape[1]):
            return True
        v = g[r, c]
        return bool(np.isnan(v) or v >= LIDAR_TALL)
    return tall


def roads_from_corridors(rows, sq, ground, faces=None, blocks=None, profiles=None, crossings=None, tall=None):
    """`rd`: one record per corridor stretch, with its width and pavements.

    Pass 1 wrote each street's cross-section as *stretches* - (t0, t1, [w, pl, pr]) along the whole
    line - because a street's width changes along it and one record per street cannot say so. One
    record per stretch is what the plan asks for and what the game reads: `w` and `pv` are per record.

    A street that runs past the square is written only where it is inside, because the tile's terrain
    grid ends at the square's edge: a point off the grid has no ground height, and the game would
    place it at zero. (Measured before this clip: 1,075 of 16,962 road points came out at z=0, a few
    metres outside the square.)

    With `faces` = (carriageway area, carriageway-and-pavement area), a vehicle road is fitted to the
    carriageway the partition drew (`fit_to_faces`), so its records follow that rather than the
    corridor's stretches. With `blocks` (the buildings), a vehicle road stops at the wall of a house
    its line runs on through, as the old build did.

    `profiles` is pass 1's `structures.json`: each street's heights with its bridges and tunnels, so
    a road rises and falls like a road and a bridge stays a span instead of dropping into the gap.
    A street without a profile lies on the ground.

    `crossings` is (water, railway and canal lines): a footbridge over water alone is brought down to
    its banks.
    """
    out = []
    x0, y0, x1, y1 = sq
    frame = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    inner = [g for g in (b.buffer(-0.3) for b in blocks or []) if not g.is_empty]
    btree = STRtree(inner) if inner else None
    house_area = unary_union([b.buffer(0) for b in blocks]) if blocks else None
    road_lines = [LineString(r["line"]) for r in rows if r["cls"] not in GAME_PATHS]
    road_tree = STRtree(road_lines) if road_lines else None
    for r in rows:
        whole = LineString(r["line"])
        if not whole.intersects(frame):
            continue
        vehicle = r["cls"] not in GAME_PATHS
        fit = faces is not None and vehicle and not r.get("path")
        chain, chains = [], []      # (x, y, w, pv) along the street, broken where it leaves the square

        def flush():
            if len(chain) >= 2:
                chains.append(list(chain))
            chain.clear()

        for t0, t1, sec in r["sections"]:
            if t1 - t0 < 0.5:
                continue
            # the stretch, as the points along it that are inside the square. Sampling by length and
            # then dropping the outside points keeps the record's own geometry as the corridor's.
            n = max(2, int((t1 - t0) / SEGMENT) + 1)
            for k in range(n + 1):
                p = whole.interpolate(t0 + (t1 - t0) * k / n)
                if not (x0 <= p.x <= x1 and y0 <= p.y <= y1) or ground(p.x, p.y) is None:
                    flush()
                    continue
                pt = (p.x, p.y, float(sec[0]), (float(sec[1]), float(sec[2])))
                if fit and chain and k == 0 and math.hypot(chain[-1][0] - p.x, chain[-1][1] - p.y) < 0.05:
                    chain[-1] = pt          # the shared point takes the later stretch's figures
                    continue
                chain.append(pt)
            if not fit:
                flush()
        flush()
        prof = (profiles or {}).get(r.get("id"))
        for ch in chains:
            xy = [(c[0], c[1]) for c in ch]
            if fit:
                pieces = fit_to_faces(xy, [c[2] for c in ch], [c[3] for c in ch], faces[0], faces[1], house_area,
                                      tall if r.get("tagged") else None)
            else:
                pieces = [(xy, ch[0][2], list(ch[0][3]))]
            for pp, ww, vv in pieces:
                for seg in _outside_buildings(pp, btree, inner) if (vehicle and btree is not None) else [pp]:
                    marked = _profiled(seg, whole, prof, ground, crossings if not vehicle else None,
                                       (road_lines, road_tree) if not vehicle and road_lines else None,
                                       (road_lines, road_tree) if road_lines else None)
                    if marked is None:
                        continue
                    for piece, deep, lay, tow in marked:
                        for part in (h for whole_part in _surface_pieces(piece, deep) for h in _opened(whole_part)):
                            rec = dict(c=r["cls"], n=r.get("name", ""), p=part, w=round(ww, 2))
                            if lay:
                                rec["_lay"] = lay
                            if tow:
                                rec["_tow"] = tow
                            if not r.get("path"):
                                # always written: left out, the game gives a street 1.7 m of pavement each side
                                rec["pv"] = [round(vv[0], 2), round(vv[1], 2)]
                            out.append(rec)
    return out


def _opened(pts):
    """A street that comes back to where it began, as two halves: one record round a loop has no
    side that is its left all the way, so its pavements cannot be laid as one strip either side."""
    if len(pts) < 5 or math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) > 0.05:
        return [pts]
    k = len(pts) // 2
    return [pts[:k + 1], pts[k:]]


# Points (4 m apart) a street's approach to its bridge may keep its profile for, and the steepest the
# step back down to the ground may be where an approach has to stop short.
APPROACH = 9
ROAD_RAMP = 0.15


def _profiled(seg, whole, prof, ground, crossings=None, others=None, streets=None):
    """[(points, bored indexes)] for a run of points: heights from the street's stored profile, found
    by each point's distance along the whole street so a re-fitted or clipped line still reads the
    right height and bridge mark; the ground's own height where the street has no profile. None if
    a point is off the terrain grid."""
    gs = [ground(x, y) for x, y in seg]
    if any(g is None for g in gs):
        return None
    if prof and prof.get("gone"):
        # the stretches in one of the canal's tunnels are left out: the tunnel's ledge is the towpath
        steps = len(prof["z"]) - 1
        gone = set(prof["gone"])
        keep = [int(round(whole.project(Point(x, y)) / (whole.length or 1) * steps)) not in gone for x, y in seg]
        if not all(keep):
            rest = dict(prof, gone=[])
            out = []
            for st in stretches({i for i, k in enumerate(keep) if k}):
                if len(st) >= 2:
                    out += _profiled(seg[st[0]:st[-1] + 1], whole, rest, ground, crossings, others, streets) or []
            return out
    if not prof:
        zs = ease_bends(seg, gs, gs, set())
        return [([[round(x, 1), round(y, 1), round(z, 1)] for (x, y), z in zip(seg, zs)], set(), set(), set())]
    spans, decks, deep, dipped, tow, zs = set(), set(), set(), set(), set(), []
    steps = len(prof["z"]) - 1
    under = set(prof.get("dip") or ())
    towpath = set(prof.get("tow") or ())
    for i, (x, y) in enumerate(seg):
        f = whole.project(Point(x, y)) / (whole.length or 1) * steps
        lo = max(0, min(steps - 1, int(f)))
        zs.append(prof["z"][lo] + (prof["z"][lo + 1] - prof["z"][lo]) * (f - lo))
        near = int(round(f))
        if near in prof["span"]:
            spans.add(i)
        elif near in prof["deck"]:
            decks.add(i)
        elif near in under:
            dipped.add(i)
        elif near in towpath:
            tow.add(i)
        if any(i0 < near < i1 for i0, i1 in prof["bored"]):
            deep.add(i)
    if crossings:
        level_footbridges(seg, zs, gs, spans, crossings)
    # a path that passes under a bridge was dipped to leave headroom, below the ground the tile has
    # there: it keeps its dip instead of being held to the ground, and the ground is dug to it
    # (lay_ground). A street under a bridge stays on the ground the tile has cut for it.
    # A street's approach to its own bridge keeps its profile, and the ground is laid to it
    # afterwards (lay_ground). Held to the base tile's ground instead, which was laid to the old
    # build's lower approaches, the deck's end stood a metre over the ground.
    # (but not across another street, whose own height the ground is laid to)
    approach = _approaches(seg, zs, gs, spans | decks, ground, _across_streets(seg, streets) if streets and (spans or decks) else ())
    grow_marks(zs, gs, spans, decks, forbid=(_over_other_streets(seg, others) if others and (spans or decks) else set()) | tow | approach)
    # (but not beside its own deck, whose ends must meet the ground)
    beside = {j for i in spans | decks for j in range(i - 2, i + 3)}
    # the towpath is level with the canal's banks, which the game builds, whatever the ground under it;
    # but where a bridge starts off the towpath, its first point meets the ground the deck starts from
    tow -= {j for i in spans | decks for j in (i - 1, i + 1)}
    held = decks | tow | approach | (dipped - beside if others is not None else set())
    # (a deck's last points may come down to the ground, except at an end whose approach keeps its height)
    ends = {i for i in deck_ends(spans | decks) if not any(abs(i - j) <= 4 for j in approach)}
    zs = ease_bends(seg, follow_ground(zs, gs, spans, held), gs, spans | held, ends)
    # a deck carried straight over a rise in the ground would sink into it
    for i in spans:
        if gs[i] is not None and zs[i] < gs[i] - 0.25:
            zs[i] = gs[i] - 0.25
    pts = [[round(x, 1), round(y, 1), round(z, 1)] + ([1] if i in spans else [2] if i in decks else [])
           for i, ((x, y), z) in enumerate(zip(seg, zs))]
    lay = approach | (dipped - beside if others is not None else set())
    return [(pts, deep, {tuple(pts[i][:2]) for i in lay}, {tuple(pts[i][:2]) for i in tow})]


def _approaches(seg, zs, gs, marks, ground, blocked=(), reach=APPROACH, edge=8.0, tol=0.4):
    """The points on the ground leading to each end of a bridge's span or deck that keep their
    profile's height, for the ground to be laid to it (lay_ground): out from the deck's end until
    the profile comes back within `tol` of the ground, at most `reach` points. An approach that has
    to stop short of that, at the end of the run (a junction, whose other ways stay on the ground),
    at a point in `blocked`, or within `edge` metres of the edge of the tile's grid (which the next
    square shares and which is left alone), is let go if the step back down to the ground there
    would be steeper than ROAD_RAMP: it stays on the ground as before."""
    out = set()
    n = len(seg)

    def free(i):
        x, y = seg[i]
        return (0 < i < n - 1 and i not in marks and i not in blocked and gs[i] is not None
                and all(ground(x + a, y + b) is not None for a in (-edge, edge) for b in (-edge, edge)))
    for st in stretches(marks):
        for e, step in ((st[0], -1), (st[-1], 1)):
            run, met = [], False
            for k in range(1, reach + 1):
                i = e + step * k
                if not 0 <= i < n or i in marks:
                    met = True
                    break
                if abs(zs[i] - gs[i]) <= tol:
                    met = True
                    break
                if not free(i):
                    break
                run.append(i)
            if run and not met:
                last, nxt = run[-1], run[-1] + step
                if 0 <= nxt < n and gs[nxt] is not None:
                    held = min(max(zs[nxt], gs[nxt] - tol), gs[nxt] + tol)
                    if abs(zs[last] - held) > ROAD_RAMP * (math.dist(seg[last], seg[nxt]) or 0.01):
                        run = []
            # (the ground is laid along the way between its points, so one point alone lays none)
            if len(run) >= 2:
                out.update(run)
    return out


def _across_streets(seg, streets, least=30.0):
    """Which points of a run lie where it crosses another street at an angle (at least `least`
    degrees): not its own line, nor the next stretch of the same street, which the fitted points
    wander either side of."""
    lines, tree = streets
    out = set()
    for i in range(len(seg)):
        chord = LineString(seg[max(0, i - 1):i + 2])
        (ax, ay), (bx, by) = chord.coords[0], chord.coords[-1]
        for j in tree.query(chord):
            line = lines[int(j)]
            x = line.intersection(chord) if line.crosses(chord) else None
            if x is None or x.geom_type != "Point":
                continue
            t = line.project(x)
            (cx, cy), (dx_, dy_) = line.interpolate(max(0.0, t - 1.0)).coords[0], line.interpolate(t + 1.0).coords[0]
            cos = abs((bx - ax) * (dx_ - cx) + (by - ay) * (dy_ - cy)) / ((math.hypot(bx - ax, by - ay) * math.hypot(dx_ - cx, dy_ - cy)) or 1)
            if cos < math.cos(math.radians(least)):
                out.add(i)
                break
    return out


def _over_other_streets(seg, others):
    """Which points of a path lie where it crosses a street. A bridge's deck is run out to where the
    path meets the ground, and the ground has been cut for a street under it; but a path that was
    never marked as a bridge over that street crosses it at the street's level, and a deck run out
    over the street would stand a metre or two above it with no headroom."""
    lines, tree = others
    out = set()
    for i in range(len(seg)):
        chord = LineString(seg[max(0, i - 1):i + 2])
        if any(lines[int(j)].crosses(chord) for j in tree.query(chord)):
            out.add(i)
    return out


DECK_ABOVE_BANKS = 0.3


def level_footbridges(seg, zs, gs, spans, crossings):
    """Bring the deck of a footbridge over water alone down to its banks. The profile carries a
    bridge level between the highest points of road either side of it, which suits a road bridge
    but lifts a footbridge over a stream a couple of metres above the paths that meet it; the old
    build drew it level with the banks. One over a railway or the canal keeps its profile's height."""
    water, rails = crossings
    for st in stretches(spans):
        a, b = st[0] - 1, st[-1] + 1
        if a < 0 or b >= len(seg):
            continue
        line = LineString(seg[st[0]:st[-1] + 1] if len(st) > 1 else [seg[a], seg[b]])
        if any(r.distance(line) < 2.5 for r in rails) or not any(w.intersects(line) for w in water):
            continue
        zs[a], zs[b] = min(zs[a], gs[a] + 0.2), min(zs[b], gs[b] + 0.2)
        for i in st:
            f = (i - a) / (b - a)
            zs[i] = min(zs[i], gs[a] + (gs[b] - gs[a]) * f + DECK_ABOVE_BANKS)


def _outside_buildings(pts, btree, inner):
    """The parts of a line that do not run through a house, each at least 3 m long."""
    line = LineString(pts)
    hit = [inner[int(k)] for k in btree.query(line) if inner[int(k)].intersection(line).length > 1.0]
    if not hit:
        return [pts]
    rest = line.difference(unary_union([h.buffer(0.8) for h in hit]))
    return [list(g.coords) for g in getattr(rest, "geoms", [rest])
            if g.geom_type == "LineString" and g.length >= 3]


TOWPATH_UP = 0.4    # the towpath stands this far above the canal's water (web/src/works.ts UP)
LOCK_CLIMB = 45.0   # metres from a lock's gates within which the towpath climbs with the lock


def paths_on_the_towpath(rd, canal):
    """A path's points on the canal's bank, along open water, at the towpath's level. The towpath's
    own line carries the canal's level from its profile, but a short path joining it (from the
    steps by Bath Top Lock) was laid on the survey's ground, which runs under the bank the game
    builds, so it dipped half a metre into the towpath where it met it. Not by a lock, where the
    towpath climbs with it, nor on a bridge. Returns how many points were moved."""
    segs = []
    for run in (canal or {}).get("runs", []):
        for a, b in zip(run["p"], run["p"][1:]):
            if len(a) >= 9 and not (a[6] | b[6]) & 3:
                segs.append((a, b, run["lv"]))
    if not segs:
        return 0
    gates = [g for lk in (canal or {}).get("locks", []) for g in (lk["lo"], lk["hi"])]
    tree = STRtree([LineString([a[:2], b[:2]]) for a, b, _ in segs])
    moved = 0
    for r in rd:
        if r["c"] not in GAME_PATHS or r["c"] == "pedestrian":
            continue
        for i, q in enumerate(r["p"]):
            if len(q) > 3 or any(math.dist(q[:2], g) < LOCK_CLIMB for g in gates):
                continue
            pt = Point(q[:2])
            for k in tree.query(pt.buffer(12.0)):
                a, b, lv = segs[int(k)]
                L = math.dist(a[:2], b[:2]) or 1.0
                t = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / L ** 2
                if not 0 <= t <= 1:
                    continue
                o = ((q[0] - a[0]) * -(b[1] - a[1]) + (q[1] - a[1]) * (b[0] - a[0])) / L
                w = a[7] if o > 0 else a[8]
                if w >= 1.5 and a[2] + 0.5 < abs(o) < a[2] + w - 0.3:
                    z = round(lv + TOWPATH_UP, 1)
                    if abs(q[2] - z) > 0.05:
                        r["p"][i] = [q[0], q[1], z]
                        moved += 1
                    # (and kept there when the ground is laid: settle_on_laid_ground)
                    r.setdefault("_tow", set()).add(tuple(q[:2]))
                    break
    return moved


def no_span_over_tunnels(rd, canal, water, rails, ground=None):
    """A street over the canal where the canal runs in a tunnel, and nothing else passes under it,
    stands on the ground: there is nothing open under it to bridge. Marked as a span, its deck was
    cut out of the street's faces and left a slot in the pavement down to the ground beside the
    parapet (Sydney Road in Sydney Gardens). Run once the paths along streets have gone, which
    would otherwise count as passing under it."""
    tunnels, open_canal = [], []
    for run in (canal or {}).get("runs", []):
        for a, b in zip(run["p"], run["p"][1:]):
            (tunnels if (a[6] & b[6]) & 1 else open_canal).append(LineString([a[:2], b[:2]]))
    if not tunnels:
        return
    under = water + rails + open_canal
    tree = STRtree(under) if under else None
    ttree = STRtree(tunnels)
    for r in rd:
        flags = [len(q) > 3 and q[3] == 1 for q in r["p"]]
        if not any(flags):
            continue
        for st in stretches({i for i, f in enumerate(flags) if f}):
            a, b = max(0, st[0] - 1), min(len(r["p"]) - 1, st[-1] + 1)
            span = LineString([q[:2] for q in r["p"][a:b + 1]])
            if not any(tunnels[int(k)].intersects(span) for k in ttree.query(span)):
                continue
            if tree is not None and any(under[int(k)].intersects(span) for k in tree.query(span)):
                continue
            if any(o is not r and LineString([a[:2], b[:2]]).crosses(span)
                   for o in rd for a, b in zip(o["p"], o["p"][1:]) if len(a) == 3 and len(b) == 3):
                continue                    # a path on the ground under it, beside the canal's tunnel
            for i in st:
                x, y, z = r["p"][i][:3]
                g = ground(x, y) if ground else None
                # (its profile carried it straight over, clear of the ground it now lies on)
                r["p"][i] = [x, y, z if g is None else round(min(max(z, g - 0.4), g + 0.4), 1)]


def _flag(q):
    return q[3] if len(q) > 3 else 0


def whole_spans(rd, sq=None, ground=None, wet=None, cut=False, near=0.05):
    """Each bridge as one record from the bank at one end to the bank at the other. The corridors fit
    a street as a record per stretch of width, and a stretch can end halfway across a bridge; the
    game builds every record's span as a bridge of its own, so each joint grew an abutment block in
    the river, a break in the arches and parapet ends, and a record starting on its span had its
    abutment at the deck's height instead of on the ground.

    Records of the same street meeting alone at a point on a span are joined (not at a junction,
    where the other ways meet the bridge at that point, at its height). Each keeps its own widths in
    `_parts`, as the whole street runs on through the laying of the ground: a record's end can hold
    no approach. With `cut`, once the ground is laid, each joined street is cut again at the points
    on the ground either side of each span, the rest taking back their own widths, and the span the
    widths of the street as it now stands (its pavements evened, its deck's reach). A span left
    starting at its record's end, on the bank (within a step of the `ground`, and not in the water),
    then starts on the ground at that point; not on the edge of the square `sq`, where the bridge
    carries on into the next one. Returns how many joints were taken out."""
    def key(q):
        return (round(q[0] / near), round(q[1] / near))

    def on_bank(q, tol=0.6):
        g = ground(q[0], q[1]) if ground else None
        return g is not None and abs(q[2] - g) <= tol and not (wet and wet(q[0], q[1]))
    joined = _join_spans(rd, key)
    if cut:
        _cut_spans(rd)
        _ends_on_the_bank(rd, sq, on_bank)
    return joined


_OWN = ("p", "_lay", "_tow", "_parts", "dk")


def _turned(attrs):
    """A record's own fields looking the other way along it: its pavements swap sides, and a one-way
    street runs against its points."""
    out = dict(attrs)
    if out.get("pv"):
        out["pv"] = out["pv"][::-1]
    if out.get("ow"):
        out["ow"] = -out["ow"]
    return out


def _pieces_of(r, turned=False):
    """A record's pieces as [(x, y of its first point, its own fields)] looking along its points."""
    parts = r.get("_parts") or [(r["p"][0][0], r["p"][0][1], {k: v for k, v in r.items() if k not in _OWN})]
    if not turned:
        return list(parts)
    # (looking the other way, each piece starts at its old end)
    starts = [t[:2] for t in parts[1:]] + [tuple(r["p"][-1][:2])]
    return [(x, y, _turned(a)) for (x, y), (_, _, a) in zip(starts[::-1], parts[::-1])]


def _join_spans(rd, key):
    ends, meeting = collections.defaultdict(list), collections.Counter()
    for i, r in enumerate(rd):
        if len(r["p"]) >= 2:
            for e in (0, -1):
                meeting[key(r["p"][e])] += 1
                ends[(r["c"], r.get("n", ""), key(r["p"][e]))].append((i, e))
    link = {}
    for (_, _, at), rs in ends.items():
        if len(rs) == 2 and rs[0][0] != rs[1][0] and meeting[at] == 2 and any(_flag(rd[i]["p"][e]) for i, e in rs):
            link[rs[0]], link[rs[1]] = rs[1], rs[0]
    if not link:
        return 0
    done, out, joined = set(), [], 0
    for i, r in enumerate(rd):
        if i in done:
            continue
        if (i, 0) not in link and (i, -1) not in link:
            out.append(r)
            continue
        # back to the chain's first record, whose free end the chain starts from (-1 - e: the other end)
        start, enter, seen = i, 0, {i}
        while (start, enter) in link:
            nxt, e = link[(start, enter)]
            if nxt in seen:
                break
            seen.add(nxt)
            start, enter = nxt, -1 - e
        chain, cur = [], start
        while True:
            chain.append((cur, enter))
            done.add(cur)
            nxt = link.get((cur, -1 - enter))
            if nxt is None or nxt[0] in done:
                break
            cur, enter = nxt
        if len(chain) == 1:
            out.append(r)
            continue
        joined += len(chain) - 1
        pts, parts, on = [], [], collections.Counter()
        for k, (j, enter) in enumerate(chain):
            p = [list(q) for q in (rd[j]["p"] if enter == 0 else rd[j]["p"][::-1])]
            on[j] = sum(1 for q in p if _flag(q))
            parts += _pieces_of(rd[j], enter != 0)
            if k:
                q = pts[-1]
                f = 1 if 1 in (_flag(q), _flag(p[0])) else max(_flag(q), _flag(p[0]))
                # (the point shared is at the deck's height where either record has it on its span)
                z = p[0][2] if _flag(p[0]) == f and _flag(q) != f else q[2]
                pts[-1] = q[:2] + [z] + ([f] if f else [])
                p = p[1:]
            pts += p
        # (the street takes the widths of the record that was on most of the span)
        base, enter = max(chain, key=lambda c: on[c[0]])
        rec = {k: v for k, v in rd[base].items() if k not in _OWN}
        if enter != 0:
            rec = _turned(rec)
        rec["p"] = pts
        rec["_parts"] = parts
        for f in ("_lay", "_tow"):
            got = set().union(*(rd[j].get(f) or set() for j, _ in chain))
            if got:
                rec[f] = got
        out.append(rec)
    rd[:] = out
    return joined


def _cut_spans(rd):
    out = []
    for r in rd:
        parts = r.pop("_parts", None)
        if not parts:
            out.append(r)
            continue
        pts = r["p"]
        starts = {(x, y): k for k, (x, y, _) in enumerate(parts)}
        owner, cur, bounds = [], 0, set()
        for i, q in enumerate(pts):
            k = starts.get((q[0], q[1]))
            if k is not None and k != cur and i:
                bounds.add(i)
                cur = k
            owner.append(cur)
        spans = stretches({k for k, q in enumerate(pts) if _flag(q)})
        inside = [(max(0, st[0] - 1), min(len(pts) - 1, st[-1] + 1)) for st in spans]
        cuts = {0, len(pts) - 1} | {b for b in bounds if not any(a < b < e for a, e in inside)}
        cuts = sorted(cuts | {a for a, _ in inside} | {e for _, e in inside})
        for a, b in zip(cuts, cuts[1:]):
            if any(_flag(q) for q in pts[a:b + 1]):
                rec = {k: v for k, v in r.items() if k not in ("p", "_lay", "_tow")}
            else:
                rec = dict(parts[owner[a + 1]][2])
            rec["p"] = pts[a:b + 1]
            for f in ("_lay", "_tow"):
                if r.get(f):
                    rec[f] = r[f]
            out.append(rec)
    rd[:] = out


def _ends_on_the_bank(rd, sq, on_bank, edge=3.0):
    for r in rd:
        p = r["p"]
        if len(p) < 3:
            continue
        for e in (0, -1):
            q = p[e]
            if _flag(q) == 1 and on_bank(q) and not (sq and min(q[0] - sq[0], sq[2] - q[0], q[1] - sq[1], sq[3] - q[1]) < edge):
                p[e] = q[:3]


def even_bridge_pavements(rd, houses=()):
    """A bridge's pavements as wide as each other. The game stands both parapets at the wider
    pavement's edge, so a narrower one on the other side left a slot between the pavement and the
    parapet that showed the river through it. A side with no pavement keeps none (a path often
    runs there on its own deck), and a bridge with buildings on it (Pulteney Bridge's shops) keeps
    its own: the wider pavement would run into them."""
    htree = STRtree(list(houses)) if len(houses) else None
    for r in rd:
        pv = r.get("pv")
        if not (pv and r["c"] in KERBED and pv[0] != pv[1] and min(pv) > 0 and any(len(q) > 3 and q[3] in (1, 2) for q in r["p"])):
            continue
        on = [i for i, q in enumerate(r["p"]) if len(q) > 3 and q[3] in (1, 2)]
        deck = r["p"][max(0, on[0] - 1):on[-1] + 2]
        reach = LineString([q[:2] for q in deck]).buffer(r["w"] / 2 + max(pv), cap_style="flat")
        if htree is not None and any(houses[int(k)].intersection(reach).area > 1.0 for k in htree.query(reach)):
            continue
        r["pv"] = [max(pv), max(pv)]


DIP_REACH = 40.0    # metres from a bridge's span that a path may have been dipped for its headroom
PATH_HEAD = 3.5     # metres from a deck's top down to a path under it: the deck (0.9 m) and 2.6 m clear
DIP_GRADE = 0.1     # the steepest a path is let down towards a bridge it passes under


def dip_paths_under_spans(rd):
    """A path passing under another way's span, too close under its deck, let down to leave
    `PATH_HEAD` below it, and back up to its own line along the way at `DIP_GRADE`. The profiles
    dip a path under a bridge, but some too little (the cycleway under Stanier Road, 2 m) or not at
    all (the footway under Warminster Road, 1.7 m): the path ran into the deck's side with no gap
    to walk through. The ground is dug to it afterwards (lay_ground digs for a path buried near a
    span). Returns how many paths were let down."""
    decks = []
    for r in rd:
        if r["c"] in GAME_PATHS:
            continue
        # (the span itself, not the stretch from its last point down to the abutment, where a path
        # meeting the street at its bank crosses it on the ground)
        for a, b in zip(r["p"], r["p"][1:]):
            if _flag(a) == 1 and _flag(b) == 1:
                decks.append((LineString([a[:2], b[:2]]), a[2], b[2]))
    if not decks:
        return 0
    tree = STRtree([d for d, _, _ in decks])
    dipped = 0
    for r in rd:
        p = r["p"]
        if r["c"] not in GAME_PATHS or r["c"] == "pedestrian" or len(p) < 2:
            continue
        line = LineString([q[:2] for q in p])
        along = [line.project(Point(q[:2])) for q in p]
        lows = []
        for k in tree.query(line):
            d, za, zb = decks[int(k)]
            x = d.intersection(line)
            if x.is_empty or x.geom_type != "Point":
                continue
            at = line.project(x)
            i = max(0, min(len(p) - 2, int(np.searchsorted(along, at)) - 1))
            if _flag(p[i]) or _flag(p[i + 1]):
                continue
            f = (at - along[i]) / ((along[i + 1] - along[i]) or 1)
            zp = p[i][2] + (p[i + 1][2] - p[i][2]) * f
            zd = za + (zb - za) * d.project(x, normalized=True)
            if zd - zp < PATH_HEAD and zd - zp > 1.0:     # (not a path crossing the deck at its level)
                lows.append((at, zd - PATH_HEAD))
        if not lows:
            continue
        tow = r.get("_tow") or ()
        for i, q in enumerate(p):
            if _flag(q) or tuple(q[:2]) in tow:
                continue
            z = min(low + max(0.0, abs(along[i] - at) - 6.0) * DIP_GRADE for at, low in lows)
            if z < q[2] - 0.05:
                p[i] = [q[0], q[1], round(z, 1)]
        dipped += 1
    return dipped
SLOPE = 1.5         # the ground eases from a way's level to its own over this many metres per metre of difference
EASE = 12.0         # and over this far at most
LAY_KERB = 1.7      # a kerbed street's pavement where its record gives none
PAVE_FALL = 0.12    # metres a pavement's back edge may fall or rise from the street's level, towards the ground


def _grid_points(T, ring, reach):
    """The window of the tile's grid within `reach` of a run's bounds, its vertices' x and y."""
    x0, y0, dx, dy, nx, ny = T["x0"], T["y0"], T["dx"], T["dy"], T["nx"], T["ny"]
    xs, ys = [q[0] for q in ring], [q[1] for q in ring]
    i0, i1 = max(0, int((min(xs) - reach - x0) / dx)), min(nx - 1, int((max(xs) + reach - x0) / dx) + 1)
    j0, j1 = max(0, int((min(ys) - reach - y0) / dy)), min(ny - 1, int((max(ys) + reach - y0) / dy) + 1)
    if i1 < i0 or j1 < j0:
        return None
    W = (slice(j0, j1 + 1), slice(i0, i1 + 1))
    gx, gy = np.meshgrid(x0 + np.arange(i0, i1 + 1) * dx, y0 + np.arange(j0, j1 + 1) * dy)
    return W, gx, gy


def lay_ground(T, rd, houses=(), rails=()):
    """Lay the tile's ground to this build's own streets and paths where they meet their bridges,
    by the old build's rules (`prep_map.py`'s flatten, its protection of the ground under a span, cut
    0.6 m under the deck where it humps up and lifted along every way at grade, and its blend), on
    top of the base tile's ground, which was laid to the old build's roads. Laid: a street's or a
    path's approach to its own bridge (`_approaches`), and a path dipped under another way's bridge
    for headroom, dug as wide as a verge (the old build left that to the survey, which often has the
    bridge in it, and the path ran through solid ground). The ground under a street at grade and
    under the railway stays as it was, and nothing beside a street's carriageway wins it; nor does
    the outermost ring of the grid, which the next square shares, nor the ground in buildings.
    `_lay` on a record holds the points laid to. Returns the change, as a function of a map point,
    so what stands on the ground can follow it."""
    nx, ny, z0 = T["nx"], T["ny"], T["z0"]
    grid = np.array(T["h"], dtype=float).reshape(ny, nx) / 10.0 + z0
    old = grid.copy()
    flat_w = np.full(grid.shape, np.inf)
    flat_z = grid.copy()
    flat_in = np.zeros(grid.shape, dtype=bool)
    flat_f = np.zeros(grid.shape)
    protect = np.zeros(grid.shape, dtype=bool)

    def kerb(r):
        return max(r.get("pv") or [LAY_KERB]) if r["c"] in KERBED else 0.3

    def flagged(q, *flags):
        return len(q) > 3 and q[3] in flags

    for r in rd:
        p = r["p"]
        span = {i for i, q in enumerate(p) if flagged(q, 1)}
        for st in stretches(span):
            if len(st) < 4:
                continue
            inner = [p[i] for i in st[1:-1]]
            line = LineString([q[:2] for q in inner])
            got = _grid_points(T, inner, r.get("w", 4) / 2 + kerb(r) + 1.0)
            if got is None:
                continue
            W, gx, gy = got
            inn = shapely.contains_xy(line.buffer(r.get("w", 4) / 2 + kerb(r) + 1.0, cap_style="flat"), gx, gy)
            if not inn.any():
                continue
            t = np.array([line.project(Point(x, y)) for x, y in zip(gx[inn], gy[inn])]) / (line.length or 1) * (len(inner) - 1)
            lo = np.clip(t.astype(int), 0, len(inner) - 2)
            zs = np.array([q[2] for q in inner])
            deck = zs[lo] + (zs[lo + 1] - zs[lo]) * (t - lo)
            blk = protect[W]; blk[inn] = True
            blk = grid[W]; blk[inn] = np.minimum(blk[inn], deck - 0.6)
    for r in rd:
        p = r["p"]
        for st in stretches({i for i, q in enumerate(p) if not flagged(q, 1, 2)}):
            if len(st) < 2:
                continue
            run = [p[i] for i in st]
            half = r.get("w", 4) / 2 + 2.5
            got = _grid_points(T, run, half)
            if got is None:
                continue
            W, gx, gy = got
            inn = shapely.contains_xy(LineString([q[:2] for q in run]).buffer(half, cap_style="flat"), gx, gy)
            blk = protect[W]; blk[inn] = False

    def flatten(run, reach):
        for a, b in zip(run, run[1:]):
            far = reach + EASE
            got = _grid_points(T, [a, b], far)
            if got is None:
                continue
            W, px, py = got
            vx, vy = b[0] - a[0], b[1] - a[1]
            t = np.clip(((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy or 1), 0, 1)
            d = np.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy))
            zz = a[2] + (b[2] - a[2]) * t
            inside = d < reach
            # the nearest way wins, but a carriageway beats another way's easing
            win = (d < far) & np.where(inside, ~flat_in[W] | (d < flat_w[W]), ~flat_in[W] & (d < flat_w[W])) & ~protect[W]
            flat_w[W][win] = d[win]
            flat_z[W][win] = zz[win]
            flat_f[W][win] = reach
            flat_in[W] |= win & inside

    deck_nodes = {(q[0], q[1]) for r in rd if r["c"] not in GAME_PATHS or r["c"] == "pedestrian"
                  for q in r["p"] if flagged(q, 1)}

    def hold(run, reach, core=0.0):
        # (the ground under a street or the railway on the ground stays as the base tile laid it,
        # which is what it lies on: nothing laid beside it may ease it away)
        for a, b in zip(run, run[1:]):
            got = _grid_points(T, [a, b], reach)
            if got is None:
                continue
            W, px, py = got
            vx, vy = b[0] - a[0], b[1] - a[1]
            t = np.clip(((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy or 1), 0, 1)
            d = np.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy))
            win = (d < reach) & (d < flat_w[W])
            # (and under its carriageway nothing laid beside it wins, however near)
            flat_w[W][win] = np.where(d[win] < core, 0.0, d[win])
            flat_z[W][win] = grid[W][win]
            flat_f[W][win] = reach
            flat_in[W] |= win

    for r in rd:
        p, lay = r["p"], r.get("_lay") or set()
        street = r["c"] not in GAME_PATHS or r["c"] == "pedestrian"
        reach = r.get("w", 4) / 2 + (max(2.5, kerb(r) + 0.5) if street else 1.0)
        if street:
            # (but where a street meets another's bridge, that bridge's end is dug past for a path
            # just beyond it, and the point they share rides on its deck: settle_on_laid_ground)
            at_deck = {i for i, q in enumerate(p) if (q[0], q[1]) in deck_nodes}
            for st in stretches({i for i, q in enumerate(p) if not flagged(q, 1, 2) and tuple(q[:2]) not in lay}):
                for a, b in zip(st, st[1:]):
                    hold([p[a], p[b]], reach, 0.0 if a in at_deck or b in at_deck else r.get("w", 4) / 2 + 0.5)
    for t in rails:
        for st in stretches({i for i, q in enumerate(t["p"]) if len(q) > 3 and q[3] == 0}):
            if len(st) >= 2:
                hold([t["p"][i] for i in st], RAIL_HALF)
    # (a path carried over from the base tile has no profile of ours, but was dipped all the same:
    # one that passes under a bridge is dug for where it lies buried in the ground near it)
    spans = [(LineString([a[:2], b[:2]]), r) for r in rd for a, b in zip(r["p"], r["p"][1:]) if flagged(a, 1) and flagged(b, 1)]
    near_span = unary_union([s.buffer(DIP_REACH) for s, _ in spans]) if spans else Polygon()
    overhead = unary_union([s.buffer(o.get("w", 4) / 2 + 1.0) for s, o in spans]) if spans else Polygon()
    shapely.prepare(near_span)

    def buried(q):
        g = ground_at(T, q[0], q[1], split=False)
        return g is not None and q[2] < g - 0.3 and shapely.contains_xy(near_span, q[0], q[1])
    for r in rd:
        p, lay = r["p"], r.get("_lay") or set()
        street = r["c"] not in GAME_PATHS or r["c"] == "pedestrian"
        reach = r.get("w", 4) / 2 + (max(2.5, kerb(r) + 0.5) if street else 1.0)
        if not street and len(p) > 1 and overhead.intersects(LineString([q[:2] for q in p])):
            lay = lay | {tuple(q[:2]) for q in p if len(q) < 4 and buried(q) and tuple(q[:2]) not in (r.get("_tow") or ())}
            r["_lay"] = lay
        for st in stretches({i for i, q in enumerate(p) if not flagged(q, 1, 2) and tuple(q[:2]) in lay}):
            if len(st) >= 2:
                run = [p[i] for i in st]
                # a cutting is dug as wide as a street's verge, so the ground the path reads between
                # the grid's points is the cutting's floor, not halfway up its side
                dug = not street and any((g := ground_at(T, q[0], q[1], split=False)) is not None and q[2] < g - 0.3 for q in run)
                flatten(run, r.get("w", 4) / 2 + 2.5 if dug else reach)
    ease = np.clip(np.abs(grid - flat_z) * SLOPE, 2.5, EASE)
    k = np.clip((flat_w - flat_f) / ease, 0, 1)
    k = k * k * (3 - 2 * k)
    k[np.isinf(flat_w)] = 1
    grid = flat_z * (1 - k) + grid * k
    keep = np.zeros(grid.shape, dtype=bool)
    keep[0, :] = keep[-1, :] = keep[:, 0] = keep[:, -1] = True
    for g in houses:
        got = _grid_points(T, list(g.exterior.coords), 0.0)
        if got is not None:
            W, gx, gy = got
            blk = keep[W]; blk |= shapely.contains_xy(g, gx, gy)
    grid[keep] = old[keep]
    T["h"] = [int(v) for v in np.round((grid - z0) * 10).ravel()]
    before = dict(T, h=[int(v) for v in np.round((old - z0) * 10).ravel()])

    def change(x, y, split=True):
        a, b = ground_at(before, x, y, split), ground_at(T, x, y, split)
        return 0.0 if a is None or b is None else b - a
    return change


def settle_on_laid_ground(rd, change, ground, reach=3):
    """After the ground is laid: a path that lies on the ground, where the ground was not laid to
    it, goes up and down with the ground (not the towpath, which keeps the canal's level); and where the ground was dug away from under a street (a
    path dug under it just past the end of its span), the span runs on, by at most `reach` points,
    to where its deck meets the ground as it now is, as `prep_map.py` runs its spans on after its flatten."""
    for r in rd:
        p, lay, tow = r["p"], r.pop("_lay", None) or set(), r.pop("_tow", None) or set()
        if r["c"] not in GAME_PATHS or r["c"] == "pedestrian":
            r["_lay"] = lay
        else:
            for q in p:
                if len(q) < 4 and tuple(q[:2]) not in lay and tuple(q[:2]) not in tow:
                    dz = change(q[0], q[1], False)
                    if abs(dz) > 0.05:
                        q[2] = round(q[2] + dz, 1)
    def low(q, by=0.3):
        # (only where the laying took the ground away: elsewhere the spans were run out already)
        g = ground(q[0], q[1])
        return len(q) < 4 and g is not None and q[2] - g > by and change(q[0], q[1], False) < -0.1
    streets = [r for r in rd if r["c"] not in GAME_PATHS or r["c"] == "pedestrian"]
    grown = 0
    for r in streets:
        p = r["p"]
        span = {i for i, q in enumerate(p) if len(q) > 3 and q[3] == 1}
        for st in stretches(span):
            for e, step in ((st[0], -1), (st[-1], 1)):
                for k in range(1, reach + 1):
                    i = e + step * k
                    if not 0 <= i < len(p) or not low(p[i]):
                        break
                    span.add(i)
        for i in span:
            if len(p[i]) < 4:
                p[i] = p[i][:3] + [1]
                grown += 1
        # (an approach the ground could not be laid to, beside another street's carriageway,
        # comes back to the ground as it was held before)
        lay = r.pop("_lay", None) or set()
        for q in p:
            g = ground(q[0], q[1]) if len(q) < 4 and tuple(q[:2]) in lay else None
            if g is not None and abs(q[2] - g) > 0.4:
                q[2] = round(min(max(q[2], g - 0.4), g + 0.4), 1)
    # a street that ends where another's span begins shares that point with the bridge: where the
    # ground was dug from under it, it rides on that bridge's deck (2), and builds nothing of its own
    ends = {(q[0], q[1]) for r in streets for q in (r["p"][0], r["p"][-1]) if len(q) > 3 and q[3] == 1}
    for r in streets:
        p = r["p"]
        for i in (0, len(p) - 1):
            # (the street's faces are drawn on the ground, so even a small drop there shows as a
            # step down from the deck)
            if (p[i][0], p[i][1]) in ends and low(p[i], 0.1):
                p[i] = p[i][:3] + [2]
                grown += 1
    return grown


def follow_laid_ground(tile, change):
    """What the base tile placed on its ground (street items, trees, shrubs, doors, signs, landmarks,
    bay windows, road markings) moved up or down with the ground under it."""
    moved = 0
    for key, xi, zi in (("fx", 1, 3), ("tr", 0, 2), ("sb", 0, 2), ("dr", 0, 2), ("sh", 0, 2),
                        ("lm", 1, 3), ("by", 0, 2)):
        for row in tile.get(key) or []:
            if len(row) > zi and isinstance(row[zi], (int, float)) and isinstance(row[xi], (int, float)):
                dz = change(row[xi], row[xi + 1])
                if abs(dz) > 0.05:
                    row[zi] = round(row[zi] + dz, 2)
                    moved += 1
    # (and a wire's ends with the poles they hang from, which are street items)
    for key, ends in (("mk", ((0, 4), (2, 5))), ("wr", ((0, 2), (3, 5)))):
        for row in tile.get(key) or []:
            for xi, zi in ends:
                dz = change(row[xi], row[xi + 1])
                if abs(dz) > 0.05:
                    row[zi] = round(row[zi] + dz, 2)
    return moved


def deck_reach(rd):
    """`dk` on each street with a bridge: how far its deck reaches each side, so the game builds it
    to the street's own faces rather than to a default street's, which can stand over the plots
    beside a narrower one. Each side is its own: a parapet stands at the edge of that side's
    pavement, or at the kerb where it has none, so a bridge with a pavement on one side has no slot
    of open ground between the kerb and the parapet on the other. A side takes in any path riding on
    the deck beside it, but not one whose nearest point is past the deck's end (a path crossing the
    street on the ground there). Written as one number when both sides reach as far, else
    [left, right]."""
    riders = [(Point(q[:2]), r["w"] / 2) for r in rd if r["c"] in GAME_PATHS
              for q in r["p"] if len(q) > 3 and q[3] == 2]
    rtree = STRtree([pt for pt, _ in riders]) if riders else None
    for r in rd:
        if r["c"] in GAME_PATHS or len(r["p"]) < 2 or not any(len(q) > 3 and q[3] == 1 for q in r["p"]):
            continue
        pv = (r.get("pv") or [0, 0]) if r["c"] in KERBED else [0, 0]
        side = [r["w"] / 2 + pv[0], r["w"] / 2 + pv[1]]
        if rtree is not None:
            on = [i for i, q in enumerate(r["p"]) if len(q) > 3 and q[3] in (1, 2)]
            line = LineString([q[:2] for q in r["p"][max(0, on[0] - 1):on[-1] + 2]])
            for k in rtree.query(line.buffer(max(side) + 6.0)):
                pt, half = riders[int(k)]
                if 0 < line.project(pt) < line.length:
                    s_ = _side(line, pt)
                    side[s_] = max(side[s_], line.distance(pt) + half)
        side = [round(v, 2) for v in side]
        r["dk"] = side[0] if side[0] == side[1] else side


STRUCTURES = {"arch": "arch", "humpback": "arch", "beam": "beam", "girder": "beam", "truss": "truss",
              "suspension": "foot", "simple-suspension": "foot", "cable-stayed": "beam", "cantilever": "beam"}
LONG_ARCH = 70.0      # metres: a river crossing longer than this with nothing to say otherwise is a modern beam


def osm_bridges(sq, reach=60.0):
    """OpenStreetMap's bridges round the square: (lines, outlines), each a list of (shape, tags)."""
    from partition import load_layer
    bb = (sq[0] - reach, sq[1] - reach, sq[2] + reach, sq[3] + reach)
    got = load_layer(os.path.join(ROOT, "data", "raw", MAP, "wide"), "osm-bridges", bb)
    return ([(g, p) for g, p in got if p.get("man_made") != "bridge" and g.geom_type == "LineString"],
            [(g, p) for g, p in got if p.get("man_made") == "bridge" and g.geom_type in ("Polygon", "MultiPolygon")])


def bridge_kinds(rd, osm, water, rails, canal_lines):
    """`bt` on each street or path with a span: what kind of bridge the game builds for it, and
    `uo`, the stretches of it over a road, path or railway passing under, where no pier may stand.

    "arch" is masonry, a stone arch or a row of them; "beam" a flat concrete or steel deck on slim
    piers with railings; "truss" a beam with steel trusses for its sides; "foot" a light footbridge,
    a thin deck between railings. OpenStreetMap says which where it is mapped (the bridge's outline
    or its way: `bridge:structure`; a viaduct or aqueduct, which round here are stone; a swing
    bridge, a steel deck). Where it
    isn't, it goes by what the bridge carries and crosses, as Bath's are built: the canal's bridges
    and the railway's over and under roads are stone arches, as are an old railway's that a path
    now runs along (Linear Park, the Two Tunnels), farm tracks' bridges and the
    streets' over the river and the brooks; a trunk road's bridge (but over the railway) and a main
    road's over another road are modern beams, as is a very long crossing; and a path's own bridge
    is a footbridge."""
    lines, outlines = osm
    ltree = STRtree([g for g, _ in lines]) if lines else None
    otree = STRtree([g for g, _ in outlines]) if outlines else None
    wtree = STRtree(water) if water else None
    rtree = STRtree(rails) if rails else None
    ctree = STRtree(canal_lines) if canal_lines else None
    ways = [(LineString([q[:2] for q in r["p"]]), r) for r in rd if len(r["p"]) > 1]
    way_tree = STRtree([l for l, _ in ways]) if ways else None
    for r in rd:
        p = r["p"]
        on = [i for i, q in enumerate(p) if len(q) > 3 and q[3] == 1]
        if len(p) < 2 or not on:
            r.pop("bt", None)
            continue
        span = LineString([q[:2] for q in p[max(0, on[0] - 1):on[-1] + 2]])
        mid = span.interpolate(0.5, normalized=True)
        path = r["c"] in GAME_PATHS
        tags = {}
        if otree is not None:
            # the outline the span runs furthest through
            hit = [(outlines[int(k)][0].intersection(span).length, outlines[int(k)][1]) for k in otree.query(span)]
            hit = [h for h in hit if h[0] > min(5.0, span.length * 0.3)]
            tags = max(hit, key=lambda h: h[0])[1] if hit else {}
        if not tags.get("bridge:structure") and ltree is not None:
            near = [(lines[int(k)][0].distance(mid), lines[int(k)][1]) for k in ltree.query(mid.buffer(6.0))]
            near = [(d, t) for d, t in near if t.get("highway") and (t["highway"] in GAME_PATHS) == path]
            if near:
                way = min(near, key=lambda t: t[0])[1]
                tags = dict(way, **{k: v for k, v in tags.items() if v})
        hits = lambda tree, geoms: tree is not None and any(geoms[int(k)].intersects(span) for k in tree.query(span))
        over_canal = hits(ctree, canal_lines)
        over_rail = hits(rtree, rails)
        over_water = hits(wtree, water)
        over_road = False
        whole = LineString([q[:2] for q in p])
        kept = []

        def keep_clear(shape):
            # the stretch of the record over it, in metres from its first point
            x = whole.intersection(shape)
            for piece in getattr(x, "geoms", [x]):
                if piece.geom_type == "LineString" and piece.length > 0:
                    ends = sorted(whole.project(Point(c)) for c in (piece.coords[0], piece.coords[-1]))
                    kept.append([round(ends[0], 1), round(ends[1], 1)])
        if way_tree is not None:
            for k in way_tree.query(span):
                l, o = ways[int(k)]
                if o is r or not l.crosses(span):
                    continue
                x = l.intersection(span)
                x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point":
                    continue
                zo = min(o["p"], key=lambda q: math.dist(q[:2], (x.x, x.y)))[2]
                zr = min(p, key=lambda q: math.dist(q[:2], (x.x, x.y)))[2]
                if zr - zo > (2.0 if o["c"] in GAME_PATHS else 2.5):
                    over_road |= o["c"] not in GAME_PATHS
                    reach = o["w"] / 2 + (max(o.get("pv") or [0]) if o["c"] in KERBED else 0.3)
                    keep_clear(l.buffer(reach + 1.0, cap_style="flat"))
        if over_rail:
            for k in rtree.query(span):
                if rails[int(k)].intersects(span):
                    keep_clear(rails[int(k)].buffer(RAIL_HALF + 1.0, cap_style="flat"))
        if kept:
            r["uo"] = kept
        else:
            r.pop("uo", None)
        kind = STRUCTURES.get(tags.get("bridge:structure") or "")
        if kind is None and tags.get("bridge") in ("viaduct", "aqueduct"):
            kind = "arch"
        if kind is None and tags.get("bridge") == "movable":
            kind = "beam"       # (a swing bridge's steel deck)
        if kind is None:
            if r["c"] == "track" or over_canal or tags.get("railway") in ("abandoned", "disused"):
                kind = "arch"
            elif path:
                kind = "foot"
            elif r["c"] in ("motorway", "trunk") and not over_rail or over_road and r["c"] == "primary":
                kind = "beam"
            elif over_water and span.length > LONG_ARCH:
                kind = "beam"
            else:
                kind = "arch"
        if kind == "beam" and path:
            kind = "foot"
        r["bt"] = kind


BANK = 1.5        # metres: the end of a span the abutment stands on


def deck_gaps(rd, ground, depth=0.9):
    """The gap under each bridge's deck: (outline, line, distances along it, the underside's height
    at each point), from the abutment at one end to the other, out to the parapets. The deck is
    `depth` thick, as the game builds it (world.ts)."""
    out = []
    for r in rd:
        p = r["p"]
        mk = [q[3] if len(q) > 3 else 0 for q in p]
        if len(p) < 2 or 1 not in mk:
            continue
        dk = r.get("dk")
        hl, hr = (dk if isinstance(dk, list) else [dk or r["w"] / 2 + max(r.get("pv") or [0]), ] * 2)[:2]
        k = 0
        while k < len(p):
            if mk[k] != 1:
                k += 1
                continue
            e = k
            while e + 1 < len(p) and mk[e + 1] == 1:
                e += 1
            a, b = max(0, k - 1), min(len(p) - 1, e + 1)
            k = e + 1
            xy = [q[:2] for q in p[a:b + 1]]
            line = LineString(xy)
            if line.length < 2 * BANK + 1:
                continue
            under = [(q[2] if mk[a + i] else ground(q[0], q[1])) - depth for i, q in enumerate(p[a:b + 1])]
            cum = [0.0]
            for u, v in zip(xy, xy[1:]):
                cum.append(cum[-1] + math.dist(u, v))
            core = substring(line, BANK, line.length - BANK)
            outline = core.buffer(hl + 0.4, single_sided=True, cap_style="flat").union(
                core.buffer(-(hr + 0.4), single_sided=True, cap_style="flat"))
            out.append((outline, line, cum, under))
    return out


def under_a_deck(gaps, x, y, foot, room=0.3):
    """Does something whose foot is at `foot` stand in the gap under a bridge's deck at (x, y)?"""
    pt = Point(x, y)
    for outline, line, cum, under in gaps:
        if outline.contains(pt) and foot < float(np.interp(line.project(pt), cum, under)) - room:
            return True
    return False


def clear_under_decks(tile, gaps, gone):
    """Trees, shrubs and street items (parked cars aside) standing under a bridge's deck go: the gap
    under a bridge is open, as it is in Bath (what is in it is the river, the road or the path it
    crosses, or the bank)."""
    if not gaps:
        return
    for field, xy in (("tr", lambda q: (q[0], q[1], q[2])), ("sb", lambda q: (q[0], q[1], q[2])),
                      ("fx", lambda q: (q[1], q[2], q[3]))):
        keep = []
        for q in tile.get(field) or []:
            if (field != "fx" or q[0] != "car") and under_a_deck(gaps, *xy(q)):
                gone[field] += 1
            else:
                keep.append(q)
        tile[field] = keep


def _side(line, pt):
    """0 if pt lies left of the line (looking along it), 1 if right: the order of `pv` and `dk`."""
    t = line.project(pt)
    a, b = line.interpolate(max(0.0, t - 0.5)), line.interpolate(min(line.length, t + 0.5))
    return 0 if (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x) > 0 else 1


def bridge_decks(rd):
    """The ground each bridge's deck covers, with room for its parapets, or None. A bridge is drawn
    as a strip with what holds it up, so the faces leave it out."""
    decks = [LineString([q[:2] for q in r["p"]]).buffer(r["w"] / 2 + (0.5 if r["c"] in GAME_PATHS else max(r.get("pv") or [0]) + 0.5),
                                                       cap_style="flat")
             for r in rd if len(r["p"]) > 1 and any(len(q) > 3 and q[3] in (1, 2) for q in r["p"])]
    return unary_union(decks) if decks else None


FRONT_PATH_HALF = 0.55      # metres: half a front path's width, as the game drew its strip
PATH_STEP = 3.0             # metres: the longest edge of a path's outline, so it can follow the ground (a 4 m grid)


NODE_TOL = 1e-3     # metres: a corner this close to a neighbour's edge is on it


def noded(pieces):
    """The pieces with every corner of each one's neighbours along their shared edges, so two faces
    never meet with a corner of one partway along an edge of the other. Faces at different heights
    (two streets levelled at their own middles) would otherwise open a crack along that edge."""
    tree = STRtree(pieces)
    out = []
    for n, g in enumerate(pieces):
        near = [pieces[int(k)] for k in tree.query(g, predicate="dwithin", distance=NODE_TOL) if int(k) != n]
        if g.is_empty or not near:
            out.append(g)
            continue
        out.append(shapely.snap(g, shapely.multipoints(shapely.get_coordinates(near)), NODE_TOL))
    return out


SF_LISTS = ("road", "service", "pave", "path", "front", "drive")


def pack_surfaces(sf, x0, y0):
    """`sf` as it's written (web/src/sfpack.ts puts it back): each point as whole centimetres from the
    one before, from the square's corner `o`, and each list of point numbers as the step from the one
    before. It takes about 40% off the faces' download."""
    if sf is None:
        return None
    v, o, last, out = sf["v"], (x0, y0, 0.0), [0, 0, 0], []
    for k, c in enumerate(v):
        q = round((c - o[k % 3]) * 100)
        out.append(q - last[k % 3])
        last[k % 3] = q
    step = lambda ids: [i - (ids[k - 1] if k else 0) for k, i in enumerate(ids)]
    packed = dict(sf, o=[x0, y0], l=1, v=out, e=[dict(e, i=step(e["i"])) for e in sf["e"]])
    for name in SF_LISTS:
        if name in sf:
            packed[name] = step(sf[name])
    return packed


def unpack_surfaces(sf):
    """`sf` as the game reads it, from the packed form `pack_surfaces` writes (unchanged if it isn't)."""
    if not sf or "o" not in sf:
        return sf
    o, at, v = (sf["o"][0], sf["o"][1], 0.0), [0, 0, 0], []
    for k, d in enumerate(sf["v"]):
        at[k % 3] += d
        v.append(round(o[k % 3] + at[k % 3] / 100, 2))
    run = lambda ids: list(itertools.accumulate(ids))
    out = {k: x for k, x in sf.items() if k != "o"}
    out.update(v=v, e=[dict(e, i=run(e["i"])) for e in sf["e"]])
    for name in SF_LISTS:
        if name in sf:
            out[name] = run(sf[name])
    return out


def drawn_carriageway(sf):
    """The road the game draws from `sf`: its `road` and `service` triangles. A pedestrian street or a
    square's paving is not among them, though the partition may have laid it as carriageway."""
    sf = unpack_surfaces(sf)
    if not sf:
        return None
    v = np.asarray(sf["v"], float).reshape(-1, 3)[:, :2]
    ids = np.asarray(list(sf.get("road") or []) + list(sf.get("service") or []), int)
    if len(ids) < 3:
        return Polygon()
    tri = v[ids[: len(ids) // 3 * 3].reshape(-1, 3)]
    polys = shapely.polygons(np.concatenate([tri, tri[:, :1]], axis=1))
    return unary_union(polys[shapely.area(polys) > 1e-6])


def _ground_triangles(poly, T):
    """The triangles of a face laid on the ground, cut along the ground grid's cells and the diagonal
    the game splits each into, so every corner of the ground inside the face is a corner of the face
    too and the grass cannot rise through the middle of a broad stretch of paving."""
    x0, y0, x1, y1 = poly.bounds
    i0, i1 = math.floor((x0 - T["x0"]) / T["dx"]), math.ceil((x1 - T["x0"]) / T["dx"])
    j0, j1 = math.floor((y0 - T["y0"]) / T["dy"]), math.ceil((y1 - T["y0"]) / T["dy"])
    halves = []
    for j in range(j0, j1):
        for i in range(i0, i1):
            ax, ay = T["x0"] + i * T["dx"], T["y0"] + j * T["dy"]
            bx, cy = ax + T["dx"], ay + T["dy"]
            halves += [Polygon([(ax, ay), (bx, ay), (ax, cy)]), Polygon([(bx, ay), (bx, cy), (ax, cy)])]
    halves = np.array(halves)
    shapely.prepare(poly)
    halves = halves[shapely.intersects(poly, halves)]
    out = []
    for piece in shapely.intersection(halves, poly):
        for q in getattr(piece, "geoms", [piece]):
            if q.geom_type == "Polygon" and q.area > 1e-4:
                out += _triangles(q)
    return out


def _triangles(poly):
    """The triangles of a face. A face with a hole that touches its edge, which cutting an area out
    of a pavement can leave, defeats the constrained triangulation, so it is made valid and taken
    piece by piece, and failing that it is triangulated freely and cut to the face."""
    try:
        return list(shapely.constrained_delaunay_triangles(poly).geoms)
    except shapely.errors.GEOSException:
        out = []
        for piece in getattr(shapely.make_valid(poly.buffer(0)), "geoms", [poly.buffer(0)]):
            if piece.geom_type != "Polygon" or piece.is_empty:
                continue
            try:
                out += list(shapely.constrained_delaunay_triangles(piece).geoms)
            except shapely.errors.GEOSException:
                from shapely.ops import triangulate
                out += [t for t in triangulate(piece) if piece.contains(t.representative_point())]
        return out


GREEN_LANDUSE = {"park", "grass", "garden", "flowerbed", "grave_yard", "playground", "recreation_ground"}
GREEN_KINDS = set("12347")     # the grid's pitches, woodland, farmland, cemetery and playgrounds


def green_ground(sq):
    """Where the map says the ground is green rather than paved: a park, garden, flowerbed or grass
    polygon in the land-use data."""
    from partition import load_layer
    bb = (sq[0] - 20, sq[1] - 20, sq[2] + 20, sq[3] + 20)
    polys = [g for g, p in load_layer(os.path.join(ROOT, "data", "raw"), "land_use", bb)
             if p.get("class") in GREEN_LANDUSE and g.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(polys) if polys else Polygon()


def unpaved_ground(zone, T, green):
    """The part of `zone` that is green: inside a park, garden or grass polygon, or on a patch of the
    square's ground grid that is a pitch, wood, field, cemetery or playground. Paving stays paved, so
    a plaza's edge keeps its surface and only a real island is left to the ground."""
    x0, y0, x1, y1 = zone.bounds
    i0, i1 = max(0, int((x0 - T["x0"]) / T["dx"])), min(T["nx"] - 1, int((x1 - T["x0"]) / T["dx"]))
    j0, j1 = max(0, int((y0 - T["y0"]) / T["dy"])), min(T["ny"] - 1, int((y1 - T["y0"]) / T["dy"]))
    cells = [box(T["x0"] + i * T["dx"], T["y0"] + j * T["dy"], T["x0"] + (i + 1) * T["dx"], T["y0"] + (j + 1) * T["dy"])
             for j in range(j0, j1 + 1) for i in range(i0, i1 + 1) if T["k"][j * T["nx"] + i] in GREEN_KINDS]
    return zone.intersection(unary_union(cells + [green]))


PLAZA_BEYOND = 1.5      # metres past a street's pavement where paving stops being that pavement
SHARED_STREETS = ("pedestrian", "living_street")    # paved from wall to wall, flush, with no kerb


PEDESTRIAN_FRONTAGE = 9.0  # metres from a pedestrian street's line: ground wholly within it fronts the street
PEDESTRIAN_HALF = 6.0      # metres either side of its line that a pedestrian street is paved across open ground
WALLED_FRONT = 0.3         # share of a frontage's edge with a wall, fence or hedge along it that makes it a yard


PEDESTRIAN_EDGE = 1.5      # metres past a pedestrian street's paving that its edge may lie, as the partition fits it


def pedestrian_ground(rd):
    """The ground of the pedestrian streets, out to where the partition may have drawn their edge."""
    g = [LineString([q[:2] for q in r["p"]]).buffer(r["w"] / 2 + max(r.get("pv") or (0, 0)) + PEDESTRIAN_EDGE)
         for r in rd if r["c"] == "pedestrian" and len(r["p"]) > 1]
    if not g:
        return None
    g = unary_union(g)
    shapely.prepare(g)
    return g


def pedestrian_frontage(part, peds, br=()):
    """Open ground and plots between a pedestrian street and its buildings, with nothing standing
    between them and the street: the street's own paving, laid to the building line as a shopping
    street is. The partition fits the street's corridor narrower than the gap between its buildings
    and gives the rest to plots and open ground, which left grass along Union Street.

    A plot or open face wholly within `PEDESTRIAN_FRONTAGE` of the street is paved whole. One reaching
    further back (a yard behind a row, a square, a plot running back past its house) is paved only to
    `PEDESTRIAN_HALF`, the width of a shopping street: with nothing standing along its front, the
    ground before the house is the street's. A face walled, fenced or hedged off from the street is
    left whole."""
    if not peds:
        return Polygon()
    reach = unary_union([l.buffer(PEDESTRIAN_FRONTAGE) for l, _ in peds])
    band = unary_union([l.buffer(max(half, PEDESTRIAN_HALF), cap_style="flat") for l, half in peds])
    edge = unary_union([l.buffer(half + 0.5) for l, half in peds])
    shapely.prepare(reach)
    walls = [LineString([q[:2] for q in b["p"]]) for b in br if len(b["p"]) > 1]
    wall_tree = STRtree(walls) if walls else None
    out = []
    for f in part["faces"]:
        if f["cls"] not in ("open", "plot") or len(f["xy"]) < 3:
            continue
        g = face_shape(f).buffer(0)
        if g.is_empty or not reach.intersects(g):
            continue
        front = g.boundary.intersection(edge)
        if front.length < 1.0:
            continue
        if wall_tree is not None:
            near = [walls[int(k)] for k in wall_tree.query(front.buffer(0.3))]
            if near and front.intersection(unary_union(near).buffer(0.3)).length > WALLED_FRONT * front.length:
                continue
        if g.intersection(reach).area >= 0.95 * g.area:
            out.append(g)
        else:
            near_edge = edge.buffer(0.1)
            out += [q for q in getattr(g.intersection(band), "geoms", [g.intersection(band)])
                    if q.geom_type == "Polygon" and q.intersects(near_edge)]
    return unary_union(out) if out else Polygon()


def _minus(a, b):
    """a less b, snapped to a millimetre where GEOS cannot settle the overlay of two nearly
    coincident outlines (a plaza's edge laid along a street's pavement)."""
    try:
        return a.difference(b)
    except shapely.errors.GEOSException:
        return shapely.set_precision(a, 1e-3).difference(shapely.set_precision(b.buffer(0), 1e-3))


def street_surfaces(part, rd, sq, ground, fp=(), dv=(), unpaved=(), T=None, green=None, br=(), bores=None):
    """`sf`: the partition's carriageways, pavements and paths as the game should draw them, instead of
    a strip along each road's centre line. Strips overlap and leave gaps where streets meet (a pavement
    jutting into the road, grass showing through a junction); these faces meet edge to edge.

    `v` is the points, x, y, z in turn, and `road`, `service`, `pave`, `path`, `front` (a front path) and
    `drive` are triangles
    as three point numbers each; `e` is the outline of every piece (its kind and its point numbers in
    order, with the piece on the left), for the game's kerbs and the stone faces down to lower ground. A street's point is at the
    ground height under the middle of its nearest street, as the game levels a street across, and a
    pedestrianised street is paved wall to wall. Paving that is no kerbed street's (a pedestrian
    street, a square) is drawn as a drive is, on the ground and flush with the paths across it. A path's, a front path's or a drive's point is at the
    ground, and its outline has a point every `PATH_STEP` so it can lie on the ground as it's drawn. A
    bridge keeps its strip, with what holds it up, so its deck is cut out of the faces.

    The outlines are simplified together, by `SURFACE_TOLERANCE`: the partition's are sampled every
    few centimetres, which took a square's file from 3.4 to 8.7 MB; simplified apart, a carriageway
    and its pavement would no longer share their edge."""
    square = box(*sq)
    streets = [r for r in rd if (r["c"] not in GAME_PATHS or r["c"] == "pedestrian") and len(r["p"]) > 1]
    lines = [LineString([q[:2] for q in r["p"]]) for r in streets]
    tree = STRtree(lines) if lines else None
    deck = bridge_decks(rd)

    def nearest(x, y):
        if tree is None:
            return None
        p = Point(x, y)
        return min((int(k) for k in tree.query(p.buffer(40))), key=lambda k: lines[k].distance(p), default=None)

    def shapes(cls):
        polys = [face_shape(f).buffer(0) for f in part["faces"] if f["cls"] == cls and len(f["xy"]) > 2]
        g = unary_union(polys).intersection(square) if polys else Polygon()
        return g.difference(deck) if deck is not None else g

    road, pave = shapes("carriageway"), shapes("pavement")
    if unpaved:
        kept = [l.buffer(r["w"] / 2 + max(r.get("pv") or (0, 0)) + 0.3)
                for l, r in zip(lines, streets) if r["c"] != "footway"]
        zone = unary_union([l.buffer(h) for l, h in unpaved]).difference(unary_union(kept or [Polygon()]))
        plaza = road.intersection(zone)      # a plaza's carriageway is paving, not a road
        pave, road = pave.union(plaza), road.difference(plaza)
        if T is not None:
            zone = unpaved_ground(zone, T, green if green is not None else Polygon())
        road, pave = road.difference(zone), pave.difference(zone)
    reach = lambda r, extra: r["w"] / 2 + max(r.get("pv") or (0, 0)) + extra
    shared = [(l, r) for l, r in zip(lines, streets) if r["c"] in SHARED_STREETS]
    vehicle = [(l, r) for l, r in zip(lines, streets) if r["c"] not in SHARED_STREETS]
    carriageways = unary_union([l.buffer(r["w"] / 2, cap_style="flat") for l, r in vehicle] or [Polygon()])
    walked = unary_union([l.buffer(reach(r, 0.5), cap_style="flat") for l, r in shared] or [Polygon()])
    walked = walked.difference(carriageways)
    # a pedestrian street is paved from side to side: no kerb between its carriageway and pavements
    pave, road = pave.union(road.intersection(walked)), road.difference(walked)
    # Paving that is no kerbed street's (a pedestrian street, a square, a churchyard) is laid on the
    # ground as a drive is: the game stands a pavement a kerb above the ground it pulls down round
    # it, which made a ledge of every strip of paving across a plaza. A pedestrian street or a living
    # street meeting a kerbed one stays flush up to that street's own pavement.
    kerbed = unary_union([l.buffer(reach(r, PLAZA_BEYOND), cap_style="flat")
                          for l, r in vehicle if r["c"] in KERBED] or [Polygon()])
    on_street = unary_union([l.buffer(reach(r, 0), cap_style="flat")
                             for l, r in vehicle if r["c"] in KERBED] or [Polygon()])
    plaza = pave.difference(kerbed.difference(walked.difference(on_street)))
    pave = pave.difference(plaza)
    frontage = pedestrian_frontage(part, [(l, reach(r, 0)) for l, r in shared if r["c"] == "pedestrian"], br)
    if not frontage.is_empty:
        frontage = frontage.intersection(square).difference(unary_union([road, pave]))
        if T is not None:
            frontage = frontage.difference(unpaved_ground(frontage, T, green if green is not None else Polygon()))
        plaza = plaza.union(frontage)
    # carriageway the partition laid where no vehicle street runs is a square's paving, not a road
    own = unary_union([l.buffer(reach(r, PLAZA_BEYOND)) for l, r in vehicle] or [Polygon()])
    plaza, road = plaza.union(road.difference(own)), road.intersection(own)
    taken = unary_union([road, pave, plaza, *(face_shape(f).buffer(0) for f in part["faces"]
                                       if f["cls"] == "building" and len(f["xy"]) > 2)])
    path = shapes("path").difference(taken)
    if bores is not None:
        # through the canal's tunnels the towpath is the tunnel's ledge: no path is drawn over the top
        path = path.difference(bores)
    taken = taken.union(path)
    strips = lambda rows, half: unary_union([LineString([r[:2], r[2:4]]).buffer(half, cap_style="flat")
                                             for r in rows if (r[0], r[1]) != (r[2], r[3])] or [Polygon()])
    drive = _minus(strips(dv, DRIVE_WIDTH / 2).intersection(square), taken)
    front = _minus(strips(fp, FRONT_PATH_HALF).intersection(square), taken.union(drive))

    pieces = []
    for cls, g in (("carriageway", road), ("pavement", pave), ("path", path), ("front", front), ("drive", drive),
                   ("drive", plaza)):
        pieces += [(cls, q) for q in getattr(g, "geoms", [g])
                   if q.geom_type == "Polygon" and q.area > 0.05]
    if not pieces:
        return None
    simple = shapely.coverage_simplify([q for _, q in pieces], SURFACE_TOLERANCE)
    simple = noded([shapely.segmentize(q, PATH_STEP) if cls in ("path", "front", "drive") else q
                    for (cls, _), q in zip(pieces, simple)])

    v, at = [], {}

    def point(x, y, on_ground):
        # (a path and the pavement it meets share the corner but not its height: the kerb is a step)
        key = (round(x, 2), round(y, 2), on_ground)
        if key not in at:
            k = None if on_ground else nearest(x, y)
            if k is None:
                # (a street whose line lies in the next square has no line here to level it by)
                z = ground(x, y)
            else:
                c = lines[k].interpolate(lines[k].project(Point(x, y)))
                z = ground(c.x, c.y)
            if z is None:
                return None
            at[key] = len(v) // 3
            v.extend([key[0], key[1], round(z, 2)])
        return at[key]

    out = dict(v=v, road=[], service=[], pave=[], path=[], front=[], drive=[], e=[])
    walk, kerbside = set(), set()
    for (cls, _), poly in zip(pieces, simple):
        flat = cls in ("path", "front", "drive")
        for poly in getattr(poly, "geoms", [poly]):
            if poly.geom_type != "Polygon" or poly.is_empty:
                continue
            for t in (_ground_triangles(poly, T) if cls == "drive" and T is not None else _triangles(poly)):
                pts = list(t.exterior.coords)[:3]
                if cls == "pavement":
                    kind = "pave"
                elif flat:
                    kind = cls
                else:
                    k = nearest(sum(x for x, _ in pts) / 3, sum(y for _, y in pts) / 3)
                    c = streets[k]["c"] if k is not None else ""
                    kind = "road" if c in KERBED else "pave" if c == "pedestrian" else "service"
                ids = [point(x, y, flat) for x, y in pts]
                if None not in ids:
                    out[kind] += ids
                    (walk if cls == "pavement" else kerbside).update(ids)
            # inside on the left of every outline, so the game knows which way a kerb faces
            for ring in [orient(poly, 1.0).exterior, *orient(poly, 1.0).interiors]:
                ids = [point(x, y, flat) for x, y in ring.coords]
                ids = [k for k in ids if k is not None]
                if len(ids) >= 2:
                    out["e"].append(dict(c={"pavement": "pave", "carriageway": "road"}.get(cls, cls), i=ids))
    # A pavement's back edge falls a little towards the ground behind it, where the street is levelled
    # across above it: stood level with the middle of the street, its back stood a kerb and more over
    # the grass and showed as a dark step, wherever the ground falls away from a street (Sydney Road
    # over the canal's tunnel). The kerb side stays level with the carriageway.
    for k in walk - kerbside:
        g = ground(v[3 * k], v[3 * k + 1])
        if g is not None:
            z = v[3 * k + 2]
            v[3 * k + 2] = round(min(max(g, z - PAVE_FALL), z + PAVE_FALL), 2)
    return out if any(out[k] for k in ("road", "service", "pave", "path", "front", "drive")) else None


def drop_paths_along_streets(rd):
    """A path mapped down the middle of a street (a pavement drawn as its centre line, a cycle lane)
    is the street: the stretch of it lying along a carriageway is left out. One crossing the street
    stays. Same rule, same thresholds as the old build's `_along_streets`."""
    cars = [(LineString([q[:2] for q in r["p"]]), r["w"]) for r in rd
            if r["c"] not in GAME_PATHS and len(r["p"]) > 1]
    if not cars:
        return rd, 0.0
    areas = [L.buffer(w / 2, cap_style=2) for L, w in cars]
    roads = list(areas)
    rtree = STRtree(roads)

    def on_carriageway(line):
        """A stretch lying mostly on a carriageway is drawn on the road, however it crosses it."""
        return line.length > 5 and sum(roads[int(k)].intersection(line).length
                                       for k in rtree.query(line)) > ALONG_STREET * line.length
    ratios = [ALONG_STREET] * len(areas)
    # a drawn pavement (and a metre beyond it) is the same thing as a path along it
    lines = [L for L, _ in cars]
    for r, (L, w) in zip([r for r in rd if r["c"] not in GAME_PATHS and len(r["p"]) > 1], cars):
        if r["c"] not in KERBED:
            continue
        for side, pv in zip((1, -1), r.get("pv", (0, 0))):
            if pv > 0:
                band = L.buffer(side * (w / 2 + pv + 1.0), cap_style=2, single_sided=True)
                areas.append(band.difference(L.buffer(w / 2, cap_style=2)))
                ratios.append(ALONG_PAVEMENT)
                lines.append(L)
    cars = [(L, 0) for L in lines]
    tree = STRtree(areas)
    street = unary_union(areas)
    shapely.prepare(street)

    def on_street(line):
        """A path lying wholly on a street's carriageway and pavements (a stub at a corner, a crossing
        from one pavement to the other) is that street, which is already there to walk on."""
        return line.length > 2 and line.intersection(street).length > ON_STREET * line.length

    out, cut = [], 0.0
    for r in rd:
        if r["c"] not in GAME_PATHS or r["c"] == "pedestrian" or len(r["p"]) < 2:
            out.append(r)
            continue
        line = LineString([tuple(q[:3]) for q in r["p"]])
        drop = []
        for k in tree.query(line):
            inside = areas[int(k)].intersection(line)
            for part in getattr(inside, "geoms", [inside]):
                if part.geom_type != "LineString" or part.length < 3:
                    continue
                a, b = part.coords[0], part.coords[-1]
                road = cars[int(k)][0]
                if abs(road.project(Point(b[:2])) - road.project(Point(a[:2]))) > ratios[int(k)] * part.length:
                    drop.append(part.buffer(0.05, cap_style=2))
        if not drop:
            if not any(len(q) > 3 for q in r["p"]) and (on_carriageway(line) or on_street(line)):
                cut += line.length
                continue
            out.append(r)
            continue
        rest = line.difference(unary_union(drop))
        cut += line.length - rest.length
        marks = {(q[0], q[1]): q[3:] for q in r["p"]}
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type == "LineString" and piece.length >= 2:
                if on_carriageway(piece) or on_street(piece):
                    cut += piece.length
                    continue
                out.append(dict(r, p=[[round(x, 1), round(y, 1), round(z, 1)] + marks.get((round(x, 1), round(y, 1)), [])
                                      for x, y, z in piece.coords]))
    return out, cut


def carry_one_way(rd, old):
    """One-way streets keep their way: the corridors don't carry it, so each new stretch takes `ow`
    from the old build's road it lies along (most of its length within 2 m of one), turned to its
    own direction. Traffic reads it; without it every one-way street runs both ways."""
    ways = [(LineString([q[:2] for q in r["p"]]), r["ow"]) for r in old
            if r.get("ow") and len(r["p"]) > 1]
    if not ways:
        return
    tree = STRtree([g for g, _ in ways])
    for r in rd:
        if r["c"] in GAME_PATHS or len(r["p"]) < 2:
            continue
        line = LineString([q[:2] for q in r["p"]])
        for k in tree.query(line.buffer(2.0)):
            g, ow = ways[int(k)]
            if line.intersection(g.buffer(2.0)).length < 0.7 * line.length:
                continue
            a, b = g.project(Point(line.coords[0])), g.project(Point(line.coords[-1]))
            r["ow"] = ow if b >= a else -ow
            break


def carry_pedestrian(rd, old):
    """Streets closed to motor vehicles stay pedestrian streets. The street graph comes from OSM
    tags, which don't say so (Overture's access restrictions do, and the old build read them), so
    a street lying along an old pedestrian one is paved wall to wall as it was: its whole width
    becomes `w`, with no pavement, and no cars park on it or drive along it."""
    ways = [LineString([q[:2] for q in r["p"]]) for r in old if r["c"] == "pedestrian" and len(r["p"]) > 1]
    if not ways:
        return 0
    tree = STRtree(ways)
    n = 0
    for r in rd:
        if r["c"] in GAME_PATHS or len(r["p"]) < 2:
            continue
        line = LineString([q[:2] for q in r["p"]])
        if line.length < 1:
            continue
        near = unary_union([ways[int(k)].buffer(PEDESTRIAN_NEAR) for k in tree.query(line.buffer(PEDESTRIAN_NEAR))])
        if near.is_empty or line.intersection(near).length < 0.7 * line.length:
            continue
        r["w"] = round(r["w"] + sum(r.get("pv", (0, 0))), 2)
        r["c"] = "pedestrian"
        r.pop("pv", None)
        n += 1
    return n


def carry_missing_paths(rd, old, pavements=None, near=4.0, floor=6.0):
    """Paths main has that the partition's streets do not: field paths and tracks that Overture maps
    and OpenStreetMap does not. A stretch of an old path lying further than `near` from every street
    and path written is kept as it was (a path lies on the ground, so its heights stand)."""
    walked = [LineString([q[:2] for q in r["p"]]) for r in rd if len(r["p"]) > 1]
    tree = STRtree(walked) if walked else None
    added = []
    for r in old:
        if r["c"] not in GAME_PATHS or r["c"] == "pedestrian" or len(r["p"]) < 2:
            continue
        runs, run = [], []
        for q in r["p"]:
            pt = Point(q[:2])
            hit = tree is not None and any(walked[int(k)].distance(pt) <= near
                                           for k in tree.query(pt.buffer(near)))
            if hit:
                runs.append(run)
                run = []
            else:
                run.append(q)
        runs.append(run)
        for run in runs:
            if len(run) < 2 or LineString([q[:2] for q in run]).length < floor:
                continue
            if pavements is not None and sum(pavements.contains(Point(q[:2])) for q in run) >= 0.6 * len(run):
                continue            # the pavement is already there to walk on
            added.append(dict(r, p=[list(q) for q in run]))
    rd.extend(added)
    return len(added)


def demote_pedestrian(rd, old):
    """The partition reads OpenStreetMap, where a plaza's edge or a link across a green is often a
    `pedestrian` way; main's streets call only the ones closed to traffic pedestrian, and the rest
    footways. A `pedestrian` record that lies along none of main's becomes a footway, so it is not
    paved eight metres wide round an island that main leaves as ground. Returns the ground its
    corridor took (a line and a half-width each), which the surfaces leave unpaved."""
    ways = [LineString([q[:2] for q in r["p"]]) for r in old if r["c"] == "pedestrian" and len(r["p"]) > 1]
    tree = STRtree(ways) if ways else None
    cleared, gone = [], []
    beside = unary_union([LineString([q[:2] for q in r["p"]]).buffer(r["w"] / 2 + max(r.get("pv") or (0, 0)) + 1.5)
                          for r in rd if r["c"] not in GAME_PATHS and len(r["p"]) > 1] or [Polygon()])
    for r in rd:
        if r["c"] != "pedestrian" or len(r["p"]) < 2:
            continue
        line = LineString([q[:2] for q in r["p"]])
        if tree is not None and line.length >= 1:
            near = unary_union([ways[int(k)].buffer(PEDESTRIAN_STREET_NEAR) for k in tree.query(line.buffer(PEDESTRIAN_STREET_NEAR))])
            if not near.is_empty and line.intersection(near).length >= 0.7 * line.length:
                continue
        cleared.append((line, r["w"] / 2 + max(r.get("pv") or (0, 0)) + 0.5))
        r["c"], r["w"] = "footway", 1.8
        r.pop("pv", None)
        if line.length > 5 and line.intersection(beside).length >= 0.5 * line.length:
            gone.append(r)          # a plaza's edge along a street's pavement is the pavement
    rd[:] = [r for r in rd if not any(r is g for g in gone)]
    return cleared


def drop_paths_on_the_railway(rd, tracks, reach=5.0, clear=2.5):
    """A path that crosses the railway level with it is cut either side of the track: there are no
    level crossings in Bath, and the ground here cannot be dug for the path to pass under a bridge.
    `tracks` are the rail file's, points [x, y, height, flag]; a flag of 2 is a track the path passes
    over. Streets and anything on a bridge are left. Returns the records and how many paths were cut."""
    lines = [LineString([q[:2] for q in t["p"]]) for t in tracks if len(t["p"]) > 1]
    tracks = [t for t in tracks if len(t["p"]) > 1]
    if not lines:
        return rd, 0
    tree = STRtree(lines)
    out, cut = [], 0
    for r in rd:
        p = r["p"]
        if r["c"] not in GAME_PATHS or len(p) < 2:
            out.append(r)
            continue
        line = LineString([q[:2] for q in p])
        spots = []
        for t in tree.query(line):
            if not line.crosses(lines[int(t)]):
                continue
            x = line.intersection(lines[int(t)])
            for pt in getattr(x, "geoms", [x]):
                if pt.geom_type != "Point":
                    continue
                i = min(range(len(p)), key=lambda i: math.dist(p[i][:2], (pt.x, pt.y)))
                tp = tracks[int(t)]["p"]
                k = min(range(len(tp)), key=lambda k: math.dist(tp[k][:2], (pt.x, pt.y)))
                if len(p[i]) < 4 and abs(p[i][2] - tp[k][2]) < clear and tp[k][3] != 2:
                    spots.append(pt)
        if not spots:
            out.append(r)
            continue
        cut += 1
        gone = unary_union([pt.buffer(reach) for pt in spots])
        run = []
        for q in p + [None]:
            if q is not None and not gone.contains(Point(q[:2])):
                run.append(q)
                continue
            if len(run) >= 2:
                out.append(dict(r, p=run))
            run = []
    return out, cut


def _surface_pieces(pts, deep):
    """The open-air pieces of a stretch's points, with the bored points (by index) taken out: a
    tunnel's bore is built by the game from the tile's tunnel list, so no road lies over it. Each
    piece keeps the portal point it ends at and has at least two points."""
    pieces, cur = [], []
    for i, q in enumerate(pts):
        if i in deep:
            if cur:
                cur.append(q)
                pieces.append(cur)
                cur = []
            continue
        if not cur and i - 1 in deep:
            cur.append(pts[i - 1])
        cur.append(q)
    if cur:
        pieces.append(cur)
    return [c for c in pieces if len(c) >= 2]


def _corridor_side(line, sides, corridor_faces):
    """+1 if the corridor is on the line's left, -1 if on its right, 0 if neither or both.

    `sides` is the edge's pair of face labels. A boundary with `corridor` on one side only has the
    street on that side, and the wall belongs on the other, so this says which way is "away from the
    street". The test is geometric rather than label-order based: the corridor faces are unioned and
    sampled just either side of the line, because the label pair does not say which side is left."""
    labels = [s[0] for s in sides or []]
    if labels.count("corridor") != 1 or corridor_faces is None or corridor_faces.is_empty:
        return 0
    try:
        m = line.interpolate(0.5, normalized=True)
    except Exception:
        return 0
    # the line's normal, and a probe a little either side of it
    i = min(range(len(line.coords) - 1), key=lambda k: abs(line.project(Point(line.coords[k])) -
                                                           line.project(m)))
    a, b = line.coords[i], line.coords[min(i + 1, len(line.coords) - 1)]
    ex, ey = b[0] - a[0], b[1] - a[1]
    n = math.hypot(ex, ey)
    if n == 0:
        return 0
    nx, ny = -ey / n, ex / n          # left normal
    probe = 0.25
    left = corridor_faces.contains(Point(m.x + nx * probe, m.y + ny * probe))
    right = corridor_faces.contains(Point(m.x - nx * probe, m.y - ny * probe))
    if left and not right:
        return -1                      # corridor on the left, so move right
    if right and not left:
        return 1                       # corridor on the right, so move left
    return 0                           # both or neither: leave it where the partition put it


def _node_key(x, y):
    return (round(x, 3), round(y, 3))


def vertex_shifts(line, sides, corridor_faces, style):
    """How far each vertex of a barrier on the street's boundary moves, as (dx, dy), or None if the
    line has no corridor side to move away from.

    The side is worked out **at each vertex**, not once for the whole run. A front wall that bends
    round a corner has the street on one side of one stretch and the other side of the next, and a
    single probe taken at the middle pushed half of every curved wall *into* the road: measured, 1,108
    written runs crossing a carriageway across the city, where before the offset there were none. A
    vertex whose two probes disagree (both sides, or neither) is not moved, which is what a wall with
    the street on neither side wants anyway."""
    half = BARRIER_WIDTH.get(style, 0.0) / 2.0
    if half <= 0.0 or corridor_faces is None or corridor_faces.is_empty:
        return None
    if [s[0] for s in sides or []].count("corridor") != 1:
        return None
    coords = list(line.coords)
    if len(coords) < 2:
        return None
    out = []
    for k, (x, y) in enumerate(coords):
        if k == 0:
            ax, ay = coords[1]
            ex, ey = ax - x, ay - y
        elif k == len(coords) - 1:
            ax, ay = coords[k - 1]
            ex, ey = x - ax, y - ay
        else:
            ax, ay = coords[k - 1]
            bx, by = coords[k + 1]
            ex, ey = bx - ax, by - ay
        n = math.hypot(ex, ey) or 1.0
        nx, ny = -ey / n, ex / n
        p = Point(x + nx * PROBE, y + ny * PROBE)
        q = Point(x - nx * PROBE, y - ny * PROBE)
        left, right = corridor_faces.contains(p), corridor_faces.contains(q)
        side = -1 if (left and not right) else (1 if (right and not left) else 0)
        out.append((nx * half * side, ny * half * side))
    return out


def offset_from_corridor(line, sides, corridor_faces, style, road_faces=None, node_shift=None):
    """The line moved half a barrier's thickness away from the street, if it stands on the street's
    boundary.

    `map.ts` draws a barrier **centred** on its line (`t = spec.t / 2`, the cross-section built either
    side of the run), so a hedge on a pavement's back edge puts 0.45 m of hedge over the pavement. The
    partition puts the boundary on that line because that is where the boundary is; the drawing has to
    move a half-width out to leave the pavement walkable.

    `node_shift` gives each junction one displacement for every barrier that ends there: moved on
    their own, the ends of walls meeting at a corner each went a different way and poked 0.1 to 0.7 m
    past one another. Where a node has an entry, an end vertex takes it, whatever this line's own
    labels say."""
    shifts = vertex_shifts(line, sides, corridor_faces, style)
    coords = list(line.coords)
    if len(coords) < 2:
        return line
    if shifts is None:
        if not node_shift:
            return line
        shifts = [(0.0, 0.0)] * len(coords)
    out = []
    for k, (x, y) in enumerate(coords):
        dx, dy = shifts[k]
        if node_shift and k in (0, len(coords) - 1):
            dx, dy = node_shift.get(_node_key(x, y), (dx, dy))
        out.append((x + dx, y + dy))
    moved = LineString(out)
    # The move must never put the wall into a carriageway. At a corner a vertex-wise shift cuts the
    # chord of the turn, and where the street bends round that corner the chord clips the road even
    # though every vertex moved away from it - 78 runs on square 0,3 did. A run that ends up in the
    # road after moving keeps its original line: standing a half-width over a pavement is a small
    # wrong, standing in the carriageway is the wrong this was added to prevent.
    if road_faces is not None and not road_faces.is_empty:
        try:
            if moved.intersection(road_faces).length > 0.3:
                return line
        except Exception:
            return line
    return moved


def _outside_roads(line, road_area, floor=MIN_PIECE):
    """The parts of a line that are **not** inside a road surface, as LineStrings of at least `floor` metres.

    Returns (kept pieces, metres dropped for lying wholly inside the roads).

    `road_area` is the road's **interior** (see `road_clearance`), computed once per square. Buffering
    it here, per call, cost 554 of one square's 566 seconds: it is the whole square's road surface and
    it was being rebuilt for all 5,120 wall pieces."""
    if road_area is None or road_area.is_empty:
        return ([line] if line.length >= floor else []), (0.0 if line.length >= floor else line.length)
    try:
        shapely.prepare(road_area)
        # (a line that crosses itself is split there by the difference, so only a simple one can skip it)
        if line.is_simple and not road_area.intersects(line):
            return ([line] if line.length >= floor else []), (0.0 if line.length >= floor else line.length)
        rest = line.difference(road_area)
    except Exception:
        return [line], 0.0
    keep = [g for g in getattr(rest, "geoms", [rest])
            if g.geom_type == "LineString" and g.length >= floor]
    return keep, max(0.0, line.length - sum(g.length for g in keep))


def road_clearance(road_area, inset=ROAD_INSET):
    """The road surface **shrunk** by `inset`: its interior, without its boundary line.

    This used to grow the surface by a metre, and that was the wrong direction. A barrier standing on
    the carriageway's *boundary* - which is where a front garden wall belongs, along the back of the
    pavement or the kerb - intersects the surface along its whole length, because `intersection`
    counts a shared line. Growing the road then deleted it. Measured on square 0,3: of the 7,367.8 m
    the clip removed, **0.0 m was inside the road's interior** and all of it merely shared the
    boundary line, and the same held for 19 of the 20 gates that ended with no wall either side.

    Shrinking instead clips only what is genuinely in the road. On today's data that removes nothing,
    which is the right answer for a consistent partition - the clip becomes a guard against a plot
    overlapping the street rather than a rule that shapes the layout."""
    if road_area is None or road_area.is_empty:
        return None
    try:
        inner = road_area.buffer(-inset)
    except Exception:
        return road_area
    return None if inner.is_empty else inner


RIM = 0.15      # metres: a wall this near the edge of blocked ground is nudged clear; deeper in, it is cut
RIM_CLEAR = 0.06
DIP = 1.0       # metres: a wall must stand this far in blocked ground to be put right, and a stretch this long is cut out


def keep_clear_of(runs, blocked, ground):
    """Walls kept off the blocked ground after the writer's own rounding and tidy. Rounding to 0.1 m
    moves a wall that lay along a strip's edge into it, and the tidy joins cut ends onto other runs,
    so the first cut is no longer true by the time the walls are written. Only the stretches that
    stand in the blocked ground change: the rest of a run keeps its points and heights."""
    if blocked is None or not runs:
        return runs
    deep = blocked.buffer(-RIM)
    edge = blocked.boundary
    out = []
    for r in runs:
        line = LineString([q[:2] for q in r["p"]])
        if not blocked.intersects(line) or line.intersection(blocked).length < DIP:
            out.append(r)
            continue
        height = {(q[0], q[1]): q[2] for q in r["p"]}
        held = {(r["p"][0][0], r["p"][0][1]), (r["p"][-1][0], r["p"][-1][1])}
        # a dip into the ground of a metre or less is nudged out, not cut: cutting it leaves two
        # ends that no longer meet
        dips = line.intersection(deep) if not deep.is_empty else line.buffer(0)
        long = [g for g in getattr(dips, "geoms", [dips]) if g.geom_type == "LineString" and g.length >= DIP]
        rest = line.difference(unary_union(long).buffer(0.01)) if long else line
        for g in getattr(rest, "geoms", [rest]):
            if g.geom_type != "LineString" or g.length < 0.1:
                continue
            pts = []
            coords = list(g.coords)
            for k, (x, y) in enumerate(coords):
                if k and LineString([coords[k - 1], (x, y)]).intersection(blocked).length > 0.02:
                    (x0, y0), n = coords[k - 1], int(math.hypot(x - coords[k - 1][0], y - coords[k - 1][1]) / 2.0)
                    for j in range(1, n + 1):
                        pts.append((x0 + (x - x0) * j / (n + 1), y0 + (y - y0) * j / (n + 1), None))
                pts.append((x, y, height.get((x, y))))
            row = []
            for x, y, z in pts:
                # the ends a run had before stay where they meet their neighbours
                if (x, y) not in held and blocked.contains(Point(x, y)):
                    q = edge.interpolate(edge.project(Point(x, y)))
                    d = math.hypot(q.x - x, q.y - y)
                    if d > 1e-6:
                        x, y, z = q.x + (q.x - x) / d * RIM_CLEAR, q.y + (q.y - y) / d * RIM_CLEAR, None
                if z is None:
                    z = ground(x, y)
                    z = r["p"][0][2] if z is None else z
                row.append([round(x, 2), round(y, 2), round(z, 1)])
            if len(row) >= 2:
                out.append(dict(r, p=row))
    return out


def junction_shifts(part, corridor_faces):
    """One displacement per junction, from the barriers that stand on the street's boundary.

    The edge on the corridor decides; where several do, the thickest barrier does, then the lowest
    edge number, so the choice never depends on the order squares are written in."""
    best = {}
    for eid, e in enumerate(part["edges"]):
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        style = BARRIER[e["kind"]]
        line = LineString(e["xy"])
        shifts = vertex_shifts(line, e.get("sides"), corridor_faces, style)
        if shifts is None:
            continue
        coords = list(line.coords)
        for k in (0, len(coords) - 1):
            if shifts[k] == (0.0, 0.0):
                continue
            rank = (-BARRIER_WIDTH.get(style, 0.0), eid)
            key = _node_key(*coords[k])
            if key not in best or rank < best[key][0]:
                best[key] = (rank, shifts[k])
    return {k: v[1] for k, v in best.items()}


def _outside_blocked(line, blocked, floor):
    """`line` less the `blocked` ground, as pieces of at least `floor` metres; a line that clears
    it is returned as it is, so only a wall that was cut can lose a short piece."""
    if blocked is None or not blocked.intersects(line):
        return [line]
    return _outside_roads(line, blocked, floor)[0]


def walls_and_gates(part, sq, ground, road_area=None, corridor_faces=None, road_surface=None, blocked=None,
                    measured=None, houses=(), paths=()):
    """`br` and `gt` together, from one interval list per edge.

    The game builds a wall from the `br` points as one continuous run and never subtracts `gt` from it
    (`map.ts` walks `d.br[k].p` and adds a segment per pair). So a gate is a hole **only** if the wall
    stops and starts again either side of it. A run written straight through makes its gate
    decoration: the player walks at the gap and hits the wall. Measured before this on square 0,3,
    **648 of 802 gates had a wall through them**, against 2 of 658 in the old build, which cut its
    walls at every gate.

    So the two are one computation. For each drawn edge its openings become intervals along the edge's
    own arc length - `o["t"]` is already metres along that edge, because `find_openings` measured it
    there - and the wall is the edge minus those intervals, then minus the road surface. The gate's
    two ends are the surviving wall's ends at the same computed points, so they cannot drift.

    Nothing is searched for: the partition says which edge an opening is on, so an opening costs one
    interval and no geometry has to be found near any other.

    Returns (br runs, gt rows, metres dropped for lying wholly inside a road)."""
    out, gaps = [], []
    x0, y0, x1, y1 = sq
    square = box(x0, y0, x1, y1)
    in_road = 0.0
    open_by_edge = {}
    for o in part.get("openings") or []:
        if o.get("kind") in ("gate", "drive", "open", "path"):
            open_by_edge.setdefault(o.get("edge"), []).append(o)

    node_shift = junction_shifts(part, corridor_faces)

    for eid, e in enumerate(part["edges"]):
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        style = BARRIER[e["kind"]]
        height = HEIGHT.get(style, 1.2)
        rank = (e.get("source") == "evidence" or (e.get("source") == "front" and e.get("support", 0) >= SUPPORT),
                e.get("source") == "front",
                round(LineString(e["xy"]).length, 1), eid)
        # `map.ts` draws a barrier centred on its line, so one standing on the street's boundary juts
        # half its thickness over the pavement. Shift it out by that half, towards the side the labels
        # say is not the street. The shift happens **before** the gates are cut, so the gaps and the
        # wall come off the same moved line and a gate's ends stay its wall's ends.
        line = offset_from_corridor(LineString(e["xy"]), e.get("sides"), corridor_faces,
                                    style, road_faces=road_surface, node_shift=node_shift)
        L = line.length

        # the gate intervals, clipped to the edge, longest first isn't needed: they do not overlap
        cuts = []
        for o in open_by_edge.get(eid, []):
            a = max(0.0, float(o["t"]) - o["width"] / 2.0)
            b = min(L, float(o["t"]) + o["width"] / 2.0)
            # a gate narrower than a few centimetres is not a hole: at 0 m its two ends coincide, so
            # the "no wall crosses the gap" test is inconclusive and the player cannot pass anyway
            if b - a >= 0.1:
                cuts.append((a, b, o))
        cuts += [(max(0.0, a), min(L, b), {"kind": "drop"}) for a, b in e.get("drop") or () if b > a]
        cuts.sort(key=lambda c: c[0])
        # two gates a few centimetres apart leave a sliver of wall too short to draw, and each then
        # lacks the wall that makes it a gate: they are one wider gate
        joined = []
        for c in cuts:
            if joined and c[0] - joined[-1][1] < 0.3:
                joined[-1] = (joined[-1][0], max(joined[-1][1], c[1]), joined[-1][2])
            else:
                joined.append(c)
        cuts = joined

        keep = []
        at = 0.0
        for a, b, _ in cuts:
            if a > at:
                keep.append((at, a))
            at = max(at, b)
        if at < L:
            keep.append((at, L))

        restyle = [(max(0.0, ra), min(L, rb), rk) for ra, rb, rk in e.get("restyle") or () if rk in BARRIER]
        if restyle:
            ends = sorted({v for ra, rb, _ in restyle for v in (ra, rb)})
            keep = [(p, q) for a, b in keep for p, q in zip([a] + [v for v in ends if a < v < b],
                                                             [v for v in ends if a < v < b] + [b])]

        for a, b in keep:
            mid = (a + b) / 2
            kind = next((rk for ra, rb, rk in restyle if ra <= mid <= rb), e["kind"])
            style = BARRIER[kind]
            height = HEIGHT.get(style, 1.2)
            sub = substring(line, a, b)
            if sub.is_empty or sub.length < 0.1:
                continue
            # a stub beside a gate is the wall that makes it a gate, however short the offset left it
            beside_gate = any(o.get("kind") != "drop" and (abs(ca - b) < 1e-6 or abs(cb - a) < 1e-6)
                              for ca, cb, o in cuts)
            kept, gone = _outside_roads(sub, road_area, 0.1 if beside_gate else MIN_PIECE)
            in_road += gone
            if blocked is not None:
                kept = [q for piece in kept for q in _outside_blocked(
                    piece, blocked, MIN_CUT_PIECE if not beside_gate else 0.1)]
            pieces = []
            for piece in kept:
                inside = piece.intersection(square)
                pieces += [g for g in getattr(inside, "geoms", [inside])
                           if g.geom_type == "LineString" and g.length >= 0.1]
            for piece in pieces:
                run = []
                for px, py in piece.coords:
                    # a run is cut at the square's edge above, so its end sits on the seam and the
                    # next square draws on from there; this guards the grid's own edge
                    if not (x0 <= px <= x1 and y0 <= py <= y1):
                        if len(run) >= 2:
                            out.append(dict(c=style, p=run, h=height, _k=rank))
                        run = []
                        continue
                    z = ground(px, py)
                    if z is None:
                        if len(run) >= 2:
                            out.append(dict(c=style, p=run, h=height, _k=rank))
                        run = []
                        continue
                    run.append([round(px, 1), round(py, 1), round(z, 1)])
                if len(run) >= 2:
                    out.append(dict(c=style, p=run, h=height, _k=rank))

        # the gate rows, from the same interval ends the wall stopped at
        for a, b, o in cuts:
            if o.get("kind") != "gate":
                continue                    # a drive, an open front or a path is a gap in the wall, with no gate in it
            pa, pb = line.interpolate(a), line.interpolate(b)
            if not (x0 <= pa.x <= x1 and y0 <= pa.y <= y1
                    and x0 <= pb.x <= x1 and y0 <= pb.y <= y1):
                continue                    # the gap is outside the square, and so is its wall
            za, zb = ground(pa.x, pa.y), ground(pb.x, pb.y)
            if za is None or zb is None:
                continue
            kind = next((rk for ra, rb, rk in restyle if ra <= (a + b) / 2 <= rb), e["kind"])
            gaps.append([round(pa.x, 1), round(pa.y, 1), round(pb.x, 1), round(pb.y, 1),
                         round((za + zb) / 2, 1), BARRIER[kind]])
    # a gate needs wall at both sides: where the road took the wall off one side (or both) there is
    # only a gap in a boundary, which needs no gate
    if out and gaps:
        runs = [LineString([q[:2] for q in b["p"]]) for b in out]
        tree = STRtree(runs)

        def walled(x, y):
            p = Point(x, y)
            return any(runs[int(k)].distance(p) < 0.3 for k in tree.query(p.buffer(0.3)))
        kept = [g for g in gaps if walled(g[0], g[1]) and walled(g[2], g[3])]
        # the short bit of wall left beside a gate that went has nothing at its other end
        loose = [Point(g[i], g[i + 1]) for g in gaps if g not in kept for i in (0, 2)]
        if loose:

            def stub(n):
                r = runs[n]
                if r.length >= 1.5:
                    return False
                if not any(r.distance(p) < 0.3 for p in loose):
                    return False
                others = [Point(*r.coords[i]) for i in (0, -1)]
                return not any(int(k) != n and runs[int(k)].distance(o) < 0.3
                               for o in others for k in tree.query(o.buffer(0.3)))
            out = [b for n, b in enumerate(out) if not stub(n)]
        gaps = kept
    else:
        gaps = []
    # measured barriers the partition left out join the runs before the tidy, so it trims where they meet
    out += measured_not_drawn(measured, out, square, ground, blocked, houses, paths)
    out = tidy_walls(out, ground, [(g[i], g[i + 1]) for g in gaps for i in (0, 2)])
    out, gaps = reseat_gates(out, gaps, ground)
    out, gaps = clear_gates_of_junctions(out, gaps, ground)
    out = keep_clear_of(out, blocked, ground)
    return _without_lone_stubs(out, gaps, square), gaps, in_road


OPEN_CLEAR = 1.5        # metres: a measured barrier this near a drawn one is the same boundary
OPEN_MIN = 5.0          # metres: a stretch of measured barrier shorter than this, left over, is not kept
BUILDING_CLEAR = 0.3    # metres a measured barrier keeps off a building
PATH_GAP = 0.4          # metres of gap either side of a path where it crosses a measured barrier
PATH_CROSSING = 4.0     # a stretch inside a path's strip longer than this many path widths runs
                        # along the path rather than across it, and stands


def measured_not_drawn(measured, drawn, sq, ground, blocked, houses, paths=()):
    """Mapped and lidar barriers the partition did not draw. It draws a boundary only between two
    faces it divided, so a hedge across a field, a fence round a park, a wall along a footpath or one
    through a garden the plots divided elsewhere was lost: three quarters of the mapped length on
    some squares. They are measured, so they stand wherever nothing drawn is within `OPEN_CLEAR`,
    off the roads, the railway, the water and the houses, with a gap where a path crosses them, as
    main opens its walls."""
    if not measured:
        return []
    taken = [LineString([q[:2] for q in b["p"]]).buffer(OPEN_CLEAR) for b in drawn if len(b["p"]) > 1]
    taken += [h.buffer(BUILDING_CLEAR) for h in houses]
    if blocked is not None:
        taken.append(blocked)
    taken = unary_union(taken)
    shapely.prepare(taken)
    strips = [(line.buffer(half + PATH_GAP, cap_style="flat"), 2 * (half + PATH_GAP)) for line, half in paths]
    strip_tree = STRtree([g for g, _ in strips]) if strips else None
    out = []
    for b in measured:
        if b["c"] not in BARRIER or len(b["p"]) < 2:
            continue
        line = LineString([q[:2] for q in b["p"]])
        if not sq.intersects(line):
            continue
        rest = line.intersection(sq)
        if taken.intersects(rest):
            rest = rest.difference(taken)
        if strip_tree is not None and not rest.is_empty:
            gaps = []
            for k in strip_tree.query(rest):
                strip, wide = strips[int(k)]
                cut = rest.intersection(strip)
                gaps += [g.buffer(0.01) for g in getattr(cut, "geoms", [cut])
                         if g.geom_type == "LineString" and g.length <= PATH_CROSSING * wide]
            if gaps:
                rest = rest.difference(unary_union(gaps))
        for g in getattr(rest, "geoms", [rest]):
            if g.geom_type != "LineString" or g.length < OPEN_MIN:
                continue
            run = []
            for px, py in g.coords:
                z = ground(px, py)
                if z is not None:
                    run.append([round(px, 1), round(py, 1), round(z, 1)])
            if len(run) >= 2:
                length = LineString([q[:2] for q in run]).length
                out.append(dict(c=BARRIER[b["c"]], p=run, h=b.get("h", HEIGHT.get(BARRIER[b["c"]], 1.2)),
                                _k=(True, False, round(length, 1), len(out))))
    return out


LONE_STUB = 1.5        # metres: a run shorter than this with nothing at either end is not a wall
STUB_HOLD = 0.3         # metres: how near another run or a gate's end must be to hold an end


def _without_lone_stubs(runs, gaps, square):
    """The runs with the short ones that stand on their own taken out. Clipping to the road and to
    the square, and shifting a wall off the pavement, can cut a few tens of centimetres of wall
    loose from the rest; it stands in the open and means nothing. A stub beside a gate is held by the
    gate's end, and one on the square's edge continues in the next square."""
    inner = square.buffer(-STUB_HOLD)
    gate_ends = [Point(g[0], g[1]) for g in gaps] + [Point(g[2], g[3]) for g in gaps]
    # again until none is left, as a stub can be all that held up another
    while runs:
        lines = [LineString([q[:2] for q in r["p"]]) for r in runs]
        holders = lines + gate_ends
        tree = STRtree(holders)

        def held(i, pt):
            if not inner.contains(pt):
                return True
            return any(int(k) != i and holders[int(k)].distance(pt) < STUB_HOLD
                       for k in tree.query(pt.buffer(STUB_HOLD)))
        kept = [r for i, (r, ln) in enumerate(zip(runs, lines))
                if ln.length >= LONE_STUB or held(i, Point(ln.coords[0])) or held(i, Point(ln.coords[-1]))]
        if len(kept) == len(runs):
            break
        runs = kept
    return runs


def drop_edge_stubs(out_dir, squares):
    """Once every square is written: a short run kept because it touched the square's edge, and so
    should carry on in the next square, goes if the next square has nothing there. Each square's
    garden boundaries are worked out on their own, and near the edge two neighbours can disagree.
    Returns how many went."""
    walls = {}

    def ends_of(ti, tj):
        if (ti, tj) not in walls:
            path = os.path.join(out_dir, f"{ti}_{tj}.json")
            tile = json.load(open(path)) if os.path.exists(path) else {}
            walls[ti, tj] = ([LineString([q[:2] for q in b["p"]]) for b in tile.get("br") or [] if len(b["p"]) > 1]
                             + [Point(g[k], g[k + 1]) for g in tile.get("gt") or [] for k in (0, 2)])
        return walls[ti, tj]

    gone = 0
    for ti, tj in squares:
        path = os.path.join(out_dir, f"{ti}_{tj}.json")
        if not os.path.exists(path):
            continue
        tile = json.load(open(path))
        edge = box(*tile["b"]).exterior
        mine = ends_of(ti, tj)
        nexts = [w for di in (-1, 0, 1) for dj in (-1, 0, 1) if di or dj for w in ends_of(ti + di, tj + dj)]
        tree = STRtree(nexts) if nexts else None

        def loose(n, b):
            ln = LineString([q[:2] for q in b["p"]])
            if ln.length >= LONE_STUB:
                return False
            ends = [Point(ln.coords[0]), Point(ln.coords[-1])]
            if any(k != n and w.distance(pt) < STUB_HOLD for pt in ends for k, w in enumerate(mine)):
                return False
            on_edge = [pt for pt in ends if edge.distance(pt) < STUB_HOLD]
            return bool(on_edge) and not any(nexts[int(k)].distance(pt) < 2 * STUB_HOLD
                                             for pt in on_edge for k in tree.query(pt.buffer(2 * STUB_HOLD)))
        runs = [b for b in tile.get("br") or [] if len(b["p"]) > 1]
        keep = [b for n, b in enumerate(runs) if tree is None or not loose(n, b)]
        if len(keep) < len(runs):
            gone += len(runs) - len(keep)
            tile["br"] = keep + [b for b in tile.get("br") or [] if len(b["p"]) <= 1]
            json.dump(tile, open(path, "w"), separators=(",", ":"))
    return gone


DOOR_REACH = 25.0       # metres: how far a gate looks for the door it leads to
DOOR_RAY = 14.0         # metres: how far out from a door a boundary is looked for
PATH_SHORTEST = 1.5     # metres: a front path shorter than this is only a doorstep
DOOR_GATE_SHORTEST = 3.0   # metres of front garden before a door is given a gate of its own


def _way_in(mid, door_pts, dtree, houses, htree, road_area, walls=None, wtree=None, taken=()):
    """The door a gate leads to: of the three nearest, the first whose straight line is long enough,
    crosses no house, no carriageway and (when walls are given) no wall past the gate's own metre.
    Returns its index, or None."""
    near = sorted((int(k) for k in dtree.query(mid.buffer(DOOR_REACH))), key=lambda k: door_pts[k].distance(mid))
    for k in near[:3]:
        run = LineString([mid, door_pts[k]])
        if run.length < PATH_SHORTEST or (road_area is not None and run.intersection(road_area).length > 0.5):
            continue
        if any(houses[int(h)].intersection(run).length > 1.0 for h in htree.query(run)):
            continue
        if wtree is not None and any(
                run.project(g.centroid) > 1.0 for w in wtree.query(run)
                for g in getattr(walls[int(w)].intersection(run), "geoms", [walls[int(w)].intersection(run)])
                if not g.is_empty):
            continue
        return k
    return None


def gates_for_doors(part, houses, doors, road_area=None, sq=None):
    """Gates for the doors no gate leads to. The partition puts a gate on the plot edge nearest the
    house, and for a semi or a corner house that is often a side boundary, so the way out to the street
    from the door was a wall (a third of the doors on the village square). A door with no gate to reach
    gets one where the line straight out from it first meets a boundary, as the old build gave every
    front its gate opposite the house. Returns the new openings and the old gates they replace."""
    if not houses or not doors:
        return [], []
    houses = [h if h.is_valid else h.buffer(0) for h in houses]
    htree = STRtree(houses)
    door_pts = [Point(d[0], d[1]) for d in doors]
    dtree = STRtree(door_pts)
    edges = part["edges"]
    kept = [i for i, e in enumerate(edges) if e["kind"] != "none" and e["kind"] in BARRIER]
    lines = {i: LineString(edges[i]["xy"]) for i in kept}
    etree = STRtree([lines[i] for i in kept])
    served, blind = set(), []
    for o in part.get("openings") or []:
        e = edges[o["edge"]] if o.get("edge") is not None and o["edge"] < len(edges) else None
        if e is None or o.get("kind") not in ("gate", "open"):
            continue
        line = LineString(e["xy"])
        mid = line.interpolate(min(max(o["t"], 0.0), line.length))
        k = _way_in(mid, door_pts, dtree, houses, htree, road_area)
        if k is not None:
            served.add(k)
        elif o["kind"] == "gate":
            near = [int(j) for j in dtree.query(mid.buffer(DOOR_REACH))]
            if near:
                blind.append((o, min(near, key=lambda j: door_pts[j].distance(mid))))
    opens, given = [], set()
    for k, d in enumerate(doors):
        if k in served or (sq is not None and not (sq[0] <= d[0] <= sq[2] and sq[1] <= d[1] <= sq[3])):
            continue
        ang = d[3]
        nx, ny = math.sin(ang), -math.cos(ang)
        start = Point(d[0] + nx * 0.3, d[1] + ny * 0.3)
        ray = LineString([start, (d[0] + nx * DOOR_RAY, d[1] + ny * DOOR_RAY)])
        hits = []
        for j in etree.query(ray):
            x = lines[kept[int(j)]].intersection(ray)
            for g in getattr(x, "geoms", [x]):
                if g.geom_type == "Point":
                    hits.append((ray.project(g), kept[int(j)], g))
        if not hits:
            continue
        along, eid, pt = min(hits, key=lambda h: h[0])
        run = LineString([start, pt])
        if along < DOOR_GATE_SHORTEST or any(houses[int(h)].intersection(run).length > 0.5 for h in htree.query(run)):
            continue
        if road_area is not None and not road_area.is_empty and (road_area.contains(pt) or run.intersection(road_area).length > 0.5):
            continue
        line = lines[eid]
        # two boundaries within a metre and a half are one fence drawn twice: a gate cut in one splits it from the other
        if any(j != eid for j in (kept[int(m)] for m in etree.query(pt.buffer(1.6)))
               if lines[j].distance(pt) < 1.6):
            continue
        L = line.length
        if L < 2 * EDGE_STUB + 1.0:
            opens.append(dict(edge=eid, t=L / 2, width=L, kind="open"))
            given.add(k)
            continue
        t = min(max(line.project(pt), EDGE_STUB + 0.5), L - EDGE_STUB - 0.5)
        opens.append(dict(edge=eid, t=t, width=1.0, kind="gate"))
        given.add(k)
    # the gate that led only to a wall at the wrong side of that house goes: it was a hole in a side fence
    return opens, [o for o, k in blind if k in given]


def paths_from_openings(part, houses, doors, road_area=None, sq=None, br=(), gt=None):
    """`fp`: a straight line from each gate, and each open front, to the nearest front door that can
    be reached from it, as the old build drew them.

    Of the three doors nearest a gate the first is taken whose line is at least 1.5 m, runs through
    no house and no wall past the gate's own metre, and does not cross the carriageway. A door on
    the far side of its house from the gate is passed over for a nearer way in. Every house the old build gave a path gets one: a path clipped to the
    plot behind the gate, or aimed at the house's nearest wall, lost a third of them wherever the
    plot's front garden was shallow or a neighbour's ground lay between gate and door.

    A path starts at the gate as finally drawn (`gt`), which may have been slid or taken out since the
    partition placed it; a gate that is gone leaves its path only where the ground there is open.

    Returns (fp rows, how many gates had no door to reach)."""
    if not houses or not doors or not part.get("openings"):
        return [], 0
    edge_by_id = {i: e for i, e in enumerate(part["edges"])}
    houses = [h if h.is_valid else h.buffer(0) for h in houses]
    htree = STRtree(houses)
    door_pts = [Point(d[0], d[1]) for d in doors]
    dtree = STRtree(door_pts)
    walls = [LineString([q[:2] for q in b["p"]]) for b in br if len(b["p"]) > 1]
    wtree = STRtree(walls) if walls else None
    gate_mids = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in gt or []]
    gate_tree = STRtree(gate_mids) if gate_mids else None
    fp, dropped, seen = [], 0, set()
    for o in part["openings"]:
        e = edge_by_id.get(o.get("edge"))
        if e is None or e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        if o.get("kind") not in ("gate", "open"):
            continue                    # a drive is drawn on its own
        line = LineString(e["xy"])
        mid = line.interpolate(min(max(o["t"], 0.0), line.length))
        if gt is not None and o["kind"] == "gate":
            near = [gate_mids[int(k)] for k in (gate_tree.query(mid.buffer(GATE_FIT)) if gate_tree else [])]
            near = [g for g in near if g.distance(mid) <= GATE_FIT]
            if near:
                mid = min(near, key=lambda g: g.distance(mid))
            elif any(w.distance(mid) < 0.5 for w in walls):
                continue                # its gate has gone and a wall stands there: no way in from here
        if road_area is not None and not road_area.is_empty and road_area.contains(mid):
            continue                    # the gate is in a wall cut out of the road: nothing to open
        if sq is not None and not (sq[0] <= mid.x <= sq[2] and sq[1] <= mid.y <= sq[3]):
            continue                    # the square the gate is in draws its path
        key = (round(mid.x, 1), round(mid.y, 1))
        if key in seen:
            continue
        k = _way_in(mid, door_pts, dtree, houses, htree, road_area, walls, wtree)
        if k is None:
            dropped += 1
            continue
        seen.add(key)
        fp.append([round(mid.x, 1), round(mid.y, 1), round(door_pts[k].x, 1), round(door_pts[k].y, 1)])
    return fp, dropped


GATE_FIT = 2.0          # metres a front path's start may slide to meet its gate as finally drawn
DRIVE_KINDS = ("detached", "semi")
DRIVE_SHARE = 0.55      # of the houses with room for one, as the old build had it
DRIVE_FRONT = 9.0       # metres of front before a drive fits beside the gate
DRIVE_WIDTH = 3.0
DRIVE_STEP = 3.2        # metres from the gate's middle to the drive's
DRIVE_SHORTEST = 5.5    # metres from the front to the house: a car's length and a little more
DRIVE_LONGEST = 14.0
DRIVE_CAR = 0.6         # of the drives long enough for one, how many have a car on


def drives_from_openings(part, houses, kinds, ground, sq=None, road_area=None):
    """Drives beside the gates of detached and semi-detached houses, about half of those with a front
    over 9 m, as the old build had them (`gardens.py`), but only where the garden really has room
    for a car between the front and the house. Terraces have none, so Oldfield Park has few.

    Returns (drive openings, for the walls to be cut at, `dv` rows and the cars standing on them)."""
    if not houses or not part.get("openings"):
        return [], [], []
    plots = [Polygon(f["xy"]) for f in part["faces"] if f["cls"] == "plot" and len(f["xy"]) > 2]
    if not plots:
        return [], [], []
    ptree = STRtree(plots)
    htree = STRtree(houses)
    taken = collections.defaultdict(list)
    for o in part["openings"]:
        taken[o.get("edge")].append((o["t"] - o["width"] / 2, o["t"] + o["width"] / 2))
    opens, dv, cars = [], [], []
    for o in part["openings"]:
        e = part["edges"][o["edge"]] if 0 <= o.get("edge", -1) < len(part["edges"]) else None
        if o.get("kind") != "gate" or e is None or e["kind"] not in BARRIER:
            continue
        line = LineString(e["xy"])
        if line.length < DRIVE_FRONT:
            continue
        mid = line.interpolate(o["t"])
        if sq is not None and not (sq[0] <= mid.x <= sq[2] and sq[1] <= mid.y <= sq[3]):
            continue
        if road_area is not None and not road_area.is_empty and road_area.contains(mid):
            continue
        # rolled by where the gate is, so a rebuild keeps the same houses' drives
        rr = random.Random(f"drive {round(mid.x)} {round(mid.y)}")
        if rr.random() >= DRIVE_SHARE:
            continue
        garden, _ = _garden_behind(line, o["t"], mid, plots, ptree)
        if garden is None:
            continue
        own = [int(k) for k in htree.query(garden.buffer(0.3))
               if houses[int(k)].distance(garden) < 0.3 and kinds[int(k)] in DRIVE_KINDS]
        if not own:
            continue
        h = houses[min(own, key=lambda k: houses[k].distance(mid))]
        for d in (o["t"] + DRIVE_STEP, o["t"] - DRIVE_STEP):
            a, b = d - DRIVE_WIDTH / 2, d + DRIVE_WIDTH / 2
            if a < EDGE_STUB or b > line.length - EDGE_STUB:
                continue
            if any(b0 < b + 0.3 and a < b1 + 0.3 for b0, b1 in taken[o["edge"]]):
                continue
            p = line.interpolate(d)
            behind, normal = _garden_behind(line, d, p, plots, ptree)
            if behind is not garden:
                continue
            ux, uy = normal
            length = 2.0
            while length < DRIVE_LONGEST and h.distance(Point(p.x + ux * length, p.y + uy * length)) > 1.2:
                length += 0.5
            end = Point(p.x + ux * length, p.y + uy * length)
            if length < DRIVE_SHORTEST or h.distance(end) > 1.7:
                continue
            strip = LineString([p, end]).buffer(DRIVE_WIDTH / 2 - 0.2, cap_style="flat")
            if strip.difference(garden).area > 0.5:
                continue
            if any(houses[int(k)].intersects(strip) for k in htree.query(strip)):
                continue
            taken[o["edge"]].append((a, b))
            opens.append(dict(edge=o["edge"], t=d, width=DRIVE_WIDTH, kind="drive"))
            dv.append([round(p.x, 2), round(p.y, 2), round(end.x, 2), round(end.y, 2)])
            if length > 6 and rr.random() < DRIVE_CAR:
                cx, cy = p.x + ux * (length - 3.2), p.y + uy * (length - 3.2)
                ang = math.atan2(uy, ux) + (math.pi if rr.random() < 0.5 else 0)
                if car_level(cx, cy, ang, ground):
                    cars.append(["car", round(cx, 2), round(cy, 2), round(float(ground(cx, cy)) + 0.07, 2),
                                 round(ang, 2), rr.randrange(10)])
            break
    return opens, dv, cars


def _garden_behind(line, t, mid, plots, ptree, step=0.6):
    """The plot just past a gate, and the unit normal pointing into it; (None, None) if neither side
    of the gate is a plot."""
    a = line.interpolate(max(t - 0.5, 0.0))
    b = line.interpolate(min(t + 0.5, line.length))
    dx, dy = b.x - a.x, b.y - a.y
    n = math.hypot(dx, dy)
    if n == 0:
        return None, None
    for nx, ny in ((-dy / n, dx / n), (dy / n, -dx / n)):
        p = Point(mid.x + nx * step, mid.y + ny * step)
        for k in np.atleast_1d(ptree.query(p)):
            if plots[int(k)].contains(p):
                return plots[int(k)], (nx, ny)
    return None, None


def keep_paths_off_walls(fp, br, gt):
    """A front path crosses a boundary only at a gate, as the old build kept it. One that meets a wall
    in its last metre or so (a side fence running up to the house) is cut short just before it; any
    other path through a wall is left out. Returns (fp rows, how many were cut, how many left out)."""
    runs = [LineString([q[:2] for q in b["p"]]) for b in br if len(b["p"]) > 1]
    if not runs or not fp:
        return fp, 0, 0
    rtree = STRtree(runs)
    gates = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in gt]
    gtree = STRtree(gates) if gates else None
    out, cut, gone = [], 0, 0
    for q in fp:
        path = LineString([(q[0], q[1]), (q[2], q[3])])
        # a path hugging a fence for most of its length reads as a mistake, and cut short it still
        # ended on the fence once rounded
        hug = unary_union([runs[int(k)].buffer(ALONG_EDGE) for k in rtree.query(path.buffer(ALONG_EDGE))])
        if not hug.is_empty and path.intersection(hug).length > 0.5 * path.length:
            gone += 1
            continue
        first = None
        # an end a hair short of a wall is on it once the row is rounded to the decimetre
        end = Point(q[2], q[3])
        if any(runs[int(k)].distance(end) < 0.15 for k in rtree.query(end.buffer(0.15))):
            first = path.length
        for k in rtree.query(path):
            x = runs[int(k)].intersection(path)
            for h in getattr(x, "geoms", [x]):
                if h.is_empty:
                    continue
                if gtree is not None and any(gates[int(j)].distance(h) < PATH_GATE_NEAR
                                             for j in gtree.query(h.buffer(PATH_GATE_NEAR))):
                    continue
                t = path.project(h if h.geom_type == "Point" else Point(h.coords[0]))
                first = t if first is None else min(first, t)
        if first is None:
            out.append(q)
        elif path.length - first <= PATH_END_REACH and first - PATH_STOP_SHORT >= PATH_MIN_LEFT:
            b = path.interpolate(first - PATH_STOP_SHORT)
            b = Point(round(b.x, 1), round(b.y, 1))
            if any(runs[int(k)].distance(b) < 0.15 for k in rtree.query(b.buffer(0.15))):
                gone += 1               # meeting the fence at a glancing angle, cut short it is still on it
                continue
            out.append([q[0], q[1], b.x, b.y])
            cut += 1
        else:
            gone += 1
    return out, cut, gone


PAVE = 1.7                 # a full pavement's width, as the old build's street items assume
RESEAT_REACH = 15.0        # a street item moves onto a street no further off than this
RESEAT_MIN_PAVEMENT = 0.8
NUDGE_MAX = 1.0
OFF_ROAD_REACH = 6.0   # metres a street item in the road may move to the drawn road's nearest edge
PLANT_BACK = 2.5        # metres a plant on a pavement or path may be moved back off it
# how far in from the pavement's back edge a bus stop stood in the old build (room for its shelter);
# everything else moved out of the road stands a fixed 0.45 m off the carriageway, as a lamp did
PAVEMENT_SET = {"bus": 0.9}
LAMP_OFF = 0.45


def reseat_on_pavement(kind, x, y, rd):
    """Where a street item that landed in the road belongs: on the pavement of the nearest kerbed
    street, on the side it was on, just in from the kerb (a bus stop where the old build set it). Returns (x, y, angle) or None when no
    street is near or that side has too little pavement."""
    best = None
    for r in rd:
        if r["c"] not in KERBED or len(r["p"]) < 2:
            continue
        line = LineString([q[:2] for q in r["p"]])
        d = line.distance(Point(x, y))
        if d <= RESEAT_REACH and (best is None or d < best[0]):
            best = (d, line, r)
    if best is None:
        return None
    _, line, r = best
    s = line.project(Point(x, y))
    p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
    dx, dy = p1.x - p0.x, p1.y - p0.y
    n = math.hypot(dx, dy) or 1
    dx, dy = dx / n, dy / n
    c = line.interpolate(s)
    side = 1 if (x - c.x) * -dy + (y - c.y) * dx > 0 else -1
    pave = (r.get("pv") or [PAVE, PAVE])[0 if side > 0 else 1]
    if pave < RESEAT_MIN_PAVEMENT:
        return None
    if kind == "bus":
        off = r["w"] / 2 + max(0.3, PAVEMENT_SET["bus"] - (PAVE - pave))
    else:
        # (the nearest point of the pavement to where it was mapped, just in from the kerb: the map's
        # point lies in our carriageway where it is wider than the survey's, and set back to the old
        # build's place on the pavement a post box ended up over 3 m from where it stands)
        off = r["w"] / 2 + LAMP_OFF
    angle = math.atan2(dy, dx) + (0 if side > 0 else math.pi)
    return c.x - dy * off * side, c.y + dx * off * side, angle


def drop_clashes(tile, part, br, clearance=DECOR_CLEAR, gt=None, fp=None, rd=None, ground=None,
                 moved=None, blocked=None, dv=None, carriageway=None):
    """Remove decoration the new layout contradicts, and count what went.

    `tr`, `sb`, `fx` and `dr` are **copied** from the existing tile, because placing them is a later
    step - on the plan lamps stand on the kerb line, bins on the pavement's back edge and trees inside
    plots and verges, all relative to the new cross-sections. Until that step exists, copying them
    leaves things standing where the partition put a road or a wall: measured on square 0,3, 750 of
    2,047 street items were in a carriageway and 636 plants were inside a barrier.

    A street item in the road goes back on the nearest street's pavement, and a plant or item too
    near a wall is nudged off it, where that leaves it clear of everything; otherwise it is removed,
    because a tile that is a little bare reads as unfinished but a bin in the middle of the road reads
    as a mistake. What was removed is returned by field, and what was moved is added to `moved`.

    A tree or shrub standing on a street, pavement or path face (most are placed at the middle of a
    canopy seen from above, which often hangs over the pavement from a garden) is moved back off it,
    up to `PLANT_BACK`, where that is clear. A tree that can't be is left on the pavement as a street
    tree; anything else on a face goes.

    `carriageway` is the road as the game draws it (`drawn_carriageway`), when there is one: the
    partition's carriageway faces also cover pedestrian streets, which are paved, and their benches stay.

    `dr` (doors) is **not** touched: a door is cut into its building, which did not move."""
    if carriageway is not None:
        road = carriageway
    else:
        road_faces = [face_shape(f) for f in part["faces"]
                      if f["cls"] == "carriageway" and len(f["xy"]) > 2]
        road = unary_union(road_faces) if road_faces else None
    if road is not None:
        shapely.prepare(road)
    walls = [LineString([(p[0], p[1]) for p in r["p"]]) for r in br]
    wt = STRtree(walls) if walls else None

    def in_road(x, y):
        return road is not None and not road.is_empty and road.contains(Point(x, y))

    def near_wall(x, y, tol):
        if wt is None:
            return False
        p = Point(x, y)
        return any(walls[int(k)].distance(p) <= tol
                   for k in np.atleast_1d(wt.query(p.buffer(tol))))

    # the carriageway as the game draws it from `rd`, which can differ from the partition's faces
    strips = [LineString([(q[0], q[1]) for q in r["p"]]).buffer(max(r["w"] / 2.0 - KERB_LINE, 0.0),
                                                                 cap_style="flat")
              for r in rd or [] if r["c"] not in GAME_PATHS and len(r["p"]) > 1]
    strip_tree = STRtree(strips) if strips else None

    def on_strip(x, y):
        return strip_tree is not None and len(strip_tree.query(Point(x, y), predicate="within")) > 0

    ways = ([LineString([(g[0], g[1]), (g[2], g[3])]).buffer(GATEWAY_CLEAR) for g in gt or []
             if g[5] != "open"]
            + [LineString([(q[0], q[1]), (q[2], q[3])]).buffer(PATH_CLEAR) for q in fp or []]
            + [LineString([(q[0], q[1]), (q[2], q[3])]).buffer(DRIVE_WIDTH / 2) for q in dv or []])
    way_tree = STRtree(ways) if ways else None

    def on_way(x, y):
        return way_tree is not None and len(way_tree.query(Point(x, y), predicate="within")) > 0

    gone = collections.Counter()
    moved = collections.Counter() if moved is None else moved

    house_polys = []
    for b in tile.get("bl") or []:
        rings = b.get("r") or []
        if rings and len(rings[0]) > 2:
            try:
                g = Polygon(rings[0], [h for h in rings[1:] if len(h) > 2])
            except Exception:
                continue
            if not g.is_empty:
                house_polys.append(g)
    house_tree = STRtree(house_polys) if house_polys else None

    def indoors(x, y):
        return house_tree is not None and len(house_tree.query(Point(x, y), predicate="within")) > 0

    def clear(x, y):
        return (not in_road(x, y) and not near_wall(x, y, clearance) and not on_way(x, y)
                and not on_strip(x, y) and not indoors(x, y))

    # what a nudge may not move a thing onto: the road at its full width, and for a plant also the
    # pavement, the railway, the canal and the water (`blocked_ground`), all of which the game keeps clear
    full = [LineString([(q[0], q[1]) for q in r["p"]]).buffer(r["w"] / 2.0, cap_style="flat")
            for r in rd or [] if r["c"] not in GAME_PATHS and len(r["p"]) > 1]
    full_tree = STRtree(full) if full else None

    def in_full_road(x, y):
        return full_tree is not None and len(full_tree.query(Point(x, y), predicate="within")) > 0


    def nudged(x, y, plant=False):
        """(x, y) moved straight away from the nearest wall until it clears it, or None."""
        if wt is None:
            return None
        p = Point(x, y)
        w = min((walls[int(k)] for k in np.atleast_1d(wt.query(p.buffer(clearance)))),
                key=lambda g: g.distance(p), default=None)
        if w is None or w.distance(p) < 1e-6:
            return None
        d = w.distance(p)
        q = w.interpolate(w.project(p))
        step = clearance - d + 0.05
        if step > NUDGE_MAX:
            return None
        nx, ny = x + (x - q.x) / d * step, y + (y - q.y) / d * step
        return (nx, ny) if clear(nx, ny) and kept_clear(nx, ny, plant) else None

    def face_union(*classes):
        g = unary_union([face_shape(f).buffer(0) for f in part["faces"] if f["cls"] in classes and len(f["xy"]) > 2]
                        or [Polygon()])
        shapely.prepare(g)
        return g

    paved, path_faces = face_union("carriageway", "pavement", "path"), face_union("path")
    paved_edge = paved.boundary

    def kept_clear(x, y, plant):
        if plant:
            return ((blocked is None or not blocked.contains(Point(x, y)))
                    and (paved.is_empty or not paved.contains(Point(x, y))))
        return not in_full_road(x, y)

    def off_paved(x, y, plant):
        """(x, y) moved straight back off the paved faces to just beyond their edge, or None."""
        p = Point(x, y)
        q = paved_edge.interpolate(paved_edge.project(p))
        d = q.distance(p)
        if d > PLANT_BACK or d < 1e-6:
            return None
        nx, ny = q.x + (q.x - x) / d * 0.6, q.y + (q.y - y) / d * 0.6
        ok = not paved.contains(Point(nx, ny)) and clear(nx, ny) and kept_clear(nx, ny, plant)
        return (nx, ny) if ok else None

    road_edge = road.boundary if road is not None and not road.is_empty else None
    pavement = face_union("pavement")

    def off_road(x, y):
        """(x, y, angle) on the pavement just beyond the nearest edge of the road as drawn, facing it,
        or None: where the nearest street's own pavement can't take it (none near, or its kerb is not
        the drawn road's edge), a post box still goes to the nearest pavement, not away."""
        if road_edge is None:
            return None
        p = Point(x, y)
        q = road_edge.interpolate(road_edge.project(p))
        d = q.distance(p)
        if d < 1e-6 or d > OFF_ROAD_REACH:
            return None
        ux, uy = (q.x - x) / d, (q.y - y) / d
        nx, ny = q.x + ux * LAMP_OFF, q.y + uy * LAMP_OFF
        if in_road(nx, ny) or in_full_road(nx, ny) or not pavement.contains(Point(nx, ny)):
            return None
        return nx, ny, math.atan2(-ux, uy)

    def at_ground(r, q, lift=0.0):
        """`r` with its x, y at `q` and its height recomputed there (kept where the grid has none)."""
        z = ground(q[0], q[1]) if ground else None
        return [round(q[0], 2), round(q[1], 2), r[2] if z is None else round(z + lift, 2)] + list(r[3:])

    # trees and shrubs: [x, y, ground, size]. A tree in a wall is a tree inside a hedge, which the
    # game draws solid, so it is invisible at best and a canopy in the middle of a wall at worst.
    for field in ("tr", "sb"):
        rows = tile.get(field) or []
        keep = []
        for r in rows:
            x, y = float(r[0]), float(r[1])
            if not paved.is_empty and paved.contains(Point(x, y)):
                if q := off_paved(x, y, plant=True):
                    keep.append(at_ground(r, q))
                    moved[field] += 1
                elif field == "tr" and clear(x, y) and not path_faces.contains(Point(x, y)):
                    keep.append(r)
                continue
            # (a lane moved off a building can bring its edge up to a tree that stood clear of it)
            if clear(x, y) and not in_full_road(x, y):
                keep.append(r)
            elif not (in_full_road(x, y) or on_way(x, y) or on_strip(x, y)) and (q := nudged(x, y, plant=True)):
                keep.append(at_ground(r, q))
                moved[field] += 1
        gone[field] = len(rows) - len(keep)
        tile[field] = keep

    # street items: [kind, x, y, ground, angle, ...]. `fx` may also hold the odd string in its first
    # slot, which is a kind like any other, so the coordinates are read by position, not by type.
    rows = tile.get("fx") or []
    keep = []
    poles = {}                      # old (x, y, z) of each pole -> its new row, or None if it went
    for r in rows:
        before = len(keep)
        x, y = float(r[1]), float(r[2])
        # a street item, unlike a plant, is checked against the road at its full width: a lamp just
        # inside the kerb is in the road, and a car parks on it
        if clear(x, y) and not in_full_road(x, y):
            keep.append(r)
        elif in_road(x, y) or on_strip(x, y) or in_full_road(x, y):
            spot = reseat_on_pavement(r[0], x, y, rd) if rd else None
            if spot is None or not clear(spot[0], spot[1]):
                spot = off_road(x, y)
            z = ground(spot[0], spot[1]) if spot is not None and ground else None
            if spot is not None and clear(spot[0], spot[1]) and (z is not None or not ground):
                z = round(z + 0.2, 2) if ground else r[3]
                keep.append([r[0], round(spot[0], 2), round(spot[1], 2), z, round(spot[2], 2)] + list(r[5:]))
                moved["fx"] += 1
        elif not on_way(x, y) and not indoors(x, y) and (q := nudged(x, y)):
            keep.append([r[0]] + at_ground(r[1:], q, 0.2))
            moved["fx"] += 1
        if r[0] == "pole":
            poles[(r[1], r[2], r[3])] = keep[-1] if len(keep) > before else None
    gone["fx"] = len(rows) - len(keep)
    tile["fx"] = keep
    tile["wr"] = wires_on_poles(tile.get("wr") or [], poles)
    return gone


NARROWEST_PARKING = 4.8    # below this carriageway width a street has no room to park and still pass
TWO_KERBS = 7.0            # above this, cars park along both kerbs: at 6.5 the city centre had 773 against the old 466


POLE_TOPS = (7.3, 7.6)     # metres above a pole's foot: a drop to a door, and a span to the next pole


def wires_on_poles(wires, poles):
    """`wr` rows [x, y, z, x, y, z] with each end that hung from a moved pole carried to the pole's new
    top, and the wires of a pole that was removed dropped."""
    def end(x, y, z):
        for (px, py, pz), new in poles.items():
            if abs(x - px) < 0.05 and abs(y - py) < 0.05 and any(abs(z - pz - h) < 0.05 for h in POLE_TOPS):
                h = min(POLE_TOPS, key=lambda h: abs(z - pz - h))
                if new is not None and tuple(new[1:4]) == (px, py, pz):
                    return x, y, z
                return (None,) if new is None else (new[1], new[2], round(new[3] + h, 2))
        return x, y, z
    out = []
    for w in wires:
        a, b = end(*w[:3]), end(*w[3:6])
        if len(a) == 1 or len(b) == 1:
            continue
        out.append(list(a) + list(b) + list(w[6:]))
    return out


def car_sides(w):
    """Which kerbs of a carriageway `w` metres wide have parked cars."""
    if w < NARROWEST_PARKING:
        return "none"
    return "both" if w > TWO_KERBS else "one"


def place_cars(rd, fx, gt, ground):
    """Parked cars along the tile's own streets, and the counts of those left out.

    Left out are the ones whose box (as the game draws a car) touches a barrier, a building or a
    street item (`walls`), stands across a gate's drive (`gate`) or half up a bank (`bank`)."""
    vehicle = [r for r in rd if r["c"] in KERBED or r["c"] in ("service", "unknown", "living_street")]
    vehicle = [r for r in vehicle if len(r["p"]) > 1]
    lines = [LineString([q[:2] for q in r["p"]]) for r in vehicle]
    tree = STRtree(lines) if lines else None
    junctions = []
    for k, (line, r) in enumerate(zip(lines, vehicle)):
        for pt in (Point(line.coords[0]), Point(line.coords[-1])):
            cands = sorted(int(j) for j in tree.query(pt.buffer(3)))
            cands.sort(key=lambda j: lines[j].coords[0])
            for j in cands:
                if j == k or vehicle[j].get("n") == r.get("n") and r.get("n"):
                    continue
                if lines[j].distance(pt) < 2.5:
                    junctions.append(pt)
                    break
    jtree = STRtree(junctions) if junctions else None

    def near_junction(x, y, d):
        return jtree is not None and any(junctions[int(i)].distance(Point(x, y)) < d
                                         for i in jtree.query(Point(x, y).buffer(d)))

    gate_pts = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in gt]
    stop_pts = [Point(f[1], f[2]) for f in fx if f[0] == "bus"]
    return parked_cars(lines, vehicle, lambda r: r["w"] / 2, near_junction, gate_pts, stop_pts, True,
                       lambda r: car_sides(r["w"]))


def car_box(x, y, a):
    ux, uy = math.cos(a), math.sin(a)
    return Polygon([(x + ux * s * 2.05 - uy * t * 0.88, y + uy * s * 2.05 + ux * t * 0.88)
                    for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def car_level(x, y, a, ground):
    """Not half up a bank: across it the wheels stand at much the same height, and along it the
    ground under the middle is about where the wheels put it."""
    ux, uy = math.cos(a), math.sin(a)
    w = {(s, t): ground(x + ux * s * 1.3 - uy * t * 0.75, y + uy * s * 1.3 + ux * t * 0.75)
         for s in (-1, 1) for t in (-1, 1)}
    centre = ground(x, y)
    if centre is None or None in w.values():
        return False                    # off the grid's edge: nowhere to park
    across = abs((w[-1, -1] + w[1, -1]) - (w[-1, 1] + w[1, 1])) / 2
    mid = abs(centre - sum(w.values()) / 4)
    return across < 0.25 and mid < 0.15


def parked_car_rows(rd, fx, br, gt, houses, ground, dv=(), no_parking=None):
    """The `fx` rows for parked cars, and a Counter of how many were placed and left out.

    `no_parking` is the railway, the water and the ground under and over each bridge's deck: a car
    placed along a bridge is set on the ground beneath it, which put cars on the line under the
    Linear Park's bridge."""
    solid = ([LineString([q[:2] for q in b["p"]]).buffer(0.15) for b in br if len(b["p"]) > 1] + list(houses)
             + [Point(f[1], f[2]).buffer(0.3) for f in fx if f[0] != "car"])
    stree = STRtree(solid) if solid else None
    drives = ([LineString([(g[0], g[1]), (g[2], g[3])]).buffer(4.5) for g in gt]
              + [Point(q[0], q[1]).buffer(4.5) for q in dv])
    dtree = STRtree(drives) if drives else None
    rows, count = [], collections.Counter()
    for x, y, a, colour in place_cars(rd, fx, gt, ground):
        count["placed"] += 1
        pt = Point(x, y)
        if stree is not None and len(stree.query(car_box(x, y, a), predicate="intersects")):
            count["walls"] += 1
        elif dtree is not None and len(dtree.query(pt, predicate="within")):
            count["gate"] += 1
        elif no_parking is not None and no_parking.intersects(car_box(x, y, a)):
            count["off_street"] += 1
        elif not car_level(x, y, a, ground):
            count["bank"] += 1
        else:
            rows.append(["car", round(x, 2), round(y, 2), round(float(ground(x, y)) + 0.07, 2),
                         round(a, 2), colour])
    return rows, count


def marks_on_carriageways(mk, rd):
    """The road markings that still lie on a carriageway of the new `rd`. The old build's markings
    were laid along its own streets; where a street has moved or narrowed they would be on the
    pavement or a garden."""
    strips = [LineString([q[:2] for q in r["p"]]).buffer(r["w"] / 2.0 + MARK_SLACK, cap_style="flat")
              for r in rd if r["c"] not in GAME_PATHS and len(r["p"]) > 1]
    if not strips:
        return []
    road = unary_union(strips)
    shapely.prepare(road)
    return [m for m in mk if road.contains(Point(m[0], m[1])) and road.contains(Point(m[2], m[3]))]


def blocked_ground(rd, tile, rail_tracks, canal, sq):
    """What no wall may stand on, as the game draws it: the carriageway as the drawn road strip, the
    railway, the canal's channel and the water. The strips are flat-ended like the game's, so a road
    that ends short of its carriageway face does not take a wall that stands beyond its end."""
    x0, y0, x1, y1 = sq
    parts = []
    for r in rd:
        if len(r["p"]) > 1 and r["c"] not in GAME_PATHS:
            parts.append(LineString([q[:2] for q in r["p"]]).buffer(r["w"] / 2.0, cap_style="flat"))
        if len(r["p"]) > 1 and r["c"] in KERBED:
            line = LineString([q[:2] for q in r["p"]])
            for side, pv in zip((1, -1), r.get("pv", [1.7, 1.7])):
                if pv > 0.3:
                    # stops 0.2 m short of the pavement's back edge: a wall standing there is a front wall
                    parts.append(line.buffer(side * (r["w"] / 2.0 + pv - 0.2), cap_style="flat", single_sided=True))
    for t in rail_tracks:
        run = [q[:2] for q in t["p"] if q[3] != 2 and x0 - 20 <= q[0] <= x1 + 20 and y0 - 20 <= q[1] <= y1 + 20]
        if len(run) > 1:
            parts.append(LineString(run).buffer(RAIL_HALF, cap_style="flat"))
    for run in (canal or {}).get("runs", []):
        pts = [q for q in run["p"] if x0 - 20 <= q[0] <= x1 + 20 and y0 - 20 <= q[1] <= y1 + 20]
        for a, b in zip(pts, pts[1:]):
            if (a[6] | b[6]) & 1:
                continue
            parts.append(LineString([a[:2], b[:2]]).buffer(max(a[2], b[2]) + CANAL_MARGIN, cap_style="flat"))
    for w in tile.get("wp") or []:
        if len(w["r"][0]) >= 3:
            parts.append(Polygon(w["r"][0], [h for h in w["r"][1:] if len(h) >= 3]).buffer(WATER_MARGIN))
    if not parts:
        return None
    blocked = unary_union(parts)
    shapely.prepare(blocked)
    return blocked


BACK_HEDGE_SHARE = 0.1   # the share of back yards hedged rather than fenced, as `gardens.py` rolls it


def reroll_back_styles(part):
    """A boundary between gardens, or a garden and open land, is a wooden fence or, for a tenth of
    the gardens, a hedge: the garden's own roll, as the old build made it. The partition drew every
    unmapped boundary against open land as a hedge, and about two thirds of a suburb's boundaries are
    that, so the gardens came out outlined in green. A hedge a map or the lidar shows stays one."""
    for e in part["edges"]:
        sides = e.get("sides") or []
        owners = [s[1] for s in sides if s[0] == "plot" and len(s) > 1]
        if e["kind"] != "hedge" or e.get("source") not in ("parcel", "inferred") or not owners \
                or any(s[0] == "corridor" for s in sides):
            continue
        if random.Random(min(owners) * 104729 + 7).random() >= BACK_HEDGE_SHARE:
            e["kind"] = "fence"


def drop_walls_on_paving(part, T, base_br):
    """A wall, fence or hedge standing wholly on paving that main has none beside is a garden the
    partition made of a plaza's building (a ring of garden wall in Abbey Churchyard). It is left out."""
    near = unary_union([LineString([q[:2] for q in b["p"]]).buffer(1.5) for b in base_br if len(b["p"]) > 1] or [Polygon()])

    def paved(x, y):
        i, j = int((x - T["x0"]) / T["dx"]), int((y - T["y0"]) / T["dy"])
        return 0 <= i < T["nx"] and 0 <= j < T["ny"] and T["k"][j * T["nx"] + i] == "5"
    for e in part["edges"]:
        if e["kind"] not in ("garden_wall", "fence", "hedge", "wall") or e.get("source") not in ("front", "parcel", "inferred"):
            continue
        xy = e["xy"]
        if not all(paved(*q[:2]) for q in xy[::max(1, len(xy) // 8)] + [xy[-1]]):
            continue
        line = LineString(xy)
        if line.length > 0 and line.intersection(near).length < 0.3 * line.length:
            e["kind"] = "none"


def build_tile(ti, tj, out, once_dir, city, base=None, verbose=True):
    """Write one square's tile to `out` and return it. Used by both the single square and the city."""
    base = base or tile_base(ti, tj)[0]
    if not os.path.exists(base):
        raise SystemExit(f"no existing tile at {base}: the writer starts from a copy of it")
    tile = json.load(open(base))
    part = read_partition(city, ti, tj)
    reroll_back_styles(part)
    drop_walls_on_paving(part, tile["t"], tile.get("br") or [])

    from partition import Q
    size = Q.dx * Q.cells
    sq = (Q.x0 + ti * size, Q.y0 + tj * size, Q.x0 + (ti + 1) * size, Q.y0 + (tj + 1) * size)
    owners = owners_near(once_dir, sq)
    rows = once.read_corridors(once_dir)
    near = box(*sq).buffer(FRONT_REACH)
    row_at = street_rows([e for e, *_ in rows if not e["path"] and LineString(e["line"]).intersects(near)])
    evidence = load_evidence(sq)
    streets = unary_union([face_shape(f).buffer(0) for f in part["faces"]
                           if f["cls"] in ("carriageway", "pavement", "path") and len(f["xy"]) > 2] or [Polygon()])
    shapely.prepare(streets)

    # the corridors pass 1 fitted, and this square's own share of them
    own = [r for r in rows if LineString(r[0]["line"]).intersects(box(*sq))]
    roads = []
    for e, car, pl, pr in own:
        rec = dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), path=e["path"],
                   line=e["line"], sections=e["sections"], tagged=any("width" in t for _, _, t in e.get("obs") or ()))
        roads.append(rec)

    # the ground every point in the tile is placed on: the terrain grid the tile carries
    T = tile["t"]

    def ground(x, y):
        return ground_at(T, x, y)

    houses, kinds = [], []
    for b in tile.get("bl") or []:
        rings = b.get("r") or []
        if not rings:
            continue
        try:
            g = Polygon(rings[0], rings[1:])
        except Exception:
            continue
        if not g.is_empty:
            houses.append(g)
            kinds.append(b.get("c"))
    car_faces = [face_shape(f).buffer(0) for f in part["faces"] if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    walk_faces = [face_shape(f).buffer(0) for f in part["faces"] if f["cls"] == "pavement" and len(f["xy"]) > 2]
    car_area = unary_union(car_faces) if car_faces else None
    fitted = (car_area, unary_union(car_faces + walk_faces)) if car_faces else None
    def road_ground(x, y):
        return ground_at(T, x, y, split=False)

    rail = tile_base(ti, tj)[1]["rail"]
    rail_tracks = json.load(open(rail))["tracks"] if os.path.exists(rail) else []
    water = ([Polygon(w["r"][0], [h for h in w["r"][1:] if len(h) >= 3]) for w in tile["wp"] if len(w["r"][0]) >= 3]
             + [LineString([q[:2] for q in w["p"]]) for w in tile["wl"] if len(w["p"]) > 1 and w["c"] in ("river", "stream")])
    rails = [LineString([q[:2] for q in t["p"]]) for t in rail_tracks if len(t["p"]) > 1]
    canal_file = tile_base(ti, tj)[1]["canal"]
    canal = json.load(open(canal_file)) if os.path.exists(canal_file) else None
    # a bridge over the canal keeps the headroom its profile gives it for a boat
    canal_lines = [LineString([q[:2] for q in run["p"]]) for run in (canal or {}).get("runs", []) if len(run["p"]) > 1]
    wet_tree = STRtree([w for w in water if w.geom_type == "Polygon"]) if water else None

    def wet(x, y):
        pt = Point(x, y)
        return wet_tree is not None and any(wet_tree.geometries[int(k)].contains(pt) for k in wet_tree.query(pt))
    rd = roads_from_corridors(roads, sq, road_ground, fitted, houses, once.read_structures(once_dir),
                              (water, rails + canal_lines), lidar_tall(sq))
    pavements = unary_union([face_shape(f).buffer(0.5) for f in part["faces"]
                             if f["cls"] == "pavement" and len(f["xy"]) > 2])
    carry_missing_paths(rd, tile.get("rd") or [], pavements)
    rd, _ = drop_paths_along_streets(rd)
    drop_empty_spans(rd, road_ground, water, rails)
    rd, _ = drop_paths_on_the_railway(rd, rail_tracks)
    carry_one_way(rd, tile.get("rd") or [])
    carry_pedestrian(rd, tile.get("rd") or [])
    unpaved = demote_pedestrian(rd, tile.get("rd") or [])
    rd, _ = drop_paths_along_streets(rd)
    whole_spans(rd, sq, road_ground, wet)
    paths_on_the_towpath(rd, canal)
    no_span_over_tunnels(rd, canal, [Polygon(w["r"][0]) for w in tile["wp"] if len(w["r"][0]) >= 3 and w.get("c") != "canal"]
                         + water[sum(1 for w in tile["wp"] if len(w["r"][0]) >= 3):], rails, road_ground)
    even_bridge_pavements(rd, houses)
    deck_reach(rd)
    dip_paths_under_spans(rd)
    # the ground is laid to these streets and paths before anything else stands on it
    laid = lay_ground(T, rd, houses, rail_tracks)
    settle_on_laid_ground(rd, laid, road_ground)
    # (a span run on to the end of its record, there, carries on into the next)
    whole_spans(rd, sq, road_ground, wet, cut=True)
    bridge_kinds(rd, osm_bridges(sq), water, rails, canal_lines)
    follow_laid_ground(tile, laid)
    # which boundaries stand is settled once the streets are known: a pedestrian street's edge is open
    settled = settle(part, owners, house_kinds(owners, tile.get("bl") or []), evidence,
                     tile.get("sh") or [], row_at, streets, pedestrian_ground(rd))
    footprints = [Polygon(b["r"][0]).buffer(0) for b in tile.get("bl") or [] if len((b.get("r") or [[]])[0]) >= 3]
    settled["unstood"] = drop_unstood(part, evidence, Standing(sq, footprints))
    # The road surface a boundary may not be drawn on. `carriageway` faces only: a wall on the line
    # where a pavement meets a plot is a front garden wall, which is where most of them belong.
    road_faces = [face_shape(f) for f in part["faces"]
                  if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    road_area = unary_union(road_faces) if road_faces else None
    # the whole street: carriageway and pavement and path, for deciding which side of a boundary the
    # street is on. A wall is only moved if it stands on the corridor's own line.
    cor_faces = [face_shape(f) for f in part["faces"]
                 if f["cls"] in ("carriageway", "pavement", "path") and len(f["xy"]) > 2]
    corridor_area = unary_union(cor_faces) if cor_faces else None
    blocked = blocked_ground(rd, tile, rail_tracks, canal, sq)
    # no wall, fence or hedge stands in the gap under a bridge
    gaps = deck_gaps(rd, road_ground)
    wall_blocked = blocked
    if gaps:
        wall_blocked = unary_union([g[0] for g in gaps] + ([blocked] if blocked is not None else []))
        shapely.prepare(wall_blocked)
    door_gates, wrong_side = gates_for_doors(part, houses, tile.get("dr") or [], road_area, sq)
    gone = {id(o) for o in wrong_side}
    part = dict(part, openings=[o for o in part["openings"] if id(o) not in gone] + door_gates)
    # drives go beside the gates that are left, so none stands beside a gate that was taken out
    drive_opens, dv, drive_cars = drives_from_openings(part, houses, kinds, ground, sq, road_area)
    part = dict(part, openings=(part.get("openings") or []) + drive_opens)
    # a wall point rounded to 0.1 m can fall a few centimetres off the grid at the square's edge, where
    # copying a neighbour's height left it metres off the ground it stands on
    def wall_ground(x, y):
        return ground(min(max(x, T["x0"]), T["x0"] + (T["nx"] - 1.001) * T["dx"]),
                      min(max(y, T["y0"]), T["y0"] + (T["ny"] - 1.001) * T["dy"]))

    # the mapped walls and hedges, which main's tile keeps among its guesses, so they are taken from
    # the map itself: the partition draws only the ones that divide two of its faces
    mapped = [dict(c=c, p=[list(q[:2]) for q in l.coords]) for l, c in evidence.mapped if l.length > 0]
    br, gt, br_in_road = walls_and_gates(part, sq, wall_ground, road_clearance(road_area),
                                         corridor_faces=corridor_area, road_surface=road_area,
                                         blocked=wall_blocked, measured=[b for b in tile.get("br") or [] if "h" in b] + mapped, houses=houses,
                                         paths=[(LineString([q[:2] for q in r["p"]]), r.get("w", 1.8) / 2) for r in rd
                                                if r["c"] in GAME_PATHS and len(r["p"]) > 1])

    fp, fp_dropped = paths_from_openings(part, houses, tile.get("dr") or [], road_area, sq, br, gt)
    fp, fp_cut, fp_walled = keep_paths_off_walls(fp, br, gt)

    tile["rd"] = rd
    # the grid stops just short of the square's edge, and a face must reach it
    def surface_ground(x, y):
        x = min(max(x, T["x0"]), T["x0"] + (T["nx"] - 1.001) * T["dx"])
        y = min(max(y, T["y0"]), T["y0"] + (T["ny"] - 1.001) * T["dy"])
        return ground(x, y)

    tile["sf"] = pack_surfaces(street_surfaces(part, rd, sq, surface_ground, fp, dv, unpaved, tile["t"], green_ground(sq), br,
                                               canal_bores(canal)),
                               sq[0], sq[1])
    tile["br"] = br
    tile["gt"] = gt
    tile["fp"] = fp
    tile["dv"] = dv
    tile["mk"] = marks_on_carriageways(tile.get("mk") or [], rd)
    tile["fx"] = [f for f in tile.get("fx") or [] if f[0] != "car"]
    moved = collections.Counter()
    gone = drop_clashes(tile, part, br, gt=gt, fp=fp, rd=rd, ground=ground, moved=moved, blocked=blocked,
                        dv=dv, carriageway=drawn_carriageway(tile["sf"]))
    clear_under_decks(tile, gaps, gone)
    # placed after the clash pass, which would take a car for a thing standing in the road
    no_parking = unary_union([g for g in (blocked_ground([], tile, rail_tracks, canal, sq),) if g is not None]
                             + [g[0] for g in gaps])
    cars, car_count = parked_car_rows(rd, tile["fx"], br, gt, houses, ground, dv,
                                      None if no_parking.is_empty else no_parking)
    tile["fx"] += cars + drive_cars
    d = os.path.dirname(os.path.abspath(out))
    os.makedirs(d, exist_ok=True)
    json.dump(tile, open(out, "w"), separators=(",", ":"))
    if verbose:
        print(f"wrote {out}")
        print(f"  rd {len(rd)} records (one per corridor stretch), br {len(br)} runs, "
              f"gt {len(gt)} gaps, fp {len(fp)}, dv {len(dv)}")
        if br_in_road:
            print(f"  barriers cut at the road: {br_in_road:.0f} m dropped for lying wholly inside "
                  f"a carriageway")
        print(f"  guessed boundaries left out: {settled['front']:.0f} m of front with no garden, "
              f"{settled['lane']:.0f} m along lanes, {settled['far']:.0f} m away from any garden, "
              f"{settled['pedestrian']:.0f} m along pedestrian streets, {settled.get('unstood', 0):.0f} m of wall or hedge with nothing standing near")
        if fp_cut or fp_walled:
            print(f"  front paths meeting a wall: {fp_cut} cut short, {fp_walled} left out")
        if fp_dropped:
            print(f"  gates with no door in reach: {fp_dropped}")
        print(f"  copied: t, bl ({len(tile.get('bl') or [])}), and every decoration field but cars")
        print(f"  cars: {len(cars)} parked of {car_count['placed']} placed; left out "
              f"{car_count['walls']} touching a wall or building, {car_count['gate']} across a gate, "
              f"{car_count['bank']} half up a bank, {car_count['off_street']} on a bridge, the railway or the water")
        if any(gone.values()) or any(moved.values()):
            print(f"  decoration where the new layout contradicts it: dropped "
                  + (", ".join(f"{k} {v}" for k, v in gone.items() if v) or "none")
                  + "; moved " + (", ".join(f"{k} {v}" for k, v in moved.items() if v) or "none"))
    tile["_gone"] = gone
    tile["_moved"] = moved
    return tile


def write_one(job):
    """One square, for the city pool. Returns a summary row rather than raising, so one bad square
    does not lose the other 121."""
    ti, tj, out_dir, once_dir, city, base = job
    out = os.path.join(out_dir, f"{ti}_{tj}.json")
    try:
        tile = build_tile(ti, tj, out, once_dir, city, base, verbose=False)
    except SystemExit as e:
        return dict(square=[ti, tj], failed=str(e))
    except Exception as e:
        return dict(square=[ti, tj], failed=f"{type(e).__name__}: {e}")
    gone = tile.get("_gone") or {}
    return dict(square=[ti, tj], runs=len(tile.get("br") or []),
                gaps=len(tile.get("gt") or []), fp=len(tile.get("fp") or []),
                dropped_tr=gone.get("tr", 0), dropped_sb=gone.get("sb", 0),
                dropped_fx=gone.get("fx", 0), moved=dict(tile.get("_moved") or {}))


def write_city(argv):
    """Write every square's tile into a directory, in parallel.

    Usage: python3 -I tools/partition/write_tile.py --all <out dir> [--once dir] [--city dir]
                                                     [--base dir] [--jobs n]

    The square list and the pool are `city.py`'s, for the same reasons: the build is pure Python plus
    shapely, so it needs processes rather than threads, and the squares must be the same set the
    partitions were built for.

    Each tile still starts from a **copy of the existing tile for its own square** (`--base`, the
    game's map directory by default), so the only fields that differ from the old build are the ones
    the partition owns. A square whose old tile is missing is reported and skipped, not invented."""
    from concurrent.futures import ProcessPoolExecutor
    from partition.city import squares

    out_dir = argv[argv.index("--all") + 1]
    once_dir = os.path.join(ROOT, "out", "once-p1")
    city = os.path.join(ROOT, "out", "city")
    base = None
    jobs = os.cpu_count() or 4
    for flag in ("--once", "--city", "--base", "--jobs"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--once":
                once_dir = v
            elif flag == "--city":
                city = v
            elif flag == "--base":
                base = v
            else:
                jobs = int(v)
    os.makedirs(out_dir, exist_ok=True)
    wanted = squares()
    todo, missing = [], []
    for ti, tj in wanted:
        b = os.path.join(base, f"{ti}_{tj}.json") if base else tile_base(ti, tj)[0]
        if os.path.exists(b):
            todo.append((ti, tj, out_dir, once_dir, city, b))
        else:
            missing.append((ti, tj))
    print(f"{len(todo)} squares of {MAP} to write, {jobs} at a time, into {out_dir}", flush=True)
    if missing:
        print(f"  {len(missing)} skipped: no existing tile to start from "
              f"({', '.join(f'{a}_{b}' for a, b in missing[:5])}"
              f"{' ...' if len(missing) > 5 else ''})", flush=True)
    start = time.time()
    rows = []
    with ProcessPoolExecutor(jobs) as pool:
        for n, r in enumerate(pool.map(write_one, todo), 1):
            rows.append(r)
            ti, tj = r["square"]
            if "failed" in r:
                print(f"[{n}/{len(todo)}] {ti}_{tj} FAILED ({r['failed']})", flush=True)
            else:
                print(f"[{n}/{len(todo)}] {ti}_{tj} br {r['runs']} gt {r['gaps']} "
                      f"fp {r['fp']} (dropped {r['dropped_tr']}/{r['dropped_sb']}/{r['dropped_fx']})",
                      flush=True)
    ok = [r for r in rows if "failed" not in r]
    bad = [r for r in rows if "failed" in r]
    print(f"\n{len(ok)} written, {len(bad)} failed, {time.time() - start:.0f} s")
    print(f"  stubs on a square's edge with nothing next door: {drop_edge_stubs(out_dir, [tuple(r['square']) for r in ok])} dropped")
    if ok:
        for k in ("runs", "gaps", "fp", "dropped_tr", "dropped_sb", "dropped_fx"):
            print(f"  {k}: {sum(r[k] for r in ok):,}")
    summary = dict(squares=len(wanted), written=len(ok), failed=bad,
                   skipped_no_base=[list(m) for m in missing], rows=rows)
    with open(os.path.join(out_dir, "written.json"), "w") as f:
        json.dump(summary, f)
    return summary


def main(argv):
    if "--all" in argv:
        return write_city(argv)
    ti, tj, out = int(argv[0]), int(argv[1]), argv[2]
    once_dir = os.path.join(ROOT, "out", "once-p1")
    city = os.path.join(ROOT, "out", "city")
    base = None
    for flag in ("--once", "--city", "--base"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--once":
                once_dir = v
            elif flag == "--city":
                city = v
            else:
                base = v
    return build_tile(ti, tj, out, once_dir, city, base)


if __name__ == "__main__":
    main(sys.argv[1:])
