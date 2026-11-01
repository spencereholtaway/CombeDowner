"""Tree canopy heights from Meta / WRI's global canopy height map (about 1.2 m per pixel).

Data: s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/chm/<quadkey>.tif, one
zoom-9 quadkey tile per file, Web Mercator, heights in whole metres. Download the tile covering
the map into data/raw/canopy/ (see README).

Used for: tree positions and heights (every local maximum of the canopy becomes a tree) and for
spotting hedges along garden boundaries.

Where the Environment Agency lidar covers the map, refine() swaps in its heights for trees: the
surveyed surface less the bare ground, at 1 m, so each crown has its real height and spread.
"""
import glob, math, os
from types import SimpleNamespace
import numpy as np

R = 6378137.0


class Canopy:
    def __init__(self, folder, bbox_lonlat, to_model):
        import rasterio
        from rasterio.windows import from_bounds
        files = glob.glob(os.path.join(folder, "*.tif"))
        if not files: raise FileNotFoundError("no canopy tile in " + folder)
        W, S, E, N = bbox_lonlat
        mx = lambda lon: math.radians(lon) * R
        my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R
        files.sort()
        with rasterio.open(files[0]) as src:
            win = from_bounds(mx(W), my(S), mx(E), my(N), src.transform).round_offsets().round_lengths()
            ref = src.transform
            if len(files) == 1:
                self.h = src.read(1, window=win).astype(np.float32)
                t = src.window_transform(win)
        if len(files) > 1:
            # a map across the edge of a canopy tile: the tiles share one pixel grid, so they are
            # laid side by side, and pixels are still counted from the first tile's corner
            from rasterio.merge import merge
            h, t = merge(files, bounds=(mx(W), my(S), mx(E), my(N)), res=(ref.a, -ref.e), nodata=0)
            self.h = h[0].astype(np.float32)
            win = SimpleNamespace(row_off=round((t.f - ref.f) / ref.e), col_off=round((t.c - ref.c) / ref.a))
        self._place(t.c, t.a, t.f, t.e, int(win.row_off), int(win.col_off), to_model)

    def _place(self, x0, dx, y0, dy, row0, col0, to_model):
        """Where the window is: its mercator origin and pixel size (dy < 0), where it starts in the
        whole tile, and the map's centre and scale (lon0, lat0, kx, ky) for model metres."""
        mx = lambda lon: math.radians(lon) * R
        my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R
        # where this window starts in the whole tile: with aligned set, tree tops and shrubs are
        # picked on the tile's own pixel grid, so two windows that overlap pick the same ones
        self.row0, self.col0 = row0, col0
        self.aligned = False
        self.x0, self.dx, self.y0, self.dy = x0, dx, y0, dy
        self.to_model = to_model
        # model metres -> mercator: invert via lon/lat
        self.lon0, self.lat0, self.kx, self.ky = to_model
        self.merc = lambda x, y: (mx(x / self.kx + self.lon0), my(y / self.ky + self.lat0))
        # pixel size in model metres (mercator is stretched by 1 / cos(lat))
        self.px = abs(self.dx) * math.cos(math.radians(self.lat0))

    def model_xy(self, i, j):
        """The middle of pixel (i, j) of the window, in model metres."""
        X, Y = self.x0 + (i + 0.5) * self.dx, self.y0 + (j + 0.5) * self.dy
        lon = math.degrees(X / R)
        lat = math.degrees(2 * math.atan(math.exp(Y / R)) - math.pi / 2)
        return (lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky

    def refine(self, lidar, footprints, min_tree=3.0):
        """Take tree heights from lidar (a Lidar, see lidar.py) wherever it covers the map. The
        survey sees everything standing on the ground, so roofs (footprints, a list of polygons
        in model metres) are left out, and a 3 x 3 opening drops anything too thin to be a crown:
        lamp posts, poles, wires, walls. Below min_tree metres the lidar can't tell a hedge from a
        fence or a parked van, so low growth still comes from the Meta map."""
        import shapely
        from shapely.ops import unary_union
        ny, nx = self.h.shape
        X = self.x0 + (np.arange(nx) + 0.5) * self.dx
        Y = self.y0 + (np.arange(ny) + 0.5) * self.dy
        lon = np.degrees(X / R)
        lat = np.degrees(2 * np.arctan(np.exp(Y / R)) - math.pi / 2)
        LX, LY = np.meshgrid((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)
        surf, bare = (a.reshape(LX.shape) for a in lidar.surface_and_ground(LX.ravel(), LY.ravel()))
        chm = np.clip(surf - bare, 0, 60)
        covered = ~np.isnan(chm)
        chm[~covered] = 0
        roofs = unary_union([f.buffer(1.0) for f in footprints])
        shapely.prepare(roofs)          # asked of millions of points: only those not already a plain 0
        up = np.nonzero((chm != 0) | np.signbit(chm))
        on_roof = shapely.contains_xy(roofs, LX[up], LY[up])
        chm[up[0][on_roof], up[1][on_roof]] = 0

        def spread(a, op):
            p = np.pad(a, 1, mode="edge")
            out = a.copy()
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    out = op(out, p[1 + dj:1 + dj + a.shape[0], 1 + di:1 + di + a.shape[1]])
            return out
        chm = spread(spread(chm, np.minimum), np.maximum)
        meta = self.h
        low = np.where(meta < min_tree, meta, np.minimum(chm, min_tree - 0.1))
        self.h = np.where(covered, np.where(chm >= min_tree, chm, low), meta).astype(np.float32)
        return int(covered.sum())

    def at(self, x, y):
        """Canopy height (m) at model point (x, y), 0 outside the tile."""
        X, Y = self.merc(x, y)
        i, j = int((X - self.x0) / self.dx), int((Y - self.y0) / self.dy)
        if 0 <= j < self.h.shape[0] and 0 <= i < self.h.shape[1]: return float(self.h[j, i])
        return 0.0

    def tree_tops(self, min_height=3.0, radius_m=2.6, pixels=False):
        """Local maxima of the canopy: (x, y, height) in model metres; with pixels, (i, j, height)
        with the pixel each stands on instead (see model_xy)."""
        h = self.h
        r = max(1, int(round(radius_m / self.px)))
        # max filter by repeated shifts (no scipy needed)
        m = h.copy()
        pad = np.pad(h, r, mode="constant")
        for dj in range(-r, r + 1):
            for di in range(-r, r + 1):
                if di * di + dj * dj > r * r: continue
                m = np.maximum(m, pad[r + dj:r + dj + h.shape[0], r + di:r + di + h.shape[1]])
        js, is_ = np.nonzero((h >= min_height) & (h >= m))
        out, seen = [], set()
        for j, i in zip(js, is_):
            k = ((j + self.row0) // r, (i + self.col0) // r) if self.aligned else (j // r, i // r)   # flat tops give several equal maxima: keep one
            if k in seen: continue
            seen.add(k)
            out.append((*self.model_xy(i, j), float(h[j, i]), int(i), int(j)))
        # A big crown has several high points: keep the tallest and drop any other top inside
        # its crown (crown radius is roughly 0.42 x height).
        out.sort(key=lambda t: -t[2])
        kept, cells = [], {}
        for x, y, hh, i, j in out:
            r = max(3.5, 0.42 * hh)
            cx, cy = int(x // 8), int(y // 8)
            clash = False
            for ci in range(cx - 2, cx + 3):
                for cj in range(cy - 2, cy + 3):
                    for (kx_, ky_, kr) in cells.get((ci, cj), ()):
                        if math.hypot(x - kx_, y - ky_) < max(r, kr) * 0.85: clash = True; break
                    if clash: break
                if clash: break
            if clash: continue
            kept.append((i, j, hh) if pixels else (x, y, hh))
            cells.setdefault((cx, cy), []).append((x, y, r))
        return kept

    def low_growth(self, step_px, lo, hi):
        """Every step_px-th pixel each way (on the tile's own pixel grid when aligned, so
        overlapping windows agree) where the canopy is between lo and hi metres: (i, j, height),
        row by row."""
        h = self.h
        j0 = (-self.row0) % step_px if self.aligned else 0
        i0 = (-self.col0) % step_px if self.aligned else 0
        out = []
        for j in range(j0, h.shape[0], step_px):
            row = h[j]
            for i in np.nonzero((row[i0::step_px] >= lo) & (row[i0::step_px] <= hi))[0] * step_px + i0:
                out.append((i, j, float(row[i])))
        return out
