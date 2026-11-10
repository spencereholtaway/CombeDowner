"""Run check_tile's three checks over every written square, and report the city's totals.

Usage: python3 -I tools/partition/check_city.py <tiles dir> [--city dir] [--jobs n]

The three checks are the stage-4 gate for one square; this runs them on the whole set, so a defect
that is rare per square but certain somewhere in 122 of them is found before the co-developer walks it, not after.
`check_tile.py` prints per square and is meant to be read; this aggregates and lists the worst.

The same three rules:
  1. every `gt` gap lies on a `br` run, or at its end;
  2. no `br` run crosses a carriageway by more than half a metre;
  3. every `fp` ends inside a plot.
"""
import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree
import numpy as np

# `check_tile`'s own tolerances, imported rather than restated: an aggregator that measures a rule
# slightly differently from the per-square check is worse than no aggregator, because the two
# disagree and neither is obviously right. (It happened: this file first tested *both* ends of an fp
# with no tolerance, and reported 870 findings city-wide where the real rule reports far fewer.)
from partition.check_tile import (CROSS_MIN, TOL_PLOT, carriageway_faces, gate_findings,
                                  interior_length)


def check_one(job):
    """One square's three counts. Errors are returned, not raised: one bad square must not lose the
    other 121."""
    path, city, sq = job
    ti, tj = sq
    try:
        tile = json.load(open(path))
        part = json.load(open(os.path.join(city, f"{ti}_{tj}", "partition.json")))
    except Exception as e:
        return dict(square=sq, failed=f"{type(e).__name__}: {e}")
    br = [LineString([(p[0], p[1]) for p in b["p"]]) for b in tile.get("br") or []]
    bt = STRtree(br) if br else None

    off_run = len(gate_findings(tile, br))

    # the carriageway's **interior**, built from the partition's own faces rather than from `rd`: see
    # `check_tile.interior_length` for why both halves of that matter
    car = carriageway_faces(part)
    ct = STRtree(car) if car else None
    crossing = 0
    worst = 0.0
    metres = 0.0
    for run in br:
        if ct is None:
            break
        length = interior_length(run, car, ct)
        if length > CROSS_MIN:
            crossing += 1
            metres += length
            worst = max(worst, length)

    plots = [Polygon(f["xy"]) for f in part["faces"] if f["cls"] == "plot" and len(f["xy"]) > 2]
    pt = STRtree(plots) if plots else None
    outside = 0
    for p in tile.get("fp") or []:
        end = Point(p[2], p[3])         # the far end: the gate end is on the plot's edge by design
        ok = pt is not None and any(
            plots[int(k)].buffer(TOL_PLOT).contains(end)
            for k in np.atleast_1d(pt.query(end.buffer(TOL_PLOT))))
        if not ok:
            outside += 1

    return dict(square=sq, runs=len(br), gaps=len(tile.get("gt") or []),
                paths=len(tile.get("fp") or []), off_run=off_run,
                crossing=crossing, worst_crossing=round(worst, 2),
                cross_metres=round(metres, 1), outside=outside)


def main(argv):
    tiles = argv[0]
    city = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "out", "city-tile")
    jobs = os.cpu_count() or 4
    for flag in ("--city", "--jobs"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--city":
                city = v
            else:
                jobs = int(v)
    names = sorted(n for n in os.listdir(tiles)
                   if n.endswith(".json") and n not in ("written.json", "checked.json"))
    todo = []
    for n in names:
        ti, tj = (int(v) for v in n[:-5].split("_"))
        todo.append((os.path.join(tiles, n), city, (ti, tj)))
    print(f"checking {len(todo)} squares, {jobs} at a time", flush=True)

    rows = []
    with ProcessPoolExecutor(jobs) as pool:
        for r in pool.map(check_one, todo):
            rows.append(r)
    ok = [r for r in rows if "failed" not in r]
    bad = [r for r in rows if "failed" in r]

    print(f"\n{len(ok)} checked, {len(bad)} could not be read")
    for r in bad[:5]:
        print(f"  {r['square'][0]}_{r['square'][1]}: {r['failed']}")
    print()
    print(f"  br runs                     {sum(r['runs'] for r in ok):>8,}")
    print(f"  gt gaps                     {sum(r['gaps'] for r in ok):>8,}")
    print(f"  fp paths                    {sum(r['paths'] for r in ok):>8,}")
    print(f"  gt NOT on a br run or end   {sum(r['off_run'] for r in ok):>8,}")
    print(f"  br runs in a carriageway    {sum(r['crossing'] for r in ok):>8,}"
          f"  ({sum(r['cross_metres'] for r in ok):,.0f} m)")
    print(f"  fp ending outside a plot    {sum(r['outside'] for r in ok):>8,}")
    for key, label in (("off_run", "gt off a run"), ("crossing", "br crossing a carriageway"),
                       ("outside", "fp outside a plot")):
        hit = sorted((r for r in ok if r[key]), key=lambda r: -r[key])
        if hit:
            print(f"\n  squares with {label}: {len(hit)}")
            for r in hit[:6]:
                print(f"    {r['square'][0]}_{r['square'][1]}: {r[key]}")
    summary = dict(checked=len(ok), unreadable=bad, rows=rows)
    with open(os.path.join(tiles, "checked.json"), "w") as f:
        json.dump(summary, f)


if __name__ == "__main__":
    main(sys.argv[1:])
