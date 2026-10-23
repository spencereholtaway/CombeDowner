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
  - **trees on street**, **shrubs on street**: trees and shrubs standing on a street face.

It reports only. Run it before and after a change to the writer or the game's ground, and don't let
the numbers go up.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition import ROOT, Q, face_shape
from partition.write_tile import GAME_PATHS, bridge_decks, unpack_surfaces

# The game's widths, as world.ts has them: a road without its own `w`, a front path and a drive.
RW = {"trunk": 9, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 6, "footway": 1.6, "steps": 1.8,
      "cycleway": 2, "path": 1.4, "track": 2.8, "bridleway": 2}
FRONT_PATH = 0.55
DRIVE = 1.5
TINY = 0.05     # square metres: less than this is the simplifying, not a hole

FIELDS = ("gap", "overlap", "street_missing", "street_extra", "doubled", "strip_on_street",
          "path_not_drawn", "trees_on_street",
          "shrubs_on_street")


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
    for kind in ("road", "service", "pave", "path", "front", "drive"):
        ids = sf.get(kind) or []
        tris[kind] = [t for t in (Polygon([(v[3 * i], v[3 * i + 1]) for i in ids[k:k + 3]])
                                  for k in range(0, len(ids) - 2, 3)) if t.area > 0]
    every = [t for ts in tris.values() for t in ts]
    return union([t for k in kinds for t in tris[k]]), max(0.0, sum(t.area for t in every) - union(every).area)


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
        out["path_not_drawn"] = path_faces.difference(drawn(sf, ("path",))[0]).area
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
        unit = "" if k.endswith(("trees_on_street", "shrubs_on_street")) else " m2"
        print(f"  {k.replace('_', ' '):20s} {total:12,.0f}{unit}   worst: "
              + ", ".join(f"{w['square'][0]}_{w['square'][1]} {w[k]:,.0f}" for w in worst if w[k]))
    if dump:
        json.dump(rows, open(dump, "w"))
    return rows


if __name__ == "__main__":
    main(sys.argv[1:])
