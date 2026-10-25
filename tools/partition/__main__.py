"""Build one square of the map as a partition of the ground.

Usage: python3 -I tools/partition/__main__.py <ti> <tj> <out dir> [--raw <dir>] [--terrain <dir>]

Runs the stages in the design's order (buildings, street graph, corridors, plots, surface), writes
<out>/partition.json (the faces), <out>/render.svg, <out>/evidence.svg, <out>/current.svg (the
same square from the current build, drawn the same way) and <out>/metrics.json, and prints the
metrics. `partition_poc.py` is a thin wrapper round this.
"""
import collections
import json
import os
import statistics
import sys
import zipfile

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from . import MAP, MARGIN, Q, ROOT, Terrain, evidence_of, lap, load_layer, zone_at
from . import checks
from .data import Data
from .buildings import clean_buildings
from .corridors import PATHS, PATHW, PRIOR, offset_poly
from .metrics import current_build, openings_checks, pavement_steps
from .openings import find_openings, front_edges
from .plots import (OPEN_KINDS, Parcels, building_axes, classify_edges, front_normals,
                    join_evidence, make_plots, street_rows)
from .render import free_ends, loose_ends, render
from .surface import partition, road_profile, surface

# the map build's stage sets this: the drawings and the comparison with the game's own squares are
# for looking at, and the game's squares are the partition's own earlier output there
QUICK = os.environ.get("CD_PARTITION_QUICK") == "1"


def load_ridges(raw, ti, tj):
    """The lidar wall runs the build kept for this square (data/combe-down/measured/<ti>_<tj>.zip)."""
    import lzma
    ridges = []
    mz = os.path.join(ROOT, "data", MAP, "measured", f"{ti}_{tj}.zip")
    if os.path.exists(mz):
        with zipfile.ZipFile(mz) as z:
            if "walls.json.xz" in z.namelist():
                for w in json.loads(lzma.decompress(z.read("walls.json.xz"))):
                    ridges.append((LineString(w["p"]), w["c"], w["h"]))
    return ridges


def build(ti, tj, out, raw, terrain, log=print, once=None):
    """Assemble one square's partition from the corridors and worked blocks built once.

    `once` is the folder the passes wrote (`out/once-p1`): pass 1's `corridors.json` and pass 2's
    `blocks.json`, the square's own and its eight neighbours'. Stage 3b moved the building of the
    ground itself into those passes, so a square no longer makes its own - it gathers. See
    `assemble.py` for why that is what makes two neighbouring squares agree.
    """
    # the folder the passes wrote, which is fixed for a run rather than derived from where this
    # square's own output goes: `out/<ti>_<tj>/` sits inside it in a city run, and elsewhere the
    # driver passes it explicitly
    once = once or os.path.join(ROOT, "out", "once-p1")
    os.makedirs(out, exist_ok=True)
    side = Q.dx * Q.cells
    sq = (Q.x0 + ti * side, Q.y0 + tj * side, Q.x0 + (ti + 1) * side, Q.y0 + (tj + 1) * side)
    bb = (sq[0] - MARGIN, sq[1] - MARGIN, sq[2] + MARGIN, sq[3] + MARGIN)
    B, SQ = box(*bb), box(*sq)
    T = Terrain(terrain)
    print(f"square {ti},{tj}: {sq}")

    bld = [(g, p) for g, p in load_layer(raw, "building", bb) if g.geom_type in ("Polygon", "MultiPolygon")]
    bpolys = []
    for g, p in bld:
        for pg in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            bpolys.append(pg)
    roads = []
    for g, p in load_layer(raw, "osm-roads", bb):
        if g.geom_type != "LineString":
            continue
        g = g.intersection(B)
        for l in (g.geoms if hasattr(g, "geoms") else [g]):
            if l.geom_type == "LineString" and l.length > 0.5:
                roads.append((l, p))
    barriers = [(g, p["class"]) for g, p in load_layer(raw, "infrastructure", bb)
                if p.get("subtype") == "barrier" and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")
                and g.geom_type in ("LineString", "MultiLineString")]
    landuse = [(g, p.get("class")) for g, p in load_layer(raw, "land_use", bb)
               if g.geom_type in ("Polygon", "MultiPolygon")]
    parcels = Parcels([g for g, p in load_layer(raw, "parcels", bb)
                       if g.geom_type in ("Polygon", "MultiPolygon")])
    # the lidar wall runs over the *worked area*, not one square: assembling gathers ground from the
    # neighbours into the margin, and stage 3's one-square read left that ground with no evidence
    # against it, so its boundaries fell to 'inferred' and the evidence share dropped (measured: 535
    # inferred edges against 244, and 71.0% against 79.3%). `Data.ridges_near` reads the squares the
    # window touches, which is the same measurement file the one-square read used.
    ridges = Data(raw, bb, log=lambda *_: None).ridges_near(bb)
    print(f"  buildings {len(bpolys)}, road pieces {len(roads)}, mapped barriers {len(barriers)}, "
          f"lidar ridge runs {len(ridges)}, land use {len(landuse)}, registered parcels {len(parcels.polys)}")

    bpolys, closed = clean_buildings(bpolys)
    bunion = unary_union(bpolys)
    lap("buildings"); print(f"  1. buildings cleaned: {len(bpolys)}, sliver gaps closed {closed}")

    evidence = evidence_of(barriers, ridges)
    # evidence runs that are collinear within 10 degrees and 8 m of one another join into one line,
    # so a boundary the survey shows in pieces is one boundary (a joined line only becomes a plot
    # edge if it closes a face, so the partition can afford to join more than walls.py does)
    by_kind = collections.defaultdict(list)
    for g, k in evidence:
        by_kind[k].append(g)
    evidence = [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)]
    # ---- stage 3b: assemble from the corridors and worked blocks built once --------------------
    # The square builds no ground of its own. Everything here was built by the pass before it and
    # owned by whichever square held its midpoint (a street edge) or representative point (a worked
    # block), so what this square writes is made of pieces its neighbours also hold and a shared edge
    # agrees by identity rather than by two builds happening to match.
    from . import assemble

    once_rows = assemble.gather(ti, tj, once, "corridors")
    block_rows = assemble.gather(ti, tj, once, "blocks")
    # the width tags of the streets pass 1 fitted, each with its own tag hidden: the *whole* set of
    # tagged streets whose middle lies in this square, whatever square owns each edge, because pass 1
    # reports an edge only from the square that owns it (plan, stage 3 item 4). Read here rather than
    # measured from the graph, which pass 3 may not open.
    from .once import read_held_out
    held = read_held_out(ti, tj, once)
    # assembled over the *worked area* (the square plus its 40 m margin), as stage 3 built it: the
    # plots and the edged network run out into the margin so their ends land on the worked area's
    # own boundary rather than at the square's edge, which is what the loose-end metric measures.
    # The faces themselves are still clipped to the square below.
    corridors = assemble.corridors_for(once_rows, bb)
    streets = [e for e, _c, _p, _q in corridors if not e["path"]]
    paths = [e for e, _c, _p, _q in corridors if e["path"]]
    plots, raw = assemble.blocks_for(block_rows, bb)
    from .once import read_cleaned
    # only the footprints this square works over (its own area plus the margin), as the old build
    # loaded them: reading the whole map's list and using it as faces put 2139 buildings into the
    # village square against 1331 in stage 3
    buildings = [(i, g) for i, g in read_cleaned(once) if g.intersects(B)]
    bpolys = [g for _i, g in buildings]
    bunion = unary_union(bpolys)
    cor_union = unary_union([g for _e, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty])
    ev_lines = [g for g, _ in evidence]
    ev_tree = STRtree(ev_lines)
    ev_tree2 = STRtree(ev_lines)
    # every layer of the worked area, unclipped: what the classification reads and what the neighbour
    # check reads (the ground a face straddles), both of which need the ground on *both* sides of a
    # division rather than only this square's side of it
    prof, layers = {}, []
    for k, (e, car, pl, pr) in enumerate(corridors):
        prof[k] = road_profile(e, T)
        cls = "carriageway" if e["cls"] not in PATHS else "path"
        for g, c in ((car, cls), (pl, "pavement"), (pr, "pavement")):
            layers.append((g, c, k))
    layers += [(g, kind, bi) for g, kind, bi in plots]
    for b in bpolys:
        z = min(T.elev(x, y) for x, y in b.exterior.coords[::max(1, len(b.exterior.coords) // 8)])
        layers.append((b, "building", z))
    # A layer must be valid before it is noded or intersected with an edge: GEOS's `difference` and
    # rounding a thin ring's coordinates to the file's precision can both leave one self-intersecting,
    # and an invalid ring fails with "side location conflict" (measured: 51 of 6,736 worked pieces,
    # and 366 of 57,279 plots). `buffer(0)` is the repair GEOS recommends; it fixes the ring without
    # moving the ground.
    layers = [(g if g.is_valid else g.buffer(0), c, d) for g, c, d in layers
              if not g.is_empty and g.area > 0]
    # The provisional labels pass 2 gave are overwritten from the two assembled faces either side of
    # each segment - the rule the project classifies by, which pass 2 could not apply: it divided a
    # worked piece knowing only that piece's buildings, evidence and parcels, and never saw a corridor,
    # so the ground beyond a piece was a probe's guess. This is before the openings, the metrics and
    # the checks, which all read the classified edges. The faces are noded over the *worked area* B,
    # not over the square: a division inside B has a plot on both sides whichever square owns its
    # piece, so plot-against-plot reads as plot-against-plot, where clipping to the square first would
    # leave the neighbour's plot with no face here and turn a parcel boundary into a hedge.
    raw = assemble.relabel(raw, partition(layers, B), B)
    # `whole` keeps the layers before the clip to the square: the neighbour check needs them
    # (checks.edge_profile), because a clipped face describes only its own side of the shared edge
    whole = [(g, c) for g, c, _d in layers]
    faces = [(g.intersection(SQ), c, d) for g, c, d in layers]
    faces = [(g, c, d) for g, c, d in faces if not g.is_empty]
    lap("noding"); faces = partition(faces, SQ)
    pedges, parcel_share = classify_edges(raw, evidence, ev_tree2, zone_at,
                                          parcels.lines, parcels.ltree,
                                          houses=[b for _i, b in buildings],
                                          others=bunion.union(cor_union.boundary), B=B,
                                          row_at=street_rows(streets))
    lap("edges"); print(f"  4. assembled: {sum(1 for _, k, _ in plots if k == 'plot')} plots, "
                        f"{sum(1 for _, k, _ in plots if k == 'open')} open pieces, "
                        f"{len(pedges)} edges")
    lap("triangulating"); tris, bad = surface(faces, T, prof)
    covered = unary_union([g for g, _, _ in faces])
    holes = SQ.difference(covered)
    hole_area = holes.area
    overlap = sum(g.area for g, _, _ in faces) - covered.area
    lap("surface"); print(f"  5. surface: {len(tris)} triangles, faces failed {bad}, "
                          f"uncovered {hole_area:.1f} m2 of {SQ.area:.0f}, overlap {overlap:.1f} m2")

    drawn = [e[0] for e in pedges if e[1] != "none"]
    n_free_new, pts_new = free_ends(drawn, bunion.union(cor_union.boundary))
    # the ends that matter are the ones inside the worked area: an end on the worked area's own
    # boundary (the square plus its margin) is the partition being cut off there, not a loose end
    # (the plan counts its "nearly all on the square's edge" this way, and the proof of concept does)
    n_edge_new, n_loose_new, _ = loose_ends(drawn, bunion.union(cor_union.boundary), B)
    n_free_old, pts_old = free_ends([g for g, _, _ in ridges], bunion)
    # openings: gates and drives in the fronts, and where a path crosses a plot edge, with the
    # checks the plan names (a gate on its edge with the edge continuing either side, nothing wider
    # than its edge, no building facing a street with neither)
    houses = {i: b for i, b in buildings}
    path_corr = [(e["line"], PATHW.get(e["cls"], 1.8), e["cls"]) for e in paths]
    # the built street/pavement/path polygons, for the checks and for deciding which plot edges are
    # fronts: an edge whose far side is open ground reaching a corridor is a front too
    cor_faces = [g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    openings = find_openings(plots, pedges, houses, path_corr, cor_faces)
    plot_edges_len = {i: e[0].length for i, e in enumerate(pedges) if e[1] != "none"}
    # a building whose plot has a front on a street must have a gate or drive in it
    fronts = front_edges(plots, pedges, cor_faces)
    fronted = set(fronts)
    opening_bldgs = {bidx for bidx, eids in fronts.items()
                     if any(o["edge"] in set(eids) and o["kind"] in ("gate", "drive", "open")
                            for o in openings)}
    fronts_without = sorted(fronted - opening_bldgs)
    # A building whose house is outside this square's worked area is not this square's to judge: its
    # plot reaches in from next door, where the house and its gate are. It is deferred to the square
    # that holds the house and resolved city-wide after the passes; a fragment no square holds, or
    # one that cannot be walked to from the rest of its plot, is judged here.
    # a fragment's house is by definition not in this square's window, so the holder is looked up in
    # the map's whole cleaned list. `read_cleaned` with no window reads every row and is cached for
    # the process, so this costs one read per worker rather than one per square.
    from .once import read_cleaned, square_of_point
    map_buildings = dict(read_cleaned(once))

    def holder_of(bidx):
        h = map_buildings.get(bidx)
        return None if h is None else square_of_point(h.representative_point())

    judged, deferred, in_margin = checks.deferred_fragments(sq, plots, houses, fronts_without,
                                                            holder_of)
    opening_fails, opening_sum = openings_checks(openings, plot_edges_len, judged)
    # the two areas the city-wide scope proof needs: the plot ground this square ships (the `plot`
    # faces of its own written partition) and the plot ground its checks judged (its gathered plot
    # faces clipped to the square). If every square judges exactly what it ships, the two totals are
    # equal over the city - which is what makes the scope rule a scope rule rather than a weakening.
    shipped_plot_area = sum(g.area for g, c, _d in faces if c == "plot")
    judged_plot_area = unary_union([g for g, _k, _b in checks.in_square(plots, sq)[0]]).area
    # every fragment this square hands to another square, and every building it recorded an opening
    # for, written beside the square's other output: `city.py` resolves the deferred ones after the
    # whole city is built, which is the only place the holder's own openings are known
    json.dump(dict(square=[ti, tj],
                   deferred=[dict(building=b, holder=None if h is None else list(h))
                             for b, h in deferred],
                   gated=sorted(opening_bldgs)),
              open(os.path.join(out, "fragments.json"), "w"))
    held_err = [abs(h["fitted"] - h["tagged"]) for h in held]
    metrics = dict(
        square=[ti, tj], buildings=len(bpolys), sliver_gaps_closed=closed,
        street_edges=len(streets), path_edges=len(paths), road_pieces=len(roads),
        lidar_runs=len(ridges), lidar_runs_free_ends=n_free_old,
        plot_edges=len(drawn), plot_edges_free_ends=n_free_new,
        plot_edges_ends_on_square_edge=n_edge_new, plot_edges_loose_ends_inside=n_loose_new,
        plot_edges_by_source=dict(collections.Counter(e[3] for e in pedges)),
        plot_edge_support_mean=float(np.mean([e[2] for e in pedges])) if pedges else None,
        # the same figure weighted by edge length, and the two lengths it is made of: the unweighted
        # mean lets a square that draws one short edge count as much as one that draws four thousand,
        # so the city figure can move without the ground changing. These make both readings possible.
        plot_edge_length=float(sum(e[0].length for e in pedges)),
        plot_edge_evidence_length=float(sum(e[0].length * e[2] for e in pedges)),
        plot_edges_on_parcel_edge=round(parcel_share, 4),
        held_out_widths=len(held), held_out_within_1m=sum(1 for e in held_err if e <= 1.0),
        held_out_median_error=float(statistics.median(held_err)) if held_err else None,
        held_out=held,
        surface_triangles=len(tris), surface_uncovered_m2=round(hole_area, 1),
        surface_uncovered_at=[[round(g.centroid.x, 1), round(g.centroid.y, 1), round(g.area, 2)]
                              for g in getattr(holes, "geoms", [holes]) if g.area > 0.005],
        surface_overlap_m2=round(overlap, 1),
        cross_section_changes=sum(len(e.get("sections", [])) - 1 for e in streets),
        openings=opening_sum, opening_failures=len(opening_fails),
        opening_kinds=dict(collections.Counter(o["kind"] for o in openings)),
        fragments_deferred=len(deferred),
        fragments_judged=len(judged),
        plots_in_margin=len(in_margin),
        shipped_plot_area_m2=round(shipped_plot_area, 3),
        judged_plot_area_m2=round(judged_plot_area, 3),
    )
    json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
    json.dump(dict(square=[ti, tj],
                   faces=[dict(cls=c, xy=list(map(list, (g.exterior.coords if g.geom_type == "Polygon" else []))),
                               **({"holes": [list(map(list, h.coords)) for h in g.interiors]}
                                  if g.geom_type == "Polygon" and g.interiors else {}))
                          for g, c, _ in faces][:20000],
                   edges=[dict(kind=e[1], support=round(e[2], 2), source=e[3],
                                sides=[list(e[4][0]), list(e[4][1])],
                                xy=list(map(list, e[0].coords)))
                          for e in pedges],
                   openings=openings),
              open(os.path.join(out, "partition.json"), "w"))
    lap("metrics")

    layers = [("poly", [(g, c) for g, c, _ in faces if c in ("open", "plot")]),
              ("poly", [(g, c) for g, c, _ in faces if c in ("pavement", "path")]),
              ("poly", [(g, c) for g, c, _ in faces if c == "carriageway"]),
              ("poly", [(g, c) for g, c, _ in faces if c == "building"]),
              ("line", [(e[0], e[1] + (" inferred" if e[3] == "inferred" else ""))
                        for e in pedges if e[1] != "none"]),
              ("dot", [(p, "free") for p in pts_new])]
    if not QUICK:
        render(os.path.join(out, "render.svg"), sq, layers, f"partition: square {ti},{tj}")
    layers_ev = [("poly", [(g, c) for g, c, _ in faces
                           if c in ("open", "plot", "pavement", "path", "carriageway", "building")]),
                 ("line", [(g, "ridge") for g, _, _ in ridges]),
                 ("line", [(g, "railing") for g, _ in barriers]),
                 ("dot", [(p, "free") for p in pts_old])]
    if not QUICK:
        render(os.path.join(out, "evidence.svg"), sq, layers_ev,
               f"evidence: lidar ridge runs (red) and mapped barriers, square {ti},{tj}")
    cur = None if QUICK else current_build(ti, tj, sq)
    if cur:
        bl, rd, br = cur
        rl = []
        for r in rd:
            line = LineString([(x, y) for x, y, *_ in r["p"]])
            if line.length < 1:
                continue
            w, pv = r.get("w", PRIOR.get(r["c"], (5, 3.5))[0]), r.get("pv", [1.7, 1.7])
            ts = np.linspace(0, line.length, max(2, int(line.length / 2) + 1))
            rl.append((offset_poly(line, ts, np.full(len(ts), w / 2 + pv[0]), np.full(len(ts), w / 2 + pv[1])),
                       "pavement"))
            rl.append((offset_poly(line, ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2)), "carriageway"))
        brl = [LineString([(x, y) for x, y, *_ in b["p"]]) for b in br if len(b["p"]) > 1]
        n_free_cur, pts_cur = free_ends(brl, unary_union([Polygon(b["r"][0]) for b in bl if len(b["r"][0]) > 3]))
        metrics["current_build"] = dict(barriers=len(brl), barriers_free_ends=n_free_cur, road_pieces=len(rd),
                                        pavement_steps=pavement_steps(rd))
        json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
        render(os.path.join(out, "current.svg"), sq,
               [("poly", [(SQ, "open")]), ("poly", [g for g in rl if g[1] == "pavement"]),
                ("poly", [g for g in rl if g[1] == "carriageway"]),
                ("poly", [(Polygon(b["r"][0]), "building") for b in bl if len(b["r"][0]) > 3]),
                ("line", [(l, b["c"]) for l, b in zip(brl, [b for b in br if len(b["p"]) > 1])]),
                ("dot", [(p, "free") for p in pts_cur])], f"current build: square {ti},{tj}")
    print(json.dumps({k: v for k, v in metrics.items() if k != "held_out"}, indent=1))
    # the data checks (stage 3): what the partition says about the data rather than about the code.
    # They only report, so they run after the metrics and stay off the build's own path.
    data_checks = []
    data_checks += checks.narrow_corridors(ti, tj, streets)
    data_checks += checks.buildings_cut(ti, tj, bpolys, corridors)
    data_checks += checks.unreachable_plots(ti, tj, plots, houses, corridors, pedges, openings, sq)
    data_checks += checks.edges_through_buildings(ti, tj, pedges, bpolys)
    if data_checks:
        json.dump(data_checks, open(os.path.join(out, "checks.json"), "w"), indent=1)
    metrics["data_checks"] = dict(collections.Counter(c["rule"] for c in data_checks))
    metrics["data_check_list"] = data_checks[:200]
    json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
    # where this square's partition meets its own four edges, for the neighbour check a city run
    # makes (checks.edge_positions): four short lists of numbers, so a city run passes only these
    # between processes rather than every square's faces.
    # the neighbour check compares the ground either square sees along the edge they share, from the
    # faces *before* the clip (see checks.edge_profile), sampled on the edge and on lines parallel to
    # it inside each margin. Offsets run both ways because each square's own margin only reaches 40 m
    json.dump(dict(square=[ti, tj], box=list(sq),
                   edges=checks.edge_profile(sq, whole, (0.0, 10.0, 20.0, 30.0, -10.0, -20.0, -30.0))),
              open(os.path.join(out, "boundary.json"), "w"))
    return metrics


def paths_from(argv):
    """The raw folder and the terrain folder a command line names. The terrain follows `--raw`
    unless it is named itself."""
    raw = os.path.join(ROOT, "data", "raw", MAP, "wide")
    if "--raw" in argv:
        raw = argv[argv.index("--raw") + 1]
    terrain = os.path.join(raw, "terrain15")
    if "--terrain" in argv:
        terrain = argv[argv.index("--terrain") + 1]
    return raw, terrain


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    ti, tj, out = int(argv[0]), int(argv[1]), argv[2]
    raw, terrain = paths_from(argv)
    return build(ti, tj, out, raw, terrain)


if __name__ == "__main__":
    main()
