"""The partition as the last stage of the map build: `prep_tiles.py` runs it after its squares.

Usage: python3 -I tools/partition/stage.py <map> <dir with the wide layers> <out dir> [--only ti,tj ...] [--jobs n]

`prep_tiles.py` writes `prep_map.py`'s squares into `<dir>/partition/prep/`, not into the game's
folder. This stage then lays the ground out as a partition and writes each square into `<out dir>`,
starting from that square's file in `prep/` (so whatever the partition doesn't own is as
`prep_map.py` built it). The partition's output is never read back as a starting point, so a
rebuild can't stack one partition on another, and no rebuild can put the old-style squares into the
game in its place.

The city-wide passes (the street graph and its corridors, the bridges and road heights, the worked
blocks: `city.py`) run once for the whole map into `<dir>/partition/once/`, and are kept until
something they're built from changes: the partition's tools, the map's layers in `<dir>` and
`data/<map>/`, the squares' measurements, or the canal and railway files. Each square is then
assembled (`<dir>/partition/city/`) and written (`write_tile.py`) again only when the passes or its
own `prep_map.py` square have changed, so `--only` reuses the passes and writes just those squares.

The stage runs for a map marked `partition=True` in `tools/area.py` (Combe Down's Bath, so far the
only one with the Land Registry's parcels and the lidar it needs kept, `measured.py`): for any
other map `prep_tiles.py` builds straight into the game's folder and this stage doesn't run. Nothing here is decided over the network: it is all build-time.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)

from area import MAPS


def partitioned(map_id):
    return bool(MAPS.get(map_id, {}).get("partition"))


def stage_dir(src_dir):
    return os.path.join(src_dir, "partition")


def prep_dir(src_dir):
    return os.path.join(stage_dir(src_dir), "prep")


def code_files():
    """The partition's own modules and every tool module they import, found by reading the imports
    rather than by importing, so an import inside a function counts too."""
    seen, todo = set(), [os.path.join(HERE, n) for n in ("__init__.py", "city.py", "write_tile.py")]
    while todo:
        p = todo.pop()
        if p in seen:
            continue
        seen.add(p)
        text = open(p).read()
        names = [os.path.join(TOOLS, f"{n}.py") for n in re.findall(r"^\s*(?:from|import)\s+(\w+)", text, re.M)]
        names += [os.path.join(HERE, f"{n}.py") for n in re.findall(r"^\s*from\s+(?:\.|partition\.)(\w+)", text, re.M)]
        for group in re.findall(r"^\s*from\s+(?:\.|partition)\s+import\s+\(?([\w, ]+)", text, re.M):
            names += [os.path.join(HERE, f"{n.strip()}.py") for n in group.split(",")]
        todo += [q for q in names if os.path.exists(q) and q not in seen]
    return sorted(seen)


def digest(paths, extra=()):
    h = hashlib.sha1(repr(list(extra)).encode())
    for p in paths:
        h.update(os.path.relpath(p, ROOT).encode() + b"\0")
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
    return h.hexdigest()


def passes_key(map_id, src_dir):
    """What the city-wide passes are built from. The terrain tiles are left out: the partition fetches
    any it lacks into the folder, which would change the key on every run, and they're unpacked from
    the repository's `terrain15.zip`, which is in."""
    data = os.path.join(ROOT, "data", map_id)
    inputs = [os.path.join(src_dir, n) for n in sorted(os.listdir(src_dir)) if n.endswith(".geojson")]
    for d, sub, names in os.walk(data):
        sub[:] = sorted(sub)
        inputs += [os.path.join(d, n) for n in sorted(names) if not n.startswith(".")]
    maps = os.path.join(ROOT, "web", "public", "maps")
    inputs += [p for p in (os.path.join(maps, f"{map_id}-{k}.json") for k in ("canal", "rail")) if os.path.exists(p)]
    return digest(code_files() + inputs)


def read(path):
    return open(path).read() if os.path.exists(path) else None


def run(cmd, log):
    with open(log, "w") as f:
        return subprocess.run([sys.executable, "-I", *cmd], stdout=f, stderr=subprocess.STDOUT,
                              env=dict(os.environ, CD_PARTITION_QUICK="1")).returncode


def write(job):
    from partition import measured
    from partition.write_tile import write_one
    measured.missed[0] = 0
    r = write_one(job)
    r["missed"] = measured.missed[0]
    return r


def main(argv):
    only = None
    if "--only" in argv:
        k = argv.index("--only")
        only = {tuple(int(v) for v in a.split(",")) for a in argv[k + 1:]}
        argv = argv[:k]
    jobs = os.cpu_count() or 4
    if "--jobs" in argv:
        k = argv.index("--jobs")
        jobs = int(argv[k + 1])
        argv = argv[:k] + argv[k + 2:]
    map_id, src_dir, out_dir = argv[:3]
    if not partitioned(map_id):
        print(f"partition: not set up for {map_id}")
        return 0
    os.environ["CD_MAP"] = map_id
    os.environ["CD_PARTITION_QUICK"] = "1"
    from partition import MAP
    assert MAP == map_id
    from partition.city import squares
    from partition.measured import PATH as KEPT
    from partition.write_tile import drop_edge_stubs
    if not os.path.exists(KEPT):
        sys.exit(f"partition: {KEPT} is missing, and without it the map would quietly come out different: "
                 "pack it from the lidar (tools/mapdata.py pack)")

    base, root = prep_dir(src_dir), stage_dir(src_dir)
    once, city, keys = (os.path.join(root, n) for n in ("once", "city", "keys"))
    os.makedirs(keys, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    built = sorted(tuple(int(v) for v in n[:-5].split("_")) for n in os.listdir(base)
                   if re.fullmatch(r"-?\d+_-?\d+\.json", n))
    wanted = [t for t in built if only is None or t in only]
    ours = set(squares())
    name = lambda t: f"{t[0]}_{t[1]}"
    start = time.time()

    key = passes_key(map_id, src_dir)
    fresh = read(os.path.join(once, ".key")) != key
    if fresh:
        shutil.rmtree(once, ignore_errors=True)
        shutil.rmtree(city, ignore_errors=True)
    # a square is assembled again when the passes are new, or it was never assembled from these
    assemble = [t for t in wanted if t in ours and (fresh or read(os.path.join(keys, name(t) + ".city")) != key)]
    failed = set()
    if fresh or assemble:
        print(f"partition: {'the city-wide passes, then ' if fresh else ''}{len(assemble)} squares to assemble"
              f" (log in {root}/city.log)", flush=True)
        t0 = time.time()
        cmd = [os.path.join(HERE, "city.py"), "--once", once, "--out", city, "--raw", src_dir, "--jobs", str(jobs)]
        if set(assemble) != ours:
            cmd += ["--only", *(f"{a},{b}" for a, b in assemble)]
        run(cmd, os.path.join(root, "city.log"))
        summary = json.load(open(os.path.join(city, "summary.json"))) if os.path.exists(os.path.join(city, "summary.json")) else {}
        bad = {tuple(s) for s in summary.get("failed", [])}
        if not os.path.exists(os.path.join(once, "blocks.json")):
            sys.exit(f"partition: the city-wide passes failed, see {root}/city.log")
        open(os.path.join(once, ".key"), "w").write(key)
        for t in assemble:
            if t in bad or not os.path.exists(os.path.join(city, name(t), "partition.json")):
                failed.add(t)
            else:
                open(os.path.join(keys, name(t) + ".city"), "w").write(key)
        print(f"partition: assembled in {time.time() - t0:.0f}s"
              + (f"; {len(failed)} failed: {' '.join(map(name, sorted(failed)))}" if failed else ""), flush=True)

    # a square is written again when its prep_map square or the passes have changed
    wkey = lambda t: digest([os.path.join(base, name(t) + ".json")], (key,))
    out_of = lambda t: os.path.join(out_dir, name(t) + ".json")
    todo, copy = [], []
    for t in wanted:
        if t in failed or t not in ours:
            copy.append(t)
        elif not os.path.exists(out_of(t)) or read(os.path.join(keys, name(t) + ".tile")) != wkey(t):
            todo.append(t)
    def keep_prep(t):
        shutil.copyfile(os.path.join(base, name(t) + ".json"), out_of(t))
        if os.path.exists(os.path.join(keys, name(t) + ".tile")):
            os.remove(os.path.join(keys, name(t) + ".tile"))
    for t in copy:
        keep_prep(t)
    if todo:
        from concurrent.futures import ProcessPoolExecutor
        t0 = time.time()
        print(f"partition: writing {len(todo)} squares", flush=True)
        jobs_ = [(a, b, out_dir, once, city, os.path.join(base, name((a, b)) + ".json")) for a, b in todo]
        done, missed = [], 0
        with ProcessPoolExecutor(jobs) as pool:
            for r in pool.map(write, jobs_):
                t = tuple(r["square"])
                if "failed" in r:
                    print(f"  {name(t)} FAILED ({r['failed']}): left as prep_map built it", flush=True)
                    keep_prep(t)
                    failed.add(t)
                else:
                    done.append(t)
                    missed += r["missed"]
        stubs = drop_edge_stubs(out_dir, done)
        for t in done:
            open(os.path.join(keys, name(t) + ".tile"), "w").write(wkey(t))
        print(f"partition: {len(done)} squares written in {time.time() - t0:.0f}s, {stubs} stubs at the edges dropped", flush=True)
        if missed:
            print(f"partition: {missed} points under bridges had no kept lidar ground: pack it again (tools/mapdata.py pack)")
    print(f"partition: {len(wanted) - len(todo) - len(copy)} squares unchanged, "
          f"{len(copy) - len(failed & set(copy))} outside the partition kept as prep_map built them, "
          f"{time.time() - start:.0f}s in all")
    if failed:
        print(f"partition: {len(failed)} squares failed: {' '.join(map(name, sorted(failed)))}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
