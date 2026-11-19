"""Is each written square's ground watertight: every bit of it drawn once, by one thing, at one height?

Usage: python3 -I tools/partition/watertight.py <tiles dir> [--city dir] [--only ti,tj ...] [--jobs n]
                                                [--json out.json]

The partition cuts each square into faces that meet edge to edge, so the drawn map can too. This
measures, in square metres per square and over the city, where it doesn't:

  - **gap**, **overlap**: the partition's own faces leaving part of the square uncovered, or covering
    it twice. Everything below assumes these are nought;
  - **street missing**, **street extra**: the street faces the game draws (`sf`) against the
    partition's carriageways and pavements, bridges left out. Missing shows as grass in the road,
    extra as street over a garden;
  - **doubled**: faces drawn twice over, street, path or drive;
  - **strip on street**: (a square written before paths had faces) a path, front path or drive drawn
    as a strip lying on a street face: two surfaces in one place, flickering or showing an edge;
  - **path not drawn**: the partition's path faces that nothing drawn covers, where the partition
    says path and the player sees grass;
  - **trees on street**, **shrubs on street**: trees and shrubs standing on a street face;
  - on a square whose bridges' decks are a level of faces of their own (`sf.lv`), level by level:
    **deck uncovered**, the decks' footprint (out to their parapets, a set piece's own aside) that
    the level leaves undrawn; **deck doubled**, that level drawn twice over; and **cap unshared**,
    metres of a deck's end where it meets the faces below without sharing their corners there
    (a crack between the two levels). The level below is measured as every square's is.

It reports only. Run it before and after a change to the writer or the game's ground, and don't let
the numbers go up.
"""
import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition import ROOT, Q, face_shape
from partition.write_tile import CAP_SNAP, GAME_PATHS, LV_LISTS, bridge_decks, cap_lines, deck_runs, unpack_surfaces

# The game's widths, as world.ts has them: a road without its own `w`, a front path and a drive.
RW = {"trunk": 9, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 6, "footway": 1.6, "steps": 1.8,
      "cycleway": 2, "path": 1.4, "track": 2.8, "bridleway": 2}
FRONT_PATH = 0.55
DRIVE = 1.5
TINY = 0.05     # square metres: less than this is the simplifying, not a hole

FIELDS = ("gap", "overlap", "street_missing", "street_extra", "doubled", "strip_on_street",
          "path_not_drawn", "trees_on_street",
          "shrubs_on_street", "deck_uncovered", "deck_doubled", "cap_unshared")


def width(r):
    return r.get("w") or RW.get(r["c"], 4)


def strip(p, half):
    pts = [q[:2] for q in p]
    if len(pts) < 2 or half <= 0:
        return None
    return LineString(pts).buffer(half, cap_style="flat")


def union(gs):
    gs = [g for g in gs if g is not None and not g.is_empty]
    return unary_union(gs) if gs else Polygon()


def drawn(sf, kinds):
    """The faces of those kinds as one shape, and how much of every face is drawn twice."""
    if not sf:
        return Polygon(), 0.0
    v = sf["v"]
    tris = {}
    for kind in ("road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"):
        ids = sf.get(kind) or []
        tris[kind] = [t for t in (Polygon([(v[3 * i], v[3 * i + 1]) for i in ids[k:k + 3]])
                                  for k in range(0, len(ids) - 2, 3)) if t.area > 0]
    every = [t for ts in tris.values() for t in ts]
    return union([t for k in kinds for t in tris[k]]), max(0.0, sum(t.area for t in every) - union(every).area)


def _tris(v, ids):
    return [t for t in (Polygon([(v[3 * i], v[3 * i + 1]) for i in ids[k:k + 3]]) for k in range(0, len(ids) - 2, 3)) if t.area > 0]


def deck_levels(tile, sq):
    """The decks' levels of faces (`sf.lv`) against the decks they draw: per level, the footprint left
    undrawn and what is drawn twice (m2), and the length of cap (m) where a deck meets the faces of
    the level below without sharing their corners. None for a square without levels."""
    sf = unpack_surfaces(tile.get("sf"))
    if not sf or not sf.get("lv"):
        return None
    v, square = sf["v"], box(*sq)
    rd = [r for r in tile.get("rd") or [] if len(r["p"]) > 1]
    runs = deck_runs(rd, tile.get("se"))
    over = bridge_decks(rd)
    caps = cap_lines(runs, over) if over is not None else []
    cap_zone = union([c[0] for c in caps]).buffer(CAP_SNAP)
    foot = bridge_decks([r for r in rd if not r.get("held")], past_cut=square)
    foot = foot.intersection(square) if foot is not None else Polygon()
    # (what a set piece took out of the faces is the set piece's to draw, on either level)
    if tile.get("centre") and not foot.is_empty:
        from partition import setpiece_cuts
        gone = setpiece_cuts.cuts(tile["centre"], sq, None, rd)[0]
        if gone is not None:
            foot = foot.difference(gone)
    solid = union([Polygon(b["r"][0], b["r"][1:]).buffer(0) for b in tile.get("bl") or [] if len(b["r"][0]) >= 3])
    below = union([t for k in ("road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel")
                   for t in _tris(v, sf.get(k) or [])])
    edges_below = {(a, b) for e in sf["e"] for a, b in zip(e["i"], e["i"][1:])}
    out = dict(deck_uncovered=0.0, deck_doubled=0.0, cap_unshared=0.0)
    for lv in sf["lv"]:
        tris = [t for k in LV_LISTS for t in _tris(v, lv.get(k) or [])]
        drawn_lv = union(tris)
        out["deck_doubled"] += max(0.0, sum(t.area for t in tris) - drawn_lv.area)
        out["deck_uncovered"] += foot.difference(drawn_lv).difference(solid).area
        for e in lv["e"]:
            for a, b in zip(e["i"], e["i"][1:]):
                pa, pb = (v[3 * a], v[3 * a + 1]), (v[3 * b], v[3 * b + 1])
                if (b, a) in edges_below or not (cap_zone.contains(Point(pa)) and cap_zone.contains(Point(pb))):
                    continue
                L = math.dist(pa, pb)
                if L < 1e-6:
                    continue
                # (the faces lie on the left of an outline: across the cap is its right)
                mx, my = (pa[0] + pb[0]) / 2 + (pb[1] - pa[1]) / L * 0.05, (pa[1] + pb[1]) / 2 - (pb[0] - pa[0]) / L * 0.05
                if below.contains(Point(mx, my)):
                    out["cap_unshared"] += L
    return out


def measure(tile, part, sq):
    square = box(*sq)
    out = dict.fromkeys(FIELDS, 0.0)

    faces = [(f["cls"], face_shape(f).buffer(0)) for f in part["faces"] if len(f["xy"]) > 2]
    inside = [g.intersection(square) for _, g in faces]
    covered = union(inside)
    out["gap"] = square.area - covered.area
    out["overlap"] = max(0.0, sum(g.area for g in inside) - covered.area)

    rd = tile.get("rd") or []
    streets = union([g for c, g in faces if c in ("carriageway", "pavement")]).intersection(square)
    deck = bridge_decks(rd)
    if deck is not None:
        streets = streets.difference(deck)
    sf = unpack_surfaces(tile.get("sf"))
    on_street, doubled = drawn(sf, ("road", "service", "pave"))
    # a square's paving is laid on the ground as a drive is, so a drive face on a street face is street
    on_street = on_street.union(drawn(sf, ("drive",))[0].intersection(streets)).intersection(square)
    out["street_missing"] = streets.difference(on_street).area
    out["street_extra"] = on_street.difference(streets).area
    out["doubled"] = doubled

    path_faces = union([g for c, g in faces if c == "path"]).intersection(square)
    if deck is not None:
        path_faces = path_faces.difference(deck)
    if sf and "path" in sf:
        out["path_not_drawn"] = path_faces.difference(drawn(sf, ("path", "grass", "dirt", "gravel"))[0]).area
    else:
        paths = [r for r in rd if r["c"] in GAME_PATHS]
        strips = union([strip(r["p"], width(r) / 2) for r in paths]
                       + [strip([f[:2], f[2:4]], FRONT_PATH) for f in tile.get("fp") or []]
                       + [strip([d[:2], d[2:4]], DRIVE) for d in tile.get("dv") or []])
        out["strip_on_street"] = strips.intersection(on_street).area
        out["path_not_drawn"] = path_faces.difference(strips).area

    drawn_here = on_street
    if not drawn_here.is_empty:
        parts = list(getattr(drawn_here, "geoms", [drawn_here]))
        tree = STRtree(parts)
        on = lambda x, y: len(tree.query(Point(x, y), predicate="intersects")) > 0
        out["trees_on_street"] = sum(1 for t in tile.get("tr") or [] if on(t[0], t[1]))
        out["shrubs_on_street"] = sum(1 for s in tile.get("sb") or [] if on(s[0], s[1]))
    out.update(deck_levels(tile, sq) or {})
    return {k: (round(v, 1) if isinstance(v, float) else v) for k, v in out.items()}


def square_box(ti, tj):
    size = Q.dx * Q.cells
    return (Q.x0 + ti * size, Q.y0 + tj * size, Q.x0 + (ti + 1) * size, Q.y0 + (tj + 1) * size)


def check_one(job):
    path, city, ti, tj = job
    try:
        tile = json.load(open(path))
        part = json.load(open(os.path.join(city, f"{ti}_{tj}", "partition.json")))
        return dict(square=[ti, tj], **measure(tile, part, square_box(ti, tj)))
    except Exception as e:
        return dict(square=[ti, tj], failed=f"{type(e).__name__}: {e}")


def main(argv):
    tiles = argv[0]
    city = os.path.join(ROOT, "out", "city")
    jobs, only, dump = os.cpu_count() or 4, None, None
    if "--city" in argv:
        city = argv[argv.index("--city") + 1]
    if "--jobs" in argv:
        jobs = int(argv[argv.index("--jobs") + 1])
    if "--json" in argv:
        dump = argv[argv.index("--json") + 1]
    if "--only" in argv:
        k = argv.index("--only") + 1
        only = []
        while k < len(argv) and not argv[k].startswith("--"):
            only.append(tuple(int(n) for n in argv[k].split(",")))
            k += 1
    todo = []
    for name in sorted(os.listdir(tiles)):
        stem = name[:-5] if name.endswith(".json") else ""
        if stem.count("_") != 1:
            continue
        try:
            ti, tj = (int(n) for n in stem.split("_"))
        except ValueError:
            continue
        if (only is None or (ti, tj) in only) and os.path.exists(os.path.join(city, stem, "partition.json")):
            todo.append((os.path.join(tiles, name), city, ti, tj))
    with ProcessPoolExecutor(jobs) as pool:
        rows = list(pool.map(check_one, todo))
    ok = [r for r in rows if "failed" not in r]
    for r in rows:
        if "failed" in r:
            print(f"{r['square'][0]}_{r['square'][1]} FAILED {r['failed']}")
    print(f"{len(ok)} squares")
    for k in FIELDS:
        total = sum(r[k] for r in ok)
        worst = sorted(ok, key=lambda r: -r[k])[:3]
        unit = "" if k.endswith(("trees_on_street", "shrubs_on_street")) else " m" if k == "cap_unshared" else " m2"
        print(f"  {k.replace('_', ' '):20s} {total:12,.0f}{unit}   worst: "
              + ", ".join(f"{w['square'][0]}_{w['square'][1]} {w[k]:,.0f}" for w in worst if w[k]))
    if dump:
        json.dump(rows, open(dump, "w"))
    return rows


if __name__ == "__main__":
    main(sys.argv[1:])
