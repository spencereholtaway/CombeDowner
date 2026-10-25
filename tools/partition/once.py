"""Build each street edge and each worked block exactly once, so neighbouring squares agree.

Stage 3 showed that a 40 m margin cannot make two squares agree: a block crossing a square's edge is
cut at edge+40 m in one square and edge-40 m in the other, and everything that looks across the
whole block (the region growing, the back lines, the caps, the sliver absorption) then runs on two
different blocks. Measured on the village square and its eastern neighbour: 36 unmatched boundaries
at 40 m, 7 at 80 m, 10 at 160 m. No margin fixes it, because the thing being compared is itself
built twice.

So a thing is built once. **Every street edge and every worked block is owned by exactly one square
and built there, with a data window sized to the thing rather than to the square.** A square's
partition is then assembled from pieces its neighbours also hold, and a shared edge agrees because
it is the same geometry, not because two builds happened to match.

Three passes, run in order, each a process pool over the squares, with small JSON files between
them in `<out>/<ti>_<tj>/`:

1. `pass_streets` - the street graph is built once for the whole map (one `street_graph` call over
   every way, so no way is split at a square's edge), each edge is owned by the square holding its
   midpoint, and the owner fits it on its full length and writes `corridors.json`.
2. `pass_blocks` - the worked block is a connected piece of `block ∩ buffer(all buildings,
   REACH_GROW)`, the only ground where a plot can exist; open land beyond it is open. It is owned by
   the square holding its representative point, divided by `make_plots` as it is now, and written to
   `blocks.json`.
3. `pass_assemble` - the square gathers the corridors and worked blocks overlapping it from its own
   folder and its eight neighbours', takes the rest as open land cut by evidence, clips to the
   square, and runs the surface, openings, metrics and checks unchanged.

Ownership is by geometry only (midpoint, representative point), never by order of discovery, and
every list written is sorted by a geometric key, so the result does not depend on how many processes
ran or in what order.
"""
import collections
import glob
import json
import os
import time

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from . import MARGIN, Q, evidence_of, lap, zone_at
from .buildings import clean_buildings
from .corridors import PATHS, REACH, fit_cross_section, offset_poly, path_width, side_reach
from .data import Data, box_of, neighbours, owner_of, squares_over
from .graph import street_graph
from structures import match_structures
from .plots import (EXTEND, GARDEN, OPEN_KINDS, REACH_GROW, Parcels, building_axes,
                    classify_edges, front_normals, join_evidence, make_plots)

FILTER_SPAN = 12.0      # metres: the corridor fit's median filter reaches this far along an edge,
                        # so a window for an edge is grown by it as well as by REACH


def map_bbox():
    """The whole map's data box (W, S, E, N in map metres), a little wider than the field's circle
    so the outermost square's margin is covered."""
    from . import A

    (fcx, fcy), R = A.field_centre, A.half
    return (fcx - R - MARGIN, fcy - R - MARGIN, fcx + R + MARGIN, fcy + R + MARGIN)


def _line_json(line, dec=None):
    """A line's coordinates, at full precision by default.

    Not rounded: rounding every pass file to 3 decimals (a millimetre) made 366 of 57,279 plots
    self-intersect and collapsed 185 slivers to nothing, and the ground that vanished came back as
    uncovered area. Plain floats are what `json` writes for `repr`, so the files are bigger and
    nothing else changes. The repair of a self-intersecting outline stays, because those are real."""
    if dec is None:
        return [[x, y] for x, y in line.coords]
    return [[round(x, dec), round(y, dec)] for x, y in line.coords]


def _poly_json(g, dec=None):
    """A polygon as JSON, **with its holes**.

    The holes matter and dropping them is not a cosmetic loss: a plot's ground is a polygon whose
    holes are its *buildings*, and an `open` face is a polygon whose holes are its *plots* - the open
    ground round a garden is one face with the garden cut out of it. Writing only the exterior turns
    such a ring into a solid slab over the ground it had cut out, so reading it back gives a face that
    overlaps its neighbours (measured: 28,126 m² of overlap on the village square against a partition
    that has none, 411,075 m² across the map, and every boundary drawn twice explains the 10.5 km of
    extra edges and their `inferred` labels).

    A MultiPolygon is a list of such polygons, one level deeper. A pavement whose width drops to
    nothing partway along comes out of the offset as two pieces, and writing nothing for it would
    leave the whole pavement to the gardens."""
    if g.is_empty:
        return None
    if g.geom_type == "MultiPolygon":
        parts = [_poly_json(p, dec) for p in g.geoms if not p.is_empty]
        return parts or None
    if g.geom_type != "Polygon":
        return None
    rings = [[(x, y) for x, y in g.exterior.coords]]
    rings += [[(x, y) for x, y in r.coords] for r in g.interiors]
    if dec is None:
        return [[[x, y] for x, y in r] for r in rings]
    return [[[round(x, dec), round(y, dec)] for x, y in r] for r in rings]


def _poly_json_parts(g, dec=None):
    """A polygon made valid at the precision actually written, as a list of `_poly_json` rings, one
    for each part it falls into.

    The coordinates go out at full precision by default (rounding to 3 decimals made 366 of 57,279
    plots self-intersect and collapsed 185 slivers to nothing), but a ring can still come out
    self-intersecting from `difference`, and a self-intersecting outline fails GEOS later with "side
    location conflict" wherever it is used. `make_valid` repairs it at the precision being written, so
    what is read back is what was measured.

    A bow-tie repairs to two polygons, and both are ground: keeping only the larger left the other
    uncovered. The caller writes one row for each part."""
    a = _poly_json(g, dec)
    if a is None:
        return []
    q = _poly_from(a)
    if q.is_valid:
        return [a] if q.geom_type == "Polygon" else [_poly_json(p, dec) for p in q.geoms]
    # `make_valid` and not `buffer(0)`: the buffer keeps one lobe of a bow-tie and loses the other
    fixed = shapely.make_valid(q)
    if fixed.is_empty:
        return []                   # the face has no area at this precision: there is nothing to write
    parts = []
    for g in (fixed.geoms if hasattr(fixed, "geoms") else [fixed]):
        parts += [p for p in (g.geoms if hasattr(g, "geoms") else [g])
                  if p.geom_type == "Polygon" and not p.is_empty]
    # `buffer(0)` can return the same invalid ring, in which case writing the rounded original is
    # still better than writing the repaired empty: the caller drops a None, so a face that is
    # *tiny* must not become a face that is *missing*.
    return [_poly_json(p, dec) for p in parts] or [a]


def _poly_from(a):
    """A polygon read back from `_poly_json`: a list of rings, the first the exterior and the rest its
    holes, or a list of those for a MultiPolygon. `None` (or an empty list) is an empty polygon.

    Every reader goes through this, so the ring list is understood in one place and a face that has
    holes cannot be read as a solid slab by accident."""
    if not a:
        return Polygon()
    if isinstance(a[0][0], (int, float)):        # an old exterior-only list, for a stale file
        return Polygon(a)
    if isinstance(a[0][0][0], (list, tuple)):    # several polygons
        return unary_union([Polygon(p[0], p[1:]) for p in a])
    return Polygon(a[0], a[1:])


def _label_json(lab):
    """A face label as JSON: ("plot", 12) -> ["plot", 12], ("open",) -> ["open"].

    The labels are tuples (a kind and, for a plot, its building index) and the assemble pass has to
    read them back exactly, so they are written as they are rather than as their repr."""
    return list(lab)


def _label_from(a):
    return tuple(a)


def _geom_key(g, dec=3):
    """A geometry's sort key: its bounding box, rounded. Every list a pass writes is sorted by a key
    like this, so the result does not depend on how many processes ran or in what order."""
    x0, y0, x1, y1 = g.bounds
    return [round(x0, dec), round(y0, dec), round(x1, dec), round(y1, dec)]


def square_of_point(p):
    """Which square holds a point, by geometry only."""
    from . import Q
    size = Q.dx * Q.cells
    return int((p.x - Q.x0) // size), int((p.y - Q.y0) // size)


def blocks_path(out):
    return os.path.join(out, "blocks.json")


def read_held_out(ti, tj, out):
    """The width tags of the streets whose tagged stretch's middle lies in this square, each fitted
    with its own tag hidden, written by pass 1 beside the corridors.

    The rows come from pass 1's fits, so the test is the street the build actually made, and the
    filter is the plan's: only the square holding the tagged stretch's middle reports it, so a street
    near an edge is counted once rather than once per square that can see it (plan, stage 3 item 4).
    Pass 3 cannot read the graph to find the streets (`a pass reads only the files of the pass before
    it`), so pass 1 leaves them; the owning square is always one of the eight a square gathers, so
    the whole set is here (measured: 0 of 712 tagged stretches city-wide had their owner outside the
    mid-square's gather)."""
    from . import Q
    side = Q.dx * Q.cells
    sq = (Q.x0 + ti * side, Q.y0 + tj * side, Q.x0 + (ti + 1) * side, Q.y0 + (tj + 1) * side)
    rows = []
    for a, b in neighbours(ti, tj):
        p = os.path.join(out, f"{a}_{b}", "held-out.json")
        if os.path.exists(p):
            rows.extend(json.load(open(p)))
    return [dict(name=r["name"], tagged=r["tagged"], fitted=r["fitted"]) for r in rows
            if sq[0] <= r["mid"][0] < sq[2] and sq[1] <= r["mid"][1] < sq[3]]


def parents_path(out):
    return os.path.join(out, "parents.json")


def write_parents(out, blocks):
    """The parent blocks of the whole map, written once.

    A worked piece is a fragment of a parent block, and `make_plots` must cut the *parent* so the same
    lines and faces come out whichever piece or square is dividing (the point of stage 3b). The parent
    has to be the real block, computed from the whole corridor and building sets - not a block clipped
    to whatever window a task happens to hold, whose boundary would be a window edge and would cut the
    block in the wrong place.

    Written sorted by a geometric key, like every list a pass writes."""
    blocks = sorted(blocks, key=_geom_key)
    json.dump([dict(k=_geom_key(b), xy=xy) for b in blocks for xy in _poly_json_parts(b)],
              open(parents_path(out), "w"))
    return blocks


def read_parents(out, win=None):
    """The parent blocks, all of them or only those touching a window."""
    rows = json.load(open(parents_path(out)))
    out_blocks = [_poly_from(r["xy"]) for r in rows]
    if win is None:
        return out_blocks
    x0, y0, x1, y1 = win
    return [b for b, r in zip(out_blocks, rows)
            if r["k"][2] >= x0 and r["k"][0] <= x1 and r["k"][3] >= y0 and r["k"][1] <= y1]


def cleaned_path(out):
    return os.path.join(out, "cleaned-buildings.json")


def write_cleaned(out, buildings):
    """The cleaned footprints of the whole map, written once.

    `clean_buildings` is a set operation - it snaps footprints within CLOSE (0.6 m) of each other and
    removes the overlaps that creates, later footprints giving way to earlier ones - so a building's
    answer can depend on which other buildings are in the set. Cleaning it once for the whole map and
    handing the result to every worker is therefore the only way two squares are certain to see the
    same footprint. (Measured, it happens not to matter for the one window tried: 0 of 3,603
    buildings cleaned differently when the window grew by 30 m. It is cheap to be exact - 1.0 s for
    the whole map - and the design should not rest on a sample of one.)"""
    cleaned, closed = clean_buildings(buildings)
    cleaned.sort(key=_geom_key)
    json.dump([dict(b=_geom_key(g), xy=_poly_json(g)) for g in cleaned], open(cleaned_path(out), "w"))
    return cleaned, closed


def read_cleaned(out, win=None):
    """The cleaned footprints, all of them or only those touching a window.

    Returned with the index each footprint has in the whole written list, which is its **global**
    building index - the same number in every process and every square. A plot carries one of these
    (pass 2 writes it, pass 3 reads it), and a house has to be the same house wherever it is read, so
    the index is into the file rather than into whatever window happens to be in hand."""
    rows = json.load(open(cleaned_path(out)))
    if win is None:
        return [(i, _poly_from(r["xy"])) for i, r in enumerate(rows)]
    x0, y0, x1, y1 = win
    return [(i, _poly_from(r["xy"])) for i, r in enumerate(rows)
            if r["b"][2] >= x0 and r["b"][0] <= x1 and r["b"][3] >= y0 and r["b"][1] <= y1]


# ---- pass 1: streets, once ----------------------------------------------------------------------

def graph_path(out):
    return os.path.join(out, "graph.json")


def build_graph(out, raw, log=print):
    """The street graph, built once for the whole map and written to `<out>/graph.json`.

    Built once, serially, because it is a single object: noded and chained over every way in the
    map, so no way is split where two squares meet. It is written to a file rather than kept in a
    module global because this Mac starts pool workers by **spawn**, which re-imports the module, so
    a global set in the parent would be empty in every worker. A file is also what the plan asks for:
    a pass reads the files of the pass before it, not another process's memory."""
    bb = map_bbox()
    D = Data(raw, bb, log=log)
    roads = []
    for g, p in D.lines_near(bb, "osm-roads"):
        g = g.intersection(box(*bb))
        for l in (g.geoms if hasattr(g, "geoms") else [g]):
            if l.geom_type == "LineString" and l.length > 0.5:
                roads.append((l, p))
    log(f"  {len(roads)} road pieces over the whole map")
    edges = street_graph(roads, bb, log=log)
    # a stable id and order: sorted by the line's own bounding box, a geometric key, so the same
    # edge keeps the same id however the ways were read and however many processes ran
    edges.sort(key=lambda e: (round(e["line"].bounds[0], 3), round(e["line"].bounds[1], 3),
                              round(e["line"].bounds[2], 3), round(e["line"].bounds[3], 3),
                              e["cls"], e.get("name", "")))
    # the id is the edge's place in that sorted order, and the same ids go to the file and back to
    # the caller, so the owner and the other passes agree on what "edge 18729" is
    for i, e in enumerate(edges):
        e["id"] = i
    # the bridges and tunnels, which the OSM ways do not carry: laid on from Overture's flags now
    # the ids are fixed, so the profile pass and the writer find them on the edge they belong to
    segments = [(g, p) for g, p in D.near(bb, "segment") if p.get("subtype") == "road" and p.get("road_flags")]
    marked = match_structures(edges, segments)
    for e in edges:
        e["struct"] = marked.get(e["id"], {})
    json.dump([dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), line=_line_json(e["line"]),
                    obs=[[float(t0), float(t1), tags] for t0, t1, tags in e["obs"]],
                    struct=e["struct"])
               for e in edges],
              open(graph_path(out), "w"))
    log(f"  {len(marked)} edges carry a bridge or a tunnel, from {len(segments)} flagged segments")
    log(f"  {len(edges)} street graph edges -> {os.path.basename(graph_path(out))}")
    return edges


def read_graph(out):
    """The street graph one of the passes reads back, as the same dicts `street_graph` returns."""
    return [dict(id=r["id"], cls=r["cls"], name=r["name"], line=LineString(r["line"]),
                 obs=[(t0, t1, tags) for t0, t1, tags in r["obs"]], struct=r.get("struct", {}))
            for r in json.load(open(graph_path(out)))]


def clear_owned(out, *names):
    """Remove the per-square files a pass is about to write. A rerun that owns fewer squares or rows
    than the last one would otherwise leave the old files beside the new, and the readers' glob would
    take both."""
    for name in names:
        for f in glob.glob(os.path.join(out, "*", name)):
            os.remove(f)


def pass_streets(out, raw, jobs=4, log=print):
    """Fit each street edge once, in the square that owns its midpoint, and write
    `<out>/<ti>_<tj>/corridors.json`.

    The graph is built once (`build_graph`); the fitting is the expensive part and runs in a pool,
    one task per owning square, each reading the raw data for the bbox of the edges it owns. Nothing
    about an edge's fit depends on which square built it - that is what
    `test_an_edges_fit_is_the_same_from_two_windows` holds."""
    clear_owned(out, "corridors.json", "held-out.json")
    edges = build_graph(out, raw, log=log)
    bb = map_bbox()
    owned = collections.defaultdict(list)
    for e in edges:
        owned[owner_of(e["line"].bounds)].append(e["id"])
    tasks = [(ti, tj, sorted(ids), out, raw, bb) for (ti, tj), ids in sorted(owned.items())]
    log(f"  pass 1: {len(tasks)} squares own edges")
    return _run_pool(_fit_square_edges, tasks, jobs, log, "pass 1")


def structures_path(out):
    return os.path.join(out, "structures.json")


def pass_structures(out, raw, terrain, log=print):
    """The height of every street edge, with its bridges, decks and bored stretches, for the whole
    map at once, written to `<out>/structures.json`.

    It is one step over every edge because a dip under a bridge lowers the roads that meet the one
    underneath, so no square can decide it from its own streets. Each edge is walked every 4 m, as
    the old build walked a road, with the raw ground as its starting height (`structures.py`)."""
    from . import MAP, ROOT, Terrain
    from structures import chain_edges, make_run, solve, split_back
    edges = read_graph(out)
    bb = map_bbox()
    D = Data(raw, bb, log=lambda *_: None)
    ground = Terrain(terrain).elev
    water = [g for g, p in D.polys_near(bb, "water") if p.get("class") != "sea"]
    maps = os.path.join(ROOT, "web", "public", "maps")

    def side(name):
        path = os.path.join(maps, f"{MAP}-{name}.json")
        return json.load(open(path)) if os.path.exists(path) else None
    rail, canal = side("rail"), side("canal")
    t = time.time()
    pending = [make_run(c, ground) for c in chain_edges(edges)]
    log(f"  structures: {len(edges)} edges in {len(pending)} through-roads walked in {time.time() - t:.0f}s")
    solve(pending, water, (rail or {}).get("tracks", []), canal, ground, box(*bb))
    rows = {}
    for r in pending:
        rows.update(split_back(r))
    json.dump(rows, open(structures_path(out), "w"))
    log(f"  structures: {sum(1 for v in rows.values() if v['span'])} edges with a span, "
        f"{sum(1 for v in rows.values() if v['deck'])} with a deck, "
        f"{sum(1 for v in rows.values() if v['bored'])} bored, {time.time() - t:.0f}s")
    return rows


def read_structures(out):
    path = structures_path(out)
    return {int(k): v for k, v in json.load(open(path)).items()} if os.path.exists(path) else {}


def edge_window(lines):
    """The window to fit a set of edges from: their combined bounding box grown by everything the fit
    looks out by - REACH for what stands beside the street, and FILTER_SPAN for the median filter
    that runs along it. Sized to the things, not to the square, so a long street loads more and a
    short one less, and nothing depends on which square is asking."""
    bounds = unary_union(lines).bounds
    return (bounds[0] - REACH - FILTER_SPAN, bounds[1] - REACH - FILTER_SPAN,
            bounds[2] + REACH + FILTER_SPAN, bounds[3] + REACH + FILTER_SPAN)


def obstacles_for(D, win):
    """The things the corridor fit measures against in a window: every building, and the evidence
    lines (mapped barriers and lidar wall runs) joined as the fit and the plots join them.

    Read from the window's own data and nothing else, so fitting the same edge from two windows that
    both contain it gives the same answer - which is the pass's test."""
    bpolys, _closed = clean_buildings([g for g, p in D.polys_near(win, "building")])
    barriers = [(g, p["class"]) for g, p in D.lines_near(win, "infrastructure")
                if p.get("subtype") == "barrier"
                and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")]
    ridges = D.ridges_near(win)
    evidence = evidence_of(barriers, ridges)
    by_kind = collections.defaultdict(list)
    for g, k in evidence:
        by_kind[k].append(g)
    evidence = [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)]
    obstacles = [g for g, _ in evidence] + bpolys
    return bpolys, evidence, obstacles, STRtree(obstacles)


def fit_edge(e, otree, obstacles, ts=None, L=None, R=None):
    """One street or path edge fitted on its full length: its cross-sections and the three polygons
    (carriageway, left pavement, right pavement). A pure function of the edge and what stands beside
    it, so the same edge fitted from any window that contains it gives the same result.

    `ts`, `L` and `R` are the edge's cross-section samples and the corridor either side, passed in by
    a caller that has already measured them (the held-out width test reads the same corridor), and
    measured here when they are not."""
    if e["cls"] in PATHS:
        w = path_width(e["cls"], e["obs"])
        ts = np.linspace(0, e["line"].length, max(2, int(e["line"].length / 2) + 1))
        car = offset_poly(e["line"], ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2))
        return dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), path=True,
                    line=_line_json(e["line"]), struct=e.get("struct", {}),
                    sections=[[0.0, float(e["line"].length), [float(w), 0.0, 0.0]]],
                    obs=[[float(t0), float(t1), tags] for t0, t1, tags in e["obs"]],
                    car=_poly_json(car), pl=None, pr=None)
    if ts is None:
        ts, L, R = side_reach(e["line"], otree, obstacles)
    stretches, sec = fit_cross_section(e, ts, L, R)
    car = offset_poly(e["line"], ts, sec[:, 0] / 2, sec[:, 0] / 2)
    pl = offset_poly(e["line"], ts, sec[:, 0] / 2 + sec[:, 1], -sec[:, 0] / 2)
    pr = offset_poly(e["line"], ts, -sec[:, 0] / 2, sec[:, 0] / 2 + sec[:, 2])
    return dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), path=False,
                line=_line_json(e["line"]), struct=e.get("struct", {}),
                sections=[[float(t0), float(t1), [float(v) for v in vs]] for t0, t1, vs in stretches],
                obs=[[float(t0), float(t1), tags] for t0, t1, tags in e["obs"]],
                car=_poly_json(car), pl=_poly_json(pl), pr=_poly_json(pr))


def held_out_checks(e, ts, L, R):
    """The carriageway width with each `width` tag hidden, as (name, tagged, fitted, mid) for every
    tagged stretch of the edge. The corridor (`ts`, `L`, `R`) is the one the edge is fitted on, so
    the test cannot be reading a street the square was never given.

    The *stretch's middle* is reported with it because that is what decides which square reports it:
    the squares each work a 40 m margin, so a street near an edge is seen by both and would otherwise
    be counted twice with the two fits differing slightly where the margins differ (plan, stage 3 item
    4). A stretch whose tag does not parse as a number is skipped. A path is never passed: it has no
    carriageway, so there is no width to hold out of it."""
    tagged = [(t0, t1, tags) for t0, t1, tags in e["obs"] if "width" in tags]
    if not tagged:
        return []
    _, sec2 = fit_cross_section(e, ts, L, R, hold_out=True)
    out = []
    for t0, t1, tags in tagged:
        try:
            wt = float(tags["width"])
        except ValueError:
            continue
        m = (ts >= t0) & (ts <= t1)
        if m.sum():
            mid = e["line"].interpolate((t0 + t1) / 2)
            out.append((e.get("name", ""), wt, float(np.median(sec2[m, 0])),
                        [round(mid.x, 4), round(mid.y, 4)]))
    return out


def _fit_square_edges(ti, tj, ids, out, raw, bb):
    """Fit the edges this square owns. One task of pass 1."""
    edges = read_graph(out)
    win = edge_window([edges[i]["line"] for i in ids])
    D = Data(raw, bb, log=lambda *_: None)
    _bpolys, _evidence, obstacles, otree = obstacles_for(D, win)

    out_dir = os.path.join(out, f"{ti}_{tj}")
    os.makedirs(out_dir, exist_ok=True)
    rows, held = [], []
    for i in ids:
        e = edges[i]
        if e["cls"] in PATHS:
            rows.append(fit_edge(e, otree, obstacles))
            continue                    # a path has no carriageway: no width to hold out
        ts, L, R = side_reach(e["line"], otree, obstacles)
        rows.append(fit_edge(e, otree, obstacles, ts=ts, L=L, R=R))
        held += held_out_checks(e, ts, L, R)
    json.dump(rows, open(os.path.join(out_dir, "corridors.json"), "w"))
    # the width tags of the edges this square owns, with each tag hidden from its own fit: written
    # beside the corridors so the square that assembles them reports the same test the pass fitted
    # (the tag is read from the graph, which pass 3 may not open)
    json.dump([dict(name=n, tagged=w, fitted=f, mid=m) for n, w, f, m in held],
              open(os.path.join(out_dir, "held-out.json"), "w"))
    return ti, tj, len(rows)


# ---- pass 2: blocks, once ------------------------------------------------------------------------

BLOCK_CAP = 2000.0      # metres across: a worked block bigger than this is reported (plan, stage 3b)
MIN_BLOCK = 5.0         # m^2: the plan's own floor for ground worth calling a worked block, the
                        # same threshold the build uses for a block (`build`: "area > 5")


def read_corridors(out):
    """Every square's corridors.json, as (edge dict, carriageway, pl, pr) for the whole map.

    A pass may read the files of the pass before it, which is what this is: pass 2 needs every
    corridor to know where the blocks are, and pass 3 reads them the same way. The polygons are
    made valid on the way in (a handful of offset polygons are not), because an invalid one makes the
    union of them all fail with a topology error."""
    rows = []
    for f in sorted(glob.glob(os.path.join(out, "*", "corridors.json"))):
        for r in json.load(open(f)):
            e = dict(id=r["id"], cls=r["cls"], name=r["name"], path=r["path"],
                     line=LineString(r["line"]), struct=r.get("struct", {}),
                     sections=[(t0, t1, vs) for t0, t1, vs in r["sections"]],
                     obs=[(t0, t1, tags) for t0, t1, tags in r["obs"]])
            polys = []
            for key in ("car", "pl", "pr"):
                a = r.get(key)
                if not a:
                    polys.append(Polygon())
                    continue
                g = _poly_from(a)
                if not g.is_valid:
                    g = g.buffer(0)
                polys.append(g if g.geom_type == "Polygon" else unary_union(g))
            rows.append((e, polys[0], polys[1], polys[2]))
    return rows


def _parts(g):
    """A geometry's polygon parts, or itself if it is already one."""
    if g.is_empty:
        return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]


def worked_pieces(corridors, buildings, bb, cap=BLOCK_CAP, log=print):
    """The worked blocks of the whole map: the connected pieces of
    `block ∩ buffer(all buildings, REACH_GROW)`, where block is the complement of the corridors and
    the buildings. Returns [(piece, over_cap)] with `over_cap` set where a piece is wider than cap,
    sorted by a geometric key.

    The definition is the plan's, used as written, and the cost is kept down by working one block at
    a time: a building more than REACH_GROW from a block cannot reach any point of that block with
    its buffer, so buffering only the buildings within REACH_GROW of each block gives the same
    pieces. Buffering all 46,780 buildings at once peaked at 6.8 GB, which is 7 GB for one step of a
    city run; per block it is 1.3 GB. Clustering the buildings first, the obvious alternative,
    barely helped, because Bath's buildings are one cluster of 38,798: it is the *block* that
    fragments the city, so the block is what the work is scoped by.

    The `block ∩` term is load-bearing. Without it every piece of ground is produced once per block
    whose buildings reach it, and the city comes out with 30 times the worked blocks it has
    (measured: 195,471 pieces and 420 km² against 6,725 and 39.9 km²). The blocks themselves come
    from one union of the corridors and one of the buildings, neither of which is the expensive part
    (752 MB and 782 MB)."""
    corner = [g for _e, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    cor_union = unary_union(corner)
    bld_union = unary_union(buildings)
    W0 = box(*bb).difference(cor_union).difference(bld_union)
    blocks = [p for p in _parts(W0) if p.area > MIN_BLOCK]
    log(f"  pass 2: {len(blocks)} blocks")

    btree = STRtree(buildings)
    ctree = STRtree(corner)
    out = []
    for blk in blocks:
        # only the buildings that can reach this block, and the corridors that can carve it
        near = blk.buffer(REACH_GROW)
        # in index order: `bunion` is a unary_union of these, and a union's noding can depend on the
        # order of its inputs (an STRtree's `query` order depends on how the index was built)
        nb = [buildings[int(k)] for k in sorted(int(k) for k in np.atleast_1d(btree.query(near)))]
        if not nb:
            continue                            # no building near: no worked block, just open land
        # The plan's definition, kept exactly: `block ∩ buffer(buildings, REACH_GROW)`, then the
        # corridors and buildings taken out. The intersection with the block is the term that keeps
        # each piece in its own block - without it every piece of ground is produced once per block
        # whose buildings reach it, and the city comes out with 30 times the worked blocks it has
        # (measured: 195,471 pieces and 420 km2 against 6,691 and 39.98 km2).
        bunion = unary_union(nb)
        grown = bunion.buffer(REACH_GROW).intersection(blk)
        nc = [corner[int(k)] for k in sorted(int(k) for k in np.atleast_1d(ctree.query(grown)))]
        W = grown.difference(unary_union(nc) if nc else Polygon()).difference(bunion)
        pieces = [p for p in _parts(W) if p.area > MIN_BLOCK]
        for p in pieces:
            # A worked block's outline must be a valid polygon before it is divided or written:
            # GEOS's `difference` can leave a piece whose ring self-intersects, and rounding its
            # coordinates to the file's precision can do the same (measured: 51 of 6,736 pieces,
            # which failed 19 squares with "side location conflict"). `buffer(0)` is the repair GEOS
            # itself recommends; it fixes the ring without moving the ground.
            if not p.is_valid:
                p = p.buffer(0)
            for q in _parts(p):
                if q.geom_type != "Polygon" or q.is_empty or q.area <= MIN_BLOCK:
                    continue
                span = max(q.bounds[2] - q.bounds[0], q.bounds[3] - q.bounds[1])
                out.append((q, span > cap))
    n_over = sum(1 for _p, over in out if over)
    if n_over:
        log(f"  pass 2: {n_over} worked blocks are over the {cap:.0f} m cap and are still built")
    out.sort(key=lambda t: (round(t[0].bounds[0], 3), round(t[0].bounds[1], 3),
                            round(t[0].bounds[2], 3), round(t[0].bounds[3], 3)))
    # the parent blocks come back too: a piece is a fragment of one, and the caller writes them so
    # that dividing a piece can cut its whole parent
    return out, blocks


def pass_blocks(out, raw, jobs=4, log=print):
    """Divide each worked block once, in the square owning its representative point, and write
    `<out>/<ti>_<tj>/blocks.json`.

    The worked pieces themselves are computed once for the whole map (`worked_pieces`) from pass 1's
    corridors and the whole building set, so the outline is the same whichever square divides it -
    which is what `test_a_worked_blocks_outline_is_the_same_from_two_windows` holds. What is pooled
    is the dividing, one task per owning square, each with a window sized to its own pieces."""
    corridors = read_corridors(out)
    bb = map_bbox()
    D = Data(raw, bb, log=lambda *_: None)
    bld_all = [g for g, p in D.polys_near(bb, "building")]
    # cleaned once for the whole map, so every square divides its blocks with the same footprints
    cleaned, closed = write_cleaned(out, bld_all)
    log(f"  pass 2: {len(cleaned)} cleaned footprints ({closed} sliver gaps closed)")
    del D
    t = time.time()
    clear_owned(out, "blocks.json")
    pieces, blocks = worked_pieces(corridors, cleaned, bb, log=log)
    log(f"  pass 2: {len(pieces)} worked blocks in {time.time() - t:.0f}s")
    # the parent blocks are written once, so a task dividing a piece can cut the whole block it is a
    # fragment of: the region is then a real block, the same whichever piece is asking
    write_parents(out, blocks)

    # the worked pieces themselves are written once, so a task re-reads the outline it divides rather
    # than recomputing it, and so the "same outline from two windows" test has a file to read
    # the outline is made valid at the file's precision as it is written, because it is read back
    # and divided: a self-intersecting ring there fails GEOS wherever it is used
    # a piece that repairs to several parts is several rows, and ownership below is by row
    rows = [(xy, over) for p, over in pieces for xy in _poly_json_parts(p)]
    pieces = [(_poly_from(xy), over) for xy, over in rows]
    json.dump([dict(key=_geom_key(p), over=over, xy=xy) for (p, over), (xy, _) in zip(pieces, rows)],
              open(blocks_path(out), "w"))

    # Ownership by the piece's representative point, as the plan says. Not its bounding box's
    # midpoint: an L-shaped worked block's midpoint can fall in the notch, in another piece or even
    # outside the block, so the two are not interchangeable.
    owned = collections.defaultdict(list)
    for n, (p, over) in enumerate(pieces):
        owned[square_of_point(p.representative_point())].append(n)
    tasks = [(ti, tj, sorted(ids), out, raw, bb) for (ti, tj), ids in sorted(owned.items())]
    log(f"  pass 2: {len(tasks)} squares own worked blocks")
    return _run_pool(_fit_square_blocks, tasks, jobs, log, "pass 2")


def block_window_for(pieces, parents):
    """The window to divide a task's pieces from: the **union** of the old window and the parents' box.

    Two things have to hold, and they pull in opposite directions.

    **The parent's real extent.** `make_plots` cuts the parent, not the piece, so a window that cuts a
    parent at its own edge gives a piece faces that depend on which window was in hand - the one thing
    stage 3b is for. So the window must contain each piece's parent, found from the map's whole list
    however far it reaches (measured: a third of pieces have a parent reaching past a piece-sized
    window, the median by 285 m and the worst by 1,700 m).

    **Everything `make_plots` reads beyond the parent.** `front_normals` searches 50 m for the street a
    house faces, `side_reach` looks out REACH, and the seed reach looks past the parent's edge for the
    houses that seed the growing. Those all used to be covered by the old window's
    `REACH_GROW + MARGIN` padding round the *pieces*. A piece's box is never bigger than its parent's,
    but on a side where the piece runs to the parent's edge the parent's box plus MARGIN alone is
    REACH_GROW (60 m) *smaller* than the old window - which would lose that data, and did: it changed
    the written output of 155 of 160 squares when only a third of the pieces had a parent reaching
    past the old window.

    So the window is the union of the two: the old window (pieces grown by `REACH_GROW + MARGIN`) and
    the parents grown by `MARGIN`. A piece whose parent already fitted the old window therefore gets
    exactly the window it had before, and its faces cannot change; a piece whose parent did not fit
    gets the parent's whole extent as well.

    `parents` is every parent block of the map. A piece whose parent cannot be found (which should not
    happen: every piece is a fragment of one) contributes only its own box."""
    boxes = list(pieces)
    for p in pieces:
        parent = parent_for(p, parents)
        if parent is not None:
            boxes.append(parent)
    old = (min(p.bounds[0] for p in pieces) - REACH_GROW - MARGIN,
           min(p.bounds[1] for p in pieces) - REACH_GROW - MARGIN,
           max(p.bounds[2] for p in pieces) + REACH_GROW + MARGIN,
           max(p.bounds[3] for p in pieces) + REACH_GROW + MARGIN)
    whole = (min(p.bounds[0] for p in boxes) - MARGIN, min(p.bounds[1] for p in boxes) - MARGIN,
             max(p.bounds[2] for p in boxes) + MARGIN, max(p.bounds[3] for p in boxes) + MARGIN)
    return (min(old[0], whole[0]), min(old[1], whole[1]),
            max(old[2], whole[2]), max(old[3], whole[3]))


def parent_for(piece, parents):
    """The parent block a worked piece is a fragment of: the one containing its representative point.

    The representative point, not the centroid or a corner, because it is the same test ownership
    uses (`square_of_point` on the piece's representative point), so a piece and its parent are
    chosen the same way however the outline is shaped."""
    rp = piece.representative_point()
    return next((q for q in parents if q.contains(rp)), None)


def window_inputs(out, raw, bb, win, corridors):
    """Everything `make_plots` reads for a piece, loaded from a window.

    One function rather than the body of the task, so that "the same piece from two windows gives the
    same faces" can be tested against exactly the code the pass runs - the cut lines and the seeds are
    read through this as much as the parent is, and a test that only compared the parent would pass
    while the faces differed.

    Returns a dict of what `make_plots` takes: its evidence lines and tree, the buildings, their axes
    and fronts, the parcels and the corridors whose streets it faces houses to."""
    D = Data(raw, bb, log=lambda *_: None)
    cleaned_in_window = read_cleaned(out, win)
    buildings = list(cleaned_in_window)
    bpolys = [g for _i, g in buildings]
    bunion = unary_union(bpolys)
    barriers = [(g, p["class"]) for g, p in D.lines_near(win, "infrastructure")
                if p.get("subtype") == "barrier"
                and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")]
    ridges = D.ridges_near(win)
    evidence = evidence_of(barriers, ridges)
    by_kind = collections.defaultdict(list)
    for g, k in evidence:
        by_kind[k].append(g)
    evidence = [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)]
    ev_lines = [g for g, _ in evidence]
    ev_tree = STRtree(ev_lines)
    parcels = Parcels([g for g, p in D.polys_near(win, "parcels")])
    street_lines = [e["line"] for e, car, pl, pr in corridors if not e["path"]]
    street_tree = STRtree(street_lines) if street_lines else None
    geoms = [g for _i, g in buildings]
    axes = {i: a for (i, _g), a in zip(buildings, building_axes(geoms))}
    fronts = front_normals(geoms, [axes[i] for i, _g in buildings], street_tree, street_lines)
    # `make_plots` indexes buildings, their axes and their fronts by the *building index it was
    # given*, which here is the global one. `front_normals` numbers its answer from 0 over the list
    # it was handed, so its keys are translated to the global indices rather than left as they came.
    fronts = {i: fronts[n] for n, (i, _g) in enumerate(buildings)}
    return dict(buildings=buildings, bunion=bunion, ev_lines=ev_lines, ev_tree=ev_tree,
                axes=axes, fronts=fronts, parcels=parcels, corridors=corridors)


def _fit_square_blocks(ti, tj, ids, out, raw, bb):
    """Divide the worked blocks this square owns. One task of pass 2."""
    # A guard, not a courtesy: this task writes out/<ti>_<tj>/blocks.json, and a diagnostic that
    # called it with a handful of ids would leave that file holding those few rows - which looks like
    # a complete pass output to every reader afterwards. (That happened once and silently invalidated
    # two measurements.) A full pass always covers every owner square, so a square with no file keeps
    # its freedom to be built, while an existing file is never overwritten with fewer rows.
    out_dir = os.path.join(out, f"{ti}_{tj}")
    path = os.path.join(out_dir, "blocks.json")
    if os.path.exists(path):
        try:
            written = len(json.load(open(path)))
        except Exception:
            written = -1
        if 0 <= written > len(ids):
            print(f"  pass 2: {ti}_{tj} already holds {written} rows, more than the {len(ids)} to "
                  f"write: leaving it (a partial task must not shrink a pass output)", flush=True)
            return ti, tj, written
    whole = [_poly_from(r["xy"]) for r in json.load(open(blocks_path(out)))]
    mypieces = [whole[i] for i in ids]
    corridors = read_corridors(out)
    pieces_by_edge = {(e["id"]): (e, car, pl, pr) for e, car, pl, pr in corridors}

    # The window: see `block_window_for` for why it is the union of the old piece-sized window and
    # the parents' box. In short, the parent's whole extent is needed because `make_plots` cuts the
    # parent, and the old padding is needed as a floor because `front_normals` and the seed reach look
    # past the parent's edge. `read_parents(out, None)` gives every parent, so a piece's real one is
    # found however far it reaches.
    parents_all = read_parents(out, None)
    win = block_window_for(mypieces, parents_all)

    # everything `make_plots` reads for these pieces, loaded from the window - the same code the
    # "same faces from two windows" test runs, so a test that passes is about the real path
    env = window_inputs(out, raw, bb, win, corridors)

    out_dir = os.path.join(out, f"{ti}_{tj}")
    os.makedirs(out_dir, exist_ok=True)

    # The parent block of each piece, read from the ones pass 2 wrote for the whole map. It must be
    # the *real* block, not one clipped to this window: a window edge would be a boundary in the
    # network and would cut the block in the wrong place, and `make_plots` cuts the parent so that
    # the same lines and faces come out whichever piece or square is dividing.
    parents = read_parents(out, win)

    rows = []
    for n, piece in zip(ids, mypieces):
        cx, cy = piece.representative_point().x, piece.representative_point().y
        parent = next((q for q in parents if q.contains(piece.representative_point())), None)
        p, e = make_plots(piece, env["buildings"], env["ev_lines"], env["ev_tree"],
                          zone_at(cx, cy), env["axes"], env["fronts"], env["bunion"],
                          box(*bb), parcels=env["parcels"], parent=parent, log=lambda *_: None,
                          sliver_ways=[c[0]["line"] for c in corridors
                                       if c[0]["line"].distance(piece) < 30])
        rows.append(dict(
            n=n, key=_geom_key(piece), xy=_poly_json(piece),
            # the plots are written with the same repair as the worked-block outlines, and for the
            # same reason: rounding a thin plot's coordinates to the file's precision can make it
            # self-intersect, and pass 3 intersects the plots it reads (measured: 366 of 57,279
            # plots came back invalid, and the first one failed the assembling square outright)
            plots=[dict(kind=k, bi=b, xy=xy) for g, k, b in p for xy in _poly_json_parts(g)],
            edges=[dict(a=_geom_key(s), xy=_line_json(s), la=_label_json(a1), lb=_label_json(b1))
                   for s, a1, b1 in e]))
    json.dump(rows, open(os.path.join(out_dir, "blocks.json"), "w"))
    return ti, tj, len(rows)


def _run_pool(fn, tasks, jobs, log, what):
    """Run the pass's tasks in a process pool, printing each as it lands. A task that fails is
    reported and the pass carries on: one bad square should not lose the other 130.

    `fn` must be a module-level function: this Mac starts workers by **spawn**, which re-runs
    `__main__` in the child and pickles the function by name, so a closure or a lambda would not
    start at all (and running a pass from `python3 -` fails outright, because the child tries to
    re-run `<stdin>`, which does not exist). Both are why a pass is launched from a real file."""
    from concurrent.futures import ProcessPoolExecutor
    done, failed = [], []
    with ProcessPoolExecutor(jobs) as pool:
        futures = [pool.submit(fn, *t) for t in tasks]
        for f, t in zip(futures, tasks):
            try:
                done.append(f.result())
            except Exception as exc:            # a failed task is reported, not fatal
                failed.append((t[0], t[1], exc))
                log(f"  {what}: {t[0]}_{t[1]} FAILED ({type(exc).__name__}: {exc})")
    log(f"  {what}: {len(done)} tasks done, {len(failed)} failed")
    return done, failed
