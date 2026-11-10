"""The partition's stages, each run only when what it is built from has changed.

Usage: python3 -I tools/partition/pipeline.py build <raw dir> <once dir> <city dir> <store> <jobs> <result.json> [ti,tj ...]
       python3 -I tools/partition/pipeline.py report <raw dir> <once dir> <city dir> <store> <jobs> [ti,tj ...]

`stage.py` runs it twice: `build` before the squares are written, and `report` after. The stages are
those of `city.py`, in the same order and with the same code, and each has its own key (`cache.py`):

- the street graph, from the roads and the bridges' segments;
- each square's corridors, from the graph and the buildings, barriers and lidar walls near its edges;
- the bridges and road heights, from the graph, the water, the terrain, the railway and the canal;
- the worked pieces and their parent blocks, from every square's corridors and the buildings;
- each square's division of its pieces, from its own pieces, the parent blocks, footprints and
  corridors near them, and the barriers, parcels and lidar walls in its window;
- each square's assembly, from its own and its eight neighbours' corridors and divisions, and the
  layers over its worked area;
- each square's writing (in `stage.py`), from its assembly and the corridors, road heights, footprints
  and parent blocks near it;
- each square's report (metrics, checks, fragments, edge profile), from its assembly, and then the
  city summary. Nothing in a report reaches the map, so a change to the checks redoes only this.

Given squares (the build's `--only`), it divides only the squares those gather from and assembles
only those; the city-wide stages are run or taken from the store as usual. The stages left out keep
whatever they had, under keys that no longer match, so the next whole build redoes them.

Nothing here is decided over the network: it is all build-time.
"""
import collections
import glob
import json
import os
import pickle
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from partition import MAP, ROOT, cache, once as O               # noqa: E402
from partition.data import neighbours                            # noqa: E402
from partition.corridors import REACH                             # noqa: E402
from partition.plots import FRONT_REACH                           # noqa: E402

ONCE = os.path.join(HERE, "once.py")
MAIN = os.path.join(HERE, "__main__.py")
PAD = max(REACH, 100.0)          # metres: more than any stage looks beyond its window
# metres round its square the writer reads the cleaned footprints and the parent blocks from: as far as
# `settle.owners_near` (150) and `write_tile.build_tile`'s `read_parents` (200) look
WRITE_REACH = 200.0


def name(t):
    return f"{t[0]}_{t[1]}"


def layer_file(raw, layer):
    p = os.path.join(raw, layer + ".geojson")
    return p if os.path.exists(p) else os.path.join(ROOT, "data", MAP, layer + ".geojson.xz")


class Run:
    """One run of the stages against a store, counting what it had to build."""

    def __init__(self, raw, once, city, store, jobs, log=print):
        self.raw, self.once, self.city, self.jobs, self.log = raw, once, city, jobs, log
        self.store = cache.Store(store)
        self.layers = cache.Layers(raw, store)
        self.lib = cache.libraries()
        self.ran = collections.Counter()
        self.weight = {}
        self.tally = {}

    def count(self, stage, keys, got, secs):
        """What `stage` took from the store and built, for `cache.txt`, and the digests of its outputs,
        for `stages.json`: a build checked against one from an empty store names the first stage
        whose outputs differ."""
        t = self.tally.setdefault(stage, dict(keys=[], secs=0.0, files={}))
        t["keys"] += keys
        t["secs"] += secs
        t["files"].update(got)

    def stage(self, stage, key, dest, names, run):
        """Outputs `names` (in `dest`) for `key`: from the store, or by `run()` and then stored."""
        t0 = time.time()
        got = self.store.get(stage, key, dest)
        if got is None:
            run()
            got = self.store.put(stage, key, dest, names)
            self.ran[stage] += 1
        self.count(stage, [key], got, time.time() - t0)
        return got

    def pool(self, stage, fn, tasks, keys, dest_of, names_of, run=None):
        """A pooled stage: each task's outputs from the store, or run in the pool and then stored.
        Returns {task square: {name: digest}} and the squares whose task failed."""
        t0 = time.time()
        out, todo = {}, []
        for t, k in zip(tasks, keys):
            got = self.store.get(stage, k, dest_of(t))
            if got is None:
                todo.append((t, k))
            else:
                out[(t[0], t[1])] = got
        failed = set()
        if todo:
            if run is not None:
                done, bad = run([t for t, _ in todo])
            else:
                done, bad = O._run_pool(fn, [t for t, _ in todo], self.jobs, self.log, stage,
                                        order=lambda t: -self.weight.get((t[0], t[1]), 0))
            failed = {(a, b) for a, b, _e in bad}
            for t, k in todo:
                if (t[0], t[1]) not in failed:
                    out[(t[0], t[1])] = self.store.put(stage, k, dest_of(t), names_of(t))
            self.ran[stage] += len(todo) - len(failed)
        self.count(stage, list(keys), {n: d for got in out.values() for n, d in got.items()},
                   time.time() - t0)
        return out, failed

    def write_tally(self, root):
        """One line a stage in `<root>/cache.txt`, and its outputs' digests in `<root>/stages.json`."""
        with open(os.path.join(root, "cache.txt"), "a") as f:
            for stage, t in self.tally.items():
                f.write(cache.tally_line(stage, t["keys"], len(t["keys"]) - self.ran[stage], self.ran[stage],
                                         t["secs"]) + "\n")
        cache.add_stages(root, {stage: t["files"] for stage, t in self.tally.items()})


def digest_of(files):
    return cache.sha("".join(f"{k}{v}" for k, v in sorted(files.items())))


def _grow(b, d):
    return (b[0] - d, b[1] - d, b[2] + d, b[3] + d)


def _meets(a, b):
    return a[2] >= b[0] and a[0] <= b[2] and a[3] >= b[1] and a[1] <= b[3]


class Slices:
    """The parts of the passes' city-wide files a window reads, as digests, so that a square's
    division and writing are keyed on what lies near them and not on the whole file: a street
    changed across the city leaves them as they were. Each part is taken as its reader takes it
    (the same order, the same window test, the same global numbering), or more."""

    def __init__(self, once):
        self.once = once
        self._got = {}

    def _load(self, what):
        """[(box, digest of the row, row id)] in file order."""
        if what not in self._got:
            row = lambda r: cache.sha(json.dumps(r))
            if what == "corridors":
                got = []
                for f in sorted(glob.glob(os.path.join(self.once, "*", "corridors.json"))):
                    for r in json.load(open(f)):
                        xs, ys = [q[0] for q in r["line"]], [q[1] for q in r["line"]]
                        got.append(((min(xs), min(ys), max(xs), max(ys)), row(r), r["id"]))
            elif what == "structures":
                got = {k: row(v) for k, v in O.read_structures(self.once).items()}
            elif what == "pieces":
                got = [row(r) for r in json.load(open(O.blocks_path(self.once)))]
            else:
                path, k = dict(cleaned=(O.cleaned_path, "b"), parents=(O.parents_path, "k"))[what]
                # a footprint's place in the whole list is the building's number everywhere
                got = [(r[k], row(r), i) for i, r in enumerate(json.load(open(path(self.once))))]
            self._got[what] = got
        return self._got[what]

    def _in(self, what, win):
        return [(b, d, i) for b, d, i in self._load(what) if _meets(b, win)]

    def divide(self, ids, win):
        """What one square's division reads: its own pieces, the parents and footprints in its window,
        and the corridors near enough for a house in the window to face or a piece to be thinned by."""
        pieces = self._load("pieces")
        cleaned = self._in("cleaned", win)
        boxes = [win] + [b for b, _d, _i in cleaned]
        reach = _grow((min(b[0] for b in boxes), min(b[1] for b in boxes),
                       max(b[2] for b in boxes), max(b[3] for b in boxes)), PAD)
        return cache.sha(json.dumps([[(i, pieces[i]) for i in ids], [d for _b, d, _i in self._in("parents", win)],
                                     [(i, d) for _b, d, i in cleaned], [d for _b, d, _i in self._in("corridors", reach)]]))

    def write(self, sq):
        """What one square's writing reads: the corridors near it, the road heights of those crossing
        it, and the footprints and parent blocks within WRITE_REACH."""
        near = self._in("corridors", _grow(sq, FRONT_REACH))
        heights = self._load("structures")
        wide = _grow(sq, WRITE_REACH)
        return cache.sha(json.dumps([[d for _b, d, _i in near], [(i, heights.get(i)) for b, _d, i in near if _meets(b, sq)],
                                     [(i, d) for _b, d, i in self._in("cleaned", wide)],
                                     [d for _b, d, _i in self._in("parents", wide)]]))


def build(raw, once, city, store, jobs, wanted=None, log=print):
    """Every stage up to the squares' assembly. Returns what `stage.py` needs to write the squares:
    the squares assembled, those that failed, and the digests a square's writing is keyed by (its
    assembly with its own slice of what the passes wrote)."""
    R = Run(raw, once, city, store, jobs, log)
    os.makedirs(once, exist_ok=True)
    os.makedirs(city, exist_ok=True)
    whole = lambda layer: cache.file_digest(layer_file(raw, layer)) if layer != "building" else \
        cache.sha(cache.file_digest(layer_file(raw, layer)) + cache.file_digest(cache.footprints_file(raw)))
    t0 = time.time()

    # ---- pass 1: the graph, each square's corridors, the bridges and road heights ----
    gkey = cache.key_of("graph", cache.code_key((ONCE, "build_graph")), R.lib,
                        whole("osm-roads"), whole("segment"), whole("osm-detail"))
    g = R.stage("graph", gkey, once, ["graph.json"], lambda: O.build_graph(once, raw, log=log))
    graph_d = g["graph.json"]
    edges = O.read_graph(once)
    bb = O.map_bbox()
    tasks = [(ti, tj, ids, once, raw, bb) for (ti, tj), ids in O.owned_edges(edges)]
    _clear_unowned(once, {(t[0], t[1]) for t in tasks}, ("corridors.json", "held-out.json"))
    code = cache.code_key((ONCE, "_fit_square_edges"))
    by_id = {e["id"]: e for e in edges}
    rows = {r["id"]: r for r in json.load(open(O.graph_path(once)))}
    keys = []
    for t in tasks:
        win = O.edge_window([by_id[i]["line"] for i in t[2]])
        # keyed by the square's own edges as the graph file has them, not the whole graph: an edge
        # changed elsewhere in the city leaves this square's fit as it was
        mine = cache.sha(json.dumps([rows[i] for i in t[2]]))
        keys.append(cache.key_of("corridors", code, R.lib, mine, t[:2],
                                 R.layers.digest("building", win, PAD),
                                 R.layers.digest("infrastructure", win, PAD), R.layers.ridges(win, PAD)))
    R.weight = {(t[0], t[1]): len(t[2]) for t in tasks}
    cor, bad = R.pool("corridors", O._fit_square_edges, tasks, keys, lambda t: once,
                      lambda t: [f"{name(t)}/corridors.json", f"{name(t)}/held-out.json"])
    if bad:
        sys.exit(f"partition: pass 1 failed in {len(bad)} squares")
    corridors_d = cache.sha("".join(f"{name(t)}{digest_of(cor[t])}" for t in sorted(cor)))
    log(f"  pass 1: {len(tasks)} squares, {R.ran['corridors']} fitted, {time.time() - t0:.0f}s so far")

    # the bridges and road heights read only the graph, and nothing before the assembly reads them,
    # so they are worked out in a process of their own beside the pools
    maps = os.path.join(ROOT, "web", "public", "maps")
    skey = cache.key_of("structures", cache.code_key((ONCE, "pass_structures")), R.lib, graph_d,
                        whole("water"), cache.file_digest(os.path.join(ROOT, "data", MAP, "terrain15.zip")),
                        *(cache.file_digest(os.path.join(maps, f"{MAP}-{k}.json")) for k in ("rail", "canal")))
    ts = time.time()
    s = R.store.get("structures", skey, once)
    took = time.time() - ts
    side = None
    if s is None:
        from concurrent.futures import ProcessPoolExecutor
        side = ProcessPoolExecutor(1)
        beside = side.submit(structures_one, once, raw)

    # ---- pass 2: the worked pieces, then each square's division ----
    pkey = cache.key_of("pieces", cache.code_key((ONCE, "pass_pieces")), R.lib, corridors_d, whole("building"))
    p = R.stage("pieces", pkey, once, ["cleaned-buildings.json", "parents.json", "blocks.json"],
                lambda: O.pass_pieces(once, raw, jobs, log))
    tasks, work = O.block_tasks(once, raw)
    _clear_unowned(once, {(t[0], t[1]) for t in tasks}, ("blocks.json",))
    if wanted is not None:
        gather = {n for t in wanted for n in neighbours(*t)}
        tasks = [t for t in tasks if (t[0], t[1]) in gather]
    windows = _block_windows(once, tasks)
    code = cache.code_key((ONCE, "_fit_square_blocks"), (ONCE, "divide_split"))
    slices = Slices(once)
    keys = [cache.key_of("divide", code, R.lib, slices.divide(t[2], w), t[:3],
                         R.layers.digest("infrastructure", w, PAD), R.layers.digest("parcels", w, PAD),
                         R.layers.ridges(w, PAD))
            for t, w in zip(tasks, windows)]
    for t in tasks:
        # a task never writes over a longer file (a guard against partial runs), so the old one goes
        f = os.path.join(once, name(t), "blocks.json")
        if os.path.exists(f):
            os.remove(f)
    R.weight = work
    div, bad = R.pool("divide", O._fit_square_blocks, tasks, keys, lambda t: once,
                      lambda t: [f"{name(t)}/blocks.json"],
                      run=lambda todo: O.divide_split(todo, once, jobs, log))
    if bad:
        sys.exit(f"partition: pass 2 failed in {len(bad)} squares")
    log(f"  pass 2: {len(tasks)} squares, {R.ran['divide']} divided, {time.time() - t0:.0f}s so far")

    if side is not None:
        took = beside.result()
        side.shutdown()
        s = R.store.put("structures", skey, once, ["structures.json"])
        R.ran["structures"] += 1
    R.count("structures", [skey], s, took)
    log(f"  pass 1: bridges and road heights {'built' if side is not None else 'kept'}, "
        f"{time.time() - t0:.0f}s so far")

    # ---- each square's assembly ----
    from partition.city import squares
    ours = set(squares())
    asm = sorted(ours if wanted is None else ours & set(wanted))
    code = cache.code_key((MAIN, "assemble_square"), (HERE + "/pipeline.py", "assemble_one"))
    keys, jobs_ = [], []
    for t in asm:
        sq = _box(t)
        b = (sq[0] - O.MARGIN, sq[1] - O.MARGIN, sq[2] + O.MARGIN, sq[3] + O.MARGIN)
        near = [(n, digest_of(cor.get(n, {})), digest_of(div.get(n) or {})) for n in neighbours(*t)]
        keys.append(cache.key_of("assemble", code, R.lib, near, p["cleaned-buildings.json"],
                                 *(R.layers.digest(k, b, PAD) for k in
                                   ("building", "osm-roads", "infrastructure", "land_use", "parcels")),
                                 R.layers.ridges(b, PAD)))
        jobs_.append((t[0], t[1], city, raw, once))
    R.weight = {t: sum(os.path.getsize(os.path.join(once, name(n), "blocks.json"))
                       for n in neighbours(*t) if os.path.exists(os.path.join(once, name(n), "blocks.json")))
                for t in asm}
    done, bad = R.pool("assemble", assemble_one, jobs_, keys, lambda t: city,
                       lambda t: [f"{name(t)}/partition.json", f"{name(t)}/report.pkl"])
    # each square's writing is keyed on its own slice of what the passes wrote (`Slices.write`)
    upstream = {name(t): slices.write(_box(t)) for t in done}
    log(f"  assembled {len(asm)} squares, {R.ran['assemble']} built, {len(bad)} failed, "
        f"{time.time() - t0:.0f}s in all")
    log(f"  store: {R.store.hits} taken, {R.store.misses} built; stages run: {dict(R.ran)}")
    R.store.prune()
    R.write_tally(os.path.dirname(os.path.abspath(once)))
    return dict(assembled=[list(t) for t in sorted(done)], failed=[list(t) for t in sorted(bad)],
                partition={name(t): cache.sha(done[t].get(f"{name(t)}/partition.json", "") + upstream[name(t)])
                           for t in done},
                # (nothing the passes wrote is read whole by the writer any more: its share is in `partition`)
                upstream="", ran=dict(R.ran))


def structures_one(once, raw):
    t = time.time()
    O.pass_structures(once, raw, os.path.join(raw, "terrain15"))
    return time.time() - t


def assemble_one(ti, tj, city, raw, once):
    """One square's assembly (a pool task): its `partition.json`, and what its report reads."""
    from partition.__main__ import assemble_square
    out = os.path.join(city, f"{ti}_{tj}")
    ctx = assemble_square(ti, tj, out, raw, os.path.join(raw, "terrain15"), log=lambda *_: None, once=once)
    # the folders are filled in when the report runs, so a stored assembly works from any checkout
    ctx.update(out=None, once=None, terrain=None)
    with open(os.path.join(out, "report.pkl"), "wb") as f:
        pickle.dump(ctx, f, protocol=pickle.HIGHEST_PROTOCOL)
    return ti, tj, 1


def report_one(ti, tj, city, once, raw):
    from partition.__main__ import report_square
    with open(os.path.join(city, f"{ti}_{tj}", "report.pkl"), "rb") as f:
        ctx = pickle.load(f)
    ctx.update(out=os.path.join(city, f"{ti}_{tj}"), once=once, terrain=os.path.join(raw, "terrain15"))
    t = time.time()
    m = report_square(ctx)
    json.dump(dict(square=[ti, tj], secs=round(time.time() - t, 1), metrics=m),
              open(os.path.join(city, f"{ti}_{tj}", "row.json"), "w"))
    return ti, tj, 1


REPORT_FILES = ("metrics.json", "checks.json", "fragments.json", "boundary.json", "row.json")


def report(raw, once, city, store, jobs, wanted=None, log=print):
    """Each assembled square's report, then the city summary."""
    from partition.city import squares, summarise
    R = Run(raw, once, city, store, jobs, log)
    t0 = time.time()
    sq = [t for t in sorted(set(squares()) if wanted is None else set(squares()) & set(wanted))
          if os.path.exists(os.path.join(city, name(t), "report.pkl"))]
    code = cache.code_key((MAIN, "report_square"), (HERE + "/pipeline.py", "report_one"))
    cleaned = cache.file_digest(O.cleaned_path(once))
    keys = [cache.key_of("report", code, R.lib, cleaned,
                         cache.file_digest(os.path.join(city, name(t), "report.pkl")))
            for t in sq]
    for t in sq:
        for n in REPORT_FILES:
            f = os.path.join(city, name(t), n)
            if os.path.exists(f):
                os.remove(f)
    R.weight = {t: os.path.getsize(os.path.join(city, name(t), "report.pkl")) for t in sq}
    R.pool("report", report_one, [(t[0], t[1], city, once, raw) for t in sq], keys, lambda t: city,
           lambda t: [f"{name(t)}/{n}" for n in REPORT_FILES])
    rows = [json.load(open(os.path.join(city, name(t), "row.json")))
            for t in sq if os.path.exists(os.path.join(city, name(t), "row.json"))]
    log(f"  reports: {len(sq)} squares, {R.ran['report']} made, {time.time() - t0:.0f}s")
    R.write_tally(os.path.dirname(os.path.abspath(once)))
    if rows:
        summarise(rows, city, raw, os.path.join(raw, "terrain15"), once, t0)


def _box(t):
    from partition.data import box_of
    return box_of(*t)


def _clear_unowned(once, owned, names):
    """A square that owns nothing now keeps no file from when it did: the readers glob them all."""
    if not os.path.isdir(once):
        return
    for d in os.listdir(once):
        p = os.path.join(once, d)
        if not os.path.isdir(p) or "_" not in d:
            continue
        try:
            t = tuple(int(v) for v in d.split("_"))
        except ValueError:
            continue
        if t not in owned:
            for n in names:
                if os.path.exists(os.path.join(p, n)):
                    os.remove(os.path.join(p, n))


def _block_windows(once, tasks):
    """The window each division task reads its layers from, as `_fit_square_blocks` works it out."""
    from shapely.strtree import STRtree
    pieces = O.read_pieces(once)
    parents = O.read_parents(once, None)
    tree = STRtree(parents)

    def parent(p):
        rp = p.representative_point()
        return next((parents[int(k)] for k in sorted(int(k) for k in tree.query(rp))
                     if parents[int(k)].contains(rp)), None)
    out = []
    for t in tasks:
        mine = [pieces[i] for i in t[2]]
        boxes = mine + [q for q in (parent(p) for p in mine) if q is not None]
        old = (min(p.bounds[0] for p in mine) - O.REACH_GROW - O.MARGIN,
               min(p.bounds[1] for p in mine) - O.REACH_GROW - O.MARGIN,
               max(p.bounds[2] for p in mine) + O.REACH_GROW + O.MARGIN,
               max(p.bounds[3] for p in mine) + O.REACH_GROW + O.MARGIN)
        whole = (min(p.bounds[0] for p in boxes) - O.MARGIN, min(p.bounds[1] for p in boxes) - O.MARGIN,
                 max(p.bounds[2] for p in boxes) + O.MARGIN, max(p.bounds[3] for p in boxes) + O.MARGIN)
        out.append((min(old[0], whole[0]), min(old[1], whole[1]), max(old[2], whole[2]), max(old[3], whole[3])))
    return out


def main(argv):
    what, raw, once, city, store, jobs = argv[:6]
    jobs = int(jobs)
    if what == "build":
        result, rest = argv[6], argv[7:]
    else:
        result, rest = None, argv[6:]
    wanted = [tuple(int(v) for v in a.split(",")) for a in rest] or None
    if what == "build":
        r = build(raw, once, city, store, jobs, wanted)
        json.dump(r, open(result, "w"))
    else:
        report(raw, once, city, store, jobs, wanted)


if __name__ == "__main__":
    main(sys.argv[1:])
