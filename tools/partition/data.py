"""The raw layers, read once and indexed, so a pass can ask what is near a box.

Stage 3b builds each *thing* once - a street edge, a worked block - with a window sized to the
thing rather than to the square. A pass therefore asks for the buildings, barriers, parcels, land
use and lidar wall runs near an arbitrary box many times per square, and `load_layer` re-reads a
whole layer file on every call, which is fine once per square and hopeless once per edge. So the
layers are read once here, converted to map metres, and indexed; a pass asks `near(bbox, layer)`
and gets back only what it needs.

The lidar wall runs are per square (`data/<map>/measured/<ti>_<tj>.zip`), so a window that crosses
squares needs the runs of every square it touches: `ridges_near` gathers them and drops the ones
outside the window's own margin, so a window sees exactly the runs it covers.
"""
import json
import lzma
import os
import zipfile

import shapely
import numpy as np
from shapely.geometry import LineString, box
from shapely.strtree import STRtree

from . import KX, KY, LON0, LAT0, MAP, Q, ROOT
from .corridors import REACH

SIZE = Q.dx * Q.cells

# the layers, read once per process and kept as the raw JSON features so a window can be taken from
# them without re-decoding. `_FEATURES` holds {"layer": (features, [(minx, miny, maxx, maxy) lon/lat])}
_FEATURES = {}


# layers the passes can run without: the plots then follow the evidence alone
OPTIONAL = ("parcels",)


def _lonlat_bounds(g):
    """A geometry's lon/lat envelope, walked through its coordinates because the layers hold mixed
    geometry (a Point is [x, y], a LineString [[x, y], ...], a Polygon or MultiPolygon nests
    further, a GeometryCollection holds geometries). A collection's own envelope used to be a
    stand-in (0, 0, 0, 0), which the window test always dropped."""
    flat, stack = [], [g.get("coordinates", [])]
    for sub in g.get("geometries", []):
        stack.append(sub.get("coordinates", []))
        stack.extend(s.get("coordinates", []) for s in sub.get("geometries", []))
    while stack:
        v = stack.pop()
        if isinstance(v, (list, tuple)) and v and isinstance(v[0], (int, float)):
            flat.append(v)
        else:
            stack.extend(v if isinstance(v, (list, tuple)) else [])
    xs = [c[0] for c in flat] or [0.0]
    ys = [c[1] for c in flat] or [0.0]
    return (min(xs), min(ys), max(xs), max(ys))


def _features(raw, name):
    """One layer's features, as they are in the file, read once per process."""
    if name not in _FEATURES:
        path = os.path.join(raw, name + ".geojson")
        packed = os.path.join(ROOT, "data", MAP, name + ".geojson.xz")
        if os.path.exists(path):
            feats = json.load(open(path))["features"]
        elif name in OPTIONAL and not os.path.exists(packed):
            feats = []
        else:
            feats = json.load(lzma.open(packed))["features"]
        # each feature's lon/lat envelope, computed once, so a window can be answered without
        # projecting anything: this is what keeps a worker to a window rather than the whole city
        bounds = [_lonlat_bounds(f["geometry"]) for f in feats]
        _FEATURES[name] = (feats, bounds)
    return _FEATURES[name]


def owner_of(bounds):
    """Which square owns a thing, by geometry only: the square holding its midpoint, the midpoint
    being the centre of its bounding box. Never by order of discovery, so the same thing is owned
    by the same square however many processes ran and in whatever order."""
    x0, y0, x1, y1 = bounds
    ti = int((((x0 + x1) / 2 - Q.x0) // SIZE))
    tj = int((((y0 + y1) / 2 - Q.y0) // SIZE))
    return ti, tj


def box_of(ti, tj):
    return (Q.x0 + ti * SIZE, Q.y0 + tj * SIZE, Q.x0 + (ti + 1) * SIZE, Q.y0 + (tj + 1) * SIZE)


def squares_over(bounds, pad=0.0):
    """Every square a box touches (grown by pad), as (ti, tj) in a fixed order."""
    x0, y0, x1, y1 = bounds
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    a, b = int((x0 - Q.x0) // SIZE), int((y0 - Q.y0) // SIZE)
    c, d = int((x1 - Q.x0) // SIZE), int((y1 - Q.y0) // SIZE)
    return [(ti, tj) for ti in range(a, c + 1) for tj in range(b, d + 1)]


def neighbours(ti, tj):
    """The square and the eight round it, in a fixed order."""
    return [(ti + i, tj + j) for i in (-1, 0, 1) for j in (-1, 0, 1)]


def load_ridges(raw, ti, tj):
    """The lidar wall runs the build kept for one square (data/<map>/measured/<ti>_<tj>.zip)."""
    ridges = []
    mz = os.path.join(ROOT, "data", MAP, "measured", f"{ti}_{tj}.zip")
    if os.path.exists(mz):
        with zipfile.ZipFile(mz) as z:
            if "walls.json.xz" in z.namelist():
                for w in json.loads(lzma.decompress(z.read("walls.json.xz"))):
                    ridges.append((LineString(w["p"]), w["c"], w["h"]))
    return ridges


class Data:
    """The layers a pass reads, in map metres, for one window at a time.

    `near(bbox, what)` returns the items of one layer that touch bbox, projected to map metres. The
    layer files hold the whole wide area, so each is read once per process and each feature's
    lon/lat envelope worked out once; a window is then answered by an envelope test *before*
    projecting anything, so a process holds only its own window in map metres. That matters: the
    map's buildings and parcels are 46,780 and 42,199 features, and projecting all of them in every
    worker (whatever the window) cost 557 MB a process and killed the pool.

    `ridges_near` is per square: the lidar wall runs live in `data/<map>/measured/<ti>_<tj>.zip`, so
    it reads the squares a window touches, cached per square."""

    LAYERS = ("building", "osm-roads", "infrastructure", "land_use", "parcels", "segment", "water")

    def __init__(self, raw, bbox, log=print):
        self.raw = raw
        self.bbox = bbox
        self._ridges = {}
        self._cache = {}
        log(f"  data: window {bbox[2] - bbox[0]:.0f} x {bbox[3] - bbox[1]:.0f} m")

    def near(self, bbox, what):
        """The items of one layer touching bbox, projected to map metres.

        Done the way `load_layer` does it (the same projection, the same valid/invalid handling), so
        a feature read here is the same geometry a square reads for itself. The result is cached per
        (layer, window), because a task asks its own window's layers many times."""
        key = (what, bbox)
        if key in self._cache:
            return self._cache[key]
        feats, bounds = _features(self.raw, what)
        lon0, lat0 = bbox[0] / KX + LON0, bbox[1] / KY + LAT0
        lon1, lat1 = bbox[2] / KX + LON0, bbox[3] / KY + LAT0
        out = []
        for f, (fx0, fy0, fx1, fy1) in zip(feats, bounds):
            if fx1 < lon0 or fx0 > lon1 or fy1 < lat0 or fy0 > lat1:
                continue                       # envelope test in lon/lat: nothing is projected yet
            # `shapely.transform`, as `__init__.to_m` uses, not `shapely.ops.transform`: the latter
            # passes coordinates to the function one point at a time and raises here, and a bare
            # except around it silently turned every window into none (measured: 119 buildings with
            # the right envelopes came back as 0).
            g = shapely.transform(shapely.from_geojson(json.dumps(f["geometry"])),
                                  lambda a: np.c_[(a[:, 0] - LON0) * KX, (a[:, 1] - LAT0) * KY])
            if not g.is_valid:
                g = g.buffer(0)
            if g.is_empty or not g.intersects(box(*bbox)):
                continue
            out.append((g, f["properties"]))
        self._cache[key] = out
        return out

    def lines_near(self, bbox, what):
        """Only the linear items of a layer touching bbox (the layers hold mixed geometry)."""
        return [(g, p) for g, p in self.near(bbox, what) if g.geom_type in ("LineString", "MultiLineString")]

    def polys_near(self, bbox, what):
        return [(g, p) for g, p in self.near(bbox, what) if g.geom_type in ("Polygon", "MultiPolygon")]

    def ridges_near(self, bbox):
        """The lidar wall runs within bbox: the runs of every square the box touches, from the
        measurement files, cached per square so a pass reads each square's file once."""
        x0, y0, x1, y1 = bbox
        out = []
        for ti, tj in squares_over(bbox, pad=REACH):
            if (ti, tj) not in self._ridges:
                self._ridges[(ti, tj)] = load_ridges(self.raw, ti, tj)
            for g, c, h in self._ridges[(ti, tj)]:
                if g.intersects(box(x0 - REACH, y0 - REACH, x1 + REACH, y1 + REACH)):
                    out.append((g, c, h))
        return out
