"""What the partition reads from the lidar, kept in the repository so a fresh clone builds the same map.

The lidar itself is gigabytes and isn't kept (see docs/new-area.md to fetch it). The partition reads
two things from it, and both are kept in `data/<map>/measured/partition.zip`:

- for every square, what stands above the bare ground on the survey's 1 m cells, as one of four
  classes (lower than `FLOOR`, up to `TALL`, `TALL` or more, or not seen), which is all
  `standing.py` and the writer's `lidar_tall` ask of it. A change to either height needs the lidar
  again and a fresh pack;
- the bare ground (DTM) round every bridge, where the writer looks under a span for the bed, the
  bank or the road below (`write_tile.surveyed_ground`). "Round every bridge" is 30 m round every
  street edge the city-wide passes give a span, and round every bridge OpenStreetMap maps, to the
  centimetre, on the map's own metre grid (so the build needs no National Grid conversion). A
  ground point asked for outside that is counted (`missed`), and the stage says so: pack again.

`python3 -I tools/mapdata.py pack <map> <raw dir>` packs it, from the lidar in `<raw dir>/lidar`
and the passes in `<raw dir>/partition/once` (the map build makes both). Nothing here is decided
over the network.
"""
import io
import json
import os
import zipfile

import numpy as np

from . import MAP, ROOT

FLOOR = 0.5         # metres: standing.FLOOR
TALL = 1.5          # metres: write_tile.LIDAR_TALL
REACH = 30.0        # metres round a bridge whose bare ground is kept
PIECE = 50.0        # metres: a bridge's line is taken in pieces this long
NONE = -32768       # in the kept centimetres: the survey has no ground there
BLOCK = 50          # metres: the ground is kept in squares this size of the map's own grid

PATH = os.path.join(ROOT, "data", MAP, "measured", "partition.zip")
_kept = {}
missed = [0]


def _zip():
    if "z" not in _kept:
        _kept["z"] = zipfile.ZipFile(PATH) if os.path.exists(PATH) else None
    return _kept["z"]


def standing(sq):
    """The square's grid as `standing.ndsm` gives it, with each class as its lowest height (so the
    same tests give the same answers), or None if it isn't kept."""
    z = _zip()
    name = "standing/%d_%d_%d_%d.npy" % tuple(round(v) for v in sq)
    if z is None or name not in z.namelist():
        return None
    k = np.load(io.BytesIO(z.read(name)))
    return np.array([0.0, FLOOR, TALL, np.nan], dtype=np.float32)[k]


def _blocks():
    if "w" not in _kept:
        z = _zip()
        _kept["w"] = {}
        if z is not None and "under-bridges.npz" in z.namelist():
            a = np.load(io.BytesIO(z.read("under-bridges.npz")))
            for (bx, by), g in zip(a["at"], a["cm"]):
                _kept["w"][int(bx), int(by)] = np.where(g == NONE, np.nan, g / 100.0)
    return _kept["w"]


def under_bridges(xs, ys):
    """The kept bare ground at map points, NaN where there is none: the survey's cell under the
    middle of the map's metre the point is in. Returns (heights, found)."""
    blocks = _blocks()
    cx, cy = np.floor(xs).astype(int), np.floor(ys).astype(int)
    out = np.full(len(cx), np.nan)
    found = np.zeros(len(cx), dtype=bool)
    for k, (x, y) in enumerate(zip(cx, cy)):
        g = blocks.get((x // BLOCK, y // BLOCK))
        if g is not None:
            out[k] = g[y % BLOCK, x % BLOCK]
            found[k] = True
    missed[0] += int((~found).sum())
    return out, found


def _save(z, name, a):
    b = io.BytesIO()
    np.save(b, a)
    info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_LZMA
    z.writestr(info, b.getvalue())


def pack(raw, once=None):
    """Measure both from the lidar in `<raw>/lidar` and the passes in `once` (`<raw>/partition/once`)."""
    import rasterio
    from shapely.geometry import LineString
    from shapely.ops import substring
    from rasterio.windows import Window
    from lidar import _to_bng
    from . import KX, KY, LAT0, LON0, Q, load_layer
    from .city import squares
    from .once import read_graph, read_structures
    from . import standing as S
    from . import write_tile as W
    assert S.FLOOR == FLOOR and W.LIDAR_TALL == TALL, "the kept classes no longer match the tests"
    once = once or os.path.join(raw, "partition", "once")
    side = Q.dx * Q.cells
    tmp = PATH + ".tmp"
    with zipfile.ZipFile(tmp, "w") as z:
        for ti, tj in sorted(squares()):
            sq = (Q.x0 + ti * side, Q.y0 + tj * side, Q.x0 + (ti + 1) * side, Q.y0 + (tj + 1) * side)
            got = S.ndsm(sq, raw_only=True)
            if got is None:
                continue
            g = got[0]
            k = np.where(np.isnan(g), 3, (g >= FLOOR).astype(np.uint8) + (g >= TALL)).astype(np.uint8)
            _save(z, "standing/%d_%d_%d_%d.npy" % tuple(round(v) for v in sq), k)

        lines = []
        spans = read_structures(once)
        for e in read_graph(once):
            if (spans.get(e["id"]) or {}).get("span"):
                lines.append(e["line"])
        bb = (-1e6, -1e6, 1e6, 1e6)
        for g, p in load_layer(raw, "osm-bridges", bb):
            lines += [g.exterior] if g.geom_type == "Polygon" else list(getattr(g, "geoms", [g]))
        blocks = set()
        for l in lines:
            if l.geom_type == "Polygon":
                l = l.exterior
            if l.geom_type != "LineString" or l.length == 0:
                continue
            for k in range(int(l.length // PIECE) + 1):
                x0, y0, x1, y1 = substring(l, k * PIECE, min(l.length, (k + 1) * PIECE)).buffer(REACH).bounds
                blocks |= {(bx, by) for bx in range(int(x0 // BLOCK), int(x1 // BLOCK) + 1)
                           for by in range(int(y0 // BLOCK), int(y1 // BLOCK) + 1)}
        at = np.array(sorted(blocks), dtype=np.int32).reshape(-1, 2)
        grid = np.full((len(at), BLOCK, BLOCK), np.nan, dtype=np.float32)
        srcs = [rasterio.open(os.path.join(raw, "lidar", "dtm", f))
                for f in sorted(os.listdir(os.path.join(raw, "lidar", "dtm"))) if f.endswith(".tif")]
        cell = np.arange(BLOCK) + 0.5
        for i, (bx, by) in enumerate(at):
            gx, gy = np.meshgrid(bx * BLOCK + cell, by * BLOCK + cell)
            e, n = _to_bng((gx.ravel() / KX + LON0, gy.ravel() / KY + LAT0))
            v = grid[i].reshape(-1)
            for src in srcs:
                col, row = ~src.transform @ (e, n)
                col, row = np.floor(col).astype(int), np.floor(row).astype(int)
                ok = (row >= 0) & (row < src.height) & (col >= 0) & (col < src.width)
                if not ok.any():
                    continue
                c0, r0 = col[ok].min(), row[ok].min()
                a = src.read(1, window=Window(c0, r0, col[ok].max() - c0 + 1, row[ok].max() - r0 + 1)).astype(np.float32)
                got = a[row[ok] - r0, col[ok] - c0]
                got[(got < -100) | (got > 2000)] = np.nan
                v[ok] = got
        b = io.BytesIO()
        np.savez(b, at=at, cm=np.where(np.isnan(grid), NONE, np.round(grid * 100)).astype(np.int16))
        info = zipfile.ZipInfo("under-bridges.npz", (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_LZMA
        z.writestr(info, b.getvalue())
    os.replace(tmp, PATH)
    print(f"partition's lidar: {len(at)} blocks of {BLOCK} m round the bridges; "
          f"{os.path.getsize(PATH) / 1e6:.1f} MB in {PATH}")
