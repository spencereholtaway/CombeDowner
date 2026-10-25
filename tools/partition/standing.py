"""Where the lidar sees something standing in a square: a wall, a hedge, a shrub, a parked van.

The partition guesses a material for every garden boundary nobody mapped, and a third to a half of
its guessed walls and hedges have nothing standing anywhere near them, against a tenth of real
ones (the UKCEH hedgerow test, tried on `claude/exp-lidar-walls`). Fences are not tested: a
close-board fence is thinner than the survey's metre and a third of real ones show nothing.

The grid is the surface less the bare ground on 1 m cells (Environment Agency), as the repository
keeps it (`measured.py`), so a fresh clone builds the same; it is measured from the lidar itself only
to pack it, and cached beside the lidar.
"""
import os

import numpy as np
from shapely import contains_xy, unary_union

from . import KX, KY, LAT0, LON0, MAP, ROOT

LIDAR = os.path.join(ROOT, "data", "raw", MAP, "wide", "lidar")
FLOOR = 0.5         # metres: lower than this is ground, grass or a kerb
PAD = 20.0


def ndsm(sq, pad=PAD, raw_only=False):
    """(height above ground on a 1 m grid over the square, x0, y0), or None without the lidar."""
    key = tuple(round(v) for v in sq)
    cache = os.path.join(LIDAR, "ndsm", "%d_%d_%d_%d.npy" % key)
    x0, y0 = sq[0] - pad, sq[1] - pad
    if not raw_only and pad == PAD:
        from .measured import standing
        kept = standing(sq)
        if kept is not None:
            return kept, x0, y0
    if os.path.exists(cache):
        return np.load(cache), x0, y0
    if not os.path.isdir(os.path.join(LIDAR, "dsm")):
        return None
    from lidar import Lidar
    L = Lidar(LIDAR, (LON0, LAT0, KX, KY))
    xs = np.arange(x0 + 0.5, sq[2] + pad, 1.0)
    ys = np.arange(y0 + 0.5, sq[3] + pad, 1.0)
    GX, GY = np.meshgrid(xs, ys)
    s, b = L.surface_and_ground(GX.ravel(), GY.ravel())
    g = (s - b).reshape(GX.shape).astype(np.float32)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    tmp = cache + ".%d.npy" % os.getpid()
    np.save(tmp, g)
    os.replace(tmp, cache)
    return g, x0, y0


class Standing:
    """Distance from any point in a square to the nearest cell with something standing in it, less
    buildings and the strip beside them (a house's wall is not a garden's), and less specks of one
    or two cells (a bin, a car's roof)."""

    def __init__(self, sq, buildings):
        from scipy.ndimage import distance_transform_edt, label
        got = ndsm(sq)
        self.dist = None
        if got is None:
            return
        g, self.x0, self.y0 = got
        ys, xs = np.mgrid[0:g.shape[0], 0:g.shape[1]]
        f = np.nan_to_num(g) >= FLOOR
        near = unary_union([b.buffer(0.8) for b in buildings]) if buildings else None
        if near is not None and not near.is_empty:
            f &= ~contains_xy(near, xs + self.x0 + 0.5, ys + self.y0 + 0.5)
        lab, _ = label(f)
        f &= np.bincount(lab.ravel())[lab] >= 3
        self.dist = distance_transform_edt(~f)

    def near(self, p, reach):
        """Whether something stands within `reach` metres of point `p`; True where the lidar has
        nothing to say."""
        if self.dist is None:
            return True
        r, c = int(p.y - self.y0), int(p.x - self.x0)
        if not (0 <= r < self.dist.shape[0] and 0 <= c < self.dist.shape[1]):
            return True
        return bool(self.dist[r, c] <= reach)
