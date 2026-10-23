"""Building one square of the map as a partition of the ground.

Every point of the square is exactly one of: building, plot, street corridor (carriageway,
pavement, verge, parking), path, open land, water, railway. Boundaries are the shared edges of
that partition, so a fence is only ever drawn along a plot edge and a pavement is only ever a
strip of a corridor: nothing can stand alone and nothing can stop for no reason.

The data (footprints, centre lines and their tags, lidar ridges, mapped barriers, land use) is
evidence the partition is fitted to, in order of trust: buildings first, then the street graph,
then corridors fitted between what stands either side, then plots dividing the blocks, then one
triangulated surface with heights assigned per class.

This package is the stage-by-stage implementation of the design; it replaces the single-file
proof of concept `tools/partition_poc.py` as each stage lands. What each module decides is in its
own docstring.

Shared here: where the map is, how the layers and the terrain tiles are read, and the timing
trace every stage prints.
"""
import json
import lzma
import math
import os
import sys
import time
import urllib.request

import numpy as np
import shapely
from PIL import Image
from shapely.geometry import box, shape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from area import area, MAPS

MAP = "combe-down"
A = area(MAP, wide=True)
Q = A.squares
LON0, LAT0 = A.centre
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
MARGIN = 40.0                       # metres worked beyond the square so edges come out the same

T0 = time.time()


def face_shape(f):
    """A partition face as a polygon, with its holes: a roundabout's island, or the gardens inside a
    park. Files written before the holes were kept have none."""
    from shapely.geometry import Polygon
    return Polygon(f["xy"], f.get("holes") or [])


def evidence_of(barriers, ridges):
    """Mapped barriers and lidar wall runs as (line, kind). Each keeps the style it already has: a
    retaining wall stays one, and a lidar run is the stone wall, low brick wall or the like that
    `walls.py` made it from its area and height."""
    return [(g, k) for g, k in barriers] + [(g, c) for g, c, h in ridges]


def lap(msg):
    print(f"  [{time.time() - T0:5.0f}s] {msg}", flush=True)


def proj(lon, lat):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def to_m(geom):
    return shapely.transform(geom, lambda a: np.c_[(a[:, 0] - LON0) * KX, (a[:, 1] - LAT0) * KY])


def load_layer(raw, name, bbox):
    """Overture features of one layer that touch bbox, in map metres."""
    path = os.path.join(raw, name + ".geojson")
    if not os.path.exists(path):
        xz = os.path.join(ROOT, "data", MAP, name + ".geojson.xz")
        if name == "parcels" and not os.path.exists(xz):
            return []                       # the plots then follow the evidence alone
        feats = json.load(lzma.open(xz))["features"]
    else:
        feats = json.load(open(path))["features"]
    out = []
    B = box(*bbox)
    for f in feats:
        try:
            g = to_m(shape(f["geometry"]))
        except Exception:
            continue
        if not g.is_valid:
            g = g.buffer(0)
        if g.is_empty or not g.intersects(B):
            continue
        out.append((g, f["properties"]))
    return out


class Terrain:
    """The Mapzen terrarium tiles, read tile by tile as they are asked for.

    A tile that is not in the folder is fetched from the same bucket `prep_map.py` uses and kept
    there, as that build does. The repository's copy of the tiles covers the detailed squares and
    their surroundings; a city-wide run reaches squares outside it, and without the fetch those
    squares fail with a missing tile rather than building from data that is plainly available."""

    def __init__(self, folder):
        self.folder, self.tiles = folder, {}

    def tile(self, tx, ty):
        t = self.tiles.get((tx, ty))
        if t is None:
            path = os.path.join(self.folder, f"15_{tx}_{ty}.png")
            if not os.path.exists(path):
                url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/{tx}/{ty}.png"
                data = urllib.request.urlopen(url, timeout=30).read()
                os.makedirs(self.folder, exist_ok=True)
                tmp = f"{path}.{os.getpid()}"       # several builds may fetch the same tile at once
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, path)
            a = np.asarray(Image.open(path).convert("RGB")).astype(float)
            t = self.tiles[(tx, ty)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        return t

    def pixel(self, i, j):
        return self.tile(i // 256, j // 256)[j % 256, i % 256]

    def elev(self, x, y):
        lon, lat = x / KX + LON0, y / KY + LAT0
        n = 256 * 2 ** 15
        u = (lon + 180) / 360 * n - 0.5
        v = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n - 0.5
        i, j = int(math.floor(u)), int(math.floor(v)); fu, fv = u - i, v - j
        return ((self.pixel(i, j) * (1 - fu) + self.pixel(i + 1, j) * fu) * (1 - fv)
                + (self.pixel(i, j + 1) * (1 - fu) + self.pixel(i + 1, j + 1) * fu) * fv)


def zone_at(x, y):
    """The area's character zone at a point, from area.py's list (first match wins)."""
    for name, cx, cy, r in MAPS[MAP]["zones"]:
        if math.hypot(x - cx, y - cy) < r:
            return name
    return MAPS[MAP]["default_zone"]
