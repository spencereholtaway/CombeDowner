"""Build every square of a map as a partition, and report what the city came to.

Usage: python3 -I tools/partition/city.py [--map id] [--only ti,tj ti,tj ...] [--jobs n] [--all] [--out dir]
                                           [--once dir] [--raw dir] [--terrain dir]

`--all` builds every square that reaches the wide force field's data circle (131 of them for
Combe Down); `--only 1,1 0,3` builds just those; both together are taken as `--only`. Without
either, every square is built, as `--all` does.

The three passes run in order, each timed as it goes, and `--once` is the one folder they both write
and read (`out/once-p1` by default): pass 1 fits every street edge once (`corridors.json`), pass 2
divides every worked block once (`blocks.json`), and then each square assembles from those and its
eight neighbours'. A pass is skipped when its output is already there and covers the squares being
built, so a second run does not repeat the expensive part; `--force-passes` runs them anyway.

The squares are built in parallel with a *process* pool, not threads: the build is pure Python plus
shapely, so the work holds the GIL and threads would gain nothing (this is what `times.py` and
`prep_tiles.py` decide differently - they are mostly waiting on files). Each square writes its own
`partition.json`, `render.svg`, `evidence.svg`, `current.svg`, `metrics.json`, `checks.json` and
`boundary.json` into `<out>/<ti>_<tj>/`, exactly as one square built on its own does.

Then the city-wide things, which only make sense across squares:
- **the summary**: one row per square, and the totals, written to `<out>/summary.json` and printed.
- **the neighbour check**: every pair of squares that share an edge, their partitions compared
  along it (checks.edges_agree). The squares each work their own 40 m margin, so both see the same
  ground either side of the shared edge and must cut it the same way; the plan's tolerance is 1 cm.
- **the held-out widths**: every street with a width tag, fitted with the tag hidden, over the whole
  city. A square only reports the streets inside it, so a street crossing a square's edge is
  reported once, by the square holding its middle.
- **the data findings**: every check's lines, with square and position, so the co-developer can look at them in
  the game.

A square that fails is reported and the run carries on: one bad square in 131 should not lose the
other 130, and the failures are part of what the run is for.
"""
import argparse
import collections
import json
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from partition import MAP, MARGIN, Q, ROOT, checks
from partition.__main__ import build
from partition.data import neighbours
from area import area

A = area(MAP, wide=True)
SIZE = Q.dx * Q.cells


def squares():
    """Every square reaching the wide force field's data circle, as (ti, tj) in a fixed order."""
    fcx, fcy = A.field_centre
    R = A.half
    circle_r2 = R * R
    out = []
    for ti in range(math.floor((fcx - R - Q.x0) / SIZE), math.floor((fcx + R - Q.x0) / SIZE) + 1):
        for tj in range(math.floor((fcy - R - Q.y0) / SIZE), math.floor((fcy + R - Q.y0) / SIZE) + 1):
            x0, y0 = Q.x0 + ti * SIZE, Q.y0 + tj * SIZE
            cx = min(max(fcx, x0), x0 + SIZE)
            cy = min(max(fcy, y0), y0 + SIZE)
            if (cx - fcx) ** 2 + (cy - fcy) ** 2 <= circle_r2:
                out.append((ti, tj))
    return out


def box_of(ti, tj):
    return (Q.x0 + ti * SIZE, Q.y0 + tj * SIZE, Q.x0 + (ti + 1) * SIZE, Q.y0 + (tj + 1) * SIZE)


def one(job):
    """Build one square (the process pool's unit of work). Returns a small dict, not the metrics:
    the full record is on disk, and only the summary needs to come back."""
    ti, tj, out, raw, terrain, once = job
    t = time.time()
    try:
        m = build(ti, tj, os.path.join(out, f"{ti}_{tj}"), raw, terrain, log=lambda *_: None,
                  once=once)
    except Exception as exc:                      # a square that fails is data, not the whole run
        return dict(square=[ti, tj], failed=f"{type(exc).__name__}: {exc}", secs=round(time.time() - t, 1))
    return dict(square=[ti, tj], secs=round(time.time() - t, 1), metrics=m)


def held_out(rows):
    """The city-wide held-out width test: every tagged street's width against the width fitted with
    the tag hidden.

    Each square already reports only the streets whose tagged stretch's middle lies inside it
    (`once.read_held_out`), and a stretch's middle is in exactly one square, so the rows are
    concatenated as they come: a street crossing a square's edge is counted once. (An earlier version
    deduplicated by name and width here, which also merged two distinct stretches of one street that
    happened to fit the same width.)"""
    out = []
    for r in rows:
        if "metrics" not in r:
            continue
        ti, tj = r["square"]
        for h in r["metrics"].get("held_out", []):
            out.append(dict(square=[ti, tj], name=h["name"], tagged=h["tagged"], fitted=h["fitted"]))
    return out


def run_passes(wanted, once_dir, raw, jobs, force=False, log=print, terrain=None):
    """Passes 1 and 2, in order, each timed, into the folder the squares then read.

    The passes are the build now: a square assembles from what they wrote and builds no ground of its
    own, so a city run that did not run them could not run at all. They live here rather than in a
    script beside the output because `out/` is ignored - a runner kept there is a runner nobody else
    has, and the repo could not reproduce a city run.

    Pass 1 is the street graph, built once for the whole map and then fitted edge by edge, followed by
    the one global step that gives every edge its height and its bridges and tunnels; pass 2
    divides every worked block once. Both are pools over the owning squares, so `jobs` is theirs too.
    A pass whose output is already there and covers the squares being built is skipped, so a second
    run does not repeat ten minutes of work; `force` runs them anyway."""
    from partition import once as build_once

    os.makedirs(once_dir, exist_ok=True)
    need = set()
    for ti, tj in wanted:
        for a, b in neighbours(ti, tj):
            need.add((a, b))
    have_cor = {tuple(int(v) for v in d.split("_"))
                for d in os.listdir(once_dir)
                if os.path.isdir(os.path.join(once_dir, d)) and "_" in d} \
        if os.path.isdir(once_dir) else set()

    t = time.time()
    if force or not os.path.exists(os.path.join(once_dir, "graph.json")):
        build_once.build_graph(once_dir, raw, log=log)
        log(f"  pass 1: the street graph in {time.time() - t:.0f}s")
    t = time.time()
    refit = force or not need <= have_cor
    if refit:
        done, failed = build_once.pass_streets(once_dir, raw, jobs=jobs, log=log)
        log(f"  pass 1: {len(done)} squares fitted, {len(failed)} failed, {time.time() - t:.0f}s")
    else:
        log(f"  pass 1: already in {once_dir}, skipping (use --force-passes to rerun)")
    t = time.time()
    if refit or not os.path.exists(build_once.structures_path(once_dir)):
        build_once.pass_structures(once_dir, raw, terrain or os.path.join(raw, "terrain15"), log=log)
        log(f"  pass 1: bridges, tunnels and road heights in {time.time() - t:.0f}s")
    else:
        log(f"  pass 1: structures already in {once_dir}, skipping")
    t = time.time()
    if force or not os.path.exists(os.path.join(once_dir, "blocks.json")):
        done, failed = build_once.pass_blocks(once_dir, raw, jobs=jobs, log=log)
        log(f"  pass 2: {len(done)} squares divided, {len(failed)} failed, {time.time() - t:.0f}s")
    else:
        log(f"  pass 2: already in {once_dir}, skipping (use --force-passes to rerun)")
    return once_dir


def resolve_fragments(rows, out, raw=None, terrain=None, once=None, log=print):
    """The city-wide resolution of the deferred plot fragments, after every square is built.

    A square holds plot fragments whose house is outside its own worked area - the plot reaches in
    from next door - and it does not judge those, because it has no house here and so no opening
    could have been recorded. It writes them to `<out>/<ti>_<tj>/fragments.json` with the square it
    defers to, and this resolves them once the whole city's openings are known:

    - the holder square must have recorded an opening for that building index (its plot is gated
      there), and then the fragment is fine;
    - if the holder recorded nothing, or no square holds the house at all, the plot has no way in
      anywhere and that is a finding, on the fragment's square, under the same rule name.

    The rule itself lives in `checks.resolve_fragments`, so there is one implementation of it rather
    than a copy here: the holder square **specifically** must have recorded the opening, not just any
    square that gated a plot with the same building index.

    A holder can lie **outside the squares the run builds** - the built set is the data circle, and a
    fragment's house can be in a margin square beyond it (measured: one such holder, (-6,6)). That
    square has no `fragments.json` because it was never built, and its gates exist nowhere in what the
    run wrote, so reading only the built folders reported its fragments as having no way in when they
    are gated. Those holders are built here, once each, for the check alone: their openings are the
    only thing wanted, and nothing they write is shipped.

    Returns (the findings, how many fragments were deferred, how many the holders resolved)."""
    gated_by = {}
    deferred = []
    for r in rows:
        if "metrics" not in r:
            continue
        ti, tj = r["square"]
        p = os.path.join(out, f"{ti}_{tj}", "fragments.json")
        if not os.path.exists(p):
            continue
        d = json.load(open(p))
        for b in d.get("gated", []):
            gated_by.setdefault(b, set()).add((ti, tj))
        for f in d.get("deferred", []):
            holder = f.get("holder")
            deferred.append(((ti, tj), f["building"],
                             None if holder is None else tuple(holder)))

    # A holder that was never built has no record of its openings, so its fragments would be reported
    # as having no way in when they are gated. Build each such holder once - into its own folder - and
    # read what it gated. Only its openings are wanted, and nothing of it is shipped.
    built = {tuple(r["square"]) for r in rows if "metrics" in r}
    outside = sorted({h for _s, _b, h in deferred if h is not None and h not in built})
    for h in outside:
        try:
            build(h[0], h[1], os.path.join(out, f"{h[0]}_{h[1]}"), raw, terrain,
                  log=lambda *_: None, once=once)
        except Exception as exc:
            log(f"  fragments: the holder {h[0]},{h[1]} could not be built "
                f"({type(exc).__name__}: {exc}); its fragments are reported as unresolved")
            continue
        p = os.path.join(out, f"{h[0]}_{h[1]}", "fragments.json")
        if os.path.exists(p):
            for b in json.load(open(p)).get("gated", []):
                gated_by.setdefault(b, set()).add(h)
        log(f"  fragments: built the holder {h[0]},{h[1]} to resolve its fragments "
            f"(it is outside the run's squares)")

    out_rows = checks.resolve_fragments(deferred, gated_by)
    resolved = len(deferred) - len(out_rows)
    if deferred:
        log(f"  deferred fragments: {len(deferred)}; resolved by the square holding the house: "
            f"{resolved}; unresolved: {len(out_rows)}")
    return out_rows, len(deferred), resolved


def neighbour_check(rows, tol=checks.AGREE_TOL):
    """Every shared edge of neighbouring squares, compared along the edge and along lines parallel to
    it inside each margin. Returns (worst mismatch, total positions without a partner, the number of
    shared edges, the number of sample lines compared, and one record per line that disagrees).

    An *edge* is one pair of squares meeting along one side; a *sample line* is one offset on it. The
    two are counted apart because they are different things: one shared edge is sampled on up to
    eight lines (four offsets outwards and four inwards, each in both squares), so a count of lines
    is not a count of edges."""
    # the boundary files are read here rather than carried back through the pool: they are small and
    # this keeps the pool's return values to the summary
    edges = {}
    for r in rows:
        if "metrics" not in r:
            continue
        ti, tj = r["square"]
        p = os.path.join(OUT, f"{ti}_{tj}", "boundary.json")
        if os.path.exists(p):
            edges[(ti, tj)] = json.load(open(p))["edges"]

    pairs, shared = [], set()
    for (ti, tj), mine in sorted(edges.items()):
        # east neighbour: its west edge against this square's east. Both edges share one normal
        # (`edge_profile` gives every side the +x or +y normal), so the same offset names the same
        # physical line on both - "east@10" pairs with "west@10". Pairing opposite signs instead
        # compares x+10 against x-10 and reports every span as a mismatch.
        right = edges.get((ti + 1, tj))
        if right:
            shared.add(f"{ti}_{tj}|{ti + 1}_{tj}")
            for off in (0.0, 10.0, 20.0, 30.0):
                a = mine.get(f"east@{off:g}")
                b = right.get(f"west@{off:g}")
                if a is not None and b is not None:
                    pairs.append((f"{ti}_{tj}|{ti + 1}_{tj}", f"east {off:g}m", a, b))
        up = edges.get((ti, tj + 1))
        if up:
            shared.add(f"{ti}_{tj}|{ti}_{tj + 1}")
            for off in (0.0, 10.0, 20.0, 30.0):
                a = mine.get(f"north@{off:g}")
                b = up.get(f"south@{off:g}")
                if a is not None and b is not None:
                    pairs.append((f"{ti}_{tj}|{ti}_{tj + 1}", f"north {off:g}m", a, b))

    worst_all, missing_all, bad = 0.0, 0, []
    for name, side, mine, theirs in pairs:
        worst, missing, lonely = checks.edges_agree(mine, theirs, tol)
        worst_all = max(worst_all, worst)
        missing_all += missing
        if missing:
            bad.append(dict(pair=name, side=side, worst=worst, without_partner=missing,
                            positions=lonely[:20]))
    return round(worst_all, 4), missing_all, len(shared), len(pairs), bad


def main(argv=None):
    global OUT
    ap = argparse.ArgumentParser(description="build every square of the map as a partition")
    ap.add_argument("--only", nargs="*", default=None, metavar="ti,tj",
                    help="build only these squares, e.g. --only 1,1 0,3")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--all", action="store_true", help="every square reaching the data circle")
    ap.add_argument("--out", default=os.path.join(ROOT, "out", "city"))
    ap.add_argument("--once", default=os.path.join(ROOT, "out", "once-p1"),
                    help="the folder passes 1 and 2 write and the squares read (out/once-p1)")
    ap.add_argument("--force-passes", action="store_true",
                    help="run passes 1 and 2 even where their output is already there")
    ap.add_argument("--map", default=MAP, help="the map (read before the imports, as CD_MAP is)")
    ap.add_argument("--raw", default=os.path.join(ROOT, "data", "raw", MAP, "wide"))
    ap.add_argument("--terrain", default=None)
    a = ap.parse_args(argv)

    terrain = a.terrain or os.path.join(a.raw, "terrain15")
    OUT = a.out
    os.makedirs(OUT, exist_ok=True)
    wanted = squares()
    if a.only:
        only = [tuple(int(v) for v in s.split(",")) for s in a.only]
        wanted = [t for t in wanted if t in set(only)] or only
    print(f"{len(wanted)} squares of {MAP}, {a.jobs} at a time, into {OUT}", flush=True)
    run_passes(wanted, a.once, a.raw, a.jobs, force=a.force_passes, log=print, terrain=terrain)

    start = time.time()
    jobs = [(ti, tj, OUT, a.raw, terrain, a.once) for ti, tj in wanted]
    rows = []
    with ProcessPoolExecutor(a.jobs) as pool:
        # the busiest squares start first, so the pool doesn't end waiting on one; rows come back in
        # square order whatever order they ran in
        def load(job):
            ti, tj = job[0], job[1]
            return sum(os.path.getsize(p) for a_, b_ in neighbours(ti, tj)
                       for p in (os.path.join(a.once, f"{a_}_{b_}", "blocks.json"),)
                       if os.path.exists(p))
        futures = {}
        for k in sorted(range(len(jobs)), key=lambda k: -load(jobs[k])):
            futures[k] = pool.submit(one, jobs[k])
        for n, r in enumerate((futures[k].result() for k in range(len(jobs))), 1):
            rows.append(r)
            if "failed" in r:
                print(f"[{n}/{len(jobs)}] {r['square'][0]}_{r['square'][1]} FAILED "
                      f"({r['failed']})", flush=True)
            else:
                m = r["metrics"]
                print(f"[{n}/{len(jobs)}] {r['square'][0]}_{r['square'][1]} "
                      f"{r['secs']:.0f}s loose {m['plot_edges_loose_ends_inside']} "
                      f"unc {m['surface_uncovered_m2']} ev "
                      f"{(m['plot_edge_support_mean'] or 0) * 100:.0f}% "
                      f"checks {sum(m['data_checks'].values())}", flush=True)

    summary = summarise(rows, OUT, a.raw, terrain, a.once, start)
    if summary["failed"]:
        sys.exit(1)
    return summary


def summarise(rows, out, raw, terrain, once, start):
    """The city summary from every square's report: the checks, the held-out widths, the
    neighbour check and the deferred fragments, written to `out`."""
    global OUT
    OUT = out
    good = [r for r in rows if "metrics" in r]
    failed = [r for r in rows if "failed" in r]

    # ---- the city summary ------------------------------------------------------------------------
    checks_all = collections.Counter()
    rows_checks = []
    for r in good:
        for c in r["metrics"].get("data_check_list", []):
            checks_all[c["rule"]] += 1
            rows_checks.append(c)

    widths = held_out(rows)
    errs = sorted(abs(w["fitted"] - w["tagged"]) for w in widths)
    med = errs[len(errs) // 2] if errs else None
    within = sum(1 for e in errs if e <= 1.0)
    worst_sq = sorted(good, key=lambda r: (r["metrics"]["plot_edges_loose_ends_inside"],
                                           -r["metrics"]["surface_uncovered_m2"]))[:10]
    worst_list = [[r["square"][0], r["square"][1]] for r in worst_sq]

    worst_agree, missing_agree, n_edges, n_lines, bad_agree = neighbour_check(rows)
    frag_fails, n_deferred, n_resolved = resolve_fragments(rows, out, raw, terrain,
                                                            once)
    # the unresolved fragments are findings on the square that held the fragment, under the same rule
    # name, so they join the checks and the failure count exactly as a square's own failures do
    rows_checks += frag_fails
    for c in frag_fails:
        checks_all[c["rule"]] += 1
    json.dump(rows_checks, open(os.path.join(out, "checks.json"), "w"), indent=1)
    frag_by_square = collections.Counter(tuple(c["square"]) for c in frag_fails)

    summary = dict(
        map=MAP, squares=len(rows), built=len(good), failed=[r["square"] for r in failed],
        secs=round(time.time() - start, 1),
        loose_ends_inside=sum(r["metrics"]["plot_edges_loose_ends_inside"] for r in good),
        uncovered_m2=round(sum(r["metrics"]["surface_uncovered_m2"] for r in good), 1),
        overlap_m2=round(sum(r["metrics"]["surface_overlap_m2"] for r in good), 1),
        # a square with no plot edges has no share to average (`plot_edge_support_mean` is None), and
        # there are such squares - open country with no worked block. They are left out of the mean
        # rather than counted as zero, which would pull the city figure down for ground that draws
        # nothing.
        evidence_share=(round(sum(r["metrics"]["plot_edge_support_mean"] for r in good
                                  if r["metrics"]["plot_edge_support_mean"] is not None)
                              / max(sum(1 for r in good
                                        if r["metrics"]["plot_edge_support_mean"] is not None), 1),
                              4) if good else None),
        # the same share weighted by plot-edge length. The unweighted mean above is kept so earlier
        # figures stay comparable, but it lets a square drawing one short edge count as much as one
        # drawing four thousand - so a city figure can move with the ground unchanged (measured: it
        # fell 62.7% -> 58.1% while the length-weighted share rose 61.4% -> 62.1%, when a fix stopped
        # drawing the same boundary twice).
        evidence_share_length_weighted=(
            round(sum(r["metrics"].get("plot_edge_evidence_length", 0.0) for r in good)
                  / max(sum(r["metrics"].get("plot_edge_length", 0.0) for r in good), 1e-9), 4)
            if good else None),
        openings=sum(r["metrics"]["openings"]["openings"] for r in good),
        opening_failures=sum(r["metrics"]["opening_failures"] for r in good) + len(frag_fails),
        fragments_deferred=n_deferred, fragments_resolved=n_resolved,
        fragments_unresolved=len(frag_fails),
        # the scope proof: if every square judges exactly the plot ground it ships, these are equal.
        # A difference means some ground is judged twice or not at all.
        shipped_plot_area_m2=round(sum(r["metrics"].get("shipped_plot_area_m2", 0.0)
                                       for r in good), 3),
        judged_plot_area_m2=round(sum(r["metrics"].get("judged_plot_area_m2", 0.0)
                                      for r in good), 3),
        plots_in_margin=sum(r["metrics"].get("plots_in_margin", 0) for r in good),
        data_checks=dict(checks_all),
        held_out_widths=len(widths), held_out_within_1m=within,
        held_out_median_error=round(med, 3) if med is not None else None,
        neighbour_edges=n_edges, neighbour_lines=n_lines, neighbour_worst_mismatch=worst_agree,
        neighbour_positions_without_partner=missing_agree,
        neighbour_disagreeing=bad_agree[:20],
        worst_squares=worst_list,
    )
    json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=1)
    json.dump(widths, open(os.path.join(out, "held-out.json"), "w"), indent=1)

    print()
    print(f"built {len(good)} of {len(rows)} squares in {summary['secs']:.0f}s"
          + (f"; {len(failed)} failed" if failed else ""))
    if good:
        print(f"loose ends inside {summary['loose_ends_inside']}  "
              f"uncovered {summary['uncovered_m2']} m2  overlap {summary['overlap_m2']} m2  "
              f"evidence {summary['evidence_share'] * 100:.1f}% (by length "
              f"{summary['evidence_share_length_weighted'] * 100:.1f}%)  "
              f"openings {summary['openings']} "
              f"(failing {summary['opening_failures']})")
    print(f"held-out widths {within} of {len(widths)} within 1 m"
          + (f", median {med:.2f} m" if med is not None else ""))
    print(f"neighbours: {n_edges} shared edges sampled on {n_lines} lines, worst mismatch "
          f"{worst_agree} m, {missing_agree} positions without a partner")
    ship_a = summary["shipped_plot_area_m2"]
    judge_a = summary["judged_plot_area_m2"]
    print(f"scope: shipped plot area {ship_a:.1f} m2, judged {judge_a:.1f} m2, "
          f"difference {ship_a - judge_a:+.3f} m2 "
          f"({100 * abs(ship_a - judge_a) / max(ship_a, 1e-9):.5f}%)")
    print(f"fragments: {n_deferred} deferred, {n_resolved} resolved by the holder square, "
          f"{len(frag_fails)} unresolved")
    if checks_all:
        print("data findings: " + ", ".join(f"{k} {v}" for k, v in checks_all.most_common()))
    print(f"written to {out}: summary.json, checks.json, held-out.json")
    if len(good):
        print(f"worst squares: {' '.join(f'{a}_{b}' for a, b in worst_list)}")
    return summary


if __name__ == "__main__":
    main()
