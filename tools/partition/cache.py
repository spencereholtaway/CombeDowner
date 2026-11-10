"""What each stage of the partition is built from, and the outputs it gave, kept between builds.

A stage's *key* is a digest of its own code and of everything it reads: the code is the functions the
stage runs, followed through the calls they make (`code_key`), and the inputs are the files the stage
before it wrote, as digests of their contents, and the part of each map layer its window touches
(`Layers`). A stage whose key has been built before takes its outputs from the store instead of
running. Because the keys hold the *contents* of what came before, a stage that comes out the same as
last time stops the rebuild there: the stages after it see the same inputs and are found in the store.

The store is a folder of entries, one per key, each holding a copy of that stage's output files. The
map build keeps it in `~/.cache/combedowner` (`tools/mac_build.sh`), so a fresh worktree reuses it.

Only the build's own tools decide what goes in; nothing here is sent over the network.
"""
import ast
import hashlib
import json
import lzma
import os
import shutil
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)

# raised whenever what a stage writes changes shape without its code saying so
VERSION = 1


def sha(data):
    return hashlib.sha1(data if isinstance(data, bytes) else data.encode()).hexdigest()


def footprints_file(raw):
    """The footprints the buildings layer lacks (tools/footprints.py), which every reader of the
    buildings takes with them."""
    from . import MAP, ROOT as R
    p = os.path.join(raw, "footprints.geojson")
    return p if os.path.exists(p) else os.path.join(R, "data", MAP, "footprints.geojson.xz")


def file_digest(path):
    if not os.path.exists(path):
        return "missing"
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def key_of(*parts):
    return sha(json.dumps([VERSION, *parts], sort_keys=True, default=str))


def libraries():
    """The geometry libraries' versions: a new GEOS can move a coordinate in the last digit."""
    import shapely
    return [sys.version.split()[0], np.__version__, shapely.__version__, shapely.geos_version_string]


def tally_line(stage, keys, taken, built, secs):
    """One stage's line in `cache.txt`. A stage with a key a square shows the digest of them all."""
    key = keys[0] if len(keys) == 1 else sha("".join(keys))
    return f"{stage:<11} key {key[:10]}  {taken:>4} from the store  {built:>4} built  {secs:7.1f}s"


def add_stages(root, stages):
    """Add {stage: {output file: digest}} to `<root>/stages.json`, which `verify.py` compares."""
    path = os.path.join(root, "stages.json")
    have = json.load(open(path)) if os.path.exists(path) else {}
    have.update(stages)
    json.dump(have, open(path, "w"), indent=0, sort_keys=True)


# ---- code --------------------------------------------------------------------------------------

_MODULES = {}


def _module_path(name, here_pkg):
    """The file of a module the build owns, or None for a library."""
    if name.startswith("."):
        name = name.lstrip(".")
        return os.path.join(HERE, "__init__.py") if not name else os.path.join(HERE, f"{name}.py")
    if name == "partition":
        return os.path.join(HERE, "__init__.py")
    if name.startswith("partition."):
        return os.path.join(HERE, f"{name.split('.', 1)[1]}.py")
    p = os.path.join(TOOLS, f"{name}.py")
    return p if os.path.exists(p) else None


def _imports(node, path):
    """{local name: (module file, attribute or None)} for one import statement."""
    out = {}
    if isinstance(node, ast.Import):
        for a in node.names:
            mp = _module_path(a.name, path)
            if mp:
                out[a.asname or a.name.split(".")[0]] = (mp, None)
    elif isinstance(node, ast.ImportFrom):
        mod = "." * node.level + (node.module or "")
        mp = _module_path(mod, path)
        for a in node.names:
            # `from . import once` names a module; `from . import MAP` a thing in __init__
            sub = _module_path(f"{mod}{a.name}" if mod.endswith(".") else f"{mod}.{a.name}", path)
            if sub and os.path.exists(sub):
                out[a.asname or a.name] = (sub, None)
            elif mp:
                out[a.asname or a.name] = (mp, a.name)
    return out


def _module(path):
    """A module read for `code_key`: each top-level function and class with its source and the
    names it uses, the rest of the module's own statements, and what its imports bind."""
    if path in _MODULES:
        return _MODULES[path]
    text = open(path).read()
    tree = ast.parse(text)
    defs, header, imports = {}, [], {}
    for node in tree.body:
        src = ast.get_source_segment(text, node) or ""
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defs[node.name] = (src, _uses(node))
        elif _is_main(node):
            continue                    # runs only as a script, never when a stage imports it
        else:
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                imports.update(_imports(node, path))
                header.append((src, set()))
            else:
                header.append((src, _uses(node)))
    # imports inside functions bind names there too
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)) and node not in tree.body:
            for k, v in _imports(node, path).items():
                imports.setdefault(k, v)
    _MODULES[path] = (defs, header, imports)
    return _MODULES[path]


def _is_main(node):
    return (isinstance(node, ast.If) and isinstance(node.test, ast.Compare)
            and isinstance(node.test.left, ast.Name) and node.test.left.id == "__name__")


def _uses(node):
    """The plain names a piece of code uses, and `name.attr` for each attribute taken off a name. A
    name the function binds itself (an argument, assigned in it, or a function defined in it) is its
    own, not the module's."""
    out, own = set(), set()
    bases = {id(n.value) for n in ast.walk(node) if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name)}
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and id(n) in bases:
            continue                    # `once.read_parents` uses read_parents, not all of `once`
        if isinstance(n, ast.Name):
            if isinstance(n.ctx, ast.Load):
                out.add(n.id)
            else:
                own.add(n.id)
        elif isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name):
            out.add(f"{n.value.id}.{n.attr}")
        elif isinstance(n, ast.arg):
            own.add(n.arg)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n is not node:
            # a helper defined inside is the function's own: one called `once` is not the module
            own.add(n.name)
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        out = {u for u in out if u.partition(".")[0] not in own}
    return out


def code_key(*entries):
    """A digest of the code `entries` run: each ("module path", "function") entry's own source, the
    source of every function and class it uses in its module, and the same for whatever those use in
    other modules the build owns, followed to the end. Each module reached also brings its own
    top-level statements (its constants and imports), so a changed constant counts wherever the
    module is used. A function called by a name made at run time would be missed, which is why
    every stage's key also carries the stage's name and `VERSION`."""
    seen, parts, todo = set(), [], [(os.path.abspath(p), n) for p, n in entries]
    while todo:
        path, name = todo.pop()
        if (path, name) in seen:
            continue
        seen.add((path, name))
        defs, header, imports = _module(path)
        if (path, "<header>") not in seen:
            seen.add((path, "<header>"))
            for src, uses in header:
                parts.append((os.path.relpath(path, ROOT), "", src))
                todo += _follow(uses, path, defs, imports)
        if name is None:
            for n in defs:
                todo.append((path, n))
            continue
        if name not in defs:
            continue                    # a constant, already in the header
        src, uses = defs[name]
        parts.append((os.path.relpath(path, ROOT), name, src))
        todo += _follow(uses, path, defs, imports)
    return sha(json.dumps(sorted(parts)))


def _follow(uses, path, defs, imports):
    out = []
    for u in uses:
        base, _, attr = u.partition(".")
        if not attr and base in defs:
            out.append((path, base))
        elif base in imports:
            mp, thing = imports[base]
            if thing is None:
                # a module: `once.read_parents`, or the module itself passed about
                out.append((mp, attr) if attr else (mp, None))
            else:
                out.append((mp, thing))
    return out


# ---- the map layers ------------------------------------------------------------------------------

class Layers:
    """Digests of the parts of the map layers a window touches. A feature counts for a window when its
    lon/lat envelope, grown by `pad` metres, meets the window: the readers project before testing, so
    this takes in at least everything they can see, and a feature outside it can't change a stage."""

    def __init__(self, raw, cache_dir=None):
        self.raw = raw
        self.cache_dir = cache_dir
        self._layers = {}

    def _load(self, name):
        if name in self._layers:
            return self._layers[name]
        from . import MAP, ROOT as R
        from .data import _lonlat_bounds
        path = os.path.join(self.raw, name + ".geojson")
        if not os.path.exists(path):
            path = os.path.join(R, "data", MAP, name + ".geojson.xz")
        if not os.path.exists(path):
            self._layers[name] = (np.zeros((0, 4)), [])
            return self._layers[name]
        whole = file_digest(path)
        if name == "building":
            whole = sha(whole + file_digest(footprints_file(self.raw)))
        saved = os.path.join(self.cache_dir, "layers", f"{name}-{whole}.npz") if self.cache_dir else None
        if saved and os.path.exists(saved):
            z = np.load(saved)
            self._layers[name] = (z["env"], list(z["dig"]))
            return self._layers[name]
        feats = json.load(lzma.open(path) if path.endswith(".xz") else open(path))["features"]
        if name == "building" and os.path.exists(footprints_file(self.raw)):
            fp = footprints_file(self.raw)
            feats = feats + json.load(lzma.open(fp) if fp.endswith(".xz") else open(fp))["features"]
        env = np.array([_lonlat_bounds(f["geometry"]) for f in feats], float).reshape(-1, 4)
        dig = [sha(json.dumps(f, sort_keys=True)) for f in feats]
        if saved:
            os.makedirs(os.path.dirname(saved), exist_ok=True)
            np.savez(saved + ".tmp.npz", env=env, dig=np.array(dig))
            os.replace(saved + ".tmp.npz", saved)
        self._layers[name] = (env, dig)
        return self._layers[name]

    def digest(self, name, bbox, pad=100.0):
        from . import KX, KY, LON0, LAT0
        env, dig = self._load(name)
        if not len(dig):
            return "none"
        lon0, lat0 = (bbox[0] - pad) / KX + LON0, (bbox[1] - pad) / KY + LAT0
        lon1, lat1 = (bbox[2] + pad) / KX + LON0, (bbox[3] + pad) / KY + LAT0
        hit = ~((env[:, 2] < lon0) | (env[:, 0] > lon1) | (env[:, 3] < lat0) | (env[:, 1] > lat1))
        return sha("".join(dig[k] for k in np.nonzero(hit)[0]))

    def ridges(self, bbox, pad=100.0):
        """The lidar wall files of every square a window touches."""
        from . import MAP, ROOT as R
        from .data import squares_over
        return sha("".join(f"{t}{file_digest(os.path.join(R, 'data', MAP, 'measured', f'{t[0]}_{t[1]}.zip'))}"
                           for t in squares_over(bbox, pad=pad)))


# ---- the store -----------------------------------------------------------------------------------

class Store:
    """Stage outputs by key: `<root>/<stage>/<key>/` holds the files and a list of them."""

    def __init__(self, root):
        self.root = root
        self.hits = self.misses = 0

    def _dir(self, stage, key):
        return os.path.join(self.root, stage, key[:2], key)

    def get(self, stage, key, dest):
        """Copy a stored entry's files into `dest` and return {name: digest}, or None if it isn't
        stored. A copy, not a link: the passes write their files in place, which would change the
        stored one too."""
        d = self._dir(stage, key)
        man = os.path.join(d, "files.json")
        if not os.path.exists(man):
            self.misses += 1
            return None
        files = json.load(open(man))
        for name in files:
            src, to = os.path.join(d, "f", name), os.path.join(dest, name)
            os.makedirs(os.path.dirname(to) or dest, exist_ok=True)
            # copied with its time, so a file already in place from this entry isn't copied again
            if os.path.exists(to):
                a, b = os.stat(src), os.stat(to)
                if a.st_size == b.st_size and a.st_mtime_ns == b.st_mtime_ns:
                    continue
            shutil.copy2(src, to)
        os.utime(d)
        self.hits += 1
        return files

    def put(self, stage, key, src, names):
        """Store `names` (paths relative to `src`) under `key`, and return {name: digest}."""
        files = {n: file_digest(os.path.join(src, n)) for n in names if os.path.exists(os.path.join(src, n))}
        d = self._dir(stage, key)
        tmp = d + f".tmp{os.getpid()}"
        shutil.rmtree(tmp, ignore_errors=True)
        for n in files:
            os.makedirs(os.path.dirname(os.path.join(tmp, "f", n)), exist_ok=True)
            shutil.copy2(os.path.join(src, n), os.path.join(tmp, "f", n))
        json.dump(files, open(os.path.join(tmp, "files.json"), "w"))
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        os.replace(tmp, d)
        return files

    def prune(self, keep_bytes=40e9):
        """Drop the entries used longest ago once the store is over `keep_bytes`."""
        if not os.path.isdir(self.root):
            return
        entries = []
        for stage in os.listdir(self.root):
            sd = os.path.join(self.root, stage)
            if stage == "layers" or not os.path.isdir(sd):
                continue
            for pre in os.listdir(sd):
                for k in os.listdir(os.path.join(sd, pre)):
                    d = os.path.join(sd, pre, k)
                    size = sum(os.path.getsize(os.path.join(a, f)) for a, _, fs in os.walk(d) for f in fs)
                    entries.append((os.path.getmtime(d), size, d))
        total = sum(s for _, s, _ in entries)
        for _, size, d in sorted(entries):
            if total <= keep_bytes:
                break
            shutil.rmtree(d, ignore_errors=True)
            total -= size
