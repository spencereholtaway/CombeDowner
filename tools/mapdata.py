"""The map's data, kept in the repository (data/<map>/), so anyone can rebuild the map from a fresh
clone with no downloads, and get exactly the map everyone else gets.

Usage:
  python3 -I tools/mapdata.py unpack <map> [<raw dir>]   the repository's copy -> a raw dir to build from
  python3 -I tools/mapdata.py pack <map> <raw dir>       a raw dir (fresh downloads) -> the repository's copy

The raw dir is the one the builds read (data/raw/<map>/wide unless given). What's kept, in
data/<map>/ (see the README there for where each comes from and its licence):
- the map data itself: Overture's layers, without what no tool reads (where each feature came from,
  connectors, websites and the like, and the outlines prep_tiles.SKIP leaves out), and the
  OpenStreetMap and food hygiene downloads, as they were;
- HM Land Registry's INSPIRE Index Polygons for the area (tools/parcels.py, from the one download
  that is a plain file rather than an API), which only the partition build reads;
- Historic England's listed railings and walls (tools/listed.py), which only the partition build
  reads;
- the energy certificates without addresses: for each address point, its latest certificate's
  property type and the wall material it names (domestic), or the words of the premises' name as
  hashes (non-domestic, see shops.py), and its OS Open UPRN position;
- the Mapzen terrain tiles the builds read (zoom 15 for the squares, the canal and the railway,
  zoom 14 for the wide file), packed smaller;
- what the builds measure from the lidar and the tree canopy map (gigabytes, so not kept: see
  docs/new-area.md to fetch them), in measured/: for each square, what the survey shows of each
  building's roof (its heights as percentiles, the ground at its walls, the roof planes fitted to
  it: lidar.survey, judged at build time by lidar.decide, so a change to how it is judged needs no
  fresh survey) and where its roof levels split it, keyed by footprint; and the tree canopy as the
  build reads it (the tree tops, the low growth for shrubs, and the canopy heights to the
  precision the woods and hedges are worked out to); and for the wide file, the tree tops of the canopy map.

unpack writes the layers, the certificates and the terrain tiles into the raw dir; the builds then
read the measurements from data/<map>/measured/ by default, in place of the lidar and the canopy
map (tools/prep_tiles.py and tools/prep_wide.py, and --measure to measure afresh from them).
pack does the rest after a fresh download: tools/prep_tiles.py and tools/prep_wide.py with
--measure write the measurements, then pack takes the layers, the certificates and the terrain
tiles the builds used. Rebuilding from the repository's copy gives byte for byte the same map as
building from the raw downloads.

Everything is written the same way each time (no dates in the archives), so packing unchanged
data changes no files.
"""
import csv, glob, hashlib, io, json, lzma, math, os, sys, zipfile
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OVERTURE = ["building", "segment", "water", "land_use", "land", "land_cover", "place", "infrastructure"]
# OpenStreetMap (businesses; streets' widths), the food hygiene ratings, the Land Registry
# parcels and the listed railings and walls, kept whole
OTHER = ["osm", "osm-roads", "fsa", "parcels", "listed"]
# Overture properties no tool reads: where each feature came from, the road network's connectors
# and rules, and places' contact details. Everything else is kept as it is.
DROP = {"sources", "version", "connectors", "addresses", "websites", "socials", "phones", "emails",
        "speed_limits", "road_surface", "prohibited_transitions", "destinations", "width_rules",
        "subclass_rules", "level_rules", "cartography"}
TERRAIN = {15: "terrain15", 14: "terrain"}     # zoom -> the folder in the raw dir the builds keep them in


def data_dir(map_id):
    return os.path.join(ROOT, "data", map_id)


def measured_dir(map_id):
    return os.path.join(data_dir(map_id), "measured")


# ---- archives ----------------------------------------------------------------------------------

def write_zip(path, entries):
    """entries: {name: bytes}, each compressed as hard as xz goes, in name order, with no dates,
    so the same data always makes the same file."""
    tmp = path + ".tmp"
    with zipfile.ZipFile(tmp, "w") as z:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name + ".xz", date_time=(1980, 1, 1, 0, 0, 0))
            z.writestr(info, lzma.compress(entries[name], preset=9 | lzma.PRESET_EXTREME))
    os.replace(tmp, path)


def read_zip(path):
    """What write_zip wrote: {name: bytes}."""
    with zipfile.ZipFile(path) as z:
        return {n[:-3]: lzma.decompress(z.read(n)) for n in z.namelist()}


def npy(a):
    b = io.BytesIO()
    np.save(b, np.ascontiguousarray(a), allow_pickle=False)
    return b.getvalue()


def from_npy(b):
    return np.load(io.BytesIO(b), allow_pickle=False)


def write_xz(path, data):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f: f.write(lzma.compress(data, preset=9 | lzma.PRESET_EXTREME))
    os.replace(tmp, path)


# ---- the measurements of one square (or of the wide file) ----------------------------------------

def key(poly):
    """A footprint's key: its exact outline."""
    return hashlib.sha1(poly.wkb).hexdigest()[:20]


# The canopy heights woods and hedges are worked out from (prep_map.py: a wood's canopy is the
# whole metres from 4 m up to 40 m, and a garden boundary is a hedge where the growth is 1 to
# 4.5 m), as one byte per pixel: 0 under 1 m, 1 for 1-4 m, 2 for 4-4.5 m, 3 for 4.5-5 m, then the
# whole metres up to 40. Each byte stands for a height that falls on the same side of all of those.
CODE_AS = np.arange(256, dtype=np.float32)
CODE_AS[:5] = (0.0, 1.0, 4.0, 4.75, 0.0)       # (4 is never used: from 5 up, the byte is the height)


def canopy_code(h):
    whole = np.floor(np.minimum(h, 40)).astype(np.int64)
    return np.where(h < 1, 0, np.where(h < 4, 1, np.where(h <= 4.5, 2, np.where(h < 5, 3, whole)))).astype(np.uint8)


class StoredCanopy:
    """A canopy (canopy.py) as the measurements keep it: the same window and pixel grid, and the
    answers the build asks of it. Measuring, it wraps the real canopy and keeps each answer as it
    gives it (passed through how it is kept, so measuring and rebuilding build the same map)."""

    def __init__(self, meta, code, tops, low, real=None):
        from canopy import Canopy
        self.c = Canopy.__new__(Canopy)
        self.c._place(meta["x0"], meta["dx"], meta["y0"], meta["dy"], meta["row0"], meta["col0"], tuple(meta["to_model"]))
        self.c.aligned = meta["aligned"]
        self.meta, self.code, self.tops, self.low, self.real = meta, code, tops, low, real
        self.aligned = meta["aligned"]
        self.model_xy = self.c.model_xy

    @classmethod
    def measuring(cls, real):
        meta = dict(x0=real.x0, dx=real.dx, y0=real.y0, dy=real.dy, row0=real.row0, col0=real.col0,
                    to_model=list(real.to_model), aligned=real.aligned)
        return cls(meta, canopy_code(real.h), {}, {}, real)

    def at(self, x, y):
        X, Y = self.c.merc(x, y)
        i, j = int((X - self.c.x0) / self.c.dx), int((Y - self.c.y0) / self.c.dy)
        if 0 <= j < self.code.shape[0] and 0 <= i < self.code.shape[1]: return float(CODE_AS[self.code[j, i]])
        return 0.0

    def _ask(self, table, k, work):
        if k not in table:
            if self.real is None: raise SystemExit(f"the canopy measurements have no {k}: measure afresh (--measure, with the canopy map)")
            table[k] = work()
        return table[k]

    def tree_tops(self, min_height=3.0, radius_m=2.6):
        k = f"tops {min_height} {radius_m}"
        px = self._ask(self.tops, k, lambda: pack_points(self.real.tree_tops(min_height, radius_m, pixels=True)))
        return [(*self.model_xy(int(i), int(j)), float(h)) for i, j, h in unpack_points(px)]

    def low_growth(self, step_px, lo, hi):
        k = f"low {step_px} {lo} {hi}"
        px = self._ask(self.low, k, lambda: pack_points([(i, j, round(h, 1)) for i, j, h in self.real.low_growth(step_px, lo, hi)], tenths=True))
        return [(int(i), int(j), float(h)) for i, j, h in unpack_points(px)]

    def entries(self, prefix):
        out = {f"{prefix}canopy.json": json.dumps(self.meta, sort_keys=True).encode(), f"{prefix}canopy-code.npy": npy(self.code)}
        for table in (self.tops, self.low):
            for k, a in table.items(): out[f"{prefix}canopy-{k.replace(' ', '_')}.npy"] = npy(a)
        return out

    @classmethod
    def from_entries(cls, z, prefix):
        meta = json.loads(z[f"{prefix}canopy.json"])
        tops, low = {}, {}
        for name, b in z.items():
            if not name.startswith(f"{prefix}canopy-") or name == f"{prefix}canopy-code.npy": continue
            k = name[len(prefix) + 7:-4].replace("_", " ")
            (tops if k.startswith("tops") else low)[k] = from_npy(b)
        return cls(meta, from_npy(z[f"{prefix}canopy-code.npy"]), tops, low)


def pack_points(pts, tenths=False):
    """(i, j, height) pixels as one array, in order: rows i, j, the height (its float32 bits, or
    with tenths, tenths of a metre: the low growth is only ever read to the tenth) and which of
    the two it is."""
    a = np.zeros((4, len(pts)), dtype=np.int32)
    for n, (i, j, h) in enumerate(pts):
        a[:, n] = (i, j, round(h * 10) if tenths else np.float32(h).view(np.int32), 1 if tenths else 0)
    return a


def unpack_points(a):
    if a.shape[1] == 0: return []
    hs = a[2] / 10 if a[3, 0] else a[2].astype(np.int32).view(np.float32).astype(np.float64)
    return list(zip(a[0].tolist(), a[1].tolist(), hs.tolist()))


class Store:
    """One square's measurements: data/<map>/measured/<ti>_<tj>.zip. Measuring (record), each
    answer is worked out from the lidar and the canopy map and kept; otherwise each is read back.
    A footprint the measurements don't have (a change to the footprints since they were measured)
    gets no measurement, and keeps the rule-based guess, as where the survey doesn't reach."""

    def __init__(self, path, record=False):
        self.path, self.record = path, record
        self.roofs, self.bld, self.canopy, self.missed, self.walls = {}, {}, None, 0, None
        self.z = {}
        if not record:
            if not os.path.exists(path): raise SystemExit(f"no measurements in {path}: measure them (--measure, with the lidar and the canopy map)")
            self.z = read_zip(path)
            self.roofs = json.loads(self.z.get("roofs.json", b"{}"))
            self.bld = unsplit_numbers(json.loads(self.z.get("buildings.json", b"{}")), from_npy(self.z["buildings-numbers.npy"]) if "buildings-numbers.npy" in self.z else [])
            self.bld = {k: unfold_axes(v) for k, v in self.bld.items()}
            self.walls = json.loads(self.z["walls.json"]) if "walls.json" in self.z else None

    # roof levels (buildings.roof_parts): None (not split), or the parts' outlines
    def put_roofs(self, polys, found):
        import shapely
        out = []
        for poly, parts in zip(polys, found):
            if parts is None: out.append(None); continue
            k = key(poly)
            self.roofs[k] = None if len(parts) == 1 and parts[0] is poly else [p.wkb_hex for p in parts]
            out.append(self._roofs(poly, self.roofs[k]))
        return out

    def get_roofs(self, poly):
        k = key(poly)
        if k not in self.roofs: self.missed += 1; return None
        return self._roofs(poly, self.roofs[k])

    @staticmethod
    def _roofs(poly, kept):
        import shapely
        return [poly] if kept is None else [shapely.from_wkb(bytes.fromhex(h)) for h in kept]

    # what the survey shows of each roof (lidar.Lidar.survey), for lidar.decide to judge
    def put_buildings(self, polys, found):
        out = []
        for poly, got in zip(polys, found):
            k = key(poly)
            self.bld[k] = _plain(got)
            out.append(json.loads(json.dumps(self.bld[k])))
        return out

    def get_buildings(self, polys):
        out = []
        for poly in polys:
            k = key(poly)
            if k not in self.bld: self.missed += 1; out.append(None); continue
            out.append(json.loads(json.dumps(self.bld[k])))
        return out

    # the walls, fences and hedges the lidar sees (walls.lidar_walls): None if not measured
    def put_walls(self, found):
        self.walls = json.loads(json.dumps(found))
        return json.loads(json.dumps(self.walls))

    def get_walls(self):
        return None if self.walls is None else json.loads(json.dumps(self.walls))

    # the tree canopy, once the lidar has refined it
    def put_canopy(self, canopy):
        self.canopy = None if canopy is None else StoredCanopy.measuring(canopy)
        return self.canopy

    def get_canopy(self):
        return StoredCanopy.from_entries(self.z, "") if "canopy.json" in self.z else None

    def save(self):
        if not self.record: return
        shape, numbers = split_numbers({k: fold_axes(v) for k, v in sorted(self.bld.items())})
        entries = {"roofs.json": json.dumps(self.roofs, sort_keys=True, separators=(",", ":")).encode(),
                   "buildings.json": json.dumps(shape, separators=(",", ":")).encode(),
                   "buildings-numbers.npy": npy(np.array(numbers, dtype="<f8"))}
        if self.canopy is not None: entries.update(self.canopy.entries(""))
        if self.walls is not None: entries["walls.json"] = json.dumps(self.walls, separators=(",", ":")).encode()
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        write_zip(self.path, entries)


def split_numbers(v):
    """A measurement's floats taken out into one list (each "f" in its place), as they pack much
    smaller as numbers than as text: (shape, floats)."""
    numbers = []
    def walk(v):
        if isinstance(v, float): numbers.append(v); return "f"
        if isinstance(v, dict): return {k: walk(x) for k, x in v.items()}
        if isinstance(v, list): return [walk(x) for x in v]
        return v
    return walk(v), numbers


def fold_axes(got):
    """A survey with each direction that is the footprint's own axis u, or v across it, kept as 0
    or 1 rather than as two numbers (fit_roof tries both, and the ridge runs along one)."""
    if not got or not got.get("fit"): return got
    ux, uy = got["fit"]["u"]
    axes = ([ux, uy], [-uy, ux])
    def fold(d): return axes.index(d) if d in axes else d
    fit = dict(got["fit"], fits=[f[:2] + [fold(f[2])] + f[3:] for f in got["fit"]["fits"]])
    return dict(got, u=fold(got["u"]), fit=fit)


def unfold_axes(got):
    if not got or not got.get("fit"): return got
    ux, uy = got["fit"]["u"]
    axes = ([ux, uy], [-uy, ux])
    def unfold(d): return list(axes[d]) if isinstance(d, int) else d
    fit = dict(got["fit"], fits=[f[:2] + [unfold(f[2])] + f[3:] for f in got["fit"]["fits"]])
    return dict(got, u=unfold(got["u"]), fit=fit)


def unsplit_numbers(shape, numbers):
    it = iter(np.asarray(numbers, dtype=np.float64).tolist())
    def walk(v):
        if v == "f": return next(it)
        if isinstance(v, dict): return {k: walk(x) for k, x in v.items()}
        if isinstance(v, list): return [walk(x) for x in v]
        return v
    return walk(shape)


def _plain(v):
    """A measurement as plain Python numbers, lists and dicts, which JSON keeps exactly."""
    if v is None or isinstance(v, str): return v
    if isinstance(v, dict): return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, (tuple, list)): return [_plain(x) for x in v]
    if isinstance(v, (bool, np.bool_)): return bool(v)
    if isinstance(v, (int, np.integer)): return int(v)
    return float(v)


class WideTops:
    """The wide file's tree tops (prep_wide.py), one set per window of the canopy map."""

    def __init__(self, path, record=False):
        self.path, self.record, self.windows = path, record, {}
        if not record:
            if not os.path.exists(path): raise SystemExit(f"no measurements in {path}: measure them (--measure, with the canopy map)")
            entries = read_zip(path)
            for n in entries:
                if n.endswith("canopy.json"):
                    p = n[:-len("canopy.json")]
                    self.windows[p.rstrip("/")] = StoredCanopy.from_entries(entries, p)

    def canopy(self, name, open_real):
        """The canopy of one window: measuring, open_real() opens the canopy map's window."""
        if self.record:
            c = self.windows[name] = StoredCanopy.measuring(open_real())
            c.code = np.zeros((0, 0), dtype=np.uint8)       # (only the tree tops are asked of these)
            return c
        if name not in self.windows: raise SystemExit(f"the wide file's measurements have no window {name}: measure afresh (--measure)")
        return self.windows[name]

    def save(self):
        if not self.record: return
        entries = {}
        for name, c in self.windows.items(): entries.update(c.entries(name + "/"))
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        write_zip(self.path, entries)


# ---- pack and unpack -------------------------------------------------------------------------------

def pack(map_id, raw):
    from prep_tiles import SKIP      # the outlines no square reads (Great Britain's coastline and the like)
    out = data_dir(map_id)
    os.makedirs(os.path.join(out, "epc"), exist_ok=True)
    for layer in OVERTURE + OTHER:
        path = os.path.join(raw, f"{layer}.geojson")
        if not os.path.exists(path):
            print(f"{layer}: not in {raw}, left as it was"); continue
        fs = json.load(open(path))["features"]
        if layer in SKIP: fs = [f for f in fs if not SKIP[layer](f["properties"])]
        if layer in OVERTURE:
            for f in fs: f["properties"] = {k: v for k, v in f["properties"].items() if k not in DROP}
        text = '{"type":"FeatureCollection","features":[' + ",\n".join(json.dumps(f, separators=(",", ":"), ensure_ascii=False) for f in fs) + "]}\n"
        write_xz(os.path.join(out, f"{layer}.geojson.xz"), text.encode())
        print(f"{layer}: {len(fs)} features, {os.path.getsize(path) / 1e6:.1f} MB -> {os.path.getsize(os.path.join(out, f'{layer}.geojson.xz')) / 1e6:.1f} MB")
    pack_epc(os.path.join(raw, "epc"), os.path.join(out, "epc"))
    for zoom, folder in TERRAIN.items():
        pack_terrain(os.path.join(raw, folder), zoom, os.path.join(out, f"terrain{zoom}.zip"))


def unpack(map_id, raw):
    src = data_dir(map_id)
    os.makedirs(os.path.join(raw, "epc"), exist_ok=True)
    for layer in OVERTURE + OTHER:
        path = os.path.join(src, f"{layer}.geojson.xz")
        if os.path.exists(path):
            with open(os.path.join(raw, f"{layer}.geojson"), "wb") as f: f.write(lzma.decompress(open(path, "rb").read()))
    for name in ("certificates", "non-domestic", "uprn"):
        path = os.path.join(src, "epc", f"{name}.csv.xz")
        if os.path.exists(path):
            with open(os.path.join(raw, "epc", f"{name}.csv"), "wb") as f: f.write(lzma.decompress(open(path, "rb").read()))
    for zoom, folder in TERRAIN.items():
        unpack_terrain(os.path.join(src, f"terrain{zoom}.zip"), zoom, os.path.join(raw, folder))
    print(f"{map_id}: unpacked into {raw}; the measurements are read from {measured_dir(map_id)}")


def pack_epc(raw, out):
    """The certificates, cut down to what the build reads, with no addresses (see the top)."""
    from epc import WALLS
    from shops import hashed_words
    certs, nondom, uprns = (os.path.join(raw, f"{n}.csv") for n in ("certificates", "non-domestic", "uprn"))
    if not os.path.exists(uprns): print("epc: no certificates, left as they were"); return
    where = {}
    with open(uprns, encoding="utf-8-sig") as f:
        rows = [(r["UPRN"], r["LATITUDE"], r["LONGITUDE"]) for r in csv.DictReader(f)]
    known = {u for u, _, _ in rows}
    used = set()

    def latest(path, newer):
        out = {}
        with open(path, encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f):
                u = r.get("uprn")
                if u not in known: continue
                if u in out and not newer(out[u], r): continue
                out[u] = r
        return out

    def write(name, header, lines):
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(header); w.writerows(lines)
        write_xz(os.path.join(out, f"{name}.csv.xz"), buf.getvalue().encode())

    if os.path.exists(certs):
        # (epc.py keeps the first of two on the same day)
        homes = latest(certs, lambda old, r: old["lodgement_date"] < r["lodgement_date"])
        lines = []
        for u, r in homes.items():
            desc = r["walls_description"].lower()
            lines.append([u, r["lodgement_date"], next((k for k, _ in WALLS if k in desc), ""), r["property_type"]])
        used |= set(homes)
        write("certificates", ["uprn", "lodgement_date", "walls_description", "property_type"], lines)
        print(f"epc: {len(homes)} homes")
    if os.path.exists(nondom):
        premises = latest(nondom, lambda old, r: old["lodgement_date"] < r["lodgement_date"])
        used |= set(premises)
        write("non-domestic", ["uprn", "lodgement_date", "words"],
              [[u, r["lodgement_date"], " ".join(sorted(hashed_words(r["address"].split(",")[0])))] for u, r in premises.items()])
        print(f"epc: {len(premises)} premises")
    write("uprn", ["UPRN", "LATITUDE", "LONGITUDE"], [row for row in rows if row[0] in used])


def pack_terrain(folder, zoom, path):
    """The terrain tiles in folder (terrarium PNGs) as one archive: each tile's 24-bit heights,
    as differences across and then down it, which pack much smaller than the PNGs."""
    from PIL import Image
    files = sorted(glob.glob(os.path.join(folder, f"{zoom}_*_*.png")))
    if not files: print(f"terrain {zoom}: none in {folder}, left as it was"); return
    tiles, vals = [], []
    for f in files:
        _, tx, ty = os.path.basename(f)[:-4].split("_")
        a = np.asarray(Image.open(f).convert("RGB")).astype(np.int32)
        v = (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
        d = v.copy(); d[:, 1:] = v[:, 1:] - v[:, :-1]
        d[1:, :] = d[1:, :] - d[:-1, :].copy()
        tiles.append((int(tx), int(ty))); vals.append(d)
    order = sorted(range(len(tiles)), key=lambda k: tiles[k])
    write_zip(path, {"tiles.npy": npy(np.array([tiles[k] for k in order], dtype=np.int32)),
                     "heights.npy": npy(np.stack([vals[k] for k in order]).astype("<i4"))})
    print(f"terrain {zoom}: {len(files)} tiles, {sum(os.path.getsize(f) for f in files) / 1e6:.1f} MB -> {os.path.getsize(path) / 1e6:.1f} MB")


def unpack_terrain(path, zoom, folder):
    from PIL import Image
    if not os.path.exists(path): return
    z = read_zip(path)
    tiles, d = from_npy(z["tiles.npy"]), from_npy(z["heights.npy"]).astype(np.int64)
    v = np.cumsum(np.cumsum(d, axis=1), axis=2)
    os.makedirs(folder, exist_ok=True)
    for (tx, ty), t in zip(tiles.tolist(), v):
        rgb = np.stack([(t >> 16) & 255, (t >> 8) & 255, t & 255], axis=-1).astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(os.path.join(folder, f"{zoom}_{tx}_{ty}.png"))


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    if len(sys.argv) < 3 or sys.argv[1] not in ("pack", "unpack"): raise SystemExit(__doc__)
    cmd, map_id = sys.argv[1], sys.argv[2]
    raw = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, "data", "raw", map_id, "wide")
    (pack if cmd == "pack" else unpack)(map_id, raw)
