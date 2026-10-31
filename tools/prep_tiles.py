"""Build the whole of Bath round a detailed map as tiles, at the detailed map's level of detail.

Usage: python3 -I tools/prep_tiles.py <map> <dir with the wide .geojson layers> <out dir> [--force] [--keep] [--measure] [--jobs 4] [--shard k/n] [--only ti,tj ...]
       python3 -I tools/prep_tiles.py <map> <dir> <out dir> --partition-only [--only ti,tj ...]

e.g. python3 -I tools/prep_tiles.py combe-down data/raw/combe-down/wide web/public/maps/combe-down

The dir is the one tools/prep_wide.py uses (the wide Overture layers and the canopy tile, see
docs/new-area.md, and the OpenStreetMap and food hygiene downloads for the shops). The tiles' grid
is set in tools/area.py (squares). Each tile is one ordinary map file built by
tools/prep_map.py with --tile (see there for what a tile keeps), 261 x 261 of the detailed map's
grid cells (a little over a kilometre) square. Every tile that reaches into the wide force
field's data circle is built, the village's nine (0-2 each way) like the rest.

To keep each build quick, the layers are first cut once into what each tile needs (a tile reads
the features within 650 m of it, and the water within 1300 m), in <dir>/split/<ti>_<tj>/. The
Mapzen terrain tiles are kept in <dir>/terrain15/ so they're only downloaded once. The cut is
only made again when the wide layers change. A tile is only built again when something it's built
from has changed: its cut of the layers, the shared lidar, canopy, terrain and certificates, the
canal and railway files, or any of the map tools (what it was built from is kept in
<dir>/split/<ti>_<tj>/.built); --force builds them all anyway. With --keep, a square that is rebuilt carries over its earlier
build's lidar-measured buildings wherever this build's lidar doesn't reach (prep_map.py
--buildings-from), so a rebuild without every lidar tile loses no measured roofs. As many builds
run at once as the machine has cores, unless --jobs says otherwise.

What each square takes from the lidar and the tree canopy map (its buildings' heights, roofs and
roof levels, and the canopy) is read from its measurements in the repository,
data/<map>/measured/<ti>_<tj>.zip (see tools/mapdata.py), so neither is needed. With --measure it
is worked out afresh from the lidar and the canopy map in <dir> instead, and the measurements are
written over: the map comes out the same either way, from the same data.

Writes <out dir>/<ti>_<tj>.json for each tile, web/public/maps/<map>.json with what belongs to the
map as a whole (its name, centre, force field, base height and where everyone starts: the game
loads it first), and <out dir>/tiles.json, which says how the tiles are laid out:
{"x0", "y0": the south-west corner of tile (0, 0), metres east and north of the map centre;
 "dx": the grid spacing; "cells": grid cells per tile side; "z0": the height every tile's
 terrain is measured from; "tiles": [[ti, tj], ...]}.

For Combe Down (the one map the partition is written for), the squares prep_map.py builds go into
<dir>/partition/prep/ instead, and the last stage, tools/partition/stage.py, lays the ground out as
a partition and writes the game's squares into <out dir> from them (see there). With --shard the
squares are built but the partition isn't, as it needs every square: gather the shares' prep/
folders on one machine, then run --partition-only there.
"""
import hashlib, json, math, os, subprocess, sys, time, gzip
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import shapely
from shapely.geometry import shape, box, Point

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from mapdata import measured_dir
from stitch import boundaries, path_clear
from partition.stage import partitioned, prep_dir

TOOLS = os.path.dirname(os.path.abspath(__file__))
CELLS = 261
LAYERS = ["building", "segment", "water", "land_use", "land", "land_cover", "place", "infrastructure"]
SHOPS = ["osm", "fsa", "osm-roads"]      # where the shops are (tools/osm.py, tools/fsa.py), and the streets' OpenStreetMap tags (tools/osm.py roads), if they've been downloaded
PAD = {"water": 1300}       # metres round a tile that its build reads; 650 for everything else
# Overture's huge outlines that no square's build reads: the land of Great Britain itself and its
# island groups (a million points of coastline, re-read by every square), and the nature
# designations that cover whole districts (the Cotswolds, the bats' conservation areas: prep_map
# leaves these out of the named places too). Left out of the squares' layers only; if a square
# ever needs them, take them off this list.
SKIP = {"land": lambda p: p.get("class") in ("island", "archipelago"),
        "land_use": lambda p: p.get("class") in ("protected_landscape_seascape", "wilderness_area", "species_management_area")}


def files(*roots):
    """Every file under roots (following links), sorted, leaving out our own dot files."""
    out = []
    for root in roots:
        if os.path.isfile(root): out.append(root); continue
        for d, sub, names in os.walk(root, followlinks=True):
            sub[:] = sorted(s for s in sub if not s.startswith("."))
            out += [os.path.join(d, n) for n in sorted(names) if not n.startswith(".")]
    return out


def stamp(paths):
    """What each file is by its size and when it last changed: cheap, for the big shared data."""
    return [(p, os.path.getsize(p), os.path.getmtime(p)) for p in paths]


def digest(paths, extra=()):
    """A fingerprint of the files' contents (and anything else that decides a build)."""
    h = hashlib.sha1(repr(list(extra)).encode())
    for p in paths:
        h.update(p.encode() + b"\0")
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def main():
    args = sys.argv[1:]
    force = "--force" in args
    if force: args.remove("--force")
    keep = "--keep" in args
    if keep: args.remove("--keep")
    measure = "--measure" in args
    if measure: args.remove("--measure")
    partition_only = "--partition-only" in args
    if partition_only: args.remove("--partition-only")
    jobs = os.cpu_count() or 4
    if "--jobs" in args:
        k = args.index("--jobs"); jobs = int(args[k + 1]); del args[k:k + 2]
    shard = None        # k/n: build only the k-th of n shares of the squares, for several machines at once
    if "--shard" in args:
        k = args.index("--shard"); shard = tuple(int(v) for v in args[k + 1].split("/")); del args[k:k + 2]
    only = None
    if "--only" in args:
        k = args.index("--only")
        only = [tuple(int(v) for v in a.split(",")) for a in args[k + 1:]]
        del args[k:]
    map_id, src_dir, out_dir = args[:3]
    A = area(map_id, wide=True)
    G = A.squares
    D, X0, Y0 = G.dx, G.x0, G.y0
    size = CELLS * D
    tile_box = lambda ti, tj: (X0 + ti * CELLS * D, Y0 + tj * CELLS * D, X0 + (ti + 1) * CELLS * D, Y0 + (tj + 1) * CELLS * D)

    # ---- which tiles: every one reaching into the data circle ----------------------------------
    (fcx, fcy), R = A.field_centre, A.half
    circle = Point(fcx, fcy).buffer(R, 256)
    tiles = []
    for ti in range(math.floor((fcx - R - X0) / size), math.floor((fcx + R - X0) / size) + 1):
        for tj in range(math.floor((fcy - R - Y0) / size), math.floor((fcy + R - Y0) / size) + 1):
            if 0 <= ti <= 2 and 0 <= tj <= 2 or box(*tile_box(ti, tj)).intersects(circle): tiles.append((ti, tj))
    print(f"{len(tiles)} tiles of {size:.1f} m, {CELLS} cells of {D:.4f} m")
    os.makedirs(out_dir, exist_ok=True)
    staged = partitioned(map_id)
    # prep_map's squares for a partitioned map are only the partition's starting point, so they're
    # kept out of the game's folder
    prep_out = prep_dir(src_dir) if staged else out_dir
    os.makedirs(prep_out, exist_ok=True)
    out_of = lambda t: os.path.join(prep_out, f"{t[0]}_{t[1]}.json")
    index = lambda: json.dump(dict(x0=X0, y0=Y0, dx=D, cells=CELLS, z0=G.z0, tiles=[list(t) for t in tiles if os.path.exists(out_of(t))]),
                              open(os.path.join(out_dir, "tiles.json"), "w"), separators=(",", ":"))
    if partition_only:
        if not staged: sys.exit(f"{map_id} has no partition stage")
        code = run_partition(map_id, src_dir, out_dir, only, jobs)
        index()
        sys.exit(code)
    # (the village's nine used to be kept apart, in <dir>/core, to be stitched into one file: they
    # go in with the rest now, so a build already made isn't made again)
    core_dir = os.path.join(src_dir, "core")
    for t in tiles:
        old = os.path.join(core_dir, f"{t[0]}_{t[1]}.json")
        if os.path.exists(old) and not os.path.exists(out_of(t)): os.replace(old, out_of(t))
    wanted = [t for t in tiles if only is None or t in only]
    if shard:
        # the village's nine together in share 0 (the map's own small file, which share 0 hands on,
        # takes where everyone starts from them), the rest dealt round the other shares in turn
        k, n = shard
        nine = lambda t: 0 <= t[0] <= 2 and 0 <= t[1] <= 2
        rest = [t for t in wanted if not nine(t)]
        wanted = [t for t in wanted if nine(t)] if k == 0 and n > 1 else []
        wanted += [t for i, t in enumerate(rest) if n == 1 or i % (n - 1) + 1 == k]

    # ---- cut the layers into what each tile needs ----------------------------------------
    # done again whenever the wide layers or this file change (the cut is written in .done)
    split_root = os.path.join(src_dir, "split")
    split_of = lambda t: os.path.join(split_root, f"{t[0]}_{t[1]}")
    layer_files = [os.path.join(src_dir, f"{l}.geojson") for l in LAYERS + SHOPS if os.path.exists(os.path.join(src_dir, f"{l}.geojson"))]
    cut = digest([os.path.abspath(__file__)], stamp(layer_files))
    done_of = lambda t: os.path.join(split_of(t), ".done")
    need = [t for t in wanted if force or not os.path.exists(done_of(t)) or open(done_of(t)).read() != cut]
    if need:
        t0 = time.time()
        lon0, lat0 = A.centre
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
        boxes = np.array([tile_box(*t) for t in need])
        chosen = {t: {} for t in need}
        for layer in LAYERS + [l for l in SHOPS if os.path.exists(os.path.join(src_dir, f"{l}.geojson"))]:
            feats = json.load(open(os.path.join(src_dir, f"{layer}.geojson")))["features"]
            if layer in SKIP: feats = [f for f in feats if not SKIP[layer](f["properties"])]
            bb = np.array([shape(f["geometry"]).bounds for f in feats]).reshape(-1, 4)
            bx = np.stack([(bb[:, 0] - lon0) * kx, (bb[:, 1] - lat0) * ky, (bb[:, 2] - lon0) * kx, (bb[:, 3] - lat0) * ky], 1)
            text = [None] * len(feats)
            pad = PAD.get(layer, 650)
            for t, (x0, y0, x1, y1) in zip(need, boxes):
                idx = np.nonzero((bx[:, 2] >= x0 - pad) & (bx[:, 0] <= x1 + pad) & (bx[:, 3] >= y0 - pad) & (bx[:, 1] <= y1 + pad))[0]
                for i in idx:
                    if text[i] is None: text[i] = json.dumps(feats[i], separators=(",", ":"))
                chosen[t][layer] = [text[i] for i in idx]       # in the layer's own order
            print(f"split {layer}: {len(feats)} features ({time.time() - t0:.0f}s)")
            for t in need:
                d = split_of(t)
                os.makedirs(d, exist_ok=True)
                with open(os.path.join(d, f"{layer}.geojson"), "w") as f:
                    f.write('{"type":"FeatureCollection","features":[' + ",".join(chosen[t][layer]) + "]}")
                chosen[t][layer] = None
            del feats, text
        for t in need:
            d = split_of(t)
            for link in ("canopy", "terrain15", "lidar", "epc"):
                target = os.path.abspath(os.path.join(src_dir, link))
                os.makedirs(target, exist_ok=True)
                if not os.path.islink(os.path.join(d, link)): os.symlink(target, os.path.join(d, link))
            open(os.path.join(d, ".done"), "w").write(cut)
        print(f"split the layers for {len(need)} tiles in {time.time() - t0:.0f}s")

    # ---- which need building: a square is built again only when something it's built from has
    # changed: its own cut of the layers, the shared data it reads (lidar, canopy, terrain,
    # certificates), the canal and railway files, or any of the map tools
    t0 = time.time()
    # this file is in the cut, and prep_map never reads the partition's tools
    partition_tools = (os.path.join(TOOLS, "partition") + os.sep, os.path.join(TOOLS, "structures.py"))
    tools = digest([p for p in files(TOOLS) if p.endswith(".py") and p != os.path.abspath(__file__) and not p.startswith(partition_tools)])
    shared = stamp(files(*(os.path.join(src_dir, l) for l in ("canopy", "terrain15", "lidar", "epc"))))
    maps = os.path.join(TOOLS, "..", "web", "public", "maps")
    lines = [p for p in (os.path.join(maps, f"{map_id}-{k}.json") for k in ("canal", "rail")) if os.path.exists(p)]
    # and, built from the repository's measurements, its own measurements file
    kept = lambda t: [p for p in [os.path.join(measured_dir(map_id), "faces", f"{t[0]}_{t[1]}.json")] if os.path.exists(p)] + (
        [] if measure else [p for p in [os.path.join(measured_dir(map_id), f"{t[0]}_{t[1]}.zip")] if os.path.exists(p)])
    key_of = lambda t: digest([p for p in files(split_of(t)) if p.endswith(".geojson") and os.path.dirname(p) == split_of(t)] + lines + kept(t),
                              (tools, shared, keep, measure, t))
    built_of = lambda t: os.path.join(split_of(t), ".built")
    keys = {t: key_of(t) for t in wanted}
    same = lambda t: os.path.exists(out_of(t)) and os.path.exists(built_of(t)) and open(built_of(t)).read() == keys[t]
    todo = [t for t in wanted if force or not same(t)]
    print(f"{len(todo)} to build, {len(wanted) - len(todo)} unchanged since they were last built ({time.time() - t0:.0f}s to check)")

    # ---- build them, a few at once ----------------------------------------------------------
    done, failed, start = [], [], time.time()

    def build(t):
        t0 = time.time()
        log = os.path.join(split_of(t), "build.log")
        tmp = out_of(t) + ".tmp"
        with open(log, "w") as f:
            earlier = ["--buildings-from", out_of(t)] if keep and os.path.exists(out_of(t)) else []
            measured = ["--measure" if measure else "--measured", os.path.join(measured_dir(map_id), f"{t[0]}_{t[1]}.zip")]
            r = subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "prep_map.py"), map_id, split_of(t), tmp, "--tile", str(t[0]), str(t[1]), *earlier, *measured],
                               stdout=f, stderr=subprocess.STDOUT)
        secs = time.time() - t0
        if r.returncode == 0 and os.path.exists(tmp):
            os.replace(tmp, out_of(t))
            open(built_of(t), "w").write(keys[t])
            done.append((t, secs))
            last = open(log).read().strip().splitlines()[-1]
            print(f"[{len(done) + len(failed)}/{len(todo)}] {t[0]}_{t[1]} in {secs:.0f}s: {last.split('; ')[-1]}"
                  f"  ({time.time() - start:.0f}s so far)", flush=True)
        else:
            failed.append(t)
            print(f"[{len(done) + len(failed)}/{len(todo)}] {t[0]}_{t[1]} FAILED after {secs:.0f}s, see {log}", flush=True)

    # the busiest squares start first, so the pool doesn't end waiting on one
    size = lambda t: sum(os.path.getsize(os.path.join(split_of(t), n)) for n in os.listdir(split_of(t))
                         if n.endswith(".geojson")) if os.path.isdir(split_of(t)) else 0
    with ThreadPoolExecutor(jobs) as pool:
        list(pool.map(build, sorted(todo, key=lambda t: -size(t))))

    # ---- across the seams: a shrub one square planted where its neighbour's gate, front path or
    # drive comes in goes, so the way through stays clear from square to square
    if done:
        if not staged:
            opened = clear_doorsteps_unpartitioned([t for t, _ in done], out_of)
            if opened: print(f"boundaries opened in front of doors in {opened} squares")
        changed = clear_seams([t for t, _ in done], set(tiles), out_of)
        if changed: print(f"shrubs cleared from gateways across the seams in {changed} squares")
        # a span of wire crosses a square's edge: each hangs from its poles wherever they were put up
        from partition.write_tile import string_city_wires
        loose = string_city_wires(os.path.dirname(out_of(done[0][0])), [t for t, _ in done])
        if loose: print(f"{loose} wires with no pole at an end left out across the seams")

    # ---- the map as a whole: what isn't any one square's -----------------------------------------
    write_header(area(map_id), G, os.path.join(TOOLS, "..", "web", "public", "maps", f"{map_id}.json"),
                 [out_of(t) for t in tiles if 0 <= t[0] <= 2 and 0 <= t[1] <= 2])

    # ---- the partition, over every square prep_map has built -------------------------------------
    stage_failed = 0
    if staged and shard is None:
        stage_failed = run_partition(map_id, src_dir, out_dir, only, jobs)
    elif staged:
        print(f"partition: not run on a share of the squares; gather the shares' {prep_out} and run --partition-only")

    # ---- the index, and what it all came to ------------------------------------------------------
    index()
    built = [list(t) for t in tiles if os.path.exists(out_of(t))]
    raw = sum(os.path.getsize(out_of(t)) for t in built)
    with ThreadPoolExecutor(jobs) as pool:      # about what the server sends
        zipped = sum(pool.map(lambda t: len(gzip.compress(open(out_of(t), "rb").read(), 6)), built))
    print(f"{len(built)} of {len(tiles)} tiles built, {raw / 1e6:.1f} MB ({zipped / 1e6:.1f} MB gzipped)"
          + (f"; {len(failed)} failed: {' '.join(f'{a}_{b}' for a, b in failed)}" if failed else ""))
    if done: print(f"this run: {len(done)} tiles in {time.time() - start:.0f}s, {sum(s for _, s in done) / len(done):.0f}s each on average")
    if failed or stage_failed: sys.exit(1)


def run_partition(map_id, src_dir, out_dir, only, jobs):
    cmd = [sys.executable, "-I", os.path.join(TOOLS, "partition", "stage.py"), map_id, src_dir, out_dir, "--jobs", str(jobs)]
    if only: cmd += ["--only", *(f"{a},{b}" for a, b in only)]
    return subprocess.run(cmd).returncode


def clear_doorsteps_unpartitioned(built, out_of):
    """On a map the partition doesn't lay out, open each square's walls and fences in front of its
    doors and those just over its edge, as the partition does, and drop the doors over the edge it
    was given for that. Returns how many square files had a boundary opened."""
    from partition.write_tile import clear_doorsteps, ground_at
    opened = 0
    for t in built:
        d = json.load(open(out_of(t)))
        if "drn" not in d: continue
        near = d.pop("drn")
        br = d.get("br") or []
        new_br, new_gt = clear_doorsteps(br, d.get("gt") or [], (d.get("dr") or []) + near,
                                         lambda x, y, T=d["t"]: ground_at(T, x, y))
        if new_br != br:
            opened += 1
            d["br"] = new_br
            if "gt" in d: d["gt"] = new_gt
        tmp = out_of(t) + ".tmp"
        json.dump(d, open(tmp, "w"), separators=(",", ":"))
        os.replace(tmp, out_of(t))
    return opened


def clear_seams(built, tiles, out_of):
    """Drop each shrub standing in a neighbouring square's gateway, front path or drive, and each front
    path laid across a neighbouring square's wall, fence or hedge, where they meet at the seam between
    two squares, in the squares just built and the ones round them.
    Returns how many square files were written again."""
    near = {(t[0] + a, t[1] + b) for t in built for a in (-1, 0, 1) for b in (-1, 0, 1)} & tiles
    loaded = {}
    def load(t):
        if t not in loaded: loaded[t] = json.load(open(out_of(t))) if os.path.exists(out_of(t)) else None
        return loaded[t]
    changed = 0
    for t in sorted(near):
        d = load(t)
        if not d: continue
        ways, br, gt = [], [], list(d.get("gt", []))
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                o = load((t[0] + a, t[1] + b)) if (a or b) and (t[0] + a, t[1] + b) in tiles else None
                if not o: continue
                ways += [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.0) for q in o.get("gt", [])]
                ways += [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.9) for q in o.get("fp", [])]
                ways += [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.5) for q in o.get("dv", [])]
                br += o.get("br", []); gt += o.get("gt", [])
        sb, fp = d.get("sb", []), d.get("fp", [])
        if ways and sb:
            wt = shapely.STRtree(ways)
            sb = [q for q in sb if not len(wt.query(shapely.Point(q[0], q[1]), predicate="within"))]
        # and a front path laid across a neighbour's wall, fence or hedge (anywhere but in a gateway)
        # goes, as it does within a square
        if fp and br:
            idx = boundaries(br, gt)
            fp = [q for q in fp if path_clear(q, idx)]
        if len(sb) == len(d.get("sb", [])) and len(fp) == len(d.get("fp", [])): continue
        if "sb" in d: d["sb"] = sb
        if "fp" in d: d["fp"] = fp
        tmp = out_of(t) + ".tmp"
        json.dump(d, open(tmp, "w"), separators=(",", ":"))
        os.replace(tmp, out_of(t))
        changed += 1
    return changed


def write_header(A, G, path, village):
    """The map file the game loads first: only what belongs to the map as a whole (its name, centre,
    force field, base height and where everyone starts), as the ground and everything on it comes
    in squares. Where everyone starts is found in the village's squares."""
    parts = [json.load(open(p)) for p in village if os.path.exists(p)]
    if not parts: return
    spawn = next((p["spawn"] for p in parts if p.get("spawn")), None)
    d = dict(id=A.id, name=A.name, release=parts[0]["release"], centre=A.centre, field=A.field, fc=list(A.field_centre),
             bk=parts[0].get("bk"), v=list(A.view) if getattr(A, "view", None) else None, z0=G.z0, spawn=spawn,
             vn=getattr(A, "village", None))
    json.dump({k: v for k, v in d.items() if v is not None}, open(path, "w"), separators=(",", ":"))
    print(f"{A.id}: the map as a whole in {path}, {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()
